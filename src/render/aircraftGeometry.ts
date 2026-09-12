import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { AircraftRole, Team } from "../sim/types";
import { AircraftMeshBuilder, type AircraftPoint } from "./aircraftMeshBuilder";
import { historicalAircraftProfile, type AircraftPaint, type AircraftWingSection, type HistoricalAircraftProfile } from "./historicalAircraftProfiles";

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

const ENGINE: AircraftPaint = [0.10, 0.12, 0.13];
const METAL: AircraftPaint = [0.37, 0.40, 0.39];
const GLASS: AircraftPaint = [0.22, 0.38, 0.43];
const RED: AircraftPaint = [0.66, 0.12, 0.10];

function createWing(builder: AircraftMeshBuilder, span: number, sections: readonly AircraftWingSection[], upper: AircraftPaint, lower: AircraftPaint): readonly [number, number] {
  const firstIndex = builder.indices.length;
  const stations = [
    ...sections.slice(1).map(([x, ...rest]) => [-x, ...rest] as AircraftWingSection).reverse(),
    ...sections,
  ];
  // A blunt leading edge, cambered upper skin and sharp trailing edge: not a flat slab.
  const airfoil = [[1, 0], [0.88, 0.52], [0.58, 0.76], [0.22, 0.48], [0, 0], [0.22, -0.20], [0.58, -0.28], [0.88, -0.22]];
  const rings = stations.map(([fraction, leading, trailing, thickness, y]) => airfoil.map(([chord, camber]): AircraftPoint => [fraction * span / 2, y + camber * thickness, trailing + chord * (leading - trailing)]));
  const centers = stations.map<AircraftPoint>(([fraction, leading, trailing, , y]) => [fraction * span / 2, y, (leading + trailing) / 2]);
  // Vertex colour is assigned by the section itself, so the dihedral does not move the paint boundary.
  const verticesBefore = builder.colors.length;
  builder.loft(rings, centers, upper);
  for (let station = 0; station < stations.length; station += 1) {
    for (let vertex = 4; vertex < airfoil.length; vertex += 1) {
      const offset = verticesBefore + (station * airfoil.length + vertex) * 4;
      builder.colors.splice(offset, 3, ...lower);
    }
  }
  return [firstIndex, builder.indices.length];
}

function createCanopy(paint: AircraftMeshBuilder, glass: AircraftMeshBuilder, profile: HistoricalAircraftProfile): void {
  const [aft, forward, width, height] = profile.canopy;
  const sections = Array.from({ length: profile.canopyFrames }, (_, i) => {
    const t = i / (profile.canopyFrames - 1);
    const fullness = i === 0 ? 0.34 : i === profile.canopyFrames - 1 ? 0.52 : 1;
    const z = aft + t * (forward - aft);
    const base = profile.radius[1] * 0.80 - Math.max(0, -z) * 0.065;
    return { z, base, ring: Array.from({ length: 9 }, (_, j): AircraftPoint => {
      const angle = j * Math.PI / 8;
      return [Math.cos(angle) * width * 0.5 * fullness, base + Math.sin(angle) * height * fullness, z];
    }) };
  });
  glass.loft(sections.map((section) => section.ring), sections.map<AircraftPoint>((section) => [0, section.base, section.z]), GLASS);
  // Four short arch sections per frame keep the greenhouse legible from normal gameplay distance.
  for (const section of sections) {
    for (let j = 0; j < 8; j += 2) paint.rod(section.ring[j], section.ring[j + 2], 0.023, profile.upper, 4);
  }
  for (const edge of [0, 4, 8]) {
    for (let i = 0; i < sections.length - 1; i += 1) paint.rod(sections[i].ring[edge], sections[i + 1].ring[edge], 0.023, profile.upper, 4);
  }
}

