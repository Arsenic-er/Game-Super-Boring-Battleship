import { describe, expect, it } from "vitest";
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
    directory.ingest(first);

    first.roomName = "Mutated Outside";
    first.address = "10.0.0.99";

    directory.ingest(discoveredRoom({
      roomId: "room-1",
      roomName: "Bravo Room",
      hostName: "Updated Host",
      address: "192.168.1.42",
      port: 47_779,
      playerCount: 2,
      phase: "in-match",
      lastSeenAt: 2_000,
    }));

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
    directory.ingest(discoveredRoom({ roomId: "keep", lastSeenAt: 1_000 }));
    directory.ingest(discoveredRoom({ roomId: "drop", roomName: "Drop", lastSeenAt: 999 }));

    directory.expire(4_000);
    expect(directory.list().map((room) => room.roomId)).toEqual(["keep"]);

    directory.expire(4_001);
    expect(directory.list()).toEqual([]);
  });

  it("lists lobby rooms first, then room names alphabetically, keeping ties stable", () => {
    const directory = new RoomDirectory();
    directory.ingest(discoveredRoom({ roomId: "z-lobby", roomName: "Zulu", hostName: "Zed" }));
    directory.ingest(discoveredRoom({ roomId: "alpha-1", roomName: "Alpha", hostName: "Same Host" }));
    directory.ingest(discoveredRoom({ roomId: "alpha-2", roomName: "Alpha", hostName: "Same Host" }));
    directory.ingest(discoveredRoom({ roomId: "battle", roomName: "Alpha", hostName: "Battle Host", phase: "in-match", playerCount: 2 }));

    expect(directory.list().map((room) => room.roomId)).toEqual([
      "alpha-1",
      "alpha-2",
      "z-lobby",
      "battle",
    ]);
  });

  it("returns a frozen snapshot that cannot mutate internal state", () => {
    const directory = new RoomDirectory();
    directory.ingest(discoveredRoom());

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
