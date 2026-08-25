import { describe, expect, it } from "vitest";
import type { ControlCommand } from "../src/sim/types";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import { ClientBattleSession } from "../src/net/clientBattleSession";
import type { PlayerSnapshotPayload } from "../src/net/protocol";

function baseCommand(): ControlCommand {
  return {
    throttle: 0.5,
    rudder: -0.25,
    aimPoint: { x: 300, y: 0, z: 1_200 },
    fire: false,
    weaponSlot: "mainGun",
    torpedoSpread: "narrow",
    ammoType: "he",
    activateSmoke: false,
    activateHydro: false,
    deployDepthCharge: false,
    repairHull: false,
    damageControlPriority: "balanced",
  };
}

function snapshot(overrides: Partial<PlayerSnapshotPayload> = {}): PlayerSnapshotPayload {
  return {
    controlledShipId: "guest-ship",
    serverTick: 1,
    lastProcessedInputSequence: 0,
    time: 0,
    self: {
      id: "guest-ship",
      team: "player",
      shipClassId: "fletcher",
      position: { x: 0, y: 0, z: 0 },
      heading: 350 * Math.PI / 180,
      speedKnots: 10,
      throttle: 0,
      hull: 900,
      maxHull: 1_000,
      reloadRemaining: 0,
      torpedoReloadRemaining: 0,
      smokeCharges: 2,
      hydroCharges: 2,
    },
    friendlies: [
      {
        id: "ally-1",
        shipClassId: "cleveland",
        position: { x: -120, y: 0, z: -80 },
        heading: Math.PI / 3,
        speedKnots: 18,
        hullRatio: 0.8,
      },
    ],
    contacts: [
      {
        id: "contact-1",
        team: "enemy",
        observedAt: 0,
        position: { x: 600, y: 0, z: 900 },
        heading: Math.PI / 2,
        speedKnots: 22,
        rangeMeters: 1_200,
        confidence: 0.7,
        estimatedHullRatio: 0.65,
      },
    ],
    projectiles: [],
    torpedoes: [],
    aircraft: [],
    objective: {
      center: { x: 90, y: 0, z: 175 },
      radius: 450,
      captureProgress: 0,
      owner: null,
      capturingTeam: null,
      contested: false,
      scores: { player: 0, enemy: 0 },
    },
    events: [],
    ...overrides,
  };
}

