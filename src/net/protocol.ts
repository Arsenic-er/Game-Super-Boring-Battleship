import type { ShipClassId } from "../ships/classes";
import type { BattleEndReason, BattleStatus, ControlCommand } from "../sim/types";
import {
  LAN_BUILD_SLOT_KEYS,
  LAN_DISCOVERY_PORT,
  LAN_GAME_PORTS,
  LAN_MESSAGE_TYPES,
  LAN_PROTOCOL_VERSION,
  LAN_RETURN_TO_LOBBY_REASONS,
  LAN_REJECTION_REASONS,
  LAN_ROOM_PHASES,
  LAN_DISCONNECT_FALLBACKS,
  LAN_DISCONNECT_REASONS,
  parseLanMessageValue,
  validateRemoteCommand,
} from "./messageValidation";

export { LAN_PROTOCOL_VERSION, LAN_DISCOVERY_PORT, LAN_GAME_PORTS, validateRemoteCommand };

export type LanBuildSlotKey = typeof LAN_BUILD_SLOT_KEYS[number];
export type LanGamePort = typeof LAN_GAME_PORTS[number];
export type LanRoomPhase = typeof LAN_ROOM_PHASES[number];
export type LanMessageType = typeof LAN_MESSAGE_TYPES[number];
export type LanJoinRejectedReason = typeof LAN_REJECTION_REASONS[number];
export type LanPeerDisconnectedReason = typeof LAN_DISCONNECT_REASONS[number];
export type LanDisconnectFallback = typeof LAN_DISCONNECT_FALLBACKS[number];
export type LanReturnToLobbyReason = typeof LAN_RETURN_TO_LOBBY_REASONS[number];

export interface LanBuildDescriptor {
  buildId: string;
  buildName: string;
  shipClassId: ShipClassId;
  slots: Record<LanBuildSlotKey, (string | null)[]>;
}

export interface LobbyPlayerPayload {
  peerId: string;
  commanderName: string;
  role: "host" | "guest";
  build?: LanBuildDescriptor;
  ready: boolean;
  connected: boolean;
}

export interface LobbySnapshotPayload {
  phase: LanRoomPhase;
  roomName: string;
  hostPeerId: string;
  players: LobbyPlayerPayload[];
}

export interface DiscoveryProbePayload {
  peerId: string;
  commanderName: string;
}

export interface RoomAnnouncementPayload {
  roomName: string;
  hostName: string;
  discoveryPort: typeof LAN_DISCOVERY_PORT;
  port: LanGamePort;
  playerCount: 1 | 2;
  capacity: 2;
  phase: LanRoomPhase;
}

export interface JoinRequestPayload {
  peerId: string;
  commanderName: string;
  expectedGameVersion: string;
  expectedContentHash: string;
  build?: LanBuildDescriptor;
}

export interface JoinAcceptedPayload {
  peerId: string;
  assignedRole: "guest";
  lobby: LobbySnapshotPayload;
}

export interface JoinRejectedPayload {
  reason: LanJoinRejectedReason;
  detail?: string;
}

export interface LobbyUpdatePayload {
  lobby: LobbySnapshotPayload;
}

export interface ReadyRequestPayload {
  peerId: string;
  ready: boolean;
  build?: LanBuildDescriptor;
}

export interface StartMatchPayload {
  seed: number;
  serverTick: number;
  hostShipId: string;
  guestShipId: string;
}

export interface InputFramePayload {
  peerId: string;
  inputSequence: number;
  command: ControlCommand;
}

export interface PlayerSnapshotPayload {
  controlledShipId: string;
  serverTick: number;
  lastProcessedInputSequence: number;
  time: number;
  status?: BattleStatus;
  endReason?: BattleEndReason;
  self: Record<string, unknown>;
  friendlies: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  projectiles: Record<string, unknown>[];
  torpedoes: Record<string, unknown>[];
  aircraft: Record<string, unknown>[];
  objective: Record<string, unknown>;
  events: Record<string, unknown>[];
}

export interface PeerDisconnectedPayload {
  peerId: string;
  reason: LanPeerDisconnectedReason;
  fallback: LanDisconnectFallback;
}

export interface ReturnToLobbyPayload {
  reason: LanReturnToLobbyReason;
  lobby?: LobbySnapshotPayload;
}

export interface LanEnvelope<T extends LanMessageType, P> {
  protocolVersion: 1;
  gameVersion: string;
  contentHash: string;
  roomId: string;
  sequence: number;
  sentAt: number;
  type: T;
  payload: P;
}

export type DiscoveryProbe = LanEnvelope<"discovery-probe", DiscoveryProbePayload>;
export type RoomAnnouncement = LanEnvelope<"room-announcement", RoomAnnouncementPayload>;
export type JoinRequest = LanEnvelope<"join-request", JoinRequestPayload>;
export type JoinAccepted = LanEnvelope<"join-accepted", JoinAcceptedPayload>;
export type JoinRejected = LanEnvelope<"join-rejected", JoinRejectedPayload>;
export type LobbyUpdate = LanEnvelope<"lobby-update", LobbyUpdatePayload>;
export type ReadyRequest = LanEnvelope<"ready-request", ReadyRequestPayload>;
export type StartMatch = LanEnvelope<"start-match", StartMatchPayload>;
export type InputFrame = LanEnvelope<"input-frame", InputFramePayload>;
export type PlayerSnapshot = LanEnvelope<"player-snapshot", PlayerSnapshotPayload>;
export type PeerDisconnected = LanEnvelope<"peer-disconnected", PeerDisconnectedPayload>;
export type ReturnToLobby = LanEnvelope<"return-to-lobby", ReturnToLobbyPayload>;

export type LanMessage =
  | DiscoveryProbe
  | RoomAnnouncement
  | JoinRequest
  | JoinAccepted
  | JoinRejected
  | LobbyUpdate
  | ReadyRequest
  | StartMatch
  | InputFrame
  | PlayerSnapshot
  | PeerDisconnected
  | ReturnToLobby;

export function parseLanMessage(value: unknown): LanMessage | undefined {
  return parseLanMessageValue(value);
}

export function encodeLanMessage(message: LanMessage, maxBytes: number = 64 * 1024): string {
  const normalized = parseLanMessage(message);
  if (!normalized) throw new Error("invalid-message");
  const encoded = JSON.stringify(normalized);
  if (new TextEncoder().encode(encoded).length > maxBytes) {
    throw new Error(`message-too-large:${maxBytes}`);
  }
  return encoded;
}
