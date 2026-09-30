import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/core/Rendering/outlineRenderer";
import { dockComponentOwner, type DockComponentHover } from "./dockInteraction";
import type { DockActualVisual } from "./dockLoadoutRenderer";

const OUTLINE_COLOR = new Color3(.56, .91, 1);
const OUTLINE_WIDTH = .12;
type OriginalOutline = { renderOutline: boolean; width: number; color: Color3 };

/** Resolve every installed child (barrels, cradle, housing), not every mount of
 * the same model. Candidates live outside the actual equipment root. The caller
 * obtains hover from pickDockComponent, whose nearest-surface ray rejects occlusion. */
export function dockComponentMeshes(actual: DockActualVisual, hover: DockComponentHover): AbstractMesh[] {
  if (hover.internal || actual.root.isDisposed() || !actual.root.isEnabled()) return [];
  return actual.equipment.root.getChildMeshes().filter((mesh) => {
    if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0
      || mesh.material?.alpha === 0 || mesh.getTotalVertices() === 0) return false;
    const owner = dockComponentOwner(mesh, actual);
    return owner?.category === hover.category && owner.slotIndex === hover.slotIndex
      && owner.equipmentId === hover.equipmentId;
  });
}

/** A reversible depth-tested outline on existing geometry; no ghost geometry,
 * material, full-screen pass or stencil state is created for hover. */
export class DockComponentHighlight {
  private readonly originals = new Map<AbstractMesh, OriginalOutline>();
  private actual?: DockActualVisual;
  private key?: string;
  private disposed = false;
  get meshCount(): number { return this.originals.size; }

  update(actual?: DockActualVisual, hover?: DockComponentHover): boolean {
    if (this.disposed || !actual || !hover || hover.internal || actual.root.isDisposed()
      || !actual.root.isEnabled()) return this.clear();
    const key = `${hover.category}:${hover.slotIndex}:${hover.equipmentId}`;
    if (this.actual === actual && this.key === key && [...this.originals.keys()].every((mesh) =>
      !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0 && mesh.material?.alpha !== 0)) return false;
    const changed = this.clear();
    for (const mesh of dockComponentMeshes(actual, hover)) {
      this.originals.set(mesh, { renderOutline: mesh.renderOutline, width: mesh.outlineWidth, color: mesh.outlineColor });
      mesh.outlineColor = OUTLINE_COLOR;
      mesh.outlineWidth = OUTLINE_WIDTH;
      mesh.renderOutline = true;
    }
    this.actual = actual; this.key = key;
    return changed || this.originals.size > 0;
  }

  clear(): boolean {
    const changed = this.originals.size > 0;
    for (const [mesh, original] of this.originals) {
      if (mesh.isDisposed()) continue;
      mesh.renderOutline = original.renderOutline;
      mesh.outlineWidth = original.width;
      mesh.outlineColor = original.color;
    }
    this.originals.clear(); this.actual = undefined; this.key = undefined;
    return changed;
  }

  dispose(): void { this.clear(); this.disposed = true; }
}
