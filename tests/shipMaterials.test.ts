import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Material } from "@babylonjs/core/Materials/material";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createPixelShipPalette } from "../src/render/shipMaterials";

describe("pixel ship materials", () => {
  it("keeps every ship surface opaque and fittings independent of atlas UV failures", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const palette = createPixelShipPalette(scene, "test-ship", "ally");

    for (const material of Object.values(palette)) {
      expect(material.alpha).toBe(1);
      expect(material.transparencyMode).toBe(Material.MATERIAL_OPAQUE);
      expect(material.useAlphaFromDiffuseTexture).toBe(false);
      expect(material.backFaceCulling).toBe(true);
      expect(material.needAlphaBlending()).toBe(false);
    }
    expect(palette.hull.diffuseTexture).not.toBeNull();
    expect(palette.deck.diffuseTexture).not.toBeNull();
    expect(palette.structure.diffuseTexture).toBeNull();
    expect(palette.dark.diffuseTexture).toBeNull();
    expect(palette.accent.diffuseTexture).toBeNull();
    const structureLuminance = palette.structure.diffuseColor.r
      + palette.structure.diffuseColor.g + palette.structure.diffuseColor.b;
    const darkLuminance = palette.dark.diffuseColor.r
      + palette.dark.diffuseColor.g + palette.dark.diffuseColor.b;
    expect(structureLuminance).toBeGreaterThan(darkLuminance);
    expect(darkLuminance).toBeGreaterThan(.4);

    scene.dispose();
    engine.dispose();
  });
});
