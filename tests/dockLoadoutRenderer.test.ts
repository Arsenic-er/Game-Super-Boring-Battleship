import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Constants } from "@babylonjs/core/Engines/constants";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { EQUIPMENT_BY_ID } from "../src/profile/equipmentCatalog";
import { DockLoadoutRenderer, type DockExternalHullResult, type DockLoadoutRendererOptions } from "../src/render/dockLoadoutRenderer";
import { createLoadoutEquipmentVisual } from "../src/render/loadoutEquipmentVisual";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import { resolveLoadoutVisualPlan } from "../src/render/loadoutVisualPlan";
import type { ShipClassId } from "../src/ships/classes";
import type { InstalledEquipmentIds } from "../src/sim/types";

const slots = (): InstalledEquipmentIds => ({ mainGun: ["mainGun-common", null, "mainGun-gold"],
  torpedo: [null, "torpedo-redGold"], antiAir: ["antiAir-common", null, "antiAir-purple"],
  sideGun: [null, "sideGun-gold"], depthCharge: ["depthCharge-redGold"],
  magazine: ["magazine-gold"], engine: ["engine-purple"], steering: ["steering-redGold"] });
const plan = (id: ShipClassId = "fletcher") => resolveLoadoutVisualPlan(id, slots());
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const deferred = () => {
  let resolve!: (value: DockExternalHullResult) => void;
  const promise = new Promise<DockExternalHullResult>((yes) => { resolve = yes; });
  return { promise, resolve };
};
function fixture(options: DockLoadoutRendererOptions = {}) {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine);
  const parent = new TransformNode("dock-ship", scene);
  const palette = createPixelShipPalette(scene, "dock-test", "ally");
  const renderer = new DockLoadoutRenderer(scene, parent, palette, options);
  const counts = () => ({ meshes: scene.meshes.length, nodes: scene.transformNodes.length, materials: scene.materials.length });
  return { scene, parent, palette, renderer, counts };
}
const lightHull: NonNullable<DockLoadoutRendererOptions["createHull"]> = (scene, parent, name) => {
  const root = new TransformNode(`${name}-procedural`, scene); root.parent = parent;
  const rudder = new TransformNode(`${name}-rudder`, scene); rudder.parent = root;
  return { root, rudder, propellers: [], bodyMeshes: [] };
};

