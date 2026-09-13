import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DockHoverState, DockOrbitMotion, DockRenderCadence, DOCK_ORBIT_LIMITS, DOCK_DEFAULT_ORBIT, dockFraming, dockFramingRadius,
  pickDockComponent, type DockBounds, type DockComponentHover } from "../src/render/dockInteraction";
import { DockLoadoutRenderer, type DockLoadoutRendererOptions } from "../src/render/dockLoadoutRenderer";
import { resolveLoadoutVisualPlan } from "../src/render/loadoutVisualPlan";
import { createPixelShipPalette } from "../src/render/shipMaterials";
import { SHIP_CLASSES, type ShipClassId } from "../src/ships/classes";
import type { InstalledEquipmentIds } from "../src/sim/types";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
const slots: InstalledEquipmentIds = {
  mainGun: ["mainGun-common", null, "mainGun-gold"], torpedo: [null, "torpedo-redGold"],
  antiAir: ["antiAir-common", null, "antiAir-purple"], sideGun: [null, "sideGun-gold"],
  depthCharge: ["depthCharge-redGold"], magazine: ["magazine-gold"],
  engine: ["engine-purple"], steering: ["steering-redGold"],
};
const lightHull: NonNullable<DockLoadoutRendererOptions["createHull"]> = (scene, parent) => {
  const root = new TransformNode("test-hull", scene); root.parent = parent;
  const rudder = new TransformNode("test-rudder", scene); rudder.parent = root;
  return { root, rudder, propellers: [], bodyMeshes: [] };
};
async function fixture(realHull = false) {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine), parent = new TransformNode("test-dock", scene);
  const palette = createPixelShipPalette(scene, "test-dock", "ally");
  const renderer = new DockLoadoutRenderer(scene, parent, palette, realHull ? {} : { createHull: lightHull });
  await renderer.setLoadout(resolveLoadoutVisualPlan("fletcher", slots));
  return { scene, parent, renderer };
}
function worldBounds(root: TransformNode): DockBounds {
  const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  const points: Vector3[] = [];
  for (const mesh of root.getChildMeshes()) {
    if (!mesh.isEnabled() || !mesh.isVisible || !mesh.getTotalVertices()) continue;
    mesh.computeWorldMatrix(true);
    minimum.minimizeInPlace(mesh.getBoundingInfo().boundingBox.minimumWorld);
    maximum.maximizeInPlace(mesh.getBoundingInfo().boundingBox.maximumWorld);
    const positions = mesh.getVerticesData("position")!;
    for (let i = 0; i < positions.length; i += 3) points.push(Vector3.TransformCoordinates(Vector3.FromArray(positions, i), mesh.getWorldMatrix()));
  }
  return { minimum, maximum, points };
}
function projectedExtents(bounds: DockBounds, aspect: number) {
  const { alpha, beta } = DOCK_DEFAULT_ORBIT, framing = dockFraming(bounds, aspect);
  const center = new Vector3(framing.target.x, framing.target.y, framing.target.z);
  const position = center.add(new Vector3(Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta)).scale(framing.radius));
  const transform = Matrix.LookAtLH(position, center, Vector3.Up()).multiply(Matrix.PerspectiveFovLH(.8, aspect, .1, 10_000));
  const project = (point: Vector3) => Vector3.Project(point, Matrix.IdentityReadOnly, transform, new Viewport(0, 0, aspect * 1_000, 1_000));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
  for (const vertex of bounds.points!) {
    const p = project(new Vector3(vertex.x, vertex.y, vertex.z));
    minX = Math.min(minX, p.x / (aspect * 1_000)); maxX = Math.max(maxX, p.x / (aspect * 1_000));
    minY = Math.min(minY, p.y / 1_000); maxY = Math.max(maxY, p.y / 1_000); minZ = Math.min(minZ, p.z);
  }
  return { minX, maxX, minY, maxY, minZ, project };
}
/** Aim at an actual exposed triangle interior, not a potentially empty merged-mesh box centre. */
function topSurface(root: TransformNode, direction = Vector3.Up()): Vector3 {
  let point = Vector3.Zero(), score = -Infinity;
  for (const mesh of root.getChildMeshes()) {
    const positions = mesh.getVerticesData("position"), indices = mesh.getIndices();
    if (!positions || !indices) continue;
    const world = mesh.computeWorldMatrix(true);
    for (let i = 0; i < indices.length; i += 3) {
      const a = Vector3.TransformCoordinates(Vector3.FromArray(positions, indices[i]! * 3), world);
      const b = Vector3.TransformCoordinates(Vector3.FromArray(positions, indices[i + 1]! * 3), world);
      const c = Vector3.TransformCoordinates(Vector3.FromArray(positions, indices[i + 2]! * 3), world);
      const centroid = a.add(b).add(c).scale(1 / 3);
      const facingScore = Vector3.Dot(centroid, direction);
      if (facingScore > score) { score = facingScore; point = centroid; }
    }
  }
  return point;
}

