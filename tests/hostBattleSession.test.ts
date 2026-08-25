import { describe, expect, it } from "vitest";
import { FIXED_STEP } from "../src/sim/config";
import type { LanBuildDescriptor } from "../src/net/protocol";
import { HostBattleSession } from "../src/net/hostBattleSession";
import type { ControlCommand, Vec3 } from "../src/sim/types";
import type { AuthoritativeBattleSession } from "../src/session/battleSession";

function build(overrides: Partial<LanBuildDescriptor> = {}): LanBuildDescriptor {
  return {
    buildId: "fletcher-standard",
    buildName: "Fletcher Standard",
    shipClassId: "fletcher",
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
    ...overrides,
  };
}

function zeroCommand(aimPoint: Vec3 = { x: 0, y: 0, z: 1_000 }): ControlCommand {
  return {
    throttle: 0,
    rudder: 0,
    aimPoint,
    fire: false,
  };
}

function createSession(teamSize: 1 | 3 | 5 | 7 = 3): HostBattleSession {
  return new HostBattleSession({
    hostPeerId: "peer-host-1",
    guestPeerId: "peer-guest-1",
    seed: 17,
    teamSize,
    hostBuild: build({
      buildId: "host-build",
      buildName: "Host Standard",
      shipClassId: "fletcher",
    }),
    guestBuild: build({
      buildId: "guest-build",
      buildName: "Guest Standard",
      shipClassId: "cleveland",
      slots: {
        mainGun: ["mainGun-common", "mainGun-common", "mainGun-common", "mainGun-common"],
        torpedo: [],
        antiAir: ["antiAir-common", "antiAir-common", null, null, null, null],
        sideGun: ["sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common"],
        depthCharge: [],
        magazine: ["magazine-common"],
        engine: ["engine-common"],
        steering: ["steering-common"],
      },
    }),
  });
}

function shipThrottle(session: HostBattleSession, shipId: string): number {
  return session.state.ships.find((ship) => ship.id === shipId)!.throttle;
}

describe("HostBattleSession", () => {
  it("assigns host and guest to distinct allied ships and still honors the AuthoritativeBattleSession map signature", () => {
    const session = createSession();
    const guestShipId = session.assignments.get("peer-guest-1");

    expect(session.assignments.get("peer-host-1")).toBe("player");
    expect(guestShipId).toBeDefined();
    expect(guestShipId).not.toBe("player");

    const authoritative: AuthoritativeBattleSession = session;
    const output = authoritative.step(new Map([
      ["player", { ...zeroCommand(), throttle: 0.25 }],
      [guestShipId!, { ...zeroCommand(), throttle: 0.75 }],
    ]), FIXED_STEP);

    expect(output.state.time).toBeCloseTo(FIXED_STEP);
    expect(shipThrottle(session, "player")).toBe(0.25);
    expect(shipThrottle(session, guestShipId!)).toBe(0.75);
  });

  it("lets only the host advance time, consumes the newest guest command, and backfills the remaining ally with AI", () => {
    const session = createSession();
    const guestShipId = session.assignments.get("peer-guest-1")!;
    const aiAllyId = session.state.ships.find((ship) =>
      ship.team === "player" && ship.id !== "player" && ship.id !== guestShipId)!.id;

    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: { ...zeroCommand(), throttle: 0.1 },
    }, 0)).toMatchObject({ accepted: true });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 2,
      command: { ...zeroCommand(), throttle: 0.8 },
    }, 10)).toMatchObject({ accepted: true });

    expect(session.state.time).toBe(0);
    expect(shipThrottle(session, guestShipId)).toBe(0);

    const output = session.step(zeroCommand(), FIXED_STEP);

    expect(output.state.time).toBeCloseTo(FIXED_STEP);
    expect(shipThrottle(session, "player")).toBe(0);
    expect(shipThrottle(session, guestShipId)).toBe(0.8);
    expect(session.state.ships.find((ship) => ship.id === aiAllyId)!.aiDecision).toBeDefined();
  });

  it("rejects unknown, duplicate, stale, malformed, negative-sequence, and over-rate guest frames", () => {
    const session = createSession();

    expect(session.acceptInput("peer-stranger", {
      peerId: "peer-stranger",
      inputSequence: 1,
      command: zeroCommand(),
    }, 0)).toMatchObject({ accepted: false, reason: "unknown-peer" });

    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: zeroCommand(),
    }, 0)).toMatchObject({ accepted: true });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: zeroCommand(),
    }, 1)).toMatchObject({ accepted: false, reason: "duplicate-input" });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: -1,
      command: zeroCommand(),
    } as unknown as { peerId: string; inputSequence: number; command: ControlCommand }, 2)).toMatchObject({
      accepted: false,
      reason: "invalid-sequence",
    });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 2,
      command: {
        ...zeroCommand(),
        aiDecision: {
          role: "screen",
          phase: "forming",
          desiredHeading: 0,
          throttle: 1,
          fireIntent: false,
        },
        position: { x: 999, y: 0, z: 999 },
        damage: 999,
      } as unknown as ControlCommand,
    }, 3)).toMatchObject({ accepted: false, reason: "invalid-command" });

    session.step(zeroCommand(), FIXED_STEP);
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: zeroCommand(),
    }, 4)).toMatchObject({ accepted: false, reason: "stale-input" });

    const rateLimited = createSession();
    for (let index = 0; index < 30; index += 1) {
      expect(rateLimited.acceptInput("peer-guest-1", {
        peerId: "peer-guest-1",
        inputSequence: index + 1,
        command: zeroCommand(),
      }, index * 10)).toMatchObject({ accepted: true });
    }
    expect(rateLimited.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 31,
      command: zeroCommand(),
    }, 299)).toMatchObject({ accepted: false, reason: "rate-limited" });
    expect(rateLimited.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 31,
      command: zeroCommand(),
    }, 1_001)).toMatchObject({ accepted: true });
  });

  it("publishes snapshots every sixth simulation tick and returns the guest ship to AI immediately on disconnect", () => {
    const cadence = createSession();

    expect(cadence.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: { ...zeroCommand(), throttle: 0.5 },
    }, 0)).toMatchObject({ accepted: true });

    for (let tick = 1; tick <= 5; tick += 1) {
      const output = cadence.step(zeroCommand(), FIXED_STEP);
      expect(output.serverTick).toBe(tick);
      expect(output.snapshots.size).toBe(0);
    }

    const published = cadence.step(zeroCommand(), FIXED_STEP);
    expect(published.serverTick).toBe(6);
    expect([...published.snapshots.keys()].sort()).toEqual(["peer-guest-1", "peer-host-1"]);
    expect(published.snapshots.get("peer-guest-1")).toMatchObject({
      controlledShipId: cadence.assignments.get("peer-guest-1"),
      serverTick: 6,
      lastProcessedInputSequence: 1,
    });

    const disconnected = createSession();
    const guestShipId = disconnected.assignments.get("peer-guest-1")!;
    expect(disconnected.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: { ...zeroCommand(), throttle: 1 },
    }, 0)).toMatchObject({ accepted: true });

    disconnected.disconnectGuest(0);
    expect(disconnected.assignments.has("peer-guest-1")).toBe(false);

    disconnected.step(zeroCommand(), FIXED_STEP);
    const guestShip = disconnected.state.ships.find((ship) => ship.id === guestShipId)!;
    expect(guestShip.aiControlled).toBe(true);
    expect(guestShip.aiDecision).toBeDefined();
    expect(disconnected.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 2,
      command: zeroCommand(),
    }, 1)).toMatchObject({ accepted: false, reason: "unknown-peer" });
  });
});
