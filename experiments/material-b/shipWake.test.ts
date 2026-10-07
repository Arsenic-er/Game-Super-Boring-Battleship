import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabShipWake, type LabWakeState } from "./shipWake";

describe("isolated lab ship wake", () => {
  let engine: NullEngine, scene: Scene, camera: FreeCamera;
  let wake: ReturnType<typeof createLabShipWake>;
  let heightAt: ReturnType<typeof vi.fn<(x: number, z: number, seconds: number) => number>>;
  let near: Mesh, trail: Mesh;
  let disposed: boolean;
  let baseMaterials: number, baseTextures: number;
  const stateAt = (seconds: number, speedMps = 9.26): LabWakeState =>
    ({ x: 0, z: seconds * 9.26, heading: 0, speedMps });
  const dispose = () => { if (!disposed) { wake.dispose(); disposed = true; } };
  const sail = (seconds = 10) => {
    wake.update(0, stateAt(0));
    for (let i = 1; i <= seconds * 30; i++) wake.update(i / 30, stateAt(i / 30));
  };

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new FreeCamera("wake-test-camera", new Vector3(0, 30, -100), scene);
    camera.getViewMatrix(true);
    baseMaterials = scene.materials.length;
    baseTextures = scene.textures.length;
    heightAt = vi.fn((x: number, z: number, seconds: number) =>
      7 + Math.sin(x * .02 + z * .01 + seconds * .1) * .2);
    wake = createLabShipWake(scene, heightAt);
    near = scene.getMeshByName("lab-ship-near-waves") as Mesh;
    trail = scene.getMeshByName("lab-ship-world-trail") as Mesh;
    disposed = false;
  });
  afterEach(() => {
    dispose();
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
  });

  it("emits no forward wake at zero/reverse speed, dt0 or first update", () => {
    wake.update(0, stateAt(0, 0));
    expect(wake.snapshot().activeDraws).toBe(0);
    wake.update(0, stateAt(0));
    wake.update(0, stateAt(0));
    expect(wake.snapshot().trailPointCount).toBe(0);
    wake.update(1, stateAt(1, -2));
    expect(wake.snapshot().emitting).toBe(false);
    expect(wake.snapshot().activeDraws).toBe(0);
    wake.reset();
    wake.update(100, { x: 10_000, z: 10_000, heading: 1, speedMps: 9.26 });
    expect(wake.snapshot().trailPointCount).toBe(0);
    wake.update(101, { x: 10_005, z: 10_005, heading: 1, speedMps: 9.26 });
    expect(wake.snapshot().trailPointCount).toBe(1);
    expect(wake.snapshot().trailSegments).toBe(0);
  });

  it("samples by distance at dt1/30 and uses the injected water height", () => {
    sail(20);
    const snapshot = wake.snapshot();
    expect(snapshot.trailPointCount).toBeGreaterThan(40);
    expect(snapshot.trailPointCount).toBeLessThan(55);
    const positions = trail.getVerticesData(VertexBuffer.PositionKind)!;
    expect(positions[1]).toBeCloseTo(
      heightAt(positions[0]!, positions[2]!, 20) + .045, 5);
    expect(snapshot.maxDraws).toBe(2);
    expect(snapshot.maxTriangles).toBe(1464);
    expect(snapshot.activeDraws).toBeLessThanOrEqual(2);
  });

  it("keeps old trail centres fixed in world space through a turn", () => {
    sail(20);
    const old = new Map(wake.snapshot().points.map(point => [point.born, { x: point.x, z: point.z }]));
    for (let i = 1; i <= 150; i++) {
      const seconds = 20 + i / 30;
      wake.update(seconds, { x: (seconds - 20) * 9.26, z: 185.2,
        heading: Math.PI / 2, speedMps: 9.26 });
    }
    let shared = 0;
    for (const point of wake.snapshot().points) {
      const previous = old.get(point.born);
      if (previous) {
        shared++;
        expect({ x: point.x, z: point.z }).toEqual(previous);
      }
    }
    expect(shared).toBe(old.size);
  });

  it("stops fresh emission but fades existing history instead of deleting it", () => {
    sail(10);
    const before = wake.snapshot();
    wake.update(10, { ...stateAt(10), speedMps: 0 });
    expect(wake.snapshot().trailPointCount).toBe(before.trailPointCount);
    expect(wake.snapshot().activeDraws).toBe(1);
    expect(wake.snapshot().emitting).toBe(false);
    const alphaBefore = trail.getVerticesData(VertexBuffer.ColorKind)![2 * 4 + 3]!;
    wake.update(25, { ...stateAt(10), speedMps: 0 });
    const alphaAfter = trail.getVerticesData(VertexBuffer.ColorKind)![2 * 4 + 3]!;
    expect(wake.snapshot().trailPointCount).toBeGreaterThan(0);
    expect(alphaAfter).toBeGreaterThan(0);
    expect(alphaAfter).toBeLessThan(alphaBefore);
    wake.update(53, { ...stateAt(10), speedMps: 0 });
    expect(wake.snapshot().trailPointCount).toBe(0);
    expect(wake.snapshot().activeDraws).toBe(0);
  });

  it("continues recording while hidden and restores visibility without new vertex buffers", () => {
    sail(5);
    const count = wake.snapshot().trailPointCount;
    const vertexBuffer = trail.getVertexBuffer(VertexBuffer.PositionKind);
    const nearVertexBuffer = near.getVertexBuffer(VertexBuffer.PositionKind);
    const meshCount = scene.meshes.length;
    wake.setVisible(false);
    for (let i = 151; i <= 300; i++) wake.update(i / 30, stateAt(i / 30));
    expect(wake.snapshot().trailPointCount).toBeGreaterThan(count);
    expect(wake.snapshot().activeDraws).toBe(0);
    expect(wake.snapshot().visible).toBe(false);
    const positions = trail.getVerticesData(VertexBuffer.PositionKind)!;
    expect(positions[1]).toBeCloseTo(heightAt(positions[0]!, positions[2]!, 10) + .045, 5);
    wake.setVisible(true);
    wake.update(10, stateAt(10));
    expect(wake.snapshot().activeDraws).toBe(2);
    expect(trail.getVertexBuffer(VertexBuffer.PositionKind)).toBe(vertexBuffer);
    expect(near.getVertexBuffer(VertexBuffer.PositionKind)).toBe(nearVertexBuffer);
    expect(scene.meshes.length).toBe(meshCount);
    wake.setVisible(false);
    wake.reset();
    expect(wake.snapshot().visible).toBe(false);
    expect(wake.snapshot().trailPointCount).toBe(0);
  });

  it("resets history on a time rollback without creating a cross-scene strip", () => {
    sail(10);
    wake.update(1, { x: 5000, z: 5000, heading: -.2, speedMps: 9.26 });
    expect(wake.snapshot().trailPointCount).toBe(0);
    expect(wake.snapshot().trailSegments).toBe(0);
    wake.update(2, { x: 5000, z: 5010, heading: -.2, speedMps: 9.26 });
    expect(wake.snapshot().trailPointCount).toBe(1);
    expect(wake.snapshot().trailSegments).toBe(0);
  });

  it("does not rebuild paused buffers but refreshes camera and fog uniforms", () => {
    sail(10);
    const nearUpload = vi.spyOn(near, "updateVerticesData");
    const trailUpload = vi.spyOn(trail, "updateVerticesData");
    const topology = vi.spyOn(trail, "setIndices");
    const material = near.material as ShaderMaterial;
    const uniform = vi.spyOn(material, "setVector4");
    heightAt.mockClear();
    camera.position.set(12, 34, 56);
    camera.getViewMatrix(true);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = .0003;
    scene.fogColor.set(.7, .8, .9);
    const before = wake.snapshot().points;
    for (let i = 0; i < 30; i++) wake.update(10, stateAt(10));
    expect(nearUpload).not.toHaveBeenCalled();
    expect(trailUpload).not.toHaveBeenCalled();
    expect(topology).not.toHaveBeenCalled();
    expect(heightAt).not.toHaveBeenCalled();
    expect(wake.snapshot().points).toEqual(before);
    expect(uniform).toHaveBeenCalledWith("eye", expect.objectContaining({ x: 12, y: 34, z: 56 }));
    expect(uniform).toHaveBeenCalledWith("fogInfo", expect.objectContaining({ x: Scene.FOGMODE_EXP2, w: .0003 }));
    expect(uniform).toHaveBeenCalledWith("fogTint", expect.objectContaining({ x: .7, y: .8, z: .9 }));
    // A pose edit at the same time is not a paused-identical frame.
    wake.update(10, { ...stateAt(10), heading: .1 });
    expect(nearUpload).toHaveBeenCalled();
    expect(trailUpload).toHaveBeenCalled();
    expect(wake.snapshot().points).toEqual(before);
  });

  it("interpolates position, birth time and heading from the same retained anchor", () => {
    const poseForStern = (x: number, z: number, heading: number): LabWakeState => ({
      x: x + Math.sin(heading) * 54.35,
      z: z + Math.cos(heading) * 54.35,
      heading, speedMps: 4,
    });
    wake.update(0, poseForStern(0, 0, 0));
    wake.update(1, poseForStern(0, 0, 0));
    wake.update(2, poseForStern(2, 0, .2)); // under 4m: anchor remains at time 1, heading 0
    wake.update(5, poseForStern(10, 0, .6));
    const first = wake.snapshot().points;
    expect(first).toHaveLength(3);
    expect(first[1]!.x).toBeCloseTo(4, 10);
    expect(first[1]!.z).toBeCloseTo(0, 10);
    expect(first[1]!.born).toBeCloseTo(2.6, 10);
    expect(first[1]!.heading).toBeCloseTo(.24, 10);
    expect(first[2]!.x).toBeCloseTo(8, 10);
    expect(first[2]!.born).toBeCloseTo(4.2, 10);
    expect(first[2]!.heading).toBeCloseTo(.48, 10);
    wake.update(6, poseForStern(11.5, 0, .75)); // still below 4m from the consumed anchor
    wake.update(9, poseForStern(16, 0, 1.2));
    const second = wake.snapshot().points;
    expect(second).toHaveLength(5);
    expect(second[3]!.x).toBeCloseTo(12, 10);
    expect(second[3]!.born).toBeCloseTo(6.6, 10);
    expect(second[3]!.heading).toBeCloseTo(.84, 10);
    expect(second[4]!.x).toBeCloseTo(16, 10);
    expect(second[4]!.born).toBeCloseTo(9, 10);
    expect(second[4]!.heading).toBeCloseTo(1.2, 10);
  });

  it("releases both meshes, shared material and shared texture on dispose", () => {
    sail(2);
    const material = near.material as ShaderMaterial;
    const texture = material.getActiveTextures()[0]!;
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    dispose();
    expect(near.isDisposed()).toBe(true);
    expect(trail.isDisposed()).toBe(true);
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(scene.materials.length).toBe(baseMaterials);
    expect(scene.textures.length).toBe(baseTextures);
  });
});
