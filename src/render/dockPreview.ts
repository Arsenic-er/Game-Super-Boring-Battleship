import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { EQUIPMENT_CATALOG, type EquipmentDefinition } from "../profile/equipmentCatalog";
import type { MainGunId } from "../ships/components";
import { DEFAULT_SHIP_CLASS_ID, getShipClass, type ShipClassId } from "../ships/classes";
import type { TorpedoId } from "../ships/torpedoes";
import type { InstalledEquipmentIds } from "../sim/types";
import { importExternalShipModel } from "./externalShipModel";
import { loadShipModelCatalog } from "./shipModelCatalog";
import { loadRegisteredShipModel } from "./shipModelFactory";
import { createPixelShipPalette } from "./shipMaterials";
import { DockLoadoutRenderer, type LoadoutApplyResult } from "./dockLoadoutRenderer";
import { resolveLoadoutVisualPlan, slotsFromVisualPlan, VISUAL_EQUIPMENT_CATEGORIES, type ResolvedLoadoutVisualPlan } from "./loadoutVisualPlan";

export type { LoadoutApplyResult } from "./dockLoadoutRenderer";
export interface InternalModuleAnchor {
  category: "magazine" | "engine" | "steering";
  slotIndex: number;
  equipmentId: string;
  x: number;
  y: number;
  visible: boolean;
}

export class DockPreview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly shipRoot: TransformNode;
  private readonly renderer: DockLoadoutRenderer;
  private readonly resizeObserver: ResizeObserver | undefined;
  private readonly shipModelCatalogReady = loadShipModelCatalog();
  private requestedPlan?: ResolvedLoadoutVisualPlan;
  private readonly handleResize = (): void => this.resize();

  constructor(private readonly canvas: HTMLCanvasElement) {
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
    new DirectionalLight("dock-key", new Vector3(-0.4, -1, 0.35), this.scene).intensity = 1.25;
    this.shipRoot = new TransformNode("dock-ship", this.scene);
    const palette = createPixelShipPalette(this.scene, "dock", "ally");
    this.renderer = new DockLoadoutRenderer(this.scene, this.shipRoot, palette, {
      loadExternalHull: async (plan) => {
        const catalog = await this.shipModelCatalogReady;
        const result = await loadRegisteredShipModel({
          registry: catalog.registry, shipClassId: plan.shipClassId, quality: "medium", distanceMeters: 0,
          loader: (baseUrl, file, manifest) => importExternalShipModel(this.scene, `dock-${plan.shipClassId}`, baseUrl, file, manifest),
          fallback: () => undefined,
        });
        return result.source === "external" && result.model
          ? { root: result.model.root }
          : { fallback: result.source === "procedural" && Boolean(result.error || catalog.issues.length) };
      },
    });
    this.setShipClass(DEFAULT_SHIP_CLASS_ID);
    let lastRender = 0;
    this.engine.runRenderLoop(() => {
      const now = Date.now();
      if (canvas.offsetParent && now - lastRender >= 50) {
        const seconds = now / 1000;
        this.shipRoot.position.y = Math.sin(seconds * 0.65) * 0.08;
        this.shipRoot.rotation.z = Math.sin(seconds * 0.46) * 0.004;
        const current = this.renderer.current;
        for (const [index, turret] of (current?.equipment.turrets ?? []).entries()) {
          turret.rotation.y = (current?.plan.mainGun[index]?.heading ?? 0) + Math.sin(seconds * 0.22) * 0.18;
        }
        for (const cradle of current?.equipment.gunCradles ?? []) cradle.rotation.x = -0.05 - Math.sin(seconds * 0.31) * 0.025;
        for (const [index, propeller] of (current?.hull.propellers ?? []).entries()) propeller.rotation.z = seconds * (index === 0 ? 2.2 : -2.2);
        this.scene.render();
        lastRender = now;
      }
    });
    window.addEventListener("resize", this.handleResize);
    // Locale changes, saved-build rows and the pending rail resize the canvas without a window event.
    this.resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(this.handleResize);
    this.resizeObserver?.observe(canvas);
  }

  async setLoadout(plan: ResolvedLoadoutVisualPlan): Promise<LoadoutApplyResult> {
    this.requestedPlan = plan;
    const previousClass = this.renderer.current?.plan.shipClassId;
    const result = await this.renderer.setLoadout(plan);
    if (result.status === "applied" || result.status === "fallback-applied") {
      const hull = getShipClass(plan.shipClassId);
      const radius = 158 * Math.sqrt(hull.renderScale.z);
      if (previousClass !== plan.shipClassId) this.camera.radius = radius;
      this.camera.lowerRadiusLimit = radius * 0.72;
      this.camera.upperRadiusLimit = Math.max(360, radius * 2.3);
      this.camera.target.y = 5 * hull.renderScale.y;
    }
    return result;
  }

  previewEquipment(item?: EquipmentDefinition, slotIndex = 0): void {
    this.renderer.previewEquipment(item, slotIndex);
  }

  getInternalModuleAnchors(): InternalModuleAnchor[] {
    const actual = this.renderer.current;
    if (!actual) return [];
    const width = this.engine.getRenderWidth(), height = this.engine.getRenderHeight();
    const viewport = this.camera.viewport.toGlobal(width, height);
    const world = actual.root.computeWorldMatrix(true);
    return actual.plan.internalModules.map((module) => {
      const point = Vector3.Project(new Vector3(module.position.x, module.position.y, module.position.z), world, this.scene.getTransformMatrix(), viewport);
      const x = point.x / Math.max(1, width) * this.canvas.clientWidth;
      const y = point.y / Math.max(1, height) * this.canvas.clientHeight;
      return { category: module.category, slotIndex: module.slotIndex, equipmentId: module.equipmentId, x, y,
        visible: Number.isFinite(x) && Number.isFinite(y) && point.z >= 0 && point.z <= 1
          && x >= 0 && y >= 0 && x <= this.canvas.clientWidth && y <= this.canvas.clientHeight };
    });
  }

  /** Legacy callers are routed through the same atomic full-plan transaction. */
  setShipClass(id: ShipClassId): void {
    const hull = getShipClass(id);
    const slots = Object.fromEntries(VISUAL_EQUIPMENT_CATEGORIES.map((category) => {
      const internal = category === "engine" || category === "magazine" || category === "steering";
      const count = internal ? 1 : hull.slotCounts[category];
      const starter = internal ? 1 : hull.starterSlots[category];
      return [category, Array.from({ length: count }, (_, index) => index < starter ? `${category}-common` : null)];
    })) as unknown as InstalledEquipmentIds;
    this.previewEquipment();
    void this.setLoadout(resolveLoadoutVisualPlan(id, slots));
  }
  setMainGun(id: MainGunId): void { this.setLegacyWeapon("mainGun", EQUIPMENT_CATALOG.find((item) => item.mainGunId === id)?.id); }
  setTorpedo(id: TorpedoId): void { this.setLegacyWeapon("torpedo", EQUIPMENT_CATALOG.find((item) => item.torpedoId === id)?.id); }
  private setLegacyWeapon(category: "mainGun" | "torpedo", equipmentId?: string): void {
    if (!equipmentId || !this.requestedPlan) return;
    const slots = slotsFromVisualPlan(this.requestedPlan);
    slots[category] = slots[category].map((id) => id === null ? null : equipmentId);
    void this.setLoadout(resolveLoadoutVisualPlan(this.requestedPlan.shipClassId, slots));
  }
  resize(): void {
    if (this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) this.engine.resize();
  }
  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.resizeObserver?.disconnect();
    this.engine.stopRenderLoop();
    this.renderer.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
