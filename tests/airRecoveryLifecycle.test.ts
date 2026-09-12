import { describe, expect, it } from "vitest";
import { AIR_NAVIGATION, AIR_OPERATION_TIMING, createAirSquadronState } from "../src/sim/airOperations";
import { airRecoveryFuelSeconds } from "../src/sim/airRecoveryGuidance";
import { createInitialState, stepSimulation } from "../src/sim/simulation";
import type { AircraftRole } from "../src/sim/types";

const DT = 1 / 30;
const CASES = (["fighter", "diveBomber", "torpedoBomber"] as const)
  .flatMap((role) => [false, true].map((away) => ({ role, away })));
const RECOVERY_CASES = CASES.flatMap((entry) => [700, 7_000].map((distance) => ({ ...entry, distance })));

function recoveryScenario(role: AircraftRole, away: boolean, distance = 700) {
  const state = createInitialState(976, "sea-trials");
  state.mapId = "open-sea-range";
  state.ships.forEach((ship, index) => {
    ship.position = { x: 20_000 + index * 3_000, y: 0, z: 20_000 };
    ship.previousPosition = { ...ship.position };
    ship.antiAirMounts = 0;
  });
  const recovery = { x: 0, y: 80, z: 0 };
  const squadron = createAirSquadronState({ id: `review-${role}`, controllerId: "player", team: "player", role,
    position: { x: 0, y: { fighter: 295, diveBomber: 390, torpedoBomber: 225 }[role], z: distance },
    heading: away ? 0 : Math.PI, recoverySource: { kind: "mapEdge", position: recovery } });
  squadron.flight = { speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0 };
  squadron.phase = "patrolling";
  squadron.order = { squadronId: squadron.id, kind: "patrolArea", issuedAt: 0,
    area: { center: { ...squadron.position }, radius: 700 } };
  state.airSquadrons = [squadron];
  return { state, squadron, recovery };
}

describe("automatic fixed-wing recovery lifecycle", () => {
  it.each(RECOVERY_CASES)("recalls $role at $distance m (away=$away) at its conservative threshold and returns to ready", ({ role, away, distance }) => {
    const { state, squadron, recovery } = recoveryScenario(role, away, distance);
    // Enter just below the computed threshold, as a fixed-step fuel update does.
    const initialFuel = airRecoveryFuelSeconds(squadron, recovery) - 0.1;
    squadron.fuelRemainingSeconds = initialFuel;
    const phases = new Set<string>([squadron.phase]);
    let returnedAt: number | undefined;
    let landedAt: number | undefined;
    for (let frame = 0; frame < (initialFuel + AIR_OPERATION_TIMING.rearmSeconds[role] + 20) / DT; frame++) {
      const before = state.airSquadrons[0]!.phase;
      stepSimulation(state, new Map(), DT);
      const live = state.airSquadrons[0]!;
      phases.add(live.phase);
      if (live.phase === "returning" && returnedAt === undefined) returnedAt = state.time;
      if (before !== "landing" && live.phase === "landing") {
        landedAt = state.time;
        // Recovery still requires the original tight horizontal AND altitude gates.
        expect(Math.hypot(live.position.x - recovery.x, live.position.z - recovery.z)).toBeLessThanOrEqual(90);
        expect(live.position.y).toBeLessThanOrEqual(115);
      }
      if (live.phase !== "ready") expect(live.fuelRemainingSeconds).toBeLessThanOrEqual(initialFuel);
      if (live.phase === "ready" || live.phase === "destroyed") break;
    }
    const live = state.airSquadrons[0]!;
    const details = JSON.stringify({ role, away, distance, initialFuel, phases: [...phases], live });
    expect(returnedAt, details).toBeLessThanOrEqual(DT * 2);
    expect(landedAt, details).toBeDefined();
    expect([...phases], details).toEqual(["patrolling", "returning", "landing", "rearming", "ready"]);
    expect(live.phase, details).toBe("ready");
    expect(live.fuelRemainingSeconds).toBe(AIR_OPERATION_TIMING.enduranceSeconds[role]);
  });

  it.each(CASES)("does not magically rescue $role (away=$away) already returning with only 35s fuel", ({ role, away }) => {
    const { state, squadron } = recoveryScenario(role, away);
    squadron.phase = "returning";
    squadron.order = { squadronId: squadron.id, kind: "recall", issuedAt: 0 };
    squadron.fuelRemainingSeconds = 35;
    for (let frame = 0; frame < 90 / DT; frame++) {
      stepSimulation(state, new Map(), DT);
      if (["rearming", "destroyed"].includes(state.airSquadrons[0]!.phase)) break;
    }
    const live = state.airSquadrons[0]!;
    if (role === "fighter" && away) {
      expect(live.phase).toBe("rearming");
    } else {
      expect(live.phase).toBe("destroyed");
      expect(live.fuelRemainingSeconds).toBe(0);
      expect(live.aircraftOperational).toBe(0);
    }
  });
});
