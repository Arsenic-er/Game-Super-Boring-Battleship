import packageJson from "../../package.json";
import { CATEGORY_META } from "../profile/equipmentCatalog";
import { SHIP_CLASS_IDS } from "../ships/classes";
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

const fingerprintSource = JSON.stringify({
  protocolVersion: LAN_PROTOCOL_VERSION,
  gameVersion: LAN_GAME_VERSION,
  messageTypes: LAN_MESSAGE_TYPES,
  roomPhases: LAN_ROOM_PHASES,
  fleetSizes: FLEET_SIZES,
  weatherIds: WEATHER_IDS,
  shipClassIds: SHIP_CLASS_IDS,
  buildSlotKeys: LAN_BUILD_SLOT_KEYS,
  catalogSlotKeys: Object.keys(CATEGORY_META),
  schemaRevision: 1,
});

export const LAN_CONTENT_HASH = `lan-${LAN_PROTOCOL_VERSION}-${fnv1a32(fingerprintSource)}`;
