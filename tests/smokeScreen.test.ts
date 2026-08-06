import { describe, expect, it } from "vitest";
import { FIXED_STEP, SMOKE, TORPEDO } from "../src/sim/config";
import {
  createInitialState,
  isLineObscuredBySmoke,
  isPointInSmoke,
  observe,
  stepSimulation,
  torpedoThreatsFor,
} from "../src/sim/simulation";
import type { BattleState, ControlCommand, ShipState } from "../src/sim/types";

const commandFor = (ship: ShipState, activateSmoke = false): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { x: ship.position.x, y: 0, z: ship.position.z + 1_000 },
  fire: false,
  activateSmoke,
});

const addSmoke = (state: BattleState, x: number, z: number): void => {
  state.smokeClouds.push({
    id: state.nextEntityId++,
    ownerId: "test",
    ownerTeam: "player",
    position: { x, y: 0, z },
    radius: SMOKE.puffRadiusMeters,
    spawnedAt: state.time,
    expiresAt: state.time + SMOKE.puffLifetimeSeconds,
  });
};

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

describe("destroyer smoke screens", () => {
  it("consumes one charge per activation and lays a fixed world-space smoke trail", () => {
    const state = createInitialState(4101, "sea-trials");
    const player = state.ships[0]!;
    const held = commandFor(player, true);
    for (let tick = 0; tick < 180; tick += 1) {
      stepSimulation(state, new Map([[player.id, held]]), FIXED_STEP);
    }
    expect(player.smokeCharges).toBe(SMOKE.charges - 1);
    expect(player.smokeCooldownRemaining).toBeGreaterThan(100);
    expect(state.smokeClouds.length).toBeGreaterThanOrEqual(2);
    expect(isPointInSmoke(state, state.smokeClouds[0]!.position)).toBe(true);
  });

  it("expires every puff deterministically", () => {
    const state = createInitialState(4102, "sea-trials");
    const player = state.ships[0]!;
    stepSimulation(state, new Map([[player.id, commandFor(player, true)]]), FIXED_STEP);
    for (let tick = 0; tick < 90 / FIXED_STEP; tick += 1) {
      stepSimulation(state, new Map(), FIXED_STEP);
    }
    expect(state.smokeClouds).toHaveLength(0);
  });

  it("blocks optical contact in both directions but preserves forced proximity detection", () => {
    const blocked = createInitialState(4103);
    const [player, enemy] = placeShips(blocked, 1_000);
    addSmoke(blocked, 0, 500);
    expect(isLineObscuredBySmoke(blocked, player.position, enemy.position)).toBe(true);
    expect(observe(blocked, player.id).contacts.some(({ id }) => id === enemy.id)).toBe(false);
    expect(observe(blocked, enemy.id).contacts.some(({ id }) => id === player.id)).toBe(false);

    const close = createInitialState(4104);
    const [closePlayer] = placeShips(close, 500);
    addSmoke(close, 0, 250);
    expect(observe(close, closePlayer.id).contacts).toHaveLength(1);
  });

  it("reveals a ship firing its main gun inside smoke without seeing through a separate wall", () => {
    const exposed = createInitialState(4105);
    const [player, enemy] = placeShips(exposed, 1_000);
    addSmoke(exposed, enemy.position.x, enemy.position.z);
    enemy.lastMainGunFiredAt = exposed.time;
    expect(observe(exposed, player.id).contacts.map(({ id }) => id))
      .toContain(enemy.id);

    const walled = createInitialState(4106);
    const [walledPlayer, walledEnemy] = placeShips(walled, 1_000);
    addSmoke(walled, walledEnemy.position.x, walledEnemy.position.z);
    addSmoke(walled, 0, 500);
    walledEnemy.lastMainGunFiredAt = walled.time;
    expect(observe(walled, walledPlayer.id).contacts.some(({ id }) => id === walledEnemy.id)).toBe(false);
  });

  it("does not interfere with independent close-range torpedo warnings", () => {
    const state = createInitialState(4107);
    const [player, enemy] = placeShips(state, 1_000);
    addSmoke(state, 0, 250);
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: enemy.id,
      team: enemy.team,
      kind: "torpedo",
      position: { x: player.position.x + 400, y: 0, z: player.position.z },
      previousPosition: { x: player.position.x + 410, y: 0, z: player.position.z },
      velocity: { x: -TORPEDO.speedMetersPerSecond, y: 0, z: 0 },
      damage: TORPEDO.damage,
      age: 3,
      distanceTravelled: 300,
      armingDistance: TORPEDO.armingDistanceMeters,
      maximumRange: TORPEDO.maximumRangeMeters,
      detectionRange: TORPEDO.detectionRangeMeters,
    });
    expect(torpedoThreatsFor(state, player.id)).toHaveLength(1);
  });
});
