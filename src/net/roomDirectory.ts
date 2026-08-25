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
}

interface StoredRoom {
  room: DiscoveredRoom;
  order: number;
}

const PHASE_RANK: Record<DiscoveredRoom["phase"], number> = {
  lobby: 0,
  "in-match": 1,
};

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
  };
}

function freezeRoom(room: DiscoveredRoom): DiscoveredRoom {
  return Object.freeze(cloneRoom(room));
}

export class RoomDirectory {
  private readonly rooms = new Map<string, StoredRoom>();

  private nextOrder = 0;

  ingest(room: DiscoveredRoom): void {
    const previous = this.rooms.get(room.roomId);
    this.rooms.set(room.roomId, {
      room: cloneRoom(room),
      order: previous?.order ?? this.nextOrder++,
    });
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
