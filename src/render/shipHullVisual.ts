import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShipClassId } from "../ships/classes";
import { createHistoricalShipGeometry } from "./historicalShipGeometry";
import type { PixelShipPalette } from "./shipMaterials";

export interface ProceduralShipHullVisual {
  root: TransformNode;
  bodyMeshes: Mesh[];
  rudder: TransformNode;
  propellers: TransformNode[];
}

/** Historic class geometry; callers retain the existing non-uniform 112 x 11 root scale. */
export function createProceduralShipHull(
  scene: Scene, parent: TransformNode, name: string, shipClassId: ShipClassId, palette: PixelShipPalette,
): ProceduralShipHullVisual {
  const root = new TransformNode(`${name}-procedural-hull`, scene);
  root.parent = parent;
  try {
    const geometry = createHistoricalShipGeometry(scene, root, name, shipClassId, palette);
    return { root, bodyMeshes: geometry.bodyMeshes, rudder: geometry.rudder, propellers: geometry.propellers };
  } catch (error) {
    root.dispose(false, false);
    throw error;
  }
}
