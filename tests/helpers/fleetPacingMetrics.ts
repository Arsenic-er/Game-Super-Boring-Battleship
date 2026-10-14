import { effectiveMainBattery } from "../../src/ships/mainBatteries";
import { GUN } from "../../src/sim/config";
import type { AiDecisionTelemetry, BattleState, FleetAiPhase, ShipState, ShotEvent, Team } from "../../src/sim/types";
import type { WeatherId } from "../../src/sim/weather";

type PacingState = Readonly<Pick<BattleState, "time" | "weatherId" | "objective" | "status">>
  & { readonly ships: readonly Readonly<ShipState>[] };
type PacingShot = Readonly<Pick<ShotEvent, "ownerId" | "kind" | "weaponSource">>;
const teams = ["player", "enemy"] as const;
const MILESTONES = [900, 1050] as const;
const EPSILON = 1e-6;
const rounded = (value: number): number => Math.round(value * 100) / 100;
type PacingPhase = FleetAiPhase | "none";
type PacingContactSource = NonNullable<AiDecisionTelemetry["contactSource"]> | "none";
const PHASES: readonly PacingPhase[] = ["forming", "securing", "engaging", "evading", "withdrawing", "searching", "none"];
const CONTACT_SOURCES: readonly PacingContactSource[] = ["local", "radio", "memory", "none"];

interface GunSample { disabled: boolean; ready: boolean; maximumRangeMeters: number }
function sampleGun(ship: Readonly<ShipState>): GunSample {
  if (ship.modules.gun.health <= 0) return { disabled: true, ready: false, maximumRangeMeters: 0 };
  const battery = effectiveMainBattery(ship);
  const healthy = ship.mainBatteryMounts.filter(mount => mount.health > 0 && Boolean(battery.mounts[mount.mountIndex]));
  return { disabled: healthy.length === 0, ready: healthy.some(mount => mount.reloadRemaining <= 0),
    maximumRangeMeters: battery.maximumRangeMeters };
}
function estimatedOpportunity(ship: Readonly<ShipState>, gun: Readonly<GunSample>): boolean {
  if (ship.hull <= 0 || ship.aiDecision?.contactSource !== "local"
    || ship.perception?.mode !== "tracking" || !ship.perception.estimatedPosition || !gun.ready) return false;
  const point = ship.perception.estimatedPosition;
  const range = Math.hypot(point.x - ship.position.x, point.z - ship.position.z);
  return Number.isFinite(range) && range >= GUN.minAimRange && range <= gun.maximumRangeMeters;
}

/**
 * Diagnostic estimate from the ship's own director report and equipment only.
 * It is NOT a real line-of-sight, bearing, aim-quality or safe-fire guarantee.
 * In particular this must never look up targetId in the authoritative ship list.
 */
export function hasEstimatedFiringOpportunity(ship: Readonly<ShipState>): boolean {
  return estimatedOpportunity(ship, sampleGun(ship));
}

export interface FleetPacingCounters {
  aliveSeconds: number;
  localContactSeconds: number;
  localAcquiringSeconds: number;
  localTrackingSeconds: number;
  estimatedFiringOpportunitySeconds: number;
  mainGunDisabledSeconds: number;
  fireIntentSeconds: number;
  captureDutySeconds: number;
  supportDutySeconds: number;
  mainGunShots: number;
  phaseSeconds: Partial<Record<PacingPhase, number>>;
  contactSourceSeconds: Partial<Record<PacingContactSource, number>>;
}
const NUMERIC_COUNTERS = ["aliveSeconds", "localContactSeconds", "localAcquiringSeconds", "localTrackingSeconds",
  "estimatedFiringOpportunitySeconds", "mainGunDisabledSeconds", "fireIntentSeconds", "captureDutySeconds",
  "supportDutySeconds", "mainGunShots"] as const;