function createTail(builder: AircraftMeshBuilder, p: HistoricalAircraftProfile): void {
  const z = -p.length * 0.365;
  createWing(builder, p.tailSpan, [
    [0, z + p.tailChord * 0.63, z - p.tailChord * 0.40, 0.15, 0.14],
    [0.42, z + p.tailChord * 0.46, z - p.tailChord * 0.35, 0.12, 0.15],
    [0.84, z + p.tailChord * 0.21, z - p.tailChord * 0.23, 0.07, 0.16],
    [1, z - p.tailChord * 0.05, z - p.tailChord * 0.12, 0.022, 0.16],
  ], p.upper, p.lower);
  const tail = -p.length * 0.477;
  const h = p.finHeight;
  const leading = tail + p.tailChord * 1.24;
  builder.prism([
    [0, 0.11, leading], [0, h * 0.42, leading - 0.18],
    [0, h * 0.90, leading - p.finSweep], [0, h, leading - p.finSweep - 0.35],
    [0, h * 0.96, tail + 0.30], [0, h * 0.72, tail + 0.03], [0, 0.11, tail],
  ], [0.13, 0, 0], p.upper);
  // Tailhook and retracted tailwheel; neither affects the simulation or aircraft origin.
  builder.rod([0, -0.22, tail + 0.9], [0, -0.35, tail + 0.08], 0.045, METAL, 6);
}

function createPayload(builder: AircraftMeshBuilder, p: HistoricalAircraftProfile): void {
  if (p.role === "fighter") return;
  const torpedo = p.role === "torpedoBomber";
  const internal = p.features.includes("internal-torpedo-bay");
  const length = torpedo ? p.supportGroup === "us-navy" ? 3.82 : 5.27 : 1.86;
  const radius = torpedo ? 0.235 : 0.20;
  // The Avenger's torpedo remains inside its deep belly; only the bay seam/fairings are exposed.
  const y = internal ? -p.radius[1] * 0.51 : -p.radius[1] - (torpedo ? 0.27 : 0.32);
  const z = torpedo ? -0.17 : 0.32;
  const color: AircraftPaint = torpedo ? [0.40, 0.44, 0.42] : [0.31, 0.35, 0.24];
  builder.ellipseStations([
    [z - length / 2, radius * 0.24, radius * 0.24, y],
    [z - length * 0.35, radius * 0.70, radius * 0.70, y],
    [z - length * 0.20, radius, radius, y],
    [z + length * 0.31, radius, radius, y],
    [z + length * 0.45, radius * 0.67, radius * 0.67, y],
    [z + length / 2, radius * 0.05, radius * 0.05, y],
  ], color, 10);
  if (internal) {
    for (const side of [-1, 1]) builder.rod([side * 0.32, -0.96, -1.9], [side * 0.32, -0.96, 1.65], 0.017, ENGINE, 4);
    return;
  }
  const tail = z - length / 2;
  for (let fin = 0; fin < 4; fin += 1) {
    const a = fin * Math.PI / 2;
    const point = (r: number, depth: number): AircraftPoint => [Math.cos(a) * r, y + Math.sin(a) * r, depth];
    builder.prism([point(radius * 0.4, tail), point(radius * 2.05, tail + 0.12), point(radius * 1.75, tail + 0.63), point(radius * 0.8, tail + 0.73)], [-Math.sin(a) * 0.035, Math.cos(a) * 0.035, 0], color);
  }
  for (const side of [-1, 1]) builder.rod([side * 0.23, -p.radius[1] * 0.69, 0.63], [side * 0.14, y, 0.08], 0.048, METAL, 6);
}

