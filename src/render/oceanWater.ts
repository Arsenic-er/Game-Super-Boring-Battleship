import { WaterMaterial } from "@babylonjs/materials/water/waterMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { WeatherId } from "../sim/weather";
import { WATER_RENDER } from "./environmentMaterials";

export type OceanQuality = "low" | "medium";
export const OCEAN_QUALITY = {
  low: { subdivisions: 96, textureSize: 256, refreshRate: 3, reflectedShips: 1, distance: 800 },
  medium: { subdivisions: 128, textureSize: 512, refreshRate: 1, reflectedShips: 3, distance: 1_800 },
} as const;
export const OCEAN_WEATHER = {
  clear: { waveHeight: .065, waveSpeed: 42, windForce: 3, bumpHeight: .075 },
  scattered: { waveHeight: .085, waveSpeed: 46, windForce: 3.5, bumpHeight: .085 },
  overcast: { waveHeight: .11, waveSpeed: 50, windForce: 4.3, bumpHeight: .095 },
  "rain-squall": { waveHeight: .15, waveSpeed: 58, windForce: 5.6, bumpHeight: .115 },
  "sea-fog": { waveHeight: .035, waveSpeed: 32, windForce: 2, bumpHeight: .055 },
} as const;
const WAVE_COUNT = 4 * Math.PI / 128;
const NORMAL_TILE_METERS = 72;
const WIND = new Vector2(.86, .51);

/** Original seamless normal data, independent of external asset/CDN availability. */
export function oceanNormalData(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 3);
  let seed = 0x74a913;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
  const waves = Array.from({ length: 24 }, () => {
    const kx = 2 + Math.floor(random() * 32);
    const kz = (2 + Math.floor(random() * 32)) * (random() < .5 ? -1 : 1);
    return [kx, kz, .075 / (1 + Math.hypot(kx, kz) / 28), random() * Math.PI * 2];
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dz = 0;
      for (const [kx, kz, amplitude, offset] of waves) {
        const phase = 2 * Math.PI * (kx! * x + kz! * y) / size + offset!;
        const slope = Math.cos(phase) * amplitude!;
        const length = Math.hypot(kx!, kz!);
        dx += slope * kx! / length;
        dz += slope * kz! / length;
      }
      const length = Math.hypot(dx, dz, 1);
      const offset = (y * size + x) * 3;
      data[offset] = Math.round((.5 - dx / length * .5) * 255);
      data[offset + 1] = Math.round((.5 - dz / length * .5) * 255);
      data[offset + 2] = Math.round((.5 + 1 / length * .5) * 255);
    }
  }
  return data;
}

export function createOceanMaterial(scene: Scene, quality: OceanQuality = "low") {
  const size = OCEAN_QUALITY[quality].textureSize;
  const material = new WaterMaterial("ocean-water-material", scene, new Vector2(size, size));
  const normal = RawTexture.CreateRGBTexture(oceanNormalData(), 256, 256, scene,
    true, false, Texture.TRILINEAR_SAMPLINGMODE);
  normal.name = "ocean-wave-normal";
  normal.wrapU = normal.wrapV = Texture.WRAP_ADDRESSMODE;
  normal.gammaSpace = false;
  normal.level = 1;
  normal.anisotropicFilteringLevel = quality === "low" ? 2 : 4;
  material.bumpTexture = normal;
  material.alpha = 1; // Refraction comes from the RTT, not a second alpha-blended sea.
  material.disableDepthWrite = false;
  material.backFaceCulling = false;
  material.disableClipPlane = false;
  material.useWorldCoordinatesForWaveDeformation = true;
  material.bumpSuperimpose = true;
  material.bumpAffectsReflection = true;
  material.fresnelSeparate = true;
  material.windDirection.copyFrom(WIND);
  material.waveCount = WAVE_COUNT;
  material.waveLength = 1;
  material.waterColor = new Color3(.025, .28, .36);
  material.colorBlendFactor = .28;
  material.colorBlendFactor2 = .62;
  material.specularColor = new Color3(.36, .41, .44);
  material.specularPower = 160;
  material.maxSimultaneousLights = 2;
  Object.assign(material, OCEAN_WEATHER.clear);
  for (const target of [material.reflectionTexture!, material.refractionTexture!]) {
    target.name = `ocean-${target === material.reflectionTexture ? "reflection" : "refraction"}`;
    target.renderParticles = false;
    target.renderSprites = false;
    target.refreshRate = OCEAN_QUALITY[quality].refreshRate;
    target.renderList = [];
  }
  material.refractionTexture!.clearColor = new Color4(.035, .23, .3, 1);
  return { material, normal };
}

