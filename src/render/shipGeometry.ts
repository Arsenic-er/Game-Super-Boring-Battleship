import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { MainGunVisualDefinition } from "../ships/components";
import type { HullId } from "../ships/hulls";
import type { TorpedoDefinition } from "../ships/torpedoes";

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

export interface DestroyerV3Palette {
  deck: Material;
  structure: Material;
  dark: Material;
  accent: Material;
}

export const DESTROYER_V3_HARDPOINTS = {
  mainGun: { x: 0, y: 6.05, z: 30.5 },
  torpedoLauncher: { x: 0, y: 5.45, z: -24.5 },
} as const;

export interface DestroyerV3MotionParts {
  rudder: TransformNode;
  propellers: TransformNode[];
}

export interface MainGunVisual {
  root: TransformNode;
  cradle: TransformNode;
  barrels: Mesh[];
  barrelRestZ: number[];
}

export interface TorpedoLauncherVisual {
  root: TransformNode;
}

/** Adds class-specific massing without creating non-functional weapon mounts. */
export function createHullClassSilhouette(
  scene: Scene,
  parent: TransformNode,
  name: string,
  hullId: HullId,
  palette: DestroyerV3Palette,
  variant = 0,
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
  const funnel = (
    suffix: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    height: number,
  ): Mesh => {
    const mesh = CreateCylinder(`${name}-${suffix}`, {
      diameter,
      height,
      tessellation: 8,
    }, scene);
    mesh.position.set(x, y, z);
    mesh.material = palette.dark;
    mesh.parent = parent;
    return mesh;
  };
  if (hullId === "destroyer") {
    if (variant === 1) box("j-class-aft-shelter", 5.6, 2.1, 8, 0, 6.1, -27, palette.structure);
    if (variant === 2) box("kagero-long-forecastle", 6.2, 1.2, 18, 0, 5.9, 29, palette.deck);
    if (variant === 3) {
      box("z23-raised-bow", 7, 1.7, 21, 0, 6.1, 28, palette.structure);
      box("z23-rangefinder", 4.8, 1.1, 2.2, 0, 17.5, 7, palette.accent);
    }
    if (variant === 4) {
      box("tashkent-long-bridge", 7.4, 3.4, 11.5, 0, 8.1, 10, palette.structure);
      funnel("tashkent-second-funnel", 0, 11.4, -23, 3.3, 8.6);
    }
    return;
  }
  if (hullId === "lightCruiser") {
    box("cruiser-forward-deckhouse", 6.8, 3.2, 9.5, 0, 7.2, 11, palette.structure);
    box("cruiser-armored-bridge", 5.2, 4.8, 6.4, 0, 10.8, 7.5, palette.structure);
    box("cruiser-aft-deckhouse", 6.2, 2.4, 11, 0, 6.8, -23, palette.structure);
    funnel("cruiser-funnel-forward", 0, 11.2, -4, 3.8, 9.5);
    funnel("cruiser-funnel-aft", 0, 10.2, -14, 3.3, 8.2);
    box("cruiser-port-bulge", 1.1, 1.4, 54, -5.6, 2.2, -5, palette.dark);
    box("cruiser-starboard-bulge", 1.1, 1.4, 54, 5.6, 2.2, -5, palette.dark);
    if (variant === 1) box("edinburgh-aft-control", 4.8, 3.5, 5.4, 0, 9.1, -30, palette.structure);
    if (variant === 2) box("nurnberg-forward-rangefinder", 5.8, 1.1, 2.2, 0, 15.3, 10, palette.accent);
    if (variant === 3) box("agano-flag-bridge", 7.2, 2.5, 7.4, 0, 13.6, 6, palette.structure);
    if (variant === 4) box("dido-aa-director", 6.6, 1.3, 3.4, 0, 16, 4, palette.accent);
    return;
  }
  box("battleship-forecastle", 8.8, 2.8, 22, 0, 6.8, 18, palette.structure);
  box("battleship-armored-citadel", 9.2, 4.8, 28, 0, 8.3, -2, palette.structure);
  box("battleship-command-tower", 6.4, 8.5, 8.5, 0, 13.4, 11, palette.structure);
  box("battleship-aft-castle", 8.2, 3.4, 22, 0, 7.4, -31, palette.structure);
  funnel("battleship-funnel-forward", 0, 13.2, -6, 5.2, 12.5);
  funnel("battleship-funnel-aft", 0, 12.4, -20, 4.8, 11);
  box("battleship-port-bulge", 1.8, 2.1, 72, -5.9, 1.8, -3, palette.dark);
  box("battleship-starboard-bulge", 1.8, 2.1, 72, 5.9, 1.8, -3, palette.dark);
  if (variant === 1) box("kgv-square-tower", 7.2, 5.8, 7.2, 0, 18, 9, palette.structure);
  if (variant === 2) box("bismarck-rangefinder", 9.4, 1.6, 3.4, 0, 19, 7, palette.accent);
  if (variant === 3) box("yamato-pagoda", 8.4, 7.5, 7.8, 0, 21, 9, palette.structure);
  if (variant === 4) box("richelieu-forward-tower", 7.6, 6.2, 8.2, 0, 18.5, 16, palette.structure);
}

