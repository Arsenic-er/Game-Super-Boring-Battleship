import "./lab.css";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { createProceduralShipHull } from "../../src/render/shipHullVisual";
import { createPixelShipPalette } from "../../src/render/shipMaterials";
import { createLoadoutEquipmentVisual } from "../../src/render/loadoutEquipmentVisual";
import { resolveLoadoutVisualPlan, VISUAL_EQUIPMENT_CATEGORIES } from "../../src/render/loadoutVisualPlan";
import { SHIP_CLASS_SLOT_COUNTS } from "../../src/profile/equipmentCatalog";
import { getShipClass } from "../../src/ships/classes";
import { createLabWater } from "./water";
import { createLabEnvironment } from "./environment";
import { applyLabShipAppearance } from "./shipAppearance";
import { createLabShipMotion, mpsToKnots, type LabShipMotionPreset } from "./shipMotion";
import { createLabShipWake } from "./shipWake";

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const controlsAbort = new AbortController();
const listenerOptions = { signal: controlsAbort.signal };
let disposed = false;
const engine = new Engine(canvas, true, { powerPreference: "low-power", preserveDrawingBuffer: false, stencil: false }, false);
const scene = new Scene(engine);
scene.clearColor = new Color4(.70, .84, .91, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = .00022;
scene.fogColor = new Color3(.70, .84, .91);
scene.imageProcessingConfiguration.exposure = 1;
scene.imageProcessingConfiguration.contrast = 1;
const ambient = new HemisphericLight("lab-ambient", Vector3.Up(), scene);
ambient.intensity = .78;
ambient.diffuse = new Color3(.9, .96, 1);
ambient.groundColor = new Color3(.24, .29, .3);
const sun = new DirectionalLight("lab-sun", new Vector3(.45, -.78, -.4).normalize(), scene);
sun.intensity = .9; sun.diffuse = new Color3(1, .96, .87);
sun.specular = new Color3(.96, .93, .87);

const camera = new ArcRotateCamera("lab-camera", -1, 1.2, 330, Vector3.Zero(), scene);
camera.minZ = .4; camera.maxZ = 24000; camera.fov = .80;
camera.lowerRadiusLimit = 35; camera.upperRadiusLimit = 2200;
camera.lowerBetaLimit = .08; camera.upperBetaLimit = Math.PI * .485;
camera.wheelPrecision = 5; camera.pinchPrecision = 16; camera.panningSensibility = 50;
camera.inertia = .72; camera.attachControl(canvas, true);
scene.activeCamera = camera;
const environment = createLabEnvironment(scene);
const water = createLabWater(scene);
const shipMotion = createLabShipMotion();
const shipWake = createLabShipWake(scene, water.heightAt);
let followedX = 0, followedZ = 0;

// Reuse the actual hull and component factories. No gallery-only substitute ship.
const classId = "j-class";
const definition = getShipClass(classId);
const ship = new TransformNode("lab-ship", scene);
ship.scaling.set(definition.renderScale.x, definition.renderScale.y, definition.renderScale.z);
ship.rotation.y = -.20;
const palette = createPixelShipPalette(scene, "lab-j-class", "ally");
applyLabShipAppearance(palette);
// Actual J-class sea-level footprint in world metres, not its deck bounding box.
const shipContact = { x: 0, z: 0, heading: -.20, halfLength: 54.35, halfBeam: 4.741503 };
let contactEnabled = true;
createProceduralShipHull(scene, ship, "lab-j-class", classId, palette);
const installed = Object.fromEntries(VISUAL_EQUIPMENT_CATEGORIES.map(category => [category,
  Array.from({ length: SHIP_CLASS_SLOT_COUNTS[classId][category] }, () => category + "-common"),
])) as Parameters<typeof resolveLoadoutVisualPlan>[1];
createLoadoutEquipmentVisual(scene, ship, "lab-j-class",
  resolveLoadoutVisualPlan(classId, installed), palette);

const views = {
  overview: { eye: [185, 105, -220], target: [20, 6, 130] },
  shore: { eye: [440, 86, 330], target: [85, 20, 565] },
  water: { eye: [115, 34, -135], target: [0, 4, 45] },
  ship: { eye: [72, 29, -87], target: [0, 3, 0] },
  wake: { eye: [185, 150, -240], target: [0, 0, -70] },
} as const;
type ViewName = keyof typeof views;
let activeView: ViewName = "overview";
function selectView(name: ViewName) {
  const view = views[name];
  const state = shipMotion.state;
  const offset = name === "shore" ? Vector3.Zero() : new Vector3(state.x, 0, state.z);
  camera.setTarget(Vector3.FromArray(view.target).add(offset));
  camera.setPosition(Vector3.FromArray(view.eye).add(offset));
  followedX = state.x; followedZ = state.z;
  camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = camera.inertialPanningY = 0;
  activeView = name;
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button =>
    button.classList.toggle("active", button.dataset.view === name));
}
selectView("overview");
let resolution: "budget" | "native" = "budget";
function resize() {
  const pixels = canvas.clientWidth * canvas.clientHeight;
  engine.setHardwareScalingLevel(resolution === "native" ? 1 : Math.max(1, Math.sqrt(pixels / (1280 * 720))));
  engine.resize();
}
window.addEventListener("resize", resize, listenerOptions); resize();
document.querySelector<HTMLSelectElement>("#resolution")!.addEventListener("change", event => {
  resolution = (event.target as HTMLSelectElement).value === "native" ? "native" : "budget";
  resize();
}, listenerOptions);
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button =>
  button.addEventListener("click", () => selectView(button.dataset.view as ViewName), listenerOptions));
