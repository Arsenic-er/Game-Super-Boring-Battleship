import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import {
  ATOLL_MAP,
  terrainHeightAt,
  terrainContour,
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

function terrainVertexColor(
  zone: Readonly<AtollTerrainZone>,
  height: number,
): [number, number, number, number] {
  if (zone.kind === "shallow") return [.55, .65, .46, 1];
  if (zone.kind === "sandbar") {
    const ratio = Math.min(1, height / Math.max(1, zone.heightMeters ?? 1));
    return [.76 + ratio * .18, .66 + ratio * .17, .4 + ratio * .12, 1];
  }
  const ratio = Math.min(1, height / Math.max(1, zone.heightMeters ?? 1));
  if (ratio < .3) return [.18 + ratio * .24, .34 + ratio * .2, .2 + ratio * .14, 1];
  if (ratio < .62) return [.32 + ratio * .14, .42 + ratio * .1, .28 + ratio * .07, 1];
  return [.46 + ratio * .12, .46 + ratio * .1, .4 + ratio * .1, 1];
}

function createTerrainMesh(
  scene: Scene,
  zone: Readonly<AtollTerrainZone>,
  surface: StandardMaterial,
): Mesh {
  const mesh = new Mesh(`atoll-${zone.id}`, scene);
  const segments = zone.kind === "mountain" ? 32 : 28;
  const rings = zone.kind === "mountain" ? 7 : zone.kind === "sandbar" ? 3 : 1;
  const centerHeight = zone.kind === "shallow"
    ? -(zone.depthMeters ?? 9) : terrainHeightAt(ATOLL_MAP.id, zone.x, zone.z);
  const positions: number[] = [zone.x, centerHeight, zone.z];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    const radial = ring / rings;
    const contour = terrainContour(zone, segments, radial);
    for (const point of contour) {
      const height = zone.kind === "shallow"
        ? -(zone.depthMeters ?? 9) - radial * radial * 6
        : ring === rings ? -2 : terrainHeightAt(ATOLL_MAP.id, point.x, point.z);
      positions.push(point.x, height, point.z);
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
  const colors: number[] = [];
  for (let offset = 1; offset < positions.length; offset += 3) {
    colors.push(...terrainVertexColor(zone, positions[offset]!));
  }
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.applyToMesh(mesh);
  mesh.material = surface;
  mesh.isPickable = false;
  return mesh;
}

export function createAtollTerrain(scene: Scene): AtollTerrainVisual {
  const root = new TransformNode("atoll-terrain-root", scene);
  const shallow = material(
    scene,
    "atoll-shallow-seabed",
    Color3.White(),
    new Color3(0.055, 0.075, 0.035),
  );
  const sand = material(
    scene,
    "atoll-sand",
    Color3.White(),
    new Color3(0.12, 0.1, 0.04),
  );
  const mountain = material(
    scene,
    "atoll-mountain",
    Color3.White(),
    new Color3(0.03, 0.05, 0.035),
  );
  const meshes: Mesh[] = [];
  for (const zone of ATOLL_MAP.terrain) {
    const terrain = createTerrainMesh(
      scene, zone, zone.kind === "mountain" ? mountain : zone.kind === "sandbar" ? sand : shallow,
    );
    terrain.alphaIndex = zone.kind === "shallow" ? 1 : 0;
    terrain.parent = root;
    terrain.freezeWorldMatrix();
    meshes.push(terrain);
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
