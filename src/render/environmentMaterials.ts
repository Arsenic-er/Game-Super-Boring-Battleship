import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

export interface PixelOceanSurface {
  material: StandardMaterial;
  texture: Texture;
}

export function createPixelOceanSurface(scene: Scene): PixelOceanSurface {
  const url = `${import.meta.env.BASE_URL}assets/textures/pixel-ocean-v1.png`;
  const texture = new Texture(url, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  texture.name = "pixel-ocean-texture";
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 42;
  texture.vScale = 42;
  texture.level = 0.68;

  const material = new StandardMaterial("pixel-ocean-material", scene);
  material.diffuseTexture = texture;
  material.diffuseColor = new Color3(0.36, 0.58, 0.64);
  material.specularColor = new Color3(0.2, 0.34, 0.37);
  material.specularPower = 36;
  return { material, texture };
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
