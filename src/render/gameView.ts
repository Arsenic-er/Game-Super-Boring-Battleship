import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.pure";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.pure";
import { CreateDashedLines, CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder.pure";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.pure";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.pure";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { OBJECTIVE, TORPEDO } from "../sim/config";
import {
  isProjectileVisibleToPlayer,
  isShipVisibleToPlayer,
} from "../sim/playerPerception";
import {
  gunMuzzleOrigin,
  predictTrajectory,
  torpedoInterceptPoint,
  torpedoLaunchSolution,
  turretAimPoint,
} from "../sim/simulation";
import { getMainGun } from "../ships/components";
import { getTorpedo } from "../ships/torpedoes";
import {
  createDestroyerHull,
  createDestroyerV3Superstructure,
  createMainGunVisual,
  createTorpedoLauncherVisual,
} from "./shipGeometry";
import { createPixelShipPalette } from "./shipMaterials";
import { createPixelOceanSurface, createPixelSkyMaterial } from "./environmentMaterials";
import { createPixelVfxMaterial } from "./vfxMaterials";
import type { PixelVfxKind } from "./vfxMaterials";
import type { AimProvider } from "../controllers/playerInput";
import type {
  BattleState,
  ImpactEvent,
  PlayerTargetView,
  ShipState,
  ShotEvent,
  TorpedoSpreadMode,
  Vec3,
  WeaponSlot,
} from "../sim/types";

interface ShipVisual {
  root: TransformNode;
  turret: TransformNode;
  gunCradle: TransformNode;
  gunBarrels: Mesh[];
  gunBarrelRestZ: number[];
  torpedoLauncher: TransformNode;
  rudder: TransformNode;
  propellers: TransformNode[];
  wakes: Mesh[];
  smokePuffs: Mesh[];
  fireFlames: Mesh[];
  collider: Mesh;
}

interface ProjectileVisual {
  root: TransformNode;
  shell: Mesh;
  glow: Mesh;
}

interface ProjectileTrail {
  core: LinesMesh;
  plume?: Mesh;
  points: Vector3[];
  capacity: number;
}

interface TimedMesh {
  mesh: Mesh;
  remaining: number;
  duration: number;
  velocity?: Vector3;
  gravity?: number;
  scaleFrom?: number;
  scaleTo?: number;
  poolKey?: string;
}

interface SmokeCloudVisual {
  root: TransformNode;
  lobes: Mesh[];
}

const toVector = (value: Vec3): Vector3 => new Vector3(value.x, value.y, value.z);

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

export class GameView implements AimProvider {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly ships = new Map<string, ShipVisual>();
  private readonly projectileMeshes = new Map<number, ProjectileVisual>();
  private readonly projectileTrails = new Map<number, ProjectileTrail>();
  private readonly smokeCloudMeshes = new Map<number, SmokeCloudVisual>();
  private readonly effects: TimedMesh[] = [];
  private readonly effectPools = new Map<string, Mesh[]>();
  private readonly sharedEffectMaterials = new Map<string, StandardMaterial>();
  private readonly sharedVfxMaterials = new Map<PixelVfxKind, StandardMaterial>();
  private readonly oceanTexture: Texture;
  private readonly waveLayers: Mesh[];
  private readonly objectiveRing: Mesh;
  private readonly objectiveMaterial: StandardMaterial;
  private aimArc?: LinesMesh;
  private barrelArc?: LinesMesh;
  private readonly torpedoSpreadLines: LinesMesh[] = [];
  private readonly torpedoLauncherLines: LinesMesh[] = [];
  private torpedoLeadLine?: LinesMesh;
  private aiming = false;
  private mouseLookSensitivity = 1;
  private lastPointerX?: number;
  private lastPointerY?: number;
  private debugColliders = false;
  private quality: "low" | "medium" = "low";

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, false, {
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
      stencil: false,
    });
    this.engine.setHardwareScalingLevel(1.35);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.36, 0.56, 0.66, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogStart = 2_200;
    this.scene.fogEnd = 4_700;
    this.scene.fogColor = new Color3(0.36, 0.56, 0.66);

    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.78;
    ambient.groundColor = new Color3(0.07, 0.13, 0.16);
    const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.25), this.scene);
    sun.intensity = 0.65;

    const ocean = CreateGround("ocean", { width: 12_000, height: 12_000, subdivisions: 2 }, this.scene);
    const oceanSurface = createPixelOceanSurface(this.scene);
    this.oceanTexture = oceanSurface.texture;
    ocean.material = oceanSurface.material;
    ocean.position.y = -0.8;
    ocean.isPickable = false;
    ocean.freezeWorldMatrix();

    this.objectiveRing = CreateTorus("objective-zone-a", {
      diameter: OBJECTIVE.radiusMeters * 2,
      thickness: 4,
      tessellation: 96,
    }, this.scene);
    this.objectiveRing.position.set(OBJECTIVE.centerX, -0.28, OBJECTIVE.centerZ);
    this.objectiveMaterial = new StandardMaterial("objective-zone-material", this.scene);
    this.objectiveMaterial.diffuseColor = new Color3(0.48, 0.72, 0.7);
    this.objectiveMaterial.emissiveColor = new Color3(0.12, 0.32, 0.34);
    this.objectiveMaterial.specularColor = Color3.Black();
    this.objectiveMaterial.alpha = 0.66;
    this.objectiveMaterial.disableLighting = true;
    this.objectiveRing.material = this.objectiveMaterial;

    const nearWaveMaterial = this.material(
      "near-wave-material",
      new Color3(0.24, 0.55, 0.62),
      new Color3(0.03, 0.11, 0.13),
    );
    nearWaveMaterial.alpha = 0.32;
    nearWaveMaterial.disableLighting = true;
    const farWaveMaterial = this.material(
      "far-wave-material",
      new Color3(0.12, 0.39, 0.49),
      Color3.Black(),
    );
    farWaveMaterial.alpha = 0.22;
    farWaveMaterial.disableLighting = true;
    this.waveLayers = [
      this.createWaveLayer("near-waves", 54, 1_500, nearWaveMaterial, 19),
      this.createWaveLayer("far-waves", 38, 2_100, farWaveMaterial, 43),
    ];

    const sky = CreateSphere("sky-dome", { diameter: 10_500, segments: 8 }, this.scene);
    const skyMaterial = createPixelSkyMaterial(this.scene);
    sky.material = skyMaterial;
    sky.infiniteDistance = true;
    sky.isPickable = false;

    const sunDisk = CreateSphere("sky-sun", { diameter: 210, segments: 8 }, this.scene);
    const sunMaterial = this.material(
      "sky-sun-material",
      new Color3(0.96, 0.87, 0.57),
      new Color3(0.62, 0.48, 0.2),
    );
    sunMaterial.disableLighting = true;
    sunDisk.position.set(-2_800, 1_760, 3_250);
    sunDisk.material = sunMaterial;
    sunDisk.infiniteDistance = true;
    sunDisk.isPickable = false;

    this.camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      1.08,
      205,
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.lowerBetaLimit = 0.28;
    this.camera.upperBetaLimit = 1.86;
    this.camera.lowerRadiusLimit = 70;
    this.camera.upperRadiusLimit = 300;
    this.camera.wheelPrecision = 12;
    this.camera.panningSensibility = 0;
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked && (this.lastPointerX === undefined || this.lastPointerY === undefined)) {
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        return;
      }
      const rawDeltaX = pointerLocked ? event.movementX : event.clientX - (this.lastPointerX ?? event.clientX);
      const rawDeltaY = pointerLocked ? event.movementY : event.clientY - (this.lastPointerY ?? event.clientY);
      const deltaX = Math.max(-80, Math.min(80, rawDeltaX));
      const deltaY = Math.max(-80, Math.min(80, rawDeltaY));
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.camera.alpha -= deltaX * 0.0032 * this.mouseLookSensitivity;
      this.camera.beta = Math.max(
        this.camera.lowerBetaLimit ?? 0.28,
        Math.min(
          this.camera.upperBetaLimit ?? 1.86,
          this.camera.beta - deltaY * 0.0026 * this.mouseLookSensitivity,
        ),
      );
    });
    canvas.addEventListener("pointerleave", () => {
      this.lastPointerX = undefined;
      this.lastPointerY = undefined;
    });
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === canvas;
      canvas.closest(".game-shell")?.classList.toggle("pointer-locked", locked);
      if (locked) {
        this.lastPointerX = undefined;
        this.lastPointerY = undefined;
      }
    });
    window.addEventListener("resize", () => this.engine.resize());
  }

  private material(name: string, diffuse: Color3, emissive = Color3.Black()): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.specularColor = new Color3(0.18, 0.2, 0.2);
    return material;
  }

  private effectMaterial(
    key: string,
    diffuse: Color3,
    emissive = Color3.Black(),
    alpha = 1,
  ): StandardMaterial {
    const existing = this.sharedEffectMaterials.get(key);
    if (existing) return existing;
    const material = this.material(`effect-${key}`, diffuse, emissive);
    material.alpha = alpha;
    material.disableLighting = true;
    this.sharedEffectMaterials.set(key, material);
    return material;
  }

  private pixelVfxMaterial(kind: PixelVfxKind): StandardMaterial {
    const existing = this.sharedVfxMaterials.get(kind);
    if (existing) return existing;
    const material = createPixelVfxMaterial(this.scene, kind);
    this.sharedVfxMaterials.set(kind, material);
    return material;
  }

  private pooledBillboard(
    poolKey: string,
    width: number,
    height: number,
    material: StandardMaterial,
  ): Mesh {
    const pool = this.effectPools.get(poolKey) ?? [];
    if (!this.effectPools.has(poolKey)) this.effectPools.set(poolKey, pool);
    let mesh = pool.find((candidate) => !candidate.isEnabled());
    if (!mesh) {
      mesh = CreatePlane(`pooled-${poolKey}-${pool.length}`, { width, height }, this.scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.material = material;
      pool.push(mesh);
    }
    mesh.setEnabled(true);
    mesh.visibility = 1;
    mesh.scaling.setAll(1);
    mesh.rotation.setAll(0);
    return mesh;
  }

  private releaseEffect(effect: TimedMesh): void {
    if (effect.poolKey) {
      effect.mesh.setEnabled(false);
      effect.mesh.visibility = 0;
      return;
    }
    effect.mesh.dispose();
  }

  private createWaveLayer(
    name: string,
    count: number,
    area: number,
    material: StandardMaterial,
    seed: number,
  ): Mesh {
    const strips: Mesh[] = [];
    for (let index = 0; index < count; index += 1) {
      const width = 16 + (index * 29 + seed) % 58;
      const strip = CreateBox(`${name}-strip-${index}`, {
        width,
        height: 0.035,
        depth: 0.7 + index % 4 * 0.32,
      }, this.scene);
      strip.position.set(
        ((index * 211 + seed * 17) % area) - area / 2,
        -0.72 + index % 3 * 0.015,
        ((index * 137 + seed * 31) % area) - area / 2,
      );
      strip.rotation.y = ((index * 17 + seed) % 19 - 9) * 0.012;
      strip.material = material;
      strips.push(strip);
    }
    const merged = Mesh.MergeMeshes(strips, true, true);
    if (!merged) throw new Error(`Unable to build wave layer ${name}`);
    merged.name = name;
    merged.material = material;
    merged.isPickable = false;
    return merged;
  }

  private createShip(ship: ShipState): ShipVisual {
    const root = new TransformNode(`${ship.id}-root`, this.scene);
    const ally = ship.team === "player";
    const testTarget = Boolean(ship.isTestTarget);
    const palette = createPixelShipPalette(
      this.scene,
      ship.id,
      ally ? "ally" : testTarget ? "target" : "enemy",
    );
    const hullMaterial = palette.hull;
    const deckMaterial = palette.deck;

    createDestroyerHull(this.scene, root, {
      name: ship.id,
      length: 112,
      beam: 11,
      hullMaterial,
      deckMaterial,
    });

    const motion = createDestroyerV3Superstructure(this.scene, root, ship.id, palette);
    const gunDefinition = getMainGun(ship.mainGunId);
    const gun = createMainGunVisual(this.scene, root, ship.id, gunDefinition, palette);
    const torpedoDefinition = getTorpedo(ship.torpedoId);
    const torpedo = createTorpedoLauncherVisual(
      this.scene,
      root,
      ship.id,
      torpedoDefinition,
      palette,
    );

    const wakeMaterial = this.material(`${ship.id}-wake-material`, new Color3(0.72, 0.86, 0.88));
    wakeMaterial.alpha = 0.3;
    wakeMaterial.disableLighting = true;
    const wakes = [-1, 1].map((side) => {
      const wake = CreatePlane(`${ship.id}-wake-${side}`, {
        width: 2.2,
        height: 86,
      }, this.scene);
      wake.position.set(side * 4.3, -0.63, -65);
      wake.rotation.x = Math.PI / 2;
      wake.rotation.y = side * 0.035;
      wake.material = wakeMaterial;
      wake.parent = root;
      return wake;
    });

    const smokeMaterial = this.pixelVfxMaterial("smoke");
    const smokePuffs = Array.from({ length: 3 }, (_, index) => {
      const puff = CreatePlane(`${ship.id}-damage-smoke-${index}`, {
        width: 8 + index * 1.6,
        height: 10 + index * 2.2,
      }, this.scene);
      puff.billboardMode = Mesh.BILLBOARDMODE_ALL;
      puff.isPickable = false;
      puff.position.set((index - 1) * 1.2, 13 + index * 4.5, -5 + index * 1.8);
      puff.material = smokeMaterial;
      puff.visibility = 0;
      puff.parent = root;
      return puff;
    });

    const fireMaterial = this.pixelVfxMaterial("fire");
    const flamePositions = [
      { x: -1.7, y: 9.3, z: -8 },
      { x: 1.5, y: 8.2, z: -1 },
      { x: -0.6, y: 8.8, z: 7 },
    ];
    const fireFlames = flamePositions.map((position, index) => {
      const flame = CreatePlane(`${ship.id}-fire-flame-${index}`, {
        width: 4.8 - index * 0.35,
        height: 7.5 + index * 0.8,
      }, this.scene);
      flame.billboardMode = Mesh.BILLBOARDMODE_ALL;
      flame.isPickable = false;
      flame.position.set(position.x, position.y, position.z);
      flame.material = fireMaterial;
      flame.visibility = 0;
      flame.parent = root;
      return flame;
    });

    const colliderMaterial = this.material(
      `${ship.id}-collider-material`,
      testTarget ? new Color3(1, 0.72, 0.12) : new Color3(0.08, 0.72, 1),
      testTarget ? new Color3(0.45, 0.22, 0) : new Color3(0, 0.28, 0.48),
    );
    colliderMaterial.wireframe = true;
    colliderMaterial.alpha = 0.55;
    colliderMaterial.disableLighting = true;
    const collider = CreateBox(`${ship.id}-collision-volume`, {
      width: 12.1,
      height: 6,
      depth: 107.5,
    }, this.scene);
    collider.position.set(0, 2.4, 0);
    collider.material = colliderMaterial;
    collider.visibility = 0;
    collider.parent = root;

    return {
      root,
      turret: gun.root,
      gunCradle: gun.cradle,
      gunBarrels: gun.barrels,
      gunBarrelRestZ: gun.barrelRestZ,
      torpedoLauncher: torpedo.root,
      rudder: motion.rudder,
      propellers: motion.propellers,
      wakes,
      smokePuffs,
      fireFlames,
      collider,
    };
  }

  aimPoint(ship: ShipState, range: number): Vec3 {
    const directionX = -Math.cos(this.camera.alpha);
    const directionZ = -Math.sin(this.camera.alpha);
    return {
      x: ship.position.x + directionX * range,
      y: 1.5,
      z: ship.position.z + directionZ * range,
    };
  }

  setAiming(active: boolean): void {
    this.aiming = active;
  }

  setQuality(quality: "low" | "medium"): void {
    this.quality = quality;
    this.engine.setHardwareScalingLevel(quality === "low" ? 1.35 : 1);
  }

  setAimSensitivity(value: number): void {
    this.mouseLookSensitivity = Math.min(2, Math.max(0.5, value));
  }

  requestPointerLock(): void {
    if (document.pointerLockElement === this.canvas) return;
    const request = this.canvas.requestPointerLock();
    if (request) void request.catch(() => undefined);
  }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setDebugColliders(visible: boolean): void {
    this.debugColliders = visible;
  }

  getQuality(): "low" | "medium" {
    return this.quality;
  }

  private syncShips(state: BattleState, perceivedTarget?: PlayerTargetView): void {
    for (const ship of state.ships) {
      let visual = this.ships.get(ship.id);
      if (!visual) {
        visual = this.createShip(ship);
        this.ships.set(ship.id, visual);
      }
      const visible = isShipVisibleToPlayer(ship, state.mode, perceivedTarget);
      visual.root.setEnabled(visible);
      if (!visible) continue;
      const phase = ship.team === "enemy" ? 1.8 : 0;
      const longWave = Math.sin(state.time * 0.53 + phase);
      const shortWave = Math.sin(state.time * 0.91 + phase * 1.7);
      const seaMotion = ship.hull > 0 ? longWave * 0.7 + shortWave * 0.3 : 0;
      const settling = ship.flooding * 0.022 + (1 - ship.hull / ship.maxHull) * 1.2;
      visual.root.position.set(ship.position.x, ship.hull > 0 ? seaMotion * 0.2 - settling : -4, ship.position.z);
      visual.root.rotation.y = ship.heading;
      visual.root.rotation.x = ship.hull > 0
        ? Math.sin(state.time * 0.41 + phase + 0.7) * 0.006
        : -0.045;
      visual.root.rotation.z = ship.hull > 0
        ? seaMotion * 0.009
          - ship.turnRateRadians * 1.4
          + ship.flooding * 0.0008 * (ship.team === "player" ? 1 : -1)
        : 0.08;
      visual.turret.rotation.y = wrapAngle(ship.turretHeading - ship.heading);
      const muzzle = gunMuzzleOrigin(ship);
      const elevationPath = predictTrajectory(
        muzzle,
        turretAimPoint(ship, muzzle),
        3,
        getMainGun(ship.mainGunId).muzzleVelocity,
      );
      if (elevationPath.length >= 2) {
        const first = elevationPath[0];
        const second = elevationPath[1];
        if (first && second) {
          const rise = second.y - first.y;
          const run = Math.hypot(second.x - first.x, second.z - first.z);
          visual.gunCradle.rotation.x = -Math.min(0.34, Math.max(0, Math.atan2(rise, run)));
        }
      }
      const recoilElapsed = ship.lastMainGunFiredAt === undefined
        ? Number.POSITIVE_INFINITY
        : state.time - ship.lastMainGunFiredAt;
      const recoil = recoilElapsed < 0.065
        ? recoilElapsed / 0.065
        : recoilElapsed < 0.32
          ? 1 - (recoilElapsed - 0.065) / 0.255
          : 0;
      for (const [index, barrel] of visual.gunBarrels.entries()) {
        barrel.position.z = (visual.gunBarrelRestZ[index] ?? barrel.position.z)
          - Math.max(0, recoil) * 0.82;
      }
      visual.torpedoLauncher.rotation.y = wrapAngle(
        ship.torpedoLauncherHeading - ship.heading,
      );
      visual.torpedoLauncher.rotation.z = ship.modules.torpedoTubes.health <= 0 ? -0.16 : 0;
      visual.rudder.rotation.y = -ship.rudder * 0.5;
      for (const [index, propeller] of visual.propellers.entries()) {
        propeller.rotation.z = state.time * ship.speedKnots * (index === 0 ? 0.62 : -0.62);
      }
      const wakeStrength = Math.min(1, Math.abs(ship.speedKnots) / 18);
      for (const [index, wake] of visual.wakes.entries()) {
        wake.visibility = ship.hull > 0 ? wakeStrength * 0.75 : 0;
        wake.scaling.y = 0.35 + wakeStrength * 0.85;
        wake.scaling.x = 0.72 + wakeStrength * 0.32
          + Math.sin(state.time * 3.2 + index * 2.4) * 0.08;
        wake.rotation.y = (index === 0 ? -1 : 1) * (0.035 + ship.rudder * 0.035);
      }
      const fireRatio = Math.min(1, ship.fireIntensity / 55);
      for (const [index, smoke] of visual.smokePuffs.entries()) {
        const drift = Math.sin(state.time * (0.65 + index * 0.08) + index * 1.9);
        smoke.visibility = ship.hull > 0 ? fireRatio * (0.42 + index * 0.12) : 0;
        smoke.scaling.setAll(0.45 + fireRatio * (0.72 + index * 0.24));
        smoke.position.x = (index - 1) * 1.2 + drift * (0.7 + index * 0.35);
        smoke.position.y = 13 + index * 4.5 + Math.sin(state.time * 1.1 + index) * 1.1;
      }
      for (const [index, flame] of visual.fireFlames.entries()) {
        const flicker = 0.78 + Math.sin(state.time * (8.5 + index) + index * 2.2) * 0.18;
        flame.visibility = ship.hull > 0 ? fireRatio * (0.82 + index * 0.08) : 0;
        flame.scaling.set(0.72 + flicker * 0.22, 0.48 + fireRatio * flicker, 0.72 + flicker * 0.22);
      }
      visual.collider.visibility = this.debugColliders && ship.hull > 0 ? 0.9 : 0;
    }
  }

  private syncProjectiles(state: BattleState, perceivedTarget?: PlayerTargetView): void {
    const player = state.ships.find((ship) => ship.team === "player");
    const visibleProjectiles = state.projectiles.filter((projectile) =>
      isProjectileVisibleToPlayer(projectile, player, perceivedTarget));
    const activeIds = new Set(visibleProjectiles.map((projectile) => projectile.id));
    for (const [id, visual] of this.projectileMeshes) {
      if (!activeIds.has(id)) {
        visual.root.dispose(false, true);
        this.projectileMeshes.delete(id);
        this.projectileTrails.get(id)?.core.dispose();
        this.projectileTrails.get(id)?.plume?.dispose();
        this.projectileTrails.delete(id);
      }
    }

    for (const projectile of visibleProjectiles) {
      const nextPoint = toVector(projectile.position);
      const direction = toVector(projectile.velocity).normalize();
      let visual = this.projectileMeshes.get(projectile.id);
      if (!visual) {
        const torpedo = projectile.kind === "torpedo";
        const apShell = projectile.kind === "shell" && projectile.ammoType === "ap";
        const root = new TransformNode(`${projectile.kind}-root-${projectile.id}`, this.scene);
        const shell = torpedo
          ? CreateCylinder(`torpedo-${projectile.id}`, {
            height: 5.6,
            diameter: 0.74,
            tessellation: 8,
          }, this.scene)
          : CreateBox(`shell-${projectile.id}`, {
            width: 0.72,
            height: 0.72,
            depth: 4.8,
          }, this.scene);
        if (torpedo) shell.rotation.x = Math.PI / 2;
        const shellMaterial = this.effectMaterial(
          torpedo ? "projectile-torpedo" : apShell ? "projectile-ap" : "projectile-he",
          torpedo
            ? new Color3(0.12, 0.18, 0.17)
            : apShell ? new Color3(0.62, 0.86, 1) : new Color3(1, 0.78, 0.25),
          torpedo
            ? new Color3(0.34, 0.42, 0.36)
            : apShell ? new Color3(0.12, 0.48, 1) : new Color3(1, 0.4, 0.04),
        );
        shell.material = shellMaterial;
        shell.parent = root;
        const glow = CreateSphere(`shell-glow-${projectile.id}`, {
          diameter: 2.6,
          segments: 4,
        }, this.scene);
        const glowMaterial = this.effectMaterial(
          apShell ? "projectile-glow-ap" : "projectile-glow-he",
          apShell ? new Color3(0.28, 0.72, 1) : new Color3(1, 0.3, 0.02),
          apShell ? new Color3(0.08, 0.32, 1) : new Color3(1, 0.2, 0.01),
          0.4,
        );
        glow.material = glowMaterial;
        glow.parent = root;
        glow.visibility = torpedo ? 0 : 1;
        visual = { root, shell, glow };
        this.projectileMeshes.set(projectile.id, visual);
      }
      const bodyPoint = projectile.kind === "torpedo"
        ? nextPoint.add(new Vector3(0, -0.95, 0))
        : nextPoint;
      visual.root.position.copyFrom(bodyPoint);
      visual.root.lookAt(bodyPoint.add(direction));
      if (projectile.kind === "shell") {
        visual.glow.scaling.setAll(0.86 + Math.sin(projectile.age * 36) * 0.12);
      }

      let trail = this.projectileTrails.get(projectile.id);
      if (!trail) {
        const capacity = this.quality === "low" ? 18 : 24;
        const tailPoint = nextPoint.subtract(direction.scale(1.2));
        const points = Array.from({ length: capacity }, (_, index) => Vector3.Lerp(
          tailPoint,
          nextPoint,
          index / Math.max(1, capacity - 1),
        ));
        const core = CreateLines(`trail-core-${projectile.id}`, {
          points,
          updatable: true,
        }, this.scene);
        core.color = projectile.kind === "torpedo"
          ? new Color3(0.73, 0.91, 0.91)
          : projectile.ammoType === "ap"
            ? new Color3(0.34, 0.75, 1)
            : new Color3(1, 0.64, 0.14);
        const wakeVisibility = projectile.kind === "torpedo"
          ? Math.min(1, Math.max(0.28, ((projectile.detectionRange ?? 500) - 280) / 370))
          : 1;
        core.alpha = projectile.kind === "torpedo" ? 0.74 * wakeVisibility : 0.96;
        const plume = this.quality === "medium"
          ? CreateTube(`trail-plume-${projectile.id}`, {
            path: points,
            radius: projectile.kind === "torpedo" ? 0.48 : 0.32,
            tessellation: 4,
            updatable: true,
          }, this.scene)
          : undefined;
        if (plume) {
          plume.material = this.effectMaterial(
            projectile.kind === "torpedo" ? "trail-plume-torpedo" : "trail-plume-shell",
            projectile.kind === "torpedo"
              ? new Color3(0.68, 0.86, 0.86)
              : new Color3(0.76, 0.72, 0.57),
            projectile.kind === "torpedo"
              ? new Color3(0.03, 0.12, 0.14)
              : new Color3(0.22, 0.12, 0.03),
            projectile.kind === "torpedo" ? 0.3 * wakeVisibility : 0.3,
          );
        }
        trail = { core, plume, points, capacity };
        this.projectileTrails.set(projectile.id, trail);
      } else {
        trail.points.push(nextPoint);
        while (trail.points.length > trail.capacity) trail.points.shift();
        trail.core = CreateLines(`trail-core-${projectile.id}`, {
          points: trail.points,
          instance: trail.core,
        }, this.scene);
        if (trail.plume) {
          trail.plume = CreateTube(`trail-plume-${projectile.id}`, {
            path: trail.points,
            radius: projectile.kind === "torpedo" ? 0.52 : 0.36,
            tessellation: 4,
            instance: trail.plume,
          }, this.scene);
        }
      }
    }
  }

  private syncSmokeClouds(state: BattleState): void {
    const activeIds = new Set(state.smokeClouds.map((cloud) => cloud.id));
    for (const [id, visual] of this.smokeCloudMeshes) {
      if (activeIds.has(id)) continue;
      visual.root.dispose(false, true);
      this.smokeCloudMeshes.delete(id);
    }
    const material = this.pixelVfxMaterial("smoke");
    for (const cloud of state.smokeClouds) {
      let visual = this.smokeCloudMeshes.get(cloud.id);
      if (!visual) {
        const root = new TransformNode(`smoke-screen-${cloud.id}`, this.scene);
        root.position.set(cloud.position.x, 0, cloud.position.z);
        const lobeSpecs = [
          { x: -0.2, y: 8, z: 0.02, scale: 0.28 },
          { x: 0.16, y: 10, z: -0.08, scale: 0.25 },
          { x: 0.02, y: 7, z: 0.2, scale: 0.24 },
        ];
        const lobes = lobeSpecs.map((spec, index) => {
          const lobe = CreatePlane(`smoke-screen-${cloud.id}-${index}`, {
            width: 2,
            height: 2,
          }, this.scene);
          lobe.billboardMode = Mesh.BILLBOARDMODE_ALL;
          lobe.isPickable = false;
          lobe.material = material;
          lobe.parent = root;
          lobe.position.set(cloud.radius * spec.x, spec.y, cloud.radius * spec.z);
          lobe.scaling.set(cloud.radius * spec.scale, 8 + index * 1.7, 1);
          return lobe;
        });
        visual = { root, lobes };
        this.smokeCloudMeshes.set(cloud.id, visual);
      }
      const life = Math.max(0, (cloud.expiresAt - state.time) / Math.max(1, cloud.expiresAt - cloud.spawnedAt));
      for (const lobe of visual.lobes) lobe.visibility = Math.min(0.72, life * 2.8);
      visual.root.rotation.y = cloud.id * 0.71 + state.time * 0.015;
    }
  }

  syncAimArc(player: ShipState, weaponSlot: WeaponSlot): void {
    const origin = gunMuzzleOrigin(player);
    const muzzleVelocity = getMainGun(player.mainGunId).muzzleVelocity;
    const points = predictTrajectory(origin, player.aimPoint, 28, muzzleVelocity).map(toVector);
    const barrelPoints = predictTrajectory(
      origin,
      turretAimPoint(player, origin),
      28,
      muzzleVelocity,
    ).map(toVector);
    if (points.length === 0 || barrelPoints.length === 0) return;
    if (!this.aimArc) {
      this.aimArc = CreateDashedLines("aim-arc", {
        points,
        dashSize: 18,
        gapSize: 12,
        dashNb: 80,
        updatable: true,
      }, this.scene);
      this.aimArc.color = new Color3(0.83, 0.91, 0.82);
    } else {
      this.aimArc = CreateDashedLines("aim-arc", {
        points,
        instance: this.aimArc,
      }, this.scene);
    }
    if (!this.barrelArc) {
      this.barrelArc = CreateDashedLines("barrel-arc", {
        points: barrelPoints,
        dashSize: 8,
        gapSize: 6,
        dashNb: 110,
        updatable: true,
      }, this.scene);
      this.barrelArc.color = new Color3(0.18, 0.82, 1);
    } else {
      this.barrelArc = CreateDashedLines("barrel-arc", {
        points: barrelPoints,
        instance: this.barrelArc,
      }, this.scene);
    }
    const visible = weaponSlot === "mainGun";
    this.aimArc.visibility = visible ? this.aiming ? 0.9 : 0.16 : 0;
    this.barrelArc.visibility = visible ? this.aiming ? 1 : 0.22 : 0;
  }

  private syncTorpedoAim(
    player: ShipState,
    target: PlayerTargetView | undefined,
    weaponSlot: WeaponSlot,
    spread: TorpedoSpreadMode,
  ): void {
    const visible = weaponSlot === "torpedo";
    const solution = torpedoLaunchSolution(player, player.aimPoint, spread);
    const torpedo = getTorpedo(player.torpedoId);
    const origin = new Vector3(player.position.x, 0.45, player.position.z);
    const lineLength = Math.min(1_450, torpedo.maximumRangeMeters);
    for (const [index, direction] of solution.directions.entries()) {
      const points = [
        origin,
        new Vector3(
          player.position.x + Math.sin(direction) * lineLength,
          0.45,
          player.position.z + Math.cos(direction) * lineLength,
        ),
      ];
      const existing = this.torpedoSpreadLines[index];
      const line = existing
        ? CreateLines(`torpedo-spread-${index}`, { points, instance: existing }, this.scene)
        : CreateLines(`torpedo-spread-${index}`, { points, updatable: true }, this.scene);
      line.color = solution.allowed
        ? new Color3(0.22, 0.92, 0.92)
        : new Color3(1, 0.48, 0.18);
      line.alpha = solution.allowed ? 0.88 : 0.72;
      line.visibility = visible ? 1 : 0;
      if (!existing) this.torpedoSpreadLines.push(line);
    }

    const halfSpread = spread === "wide"
      ? TORPEDO.wideSpreadRadians
      : TORPEDO.narrowSpreadRadians;
    const launcherDirections = [
      player.torpedoLauncherHeading - halfSpread,
      player.torpedoLauncherHeading + halfSpread,
    ];
    for (const [index, direction] of launcherDirections.entries()) {
      const points = [
        origin,
        origin.add(new Vector3(
          Math.sin(direction) * lineLength,
          0,
          Math.cos(direction) * lineLength,
        )),
      ];
      const existing = this.torpedoLauncherLines[index];
      const line = existing
        ? CreateLines(`torpedo-launcher-line-${index}`, { points, instance: existing }, this.scene)
        : CreateLines(`torpedo-launcher-line-${index}`, { points, updatable: true }, this.scene);
      line.color = new Color3(0.28, 0.62, 1);
      line.alpha = 0.9;
      line.visibility = visible ? 1 : 0;
      if (!existing) this.torpedoLauncherLines.push(line);
    }

    const intercept = visible && target?.mode === "tracking" && target.live
      ? torpedoInterceptPoint(player, target)
      : undefined;
    const leadPoints = intercept
      ? [origin, new Vector3(intercept.x, 0.55, intercept.z)]
      : [origin, origin.add(new Vector3(0, 0, 1))];
    this.torpedoLeadLine = this.torpedoLeadLine
      ? CreateDashedLines("torpedo-lead", {
        points: leadPoints,
        instance: this.torpedoLeadLine,
      }, this.scene)
      : CreateDashedLines("torpedo-lead", {
        points: leadPoints,
        dashSize: 10,
        gapSize: 7,
        dashNb: 90,
        updatable: true,
      }, this.scene);
    this.torpedoLeadLine.color = new Color3(0.7, 1, 0.72);
    this.torpedoLeadLine.visibility = intercept ? 0.9 : 0;
  }

  consumeShots(shots: readonly ShotEvent[]): void {
    for (const shot of shots) {
      if (shot.kind === "torpedo") {
        const wake = CreateTorus(`torpedo-launch-${shot.id}`, {
          diameter: 5.5,
          thickness: 0.6,
          tessellation: 10,
        }, this.scene);
        wake.position.copyFrom(toVector(shot.position));
        wake.position.y = -0.25;
        wake.material = this.effectMaterial(
          "torpedo-launch-foam",
          new Color3(0.72, 0.89, 0.9),
          Color3.Black(),
          0.62,
        );
        this.effects.push({
          mesh: wake,
          remaining: 0.9,
          duration: 0.9,
          scaleFrom: 0.25,
          scaleTo: 1.8,
        });
        continue;
      }
      const flash = this.pooledBillboard(
        "muzzle-flash",
        7.5,
        10,
        this.pixelVfxMaterial("muzzle"),
      );
      flash.position.copyFrom(toVector(shot.position));
      this.effects.push({
        mesh: flash,
        poolKey: "muzzle-flash",
        remaining: 0.14,
        duration: 0.14,
        scaleFrom: 0.4,
        scaleTo: 1.2,
      });
      const smoke = this.pooledBillboard(
        "muzzle-smoke",
        5.5,
        5.5,
        this.pixelVfxMaterial("smoke"),
      );
      smoke.position.copyFrom(toVector(shot.position));
      this.effects.push({
        mesh: smoke,
        poolKey: "muzzle-smoke",
        remaining: 0.72,
        duration: 0.72,
        velocity: new Vector3(0, 3.8, 0),
        gravity: -0.5,
        scaleFrom: 0.45,
        scaleTo: 2.4,
      });
    }
  }

  consumeImpacts(impacts: readonly ImpactEvent[]): void {
    for (const impact of impacts) {
      const point = toVector(impact.position);
      if (impact.kind === "splash") {
        const plume = this.pooledBillboard(
          "shell-splash",
          18,
          32,
          this.pixelVfxMaterial("splash"),
        );
        plume.position.copyFrom(point);
        plume.position.y += 12;
        this.effects.push({
          mesh: plume,
          poolKey: "shell-splash",
          remaining: 1.05,
          duration: 1.05,
          velocity: new Vector3(0, 3.8, 0),
          gravity: 5.5,
          scaleFrom: 0.35,
          scaleTo: 1.35,
        });
        const ring = CreateTorus(`splash-ring-${impact.id}`, {
          diameter: 10,
          thickness: 0.9,
          tessellation: 12,
        }, this.scene);
        ring.position.copyFrom(point);
        ring.position.y = -0.25;
        ring.material = this.effectMaterial(
          "splash-foam",
          new Color3(0.72, 0.88, 0.9),
          Color3.Black(),
          0.52,
        );
        this.effects.push({
          mesh: ring,
          remaining: 1.15,
          duration: 1.15,
          scaleFrom: 0.25,
          scaleTo: 2.35,
        });
        const droplets = this.quality === "low" ? 0 : 3;
        for (let index = 0; index < droplets; index += 1) {
          const angle = impact.id * 0.37 + index / droplets * Math.PI * 2;
          const droplet = CreateSphere(`splash-drop-${impact.id}-${index}`, {
            diameter: 1.05 + index % 3 * 0.25,
            segments: 3,
          }, this.scene);
          droplet.position.copyFrom(point);
          droplet.position.y += 1.2;
          droplet.material = this.effectMaterial(
            "splash-drop",
            new Color3(0.8, 0.93, 0.94),
            Color3.Black(),
            0.9,
          );
          const outward = 5.5 + index % 3 * 1.6;
          this.effects.push({
            mesh: droplet,
            remaining: 0.8 + index % 2 * 0.12,
            duration: 0.8 + index % 2 * 0.12,
            velocity: new Vector3(
              Math.cos(angle) * outward,
              10.5 + index % 3 * 2.1,
              Math.sin(angle) * outward,
            ),
            gravity: 18,
            scaleFrom: 0.9,
            scaleTo: 0.3,
          });
        }
        continue;
      }

      if (impact.projectileKind === "torpedo") {
        const waterColumn = this.pooledBillboard(
          "torpedo-splash",
          28,
          48,
          this.pixelVfxMaterial("splash"),
        );
        waterColumn.position.copyFrom(point);
        waterColumn.position.y += 18;
        this.effects.push({
          mesh: waterColumn,
          poolKey: "torpedo-splash",
          remaining: 1.35,
          duration: 1.35,
          velocity: new Vector3(0, 5.5, 0),
          gravity: 7.5,
          scaleFrom: 0.25,
          scaleTo: 1.45,
        });
        const shockRing = CreateTorus(`torpedo-hit-ring-${impact.id}`, {
          diameter: 15,
          thickness: 1.3,
          tessellation: 14,
        }, this.scene);
        shockRing.position.copyFrom(point);
        shockRing.position.y = -0.22;
        shockRing.material = this.effectMaterial(
          "torpedo-hit-foam",
          new Color3(0.78, 0.92, 0.93),
          Color3.Black(),
          0.64,
        );
        this.effects.push({
          mesh: shockRing,
          remaining: 1.5,
          duration: 1.5,
          scaleFrom: 0.2,
          scaleTo: 3.1,
        });
        continue;
      }

      const burst = this.pooledBillboard(
        "hit-fire",
        13,
        17,
        this.pixelVfxMaterial("fire"),
      );
      burst.position.copyFrom(point);
      burst.position.y += 4;
      this.effects.push({
        mesh: burst,
        poolKey: "hit-fire",
        remaining: 0.52,
        duration: 0.52,
        scaleFrom: 0.3,
        scaleTo: 1.75,
      });
      const sparks = this.quality === "low" ? 2 : 4;
      for (let index = 0; index < sparks; index += 1) {
        const angle = impact.id * 0.51 + index / sparks * Math.PI * 2;
        const spark = CreateBox(`hit-spark-${impact.id}-${index}`, {
          width: 0.5,
          height: 0.5,
          depth: 2.6,
        }, this.scene);
        spark.position.copyFrom(point);
        spark.position.y += 4;
        spark.rotation.y = angle;
        spark.material = this.effectMaterial(
          "hit-spark",
          new Color3(1, 0.72, 0.12),
          new Color3(1, 0.25, 0.01),
        );
        const outward = 7 + index % 3 * 2.2;
        this.effects.push({
          mesh: spark,
          remaining: 0.5 + index % 2 * 0.1,
          duration: 0.5 + index % 2 * 0.1,
          velocity: new Vector3(
            Math.cos(angle) * outward,
            8 + index % 3 * 2,
            Math.sin(angle) * outward,
          ),
          gravity: 19,
          scaleFrom: 1,
          scaleTo: 0.22,
        });
      }
    }
  }

  private updateEffects(dt: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      if (!effect) continue;
      effect.remaining -= dt;
      const progress = 1 - Math.max(0, effect.remaining) / effect.duration;
      if (effect.velocity) {
        effect.mesh.position.addInPlace(effect.velocity.scale(dt));
        effect.velocity.y -= (effect.gravity ?? 0) * dt;
      }
      const scaleFrom = effect.scaleFrom ?? 0.5;
      const scaleTo = effect.scaleTo ?? 2.3;
      effect.mesh.scaling.setAll(scaleFrom + (scaleTo - scaleFrom) * progress);
      effect.mesh.visibility = Math.max(0, 1 - progress);
      if (effect.remaining <= 0) {
        this.releaseEffect(effect);
        this.effects.splice(index, 1);
      }
    }
  }

  sync(
    state: BattleState,
    dt: number,
    perceivedTarget?: PlayerTargetView,
    weaponSlot: WeaponSlot = "mainGun",
    torpedoSpread: TorpedoSpreadMode = "narrow",
  ): void {
    const steppedTime = Math.floor(state.time * 6) / 6;
    this.oceanTexture.uOffset = steppedTime * 0.0018;
    this.oceanTexture.vOffset = steppedTime * -0.00115;
    this.syncShips(state, perceivedTarget);
    this.syncProjectiles(state, perceivedTarget);
    this.syncSmokeClouds(state);
    this.objectiveRing.visibility = state.mode === "battle"
      ? state.objective.contested ? 0.72 + Math.sin(state.time * 7) * 0.18 : 0.72
      : 0;
    this.objectiveRing.position.x = state.objective.center.x;
    this.objectiveRing.position.z = state.objective.center.z;
    const objectiveColor = state.objective.contested
      ? new Color3(0.86, 0.58, 0.24)
      : state.objective.owner === "player"
        ? new Color3(0.18, 0.72, 0.45)
        : state.objective.owner === "enemy"
          ? new Color3(0.82, 0.25, 0.2)
          : new Color3(0.36, 0.66, 0.68);
    this.objectiveMaterial.diffuseColor.copyFrom(objectiveColor);
    this.objectiveMaterial.emissiveColor.copyFrom(objectiveColor.scale(0.36));
    const player = state.ships.find((ship) => ship.team === "player");
    if (player) {
      for (const [index, waves] of this.waveLayers.entries()) {
        const drift = state.time * (index === 0 ? 2.4 : -1.35);
        waves.position.x = player.position.x + Math.sin(drift * 0.021 + index) * 32;
        waves.position.z = player.position.z + Math.cos(drift * 0.017 + index) * 28 + drift;
      }
      this.syncAimArc(player, weaponSlot);
      this.syncTorpedoAim(player, perceivedTarget, weaponSlot, torpedoSpread);
      const aimX = player.aimPoint.x - player.position.x;
      const aimZ = player.aimPoint.z - player.position.z;
      const aimLength = Math.max(1, Math.hypot(aimX, aimZ));
      const scopeFocusDistance = this.aiming ? 145 : 0;
      const skyLook = Math.max(0, this.camera.beta - 1.42);
      const target = new Vector3(
        player.position.x + aimX / aimLength * scopeFocusDistance,
        (this.aiming ? 7 : 4) + skyLook * (this.aiming ? 85 : 170),
        player.position.z + aimZ / aimLength * scopeFocusDistance,
      );
      if (state.time < 0.12) this.camera.target.copyFrom(target);
      else Vector3.LerpToRef(this.camera.target, target, 0.16, this.camera.target);
      const targetRadius = this.aiming ? 78 : 205;
      this.camera.radius += (targetRadius - this.camera.radius) * 0.14;
      this.camera.fov += ((this.aiming ? 0.44 : 0.8) - this.camera.fov) * 0.14;
    }
    this.updateEffects(dt);
  }

  resetTransient(): void {
    for (const visual of this.projectileMeshes.values()) visual.root.dispose(false, true);
    for (const trail of this.projectileTrails.values()) {
      trail.core.dispose();
      trail.plume?.dispose();
    }
    for (const effect of this.effects) this.releaseEffect(effect);
    this.projectileMeshes.clear();
    this.projectileTrails.clear();
    for (const visual of this.smokeCloudMeshes.values()) visual.root.dispose(false, true);
    this.smokeCloudMeshes.clear();
    this.effects.length = 0;
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = 1.08;
    this.camera.radius = 205;
    this.camera.fov = 0.8;
  }

  render(): void {
    this.scene.render();
  }
}
