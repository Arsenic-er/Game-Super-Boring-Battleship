import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { LAB_ISLANDS, islandContourPoint, sampleGroundHeight, type LabIsland } from './world';

type RGB = readonly [number, number, number];
type Point = readonly [number, number, number];
const LIGHT = new Vector3(-.45, .78, .4).normalize();
const SEGMENTS = 72;
const RADII = [.085, .17, .255, .34, .425, .51, .595, .68, .755, .82,
  .87, .915, .95, .978, 1, 1.025, 1.065, 1.12, 1.20, 1.32, 1.46, 1.60];
function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
function blend(a: RGB, b: RGB, amount: number): RGB {
  return [a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}
function slopeAt(x: number, z: number): number {
  const dx = (sampleGroundHeight(x + 3, z) - sampleGroundHeight(x - 3, z)) / 6;
  const dz = (sampleGroundHeight(x, z + 3) - sampleGroundHeight(x, z - 3)) / 6;
  return Math.hypot(dx, dz);
}
function surfaceColor(point: Point, island: LabIsland): RGB {
  const [x, y, z] = point;
  const patch = .5 + .5 * Math.sin(x * .041 + Math.sin(z * .029) * 2)
    * Math.sin(z * .037 - x * .015);
  const sand: RGB = [.78, .755, .615];
  const wetSand: RGB = [.60, .64, .535];
  const grass = blend([.285, .43, .205], [.405, .535, .27], patch);
  const stone = blend([.455, .48, .455], [.595, .595, .53], patch * .65);
  const rock = Math.max(smoothstep(.55, 1.12, slopeAt(x, z)),
    smoothstep(island.height * .61, island.height * .9, y) * .7);
  const inland = blend(grass, stone, rock);
  if (y < 0) return blend(wetSand, [.42, .52, .48], smoothstep(0, 45, -y));
  const beach = blend(wetSand, sand, smoothstep(0, 2.4, y));
  return blend(beach, inland, smoothstep(3.4, 10.5, y));
}
interface GeometryData {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}
const geometryData = (): GeometryData => ({ positions: [], normals: [], colors: [], indices: [] });
/** Flat faces carry baked light, retaining detail without shadow maps. */
function face(data: GeometryData, a: Point, b: Point, c: Point,
  colorAt: (p: Point) => RGB, variation = 1): void {
  const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const normal = Vector3.Cross(ab, ac).normalize().scaleInPlace(-1);
  const light = (.57 + .42 * Math.max(0, Vector3.Dot(normal, LIGHT))
    + .04 * Math.max(0, normal.y)) * variation;
  for (const point of [a, b, c]) {
    data.indices.push(data.positions.length / 3);
    data.positions.push(...point);
    data.normals.push(normal.x, normal.y, normal.z);
    const color = colorAt(point);
    data.colors.push(color[0] * light, color[1] * light, color[2] * light, 1);
  }
}
function finishMesh(scene: Scene, name: string, data: GeometryData,
  material: StandardMaterial): Mesh {
  const mesh = new Mesh(name, scene);
  const vertices = new VertexData();
  vertices.positions = data.positions;
  vertices.normals = data.normals;
  vertices.colors = data.colors;
  vertices.indices = data.indices;
  vertices.applyToMesh(mesh, false);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = false;
  mesh.freezeWorldMatrix();
  return mesh;
}
function makeIsland(scene: Scene, island: LabIsland, material: StandardMaterial): Mesh {
  const data = geometryData();
  const center: Point = [island.x, sampleGroundHeight(island.x, island.z), island.z];
  let previous: Point[] = [];
  for (let ring = 0; ring < RADII.length; ring++) {
    const radial = RADII[ring]!;
    const points: Point[] = [];
    for (let segment = 0; segment < SEGMENTS; segment++) {
      // Stagger inner rings to avoid a regular spoke pattern.
      const offset = radial < .95 ? (ring % 2) * .37 : 0;
      const angle = (segment + offset) / SEGMENTS * Math.PI * 2;
      const point = islandContourPoint(island, angle, radial);
      points.push([point.x, radial === 1 ? 0 : sampleGroundHeight(point.x, point.z), point.z]);
    }
    for (let segment = 0; segment < SEGMENTS; segment++) {
      const next = (segment + 1) % SEGMENTS;
      const colorAt = (p: Point) => surfaceColor(p, island);
      if (ring === 0) face(data, center, points[segment]!, points[next]!, colorAt);
      else {
        face(data, previous[segment]!, points[segment]!, points[next]!, colorAt);
        face(data, previous[segment]!, points[next]!, previous[next]!, colorAt);
      }
    }
    previous = points;
  }
  return finishMesh(scene, 'b-island-' + island.seed, data, material);
}
/** Sparse inland canopies: one merged mesh, no coastal prop carpet. */
function makeVegetation(scene: Scene, material: StandardMaterial): Mesh {
  const data = geometryData();
  for (const island of LAB_ISLANDS) {
    let seed: number = island.seed;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const target = island.seed === 19 ? 42 : 25;
    let count = 0;
    for (let attempt = 0; attempt < 240 && count < target; attempt++) {
      const x = island.x + (random() * 2 - 1) * island.rx * .78;
      const z = island.z + (random() * 2 - 1) * island.rz * .78;
      const y = sampleGroundHeight(x, z);
      if (y < 14 || y > island.height * .60 || slopeAt(x, z) > .52) continue;
      const radius = 3 + random() * 3.7;
      const height = 5 + random() * 5;
      const turn = random() * Math.PI;
      const ring: Point[] = [];
      for (let side = 0; side < 4; side++) {
        const angle = turn + side * Math.PI / 2;
        ring.push([x + Math.cos(angle) * radius, y + height * .47,
          z + Math.sin(angle) * radius * .84]);
      }
      const top: Point = [x + radius * .12, y + height, z];
      const bottom: Point = [x, y - .8, z];
      const canopy = blend([.205, .345, .205], [.365, .46, .24], random());
      for (let side = 0; side < 4; side++) {
        const next = (side + 1) % 4;
        face(data, top, ring[side]!, ring[next]!, () => canopy);
        face(data, bottom, ring[next]!, ring[side]!, () => canopy, .88);
      }
      count++;
    }
  }
  return finishMesh(scene, 'b-inland-canopies', data, material);
}
const skyVertex = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
const skyFragment = `
precision highp float;
varying vec3 vDirection;
uniform float time;
uniform vec3 horizonColor;
float puff(vec2 p, vec2 centre, vec2 extent) {
  vec2 q = (p - centre) / extent;
  return 1.0 - smoothstep(.63, 1.0, dot(q, q));
}
vec2 cloud(vec2 p, vec2 centre, vec2 extent) {
  vec2 q = (p - centre) / extent;
  // Unequal lobes and a tapered tail avoid repeating oval silhouettes.
  float body = puff(q, vec2(-.43, -.08), vec2(.59, .36));
  body = max(body, puff(q, vec2(-.09, .19), vec2(.47, .61)));
  body = max(body, puff(q, vec2(.32, .10), vec2(.42, .43)));
  body = max(body, puff(q, vec2(.69, -.06), vec2(.40, .25)));
  body = max(body, puff(q, vec2(.04, -.20), vec2(.94, .18)));
  return vec2(body, clamp(q.y * .67 + .57, 0.0, 1.0));
}
void main() {
  vec3 direction = normalize(vDirection);
  float elevation = max(0.0, direction.y);
  float gradient = pow(smoothstep(0.0, .91, elevation), .56);
  vec3 colour = mix(horizonColor, vec3(.24, .56, .80), gradient);
  vec3 sun = normalize(vec3(-.45, .78, .4));
  float glow = pow(max(0.0, dot(direction, sun)), 18.0);
  colour += vec3(.062, .048, .022) * glow;
  float azimuth = atan(direction.x, direction.z);
  azimuth = mod(azimuth - time * .00048 + 3.14159265, 6.2831853) - 3.14159265;
  vec2 p = vec2(azimuth, asin(clamp(direction.y, -.999, .999)));
  // Overview points at -0.44 rad; its top ray reaches only ~0.15 rad elevation.
  // Three separated groups occupy the visible low sky; two remain higher/back.
  vec2 c1 = cloud(p, vec2(-.85, .055), vec2(.18, .037));
  vec2 c2 = cloud(p, vec2(-.44, .085), vec2(.155, .042));
  vec2 c3 = cloud(p, vec2(-.07, .046), vec2(.20, .031));
  vec2 c4 = cloud(p, vec2(-1.50, .20), vec2(.27, .066));
  vec2 c5 = cloud(p, vec2(1.75, .32), vec2(.38, .077));
  vec2 cloudMask = c1;
  if (c2.x > cloudMask.x) cloudMask = c2;
  if (c3.x > cloudMask.x) cloudMask = c3;
  if (c4.x > cloudMask.x) cloudMask = c4;
  if (c5.x > cloudMask.x) cloudMask = c5;
  vec3 cloudColour = mix(vec3(.755, .817, .842), vec3(.954, .956, .932), cloudMask.y);
  // Keep a horizon veil without erasing every low-elevation cloud.
  float cloudHaze = smoothstep(0.0, .035, elevation)
    * mix(.70, 1.0, smoothstep(.025, .20, elevation));
  colour = mix(colour, cloudColour, cloudMask.x * .90 * cloudHaze);
  gl_FragColor = vec4(colour, 1.0);
}`;
/** Five draws: sky, three islands, merged vegetation. No RTT or shadow maps. */
export function createLabEnvironment(scene: Scene): {
  update(seconds: number): void;
  dispose(): void;
  meshes: Mesh[];
} {
  const terrainMaterial = new StandardMaterial('b-baked-terrain-material', scene);
  terrainMaterial.disableLighting = true;
  terrainMaterial.diffuseColor = Color3.White();
  terrainMaterial.emissiveColor = Color3.White();
  terrainMaterial.specularColor = Color3.Black();
  terrainMaterial.fogEnabled = true;
  terrainMaterial.backFaceCulling = true;
  const skyMaterial = new ShaderMaterial('b-clear-sky-material', scene,
    { vertexSource: skyVertex, fragmentSource: skyFragment }, {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'time', 'horizonColor'],
      needAlphaBlending: false, needAlphaTesting: false,
    });
  skyMaterial.backFaceCulling = false;
  skyMaterial.disableDepthWrite = true;
  skyMaterial.fogEnabled = false;
  skyMaterial.setFloat('time', 0);
  skyMaterial.setColor3('horizonColor', new Color3(.70, .84, .91));
  const sky = CreateSphere('b-clear-sky', { diameter: 16000, segments: 16 }, scene);
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  sky.alwaysSelectAsActiveMesh = true;
  const meshes = [sky, ...LAB_ISLANDS.map(island => makeIsland(scene, island, terrainMaterial)),
    makeVegetation(scene, terrainMaterial)];
  return {
    meshes,
    update(seconds: number) {
      skyMaterial.setFloat('time', Number.isFinite(seconds) ? seconds : 0);
      skyMaterial.setColor3('horizonColor', scene.fogColor);
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      terrainMaterial.dispose();
      skyMaterial.dispose();
    },
  };
}
