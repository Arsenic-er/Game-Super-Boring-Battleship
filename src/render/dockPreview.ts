import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { EquipmentDefinition } from "../profile/equipmentCatalog";
import { getMainGun } from "../ships/components";
import type { MainGunId } from "../ships/components";
import {
  getMainBattery,
  mainBatteryMountLocalPosition,
} from "../ships/mainBatteries";
import { DEFAULT_SHIP_CLASS_ID, getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { DEFAULT_TORPEDO_ID, getTorpedo } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import {
  createDestroyerHull,
  createDestroyerV3Superstructure,
  createHullClassSilhouette,
  createNavalMotionParts,
  createMainGunVisual,
  createTorpedoLauncherVisual,
} from "./shipGeometry";
import { createPixelShipPalette } from "./shipMaterials";
import type { PixelShipPalette } from "./shipMaterials";
import { createDockEquipmentPreviewVisual } from "./equipmentPreviewVisuals";

export class DockPreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly shipRoot: TransformNode;
  private readonly palette: PixelShipPalette;
  private readonly modulePreviewMaterial: StandardMaterial;
  private hullRoot?: TransformNode;
  private propellers: TransformNode[] = [];
  private classDetailRoot?: TransformNode;
  private shipClassId: ShipClassId = DEFAULT_SHIP_CLASS_ID;
  private turrets: TransformNode[] = [];
  private gunCradles: TransformNode[] = [];
  private mainGunId: MainGunId = "mk1-single";
  private torpedoLauncher?: TransformNode;
  private torpedoId: TorpedoId = DEFAULT_TORPEDO_ID;
  private equipmentPreview?: TransformNode;

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
    this.modulePreviewMaterial = new StandardMaterial("dock-module-preview", this.scene);
    this.modulePreviewMaterial.diffuseColor = new Color3(0.16, 0.78, 0.82);
    this.modulePreviewMaterial.emissiveColor = new Color3(0.07, 0.42, 0.48);
    this.modulePreviewMaterial.alpha = 0.52;
    this.modulePreviewMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.modulePreviewMaterial.disableDepthWrite = true;
    this.modulePreviewMaterial.backFaceCulling = false;
    this.modulePreviewMaterial.wireframe = true;
    this.palette = createPixelShipPalette(this.scene, "dock", "ally");
    this.setTorpedo(DEFAULT_TORPEDO_ID);
    this.setShipClass(DEFAULT_SHIP_CLASS_ID);
    let lastRender = 0;
    this.engine.runRenderLoop(() => {
      const now = Date.now();
      if (canvas.offsetParent && now - lastRender >= 50) {
        const seconds = now / 1000;
        this.shipRoot.position.y = Math.sin(seconds * 0.65) * 0.08;
        if (this.equipmentPreview) {
          this.equipmentPreview.position.y = Math.sin(seconds * 2.1) * 0.11;
        }
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

  setMainGun(id: MainGunId, remember = true, componentPreview = false): void {
    if (remember) this.mainGunId = id;
    for (const turret of this.turrets) turret.dispose(false, false);
    this.turrets = [];
    this.gunCradles = [];
    const count = getShipClass(this.shipClassId).starterSlots.mainGun;
    const definition = getMainBattery(this.shipClassId, id, count);
    const componentVisual = getMainGun(id).visual;
    for (const [index, mount] of definition.mounts.entries()) {
      const visual = createMainGunVisual(this.scene, this.shipRoot, `dock-mount-${index}`, {
        visual: componentPreview
          ? componentVisual
          : { ...definition.visual, barrelCount: mount.barrelCount },
      }, this.palette);
      const hardpoint = mainBatteryMountLocalPosition(mount);
      visual.root.position.set(hardpoint.x, hardpoint.y, hardpoint.z);
      this.turrets.push(visual.root);
      this.gunCradles.push(visual.cradle);
    }
  }

  setTorpedo(id: TorpedoId, remember = true): void {
    if (remember) this.torpedoId = id;
    this.torpedoLauncher?.dispose(false, false);
    const definition = getTorpedo(id);
    const visual = createTorpedoLauncherVisual(
      this.scene,
      this.shipRoot,
      `dock-${id}`,
      definition,
      this.palette,
    );
    this.torpedoLauncher = visual.root;
    this.torpedoLauncher.rotation.y = Math.PI / 2;
    this.torpedoLauncher.setEnabled(getShipClass(this.shipClassId).slotCounts.torpedo > 0);
  }
  previewEquipment(item?: EquipmentDefinition): void {
    this.equipmentPreview?.dispose(false, false);
    this.equipmentPreview = undefined;
    this.setMainGun(this.mainGunId, false);
    this.setTorpedo(this.torpedoId, false);
    if (!item) return;
    if (item.category === "mainGun" && item.mainGunId) {
      this.setMainGun(item.mainGunId, false, true);
      return;
    }
    if (item.category === "torpedo" && item.torpedoId) {
      this.setTorpedo(item.torpedoId, false);
      return;
    }
    this.equipmentPreview = createDockEquipmentPreviewVisual(
      this.scene,
      this.shipRoot,
      item,
      this.palette,
      this.modulePreviewMaterial,
    );
  }


  setShipClass(id: ShipClassId): void {
    this.equipmentPreview?.dispose(false, false);
    this.equipmentPreview = undefined;
    this.shipClassId = id;
    const hull = getShipClass(id);
    this.shipRoot.scaling.set(hull.renderScale.x, hull.renderScale.y, hull.renderScale.z);
    this.hullRoot?.dispose(false, false);
    this.hullRoot = new TransformNode(`dock-${id}-hull-root`, this.scene);
    this.hullRoot.parent = this.shipRoot;
    createDestroyerHull(this.scene, this.hullRoot, {
      name: `dock-${id}`,
      length: 112,
      beam: 11,
      hullId: hull.hullId,
      hullMaterial: this.palette.hull,
      deckMaterial: this.palette.deck,
    });
    this.classDetailRoot?.dispose(false, false);
    this.classDetailRoot = new TransformNode(`dock-${id}-class-details`, this.scene);
    this.classDetailRoot.parent = this.shipRoot;
    const motion = hull.hullId === "destroyer"
      ? createDestroyerV3Superstructure(this.scene, this.classDetailRoot, `dock-${id}`, this.palette)
      : createNavalMotionParts(this.scene, this.classDetailRoot, `dock-${id}`, this.palette);
    this.propellers = motion.propellers;
    createHullClassSilhouette(
      this.scene,
      this.classDetailRoot,
      `dock-${id}`,
      hull.hullId,
      this.palette,
      hull.visualVariant,
    );
    this.torpedoLauncher?.setEnabled(hull.slotCounts.torpedo > 0);
    this.setMainGun(this.mainGunId, false);
    this.setTorpedo(this.torpedoId, false);
    const radius = 158 * Math.sqrt(hull.renderScale.z);
    this.camera.radius = radius;
    this.camera.lowerRadiusLimit = radius * 0.72;
    this.camera.target.y = 5 * hull.renderScale.y;
  }

  resize(): void { this.engine.resize(); }
}
