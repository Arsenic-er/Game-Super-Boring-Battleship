import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import {
  ATOLL_MAP,
  terrainHeightAt,
  type AtollTerrainZone,
} from "../maps/atollMap";

export interface AtollTerrainVisual {
  root: TransformNode;
  meshes: Mesh[];
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

function material(
  scene: Scene,
  name: string,
  diffuse: Color3,
  emissive = Color3.Black(),
  alpha = 1,
): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = diffuse;
  result.emissiveColor = emissive;
  result.specularColor = new Color3(0.08, 0.1, 0.09);
  result.specularPower = 12;
  result.alpha = alpha;
  if (alpha < 1) {
    result.disableLighting = true;
    result.backFaceCulling = false;
    result.transparencyMode = Material.MATERIAL_ALPHABLEND;
  }
  result.freeze();
  return result;
}

function zoneSeed(zone: Readonly<AtollTerrainZone>): number {
  let seed = 0;
  for (const character of zone.id) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  return seed / 4_294_967_296 * Math.PI * 2;
}

function createLandMesh(
  scene: Scene,
  zone: Readonly<AtollTerrainZone>,
  surface: StandardMaterial,
): Mesh {
  const mesh = new Mesh(`atoll-${zone.id}`, scene);
  const segments = zone.kind === "mountain" ? 20 : 16;
  const rings = zone.kind === "mountain" ? 5 : 3;
  const positions: number[] = [zone.x, terrainHeightAt(ATOLL_MAP.id, zone.x, zone.z), zone.z];
  const indices: number[] = [];
  const seed = zoneSeed(zone);
  const cosine = Math.cos(zone.rotation);
  const sine = Math.sin(zone.rotation);
  for (let ring = 1; ring <= rings; ring += 1) {
    const baseRadius = ring / rings;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      const irregularity = 1
        + Math.sin(angle * 3 + seed) * 0.055
        + Math.sin(angle * 7 - seed * 0.7) * 0.025;
      const radial = Math.min(0.995, baseRadius * irregularity);
      const localX = Math.cos(angle) * zone.radiusX * radial;
      const localZ = Math.sin(angle) * zone.radiusZ * radial;
      const x = zone.x + localX * cosine + localZ * sine;
      const z = zone.z - localX * sine + localZ * cosine;
      positions.push(x, Math.max(0.15, terrainHeightAt(ATOLL_MAP.id, x, z)), z);
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + segment, 1 + (segment + 1) % segments);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const innerStart = 1 + (ring - 1) * segments;
    const outerStart = 1 + ring * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const inner = innerStart + segment;
      const innerNext = innerStart + next;
      const outer = outerStart + segment;
      const outerNext = outerStart + next;
      indices.push(inner, outer, outerNext, inner, outerNext, innerNext);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);
  mesh.material = surface;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

export function createAtollTerrain(scene: Scene): AtollTerrainVisual {
  const root = new TransformNode("atoll-terrain-root", scene);
  const shallow = material(
    scene,
    "atoll-shallow-water",
    new Color3(0.16, 0.72, 0.72),
    new Color3(0.02, 0.18, 0.18),
    0.42,
  );
  const sand = material(
    scene,
    "atoll-sand",
    new Color3(0.78, 0.68, 0.43),
    new Color3(0.08, 0.065, 0.025),
  );
  const mountain = material(
    scene,
    "atoll-mountain",
    new Color3(0.18, 0.29, 0.2),
    new Color3(0.015, 0.025, 0.018),
  );
  const meshes: Mesh[] = [];
  for (const zone of ATOLL_MAP.terrain) {
    if (zone.kind === "shallow") {
      const shelf = CreateCylinder(`atoll-${zone.id}`, {
        diameter: 2,
        height: 0.18,
        tessellation: 24,
      }, scene);
      shelf.position.set(zone.x, -0.68, zone.z);
      shelf.rotation.y = zone.rotation;
      shelf.scaling.set(zone.radiusX, 1, zone.radiusZ);
      shelf.material = shallow;
      shelf.isPickable = false;
      shelf.alphaIndex = 1;
      shelf.parent = root;
      shelf.freezeWorldMatrix();
      meshes.push(shelf);
      continue;
    }
    const land = createLandMesh(scene, zone, zone.kind === "mountain" ? mountain : sand);
    land.parent = root;
    meshes.push(land);
  }
  return {
    root,
    meshes,
    setEnabled: (enabled) => root.setEnabled(enabled),
    dispose: () => {
      root.dispose(false, true);
      shallow.dispose();
      sand.dispose();
      mountain.dispose();
    },
  };
}
