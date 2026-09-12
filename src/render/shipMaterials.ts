import { Material } from "@babylonjs/core/Materials/material";
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

const ATLAS_URL = `${import.meta.env.BASE_URL}assets/textures/ww2-destroyer-pixel-atlas.png`;

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
  texture.hasAlpha = false;
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
  material.specularColor = new Color3(0.035, 0.04, 0.045);
  material.specularPower = 28;
  material.alpha = 1;
  material.transparencyMode = Material.MATERIAL_OPAQUE;
  material.useAlphaFromDiffuseTexture = false;
  material.backFaceCulling = true;
  return material;
}

function flatFittingMaterial(
  scene: Scene,
  name: string,
  tint: Color3,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = tint;
  // A faint emissive lift keeps unlit bridge faces legible without dynamic
  // lights, shadows, PBR maps, or another texture fetch.
  material.emissiveColor = tint.scale(.035);
  material.specularColor = new Color3(.035, .04, .045);
  material.specularPower = 18;
  material.alpha = 1;
  material.transparencyMode = Material.MATERIAL_OPAQUE;
  material.useAlphaFromDiffuseTexture = false;
  material.backFaceCulling = true;
  return material;
}

/** One low-resolution atlas and five inexpensive StandardMaterials. */
export function createPixelShipPalette(
  scene: Scene,
  name: string,
  side: "ally" | "enemy" | "target" = "ally",
): PixelShipPalette {
  // Painted steel stays neutral. Team identity belongs to markers and small
  // fittings, not an implausible red/yellow colour cast over the whole hull.
  const hullTint = new Color3(.76, .79, .79);
  const accentTint = side === "ally"
    ? new Color3(.38, .51, .51)
    : side === "target"
      ? new Color3(.63, .49, .26)
      : new Color3(.57, .36, .30);
  return {
    hull: texturedMaterial(scene, `${name}-hull`, [0, 0], hullTint),
    deck: texturedMaterial(scene, `${name}-deck`, [1, 0], new Color3(.75, .72, .63)),
    structure: flatFittingMaterial(scene, `${name}-structure`, new Color3(.48, .54, .56)),
    dark: flatFittingMaterial(scene, `${name}-fittings`, new Color3(.20, .25, .28)),
    accent: flatFittingMaterial(scene, `${name}-accent`, accentTint.scale(.94)),
  };
}
