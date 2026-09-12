import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { Material } from "@babylonjs/core/Materials/material";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";

/** Angular haze only: preserve the established clear-day sky above this band. */
export function horizonFadeEnd(fogEnd: number): number {
  return Math.min(.3, Math.max(.12, .12 * 13_000 / Math.max(1, fogEnd)));
}

export function horizonHazeAmount(elevation: number, fogEnd: number): number {
  const t = Math.max(0, Math.min(1, elevation / horizonFadeEnd(fogEnd)));
  return 1 - t * t * (3 - 2 * t);
}

/** Match the ocean's fog colour before image processing, including its reflection. */
export class SkyHorizon extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, "SkyHorizon", 180, {}, true, true);
    this.doNotSerialize = true;
  }

  override getUniforms() {
    return {
      ubo: [{ name: "navalHorizon", size: 4, type: "vec4" }],
      fragment: "uniform vec4 navalHorizon;",
    };
  }

  override bindForSubMesh(buffer: UniformBuffer, scene: Scene): void {
    buffer.updateFloat4("navalHorizon", scene.fogColor.r, scene.fogColor.g,
      scene.fogColor.b, horizonFadeEnd(scene.fogEnd));
  }

  override getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        float navalElevation = normalize(vPositionW - vEyePosition.xyz).y;
        float navalHaze = 1.0 - smoothstep(0.0, navalHorizon.a, navalElevation);
        color.rgb = mix(color.rgb, navalHorizon.rgb, navalHaze);
      `,
    };
  }
}
