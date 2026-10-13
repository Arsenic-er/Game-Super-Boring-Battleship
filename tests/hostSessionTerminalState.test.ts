import { describe, expect, it } from "vitest";
import { HostBattleSession } from "../src/net/hostBattleSession";
import type { LanBuildDescriptor } from "../src/net/protocol";
import { deployFleetAirSupport } from "../src/sim/airOperations";
import { BATTLE_DURATION_SECONDS, FIXED_STEP } from "../src/sim/config";
import { createInitialState } from "../src/sim/simulation";
import type { ControlCommand } from "../src/sim/types";
import { fleetCalibrationStateHash } from "./helpers/fleetCalibration";

const idle = (): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { x: 0, y: 0, z: 1000 },
});
function build(): LanBuildDescriptor {
  return {
    buildId: "terminal-fletcher", buildName: "Terminal Fletcher", shipClassId: "fletcher",
    slots: {
      mainGun: Array(5).fill("mainGun-common"), torpedo: ["torpedo-common", null],
      antiAir: ["antiAir-common", null, null, null], sideGun: [],
      depthCharge: ["depthCharge-common", null], magazine: ["magazine-common"],
      engine: ["engine-common"], steering: ["steering-common"],
    },
  };
}
function createSession() {
  return new HostBattleSession({ hostPeerId: "host", guestPeerId: "guest", seed: 81031,
    teamSize: 3, hostBuild: build(), guestBuild: build() });
}
function finishWithRealAirEvent(session: HostBattleSession) {
  const state = session.state;
  deployFleetAirSupport(state);
  state.time = BATTLE_DURATION_SECONDS - FIXED_STEP / 2;
  const ownerId = session.assignments.get("host")!;
  const fighter = state.airSquadrons.find(s => s.controllerId === ownerId && s.role === "fighter")!;
  const result = session.step({ ...idle(), airMission: {
    squadronId: fighter.id, kind: "defendShip", targetId: ownerId,
  } }, FIXED_STEP);
  expect(result.state.status).not.toBe("running");
  expect(result.state.endReason).toBe("time");
  expect(result.serverTick).toBe(1);
  expect(result.snapshots.size).toBe(2);
  const event = result.airEvents.find(e => e.kind === "orderAccepted" && e.squadronId === fighter.id)!;
  expect(event).toBeDefined();
  for (const snapshot of result.snapshots.values()) {
    expect(snapshot.events.filter(e => e.id === event.id && e.kind === event.kind)).toHaveLength(1);
    expect(snapshot.status).toBe(result.state.status);
  }
  return result;
}

describe("terminal host session", () => {
  it.each(["command", "map"] as const)(
    "publishes the actual final tick once, then freezes %s-driven host steps", mode => {
      const session = createSession();
      const final = finishWithRealAirEvent(session);
      const finalEvents = structuredClone(final.airEvents);
      const digest = fleetCalibrationStateHash(session.state);
      for (let tick = 0; tick < 120; ++tick) {
        const output = mode === "command"
          ? session.step(idle(), FIXED_STEP)
          : session.step(new Map([[session.assignments.get("host")!, idle()]]), FIXED_STEP);
        expect(output.state).toBe(session.state);
        expect(output.serverTick).toBe(final.serverTick);
        expect(output.snapshots.size).toBe(0);
        expect(output.shots).toEqual([]);
        expect(output.impacts).toEqual([]);
        expect(output.airEvents).toEqual([]);
        expect(output.destroyedShips).toEqual([]);
        expect(output.hullDamage).toEqual([]);
      }
      expect(fleetCalibrationStateHash(session.state)).toBe(digest);
      expect(final.airEvents).toEqual(finalEvents);
      expect(session.state.airEvents).toEqual(finalEvents);
      // No terminal effects may silently accumulate for a later network publish.
      const queues = session as unknown as { pendingVisualEventsByPeer: Map<string, unknown[]> };
      expect(queues.pendingVisualEventsByPeer.size).toBe(0);
    },
  );

  it("reset restarts host ticks and does not carry terminal effects or queued guest input into a new battle", () => {
    const session = createSession();
    finishWithRealAirEvent(session);
    expect(session.acceptInput("guest", { peerId: "guest", inputSequence: 1,
      command: { ...idle(), throttle: 1 } }, 100)).toMatchObject({ accepted: true });
    session.step(idle(), FIXED_STEP);
    const old = session.state;
    const oldDigest = fleetCalibrationStateHash(old);
    const next = createInitialState(81032, "battle", undefined, undefined, undefined,
      "fletcher", { teamSize: 3 });
    session.reset(next);
    const first = session.step(idle(), FIXED_STEP);
    expect(first.state).toBe(next);
    expect(first.serverTick).toBe(1);
    expect(first.snapshots.size).toBe(0);
    expect(next.time).toBeCloseTo(FIXED_STEP);
    const guest = next.ships.find(s => s.id === session.assignments.get("guest"))!;
    expect(guest.throttle).toBe(0);
    expect(next.ships.find(s => s.team === "enemy")!.aiDecision).toBeDefined();
    let output = first;
    for (let tick = 2; tick <= 6; ++tick) output = session.step(idle(), FIXED_STEP);
    expect(output.snapshots.size).toBe(2);
    for (const snapshot of output.snapshots.values()) {
      expect(snapshot.status).toBe("running");
      expect(snapshot.events.some(e => e.kind === "orderAccepted")).toBe(false);
    }
    expect(session.acceptInput("guest", { peerId: "guest", inputSequence: 1,
      command: idle() }, 0)).toMatchObject({ accepted: true });
    expect(fleetCalibrationStateHash(old)).toBe(oldDigest);
  });
});
