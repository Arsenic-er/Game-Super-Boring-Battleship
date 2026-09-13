import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
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

import { DockHoverState, DockOrbitMotion, DockRenderCadence, DOCK_ORBIT_LIMITS, DOCK_DEFAULT_ORBIT, dockFraming, pickDockComponent, type DockBounds, type DockComponentHover } from "./dockInteraction";

export type { DockComponentHover } from "./dockInteraction";
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
  private readonly orbit = new DockOrbitMotion();
  private readonly cadence = new DockRenderCadence();
  private readonly hover = new DockHoverState();
  private readonly previousTouchAction: string;
  private readonly previousOpacity: string;
  private presentedRoot?: TransformNode;
  private presentation?: Animation;
  private pointer?: { clientX: number; clientY: number };
  private drag?: { pointerId: number; clientX: number; clientY: number };
  private readonly target = new Vector3(0, 5, 0);
  private framingBounds?: DockBounds;
  private pendingFrameReset = false;
  private disposed = false;
  private readonly handleResize = (): void => this.resize();
  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    this.pointer = { clientX: event.clientX, clientY: event.clientY };
    this.hover.update(undefined, true);
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Detached canvas during a panel switch. */ }
    this.cadence.request(performance.now());
  };
  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointer = { clientX: event.clientX, clientY: event.clientY };
    if (this.drag?.pointerId === event.pointerId) {
      this.orbit.rotate(event.clientX - this.drag.clientX, event.clientY - this.drag.clientY);
      this.drag.clientX = event.clientX; this.drag.clientY = event.clientY;
      this.hover.update(undefined, true);
    }
    this.cadence.request(performance.now());
  };
  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = undefined;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.cadence.request(performance.now());
  };
  private readonly handlePointerLeave = (): void => { this.pointer = undefined; this.hover.update(); };
  private readonly handleCancel = (): void => {
    const pointerId = this.drag?.pointerId;
    this.drag = undefined; this.pointer = undefined; this.hover.update();
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  };
  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
    this.orbit.zoom(pixels); this.hover.update(); this.cadence.request(performance.now());
  };
  private readonly handleContextMenu = (event: Event): void => event.preventDefault();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.previousOpacity = canvas.style.opacity;
    canvas.style.opacity = "0";
    canvas.dataset.modelReady = "false";
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, false);
    this.scene = new Scene(this.engine);
    // Transparent WebGL backgrounds must also have zero RGB with premultiplied alpha.
    this.scene.clearColor.set(0, 0, 0, 0);
    this.camera = new ArcRotateCamera("dock-camera", DOCK_DEFAULT_ORBIT.alpha, DOCK_DEFAULT_ORBIT.beta, DOCK_DEFAULT_ORBIT.radius, new Vector3(0, 5, 0), this.scene);
    this.camera.lowerRadiusLimit = 118;
    this.camera.upperRadiusLimit = 360;
    this.camera.lowerBetaLimit = DOCK_ORBIT_LIMITS.minimumBeta;
    this.camera.upperBetaLimit = DOCK_ORBIT_LIMITS.maximumBeta;
    this.camera.allowUpsideDown = false;
    this.camera.inertia = 0;
    // A single time-based controller avoids layering Babylon's frame-dependent
    // wheel/drag inertia over the preview's adaptive rendering cadence.
    this.camera.inputs.clear();
    this.scene.skipPointerMovePicking = true;
    this.scene.skipPointerDownPicking = true;
    this.scene.skipPointerUpPicking = true;
    this.previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handleCancel);
    canvas.addEventListener("lostpointercapture", this.handleCancel);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("blur", this.handleCancel);
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
    let lastTick = performance.now();
    this.cadence.request(lastTick);
    this.engine.runRenderLoop(() => {
      const now = performance.now(), seconds = now / 1000;
      const dt = Math.min(.1, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;
      const visible = !document.hidden && canvas.isConnected && canvas.clientWidth > 0
        && canvas.clientHeight > 0 && canvas.getClientRects().length > 0;
      if (!visible) { this.cadence.takeFrame(now, false); this.handleCancel(); return; }
      const moving = this.orbit.moving || Vector3.DistanceSquared(this.camera.target, this.target) > .000025;
      const pose = this.orbit.step(dt);
      this.camera.alpha = pose.alpha; this.camera.beta = pose.beta; this.camera.radius = pose.radius;
      Vector3.LerpToRef(this.camera.target, this.target, 1 - Math.exp(-12 * dt), this.camera.target);
      if (!this.cadence.takeFrame(now, true, moving || Boolean(this.drag))) return;
      this.shipRoot.position.y = Math.sin(seconds * .65) * .08;
      this.shipRoot.rotation.z = Math.sin(seconds * .46) * .004;
      const current = this.renderer.current;
      for (const [index, turret] of (current?.equipment.turrets ?? []).entries())
        turret.rotation.y = (current?.plan.mainGun[index]?.heading ?? 0) + Math.sin(seconds * .22) * .18;
      for (const cradle of current?.equipment.gunCradles ?? []) cradle.rotation.x = -.05 - Math.sin(seconds * .31) * .025;
      for (const [index, propeller] of (current?.hull.propellers ?? []).entries())
        propeller.rotation.z = seconds * (index === 0 ? 2.2 : -2.2);
      this.scene.render();
      // Rendering compiles shaders and loads textures. Never present only the
      // ready turrets while the hull's first material is still compiling.
      if (current && current.root !== this.presentedRoot) {
        const ready = this.scene.isReady(true);
        canvas.style.opacity = ready ? "1" : "0";
        canvas.dataset.modelReady = String(ready);
        if (ready) {
          this.presentedRoot = current.root;
          this.presentation?.cancel();
          const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (!reduced && typeof canvas.animate === "function")
            this.presentation = canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });
        }
      }
      this.updateComponentHover();
    });
    window.addEventListener("resize", this.handleResize);
    // Locale changes, saved-build rows and the pending rail resize the canvas without a window event.
    this.resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(this.handleResize);
    this.resizeObserver?.observe(canvas);
  }

  async setLoadout(plan: ResolvedLoadoutVisualPlan): Promise<LoadoutApplyResult> {
    this.requestedPlan = plan;
    this.hover.update();
    this.cadence.request(performance.now());
    const previousClass = this.renderer.current?.plan.shipClassId;
    const result = await this.renderer.setLoadout(plan);
    if (!this.disposed && (result.status === "applied" || result.status === "fallback-applied")) {
      this.updateFramingBounds();
      this.fitCamera(previousClass !== plan.shipClassId);
      this.hover.update(); this.cadence.request(performance.now());
    }
    return result;
  }

  previewEquipment(item?: EquipmentDefinition, slotIndex = 0): void {
    this.renderer.previewEquipment(item, slotIndex);
    this.hover.update(); this.cadence.request(performance.now());
  }

  private updateFramingBounds(): void {
    const actual = this.renderer.current;
    if (!actual) return;
    const minimum = new Vector3(Infinity, Infinity, Infinity), maximum = new Vector3(-Infinity, -Infinity, -Infinity);
    const points: Vector3[] = [];
    // Only actual installed geometry, never the independently animated inspection ghost.
    for (const mesh of actual.root.getChildMeshes()) {
      if (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0 || mesh.material?.alpha === 0 || mesh.getTotalVertices() === 0) continue;
      const world = mesh.computeWorldMatrix(true), positions = mesh.getVerticesData("position");
      if (positions) {
        for (let i = 0; i < positions.length; i += 3) {
          const point = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world);
          if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
          points.push(point); minimum.minimizeInPlace(point); maximum.maximizeInPlace(point);
        }
      } else {
        for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
          const point = corner.clone();
          points.push(point); minimum.minimizeInPlace(point); maximum.maximizeInPlace(point);
        }
      }
    }
    if (!points.length) return;
    this.framingBounds = { minimum, maximum, points };
  }
  private fitCamera(resetZoom = false): void {
    this.pendingFrameReset ||= resetZoom;
    if (!this.framingBounds || this.canvas.clientWidth <= 0 || this.canvas.clientHeight <= 0) return;
    const framing = dockFraming(this.framingBounds, this.canvas.clientWidth / this.canvas.clientHeight);
    this.orbit.setFraming(framing.radius, this.pendingFrameReset);
    this.pendingFrameReset = false;
    this.target.set(framing.target.x, framing.target.y, framing.target.z);
    this.camera.lowerRadiusLimit = framing.radius * .62;
    this.camera.upperRadiusLimit = framing.radius * 2.4;
  }
  getComponentHover(): DockComponentHover | undefined { return this.hover.current; }
  setComponentHoverCallback(callback?: (hover: DockComponentHover | undefined) => void): void {
    this.hover.subscribe(callback);
  }
  private updateComponentHover(): void {
    const actual = this.renderer.current;
    if (!actual || !this.pointer || this.drag || this.orbit.moving) { this.hover.update(); return; }
    const rect = this.canvas.getBoundingClientRect();
    const x = this.pointer.clientX - rect.left, y = this.pointer.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height || rect.width <= 0 || rect.height <= 0) {
      this.hover.update(); return;
    }
    // Babylon accepts CSS pixels adjusted by hardware scaling. Also compensate
    // for a CSS-scaled canvas rather than accidentally picking at render-pixel coordinates.
    const pickX = x / rect.width * this.engine.getRenderWidth() * this.engine.getHardwareScalingLevel();
    const pickY = y / rect.height * this.engine.getRenderHeight() * this.engine.getHardwareScalingLevel();
    const ray = this.scene.createPickingRay(pickX, pickY, Matrix.Identity(), this.camera);
    this.hover.update(pickDockComponent(this.scene, actual, ray, x, y));
  }
  /** Compatibility bridge: old label loops must actively hide every unhovered compartment. */
  getInternalModuleAnchors(): InternalModuleAnchor[] {
    const current = this.hover.current;
    return (this.renderer.current?.plan.internalModules ?? []).map((module) => {
      const visible = Boolean(current?.internal && current.category === module.category && current.slotIndex === module.slotIndex);
      return { category: module.category, slotIndex: module.slotIndex, equipmentId: module.equipmentId,
        x: visible ? current!.canvasX : 0, y: visible ? current!.canvasY : 0, visible };
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
    if (this.disposed) return;
    if (this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) { this.engine.resize(); this.fitCamera(); }
    this.hover.update(); this.cadence.request(performance.now());
  }
  dispose(): void {
    this.disposed = true;
    this.handleCancel(); this.hover.subscribe(undefined);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handleCancel);
    this.canvas.removeEventListener("lostpointercapture", this.handleCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.style.touchAction = this.previousTouchAction;
    this.presentation?.cancel(); this.canvas.style.opacity = this.previousOpacity;
    delete this.canvas.dataset.modelReady;
    window.removeEventListener("blur", this.handleCancel);
    window.removeEventListener("resize", this.handleResize);
    this.resizeObserver?.disconnect();
    this.engine.stopRenderLoop();
    this.renderer.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
