import { SHIP_CLASS_IDS } from "../ships/classes";
import type { ControlCommand } from "../sim/types";
import type {
  DiscoveryProbe,
  DiscoveryProbePayload,
  InputFrame,
  InputFramePayload,
  JoinAccepted,
  JoinAcceptedPayload,
  JoinRejected,
  JoinRejectedPayload,
  JoinRequest,
  JoinRequestPayload,
  LanBuildDescriptor,
  LanMessage,
  LobbyPlayerPayload,
  LobbySnapshotPayload,
  LobbyUpdate,
  LobbyUpdatePayload,
  PeerDisconnected,
  PeerDisconnectedPayload,
  PlayerSnapshot,
  PlayerSnapshotPayload,
  ReadyRequest,
  ReadyRequestPayload,
  ReturnToLobby,
  ReturnToLobbyPayload,
  RoomAnnouncement,
  RoomAnnouncementPayload,
  StartMatch,
  StartMatchPayload,
} from "./protocol";

export const LAN_PROTOCOL_VERSION = 1 as const;
export const LAN_DISCOVERY_PORT = 47_777 as const;
export const LAN_GAME_PORTS = [
  47_778, 47_779, 47_780, 47_781, 47_782, 47_783, 47_784, 47_785, 47_786, 47_787, 47_788,
] as const;

export const LAN_BUILD_SLOT_KEYS = [
  "mainGun",
  "torpedo",
  "antiAir",
  "sideGun",
  "depthCharge",
  "magazine",
  "engine",
  "steering",
] as const;

export const LAN_ROOM_PHASES = [
  "advertising",
  "lobby",
  "starting",
  "in-match",
  "post-match",
  "closing",
] as const;

export const LAN_REJECTION_REASONS = [
  "room-full",
  "version-mismatch",
  "content-mismatch",
  "invalid-build",
  "invalid-request",
  "already-joined",
] as const;

export const LAN_DISCONNECT_REASONS = [
  "disconnected",
  "timeout",
  "kicked",
] as const;

export const LAN_DISCONNECT_FALLBACKS = [
  "lobby",
  "ai-control",
  "session-closed",
] as const;

export const LAN_RETURN_TO_LOBBY_REASONS = [
  "host-request",
  "guest-request",
  "match-ended",
  "disconnect",
] as const;

export const LAN_MESSAGE_TYPES = [
  "discovery-probe",
  "room-announcement",
  "join-request",
  "join-accepted",
  "join-rejected",
  "lobby-update",
  "ready-request",
  "start-match",
  "input-frame",
  "player-snapshot",
  "peer-disconnected",
  "return-to-lobby",
] as const;

const WEAPON_SLOTS = ["mainGun", "torpedo", "aircraft"] as const;
const DAMAGE_CONTROL_PRIORITIES = ["balanced", "fire", "flood", "module"] as const;
const AMMO_TYPES = ["he", "ap"] as const;
const TORPEDO_SPREAD_MODES = ["narrow", "wide"] as const;

const SHIP_CLASS_ID_SET = new Set<string>(SHIP_CLASS_IDS);
const GAME_PORT_SET = new Set<number>(LAN_GAME_PORTS);
const SLOT_KEY_SET = new Set<string>(LAN_BUILD_SLOT_KEYS);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(
  value: unknown,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (options.integer && !Number.isInteger(value)) return undefined;
  if (options.min !== undefined && value < options.min) return undefined;
  if (options.max !== undefined && value > options.max) return undefined;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readNonEmptyString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : undefined;
}

function readVec3(value: unknown): { x: number; y: number; z: number } | undefined {
  if (!isRecord(value)) return undefined;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const z = readFiniteNumber(value.z);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  return { x, y, z };
}

function readJsonRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? { ...value } : undefined;
}

function readJsonRecordArray(value: unknown, maxItems: number): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const sanitized: Record<string, unknown>[] = [];
  for (const entry of value) {
    const record = readJsonRecord(entry);
    if (!record) return undefined;
    sanitized.push(record);
  }
  return sanitized;
}

function readSlotArray(value: unknown, maxItems: number, maxItemLength: number): (string | null)[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const normalized: (string | null)[] = [];
  for (const entry of value) {
    if (entry === null) {
      normalized.push(null);
      continue;
    }
    const item = readNonEmptyString(entry, maxItemLength);
    if (!item) return undefined;
    normalized.push(item);
  }
  return normalized;
}