/** Shared modular WWII destroyer fittings used by both battle and dock views. */
export function createDestroyerV3Superstructure(
  scene: Scene,
  parent: TransformNode,
  name: string,
  palette: DestroyerV3Palette,
): DestroyerV3MotionParts {
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

  // Stepped, narrowing bridge keeps the silhouette readable without the old
  // slab-sided block. The short layers also hide texture stretching.
  box("bridge-lower", 7.8, 3.4, 10.8, 0, 7.25, 8.7, palette.structure);
  box("bridge-middle", 6.7, 2.7, 8.2, 0, 10.3, 10.2, palette.structure);
  box("bridge-upper", 5.25, 1.8, 5.6, 0, 12.55, 11.25, palette.accent);
  box("bridge-roof", 5.85, 0.32, 6.15, 0, 13.62, 11.05, palette.dark);
  for (const x of [-2.15, -0.72, 0.72, 2.15]) {
    box(`bridge-window-${x}`, 0.92, 0.58, 0.16, x, 12.72, 14.1, palette.dark);
  }
  box("bridge-wing-port", 1.8, 0.42, 3.7, -4.25, 10.45, 10.5, palette.deck);
  box("bridge-wing-starboard", 1.8, 0.42, 3.7, 4.25, 10.45, 10.5, palette.deck);

  // Optical rangefinder and searchlights add recognisable WWII detail at a
  // tiny geometry cost.
  cylinder("rangefinder", 5.3, 0.72, 0.72, 0, 14.05, 10.8, palette.dark, 8).rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    cylinder(`searchlight-${side}`, 0.65, 1.25, 1.25, side * 3.45, 11.55, 8.1, palette.dark, 8)
      .rotation.z = Math.PI / 2;
  }

  for (const [index, funnelSpec] of [
    { z: -3.5, height: 8.4, top: 2.5, bottom: 3.55 },
    { z: -12.2, height: 7.35, top: 2.2, bottom: 3.15 },
  ].entries()) {
    const funnel = cylinder(
      `funnel-${index}`,
      funnelSpec.height,
      funnelSpec.top,
      funnelSpec.bottom,
      0,
      9.65,
      funnelSpec.z,
      palette.dark,
    );
    funnel.rotation.x = -0.08;
    box(`funnel-band-${index}`, funnelSpec.top + 1.15, 0.48, funnelSpec.top + 0.75, 0, 13.3, funnelSpec.z - 0.3, palette.accent);
  }

  const mast = cylinder("foremast", 17.2, 0.32, 0.52, 0, 20.5, 3.4, palette.dark, 6);
  mast.rotation.x = -0.04;
  box("foremast-yard", 9.2, 0.28, 0.28, 0, 24.1, 3.15, palette.dark);
  box("radar-array", 5.4, 2.3, 0.24, 0, 25.7, 3.15, palette.dark);
  for (const side of [-1, 1]) {
    const leg = cylinder(`tripod-leg-${side}`, 11.2, 0.28, 0.4, side * 1.75, 16.7, 1.35, palette.dark, 6);
    leg.rotation.z = side * 0.14;
  }

  // Foredeck breakwater, stern machinery house and ventilation trunks add
  // close-range detail while retaining a low mesh count.
  for (const side of [-1, 1]) {
    const breakwater = box(`breakwater-${side}`, 4.6, 0.9, 0.28, side * 1.75, 6.15, 22.5, palette.structure);
    breakwater.rotation.y = side * 0.55;
  }
  box("stern-deckhouse", 6.7, 2.35, 8.4, 0, 5.95, -35, palette.structure);
  for (const x of [-2.3, 2.3]) {
    cylinder(`stern-vent-${x}`, 2.65, 0.72, 1.05, x, 7.65, -31.5, palette.dark, 8);
  }

  for (const side of [-1, 1]) {
    const boat = cylinder(`lifeboat-${side}`, 6.2, 0.7, 1.55, side * 4.05, 6.15, -17, palette.accent, 8);
    boat.rotation.x = Math.PI / 2;
    box(`boat-rack-${side}`, 0.75, 0.35, 6.6, side * 4.05, 5.55, -17, palette.dark);
    box(`boat-davit-${side}`, 0.28, 3.1, 0.28, side * 4.9, 7.05, -17, palette.dark);
  }

  // Long, low-cost rails and hull accents do more for scale than more boxes.
  for (const side of [-1, 1]) {
    box(`fore-rail-${side}`, 0.18, 0.52, 25, side * 4.35, 5.95, 34, palette.dark);
    box(`aft-rail-${side}`, 0.18, 0.48, 24, side * 4.45, 5.28, -36, palette.dark);
    box(`anchor-${side}`, 0.34, 1.3, 1.1, side * 3.25, 2.9, 43.5, palette.dark);
  }

  const rudder = new TransformNode(`${name}-rudder-pivot`, scene);
  rudder.position.set(0, -0.05, -54.2);
  rudder.parent = parent;
  const rudderBlade = box("rudder", 0.42, 3.7, 4.5, 0, -1.4, 1.4, palette.dark);
  rudderBlade.parent = rudder;

  const propellers = [-1, 1].map((side) => {
    const propeller = new TransformNode(`${name}-propeller-${side}`, scene);
    propeller.position.set(side * 2.7, 0.05, -52.4);
    propeller.parent = parent;
    const hub = cylinder(`propeller-hub-${side}`, 1.7, 0.62, 0.82, 0, 0, 0, palette.dark, 8);
    hub.rotation.x = Math.PI / 2;
    hub.parent = propeller;
    for (let blade = 0; blade < 3; blade += 1) {
      const fin = box(`propeller-${side}-blade-${blade}`, 0.48, 3.1, 0.2, 0, 0, 0, palette.accent);
      fin.rotation.z = blade * Math.PI * 2 / 3;
      fin.parent = propeller;
    }
    return propeller;
  });

  return { rudder, propellers };
}