const emptyCounters = (): FleetPacingCounters => ({
  aliveSeconds: 0, localContactSeconds: 0, localAcquiringSeconds: 0, localTrackingSeconds: 0,
  estimatedFiringOpportunitySeconds: 0, mainGunDisabledSeconds: 0, fireIntentSeconds: 0,
  captureDutySeconds: 0, supportDutySeconds: 0, mainGunShots: 0, phaseSeconds: {}, contactSourceSeconds: {},
});
type ShipPacingIdentity = Pick<ShipState, "id" | "team" | "hullId" | "shipClassId"> & { weather: WeatherId };
export interface FleetShipPacing extends ShipPacingIdentity, FleetPacingCounters {
  lastShotSeconds: number | null;
  lastShotAliveSeconds: number | null;
  secondsAliveSinceLastShot: number;
  longestNoShotSeconds: number;
  /** A descriptive ratio, never an automatic pass/fail verdict. */
  shotInactivityFraction: number;
}
interface InternalShipPacing extends Omit<FleetShipPacing, "secondsAliveSinceLastShot" | "shotInactivityFraction"> {
  aliveAtPreviousSample: boolean;
}
export interface FleetPacingMilestone {
  scheduledSeconds: number;
  sampledSeconds: number;
  status: BattleState["status"];
  teams: Record<Team, { score: number; aliveShips: number; remainingHull: number }>;
}
export interface FleetPacingWindow {
  /** Right-closed intervals: (900, 1050] and (1050, current/terminal sample]. */
  startSeconds: 900 | 1050;
  endSeconds: 1050 | null;
  sampledFromSeconds: number;
  sampledThroughSeconds: number;
  complete: boolean;
  terminal: boolean;
  ships: Array<ShipPacingIdentity & FleetPacingCounters>;
}
type InternalWindow = Omit<FleetPacingWindow, "ships"> & {
  ships: Map<string, ShipPacingIdentity & FleetPacingCounters>;
};
interface PacingSample {
  acquiring: boolean; tracking: boolean; opportunity: boolean; gunDisabled: boolean;
  fireIntent: boolean; capture: boolean; support: boolean;
  phase: PacingPhase; source: PacingContactSource;
}
function sampleShip(ship: Readonly<ShipState> | undefined): PacingSample {
  const source = CONTACT_SOURCES.find(item => item === ship?.aiDecision?.contactSource) ?? "none";
  const phase = PHASES.find(item => item === ship?.aiDecision?.phase) ?? "none";
  const gun = ship ? sampleGun(ship) : undefined;
  return {
    acquiring: source === "local" && ship?.perception?.mode === "acquiring",
    tracking: source === "local" && ship?.perception?.mode === "tracking",
    opportunity: !!ship && !!gun && estimatedOpportunity(ship, gun),
    gunDisabled: !!gun?.disabled, fireIntent: !!ship?.aiDecision?.fireIntent,
    capture: ship?.aiDecision?.objectiveDuty === "capture",
    support: ship?.aiDecision?.objectiveDuty === "support", phase, source,
  };
}
function addTag<K extends string>(target: Partial<Record<K, number>>, key: K, seconds: number): void {
  target[key] = (target[key] ?? 0) + seconds;
}
/** The global and window totals deliberately use the exact same sample and adder. */
function accumulate(target: FleetPacingCounters, sample: Readonly<PacingSample>, elapsed: number, shots: number): void {
  target.aliveSeconds += elapsed;
  if (sample.acquiring || sample.tracking) target.localContactSeconds += elapsed;
  if (sample.acquiring) target.localAcquiringSeconds += elapsed;
  if (sample.tracking) target.localTrackingSeconds += elapsed;
  if (sample.opportunity) target.estimatedFiringOpportunitySeconds += elapsed;
  if (sample.gunDisabled) target.mainGunDisabledSeconds += elapsed;
  if (sample.fireIntent) target.fireIntentSeconds += elapsed;
  if (sample.capture) target.captureDutySeconds += elapsed;
  if (sample.support) target.supportDutySeconds += elapsed;
  target.mainGunShots += shots;
  addTag(target.phaseSeconds, sample.phase, elapsed);
  addTag(target.contactSourceSeconds, sample.source, elapsed);
}
function roundedCounters(source: Readonly<FleetPacingCounters>): FleetPacingCounters {
  const result = { ...source,
    phaseSeconds: Object.fromEntries(Object.entries(source.phaseSeconds).map(([key, value]) => [key, rounded(value)])),
    contactSourceSeconds: Object.fromEntries(Object.entries(source.contactSourceSeconds).map(([key, value]) => [key, rounded(value)])),
  };
  for (const key of NUMERIC_COUNTERS) result[key] = rounded(source[key]);
  return result;
}
function boundaryTime(time: number): number {
  return MILESTONES.find(boundary => Math.abs(time - boundary) <= EPSILON) ?? time;
}