describe("ClientBattleSession", () => {
  it("starts input sequences at 1, strips telemetry fields, clamps controls, and requires monotonic finite now", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    const first = session.submitLocalCommand({
      ...baseCommand(),
      throttle: 9,
      rudder: -4,
      aiDecision: {
        role: "screen",
        phase: "forming",
        desiredHeading: 0,
        throttle: 1,
        fireIntent: false,
      },
      perception: { mode: "tracking", confidence: 1 },
    } as unknown as ControlCommand, 1_000);

    expect(first.payload.inputSequence).toBe(1);
    expect(first.payload.command.throttle).toBe(1);
    expect(first.payload.command.rudder).toBe(-1);
    expect("aiDecision" in first.payload.command).toBe(false);
    expect("perception" in first.payload.command).toBe(false);

    const second = session.submitLocalCommand(baseCommand(), 1_034);
    expect(second.payload.inputSequence).toBe(2);

    expect(() => session.submitLocalCommand(baseCommand(), Number.NaN)).toThrow(/invalid-now/);
    expect(() => session.submitLocalCommand(baseCommand(), 1_020)).toThrow(/non-monotonic-now/);
  });

  it("rejects stale or invalid snapshots before mutating the interpolation buffer", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({ serverTick: 3, time: 1 }), 1_000)).toEqual({
      accepted: true,
      reason: "accepted",
    });
    expect(session.receiveSnapshot(snapshot({ serverTick: 3, time: 1.1 }), 1_020)).toEqual({
      accepted: false,
      reason: "stale-tick",
    });
    expect(session.receiveSnapshot(snapshot({ serverTick: 4, time: 0.9 }), 1_040)).toEqual({
      accepted: false,
      reason: "stale-time",
    });
    expect(session.receiveSnapshot(snapshot({ serverTick: 5, time: Number.NaN as unknown as number }), 1_060)).toEqual({
      accepted: false,
      reason: "invalid-time",
    });
  });

  it("interpolates with a 120 ms buffer, wraps headings correctly, and freezes after 500 ms without extrapolating", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({
      serverTick: 1,
      time: 0,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 350 * Math.PI / 180,
        speedKnots: 10,
        throttle: 0,
        hull: 900,
        maxHull: 1_000,
        reloadRemaining: 0,
        torpedoReloadRemaining: 0,
        smokeCharges: 2,
        hydroCharges: 2,
      },
    }), 0)).toMatchObject({ accepted: true });
    expect(session.receiveSnapshot(snapshot({
      serverTick: 2,
      time: 0.2,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 20, y: 0, z: 0 },
        heading: 10 * Math.PI / 180,
        speedKnots: 20,
        throttle: 1,
        hull: 750,
        maxHull: 1_000,
        reloadRemaining: 0.5,
        torpedoReloadRemaining: 2,
        smokeCharges: 1,
        hydroCharges: 2,
      },
    }), 200)).toMatchObject({ accepted: true });

    const interpolated = session.renderState(220);
    expect(interpolated.state.time).toBeCloseTo(0.1, 5);
    const own = interpolated.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(own.position.x).toBeCloseTo(10, 5);
    expect(own.heading * 180 / Math.PI).toBeCloseTo(0, 3);
    expect(own.speedKnots).toBeCloseTo(15, 5);

    const frozen = session.renderState(900);
    const frozenOwn = frozen.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(frozen.state.time).toBeCloseTo(0.2, 5);
    expect(frozenOwn.position.x).toBeCloseTo(20, 5);
    expect(frozenOwn.heading * 180 / Math.PI).toBeCloseTo(10, 3);
  });

  it("predicts only movement/readout locally and never mutates authoritative damage state from input alone", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({
      serverTick: 1,
      lastProcessedInputSequence: 0,
      time: 0,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        speedKnots: 0,
        throttle: 0,
        hull: 640,
        maxHull: 1_000,
        reloadRemaining: 4,
        torpedoReloadRemaining: 8,
        smokeCharges: 2,
        hydroCharges: 1,
      },
    }), 0)).toMatchObject({ accepted: true });

    session.submitLocalCommand({
      ...baseCommand(),
      throttle: 1,
      rudder: 1,
      repairHull: true,
      fire: true,
    }, 33);
    session.submitLocalCommand({
      ...baseCommand(),
      throttle: 1,
      rudder: 1,
      repairHull: true,
      fire: true,
    }, 66);

    const predicted = session.renderState(186);
    const own = predicted.state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(own.position.z).toBeGreaterThan(0);
    expect(own.heading).toBeGreaterThan(0);
    expect(own.hull).toBe(640);
    expect(own.maxHull).toBe(1_000);
    expect(own.reloadRemaining).toBe(4);
    expect(own.torpedoReloadRemaining).toBe(8);
  });

  it("snaps back to the authoritative state once the server acks and propagates disconnect state", () => {
    const session = new ClientBattleSession({
      roomId: "room-alpha",
      peerId: "peer-guest",
      gameVersion: LAN_GAME_VERSION,
      contentHash: LAN_CONTENT_HASH,
    });

    expect(session.receiveSnapshot(snapshot({
      serverTick: 1,
      lastProcessedInputSequence: 0,
      time: 0,
    }), 0)).toMatchObject({ accepted: true });

    for (let index = 1; index <= 6; index += 1) {
      session.submitLocalCommand({ ...baseCommand(), throttle: 1 }, index * 33);
    }
    const predicted = session.renderState(240).state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(predicted.position.z).toBeGreaterThan(20);

    expect(session.receiveSnapshot(snapshot({
      serverTick: 2,
      lastProcessedInputSequence: 6,
      time: 0.2,
      self: {
        id: "guest-ship",
        team: "player",
        shipClassId: "fletcher",
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        speedKnots: 0,
        throttle: 0,
        hull: 900,
        maxHull: 1_000,
        reloadRemaining: 0,
        torpedoReloadRemaining: 0,
        smokeCharges: 2,
        hydroCharges: 2,
      },
    }), 200)).toMatchObject({ accepted: true });

    const reconciled = session.renderState(320).state.ships.find((ship) => ship.id === "guest-ship")!;
    expect(reconciled.position.z).toBeCloseTo(0, 5);

    session.disconnect("timeout");
    const disconnected = session.renderState(320);
    expect(disconnected.connected).toBe(false);
    expect(disconnected.disconnectReason).toBe("timeout");
  });
});
