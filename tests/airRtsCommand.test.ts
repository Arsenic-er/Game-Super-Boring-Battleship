import { describe, expect, it } from "vitest";
import {
  AIR_NAVIGATION,
  chooseAirStrikeWeapon,
  createAirSquadronState,
  deployFleetAirSupport,
} from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import { createInitialState, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand } from "../src/sim/types";

const playerCommand = (
  state: ReturnType<typeof createInitialState>,
  airMissions: NonNullable<ControlCommand["airMissions"]>,
): ControlCommand => {
  const player = state.ships.find(({ id }) => id === "player")!;
  return {
    throttle: 0,
    rudder: 0,
    aimPoint: { ...player.aimPoint },
    fire: false,
    airMissions,
  };
};

describe("RTS air operations integration", () => {
  it("deploys three historical-role support squadrons per active team", () => {
    const battle = createInitialState(700, "battle");
    deployFleetAirSupport(battle);
    expect(battle.airSquadrons).toHaveLength(6);
    expect(new Set(battle.airSquadrons.filter(({ team }) => team === "player")
      .map(({ role }) => role))).toEqual(new Set([
      "fighter", "diveBomber", "torpedoBomber",
    ]));
    expect(battle.airSquadrons.filter(({ team, role }) =>
      team === "enemy" && role !== "fighter").every(({ order }) => !order)).toBe(true);


    const trials = createInitialState(701, "sea-trials");
    deployFleetAirSupport(trials);
    expect(trials.airSquadrons).toHaveLength(3);
    expect(trials.airSquadrons.every(({ team }) => team === "player")).toBe(true);
  });

  it("accepts several per-squadron commands in the same simulation tick", () => {
    const state = createInitialState(702, "sea-trials");
    deployFleetAirSupport(state);
    const fighter = state.airSquadrons.find(({ role }) => role === "fighter")!;
    const dive = state.airSquadrons.find(({ role }) => role === "diveBomber")!;
    const torpedo = state.airSquadrons.find(({ role }) => role === "torpedoBomber")!;
    const command = playerCommand(state, [
      { squadronId: fighter.id, kind: "defendShip", targetIds: ["player"] },
      {
        squadronId: dive.id,
        kind: "moveTo",
        area: { center: { x: 0, y: 180, z: -2_000 }, radius: 90 },
      },
      {
        squadronId: torpedo.id,
        kind: "patrolArea",
        area: { center: { x: 800, y: 180, z: -1_200 }, radius: 700 },
      },
    ]);
    stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    expect(state.airSquadrons.filter(({ team }) => team === "player")
      .every(({ phase }) => phase === "launching")).toBe(true);
    expect(state.airEvents.filter(({ kind }) => kind === "orderAccepted")).toHaveLength(3);
  });

  it("launches and moves toward a player-selected empty-map destination", () => {
    const state = createInitialState(703, "sea-trials");
    deployFleetAirSupport(state);
    const dive = state.airSquadrons.find(({ role }) => role === "diveBomber")!;
    const origin = { ...dive.position };
    stepSimulation(state, new Map([["player", playerCommand(state, [{
      squadronId: dive.id,
      kind: "moveTo",
      area: { center: { x: 0, y: 180, z: -2_000 }, radius: 90 },
    }])]]), FIXED_STEP);
    for (let index = 0; index < 9 / FIXED_STEP; index += 1) {
      stepSimulation(state, new Map(), FIXED_STEP);
    }
    const moved = state.airSquadrons.find(({ id }) => id === dive.id)!;
    expect(moved.position.z).toBeGreaterThan(origin.z);
    expect(Math.hypot(moved.position.x - origin.x, moved.position.z - origin.z))
      .toBeGreaterThan(AIR_NAVIGATION.speedMetersPerSecond.diveBomber * 0.5);
  });

  it("selects role-appropriate weapons for the target hull", () => {
    expect(chooseAirStrikeWeapon("fighter", "destroyer")).toBe("machineGun");
    expect(chooseAirStrikeWeapon("fighter", "battleship")).toBeUndefined();
    expect(chooseAirStrikeWeapon("diveBomber", "destroyer")).toBe("heBomb");
    expect(chooseAirStrikeWeapon("diveBomber", "battleship")).toBe("heBomb");
    expect(chooseAirStrikeWeapon("torpedoBomber", "lightCruiser")).toBe("aerialTorpedo");
    expect(chooseAirStrikeWeapon("torpedoBomber", "battleship")).toBe("aerialTorpedo");
  });

  it("does not launch enemy bombers until their controller has a surface contact", () => {
    const state = createInitialState(704, "battle");
    const player = state.ships.find(({ team }) => team === "player")!;
    const enemy = state.ships.find(({ team }) => team === "enemy")!;
    player.position = { x: 0, y: 0, z: -50_000 };
    enemy.position = { x: 0, y: 0, z: 50_000 };
    state.sensorSnapshots = {};
    deployFleetAirSupport(state);
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.airSquadrons.filter(({ team, role }) =>
      team === "enemy" && role !== "fighter").every(({ phase }) => phase === "ready"))
      .toBe(true);

    player.position = { x: 0, y: 0, z: 49_000 };
    state.sensorSnapshots = {};
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.airSquadrons.filter(({ team, role }) =>
      team === "enemy" && role !== "fighter").every(({ phase }) => phase === "launching"))
      .toBe(true);
  });

  it("updates interception from fresh snapshots, switches candidates, then searches on loss", () => {
    const state = createInitialState(705, "sea-trials");
    deployFleetAirSupport(state);
    const fighter = state.airSquadrons.find(({ role }) => role === "fighter")!;
    fighter.phase = "outbound";
    fighter.order = {
      squadronId: fighter.id,
      kind: "interceptSquadron",
      targetIds: ["bogey-1", "bogey-2"],
      candidateTargetIds: ["bogey-1", "bogey-2"],
      activeTargetId: "bogey-1",
      lastKnownPositions: {
        "bogey-1": { x: 600, y: 180, z: -1_000 },
        "bogey-2": { x: 900, y: 180, z: -800 },
      },
      lastKnownPosition: { x: 600, y: 180, z: -1_000 },
      selectedWeapon: "machineGun",
      issuedAt: 0,
    };
    const stale = createAirSquadronState({
      id: "bogey-1",
      controllerId: "enemy",
      team: "enemy",
      role: "fighter",
      recoverySource: { kind: "mapEdge", position: { x: 10_000, y: 180, z: 10_000 } },
      position: { x: 10_000, y: 180, z: 10_000 },
    });
    stale.phase = "outbound";
    stale.contactsByTeam.player = {
      observedAt: -10,
      lastKnownPosition: { x: 700, y: 180, z: -900 },
      confidence: 0.3,
    };
    const fresh = createAirSquadronState({
      id: "bogey-2",
      controllerId: "enemy",
      team: "enemy",
      role: "fighter",
      recoverySource: { kind: "mapEdge", position: { x: 11_000, y: 180, z: 10_000 } },
      position: { x: 11_000, y: 180, z: 10_000 },
    });
    fresh.phase = "outbound";
    fresh.contactsByTeam.player = {
      observedAt: state.time,
      lastKnownPosition: { x: 1_400, y: 180, z: -500 },
      confidence: 0.85,
    };
    state.airSquadrons.push(stale, fresh);
    stepSimulation(state, new Map(), FIXED_STEP);
    const tracked = state.airSquadrons.find(({ id }) => id === fighter.id)!;
    expect(tracked.order?.activeTargetId).toBe("bogey-2");
    expect(tracked.order?.lastKnownPosition).toEqual({ x: 1_400, y: 180, z: -500 });

    state.time = 6;
    stepSimulation(state, new Map(), FIXED_STEP);
    const lost = state.airSquadrons.find(({ id }) => id === fighter.id)!;
    expect(lost.phase).toBe("searching");
  });
});