export function createMainGunVisual(
  scene: Scene,
  parent: TransformNode,
  name: string,
  definition: { visual: MainGunVisualDefinition },
  palette: DestroyerV3Palette,
): MainGunVisual {
  const root = new TransformNode(`${name}-turret`, scene);
  root.position.set(
    DESTROYER_V3_HARDPOINTS.mainGun.x,
    DESTROYER_V3_HARDPOINTS.mainGun.y,
    DESTROYER_V3_HARDPOINTS.mainGun.z,
  );
  root.parent = parent;
  const barrelCount = definition.visual.barrelCount;
  const multiBarrel = barrelCount > 1;
  const mount = CreateCylinder(`${name}-mount`, {
    height: multiBarrel ? 1.35 : 1.15,
    diameter: definition.visual.mountDiameter,
    tessellation: 10,
  }, scene);
  mount.material = palette.deck;
  mount.parent = root;
  const house = CreateBox(`${name}-gun-house`, {
    width: definition.visual.houseWidth,
    height: multiBarrel ? 2.55 : 2.25,
    depth: multiBarrel ? 4.7 : 4.1,
  }, scene);
  house.position.set(0, 1.45, 0.75);
  house.material = palette.accent;
  house.parent = root;
  const cradle = new TransformNode(`${name}-gun-cradle`, scene);
  cradle.position.set(0, 1.45, 0.75);
  cradle.parent = root;
  const offsets = Array.from(
    { length: barrelCount },
    (_, index) => (index - (barrelCount - 1) / 2) * definition.visual.barrelSpacing,
  );
  const barrelRestZ: number[] = [];
  const barrels = offsets.map((offset, index) => {
    const barrel = CreateCylinder(`${name}-barrel-${index}`, {
      height: definition.visual.barrelLength,
      diameter: multiBarrel ? 0.44 : 0.4,
      tessellation: 8,
    }, scene);
    barrel.rotation.x = Math.PI / 2;
    const restZ = definition.visual.barrelLength * 0.47 + 0.55;
    barrel.position.set(offset, 0, restZ);
    barrel.material = palette.dark;
    barrel.parent = cradle;
    barrelRestZ.push(restZ);
    return barrel;
  });
  return { root, cradle, barrels, barrelRestZ };
}