describe("dock frame cadence and bounded camera motion", () => {
  it.each([60, 120, 144])("targets 60 active FPS at a %s Hz display without returning to the old 20 FPS cap", (hz) => {
    const cadence = new DockRenderCadence(); cadence.request(0, 3_000);
    let renders = 0;
    for (let frame = 0; frame < hz * 2; frame++) if (cadence.takeFrame(frame * 1_000 / hz, true)) renders++;
    expect(renders).toBeGreaterThanOrEqual(119); expect(renders).toBeLessThanOrEqual(121);
  });
  it("rests near 8 FPS, sleeps while hidden and wakes immediately for interaction", () => {
    const cadence = new DockRenderCadence();
    let renders = 0;
    for (let frame = 0; frame < 120; frame++) if (cadence.takeFrame(frame * 1_000 / 60, true)) renders++;
    expect(renders).toBe(16);
    expect(cadence.takeFrame(2_001, false, true)).toBe(false);
    cadence.request(2_010);
    expect(cadence.takeFrame(2_010, true)).toBe(true);
    expect(cadence.takeFrame(2_011, true)).toBe(false);
    expect(cadence.takeFrame(2_027, true)).toBe(true);
  });
  it("keeps a settling camera active even after pointer input stops", () => {
    const cadence = new DockRenderCadence();
    expect(cadence.takeFrame(0, true, true)).toBe(true);
    expect(cadence.takeFrame(17, true, true)).toBe(true);
    expect(cadence.takeFrame(34, true, true)).toBe(true);
  });
  it("damps wheel and drag input rather than snapping, then settles", () => {
    const motion = new DockOrbitMotion(), before = { ...motion.pose };
    motion.rotate(100, -30); motion.zoom(-200);
    expect(motion.pose).toEqual(before);
    motion.step(1 / 60);
    expect(motion.pose.alpha).toBeLessThan(before.alpha);
    expect(motion.pose.radius).toBeLessThan(before.radius);
    expect(motion.pose.radius).toBeGreaterThan(118);
    for (let i = 0; i < 100; i++) motion.step(1 / 60);
    expect(motion.moving).toBe(false);
  });
  it("has the same one-second response at 30 and 60 steps", () => {
    const a = new DockOrbitMotion(), b = new DockOrbitMotion();
    for (const motion of [a, b]) { motion.rotate(90, 35); motion.zoom(160); }
    for (let i = 0; i < 30; i++) a.step(1 / 30);
    for (let i = 0; i < 60; i++) b.step(1 / 60);
    expect(a.pose.alpha).toBeCloseTo(b.pose.alpha, 7);
    expect(a.pose.beta).toBeCloseTo(b.pose.beta, 7);
    expect(a.pose.radius).toBeCloseTo(b.pose.radius, 7);
  });
  it("never flips over or zooms through the hull under extreme/invalid input", () => {
    const motion = new DockOrbitMotion();
    for (let i = 0; i < 80; i++) { motion.rotate(1_000, -1_000); motion.zoom(-1_000); motion.step(.1); }
    expect(motion.pose.beta).toBeLessThanOrEqual(DOCK_ORBIT_LIMITS.maximumBeta);
    expect(motion.pose.radius).toBeGreaterThanOrEqual(118);
    for (let i = 0; i < 80; i++) { motion.rotate(-1_000, 1_000); motion.zoom(1_000); motion.step(.1); }
    motion.rotate(NaN, Infinity); motion.zoom(NaN); motion.step(Infinity);
    expect(Object.values(motion.pose).every(Number.isFinite)).toBe(true);
    expect(motion.pose.beta).toBeGreaterThanOrEqual(DOCK_ORBIT_LIMITS.minimumBeta);
    expect(motion.pose.radius).toBeLessThanOrEqual(360);
  });
  it("preserves rotation and relative user zoom during aspect reframing", () => {
    const motion = new DockOrbitMotion();
    motion.setFraming(200, true); motion.rotate(80, 20); motion.zoom(-120);
    for (let i = 0; i < 100; i++) motion.step(1 / 60);
    const before = { ...motion.pose }, zoom = motion.zoomRatio;
    motion.setFraming(320);
    expect(motion.pose.alpha).toBe(before.alpha); expect(motion.pose.beta).toBe(before.beta);
    expect(motion.zoomRatio).toBeCloseTo(zoom, 10);
    expect(motion.pose.radius / before.radius).toBeCloseTo(1.6, 10);
    motion.setFraming(180, true); expect(motion.zoomRatio).toBe(1);
  });

  it("fits all real hull vertices and masts, with an 80-85% wide ship at the actual 1280x720 port aspect", async () => {
    const { renderer } = await fixture(true);
    const portAspect = (1_280 * .83) / (720 * .65);
    for (const shipClassId of Object.keys(SHIP_CLASSES) as ShipClassId[]) {
      await renderer.setLoadout(resolveLoadoutVisualPlan(shipClassId, slots));
      const bounds = worldBounds(renderer.current!.root);
      for (const aspect of [.7, 1.5, portAspect, 2.8]) {
        const extents = projectedExtents(bounds, aspect);
        expect(extents.minX, shipClassId).toBeGreaterThanOrEqual(.07999);
        expect(extents.maxX, shipClassId).toBeLessThanOrEqual(.92001);
        expect(extents.minY, shipClassId).toBeGreaterThanOrEqual(.04999);
        expect(extents.maxY, shipClassId).toBeLessThanOrEqual(.95001);
        expect(extents.minZ, shipClassId).toBeGreaterThan(0);
        if (aspect === portAspect) {
          expect(extents.maxX - extents.minX, shipClassId).toBeGreaterThanOrEqual(.8);
          expect(extents.maxX - extents.minX, shipClassId).toBeLessThanOrEqual(.85);
        }
      }
    }
  }, 15_000);

  it("faces the bow right/down and avoids invented mast-height bow corners on an asymmetric long ship", () => {
    const points = [
      new Vector3(-8, -4, -150), new Vector3(8, -4, -150), new Vector3(-8, 6, -150), new Vector3(8, 6, -150),
      new Vector3(-6, -4, 125), new Vector3(6, -4, 125), new Vector3(-6, 9, 125), new Vector3(6, 9, 125),
      new Vector3(0, 58, -25), new Vector3(0, 43, 18),
    ];
    const bounds: DockBounds = { minimum: new Vector3(-8, -4, -150), maximum: new Vector3(8, 58, 125), points };
    const aspect = 2.27, actual = projectedExtents(bounds, aspect);
    expect(dockFramingRadius(bounds, aspect)).toBeLessThan(dockFramingRadius({ minimum: bounds.minimum, maximum: bounds.maximum }, aspect));
    expect(actual.maxX - actual.minX).toBeGreaterThan(.8);
    expect(actual.maxY).toBeLessThan(.95); expect(actual.minY).toBeGreaterThan(.05);
    const stern = actual.project(new Vector3(0, 6, -150)), bow = actual.project(new Vector3(0, 6, 125));
    expect(bow.x).toBeGreaterThan(stern.x);
    expect(bow.y).toBeGreaterThan(stern.y);
    expect(new DockOrbitMotion().pose.alpha).toBe(DOCK_DEFAULT_ORBIT.alpha);
    expect(new DockOrbitMotion().pose.beta).toBe(DOCK_DEFAULT_ORBIT.beta);
  });

});