/** Dense near the ship and coarse at the horizon: one mesh and one RTT pair. */
export function oceanGrid(subdivisions: number): VertexData {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const axis = (index: number) => {
    const n = index / subdivisions * 2 - 1;
    const a = Math.abs(n);
    return Math.sign(n) * (a <= .75 ? a / .75 * 600
      : 600 + Math.pow((a - .75) / .25, 2.3) * 17_400);
  };
  for (let z = 0; z <= subdivisions; z++) {
    for (let x = 0; x <= subdivisions; x++) {
      positions.push(axis(x), 0, axis(z));
      normals.push(0, 1, 0);
      uvs.push(axis(x) / NORMAL_TILE_METERS, axis(z) / NORMAL_TILE_METERS);
      if (z < subdivisions && x < subdivisions) {
        const a = z * (subdivisions + 1) + x, b = a + subdivisions + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const data = new VertexData();
  data.positions = positions; data.normals = normals; data.uvs = uvs; data.indices = indices;
  return data;
}

export function oceanHeightAt(x: number, z: number, seconds: number, weather: WeatherId): number {
  const wave = OCEAN_WEATHER[weather];
  const phase = seconds / 100 * wave.waveSpeed;
  // Exact displacement of the pinned official 9.16.1 water vertex shader.
  return WATER_RENDER.surfaceY + Math.abs(
    Math.sin(x * WAVE_COUNT * .5 + phase) * wave.waveHeight * WIND.x * 5
    + Math.cos(z * WAVE_COUNT * .5 + phase) * wave.waveHeight * WIND.y * 5);
}

export interface OceanShipReflection {
  x: number;
  z: number;
  meshes: readonly AbstractMesh[];
}

export class OceanWater {
  readonly mesh: Mesh;
  readonly material: WaterMaterial;
  private quality: OceanQuality = "low";
  private seconds = 0;
  private weather: WeatherId = "clear";
  private positions: number[] = [];
  private worldUvs: Float32Array = new Float32Array();
  private lastRenderListUpdate = -Infinity;
  private environment: AbstractMesh[] = [];
  private seaFloor: AbstractMesh[] = [];

  constructor(scene: Scene) {
    this.material = createOceanMaterial(scene).material;
    this.mesh = new Mesh("ocean", scene);
    this.mesh.material = this.material;
    this.mesh.position.y = WATER_RENDER.surfaceY;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.rebuildGrid();
    // Upstream only accumulates time when deltaTime changes. Override once per bind
    // with simulation time, so fixed-dt play animates and pause actually freezes it.
    this.material.onBindObservable.add(() => this.material.getEffect()?.setFloat("time", this.seconds / 100));
  }

  private rebuildGrid(): void {
    const data = oceanGrid(OCEAN_QUALITY[this.quality].subdivisions);
    this.positions = data.positions as number[];
    this.worldUvs = new Float32Array(data.uvs!);
    data.applyToMesh(this.mesh, true);
    this.updateWorldUvs();
  }

  private updateWorldUvs(): void {
    for (let vertex = 0; vertex < this.positions.length / 3; vertex++) {
      this.worldUvs[vertex * 2] = (this.positions[vertex * 3]! + this.mesh.position.x) / NORMAL_TILE_METERS;
      this.worldUvs[vertex * 2 + 1] = (this.positions[vertex * 3 + 2]! + this.mesh.position.z) / NORMAL_TILE_METERS;
    }
    this.mesh.updateVerticesData(VertexBuffer.UVKind, this.worldUvs);
  }

  setEnvironment(sky: readonly AbstractMesh[], terrain: readonly AbstractMesh[], deepWater: AbstractMesh): void {
    this.environment = [...sky, ...terrain];
    this.seaFloor = [deepWater, ...terrain];
    this.lastRenderListUpdate = -Infinity;
  }

  setQuality(quality: OceanQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    const config = OCEAN_QUALITY[quality];
    for (const target of [this.material.reflectionTexture!, this.material.refractionTexture!]) {
      target.resize({ width: config.textureSize, height: config.textureSize });
      target.refreshRate = config.refreshRate;
      target.resetRefreshCounter();
    }
    this.material.bumpTexture.anisotropicFilteringLevel = quality === "low" ? 2 : 4;
    this.rebuildGrid();
    this.lastRenderListUpdate = -Infinity;
  }

  setWeather(weather: WeatherId): void {
    this.weather = weather;
    Object.assign(this.material, OCEAN_WEATHER[weather]);
  }

  heightAt(x: number, z: number): number {
    return oceanHeightAt(x, z, this.seconds, this.weather);
  }

  update(seconds: number, anchor: { x: number; z: number }): void {
    if (seconds < this.seconds) this.lastRenderListUpdate = -Infinity;
    this.seconds = seconds;
    const step = 1_200 / (OCEAN_QUALITY[this.quality].subdivisions * .75);
    const x = Math.round(anchor.x / step) * step, z = Math.round(anchor.z / step) * step;
    if (x !== this.mesh.position.x || z !== this.mesh.position.z) {
      this.mesh.position.x = x; this.mesh.position.z = z;
      this.updateWorldUvs();
    }
  }

  syncRenderLists(ships: () => readonly OceanShipReflection[], underwater: () => readonly AbstractMesh[]): void {
    if (this.seconds - this.lastRenderListUpdate < .35) return;
    this.lastRenderListUpdate = this.seconds;
    const config = OCEAN_QUALITY[this.quality];
    const visible = (mesh: AbstractMesh) => !mesh.isDisposed() && mesh !== this.mesh
      && mesh.material !== this.material && mesh.isEnabled() && mesh.isVisible
      && mesh.visibility >= .95;
    const opaque = (mesh: AbstractMesh) => visible(mesh) && (mesh.material?.alpha ?? 1) >= .99;
    const nearby = ships().filter(ship => Math.hypot(ship.x - this.mesh.position.x,
      ship.z - this.mesh.position.z) < config.distance)
      .sort((a, b) => Math.hypot(a.x - this.mesh.position.x, a.z - this.mesh.position.z)
        - Math.hypot(b.x - this.mesh.position.x, b.z - this.mesh.position.z))
      .slice(0, config.reflectedShips).flatMap(ship => ship.meshes.filter(opaque));
    this.material.reflectionTexture!.renderList = [...this.environment.filter(opaque), ...nearby];
    this.material.refractionTexture!.renderList = [...this.seaFloor.filter(opaque), ...nearby,
      ...underwater().filter(visible)];
  }
}
