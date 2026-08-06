import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { normalizeWeatherId, weatherPreset, type WeatherId } from "../sim/weather";

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

export function applyWaterAtmosphere(
  scene: Scene,
  underwater: boolean,
  weatherId: WeatherId = "clear",
): void {
  if (underwater) {
    scene.fogStart = WATER_RENDER.underwaterFog.start;
    scene.fogEnd = WATER_RENDER.underwaterFog.end;
    scene.fogColor.copyFrom(WATER_RENDER.underwaterFog.color);
    scene.clearColor.set(
      WATER_RENDER.underwaterFog.color.r,
      WATER_RENDER.underwaterFog.color.g,
      WATER_RENDER.underwaterFog.color.b,
      1,
    );
    return;
  }
  const preset = weatherPreset(weatherId);
  const [r, g, b] = preset.fogColor;
  scene.fogStart = preset.fogStart;
  scene.fogEnd = preset.fogEnd;
  scene.fogColor.set(r, g, b);
  scene.clearColor.set(r, g, b, 1);
}

function skyTexture(scene: Scene, weatherId: WeatherId): Texture {
  const preset = weatherPreset(weatherId);
  const filename = preset.skyTexture === "clear"
    ? "pixel-sky-clear-v1.png"
    : "pixel-sky-overcast-v1.png";
  const texture = new Texture(
    `${import.meta.env.BASE_URL}assets/textures/${filename}`,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  texture.name = `pixel-sky-${preset.skyTexture}-texture`;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

export function applyPixelSkyWeather(
  material: StandardMaterial,
  scene: Scene,
  value: unknown,
): WeatherId {
  const weatherId = normalizeWeatherId(value);
  const previous = material.emissiveTexture;
  material.emissiveTexture = skyTexture(scene, weatherId);
  previous?.dispose();
  material.name = `pixel-sky-${weatherId}-material`;
  return weatherId;
}

export function createPixelSkyMaterial(
  scene: Scene,
  weatherId: WeatherId = "clear",
): StandardMaterial {
  const material = new StandardMaterial(`pixel-sky-${weatherId}-material`, scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.fogEnabled = false;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.Black();
  material.emissiveTexture = skyTexture(scene, weatherId);
  material.specularColor = Color3.Black();
  return material;
}
