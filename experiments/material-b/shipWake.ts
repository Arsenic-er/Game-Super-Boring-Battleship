import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export interface LabWakeState {
  x: number;
  z: number;
  /** Babylon Y rotation, radians; local +z is the bow. */
  heading: number;
  /** Metres per second. Zero and reverse do not emit a forward wake. */
  speedMps: number;
}
export type LabWaterHeight = (x: number, z: number, seconds: number) => number;

const MAX_POINTS = 144;
const COLUMNS = 5;
const LOCAL_SECTIONS = 17;
const LOCAL_RIBBONS = 5;
const SAMPLE_DISTANCE = 4;
const LIFETIME = 42;
const MIN_SPEED = .18;
const FULL_SPEED = 18 * .514444;
const STERN_Z = -54.35;
const BOW_Z = .985027 * 54.35;
const CONTACT_PROFILE = [
  [-1, 1.227631], [-.94, 2.662609], [-.82, 3.71127], [-.64, 4.298396],
  [-.4, 4.653584], [-.12, 4.741503], [.16, 4.596322], [.4, 4.183525],
  [.599843, 3.339704], [.777819, 2.229825], [.902044, 1.115475],
  [.956877, .441188], [.983441, .078919], [.985027, 0],
] as const;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const strengthAt = (speedMps: number) => clamp01((speedMps - MIN_SPEED) / (FULL_SPEED - MIN_SPEED));

interface TrailPoint {
  x: number;
  z: number;
  heading: number;
  born: number;
  strength: number;
  pathDistance: number;
  breakBefore: boolean;
}
interface ObservedPose extends LabWakeState { seconds: number; }
interface EmissionAnchor {
  x: number; z: number;
  seconds: number; heading: number;
  strength: number;
}

function halfWidthAt(z: number): number {
  const q = z / 54.35;
  if (q < -1 || q > .985027) return 0;
  for (let i = 1; i < CONTACT_PROFILE.length; i++) {
    const a = CONTACT_PROFILE[i - 1]!, b = CONTACT_PROFILE[i]!;
    if (q <= b[0]) return a[1] + (b[1] - a[1]) * (q - a[0]) / (b[0] - a[0]);
  }
  return 0;
}

function createFoamMask(scene: Scene): RawTexture {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number, cells: number, seed: number) => {
    let value = Math.imul((x % cells + cells) % cells + seed * 19, 1_597_334_677)
      ^ Math.imul((y % cells + cells) % cells + seed * 71, 381_201_581);
    value = Math.imul(value ^ (value >>> 16), 2_246_822_507);
    return (value >>> 0) / 4_294_967_296;
  };
  const noise = (u: number, v: number, cells: number, seed: number) => {
    const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, cells, seed), b = hash(ix + 1, iy, cells, seed);
    const c = hash(ix, iy + 1, cells, seed), d = hash(ix + 1, iy + 1, cells, seed);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = noise(x / size, y / size, 7, 13) * .58
      + noise(x / size, y / size, 19, 31) * .30
      + noise(x / size, y / size, 43, 47) * .12;
    const offset = (y * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = Math.round(value * 255);
    pixels[offset + 3] = 255;
  }
  const texture = RawTexture.CreateRGBATexture(pixels, size, size, scene,
    true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = "lab-ship-wake-periodic-foam-mask";
  texture.gammaSpace = false;
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 2;
  return texture;
}