function createFixedGear(builder: AircraftMeshBuilder, p: HistoricalAircraftProfile): void {
  for (const side of [-1, 1]) {
    const x = side * 1.51;
    builder.rod([x * 0.94, -0.31, 0.63], [x, -1.39, 0.44], 0.13, p.lower, 8);
    // Long streamlined wheel spats, with a dark tyre just protruding below each fairing.
    builder.ellipseStations([[-0.46, 0.035, 0.06, -1.35], [-0.07, 0.22, 0.29, -1.35], [0.49, 0.26, 0.35, -1.34], [0.91, 0.19, 0.27, -1.34], [1.05, 0.035, 0.06, -1.34]], p.lower, 10, x);
    builder.rod([x - 0.11, -1.54, 0.47], [x + 0.11, -1.54, 0.47], 0.22, ENGINE, 10);
  }
}

function createDiveBrakes(builder: AircraftMeshBuilder): void {
  for (const side of [-1, 1]) {
    // Almost closed in flight. Dark perforation insets replace expensive literal holes.
    builder.prism([[side * 1.55, -0.235, -1.25], [side * 4.30, -0.055, -0.86], [side * 4.30, -0.025, -0.47], [side * 1.55, -0.205, -0.83]], [0, 0.025, 0], RED);
    for (let i = 0; i < 8; i += 1) {
      const t = (i + 0.5) / 8;
      builder.disc([side * (1.55 + 2.75 * t), -0.204 + t * 0.18, -1.04 + 0.39 * t], 0.055, ENGINE, 6);
    }
  }
}

function createTurret(paint: AircraftMeshBuilder, glass: AircraftMeshBuilder, p: HistoricalAircraftProfile): void {
  const y = p.radius[1] * 0.78;
  const z = -1.74;
  glass.ellipseStations([[z - 0.52, 0.08, 0.08, y], [z - 0.37, 0.42, 0.39, y], [z, 0.54, 0.61, y], [z + 0.37, 0.42, 0.39, y], [z + 0.52, 0.08, 0.08, y]], GLASS, 12);
  paint.rod([0, y + 0.16, z - 0.25], [0, y + 0.34, z - 1.61], 0.038, ENGINE, 6);
  paint.rod([-0.49, y, z], [0.49, y, z], 0.035, p.upper, 6);
}

function addWingMarkings(builder: AircraftMeshBuilder, p: HistoricalAircraftProfile, surface: readonly [number, number]) {
  const ranges: { vertexStart: number; vertexCount: number; indexStart: number; indexCount: number; offset: number }[] = [];
  const stamp = (outline: AircraftPoint[], paint: AircraftPaint, offset: number) => {
    const vertexStart = builder.positions.length / 3;
    const indexStart = builder.indices.length;
    builder.surfaceDecal(outline, surface, paint, offset);
    ranges.push({ vertexStart, vertexCount: builder.positions.length / 3 - vertexStart, indexStart, indexCount: builder.indices.length - indexStart, offset });
  };
  for (const side of [-1, 1]) {
    const section = p.wing[2];
    const x = side * p.span * section[0] / 2;
    const z = section[2] + (section[1] - section[2]) * 0.58;
    const radius = Math.min(0.51, (section[1] - section[2]) * 0.22);
    const circle = Array.from({ length: 16 }, (_, i): AircraftPoint => [x + radius * Math.cos(i * Math.PI / 8), 0, z + radius * Math.sin(i * Math.PI / 8)]);
    if (p.supportGroup === "japanese-navy") {
      stamp(circle, RED, .004);
    } else {
      stamp(circle, [0.10, 0.20, 0.31], .004);
      const points = Array.from({ length: 10 }, (_, i): AircraftPoint => {
        const angle = Math.PI / 2 + i * Math.PI / 5;
        const r = radius * (i % 2 === 0 ? 0.88 : 0.36);
        return [x + Math.cos(angle) * r, 0, z + Math.sin(angle) * r];
      });
      stamp(points, [0.87, 0.87, 0.82], .007);
    }
  }
  return ranges;
}

