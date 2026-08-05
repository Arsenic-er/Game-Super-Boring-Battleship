import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import {
  EQUIPMENT_BY_ID,
  type EquipmentCategory,
  type EquipmentRarity,
} from "../profile/equipmentCatalog";
import type { ShipState } from "../sim/types";
import type { TorpedoId } from "../ships/torpedoes";
import {
  createAntiAirMountVisual,
  createDepthChargeMountVisual,
  createSideGunMountVisual,
} from "./equipmentPreviewVisuals";
import type { PixelShipPalette } from "./shipMaterials";

export interface CombatEquipmentMountPlan {
  equipmentId: string;
  rarity: EquipmentRarity;
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface CombatSecondaryMountPlan extends CombatEquipmentMountPlan {
  longitudinalOffset: number;
}

export interface CombatEquipmentVisualPlan {
  signature: string;
  torpedoEquipmentIds: string[];
  torpedoDefinitionIds: TorpedoId[];
  secondary: CombatSecondaryMountPlan[];
  antiAir: CombatEquipmentMountPlan[];
  depthCharge: CombatEquipmentMountPlan[];
}

export interface CombatEquipmentVisual {
  root: TransformNode;
  secondaryTurrets: TransformNode[];
}

function equipmentIdentity(
  candidate: string | null | undefined,
  category: EquipmentCategory,
): { id: string; rarity: EquipmentRarity } {
  const item = candidate ? EQUIPMENT_BY_ID[candidate] : undefined;
  const fallback = EQUIPMENT_BY_ID[`${category}-common`];
  const definition = item?.category === category ? item : fallback;
  if (!definition) throw new Error(`Missing ${category} combat equipment definition`);
  return { id: definition.id, rarity: definition.rarity };
}

function normalizedIds(
  ship: Readonly<ShipState>,
  category: "torpedo" | "antiAir" | "depthCharge",
  count: number,
): { id: string; rarity: EquipmentRarity }[] {
  const source = ship.installedEquipment?.[category] ?? [];
  const equipped = source.flatMap((candidate) => {
    const item = candidate ? EQUIPMENT_BY_ID[candidate] : undefined;
    return item?.category === category ? [{ id: item.id, rarity: item.rarity }] : [];
  });
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    equipped[index] ?? equipmentIdentity(undefined, category)
  ));
}

function antiAirHardpoint(index: number, count: number): Omit<CombatEquipmentMountPlan, "equipmentId" | "rarity"> {
  const rows = Math.ceil(count / 2);
  const row = Math.floor(index / 2);
  const side = index % 2 === 0 ? -1 : 1;
  const loneCenter = count % 2 === 1 && index === count - 1;
  const z = rows <= 1 ? 1 : -20 + row / (rows - 1) * 40;
  return {
    x: loneCenter ? 0 : side * 4.05,
    y: loneCenter ? 10.2 : 8.35,
    z,
    heading: loneCenter ? 0 : side * -0.45,
  };
}

export function combatEquipmentVisualPlan(ship: Readonly<ShipState>): CombatEquipmentVisualPlan {
  const torpedo = normalizedIds(ship, "torpedo", ship.torpedoLauncherMounts);
  const antiAir = normalizedIds(ship, "antiAir", ship.antiAirMounts).map((item, index, items) => ({
    equipmentId: item.id,
    rarity: item.rarity,
    ...antiAirHardpoint(index, items.length),
  }));
  const depthCharge = normalizedIds(ship, "depthCharge", ship.depthChargeMounts).map((item, index, items) => {
    const forward = item.rarity === "redGold";
    const side = items.length <= 1 ? 0 : (index % 2 === 0 ? -1 : 1) * 2.2;
    return {
      equipmentId: item.id,
      rarity: item.rarity,
      x: side,
      y: forward ? 7.1 : 5.35,
      z: forward ? 29 - Math.floor(index / 2) * 3.5 : -43 + Math.floor(index / 2) * 3.5,
      heading: forward ? 0 : Math.PI,
    };
  });
  const secondary = ship.secondaryMounts.map((mount) => {
    const item = equipmentIdentity(mount.definitionId, "sideGun");
    return {
      equipmentId: item.id,
      rarity: item.rarity,
      x: mount.side * 4.35,
      y: 8.2,
      z: 0,
      heading: mount.heading,
      longitudinalOffset: mount.longitudinalOffset,
    };
  });
  const torpedoEquipmentIds = torpedo.map(({ id }) => id);
  const torpedoDefinitionIds = torpedoEquipmentIds.map((id) =>
    EQUIPMENT_BY_ID[id]?.torpedoId ?? ship.torpedoId);
  const signature = [
    `torpedo=${torpedoEquipmentIds.join(",")}`,
    `secondary=${secondary.map(({ equipmentId }) => equipmentId).join(",")}`,
    `antiAir=${antiAir.map(({ equipmentId }) => equipmentId).join(",")}`,
    `depthCharge=${depthCharge.map(({ equipmentId }) => equipmentId).join(",")}`,
  ].join("|");
  return {
    signature,
    torpedoEquipmentIds,
    torpedoDefinitionIds,
    secondary,
    antiAir,
    depthCharge,
  };
}

export function createCombatEquipmentVisual(
  scene: Scene,
  parent: TransformNode,
  ship: Readonly<ShipState>,
  palette: PixelShipPalette,
  hullRenderScaleZ: number,
): CombatEquipmentVisual {
  const plan = combatEquipmentVisualPlan(ship);
  const root = new TransformNode(`${ship.id}-combat-equipment`, scene);
  root.parent = parent;
  const secondaryTurrets = plan.secondary.map((mount, index) => {
    const turret = createSideGunMountVisual(
      scene,
      root,
      `${ship.id}-secondary-${index}-${mount.equipmentId}`,
      mount.rarity,
      palette,
    );
    turret.position.set(mount.x, mount.y, mount.longitudinalOffset / hullRenderScaleZ);
    return turret;
  });
  for (const [index, mount] of plan.antiAir.entries()) {
    const visual = createAntiAirMountVisual(
      scene,
      root,
      `${ship.id}-aa-${index}-${mount.equipmentId}`,
      mount.rarity,
      palette,
    );
    visual.position.set(mount.x, mount.y, mount.z);
    visual.rotation.y = mount.heading;
  }
  for (const [index, mount] of plan.depthCharge.entries()) {
    const visual = createDepthChargeMountVisual(
      scene,
      root,
      `${ship.id}-depth-${index}-${mount.equipmentId}`,
      mount.rarity,
      palette,
    );
    visual.position.set(mount.x, mount.y, mount.z);
    visual.rotation.y = mount.heading;
  }
  return { root, secondaryTurrets };
}