/**
 * Read-only, post-step test telemetry. Time is charged to ships alive at the
 * preceding sample, including their final simulation interval. No time is
 * charged after sinking. Existing state and RNG are never modified.
 *
 * "Shot" here specifically means an emitted main-battery shell; secondary fire,
 * torpedoes and aircraft cannot disguise an idle main battery. Lack of a local
 * contact is not a failure, and an estimated opportunity does not mean a hit.
 *
 * Late windows split continuous sample time by interval overlap. Shot events
 * have no individual time stamp, so each belongs only to this update's endpoint
 * window: an event exactly at 1050 belongs to the first window, never both.
 * A coarse sample uses its own post-step features throughout its elapsed span,
 * just like the global counters; this does not invent intermediate observations.
 */
export class FleetPacingMetrics {
  private previousTime: number;
  private readonly ships = new Map<string, InternalShipPacing>();
  private readonly milestones: FleetPacingMilestone[] = [];
  private readonly windows = new Map<number, InternalWindow>();
  private readonly initialTime: number;
  private finished: boolean;

  constructor(initial: PacingState) {
    if (!Number.isFinite(initial.time) || initial.time < 0) throw new Error("Invalid pacing time");
    this.previousTime = this.initialTime = initial.time;
    this.finished = initial.status !== "running";
    for (const ship of initial.ships) this.ships.set(ship.id, {
      id: ship.id, team: ship.team, hullId: ship.hullId, shipClassId: ship.shipClassId,
      weather: initial.weatherId, ...emptyCounters(),
      lastShotSeconds: null, lastShotAliveSeconds: null, longestNoShotSeconds: 0,
      aliveAtPreviousSample: ship.hull > 0,
    });
  }

  update(state: PacingState, shots: readonly PacingShot[]): void {
    if (!Number.isFinite(state.time) || state.time < this.previousTime) {
      throw new Error("Pacing time must be finite and monotonic");
    }
    if (this.finished) return;
    const elapsed = state.time - this.previousTime;
    if (elapsed <= 0) {
      // A caller may publish the terminal status after the same-time running
      // sample. Refresh metadata only: never charge time or replay its shots.
      if (state.status !== "running") {
        const throughTime = boundaryTime(state.time);
        for (const window of this.windows.values()) {
          if (Math.abs(window.sampledThroughSeconds - throughTime) > EPSILON) continue;
          window.complete = true;
          window.terminal = true;
        }
        for (const milestone of this.milestones) {
          if (milestone.sampledSeconds === state.time) milestone.status = state.status;
        }
        this.finished = true;
      }
      return;
    }
    const byId = new Map(state.ships.map(ship => [ship.id, ship]));
    const fired = new Map<string, number>();
    for (const shot of shots) {
      if (shot.kind === "shell" && shot.weaponSource === "mainGun") {
        fired.set(shot.ownerId, (fired.get(shot.ownerId) ?? 0) + 1);
      }
    }
    const fromTime = boundaryTime(this.previousTime), throughTime = boundaryTime(state.time);
    const overlaps: Array<{ window: InternalWindow; elapsed: number; receivesShots: boolean }> = [];
    for (const startSeconds of MILESTONES) {
      const endSeconds = startSeconds === 900 ? 1050 : null;
      const from = Math.max(fromTime, startSeconds), through = Math.min(throughTime, endSeconds ?? Infinity);
      if (through <= from) continue;
      let window = this.windows.get(startSeconds);
      if (!window) {
        window = { startSeconds, endSeconds, sampledFromSeconds: from, sampledThroughSeconds: through,
          complete: false, terminal: false, ships: new Map([...this.ships.values()].map(ship => [
            ship.id, { id: ship.id, team: ship.team, hullId: ship.hullId, shipClassId: ship.shipClassId,
              weather: ship.weather, ...emptyCounters() },
          ])) };
        this.windows.set(startSeconds, window);
      }
      window.sampledThroughSeconds = through;
      window.complete = (endSeconds !== null && throughTime >= endSeconds) || state.status !== "running";
      window.terminal = state.status !== "running" && (endSeconds === null || throughTime <= endSeconds);
      overlaps.push({ window, elapsed: through - from,
        receivesShots: throughTime > startSeconds && (endSeconds === null || throughTime <= endSeconds) });
    }
    for (const metric of this.ships.values()) {
      const ship = byId.get(metric.id);
      if (metric.aliveAtPreviousSample) {
        const sample = sampleShip(ship), count = fired.get(metric.id) ?? 0;
        accumulate(metric, sample, elapsed, count);
        metric.longestNoShotSeconds = Math.max(metric.longestNoShotSeconds,
          metric.aliveSeconds - (metric.lastShotAliveSeconds ?? 0));
        for (const overlap of overlaps) accumulate(overlap.window.ships.get(metric.id)!,
          sample, overlap.elapsed, overlap.receivesShots ? count : 0);
        if (count > 0) {
          metric.lastShotSeconds = state.time;
          metric.lastShotAliveSeconds = metric.aliveSeconds;
        }
      }
      metric.aliveAtPreviousSample = !!ship && ship.hull > 0;
    }
    for (const scheduled of MILESTONES) {
      if (scheduled <= this.initialTime + EPSILON
        || this.previousTime >= scheduled - EPSILON || state.time < scheduled - EPSILON) continue;
      const values = Object.fromEntries(teams.map(team => {
        const living = state.ships.filter(ship => ship.team === team && ship.hull > 0);
        return [team, {
          score: state.objective.scores[team],
          aliveShips: living.length,
          remainingHull: living.reduce((sum, ship) => sum + ship.hull, 0),
        }];
      })) as FleetPacingMilestone["teams"];
      this.milestones.push({
        scheduledSeconds: scheduled, sampledSeconds: state.time, status: state.status, teams: values,
      });
    }
    this.previousTime = state.time;
    this.finished = state.status !== "running";
  }

