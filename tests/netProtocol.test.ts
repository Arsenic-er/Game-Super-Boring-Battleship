import { describe, expect, it } from "vitest";
import type { ControlCommand } from "../src/sim/types";
import {
  LAN_CONTENT_HASH,
  LAN_GAME_VERSION,
} from "../src/net/networkFingerprint";
import {
  LAN_DISCOVERY_PORT,
  LAN_GAME_PORTS,
  LAN_PROTOCOL_VERSION,
  type JoinRequest,
  type RoomAnnouncement,
  encodeLanMessage,
  parseLanMessage,
  validateRemoteCommand,
} from "../src/net/protocol";

const validBuild = {
  buildId: "standard-fletcher",
  buildName: "Fletcher Standard",
  shipClassId: "fletcher" as const,
  slots: {
    mainGun: ["mainGun-common", "mainGun-common", null, null, null],
    torpedo: ["torpedo-common", null],
    antiAir: ["antiAir-common", null, null, null],
    sideGun: [],
    depthCharge: ["depthCharge-common", null],
    magazine: ["magazine-common"],
    engine: ["engine-common"],
    steering: ["steering-common"],
  },
};

const validJoinRequest: JoinRequest = {
  protocolVersion: LAN_PROTOCOL_VERSION,
  gameVersion: LAN_GAME_VERSION,
  contentHash: LAN_CONTENT_HASH,
  roomId: "room-atoll-01",
  sequence: 3,
  sentAt: 1_725_000_000_123,
  type: "join-request",
  payload: {
    peerId: "peer-guest-01",
    commanderName: "Guest Commander",
    expectedGameVersion: LAN_GAME_VERSION,
    expectedContentHash: LAN_CONTENT_HASH,
    build: validBuild,
  },
};

const validRoomAnnouncement: RoomAnnouncement = {
  protocolVersion: LAN_PROTOCOL_VERSION,
  gameVersion: LAN_GAME_VERSION,
  contentHash: LAN_CONTENT_HASH,
  roomId: "room-atoll-01",
  sequence: 1,
  sentAt: 1_725_000_000_000,
  type: "room-announcement",
  payload: {
    roomName: "Atoll Patrol",
    hostName: "Host Admiral",
    discoveryPort: LAN_DISCOVERY_PORT,
    port: LAN_GAME_PORTS[0],
    playerCount: 1,
    capacity: 2,
    phase: "lobby",
  },
};

const validCommand: ControlCommand = {
  throttle: 0.4,
  rudder: -0.3,
  aimPoint: { x: 120, y: 0, z: -80 },
  fire: true,
  weaponSlot: "torpedo",
  repairHull: false,
  damageControlPriority: "balanced",
  ammoType: "he",
  torpedoSpread: "narrow",
  activateSmoke: false,
  activateHydro: false,
  deployDepthCharge: false,
};

describe("LAN protocol", () => {
  it("round-trips a valid join request", () => {
    const encoded = encodeLanMessage(validJoinRequest);

    expect(parseLanMessage(JSON.parse(encoded))).toEqual(validJoinRequest);
  });

  it("rejects an envelope with the wrong protocol version", () => {
    expect(parseLanMessage({
      ...validJoinRequest,
      protocolVersion: 2,
    })).toBeUndefined();
  });

  it("rejects an oversized encoded payload", () => {
    expect(() => encodeLanMessage(validJoinRequest, 8)).toThrow(/message-too-large/);
  });

  it("rejects stale negative sequence numbers", () => {
    expect(parseLanMessage({
      ...validJoinRequest,
      sequence: -1,
    })).toBeUndefined();
  });

  it("rejects a room announcement whose websocket port is outside the allow-list", () => {
    expect(parseLanMessage({
      ...validRoomAnnouncement,
      payload: {
        ...validRoomAnnouncement.payload,
        port: 47_900,
      },
    })).toBeUndefined();
  });
});

describe("remote control command validation", () => {
  it("accepts a well-formed remote command", () => {
    expect(validateRemoteCommand(validCommand)).toEqual(validCommand);
  });

  it("clamps throttle and rudder into the safe range", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      throttle: 7,
      rudder: -5,
    })).toEqual({
      ...validCommand,
      throttle: 1,
      rudder: -1,
    });
  });

  it("rejects non-finite aim coordinates", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      aimPoint: { x: Number.NaN, y: 0, z: 0 },
    })).toBeUndefined();
  });

  it("rejects unknown enum values", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      ammoType: "sap",
    })).toBeUndefined();
  });
});
