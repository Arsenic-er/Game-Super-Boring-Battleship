import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { AIR_NAVIGATION, createAirSquadronState } from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import type { AircraftRole, ControlCommand, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
function fixture(team: Team = "player", role: AircraftRole = "fighter") {
  const state = createInitialState(9779, "sea-trials");
  state.mapId = "open-sea-range";
  state.underwaterTargets = [];
  const ship = (id: string, ownTeam: Team, z: number) => createDeveloperShipState({
    id, team: ownTeam, shipClassId: "north-carolina", aiControlled: true,
    position: { x: 0, y: 0, z }, antiAirMounts: 0, secondaryGunIds: [],
  });
  const former = ship("former", team, -1_200);
  former.hull = 0;
  const successor = ship("successor", team, -900);
  const target = ship("target", team === "player" ? "enemy" : "player", 0);
  state.ships = [former, successor, target];
  const position = { x: 0, y: 80, z: -2_600 };
  const recovery = { kind: "mapEdge" as const, position: { x: 0, y: 80, z: -3_000 } };
  state.airSquadrons = [createAirSquadronState({
    id: "surviving-flight", controllerId: former.id, team, role,
    position, recoverySource: recovery,
  })];
  state.airSquadrons[0]!.flight = {
    speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0,
  };
  return { state, former, successor, target, recovery };
}

describe("authoritative aviation command continuity", () => {
  it.each(["player", "enemy"] as const)("hands ready %s aircraft to an active AI and dispatches in the same step", team => {
    const { state, successor, recovery } = fixture(team);
    new LocalBattleSession(state).step(new Map(), FIXED_STEP);
    const squadron = state.airSquadrons[0]!;
    expect(squadron.controllerId).toBe(successor.id);
    expect(squadron.phase).toBe("launching");
    expect(squadron.order?.kind).toBe("defendShip");
    expect(squadron.order?.targetIds).toEqual([successor.id]);
    expect(squadron.recoverySource).toEqual(recovery);
    expect(state.airEvents.filter(event => event.kind === "orderAccepted")).toHaveLength(1);
  });

  it("skips a closer human-controlled ally and does not overwrite an active mission", () => {
    const { state, successor, target, recovery } = fixture();
    const human = createDeveloperShipState({
      id: "human", team: "player", shipClassId: "fletcher", aiControlled: true,
      position: { x: 50, y: 0, z: -2_600 }, antiAirMounts: 0, secondaryGunIds: [],
    });
    state.ships.push(human);
    const squadron = state.airSquadrons[0]!;
    squadron.phase = "patrolling";
    squadron.order = { squadronId: squadron.id, kind: "patrolArea", issuedAt: 0,
      area: { center: { x: 0, y: 300, z: -2_600 }, radius: 600 } };
    squadron.fuelRemainingSeconds = 310;
    squadron.ammoRemaining = 43;
    const order = structuredClone(squadron.order);
    const position = { ...squadron.position };
    new LocalBattleSession(state).step(new Map([[human.id, idle(human)], [target.id, idle(target)]]), FIXED_STEP);
    const after = state.airSquadrons[0]!;
    expect(after.controllerId).toBe(successor.id);
    expect(after.phase).toBe("patrolling");
    expect(after.order).toEqual(order);
    expect(after.recoverySource).toEqual(recovery);
    expect(after.ammoRemaining).toBe(43);
    expect(after.fuelRemainingSeconds).toBeCloseTo(310 - FIXED_STEP);
    expect(Math.hypot(after.position.x - position.x, after.position.z - position.z)).toBeLessThan(3);
    expect(state.airEvents.filter(event => event.kind === "orderAccepted")).toHaveLength(0);
  });

  it("does not seize a live human owner's aircraft, even with another eligible AI", () => {
    const { state, former } = fixture();
    former.hull = former.maxHull;
    const squadron = state.airSquadrons[0]!;
    new LocalBattleSession(state).step(new Map([[former.id, idle(former)]]), FIXED_STEP);
    expect(state.airSquadrons[0]!.controllerId).toBe(former.id);
    expect(state.airSquadrons[0]!.phase).toBe("ready");
    expect(state.airSquadrons[0]!.fuelRemainingSeconds).toBe(squadron.fuelRemainingSeconds);
  });

  it("waits without a qualified ally, then hands off when that AI becomes available", () => {
    const { state, successor } = fixture();
    const session = new LocalBattleSession(state);
    session.step(new Map([[successor.id, idle(successor)]]), FIXED_STEP);
    expect(state.airSquadrons[0]!.controllerId).toBe("former");
    expect(state.airSquadrons[0]!.phase).toBe("ready");
    session.step(new Map(), FIXED_STEP);
    expect(state.airSquadrons[0]!.controllerId).toBe(successor.id);
    expect(state.airSquadrons[0]!.phase).toBe("launching");
  });

  it("supports deleted controllers through the raw-step fallback without needing historical enemy IDs", () => {
    const { state, former, successor } = fixture("enemy");
    state.ships = state.ships.filter(ship => ship.id !== former.id);
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.airSquadrons[0]!.controllerId).toBe(successor.id);
    expect(state.airSquadrons[0]!.phase).toBe("launching");
  });

  it("does not mutate ownership once the battle has ended", () => {
    const { state } = fixture();
    state.status = "draw";
    const before = structuredClone(state);
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state).toEqual(before);
  });

  it.each(["player", "enemy"] as const)("completes two physical bomber sorties after %s command succession", team => {
    const { state, successor, target, recovery } = fixture(team, "diveBomber");
    const commands = new Map([[successor.id, idle(successor)], [target.id, idle(target)]]);
    const options = { automatedAirControllerIds: new Set([successor.id]) };
    const phases = new Set<string>();
    let launches = 0, releases = 0, landings = 0;
    // Only initial conditions are arranged: no fuel, ammo, phases or position
    // are rewritten while the real fixed-step lifecycle runs.
    for (let frame = 0; frame < 300 / FIXED_STEP; ++frame) {
      stepSimulation(state, commands, FIXED_STEP, options);
      phases.add(state.airSquadrons[0]!.phase);
      launches += state.airEvents.filter(event => event.kind === "launched").length;
      releases += state.airEvents.filter(event => event.kind === "weaponReleased").length;
      landings += state.airEvents.filter(event => event.kind === "landed").length;
      expect(state.airSquadrons[0]!.controllerId).toBe(successor.id);
      expect(state.airSquadrons[0]!.recoverySource).toEqual(recovery);
      if (launches >= 2) break;
    }
    expect(launches).toBe(2);
    expect(releases).toBeGreaterThanOrEqual(1);
    expect(landings).toBeGreaterThanOrEqual(1);
    for (const phase of ["attackRun", "returning", "landing", "rearming"]) expect(phases.has(phase)).toBe(true);
    expect(state.airSquadrons[0]!.ordnanceRemaining).toBeGreaterThan(0);
  });
});
