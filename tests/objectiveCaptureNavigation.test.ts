import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import {
  CAPTURE_NAVIGATION, ObjectiveCaptureNavigator, clearObjectiveCaptureGraphCache,
  type CaptureNavigationShip,
} from "../src/controllers/objectiveCaptureNavigation";
import type { Vec3 } from "../src/sim/types";

const mapId = "atoll-prototype" as const;
const objective = { center: { x: 90, y: 0, z: 175 }, radius: 450 };
const goal = { x: -45, y: 0, z: 175 };
const ship = (shipClassId: ShipClassId = "fletcher", x = 3000, z = 2200): CaptureNavigationShip =>
  ({ shipClassId, position: { x, y: 0, z }, heading: Math.atan2(-1000, -1200) });
const dist = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => Math.hypot(a.x - b.x, a.z - b.z);
function routeIsSafe(own: CaptureNavigationShip, point: Readonly<Vec3>): void {
  const hull = getShipClass(own.shipClassId);
  const draft = terrain.shipDraftMeters(own.shipClassId) + CAPTURE_NAVIGATION.underKeelReserveMeters;
  const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
  expect(terrain.firstNavigationHazard(mapId, own.position, point, draft, padding)).toBeUndefined();
  const samples = Math.max(1, Math.ceil(dist(own.position, point) / 50));
  for (let index = 0; index <= samples; ++index) {
    expect(terrain.terrainNavigationAt(mapId,
      own.position.x + (point.x - own.position.x) * index / samples,
      own.position.z + (point.z - own.position.z) * index / samples, draft).kind).not.toBe("grounded");
  }
}
const blockedContact = (): terrain.TerrainContact => ({ zone: terrain.ATOLL_TERRAIN_ZONES[0]!,
  point: { x: 0, y: 0, z: 0 }, distanceFraction: .5, heightMeters: 0 });
const maximumColdHazardQueries = 2 + 4 + CAPTURE_NAVIGATION.maximumNodes + CAPTURE_NAVIGATION.maximumEdges
  + CAPTURE_NAVIGATION.maximumAttachmentsPerEnd * 5;

beforeEach(() => clearObjectiveCaptureGraphCache());
afterEach(() => vi.restoreAllMocks());

