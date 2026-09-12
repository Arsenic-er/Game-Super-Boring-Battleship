// Development-only gallery imported by scripts/inspect-historical-models.mjs.
// This file is deliberately outside src and is never a production entry point.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { CLEAR_DAY_RENDER } from "../../src/render/environmentMaterials";
import { createAirSquadronGeometry } from "../../src/render/aircraftGeometry";
import { HISTORICAL_AIRCRAFT_PROFILES, historicalAircraftProfile } from "../../src/render/historicalAircraftProfiles";
import { createProceduralShipHull } from "../../src/render/shipHullVisual";
import { createPixelShipPalette } from "../../src/render/shipMaterials";
import { createLoadoutEquipmentVisual } from "../../src/render/loadoutEquipmentVisual";
import { resolveLoadoutVisualPlan, VISUAL_EQUIPMENT_CATEGORIES } from "../../src/render/loadoutVisualPlan";
import { createHistoricalInternalEquipment } from "../../src/render/historicalEquipmentGeometry";
import { EQUIPMENT_CATALOG, SHIP_CLASS_SLOT_COUNTS } from "../../src/profile/equipmentCatalog";
import { SHIP_CLASSES, SHIP_CLASS_IDS, getShipClass } from "../../src/ships/classes";

type Entry = { kind: "aircraft" | "ships" | "equipment"; id: string; name: string; category: string };
type GalleryOptions = { hullOnly: boolean; background: "neutral" | "sky"; rarity: "common" | "purple" | "gold" | "redGold" };

const canvas = document.querySelector("canvas")!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true }, false);
engine.setHardwareScalingLevel(1);
const catalogue: Entry[] = [
  ...Object.values(HISTORICAL_AIRCRAFT_PROFILES).map((p) => ({ kind: "aircraft" as const, id: p.id, name: p.name, category: p.role })),
  ...SHIP_CLASS_IDS.map((id) => ({ kind: "ships" as const, id, name: SHIP_CLASSES[id].englishName, category: SHIP_CLASSES[id].hullId })),
  ...EQUIPMENT_CATALOG.map((item) => ({ kind: "equipment" as const, id: item.id, name: item.name, category: item.category })),
];
let scene: Scene | undefined;
let camera: ArcRotateCamera;
let instrumentation: SceneInstrumentation;
let assetRoot: TransformNode;
let activeEntry: Entry;
let assetDetail: Record<string, unknown>;
let bounds: { min: Vector3; max: Vector3; center: Vector3; size: Vector3 };

function fullSlots(shipId: keyof typeof SHIP_CLASSES, rarity: GalleryOptions["rarity"]) {
  return Object.fromEntries(VISUAL_EQUIPMENT_CATEGORIES.map((category) => [category,
    Array.from({ length: SHIP_CLASS_SLOT_COUNTS[shipId][category] }, () => `${category}-${rarity}`),
  ]));
}

function sceneBounds(root: TransformNode) {
  const meshes = root.getChildMeshes().filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0);
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    min.minimizeInPlace(box.minimumWorld); max.maximizeInPlace(box.maximumWorld);
  }
  if (![...min.asArray(), ...max.asArray()].every(Number.isFinite)) throw Error("No finite rendered model bounds");
  return { min, max, center: min.add(max).scale(.5), size: max.subtract(min) };
}