describe("real dock component picking and transient hover", () => {
  it("resolves visible historical equipment triangles to actual per-slot IDs, including holes", async () => {
    const { renderer, scene } = await fixture();
    const actual = renderer.current!;
    for (const [category, slotIndex, equipmentId] of [
      ["mainGun", 2, "mainGun-gold"], ["torpedo", 1, "torpedo-redGold"],
      ["antiAir", 2, "antiAir-purple"], ["sideGun", 1, "sideGun-gold"], ["depthCharge", 0, "depthCharge-redGold"],
    ] as const) {
      const node = actual.equipment.root.getDescendants().find((entry) => entry.metadata?.category === category
        && entry.metadata?.slotIndex === slotIndex && entry.metadata?.equipmentId === equipmentId) as TransformNode;
      expect(node).toBeDefined();
      // The real launcher can be occluded by an aft turret from above. Find a
      // visible face among five bounded views; retain all actual model occluders.
      const directions = [Vector3.Up(), new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
        new Vector3(0, 0, 1), new Vector3(0, 0, -1)];
      const picked = directions.map((direction) => {
        const surface = topSurface(node, direction);
        return pickDockComponent(scene, actual,
          new Ray(surface.add(direction.scale(100)), direction.negate(), 200), 123, 45);
      });
      expect(picked, equipmentId).toContainEqual({
        category, slotIndex, equipmentId, canvasX: 123, canvasY: 45, internal: false,
      });
    }
  });
  it("respects opaque hull occlusion even when the hull's gameplay isPickable flag is false", async () => {
    const { renderer, scene } = await fixture(), actual = renderer.current!;
    const node = actual.equipment.turrets[0]!, surface = topSurface(node);
    const occluder = CreateBox("opaque-hull-occluder", { size: 8 }, scene);
    occluder.parent = actual.root; occluder.position.copyFrom(surface.add(new Vector3(0, 20, 0)));
    occluder.isPickable = false; occluder.computeWorldMatrix(true);
    const ray = new Ray(surface.add(new Vector3(0, 100, 0)), Vector3.Down(), 200);
    expect(pickDockComponent(scene, actual, ray, 0, 0)).toBeUndefined();
    occluder.setEnabled(false);
    expect(pickDockComponent(scene, actual, ray, 0, 0)?.category).toBe("mainGun");
  });
  it("cannot pick a ghost or a disabled actual model", async () => {
    const { renderer, scene, parent } = await fixture(), actual = renderer.current!;
    const surface = topSurface(actual.equipment.turrets[0]!);
    const ghost = CreateBox("inspection-ghost", { size: 10 }, scene); ghost.parent = parent;
    ghost.position.copyFrom(surface.add(new Vector3(0, 15, 0)));
    ghost.metadata = { category: "engine", slotIndex: 0, equipmentId: "engine-purple" };
    const ray = new Ray(surface.add(new Vector3(0, 100, 0)), Vector3.Down(), 200);
    expect(pickDockComponent(scene, actual, ray, 0, 0)?.category).toBe("mainGun");
    actual.root.setEnabled(false);
    expect(pickDockComponent(scene, actual, ray, 0, 0)).toBeUndefined();
  });
  it("shows internal equipment only on the corresponding nearby hull region, in the actual transformed frame", async () => {
    const { renderer, scene, parent } = await fixture(), actual = renderer.current!;
    actual.equipment.root.setEnabled(false);
    const hull = CreateBox("test-hull-skin", { width: 10, height: 5, depth: 110 }, scene);
    hull.parent = actual.hull.root; hull.position.y = 2;
    parent.position.set(30, 12, -80); parent.rotation.y = .7;
    actual.root.scaling.set(1.3, 1.7, 2);
    const world = actual.root.computeWorldMatrix(true);
    const pickAt = (x: number, z: number) => {
      const origin = Vector3.TransformCoordinates(new Vector3(x, 100, z), world);
      return pickDockComponent(scene, actual, new Ray(origin, Vector3.Down(), 300), 80, 60);
    };
    expect(pickAt(0, -10)).toMatchObject({ category: "engine", equipmentId: "engine-purple", internal: true });
    expect(pickAt(0, 24)).toMatchObject({ category: "magazine", equipmentId: "magazine-gold", internal: true });
    expect(pickAt(0, -43)).toMatchObject({ category: "steering", equipmentId: "steering-redGold", internal: true });
    expect(pickAt(0, 8)).toBeUndefined();
    expect(pickAt(30, -10)).toBeUndefined();
  });
  it("clears hover while dragging or leaving, emits only changes, and protects its cached value", () => {
    const hover = new DockHoverState(), callback = vi.fn();
    const item: DockComponentHover = { category: "mainGun", slotIndex: 2, equipmentId: "mainGun-gold",
      canvasX: 10, canvasY: 20, internal: false };
    hover.subscribe(callback); expect(callback).toHaveBeenLastCalledWith(undefined);
    hover.update(item); expect(hover.current).toEqual(item);
    const copy = hover.current!; copy.equipmentId = "wrong";
    expect(hover.current?.equipmentId).toBe(item.equipmentId);
    hover.update({ ...item, canvasX: 10.2 }); expect(callback).toHaveBeenCalledTimes(2);
    hover.update(item, true); expect(hover.current).toBeUndefined();
    expect(callback).toHaveBeenLastCalledWith(undefined);
    hover.update(item); hover.update(); expect(hover.current).toBeUndefined();
    hover.subscribe(undefined); hover.update(item); expect(callback).toHaveBeenCalledTimes(5);
  });
});
