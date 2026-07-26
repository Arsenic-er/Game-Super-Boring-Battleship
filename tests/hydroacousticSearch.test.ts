import { describe, expect, it } from "vitest";
import { FIXED_STEP, HYDRO, SMOKE, TORPEDO } from "../src/sim/config";
import { isProjectileVisibleToPlayer } from "../src/sim/playerPerception";
import {
  createInitialState,
  observe,
  stepSimulation,
  torpedoThreatsFor,
} from "../src/sim/simulation";
import type { BattleState, ControlCommand, ProjectileState, ShipState } from "../src/sim/types";

const commandFor = (ship: ShipState, activateHydro = false): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { x: ship.position.x, y: 0, z: ship.position.z + 1_000 },
  fire: false,
  activateHydro,
});

const placeShips = (state: BattleState, range: number): [ShipState, ShipState] => {
  const player = state.ships.find((ship) => ship.id === "player")!;
  const enemy = state.ships.find((ship) => ship.id === "enemy")!;
  player.position = { x: 0, y: 0, z: 0 };
  player.previousPosition = { ...player.position };
  enemy.position = { x: 0, y: 0, z: range };
  enemy.previousPosition = { ...enemy.position };
  player.speedKnots = 0;
  enemy.speedKnots = 0;
  return [player, enemy];
};

const addSmokeWall = (state: BattleState, z: number): void => {
  state.smokeClouds.push({
    id: state.nextEntityId++,
    ownerId: "test",
    ownerTeam: "player",
    position: { x: 0, y: 0, z },
    radius: SMOKE.puffRadiusMeters,
    spawnedAt: state.time,
    expiresAt: state.time + 10_000,
  });
};

const incomingTorpedo = (
  state: BattleState,
  owner: ShipState,
  range: number,
): ProjectileState => ({
  id: state.nextEntityId++,
  ownerId: owner.id,
  team: owner.team,
  kind: "torpedo",
  position: { x: 0, y: 0, z: range },
  previousPosition: { x: 0, y: 0, z: range + TORPEDO.speedMetersPerSecond * FIXED_STEP },
  velocity: { x: 0, y: 0, z: -TORPEDO.speedMetersPerSecond },
  damage: TORPEDO.damage,
  age: 3,
  distanceTravelled: 300,
  armingDistance: TORPEDO.armingDistanceMeters,
  maximumRange: TORPEDO.maximumRangeMeters,
  detectionRange: TORPEDO.detectionRangeMeters,
});

describe("Hydroacoustic Search", () => {
  it("consumes one charge, stays active, then starts its cooldown after expiry", () => {
    const state = createInitialState(5101, "sea-trials");
    const player = state.ships[0]!;
    stepSimulation(state, new Map([[player.id, commandFor(player, true)]]), FIXED_STEP);
    expect(player.hydroCharges).toBe(HYDRO.charges - 1);
    expect(player.hydroActiveRemaining).toBeGreaterThan(HYDRO.activeSeconds - 1);
    expect(player.hydroCooldownRemaining).toBe(0);

    for (let tick = 0; tick < 1 / FIXED_STEP; tick += 1) {
      stepSimulation(state, new Map([[player.id, commandFor(player, true)]]), FIXED_STEP);
    }
    expect(player.hydroCharges).toBe(HYDRO.charges - 1);

    player.hydroActiveRemaining = FIXED_STEP / 2;
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(player.hydroActiveRemaining).toBe(0);
    expect(player.hydroCooldownRemaining).toBe(HYDRO.cooldownSeconds);
  });

  it("pierces smoke for the observer only inside the two-kilometre ship radius", () => {
    const state = createInitialState(5102);
    const [player, enemy] = placeShips(state, 1_200);
    addSmokeWall(state, 600);
    expect(observe(state, player.id).contacts).toHaveLength(0);
    expect(observe(state, enemy.id).contacts).toHaveLength(0);

    stepSimulation(state, new Map([[player.id, commandFor(player, true)]]), FIXED_STEP);
    expect(observe(state, player.id).contacts).toHaveLength(1);
    expect(observe(state, enemy.id).contacts).toHaveLength(0);

    enemy.position.z = HYDRO.shipDetectionMeters + 50;
    enemy.previousPosition = { ...enemy.position };
    delete state.sensorSnapshots[player.id];
    expect(observe(state, player.id).contacts).toHaveLength(0);
  });

  it("uses one shared boosted range for warnings and rendered torpedo visibility", () => {
    const state = createInitialState(5103);
    const [player, enemy] = placeShips(state, 2_500);
    const torpedo = incomingTorpedo(state, enemy, 1_000);
    state.projectiles.push(torpedo);
    expect(torpedoThreatsFor(state, player.id)).toHaveLength(0);
    expect(isProjectileVisibleToPlayer(torpedo, player)).toBe(false);

    stepSimulation(state, new Map([[player.id, commandFor(player, true)]]), FIXED_STEP);
    expect(torpedoThreatsFor(state, player.id)).toHaveLength(1);
    expect(isProjectileVisibleToPlayer(torpedo, player)).toBe(true);
  });

  it("invalidates a same-sample sensor cache when hydro ends", () => {
    const state = createInitialState(5104);
    const [player] = placeShips(state, 1_200);
    addSmokeWall(state, 600);
    player.hydroActiveRemaining = FIXED_STEP / 2;
    expect(observe(state, player.id).contacts).toHaveLength(1);
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(observe(state, player.id).contacts).toHaveLength(0);
  });
});
