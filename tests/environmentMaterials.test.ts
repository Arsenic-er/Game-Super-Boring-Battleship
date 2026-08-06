import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import {
  CLEAR_DAY_RENDER,
  createPixelOceanSurface,
  createPixelSkyMaterial,
  WATER_RENDER,
} from "../src/render/environmentMaterials";

describe("clear-day environment materials", () => {
  it("keeps the sky outside battlefield fog and preserves long visibility", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const sky = createPixelSkyMaterial(scene);

    expect(sky.fogEnabled).toBe(false);
    expect(sky.emissiveColor.r).toBe(0);
    expect(sky.emissiveColor.g).toBe(0);
    expect(sky.emissiveColor.b).toBe(0);
    expect(sky.emissiveTexture?.name).toBe(CLEAR_DAY_RENDER.skyTextureName);
    expect(WATER_RENDER.aboveFog.start).toBeGreaterThan(5_000);
    expect(WATER_RENDER.aboveFog.end).toBeGreaterThan(10_000);
    expect(WATER_RENDER.aboveFog.end).toBeGreaterThan(WATER_RENDER.aboveFog.start);

    scene.dispose();
    engine.dispose();
  });

  it("keeps transparent water bright enough for a sunny battlefield", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const ocean = createPixelOceanSurface(scene);

    expect(ocean.material.alpha).toBeLessThan(0.8);
    expect(ocean.material.alpha).toBeGreaterThan(0.5);
    expect(ocean.material.specularPower).toBeGreaterThanOrEqual(64);
    expect(ocean.material.specularColor.b).toBeGreaterThan(0.8);
    expect(ocean.bumpTexture.level).toBeLessThan(0.2);

    scene.dispose();
    engine.dispose();
  });
});
