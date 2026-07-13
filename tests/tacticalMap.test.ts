import { describe, expect, it } from "vitest";
import { worldToHeadingUpMap } from "../src/ui/tacticalMap";

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
