import { LAN_GAME_PORTS } from "./protocol";

export interface DiscoveredRoom {
  roomId: string;
  roomName: string;
  hostName: string;
  address: string;
  port: number;
  playerCount: 1 | 2;
  capacity: 2;
  phase: "lobby" | "in-match";
  lastSeenAt: number;
  gameVersion: string;
  contentHash: string;
}

interface StoredRoom {
  room: DiscoveredRoom;
  order: number;
}

const PHASE_RANK: Record<DiscoveredRoom["phase"], number> = {
  lobby: 0,
  "in-match": 1,
};

const PORT_SET = new Set<number>(LAN_GAME_PORTS);

function hasBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isCanonicalIpv4Octet(value: string): boolean {
  if (value === "0") return true;
  if (!/^[1-9]\d{0,2}$/.test(value)) return false;
  const number = Number(value);
  return Number.isInteger(number) && number <= 255;
}

function isIpv4Literal(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 7 || value.length > 15) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => isCanonicalIpv4Octet(part));
}

function isDiscoveredRoom(room: DiscoveredRoom): boolean {
  return hasBoundedText(room.roomId, 64)
    && hasBoundedText(room.roomName, 48)
    && hasBoundedText(room.hostName, 32)
    && isIpv4Literal(room.address)
    && Number.isInteger(room.port)
    && PORT_SET.has(room.port)
    && (room.playerCount === 1 || room.playerCount === 2)
    && room.capacity === 2
    && (room.phase === "lobby" || room.phase === "in-match")
    && typeof room.lastSeenAt === "number"
    && Number.isFinite(room.lastSeenAt)
    && room.lastSeenAt >= 0
    && hasBoundedText(room.gameVersion, 32)
    && hasBoundedText(room.contentHash, 128);
}

function cloneRoom(room: DiscoveredRoom): DiscoveredRoom {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    hostName: room.hostName,
    address: room.address,
    port: room.port,
    playerCount: room.playerCount,
    capacity: 2,
    phase: room.phase,
    lastSeenAt: room.lastSeenAt,
    gameVersion: room.gameVersion,
    contentHash: room.contentHash,
  };
}

function freezeRoom(room: DiscoveredRoom): DiscoveredRoom {
  return Object.freeze(cloneRoom(room));
}

export class RoomDirectory {
  private readonly rooms = new Map<string, StoredRoom>();

  private nextOrder = 0;

  ingest(room: DiscoveredRoom): boolean {
    if (!isDiscoveredRoom(room)) return false;
    const previous = this.rooms.get(room.roomId);
    this.rooms.set(room.roomId, {
      room: cloneRoom(room),
      order: previous?.order ?? this.nextOrder++,
    });
    return true;
  }

  expire(now: number, maxAgeMs: number = 3_000): void {
    for (const [roomId, entry] of this.rooms) {
      if (now - entry.room.lastSeenAt > maxAgeMs) this.rooms.delete(roomId);
    }
  }

  list(): readonly DiscoveredRoom[] {
    const rooms = [...this.rooms.values()]
      .sort((left, right) => PHASE_RANK[left.room.phase] - PHASE_RANK[right.room.phase]
        || left.room.roomName.localeCompare(right.room.roomName)
        || left.room.hostName.localeCompare(right.room.hostName)
        || left.order - right.order)
      .map(({ room }) => freezeRoom(room));
    return Object.freeze(rooms);
  }
}
