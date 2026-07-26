import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

export interface PixelShipPalette {
  hull: StandardMaterial;
  deck: StandardMaterial;
  structure: StandardMaterial;
  dark: StandardMaterial;
  accent: StandardMaterial;
}

const ATLAS_URL = "/assets/textures/ww2-destroyer-pixel-atlas.png";

function atlasRegion(
  scene: Scene,
  name: string,
  column: 0 | 1,
  row: 0 | 1,
): Texture {
  const texture = new Texture(
    ATLAS_URL,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  texture.name = name;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.uScale = 0.5;
  texture.vScale = 0.5;
  texture.uOffset = column * 0.5;
  texture.vOffset = row * 0.5;
  return texture;
}

function texturedMaterial(
  scene: Scene,
  name: string,
  region: readonly [0 | 1, 0 | 1],
  tint: Color3,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = atlasRegion(scene, `${name}-atlas`, region[0], region[1]);
  material.diffuseColor = tint;
  material.specularColor = new Color3(0.12, 0.15, 0.16);
  material.specularPower = 28;
  return material;
}

/** One low-resolution atlas and five inexpensive StandardMaterials. */
export function createPixelShipPalette(
  scene: Scene,
  name: string,
  side: "ally" | "enemy" | "target" = "ally",
): PixelShipPalette {
  const hullTint = side === "ally"
    ? new Color3(0.72, 0.83, 0.84)
    : side === "target"
      ? new Color3(0.82, 0.72, 0.42)
      : new Color3(0.78, 0.61, 0.56);
  const accentTint = side === "ally"
    ? new Color3(0.78, 0.9, 0.88)
    : side === "target"
      ? new Color3(0.95, 0.74, 0.3)
      : new Color3(0.94, 0.62, 0.52);
  return {
    hull: texturedMaterial(scene, `${name}-hull`, [0, 0], hullTint),
    deck: texturedMaterial(scene, `${name}-deck`, [1, 0], new Color3(0.68, 0.72, 0.66)),
    structure: texturedMaterial(scene, `${name}-structure`, [0, 0], hullTint.scale(1.08)),
    dark: texturedMaterial(scene, `${name}-fittings`, [0, 1], new Color3(0.62, 0.67, 0.65)),
    accent: texturedMaterial(scene, `${name}-accent`, [0, 0], accentTint),
  };
}
