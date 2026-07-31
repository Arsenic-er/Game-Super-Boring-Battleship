import { describe, expect, it } from "vitest";
import {
  AIR_OPERATION_TIMING,
  applyAirDamage,
  advanceAirSquadronPhase,
  createAirSquadronState,
  issueAirMissionOrder,
} from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import {
  createInitialState,
  stepSimulation,
  validateAirMissionTarget,
} from "../src/sim/simulation";
import type { AirMissionCommand, AirSquadronState, ControlCommand } from "../src/sim/types";

const point = { x: 0, y: 180, z: -1_200 };

const squadron = (role: AirSquadronState["role"] = "fighter") =>
  createAirSquadronState({
    id: `${role}-alpha`,
    controllerId: "player",
    team: "player",
    role,
    recoverySource: { kind: "mapEdge", position: { x: -3_200, y: 180, z: 0 } },
    position: point,
    now: 0,
  });

const acceptedSquadron = (
  state: AirSquadronState,
  command: AirMissionCommand,
  now = 0,
): AirSquadronState => {
  const result = issueAirMissionOrder(state, command, now);
  expect(result.accepted).toBe(true);
  return result.squadron!;
};

describe("command-only air operations", () => {
  it("launches a fighter CAP from a high-level defend order", () => {
    let state = squadron();
    state = acceptedSquadron(state, {
      squadronId: state.id,
      kind: "defendShip",
    });
    expect(state.phase).toBe("launching");

    state = advanceAirSquadronPhase(
      state,
      AIR_OPERATION_TIMING.launchSeconds + 0.01,
    );
    expect(state.phase).toBe("outbound");
    state = advanceAirSquadronPhase(state, AIR_OPERATION_TIMING.launchSeconds + 0.02, {
      reachedMissionArea: true,
    });
    expect(state.phase).toBe("patrolling");
  });

  it("keeps fighter and strike roles distinct and requires real targets", () => {
    const fighter = squadron();
    const bomber = squadron("diveBomber");
    expect(issueAirMissionOrder(fighter, {
      squadronId: fighter.id,
      kind: "strikeShip",
      targetId: "enemy",
    }, 0).reason).toBe("wrong-role");
    expect(issueAirMissionOrder(bomber, {
      squadronId: bomber.id,
      kind: "interceptSquadron",
      targetId: "enemy-fighter",
    }, 0).reason).toBe("wrong-role");
    expect(issueAirMissionOrder(bomber, {
      squadronId: bomber.id,
      kind: "strikeShip",
    }, 0).reason).toBe("target-required");
  });

  it("allows en-route retasking but locks an attack run", () => {
    let state = acceptedSquadron(squadron("torpedoBomber"), {
      squadronId: "torpedoBomber-alpha",
      kind: "strikeShip",
      targetId: "enemy",
    });
    state = advanceAirSquadronPhase(state, AIR_OPERATION_TIMING.launchSeconds + 0.01);
    state = acceptedSquadron(state, {
      squadronId: state.id,
      kind: "strikeShip",
      targetId: "enemy-2",
    }, 9);
    expect(state.phase).toBe("outbound");
    expect(state.order?.targetId).toBe("enemy-2");

    state = advanceAirSquadronPhase(state, 9.01, { reachedMissionArea: true });
    expect(state.phase).toBe("attackRun");
    expect(issueAirMissionOrder(state, {
      squadronId: state.id,
      kind: "recall",
    }, 10).reason).toBe("committed");
  });

  it("keeps repeated launch orders idempotent instead of skipping the launch", () => {
    let state = acceptedSquadron(squadron(), {
      squadronId: "fighter-alpha",
      kind: "defendShip",
    });
    const repeated = issueAirMissionOrder(state, {
      squadronId: state.id,
      kind: "defendShip",
    }, 1);
    expect(repeated.accepted).toBe(true);
    expect(repeated.changed).toBe(false);
    expect(repeated.squadron?.phase).toBe("launching");
    expect(repeated.squadron?.phaseStartedAt).toBe(0);
  });

  it("retasks during launch without restarting the launch timer", () => {
    let state = acceptedSquadron(squadron("diveBomber"), {
      squadronId: "diveBomber-alpha",
      kind: "strikeShip",
      targetId: "enemy-1",
    });
    state = acceptedSquadron(state, {
      squadronId: state.id,
      kind: "strikeShip",
      targetId: "enemy-2",
    }, 4);
    expect(state.phase).toBe("launching");
    expect(state.phaseStartedAt).toBe(0);
  });

  it("refreshes trusted target position without restarting an identical mission", () => {
    let state = acceptedSquadron(squadron("diveBomber"), {
      squadronId: "diveBomber-alpha",
      kind: "strikeShip",
      targetId: "enemy",
    });
    const updated = issueAirMissionOrder(state, {
      squadronId: state.id,
      kind: "strikeShip",
      targetId: "enemy",
    }, 2, {
      targetIds: ["enemy"],
      lastKnownPositions: { enemy: { x: 900, y: 0, z: 600 } },
    });
    expect(updated.changed).toBe(false);
    expect(updated.squadron?.order?.lastKnownPosition).toEqual({ x: 900, y: 0, z: 600 });
    expect(updated.squadron?.phaseStartedAt).toBe(0);
  });

  it("applies air damage through one synchronized health and plane-count path", () => {
    const result = applyAirDamage(squadron(), 150, "aaContinuous");
    expect(result.damageApplied).toBe(150);
    expect(result.aircraftLost).toBe(1);
    expect(result.squadron.aircraftOperational).toBe(5);
    expect(result.squadron.airframeHealth).toBe(450);
  });

  it("searches a lost contact briefly and then returns autonomously", () => {
    let state = acceptedSquadron(squadron("diveBomber"), {
      squadronId: "diveBomber-alpha",
      kind: "strikeShip",
      targetId: "enemy",
    });
    state = advanceAirSquadronPhase(state, AIR_OPERATION_TIMING.launchSeconds + 0.01);
    state = advanceAirSquadronPhase(state, 9, { contactValid: false });
    expect(state.phase).toBe("searching");
    state = advanceAirSquadronPhase(
      state,
      9 + AIR_OPERATION_TIMING.searchSeconds + 0.01,
    );
    expect(state.phase).toBe("returning");
  });

  it("returns, lands, rearms and restores flight endurance", () => {
    let state = acceptedSquadron(squadron("diveBomber"), {
      squadronId: "diveBomber-alpha",
      kind: "strikeShip",
      targetId: "enemy",
    });
    state = advanceAirSquadronPhase(state, AIR_OPERATION_TIMING.launchSeconds + 0.01);
    state = advanceAirSquadronPhase(state, 9, { reachedMissionArea: true });
    state = advanceAirSquadronPhase(state, 9.1, { attackCompleted: true });
    expect(state.phase).toBe("returning");
    state = advanceAirSquadronPhase(state, 10, { reachedRecoveryPoint: true });
    expect(state.phase).toBe("landing");
    state = advanceAirSquadronPhase(state, 10 + AIR_OPERATION_TIMING.landingSeconds + 0.01);
    expect(state.phase).toBe("rearming");
    state = advanceAirSquadronPhase(
      state,
      state.phaseStartedAt + AIR_OPERATION_TIMING.rearmSeconds.diveBomber + 0.01,
    );
    expect(state.phase).toBe("ready");
    expect(state.order).toBeUndefined();
    expect(state.fuelRemainingSeconds).toBe(AIR_OPERATION_TIMING.enduranceSeconds.diveBomber);
  });

  it("returns on reserve fuel and ditches if fuel reaches zero before recovery", () => {
    let state = acceptedSquadron(squadron(), {
      squadronId: "fighter-alpha",
      kind: "defendShip",
    });
    state = advanceAirSquadronPhase(state, AIR_OPERATION_TIMING.launchSeconds + 0.01);
    state = advanceAirSquadronPhase(
      state,
      AIR_OPERATION_TIMING.enduranceSeconds.fighter
        - AIR_OPERATION_TIMING.returnReserveSeconds + 0.02,
    );
    expect(state.phase).toBe("returning");
    state = advanceAirSquadronPhase(
      state,
      AIR_OPERATION_TIMING.enduranceSeconds.fighter + 0.02,
    );
    expect(state.phase).toBe("destroyed");
  });

  it("separates the controlling ship from an off-map recovery source", () => {
    const state = squadron();
    expect(state.controllerId).toBe("player");
    expect(state.recoverySource.kind).toBe("mapEdge");
    expect(state.ammoRemaining).toBeGreaterThan(0);
  });

  it("records a mission command in battle without granting direct aircraft control", () => {
    const battle = createInitialState(401, "sea-trials");
    const player = battle.ships[0]!;
    const fighter = squadron();
    battle.airSquadrons.push(fighter);
    const command: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { ...player.aimPoint },
      fire: true,
      weaponSlot: "aircraft",
      airMission: {
        squadronId: fighter.id,
        kind: "defendShip",
      },
    };
    stepSimulation(battle, new Map([[player.id, command]]), FIXED_STEP);
    expect(battle.airSquadrons[0]!.phase).toBe("launching");
    expect(battle.airEvents).toHaveLength(1);
    expect(battle.airEvents[0]).toMatchObject({
      kind: "orderAccepted",
      orderKind: "defendShip",
      squadronId: fighter.id,
    });
    expect(battle.projectiles).toHaveLength(0);
    expect(battle.shots).toHaveLength(0);
  });

  it("keeps simulating the ship when an identical mission remains in input", () => {
    const battle = createInitialState(404, "sea-trials");
    const player = battle.ships[0]!;
    const fighter = squadron();
    battle.airSquadrons.push(fighter);
    const command: ControlCommand = {
      throttle: 1,
      rudder: 0,
      aimPoint: { ...player.aimPoint },
      fire: false,
      weaponSlot: "aircraft",
      airMission: { squadronId: fighter.id, kind: "defendShip" },
    };
    stepSimulation(battle, new Map([[player.id, command]]), 1);
    const firstDistance = player.distanceTravelled;
    stepSimulation(battle, new Map([[player.id, command]]), 1);
    expect(player.distanceTravelled).toBeGreaterThan(firstDistance);
    expect(battle.airEvents.filter(({ kind }) => kind === "orderAccepted")).toHaveLength(0);
  });

  it("emits a returning lifecycle event when a recall command changes phase", () => {
    const battle = createInitialState(405, "sea-trials");
    const player = battle.ships[0]!;
    const fighter = squadron();
    battle.airSquadrons.push(fighter);
    const baseCommand: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { ...player.aimPoint },
      fire: false,
      weaponSlot: "aircraft",
    };
    stepSimulation(battle, new Map([[player.id, {
      ...baseCommand,
      airMission: { squadronId: fighter.id, kind: "defendShip" },
    }]]), FIXED_STEP);
    stepSimulation(battle, new Map([[player.id, {
      ...baseCommand,
      airMission: { squadronId: fighter.id, kind: "recall" },
    }]]), FIXED_STEP);
    expect(battle.airSquadrons[0]?.phase).toBe("returning");
    expect(battle.airEvents.map(({ kind }) => kind)).toEqual([
      "orderAccepted",
      "returning",
    ]);
  });

  it("rejects nonexistent, friendly and unobserved surface targets", () => {
    const battle = createInitialState(402, "battle");
    const player = battle.ships[0]!;
    expect(validateAirMissionTarget(battle, player, {
      squadronId: "bomber",
      kind: "strikeShip",
      targetId: "missing",
    }).rejectReason).toBe("invalid-target");
    expect(validateAirMissionTarget(battle, player, {
      squadronId: "bomber",
      kind: "strikeShip",
      targetId: player.id,
    }).rejectReason).toBe("invalid-target");
    const enemy = battle.ships.find((ship) => ship.team !== player.team)!;
    enemy.position.x = player.position.x;
    enemy.position.z = player.position.z + 100_000;
    battle.sensorSnapshots = {};
    expect(validateAirMissionTarget(battle, player, {
      squadronId: "bomber",
      kind: "strikeShip",
      targetId: enemy.id,
    }).rejectReason).toBe("invalid-target");
  });

  it("only intercepts a detected airborne enemy squadron", () => {
    const battle = createInitialState(403, "battle");
    const player = battle.ships[0]!;
    let enemyAir = createAirSquadronState({
      id: "enemy-fighter",
      controllerId: "enemy",
      team: "enemy",
      role: "fighter",
      recoverySource: { kind: "mapEdge", position: { x: 3_200, y: 180, z: 0 } },
      position: { x: 1_000, y: 180, z: 0 },
    });
    enemyAir = acceptedSquadron(enemyAir, {
      squadronId: enemyAir.id,
      kind: "defendShip",
    });
    battle.airSquadrons.push(enemyAir);
    const mission: AirMissionCommand = {
      squadronId: "fighter-alpha",
      kind: "interceptSquadron",
      targetId: enemyAir.id,
    };
    expect(validateAirMissionTarget(battle, player, mission).rejectReason)
      .toBe("invalid-target");
    enemyAir.contactsByTeam.player = {
      observedAt: battle.time,
      lastKnownPosition: { x: 750, y: 180, z: 250 },
      confidence: 0.8,
    };
    expect(validateAirMissionTarget(battle, player, mission).lastKnownPosition)
      .toEqual({ x: 750, y: 180, z: 250 });
    enemyAir.position.x = 9_999;
    battle.time = 6;
    expect(validateAirMissionTarget(battle, player, mission).rejectReason)
      .toBe("invalid-target");
  });
});
