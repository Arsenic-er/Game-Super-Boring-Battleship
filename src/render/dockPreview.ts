import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { MainGunId } from "../ships/components";
import { getMainBattery } from "../ships/mainBatteries";
import { DEFAULT_SHIP_CLASS_ID, getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { DEFAULT_TORPEDO_ID, getTorpedo } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import {
  createDestroyerHull,
  createDestroyerV3Superstructure,
  createHullClassSilhouette,
  createMainGunVisual,
  createTorpedoLauncherVisual,
} from "./shipGeometry";
import { createPixelShipPalette } from "./shipMaterials";
import type { PixelShipPalette } from "./shipMaterials";

export class DockPreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly shipRoot: TransformNode;
  private readonly palette: PixelShipPalette;
  private readonly propellers: TransformNode[];
  private classDetailRoot?: TransformNode;
  private shipClassId: ShipClassId = DEFAULT_SHIP_CLASS_ID;
  private turrets: TransformNode[] = [];
  private gunCradles: TransformNode[] = [];
  private mainGunId: MainGunId = "mk1-single";
  private torpedoLauncher?: TransformNode;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false);
    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0.015, 0.075, 0.1, 0);
    this.camera = new ArcRotateCamera("dock-camera", -1.08, 1.03, 158, new Vector3(0, 5, 0), this.scene);
    this.camera.lowerRadiusLimit = 118;
    this.camera.upperRadiusLimit = 360;
    this.camera.angularSensibilityY = -1000;
    this.camera.attachControl(canvas, true);
    this.camera.panningSensibility = 0;
    new HemisphericLight("dock-hemi", new Vector3(0, 1, 0), this.scene).intensity = 0.8;
    const key = new DirectionalLight("dock-key", new Vector3(-0.4, -1, 0.35), this.scene);
    key.intensity = 1.25;
    this.shipRoot = new TransformNode("dock-ship", this.scene);
    this.palette = createPixelShipPalette(this.scene, "dock", "ally");
    this.buildHull();
    const motion = createDestroyerV3Superstructure(
      this.scene,
      this.shipRoot,
      "dock",
      this.palette,
    );
    this.propellers = motion.propellers;
    this.setMainGun("mk1-single");
    this.setTorpedo(DEFAULT_TORPEDO_ID);
    this.setShipClass(DEFAULT_SHIP_CLASS_ID);
    let lastRender = 0;
    this.engine.runRenderLoop(() => {
      const now = Date.now();
      if (canvas.offsetParent && now - lastRender >= 50) {
        const seconds = now / 1000;
        this.shipRoot.position.y = Math.sin(seconds * 0.65) * 0.08;
        this.shipRoot.rotation.z = Math.sin(seconds * 0.46) * 0.004;
        for (const turret of this.turrets) turret.rotation.y = Math.sin(seconds * 0.22) * 0.32;
        for (const cradle of this.gunCradles) cradle.rotation.x = -0.05 - Math.sin(seconds * 0.31) * 0.025;
        for (const [index, propeller] of this.propellers.entries()) {
          propeller.rotation.z = seconds * (index === 0 ? 2.2 : -2.2);
        }
        this.scene.render();
        lastRender = now;
      }
    });
    window.addEventListener("resize", () => this.engine.resize());
  }

  private buildHull(): void {
    createDestroyerHull(this.scene, this.shipRoot, {
      name: "dock",
      length: 112,
      beam: 11,
      hullMaterial: this.palette.hull,
      deckMaterial: this.palette.deck,
    });
  }

  setMainGun(id: MainGunId): void {
    for (const turret of this.turrets) turret.dispose(false, true);
    this.turrets = [];
    this.gunCradles = [];
    this.mainGunId = id;
    const count = getShipClass(this.shipClassId).starterSlots.mainGun;
    const definition = getMainBattery(this.shipClassId, id, count);
    for (const [index, mount] of definition.mounts.entries()) {
      const visual = createMainGunVisual(this.scene, this.shipRoot, `dock-mount-${index}`, {
        visual: { ...definition.visual, barrelCount: mount.barrelCount },
      }, this.palette);
      visual.root.position.z = mount.longitudinalFraction * 112;
      this.turrets.push(visual.root);
      this.gunCradles.push(visual.cradle);
    }
  }

  setTorpedo(id: TorpedoId): void {
    this.torpedoLauncher?.dispose(false, true);
    const definition = getTorpedo(id);
    const visual = createTorpedoLauncherVisual(
      this.scene,
      this.shipRoot,
      "dock",
      definition,
      this.palette,
    );
    this.torpedoLauncher = visual.root;
    this.torpedoLauncher.rotation.y = Math.PI / 2;
    this.torpedoLauncher.setEnabled(getShipClass(this.shipClassId).slotCounts.torpedo > 0);
  }

  setShipClass(id: ShipClassId): void {
    this.shipClassId = id;
    const hull = getShipClass(id);
    this.shipRoot.scaling.set(hull.renderScale.x, hull.renderScale.y, hull.renderScale.z);
    this.classDetailRoot?.dispose(false, true);
    this.classDetailRoot = new TransformNode(`dock-${id}-class-details`, this.scene);
    this.classDetailRoot.parent = this.shipRoot;
    createHullClassSilhouette(
      this.scene,
      this.classDetailRoot,
      `dock-${id}`,
      hull.hullId,
      this.palette,
      hull.visualVariant,
    );
    this.torpedoLauncher?.setEnabled(hull.slotCounts.torpedo > 0);
    this.setMainGun(this.mainGunId);
    const radius = 158 * Math.sqrt(hull.renderScale.z);
    this.camera.radius = radius;
    this.camera.lowerRadiusLimit = radius * 0.72;
    this.camera.target.y = 5 * hull.renderScale.y;
  }

  resize(): void { this.engine.resize(); }
}
