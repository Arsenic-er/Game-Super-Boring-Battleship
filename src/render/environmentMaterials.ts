import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

export interface PixelOceanSurface {
  material: StandardMaterial;
  texture: Texture;
  bumpTexture: Texture;
}

export const CLEAR_DAY_RENDER = {
  exposure: 1.1,
  contrast: 1.06,
  ambientIntensity: 0.8,
  sunIntensity: 1.15,
  skyTextureName: "pixel-sky-clear-texture",
} as const;

export const WATER_RENDER = {
  surfaceY: -0.8,
  deepWaterY: -220,
  surfaceAlpha: 0.66,
  aboveFog: {
    start: 7_000,
    end: 13_000,
    color: new Color3(0.7, 0.86, 0.95),
  },
  underwaterFog: {
    start: 24,
    end: 300,
    color: new Color3(0.025, 0.13, 0.18),
  },
} as const;

export function createPixelOceanSurface(scene: Scene): PixelOceanSurface {
  const url = `${import.meta.env.BASE_URL}assets/textures/pixel-ocean-v1.png`;
  const texture = new Texture(url, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  texture.name = "pixel-ocean-texture";
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 42;
  texture.vScale = 42;
  texture.level = 0.8;
  const bumpTexture = texture.clone();
  bumpTexture.name = "pixel-ocean-bump-texture";
  bumpTexture.level = 0.16;

  const material = new StandardMaterial("pixel-ocean-material", scene);
  material.diffuseTexture = texture;
  material.bumpTexture = bumpTexture;
  material.diffuseColor = new Color3(0.32, 0.66, 0.76);
  material.specularColor = new Color3(0.7, 0.82, 0.9);
  material.specularPower = 64;
  material.alpha = WATER_RENDER.surfaceAlpha;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.disableDepthWrite = true;
  material.needDepthPrePass = false;
  return { material, texture, bumpTexture };
}

export function createDeepWaterMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("deep-water-material", scene);
  material.diffuseColor = new Color3(0.035, 0.17, 0.23);
  material.emissiveColor = new Color3(0.01, 0.045, 0.06);
  material.specularColor = Color3.Black();
  return material;
}

export function applyWaterAtmosphere(scene: Scene, underwater: boolean): void {
  const fog = underwater ? WATER_RENDER.underwaterFog : WATER_RENDER.aboveFog;
  scene.fogStart = fog.start;
  scene.fogEnd = fog.end;
  scene.fogColor.copyFrom(fog.color);
  scene.clearColor.set(fog.color.r, fog.color.g, fog.color.b, 1);
}

export function createPixelSkyMaterial(scene: Scene): StandardMaterial {
  const url = `${import.meta.env.BASE_URL}assets/textures/pixel-sky-clear-v1.png`;
  const texture = new Texture(url, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  texture.name = CLEAR_DAY_RENDER.skyTextureName;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const material = new StandardMaterial("pixel-sky-clear-material", scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.fogEnabled = false;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.Black();
  material.emissiveTexture = texture;
  material.specularColor = Color3.Black();
  return material;
}
