import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { oceanHorizonFogRange, OceanWater } from "../src/render/oceanWater";
import { applyWaterAtmosphere } from "../src/render/environmentMaterials";
import { WEATHER_PRESETS } from "../src/sim/weather";

beforeEach(() => vi.stubGlobal("name", "ocean-horizon-test"));
afterEach(() => vi.unstubAllGlobals());

describe("water-only horizon transition", () => {
  it("spreads low-camera haze over an angular band, without changing the upper sky", () => {
    expect(oceanHorizonFogRange(30, 7000, 13000)).toEqual({ start: 720, end: 7200 });
    expect(oceanHorizonFogRange(500, 7000, 13000)).toEqual({ start: 7000, end: 13000 });
    expect(oceanHorizonFogRange(-10, 24, 300)).toEqual({ start: 24, end: 300 });
  });

  it("never extends weather visibility or creates an inverted fog interval", () => {
    for (const weather of Object.values(WEATHER_PRESETS)) {
      for (const height of [.01, 1, 4, 30, 200, 500, 1500]) {
        const range = oceanHorizonFogRange(height, weather.fogStart, weather.fogEnd);
        expect(range.start).toBeGreaterThan(0);
        expect(range.end).toBeGreaterThan(range.start);
        expect(range.start).toBeLessThanOrEqual(weather.fogStart);
        expect(range.end).toBeLessThanOrEqual(weather.fogEnd);
      }
    }
  });

  it("binds only the water effect and preserves scene and underwater fog", () => {
    const engine = new NullEngine(), scene = new Scene(engine);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    const camera = new FreeCamera("eye", new Vector3(0, 30, 0), scene);
    camera.getViewMatrix(true);
    const ocean = new OceanWater(scene);
    const setFloat = vi.fn(), setFloat4 = vi.fn();
    vi.spyOn(ocean.material, "getEffect").mockReturnValue({ setFloat, setFloat4 } as unknown as Effect);
    applyWaterAtmosphere(scene, false);
    ocean.update(1, { x: 0, z: 0 });
    ocean.material.onBindObservable.notifyObservers(ocean.mesh);
    expect(setFloat4).toHaveBeenCalledOnce();
    expect(setFloat4.mock.calls[0]![2]).toBeLessThan(1000);
    expect(scene.fogStart).toBe(7000);
    expect(scene.fogEnd).toBe(13000);
    expect(scene.fogColor.asArray()).toEqual([.7, .86, .95]);
    setFloat4.mockClear();
    camera.position.y = -10;
    camera.getViewMatrix(true);
    applyWaterAtmosphere(scene, true);
    ocean.material.onBindObservable.notifyObservers(ocean.mesh);
    expect(setFloat4).not.toHaveBeenCalled();
    expect(scene.fogStart).toBe(24);
    expect(scene.fogEnd).toBe(300);
    scene.dispose(); engine.dispose();
  });
});
