import { createHash } from "node:crypto";
import { shipDraftMeters, terrainNavigationAt } from "../../src/maps/atollMap";
import { LocalBattleSession } from "../../src/session/localBattleSession";
import { deployFleetAirSupport } from "../../src/sim/airOperations";
import { isWeatherId, type WeatherId } from "../../src/sim/weather";
import { BATTLE_DURATION_SECONDS, FIXED_STEP } from "../../src/sim/config";
import type { AirSquadronState, BattleState, ShipState, Team, Vec3 } from "../../src/sim/types";
import {
  applyFleetSmokeSpawnSide, createFleetSmokeBattle, FLEET_SMOKE_SIDE_SWAP,
  type PrototypePlayerBuild, type PrototypeSpawnSide,
} from "./fleetSmokeScenario";
import { ObjectiveSmokeMetrics } from "./objectiveSmokeMetrics";

export const FLEET_CALIBRATION_ROSTER_ORDERS = ["a-then-b", "b-then-a", "interleaved"] as const;
export type FleetCalibrationRosterOrder = typeof FLEET_CALIBRATION_ROSTER_ORDERS[number];

export function calibrationRosterOrder(raw: string | undefined): FleetCalibrationRosterOrder {
  if (raw === undefined) return "a-then-b";
  if ((FLEET_CALIBRATION_ROSTER_ORDERS as readonly string[]).includes(raw)) return raw as FleetCalibrationRosterOrder;
  throw new Error("FLEET_CALIBRATION_ROSTER_ORDER must be a-then-b, b-then-a or interleaved");
}

export interface FleetCalibrationOptions {
  teamSize: 5 | 7;
  seed: number;
  weather?: WeatherId;
  aviation?: "none" | "fleet-support";
  side?: PrototypeSpawnSide;
  build?: PrototypePlayerBuild;
  /** Exchange team labels only: preserve identity, random streams, world poses and iteration order. */
  swapTeamLabels?: boolean;
  /** Swap paired IDs only; includes ID-derived randomness and tie breaking, not world/team/order. */
  swapFleetIdentities?: boolean;
  /** Array order of original spatial cohorts; independent of IDs and team-label exchange. */
  rosterOrder?: FleetCalibrationRosterOrder;
}

const otherTeam = (team: Team): Team => team === "player" ? "enemy" : "player";
const rotatePoint = (point: Vec3): Vec3 => ({
  x: 2 * FLEET_SMOKE_SIDE_SWAP.centerX - point.x, y: point.y,
  z: 2 * FLEET_SMOKE_SIDE_SWAP.centerZ - point.z,
});
const rotateAngle = (heading: number): number => Math.atan2(-Math.sin(heading), -Math.cos(heading));

function oppositePose(ship: ShipState): void {
  ship.position = rotatePoint(ship.position);
  ship.previousPosition = rotatePoint(ship.previousPosition);
  ship.aimPoint = rotatePoint(ship.aimPoint);
  ship.heading = rotateAngle(ship.heading);
  ship.turretHeading = rotateAngle(ship.turretHeading);
  ship.torpedoLauncherHeading = rotateAngle(ship.torpedoLauncherHeading);
  for (const mount of [...ship.mainBatteryMounts, ...ship.secondaryMounts]) mount.heading = rotateAngle(mount.heading);
  const nav = terrainNavigationAt("atoll-prototype", ship.position.x, ship.position.z, shipDraftMeters(ship.shipClassId));
  ship.navigationZone = nav.kind;
  ship.waterDepthMeters = nav.depthMeters;
}

/**
 * A controlled experiment, NOT the player-facing scenario factory.
 * Clone the real allied roster, including its saved flagship build. Every paired
 * opponent has the full same initial equipment/damage/resources, with only identity
 * and the rigid opposing pose changed. No developer multipliers or proxy commands.
 */
