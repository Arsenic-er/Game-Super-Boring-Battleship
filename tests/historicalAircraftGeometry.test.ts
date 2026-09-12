import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createAirSquadronGeometry } from "../src/render/aircraftGeometry";
import { aircraftSurfaceYAt } from "../src/render/aircraftMeshBuilder";
import { HISTORICAL_AIRCRAFT_PROFILES, historicalAircraftProfile } from "../src/render/historicalAircraftProfiles";
import type { AircraftRole, Team } from "../src/sim/types";

const CASES: [Team, AircraftRole][] = (["player", "enemy"] as const).flatMap((team) => (["fighter", "diveBomber", "torpedoBomber"] as const).map((role) => [team, role] as [Team, AircraftRole]));
const FORMATIONS: [Team, AircraftRole, number][] = CASES.flatMap(([team, role]) => [1, 6, 10].map((capacity) => [team, role, capacity] as [Team, AircraftRole, number]));
const propellerMesh = (root: ReturnType<typeof createAirSquadronGeometry>["planes"][number]["propeller"]): Mesh => root.getChildMeshes()[0] as Mesh;

function resourceCounts(scene: Scene): number[] {
  return [scene.meshes.length, scene.transformNodes.length, scene.materials.length, scene.multiMaterials.length, scene.getGeometries().length];
}

