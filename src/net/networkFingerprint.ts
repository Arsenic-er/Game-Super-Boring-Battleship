import packageJson from "../../package.json";
import { EQUIPMENT_CATALOG } from "../profile/equipmentCatalog";
import { minimumSeaReadySlotCounts } from "../profile/loadoutPolicy";
import { SHIP_CLASSES, SHIP_CLASS_IDS } from "../ships/classes";
import { SHIP_ARMOR_PROFILES } from "../ships/armorProfiles";
import { MAIN_GUNS } from "../ships/components";
import { HULLS } from "../ships/hulls";
import {
  HISTORICAL_MAIN_BATTERIES,
  MAIN_BATTERY_MAXIMUM_RANGE_METERS,
} from "../ships/mainBatteries";
import { SECONDARY_GUNS } from "../ships/secondaryGuns";
import { TORPEDO_DEFINITIONS } from "../ships/torpedoes";
import { AIR_FLIGHT_PROFILE } from "../sim/airFlightModel";
import {
  AIR_COMBAT,
  AIR_NAVIGATION,
  AIR_OPERATION_TIMING,
  AIR_SQUADRON_LOADOUT,
} from "../sim/airOperations";
import { FLEET_SIZES } from "../sim/battleSetup";
import * as SIMULATION_CONFIG from "../sim/config";
import { AIR_CONTACT_VALID_SECONDS } from "../sim/simulation";
import { WEATHER_IDS, WEATHER_PRESETS } from "../sim/weather";
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

function sortedValues<T extends { id: string }>(catalog: Record<string, T>): T[] {
  return Object.values(catalog).sort((left, right) => left.id.localeCompare(right.id));
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
  shipClasses: SHIP_CLASS_IDS.map((shipClassId) => ({
    ...SHIP_CLASSES[shipClassId],
    minimumSeaReadySlotCounts: minimumSeaReadySlotCounts(shipClassId),
  })),
  shipArmorProfiles: SHIP_CLASS_IDS.map((shipClassId) => ({
    shipClassId,
    profile: SHIP_ARMOR_PROFILES[shipClassId],
  })),
  weatherPresets: WEATHER_IDS.map((weatherId) => WEATHER_PRESETS[weatherId]),
  simulationConfig: SIMULATION_CONFIG,
  airFlightProfile: AIR_FLIGHT_PROFILE,
  airOperationRules: {
    timing: AIR_OPERATION_TIMING,
    navigation: AIR_NAVIGATION,
    squadronLoadout: AIR_SQUADRON_LOADOUT,
    combat: AIR_COMBAT,
    contactValidSeconds: AIR_CONTACT_VALID_SECONDS,
  },
  hulls: sortedValues(HULLS),
  mainGuns: sortedValues(MAIN_GUNS),
  torpedoDefinitions: sortedValues(TORPEDO_DEFINITIONS),
  secondaryGuns: sortedValues(SECONDARY_GUNS),
  historicalMainBatteries: Object.entries(HISTORICAL_MAIN_BATTERIES)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([shipClassId, definition]) => ({ shipClassId, definition })),
  mainBatteryMaximumRanges: SHIP_CLASS_IDS.map((shipClassId) => ({
    shipClassId,
    maximumRangeMeters: MAIN_BATTERY_MAXIMUM_RANGE_METERS[shipClassId],
  })),
  clientReconstructionSchemaRevision: 1,
  loadoutConversionSchemaRevision: 1,
  schemaRevision: 3,
};

export const LAN_FINGERPRINT_SOURCE = JSON.stringify(fingerprintInput);

export function computeLanContentHash(input: unknown): string {
  return `lan-${LAN_PROTOCOL_VERSION}-${fnv1a32(JSON.stringify(input))}`;
}

export const LAN_CONTENT_HASH = computeLanContentHash(fingerprintInput);
