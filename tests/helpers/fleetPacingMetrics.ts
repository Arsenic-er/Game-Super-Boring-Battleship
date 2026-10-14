import { effectiveMainBattery } from "../../src/ships/mainBatteries";
import { GUN } from "../../src/sim/config";
import type { BattleState, ShipState, ShotEvent, Team } from "../../src/sim/types";
import type { WeatherId } from "../../src/sim/weather";

type PacingState = Readonly<Pick<BattleState, "time" | "weatherId" | "objective" | "status">>
  & { readonly ships: readonly Readonly<ShipState>[] };
type PacingShot = Readonly<Pick<ShotEvent, "ownerId" | "kind" | "weaponSource">>;
const teams = ["player", "enemy"] as const;
const MILESTONES = [900, 1050] as const;
const EPSILON = 1e-6;
const rounded = (value: number): number => Math.round(value * 100) / 100;

/**
 * Diagnostic estimate from the ship's own director report and equipment only.
 * It is NOT a real line-of-sight, bearing, aim-quality or safe-fire guarantee.
 * In particular this must never look up targetId in the authoritative ship list.
 */
export function hasEstimatedFiringOpportunity(ship: Readonly<ShipState>): boolean {
  if (ship.hull <= 0 || ship.aiDecision?.contactSource !== "local"
    || ship.perception?.mode !== "tracking" || !ship.perception.estimatedPosition
    || ship.modules.gun.health <= 0) return false;
  const point = ship.perception.estimatedPosition;
  const range = Math.hypot(point.x - ship.position.x, point.z - ship.position.z);
  const battery = effectiveMainBattery(ship);
  return Number.isFinite(range) && range >= GUN.minAimRange && range <= battery.maximumRangeMeters
    && ship.mainBatteryMounts.some(mount => mount.health > 0 && mount.reloadRemaining <= 0
      && Boolean(battery.mounts[mount.mountIndex]));
}

export interface FleetShipPacing {
  id: string;
  team: Team;
  hullId: ShipState["hullId"];
  shipClassId: ShipState["shipClassId"];
  weather: WeatherId;
  aliveSeconds: number;
  localContactSeconds: number;
  estimatedFiringOpportunitySeconds: number;
  fireIntentSeconds: number;
  captureDutySeconds: number;
  supportDutySeconds: number;
  mainGunShots: number;
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

/**
 * Read-only, post-step test telemetry. Time is charged to ships alive at the
 * preceding sample, including their final simulation interval. No time is
 * charged after sinking. Existing state and RNG are never modified.
 *
 * "Shot" here specifically means an emitted main-battery shell; secondary fire,
 * torpedoes and aircraft cannot disguise an idle main battery. Lack of a local
 * contact is not a failure, and an estimated opportunity does not mean a hit.
 */
export class FleetPacingMetrics {
  private previousTime: number;
  private readonly ships = new Map<string, InternalShipPacing>();
  private readonly milestones: FleetPacingMilestone[] = [];
  private readonly initialTime: number;
  private finished: boolean;