async function load(entry: Entry, options: GalleryOptions) {
  instrumentation?.dispose();
  scene?.dispose();
  activeEntry = entry;
  scene = new Scene(engine);
  scene.clearColor = options.background === "sky" ? new Color4(.62, .76, .84, 1) : new Color4(.24, .27, .30, 1);
  // Exact CLEAR_DAY_RENDER and gameView light directions/colours. No invented flat-light preset.
  scene.imageProcessingConfiguration.exposure = CLEAR_DAY_RENDER.exposure;
  scene.imageProcessingConfiguration.contrast = CLEAR_DAY_RENDER.contrast;
  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.intensity = CLEAR_DAY_RENDER.ambientIntensity;
  ambient.diffuse = new Color3(.88, .96, 1);
  ambient.groundColor = new Color3(.2, .26, .28);
  const sun = new DirectionalLight("sun", new Vector3(.558, -.558, -.648), scene);
  sun.intensity = CLEAR_DAY_RENDER.sunIntensity;
  sun.diffuse = new Color3(1, .95, .82);
  sun.specular = new Color3(1, .92, .74);
  camera = new ArcRotateCamera("gallery-camera", Math.PI / 4, Math.PI / 3, 40, Vector3.Zero(), scene);
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = .01;
  scene.activeCamera = camera;
  assetRoot = new TransformNode("qa-asset", scene);
  assetDetail = {};
  if (entry.kind === "aircraft") {
    const p = HISTORICAL_AIRCRAFT_PROFILES[entry.id as keyof typeof HISTORICAL_AIRCRAFT_PROFILES];
    const team = p.supportGroup === "us-navy" ? "player" : "enemy";
    if (historicalAircraftProfile(team, p.role).id !== p.id) throw Error("Aircraft default mapping changed");
    const visual = createAirSquadronGeometry(scene, `qa-${entry.id}`, team, p.role, 1);
    visual.root.parent = assetRoot;
    assetDetail = { source: "createAirSquadronGeometry", team, role: p.role, year: p.year, profileLength: p.length, profileSpan: p.span };
  } else if (entry.kind === "ships") {
    const id = entry.id as keyof typeof SHIP_CLASSES, definition = getShipClass(id);
    const palette = createPixelShipPalette(scene, `qa-${id}`, "ally");
    const s = definition.renderScale;
    assetRoot.scaling.set(s.x, s.y, s.z);
    const hull = createProceduralShipHull(scene, assetRoot, `qa-${id}`, id, palette);
    const slots = fullSlots(id, options.rarity);
    const plan = resolveLoadoutVisualPlan(id, slots as Parameters<typeof resolveLoadoutVisualPlan>[1]);
    if (!options.hullOnly) createLoadoutEquipmentVisual(scene, assetRoot, `qa-${id}`, plan, palette);
    assetDetail = { source: "createProceduralShipHull + createLoadoutEquipmentVisual", hullOnly: options.hullOnly,
      installedSlots: slots, signature: plan.signature, rootScale: s, hullMeshes: hull.bodyMeshes.length,
      expectedHullLength: definition.length, expectedHullBeam: definition.beam,
      bakedWeapons: false, interiorAllocated: false };
  } else {
    const item = EQUIPMENT_CATALOG.find((candidate) => candidate.id === entry.id)!;
    const shipId = item.category === "sideGun" ? "cleveland" : "fletcher";
    const palette = createPixelShipPalette(scene, `qa-${item.id}`, "ally");
    const slots = Object.fromEntries(VISUAL_EQUIPMENT_CATEGORIES.map((category) => [category, category === item.category ? [item.id] : []]));
    const plan = resolveLoadoutVisualPlan(shipId, slots as Parameters<typeof resolveLoadoutVisualPlan>[1]);
    const module = plan.internalModules.find((candidate) => candidate.equipmentId === item.id);
    if (module) {
      createHistoricalInternalEquipment(scene, assetRoot, `qa-${item.id}`, { ...module, position: { x: 0, y: 0, z: 0 } }, palette);
    } else {
      // Use the real dock/combat adapter with the normal parent scale, then center by world bounds.
      // This exercises the same metre-space mount frame as a full ship, rather than a gallery-only gun.
      const scale = getShipClass(shipId).renderScale;
      assetRoot.scaling.set(scale.x, scale.y, scale.z);
      createLoadoutEquipmentVisual(scene, assetRoot, `qa-${item.id}`, plan, palette, { category: item.category, slotIndex: 0 });
    }
    assetDetail = { source: module ? "createHistoricalInternalEquipment" : "createLoadoutEquipmentVisual",
      category: item.category, rarity: item.rarity, contextualShip: shipId, inspectionOnly: Boolean(module) };
  }
  bounds = sceneBounds(assetRoot);
  instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = true;
  instrumentation.captureRenderTime = true;
  await Promise.race([scene.whenReadyAsync(), new Promise((_, reject) => setTimeout(() => reject(Error("Scene readiness timeout")), 30000))]);
  return { ...entry, ...assetDetail };
}

