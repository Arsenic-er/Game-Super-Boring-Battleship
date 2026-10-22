import { shipDraftMeters, terrainNavigationAt, type BattleMapId } from "../maps/atollMap";
import { FIXED_STEP, NAVIGATION_PACE } from "./config";
import {
  advanceShipKinematics, createShipKinematicSnapshot, shipKinematicParameters,
} from "./navigationKinematics";
import {
  constrainShipTerrainMotion, shipTerrainFootprintContact, shipTerrainTrajectoryEnvelopeContact,
  type ShipTerrainFootprintContact,
} from "./shipFootprint";
import type { ShipState } from "./types";

type KinematicSnapshot = ReturnType<typeof createShipKinematicSnapshot>;
export interface ShipManeuverSegment {
  durationSeconds: number;
  throttle: number;
  rudder: number;
}
export interface ShipManeuverPlan {
  /** Explicit helm orders, not a straight line toward a desired end heading. */
  segments: readonly Readonly<ShipManeuverSegment>[];
  /** Neutral throttle AND neutral helm, with their existing physical response times. */
  brakeToStop: boolean;
}
export interface ShipManeuverBudget {
  maxMotionSteps?: number;
  /** Expensive full-hull geometry queries; point-water samples are bounded by maxMotionSteps. */
  maxTerrainQueries?: number;
}
export interface ShipManeuverPrediction {
  status: "clear" | "blocked" | "incomplete";
  reason: "completed" | "initial-contact" | "terrain-contact" | "motion-budget" | "terrain-budget" | "invalid-input";
  /** Predicted unconstrained state; never a collision-corrected or teleported pose. */
  end: KinematicSnapshot;
  elapsedSeconds: number;
  lastClearSeconds: number;
  motionSteps: number;
  terrainQueries: number;
  stopped: boolean;
  contact?: ShipTerrainFootprintContact;
}
const MAX_MOTION_STEPS = 7200;
const MAX_TERRAIN_QUERIES = 1024;
const MAX_SEGMENTS = 16;
const BATCH_STEPS = 30;
const EPSILON_SECONDS = 1e-9;

function copy(snapshot: KinematicSnapshot): KinematicSnapshot {
  return { ...snapshot, position: { ...snapshot.position } };
}

/**
 * Snapshot-only prospective kinematics. Integrates the SAME propulsion/helm
 * kernel as the live simulation at 60 Hz (fractional segment endings allowed).
 * Module health, equipment and flooding are held constant; water is sampled at
 * each old centre, just as moveShip does. No weapons, repair, RNG or other ships
 * are simulated. "clear" certifies this specified terrain trajectory only, not
 * future controller decisions, ship/ship safety or successful coastal recovery.
 *
 * The caller must supply the final controls, after tactical and station-turn
 * overrides. A different throttle is not assumed to follow the same safe arc.
 */
