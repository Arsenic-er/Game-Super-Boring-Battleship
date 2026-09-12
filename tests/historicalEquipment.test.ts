import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Constants } from "@babylonjs/core/Engines/constants";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { EQUIPMENT_BY_ID } from "../src/profile/equipmentCatalog";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import type { InstalledEquipmentIds } from "../src/sim/types";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import { createMainGunVisual } from "../src/render/shipGeometry";
import { createHistoricalMainGun, createHistoricalInternalEquipment } from "../src/render/historicalEquipmentGeometry";
import { HISTORICAL_CLASS_GUN_HOUSINGS, HISTORICAL_EQUIPMENT_PROFILES } from "../src/render/historicalEquipmentProfiles";
import { createLoadoutEquipmentVisual } from "../src/render/loadoutEquipmentVisual";
import { resolveLoadoutVisualPlan } from "../src/render/loadoutVisualPlan";
import { DockLoadoutRenderer } from "../src/render/dockLoadoutRenderer";
import { createHistoricalShipGeometry } from "../src/render/historicalShipGeometry";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const rarity = ["common", "purple", "gold", "redGold"] as const;
const categories = ["mainGun", "torpedo", "antiAir", "sideGun", "depthCharge", "magazine", "engine", "steering"] as const;
const empty = (): InstalledEquipmentIds => ({ mainGun: [], torpedo: [], antiAir: [], sideGun: [], depthCharge: [], magazine: [], engine: [], steering: [] });
function fixture() {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine), parent = new TransformNode("ship", scene);
  const palette = createPixelShipPalette(scene, "equipment-test", "ally");
  return { scene, parent, palette };
}

