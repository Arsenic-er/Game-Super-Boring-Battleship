import { describe, expect, it } from "vitest";
import {
  AIR_COMBAT,
  airMissionApproachRadius,
  deployFleetAirSupport,
  predictAirStrikeAimPoint,
  shipAntiAirProfile,
} from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import { createInitialState, stepSimulation } from "../src/sim/simulation";
import type {
  AircraftRole,
  AirSquadronState,
  AirWeaponKind,
  BattleState,
} from "../src/sim/types";

function prepareStrike(
  role: AircraftRole,
  weapon: AirWeaponKind,
  seed = 810,
): { state: BattleState; squadron: AirSquadronState; targetId: string } {
  const state = createInitialState(seed, "battle");
  const player = state.ships.find(({ team }) => team === "player")!;
  const target = state.ships.find(({ team }) => team === "enemy")!;
  player.position = { x: 0, y: 0, z: -300 };
  target.position = { x: 0, y: 0, z: 0 };
  player.previousPosition = { ...player.position };
  target.previousPosition = { ...target.position };
  deployFleetAirSupport(state);
  const squadron = state.airSquadrons.find((candidate) =>
    candidate.team === "player" && candidate.role === role)!;
  const approach = AIR_COMBAT.approachMeters[weapon];
  squadron.phase = "attackRun";
  squadron.phaseStartedAt = -3;
  squadron.lastUpdatedAt = 0;
  squadron.position = { x: 0, y: 180, z: -approach };
  squadron.previousPosition = { ...squadron.position };
  squadron.order = {
    squadronId: squadron.id,
    kind: "strikeShip",
    targetId: target.id,
    targetIds: [target.id],
    candidateTargetIds: [target.id],
    activeTargetId: target.id,
    lastKnownPosition: { ...target.position },
    lastKnownPositions: { [target.id]: { ...target.position } },
    selectedWeapon: weapon,
    issuedAt: 0,
  };
  return { state, squadron, targetId: target.id };
}