export function predictShipManeuver(
  mapId: BattleMapId, ship: Readonly<ShipState>, plan: Readonly<ShipManeuverPlan>,
  budget: Readonly<ShipManeuverBudget> = {},
): ShipManeuverPrediction {
  const state = createShipKinematicSnapshot(ship), parameters = shipKinematicParameters(ship);
  const maxSteps = budget.maxMotionSteps ?? MAX_MOTION_STEPS;
  const maxQueries = budget.maxTerrainQueries ?? MAX_TERRAIN_QUERIES;
  let elapsed = 0, lastClear = 0, steps = 0, queries = 0;
  const stationary = (s: KinematicSnapshot): boolean => (parameters.forcedSpeedKnots === undefined || parameters.forcedSpeedKnots === 0)
    && s.speedKnots === 0
    && (s.rudder === 0 || parameters.steeringRatio === 0);
  const result = (status: ShipManeuverPrediction["status"], reason: ShipManeuverPrediction["reason"],
    end = state, time = elapsed, contact?: ShipTerrainFootprintContact): ShipManeuverPrediction => ({
    status, reason, end: copy(end), elapsedSeconds: time, lastClearSeconds: lastClear,
    motionSteps: steps, terrainQueries: queries, stopped: stationary(end),
    ...(contact ? { contact } : {}),
  });
  const parameterValues = Object.values(parameters).filter(value => value !== undefined);
  // Bound the original kernel's angle-normalization loop before entering it.
  // This validator rejects corrupt/extreme predictions; it does not clamp live physics.
  const maximumStepYaw = Math.max(1, Math.abs(state.rudder)) * Math.abs(parameters.maxTurnRateRadians)
    * Math.abs(parameters.turnMultiplier) * Math.abs(parameters.steeringRatio)
    * NAVIGATION_PACE.travelTimeScale * FIXED_STEP;
  if (![state.position.x, state.position.y, state.position.z, state.heading, state.speedKnots,
    state.rudder, state.distanceTravelled, ...parameterValues].every(value => typeof value === "number" && Number.isFinite(value))
    || !Number.isFinite(maximumStepYaw) || maximumStepYaw > Math.PI / 4
    || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_MOTION_STEPS
    || !Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > MAX_TERRAIN_QUERIES
    || plan.segments.length > MAX_SEGMENTS || plan.segments.some(segment =>
      ![segment.durationSeconds, segment.throttle, segment.rudder].every(Number.isFinite)
      || segment.durationSeconds < 0)) return result("incomplete", "invalid-input");

  queries++;
  const initial = shipTerrainFootprintContact(mapId, ship.shipClassId, state);
  if (initial.blocked) return result("blocked", "initial-contact", state, 0, initial);
  let batch = [{ state: copy(state), time: 0 }];
  const flush = (): ShipManeuverPrediction | undefined => {
    if (batch.length <= 1) return;
    if (queries >= maxQueries) return result("incomplete", "terrain-budget");
    queries++;
    const envelope = shipTerrainTrajectoryEnvelopeContact(mapId, ship.shipClassId, batch.map(item => item.state));
    if (envelope.blocked) {
      for (let i = 1; i < batch.length; i++) {
        if (queries >= maxQueries) return result("incomplete", "terrain-budget");
        queries++;
        const from = batch[i - 1]!, to = batch[i]!;
        const sweep = constrainShipTerrainMotion(mapId, ship.shipClassId, from.state, to.state);
        // A pose correction, including yaw rejection, is NOT the requested arc.
        if (sweep.blocked || sweep.rotationBlocked || sweep.contact.blocked) {
          return result(sweep.budgetExhausted ? "incomplete" : "blocked",
            sweep.budgetExhausted ? "terrain-budget" : "terrain-contact",
            to.state, to.time, sweep.blockingContact ?? sweep.contact);
        }
        lastClear = to.time;
      }
    } else lastClear = batch.at(-1)!.time;
    batch = [{ state: copy(state), time: elapsed }];
  };
  const step = (throttle: number, rudder: number, dt: number): ShipManeuverPrediction | undefined => {
    if (steps >= maxSteps) {
      const failure = flush();
      return failure ?? result("incomplete", "motion-budget");
    }
    const water = terrainNavigationAt(mapId, state.position.x, state.position.z, shipDraftMeters(ship.shipClassId));
    advanceShipKinematics(state, parameters, { throttle, rudder }, water.speedMultiplier, dt);
    steps++; elapsed += dt;
    if (![state.position.x, state.position.z, state.heading, state.speedKnots, state.rudder].every(Number.isFinite)) {
      return result("incomplete", "invalid-input");
    }
    batch.push({ state: copy(state), time: elapsed });
    if (batch.length > BATCH_STEPS) return flush();
  };
  for (const segment of plan.segments) {
    let remaining = segment.durationSeconds;
    while (remaining > EPSILON_SECONDS) {
      const dt = Math.min(FIXED_STEP, remaining), failure = step(segment.throttle, segment.rudder, dt);
      if (failure) return failure;
      remaining -= dt;
    }
  }
  if (plan.brakeToStop) {
    while (!stationary(state)) {
      const failure = step(0, 0, FIXED_STEP);
      if (failure) return failure;
    }
  }
  return flush() ?? result("clear", "completed");
}
