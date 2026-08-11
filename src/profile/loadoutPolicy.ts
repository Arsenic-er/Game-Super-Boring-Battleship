import { SHIP_CLASS_SLOT_COUNTS, EQUIPMENT_CATALOG, equipmentFor, isEquipmentCompatible } from "./equipmentCatalog";
import type { EquipmentCategory, EquipmentDefinition, EquipmentRarity } from "./equipmentCatalog";
import { getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import type { LocalProfile, SlotLoadout } from "./localProfile";

const categories: EquipmentCategory[] = [
  "mainGun", "torpedo", "antiAir", "sideGun", "depthCharge",
  "magazine", "engine", "steering",
];
const weaponCategories = new Set<EquipmentCategory>([
  "mainGun", "torpedo", "antiAir", "sideGun", "depthCharge",
]);
const rarityRank: Record<EquipmentRarity, number> = {
  common: 0, purple: 1, gold: 2, redGold: 3,
};

export function minimumSeaReadySlotCounts(
  shipClassId: ShipClassId,
): Record<EquipmentCategory, number> {
  const shipClass = getShipClass(shipClassId);
  const slotCounts = SHIP_CLASS_SLOT_COUNTS[shipClassId];
  return Object.fromEntries(categories.map((category) => [
    category,
    weaponCategories.has(category)
      ? shipClass.starterSlots[category as keyof typeof shipClass.starterSlots]
      : slotCounts[category] > 0 ? 1 : 0,
  ])) as Record<EquipmentCategory, number>;
}

export function createMinimumSeaReadySlotLoadout(shipClassId: ShipClassId): SlotLoadout {
  const slotCounts = SHIP_CLASS_SLOT_COUNTS[shipClassId];
  const minimumCounts = minimumSeaReadySlotCounts(shipClassId);
  return Object.fromEntries(categories.map((category) => [
    category,
    Array.from({ length: slotCounts[category] }, (_, index) => (
      index < minimumCounts[category] ? equipmentFor(category, "common").id : null
    )),
  ])) as SlotLoadout;
}

function compareEquipment(left: EquipmentDefinition, right: EquipmentDefinition): number {
  return rarityRank[right.rarity] - rarityRank[left.rarity]
    || right.bonus - left.bonus
    || (left.drawback ?? 0) - (right.drawback ?? 0)
    || left.id.localeCompare(right.id);
}

export function optimizeOwnedSlotLoadout(
  profile: Readonly<LocalProfile>,
  shipClassId: ShipClassId = profile.shipClassId,
): { slots: SlotLoadout; changedSlots: number } {
  const installedOnOtherShips = new Map<string, number>();
  for (const [otherShipClassId, loadout] of Object.entries(profile.slotLoadoutsByShipClass)) {
    if (otherShipClassId === shipClassId) continue;
    for (const category of categories) {
      for (const itemId of loadout[category]) {
        if (itemId) installedOnOtherShips.set(itemId, (installedOnOtherShips.get(itemId) ?? 0) + 1);
      }
    }
  }

  const remaining = new Map<string, number>();
  for (const item of EQUIPMENT_CATALOG) {
    remaining.set(item.id, Math.max(0,
      (profile.inventory[item.id] ?? 0) - (installedOnOtherShips.get(item.id) ?? 0)));
  }

  const current = profile.slotLoadoutsByShipClass[shipClassId];
  const counts = SHIP_CLASS_SLOT_COUNTS[shipClassId];
  const slots = Object.fromEntries(categories.map((category) => {
    const candidates = EQUIPMENT_CATALOG
      .filter((item) => item.category === category && isEquipmentCompatible(item, shipClassId))
      .sort(compareEquipment);
    return [category, Array.from({ length: counts[category] }, () => {
      const selected = candidates.find((item) => (remaining.get(item.id) ?? 0) > 0);
      if (!selected) return null;
      remaining.set(selected.id, (remaining.get(selected.id) ?? 0) - 1);
      return selected.id;
    })];
  })) as SlotLoadout;

  let changedSlots = 0;
  for (const category of categories) {
    for (let index = 0; index < slots[category].length; index += 1) {
      if (slots[category][index] !== current[category][index]) changedSlots += 1;
    }
  }
  return { slots, changedSlots };
}
