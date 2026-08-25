import { describe, expect, it } from "vitest";
import { FIXED_STEP } from "../src/sim/config";
import { HostBattleSession } from "../src/net/hostBattleSession";
import type { LanBuildDescriptor } from "../src/net/protocol";
import { createInitialState } from "../src/sim/simulation";
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

function createSession(
  teamSize: 1 | 3 | 5 | 7 = 3,
  overrides: Partial<ConstructorParameters<typeof HostBattleSession>[0]> = {},
): HostBattleSession {
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
        antiAir: ["antiAir-common", null, null, null, null],
        sideGun: ["sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common"],
        depthCharge: [],
        magazine: ["magazine-common"],
        engine: ["engine-common"],
        steering: ["steering-common"],
      },
    }),
    ...overrides,
  });
}

function shipThrottle(session: HostBattleSession, shipId: string): number {
  return session.state.ships.find((ship) => ship.id === shipId)!.throttle;
}

describe("HostBattleSession", () => {
  it("assigns host and guest to distinct allied ships and still satisfies the AuthoritativeBattleSession shape", () => {
    const session = createSession();
    const authoritative: AuthoritativeBattleSession = session;

    expect(session.assignments.get("peer-host-1")).toBe("player");
    expect(session.assignments.get("peer-guest-1")).toBeDefined();
    expect(session.assignments.get("peer-guest-1")).not.toBe("player");

    const output = authoritative.step(new Map([
      ["player", { ...zeroCommand(), throttle: 0.25 }],
    ]), FIXED_STEP);

    expect(output.state.time).toBeCloseTo(FIXED_STEP);
    expect(shipThrottle(session, "player")).toBe(0.25);
  });

  it("rejects unauthorized or malformed map-driven commands instead of letting them bypass host authority", () => {
    const session = createSession();
    const authoritative: AuthoritativeBattleSession = session;
    const guestShipId = session.assignments.get("peer-guest-1")!;
    const enemyShipId = session.state.ships.find((ship) => ship.team === "enemy")!.id;
    const alliedAiId = session.state.ships.find((ship) =>
      ship.team === "player" && ship.id !== "player" && ship.id !== guestShipId)!.id;

    expect(() => authoritative.step(new Map([
      [guestShipId, { ...zeroCommand(), throttle: 1 }],
    ]), FIXED_STEP)).toThrow(/unauthorized-command-target/);
    expect(() => authoritative.step(new Map([
      [enemyShipId, { ...zeroCommand(), throttle: 1 }],
    ]), FIXED_STEP)).toThrow(/unauthorized-command-target/);
    expect(() => authoritative.step(new Map([
      [alliedAiId, { ...zeroCommand(), throttle: 1 }],
    ]), FIXED_STEP)).toThrow(/unauthorized-command-target/);
    expect(() => authoritative.step(new Map([
      ["unknown-ship", { ...zeroCommand(), throttle: 1 }],
    ]), FIXED_STEP)).toThrow(/unauthorized-command-target/);
    expect(() => authoritative.step(new Map([
      ["player", {
        ...zeroCommand(),
        aiDecision: {
          role: "screen",
          phase: "forming",
          desiredHeading: 0,
          throttle: 1,
          fireIntent: false,
        },
      } as unknown as ControlCommand],
    ]), FIXED_STEP)).toThrow(/invalid-command/);
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

  it("rejects unsafe sequences and malformed timestamps without mutating the rate window", () => {
    const session = createSession();

    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: Number.MAX_SAFE_INTEGER + 1,
      command: zeroCommand(),
    }, 0)).toMatchObject({ accepted: false, reason: "invalid-sequence" });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 0,
      command: zeroCommand(),
    }, Number.NaN)).toMatchObject({ accepted: false, reason: "invalid-received-at" });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 0,
      command: zeroCommand(),
    }, Number.POSITIVE_INFINITY)).toMatchObject({ accepted: false, reason: "invalid-received-at" });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 0,
      command: zeroCommand(),
    }, -1)).toMatchObject({ accepted: false, reason: "invalid-received-at" });

    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: zeroCommand(),
    }, 10)).toMatchObject({ accepted: true });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 2,
      command: zeroCommand(),
    }, 9)).toMatchObject({ accepted: false, reason: "non-monotonic-received-at" });

    for (let index = 2; index <= 30; index += 1) {
      expect(session.acceptInput("peer-guest-1", {
        peerId: "peer-guest-1",
        inputSequence: index,
        command: zeroCommand(),
      }, 10 + (index - 1) * 10)).toMatchObject({ accepted: true });
    }
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 31,
      command: zeroCommand(),
    }, 300)).toMatchObject({ accepted: false, reason: "rate-limited" });
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 31,
      command: zeroCommand(),
    }, 1_010)).toMatchObject({ accepted: true });
  });

  it("rejects unknown, duplicate, stale, and malformed guest frames", () => {
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
  });

  it("binds authority to the authenticated guest identity instead of trusting frame.peerId", () => {
    const session = createSession();

    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-spoofed",
      inputSequence: 1,
      command: { ...zeroCommand(), throttle: 0.6 },
    }, 0)).toMatchObject({ accepted: true });

    const guestShipId = session.assignments.get("peer-guest-1")!;
    session.step(zeroCommand(), FIXED_STEP);
    expect(shipThrottle(session, guestShipId)).toBe(0.6);
  });

  it("publishes snapshots on accumulated fixed-tick cadence instead of step-call cadence", () => {
    const doubleStep = createSession();
    for (let call = 1; call <= 2; call += 1) {
      const output = doubleStep.step(zeroCommand(), FIXED_STEP * 2);
      expect(output.serverTick).toBe(call * 2);
      expect(output.snapshots.size).toBe(0);
    }
    const published = doubleStep.step(zeroCommand(), FIXED_STEP * 2);
    expect(published.serverTick).toBe(6);
    expect([...published.snapshots.keys()].sort()).toEqual(["peer-guest-1", "peer-host-1"]);

    const halfStep = createSession();
    for (let call = 1; call <= 11; call += 1) {
      expect(halfStep.step(zeroCommand(), FIXED_STEP / 2).snapshots.size).toBe(0);
    }
    const halfPublished = halfStep.step(zeroCommand(), FIXED_STEP / 2);
    expect(halfPublished.serverTick).toBe(6);
    expect(halfPublished.snapshots.size).toBe(2);

    const longStep = createSession();
    const longOutput = longStep.step(zeroCommand(), FIXED_STEP * 7);
    expect(longOutput.serverTick).toBe(7);
    expect(longOutput.snapshots.size).toBe(2);

    const resettable = createSession();
    resettable.step(zeroCommand(), FIXED_STEP * 5);
    resettable.reset(createInitialState(88, "battle"));
    expect(resettable.step(zeroCommand(), FIXED_STEP).serverTick).toBe(1);
    expect(resettable.step(zeroCommand(), FIXED_STEP).snapshots.size).toBe(0);
  });

  it("restores guest assignment and input acceptance after disconnect then reset, and rejects states with fewer than two allies", () => {
    const session = createSession();
    session.disconnectGuest(0);
    expect(session.assignments.has("peer-guest-1")).toBe(false);

    session.reset(createInitialState(99, "battle", undefined, undefined, undefined, "fletcher", { teamSize: 3 }));
    expect(session.assignments.get("peer-host-1")).toBe("player");
    expect(session.assignments.get("peer-guest-1")).toBeDefined();
    expect(session.acceptInput("peer-guest-1", {
      peerId: "peer-guest-1",
      inputSequence: 1,
      command: zeroCommand(),
    }, 0)).toMatchObject({ accepted: true });

    expect(() => session.reset(createInitialState(101, "battle", undefined, undefined, undefined, "fletcher", { teamSize: 1 })))
      .toThrow(/insufficient-allied-ships/);
  });

  it("rejects invalid scenario descriptors before any runtime state is built", () => {
    expect(() => createSession(3, {
      hostPeerId: "peer-dup",
      guestPeerId: "peer-dup",
    })).toThrow(/duplicate-peer-id/);
    expect(() => createSession(3, {
      hostPeerId: "",
    })).toThrow(/invalid-peer-id/);
    expect(() => createSession(3, {
      guestPeerId: "x".repeat(65),
    })).toThrow(/invalid-peer-id/);
    expect(() => createSession(3, {
      guestBuild: build({
        shipClassId: "cleveland",
        slots: {
          ...build().slots,
          mainGun: ["engine-common", null, null, null, null],
        },
      }),
    })).toThrow(/invalid-build/);
  });
});
