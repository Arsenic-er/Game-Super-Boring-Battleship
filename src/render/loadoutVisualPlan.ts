import { EQUIPMENT_BY_ID, type EquipmentCategory, type EquipmentRarity } from "../profile/equipmentCatalog";
import { getShipClass, type ShipClassId } from "../ships/classes";
import { installedMainBattery, mainBatteryMountLocalPosition, mainBatteryMountRestHeading } from "../ships/mainBatteries";
import type { MainGunId, MainGunVisualDefinition } from "../ships/components";
import type { TorpedoId } from "../ships/torpedoes";
import type { InstalledEquipmentIds } from "../sim/types";

export const VISUAL_EQUIPMENT_CATEGORIES = [
  "mainGun", "torpedo", "antiAir", "sideGun", "depthCharge", "magazine", "engine", "steering",
] as const satisfies readonly EquipmentCategory[];
export type VisualSlotStatus = "empty" | "installed" | "fallback";
export interface ResolvedVisualSlot {
  readonly slotIndex: number;
  readonly equipmentId: string | null;
  readonly status: VisualSlotStatus;
}
export interface EquipmentVisualMount {
  readonly category: EquipmentCategory;
  readonly slotIndex: number;
  readonly equipmentId: string;
  readonly rarity: EquipmentRarity;
  readonly status: "installed" | "fallback";
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly heading: number;
}
export interface MainGunVisualMount extends EquipmentVisualMount {
  readonly mainGunId: MainGunId;
  readonly visual: Readonly<MainGunVisualDefinition>;
}
export interface TorpedoVisualMount extends EquipmentVisualMount { readonly torpedoId: TorpedoId }
export interface InternalModuleVisualPlan extends EquipmentVisualMount {
  readonly category: "magazine" | "engine" | "steering";
  readonly bounds: Readonly<{ width: number; height: number; depth: number }>;
}
export interface ResolvedLoadoutVisualPlan {
  readonly shipClassId: ShipClassId;
  readonly signature: string;
  readonly slots: Readonly<Record<EquipmentCategory, readonly ResolvedVisualSlot[]>>;
  readonly mainGun: readonly MainGunVisualMount[];
  readonly torpedo: readonly TorpedoVisualMount[];
  readonly antiAir: readonly EquipmentVisualMount[];
  readonly sideGun: readonly EquipmentVisualMount[];
  readonly depthCharge: readonly EquipmentVisualMount[];
  readonly internalModules: readonly InternalModuleVisualPlan[];
}

