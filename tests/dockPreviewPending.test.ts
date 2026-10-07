import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DockPreview } from "../src/render/dockPreview";
import { DockHoverState, DockRenderCadence } from "../src/render/dockInteraction";
import { DockComponentHighlight } from "../src/render/dockComponentHighlight";
import { DockLoadoutRenderer, type DockExternalHullResult, type DockLoadoutRendererOptions } from "../src/render/dockLoadoutRenderer";
import { resolveLoadoutVisualPlan } from "../src/render/loadoutVisualPlan";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import { createDefaultLocalProfile } from "../src/profile/localProfile";

const engines: NullEngine[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const engine of engines.splice(0)) engine.dispose(); });

function topSurface(root: TransformNode): Vector3 {
  let result = Vector3.Zero(), height = -Infinity;
  for (const mesh of root.getChildMeshes()) {
    const positions = mesh.getVerticesData("position"), indices = mesh.getIndices();
    if (!positions || !indices) continue;
    const world = mesh.computeWorldMatrix(true);
    for (let i = 0; i < indices.length; i += 3) {
      const centroid = [0, 1, 2].map(j => Vector3.TransformCoordinates(Vector3.FromArray(positions, indices[i + j]! * 3), world))
        .reduce((a, b) => a.add(b), Vector3.Zero()).scale(1 / 3);
      if (centroid.y > height) { result = centroid; height = centroid.y; }
    }
  }
  return result;
}

async function fixture() {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine), parent = new TransformNode("dock-test", scene);
  const palette = createPixelShipPalette(scene, "pending-test", "ally");
  let delay = false, fail = false;
  const pending: ((result: DockExternalHullResult) => void)[] = [];
  const createHull: NonNullable<DockLoadoutRendererOptions["createHull"]> = (scene, root) => {
    if (fail) throw new Error("Controlled hull failure");
    const hullRoot = new TransformNode("test-hull", scene); hullRoot.parent = root;
    return { root: hullRoot, rudder: new TransformNode("test-rudder", scene), propellers: [], bodyMeshes: [] };
  };
  const renderer = new DockLoadoutRenderer(scene, parent, palette, {
    createHull,
    loadExternalHull: () => delay ? new Promise(resolve => pending.push(resolve)) : Promise.resolve({}),
  });
  const slots = createDefaultLocalProfile().slotLoadoutsByShipClass;
  const initial = resolveLoadoutVisualPlan("fletcher", slots.fletcher);
  await renderer.setLoadout(initial);

  // Exercise actual DockPreview interaction/setLoadout methods with a real
  // NullEngine scene and renderer. Only browser setup, framing and CSS pixels
  // are supplied here; the model swap, ray pick and interaction gates are real.
  const preview = Object.create(DockPreview.prototype) as DockPreview;
  const canvas = {
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
  };
  const internals = preview as unknown as {
    pointer?: { clientX: number; clientY: number };
    updateComponentHover(): void;
    setHover(): void;
  };
  Object.assign(preview, {
    engine, scene, renderer, camera: undefined, canvas,
    requestedPlan: initial, loadoutGeneration: 0, loadoutReady: true, disposed: false,
    orbit: { moving: false }, hover: new DockHoverState(), highlight: new DockComponentHighlight(),
    cadence: new DockRenderCadence(), updateFramingBounds: vi.fn(), fitCamera: vi.fn(),
    handleCancel: () => { internals.pointer = undefined; internals.setHover(); },
  });
  const ray = vi.spyOn(scene, "createPickingRay");
  function pointAtActual() {
    const turret = renderer.current!.equipment.turrets[0]!;
    const target = topSurface(turret);
    ray.mockReturnValue(new Ray(target.add(new Vector3(0, 300, 0)), Vector3.Down(), 600));
  }
  function move() {
    internals.pointer = { clientX: 100, clientY: 100 };
    internals.updateComponentHover();
  }
  pointAtActual();
  return { preview, renderer, canvas, ray, slots, pointAtActual, move, pending,
    setDelay: (value: boolean) => { delay = value; }, setFail: (value: boolean) => { fail = value; } };
}

