import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { getMainGun } from "../ships/components";
import type { MainGunId } from "../ships/components";
import { DEFAULT_TORPEDO_ID, getTorpedo } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import {
  createDestroyerHull,
  createDestroyerV3Superstructure,
  createMainGunVisual,
  createTorpedoLauncherVisual,
} from "./shipGeometry";
import { createPixelShipPalette } from "./shipMaterials";
import type { PixelShipPalette } from "./shipMaterials";

export class DockPreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly shipRoot: TransformNode;
  private readonly palette: PixelShipPalette;
  private readonly propellers: TransformNode[];
  private turret?: TransformNode;
  private gunCradle?: TransformNode;
  private torpedoLauncher?: TransformNode;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false);
    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0.015, 0.075, 0.1, 0);
    const camera = new ArcRotateCamera("dock-camera", -1.08, 1.03, 158, new Vector3(0, 5, 0), this.scene);
    camera.lowerRadiusLimit = 118;
    camera.upperRadiusLimit = 220;
    camera.angularSensibilityY = -1000;
    camera.attachControl(canvas, true);
    camera.panningSensibility = 0;
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
    let lastRender = 0;
    this.engine.runRenderLoop(() => {
      const now = Date.now();
      if (canvas.offsetParent && now - lastRender >= 50) {
        const seconds = now / 1000;
        this.shipRoot.position.y = Math.sin(seconds * 0.65) * 0.08;
        this.shipRoot.rotation.z = Math.sin(seconds * 0.46) * 0.004;
        if (this.turret) this.turret.rotation.y = Math.sin(seconds * 0.22) * 0.32;
        if (this.gunCradle) this.gunCradle.rotation.x = -0.05 - Math.sin(seconds * 0.31) * 0.025;
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
    this.turret?.dispose(false, true);
    const definition = getMainGun(id);
    const visual = createMainGunVisual(
      this.scene,
      this.shipRoot,
      "dock",
      definition,
      this.palette,
    );
    this.turret = visual.root;
    this.gunCradle = visual.cradle;
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
  }

  resize(): void { this.engine.resize(); }
}