function readLanBuildDescriptor(value: unknown): LanBuildDescriptor | undefined {
  if (!isRecord(value)) return undefined;
  const buildId = readNonEmptyString(value.buildId, 64);
  const buildName = readNonEmptyString(value.buildName, 24);
  const shipClassId = readNonEmptyString(value.shipClassId, 32);
  if (!buildId || !buildName || !shipClassId || !SHIP_CLASS_ID_SET.has(shipClassId)) return undefined;
  if (!isRecord(value.slots)) return undefined;
  const slots = {} as LanBuildDescriptor["slots"];
  for (const key of LAN_BUILD_SLOT_KEYS) {
    const array = readSlotArray(value.slots[key], 16, 64);
    if (!array) return undefined;
    slots[key] = array;
  }
  for (const key of Object.keys(value.slots)) {
    if (!SLOT_KEY_SET.has(key)) return undefined;
  }
  return {
    buildId,
    buildName,
    shipClassId: shipClassId as LanBuildDescriptor["shipClassId"],
    slots,
  };
}

function readLobbyPlayer(value: unknown): LobbyPlayerPayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const commanderName = readNonEmptyString(value.commanderName, 32);
  const role = readEnum(value.role, ["host", "guest"] as const);
  const ready = readBoolean(value.ready);
  const connected = readBoolean(value.connected);
  if (!peerId || !commanderName || !role || ready === undefined || connected === undefined) return undefined;
  const build = value.build === undefined ? undefined : readLanBuildDescriptor(value.build);
  if (value.build !== undefined && !build) return undefined;
  return { peerId, commanderName, role, build, ready, connected };
}

function readLobbySnapshot(value: unknown): LobbySnapshotPayload | undefined {
  if (!isRecord(value)) return undefined;
  const phase = readEnum(value.phase, LAN_ROOM_PHASES);
  const roomName = readNonEmptyString(value.roomName, 48);
  const hostPeerId = readNonEmptyString(value.hostPeerId, 64);
  if (!phase || !roomName || !hostPeerId || !Array.isArray(value.players) || value.players.length < 1 || value.players.length > 2) {
    return undefined;
  }
  const players = value.players.map(readLobbyPlayer);
  if (players.some((entry) => !entry)) return undefined;
  return {
    phase,
    roomName,
    hostPeerId,
    players: players as LobbyPlayerPayload[],
  };
}

function readDiscoveryProbePayload(value: unknown): DiscoveryProbePayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const commanderName = readNonEmptyString(value.commanderName, 32);
  return peerId && commanderName ? { peerId, commanderName } : undefined;
}

function readRoomAnnouncementPayload(value: unknown): RoomAnnouncementPayload | undefined {
  if (!isRecord(value)) return undefined;
  const roomName = readNonEmptyString(value.roomName, 48);
  const hostName = readNonEmptyString(value.hostName, 32);
  const discoveryPort = readFiniteNumber(value.discoveryPort, { integer: true, min: LAN_DISCOVERY_PORT, max: LAN_DISCOVERY_PORT });
  const port = readFiniteNumber(value.port, { integer: true });
  const playerCount = readFiniteNumber(value.playerCount, { integer: true, min: 1, max: 2 });
  const capacity = readFiniteNumber(value.capacity, { integer: true, min: 2, max: 2 });
  const phase = readEnum(value.phase, LAN_ROOM_PHASES);
  if (!roomName || !hostName || discoveryPort !== LAN_DISCOVERY_PORT || port === undefined || !GAME_PORT_SET.has(port) || !phase) {
    return undefined;
  }
  if ((playerCount !== 1 && playerCount !== 2) || capacity !== 2) return undefined;
  return {
    roomName,
    hostName,
    discoveryPort: LAN_DISCOVERY_PORT,
    port: port as RoomAnnouncementPayload["port"],
    playerCount: playerCount as 1 | 2,
    capacity: 2,
    phase,
  };
}

function readJoinRequestPayload(value: unknown): JoinRequestPayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const commanderName = readNonEmptyString(value.commanderName, 32);
  const expectedGameVersion = readNonEmptyString(value.expectedGameVersion, 32);
  const expectedContentHash = readNonEmptyString(value.expectedContentHash, 128);
  if (!peerId || !commanderName || !expectedGameVersion || !expectedContentHash) return undefined;
  const build = value.build === undefined ? undefined : readLanBuildDescriptor(value.build);
  if (value.build !== undefined && !build) return undefined;
  return {
    peerId,
    commanderName,
    expectedGameVersion,
    expectedContentHash,
    build,
  };
}

function readJoinAcceptedPayload(value: unknown): JoinAcceptedPayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const lobby = readLobbySnapshot(value.lobby);
  return peerId && lobby && value.assignedRole === "guest"
    ? { peerId, assignedRole: "guest", lobby }
    : undefined;
}

function readJoinRejectedPayload(value: unknown): JoinRejectedPayload | undefined {
  if (!isRecord(value)) return undefined;
  const reason = readEnum(value.reason, LAN_REJECTION_REASONS);
  const detail = value.detail === undefined ? undefined : readNonEmptyString(value.detail, 96);
  if (!reason || (value.detail !== undefined && !detail)) return undefined;
  return { reason, detail };
}