export function createFleetCalibration(options: FleetCalibrationOptions): BattleState {
  const state = createFleetSmokeBattle(options.teamSize, options.seed, "default", options.build);
  if (options.weather !== undefined && !isWeatherId(options.weather)) throw new Error("Invalid calibration weather");
  if (options.aviation !== undefined && !["none", "fleet-support"].includes(options.aviation)) {
    throw new Error("Invalid calibration aviation");
  }
  state.weatherId = options.weather ?? "clear";
  const source = state.ships.filter(ship => ship.team === "player");
  const a = source.map((ship, index) => ({ ...structuredClone(ship),
    id: `calibration-a-${index}`, aiControlled: true, countsForVictory: true }));
  const b = a.map((ship, index) => {
    const opponent = structuredClone(ship);
    opponent.id = `calibration-b-${index}`;
    opponent.team = "enemy";
    oppositePose(opponent);
    return opponent;
  });
  if (options.swapFleetIdentities) for (let index = 0; index < a.length; ++index) {
    [a[index]!.id, b[index]!.id] = [b[index]!.id, a[index]!.id];
  }
  const order = calibrationRosterOrder(options.rosterOrder);
  state.ships = order === "b-then-a" ? [...b, ...a]
    : order === "interleaved" ? a.flatMap((ship, index) => [ship, b[index]!])
      : [...a, ...b];
  applyFleetSmokeSpawnSide(state, options.side ?? "default");
  if (options.aviation === "fleet-support") {
    // Use actual fleet-support resources, then pair them like the surface roster.
    // No fabricated ammo, developer multipliers, commands or aircraft spawns mid-battle.
    deployFleetAirSupport(state);
    const templates = state.airSquadrons.filter(squadron => squadron.team === "player");
    state.airSquadrons = templates.flatMap(template => {
      const first = structuredClone(template);
      first.controllerId = a[0]!.id;
      first.id = first.controllerId + "-" + first.role;
      const second = structuredClone(first);
      second.controllerId = b[0]!.id;
      second.id = second.controllerId + "-" + second.role;
      second.team = "enemy";
      second.contactsByTeam = { enemy: second.contactsByTeam.player };
      rotateCalibrationSquadron(second);
      if (options.side === "mirrored") {
        rotateCalibrationSquadron(first);
        rotateCalibrationSquadron(second);
      }
      return [first, second];
    });
  }
  if (options.swapTeamLabels) {
    for (const ship of state.ships) ship.team = otherTeam(ship.team);
    for (const squadron of state.airSquadrons) {
      squadron.team = otherTeam(squadron.team);
      squadron.contactsByTeam = Object.fromEntries(Object.entries(squadron.contactsByTeam)
        .map(([team, contact]) => [otherTeam(team as Team), contact]));
    }
  }
  return state;
}

function rotateCalibrationSquadron(squadron: AirSquadronState): void {
  squadron.position = rotatePoint(squadron.position);
  squadron.previousPosition = rotatePoint(squadron.previousPosition);
  squadron.heading = rotateAngle(squadron.heading);
  if (squadron.recoverySource.kind === "mapEdge") {
    squadron.recoverySource.position = rotatePoint(squadron.recoverySource.position);
  }
  for (const contact of Object.values(squadron.contactsByTeam)) if (contact) {
    contact.lastKnownPosition = rotatePoint(contact.lastKnownPosition);
    if (contact.observedHeading !== undefined) contact.observedHeading = rotateAngle(contact.observedHeading);
  }
}

/** Deliberately retains all non-placement state: adding a ship field extends the comparison automatically. */
export function fleetCalibrationEquipment(ship: ShipState) {
  const { id, team, position, previousPosition, aimPoint, heading, turretHeading,
    torpedoLauncherHeading, mainBatteryMounts, secondaryMounts, navigationZone,
    waterDepthMeters, ...rest } = structuredClone(ship);
  return { ...rest,
    mainBatteryMounts: mainBatteryMounts.map(({ heading, ...mount }) => mount),
    secondaryMounts: secondaryMounts.map(({ heading, ...mount }) => mount) };
}

/** Reproducible equipment evidence; copied before any controller or sensor can mutate state. */
export function fleetCalibrationManifest(state: Readonly<BattleState>) {
  return state.ships.map(ship => ({
    id: ship.id, team: ship.team, shipClassId: ship.shipClassId,
    position: { ...ship.position }, heading: ship.heading,
    equipmentSha256: createHash("sha256").update(JSON.stringify(fleetCalibrationEquipment(ship))).digest("hex"),
    mainGunId: ship.mainGunId, torpedoId: ship.torpedoId,
    mainGunMounts: ship.mainGunMounts, torpedoLauncherMounts: ship.torpedoLauncherMounts,
    antiAirMounts: ship.antiAirMounts, secondaryMounts: ship.secondaryMounts.length,
    installedEquipment: structuredClone(ship.installedEquipment), performance: { ...ship.performance },
  }));
}

/** Exact final-state digest for paired label-reversal runs; arrays/IDs/poses stay untouched. */
export function fleetCalibrationStateHash(state: Readonly<BattleState>, swappedLabels = false): string {
  function canonical(value: unknown, key = ""): unknown {
    if (Array.isArray(value)) return value.map(item => canonical(item));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([field, item]) => [
        swappedLabels && field === "player" ? "enemy" : swappedLabels && field === "enemy" ? "player" : field,
        canonical(item, field),
      ]).sort(([a], [b]) => String(a).localeCompare(String(b))));
    }
    if (!swappedLabels) return value;
    if (key === "captureProgress" && typeof value === "number") return -value || 0;
    if (value === "player") return "enemy";
    if (value === "enemy") return "player";
    if (value === "player-won") return "enemy-won";
    if (value === "enemy-won") return "player-won";
    return value;
  }
  return createHash("sha256").update(JSON.stringify(canonical(state))).digest("hex");
}

