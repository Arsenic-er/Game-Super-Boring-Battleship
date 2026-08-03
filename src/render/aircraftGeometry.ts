import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { AircraftRole, Team } from "../sim/types";

export interface AircraftPlaneVisual {
  root: TransformNode;
  body: Mesh;
  propeller: TransformNode;
}

export interface AirSquadronVisual {
  root: TransformNode;
  planes: AircraftPlaneVisual[];
  role: AircraftRole;
  team: Team;
  capacity: number;
  lastHeading: number;
  bank: number;
}

interface AircraftDimensions {
  length: number;
  fuselageWidth: number;
  wingSpan: number;
  wingDepth: number;
  tailSpan: number;
}

const dimensions: Record<AircraftRole, AircraftDimensions> = {
  fighter: { length: 8.8, fuselageWidth: 1.15, wingSpan: 11.4, wingDepth: 1.65, tailSpan: 4.2 },
  diveBomber: { length: 10.3, fuselageWidth: 1.35, wingSpan: 13.8, wingDepth: 2.15, tailSpan: 4.9 },
  torpedoBomber: { length: 11.4, fuselageWidth: 1.5, wingSpan: 15.2, wingDepth: 2.35, tailSpan: 5.4 },
};

function createAircraftBody(
  scene: Scene,
  name: string,
  role: AircraftRole,
  material: StandardMaterial,
): Mesh {
  const spec = dimensions[role];
  const parts: Mesh[] = [];
  const fuselage = CreateBox(`${name}-fuselage`, {
    width: spec.fuselageWidth,
    height: spec.fuselageWidth * 0.72,
    depth: spec.length,
  }, scene);
  fuselage.material = material;
  parts.push(fuselage);
  const nose = CreateCylinder(`${name}-nose`, {
    height: spec.fuselageWidth * 1.3,
    diameterTop: spec.fuselageWidth * 0.58,
    diameterBottom: spec.fuselageWidth,
    tessellation: 6,
  }, scene);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = spec.length / 2 + spec.fuselageWidth * 0.5;
  nose.material = material;
  parts.push(nose);
  const wings = CreateBox(`${name}-wings`, {
    width: spec.wingSpan,
    height: 0.24,
    depth: spec.wingDepth,
  }, scene);
  wings.position.z = role === "fighter" ? 0.35 : -0.1;
  wings.material = material;
  parts.push(wings);
  const tail = CreateBox(`${name}-tail`, {
    width: spec.tailSpan,
    height: 0.2,
    depth: 1.05,
  }, scene);
  tail.position.z = -spec.length * 0.38;
  tail.material = material;
  parts.push(tail);
  const fin = CreateBox(`${name}-fin`, {
    width: 0.22,
    height: 1.45,
    depth: 1.25,
  }, scene);
  fin.position.set(0, 0.72, -spec.length * 0.4);
  fin.material = material;
  parts.push(fin);
  if (role !== "fighter") {
    const payload = role === "torpedoBomber"
      ? CreateCylinder(`${name}-torpedo`, { height: 5.4, diameter: 0.55, tessellation: 6 }, scene)
      : CreateBox(`${name}-bomb`, { width: 0.72, height: 0.72, depth: 2.5 }, scene);
    if (role === "torpedoBomber") payload.rotation.x = Math.PI / 2;
    payload.position.set(0, -0.72, role === "torpedoBomber" ? -0.4 : -0.15);
    payload.material = material;
    parts.push(payload);
  }
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) throw new Error(`Unable to build aircraft body ${name}`);
  merged.name = `${name}-body`;
  merged.material = material;
  merged.isPickable = false;
  return merged;
}

function createPropeller(
  scene: Scene,
  name: string,
  role: AircraftRole,
  material: StandardMaterial,
): TransformNode {
  const spec = dimensions[role];
  const root = new TransformNode(`${name}-propeller`, scene);
  root.position.z = spec.length / 2 + spec.fuselageWidth * 1.2;
  const horizontal = CreateBox(`${name}-propeller-h`, {
    width: role === "fighter" ? 3.2 : 3.8,
    height: 0.12,
    depth: 0.12,
  }, scene);
  const vertical = CreateBox(`${name}-propeller-v`, {
    width: 0.12,
    height: role === "fighter" ? 3.2 : 3.8,
    depth: 0.12,
  }, scene);
  horizontal.material = material;
  vertical.material = material;
  horizontal.parent = root;
  vertical.parent = root;
  horizontal.isPickable = false;
  vertical.isPickable = false;
  return root;
}

export function createAircraftMaterials(
  scene: Scene,
  key: string,
  team: Team,
  role: AircraftRole,
): { body: StandardMaterial; propeller: StandardMaterial } {
  const body = new StandardMaterial(`${key}-airframe-material`, scene);
  const base = team === "player"
    ? role === "fighter" ? new Color3(0.34, 0.66, 0.61)
      : role === "diveBomber" ? new Color3(0.42, 0.61, 0.55)
        : new Color3(0.37, 0.55, 0.49)
    : role === "fighter" ? new Color3(0.65, 0.31, 0.25)
      : role === "diveBomber" ? new Color3(0.58, 0.34, 0.27)
        : new Color3(0.51, 0.31, 0.25);
  body.diffuseColor = base;
  body.emissiveColor = base.scale(0.18);
  body.specularColor = Color3.Black();
  const propeller = new StandardMaterial(`${key}-propeller-material`, scene);
  propeller.diffuseColor = team === "player"
    ? new Color3(0.8, 0.9, 0.78)
    : new Color3(0.92, 0.72, 0.62);
  propeller.emissiveColor = propeller.diffuseColor.scale(0.18);
  propeller.specularColor = Color3.Black();
  return { body, propeller };
}

export function createAirSquadronGeometry(
  scene: Scene,
  id: string,
  team: Team,
  role: AircraftRole,
  capacity: number,
): AirSquadronVisual {
  const root = new TransformNode(`${id}-air-squadron`, scene);
  const materials = createAircraftMaterials(scene, id, team, role);
  const planes: AircraftPlaneVisual[] = [];
  let sourceBody: Mesh | undefined;
  for (let index = 0; index < capacity; index += 1) {
    const planeRoot = new TransformNode(`${id}-aircraft-${index}`, scene);
    planeRoot.parent = root;
    const body = index === 0
      ? createAircraftBody(scene, `${id}-aircraft-${index}`, role, materials.body)
      : sourceBody?.clone(`${id}-aircraft-${index}-body`) ?? undefined;
    if (!body) throw new Error(`Unable to clone aircraft ${id}-${index}`);
    if (index === 0) sourceBody = body;
    body.parent = planeRoot;
    body.material = materials.body;
    const propeller = createPropeller(
      scene,
      `${id}-aircraft-${index}`,
      role,
      materials.propeller,
    );
    propeller.parent = planeRoot;
    planes.push({ root: planeRoot, body, propeller });
  }
  return { root, planes, role, team, capacity, lastHeading: 0, bank: 0 };
}