let playing = true, seconds = 9, previous = performance.now(), lastMetrics = 0, ready = false;
const motion = document.querySelector<HTMLButtonElement>("#motion")!;
motion.addEventListener("click", () => {
  playing = !playing; motion.textContent = playing ? "暂停动画" : "继续动画";
}, listenerOptions);
const instrumentation = new SceneInstrumentation(scene);
function applyTime(time: number) {
  const state = shipMotion.state;
  if (activeView !== "shore") {
    camera.target.addInPlaceFromFloats(state.x - followedX, 0, state.z - followedZ);
  }
  followedX = state.x; followedZ = state.z;
  ship.position.x = state.x; ship.position.z = state.z; ship.rotation.y = state.heading;
  shipContact.x = ship.position.x; shipContact.z = ship.position.z;
  shipContact.heading = ship.rotation.y;
  water.update(time, contactEnabled ? shipContact : undefined); environment.update(time);
  ship.position.y = water.heightAt(state.x, state.z, time);
  shipWake.update(time, state);
  ship.rotation.z = Math.sin(time * .63) * .006;
  ship.rotation.x = Math.sin(time * .44 + .5) * .003;
}
function setSailingPreset(preset: LabShipMotionPreset) {
  shipMotion.setPreset(preset);
  document.querySelector<HTMLSelectElement>("#sailing")!.value = preset;
}
function updateSpeedReadout() {
  document.querySelector("#speed")!.textContent = mpsToKnots(shipMotion.state.speedMps).toFixed(1) + " kn";
}
function resetSailing() {
  shipMotion.reset(); shipWake.reset();
  document.querySelector<HTMLSelectElement>("#sailing")!.value = "stop";
  applyTime(seconds); updateSpeedReadout();
}
function advanceSimulation(delta: number) {
  if (!Number.isFinite(delta) || delta < 0 || delta > 600) throw new Error("Invalid preview timestep");
  let remaining = delta;
  while (remaining > 1e-8) {
    const step = Math.min(1 / 30, remaining);
    shipMotion.step(step); seconds += step; applyTime(seconds); remaining -= step;
  }
  updateSpeedReadout(); scene.render();
}
document.querySelector<HTMLSelectElement>("#sailing")!.addEventListener("change", event =>
  setSailingPreset((event.target as HTMLSelectElement).value as LabShipMotionPreset), listenerOptions);
document.querySelector<HTMLButtonElement>("#reset-sailing")!.addEventListener("click", resetSailing, listenerOptions);