  report(): {
    ships: FleetShipPacing[];
    groups: Array<Pick<FleetShipPacing, "team" | "weather" | "hullId"> & FleetPacingCounters & {
      shipCount: number; shipsWithoutMainGunFire: number; longestNoShotSeconds: number;
    }>;
    milestones: FleetPacingMilestone[];
    lateWindows: FleetPacingWindow[];
  } {
    const ships: FleetShipPacing[] = [...this.ships.values()].map(metric => {
      const { aliveAtPreviousSample: _, ...values } = metric;
      const since = metric.aliveSeconds - (metric.lastShotAliveSeconds ?? 0);
      return { ...values, ...roundedCounters(metric),
        lastShotSeconds: metric.lastShotSeconds === null ? null : rounded(metric.lastShotSeconds),
        lastShotAliveSeconds: metric.lastShotAliveSeconds === null ? null : rounded(metric.lastShotAliveSeconds),
        longestNoShotSeconds: rounded(metric.longestNoShotSeconds),
        secondsAliveSinceLastShot: rounded(since),
        shotInactivityFraction: metric.aliveSeconds > 0 ? rounded(since / metric.aliveSeconds) : 0,
      };
    });
    const groups = new Map<string, ReturnType<FleetPacingMetrics["report"]>["groups"][number]>();
    // Aggregate unrounded counters, then round once at the report boundary.
    for (const metric of this.ships.values()) {
      const key = [metric.team, metric.weather, metric.hullId].join(":");
      let group = groups.get(key);
      if (!group) {
        group = { team: metric.team, weather: metric.weather, hullId: metric.hullId,
          shipCount: 0, ...emptyCounters(), shipsWithoutMainGunFire: 0, longestNoShotSeconds: 0 };
        groups.set(key, group);
      }
      ++group.shipCount;
      group.shipsWithoutMainGunFire += Number(metric.mainGunShots === 0);
      for (const field of NUMERIC_COUNTERS) group[field] += metric[field];
      for (const phase of PHASES) if (metric.phaseSeconds[phase] !== undefined) {
        addTag(group.phaseSeconds, phase, metric.phaseSeconds[phase]!);
      }
      for (const source of CONTACT_SOURCES) if (metric.contactSourceSeconds[source] !== undefined) {
        addTag(group.contactSourceSeconds, source, metric.contactSourceSeconds[source]!);
      }
      group.longestNoShotSeconds = Math.max(group.longestNoShotSeconds, metric.longestNoShotSeconds);
    }
    return {
      ships,
      groups: [...groups.values()].map(group => ({ ...group, ...roundedCounters(group),
        longestNoShotSeconds: rounded(group.longestNoShotSeconds) })),
      milestones: this.milestones.map(item => ({
        ...item, sampledSeconds: rounded(item.sampledSeconds),
        teams: Object.fromEntries(teams.map(team => [team, {
          ...item.teams[team], score: rounded(item.teams[team].score),
          remainingHull: rounded(item.teams[team].remainingHull),
        }])) as FleetPacingMilestone["teams"],
      })),
      lateWindows: [...this.windows.values()].map(window => ({
        ...window, sampledFromSeconds: rounded(window.sampledFromSeconds),
        sampledThroughSeconds: rounded(window.sampledThroughSeconds),
        ships: [...window.ships.values()].map(ship => ({ ...ship, ...roundedCounters(ship) })),
      })),
    };
  }
}