const vertexSource = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec3 vWorld;
varying vec2 vUV;
varying vec4 vColor;
void main() {
  vWorld = position;
  vUV = uv;
  vColor = color;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;
const fragmentSource = `
precision highp float;
varying vec3 vWorld;
varying vec2 vUV;
varying vec4 vColor;
uniform sampler2D foamSampler;
uniform float time;
uniform vec4 fogInfo;
uniform vec4 eye;
uniform vec4 fogTint;
void main() {
  // One shared low-resolution mask. Its world-space coordinates do not rotate
  // with the current ship, even when the ship turns after leaving a trail.
  float noise = texture2D(foamSampler, vWorld.xz / 23.0 + vec2(time * .002, -time * .001)).r;
  float edge = smoothstep(0.0, .14, vUV.x) * smoothstep(0.0, .14, 1.0 - vUV.x);
  float fragments = smoothstep(.27, .73, noise);
  float alpha = vColor.a * edge * fragments;
  float distanceToEye = length(eye.xyz - vWorld);
  float fog = 0.0;
  if (fogInfo.x > 2.5) {
    fog = clamp((distanceToEye - fogInfo.y) / max(1.0, fogInfo.z - fogInfo.y), 0.0, 1.0);
  } else if (fogInfo.x > 1.5) {
    float opticalDistance = distanceToEye * fogInfo.w;
    fog = 1.0 - exp(-opticalDistance * opticalDistance);
  } else if (fogInfo.x > .5) {
    fog = 1.0 - exp(-distanceToEye * fogInfo.w);
  }
  alpha *= 1.0 - fog;
  // Thin meshes, low opacity and early clipping avoid a broad white carpet.
  if (alpha < .007) discard;
  vec3 foam = vColor.rgb * (.92 + .08 * noise);
  gl_FragColor = vec4(mix(foam, fogTint.rgb, fog), alpha);
}
`;

function gridIndices(rows: number, columns: number, base = 0): number[] {
  const indices: number[] = [];
  for (let row = 1; row < rows; row++) for (let col = 0; col < columns - 1; col++) {
    const a = base + (row - 1) * columns + col, b = a + columns;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return indices;
}

function makeBuffers(name: string, vertices: number, indices: number[], scene: Scene, material: ShaderMaterial) {
  const positions = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const colors = new Float32Array(vertices * 4);
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions; data.uvs = uvs; data.colors = colors;
  data.indices = indices.length ? indices : [0, 0, 0];
  data.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.setEnabled(false);
  return { mesh, positions, uvs, colors };
}

/** Isolated lab effects: at most two transparent draws and 1,464 triangles. */
export function createLabShipWake(scene: Scene, heightAt: LabWaterHeight) {
  const texture = createFoamMask(scene);
  const material = new ShaderMaterial("lab-ship-wake-material", scene,
    { vertexSource, fragmentSource }, {
      attributes: ["position", "uv", "color"],
      uniforms: ["worldViewProjection", "time", "fogInfo", "eye", "fogTint"],
      samplers: ["foamSampler"],
      needAlphaBlending: true,
      needAlphaTesting: false,
    });
  material.setTexture("foamSampler", texture);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.needDepthPrePass = false;
  const localIndices: number[] = [];
  for (let i = 0; i < LOCAL_RIBBONS; i++) {
    localIndices.push(...gridIndices(LOCAL_SECTIONS, 3, i * LOCAL_SECTIONS * 3));
  }
  const local = makeBuffers("lab-ship-near-waves", LOCAL_RIBBONS * LOCAL_SECTIONS * 3,
    localIndices, scene, material);
  const trail = makeBuffers("lab-ship-world-trail", MAX_POINTS * COLUMNS, [], scene, material);
  local.mesh.alphaIndex = 2;
  trail.mesh.alphaIndex = 1;
  const fogUniform = new Vector4(), eyeUniform = new Vector4(), fogTint = new Vector4();
  let points: TrailPoint[] = [];
  let previous: ObservedPose | undefined;
  let emissionAnchor: EmissionAnchor | undefined;
  let pathDistance = 0;
  let topologyDirty = true;
  let activeSegments = 0;
  let lastSpeed = 0;
  let lastSeconds = 0;
  let visible = true;

  const setVertex = (buffers: typeof local, index: number, x: number, z: number,
    u: number, v: number, alpha: number, seconds: number, tint: readonly number[]) => {
    const p = index * 3, c = index * 4;
    buffers.positions[p] = x;
    buffers.positions[p + 1] = heightAt(x, z, seconds) + .045;
    buffers.positions[p + 2] = z;
    buffers.uvs[index * 2] = u; buffers.uvs[index * 2 + 1] = v;
    buffers.colors[c] = tint[0]!;
    buffers.colors[c + 1] = tint[1]!;
    buffers.colors[c + 2] = tint[2]!;
    buffers.colors[c + 3] = Math.max(0, alpha);
  };
  const upload = (buffers: typeof local) => {
    buffers.mesh.updateVerticesData(VertexBuffer.PositionKind, buffers.positions, false);
    buffers.mesh.updateVerticesData(VertexBuffer.UVKind, buffers.uvs, false);
    buffers.mesh.updateVerticesData(VertexBuffer.ColorKind, buffers.colors, false);
  };
  const reset = () => {
    points = [];
    previous = undefined;
    emissionAnchor = undefined;
    pathDistance = 0;
    topologyDirty = true;
    activeSegments = 0;
    lastSpeed = 0;
    lastSeconds = 0;
    local.mesh.setEnabled(false);
    trail.mesh.setEnabled(false);
  };
  const append = (point: TrailPoint) => {
    points.push(point);
    if (points.length > MAX_POINTS) points.shift();
    topologyDirty = true;
  };
  const drawNearShip = (seconds: number, state: LabWakeState) => {
    const strength = strengthAt(state.speedMps);
    local.mesh.setEnabled(strength > 0);
    if (strength <= 0) return;
    const c = Math.cos(state.heading), s = Math.sin(state.heading);
    for (let ribbon = 0; ribbon < LOCAL_RIBBONS; ribbon++) {
      const side = ribbon % 2 === 0 ? -1 : 1;
      for (let row = 0; row < LOCAL_SECTIONS; row++) {
        const t = row / (LOCAL_SECTIONS - 1);
        let x: number, z: number, halfWidth: number, alpha: number;
        if (ribbon < 2) {
          z = BOW_Z - 28 * t;
          x = side * (halfWidthAt(z) + .20 + t * t * (1.1 + strength * 4.4));
          halfWidth = .15 + strength * .38;
          alpha = strength * .21 * Math.pow(1 - t, .65);
        } else if (ribbon < 4) {
          z = 30 + (STERN_Z - 30) * t;
          x = side * (halfWidthAt(z) + .18 + strength * .25);
          halfWidth = .14 + strength * .30;
          alpha = strength * .115 * (.55 + .45 * t);
        } else {
          z = STERN_Z - t * (8 + strength * 14);
          x = Math.sin(seconds * .8 + t * 5) * .25 * strength * (1 - t);
          halfWidth = 1.18 + t * (1.0 + strength * 1.7);
          alpha = strength * .16 * (1 - t) * (1 - t);
        }
        for (let col = 0; col < 3; col++) {
          const cross = col - 1, lx = x + cross * halfWidth;
          const wx = state.x + lx * c + z * s, wz = state.z - lx * s + z * c;
          const index = (ribbon * LOCAL_SECTIONS + row) * 3 + col;
          setVertex(local, index, wx, wz, col / 2, t, col === 1 ? alpha : 0, seconds,
            ribbon < 2 ? [.73, .82, .79] : [.64, .77, .76]);
        }
      }
    }
    upload(local);
  };
  const drawHistory = (seconds: number) => {
    if (topologyDirty) {
      const indices: number[] = [];
      activeSegments = 0;
      for (let i = 1; i < points.length; i++) {
        if (points[i]!.breakBefore) continue;
        indices.push(...gridIndices(2, COLUMNS, (i - 1) * COLUMNS));
        activeSegments++;
      }
      trail.mesh.setIndices(indices.length ? indices : [0, 0, 0], MAX_POINTS * COLUMNS, true);
      topologyDirty = false;
    }
    trail.mesh.setEnabled(activeSegments > 0);
    if (!activeSegments) return;
    for (let row = 0; row < points.length; row++) {
      const point = points[row]!, age = Math.max(0, seconds - point.born);
      const fade = Math.pow(clamp01(1 - age / LIFETIME), 1.7);
      const width = 1.30 + point.strength * 1.85 + age * (.055 + point.strength * .105);
      const c = Math.cos(point.heading), s = Math.sin(point.heading);
      for (let col = 0; col < COLUMNS; col++) {
        const cross = col / (COLUMNS - 1) * 2 - 1;
        const alpha = point.strength * .205 * fade * (1 - cross * cross);
        setVertex(trail, row * COLUMNS + col, point.x + cross * width * c,
          point.z - cross * width * s, col / (COLUMNS - 1), point.pathDistance / 12,
          alpha, seconds, [.65, .78, .77]);
      }
    }
    upload(trail);
  };
  const syncUniforms = (seconds: number) => {
    const camera = scene.activeCamera?.globalPosition;
    eyeUniform.set(camera?.x ?? 0, camera?.y ?? 0, camera?.z ?? 0, 0);
    fogUniform.set(scene.fogEnabled ? scene.fogMode : 0, scene.fogStart, scene.fogEnd, scene.fogDensity);
    fogTint.set(scene.fogColor.r, scene.fogColor.g, scene.fogColor.b, 1);
    material.setFloat("time", seconds);
    material.setVector4("eye", eyeUniform);
    material.setVector4("fogInfo", fogUniform);
    material.setVector4("fogTint", fogTint);
  };
  const update = (seconds: number, state: LabWakeState) => {
    if (![seconds, state.x, state.z, state.heading, state.speedMps].every(Number.isFinite)) return;
    if (previous && seconds < previous.seconds) reset();
    // A paused renderer can still move the camera or change fog. Keep uniforms
    // fresh without rebuilding or uploading identical vertex/index buffers.
    if (previous && seconds === previous.seconds && state.x === previous.x
      && state.z === previous.z && state.heading === previous.heading
      && state.speedMps === previous.speedMps) {
      syncUniforms(seconds);
      return;
    }
    const dt = previous ? seconds - previous.seconds : 0;
    lastSeconds = seconds; lastSpeed = state.speedMps;
    const retained = points.filter(point => seconds - point.born < LIFETIME);
    if (retained.length !== points.length) { points = retained; topologyDirty = true; }
    if (state.speedMps <= MIN_SPEED) {
      emissionAnchor = undefined;
    } else if (dt > 0 && previous) {
      const stern = { x: state.x + Math.sin(state.heading) * STERN_Z,
        z: state.z + Math.cos(state.heading) * STERN_Z };
      const strength = strengthAt(state.speedMps);
      if (!emissionAnchor) {
        append({ ...stern, heading: state.heading, born: seconds, strength,
          pathDistance, breakBefore: true });
        emissionAnchor = { ...stern, seconds, heading: state.heading, strength };
      } else {
        const dx = stern.x - emissionAnchor.x, dz = stern.z - emissionAnchor.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 200) {
          // An explicit reset is preferable for teleports, but never bridge one.
          append({ ...stern, heading: state.heading, born: seconds, strength,
            pathDistance, breakBefore: true });
          emissionAnchor = { ...stern, seconds, heading: state.heading, strength };
        } else if (distance >= SAMPLE_DISTANCE) {
          const steps = Math.floor(distance / SAMPLE_DISTANCE);
          const start = emissionAnchor;
          const angleDelta = Math.atan2(Math.sin(state.heading - start.heading),
            Math.cos(state.heading - start.heading));
          const elapsed = seconds - start.seconds;
          for (let i = 1; i <= steps; i++) {
            const f = i * SAMPLE_DISTANCE / distance;
            pathDistance += SAMPLE_DISTANCE;
            append({ x: start.x + dx * f, z: start.z + dz * f,
              heading: start.heading + angleDelta * f,
              born: start.seconds + elapsed * f,
              strength: start.strength + (strength - start.strength) * f,
              pathDistance, breakBefore: false });
          }
          const fraction = steps * SAMPLE_DISTANCE / distance;
          emissionAnchor = { x: start.x + dx * fraction, z: start.z + dz * fraction,
            seconds: start.seconds + elapsed * fraction,
            heading: start.heading + angleDelta * fraction,
            strength: start.strength + (strength - start.strength) * fraction };
        }
      }
    }
    previous = { ...state, seconds };
    drawNearShip(seconds, state);
    drawHistory(seconds);
    syncUniforms(seconds);
  };
  return {
    update, reset,
    setVisible: (enabled: boolean) => {
      visible = enabled;
      local.mesh.isVisible = enabled;
      trail.mesh.isVisible = enabled;
    },
    snapshot: () => ({
      speedMps: lastSpeed, seconds: lastSeconds, visible,
      emitting: lastSpeed > MIN_SPEED && emissionAnchor !== undefined,
      lifetimeSeconds: LIFETIME, sampleDistanceMetres: SAMPLE_DISTANCE,
      trailPointCount: points.length, trailSegments: activeSegments,
      oldestAgeSeconds: points.length ? lastSeconds - points[0]!.born : 0,
      activeDraws: visible ? Number(local.mesh.isEnabled()) + Number(trail.mesh.isEnabled()) : 0,
      maxDraws: 2, maxTriangles: (MAX_POINTS - 1) * (COLUMNS - 1) * 2 + LOCAL_RIBBONS * (LOCAL_SECTIONS - 1) * 4,
      worldSpace: true,
      points: points.map(point => ({ x: point.x, z: point.z, born: point.born,
        heading: point.heading, breakBefore: point.breakBefore })),
    }),
    dispose: () => {
      local.mesh.dispose(false, false);
      trail.mesh.dispose(false, false);
      material.dispose(false, false);
      texture.dispose();
      points = [];
    },
  };
}