export function createTorpedoLauncherVisual(
  scene: Scene,
  parent: TransformNode,
  name: string,
  definition: TorpedoDefinition,
  palette: DestroyerV3Palette,
): TorpedoLauncherVisual {
  const root = new TransformNode(`${name}-torpedo-launcher`, scene);
  root.position.set(
    DESTROYER_V3_HARDPOINTS.torpedoLauncher.x,
    DESTROYER_V3_HARDPOINTS.torpedoLauncher.y,
    DESTROYER_V3_HARDPOINTS.torpedoLauncher.z,
  );
  root.parent = parent;
  const heavy = definition.caliberMm >= 600;
  const base = CreateCylinder(`${name}-torpedo-base`, {
    height: 1.05,
    diameter: heavy ? 4.9 : 4.5,
    tessellation: 10,
  }, scene);
  base.material = palette.dark;
  base.parent = root;
  const diameter = heavy ? 0.92 : 0.82;
  const spacing = heavy ? 1.22 : 1.08;
  for (const side of [-1, 1]) {
    const tube = CreateCylinder(`${name}-torpedo-tube-${side}`, {
      height: 7.2,
      diameter,
      tessellation: 8,
    }, scene);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(side * spacing / 2, 1.05, 0.25);
    tube.material = palette.accent;
    tube.parent = root;
  }
  const sight = CreateBox(`${name}-torpedo-sight`, { width: 0.34, height: 1.45, depth: 0.34 }, scene);
  sight.position.set(0, 1.75, -0.65);
  sight.material = palette.dark;
  sight.parent = root;
  return { root };
}

/** A low-cost multi-station hull with a continuous sheer line and underwater chine. */
export function createDestroyerHull(
  scene: Scene,
  parent: TransformNode,
  spec: DestroyerHullSpec,
): { hull: Mesh; deck: Mesh } {
  const stations = [
    { z: -0.5, width: 0.68, deck: 4.28, keel: 0.15 },
    { z: -0.46, width: 0.78, deck: 4.34, keel: -0.72 },
    { z: -0.39, width: 0.88, deck: 4.42, keel: -1.08 },
    { z: -0.3, width: 0.95, deck: 4.5, keel: -1.32 },
    { z: -0.18, width: 0.99, deck: 4.58, keel: -1.45 },
    { z: -0.05, width: 1, deck: 4.68, keel: -1.5 },
    { z: 0.08, width: 0.99, deck: 4.78, keel: -1.48 },
    { z: 0.2, width: 0.95, deck: 4.94, keel: -1.34 },
    { z: 0.3, width: 0.84, deck: 5.12, keel: -1.08 },
    { z: 0.38, width: 0.69, deck: 5.32, keel: -0.68 },
    { z: 0.44, width: 0.49, deck: 5.5, keel: -0.2 },
    { z: 0.475, width: 0.27, deck: 5.7, keel: 0.22 },
    { z: 0.5, width: 0.035, deck: 5.88, keel: 0.72 },
  ] as const;
  const hull = new Mesh(`${spec.name}-hull`, scene);
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const [stationIndex, station] of stations.entries()) {
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
    for (let edge = 0; edge < 6; edge += 1) {
      uvs.push(edge / 5, stationIndex / (stations.length - 1));
    }
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
  hullData.uvs = uvs;
  hullData.applyToMesh(hull);
  hull.material = spec.hullMaterial;
  hull.parent = parent;

  const deck = new Mesh(`${spec.name}-deck`, scene);
  const deckPositions: number[] = [];
  const deckUvs: number[] = [];
  for (const [stationIndex, station] of stations.entries()) {
    const halfWidth = spec.beam * 0.5 * station.width * 0.96;
    const z = spec.length * station.z;
    deckPositions.push(-halfWidth, station.deck + 0.06, z, halfWidth, station.deck + 0.06, z);
    deckUvs.push(0, stationIndex / (stations.length - 1), 1, stationIndex / (stations.length - 1));
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
  deckData.uvs = deckUvs;
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