describe("historical equipment geometry contracts", () => {
  it("connects elevated AA and secondary platforms to the rendered crowned deck without moving mounts", () => {
    const { scene, parent, palette } = fixture();
    const classes: ShipClassId[] = ["fletcher", "j-class", "kagero", "type-1936a", "tashkent",
      ...Object.keys(HISTORICAL_CLASS_GUN_HOUSINGS) as ShipClassId[]];
    for (const id of classes) {
      const scale = getShipClass(id).renderScale; parent.scaling.set(scale.x,scale.y,scale.z);
      const hull = createHistoricalShipGeometry(scene,parent,`hull-${id}`,id,palette);
      const slots = empty(); slots.antiAir = ["antiAir-redGold","antiAir-gold","antiAir-common"];
      slots.sideGun = ["sideGun-redGold","sideGun-purple"];
      const plan = resolveLoadoutVisualPlan(id,slots), before = JSON.stringify(plan);
      const visual = createLoadoutEquipmentVisual(scene,parent,`supports-${id}`,plan,palette);
      const mounts = [...plan.antiAir,...plan.sideGun];
      for (const mount of mounts) {
        const node = visual.root.getDescendants().find(n => n.metadata?.equipmentId===mount.equipmentId
          && n.metadata?.category===mount.category && n.metadata?.slotIndex===mount.slotIndex) as TransformNode;
        const frame = node.parent as TransformNode;
        expect(frame.position.asArray()).toEqual([mount.position.x,mount.position.y,mount.position.z]);
        expect(node.position.asArray()).toEqual([0,0,0]); expect(node.rotation.y).toBe(mount.heading);
        expect(node.getChildMeshes()).toHaveLength(2);
        const steel = node.getChildMeshes().find(m => m.material===palette.structure)!;
        expect(steel.metadata.historicalParts).toContain("deck-connected-pedestal");
        const p = steel.getVerticesData(VertexBuffer.PositionKind)!, world = steel.computeWorldMatrix(true);
        let bottom = Infinity;
        for (let i=0;i<p.length;i+=3) bottom = Math.min(bottom,Vector3.TransformCoordinates(new Vector3(p[i],p[i+1],p[i+2]),world).y);
        // The deck batch also contains bridge roofs. Start near the footing to probe
        // the underlying crowned weather deck, not the highest roof above this XY.
        const ray = new Ray(new Vector3(mount.position.x*scale.x,bottom+.6,mount.position.z*scale.z),Vector3.Down(),2);
        const deck = hull.staticMeshes.find(m => m.metadata?.historicalSurface==="deck")!;
        deck.computeWorldMatrix(true);
        const hit = ray.intersectsMesh(deck,false);
        expect(hit.hit).toBe(true);
        expect(bottom).toBeLessThan(hit.pickedPoint!.y);
        expect(bottom).toBeGreaterThan(hit.pickedPoint!.y-2);
        expect(Math.min(...Array.from({length:p.length/3},(_,i)=>p[i*3+1]!))).toBeCloseTo(node.metadata.supportBaseY,4);
      }
      expect(JSON.stringify(plan)).toBe(before);
      visual.root.dispose(false,false);
      for (const mesh of hull.staticMeshes) mesh.dispose(false,false);
      hull.rudder.dispose(false,false); for (const propeller of hull.propellers) propeller.dispose(false,false);
    }
  });

  it("preserves every old barrel transform and world muzzle through elevation, recoil and ship scale", () => {
    const { scene, parent, palette } = fixture();
    const classes: ShipClassId[] = ["fletcher", "j-class", "kagero", "type-1936a", "tashkent",
      ...Object.keys(HISTORICAL_CLASS_GUN_HOUSINGS) as ShipClassId[]];
    for (const shipClassId of classes) for (const tier of rarity) {
      const slots = empty(); slots.mainGun = Array(5).fill(`mainGun-${tier}`);
      const plan = resolveLoadoutVisualPlan(shipClassId, slots), before = JSON.stringify(plan);
      const scale = getShipClass(shipClassId).renderScale; parent.scaling.set(scale.x, scale.y, scale.z);
      parent.position.set(13, 2, -37); parent.rotation.y = .64;
      for (const mount of plan.mainGun) {
        const modern = createHistoricalMainGun(scene, parent, "historical", shipClassId, mount, palette);
        const baseline = createMainGunVisual(scene, parent, "baseline", { visual: mount.visual }, palette);
        for (const gun of [modern, baseline]) {
          gun.root.position.set(mount.position.x, mount.position.y, mount.position.z);
          gun.root.rotation.y = mount.heading + .31;
        }
        expect(modern.barrels).toHaveLength(mount.visual.barrelCount);
        expect(modern.barrelRestZ).toEqual(baseline.barrelRestZ);
        expect(modern.cradle.position.asArray()).toEqual(baseline.cradle.position.asArray());
        for (const [elevation, recoil] of [[0, 0], [-.2, .82], [-.34, .3]]) {
          modern.cradle.rotation.x = baseline.cradle.rotation.x = elevation!;
          for (let i = 0; i < modern.barrels.length; ++i) {
            const a = modern.barrels[i]!, b = baseline.barrels[i]!;
            a.position.z = modern.barrelRestZ[i]! - recoil!; b.position.z = baseline.barrelRestZ[i]! - recoil!;
            expect(a.position.asArray()).toEqual(b.position.asArray());
            expect(a.rotation.asArray()).toEqual(b.rotation.asArray());
            const tip = new Vector3(0, mount.visual.barrelLength / 2, 0);
            const actual = Vector3.TransformCoordinates(tip, a.computeWorldMatrix(true));
            const expected = Vector3.TransformCoordinates(tip, b.computeWorldMatrix(true));
            expect(Vector3.Distance(actual, expected)).toBeLessThan(1e-6);
          }
        }
        // One merged static housing + individually recoiling barrels. Quad exception = 5 draws.
        expect(modern.root.getChildMeshes()).toHaveLength(mount.visual.barrelCount + 1);
        expect(modern.root.getChildMeshes().every(mesh => mesh.subMeshes.length === 1)).toBe(true);
        modern.root.dispose(false, false); baseline.root.dispose(false, false);
      }
      expect(JSON.stringify(plan)).toBe(before);
    }
  });

  it("has round, outward-facing barrel geometry and a recessed muzzle", () => {
    const { scene, parent, palette } = fixture(); const slots = empty(); slots.mainGun = ["mainGun-common"];
    const mount = resolveLoadoutVisualPlan("fletcher", slots).mainGun[0]!;
    const gun = createHistoricalMainGun(scene, parent, "round", "fletcher", mount, palette);
    const barrel = gun.barrels[0]!, positions = barrel.getVerticesData(VertexBuffer.PositionKind)!, normals = barrel.getVerticesData(VertexBuffer.NormalKind)!;
    expect(new Set(Array.from({ length: 12 }, (_, i) => positions[i * 3]!.toFixed(5))).size).toBeGreaterThan(5);
    expect(positions[4 * 12 * 3 + 1]).toBeCloseTo(mount.visual.barrelLength / 2);
    expect(positions[6 * 12 * 3 + 1]).toBeLessThan(positions[4 * 12 * 3 + 1]!);
    for (let i = 0; i < 12; ++i) {
      const v = i * 3;
      expect(positions[v]! * normals[v]! + positions[v + 2]! * normals[v + 2]!).toBeGreaterThan(0);
    }
  });

  it("keeps KGV 4/2/4, Richelieu forward mounts, empty slots, and historical class housings across rarity", () => {
    const { scene, parent, palette } = fixture();
    for (const tier of rarity) {
      const slots = empty(); slots.mainGun = Array(3).fill(`mainGun-${tier}`);
      const plan = resolveLoadoutVisualPlan("king-george-v", slots);
      const visual = createLoadoutEquipmentVisual(scene, parent, "kgv", plan, palette);
      expect(plan.mainGun.map(m => m.visual.barrelCount)).toEqual([4, 2, 4]);
      expect(visual.turrets.map(t => t.metadata.historicalProfile)).toEqual(Array(3).fill("bl-14in-mkvii"));
      expect(visual.gunBarrels).toHaveLength(10); visual.root.dispose(false, false);
      slots.mainGun = [null, `mainGun-${tier}`];
      const french = resolveLoadoutVisualPlan("richelieu", slots);
      const selected = createLoadoutEquipmentVisual(scene, parent, "richelieu", french, palette);
      expect(selected.turrets).toHaveLength(1); expect(selected.turrets[0]!.metadata.slotIndex).toBe(1);
      expect((selected.turrets[0]!.parent as TransformNode).position.z).toBeGreaterThan(0);
      expect(selected.turrets[0]!.position.asArray()).toEqual([0, 0, 0]); expect(selected.gunBarrels).toHaveLength(4);
      selected.root.dispose(false, false);
    }
  });

  it("constructs all catalogue auxiliaries by model identity with at most two static draws and no rarity paint", () => {
    const { scene, parent, palette } = fixture();
    for (const category of categories.filter(c => c !== "mainGun")) for (const tier of rarity) {
      const id = `${category}-${tier}`, slots = empty(); slots[category] = [null, id];
      const plan = resolveLoadoutVisualPlan("fletcher", slots);
      const profile = HISTORICAL_EQUIPMENT_PROFILES[id]!;
      let model: TransformNode;
      if (["magazine", "engine", "steering"].includes(category)) {
        model = createHistoricalInternalEquipment(scene, parent, id, plan.internalModules[0]!, palette);
      } else {
        const visual = createLoadoutEquipmentVisual(scene, parent, id, plan, palette, { category, slotIndex: 1 });
        model = visual.root;
      }
      const meshes = model.getChildMeshes();
      expect(meshes).toHaveLength(2);
      expect(meshes.every(mesh => [palette.structure, palette.dark].includes(mesh.material as typeof palette.dark))).toBe(true);
      expect(meshes.every(mesh => mesh.getTotalVertices() > 60 && mesh.subMeshes.length === 1)).toBe(true);
      const parts = meshes[0]!.metadata.historicalParts as string[];
      if (category === "antiAir") expect(parts.filter(p => p === "round-aa-barrel")).toHaveLength(profile.barrels);
      if (category === "torpedo") expect(parts.filter(p => p === "launch-tube")).toHaveLength(profile.barrels);
      if (category === "sideGun") expect(parts.filter(p => p === "round-secondary-barrel")).toHaveLength(profile.barrels);
      if (id === "depthCharge-redGold") expect(parts.filter(p => p === "hedgehog-spigot")).toHaveLength(24);
      if (category === "engine") expect(parts).toContain("low-pressure-turbine-casing");
      model.dispose(false, false);
    }
  });

  it("does not bake a transformed parent into static model geometry", () => {
    const { scene, parent, palette } = fixture(), slots = empty(); slots.torpedo = ["torpedo-gold"];
    const plan = resolveLoadoutVisualPlan("fletcher", slots);
    const first = createLoadoutEquipmentVisual(scene, parent, "first", plan, palette);
    const baseline = first.root.getChildMeshes().map(mesh => Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!));
    parent.scaling.set(3, 1.4, 2); parent.position.set(111, 2, 23); parent.rotation.y = .72;
    const second = createLoadoutEquipmentVisual(scene, parent, "second", plan, palette);
    expect(second.root.getChildMeshes().map(mesh => Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!))).toEqual(baseline);
  });

  it("allocates interiors only in independent through-hull inspection and disposes every ghost", async () => {
    const { scene, parent, palette } = fixture(), slots = empty();
    slots.mainGun = ["mainGun-common"]; slots.engine = ["engine-gold"];
    const plan = resolveLoadoutVisualPlan("fletcher", slots), renderer = new DockLoadoutRenderer(scene, parent, palette, {
      createHull: (s, p, name) => { const root = new TransformNode(name, s); root.parent = p;
        const rudder = new TransformNode(`${name}-rudder`, s); rudder.parent = root;
        return { root, rudder, propellers: [], bodyMeshes: [] }; },
    });
    await renderer.setLoadout(plan); const actual = renderer.current!, baseline = scene.meshes.length;
    expect(actual.root.getDescendants().some(node => node.metadata?.inspectionOnly)).toBe(false);
    for (let i = 0; i < 12; ++i) {
      const id = `${["engine", "magazine", "steering"][i % 3]}-${rarity[i % 4]}`;
      renderer.previewEquipment(EQUIPMENT_BY_ID[id]); const overlay = renderer.inspectionRoot!;
      expect(overlay.getChildMeshes()).toHaveLength(2);
      expect(overlay.getChildMeshes().every(mesh => mesh.renderingGroupId === 3 && mesh.material?.depthFunction === Constants.ALWAYS)).toBe(true);
      expect(renderer.current).toBe(actual); expect(actual.plan.signature).toBe(plan.signature);
      renderer.previewEquipment(); expect(overlay.isDisposed()).toBe(true); expect(scene.meshes).toHaveLength(baseline);
    }
    renderer.dispose(); expect(scene.meshes).toHaveLength(0);
  });
});
