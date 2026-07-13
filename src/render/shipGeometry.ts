import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

interface WedgeSpec {
  name: string;
  rearZ: number;
  tipZ: number;
  rearHalfWidth: number;
  topY: number;
  rearBottomY: number;
  tipBottomY: number;
  material: Material;
}

export interface SymmetricBowSpec {
  name: string;
  hullRearZ: number;
  tipZ: number;
  hullHalfWidth: number;
  hullTopY: number;
  hullRearBottomY: number;
  hullTipBottomY: number;
  deckRearZ: number;
  deckHalfWidth: number;
  deckTopY: number;
  deckThickness: number;
  hullMaterial: Material;
  deckMaterial: Material;
}

function createSymmetricWedge(
  scene: Scene,
  parent: TransformNode,
  spec: WedgeSpec,
): Mesh {
  const mesh = new Mesh(spec.name, scene);
  const positions = [
    -spec.rearHalfWidth, spec.topY, spec.rearZ,
    spec.rearHalfWidth, spec.topY, spec.rearZ,
    -spec.rearHalfWidth, spec.rearBottomY, spec.rearZ,
    spec.rearHalfWidth, spec.rearBottomY, spec.rearZ,
    0, spec.topY, spec.tipZ,
    0, spec.tipBottomY, spec.tipZ,
  ];
  const indices = [
    0, 4, 1,
    2, 3, 5,
    0, 2, 5, 0, 5, 4,
    1, 4, 5, 1, 5, 3,
    0, 1, 3, 0, 3, 2,
  ];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);
  mesh.material = spec.material;
  mesh.parent = parent;
  return mesh;
}

export function createSymmetricBow(
  scene: Scene,
  parent: TransformNode,
  spec: SymmetricBowSpec,
): { hull: Mesh; deck: Mesh } {
  const hull = createSymmetricWedge(scene, parent, {
    name: `${spec.name}-hull`,
    rearZ: spec.hullRearZ,
    tipZ: spec.tipZ,
    rearHalfWidth: spec.hullHalfWidth,
    topY: spec.hullTopY,
    rearBottomY: spec.hullRearBottomY,
    tipBottomY: spec.hullTipBottomY,
    material: spec.hullMaterial,
  });
  const deck = createSymmetricWedge(scene, parent, {
    name: `${spec.name}-deck`,
    rearZ: spec.deckRearZ,
    tipZ: spec.tipZ - 0.35,
    rearHalfWidth: spec.deckHalfWidth,
    topY: spec.deckTopY,
    rearBottomY: spec.deckTopY - spec.deckThickness,
    tipBottomY: spec.deckTopY - spec.deckThickness,
    material: spec.deckMaterial,
  });
  return { hull, deck };
}