describe("DockPreview asynchronous loadout interaction gate", () => {
  it.each([false, true])("keeps identical re-resolved loadouts interactive (reuse current model: %s)", async (reuse) => {
    const f = await fixture();
    const oldPlan = f.renderer.current!.plan;
    const same = resolveLoadoutVisualPlan("fletcher", f.slots.fletcher);
    expect(same).not.toBe(oldPlan);
    expect(same.signature).toBe(oldPlan.signature);
    if (reuse) vi.spyOn(f.renderer, "setLoadout").mockResolvedValueOnce({ status: "applied" });
    await f.preview.setLoadout(same);
    f.pointAtActual(); f.move();
    expect(f.preview.getComponentHover()).toMatchObject({ category: "mainGun", slotIndex: 0 });
  });

  it("never offers the still-visible previous ship to clicks while a new ship is pending", async () => {
    const f = await fixture();
    f.move();
    expect(f.preview.getComponentHover()).toMatchObject({ category: "mainGun", slotIndex: 0 });
    const oldRoot = f.renderer.current!.root;
    f.setDelay(true);
    const applied = f.preview.setLoadout(resolveLoadoutVisualPlan("cleveland", f.slots.cleveland));
    expect(f.renderer.current!.root).toBe(oldRoot);
    expect(oldRoot.isEnabled()).toBe(true);
    expect(f.preview.getComponentHover()).toBeUndefined();
    f.ray.mockClear();
    for (let i = 0; i < 4; i++) {
      f.move();
      expect(f.preview.getComponentHover()).toBeUndefined();
      expect(f.canvas.dataset.dockHoverComponent).toBe("");
    }
    expect(f.ray).not.toHaveBeenCalled();
    f.pending.shift()!({});
    await applied;
    f.pointAtActual(); f.move();
    expect(f.renderer.current!.plan.shipClassId).toBe("cleveland");
    expect(f.preview.getComponentHover()).toMatchObject({ category: "mainGun", slotIndex: 0 });
  });

  it("keeps a failed new ship noninteractive instead of selecting equipment on the retained old ship", async () => {
    const f = await fixture();
    f.move();
    expect(f.preview.getComponentHover()).toBeDefined();
    f.setFail(true);
    const result = await f.preview.setLoadout(resolveLoadoutVisualPlan("cleveland", f.slots.cleveland));
    expect(result.status).toBe("failed");
    expect(f.renderer.current!.plan.shipClassId).toBe("fletcher");
    f.ray.mockClear();
    f.move(); f.move();
    expect(f.preview.getComponentHover()).toBeUndefined();
    expect(f.ray).not.toHaveBeenCalled();
  });

  it("does not let an older async completion reopen interaction for a newer pending request", async () => {
    const f = await fixture();
    f.setDelay(true);
    const older = f.preview.setLoadout(resolveLoadoutVisualPlan("cleveland", f.slots.cleveland));
    const newer = f.preview.setLoadout(resolveLoadoutVisualPlan("yamato", f.slots.yamato));
    f.pending.shift()!({});
    expect((await older).status).toBe("superseded");
    f.move();
    expect(f.preview.getComponentHover()).toBeUndefined();
    f.pending.shift()!({});
    await newer;
    f.pointAtActual(); f.move();
    expect(f.renderer.current!.plan.shipClassId).toBe("yamato");
    expect(f.preview.getComponentHover()).toBeDefined();
  });

  it("rejects a requested-plan/actual-plan mismatch even when the previous readiness flag is true", async () => {
    const f = await fixture();
    f.move();
    expect(f.preview.getComponentHover()).toBeDefined();
    await f.renderer.setLoadout(resolveLoadoutVisualPlan("cleveland", f.slots.cleveland));
    expect(f.preview.getComponentHover()).toBeUndefined();
    f.ray.mockClear(); f.move();
    expect(f.ray).not.toHaveBeenCalled();
    expect(f.canvas.dataset.dockHoverComponent).toBe("");
  });
});
