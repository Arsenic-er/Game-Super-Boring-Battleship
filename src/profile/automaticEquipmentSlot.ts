export interface AutomaticEquipmentSlot {
  slotIndex: number;
  action: "install" | "replace";
}

/** Preserve the established quick-equip policy: an already installed model can
 * be added to the first empty slot; a different model replaces slot zero.
 * Pure and inventory-independent so read-only previews use the same target.
 * Ownership and compatibility remain checked by the equip transaction. */
export function resolveAutomaticEquipmentSlot(
  slots: readonly (string | null)[],
  equipmentId: string,
): AutomaticEquipmentSlot | undefined {
  if (slots.length === 0) return undefined;
  const emptyIndex = slots.findIndex((id) => id === null);
  const slotIndex = slots.includes(equipmentId) && emptyIndex >= 0 ? emptyIndex : 0;
  return { slotIndex, action: slots[slotIndex] === null ? "install" : "replace" };
}