describe("air combat execution", () => {
  it.each([
    ["fighter", "machineGun"],
    ["diveBomber", "heBomb"],
    ["torpedoBomber", "aerialTorpedo"],
  ] as const)("releases exactly one %s attack wave with %s", (role, weapon) => {
    const { state, squadron } = prepareStrike(role, weapon);
    const ammoBefore = squadron.ammoRemaining;
    const ordnanceBefore = squadron.ordnanceRemaining;
    stepSimulation(state, new Map(), FIXED_STEP);
    const liveSquadron = state.airSquadrons.find(({ id }) => id === squadron.id)!;
    const released = state.airEvents.filter(({ kind }) => kind === "weaponReleased");
    expect(released).toHaveLength(1);
    expect(released[0]?.weapon).toBe(weapon);
    expect(state.shots).toHaveLength(liveSquadron.aircraftOperational);
    expect(state.shots.every((shot) =>
      shot.weaponSource === "aircraft" && shot.airWeapon === weapon)).toBe(true);
    if (weapon === "machineGun") {
      expect(liveSquadron.ammoRemaining).toBe(ammoBefore - 1);
      expect(liveSquadron.ordnanceRemaining).toBe(ordnanceBefore);
    } else {
      expect(liveSquadron.ordnanceRemaining).toBe(ordnanceBefore - 1);
      expect(liveSquadron.ammoRemaining).toBe(ammoBefore);
    }
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.shots).toHaveLength(0);
    expect(state.airSquadrons.find(({ id }) => id === squadron.id)?.phase).toBe("returning");
  });

  it("drops aerial torpedoes at sea level with arming distance and finite range", () => {
    const { state, squadron } = prepareStrike("torpedoBomber", "aerialTorpedo");
    stepSimulation(state, new Map(), FIXED_STEP);
    const torpedoes = state.projectiles.filter(({ airWeapon }) =>
      airWeapon === "aerialTorpedo");
    expect(torpedoes).toHaveLength(squadron.aircraftOperational);
    expect(torpedoes.every(({ position, armingDistance, maximumRange }) =>
      position.y <= 0.5
      && armingDistance === AIR_COMBAT.torpedo.armingDistanceMeters
      && maximumRange === AIR_COMBAT.torpedo.maximumRangeMeters)).toBe(true);
  });

  it.each([
    ["diveBomber", "heBomb", 9],
    ["torpedoBomber", "aerialTorpedo", 25],
  ] as const)("lets %s projectiles resolve real %s ship damage", (role, weapon, seconds) => {
    const { state, targetId } = prepareStrike(role, weapon, 811);
    const target = state.ships.find(({ id }) => id === targetId)!;
    const hullBefore = target.hull;
    let observedHit = false;
    for (let index = 0; index < seconds / FIXED_STEP; index += 1) {
      stepSimulation(state, new Map(), FIXED_STEP);
      observedHit ||= state.airEvents.some((event) =>
        event.kind === "attackHit"
        && event.targetId === targetId
        && event.weapon === weapon);
      if (target.hull < hullBefore) break;
    }
    expect(target.hull).toBeLessThan(hullBefore);
    expect(observedHit).toBe(true);
    expect(state.impacts.some((impact) =>
      impact.targetId === targetId
      && impact.weaponSource === "aircraft"
      && impact.airWeapon === weapon)).toBe(true);
  });

  it("uses role-specific approach distances before committing the attack run", () => {
    const dive = prepareStrike("diveBomber", "heBomb").squadron;
    const torpedo = prepareStrike("torpedoBomber", "aerialTorpedo").squadron;
    expect(airMissionApproachRadius(torpedo)).toBeGreaterThan(
      airMissionApproachRadius(dive),
    );
    expect(airMissionApproachRadius(torpedo)).toBe(900);
  });

  it("applies range-bounded continuous AA and emits partial aircraft losses", () => {
    const near = createInitialState(820, "battle");
    deployFleetAirSupport(near);
    const player = near.ships.find(({ team }) => team === "player")!;
    const fighter = near.airSquadrons.find(({ team, role }) =>
      team === "enemy" && role === "fighter")!;
    fighter.phase = "outbound";
    fighter.position = { x: player.position.x, y: 180, z: player.position.z + 100 };
    fighter.previousPosition = { ...fighter.position };
    fighter.airframeHealth = 501;
    fighter.aircraftOperational = 6;
    const before = fighter.airframeHealth;
    stepSimulation(near, new Map(), 1);
    const liveFighter = near.airSquadrons.find(({ id }) => id === fighter.id)!;
    expect(liveFighter.airframeHealth).toBeLessThan(before);
    expect(liveFighter.aircraftOperational).toBe(5);
    expect(near.airEvents).toContainEqual(expect.objectContaining({
      kind: "aircraftLost",
      squadronId: fighter.id,
      aircraftLost: 1,
    }));

    const far = createInitialState(821, "battle");
    deployFleetAirSupport(far);
    const farPlayer = far.ships.find(({ team }) => team === "player")!;
    const farFighter = far.airSquadrons.find(({ team, role }) =>
      team === "enemy" && role === "fighter")!;
    farFighter.phase = "outbound";
    farFighter.position = {
      x: farPlayer.position.x,
      y: 180,
      z: farPlayer.position.z + 5_000,
    };
    farFighter.previousPosition = { ...farFighter.position };
    const farBefore = farFighter.airframeHealth;
    stepSimulation(far, new Map(), 1);
    expect(far.airSquadrons.find(({ id }) => id === farFighter.id)?.airframeHealth)
      .toBe(farBefore);
  });

  it("orders a guarding fighter to intercept a fresh threat near its ship", () => {
    const state = createInitialState(830, "battle");
    deployFleetAirSupport(state);
    const player = state.ships.find(({ team }) => team === "player")!;
    const fighter = state.airSquadrons.find(({ team, role }) =>
      team === "player" && role === "fighter")!;
    const threat = state.airSquadrons.find(({ team, role }) =>
      team === "enemy" && role === "diveBomber")!;
    fighter.position = { x: player.position.x - 100, y: 180, z: player.position.z };
    fighter.previousPosition = { ...fighter.position };
    fighter.phase = "patrolling";
    fighter.order = {
      squadronId: fighter.id,
      kind: "defendShip",
      targetId: player.id,
      targetIds: [player.id],
      candidateTargetIds: [player.id],
      activeTargetId: player.id,
      lastKnownPosition: { ...player.position },
      lastKnownPositions: { [player.id]: { ...player.position } },
      selectedWeapon: "machineGun",
      issuedAt: 0,
    };
    threat.phase = "outbound";
    threat.position = { x: player.position.x + 300, y: 180, z: player.position.z };
    threat.previousPosition = { ...threat.position };
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(fighter.order).toMatchObject({
      kind: "interceptSquadron",
      activeTargetId: threat.id,
      selectedWeapon: "machineGun",
    });
    expect(["outbound", "intercepting"]).toContain(fighter.phase);
    let intercepted = false;
    for (let index = 0; index < 3 / FIXED_STEP; index += 1) {
      stepSimulation(state, new Map(), FIXED_STEP);
      intercepted ||= state.airEvents.some((event) =>
        event.kind === "attackHit" && event.squadronId === fighter.id);
      if (intercepted) break;
    }
    expect(intercepted).toBe(true);
    stepSimulation(state, new Map(), FIXED_STEP);
    const resumed = state.airSquadrons.find(({ id }) => id === fighter.id)!;
    expect(resumed.order?.kind).toBe("defendShip");
    expect(resumed.resumeOrder).toBeUndefined();
    expect(["outbound", "patrolling"]).toContain(resumed.phase);
    expect(resumed.ammoRemaining).toBeGreaterThan(0);
  });

  it("resolves interception damage once and returns the attacker", () => {
    const state = createInitialState(840, "battle");
    deployFleetAirSupport(state);
    const fighter = state.airSquadrons.find(({ team, role }) =>
      team === "player" && role === "fighter")!;
    const target = state.airSquadrons.find(({ team, role }) =>
      team === "enemy" && role === "diveBomber")!;
    fighter.phase = "intercepting";
    fighter.phaseStartedAt = -2;
    fighter.position = { x: 0, y: 180, z: 0 };
    target.phase = "outbound";
    target.position = { x: 100, y: 180, z: 0 };
    target.contactsByTeam.player = {
      observedAt: 0,
      lastKnownPosition: { ...target.position },
      confidence: 0.9,
    };
    fighter.order = {
      squadronId: fighter.id,
      kind: "interceptSquadron",
      targetId: target.id,
      targetIds: [target.id],
      candidateTargetIds: [target.id],
      activeTargetId: target.id,
      lastKnownPosition: { ...target.position },
      lastKnownPositions: { [target.id]: { ...target.position } },
      selectedWeapon: "machineGun",
      issuedAt: 0,
    };
    const healthBefore = target.airframeHealth;
    const ammoBefore = fighter.ammoRemaining;
    stepSimulation(state, new Map(), FIXED_STEP);
    const liveTarget = state.airSquadrons.find(({ id }) => id === target.id)!;
    const liveFighter = state.airSquadrons.find(({ id }) => id === fighter.id)!;
    expect(liveTarget.airframeHealth).toBeLessThan(healthBefore);
    expect(liveFighter.ammoRemaining).toBe(ammoBefore - 1);
    expect(state.airEvents).toContainEqual(expect.objectContaining({
      kind: "attackHit", squadronId: fighter.id, targetId: target.id,
    }));
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.airSquadrons.find(({ id }) => id === fighter.id)?.phase)
      .toBe("returning");
  });

  it("replays seeded weapon release identically", () => {
    const left = prepareStrike("diveBomber", "heBomb", 850).state;
    const right = prepareStrike("diveBomber", "heBomb", 850).state;
    stepSimulation(left, new Map(), FIXED_STEP);
    stepSimulation(right, new Map(), FIXED_STEP);
    expect(left.projectiles).toEqual(right.projectiles);
    expect(left.airEvents).toEqual(right.airEvents);
    expect(left.randomSeed).toBe(right.randomSeed);
  });

  it("leads a moving ship and gives slow aerial torpedoes the largest prediction", () => {
    const origin = { x: 0, y: 180, z: -900 };
    const target = { x: 0, y: 0, z: 0 };
    const stationary = predictAirStrikeAimPoint(origin, target, 0, 0, "aerialTorpedo");
    const bombLead = predictAirStrikeAimPoint(origin, target, Math.PI / 2, 30, "heBomb");
    const torpedoLead = predictAirStrikeAimPoint(
      origin, target, Math.PI / 2, 30, "aerialTorpedo",
    );
    expect(stationary).toEqual(target);
    expect(bombLead.x).toBeGreaterThan(0);
    expect(torpedoLead.x).toBeGreaterThan(bombLead.x * 2);
  });

  it("uses the attacking squadron to refresh a surface contact beyond mother-ship vision", () => {
    const state = createInitialState(860, "battle");
    deployFleetAirSupport(state);
    const player = state.ships.find(({ team }) => team === "player")!;
    const target = state.ships.find(({ team }) => team === "enemy")!;
    const bomber = state.airSquadrons.find(({ team, role }) =>
      team === "player" && role === "torpedoBomber")!;
    player.position = { x: -5_500, y: 0, z: -5_500 };
    target.position = { x: 0, y: 0, z: 0 };
    target.speedKnots = 24;
    target.heading = Math.PI / 2;
    bomber.position = { x: 0, y: 180, z: -1_300 };
    bomber.previousPosition = { ...bomber.position };
    bomber.phase = "outbound";
    bomber.order = {
      squadronId: bomber.id,
      kind: "strikeShip",
      targetId: target.id,
      targetIds: [target.id],
      candidateTargetIds: [target.id],
      activeTargetId: target.id,
      lastKnownPosition: { x: 0, y: 0, z: -800 },
      lastKnownPositions: { [target.id]: { x: 0, y: 0, z: -800 } },
      selectedWeapon: "aerialTorpedo",
      issuedAt: 0,
    };
    state.sensorSnapshots = {};
    stepSimulation(state, new Map(), FIXED_STEP);
    const tracked = state.airSquadrons.find(({ id }) => id === bomber.id)!;
    expect(tracked.phase).not.toBe("searching");
    expect(tracked.order?.lastKnownPosition?.z).toBeGreaterThan(-100);
    expect(tracked.order?.lastKnownSpeedsKnots?.[target.id]).toBeGreaterThan(20);
  });

  it("derives temporary baseline AA from historical class starter slots", () => {
    const destroyer = shipAntiAirProfile("fletcher");
    const battleship = shipAntiAirProfile("yamato");
    expect(battleship.rangeMeters).toBeGreaterThan(destroyer.rangeMeters);
    expect(battleship.continuousDps).toBeGreaterThan(destroyer.continuousDps);
  });

  it("uses fitted AA mount count and equipment efficiency", () => {
    const empty = shipAntiAirProfile("fletcher", 0, 1);
    const common = shipAntiAirProfile("fletcher", 1, 1.03);
    const upgraded = shipAntiAirProfile("fletcher", 2, 1.22);
    expect(empty.continuousDps).toBe(0);
    expect(upgraded.continuousDps).toBeGreaterThan(common.continuousDps * 2);
    expect(upgraded.rangeMeters).toBeGreaterThan(common.rangeMeters);
  });
});
