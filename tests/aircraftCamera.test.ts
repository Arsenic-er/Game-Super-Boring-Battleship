import { describe, expect, it } from "vitest";
import { aircraftCameraPlan } from "../src/render/aircraftCamera";

describe("developer formation camera", () => {
  const fallback = { x: 100, y: 300, z: -500 };
  it("retains a useful single-plane and empty-group view", () => {
    expect(aircraftCameraPlan([], fallback, 16 / 9)).toEqual({ target: fallback, radius: 140, fov: .72 });
    expect(aircraftCameraPlan([fallback], fallback, 16 / 9).radius).toBe(140);
  });
  it("frames the entire formation with full-airframe and HUD margins", () => {
    const points = [{ x: -70, y: 400, z: -50 }, { x: 50, y: 310, z: 80 }, { x: 0, y: 330, z: 0 }];
    const plan = aircraftCameraPlan(points, fallback, 16 / 9);
    expect(plan.target).toEqual({ x: -10, y: 355, z: 15 });
    expect(plan.radius).toBeGreaterThan(500);
    for (const point of points) {
      const extent = Math.hypot(point.x - plan.target.x, point.y - plan.target.y, point.z - plan.target.z) + 20;
      expect(Math.asin(extent / plan.radius)).toBeLessThanOrEqual(Math.atan(Math.tan(plan.fov / 2) * .52) + 1e-12);
    }
  });
  it("widens the camera for a portrait window without clipping horizontal wings", () => {
    const points = [{ x: -70, y: 300, z: 0 }, { x: 70, y: 300, z: 0 }];
    expect(aircraftCameraPlan(points, fallback, .4).radius).toBeGreaterThan(aircraftCameraPlan(points, fallback, 16 / 9).radius);
  });
  it("ignores invalid visual positions and tolerates an unavailable viewport", () => {
    const invalid = { x: NaN, y: Infinity, z: 1 };
    expect(aircraftCameraPlan([invalid], fallback, 0)).toEqual(aircraftCameraPlan([], fallback, 1));
    expect(Number.isFinite(aircraftCameraPlan([fallback], fallback, NaN).radius)).toBe(true);
  });
});
