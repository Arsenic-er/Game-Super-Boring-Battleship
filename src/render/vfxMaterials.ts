import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

export type PixelVfxKind = "muzzle" | "fire" | "smoke" | "splash";

const REGIONS: Record<PixelVfxKind, readonly [0 | 1, 0 | 1]> = {
  muzzle: [0, 0],
  fire: [1, 0],
  smoke: [0, 1],
  splash: [1, 1],
};

export function createPixelVfxMaterial(
  scene: Scene,
  kind: PixelVfxKind,
): StandardMaterial {
  const [column, row] = REGIONS[kind];
  const url = `${import.meta.env.BASE_URL}assets/textures/ww2-vfx-pixel-atlas.png`;
  const texture = new Texture(url, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  texture.name = `pixel-vfx-${kind}-texture`;
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.uScale = 0.5;
  texture.vScale = 0.5;
  texture.uOffset = column * 0.5;
  texture.vOffset = row * 0.5;

  const material = new StandardMaterial(`pixel-vfx-${kind}-material`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();
  material.emissiveColor = kind === "smoke"
    ? new Color3(0.24, 0.25, 0.24)
    : new Color3(0.78, 0.78, 0.74);
  return material;
}