const teams = ["player", "enemy"] as const;
const rounded = (value: number): number => Math.round(value * 100) / 100;
export interface CalibrationShipMetrics {
  id: string; team: Team; shipClassId: ShipState["shipClassId"];
  travelMeters: number; shots: number; creditedHullDamage: number;
  longestGroundedSeconds: number; objectiveDutySeconds: number;
  coordinatedSeconds: number; firstShotSeconds: number | null;
  firstTargetSeconds: number | null; remainingHull: number;
}

/** Real fixed-step local/host session, with no externally supplied human or AI commands. */
export function runFleetCalibration(options: FleetCalibrationOptions) {
  const state = createFleetCalibration(options);
  const initialFleet = fleetCalibrationManifest(state);
  const initialAirFleet = structuredClone(state.airSquadrons);
  const airMetrics = new Map(state.airSquadrons.map(squadron => [squadron.id, {
    id: squadron.id, controllerId: squadron.controllerId, team: squadron.team, role: squadron.role,
    launches: 0, releases: 0, hits: 0, landings: 0, aircraftLost: 0,
    firstLaunchSeconds: null as number | null, firstReleaseSeconds: null as number | null,
    minimumAltitude: squadron.position.y, maximumAltitude: squadron.position.y,
    phaseSeconds: {} as Record<string, number>,
  }]));
  const airOwners = new Map(state.airSquadrons.map(squadron => [squadron.id, squadron.controllerId]));
  const start = performance.now();
  const session = new LocalBattleSession(state);
  const objective = new ObjectiveSmokeMetrics(state);
  const metrics = new Map(state.ships.map(ship => [ship.id, {
    id: ship.id, team: ship.team, shipClassId: ship.shipClassId,
    travelMeters: 0, shots: 0, creditedHullDamage: 0, longestGroundedSeconds: 0,
    objectiveDutySeconds: 0, coordinatedSeconds: 0,
    firstShotSeconds: null, firstTargetSeconds: null, remainingHull: ship.hull,
  } as CalibrationShipMetrics]));
  const groundedRuns = new Map(state.ships.map(ship => [ship.id, 0]));
  const positions = new Map(state.ships.map(ship => [ship.id, { ...ship.position }]));
  const firstCapture: Record<Team, number | null> = { player: null, enemy: null };
  const damage: Record<Team, number> = { player: 0, enemy: 0 };
  let firstDamageSeconds: number | null = null;
  let steps = 0;
  let maximumAircraft = 0; // Legacy report field: squadron count, NOT individual planes.
  let maximumOperationalAircraft = 0;
  while (state.status === "running" && steps < Math.ceil(BATTLE_DURATION_SECONDS / FIXED_STEP) + 2) {
    const output = session.step(new Map(), FIXED_STEP);
    ++steps;
    objective.update(state);
    maximumAircraft = Math.max(maximumAircraft, state.airSquadrons.length);
    maximumOperationalAircraft = Math.max(maximumOperationalAircraft,
      state.airSquadrons.reduce((total, squadron) => total + squadron.aircraftOperational, 0));
    if (state.objective.owner) firstCapture[state.objective.owner] ??= state.time;
    for (const shot of output.shots) {
      const metric = metrics.get(shot.ownerId);
      if (metric) { ++metric.shots; metric.firstShotSeconds ??= state.time; }
    }
    for (const event of output.hullDamage ?? []) {
      const source = event.creditedOwnerId ? metrics.get(airOwners.get(event.creditedOwnerId) ?? event.creditedOwnerId) : undefined;
      const target = metrics.get(event.targetId);
      if (source && target && source.team !== target.team && event.damage > 0) {
        source.creditedHullDamage += event.damage;
        damage[source.team] += event.damage;
        firstDamageSeconds ??= state.time;
      }
    }
    for (const event of output.airEvents) {
      const metric = airMetrics.get(event.squadronId);
      if (!metric) throw new Error("Unexpected aircraft spawned during calibration");
      if (event.kind === "launched") { ++metric.launches; metric.firstLaunchSeconds ??= state.time; }
      if (event.kind === "weaponReleased") { ++metric.releases; metric.firstReleaseSeconds ??= state.time; }
      if (event.kind === "attackHit") ++metric.hits;
      if (event.kind === "landed") ++metric.landings;
      if (event.kind === "aircraftLost") metric.aircraftLost += event.aircraftLost ?? 0;
    }
    for (const squadron of state.airSquadrons) {
      const metric = airMetrics.get(squadron.id)!;
      metric.minimumAltitude = Math.min(metric.minimumAltitude, squadron.position.y);
      metric.maximumAltitude = Math.max(metric.maximumAltitude, squadron.position.y);
      metric.phaseSeconds[squadron.phase] = (metric.phaseSeconds[squadron.phase] ?? 0) + FIXED_STEP;
    }
    for (const ship of state.ships) {
      const metric = metrics.get(ship.id)!;
      const previous = positions.get(ship.id)!;
      metric.travelMeters += Math.hypot(ship.position.x - previous.x, ship.position.z - previous.z);
      previous.x = ship.position.x; previous.z = ship.position.z;
      const ground = ship.hull > 0 && ship.navigationZone === "grounded"
        ? groundedRuns.get(ship.id)! + FIXED_STEP : 0;
      groundedRuns.set(ship.id, ground);
      metric.longestGroundedSeconds = Math.max(metric.longestGroundedSeconds, ground);
      if (ship.hull > 0 && ship.aiDecision?.objectiveDuty) metric.objectiveDutySeconds += FIXED_STEP;
      if (ship.hull > 0 && ship.aiDecision?.coordinatedTarget) metric.coordinatedSeconds += FIXED_STEP;
      if (ship.aiDecision?.targetId) metric.firstTargetSeconds ??= state.time;
      metric.remainingHull = ship.hull;
    }
    if (steps % 60 === 0) {
      const finite = state.ships.every(ship => [ship.hull, ship.speedKnots, ship.heading,
        ship.position.x, ship.position.y, ship.position.z, ship.reloadRemaining].every(Number.isFinite))
        && state.projectiles.every(p => [p.position.x, p.position.y, p.position.z,
          p.velocity.x, p.velocity.y, p.velocity.z].every(Number.isFinite))
        && state.airSquadrons.every(squadron => [
          squadron.position.x, squadron.position.y, squadron.position.z, squadron.heading,
          squadron.airframeHealth, squadron.aircraftOperational, squadron.fuelRemainingSeconds,
        ].every(Number.isFinite));
      if (!finite) throw new Error(`Non-finite calibration state at ${state.time}`);
    }
  }
  const measured = objective.report();
  const report = {
    kind: "equal-loadout-production-session-ai", ...options,
    side: options.side ?? "default", build: options.build ?? "default-fletcher",
    swapTeamLabels: options.swapTeamLabels ?? false,
    swapFleetIdentities: options.swapFleetIdentities ?? false, weather: state.weatherId,
    controllerPath: "LocalBattleSession.step(empty humanCommands)",
    terrainTransformed: false, rosterOrder: options.rosterOrder ?? "a-then-b", initialFleet,
    aviation: options.aviation ?? "none", initialAirFleet,
    aircraft: [...airMetrics.values()].map(metric => ({ ...metric,
      phaseSeconds: Object.fromEntries(Object.entries(metric.phaseSeconds).map(([phase, seconds]) => [phase, rounded(seconds)])),
      minimumAltitude: rounded(metric.minimumAltitude), maximumAltitude: rounded(metric.maximumAltitude),
    })),
    maximumAircraft, maximumSquadrons: maximumAircraft, maximumOperationalAircraft, status: state.status, endReason: state.endReason,
    finalCanonicalStateSha256: fleetCalibrationStateHash(state, options.swapTeamLabels),
    durationSeconds: rounded(state.time), steps, wallSeconds: rounded((performance.now() - start) / 1000),
    firstDamageSeconds: firstDamageSeconds === null ? null : rounded(firstDamageSeconds),
    firstCaptureSeconds: Object.fromEntries(teams.map(team => [team,
      firstCapture[team] === null ? null : rounded(firstCapture[team])])),
    damage: { player: rounded(damage.player), enemy: rounded(damage.enemy) },
    finalScores: { player: rounded(state.objective.scores.player), enemy: rounded(state.objective.scores.enemy) },
    objectiveInZoneShipSeconds: { player: rounded(measured.inZoneShipSeconds.player),
      enemy: rounded(measured.inZoneShipSeconds.enemy) },
    contestedSeconds: rounded(measured.contestedSeconds),
    ships: [...metrics.values()].map(metric => Object.fromEntries(Object.entries(metric)
      .map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value])) as unknown as CalibrationShipMetrics),
  };
  return { state, session, report };
}
