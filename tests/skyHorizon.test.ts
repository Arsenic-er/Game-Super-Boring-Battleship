import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { describe, expect, it, vi } from "vitest";
import { SkyHorizon, horizonFadeEnd, horizonHazeAmount } from "../src/render/skyHorizon";
import { applyWaterAtmosphere } from "../src/render/environmentMaterials";
import { WEATHER_IDS } from "../src/sim/weather";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";

describe("sky and water horizon continuity", () => {
  it("matches fog at the horizon without whitening the upper clear sky", () => {
    expect(horizonHazeAmount(0, 13_000)).toBe(1);
    expect(horizonHazeAmount(-.2, 13_000)).toBe(1);
    expect(horizonHazeAmount(.06, 13_000)).toBeCloseTo(.5);
    expect(horizonHazeAmount(.12, 13_000)).toBe(0);
    expect(horizonHazeAmount(.8, 13_000)).toBe(0);
    expect(horizonHazeAmount(.001, 13_000)).toBeGreaterThan(.999);
  });

  it("widens mist gradually with poor visibility and bounds its cost/coverage", () => {
    expect(horizonFadeEnd(1_800)).toBeGreaterThan(horizonFadeEnd(13_000));
    for (const fogEnd of [0, 1, 550, 1_800, 5_000, 8_000, 13_000, 100_000]) {
      expect(horizonFadeEnd(fogEnd)).toBeGreaterThanOrEqual(.12);
      expect(horizonFadeEnd(fogEnd)).toBeLessThanOrEqual(.3);
      let previous = 1;
      for (let step = 0; step < 50; step++) {
        const value = horizonHazeAmount(step / 100, fogEnd);
        expect(value).toBeLessThanOrEqual(previous);
        expect(value).toBeGreaterThanOrEqual(0);
        previous = value;
      }
    }
  });

  it("binds the exact scene fog colour for every weather and underwater return", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const material = new StandardMaterial("sky", scene);
    const plugin = new SkyHorizon(material);
    const updateFloat4 = vi.fn();
    for (const weather of WEATHER_IDS) {
      for (const underwater of [false, true, false]) {
        applyWaterAtmosphere(scene, underwater, weather);
        plugin.bindForSubMesh({ updateFloat4 } as unknown as UniformBuffer, scene);
        expect(updateFloat4).toHaveBeenLastCalledWith("navalHorizon", scene.fogColor.r,
          scene.fogColor.g, scene.fogColor.b, horizonFadeEnd(scene.fogEnd));
      }
    }
    expect(plugin.getCustomCode("vertex")).toBeNull();
    expect(plugin.getCustomCode("fragment")?.CUSTOM_FRAGMENT_BEFORE_FOG).toContain("vEyePosition");
    scene.dispose(); engine.dispose();
  });
});
