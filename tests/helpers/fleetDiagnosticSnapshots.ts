import { effectiveMainBattery } from "../../src/ships/mainBatteries";
import { mainBatteryMountCanBear } from "../../src/sim/simulation";
import type { BattleState } from "../../src/sim/types";

/** Bounded test-only snapshots; gun diagnostics use this ship's aim, never target truth. */
export function fleetDiagnosticSnapshot(state: Readonly<BattleState>) {
  return {
    time: state.time, status: state.status,
    objective: structuredClone(state.objective),
    ships: state.ships.map(ship => ({
      id: ship.id, team: ship.team, shipClassId: ship.shipClassId,
      hull: ship.hull, maxHull: ship.maxHull,
      position: { ...ship.position }, heading: ship.heading, speedKnots: ship.speedKnots,
      distanceToObjective: Math.hypot(ship.position.x - state.objective.center.x,
        ship.position.z - state.objective.center.z),
      aimPoint: { ...ship.aimPoint },
      mainGunRange: effectiveMainBattery(ship).maximumRangeMeters,
      modules: Object.fromEntries(["gun", "engine", "steering"].map(key => {
        const module = ship.modules[key as "gun" | "engine" | "steering"];
        return [key, { health: module.health, maxHealth: module.maxHealth }];
      })),
      mounts: ship.mainBatteryMounts.map(mount => ({
        index: mount.mountIndex, health: mount.health, reloadRemaining: mount.reloadRemaining,
        heading: mount.heading, canBearOwnAim: mainBatteryMountCanBear(ship, mount.mountIndex, ship.aimPoint),
      })),
      smokeDeploymentRemaining: ship.smokeDeploymentRemaining,
      aiDecision: ship.aiDecision ? structuredClone(ship.aiDecision) : undefined,
      perception: ship.perception ? structuredClone(ship.perception) : undefined,
    })),
  };
}

export class FleetDiagnosticSnapshots {
  private readonly samples: ReturnType<typeof fleetDiagnosticSnapshot>[] = [];
  private nextMilestone = 0;
  private finished = false;
  update(state: Readonly<BattleState>): void {
    if (this.finished) return;
    const milestones = [900, 1050];
    if (this.nextMilestone < milestones.length
      && state.time >= milestones[this.nextMilestone]! - 1e-6) {
      // Never synthesize missing earlier states if the caller skipped a boundary.
      while (this.nextMilestone < milestones.length
        && state.time >= milestones[this.nextMilestone]! - 1e-6) ++this.nextMilestone;
      this.samples.push(fleetDiagnosticSnapshot(state));
    }
    if (state.status !== "running") {
      const terminal = fleetDiagnosticSnapshot(state);
      if (this.samples.at(-1)?.time === state.time) this.samples[this.samples.length - 1] = terminal;
      else this.samples.push(terminal);
      this.finished = true;
    }
  }
  report(): ReturnType<typeof fleetDiagnosticSnapshot>[] { return structuredClone(this.samples); }
}
