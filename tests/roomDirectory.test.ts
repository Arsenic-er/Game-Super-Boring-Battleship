import { describe, expect, it } from "vitest";
import { LAN_GAME_PORTS } from "../src/net/protocol";
import { RoomDirectory, type DiscoveredRoom } from "../src/net/roomDirectory";

function discoveredRoom(overrides: Partial<DiscoveredRoom> = {}): DiscoveredRoom {
  return {
    roomId: "room-1",
    roomName: "Alpha Room",
    hostName: "Host Admiral",
    address: "192.168.1.10",
    port: 47_778,
    playerCount: 1,
    capacity: 2,
    phase: "lobby",
    lastSeenAt: 1_000,
    ...overrides,
  };
}

describe("RoomDirectory", () => {
  it("de-duplicates by room id while cloning caller input", () => {
    const directory = new RoomDirectory();
    const first = discoveredRoom();
    expect(directory.ingest(first)).toBe(true);

    first.roomName = "Mutated Outside";
    first.address = "10.0.0.99";

    expect(directory.ingest(discoveredRoom({
      roomId: "room-1",
      roomName: "Bravo Room",
      hostName: "Updated Host",
      address: "192.168.1.42",
      port: 47_779,
      playerCount: 2,
      phase: "in-match",
      lastSeenAt: 2_000,
    }))).toBe(true);

    expect(directory.list()).toEqual([
      discoveredRoom({
        roomId: "room-1",
        roomName: "Bravo Room",
        hostName: "Updated Host",
        address: "192.168.1.42",
        port: 47_779,
        playerCount: 2,
        phase: "in-match",
        lastSeenAt: 2_000,
      }),
    ]);
  });

  it("expires entries older than three seconds but keeps the boundary timestamp", () => {
    const directory = new RoomDirectory();
    expect(directory.ingest(discoveredRoom({ roomId: "keep", lastSeenAt: 1_000 }))).toBe(true);
    expect(directory.ingest(discoveredRoom({ roomId: "drop", roomName: "Drop", lastSeenAt: 999 }))).toBe(true);

    directory.expire(4_000);
    expect(directory.list().map((room) => room.roomId)).toEqual(["keep"]);

    directory.expire(4_001);
    expect(directory.list()).toEqual([]);
  });

  it("lists lobby rooms first, then room names alphabetically, keeping ties stable", () => {
    const directory = new RoomDirectory();
    expect(directory.ingest(discoveredRoom({ roomId: "z-lobby", roomName: "Zulu", hostName: "Zed" }))).toBe(true);
    expect(directory.ingest(discoveredRoom({ roomId: "alpha-1", roomName: "Alpha", hostName: "Same Host" }))).toBe(true);
    expect(directory.ingest(discoveredRoom({ roomId: "alpha-2", roomName: "Alpha", hostName: "Same Host" }))).toBe(true);
    expect(directory.ingest(discoveredRoom({ roomId: "battle", roomName: "Alpha", hostName: "Battle Host", phase: "in-match", playerCount: 2 }))).toBe(true);

    expect(directory.list().map((room) => room.roomId)).toEqual([
      "alpha-1",
      "alpha-2",
      "z-lobby",
      "battle",
    ]);
  });

  it("rejects invalid room announcements before they reach the directory", () => {
    const invalidCases: Array<{
      label: string;
      room: DiscoveredRoom;
    }> = [
      { label: "hostname", room: discoveredRoom({ address: "localhost" }) },
      { label: "ipv6", room: discoveredRoom({ address: "::1" as unknown as DiscoveredRoom["address"] }) },
      { label: "port-too-large", room: discoveredRoom({ port: 99_999 as unknown as DiscoveredRoom["port"] }) },
      { label: "port-not-allow-listed", room: discoveredRoom({ port: 48_000 as unknown as DiscoveredRoom["port"] }) },
      { label: "player-count-zero", room: discoveredRoom({ playerCount: 0 as unknown as DiscoveredRoom["playerCount"] }) },
      { label: "player-count-three", room: discoveredRoom({ playerCount: 3 as unknown as DiscoveredRoom["playerCount"] }) },
      { label: "capacity-not-two", room: discoveredRoom({ capacity: 1 as unknown as DiscoveredRoom["capacity"] }) },
      { label: "phase-invalid", room: discoveredRoom({ phase: "advertising" as unknown as DiscoveredRoom["phase"] }) },
      { label: "empty-room-id", room: discoveredRoom({ roomId: "" }) },
      { label: "long-room-id", room: discoveredRoom({ roomId: "r".repeat(65) }) },
      { label: "empty-room-name", room: discoveredRoom({ roomName: "" }) },
      { label: "long-room-name", room: discoveredRoom({ roomName: "n".repeat(49) }) },
      { label: "empty-host-name", room: discoveredRoom({ hostName: "" }) },
      { label: "long-host-name", room: discoveredRoom({ hostName: "h".repeat(33) }) },
      { label: "negative-last-seen", room: discoveredRoom({ lastSeenAt: -1 }) },
      { label: "nan-last-seen", room: discoveredRoom({ lastSeenAt: Number.NaN }) },
    ];

    expect(LAN_GAME_PORTS).toContain(47_778);
    expect(LAN_GAME_PORTS).not.toContain(48_000);

    for (const { label, room } of invalidCases) {
      const directory = new RoomDirectory();
      expect(directory.ingest(room), label).toBe(false);
      expect(directory.list(), label).toEqual([]);
    }

    const valid = new RoomDirectory();
    expect(valid.ingest(discoveredRoom({ address: "127.0.0.1" }))).toBe(true);
    expect(valid.ingest(discoveredRoom({ roomId: "private-1", address: "10.0.0.8", port: LAN_GAME_PORTS[1] }))).toBe(true);
    expect(valid.ingest(discoveredRoom({ roomId: "private-2", address: "192.168.1.77", port: LAN_GAME_PORTS[2] }))).toBe(true);
    expect(valid.list().map((room) => room.roomId)).toEqual(["room-1", "private-1", "private-2"]);
  });

  it("returns a frozen snapshot that cannot mutate internal state", () => {
    const directory = new RoomDirectory();
    expect(directory.ingest(discoveredRoom())).toBe(true);

    const snapshot = directory.list();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0]!)).toBe(true);
    expect(() => {
      (snapshot as DiscoveredRoom[]).push(discoveredRoom({ roomId: "room-2" }));
    }).toThrow();
    expect(() => {
      (snapshot[0] as DiscoveredRoom).roomName = "Tampered";
    }).toThrow();
    expect(directory.list()[0]?.roomName).toBe("Alpha Room");
  });
});
