import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { EQUIPMENT_BY_ID } from "../src/profile/equipmentCatalog";
import { dockComponentMeshes, DockComponentHighlight } from "../src/render/dockComponentHighlight";
import { dockComponentOwner, pickDockComponent, type DockComponentHover } from "../src/render/dockInteraction";
import { DockLoadoutRenderer, type DockLoadoutRendererOptions } from "../src/render/dockLoadoutRenderer";
import { resolveLoadoutVisualPlan } from "../src/render/loadoutVisualPlan";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import type { InstalledEquipmentIds } from "../src/sim/types";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const slots: InstalledEquipmentIds = {
  mainGun: ["mainGun-common", null, "mainGun-common"], torpedo: [null, "torpedo-redGold"],
  antiAir: ["antiAir-common", null, "antiAir-purple"], sideGun: [null, "sideGun-gold"],
  depthCharge: ["depthCharge-redGold"], magazine: ["magazine-gold"],
  engine: ["engine-purple"], steering: ["steering-redGold"],
};
const lightHull: NonNullable<DockLoadoutRendererOptions["createHull"]> = (scene, parent) => {
  const root = new TransformNode("test-hull", scene); root.parent = parent;
  const rudder = new TransformNode("test-rudder", scene); rudder.parent = root;
  return { root, rudder, propellers: [], bodyMeshes: [] };
};
async function fixture() {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine), parent = new TransformNode("test-dock", scene);
  const palette = createPixelShipPalette(scene, "test-dock", "ally");
  const renderer = new DockLoadoutRenderer(scene, parent, palette, { createHull: lightHull });
  await renderer.setLoadout(resolveLoadoutVisualPlan("fletcher", slots));
  const counts = () => ({ meshes: scene.meshes.length, nodes: scene.transformNodes.length, materials: scene.materials.length });
  return { scene, parent, renderer, counts };
}
const gunHover = (slotIndex = 0): DockComponentHover => ({
  category: "mainGun", slotIndex, equipmentId: "mainGun-common", canvasX: 40, canvasY: 60, internal: false,
});

