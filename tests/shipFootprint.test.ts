import { describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { terrainZoneContains, type AtollTerrainZone, type BattleMapDefinition } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import {
  constrainShipTerrainMotion, shipFootprintCorners, shipFootprintDimensions, shipTerrainFootprintContact,
  type ShipFootprintPose,
} from "../src/sim/shipFootprint";

const pose = (x = 0, z = 0, heading = 0): ShipFootprintPose => ({ position: { x, z }, heading });
const zone = (id = "island", x = 0, z = 0, radiusX = 2, radiusZ = radiusX): AtollTerrainZone => ({
  id, kind: "sandbar", x, z, radiusX, radiusZ, rotation: 0, radialProfile: [1, 1, 1, 1], heightMeters: 3,
});
const map = (zones: AtollTerrainZone[], halfExtentMeters = 1000): BattleMapDefinition => ({
  id: "atoll-prototype", name: "Geometry fixture", halfExtentMeters, terrain: zones,
});

describe("shared full ship terrain footprint", () => {
  for (const id of ["fletcher", "edinburgh", "yamato"] as const) it(id + " uses the established ship/ship OBB", () => {
    const hull = getShipClass(id), dimensions = shipFootprintDimensions(id);
    expect(dimensions).toEqual({ halfLength: hull.length * .48, halfBeam: hull.beam * .55 });
    const corners = shipFootprintCorners(id, pose(10, -30));
    expect(corners[0]).toEqual({ x: 10 + dimensions.halfBeam, z: -30 + dimensions.halfLength });
    expect(corners[2]).toEqual({ x: 10 - dimensions.halfBeam, z: -30 - dimensions.halfLength });
  });

  it("detects a long side crossing a cape although all four corners are clear", () => {
    const cape = zone("cape", 7.5, 0, 2, 8), ship = pose();
    expect(shipFootprintCorners("fletcher", ship).every(p => !terrainZoneContains(cape, p.x, p.z))).toBe(true);
    expect(shipTerrainFootprintContact(map([cape]), "fletcher", ship).zoneIds).toEqual(["cape"]);
  });

  it("detects a tiny island completely enclosed by the hull", () => {
    const tiny = zone("tiny", 0, 0, .1);
    expect(shipFootprintCorners("fletcher", pose()).every(p => !terrainZoneContains(tiny, p.x, p.z))).toBe(true);
    expect(shipTerrainFootprintContact(map([tiny]), "fletcher", pose()).blocked).toBe(true);
  });

  it("covers the sub-metre analytic-normalization counterexample", () => {
    const tiny = zone("sub-metre-corner", 0, 0, .1), dimensions = shipFootprintDimensions("fletcher");
    const ship = pose(dimensions.halfBeam + .08, dimensions.halfLength + .08);
    const corner = shipFootprintCorners("fletcher", ship)[2]!;
    expect(corner.x).toBeCloseTo(.08, 12); expect(corner.z).toBeCloseTo(.08, 12);
    expect(terrainZoneContains(tiny, corner.x, corner.z)).toBe(true);
    expect(shipTerrainFootprintContact(map([tiny]), "fletcher", ship).zoneIds).toEqual([tiny.id]);
  });

  it("clamps only sub-metre contour axes while caching by the original zone", () => {
    const tiny = { ...zone("sub-metre-cache", 0, 0, .1, 2), rotation: .25 };
    const fixture = map([tiny]), spy = vi.spyOn(terrain, "terrainContour");
    try {
      shipTerrainFootprintContact(fixture, "fletcher", pose());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ ...tiny, radiusX: 1 });
      expect(tiny.radiusX).toBe(.1);
      shipTerrainFootprintContact(fixture, "fletcher", pose());
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });

  for (const radius of [1, 78, 370]) it("keeps radius >= 1 geometry unchanged: " + radius, () => {
    const original = { ...zone("unclamped-" + radius, 0, 0, radius, radius + 1), rotation: .3 };
    const spy = vi.spyOn(terrain, "terrainContour");
    try {
      shipTerrainFootprintContact(map([original]), "fletcher", pose());
      expect(spy).toHaveBeenCalledTimes(1);
      // Same object, segment count and underlying contour, not a normalized copy.
      expect(spy.mock.calls[0]![0]).toBe(original);
      const count = spy.mock.calls[0]![1];
      const actualPoints = spy.mock.results[0]!.value;
      expect(actualPoints).toEqual(terrain.terrainContour(original, count));
    } finally { spy.mockRestore(); }
  });

  it("detects a whole hull enclosed by an island without any edge crossings", () => {
    expect(shipTerrainFootprintContact(map([zone("large", 0, 0, 500)]), "fletcher", pose()).blocked).toBe(true);
  });

  it("matches the public draft threshold exactly and does not treat navigable shallow water as land", () => {
    const shallow = { ...zone(), kind: "shallow" as const, depthMeters: 5 };
    expect(shipTerrainFootprintContact(map([shallow]), "fletcher", pose()).blocked).toBe(true);
    expect(shipTerrainFootprintContact(map([{ ...shallow, depthMeters: 5.00001 }]), "fletcher", pose()).blocked).toBe(false);
    expect(shipTerrainFootprintContact(map([{ ...shallow, depthMeters: 9 }]), "edinburgh", pose()).blocked).toBe(false);
    expect(shipTerrainFootprintContact(map([{ ...shallow, depthMeters: 9 }]), "yamato", pose()).blocked).toBe(true);
  });

  it("applies map bounds to every corner rather than only the center", () => {
    const result = shipTerrainFootprintContact(map([]), "fletcher", pose(995, 0));
    expect(result).toEqual({ blocked: true, boundary: true, zoneIds: [] });
  });

  it("detects the recorded Edinburgh bow overlap while the center is deep", () => {
    const ship = pose(-386.9450957814751, 661.8687444940321, 5.278345662234082);
    expect(terrain.terrainNavigationAt("atoll-prototype", ship.position.x, ship.position.z, 6.5).kind).toBe("deep");
    expect(shipTerrainFootprintContact("atoll-prototype", "edinburgh", ship).zoneIds).toContain("central-shoal-nw");
  });

  it("catches a thin obstacle crossed between two clear translation endpoints", () => {
    const fixture = map([zone("thin", 0, 0, .1)]), from = pose(-20), to = pose(20);
    expect(shipTerrainFootprintContact(fixture, "fletcher", from).blocked).toBe(false);
    expect(shipTerrainFootprintContact(fixture, "fletcher", to).blocked).toBe(false);
    const result = constrainShipTerrainMotion(fixture, "fletcher", from, to);
    expect(result.blocked).toBe(true); expect(result.fraction).toBeGreaterThan(0); expect(result.fraction).toBeLessThan(.5);
    expect(result.blockingContact?.zoneIds).toEqual(["thin"]);
    expect(result.contact.blocked).toBe(false);
  });

  it("checks intermediate yaw when identical endpoint footprints are clear", () => {
    const fixture = map([zone("rotation", 15, 0)]), from = pose(), to = pose(0, 0, Math.PI);
    expect(shipTerrainFootprintContact(fixture, "fletcher", from).blocked).toBe(false);
    expect(shipTerrainFootprintContact(fixture, "fletcher", to).blocked).toBe(false);
    const result = constrainShipTerrainMotion(fixture, "fletcher", from, to);
    expect(result.blocked).toBe(true); expect(result.heading).toBeGreaterThan(0); expect(result.heading).toBeLessThan(Math.PI / 2);
    expect(result.position).toEqual(from.position); expect(result.blockingContact?.zoneIds).toContain("rotation");
  });

  it("does not shortcut an unwrapped full rotation", () => {
    const result = constrainShipTerrainMotion(map([zone("rotation", 15, 0)]), "fletcher", pose(), pose(0, 0, Math.PI * 2));
    expect(result.blocked).toBe(true); expect(result.heading).toBeGreaterThan(0); expect(result.heading).toBeLessThan(Math.PI / 2);
  });

  it("guards the corner arc at a map boundary even when both endpoint OBBs fit", () => {
    const fixture = map([]), from = pose(950), to = pose(950, 0, Math.PI);
    expect(shipTerrainFootprintContact(fixture, "fletcher", from).blocked).toBe(false);
    expect(shipTerrainFootprintContact(fixture, "fletcher", to).blocked).toBe(false);
    const result = constrainShipTerrainMotion(fixture, "fletcher", from, to);
    expect(result.blocked).toBe(true); expect(result.blockingContact?.boundary).toBe(true);
    expect(result.contact.blocked).toBe(false);
  });

  it("stops at the last certified pose on budget exhaustion instead of skipping the rest", () => {
    const fixture = map([zone("distant", 80, 0)]);
    const result = constrainShipTerrainMotion(fixture, "fletcher", pose(-200), pose(200));
    expect(result.blocked).toBe(true); expect(result.budgetExhausted).toBe(true);
    expect(result.fraction).toBe(.16); expect(result.position.x).toBe(-136);
    expect(result.contact.blocked).toBe(false);
  });

  it("leaves long open-water motion exactly unchanged and does not mutate inputs", () => {
    const from = pose(-100), to = pose(100, 0, 2.3), before = structuredClone({ from, to });
    const result = constrainShipTerrainMotion("open-sea-range", "edinburgh", from, to);
    expect(result).toMatchObject({ fraction: 1, position: to.position, heading: to.heading, blocked: false, budgetExhausted: false });
    expect({ from, to }).toEqual(before);
  });

  it("caches shore contours and reuses them for later open-water queries", () => {
    const fixture = map([zone("cached", 0, 0)]);
    const spy = vi.spyOn(terrain, "terrainContour");
    try {
      constrainShipTerrainMotion(fixture, "fletcher", pose(-500), pose(-499));
      expect(spy).toHaveBeenCalledTimes(1); spy.mockClear();
      for (let i = 0; i < 20; i++) constrainShipTerrainMotion(fixture, "fletcher", pose(-500 + i), pose(-499 + i));
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it("permits strictly outward translation from existing overlap without claiming it is already clear", () => {
    const fixture = map([zone("shore", 0, 100, 50)]);
    const result = constrainShipTerrainMotion(fixture, "fletcher", pose(), pose(0, -1));
    expect(result).toMatchObject({ fraction: 1, blocked: false, startedOverlapping: true, exiting: true });
    expect(result.contact.blocked).toBe(true);
    let current = pose();
    for (let i = 0; i < 20; i++) {
      const next = constrainShipTerrainMotion(fixture, "fletcher", current, pose(0, current.position.z - 1));
      expect(next.blocked).toBe(false); current = next;
    }
    expect(shipTerrainFootprintContact(fixture, "fletcher", current).blocked).toBe(false);
  });

  it("separately certifies an outward translation when conservative yaw coverage rejects the combined step", () => {
    const fixture = map([zone("shore", 0, 100, 50)]);
    const result = constrainShipTerrainMotion(fixture, "fletcher", pose(), pose(0, -.1, .001));
    expect(result).toMatchObject({ fraction: 1, blocked: false, startedOverlapping: true,
      exiting: true, rotationBlocked: true, heading: 0, position: { x: 0, z: -.1 } });
    expect(result.contact.blocked).toBe(true);
  });

  it("does not use yaw rejection to permit an inward translation", () => {
    const result = constrainShipTerrainMotion(map([zone("shore", 0, 100, 50)]), "fletcher", pose(), pose(0, .1, .001));
    expect(result.blocked).toBe(true); expect(result.rotationBlocked).toBeUndefined(); expect(result.position).toEqual({ x: 0, z: 0 });
  });

  it("allows the recorded cruiser's outward astern displacement without accepting its obstructed yaw", () => {
    const from = pose(-318.6476055929521, 997.4352530646455, -.9646578189762068);
    const to = pose(from.position.x - Math.sin(from.heading) * .01,
      from.position.z - Math.cos(from.heading) * .01, from.heading + .0001);
    const result = constrainShipTerrainMotion("atoll-prototype", "cleveland", from, to);
    expect(result).toMatchObject({ fraction: 1, blocked: false, startedOverlapping: true, exiting: true, rotationBlocked: true });
    expect(result.heading).toBe(from.heading); expect(result.position).toEqual(to.position);
  });

  it("rejects deepening an old overlap", () => {
    const result = constrainShipTerrainMotion(map([zone("shore", 0, 100, 50)]), "fletcher", pose(), pose(0, 1));
    expect(result).toMatchObject({ fraction: 0, blocked: true, startedOverlapping: true, exiting: false });
    expect(result.position).toEqual({ x: 0, z: 0 });
  });

  it("does not trade improvement at the bow for deeper overlap at the stern", () => {
    const fixture = map([zone("bow", 0, 100, 50), zone("stern", 0, -100, 50)]);
    const result = constrainShipTerrainMotion(fixture, "fletcher", pose(), pose(0, -1));
    expect(result).toMatchObject({ fraction: 0, blocked: true, startedOverlapping: true });
  });

  it("cannot exit one old zone by entering a previously untouched second zone", () => {
    const fixture = map([zone("bow", 0, 100, 50), zone("stern", 0, -112, 50)]);
    const result = constrainShipTerrainMotion(fixture, "fletcher", pose(), pose(0, -10));
    expect(result.startedOverlapping).toBe(true); expect(result.exiting).toBe(true); expect(result.blocked).toBe(true);
    expect(result.blockingContact?.zoneIds).toContain("stern"); expect(result.contact.zoneIds).not.toContain("stern");
  });

  it("permits full-body movement back into map bounds but rejects worsening it", () => {
    const fixture = map([]), from = pose(995);
    const outward = constrainShipTerrainMotion(fixture, "fletcher", from, pose(994));
    expect(outward).toMatchObject({ fraction: 1, blocked: false, startedOverlapping: true, exiting: true });
    expect(constrainShipTerrainMotion(fixture, "fletcher", from, pose(996))).toMatchObject({ fraction: 0, blocked: true });
  });

  it("reports an unchanged legacy overlap without pretending a motion was blocked", () => {
    const fixture = map([zone("shore", 0, 100, 50)]);
    const result = constrainShipTerrainMotion(fixture, "fletcher", pose(), pose());
    expect(result).toMatchObject({ fraction: 1, blocked: false, startedOverlapping: true, exiting: false, contact: { blocked: true } });
  });
});