function renderFrame() {
  engine.beginFrame(); scene!.render(); engine.endFrame();
}

async function render(view: string) {
  const angles: Record<string, [number, number]> = {
    threequarter: [Math.PI / 4, Math.PI / 3], side: [0, Math.PI / 2], top: [-Math.PI / 2, .012], front: [Math.PI / 2, Math.PI / 2], underside: [Math.PI / 4, Math.PI * .69],
  };
  if (!angles[view]) throw Error(`Unknown view ${view}`);
  camera.setTarget(bounds.center);
  // setTarget recomputes orbital angles from the previous position; apply the requested view last.
  [camera.alpha, camera.beta] = angles[view];
  const maxDimension = Math.max(...bounds.size.asArray());
  camera.radius = maxDimension * 3;
  camera.maxZ = maxDimension * 15;
  const viewMatrix = camera.getViewMatrix(true);
  const corners = [bounds.min.x, bounds.max.x].flatMap((x) => [bounds.min.y, bounds.max.y].flatMap((y) => [bounds.min.z, bounds.max.z].map((z) => Vector3.TransformCoordinates(new Vector3(x, y, z), viewMatrix))));
  const halfWidth = Math.max(...corners.map((corner) => Math.abs(corner.x)));
  const halfHeight = Math.max(...corners.map((corner) => Math.abs(corner.y)));
  const aspect = canvas.width / canvas.height;
  const fit = Math.max(halfHeight, halfWidth / aspect) * 1.17;
  camera.orthoTop = fit; camera.orthoBottom = -fit; camera.orthoRight = fit * aspect; camera.orthoLeft = -fit * aspect;
  for (let i = 0; i < 3; i++) renderFrame();
  const times: number[] = [];
  for (let i = 0; i < 8; i++) {
    const start = performance.now(); renderFrame(); times.push(performance.now() - start);
  }
  const meshes = assetRoot.getChildMeshes().filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0);
  const uniqueGeometry = new Set(meshes.map((mesh) => (mesh as unknown as { geometry: unknown }).geometry));
  const geometriesSeen = new Set();
  let uniqueTriangles = 0;
  for (const mesh of meshes) {
    const geometry = (mesh as unknown as { geometry: unknown }).geometry;
    if (geometry && !geometriesSeen.has(geometry)) { geometriesSeen.add(geometry); uniqueTriangles += mesh.getTotalIndices() / 3; }
  }
  times.sort((a, b) => a - b);
  if (Math.abs(camera.alpha - angles[view][0]) > 1e-8 || Math.abs(camera.beta - angles[view][1]) > 1e-8) throw Error("Requested gallery camera angles were changed during rendering");
  return {
    ...activeEntry, view, ...assetDetail,
    sceneMeshes: scene!.meshes.length, activeMeshes: scene!.getActiveMeshes().length,
    modelMeshes: meshes.length, modelTriangles: meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0), uniqueTriangles,
    uniqueGeometries: uniqueGeometry.size,
    materialSubmeshes: meshes.reduce((sum, mesh) => sum + mesh.subMeshes.length, 0),
    actualDrawCalls: instrumentation.drawCallsCounter.current,
    activeTriangles: scene!.getActiveIndices() / 3,
    cpuSubmitMedianMs: times[Math.floor(times.length / 2)], cpuSubmitP95Ms: times.at(-1),
    bounds: { min: bounds.min.asArray(), max: bounds.max.asArray(), size: bounds.size.asArray() },
    camera: { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.asArray(), orthoHalfHeight: fit },
    gl: { version: engine.webGLVersion, caps: { maxTexturesImageUnits: engine.getCaps().maxTexturesImageUnits } },
  };
}

Object.assign(window, { __historicalModels: { catalogue, load, render, dispose: () => { instrumentation?.dispose(); scene?.dispose(); engine.dispose(); } } });
