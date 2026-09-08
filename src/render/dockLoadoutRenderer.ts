import { Constants } from "@babylonjs/core/Engines/constants";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { EquipmentDefinition } from "../profile/equipmentCatalog";
import { getShipClass } from "../ships/classes";
import { createLoadoutEquipmentVisual, type LoadoutEquipmentVisual } from "./loadoutEquipmentVisual";
import { resolveLoadoutVisualPlan, slotsFromVisualPlan, type ResolvedLoadoutVisualPlan } from "./loadoutVisualPlan";
import { createProceduralShipHull, type ProceduralShipHullVisual } from "./shipHullVisual";
import type { PixelShipPalette } from "./shipMaterials";

export type LoadoutApplyResult = { status: "applied" | "superseded" | "fallback-applied" } | { status: "failed"; error: string };
export interface DockExternalHullResult { root?: TransformNode; fallback?: boolean }
export interface DockActualVisual {
  root: TransformNode;
  plan: ResolvedLoadoutVisualPlan;
  hull: ProceduralShipHullVisual;
  equipment: LoadoutEquipmentVisual;
  externalRoot?: TransformNode;
}
export interface DockLoadoutRendererOptions {
  loadExternalHull?: (plan: ResolvedLoadoutVisualPlan) => Promise<DockExternalHullResult>;
  createHull?: typeof createProceduralShipHull;
  createEquipment?: typeof createLoadoutEquipmentVisual;
}

/** Scene-only controller: testable using NullEngine, with independent actual and inspection roots. */
export class DockLoadoutRenderer {
  private generation = 0;
  private disposed = false;
  private actual?: DockActualVisual;
  private overlay?: TransformNode;
  private inspection?: { item: EquipmentDefinition; slotIndex: number };
  private readonly pending = new Set<DockActualVisual>();
  private readonly ghostMaterial: StandardMaterial;
  private readonly markerMaterial: StandardMaterial;

  constructor(private readonly scene: Scene, private readonly parent: TransformNode,
    private readonly palette: PixelShipPalette, private readonly options: DockLoadoutRendererOptions = {}) {
    this.ghostMaterial = new StandardMaterial("dock-candidate-ghost", scene);
    this.ghostMaterial.diffuseColor = new Color3(.1, .85, .95);
    this.ghostMaterial.emissiveColor = new Color3(.05, .3, .38);
    this.ghostMaterial.alpha = .4;
    this.ghostMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.ghostMaterial.disableDepthWrite = true;
    this.markerMaterial = new StandardMaterial("dock-internal-marker", scene);
    this.markerMaterial.diffuseColor = new Color3(.1, .8, .95);
    this.markerMaterial.emissiveColor = new Color3(.05, .5, .6);
    this.markerMaterial.alpha = .38;
    this.markerMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.markerMaterial.disableDepthWrite = true;
    this.markerMaterial.depthFunction = Constants.ALWAYS;
    this.markerMaterial.backFaceCulling = false;
    this.markerMaterial.disableLighting = true;
  }
  get current(): DockActualVisual | undefined { return this.actual; }
  get inspectionRoot(): TransformNode | undefined { return this.overlay; }

  async setLoadout(plan: ResolvedLoadoutVisualPlan): Promise<LoadoutApplyResult> {
    if (this.disposed) return { status: "failed", error: "Dock preview is disposed" };
    const generation = ++this.generation;
    const root = new TransformNode(`dock-actual-${generation}-${plan.shipClassId}`, this.scene);
    root.parent = this.parent;
    root.setEnabled(false);
    const scale = getShipClass(plan.shipClassId).renderScale;
    root.scaling.set(scale.x, scale.y, scale.z);
    let staged: DockActualVisual | undefined;
    try {
      const hull = (this.options.createHull ?? createProceduralShipHull)(this.scene, root, `dock-${generation}`, plan.shipClassId, this.palette);
      const equipment = (this.options.createEquipment ?? createLoadoutEquipmentVisual)(this.scene, root, `dock-${generation}`, plan, this.palette);
      staged = { root, plan, hull, equipment };
      this.pending.add(staged);
      let external: DockExternalHullResult;
      try { external = await (this.options.loadExternalHull?.(plan) ?? Promise.resolve({})); }
      catch { external = { fallback: true }; }
      if (generation !== this.generation || this.disposed) {
        external.root?.dispose(false, true);
        this.disposeActual(staged);
        return { status: "superseded" };
      }
      if (external.root) {
        external.root.parent = root;
        hull.root.setEnabled(false);
        staged.externalRoot = external.root;
      }
      const previous = this.actual;
      this.actual = staged;
      this.pending.delete(staged);
      root.setEnabled(true);
      if (previous) this.disposeActual(previous);
      // Re-anchor the latest independent inspection after a class/loadout replacement.
      if (this.inspection) this.previewEquipment(this.inspection.item, this.inspection.slotIndex);
      return { status: external.fallback ? "fallback-applied" : "applied" };
    } catch (error) {
      if (staged) this.disposeActual(staged); else root.dispose(false, false);
      return generation !== this.generation || this.disposed ? { status: "superseded" }
        : { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  previewEquipment(item?: EquipmentDefinition, slotIndex = 0): void {
    slotIndex = Number.isFinite(slotIndex) ? Math.max(0, Math.min(127, Math.floor(slotIndex))) : 0;
    this.inspection = item ? { item, slotIndex } : undefined;
    this.overlay?.dispose(false, false);
    this.overlay = undefined;
    if (!item || !this.actual || this.disposed) return;
    const slots = slotsFromVisualPlan(this.actual.plan);
    while (slots[item.category].length <= slotIndex) slots[item.category].push(null);
    slots[item.category][slotIndex] = item.id;
    const candidate = resolveLoadoutVisualPlan(this.actual.plan.shipClassId, slots);
    const root = new TransformNode(`dock-inspection-${item.id}-${slotIndex}`, this.scene);
    root.parent = this.parent;
    root.scaling.copyFrom(this.actual.root.scaling);
    try {
      const internal = candidate.internalModules.find((entry) => entry.category === item.category && entry.slotIndex === slotIndex);
      if (internal) {
        // Babylon augments its builder options; the canonical plan remains deeply frozen.
        const marker = CreateBox(`dock-${item.id}-internal-region`, { ...internal.bounds }, this.scene);
        marker.position.set(internal.position.x, internal.position.y, internal.position.z);
        marker.material = this.markerMaterial;
        marker.renderingGroupId = 3;
        marker.isPickable = false;
        marker.parent = root;
      } else {
        createLoadoutEquipmentVisual(this.scene, root, `dock-candidate-${item.id}`, candidate, this.palette, { category: item.category, slotIndex });
        for (const mesh of root.getChildMeshes()) {
          mesh.material = this.ghostMaterial;
          mesh.isPickable = false;
          mesh.scaling.scaleInPlace(1.035);
        }
      }
      this.overlay = root;
    } catch {
      root.dispose(false, false);
    }
  }
  private disposeActual(actual: DockActualVisual): void {
    this.pending.delete(actual);
    actual.externalRoot?.dispose(false, true);
    actual.root.dispose(false, false);
  }
  dispose(): void {
    this.disposed = true;
    ++this.generation;
    this.overlay?.dispose(false, false);
    this.overlay = undefined;
    this.inspection = undefined;
    if (this.actual) this.disposeActual(this.actual);
    this.actual = undefined;
    for (const entry of [...this.pending]) this.disposeActual(entry);
    this.ghostMaterial.dispose();
    this.markerMaterial.dispose();
  }
}
