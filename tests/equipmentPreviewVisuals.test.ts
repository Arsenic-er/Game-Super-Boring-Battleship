import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { EQUIPMENT_CATALOG } from "../src/profile/equipmentCatalog";
import { createDockEquipmentPreviewVisual } from "../src/render/equipmentPreviewVisuals";
import { createTorpedoLauncherVisual } from "../src/render/shipGeometry";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import { TORPEDO_DEFINITIONS } from "../src/ships/torpedoes";

const visualSignature = (root: TransformNode): string => root.getChildMeshes()
  .map((mesh) => {
    const box = mesh.getBoundingInfo().boundingBox;
    return [
      mesh.getTotalVertices(),
      (box.maximum.x - box.minimum.x).toFixed(2),
      (box.maximum.y - box.minimum.y).toFixed(2),
      (box.maximum.z - box.minimum.z).toFixed(2),
    ].join(":");
  })
  .sort()
  .join("|");

describe("dock equipment preview visuals", () => {
  it("creates distinct finite geometry for every auxiliary equipment model", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("ship", scene);
    const palette = createPixelShipPalette(scene, "test-dock", "ally");
    const moduleMaterial = new StandardMaterial("module-preview", scene);
    const signaturesByCategory = new Map<string, Set<string>>();
    const auxiliary = EQUIPMENT_CATALOG.filter((item) =>
      item.category !== "mainGun" && item.category !== "torpedo");
    expect(auxiliary).toHaveLength(24);
    for (const item of auxiliary) {
      const root = createDockEquipmentPreviewVisual(scene, parent, item, palette, moduleMaterial);
      const meshes = root.getChildMeshes();
      expect(meshes.length, item.id).toBeGreaterThan(0);
      expect(meshes.every((mesh) => {
        const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
        return [minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z].every(Number.isFinite);
      }), item.id).toBe(true);
      const set = signaturesByCategory.get(item.category) ?? new Set<string>();
      set.add(visualSignature(root));
      signaturesByCategory.set(item.category, set);
      root.dispose(false, false);
    }
    for (const signatures of signaturesByCategory.values()) expect(signatures.size).toBe(4);
    scene.dispose();
    engine.dispose();
  });

  it("uses historically distinct launcher tube counts", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("ship", scene);
    const palette = createPixelShipPalette(scene, "test-torpedo", "ally");
    const expected = [2, 3, 5, 4];
    for (const [index, definition] of Object.values(TORPEDO_DEFINITIONS).entries()) {
      const visual = createTorpedoLauncherVisual(scene, parent, `test-${definition.id}`, definition, palette);
      const tubes = visual.root.getChildMeshes().filter((mesh) => mesh.name.includes("torpedo-tube"));
      expect(tubes, definition.id).toHaveLength(expected[index]);
      visual.root.dispose(false, false);
    }
    scene.dispose();
    engine.dispose();
  });
});
