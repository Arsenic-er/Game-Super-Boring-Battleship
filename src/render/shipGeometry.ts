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
  hullId?: HullId;
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

export interface ChamferedBoxSpec {
  width: number;
  height: number;
  depth: number;
  chamfer?: number;
  topScale?: number;
}

/** Low-poly naval deckhouse with clipped corners and inward-sloping walls. */
export function createChamferedBox(
  scene: Scene,
  name: string,
  spec: ChamferedBoxSpec,
): Mesh {
  const halfWidth = spec.width / 2;
  const halfDepth = spec.depth / 2;
  const chamfer = Math.min(
    Math.max(0.04, spec.chamfer ?? Math.min(spec.width, spec.depth) * 0.12),
    halfWidth * 0.46,
    halfDepth * 0.46,
  );
  const topScale = Math.min(1, Math.max(0.68, spec.topScale ?? 0.86));
  const ring = (scale: number, y: number): Array<readonly [number, number, number]> => {
    const width = halfWidth * scale;
    const depth = halfDepth * scale;
    const cut = chamfer * scale;
    return [
      [-width + cut, y, -depth],
      [width - cut, y, -depth],
      [width, y, -depth + cut],
      [width, y, depth - cut],
      [width - cut, y, depth],
      [-width + cut, y, depth],
      [-width, y, depth - cut],
      [-width, y, -depth + cut],
    ];
  };
  const bottom = ring(1, -spec.height / 2);
  const top = ring(topScale, spec.height / 2);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const pushVertex = (point: readonly [number, number, number], u: number, v: number): number => {
    const index = positions.length / 3;
    positions.push(...point);
    uvs.push(u, v);
    return index;
  };
  const planarUv = (point: readonly [number, number, number]): readonly [number, number] => [
    point[0] / spec.width + 0.5,
    point[2] / spec.depth + 0.5,
  ];
  // The caps and every wall use independent vertices. This creates clean UV
  // seams and stable flat normals instead of sampling one dark atlas pixel.
  for (let index = 1; index < 7; index += 1) {
    const bottomPoints = [bottom[0], bottom[index], bottom[index + 1]] as const;
    const bottomStart = positions.length / 3;
    for (const point of bottomPoints) {
      const [u, v] = planarUv(point);
      pushVertex(point, u, v);
    }
    indices.push(bottomStart, bottomStart + 1, bottomStart + 2);
    const topPoints = [top[0], top[index + 1], top[index]] as const;
    const topStart = positions.length / 3;
    for (const point of topPoints) {
      const [u, v] = planarUv(point);
      pushVertex(point, u, v);
    }
    indices.push(topStart, topStart + 1, topStart + 2);
  }
  for (let index = 0; index < 8; index += 1) {
    const next = (index + 1) % 8;
    const start = positions.length / 3;
    pushVertex(bottom[index], 0, 0);
    pushVertex(top[index], 0, 1);
    pushVertex(top[next], 1, 1);
    pushVertex(bottom[next], 1, 0);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  const mesh = new Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  return mesh;
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
    const mesh = createChamferedBox(scene, `${name}-${suffix}`, {
      width,
      height,
      depth,
      chamfer: Math.min(width, depth) * 0.13,
      topScale: height > 1 ? 0.84 : 0.96,
    });
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
    const cap = CreateCylinder(`${name}-${suffix}-cap`, {
      diameter: diameter * 1.08,
      height: Math.max(.35, height * .06),
      tessellation: 8,
    }, scene);
    cap.position.set(x, y + height / 2, z);
    cap.material = palette.accent;
    cap.parent = parent;
    return mesh;
  };
  const windowBand = (
    suffix: string,
    width: number,
    x: number,
    y: number,
    z: number,
  ): Mesh => box(suffix, width, .42, .34, x, y, z, palette.dark);
  const mast = (
    suffix: string,
    x: number,
    baseY: number,
    z: number,
    height: number,
    yardWidth: number,
  ): void => {
    const pole = CreateCylinder(`${name}-${suffix}-pole`, {
      diameterTop: .24,
      diameterBottom: .44,
      height,
      tessellation: 6,
    }, scene);
    pole.position.set(x, baseY + height / 2, z);
    pole.material = palette.dark;
    pole.parent = parent;
    box(`${suffix}-yard`, yardWidth, .28, .34, x, baseY + height * .72, z, palette.dark);
  };
  const rangefinder = (
    suffix: string,
    width: number,
    y: number,
    z: number,
  ): void => {
    const body = CreateCylinder(`${name}-${suffix}`, {
      diameter: .92,
      height: width,
      tessellation: 8,
    }, scene);
    body.position.set(0, y, z);
    body.rotation.z = Math.PI / 2;
    body.material = palette.accent;
    body.parent = parent;
  };
  const bridgeStack = (
    prefix: string,
    z: number,
    baseY: number,
    layers: ReadonlyArray<readonly [number, number, number]>,
  ): number => {
    let y = baseY;
    layers.forEach(([width, height, depth], index) => {
      box(`${prefix}-tier-${index + 1}`, width, height, depth, 0, y + height / 2, z, palette.structure);
      y += height;
      if (index > 0) windowBand(`${prefix}-windows-${index + 1}`, width * .78, 0, y - height * .34, z + depth / 2 + .12);
    });
    return y;
  };
  const navalFittings = (kind: "cruiser" | "battleship"): void => {
    const boatZ = kind === "battleship" ? -17 : -14;
    const deckEdge = kind === "battleship" ? 4.75 : 4.62;
    for (const side of [-1, 1]) {
      const boat = CreateCylinder(`${name}-${kind}-lifeboat-${side}`, {
        height: kind === "battleship" ? 6.8 : 5.7,
        diameterTop: .75,
        diameterBottom: 1.55,
        tessellation: 8,
      }, scene);
      boat.rotation.x = Math.PI / 2;
      boat.position.set(side * 4.15, 6.35, boatZ);
      boat.material = palette.accent;
      boat.parent = parent;
      box(`${kind}-boat-cradle-${side}`, .62, .42, kind === "battleship" ? 7.2 : 6.1, side * 4.15, 5.72, boatZ, palette.dark);
      box(`${kind}-fore-rail-${side}`, .16, .54, 20, side * deckEdge, 6.08, 30, palette.dark);
      box(`${kind}-aft-rail-${side}`, .16, .5, 24, side * deckEdge, 5.28, -37, palette.dark);
    }
    for (const side of [-1, 1]) {
      const breakwater = box(
        `${kind}-breakwater-${side}`,
        kind === "battleship" ? 5.2 : 4.3,
        .88,
        .3,
        side * 1.8,
        6.18,
        kind === "battleship" ? 24 : 22,
        palette.structure,
      );
      breakwater.rotation.y = side * .54;
      const vent = CreateCylinder(`${name}-${kind}-vent-${side}`, {
        height: 2.5,
        diameterTop: .72,
        diameterBottom: 1.08,
        tessellation: 8,
      }, scene);
      vent.position.set(side * 2.6, 7.1, kind === "battleship" ? -22 : -20);
      vent.material = palette.dark;
      vent.parent = parent;
    }
    const portholes: Mesh[] = [];
    for (const side of [-1, 1]) {
      for (const [index, z] of [-31, -22, -12, 1, 15].entries()) {
        const porthole = CreateCylinder(`${name}-${kind}-porthole-${side}-${index}`, {
          height: .12,
          diameter: .34,
          tessellation: 8,
        }, scene);
        porthole.rotation.z = Math.PI / 2;
        porthole.position.set(side * 5.02, 4.58 + Math.max(0, z) * .013, z);
        porthole.material = palette.dark;
        portholes.push(porthole);
      }
    }
    const merged = Mesh.MergeMeshes(portholes, true, true);
    if (merged) {
      merged.name = `${name}-${kind}-portholes`;
      merged.material = palette.dark;
      merged.parent = parent;
      merged.isPickable = false;
    }
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
    const cruiserProfiles = [
      { bridgeZ: 7.5, forwardFunnelZ: -5, aftFunnelZ: -15, funnelScale: 1 },
      { bridgeZ: 8, forwardFunnelZ: -4, aftFunnelZ: -14, funnelScale: .94 },
      { bridgeZ: 7, forwardFunnelZ: -6, aftFunnelZ: -17, funnelScale: .9 },
      { bridgeZ: 6.5, forwardFunnelZ: -7, aftFunnelZ: -16, funnelScale: .86 },
      { bridgeZ: 8, forwardFunnelZ: -3, aftFunnelZ: -12, funnelScale: .82 },
    ] as const;
    const profile = cruiserProfiles[variant] ?? cruiserProfiles[0];
    box("cruiser-forward-shelter", 8.2, 1.6, 10, 0, 6.3, profile.bridgeZ, palette.structure);
    const bridgeTop = bridgeStack("cruiser-bridge", profile.bridgeZ, 7.1, [
      [7.4, 2.5, 7.4], [6.1, 2.2, 5.8], [4.8, 1.9, 4.4],
    ]);
    box("cruiser-bridge-wings", 10.2, .62, 3.2, 0, 10.2, profile.bridgeZ, palette.accent);
    box("cruiser-bridge-roof", 5.4, .48, 4.8, 0, bridgeTop + .24, profile.bridgeZ, palette.accent);
    rangefinder("cruiser-main-rangefinder", variant === 2 ? 6.8 : 5.8, bridgeTop + 1.05, profile.bridgeZ);
    mast("cruiser-foremast", 0, bridgeTop + .3, profile.bridgeZ - 2, 8.2, 6.4);
    funnel("cruiser-funnel-forward", 0, 11.5, profile.forwardFunnelZ, 3.8 * profile.funnelScale, 9.4);
    funnel("cruiser-funnel-aft", 0, 10.8, profile.aftFunnelZ, 3.4 * profile.funnelScale, 8.2);
    box("cruiser-aft-deckhouse", 7.4, 2.2, 12, 0, 6.7, -26, palette.structure);
    windowBand("cruiser-aft-windows", 5.2, 0, 7.2, -19.9);
    mast("cruiser-mainmast", 0, 7.8, -24, 10.5, 5.3);
    box("cruiser-port-bulge", 1, 1.1, 50, -5.7, 2.1, -6, palette.structure);
    box("cruiser-starboard-bulge", 1, 1.1, 50, 5.7, 2.1, -6, palette.structure);
    if (variant === 1) rangefinder("edinburgh-aft-control", 4.8, 10.2, -27);
    if (variant === 3) box("agano-flag-platform", 6.5, .65, 4.2, 0, bridgeTop + 2.1, profile.bridgeZ - .5, palette.accent);
    if (variant === 4) rangefinder("dido-aa-director", 6.4, bridgeTop + 2.2, profile.bridgeZ - .6);
    navalFittings("cruiser");
    return;
  }
  const battleshipProfiles = [
    { bridgeZ: 5, funnelZ: [-7, -19] as const, funnelDiameter: 4.8, layers: 4 },
    { bridgeZ: 5.5, funnelZ: [-8, -17] as const, funnelDiameter: 4.6, layers: 4 },
    { bridgeZ: 4.5, funnelZ: [-11] as const, funnelDiameter: 5.6, layers: 4 },
    { bridgeZ: 5, funnelZ: [-12] as const, funnelDiameter: 6, layers: 5 },
    { bridgeZ: 4, funnelZ: [-14] as const, funnelDiameter: 5.4, layers: 4 },
  ] as const;
  const profile = battleshipProfiles[variant] ?? battleshipProfiles[0];
  box("battleship-forward-deckhouse", 10.2, 1.8, 10.5, 0, 6.4, profile.bridgeZ, palette.structure);
  const allBridgeLayers = [
    [9.2, 3.1, 8.6], [7.8, 2.8, 7.2], [6.5, 2.5, 5.9], [5.2, 2.2, 4.7], [4.1, 2, 3.8],
  ] as const;
  const bridgeTop = bridgeStack(
    "battleship-bridge",
    profile.bridgeZ,
    7.2,
    allBridgeLayers.slice(0, profile.layers),
  );
  box("battleship-bridge-wings", 12.2, .72, 4, 0, 10.5, profile.bridgeZ, palette.accent);
  box("battleship-fire-control-platform", 7.6, .62, 5.4, 0, bridgeTop + .3, profile.bridgeZ, palette.accent);
  rangefinder(
    variant === 2 ? "bismarck-main-rangefinder" : variant === 3 ? "yamato-main-rangefinder" : "battleship-main-rangefinder",
    variant === 2 ? 10.4 : variant === 3 ? 9.4 : 8.4,
    bridgeTop + 1.25,
    profile.bridgeZ,
  );
  mast("battleship-foremast", 0, bridgeTop + .5, profile.bridgeZ - 2.3, variant === 3 ? 8 : 10, 8.2);
  profile.funnelZ.forEach((z, index) => {
    funnel(`battleship-funnel-${index + 1}`, 0, 13.3 - index * .7, z, profile.funnelDiameter - index * .35, 12 - index * .8);
  });
  box("battleship-aft-deckhouse", 9.4, 2.3, 13.5, 0, 6.8, -29, palette.structure);
  bridgeStack("battleship-aft-control", -29, 7.9, [[7.2, 2, 7.8], [5.2, 1.7, 5.2]]);
  windowBand("battleship-aft-windows", 4.5, 0, 10.8, -26.3);
  mast("battleship-mainmast", 0, 10, -27, 11.5, 7.2);
  box("battleship-port-bulge", 1.5, 1.4, 68, -6, 1.7, -4, palette.structure);
  box("battleship-starboard-bulge", 1.5, 1.4, 68, 6, 1.7, -4, palette.structure);
  if (variant === 1) rangefinder("kgv-aa-director", 6.6, bridgeTop + 2.8, profile.bridgeZ - 1.2);
  if (variant === 3) {
    box("yamato-tower-crown", 4.8, 1.5, 4.2, 0, bridgeTop + 2.3, profile.bridgeZ, palette.structure);
    box("yamato-command-roof", 6.2, .55, 5.2, 0, bridgeTop + 3.3, profile.bridgeZ, palette.accent);
  }
  if (variant === 4) box("richelieu-aft-air-platform", 8.6, .72, 8, 0, 9.2, -20, palette.accent);
  navalFittings("battleship");
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
    const mesh = createChamferedBox(scene, `${name}-${suffix}`, {
      width,
      height,
      depth,
      chamfer: Math.min(width, depth) * 0.13,
      topScale: height > 1 ? 0.84 : 0.96,
    });
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
  const house = createChamferedBox(scene, `${name}-gun-house`, {
    width: definition.visual.houseWidth,
    height: multiBarrel ? 2.55 : 2.25,
    depth: multiBarrel ? 4.7 : 4.1,
    chamfer: 0.42,
    topScale: 0.78,
  });
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

/** Moving underwater fittings for larger hulls without destroyer deck clutter. */
export function createNavalMotionParts(
  scene: Scene,
  parent: TransformNode,
  name: string,
  palette: DestroyerV3Palette,
): DestroyerV3MotionParts {
  const rudder = new TransformNode(`${name}-rudder-pivot`, scene);
  rudder.position.set(0, -0.05, -54.2);
  rudder.parent = parent;
  const rudderBlade = CreateBox(`${name}-rudder`, {
    width: 0.42,
    height: 3.7,
    depth: 4.5,
  }, scene);
  rudderBlade.position.set(0, -1.4, 1.4);
  rudderBlade.material = palette.dark;
  rudderBlade.parent = rudder;

  const propellers = [-1, 1].map((side) => {
    const propeller = new TransformNode(`${name}-propeller-${side}`, scene);
    propeller.position.set(side * 2.7, 0.05, -52.4);
    propeller.parent = parent;
    const hub = CreateCylinder(`${name}-propeller-hub-${side}`, {
      height: 1.7,
      diameterTop: 0.62,
      diameterBottom: 0.82,
      tessellation: 8,
    }, scene);
    hub.rotation.x = Math.PI / 2;
    hub.material = palette.dark;
    hub.parent = propeller;
    for (let blade = 0; blade < 3; blade += 1) {
      const fin = CreateBox(`${name}-propeller-${side}-blade-${blade}`, {
        width: 0.48,
        height: 3.1,
        depth: 0.2,
      }, scene);
      fin.rotation.z = blade * Math.PI * 2 / 3;
      fin.material = palette.accent;
      fin.parent = propeller;
    }
    return propeller;
  });
  return { rudder, propellers };
}

export interface HullStation {
  z: number;
  width: number;
  deck: number;
  keel: number;
}

const DESTROYER_HULL_STATIONS: readonly HullStation[] = [
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
];

const CRUISER_HULL_STATIONS: readonly HullStation[] = [
  { z: -.5, width: .72, deck: 4.34, keel: -.05 }, { z: -.46, width: .82, deck: 4.4, keel: -.82 },
  { z: -.39, width: .91, deck: 4.48, keel: -1.22 }, { z: -.3, width: .97, deck: 4.55, keel: -1.48 },
  { z: -.2, width: 1, deck: 4.62, keel: -1.62 }, { z: -.08, width: 1, deck: 4.68, keel: -1.68 },
  { z: .05, width: .995, deck: 4.76, keel: -1.66 }, { z: .17, width: .98, deck: 4.88, keel: -1.56 },
  { z: .27, width: .93, deck: 5.04, keel: -1.35 }, { z: .35, width: .82, deck: 5.24, keel: -1.02 },
  { z: .41, width: .67, deck: 5.45, keel: -.62 }, { z: .455, width: .48, deck: 5.66, keel: -.12 },
  { z: .482, width: .27, deck: 5.84, keel: .34 }, { z: .5, width: .045, deck: 6.02, keel: .82 },
];

const BATTLESHIP_HULL_STATIONS: readonly HullStation[] = [
  { z: -.5, width: .78, deck: 4.42, keel: -.12 }, { z: -.465, width: .87, deck: 4.46, keel: -.82 },
  { z: -.41, width: .94, deck: 4.5, keel: -1.3 }, { z: -.34, width: .98, deck: 4.54, keel: -1.58 },
  { z: -.25, width: 1, deck: 4.58, keel: -1.78 }, { z: -.14, width: 1, deck: 4.62, keel: -1.88 },
  { z: -.02, width: 1, deck: 4.68, keel: -1.92 }, { z: .1, width: .995, deck: 4.76, keel: -1.9 },
  { z: .21, width: .98, deck: 4.88, keel: -1.76 }, { z: .3, width: .93, deck: 5.05, keel: -1.5 },
  { z: .37, width: .84, deck: 5.27, keel: -1.14 }, { z: .42, width: .72, deck: 5.5, keel: -.74 },
  { z: .458, width: .56, deck: 5.72, keel: -.28 }, { z: .48, width: .38, deck: 5.9, keel: .18 },
  { z: .493, width: .2, deck: 6.05, keel: .56 }, { z: .5, width: .055, deck: 6.18, keel: .92 },
];

export function hullStationsFor(hullId: HullId = "destroyer"): readonly HullStation[] {
  if (hullId === "lightCruiser") return CRUISER_HULL_STATIONS;
  if (hullId === "battleship") return BATTLESHIP_HULL_STATIONS;
  return DESTROYER_HULL_STATIONS;
}

/** A low-cost multi-station hull with a continuous sheer line and underwater chine. */
export function createDestroyerHull(
  scene: Scene,
  parent: TransformNode,
  spec: DestroyerHullSpec,
): { hull: Mesh; deck: Mesh } {
  const stations = hullStationsFor(spec.hullId);
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
  const deckThickness = 0.34;
  for (const [stationIndex, station] of stations.entries()) {
    const halfWidth = spec.beam * 0.5 * station.width * 0.96;
    const z = spec.length * station.z;
    const topY = station.deck + 0.07;
    const bottomY = station.deck - deckThickness;
    deckPositions.push(
      -halfWidth, topY, z,
      halfWidth, topY, z,
      -halfWidth, bottomY, z,
      halfWidth, bottomY, z,
    );
    const v = stationIndex / (stations.length - 1);
    deckUvs.push(0, v, 1, v, 0, v, 1, v);
  }
  const deckIndices: number[] = [];
  for (let station = 0; station < stations.length - 1; station += 1) {
    const current = station * 4;
    const next = current + 4;
    // Babylon uses a left-handed face convention: top faces wind clockwise.
    deckIndices.push(
      current, next + 1, next,
      current, current + 1, next + 1,
      current + 2, next + 2, next + 3,
      current + 2, next + 3, current + 3,
      current, next, next + 2,
      current, next + 2, current + 2,
      current + 1, next + 3, next + 1,
      current + 1, current + 3, next + 3,
    );
  }
  const stern = 0;
  deckIndices.push(
    stern, stern + 3, stern + 1,
    stern, stern + 2, stern + 3,
  );
  const bow = (stations.length - 1) * 4;
  deckIndices.push(
    bow, bow + 1, bow + 3,
    bow, bow + 3, bow + 2,
  );
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
