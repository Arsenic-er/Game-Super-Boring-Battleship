import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { normalizeWeatherId, weatherPreset, type WeatherId } from "../sim/weather";
import { SkyHorizon } from "./skyHorizon";

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
    Texture.TRILINEAR_SAMPLINGMODE,
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
  new SkyHorizon(material);
  return material;
}