describe("historical aircraft geometry", () => {
  it("defines six unique support aircraft without a gameplay nationality field", () => {
    const profiles = Object.values(HISTORICAL_AIRCRAFT_PROFILES);
    expect(profiles).toHaveLength(6);
    expect(new Set(CASES.map(([team, role]) => historicalAircraftProfile(team, role).id)).size).toBe(6);
    expect(profiles.every((profile) => profile.year >= 1941 && profile.year <= 1943)).toBe(true);
    expect(profiles.every((profile) => profile.span > profile.length)).toBe(true);
    expect(profiles.every((profile) => profile.wing.at(-1)?.[0] === 1)).toBe(true);
  });

  it.each(FORMATIONS)("builds %s %s x%s with shared geometry, three blades and bounded cost", (team, role, capacity) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const before = resourceCounts(scene);
    const visual = createAirSquadronGeometry(scene, `historic-${team}-${role}`, team, role, capacity);
    const profile = historicalAircraftProfile(team, role);
    const first = visual.planes[0];
    const firstProp = propellerMesh(first.propeller);
    const staticTriangles = (first.body.getTotalIndices() + firstProp.getTotalIndices()) / 3;
    expect(staticTriangles).toBeGreaterThan(800);
    expect(staticTriangles).toBeLessThan(2500);
    expect(first.body.subMeshes.length + firstProp.subMeshes.length).toBe(3);
    expect(first.body.material).toBeInstanceOf(MultiMaterial);
    expect((first.body.material as MultiMaterial).subMaterials).toHaveLength(2);
    expect(first.propeller.getChildMeshes()).toHaveLength(1);
    expect(first.propeller.metadata.bladeCount).toBe(3);
    expect(firstProp.metadata.bladeCount).toBe(3);
    expect(visual.root.metadata.modelId).toBe(profile.id);
    expect(visual.planes).toHaveLength(capacity);
    expect(scene.meshes).toHaveLength(capacity * 2);
    expect(scene.getGeometries()).toHaveLength(2);
    // Middle fuselage ring, positive-X side: the default left-handed normal faces outward.
    expect(first.body.getVerticesData(VertexBuffer.NormalKind)![(5 * 16) * 3]).toBeGreaterThan(0.5);
    const wingRoot = profile.wing[0];
    const wingTop = [0, wingRoot[4] + wingRoot[3] * 0.76, wingRoot[2] + (wingRoot[1] - wingRoot[2]) * 0.58];
    const bodyPositions = first.body.getVerticesData(VertexBuffer.PositionKind)!;
    let wingTopIndex = -1;
    for (let i = 0; i < bodyPositions.length; i += 3) {
      if (wingTop.every((coordinate, axis) => Math.abs(bodyPositions[i + axis] - coordinate) < 1e-5)) {
        wingTopIndex = i;
        break;
      }
    }
    expect(wingTopIndex).toBeGreaterThanOrEqual(0);
    expect(first.body.getVerticesData(VertexBuffer.NormalKind)![wingTopIndex + 1]).toBeGreaterThan(0.5);
    for (const plane of visual.planes) {
      const prop = propellerMesh(plane.propeller);
      expect(plane.body.geometry).toBe(first.body.geometry);
      expect(prop.geometry).toBe(firstProp.geometry);
      expect(plane.body.material).toBe(first.body.material);
      expect(prop.material).toBe(firstProp.material);
      expect(plane.body.metadata.modelId).toBe(profile.id);
      expect(plane.body.parent).toBe(plane.root);
      expect(plane.propeller.parent).toBe(plane.root);
      expect(plane.propeller.position.z).toBeGreaterThan(profile.length * 0.45);
      for (const mesh of [plane.body, prop]) {
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
        const colors = mesh.getVerticesData(VertexBuffer.ColorKind)!;
        expect(positions.every(Number.isFinite)).toBe(true);
        expect(normals.every(Number.isFinite)).toBe(true);
        expect(colors).toHaveLength(positions.length / 3 * 4);
        expect(mesh.getIndices()!.every((index) => index >= 0 && index < positions.length / 3)).toBe(true);
      }
    }
    const bounds = first.body.getBoundingInfo().boundingBox;
    expect(bounds.maximum.x - bounds.minimum.x).toBeCloseTo(profile.span, 3);
    expect(bounds.minimum.z).toBeCloseTo(-profile.length / 2, 3);
    expect(first.propeller.position.z + firstProp.getBoundingInfo().boundingBox.maximum.z).toBeCloseTo(profile.length / 2, 3);
    expect(bounds.maximum.y).toBeGreaterThan(1.3);
    if (profile.features.includes("fixed-spatted-gear")) expect(bounds.minimum.y).toBeLessThan(-1.7);
    visual.root.position.set(-15, 5, 30);
    first.body.computeWorldMatrix(true);
    firstProp.computeWorldMatrix(true);
    const worldBody = first.body.getBoundingInfo().boundingBox;
    const worldProp = firstProp.getBoundingInfo().boundingBox;
    expect(worldBody.maximumWorld.x - worldBody.minimumWorld.x).toBeCloseTo(profile.span, 3);
    expect(Math.min(worldBody.minimumWorld.z, worldProp.minimumWorld.z)).toBeCloseTo(30 - profile.length / 2, 3);
    expect(Math.max(worldBody.maximumWorld.z, worldProp.maximumWorld.z)).toBeCloseTo(30 + profile.length / 2, 3);
    first.propeller.rotation.z = Math.PI / 3;
    if (capacity > 1) expect(visual.planes[1].propeller.rotation.z).toBe(0);
    visual.root.dispose(false, true);
    expect(resourceCounts(scene)).toEqual(before);
    scene.dispose();
    engine.dispose();
  });

  it.each(CASES)("conforms %s %s markings to the actual wing skin without clipping or floating", (team, role) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const visual = createAirSquadronGeometry(scene, "wing-markings", team, role, 1);
    const body = visual.planes[0].body;
    const positions = body.getVerticesData(VertexBuffer.PositionKind)!;
    const indices = body.getIndices()!;
    const ranges = body.metadata.markingRanges as { indexStart: number; indexCount: number; offset: number }[];
    expect(ranges.length).toBe(team === "player" ? 4 : 2);
    for (const range of ranges) {
      expect(range.indexCount).toBeGreaterThan(0);
      expect(range.offset).toBeGreaterThan(0);
      expect(range.offset).toBeLessThanOrEqual(.007);
      for (let i = range.indexStart; i < range.indexStart + range.indexCount; i += 3) {
        const vertices = [indices[i], indices[i + 1], indices[i + 2]].map((index) => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]]);
        const centroid = [0, 1, 2].map((axis) => vertices.reduce((sum, vertex) => sum + vertex[axis], 0) / 3);
        for (const point of [...vertices, centroid]) {
          const skin = aircraftSurfaceYAt(positions, indices, point[0], point[2], body.metadata.wingSurface);
          expect(skin).not.toBeUndefined();
          expect(point[1] - skin!).toBeCloseTo(range.offset, 4);
        }
      }
    }
    visual.root.dispose(false, true);
    scene.dispose(); engine.dispose();
  });

  it("keeps another squadron alive and releases all resources through 50 replacement cycles", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const before = resourceCounts(scene);
    const other = createAirSquadronGeometry(scene, "persistent", "player", "fighter", 2);
    const withOther = resourceCounts(scene);
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const [team, role] = CASES[cycle % CASES.length];
      const visual = createAirSquadronGeometry(scene, `cycle-${cycle}`, team, role, 6);
      if (cycle % 2 === 0) visual.root.dispose(false, true);
      else visual.root.dispose();
      expect(resourceCounts(scene)).toEqual(withOther);
      expect(other.planes[0].body.isDisposed()).toBe(false);
      expect(other.planes[0].body.geometry).not.toBeNull();
      expect(scene.multiMaterials).toContain(other.planes[0].body.material);
    }
    other.root.dispose(false, true);
    expect(resourceCounts(scene)).toEqual(before);
    scene.dispose();
    engine.dispose();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not allocate materials for empty/invalid capacity %s", (capacity) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const before = resourceCounts(scene);
    const visual = createAirSquadronGeometry(scene, "empty", "player", "fighter", capacity);
    expect(visual.planes).toHaveLength(0);
    expect(visual.capacity).toBe(0);
    visual.root.dispose(false, true);
    expect(resourceCounts(scene)).toEqual(before);
    scene.dispose();
    engine.dispose();
  });
});
