import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { EquipmentCategory } from "../profile/equipmentCatalog";
import { getTorpedo } from "../ships/torpedoes";
import { createMainGunVisual, createTorpedoLauncherVisual } from "./shipGeometry";
import { createAntiAirMountVisual, createSideGunMountVisual, createDepthChargeMountVisual } from "./equipmentPreviewVisuals";
import type { PixelShipPalette } from "./shipMaterials";
import type { EquipmentVisualMount, ResolvedLoadoutVisualPlan } from "./loadoutVisualPlan";

export interface LoadoutEquipmentVisual {
  root: TransformNode;
  turrets: TransformNode[];
  gunCradles: TransformNode[];
  gunBarrels: Mesh[];
  gunBarrelRestZ: number[];
  torpedoLaunchers: TransformNode[];
  secondaryTurrets: TransformNode[];
}

/** Shared dock/combat adapter; optional selection only constructs the candidate ghost. */
export function createLoadoutEquipmentVisual(
  scene: Scene, parent: TransformNode, name: string, plan: ResolvedLoadoutVisualPlan,
  palette: PixelShipPalette, selection?: { category: EquipmentCategory; slotIndex: number },
): LoadoutEquipmentVisual {
  const root = new TransformNode(`${name}-equipment`, scene);
  root.parent = parent;
  const include = (mount: EquipmentVisualMount): boolean => !selection || (selection.category === mount.category && selection.slotIndex === mount.slotIndex);
  const place = (node: TransformNode, mount: EquipmentVisualMount): TransformNode => {
    node.position.set(mount.position.x, mount.position.y, mount.position.z);
    node.rotation.y = mount.heading;
    node.metadata = { equipmentId: mount.equipmentId, category: mount.category, slotIndex: mount.slotIndex };
    return node;
  };
  try {
    const guns = plan.mainGun.filter(include).map((mount) => {
      const gun = createMainGunVisual(scene, root, `${name}-mount-${mount.slotIndex}-${mount.equipmentId}`, { visual: mount.visual }, palette);
      place(gun.root, mount);
      return gun;
    });
    const torpedoLaunchers = plan.torpedo.filter(include).map((mount) => {
      const launcher = createTorpedoLauncherVisual(scene, root, `${name}-launcher-${mount.slotIndex}-${mount.equipmentId}`, getTorpedo(mount.torpedoId), palette);
      return place(launcher.root, mount);
    });
    const secondaryTurrets = plan.sideGun.filter(include).map((mount) => place(
      createSideGunMountVisual(scene, root, `${name}-secondary-${mount.slotIndex}-${mount.equipmentId}`, mount.rarity, palette), mount));
    for (const mount of plan.antiAir.filter(include)) place(
      createAntiAirMountVisual(scene, root, `${name}-aa-${mount.slotIndex}-${mount.equipmentId}`, mount.rarity, palette), mount);
    for (const mount of plan.depthCharge.filter(include)) place(
      createDepthChargeMountVisual(scene, root, `${name}-depth-${mount.slotIndex}-${mount.equipmentId}`, mount.rarity, palette), mount);
    return { root, turrets: guns.map((gun) => gun.root), gunCradles: guns.map((gun) => gun.cradle),
      gunBarrels: guns.flatMap((gun) => gun.barrels), gunBarrelRestZ: guns.flatMap((gun) => gun.barrelRestZ), torpedoLaunchers, secondaryTurrets };
  } catch (error) {
    root.dispose(false, false);
    throw error;
  }
}