  constructor(initial: PacingState) {
    if (!Number.isFinite(initial.time) || initial.time < 0) throw new Error("Invalid pacing time");
    this.previousTime = this.initialTime = initial.time;
    this.finished = initial.status !== "running";
    for (const ship of initial.ships) this.ships.set(ship.id, {
      id: ship.id, team: ship.team, hullId: ship.hullId, shipClassId: ship.shipClassId,
      weather: initial.weatherId, aliveSeconds: 0, localContactSeconds: 0,
      estimatedFiringOpportunitySeconds: 0, fireIntentSeconds: 0,
      captureDutySeconds: 0, supportDutySeconds: 0, mainGunShots: 0,
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
    if (elapsed <= 0) return;
    const byId = new Map(state.ships.map(ship => [ship.id, ship]));
    const fired = new Map<string, number>();
    for (const shot of shots) {
      if (shot.kind === "shell" && shot.weaponSource === "mainGun") {
        fired.set(shot.ownerId, (fired.get(shot.ownerId) ?? 0) + 1);
      }
    }
    for (const metric of this.ships.values()) {
      const ship = byId.get(metric.id);
      if (metric.aliveAtPreviousSample) {
        metric.aliveSeconds += elapsed;
        metric.longestNoShotSeconds = Math.max(metric.longestNoShotSeconds,
          metric.aliveSeconds - (metric.lastShotAliveSeconds ?? 0));
        if (ship?.aiDecision?.contactSource === "local"
          && (ship.perception?.mode === "acquiring" || ship.perception?.mode === "tracking")) {
          metric.localContactSeconds += elapsed;
        }
        if (ship && hasEstimatedFiringOpportunity(ship)) metric.estimatedFiringOpportunitySeconds += elapsed;
        if (ship?.aiDecision?.fireIntent) metric.fireIntentSeconds += elapsed;
        if (ship?.aiDecision?.objectiveDuty === "capture") metric.captureDutySeconds += elapsed;
        if (ship?.aiDecision?.objectiveDuty === "support") metric.supportDutySeconds += elapsed;
        const count = fired.get(metric.id) ?? 0;
        if (count > 0) {
          metric.mainGunShots += count;
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
    groups: Array<{
      team: Team; weather: WeatherId; hullId: ShipState["hullId"]; shipCount: number;
      aliveSeconds: number; localContactSeconds: number; estimatedFiringOpportunitySeconds: number;
      fireIntentSeconds: number; captureDutySeconds: number; supportDutySeconds: number;
      mainGunShots: number; shipsWithoutMainGunFire: number; longestNoShotSeconds: number;
    }>;
    milestones: FleetPacingMilestone[];
  } {
    const ships: FleetShipPacing[] = [...this.ships.values()].map(metric => {
      const { aliveAtPreviousSample: _, ...values } = metric;
      const since = metric.aliveSeconds - (metric.lastShotAliveSeconds ?? 0);
      return { ...values,
        ...Object.fromEntries(Object.entries(values).map(([key, value]) =>
          [key, typeof value === "number" ? rounded(value) : value])),
        secondsAliveSinceLastShot: rounded(since),
        shotInactivityFraction: metric.aliveSeconds > 0 ? rounded(since / metric.aliveSeconds) : 0,
      } as FleetShipPacing;
    });
    const groups = new Map<string, ReturnType<FleetPacingMetrics["report"]>["groups"][number]>();
    // Aggregate unrounded counters, then round once at the report boundary.
    for (const metric of this.ships.values()) {
      const key = [metric.team, metric.weather, metric.hullId].join(":");
      let group = groups.get(key);
      if (!group) {
        group = { team: metric.team, weather: metric.weather, hullId: metric.hullId,
          shipCount: 0, aliveSeconds: 0, localContactSeconds: 0,
          estimatedFiringOpportunitySeconds: 0, fireIntentSeconds: 0,
          captureDutySeconds: 0, supportDutySeconds: 0, mainGunShots: 0,
          shipsWithoutMainGunFire: 0, longestNoShotSeconds: 0 };
        groups.set(key, group);
      }
      ++group.shipCount;
      group.shipsWithoutMainGunFire += Number(metric.mainGunShots === 0);
      for (const field of ["aliveSeconds", "localContactSeconds", "estimatedFiringOpportunitySeconds",
        "fireIntentSeconds", "captureDutySeconds", "supportDutySeconds", "mainGunShots"] as const) {
        group[field] += metric[field];
      }
      group.longestNoShotSeconds = Math.max(group.longestNoShotSeconds, metric.longestNoShotSeconds);
    }
    return {
      ships,
      groups: [...groups.values()].map(group => Object.fromEntries(Object.entries(group)
        .map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value])) as typeof group),
      milestones: this.milestones.map(item => ({
        ...item, sampledSeconds: rounded(item.sampledSeconds),
        teams: Object.fromEntries(teams.map(team => [team, {
          ...item.teams[team], score: rounded(item.teams[team].score),
          remainingHull: rounded(item.teams[team].remainingHull),
        }])) as FleetPacingMilestone["teams"],
      })),
    };
  }
}
