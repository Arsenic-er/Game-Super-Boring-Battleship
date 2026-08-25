import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { getShipClass, type ShipClassId } from "../ships/classes";
import {
  createDestroyerHull,
  createDestroyerV3Superstructure,
  createHullClassSilhouette,
  createNavalMotionParts,
} from "./shipGeometry";
import type { PixelShipPalette } from "./shipMaterials";

export interface ProceduralShipHullVisual {
  root: TransformNode;
  bodyMeshes: Mesh[];
  rudder: TransformNode;
  propellers: TransformNode[];
}

export function createProceduralShipHull(
  scene: Scene,
  parent: TransformNode,
  name: string,
  shipClassId: ShipClassId,
  palette: PixelShipPalette,
): ProceduralShipHullVisual {
  const definition = getShipClass(shipClassId);
  const root = new TransformNode(`${name}-procedural-hull`, scene);
  root.parent = parent;
  createDestroyerHull(scene, root, {
    name,
    length: 112,
    beam: 11,
    hullId: definition.hullId,
    hullMaterial: palette.hull,
    deckMaterial: palette.deck,
  });
  const motion = definition.hullId === "destroyer"
    ? createDestroyerV3Superstructure(scene, root, name, palette)
    : createNavalMotionParts(scene, root, name, palette);
  createHullClassSilhouette(scene, root, name, definition.hullId, palette, definition.visualVariant);
  const bodyMeshes = root.getChildMeshes(false).filter((mesh): mesh is Mesh => mesh instanceof Mesh);
  return { root, bodyMeshes, rudder: motion.rudder, propellers: motion.propellers };
}
