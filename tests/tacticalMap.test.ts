import { describe, expect, it } from "vitest";
import {
  LARGE_MAP_MAX_HALF_EXTENT,
  LARGE_MAP_MIN_HALF_EXTENT,
  clampLargeMapView,
  largeMapScale,
  worldToHeadingUpMap,
  zoomLargeMapView,
} from "../src/ui/tacticalMap";

describe("heading-up tactical map projection", () => {
  it("places world north above a northbound player", () => {
    expect(worldToHeadingUpMap(0, 1_000, 0, 0.1, 100, 100)).toEqual({ x: 100, y: 0 });
  });

  it("places world north to the left of an eastbound player", () => {
    const point = worldToHeadingUpMap(0, 1_000, Math.PI / 2, 0.1, 100, 100);
    expect(point.x).toBeCloseTo(0, 8);
    expect(point.y).toBeCloseTo(100, 8);
  });
});

describe("large tactical map zoom", () => {
  it("clamps zoom and pan to the playable 12 km square", () => {
    expect(clampLargeMapView({ centerX: 9_000, centerZ: -9_000, halfExtent: 500 }))
      .toEqual({
        centerX: LARGE_MAP_MAX_HALF_EXTENT - LARGE_MAP_MIN_HALF_EXTENT,
        centerZ: -(LARGE_MAP_MAX_HALF_EXTENT - LARGE_MAP_MIN_HALF_EXTENT),
        halfExtent: LARGE_MAP_MIN_HALF_EXTENT,
      });
    expect(clampLargeMapView({ centerX: 200, centerZ: 300, halfExtent: 9_000 }))
      .toEqual({ centerX: 0, centerZ: 0, halfExtent: LARGE_MAP_MAX_HALF_EXTENT });
  });

  it("keeps the cursor's world point fixed while zooming", () => {
    const width = 800;
    const height = 800;
    const anchor = { x: 620, y: 210 };
    const view = { centerX: 0, centerZ: 0, halfExtent: 6_000 };
    const oldScale = largeMapScale(width, height, view.halfExtent);
    const before = {
      x: view.centerX + (anchor.x - width / 2) / oldScale,
      z: view.centerZ + (height / 2 - anchor.y) / oldScale,
    };
    const zoomed = zoomLargeMapView(view, anchor, width, height, "in");
    const newScale = largeMapScale(width, height, zoomed.halfExtent);
    const after = {
      x: zoomed.centerX + (anchor.x - width / 2) / newScale,
      z: zoomed.centerZ + (height / 2 - anchor.y) / newScale,
    };
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.z).toBeCloseTo(before.z, 8);
    expect(zoomed.halfExtent).toBe(4_800);
  });
});