// Test-only GPU diagnostics catch silent uniform type errors as well as JS errors.
function gpuDiagnostics() {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return { errors: [-1], controls: [], fogInfo: [] };
  const program = (water.mesh.material?.getEffect()?.getPipelineContext() as
    { program?: WebGLProgram } | null)?.program;
  const read = (name: string): number[] => {
    if (!program) return [];
    const location = gl.getUniformLocation(program, name);
    if (!location) return [];
    return Array.from(gl.getUniform(program, location) as Float32Array);
  };
  const controls = read("controls"), fogInfo = read("fogInfo"),
    shipPose = read("shipPose"), shipSize = read("shipSize"), errors: number[] = [];
  for (let i = 0; i < 8; i++) {
    const error = gl.getError(); if (error === gl.NO_ERROR) break; errors.push(error);
  }
  return { errors, controls, fogInfo, shipPose, shipSize };
}
function probeWater(): number[] {
  scene.render();
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return [];
  const pixels = new Uint8Array(128 * 96 * 4);
  gl.readPixels(Math.floor(engine.getRenderWidth() * .60),
    Math.floor(engine.getRenderHeight() * .22), 128, 96, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const samples: number[] = [];
  for (let i = 0; i < pixels.length; i += 16)
    samples.push(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
  return samples;
}
function snapshot() {
  const textures = scene.textures.map(texture => ({
    name: texture.name, width: texture.getSize().width, height: texture.getSize().height,
    renderTarget: texture.isRenderTarget,
  }));
  return {
    ready, seconds, playing, view: activeView, resolution,
    shipMotion: shipMotion.state, wake: shipWake.snapshot(),
    gpu: gpuDiagnostics(),
    width: engine.getRenderWidth(), height: engine.getRenderHeight(),
    activeMeshes: scene.getActiveMeshes().length,
    activeTriangles: scene.getActiveIndices() / 3,
    drawCalls: instrumentation.drawCallsCounter.current,
    waterTriangles: water.mesh.getTotalIndices() / 3,
    totalTriangles: scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
    textures, renderTargets: textures.filter(texture => texture.renderTarget).length,
    camera: { position: camera.position.asArray(), target: camera.target.asArray() },
    performanceNote: "Visual validation only. Server browser timings are not phone or Surface performance.",
    productionIntegrated: false,
  };
}
declare global {
  interface Window {
    __materialLab: {
      snapshot: typeof snapshot;
      probeWater: typeof probeWater;
      setView: typeof selectView;
      setTime: (time: number) => void;
      setContactEnabled: (enabled: boolean) => void;
      setWakeVisible: (enabled: boolean) => void;
      setSailingPreset: typeof setSailingPreset;
      advanceSimulation: typeof advanceSimulation;
      resetSailing: typeof resetSailing;
      dispose: () => void;
    };
  }
}
window.__materialLab = {
  snapshot,
  probeWater,
  setView: selectView,
  setSailingPreset, advanceSimulation, resetSailing,
  setWakeVisible(enabled) { shipWake.setVisible(enabled); applyTime(seconds); scene.render(); },
  setContactEnabled(enabled) { contactEnabled = enabled; applyTime(seconds); scene.render(); },
  // Freeze the material clock, not a replay seek. Reset + advanceSimulation replays motion.
  setTime(time) { playing = false; motion.textContent = "继续动画"; seconds = time; applyTime(time); scene.render(); },
  dispose() {
    if (disposed) return;
    disposed = true; playing = false;
    controlsAbort.abort(); camera.detachControl();
    instrumentation.dispose(); shipWake.dispose(); scene.dispose(); engine.dispose();
  },
};
scene.executeWhenReady(() => { ready = true; document.body.dataset.ready = "true"; });
engine.runRenderLoop(() => {
  const now = performance.now();
  if (playing) {
    const delta = Math.min((now - previous) / 1000, .08);
    shipMotion.step(delta); seconds += delta;
  }
  previous = now; applyTime(seconds); scene.render();
  if (now - lastMetrics > 800) {
    lastMetrics = now;
    document.querySelector("#metrics")!.textContent =
      "轻量预览 · " + engine.getRenderWidth() + "×" + engine.getRenderHeight() +
      " · " + instrumentation.drawCallsCounter.current + " draw · 无实时反射 / 体积云";
    updateSpeedReadout();
  }
});
window.addEventListener("error", event => {
  const alert = document.querySelector<HTMLDivElement>("#failure")!;
  alert.hidden = false; alert.textContent = "预览异常：" + event.message;
}, listenerOptions);
