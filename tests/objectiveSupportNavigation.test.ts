import { afterEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import {
  ObjectiveSupportNavigator, SUPPORT_NAVIGATION,
  type ObjectiveSupportPlan, type SupportNavigationShip,
} from "../src/controllers/objectiveSupportNavigation";
import type { Vec3 } from "../src/sim/types";

const mapId = "atoll-prototype" as const;
const objective = { center: { x: 90, y: 0, z: 175 }, radius: 450 };
const ship = (shipClassId: ShipClassId = "bismarck", x = 90, z = -1800): SupportNavigationShip =>
  ({ shipClassId, position: { x, y: 0, z }, heading: 0 });
const radial = (own: SupportNavigationShip, radius: number): Vec3 => {
  const bearing = Math.atan2(own.position.x - objective.center.x, own.position.z - objective.center.z);
  return { x: objective.center.x + Math.sin(bearing) * radius, y: own.position.y,
    z: objective.center.z + Math.cos(bearing) * radius };
};
function safePlan(own: SupportNavigationShip, plan: ObjectiveSupportPlan): void {
  expect(plan.point).toBeDefined();
  const point = plan.point!;
  const hull = getShipClass(own.shipClassId);
  const draft = terrain.shipDraftMeters(own.shipClassId) + SUPPORT_NAVIGATION.underKeelReserveMeters;
  const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
  const stoppingMargin = plan.arrivalRadiusMeters + hull.length * .5;
  expect(Math.hypot(point.x - objective.center.x, point.z - objective.center.z))
    .toBeGreaterThanOrEqual(objective.radius + stoppingMargin);
  expect(terrain.terrainNavigationAt(mapId, point.x, point.z, draft).kind).not.toBe("grounded");
  expect(terrain.firstNavigationHazard(mapId, point, point, draft, stoppingMargin)).toBeUndefined();
  const dx = point.x - own.position.x, dz = point.z - own.position.z;
  const distance = Math.hypot(dx, dz);
  const heading = distance > 1 ? Math.atan2(dx, dz) : own.heading;
  const end = { x: point.x + Math.sin(heading) * stoppingMargin, y: point.y,
    z: point.z + Math.cos(heading) * stoppingMargin };
  expect(terrain.firstNavigationHazard(mapId, own.position, end, draft, padding)).toBeUndefined();
  for (let index = 0; index <= 40; ++index) {
    const x = own.position.x + (end.x - own.position.x) * index / 40;
    const z = own.position.z + (end.z - own.position.z) * index / 40;
    expect(terrain.terrainNavigationAt(mapId, x, z, draft).kind).not.toBe("grounded");
  }
}
afterEach(() => vi.restoreAllMocks());

describe("bounded navigable objective support stations", () => {
  it.each(terrain.ATOLL_TERRAIN_ZONES.filter(zone => zone.kind === "mountain").map(zone => [zone.id, zone] as const))(
    "replaces the proven battleship land station toward %s",
    (_id, zone) => {
      const dx = zone.x - objective.center.x, dz = zone.z - objective.center.z;
      const length = Math.hypot(dx, dz);
      const own = ship("bismarck", objective.center.x + dx / length * 700,
        objective.center.z + dz / length * 700);
      const oldPoint = radial(own, 2372.5);
      expect(terrain.terrainNavigationAt(mapId, oldPoint.x, oldPoint.z,
        terrain.shipDraftMeters("bismarck")).kind).toBe("grounded");
      const plan = new ObjectiveSupportNavigator().plan(mapId, own, objective, 2372.5, 0);
      expect(plan.mode).toBe("alternative");
      expect(plan.point).not.toEqual(oldPoint);
      safePlan(own, plan);
    },
  );

  it.each([["fletcher", 1072.5], ["cleveland", 1722.5], ["bismarck", 2372.5]] as const)(
    "%s validates approach, under-keel clearance and the complete stopping band",
    (shipClassId, radius) => {
      const own = ship(shipClassId);
      const plan = new ObjectiveSupportNavigator().plan(mapId, own, objective, radius, 0);
      expect(["radial", "alternative"]).toContain(plan.mode);
      safePlan(own, plan);
    },
  );

  it("finds a reachable replacement from the recorded late-battle battleship position", () => {
    const own = ship("bismarck", -1241.94, 2430.17);
    const plan = new ObjectiveSupportNavigator().plan(mapId, own, objective, 2372.5, 900);
    expect(plan.mode).toBe("alternative");
    safePlan(own, plan);
  });

  it("preserves safe open-sea radial points without any terrain sweeps", () => {
    const navigation = vi.spyOn(terrain, "terrainNavigationAt");
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    for (const [classId, radius] of [["fletcher", 1072.5], ["cleveland", 1722.5], ["bismarck", 2372.5]] as const) {
      const own = ship(classId, -1500, -1800);
      const plan = new ObjectiveSupportNavigator().plan("open-sea-range", own, objective, radius, 0);
      expect(plan.mode).toBe("radial");
      expect(plan.point!.x).toBeCloseTo(radial(own, radius).x, 10);
      expect(plan.point!.z).toBeCloseTo(radial(own, radius).z, 10);
    }
    expect(navigation).not.toHaveBeenCalled();
    expect(hazard).not.toHaveBeenCalled();
  });

  it("respects draft: a destroyer can leave shallow water that cannot host a battleship", () => {
    const destroyer = ship("fletcher", -2500, 2500);
    const heavy = ship("yamato", -2500, 2500);
    const lightPlan = new ObjectiveSupportNavigator().plan(mapId, destroyer, objective, 2372.5, 0);
    expect(lightPlan.mode).toBe("alternative");
    safePlan(destroyer, lightPlan);
    const heavyPlan = new ObjectiveSupportNavigator().plan(mapId, heavy, objective, 2372.5, 0);
    expect(heavyPlan.mode).toBe("recovery");
    expect(heavyPlan.point).toBeUndefined();
  });

  it("does not accept a clear destination whose entire approach is blocked", () => {
    const own = ship();
    vi.spyOn(terrain, "terrainNavigationAt").mockReturnValue({ kind: "deep", depthMeters: 80, speedMultiplier: 1 });
    vi.spyOn(terrain, "firstNavigationHazard").mockImplementation((_map, from, to) =>
      Math.hypot(from.x - to.x, from.z - to.z) > 1 ? {
        zone: terrain.ATOLL_TERRAIN_ZONES[0]!, point: { x: 0, y: 0, z: 0 }, distanceFraction: .5, heightMeters: 0,
      } : undefined);
    const plan = new ObjectiveSupportNavigator().plan(mapId, own, objective, 2372.5, 0);
    expect(plan.mode).toBe("recovery");
    expect(plan.point).toBeUndefined();
  });

  it("holds safe water near the support ring when all bounded candidates are unavailable", () => {
    const own = ship("fletcher", 90, objective.center.z - 1172.5);
    const navigation = vi.spyOn(terrain, "terrainNavigationAt").mockImplementation((_map, x, z) =>
      x === own.position.x && z === own.position.z
        ? { kind: "deep", depthMeters: 80, speedMultiplier: 1 }
        : { kind: "grounded", depthMeters: 0, speedMultiplier: 0 });
    vi.spyOn(terrain, "firstNavigationHazard").mockReturnValue(undefined);
    const plan = new ObjectiveSupportNavigator().plan(mapId, own, objective, 1072.5, 0);
    expect(plan).toEqual({ mode: "hold", point: own.position, arrivalRadiusMeters: 220 });
    expect(plan.point).not.toBe(own.position);
    // At most 48 ring points, plus own initial and hold checks.
    expect(navigation.mock.calls.length).toBeLessThanOrEqual(SUPPORT_NAVIGATION.maximumCandidates + 2);
  });

  it("does not freeze a distant safe-water spawn when no direct support station is reachable", () => {
    const own = ship("yamato", 720, -4000);
    vi.spyOn(terrain, "terrainNavigationAt").mockImplementation((_map, x, z) =>
      x === own.position.x && z === own.position.z
        ? { kind: "deep", depthMeters: 80, speedMultiplier: 1 }
        : { kind: "grounded", depthMeters: 0, speedMultiplier: 0 });
    vi.spyOn(terrain, "firstNavigationHazard").mockReturnValue(undefined);
    const planner = new ObjectiveSupportNavigator();
    for (const time of [0, 2, 4, 30]) {
      const result = planner.plan(mapId, own, objective, 2372.5, time);
      expect(result.mode).toBe("recovery");
      expect(result.point).toBeUndefined();
    }
  });

  it("never fabricates a station for grounded ships or holds a failed exit inside the cap", () => {
    const grounded = ship("bismarck", 1680, 1790);
    const recovery = new ObjectiveSupportNavigator().plan(mapId, grounded, objective, 2372.5, 0);
    expect(recovery.mode).toBe("recovery");
    expect(recovery.point).toBeUndefined();

    const inside = ship("fletcher", objective.center.x, objective.center.z);
    vi.spyOn(terrain, "terrainNavigationAt").mockImplementation((_map, x, z) =>
      x === inside.position.x && z === inside.position.z
        ? { kind: "deep", depthMeters: 80, speedMultiplier: 1 }
        : { kind: "grounded", depthMeters: 0, speedMultiplier: 0 });
    vi.spyOn(terrain, "firstNavigationHazard").mockReturnValue(undefined);
    expect(new ObjectiveSupportNavigator().plan(mapId, inside, objective, 1072.5, 0).mode).toBe("recovery");
  });

  it("caches without per-frame terrain work and safely defers an invalidated route", () => {
    const own = ship();
    const navigation = vi.spyOn(terrain, "firstNavigationHazard");
    const planner = new ObjectiveSupportNavigator();
    const first = planner.plan(mapId, own, objective, 2372.5, 10);
    expect(first.mode).toBe("radial");
    const calls = navigation.mock.calls.length;
    for (const time of [10, 10.1, 10.5, 11, 11.99]) {
      expect(planner.plan(mapId, own, objective, 2372.5, time)).toEqual(first);
    }
    const moved = { ...own, position: { ...own.position, z: own.position.z + 40 } };
    expect(planner.plan(mapId, moved, objective, 2372.5, 11.99)).toEqual(first);
    expect(navigation.mock.calls.length).toBe(calls);
    planner.plan(mapId, own, objective, 2372.5, 12);
    expect(navigation.mock.calls.length).toBeGreaterThan(calls);
    const afterTime = navigation.mock.calls.length;
    const movedFar = { ...own, position: { ...own.position, z: own.position.z + 41 } };
    expect(planner.plan(mapId, movedFar, objective, 2372.5, 12.01).mode).toBe("recovery");
    expect(navigation.mock.calls.length).toBe(afterTime);
    planner.plan(mapId, movedFar, objective, 2372.5, 14);
    expect(navigation.mock.calls.length).toBeGreaterThan(afterTime);
  });

  it("shortens coastal reuse instead of dropping a clear but narrow approach", () => {
    const own = ship("bismarck", -1241.94, 2430.17);
    const navigation = vi.spyOn(terrain, "firstNavigationHazard");
    const planner = new ObjectiveSupportNavigator();
    const first = planner.plan(mapId, own, objective, 2372.5, 0);
    expect(first.mode).toBe("alternative");
    const calls = navigation.mock.calls.length;
    expect(planner.plan(mapId, { ...own, position: { ...own.position, x: own.position.x + 10 } },
      objective, 2372.5, .1)).toEqual(first);
    expect(navigation.mock.calls.length).toBe(calls);
    const moved = { ...own, position: { ...own.position, x: own.position.x + 21 } };
    expect(planner.plan(mapId, moved, objective, 2372.5, .2).mode).toBe("recovery");
    expect(navigation.mock.calls.length).toBe(calls);
    planner.plan(mapId, moved, objective, 2372.5, 2);
    expect(navigation.mock.calls.length).toBeGreaterThan(calls);
  });

  it("hard-throttles zero-margin coastal search during 60Hz movement and turns", () => {
    const own = ship();
    const hull = getShipClass(own.shipClassId);
    const basePadding = Math.max(hull.beam * .6 + 12, hull.length * .18);
    vi.spyOn(terrain, "terrainNavigationAt").mockReturnValue({ kind: "deep", depthMeters: 80, speedMultiplier: 1 });
    const navigation = vi.spyOn(terrain, "firstNavigationHazard").mockImplementation((_map, from, to, _draft, padding) =>
      Math.hypot(from.x - to.x, from.z - to.z) > 1 && padding > basePadding ? {
        zone: terrain.ATOLL_TERRAIN_ZONES[0]!, point: { x: 0, y: 0, z: 0 }, distanceFraction: .5, heightMeters: 0,
      } : undefined);
    const planner = new ObjectiveSupportNavigator();
    expect(planner.plan(mapId, own, objective, 2372.5, 0).mode).toBe("radial");
    const calls = navigation.mock.calls.length;
    for (let frame = 1; frame < 120; ++frame) {
      const moving = { ...own, heading: frame * .01,
        position: { ...own.position, x: own.position.x + frame * .01 } };
      const fallback = planner.plan(mapId, moving, objective, 2372.5, frame / 60);
      expect(fallback.mode).toBe("recovery");
      expect(fallback.point).toBeUndefined();
    }
    expect(navigation.mock.calls.length).toBe(calls);
    planner.plan(mapId, { ...own, heading: 1.2, position: { ...own.position, x: own.position.x + 1.2 } },
      objective, 2372.5, 2);
    expect(navigation.mock.calls.length).toBeGreaterThan(calls);
    expect(navigation.mock.calls.length).toBeLessThanOrEqual(calls * 2);
  });

  it("invalidates on map, hull, objective, radius, reset and backwards time", () => {
    const own = ship();
    const navigation = vi.spyOn(terrain, "firstNavigationHazard");
    const planner = new ObjectiveSupportNavigator();
    planner.plan(mapId, own, objective, 2372.5, 10);
    const changed = (run: () => void): void => {
      const before = navigation.mock.calls.length;
      run();
      expect(navigation.mock.calls.length).toBeGreaterThan(before);
    };
    changed(() => planner.plan(mapId, own, objective, 2372.5, 9));
    changed(() => planner.plan(mapId, own, { ...objective, radius: 460 }, 2372.5, 9.01));
    changed(() => planner.plan(mapId, ship("cleveland"), objective, 2372.5, 9.02));
    changed(() => planner.plan(mapId, own, objective, 2200, 9.03));
    const beforeTurn = navigation.mock.calls.length;
    planner.plan(mapId, { ...own, heading: Math.PI }, objective, 2200, 9.04);
    expect(navigation.mock.calls.length).toBe(beforeTurn);
    planner.plan("open-sea-range", own, objective, 2200, 9.05);
    changed(() => planner.plan(mapId, own, objective, 2200, 9.06));
    planner.reset();
    changed(() => planner.plan(mapId, own, objective, 2200, 9.07));
  });

  it("reuses a still-safe alternative on a planning refresh without another full search", () => {
    const own = ship("bismarck", -1241.94, 2430.17);
    const navigation = vi.spyOn(terrain, "firstNavigationHazard");
    const planner = new ObjectiveSupportNavigator();
    const first = planner.plan(mapId, own, objective, 2372.5, 0);
    expect(first.mode).toBe("alternative");
    navigation.mockClear();
    expect(planner.plan(mapId, own, objective, 2372.5, 2)).toEqual(first);
    // Own pose, rejected radial, stable station/runout/route: bounded fast refresh.
    expect(navigation.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("is deterministic, does not read hostile extensions, and returns defensive copies", () => {
    const own = ship();
    Object.defineProperty(own, "contacts", { get: () => { throw Error("hostile read"); } });
    Object.defineProperty(objective, "occupants", { get: () => { throw Error("hidden occupants"); }, configurable: true });
    Object.freeze(own.position);
    Object.freeze(own);
    const planner = new ObjectiveSupportNavigator();
    const first = planner.plan(mapId, own, objective, 2372.5, 0);
    expect(new ObjectiveSupportNavigator().plan(mapId, own, objective, 2372.5, 0)).toEqual(first);
    const expected = structuredClone(first);
    first.point!.x = 99999;
    first.mode = "recovery";
    expect(planner.plan(mapId, own, objective, 2372.5, .1)).toEqual(expected);
    delete (objective as typeof objective & { occupants?: unknown }).occupants;
  });

  it.each([NaN, Infinity, -Infinity])("rejects invalid inputs (%s) without retaining a stale plan", value => {
    const planner = new ObjectiveSupportNavigator();
    planner.plan(mapId, ship(), objective, 2372.5, 0);
    expect(planner.plan(mapId, ship(), objective, 2372.5, value).mode).toBe("recovery");
    expect(planner.plan(mapId, { ...ship(), heading: value }, objective, 2372.5, 1).mode).toBe("recovery");
    expect(planner.plan(mapId, ship(), objective, value, 1).point).toBeUndefined();
    expect(planner.plan(mapId, ship("bismarck", value, 0), objective, 2372.5, 1).point).toBeUndefined();
  });
});
