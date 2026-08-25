import packageJson from "../../package.json";
import { EQUIPMENT_CATALOG } from "../profile/equipmentCatalog";
import { minimumSeaReadySlotCounts } from "../profile/loadoutPolicy";
import { SHIP_CLASSES, SHIP_CLASS_IDS } from "../ships/classes";
import { FLEET_SIZES } from "../sim/battleSetup";
import { WEATHER_IDS } from "../sim/weather";
import {
  LAN_BUILD_SLOT_KEYS,
  LAN_MESSAGE_TYPES,
  LAN_PROTOCOL_VERSION,
  LAN_ROOM_PHASES,
} from "./messageValidation";

export const LAN_GAME_VERSION = packageJson.version;

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const fingerprintInput = {
  protocolVersion: LAN_PROTOCOL_VERSION,
  gameVersion: LAN_GAME_VERSION,
  messageTypes: LAN_MESSAGE_TYPES,
  roomPhases: LAN_ROOM_PHASES,
  fleetSizes: FLEET_SIZES,
  weatherIds: WEATHER_IDS,
  buildSlotKeys: LAN_BUILD_SLOT_KEYS,
  equipmentCatalog: [...EQUIPMENT_CATALOG]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => ({
      id: item.id,
      category: item.category,
      rarity: item.rarity,
      compatibleHulls: [...item.compatibleHulls].sort(),
      mainGunId: item.mainGunId ?? null,
      torpedoId: item.torpedoId ?? null,
      secondaryGunId: item.secondaryGunId ?? null,
      bonus: item.bonus,
      drawback: item.drawback ?? null,
      researchCost: item.researchCost,
      purchaseCost: item.purchaseCost,
      sellCredits: item.sellCredits,
      salvageParts: item.salvageParts,
      availableInSupply: item.availableInSupply ?? false,
    })),
  shipClasses: SHIP_CLASS_IDS
    .map((shipClassId) => SHIP_CLASSES[shipClassId])
    .map((shipClass) => ({
      id: shipClass.id,
      hullId: shipClass.hullId,
      torpedoTubesPerLauncher: shipClass.torpedoTubesPerLauncher,
      torpedoBroadsideLaunchers: shipClass.torpedoBroadsideLaunchers,
      slotCounts: shipClass.slotCounts,
      starterSlots: shipClass.starterSlots,
      minimumSeaReadySlotCounts: minimumSeaReadySlotCounts(shipClass.id),
    })),
  schemaRevision: 1,
};

export const LAN_FINGERPRINT_SOURCE = JSON.stringify(fingerprintInput);

export const LAN_CONTENT_HASH = `lan-${LAN_PROTOCOL_VERSION}-${fnv1a32(LAN_FINGERPRINT_SOURCE)}`;
