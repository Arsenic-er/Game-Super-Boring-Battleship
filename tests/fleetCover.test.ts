import { afterEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { getShipClass, SHIP_CLASSES, type ShipClassId } from "../src/ships/classes";
import { planFleetCover, type FleetCoverShip } from "../src/sim/fleetCover";
import type { Vec3 } from "../src/sim/types";

const mapId = "atoll-prototype" as const;
const enemy: Vec3 = { x: 0, y: 0, z: 3_000 };
const ship = (shipClassId: ShipClassId = "fletcher", x = -2_500, z = 2_500): FleetCoverShip =>
  ({ shipClassId, position: { x, y: 0, z }, heading: 0 });

const maximumEyeHeight = Math.max(...Object.values(SHIP_CLASSES).map((hull) => hull.deckHeight + 12));
const covered = (own: FleetCoverShip, point = own.position): boolean => terrain.terrainBlocksLineOfSight(
  mapId, enemy, point, maximumEyeHeight, getShipClass(own.shipClassId).deckHeight + 12,
);

afterEach(() => vi.restoreAllMocks());

describe("bounded observed-contact island cover", () => {
  it("finds nearby real atoll cover without inventing an island-center waypoint", () => {
    const own = ship();
    expect(covered(own)).toBe(false);
    const plan = planFleetCover(mapId, own, enemy)!;
    expect(plan).toBeDefined();
    expect(plan.distanceMeters).toBe(400);
    expect(plan.arrivalRadiusMeters).toBeGreaterThan(50);
    expect(covered(own, plan.point)).toBe(true);
    expect(terrain.terrainNavigationAt(mapId, plan.point.x, plan.point.z, 4.5).kind).not.toBe("grounded");
    expect(Math.atan2(plan.point.x - own.position.x, plan.point.z - own.position.z)).toBeCloseTo(plan.heading);
    expect(Math.hypot(plan.point.x - own.position.x, plan.point.z - own.position.z)).toBeCloseTo(plan.distanceMeters);
    expect(Math.hypot(plan.point.x - enemy.x, plan.point.z - enemy.z)).toBeGreaterThan(
      Math.hypot(own.position.x - enemy.x, own.position.z - enemy.z) - 150,
    );
  });

  it("rejects a destroyer's shallow cover route for a heavy hull without claiming false reachability", () => {
    const destroyer = ship();
    const heavy = ship("yamato");
    const short = planFleetCover(mapId, destroyer, enemy)!;
    expect(short).toBeDefined();
    const hull = getShipClass("yamato");
    const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
    const runout = Math.max(80, hull.length * .55) + hull.length * .5;
    const unsafeStop = { x: short.point.x + Math.sin(short.heading) * runout,
      y: 0, z: short.point.z + Math.cos(short.heading) * runout };
    const shallowHazard = terrain.firstNavigationHazard(mapId, heavy.position, unsafeStop,
      terrain.shipDraftMeters("yamato") + 1, padding);
    expect(shallowHazard?.zone.kind).toBe("shallow");
    expect(shallowHazard?.zone.depthMeters).toBeLessThan(terrain.shipDraftMeters("yamato"));
    // No direct safe route in the bounded search also provides cover from a 32 m observer.
    expect(planFleetCover(mapId, heavy, enemy)).toBeUndefined();
  });

  it.each(["fletcher", "cleveland", "yamato"] as const)(
    "%s keeps its whole straight route and post-waypoint stopping corridor navigable",
    (shipClassId) => {
      const own = ship(shipClassId, -3_000, -2_500);
      const plan = planFleetCover(mapId, own, enemy)!;
      expect(plan).toBeDefined();
      const hull = getShipClass(shipClassId);
      const draft = terrain.shipDraftMeters(shipClassId) + 1;
      const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
      const runout = plan.arrivalRadiusMeters + hull.length * .5;
      const end = { x: plan.point.x + Math.sin(plan.heading) * runout,
        y: 0, z: plan.point.z + Math.cos(plan.heading) * runout };
      expect(terrain.firstNavigationHazard(mapId, own.position, end, draft, padding)).toBeUndefined();
      for (let index = 0; index <= 100; ++index) {
        const x = own.position.x + (end.x - own.position.x) * index / 100;
        const z = own.position.z + (end.z - own.position.z) * index / 100;
        expect(terrain.terrainNavigationAt(mapId, x, z, draft).kind).not.toBe("grounded");
      }
      expect(covered(own, plan.point)).toBe(true);
    },
  );

  it("holds current cover rather than commanding continued travel through an island", () => {
    const own = ship("fletcher", -3_100, 1_900);
    expect(covered(own)).toBe(true);
    const plan = planFleetCover(mapId, own, enemy)!;
    expect(plan.distanceMeters).toBe(0);
    expect(plan.heading).toBe(own.heading);
    expect(plan.point).toEqual(own.position);
    expect(plan.point).not.toBe(own.position);
  });

  it("does not stop in false low-eye-height cover against a tall unidentified contact", () => {
    const own = ship("fletcher", -3_000, 2_000);
    expect(terrain.terrainBlocksLineOfSight(mapId, enemy, own.position)).toBe(true);
    expect(covered(own)).toBe(false);
    const plan = planFleetCover(mapId, own, enemy)!;
    expect(plan).toBeDefined();
    expect(plan.distanceMeters).toBeGreaterThan(0);
    expect(covered(own, plan.point)).toBe(true);
  });

  it("uses conservative eye heights for candidates as well as current-position cover", () => {
    const own = ship();
    const oldFalseCover = { x: -2_721.8800784900914, y: 0, z: 2_167.1798822648625 };
    expect(terrain.terrainBlocksLineOfSight(mapId, enemy, oldFalseCover)).toBe(true);
    expect(covered(own, oldFalseCover)).toBe(false);
    const sight = vi.spyOn(terrain, "terrainBlocksLineOfSight");
    const plan = planFleetCover(mapId, own, enemy)!;
    expect(plan).toBeDefined();
    expect(plan.point).not.toEqual(oldFalseCover);
    for (const call of sight.mock.calls) {
      expect(call[3]).toBe(maximumEyeHeight);
      expect(call[4]).toBe(getShipClass(own.shipClassId).deckHeight + 12);
    }
    expect(covered(own, plan.point)).toBe(true);
  });

  it("returns immediately on open sea without terrain sampling", () => {
    const sight = vi.spyOn(terrain, "terrainBlocksLineOfSight");
    const navigation = vi.spyOn(terrain, "firstNavigationHazard");
    expect(planFleetCover("open-sea-range", ship(), enemy)).toBeUndefined();
    expect(sight).not.toHaveBeenCalled();
    expect(navigation).not.toHaveBeenCalled();
  });

  it("does not claim remote or straight-line-unreachable cover when no local candidate is viable", () => {
    const own = ship("fletcher", 5_500, 5_500);
    const contact = { x: 5_000, y: 0, z: 5_500 };
    expect(terrain.terrainNavigationAt(mapId, own.position.x, own.position.z, 4.5).kind).toBe("deep");
    expect(terrain.terrainBlocksLineOfSight(mapId, contact, own.position)).toBe(false);
    expect(planFleetCover(mapId, own, contact)).toBeUndefined();
  });

  it("leaves grounded hull recovery to navigation instead of proposing a cross-island escape", () => {
    expect(planFleetCover(mapId, ship("fletcher", -1_680, 1_720), enemy)).toBeUndefined();
  });

  it("has a fixed candidate bound, deterministic results and no mutable input state", () => {
    const own = ship();
    Object.freeze(own.position);
    Object.freeze(own);
    const contact = Object.freeze({ ...enemy });
    const before = structuredClone({ own, contact });
    const sight = vi.spyOn(terrain, "terrainBlocksLineOfSight");
    const navigation = vi.spyOn(terrain, "firstNavigationHazard");
    const first = planFleetCover(mapId, own, contact);
    expect(sight.mock.calls.length).toBeLessThanOrEqual(65);
    expect(navigation.mock.calls.length).toBeLessThanOrEqual(65);
    expect(planFleetCover(mapId, own, contact)).toEqual(first);
    expect({ own, contact }).toEqual(before);
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite observed coordinates (%s)", (value) => {
    expect(planFleetCover(mapId, ship(), { ...enemy, x: value })).toBeUndefined();
    expect(planFleetCover(mapId, { ...ship(), heading: value }, enemy)).toBeUndefined();
  });

  it("declines coincident contacts and out-of-map hulls", () => {
    const own = ship();
    expect(planFleetCover(mapId, own, own.position)).toBeUndefined();
    expect(planFleetCover(mapId, ship("fletcher", 6_050, 0), enemy)).toBeUndefined();
  });
});
