import { describe, expect, it } from "vitest";
import type { ControlCommand } from "../src/sim/types";
import {
  LAN_CONTENT_HASH,
  LAN_FINGERPRINT_SOURCE,
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

const validAirMission = {
  squadronId: "air-squadron-01",
  kind: "patrolArea" as const,
  area: {
    center: { x: 400, y: 120, z: -250 },
    radius: 800,
  },
};

const validAirMissionKinds = [
  {
    label: "moveTo",
    mission: {
      squadronId: "air-squadron-move",
      kind: "moveTo" as const,
      area: { center: { x: 0, y: 180, z: -2_000 }, radius: 90 },
    },
  },
  {
    label: "patrolArea",
    mission: validAirMission,
  },
  {
    label: "recall",
    mission: {
      squadronId: "air-squadron-recall",
      kind: "recall" as const,
    },
  },
  {
    label: "defendShip",
    mission: {
      squadronId: "air-squadron-defend",
      kind: "defendShip" as const,
      targetIds: ["player"],
    },
  },
  {
    label: "strikeShip",
    mission: {
      squadronId: "air-squadron-strike",
      kind: "strikeShip" as const,
      targetId: "enemy-alpha",
    },
  },
  {
    label: "interceptSquadron",
    mission: {
      squadronId: "air-squadron-intercept",
      kind: "interceptSquadron" as const,
      targetIds: ["bogey-1", "bogey-2"],
    },
  },
] as const;

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

  it("rejects envelopes with unexpected own properties", () => {
    expect(parseLanMessage({
      ...validJoinRequest,
      unexpected: true,
    })).toBeUndefined();
  });

  it("rejects payloads with unexpected own properties", () => {
    expect(parseLanMessage({
      ...validJoinRequest,
      payload: {
        ...validJoinRequest.payload,
        unexpected: true,
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

  it("round-trips a validated single air mission", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      airMission: validAirMission,
    })).toEqual({
      ...validCommand,
      airMission: validAirMission,
    });
  });

  it("round-trips a validated air mission list", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      airMissions: [
        validAirMission,
        {
          squadronId: "air-squadron-02",
          kind: "recall",
        },
      ],
    })).toEqual({
      ...validCommand,
      airMissions: [
        validAirMission,
        {
          squadronId: "air-squadron-02",
          kind: "recall",
        },
      ],
    });
  });

  it.each(validAirMissionKinds)("accepts a semantically valid $label air mission", ({ mission }) => {
    expect(validateRemoteCommand({
      ...validCommand,
      airMission: mission,
    })).toEqual({
      ...validCommand,
      airMission: mission,
    });
  });

  it("rejects malformed or oversized air mission payloads", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      airMission: {
        ...validAirMission,
        area: {
          ...validAirMission.area,
          radius: Number.POSITIVE_INFINITY,
        },
      },
    })).toBeUndefined();

    expect(validateRemoteCommand({
      ...validCommand,
      airMissions: Array.from({ length: 17 }, (_, index) => ({
        squadronId: `air-${index}`,
        kind: "recall" as const,
      })),
    })).toBeUndefined();
  });

  it("rejects semantically invalid air mission leftovers", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      airMission: {
        squadronId: "air-squadron-patrol",
        kind: "patrolArea",
        targetId: "enemy-alpha",
        area: { center: { x: 10, y: 180, z: 20 }, radius: 500 },
      },
    })).toBeUndefined();

    expect(validateRemoteCommand({
      ...validCommand,
      airMission: {
        squadronId: "air-squadron-strike",
        kind: "strikeShip",
        targetId: "enemy-alpha",
        area: { center: { x: 10, y: 180, z: 20 }, radius: 500 },
      },
    })).toBeUndefined();

    expect(validateRemoteCommand({
      ...validCommand,
      airMission: {
        squadronId: "air-squadron-defend",
        kind: "defendShip",
        targetIds: ["player"],
        area: { center: { x: 10, y: 180, z: 20 }, radius: 500 },
      },
    })).toBeUndefined();
  });

  it("rejects forged perception and aiDecision telemetry", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      perception: {
        mode: "tracking",
        confidence: 1,
      },
    })).toBeUndefined();

    expect(validateRemoteCommand({
      ...validCommand,
      aiDecision: {
        role: "escort",
        phase: "engaging",
        desiredHeading: 0.4,
        throttle: 1,
        fireIntent: true,
      },
    })).toBeUndefined();
  });

  it("rejects unexpected own properties on commands and nested objects", () => {
    expect(validateRemoteCommand({
      ...validCommand,
      unexpected: true,
    })).toBeUndefined();

    expect(validateRemoteCommand({
      ...validCommand,
      aimPoint: {
        ...validCommand.aimPoint,
        unexpected: true,
      },
    })).toBeUndefined();

    expect(validateRemoteCommand({
      ...validCommand,
      airMission: {
        ...validAirMission,
        unexpected: true,
      },
    })).toBeUndefined();
  });
});

describe("network fingerprint", () => {
  it("uses a stable LAN hash format", () => {
    expect(LAN_CONTENT_HASH).toMatch(/^lan-1-[a-z0-9]+$/);
  });

  it("includes protocol-visible catalog and slot schema details in the canonical source", () => {
    expect(LAN_FINGERPRINT_SOURCE).toContain("mainGun-common");
    expect(LAN_FINGERPRINT_SOURCE).toContain("\"fletcher\"");
    expect(LAN_FINGERPRINT_SOURCE).toContain("\"mainGun\":5");
    expect(LAN_FINGERPRINT_SOURCE).toContain("\"starterSlots\"");
    expect(LAN_FINGERPRINT_SOURCE).toContain("\"minimumSeaReadySlotCounts\"");
  });
});