describe("bounded objective capture waypoint navigation", () => {
  it("does not invent a blocked route at the recorded destroyer stall", () => {
    const own = ship("fletcher", 1183.37, 1714.57);
    routeIsSafe(own, goal);
    const plan = new ObjectiveCaptureNavigator().plan(mapId, own, objective, 0, 900);
    expect(plan).toEqual({ mode: "direct", point: goal, arrivalRadiusMeters: 95 });
    // This same shallow start is not a legal battleship starting footprint.
    const heavy = ship("yamato", own.position.x, own.position.z);
    expect(terrain.terrainNavigationAt(mapId, heavy.position.x, heavy.position.z,
      terrain.shipDraftMeters(heavy.shipClassId) + 1).kind).toBe("grounded");
    expect(new ObjectiveCaptureNavigator().plan(mapId, heavy, objective, 0, 900).mode).toBe("recovery");
  });

  it.each(["fletcher", "cleveland", "yamato"] as const)(
    "%s can geometrically traverse real channels from both blocked island sides", classId => {
      for (const startX of [-3000, 3000]) {
        const own = ship(classId, startX, 2200);
        const hull = getShipClass(classId);
        expect(terrain.firstNavigationHazard(mapId, own.position, goal, terrain.shipDraftMeters(classId) + 1,
          Math.max(hull.beam * .6 + 12, hull.length * .18))).toBeDefined();
        const navigator = new ObjectiveCaptureNavigator();
        let plan = navigator.plan(mapId, own, objective, 0, 0);
        expect(plan.mode).toBe("waypoint");
        const route = new Set<string>();
        let step = 0;
        // Geometry-only traversal intentionally does not substitute for root's
        // LocalBattleSession regression of actual turning and ship motion.
        while (plan.mode !== "in-zone" && step < 300) {
          expect(plan.point).toBeDefined();
          const point = plan.point!;
          const key = point.x + ":" + point.z;
          if (!route.has(key)) { routeIsSafe(own, point); route.add(key); }
          const length = dist(own.position, point);
          const fraction = Math.min(25, length) / length;
          const next = { x: own.position.x + (point.x - own.position.x) * fraction, y: own.position.y,
            z: own.position.z + (point.z - own.position.z) * fraction };
          routeIsSafe(own, next);
          Object.assign(own.position, next);
          plan = navigator.plan(mapId, own, objective, 0, ++step / 3);
        }
        expect(plan.mode).toBe("in-zone");
        expect(dist(own.position, objective.center)).toBeLessThanOrEqual(objective.radius);
        expect(route.size).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it("uses different safe approaches for shallow and deep-draft hulls", () => {
    const light = ship("fletcher", 2500, 2500);
    const heavy = ship("yamato", 2500, 2500);
    const lightPlan = new ObjectiveCaptureNavigator().plan(mapId, light, objective, 0, 0);
    expect(lightPlan.mode).toBe("waypoint");
    routeIsSafe(light, lightPlan.point!);
    expect(new ObjectiveCaptureNavigator().plan(mapId, heavy, objective, 0, 0))
      .toEqual({ mode: "recovery", arrivalRadiusMeters: 95 });
  });

  it.each([0, 1] as const)("preserves station %s in open sea without terrain or graph work", station => {
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const navigation = vi.spyOn(terrain, "terrainNavigationAt");
    const own = ship("yamato", 3500, -2000);
    expect(new ObjectiveCaptureNavigator().plan("open-sea-range", own, objective, station, 0))
      .toEqual({ mode: "direct", point: { x: station ? 225 : -45, y: 0, z: 175 }, arrivalRadiusMeters: 95 });
    expect(hazard).not.toHaveBeenCalled();
    expect(navigation).not.toHaveBeenCalled();
  });

  it("does not send a ship already in the public capture disk around an island", () => {
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const own = ship("cleveland", 300, 175);
    expect(new ObjectiveCaptureNavigator().plan(mapId, own, objective, 1, 0))
      .toEqual({ mode: "in-zone", point: { x: 225, y: 0, z: 175 }, arrivalRadiusMeters: 95 });
    expect(hazard.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("has a hard cold-query budget and shares the static graph between capturers", () => {
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const navigation = vi.spyOn(terrain, "terrainNavigationAt");
    const own = ship();
    expect(new ObjectiveCaptureNavigator().plan(mapId, own, objective, 0, 0).mode).toBe("waypoint");
    const coldQueries = hazard.mock.calls.length;
    expect(coldQueries).toBeGreaterThan(100);
    expect(coldQueries).toBeLessThanOrEqual(maximumColdHazardQueries);
    expect(navigation.mock.calls.length).toBeLessThanOrEqual(CAPTURE_NAVIGATION.maximumNodes + 2);
    hazard.mockClear(); navigation.mockClear();
    expect(new ObjectiveCaptureNavigator().plan(mapId, ship("fletcher", -3000, 2200), objective, 0, 0).mode)
      .toBe("waypoint");
    expect(hazard.mock.calls.length).toBeLessThanOrEqual(2 + 4 + CAPTURE_NAVIGATION.maximumAttachmentsPerEnd * 5);
    expect(navigation.mock.calls.length).toBe(2);
  });

  it("does no terrain sweep on 60 Hz position and heading updates inside its corridor", () => {
    const own = ship();
    const navigator = new ObjectiveCaptureNavigator();
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const first = navigator.plan(mapId, own, objective, 0, 0);
    expect(first.mode).toBe("waypoint");
    const count = hazard.mock.calls.length;
    for (let frame = 1; frame < 120; ++frame) {
      const moving = { ...own, heading: own.heading + frame * .001,
        position: { ...own.position, x: own.position.x + frame * .01 } };
      expect(navigator.plan(mapId, moving, objective, 0, frame / 60)).toEqual(first);
    }
    expect(hazard.mock.calls.length).toBe(count);
    navigator.plan(mapId, own, objective, 0, 2);
    expect(hazard.mock.calls.length - count).toBeLessThanOrEqual(2 + 4 + 4);
  });

  it("advances a reached transit waypoint without searching or stopping on the node", () => {
    const own = ship();
    const navigator = new ObjectiveCaptureNavigator();
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const first = navigator.plan(mapId, own, objective, 0, 0);
    expect(first.mode).toBe("waypoint");
    const count = hazard.mock.calls.length;
    const length = dist(own.position, first.point!);
    const reached = { ...own, position: {
      x: first.point!.x + (own.position.x - first.point!.x) / length * (first.arrivalRadiusMeters - 5),
      y: 0,
      z: first.point!.z + (own.position.z - first.point!.z) / length * (first.arrivalRadiusMeters - 5),
    } };
    const next = navigator.plan(mapId, reached, objective, 0, 1);
    expect(next.point).toBeDefined();
    expect(next.point).not.toEqual(first.point);
    expect(hazard.mock.calls.length).toBe(count);
    routeIsSafe(reached, next.point!);
  });

  it("hands out-of-corridor movement to recovery until the planning deadline", () => {
    const own = ship();
    const navigator = new ObjectiveCaptureNavigator();
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    expect(navigator.plan(mapId, own, objective, 0, 0).mode).toBe("waypoint");
    const count = hazard.mock.calls.length;
    const moved = { ...own, position: { ...own.position, x: own.position.x + 200 } };
    expect(navigator.plan(mapId, moved, objective, 0, 1)).toEqual({ mode: "recovery", arrivalRadiusMeters: 95 });
    expect(hazard.mock.calls.length).toBe(count);
    const replanned = navigator.plan(mapId, moved, objective, 0, 2);
    expect(replanned.point).toBeDefined();
    routeIsSafe(moved, replanned.point!);
  });

  it("returns no invented waypoint when all bounded approaches are blocked, and throttles retries", () => {
    vi.spyOn(terrain, "terrainNavigationAt").mockReturnValue({ kind: "deep", depthMeters: 80, speedMultiplier: 1 });
    const hazard = vi.spyOn(terrain, "firstNavigationHazard").mockImplementation((_map, from, to) =>
      dist(from, to) > 1 ? blockedContact() : undefined);
    const navigator = new ObjectiveCaptureNavigator();
    const own = ship();
    expect(navigator.plan(mapId, own, objective, 0, 0)).toEqual({ mode: "recovery", arrivalRadiusMeters: 95 });
    const count = hazard.mock.calls.length;
    expect(count).toBeLessThanOrEqual(maximumColdHazardQueries);
    for (let frame = 1; frame < 120; ++frame) {
      own.position.x += .01;
      expect(navigator.plan(mapId, { ...own, heading: frame * .001 }, objective, 0, frame / 60).mode).toBe("recovery");
    }
    expect(hazard.mock.calls.length).toBe(count);
    expect(navigator.plan(mapId, own, objective, 0, 2).mode).toBe("recovery");
    expect(hazard.mock.calls.length - count).toBeLessThanOrEqual(2 + 4 + CAPTURE_NAVIGATION.maximumAttachmentsPerEnd * 5);
  });

  it("invalidates static routes when same-object geometry changes, but not when a map is renamed", () => {
    const map = structuredClone(terrain.battleMapDefinition(mapId));
    vi.spyOn(terrain, "battleMapDefinition").mockReturnValue(map);
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const navigator = new ObjectiveCaptureNavigator();
    const own = ship();
    expect(navigator.plan(mapId, own, objective, 0, 0).mode).toBe("waypoint");
    let count = hazard.mock.calls.length;
    map.name = "editor rename";
    navigator.plan(mapId, own, objective, 0, .1);
    expect(hazard.mock.calls.length).toBe(count);
    // Mutate the exact object: identity alone must not preserve its old graph.
    map.terrain[0]!.depthMeters = 8.9;
    navigator.plan(mapId, own, objective, 0, .2);
    expect(hazard.mock.calls.length - count).toBeGreaterThan(100);
    count = hazard.mock.calls.length;
    map.halfExtentMeters += 1;
    navigator.plan(mapId, own, objective, 0, .3);
    expect(hazard.mock.calls.length - count).toBeGreaterThan(100);
  });

  it("bounds shared graph memory using an LRU, without leaking across geometry revisions", () => {
    const original = terrain.battleMapDefinition(mapId);
    const maps = Array.from({ length: CAPTURE_NAVIGATION.maximumCachedGraphs + 1 }, (_, index) =>
      ({ ...original, halfExtentMeters: original.halfExtentMeters + index }));
    const map = vi.spyOn(terrain, "battleMapDefinition");
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    for (const definition of maps) {
      map.mockReturnValue(definition);
      expect(new ObjectiveCaptureNavigator().plan(mapId, ship(), objective, 0, 0).mode).toBe("waypoint");
    }
    hazard.mockClear();
    map.mockReturnValue(maps[1]!);
    new ObjectiveCaptureNavigator().plan(mapId, ship(), objective, 0, 0);
    expect(hazard.mock.calls.length).toBeLessThan(100);
    hazard.mockClear();
    map.mockReturnValue(maps[0]!);
    new ObjectiveCaptureNavigator().plan(mapId, ship(), objective, 0, 0);
    expect(hazard.mock.calls.length).toBeGreaterThan(100);
  });

  it("is deterministic, never reads hostile information, and does not expose mutable cache points", () => {
    const own = ship();
    const input = Object.freeze({ ...own, position: Object.freeze({ ...own.position }) });
    const publicObjective = Object.freeze({ ...objective, center: Object.freeze({ ...objective.center }),
      get occupants(): never { throw new Error("must not inspect occupant counts"); },
      get enemies(): never { throw new Error("must not inspect live enemy state"); } });
    const navigator = new ObjectiveCaptureNavigator();
    const first = navigator.plan(mapId, input, publicObjective, 0, 0);
    const second = new ObjectiveCaptureNavigator().plan(mapId, input, publicObjective, 0, 0);
    expect(second).toEqual(first);
    expect(first.point).not.toBe(second.point);
    first.point!.x += 4000;
    expect(navigator.plan(mapId, input, publicObjective, 0, .1)).toEqual(second);
  });

  it("resets local route state and does not reuse future-time state after a rewind", () => {
    const navigator = new ObjectiveCaptureNavigator();
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const own = ship();
    navigator.plan(mapId, own, objective, 0, 10);
    let count = hazard.mock.calls.length;
    navigator.plan(mapId, own, objective, 0, 0);
    expect(hazard.mock.calls.length).toBeGreaterThan(count);
    count = hazard.mock.calls.length;
    navigator.reset();
    navigator.plan(mapId, own, objective, 0, .1);
    expect(hazard.mock.calls.length).toBeGreaterThan(count);
  });

  it.each([NaN, Infinity, -1])("fails safely for invalid planning time %s", time => {
    const navigator = new ObjectiveCaptureNavigator();
    expect(navigator.plan(mapId, ship(), objective, 0, time))
      .toEqual({ mode: "recovery", arrivalRadiusMeters: 95 });
  });
});