function createAircraftBody(scene: Scene, name: string, p: HistoricalAircraftProfile, material: MultiMaterial): Mesh {
  const paint = new AircraftMeshBuilder();
  const glass = new AircraftMeshBuilder();
  const [rx, ry] = p.radius;
  const stations = [
    [-0.5, 0.025, 0.035, 0.10], [-0.43, 0.20, 0.25, 0.12], [-0.32, 0.39, 0.44, 0.11],
    [-0.19, 0.67, 0.72, 0.06], [-0.04, 0.93, 0.97, 0], [0.12, 1, 1, 0],
    [0.26, 0.94, 0.90, 0], [0.38, 0.81, 0.78, 0], [0.452, 0.72, 0.70, 0],
  ] as const;
  paint.ellipseStations(stations.map(([z, xRadius, yRadius, center]) => [z * p.length, xRadius * rx, yRadius * ry, center]), (point) => point[1] < -0.12 ? p.lower : p.upper, 16);
  paint.ellipseStations([
    [p.cowlStart * p.length, p.cowlRadius * 0.96, p.cowlRadius * 0.96, 0],
    [(p.cowlStart + 0.035) * p.length, p.cowlRadius, p.cowlRadius, 0],
    [p.length * 0.423, p.cowlRadius, p.cowlRadius, 0],
    [p.length * 0.452, p.cowlRadius * 0.90, p.cowlRadius * 0.90, 0],
  ], p.cowl, 16);
  paint.ellipseStations([[p.length * 0.452 + 0.003, p.cowlRadius * 0.78, p.cowlRadius * 0.78, 0], [p.length * 0.458, p.cowlRadius * 0.70, p.cowlRadius * 0.70, 0]], ENGINE, 16);
  const wingSurface = createWing(paint, p.span, p.wing, p.upper, p.lower);
  createTail(paint, p);
  createCanopy(paint, glass, p);
  if (p.role !== "fighter" && !p.features.includes("dorsal-turret")) {
    const aft = p.canopy[0];
    const gunHeight = p.radius[1] * 0.8 - Math.max(0, -aft) * 0.065 + 0.20;
    paint.rod([0, gunHeight, aft + 0.12], [0, gunHeight + 0.11, aft - 0.72], 0.029, ENGINE, 6);
  }
  createPayload(paint, p);
  if (p.features.includes("fixed-spatted-gear")) createFixedGear(paint, p);
  if (p.features.includes("perforated-dive-brakes")) createDiveBrakes(paint);
  if (p.features.includes("dorsal-turret")) createTurret(paint, glass, p);
  const markingRanges = addWingMarkings(paint, p, wingSurface);
  const body = paint.createMesh(scene, `${name}-body`, glass);
  body.material = material;
  body.metadata = { modelId: p.id, historicalYear: p.year, visualOnly: true, features: [...p.features], wingSurface, markingRanges };
  return body;
}

function createPropellerMesh(scene: Scene, name: string, p: HistoricalAircraftProfile, material: StandardMaterial): Mesh {
  const builder = new AircraftMeshBuilder();
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = blade * Math.PI * 2 / 3;
    const points = [[0.11, 0.14], [0.21, 0.50], [0.20, p.propRadius * 0.83], [0.08, p.propRadius], [-0.10, p.propRadius * 0.94], [-0.16, p.propRadius * 0.55], [-0.09, 0.18]];
    builder.prism(points.map(([x, y]): AircraftPoint => [Math.cos(angle) * x - Math.sin(angle) * y, Math.sin(angle) * x + Math.cos(angle) * y, x * 0.48]), [0, 0, 0.045], (point) => Math.hypot(point[0], point[1]) > p.propRadius * 0.89 ? [0.86, 0.68, 0.17] : [0.10, 0.12, 0.12]);
  }
  const spinnerLength = p.length * 0.031;
  builder.ellipseStations([[-0.075, 0.21, 0.21, 0], [0.06, 0.23, 0.23, 0], [spinnerLength * 0.65, 0.14, 0.14, 0], [spinnerLength, 0.018, 0.018, 0]], p.supportGroup === "japanese-navy" ? p.lower : METAL, 12);
  const mesh = builder.createMesh(scene, `${name}-propeller-blades`);
  mesh.material = material;
  mesh.metadata = { modelId: p.id, bladeCount: 3, visualOnly: true };
  return mesh;
}

