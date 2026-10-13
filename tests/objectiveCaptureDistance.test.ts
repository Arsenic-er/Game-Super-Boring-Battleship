import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import {
  ObjectiveCaptureNavigator, clearObjectiveCaptureGraphCache, type CaptureNavigationShip,
} from "../src/controllers/objectiveCaptureNavigation";
import type { Vec3 } from "../src/sim/types";

const mapId = "atoll-prototype" as const;
const objective = { center: { x: 90, y: 0, z: 175 }, radius: 450 };
const station = (index: 0 | 1): Vec3 => ({ x: index ? 225 : -45, y: 0, z: 175 });
const ship = (x = 3000, z = 2200, shipClassId: CaptureNavigationShip["shipClassId"] = "fletcher"): CaptureNavigationShip =>
  ({ shipClassId, position: { x, y: 0, z }, heading: Math.atan2(-x, 175 - z) });
const dist = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => Math.hypot(a.x - b.x, a.z - b.z);
beforeEach(() => clearObjectiveCaptureGraphCache());
afterEach(() => vi.restoreAllMocks());

describe("capture route distance estimates", () => {
  it.each([0, 1] as const)("returns the full direct route to station %s in open water", index => {
    const own = ship();
    const navigator = new ObjectiveCaptureNavigator();
    expect(navigator.remainingDistanceMeters("open-sea-range", own, objective, index, 0))
      .toBeCloseTo(dist(own.position, station(index)), 8);
    expect(navigator.plan("open-sea-range", own, objective, index, 0)).toEqual({
      mode: "direct", point: station(index), arrivalRadiusMeters: 95,
    });
  });

  it("adds all verified detour legs on the real concave atoll, not only the next waypoint", () => {
    const own = ship();
    const navigator = new ObjectiveCaptureNavigator();
    const first = navigator.plan(mapId, own, objective, 0, 0);
    expect(first.mode).toBe("waypoint");
    const initial = navigator.remainingDistanceMeters(mapId, own, objective, 0, 0);
    expect(initial).toBeGreaterThan(dist(own.position, station(0)) + 50);
    expect(initial).toBeGreaterThan(dist(own.position, first.point!) + 500);
    let total = 0, time = 0, plan = first, hops = 0;
    while (plan.mode !== "in-zone" && hops++ < 12) {
      expect(plan.point).toBeDefined();
      total += dist(own.position, plan.point!);
      Object.assign(own.position, plan.point!);
      plan = navigator.plan(mapId, own, objective, 0, time += .1);
    }
    expect(plan.mode).toBe("in-zone");
    expect(total).toBeCloseTo(initial, 8);
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, time)).toBe(0);
  });

  it("updates remaining distance as the hull progresses along its cached leg without new terrain scans", () => {
    const own = ship();
    const navigator = new ObjectiveCaptureNavigator();
    const first = navigator.plan(mapId, own, objective, 0, 0);
    const initial = navigator.remainingDistanceMeters(mapId, own, objective, 0, 0);
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const direction = { x: first.point!.x - own.position.x, z: first.point!.z - own.position.z };
    const length = Math.hypot(direction.x, direction.z);
    Object.assign(own.position, { x: own.position.x + direction.x / length * 25, z: own.position.z + direction.z / length * 25 });
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, .5)).toBeCloseTo(initial - 25, 8);
    expect(hazard).not.toHaveBeenCalled();
  });

  it("counts real detour progress even while moving farther from the objective centre", () => {
    const own = ship(-2450, -2400), navigator = new ObjectiveCaptureNavigator();
    const plan = navigator.plan(mapId, own, objective, 0, 0);
    expect(plan.mode).toBe("waypoint");
    const length = dist(own.position, plan.point!);
    const moved = { ...own, position: {
      x: own.position.x + (plan.point!.x - own.position.x) / length * 25, y: 0,
      z: own.position.z + (plan.point!.z - own.position.z) / length * 25,
    } };
    expect(dist(moved.position, objective.center)).toBeGreaterThan(dist(own.position, objective.center));
    const before = navigator.remainingDistanceMeters(mapId, own, objective, 0, 0);
    const after = navigator.remainingDistanceMeters(mapId, moved, objective, 0, .5);
    expect(after).toBeCloseTo(before - 25, 8);
  });

  it("reports an in-zone hull as already contributing without reading propulsion or enemy state", () => {
    const own = Object.freeze({ ...ship(90, 175), get modules(): never { throw new Error("do not read propulsion"); } });
    const publicObjective = Object.freeze({ ...objective, get occupants(): never { throw new Error("no hidden occupants"); } });
    expect(new ObjectiveCaptureNavigator().remainingDistanceMeters(mapId, own, publicObjective, 0, 0)).toBe(0);
  });

  it("does not report stale cached distance outside its verified corridor", () => {
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, 0))).toBe(true);
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    own.position.x += 200;
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, 1)).toBe(Infinity);
    expect(hazard).not.toHaveBeenCalled();
    expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, 2))).toBe(true);
    expect(hazard).toHaveBeenCalled();
  });

  it("reports unavailable rather than a straight-line fallback from grounded positions", () => {
    const own = ship(1680, 1790);
    expect(new ObjectiveCaptureNavigator().remainingDistanceMeters(mapId, own, objective, 0, 0)).toBe(Infinity);
  });

  it.each([NaN, Infinity, -1])("does not retain a route after invalid time %s", time => {
    const navigator = new ObjectiveCaptureNavigator(), own = ship();
    navigator.remainingDistanceMeters(mapId, own, objective, 0, 0);
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, time)).toBe(Infinity);
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, .2))).toBe(true);
    expect(hazard).toHaveBeenCalled();
  });

  it("rejects malformed positions, headings, objectives and station indices", () => {
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    expect(navigator.remainingDistanceMeters(mapId, { ...own, position: { ...own.position, x: NaN } }, objective, 0, 0)).toBe(Infinity);
    expect(navigator.remainingDistanceMeters(mapId, { ...own, heading: Infinity }, objective, 0, 0)).toBe(Infinity);
    expect(navigator.remainingDistanceMeters(mapId, own, { ...objective, center: { ...objective.center, z: NaN } }, 0, 0)).toBe(Infinity);
    expect(navigator.remainingDistanceMeters(mapId, own, { ...objective, radius: 0 }, 0, 0)).toBe(Infinity);
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 2 as 0, 0)).toBe(Infinity);
  });
  it("keeps the two-second hard search cadence when distance is requested at 60 Hz", () => {
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const initial = navigator.remainingDistanceMeters(mapId, own, objective, 0, 0);
    const first = navigator.plan(mapId, own, objective, 0, 0);
    const count = hazard.mock.calls.length;
    const length = dist(own.position, first.point!);
    for (let frame = 1; frame < 120; frame++) {
      const travel = frame * .01;
      const moving = { ...own, heading: own.heading + frame * .001, position: {
        x: own.position.x + (first.point!.x - own.position.x) / length * travel, y: 0,
        z: own.position.z + (first.point!.z - own.position.z) / length * travel,
      } };
      expect(navigator.remainingDistanceMeters(mapId, moving, objective, 0, frame / 60)).toBeCloseTo(initial - travel, 8);
    }
    expect(hazard.mock.calls.length).toBe(count);
    navigator.remainingDistanceMeters(mapId, own, objective, 0, 2);
    expect(hazard.mock.calls.length).toBeGreaterThan(count);
    expect(hazard.mock.calls.length - count).toBeLessThanOrEqual(10);
  });

  it("invalidates a cached estimate immediately when the map or hull draft changes", () => {
    const own = ship(2500, 2500), heavy = { ...own, shipClassId: "yamato" as const };
    const navigator = new ObjectiveCaptureNavigator();
    expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, 0))).toBe(true);
    expect(navigator.remainingDistanceMeters(mapId, heavy, objective, 0, .1)).toBe(Infinity);
    expect(navigator.remainingDistanceMeters("open-sea-range", heavy, objective, 0, .2))
      .toBeCloseTo(dist(heavy.position, station(0)), 8);
    expect(navigator.remainingDistanceMeters(mapId, heavy, objective, 0, .3)).toBe(Infinity);
    expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, .4))).toBe(true);
  });

  it("invalidates cached estimates on same-map geometry edits but not display-name changes", () => {
    const map = terrain.ATOLL_MAP;
    const original = map.terrain, name = map.name;
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    try {
      expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, 0))).toBe(true);
      const count = hazard.mock.calls.length;
      map.name = "display name only";
      navigator.remainingDistanceMeters(mapId, own, objective, 0, .1);
      expect(hazard.mock.calls.length).toBe(count);
      map.terrain = [...original, { id: "distance-test-blocker", kind: "mountain", x: own.position.x,
        z: own.position.z, radiusX: 200, radiusZ: 200, rotation: 0, heightMeters: 100,
        radialProfile: [1, 1, 1, 1] }];
      expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, .2)).toBe(Infinity);
      map.terrain = original;
      expect(Number.isFinite(navigator.remainingDistanceMeters(mapId, own, objective, 0, .3))).toBe(true);
    } finally {
      map.terrain = original;
      map.name = name;
    }
  });

  it("does not reuse the old objective or station endpoint", () => {
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    const first = navigator.remainingDistanceMeters("open-sea-range", own, objective, 0, 0);
    const changed = navigator.remainingDistanceMeters("open-sea-range", own, objective, 1, .1);
    expect(changed).toBeCloseTo(dist(own.position, station(1)), 8);
    expect(changed).not.toBe(first);
    const movedObjective = { ...objective, center: { x: -900, y: 0, z: 1800 } };
    expect(navigator.remainingDistanceMeters("open-sea-range", own, movedObjective, 0, .2))
      .toBeCloseTo(dist(own.position, { x: -1035, y: 0, z: 1800 }), 8);
  });

  it("revalidates after explicit reset or a backwards clock", () => {
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    const initial = navigator.remainingDistanceMeters(mapId, own, objective, 0, 10);
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, 0)).toBe(initial);
    expect(hazard).toHaveBeenCalled();
    hazard.mockClear();
    navigator.reset();
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, .1)).toBe(initial);
    expect(hazard).toHaveBeenCalled();
  });

  it("safely resumes a non-blocked cached route after a temporary off-corridor estimate", () => {
    const own = ship(), navigator = new ObjectiveCaptureNavigator();
    const initial = navigator.remainingDistanceMeters(mapId, own, objective, 0, 0);
    const offCourse = { ...own, position: { ...own.position, x: own.position.x + 200 } };
    expect(navigator.remainingDistanceMeters(mapId, offCourse, objective, 0, .5)).toBe(Infinity);
    expect(navigator.remainingDistanceMeters(mapId, own, objective, 0, 1)).toBe(initial);
  });

});
