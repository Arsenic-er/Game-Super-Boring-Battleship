import type { EquipmentDefinition } from "../profile/equipmentCatalog";

export type EquipmentArtworkSize = "card" | "detail" | "result";

export function equipmentArtworkUrl(item: EquipmentDefinition): string {
  return `${import.meta.env.BASE_URL}${item.artwork}`;
}

export function equipmentArtworkMarkup(
  item: EquipmentDefinition,
  size: EquipmentArtworkSize = "card",
): string {
  return `<img class="equipment-art equipment-art-${size}" src="${equipmentArtworkUrl(item)}" alt="" aria-hidden="true" loading="lazy" data-equipment-art="${item.id}" />`;
}
