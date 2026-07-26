import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
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

export interface DestroyerHullSpec {
  name: string;
  length: number;
  beam: number;
  hullMaterial: Material;
  deckMaterial: Material;
}

export interface DestroyerV2Palette {
  deck: Material;
  structure: Material;
  dark: Material;
  accent: Material;
}

export const DESTROYER_V2_HARDPOINTS = {
  mainGun: { x: 0, y: 6.6, z: 31 },
  torpedoLauncher: { x: 0, y: 6.05, z: -21 },
} as const;

/** Shared modular WWII destroyer fittings used by both battle and dock views. */
export function createDestroyerV2Superstructure(
  scene: Scene,
  parent: TransformNode,
  name: string,
  palette: DestroyerV2Palette,
): void {
  const box = (
    suffix: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: Material,
  ): Mesh => {
    const mesh = CreateBox(`${name}-${suffix}`, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.parent = parent;
    return mesh;
  };
  const cylinder = (
    suffix: string,
    height: number,
    top: number,
    bottom: number,
    x: number,
    y: number,
    z: number,
    material: Material,
    tessellation = 8,
  ): Mesh => {
    const mesh = CreateCylinder(`${name}-${suffix}`, {
      height,
      diameterTop: top,
      diameterBottom: bottom,
      tessellation,
    }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.parent = parent;
    return mesh;
  };

  // A compact three-step bridge gives a readable destroyer silhouette without
  // committing the component system to one imported mesh.
  box("bridge-lower", 8.7, 4.5, 12.5, 0, 7.55, 8, palette.structure);
  box("bridge-middle", 7.35, 3.25, 9.2, 0, 11.2, 9.7, palette.structure);
  box("bridge-upper", 5.8, 2.25, 6.5, 0, 13.85, 11.1, palette.accent);
  box("bridge-window-band", 5.95, 0.68, 6.62, 0, 14.12, 11.2, palette.dark);
  for (const x of [-2.15, -0.72, 0.72, 2.15]) {
    box(`bridge-window-${x}`, 1.02, 0.72, 0.18, x, 14.15, 14.55, palette.dark);
  }
  box("bridge-wing-port", 2.2, 0.55, 4.3, -4.45, 11.45, 10.2, palette.deck);
  box("bridge-wing-starboard", 2.2, 0.55, 4.3, 4.45, 11.45, 10.2, palette.deck);

  for (const [index, z] of [-7, -20].entries()) {
    const funnel = cylinder(`funnel-${index}`, 9.2, 3.1, 4.5, 0, 10.2, z, palette.dark);
    funnel.rotation.x = -0.1;
    box(`funnel-cap-${index}`, 4.4, 0.55, 3.5, 0, 14.9, z - 0.45, palette.dark);
  }

  const mast = cylinder("foremast", 19, 0.48, 0.68, 0, 22, 3.5, palette.dark, 6);
  mast.rotation.x = -0.04;
  box("foremast-yard", 11.5, 0.38, 0.38, 0, 25.6, 3.15, palette.dark);
  for (const side of [-1, 1]) {
    const leg = cylinder(`tripod-leg-${side}`, 13.5, 0.34, 0.48, side * 2.2, 17.5, 1.3, palette.dark, 6);
    leg.rotation.z = side * 0.17;
  }

  // Foredeck breakwater, stern machinery house and ventilation trunks add
  // close-range detail while retaining a low mesh count.
  for (const side of [-1, 1]) {
    const breakwater = box(`breakwater-${side}`, 5.4, 1.25, 0.38, side * 2.05, 6.45, 23.4, palette.structure);
    breakwater.rotation.y = side * 0.55;
  }
  box("stern-deckhouse", 7.2, 2.8, 9.5, 0, 6.55, -34, palette.structure);
  for (const x of [-2.3, 2.3]) {
    cylinder(`stern-vent-${x}`, 3.4, 1, 1.35, x, 8.8, -30.5, palette.dark, 8);
  }

  for (const side of [-1, 1]) {
    const boat = cylinder(`lifeboat-${side}`, 7.8, 1.9, 1.9, side * 4.1, 6.8, -14, palette.accent, 8);
    boat.rotation.x = Math.PI / 2;
    box(`boat-rack-${side}`, 1.1, 0.45, 8.4, side * 4.1, 5.95, -14, palette.dark);
    box(`boat-davit-${side}`, 0.42, 4.2, 0.42, side * 5, 8, -14, palette.dark);
  }
}

/** A low-cost multi-station hull with a continuous sheer line and underwater chine. */
export function createDestroyerHull(
  scene: Scene,
  parent: TransformNode,
  spec: DestroyerHullSpec,
): { hull: Mesh; deck: Mesh } {
  const stations = [
    { z: -0.5, width: 0.22, deck: 4.55, keel: 0.2 },
    { z: -0.45, width: 0.68, deck: 4.72, keel: -0.8 },
    { z: -0.33, width: 0.92, deck: 4.86, keel: -1.25 },
    { z: -0.08, width: 1, deck: 4.95, keel: -1.45 },
    { z: 0.2, width: 0.98, deck: 5.02, keel: -1.25 },
    { z: 0.36, width: 0.83, deck: 5.16, keel: -0.72 },
    { z: 0.45, width: 0.52, deck: 5.35, keel: -0.05 },
    { z: 0.5, width: 0.02, deck: 5.58, keel: 0.72 },
  ] as const;
  const hull = new Mesh(`${spec.name}-hull`, scene);
  const positions: number[] = [];
  for (const station of stations) {
    const halfWidth = spec.beam * 0.5 * station.width;
    const z = spec.length * station.z;
    positions.push(
      -halfWidth, station.deck, z,
      -halfWidth * 0.88, 1.15, z,
      -halfWidth * 0.28, station.keel, z,
      halfWidth * 0.28, station.keel, z,
      halfWidth * 0.88, 1.15, z,
      halfWidth, station.deck, z,
    );
  }
  const indices: number[] = [];
  const ringSize = 6;
  for (let station = 0; station < stations.length - 1; station += 1) {
    const current = station * ringSize;
    const next = (station + 1) * ringSize;
    for (let edge = 0; edge < ringSize - 1; edge += 1) {
      indices.push(
        current + edge, next + edge, next + edge + 1,
        current + edge, next + edge + 1, current + edge + 1,
      );
    }
  }
  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5);
  const last = (stations.length - 1) * ringSize;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2, last, last + 4, last + 3, last, last + 5, last + 4);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const hullData = new VertexData();
  hullData.positions = positions;
  hullData.indices = indices;
  hullData.normals = normals;
  hullData.applyToMesh(hull);
  hull.material = spec.hullMaterial;
  hull.parent = parent;

  const deck = new Mesh(`${spec.name}-deck`, scene);
  const deckPositions: number[] = [];
  for (const station of stations) {
    const halfWidth = spec.beam * 0.5 * station.width * 0.96;
    const z = spec.length * station.z;
    deckPositions.push(-halfWidth, station.deck + 0.06, z, halfWidth, station.deck + 0.06, z);
  }
  const deckIndices: number[] = [];
  for (let station = 0; station < stations.length - 1; station += 1) {
    const current = station * 2;
    const next = current + 2;
    deckIndices.push(current, next, next + 1, current, next + 1, current + 1);
  }
  const deckNormals: number[] = [];
  VertexData.ComputeNormals(deckPositions, deckIndices, deckNormals);
  const deckData = new VertexData();
  deckData.positions = deckPositions;
  deckData.indices = deckIndices;
  deckData.normals = deckNormals;
  deckData.applyToMesh(deck);
  deck.material = spec.deckMaterial;
  deck.parent = parent;
  return { hull, deck };
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