describe("atomic dock actual and independent inspection roots", () => {
  it("builds the full existing procedural hull and each installed external mount", async () => {
    const { renderer, scene } = fixture();
    expect(await renderer.setLoadout(plan())).toEqual({ status: "applied" });
    const current = renderer.current!;
    expect(current.hull.bodyMeshes.length).toBeGreaterThan(20);
    expect(current.equipment.turrets).toHaveLength(2);
    expect(current.equipment.turrets.map(({ metadata }) => metadata.slotIndex)).toEqual([0, 2]);
    expect(current.equipment.torpedoLaunchers).toHaveLength(1);
    expect(current.equipment.torpedoLaunchers[0]?.metadata.slotIndex).toBe(1);
    const launcher = current.equipment.torpedoLaunchers[0]!;
    expect({ x: launcher.position.x, y: launcher.position.y, z: launcher.position.z }).toEqual(current.plan.torpedo[0]?.position);
    expect(scene.meshes.every((mesh) => Object.values(mesh.position).filter((value) => typeof value === "number").every(Number.isFinite))).toBe(true);
  });

  it("supersedes late ship and loadout results without touching the newer actual root", async () => {
    const old = deferred(), latest = deferred(); let calls = 0;
    const { renderer, scene } = fixture({ createHull: lightHull, loadExternalHull: () => (++calls === 1 ? old : latest).promise });
    const first = renderer.setLoadout(plan("fletcher"));
    const second = renderer.setLoadout(plan("yamato"));
    latest.resolve({});
    expect(await second).toEqual({ status: "applied" });
    const actual = renderer.current!;
    const staleRoot = new TransformNode("late-external", scene);
    CreateBox("stale-mesh", {}, scene).parent = staleRoot;
    old.resolve({ root: staleRoot });
    expect(await first).toEqual({ status: "superseded" });
    expect(staleRoot.isDisposed()).toBe(true);
    expect(renderer.current).toBe(actual);
    expect(actual.plan.shipClassId).toBe("yamato");
  });

  it("keeps the prior complete actual root visible while replacement awaits an external hull", async () => {
    const pending = deferred(); let calls = 0;
    const { renderer } = fixture({ createHull: lightHull, loadExternalHull: () => ++calls === 1 ? Promise.resolve({}) : pending.promise });
    await renderer.setLoadout(plan());
    const old = renderer.current!;
    const update = renderer.setLoadout(plan("yamato"));
    expect(old.root.isEnabled()).toBe(true);
    expect(old.root.isDisposed()).toBe(false);
    pending.resolve({ fallback: true });
    expect(await update).toEqual({ status: "fallback-applied" });
    expect(old.root.isDisposed()).toBe(true);
  });

  it("rolls back equipment construction failure without leaking the partial root", async () => {
    let fail = false;
    const { renderer, counts } = fixture({ createHull: lightHull,
      createEquipment: (...args) => {
        const visual = createLoadoutEquipmentVisual(...args);
        if (fail) throw new Error("required equipment failed");
        return visual;
      } });
    await renderer.setLoadout(plan());
    const before = renderer.current!, baseline = counts(); fail = true;
    expect(await renderer.setLoadout(plan("yamato"))).toEqual({ status: "failed", error: "required equipment failed" });
    expect(renderer.current).toBe(before);
    expect(before.root.isEnabled()).toBe(true);
    expect(counts()).toEqual(baseline);
  });

  it("candidate opening and closing cannot cancel a pending actual transaction", async () => {
    const pending = deferred(); let calls = 0;
    const { renderer } = fixture({ createHull: lightHull, loadExternalHull: () => ++calls === 1 ? Promise.resolve({}) : pending.promise });
    await renderer.setLoadout(plan());
    const actual = renderer.current!;
    const update = renderer.setLoadout(plan("cleveland"));
    renderer.previewEquipment(EQUIPMENT_BY_ID["torpedo-gold"], 1);
    expect(renderer.current).toBe(actual);
    expect(renderer.inspectionRoot?.getChildMeshes().every((mesh) => mesh.material?.alpha === .4)).toBe(true);
    renderer.previewEquipment();
    expect(renderer.inspectionRoot).toBeUndefined();
    expect(actual.root.isDisposed()).toBe(false);
    pending.resolve({});
    expect(await update).toEqual({ status: "applied" });
  });

  it("remembers the latest candidate during first load and draws internal regions through the hull", async () => {
    const pending = deferred();
    const { renderer } = fixture({ createHull: lightHull, loadExternalHull: () => pending.promise });
    const update = renderer.setLoadout(plan());
    renderer.previewEquipment(EQUIPMENT_BY_ID["engine-gold"]);
    renderer.previewEquipment(EQUIPMENT_BY_ID["steering-gold"]);
    pending.resolve({}); await update;
    const marker = renderer.inspectionRoot?.getChildMeshes()[0];
    expect(marker?.name).toContain("steering-gold");
    expect(marker?.renderingGroupId).toBe(3);
    expect(marker?.material?.depthFunction).toBe(Constants.ALWAYS);
    expect(renderer.current?.plan.internalModules.find(({ category }) => category === "steering")?.equipmentId).toBe("steering-redGold");
  });

  it("disposes meshes, nodes and materials after 50 full rebuilds and independent previews", async () => {
    const { renderer, counts } = fixture({ createHull: lightHull });
    await renderer.setLoadout(plan());
    const baseline = counts();
    for (let index = 0; index < 50; ++index) {
      await renderer.setLoadout(plan(index % 2 ? "fletcher" : "cleveland"));
      renderer.previewEquipment(EQUIPMENT_BY_ID["engine-gold"]);
      renderer.previewEquipment(EQUIPMENT_BY_ID["torpedo-purple"], 1);
      renderer.previewEquipment();
      // Historical batteries have more barrels; compare after returning to the same class.
      await renderer.setLoadout(plan());
      expect(counts()).toEqual(baseline);
    }
    renderer.dispose();
    expect(counts().meshes).toBe(0);
    expect(counts().nodes).toBe(1);
  });

  it("disposes a late external result after the preview itself is disposed", async () => {
    const pending = deferred();
    const { renderer, scene } = fixture({ createHull: lightHull, loadExternalHull: () => pending.promise });
    const update = renderer.setLoadout(plan()); renderer.dispose();
    const external = new TransformNode("late", scene); pending.resolve({ root: external });
    expect(await update).toEqual({ status: "superseded" });
    expect(external.isDisposed()).toBe(true);
    expect(scene.transformNodes).toHaveLength(1);
    expect(await renderer.setLoadout(plan())).toMatchObject({ status: "failed" });
  });
});
