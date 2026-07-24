import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.pure";
import { CreateDashedLines, CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder.pure";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.pure";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.pure";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.pure";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { OBJECTIVE } from "../sim/config";
import { gunMuzzleOrigin, predictTrajectory, turretAimPoint } from "../sim/simulation";
import { getMainGun } from "../ships/components";
import { createSymmetricBow } from "./shipGeometry";
import type { AimProvider } from "../controllers/playerInput";
import type { BattleState, ImpactEvent, ShipState, ShotEvent, Vec3 } from "../sim/types";

interface ShipVisual {
  root: TransformNode;
  turret: TransformNode;
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
  plume: Mesh;
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
  private readonly effects: TimedMesh[] = [];
  private readonly sharedEffectMaterials = new Map<string, StandardMaterial>();
  private readonly waveLayers: Mesh[];
  private readonly objectiveRing: Mesh;
  private readonly objectiveMaterial: StandardMaterial;
  private aimArc?: LinesMesh;
  private barrelArc?: LinesMesh;
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
    this.scene.clearColor = new Color4(0.43, 0.66, 0.76, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogStart = 2_600;
    this.scene.fogEnd = 5_800;
    this.scene.fogColor = new Color3(0.43, 0.66, 0.76);

    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.78;
    ambient.groundColor = new Color3(0.07, 0.13, 0.16);
    const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.25), this.scene);
    sun.intensity = 0.65;

    const ocean = CreateGround("ocean", { width: 12_000, height: 12_000, subdivisions: 2 }, this.scene);
    const oceanMaterial = new StandardMaterial("ocean-material", this.scene);
    oceanMaterial.diffuseColor = new Color3(0.035, 0.22, 0.3);
    oceanMaterial.specularColor = new Color3(0.48, 0.66, 0.7);
    oceanMaterial.specularPower = 72;
    ocean.material = oceanMaterial;
    ocean.position.y = -0.8;

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
    const skyMaterial = new StandardMaterial("sky-material", this.scene);
    skyMaterial.backFaceCulling = false;
    skyMaterial.disableLighting = true;
    skyMaterial.diffuseColor = new Color3(0.31, 0.57, 0.71);
    skyMaterial.emissiveColor = new Color3(0.31, 0.57, 0.71);
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
    const hullMaterial = this.material(
      `${ship.id}-hull-material`,
      ally ? new Color3(0.16, 0.27, 0.31)
        : testTarget ? new Color3(0.36, 0.31, 0.16) : new Color3(0.29, 0.22, 0.21),
    );
    const deckMaterial = this.material(`${ship.id}-deck-material`, new Color3(0.3, 0.3, 0.27));
    const darkMaterial = this.material(`${ship.id}-dark-material`, new Color3(0.1, 0.12, 0.12));
    const accentMaterial = this.material(
      `${ship.id}-accent-material`,
      ally ? new Color3(0.34, 0.56, 0.59)
        : testTarget ? new Color3(0.74, 0.59, 0.2) : new Color3(0.62, 0.3, 0.24),
    );

    const hull = CreateBox(`${ship.id}-hull`, {
      width: 11,
      height: 5.5,
      depth: 82,
    }, this.scene);
    hull.position.set(0, 1.8, -3);
    hull.material = hullMaterial;
    hull.parent = root;

    createSymmetricBow(this.scene, root, {
      name: `${ship.id}-bow`,
      hullRearZ: 38,
      tipZ: 63,
      hullHalfWidth: 5.5,
      hullTopY: 4.55,
      hullRearBottomY: -0.95,
      hullTipBottomY: 0.15,
      deckRearZ: 42,
      deckHalfWidth: 4.8,
      deckTopY: 5.35,
      deckThickness: 0.7,
      hullMaterial,
      deckMaterial,
    });

    const stern = CreateBox(`${ship.id}-stern`, {
      width: 8.5,
      height: 5.2,
      depth: 18,
    }, this.scene);
    stern.position.set(0, 1.65, -52);
    stern.material = hullMaterial;
    stern.parent = root;

    const deck = CreateBox(`${ship.id}-deck`, {
      width: 9.6,
      height: 0.7,
      depth: 88,
    }, this.scene);
    deck.position.set(0, 5, -2);
    deck.material = deckMaterial;
    deck.parent = root;

    const bridge = CreateBox(`${ship.id}-bridge`, {
      width: 7.4,
      height: 5.2,
      depth: 13,
    }, this.scene);
    bridge.position.set(0, 7.9, 7);
    bridge.material = deckMaterial;
    bridge.parent = root;

    const bridgeTop = CreateBox(`${ship.id}-bridge-top`, {
      width: 6,
      height: 2.3,
      depth: 7.5,
    }, this.scene);
    bridgeTop.position.set(0, 11.5, 8.5);
    bridgeTop.material = accentMaterial;
    bridgeTop.parent = root;

    const windows = CreateBox(`${ship.id}-bridge-windows`, {
      width: 6.15,
      height: 0.85,
      depth: 5.6,
    }, this.scene);
    windows.position.set(0, 11.7, 10.1);
    windows.material = darkMaterial;
    windows.parent = root;

    const funnel = CreateCylinder(`${ship.id}-funnel`, {
      height: 9,
      diameterTop: 3.2,
      diameterBottom: 4.3,
      tessellation: 8,
    }, this.scene);
    funnel.position.set(0, 10, -8);
    funnel.rotation.x = -0.08;
    funnel.material = darkMaterial;
    funnel.parent = root;

    const mast = CreateCylinder(`${ship.id}-mast`, {
      height: 16,
      diameter: 0.55,
      tessellation: 6,
    }, this.scene);
    mast.position.set(0, 18, 4);
    mast.material = darkMaterial;
    mast.parent = root;

    const yard = CreateBox(`${ship.id}-yard`, {
      width: 10,
      height: 0.35,
      depth: 0.35,
    }, this.scene);
    yard.position.set(0, 20, 4);
    yard.material = darkMaterial;
    yard.parent = root;

    for (const side of [-1, 1]) {
      const boat = CreateCylinder(`${ship.id}-boat-${side}`, {
        height: 8,
        diameter: 2.1,
        tessellation: 8,
      }, this.scene);
      boat.rotation.x = Math.PI / 2;
      boat.position.set(side * 4.5, 6.2, -18);
      boat.material = accentMaterial;
      boat.parent = root;
    }

    const turret = new TransformNode(`${ship.id}-turret`, this.scene);
    turret.position.set(0, 6.6, 31);
    turret.parent = root;
    const gunDefinition = getMainGun(ship.mainGunId);
    const mount = CreateCylinder(`${ship.id}-mount`, {
      height: gunDefinition.visual.barrelCount === 2 ? 2.9 : 2.5,
      diameter: gunDefinition.visual.mountDiameter,
      tessellation: 8,
    }, this.scene);
    mount.material = deckMaterial;
    mount.parent = turret;
    const gunHouse = CreateBox(`${ship.id}-gun-house`, {
      width: gunDefinition.visual.houseWidth,
      height: gunDefinition.visual.barrelCount === 2 ? 3.2 : 2.7,
      depth: gunDefinition.visual.barrelCount === 2 ? 5.8 : 4.8,
    }, this.scene);
    gunHouse.position.set(0, 1.7, 1.2);
    gunHouse.material = accentMaterial;
    gunHouse.parent = turret;
    const barrelOffsets = gunDefinition.visual.barrelCount === 2
      ? [-gunDefinition.visual.barrelSpacing / 2, gunDefinition.visual.barrelSpacing / 2]
      : [0];
    for (const [barrelIndex, barrelOffset] of barrelOffsets.entries()) {
      const barrel = CreateCylinder(`${ship.id}-barrel-${barrelIndex}`, {
        height: gunDefinition.visual.barrelLength,
        diameter: gunDefinition.visual.barrelCount === 2 ? 1.12 : 0.9,
        tessellation: 6,
      }, this.scene);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(
        barrelOffset,
        1.45,
        gunDefinition.visual.barrelLength * 0.48,
      );
      barrel.material = gunDefinition.visual.barrelCount === 2 ? accentMaterial : deckMaterial;
      barrel.parent = turret;
    }

    const wakeMaterial = this.material(`${ship.id}-wake-material`, new Color3(0.72, 0.86, 0.88));
    wakeMaterial.alpha = 0.3;
    wakeMaterial.disableLighting = true;
    const wakes = [-1, 1].map((side) => {
      const wake = CreateBox(`${ship.id}-wake-${side}`, {
        width: 2.2,
        height: 0.06,
        depth: 86,
      }, this.scene);
      wake.position.set(side * 4.3, -0.63, -65);
      wake.rotation.y = side * 0.035;
      wake.material = wakeMaterial;
      wake.parent = root;
      return wake;
    });

    const smokeMaterial = this.material(`${ship.id}-smoke-material`, new Color3(0.09, 0.1, 0.1));
    smokeMaterial.alpha = 0.42;
    smokeMaterial.disableLighting = true;
    const smokePuffs = Array.from({ length: 3 }, (_, index) => {
      const puff = CreateSphere(`${ship.id}-damage-smoke-${index}`, {
        diameter: 7 + index * 1.4,
        segments: 4,
      }, this.scene);
      puff.position.set((index - 1) * 1.2, 13 + index * 4.5, -5 + index * 1.8);
      puff.material = smokeMaterial;
      puff.visibility = 0;
      puff.parent = root;
      return puff;
    });

    const fireMaterial = this.material(
      `${ship.id}-fire-material`,
      new Color3(0.95, 0.24, 0.03),
      new Color3(0.75, 0.12, 0.01),
    );
    fireMaterial.alpha = 0.86;
    fireMaterial.disableLighting = true;
    const flamePositions = [
      { x: -1.7, y: 9.3, z: -8 },
      { x: 1.5, y: 8.2, z: -1 },
      { x: -0.6, y: 8.8, z: 7 },
    ];
    const fireFlames = flamePositions.map((position, index) => {
      const flame = CreateCylinder(`${ship.id}-fire-flame-${index}`, {
        height: 5.5 + index * 0.8,
        diameterTop: 0.35,
        diameterBottom: 3.2 - index * 0.35,
        tessellation: 5,
      }, this.scene);
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

    return { root, turret, wakes, smokePuffs, fireFlames, collider };
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

  private syncShips(state: BattleState): void {
    for (const ship of state.ships) {
      let visual = this.ships.get(ship.id);
      if (!visual) {
        visual = this.createShip(ship);
        this.ships.set(ship.id, visual);
      }
      const seaMotion = ship.hull > 0 ? Math.sin(state.time * 0.7 + (ship.team === "enemy" ? 1.8 : 0)) : 0;
      const settling = ship.flooding * 0.022 + (1 - ship.hull / ship.maxHull) * 1.2;
      visual.root.position.set(ship.position.x, ship.hull > 0 ? seaMotion * 0.16 - settling : -4, ship.position.z);
      visual.root.rotation.y = ship.heading;
      visual.root.rotation.z = ship.hull > 0
        ? seaMotion * 0.006 + ship.flooding * 0.0008 * (ship.team === "player" ? 1 : -1)
        : 0.08;
      visual.turret.rotation.y = wrapAngle(ship.turretHeading - ship.heading);
      const wakeStrength = Math.min(1, Math.abs(ship.speedKnots) / 18);
      for (const wake of visual.wakes) {
        wake.visibility = ship.hull > 0 ? wakeStrength * 0.75 : 0;
        wake.scaling.z = 0.35 + wakeStrength * 0.85;
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
        flame.rotation.y = state.time * (0.8 + index * 0.13);
      }
      visual.collider.visibility = this.debugColliders && ship.hull > 0 ? 0.9 : 0;
    }
  }

  private syncProjectiles(state: BattleState): void {
    const activeIds = new Set(state.projectiles.map((projectile) => projectile.id));
    for (const [id, visual] of this.projectileMeshes) {
      if (!activeIds.has(id)) {
        visual.root.dispose(false, true);
        this.projectileMeshes.delete(id);
        this.projectileTrails.get(id)?.core.dispose();
        this.projectileTrails.get(id)?.plume.dispose();
        this.projectileTrails.delete(id);
      }
    }

    for (const projectile of state.projectiles) {
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
        const shellMaterial = this.material(
          `${projectile.kind}-material-${projectile.id}`,
          torpedo
            ? new Color3(0.12, 0.18, 0.17)
            : apShell ? new Color3(0.62, 0.86, 1) : new Color3(1, 0.78, 0.25),
          torpedo
            ? new Color3(0.34, 0.42, 0.36)
            : apShell ? new Color3(0.12, 0.48, 1) : new Color3(1, 0.4, 0.04),
        );
        shellMaterial.disableLighting = !torpedo;
        shell.material = shellMaterial;
        shell.parent = root;
        const glow = CreateSphere(`shell-glow-${projectile.id}`, {
          diameter: 2.6,
          segments: 4,
        }, this.scene);
        const glowMaterial = this.material(
          `shell-glow-material-${projectile.id}`,
          apShell ? new Color3(0.28, 0.72, 1) : new Color3(1, 0.3, 0.02),
          apShell ? new Color3(0.08, 0.32, 1) : new Color3(1, 0.2, 0.01),
        );
        glowMaterial.alpha = 0.4;
        glowMaterial.disableLighting = true;
        glow.material = glowMaterial;
        glow.parent = root;
        glow.visibility = torpedo ? 0 : 1;
        visual = { root, shell, glow };
        this.projectileMeshes.set(projectile.id, visual);
      }
      visual.root.position.copyFrom(nextPoint);
      visual.root.lookAt(nextPoint.add(direction));
      if (projectile.kind === "shell") {
        visual.glow.scaling.setAll(0.86 + Math.sin(projectile.age * 36) * 0.12);
      }

      let trail = this.projectileTrails.get(projectile.id);
      if (!trail) {
        const capacity = this.quality === "low" ? 18 : 30;
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
        core.alpha = projectile.kind === "torpedo" ? 0.74 : 0.96;
        const plume = CreateTube(`trail-plume-${projectile.id}`, {
          path: points,
          radius: projectile.kind === "torpedo" ? 0.48 : 0.32,
          tessellation: 4,
          updatable: true,
        }, this.scene);
        const plumeMaterial = this.material(
          `trail-plume-material-${projectile.id}`,
          projectile.kind === "torpedo"
            ? new Color3(0.68, 0.86, 0.86)
            : new Color3(0.76, 0.72, 0.57),
          projectile.kind === "torpedo"
            ? new Color3(0.03, 0.12, 0.14)
            : new Color3(0.22, 0.12, 0.03),
        );
        plumeMaterial.alpha = 0.3;
        plumeMaterial.disableLighting = true;
        plume.material = plumeMaterial;
        trail = { core, plume, points, capacity };
        this.projectileTrails.set(projectile.id, trail);
      } else {
        trail.points.push(nextPoint);
        while (trail.points.length > trail.capacity) trail.points.shift();
        trail.core = CreateLines(`trail-core-${projectile.id}`, {
          points: trail.points,
          instance: trail.core,
        }, this.scene);
        trail.plume = CreateTube(`trail-plume-${projectile.id}`, {
          path: trail.points,
          radius: projectile.kind === "torpedo"
            ? (this.quality === "low" ? 0.42 : 0.52)
            : (this.quality === "low" ? 0.28 : 0.36),
          tessellation: 4,
          instance: trail.plume,
        }, this.scene);
      }
    }
  }

  syncAimArc(player: ShipState): void {
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
    this.aimArc.visibility = this.aiming ? 0.9 : 0.16;
    this.barrelArc.visibility = this.aiming ? 1 : 0.22;
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
      const flash = CreateSphere(`muzzle-flash-${shot.id}`, {
        diameter: 6.5,
        segments: 4,
      }, this.scene);
      flash.position.copyFrom(toVector(shot.position));
      flash.material = this.effectMaterial(
        "muzzle-core",
        new Color3(1, 0.56, 0.08),
        new Color3(1, 0.28, 0.01),
      );
      this.effects.push({
        mesh: flash,
        remaining: 0.2,
        duration: 0.2,
        scaleFrom: 0.25,
        scaleTo: 1.5,
      });
      const smoke = CreateSphere(`muzzle-smoke-${shot.id}`, {
        diameter: 3.4,
        segments: 4,
      }, this.scene);
      smoke.position.copyFrom(toVector(shot.position));
      smoke.material = this.effectMaterial(
        "muzzle-smoke",
        new Color3(0.28, 0.29, 0.27),
        Color3.Black(),
        0.38,
      );
      this.effects.push({
        mesh: smoke,
        remaining: 0.62,
        duration: 0.62,
        velocity: new Vector3(0, 4.5, 0),
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
        const plume = CreateCylinder(`splash-plume-${impact.id}`, {
          height: 27,
          diameterTop: 0.8,
          diameterBottom: 7.5,
          tessellation: 7,
        }, this.scene);
        plume.position.copyFrom(point);
        plume.position.y += 12;
        plume.material = this.effectMaterial(
          "splash-water",
          new Color3(0.78, 0.9, 0.92),
          new Color3(0.08, 0.16, 0.18),
          0.82,
        );
        this.effects.push({
          mesh: plume,
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
        const droplets = this.quality === "low" ? 4 : 7;
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

      const burst = CreateSphere(`hit-burst-${impact.id}`, { diameter: 8, segments: 5 }, this.scene);
      burst.position.copyFrom(point);
      burst.position.y += 4;
      burst.material = this.effectMaterial(
        "hit-fire",
        new Color3(1, 0.3, 0.03),
        new Color3(0.78, 0.08, 0.01),
        0.9,
      );
      this.effects.push({
        mesh: burst,
        remaining: 0.52,
        duration: 0.52,
        scaleFrom: 0.3,
        scaleTo: 1.75,
      });
      const sparks = this.quality === "low" ? 4 : 7;
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
        effect.mesh.dispose();
        this.effects.splice(index, 1);
      }
    }
  }

  sync(state: BattleState, dt: number): void {
    this.syncShips(state);
    this.syncProjectiles(state);
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
      this.syncAimArc(player);
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
      trail.plume.dispose();
    }
    for (const effect of this.effects) effect.mesh.dispose();
    this.projectileMeshes.clear();
    this.projectileTrails.clear();
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
