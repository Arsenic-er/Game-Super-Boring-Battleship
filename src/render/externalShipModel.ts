import "@babylonjs/loaders/glTF/glTFFileLoader";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";
import type { ShipAssetManifest } from "./shipAssetManifest";

export interface ExternalShipModel {
  root: TransformNode;
  renderMeshes: Mesh[];
  hardpoints: ReadonlyMap<string, TransformNode>;
  collisionMeshes: Mesh[];
  manifest: ShipAssetManifest;
}

function isDescendantOfNamedNode(node: Node, names: ReadonlySet<string>): boolean {
  let current: Node | null = node;
  while (current) {
    if (names.has(current.name)) return true;
    current = current.parent;
  }
  return false;
}

export async function importExternalShipModel(
  scene: Scene,
  instanceName: string,
  baseUrl: string,
  file: string,
  manifest: ShipAssetManifest,
): Promise<ExternalShipModel> {
  const result = await ImportMeshAsync(`${baseUrl}${file}`, scene, {
    meshNames: null,
    pluginExtension: ".glb",
    name: instanceName,
  });
  const root = new TransformNode(`${instanceName}-external-root`, scene);
  const importedNodes: TransformNode[] = [
    ...result.transformNodes,
    ...result.meshes,
  ];

  for (const node of importedNodes) {
    if (!node.parent) node.parent = root;
  }

  const byName = new Map<string, TransformNode>();
  for (const node of importedNodes) byName.set(node.name, node);
  const missingHardpoints = manifest.hardpoints.filter((name) => !byName.has(name));
  if (missingHardpoints.length > 0) {
    root.dispose(false, true);
    throw new Error(`External ship model is missing hardpoints: ${missingHardpoints.join(", ")}`);
  }

  const renderNodeNames = new Set(manifest.renderNodes);
  const renderMeshes = result.meshes.filter((mesh): mesh is Mesh => (
    mesh instanceof Mesh && isDescendantOfNamedNode(mesh, renderNodeNames)
  ));
  if (renderMeshes.length === 0) {
    root.dispose(false, true);
    throw new Error("External ship model does not contain any declared render meshes.");
  }

  const hardpoints = new Map<string, TransformNode>();
  for (const name of manifest.hardpoints) hardpoints.set(name, byName.get(name)!);
  for (const mesh of result.meshes) mesh.isPickable = false;

  const collisionMeshes = manifest.collisionVolumes.map((volume) => {
    const collider = CreateBox(`${instanceName}-${volume.nodeName}`, {
      width: volume.size[0],
      height: volume.size[1],
      depth: volume.size[2],
    }, scene);
    collider.position.set(volume.center[0], volume.center[1], volume.center[2]);
    collider.parent = root;
    collider.visibility = 0;
    collider.isPickable = false;
    collider.metadata = { shipCollisionZone: volume.zone };
    return collider;
  });

  return { root, renderMeshes, hardpoints, collisionMeshes, manifest };
}