export function createAircraftMaterials(scene: Scene, key: string, _team: Team, _role: AircraftRole): { body: MultiMaterial; propeller: StandardMaterial } {
  const paint = new StandardMaterial(`${key}-airframe-paint`, scene);
  paint.diffuseColor = Color3.White();
  paint.emissiveColor = new Color3(0.055, 0.055, 0.055);
  paint.specularColor = new Color3(0.08, 0.08, 0.08);
  const glass = new StandardMaterial(`${key}-canopy-glass`, scene);
  glass.diffuseColor = Color3.White();
  glass.emissiveColor = new Color3(0.045, 0.065, 0.07);
  glass.specularColor = new Color3(0.62, 0.72, 0.76);
  glass.specularPower = 48;
  // Opaque glass avoids transparency-ordering artefacts and extra draw passes in large formations.
  const body = new MultiMaterial(`${key}-airframe-material`, scene);
  body.subMaterials.push(paint, glass);
  const propeller = new StandardMaterial(`${key}-propeller-material`, scene);
  propeller.diffuseColor = Color3.White();
  propeller.emissiveColor = new Color3(0.06, 0.06, 0.06);
  propeller.specularColor = Color3.Black();
  return { body, propeller };
}

export function createAirSquadronGeometry(scene: Scene, id: string, team: Team, role: AircraftRole, capacity: number): AirSquadronVisual {
  const root = new TransformNode(`${id}-air-squadron`, scene);
  const p = historicalAircraftProfile(team, role);
  root.metadata = { modelId: p.id, historicalYear: p.year, visualOnly: true, supportGroup: p.supportGroup };
  const planes: AircraftPlaneVisual[] = [];
  const count = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : 0;
  if (count === 0) return { root, planes, role, team, capacity: count, lastHeading: 0, bank: 0 };
  const materials = createAircraftMaterials(scene, id, team, role);
  // Every squadron owns its two shared geometries and materials. Also handle root.dispose()
  // without forceDisposeMaterialAndTextures; MultiMaterial does not dispose children by default.
  root.onDisposeObservable.addOnce(() => {
    materials.body.dispose(false, false, true);
    materials.propeller.dispose();
  });
  let sourceBody: Mesh | undefined;
  let sourcePropeller: Mesh | undefined;
  try {
    for (let index = 0; index < count; index += 1) {
      const name = `${id}-aircraft-${index}`;
      const planeRoot = new TransformNode(name, scene);
      planeRoot.parent = root;
      planeRoot.metadata = root.metadata;
      const body = sourceBody ? sourceBody.clone(`${name}-body`, planeRoot, true) : createAircraftBody(scene, name, p, materials.body);
      if (!body) throw new Error(`Unable to clone aircraft ${name}`);
      body.parent = planeRoot;
      sourceBody ??= body;
      const propeller = new TransformNode(`${name}-propeller`, scene);
      propeller.position.z = p.length * 0.469;
      propeller.parent = planeRoot;
      propeller.metadata = { modelId: p.id, bladeCount: 3, visualOnly: true };
      const blades = sourcePropeller ? sourcePropeller.clone(`${name}-propeller-blades`, propeller, true) : createPropellerMesh(scene, name, p, materials.propeller);
      if (!blades) throw new Error(`Unable to clone propeller ${name}`);
      blades.parent = propeller;
      sourcePropeller ??= blades;
      planes.push({ root: planeRoot, body, propeller });
    }
  } catch (error) {
    root.dispose(false, true);
    throw error;
  }
  return { root, planes, role, team, capacity: count, lastHeading: 0, bank: 0 };
}