describe("installed dock component outline", () => {
  it("outlines every real child of only one selected slot, retaining identical-model siblings and holes", async () => {
    const { renderer } = await fixture(), actual = renderer.current!;
    const highlight = new DockComponentHighlight(), selected = actual.equipment.turrets[1]!;
    const meshes = dockComponentMeshes(actual, gunHover(2));
    // Historical static parts are material-merged; a single gun has housing + barrel.
    expect(meshes.length).toBeGreaterThan(1);
    expect(new Set(meshes)).toEqual(new Set(selected.getChildMeshes()));
    expect(meshes.some((mesh) => mesh.name.includes("barrel"))).toBe(true);
    highlight.update(actual, gunHover(2));
    expect(highlight.meshCount).toBe(meshes.length);
    expect(meshes.every((mesh) => mesh.renderOutline)).toBe(true);
    expect(actual.equipment.turrets[0]!.getChildMeshes().some((mesh) => mesh.renderOutline)).toBe(false);
    expect(dockComponentMeshes(actual, gunHover(1))).toEqual([]);
    highlight.clear();
  });

  it("resolves external categories with the same validated identity as tooltip picking", async () => {
    const { renderer } = await fixture(), actual = renderer.current!;
    for (const [category, slotIndex, equipmentId] of [
      ["torpedo", 1, "torpedo-redGold"], ["antiAir", 2, "antiAir-purple"],
      ["sideGun", 1, "sideGun-gold"], ["depthCharge", 0, "depthCharge-redGold"],
    ] as const) {
      const hover: DockComponentHover = { category, slotIndex, equipmentId, canvasX: 0, canvasY: 0, internal: false };
      const meshes = dockComponentMeshes(actual, hover);
      expect(meshes.length, category).toBeGreaterThan(0);
      for (const mesh of meshes) expect(dockComponentOwner(mesh, actual)).toEqual({ category, slotIndex, equipmentId });
    }
  });

  it("never outlines a candidate ghost, an internal compartment or a stale installed ID", async () => {
    const { renderer } = await fixture(), actual = renderer.current!, highlight = new DockComponentHighlight();
    renderer.previewEquipment(EQUIPMENT_BY_ID["mainGun-common"], 0);
    const ghostMeshes = renderer.inspectionRoot!.getChildMeshes();
    highlight.update(actual, gunHover());
    expect(ghostMeshes.some((mesh) => mesh.renderOutline)).toBe(false);
    expect(dockComponentOwner(ghostMeshes[0]!, actual)).toBeUndefined();
    highlight.update(actual, { ...gunHover(), category: "engine", equipmentId: "engine-purple", internal: true });
    expect(highlight.meshCount).toBe(0);
    expect(dockComponentMeshes(actual, { ...gunHover(), equipmentId: "mainGun-gold" })).toEqual([]);
    expect(dockComponentMeshes(actual, { ...gunHover(), slotIndex: -1 })).toEqual([]);
  });

  it("restores exact per-mesh outline state and color objects on switching, clearing and disposal", async () => {
    const { renderer } = await fixture(), actual = renderer.current!, highlight = new DockComponentHighlight();
    const meshes = dockComponentMeshes(actual, gunHover());
    const before = meshes.map((mesh, index) => {
      mesh.renderOutline = index % 2 === 0;
      mesh.outlineWidth = .12 + index * .01;
      mesh.outlineColor = new Color3(index / meshes.length, .2, .3);
      return { renderOutline: mesh.renderOutline, width: mesh.outlineWidth, color: mesh.outlineColor, rgb: mesh.outlineColor.asArray() };
    });
    const assertRestored = () => meshes.forEach((mesh, index) => {
      expect(mesh.renderOutline).toBe(before[index]!.renderOutline);
      expect(mesh.outlineWidth).toBe(before[index]!.width);
      expect(mesh.outlineColor).toBe(before[index]!.color);
      expect(mesh.outlineColor.asArray()).toEqual(before[index]!.rgb);
    });
    expect(highlight.update(actual, gunHover())).toBe(true);
    expect(meshes.every((mesh) => mesh.outlineWidth === .12)).toBe(true);
    expect(highlight.update(actual, { ...gunHover(), canvasX: 65 })).toBe(false);
    highlight.update(actual, gunHover(2)); assertRestored();
    highlight.update(actual, gunHover()); highlight.update(); assertRestored();
    highlight.update(actual, gunHover()); highlight.dispose(); assertRestored();
    highlight.update(actual, gunHover()); expect(highlight.meshCount).toBe(0);
  });

  it("obeys nearest hull occlusion, including a hull with gameplay picking disabled", async () => {
    const { renderer, scene } = await fixture(), actual = renderer.current!;
    const highlight = new DockComponentHighlight();
    const component = new TransformNode("exposed-test-component", scene);
    component.parent = actual.equipment.root;
    component.metadata = { category: "mainGun", slotIndex: 0, equipmentId: "mainGun-common" };
    const mesh = CreateBox("test-component-child", { size: 8 }, scene);
    mesh.parent = component; mesh.position.set(300, 20, 0);
    const originalOutline = mesh.renderOutline;
    const hull = CreateBox("test-occluding-hull", { size: 12 }, scene);
    hull.parent = actual.hull.root; hull.position.set(300, 50, 0); hull.isPickable = false;
    mesh.computeWorldMatrix(true); hull.computeWorldMatrix(true);
    const origin = Vector3.TransformCoordinates(new Vector3(300, 100, 0), actual.root.computeWorldMatrix(true));
    const ray = new Ray(origin, Vector3.Down(), 300);
    const blocked = pickDockComponent(scene, actual, ray, 40, 60);
    expect(blocked).toBeUndefined();
    highlight.update(actual, blocked); expect(highlight.meshCount).toBe(0);
    hull.setEnabled(false);
    const exposed = pickDockComponent(scene, actual, ray, 40, 60);
    expect(exposed).toEqual(gunHover());
    highlight.update(actual, exposed); expect(mesh.renderOutline).toBe(true);
    hull.setEnabled(true);
    highlight.update(actual, pickDockComponent(scene, actual, ray, 40, 60));
    expect(mesh.renderOutline).toBe(originalOutline);
  });

  it("excludes hidden and fully transparent meshes and restores when the actual ship is disabled", async () => {
    const { renderer, scene } = await fixture(), actual = renderer.current!, highlight = new DockComponentHighlight();
    const meshes = dockComponentMeshes(actual, gunHover());
    meshes[0]!.isVisible = false;
    meshes[1]!.visibility = 0;
    const hidden = dockComponentMeshes(actual, gunHover());
    for (const mesh of meshes) expect(hidden).not.toContain(mesh);
    meshes[0]!.isVisible = true;
    meshes[1]!.visibility = 1;
    const transparent = new StandardMaterial("invisible", scene); transparent.alpha = 0;
    meshes[0]!.material = transparent;
    const resolved = dockComponentMeshes(actual, gunHover());
    expect(resolved).not.toContain(meshes[0]);
    expect(resolved).toContain(meshes[1]);
    highlight.update(actual, gunHover());
    actual.root.setEnabled(false); highlight.update(actual, gunHover());
    expect(highlight.meshCount).toBe(0);
    expect(meshes.some((mesh) => mesh.renderOutline)).toBe(false);
  });

  it("survives 30 hover/input/ghost/loadout/hide/dispose cycles without material or mesh growth", async () => {
    const { renderer, counts } = await fixture(), baseline = counts();
    for (let cycle = 0; cycle < 30; cycle++) {
      const highlight = new DockComponentHighlight(), actual = renderer.current!;
      // The preview invokes the same clear operation immediately on pointerleave,
      // dragging, wheel, blur/hide, ship replacement and candidate inspection.
      for (let input = 0; input < 6; input++) {
        highlight.update(actual, gunHover(input % 2 ? 2 : 0));
        expect(highlight.meshCount).toBeGreaterThan(0);
        highlight.clear();
        expect(highlight.meshCount).toBe(0);
        expect(actual.root.getChildMeshes().some((mesh) => mesh.renderOutline)).toBe(false);
      }
      renderer.previewEquipment(EQUIPMENT_BY_ID["mainGun-common"], 0);
      highlight.update(actual, gunHover());
      expect(renderer.inspectionRoot!.getChildMeshes().some((mesh) => mesh.renderOutline)).toBe(false);
      highlight.clear(); renderer.previewEquipment();
      await renderer.setLoadout(resolveLoadoutVisualPlan(cycle % 2 ? "cleveland" : "fletcher", slots));
      highlight.update(renderer.current, gunHover());
      // Clearing also tolerates a root being disposed independently first.
      await renderer.setLoadout(resolveLoadoutVisualPlan("fletcher", slots));
      highlight.clear(); highlight.dispose(); highlight.dispose();
      expect(counts()).toEqual(baseline);
    }
    renderer.dispose();
    expect(counts().meshes).toBe(0);
    expect(counts().nodes).toBe(1);
  });
});
