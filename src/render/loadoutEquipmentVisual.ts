import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { EquipmentCategory } from "../profile/equipmentCatalog";
import { getShipClass } from "../ships/classes";
import { createHistoricalMainGun, createHistoricalTorpedoLauncher, createHistoricalAuxiliary } from "./historicalEquipmentGeometry";
import type { PixelShipPalette } from "./shipMaterials";
import type { EquipmentVisualMount, ResolvedLoadoutVisualPlan } from "./loadoutVisualPlan";
import { HISTORICAL_HULL_STATIONS, HISTORICAL_SHIP_PROFILES } from "./historicalShipProfiles";

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
  const hull = getShipClass(plan.shipClassId), scale = hull.renderScale;
  const profile = HISTORICAL_SHIP_PROFILES[plan.shipClassId];
  const supportDepth = (mount: EquipmentVisualMount): number => {
    const fraction = mount.position.z * scale.z / hull.length;
    const next = Math.min(HISTORICAL_HULL_STATIONS.length-1,
      Math.max(1,HISTORICAL_HULL_STATIONS.findIndex(z => z >= fraction)));
    const a = HISTORICAL_HULL_STATIONS[next-1]!, b = HISTORICAL_HULL_STATIONS[next]!;
    const edgeY = (z: number): number => 4.65*scale.y + profile.sheer*Math.max(0,(z-.17)/.33)**2
      + (z>profile.forecastleEnd && profile.forecastleEnd>-.4 ? .55*scale.y : 0);
    const t = Math.min(1,Math.max(0,(fraction-a)/(b-a)));
    // Interpolate the actual hull stations; embed under the edge so crown cannot leave a gap.
    const footingY = edgeY(a)+(edgeY(b)-edgeY(a))*t-.12;
    return mount.position.y*scale.y-footingY;
  };
  const place = (node: TransformNode, mount: EquipmentVisualMount): TransformNode => {
    // Hardpoints stay hull-normalized, but fittings rotate in an undistorted metre frame.
    const frame = new TransformNode(`${name}-${mount.category}-${mount.slotIndex}-metre-frame`, scene);
    frame.parent = root;
    frame.position.set(mount.position.x, mount.position.y, mount.position.z);
    frame.scaling.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
    frame.metadata = { mountFrame: true, category: mount.category, slotIndex: mount.slotIndex };
    node.parent = frame;
    node.position.set(0, 0, 0);
    node.rotation.y = mount.heading;
    node.metadata = { ...node.metadata, equipmentId: mount.equipmentId, category: mount.category, slotIndex: mount.slotIndex };
    return node;
  };
  try {
    const guns = plan.mainGun.filter(include).map((mount) => {
      const gun = createHistoricalMainGun(scene, root, `${name}-mount-${mount.slotIndex}-${mount.equipmentId}`, plan.shipClassId, mount, palette);
      place(gun.root, mount);
      return gun;
    });
    const torpedoLaunchers = plan.torpedo.filter(include).map((mount) => {
      const launcher = createHistoricalTorpedoLauncher(scene, root, `${name}-launcher-${mount.slotIndex}-${mount.equipmentId}`, mount, palette);
      return place(launcher, mount);
    });
    const secondaryTurrets = plan.sideGun.filter(include).map((mount) => place(
      createHistoricalAuxiliary(scene, root, `${name}-secondary-${mount.slotIndex}-${mount.equipmentId}`, mount, palette, supportDepth(mount)), mount));
    for (const mount of plan.antiAir.filter(include)) place(
      createHistoricalAuxiliary(scene, root, `${name}-aa-${mount.slotIndex}-${mount.equipmentId}`, mount, palette, supportDepth(mount)), mount);
    for (const mount of plan.depthCharge.filter(include)) place(
      createHistoricalAuxiliary(scene, root, `${name}-depth-${mount.slotIndex}-${mount.equipmentId}`, mount, palette), mount);
    return { root, turrets: guns.map((gun) => gun.root), gunCradles: guns.map((gun) => gun.cradle),
      gunBarrels: guns.flatMap((gun) => gun.barrels), gunBarrelRestZ: guns.flatMap((gun) => gun.barrelRestZ), torpedoLaunchers, secondaryTurrets };
  } catch (error) {
    root.dispose(false, false);
    throw error;
  }
}
