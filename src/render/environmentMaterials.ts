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

export const WATER_RENDER = {
  surfaceY: -0.8,
  deepWaterY: -220,
  surfaceAlpha: 0.66,
  aboveFog: {
    start: 2_200,
    end: 4_700,
    color: new Color3(0.36, 0.56, 0.66),
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
  texture.level = 0.68;
  const bumpTexture = texture.clone();
  bumpTexture.name = "pixel-ocean-bump-texture";
  bumpTexture.level = 0.22;

  const material = new StandardMaterial("pixel-ocean-material", scene);
  material.diffuseTexture = texture;
  material.bumpTexture = bumpTexture;
  material.diffuseColor = new Color3(0.36, 0.58, 0.64);
  material.specularColor = new Color3(0.2, 0.34, 0.37);
  material.specularPower = 36;
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
  material.diffuseColor = new Color3(0.012, 0.075, 0.105);
  material.emissiveColor = new Color3(0.006, 0.025, 0.035);
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
  const url = `${import.meta.env.BASE_URL}assets/textures/pixel-sky-overcast-v1.png`;
  const texture = new Texture(url, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  texture.name = "pixel-sky-overcast-texture";
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const material = new StandardMaterial("pixel-sky-overcast-material", scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.emissiveTexture = texture;
  material.specularColor = Color3.Black();
  return material;
}
