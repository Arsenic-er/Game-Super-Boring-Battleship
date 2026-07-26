import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { getMainGun } from "../ships/components";
import type { MainGunId } from "../ships/components";
import { DEFAULT_TORPEDO_ID, getTorpedo } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import {
  createDestroyerHull,
  createDestroyerV2Superstructure,
  DESTROYER_V2_HARDPOINTS,
} from "./shipGeometry";

export class DockPreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly shipRoot: TransformNode;
  private turret?: TransformNode;
  private torpedoLauncher?: TransformNode;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false);
    this.scene = new Scene(this.engine);
    this.scene.clearColor.set(0.015, 0.075, 0.1, 0);
    const camera = new ArcRotateCamera("dock-camera", -1.08, 1.03, 184, new Vector3(0, 5, 0), this.scene);
    camera.lowerRadiusLimit = 118;
    camera.upperRadiusLimit = 220;
    camera.angularSensibilityY = -1000;
    camera.attachControl(canvas, true);
    camera.panningSensibility = 0;
    new HemisphericLight("dock-hemi", new Vector3(0, 1, 0), this.scene).intensity = 0.8;
    const key = new DirectionalLight("dock-key", new Vector3(-0.4, -1, 0.35), this.scene);
    key.intensity = 1.25;
    this.shipRoot = new TransformNode("dock-ship", this.scene);
    this.buildHull();
    this.setMainGun("mk1-single");
    this.setTorpedo(DEFAULT_TORPEDO_ID);
    let lastRender = 0;
    this.engine.runRenderLoop(() => {
      const now = Date.now();
      if (canvas.offsetParent && now - lastRender >= 50) {
        this.scene.render();
        lastRender = now;
      }
    });
    window.addEventListener("resize", () => this.engine.resize());
  }

  private material(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.08, 0.12, 0.13);
    return material;
  }

  private buildHull(): void {
    const hullMaterial = this.material("dock-hull", new Color3(0.19, 0.27, 0.29));
    const deckMaterial = this.material("dock-deck", new Color3(0.31, 0.36, 0.34));
    const darkMaterial = this.material("dock-dark", new Color3(0.09, 0.13, 0.14));
    const bridgeMaterial = this.material("dock-bridge", new Color3(0.35, 0.42, 0.41));

    createDestroyerHull(this.scene, this.shipRoot, {
      name: "dock",
      length: 112,
      beam: 11,
      hullMaterial,
      deckMaterial,
    });

    createDestroyerV2Superstructure(this.scene, this.shipRoot, "dock", {
      deck: deckMaterial,
      structure: bridgeMaterial,
      dark: darkMaterial,
      accent: bridgeMaterial,
    });
  }

  setMainGun(id: MainGunId): void {
    this.turret?.dispose(false, true);
    const definition = getMainGun(id);
    const material = this.material("dock-gun-material", new Color3(0.42, 0.46, 0.42));
    const dark = this.material("dock-barrel-material", new Color3(0.1, 0.14, 0.14));
    this.turret = new TransformNode("dock-turret", this.scene);
    this.turret.position.set(
      DESTROYER_V2_HARDPOINTS.mainGun.x,
      DESTROYER_V2_HARDPOINTS.mainGun.y,
      DESTROYER_V2_HARDPOINTS.mainGun.z,
    );
    this.turret.parent = this.shipRoot;
    const house = CreateBox("dock-gun-house", { width: definition.visual.houseWidth, height: 4, depth: 7 }, this.scene);
    house.material = material;
    house.parent = this.turret;
    const offsets = definition.visual.barrelCount === 2 ? [-1.6, 1.6] : [0];
    for (const [index, x] of offsets.entries()) {
      const barrel = CreateCylinder(`dock-barrel-${index}`, { height: definition.visual.barrelLength, diameter: 1, tessellation: 8 }, this.scene);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(x, 0.5, definition.visual.barrelLength * 0.45);
      barrel.material = dark;
      barrel.parent = this.turret;
    }
  }

  setTorpedo(id: TorpedoId): void {
    this.torpedoLauncher?.dispose(false, true);
    const definition = getTorpedo(id);
    const dark = this.material("dock-torpedo-base-material", new Color3(0.08, 0.12, 0.13));
    const tubeMaterial = this.material(
      "dock-torpedo-tube-material",
      definition.caliberMm >= 600
        ? new Color3(0.34, 0.39, 0.34)
        : new Color3(0.28, 0.34, 0.34),
    );
    this.torpedoLauncher = new TransformNode("dock-torpedo-launcher", this.scene);
    this.torpedoLauncher.position.set(
      DESTROYER_V2_HARDPOINTS.torpedoLauncher.x,
      DESTROYER_V2_HARDPOINTS.torpedoLauncher.y,
      DESTROYER_V2_HARDPOINTS.torpedoLauncher.z,
    );
    this.torpedoLauncher.rotation.y = Math.PI / 2;
    this.torpedoLauncher.parent = this.shipRoot;
    const base = CreateCylinder("dock-torpedo-base", {
      height: 1.5,
      diameter: definition.caliberMm >= 600 ? 7.2 : 6.4,
      tessellation: 8,
    }, this.scene);
    base.material = dark;
    base.parent = this.torpedoLauncher;
    const diameter = definition.caliberMm >= 600 ? 2.05 : 1.72;
    const spacing = definition.caliberMm >= 600 ? 2.35 : 2.05;
    for (const side of [-1, 1]) {
      const tube = CreateCylinder(`dock-torpedo-tube-${side}`, {
        height: 11,
        diameter,
        tessellation: 8,
      }, this.scene);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(side * spacing / 2, 1.55, 0.5);
      tube.material = tubeMaterial;
      tube.parent = this.torpedoLauncher;
    }
  }

  resize(): void { this.engine.resize(); }
}
