import { describe, expect, it } from "vitest";
import {
  ATOLL_MAP,
  firstTerrainIntersection,
  shipDraftMeters,
  terrainBlocksLineOfSight,
  terrainNavigationAt,
  terrainSafeHeading,
} from "../src/maps/atollMap";
import { BATTLE_SPAWN, FIXED_STEP, OBJECTIVE } from "../src/sim/config";
import {
  createInitialState,
  observe,
  stepSimulation,
} from "../src/sim/simulation";
import type { ControlCommand, ShipState } from "../src/sim/types";

const idle = (ship: Readonly<ShipState>): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { ...ship.aimPoint },
  fire: false,
});

describe("Dawn Atoll map definition", () => {
  it("keeps both deployments and the central objective in deep navigable water", () => {
    const points = [
      BATTLE_SPAWN.player,
      BATTLE_SPAWN.enemy,
      { x: OBJECTIVE.centerX, z: OBJECTIVE.centerZ },
    ];
    for (const point of points) {
      expect(terrainNavigationAt(
        ATOLL_MAP.id,
        point.x,
        point.z,
        shipDraftMeters("north-carolina"),
      ).kind).toBe("deep");
    }
  });

  it("makes the west reef passable for destroyers but grounds deeper cruisers", () => {
    const destroyer = terrainNavigationAt(
      ATOLL_MAP.id, -4_300, 0, shipDraftMeters("fletcher"),
    );
    const cruiser = terrainNavigationAt(
      ATOLL_MAP.id, -4_300, 0, shipDraftMeters("cleveland"),
    );
    expect(destroyer.kind).toBe("shallow");
    expect(destroyer.speedMultiplier).toBeLessThan(1);
    expect(cruiser.kind).toBe("grounded");
  });

  it("blocks low trajectories and optical lines while high shells clear the ridge", () => {
    const south = { x: -1_680, y: 18, z: 850 };
    const north = { x: -1_680, y: 18, z: 2_600 };
    expect(firstTerrainIntersection(ATOLL_MAP.id, south, north)?.zone.id)
      .toBe("mountain-nw");
    expect(firstTerrainIntersection(
      ATOLL_MAP.id,
      { ...south, y: 420 },
      { ...north, y: 420 },
    )).toBeUndefined();
    expect(terrainBlocksLineOfSight(ATOLL_MAP.id, south, north, 0, 0)).toBe(true);
  });

  it("steers AI away from a mountain directly ahead", () => {
    const safe = terrainSafeHeading(
      ATOLL_MAP.id,
      { x: -1_680, y: 0, z: 700 },
      0,
      "fletcher",
    );
    expect(Math.abs(safe)).toBeGreaterThan(0.2);
  });
});

describe("Dawn Atoll simulation integration", () => {
  it("uses the atoll for battle and preserves open water in sea trials", () => {
    expect(createInitialState(11, "battle").mapId).toBe("atoll-prototype");
    expect(createInitialState(11, "sea-trials").mapId).toBe("open-sea-range");
  });

  it("stops and damages a fast ship at the shoreline instead of tunnelling through it", () => {
    const state = createInitialState(12, "battle");
    const player = state.ships.find(({ id }) => id === "player")!;
    player.position = { x: -1_680, y: 0, z: 1_100 };
    player.previousPosition = { ...player.position };
    player.heading = 0;
    player.speedKnots = 78;
    const startingHull = player.hull;
    let grounded = false;
    for (let tick = 0; tick < 180 && !grounded; tick += 1) {
      stepSimulation(state, new Map([
        [player.id, { ...idle(player), throttle: 1 }],
      ]), FIXED_STEP);
      grounded = state.impacts.some(({ kind }) => kind === "terrain-hit");
    }
    expect(grounded).toBe(true);
    expect(player.position.z).toBeLessThan(1_170);
    expect(player.hull).toBeLessThan(startingHull);
    expect(player.navigationZone).toBe("grounded");
  });

  it("consumes a shell on the mountain before it can continue across the island", () => {
    const state = createInitialState(13, "battle");
    const player = state.ships.find(({ id }) => id === "player")!;
    state.projectiles.push({
      id: state.nextEntityId++,
      ownerId: player.id,
      team: player.team,
      kind: "shell",
      ammoType: "he",
      weaponSource: "mainGun",
      position: { x: -1_680, y: 30, z: 1_000 },
      previousPosition: { x: -1_680, y: 30, z: 1_000 },
      velocity: { x: 0, y: 0, z: 420 },
      damage: 100,
      age: 0,
    });
    let hitTerrain = false;
    for (let tick = 0; tick < 90 && !hitTerrain; tick += 1) {
      stepSimulation(state, new Map(state.ships.map((ship) => [
        ship.id,
        idle(ship),
      ])), FIXED_STEP);
      hitTerrain = state.impacts.some(({ kind, terrainId }) =>
        kind === "terrain-hit" && terrainId === "mountain-nw");
    }
    expect(hitTerrain).toBe(true);
    expect(state.projectiles).toHaveLength(0);
  });

  it("hides a ship behind a mountain from optical observation", () => {
    const state = createInitialState(14, "battle");
    const player = state.ships.find(({ id }) => id === "player")!;
    const enemy = state.ships.find(({ id }) => id === "enemy")!;
    player.position = { x: -1_680, y: 0, z: 850 };
    player.previousPosition = { ...player.position };
    enemy.position = { x: -1_680, y: 0, z: 2_600 };
    enemy.previousPosition = { ...enemy.position };
    state.time = 3;
    expect(observe(state, player.id).contacts).toHaveLength(0);
    state.mapId = "open-sea-range";
    state.sensorSnapshots = {};
    expect(observe(state, player.id).contacts).toHaveLength(1);
  });
});