function readLobbyUpdatePayload(value: unknown): LobbyUpdatePayload | undefined {
  if (!isRecord(value)) return undefined;
  const lobby = readLobbySnapshot(value.lobby);
  return lobby ? { lobby } : undefined;
}

function readReadyRequestPayload(value: unknown): ReadyRequestPayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const ready = readBoolean(value.ready);
  if (!peerId || ready === undefined) return undefined;
  const build = value.build === undefined ? undefined : readLanBuildDescriptor(value.build);
  if (value.build !== undefined && !build) return undefined;
  return { peerId, ready, build };
}

function readStartMatchPayload(value: unknown): StartMatchPayload | undefined {
  if (!isRecord(value)) return undefined;
  const seed = readFiniteNumber(value.seed, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const serverTick = readFiniteNumber(value.serverTick, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const hostShipId = readNonEmptyString(value.hostShipId, 64);
  const guestShipId = readNonEmptyString(value.guestShipId, 64);
  if (seed === undefined || serverTick === undefined || !hostShipId || !guestShipId) return undefined;
  return { seed, serverTick, hostShipId, guestShipId };
}

export function validateRemoteCommand(value: unknown): ControlCommand | undefined {
  if (!isRecord(value)) return undefined;
  const throttle = readFiniteNumber(value.throttle);
  const rudder = readFiniteNumber(value.rudder);
  const aimPoint = readVec3(value.aimPoint);
  const fire = readBoolean(value.fire);
  if (throttle === undefined || rudder === undefined || !aimPoint || fire === undefined) return undefined;

  const weaponSlot = value.weaponSlot === undefined ? undefined : readEnum(value.weaponSlot, WEAPON_SLOTS);
  const repairHull = value.repairHull === undefined ? undefined : readBoolean(value.repairHull);
  const damageControlPriority = value.damageControlPriority === undefined
    ? undefined
    : readEnum(value.damageControlPriority, DAMAGE_CONTROL_PRIORITIES);
  const ammoType = value.ammoType === undefined ? undefined : readEnum(value.ammoType, AMMO_TYPES);
  const torpedoSpread = value.torpedoSpread === undefined ? undefined : readEnum(value.torpedoSpread, TORPEDO_SPREAD_MODES);
  const activateSmoke = value.activateSmoke === undefined ? undefined : readBoolean(value.activateSmoke);
  const activateHydro = value.activateHydro === undefined ? undefined : readBoolean(value.activateHydro);
  const deployDepthCharge = value.deployDepthCharge === undefined ? undefined : readBoolean(value.deployDepthCharge);

  if (
    (value.weaponSlot !== undefined && !weaponSlot)
    || (value.repairHull !== undefined && repairHull === undefined)
    || (value.damageControlPriority !== undefined && !damageControlPriority)
    || (value.ammoType !== undefined && !ammoType)
    || (value.torpedoSpread !== undefined && !torpedoSpread)
    || (value.activateSmoke !== undefined && activateSmoke === undefined)
    || (value.activateHydro !== undefined && activateHydro === undefined)
    || (value.deployDepthCharge !== undefined && deployDepthCharge === undefined)
  ) {
    return undefined;
  }

  return {
    throttle: clamp(throttle, -1, 1),
    rudder: clamp(rudder, -1, 1),
    aimPoint,
    fire,
    ...(weaponSlot ? { weaponSlot } : {}),
    ...(repairHull !== undefined ? { repairHull } : {}),
    ...(damageControlPriority ? { damageControlPriority } : {}),
    ...(ammoType ? { ammoType } : {}),
    ...(torpedoSpread ? { torpedoSpread } : {}),
    ...(activateSmoke !== undefined ? { activateSmoke } : {}),
    ...(activateHydro !== undefined ? { activateHydro } : {}),
    ...(deployDepthCharge !== undefined ? { deployDepthCharge } : {}),
  };
}

function readInputFramePayload(value: unknown): InputFramePayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const inputSequence = readFiniteNumber(value.inputSequence, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const command = validateRemoteCommand(value.command);
  if (!peerId || inputSequence === undefined || !command) return undefined;
  return { peerId, inputSequence, command };
}

function readPlayerSnapshotPayload(value: unknown): PlayerSnapshotPayload | undefined {
  if (!isRecord(value)) return undefined;
  const controlledShipId = readNonEmptyString(value.controlledShipId, 64);
  const serverTick = readFiniteNumber(value.serverTick, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const lastProcessedInputSequence = readFiniteNumber(value.lastProcessedInputSequence, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const time = readFiniteNumber(value.time, { min: 0 });
  const self = readJsonRecord(value.self);
  const friendlies = readJsonRecordArray(value.friendlies, 32);
  const contacts = readJsonRecordArray(value.contacts, 128);
  const projectiles = readJsonRecordArray(value.projectiles, 256);
  const torpedoes = readJsonRecordArray(value.torpedoes, 128);
  const aircraft = readJsonRecordArray(value.aircraft, 128);
  const objective = readJsonRecord(value.objective);
  const events = readJsonRecordArray(value.events, 256);
  if (
    !controlledShipId
    || serverTick === undefined
    || lastProcessedInputSequence === undefined
    || time === undefined
    || !self
    || !friendlies
    || !contacts
    || !projectiles
    || !torpedoes
    || !aircraft
    || !objective
    || !events
  ) {
    return undefined;
  }
  return {
    controlledShipId,
    serverTick,
    lastProcessedInputSequence,
    time,
    self,
    friendlies,
    contacts,
    projectiles,
    torpedoes,
    aircraft,
    objective,
    events,
  };
}

function readPeerDisconnectedPayload(value: unknown): PeerDisconnectedPayload | undefined {
  if (!isRecord(value)) return undefined;
  const peerId = readNonEmptyString(value.peerId, 64);
  const reason = readEnum(value.reason, LAN_DISCONNECT_REASONS);
  const fallback = readEnum(value.fallback, LAN_DISCONNECT_FALLBACKS);
  return peerId && reason && fallback ? { peerId, reason, fallback } : undefined;
}

function readReturnToLobbyPayload(value: unknown): ReturnToLobbyPayload | undefined {
  if (!isRecord(value)) return undefined;
  const reason = readEnum(value.reason, LAN_RETURN_TO_LOBBY_REASONS);
  if (!reason) return undefined;
  const lobby = value.lobby === undefined ? undefined : readLobbySnapshot(value.lobby);
  if (value.lobby !== undefined && !lobby) return undefined;
  return { reason, lobby };
}

function readPayload(type: typeof LAN_MESSAGE_TYPES[number], payload: unknown): LanMessage["payload"] | undefined {
  switch (type) {
    case "discovery-probe":
      return readDiscoveryProbePayload(payload);
    case "room-announcement":
      return readRoomAnnouncementPayload(payload);
    case "join-request":
      return readJoinRequestPayload(payload);
    case "join-accepted":
      return readJoinAcceptedPayload(payload);
    case "join-rejected":
      return readJoinRejectedPayload(payload);
    case "lobby-update":
      return readLobbyUpdatePayload(payload);
    case "ready-request":
      return readReadyRequestPayload(payload);
    case "start-match":
      return readStartMatchPayload(payload);
    case "input-frame":
      return readInputFramePayload(payload);
    case "player-snapshot":
      return readPlayerSnapshotPayload(payload);
    case "peer-disconnected":
      return readPeerDisconnectedPayload(payload);
    case "return-to-lobby":
      return readReturnToLobbyPayload(payload);
  }
}

export function parseLanMessageValue(value: unknown): LanMessage | undefined {
  if (!isRecord(value)) return undefined;
  const protocolVersion = readFiniteNumber(value.protocolVersion, {
    integer: true,
    min: LAN_PROTOCOL_VERSION,
    max: LAN_PROTOCOL_VERSION,
  });
  const gameVersion = readNonEmptyString(value.gameVersion, 32);
  const contentHash = readNonEmptyString(value.contentHash, 128);
  const roomId = readNonEmptyString(value.roomId, 64);
  const sequence = readFiniteNumber(value.sequence, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const sentAt = readFiniteNumber(value.sentAt, { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  const type = readEnum(value.type, LAN_MESSAGE_TYPES);

  if (
    protocolVersion !== LAN_PROTOCOL_VERSION
    || !gameVersion
    || !contentHash
    || !roomId
    || sequence === undefined
    || sentAt === undefined
    || !type
  ) {
    return undefined;
  }

  const payload = readPayload(type, value.payload);
  if (!payload) return undefined;

  const envelope = {
    protocolVersion: LAN_PROTOCOL_VERSION,
    gameVersion,
    contentHash,
    roomId,
    sequence,
    sentAt,
    type,
    payload,
  };

  switch (type) {
    case "discovery-probe":
      return envelope as DiscoveryProbe;
    case "room-announcement":
      return envelope as RoomAnnouncement;
    case "join-request":
      return envelope as JoinRequest;
    case "join-accepted":
      return envelope as JoinAccepted;
    case "join-rejected":
      return envelope as JoinRejected;
    case "lobby-update":
      return envelope as LobbyUpdate;
    case "ready-request":
      return envelope as ReadyRequest;
    case "start-match":
      return envelope as StartMatch;
    case "input-frame":
      return envelope as InputFrame;
    case "player-snapshot":
      return envelope as PlayerSnapshot;
    case "peer-disconnected":
      return envelope as PeerDisconnected;
    case "return-to-lobby":
      return envelope as ReturnToLobby;
  }
}
