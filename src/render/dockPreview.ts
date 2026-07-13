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
import { createSymmetricBow } from "./shipGeometry";

export class DockPreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly shipRoot: TransformNode;
  private turret?: TransformNode;

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

    const hull = CreateBox("dock-hull-main", { width: 13, height: 7, depth: 104 }, this.scene);
    hull.scaling.z = 1;
    hull.position.y = 0;
    hull.material = hullMaterial;
    hull.parent = this.shipRoot;
    createSymmetricBow(this.scene, this.shipRoot, {
      name: "dock-bow",
      hullRearZ: 52,
      tipZ: 78,
      hullHalfWidth: 6.5,
      hullTopY: 3.5,
      hullRearBottomY: -3.5,
      hullTipBottomY: -2.2,
      deckRearZ: 47,
      deckHalfWidth: 6.1,
      deckTopY: 4.5,
      deckThickness: 0.9,
      hullMaterial,
      deckMaterial,
    });
    const deck = CreateBox("dock-deck", { width: 12.2, height: 1, depth: 94 }, this.scene);
    deck.position.y = 4;
    deck.material = deckMaterial;
    deck.parent = this.shipRoot;

    const bridgeLevels = [
      { width: 9.5, height: 5.2, depth: 12, y: 7, z: 10 },
      { width: 8.2, height: 4, depth: 9, y: 11.2, z: 12 },
      { width: 6.8, height: 3, depth: 7, y: 14.6, z: 13 },
    ];
    for (const [index, spec] of bridgeLevels.entries()) {
      const level = CreateBox(`dock-bridge-${index}`, spec, this.scene);
      level.position.set(0, spec.y, spec.z);
      level.material = bridgeMaterial;
      level.parent = this.shipRoot;
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const window = CreateBox(`dock-window-${side}-${index}`, { width: 1.25, height: 0.65, depth: 0.25 }, this.scene);
        window.position.set(side * (index - 1) * 2.1, 15, 16.6);
        window.material = darkMaterial;
        window.parent = this.shipRoot;
      }
    }
    for (const z of [-8, -24]) {
      const funnel = CreateCylinder(`dock-funnel-${z}`, { height: 11, diameterTop: 4.2, diameterBottom: 5.6, tessellation: 8 }, this.scene);
      funnel.position.set(0, 10, z);
      funnel.material = darkMaterial;
      funnel.parent = this.shipRoot;
    }
    const mast = CreateCylinder("dock-mast", { height: 28, diameter: 0.65, tessellation: 6 }, this.scene);
    mast.position.set(0, 23, 5);
    mast.material = darkMaterial;
    mast.parent = this.shipRoot;
    const yard = CreateCylinder("dock-yard", { height: 15, diameter: 0.45, tessellation: 6 }, this.scene);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, 28, 5);
    yard.material = darkMaterial;
    yard.parent = this.shipRoot;
    const torpedoes = CreateBox("dock-torpedoes", { width: 7.5, height: 2.8, depth: 8 }, this.scene);
    torpedoes.position.set(0, 6.2, -18);
    torpedoes.material = darkMaterial;
    torpedoes.parent = this.shipRoot;
    const rearGun = CreateBox("dock-rear-gun", { width: 6.2, height: 3, depth: 6 }, this.scene);
    rearGun.position.set(0, 6, -39);
    rearGun.material = bridgeMaterial;
    rearGun.parent = this.shipRoot;
  }

  setMainGun(id: MainGunId): void {
    this.turret?.dispose(false, true);
    const definition = getMainGun(id);
    const material = this.material("dock-gun-material", new Color3(0.42, 0.46, 0.42));
    const dark = this.material("dock-barrel-material", new Color3(0.1, 0.14, 0.14));
    this.turret = new TransformNode("dock-turret", this.scene);
    this.turret.position.set(0, 6, 37);
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

  resize(): void { this.engine.resize(); }
}
