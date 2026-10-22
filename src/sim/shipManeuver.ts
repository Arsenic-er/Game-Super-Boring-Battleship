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

export interface ShipManeuverSliceBudget {
  maxMotionSteps: number;
  maxTerrainQueries: number;
}
export type ShipManeuverSliceResult = {
  status: "pending";
  /** Work performed by this advance call, not cumulative totals. */
  motionSteps: number;
  terrainQueries: number;
} | {
  status: "complete";
  result: ShipManeuverPrediction;
  motionSteps: number;
  terrainQueries: number;
};
export interface ShipManeuverPredictionTask {
  /**
   * Zero in either budget is allowed. Invalid/negative/noninteger budgets throw
   * before advancing; a depleted slice is pending, not a failed prediction.
   */
  advance(budget: Readonly<ShipManeuverSliceBudget>): ShipManeuverSliceResult;
}

type PredictionWork = "motion" | "terrain";
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
export function createShipManeuverPrediction(
  mapId: BattleMapId, ship: Readonly<ShipState>, plan: Readonly<ShipManeuverPlan>,
  budget: Readonly<ShipManeuverBudget> = {},
): ShipManeuverPredictionTask {
  const state = createShipKinematicSnapshot(ship), parameters = shipKinematicParameters(ship);
  const shipClassId = ship.shipClassId;
  const segmentCount = plan.segments.length;
  // Invalid oversized plans need no unbounded copy before their validation.
  const segments = segmentCount <= MAX_SEGMENTS
    ? plan.segments.map(segment => ({ ...segment })) : [];
  const brakeToStop = plan.brakeToStop;
  const maxSteps = budget.maxMotionSteps ?? MAX_MOTION_STEPS;
  const maxQueries = budget.maxTerrainQueries ?? MAX_TERRAIN_QUERIES;
  function* run(): Generator<PredictionWork, ShipManeuverPrediction, void> {
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
      || segmentCount > MAX_SEGMENTS || segments.some(segment =>
        ![segment.durationSeconds, segment.throttle, segment.rudder].every(Number.isFinite)
        || segment.durationSeconds < 0)) return result("incomplete", "invalid-input");

    yield "terrain";
    queries++;
    const initial = shipTerrainFootprintContact(mapId, shipClassId, state);
    if (initial.blocked) return result("blocked", "initial-contact", state, 0, initial);
    let batch = [{ state: copy(state), time: 0 }];
    function* flush(): Generator<PredictionWork, ShipManeuverPrediction | undefined, void> {
      if (batch.length <= 1) return;
      if (queries >= maxQueries) return result("incomplete", "terrain-budget");
      yield "terrain";
      queries++;
      const envelope = shipTerrainTrajectoryEnvelopeContact(mapId, shipClassId, batch.map(item => item.state));
      if (envelope.blocked) {
        for (let i = 1; i < batch.length; i++) {
          if (queries >= maxQueries) return result("incomplete", "terrain-budget");
          yield "terrain";
          queries++;
          const from = batch[i - 1]!, to = batch[i]!;
          const sweep = constrainShipTerrainMotion(mapId, shipClassId, from.state, to.state);
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
    }
    function* step(throttle: number, rudder: number, dt: number): Generator<PredictionWork, ShipManeuverPrediction | undefined, void> {
      if (steps >= maxSteps) {
        const failure = yield* flush();
        return failure ?? result("incomplete", "motion-budget");
      }
      yield "motion";
      const water = terrainNavigationAt(mapId, state.position.x, state.position.z, shipDraftMeters(shipClassId));
      advanceShipKinematics(state, parameters, { throttle, rudder }, water.speedMultiplier, dt);
      steps++; elapsed += dt;
      if (![state.position.x, state.position.z, state.heading, state.speedKnots, state.rudder].every(Number.isFinite)) {
        return result("incomplete", "invalid-input");
      }
      batch.push({ state: copy(state), time: elapsed });
      if (batch.length > BATCH_STEPS) return yield* flush();
    }
    for (const segment of segments) {
      let remaining = segment.durationSeconds;
      while (remaining > EPSILON_SECONDS) {
        const dt = Math.min(FIXED_STEP, remaining), failure = yield* step(segment.throttle, segment.rudder, dt);
        if (failure) return failure;
        remaining -= dt;
      }
    }
    if (brakeToStop) {
      while (!stationary(state)) {
        const failure = yield* step(0, 0, FIXED_STEP);
        if (failure) return failure;
      }
    }
    return (yield* flush()) ?? result("clear", "completed");
  }

  let next: IteratorResult<PredictionWork, ShipManeuverPrediction> | undefined;
  const runner = run();
  const completed = (prediction: ShipManeuverPrediction, motionSteps: number,
    terrainQueries: number): ShipManeuverSliceResult => ({
    status: "complete", motionSteps, terrainQueries,
    result: {
      ...prediction, end: copy(prediction.end),
      ...(prediction.contact ? { contact: {
        ...prediction.contact, zoneIds: [...prediction.contact.zoneIds],
      } } : {}),
    },
  });
  return {
    advance(slice): ShipManeuverSliceResult {
      if (!Number.isInteger(slice.maxMotionSteps) || slice.maxMotionSteps < 0
        || slice.maxMotionSteps > MAX_MOTION_STEPS
        || !Number.isInteger(slice.maxTerrainQueries) || slice.maxTerrainQueries < 0
        || slice.maxTerrainQueries > MAX_TERRAIN_QUERIES) {
        throw new RangeError("Maneuver slice budgets must be bounded nonnegative integers");
      }
      let motionSteps = 0, terrainQueries = 0;
      next ??= runner.next();
      while (!next.done) {
        if (next.value === "motion") {
          if (motionSteps >= slice.maxMotionSteps) return { status: "pending", motionSteps, terrainQueries };
          motionSteps++;
        } else {
          if (terrainQueries >= slice.maxTerrainQueries) return { status: "pending", motionSteps, terrainQueries };
          terrainQueries++;
        }
        // Every resume performs precisely its reserved work unit, including
        // initial contact, envelope queries and individual refinement sweeps.
        next = runner.next();
      }
      return completed(next.value, motionSteps, terrainQueries);
    },
  };
}

/** Synchronous compatibility wrapper; identical total budgets and final result. */
export function predictShipManeuver(
  mapId: BattleMapId, ship: Readonly<ShipState>, plan: Readonly<ShipManeuverPlan>,
  budget: Readonly<ShipManeuverBudget> = {},
): ShipManeuverPrediction {
  const task = createShipManeuverPrediction(mapId, ship, plan, budget);
  while (true) {
    const slice = task.advance({ maxMotionSteps: MAX_MOTION_STEPS, maxTerrainQueries: MAX_TERRAIN_QUERIES });
    if (slice.status === "complete") return slice.result;
  }
}
