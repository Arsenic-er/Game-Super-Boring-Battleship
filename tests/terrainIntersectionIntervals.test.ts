import { afterEach, describe, expect, it } from "vitest";
import {
  ATOLL_MAP, firstNavigationHazard, firstTerrainIntersection, terrainBlocksLineOfSight,
  terrainHeightAt, terrainZoneContains, type AtollTerrainZone,
} from "../src/maps/atollMap";
import type { Vec3 } from "../src/sim/types";

const originalTerrain = ATOLL_MAP.terrain;
afterEach(() => { ATOLL_MAP.terrain = originalTerrain; });
const a: Vec3 = { x: 3035.1183128077537, y: 0, z: -1037.8978638909757 };
const b: Vec3 = { x: 1710.5826835613698, y: 0, z: 3293.8307989388704 };
const at = (p: Vec3, height: number): Vec3 => ({ ...p, y: height });
const point = (x: number, z: number, y = 0): Vec3 => ({ x, y, z });
const circle = (id: string, z = 0): AtollTerrainZone => ({
  id, kind: "mountain", x: 0, z, radiusX: 100, radiusZ: 100,
  rotation: 0, heightMeters: 100, radialProfile: [1, 1, 1, 1],
});

describe("terrain rays inspect all connected intervals of a concave island", () => {
  it.each([18, 20])("blocks the real northeast island in both directions at %s metres", height => {
    expect(terrainBlocksLineOfSight("atoll-prototype", a, b, height, height)).toBe(true);
    expect(terrainBlocksLineOfSight("atoll-prototype", b, a, height, height)).toBe(true);
    const hit = firstTerrainIntersection("atoll-prototype", at(a, height), at(b, height), ["mountain"]);
    expect(hit?.zone.id).toBe("mountain-ne");
    expect(hit!.distanceFraction).toBeGreaterThan(.649);
    expect(hit!.heightMeters + .5).toBeGreaterThanOrEqual(height);
  });

  it("demonstrates the low first lobe followed by a separate higher blocking lobe", () => {
    const zone = originalTerrain.find(zone => zone.id === "mountain-ne")!;
    const p = (t: number) => point(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    expect(terrainZoneContains(zone, p(.62).x, p(.62).z)).toBe(true);
    expect(terrainHeightAt("atoll-prototype", p(.62).x, p(.62).z)).toBeLessThan(17.5);
    expect(terrainZoneContains(zone, p(.647).x, p(.647).z)).toBe(false);
    expect(terrainZoneContains(zone, p(.72).x, p(.72).z)).toBe(true);
    expect(terrainHeightAt("atoll-prototype", p(.72).x, p(.72).z)).toBeGreaterThan(20);
    expect(firstTerrainIntersection("atoll-prototype", at(a, 20), at(b, 20))?.zone.id).toBe("mountain-ne");
  });

  it("preserves actual sloped ray heights instead of forcing both observer-height arrangements to match", () => {
    // Reversing endpoints WITH their heights preserves the same physical ray.
    // Exchanging only observer positions but retaining 18/70 does not.
    expect(terrainBlocksLineOfSight("atoll-prototype", a, b, 18, 70)).toBe(false);
    expect(terrainBlocksLineOfSight("atoll-prototype", b, a, 70, 18)).toBe(false);
    expect(terrainBlocksLineOfSight("atoll-prototype", a, b, 70, 18)).toBe(true);
    expect(terrainBlocksLineOfSight("atoll-prototype", b, a, 18, 70)).toBe(true);
  });

  it("retains the nearer low-lobe contact when the ray is low enough to hit it", () => {
    const hit = firstTerrainIntersection("atoll-prototype", at(a, 10), at(b, 10));
    expect(hit?.zone.id).toBe("mountain-ne");
    expect(hit!.distanceFraction).toBeGreaterThan(.579);
    expect(hit!.distanceFraction).toBeLessThan(.646);
    const nav = firstNavigationHazard("atoll-prototype", a, b, 4.5, 0);
    expect(nav?.zone.id).toBe("mountain-ne");
    expect(nav!.distanceFraction).toBeLessThan(hit!.distanceFraction);
  });

  it("does not fabricate a hit when the complete ray clears every lobe", () => {
    expect(firstTerrainIntersection("atoll-prototype", at(a, 80), at(b, 80))).toBeUndefined();
    expect(firstTerrainIntersection("atoll-prototype", at(b, 80), at(a, 80))).toBeUndefined();
  });
});

describe("interval traversal retains finite-ray and first-contact semantics", () => {
  it("returns the nearest island independent of terrain array order, in either direction", () => {
    const south = circle("south", -250), north = circle("north", 250);
    for (const terrain of [[south, north], [north, south]]) {
      ATOLL_MAP.terrain = terrain;
      expect(firstTerrainIntersection("atoll-prototype", point(0, -500), point(0, 500))?.zone.id).toBe("south");
      expect(firstTerrainIntersection("atoll-prototype", point(0, 500), point(0, -500))?.zone.id).toBe("north");
    }
  });

  it("respects kind filtering while visiting subsequent intervals", () => {
    expect(firstTerrainIntersection("atoll-prototype", at(a, 20), at(b, 20), ["sandbar"])).toBeUndefined();
  });

  it("handles starts and ends inside the island and points exactly on the coast", () => {
    ATOLL_MAP.terrain = [circle("circle")];
    expect(firstTerrainIntersection("atoll-prototype", point(0, 0), point(0, 300))?.distanceFraction).toBe(0);
    expect(firstTerrainIntersection("atoll-prototype", point(0, -300), point(0, 0))?.distanceFraction).toBeLessThan(1);
    expect(firstTerrainIntersection("atoll-prototype", point(100, 0), point(200, 0))?.distanceFraction).toBe(0);
    expect(firstTerrainIntersection("atoll-prototype", point(200, 0), point(100, 0))?.distanceFraction).toBe(1);
    expect(firstTerrainIntersection("atoll-prototype", point(200, 0), point(101, 0))).toBeUndefined();
  });

  it("handles zero-length rays both inside and outside without invented distant intersections", () => {
    ATOLL_MAP.terrain = [circle("circle")];
    expect(firstTerrainIntersection("atoll-prototype", point(0, 0), point(0, 0))?.distanceFraction).toBe(0);
    expect(firstTerrainIntersection("atoll-prototype", point(200, 0), point(200, 0))).toBeUndefined();
    expect(firstTerrainIntersection("atoll-prototype", point(0, 0, 1000), point(0, 0, 1000))).toBeUndefined();
  });

  it("handles a sampled tangent without turning an above-water or near-miss ray into a hit", () => {
    ATOLL_MAP.terrain = [circle("circle")];
    const low = firstTerrainIntersection("atoll-prototype", point(-200, 100), point(200, 100));
    expect(low?.distanceFraction).toBeCloseTo(.5, 6);
    expect(firstTerrainIntersection("atoll-prototype", point(-200, 100, 18), point(200, 100, 18))).toBeUndefined();
    expect(firstTerrainIntersection("atoll-prototype", point(-200, 100.1), point(200, 100.1))).toBeUndefined();
    expect(firstNavigationHazard("atoll-prototype", point(-200, 100), point(200, 100), 4.5, 0)?.distanceFraction).toBeCloseTo(.5, 6);
  });

  it("returns no intersection for the empty test map", () => {
    expect(firstTerrainIntersection("open-sea-range", a, b)).toBeUndefined();
  });
});
