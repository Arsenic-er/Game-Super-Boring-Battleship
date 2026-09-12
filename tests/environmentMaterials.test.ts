import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLEAR_DAY_RENDER,
  createPixelSkyMaterial,
  WATER_RENDER,
} from "../src/render/environmentMaterials";
import { createOceanMaterial, oceanNormalData, oceanGrid, oceanHeightAt, OceanWater,
  OCEAN_QUALITY, OCEAN_WEATHER } from "../src/render/oceanWater";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

// The pinned upstream RTT constructor uses browser-global `name`.
beforeEach(() => vi.stubGlobal("name", "water-test"));
afterEach(() => vi.unstubAllGlobals());

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

  it("uses official refractive water instead of double alpha blending", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const ocean = createOceanMaterial(scene);

    expect(ocean.material.getClassName()).toBe("WaterMaterial");
    expect(ocean.material.alpha).toBe(1);
    expect(ocean.material.disableDepthWrite).toBe(false);
    expect(ocean.material.disableClipPlane).toBe(false);
    expect(ocean.material.fresnelSeparate).toBe(true);
    expect(ocean.material.specularPower).toBeGreaterThanOrEqual(64);
    expect(ocean.material.specularColor.b).toBeGreaterThan(0.4);
    expect(ocean.normal.level).toBe(1);
    expect(ocean.material.reflectionTexture!.renderParticles).toBe(false);
    expect(ocean.material.refractionTexture!.renderParticles).toBe(false);

    scene.dispose();
    engine.dispose();
  });

  it("keeps fine normal data unbiased with valid blue normals", () => {
    const normal = oceanNormalData(64);
    let red = 0, green = 0;
    for (let i = 0; i < normal.length; i += 3) {
      red += normal[i]!; green += normal[i + 1]!;
      expect(normal[i + 2]).toBeGreaterThan(220);
    }
    expect(red / (64 * 64)).toBeCloseTo(127.5, 0);
    expect(green / (64 * 64)).toBeCloseTo(127.5, 0);
  });

  it("budgets mesh detail and RTT per quality with a full horizon", () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const ocean = new OceanWater(scene);
    for (const quality of ["medium", "low"] as const) {
      ocean.setQuality(quality);
      const config = OCEAN_QUALITY[quality];
      expect(ocean.mesh.getTotalVertices()).toBe((config.subdivisions + 1) ** 2);
      for (const target of [ocean.material.reflectionTexture!, ocean.material.refractionTexture!]) {
        expect(target.getSize().width).toBe(config.textureSize);
        expect(target.refreshRate).toBe(config.refreshRate);
      }
      const grid = oceanGrid(config.subdivisions);
      expect(grid.indices!.length).toBe(config.subdivisions ** 2 * 6);
      expect(Math.max(...grid.positions!)).toBe(18_000);
    }
    scene.dispose(); engine.dispose();
  });

  it("anchors both normal layers in world space when the mesh recentres", () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const ocean = new OceanWater(scene);
    ocean.update(20, { x: 1_231, z: -1_447 });
    const positions = ocean.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const uvs = ocean.mesh.getVerticesData(VertexBuffer.UVKind)!;
    for (const i of [0, 500, 4_704, 9_408]) {
      expect(uvs[i * 2]).toBeCloseTo((positions[i * 3]! + ocean.mesh.position.x) / 72, 4);
      expect(uvs[i * 2 + 1]).toBeCloseTo((positions[i * 3 + 2]! + ocean.mesh.position.z) / 72, 4);
    }
    expect(ocean.material.useWorldCoordinatesForWaveDeformation).toBe(true);
    scene.dispose(); engine.dispose();
  });

  it("excludes hidden contacts and water itself from both offscreen passes", () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const ocean = new OceanWater(scene);
    const sky = new Mesh("sky", scene), floor = new Mesh("floor", scene);
    const visible = new Mesh("visible", scene), hidden = new Mesh("hidden", scene);
    hidden.visibility = .04;
    ocean.setEnvironment([sky, ocean.mesh], [], floor);
    ocean.update(1, { x: 0, z: 0 });
    const submerged = new Mesh("submerged", scene);
    submerged.material = new StandardMaterial("training-target", scene);
    submerged.material.alpha = .58;
    ocean.syncRenderLists(() => [{ x: 0, z: 0, meshes: [visible, hidden, ocean.mesh] }], () => [submerged]);
    expect(ocean.material.reflectionTexture!.renderList!.map(mesh => mesh.name)).toEqual(["sky", "visible"]);
    expect(ocean.material.refractionTexture!.renderList!.map(mesh => mesh.name)).toEqual(["floor", "visible", "submerged"]);
    expect(ocean.material.reflectionTexture!.renderList![1]).toBe(visible);
    scene.dispose(); engine.dispose();
  });

  it("matches bounded world-space waves and stronger squalls without changing simulation", () => {
    expect(OCEAN_WEATHER["rain-squall"].waveHeight).toBeGreaterThan(OCEAN_WEATHER.clear.waveHeight);
    expect(oceanHeightAt(123, 345, 0, "clear")).not.toBe(oceanHeightAt(123, 345, 4, "clear"));
    for (let t = 0; t < 100; t++) {
      const height = oceanHeightAt(t * 100, t * -42, t / 60, "rain-squall");
      expect(height).toBeGreaterThanOrEqual(WATER_RENDER.surfaceY);
      expect(height).toBeLessThan(WATER_RENDER.surfaceY + 1.1);
    }
  });
});