/** Pure visual input: preserve holes and order; never reconstruct it from gameplay multipliers. */
export function resolveLoadoutVisualPlan(
  shipClassId: ShipClassId,
  installed: Readonly<InstalledEquipmentIds>,
  mainBatteryClassId: ShipClassId = shipClassId,
): ResolvedLoadoutVisualPlan {
  const hull = getShipClass(shipClassId);
  const slots = Object.fromEntries(VISUAL_EQUIPMENT_CATEGORIES.map((category) => [category,
    (installed[category] ?? []).map((candidate, slotIndex): ResolvedVisualSlot => {
      if (candidate == null) return Object.freeze({ slotIndex, equipmentId: null, status: "empty" });
      const valid = EQUIPMENT_BY_ID[candidate]?.category === category;
      return Object.freeze({ slotIndex, equipmentId: valid ? candidate : `${category}-common`, status: valid ? "installed" : "fallback" });
    }),
  ])) as Record<EquipmentCategory, ResolvedVisualSlot[]>;
  const mounted = (category: EquipmentCategory, position: (index: number, count: number) => { x: number; y: number; z: number; heading: number }): EquipmentVisualMount[] =>
    slots[category].flatMap((slot) => {
      if (!slot.equipmentId || slot.status === "empty") return [];
      const point = position(slot.slotIndex, slots[category].length);
      return [Object.freeze({ category, slotIndex: slot.slotIndex, equipmentId: slot.equipmentId,
        rarity: EQUIPMENT_BY_ID[slot.equipmentId]!.rarity, status: slot.status,
        position: Object.freeze({ x: point.x, y: point.y, z: point.z }), heading: point.heading })];
    });
  const battery = installedMainBattery(mainBatteryClassId, "mk1-single", slots.mainGun.length, slots.mainGun.map((slot) => slot.equipmentId));
  const mainGun = mounted("mainGun", () => ({ x: 0, y: 0, z: 0, heading: 0 })).map((mount, index): MainGunVisualMount => {
    const mainGunId = EQUIPMENT_BY_ID[mount.equipmentId]!.mainGunId ?? "mk1-single";
    const hardpoint = battery.mounts[index];
    // Developer mounts beyond a historical battery stay finite and separated.
    const position = hardpoint ? mainBatteryMountLocalPosition(hardpoint) : { x: 0, y: 6.05, z: -36 - (mount.slotIndex - battery.mounts.length) * 7 };
    return Object.freeze({ ...mount, mainGunId, position: Object.freeze(position),
      heading: hardpoint ? mainBatteryMountRestHeading(hardpoint) : Math.PI,
      visual: Object.freeze({ ...(hardpoint?.visual ?? battery.visual), barrelCount: hardpoint?.barrelCount ?? battery.visual.barrelCount }) });
  });
  // Absolute local deck coordinates, matching the established launcher builder hardpoint.
  const torpedo = mounted("torpedo", (index, count) => ({ x: 0, y: 5.45, z: -24.5 + (index - (count - 1) / 2) * 7, heading: Math.PI / 2 }))
    .map((mount): TorpedoVisualMount => Object.freeze({ ...mount, torpedoId: EQUIPMENT_BY_ID[mount.equipmentId]!.torpedoId ?? "mk-ix" }));
  const antiAir = mounted("antiAir", (index, count) => {
    const rows = Math.ceil(count / 2), row = Math.floor(index / 2), side = index % 2 === 0 ? -1 : 1;
    const center = count % 2 === 1 && index === count - 1;
    return { x: center ? 0 : side * 4.05, y: center ? 10.2 : 8.35,
      z: rows <= 1 ? 1 : -20 + row / (rows - 1) * 40, heading: center ? 0 : side * -0.45 };
  });
  const sideGun = mounted("sideGun", (index, count) => {
    const rows = Math.ceil(count / 2), progress = rows <= 1 ? .5 : Math.floor(index / 2) / (rows - 1);
    const side = index % 2 === 0 ? -1 : 1;
    return { x: side * 4.35, y: 8.2, z: hull.length * (.28 - progress * .56) / hull.renderScale.z, heading: side * Math.PI / 2 };
  });
  const depthCharge = mounted("depthCharge", (index, count) => {
    const forward = EQUIPMENT_BY_ID[slots.depthCharge[index]!.equipmentId!]?.rarity === "redGold";
    return { x: count <= 1 ? 0 : (index % 2 === 0 ? -1 : 1) * 2.2, y: forward ? 7.1 : 5.35,
      z: forward ? 29 - Math.floor(index / 2) * 3.5 : -43 + Math.floor(index / 2) * 3.5, heading: forward ? 0 : Math.PI };
  });
  const regions = {
    magazine: { x: 0, y: 3.7, z: 24, width: 5.2, height: 2.7, depth: 8.5 },
    engine: { x: 0, y: 2.1, z: -10, width: 7.4, height: 3.4, depth: 16 },
    steering: { x: 0, y: 2.2, z: -43, width: 5.6, height: 2.5, depth: 7 },
  } as const;
  const internalModules = (["magazine", "engine", "steering"] as const).flatMap((category) =>
    mounted(category, (index) => ({ ...regions[category], x: index * 1.6, heading: 0 })).map((mount): InternalModuleVisualPlan =>
      Object.freeze({ ...mount, category, bounds: Object.freeze({ width: regions[category].width, height: regions[category].height, depth: regions[category].depth }) })));
  for (const category of VISUAL_EQUIPMENT_CATEGORIES) Object.freeze(slots[category]);
  const signature = `${shipClassId}:${mainBatteryClassId}|${VISUAL_EQUIPMENT_CATEGORIES.map((category) => `${category}=${slots[category].map((slot) => `${slot.equipmentId ?? "_"}:${slot.status}`).join(",")}`).join("|")}`;
  return Object.freeze({ shipClassId, signature, slots: Object.freeze(slots), mainGun: Object.freeze(mainGun),
    torpedo: Object.freeze(torpedo), antiAir: Object.freeze(antiAir), sideGun: Object.freeze(sideGun),
    depthCharge: Object.freeze(depthCharge), internalModules: Object.freeze(internalModules) });
}

export function slotsFromVisualPlan(plan: ResolvedLoadoutVisualPlan): InstalledEquipmentIds {
  return Object.fromEntries(VISUAL_EQUIPMENT_CATEGORIES.map((category) => [category,
    plan.slots[category].map((slot) => slot.equipmentId),
  ])) as unknown as InstalledEquipmentIds;
}
