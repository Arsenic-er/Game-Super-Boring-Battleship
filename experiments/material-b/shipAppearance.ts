import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { PixelShipPalette } from '../../src/render/shipMaterials';

const adapted = new WeakSet<PixelShipPalette>();

/**
 * The existing atlas is very dark (sampled hull luma ~.37, deck ~.29).
 * A material tint can only multiply that colour, so filtering/tints alone cannot
 * close the brightness gap to untextured fittings without washing those out.
 * Remap the sampled albedo once, before lighting: no extra fetches or uniforms.
 */
class LabAtlasTone extends MaterialPluginBase {
  constructor(material: StandardMaterial, centre: number, target: number,
    contrast: number, saturation: number, waterline = false) {
    // These constants must be defines: effect caching does not key on injected
    // source strings, so per-instance literals silently reuse the first shader.
    super(material, 'LabAtlasTone', 180, {
      LAB_SHIP_ATLAS_CENTRE: centre,
      LAB_SHIP_ATLAS_TARGET: target,
      LAB_SHIP_ATLAS_CONTRAST: contrast,
      LAB_SHIP_ATLAS_SATURATION: saturation,
      LAB_SHIP_WATERLINE: waterline,
    }, true, true);
    this.doNotSerialize = true;
  }

  override getClassName(): string { return 'LabAtlasTone'; }

  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        #ifdef DIFFUSE
          float labAtlasLuma = dot(baseColor.rgb, vec3(.2126, .7152, .0722));
          float labAtlasTone = LAB_SHIP_ATLAS_TARGET + (labAtlasLuma - LAB_SHIP_ATLAS_CENTRE)
            * LAB_SHIP_ATLAS_CONTRAST;
          vec3 labAtlasChroma = (baseColor.rgb - vec3(labAtlasLuma))
            * LAB_SHIP_ATLAS_SATURATION;
          baseColor.rgb = clamp(vec3(labAtlasTone) + labAtlasChroma,
            vec3(.065), vec3(.78));
        #endif
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifdef LAB_SHIP_WATERLINE
          // Subtle wet-paint / sea-bounce cue at the actual world sea level.
          float labWetBand = 1.0 - smoothstep(.12, 1.05, vPositionW.y);
          color.rgb = mix(color.rgb, vec3(.075, .205, .285), labWetBand * .18);
        #endif
      `,
    };
  }
}

/** Texture wrappers stay private to this lab palette; image/GPU atlas is reused. */
function softenAtlas(material: StandardMaterial): void {
  const original = material.diffuseTexture;
  if (!(original instanceof Texture)) return;
  const texture = original.clone();
  texture.name = original.name + '-lab-soft';
  texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  texture.anisotropicFilteringLevel = 4;
  const region = { u: texture.uOffset, v: texture.vOffset,
    width: texture.uScale, height: texture.vScale };
  const inset = () => {
    const size = texture.getBaseSize();
    if (size.width <= 0 || size.height <= 0) return;
    const du = 1 / size.width, dv = 1 / size.height;
    // Guard the 2x2 atlas at level zero; production metre-space UVs also keep
    // this model far inside its tile, preventing low-mip neighbour bleed.
    texture.uOffset = region.u + du;
    texture.vOffset = region.v + dv;
    texture.uScale = Math.max(du, region.width - du * 2);
    texture.vScale = Math.max(dv, region.height - dv * 2);
  };
  if (texture.isReady()) inset();
  else texture.onLoadObservable.addOnce(inset);
  material.diffuseTexture = texture;
  // The clone retains the atlas. Release only this replaced texture wrapper.
  original.dispose();
}

/**
 * B-preview only. Keeps all five materials and the original atlas; no geometry,
 * extra draw calls, textures fetched per fragment, PBR, shadows or render targets.
 * Call once after createPixelShipPalette and before constructing the ship.
 */
export function applyLabShipAppearance(palette: PixelShipPalette): void {
  if (adapted.has(palette)) return;
  adapted.add(palette);
  softenAtlas(palette.hull);
  softenAtlas(palette.deck);
  new LabAtlasTone(palette.hull, .37, .43, .68, .42, true);
  new LabAtlasTone(palette.deck, .29, .37, .50, .38);

  palette.hull.diffuseColor = new Color3(.75, .77, .78);
  palette.hull.emissiveColor = new Color3(.008, .013, .017);
  palette.deck.diffuseColor = new Color3(.82, .805, .76);
  palette.deck.emissiveColor = new Color3(.012, .014, .016);
  palette.structure.diffuseColor = new Color3(.36, .405, .425);
  palette.structure.emissiveColor = new Color3(.013, .018, .021);
  palette.dark.diffuseColor = new Color3(.17, .215, .235);
  palette.dark.emissiveColor = new Color3(.008, .013, .016);
  palette.accent.diffuseColor = new Color3(.29, .405, .405);
  palette.accent.emissiveColor = new Color3(.011, .017, .018);

  for (const material of Object.values(palette)) {
    material.specularColor = new Color3(.035, .042, .047);
    material.specularPower = 42;
    material.maxSimultaneousLights = 2;
    material.fogEnabled = true;
  }
}
