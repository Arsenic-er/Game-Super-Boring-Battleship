
import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { deployFleetAirSupport } from "../src/sim/airOperations";
import { BATTLE_DURATION_SECONDS, FIXED_STEP } from "../src/sim/config";
import { createInitialState } from "../src/sim/simulation";
import { fleetCalibrationStateHash } from "./helpers/fleetCalibration";

describe("terminal authoritative session", () => {
  it.each(["player-won", "enemy-won", "draw"] as const)("%s does not reenter sensors or AI on later frames", status => {
    const state = createInitialState(81021, "battle");
    deployFleetAirSupport(state);
    state.status = status;
    state.endReason = "time";
    const session = new LocalBattleSession(state);
    const digest = fleetCalibrationStateHash(state);
    for (let tick = 0; tick < 120; ++tick) {
      const output = session.step(new Map(), FIXED_STEP, { includeDeveloperAi: true });
      expect(output).toEqual({ state, shots: [], impacts: [], airEvents: [], destroyedShips: [], hullDamage: [] });
    }
    expect(fleetCalibrationStateHash(state)).toBe(digest);
    expect(state.sensorSnapshots).toEqual({});
    expect(state.ships.every(ship => ship.aiDecision === undefined)).toBe(true);
  });
  it("delivers last-frame air events once and freezes the actual timeout state", () => {
    const state = createInitialState(81022, "battle");
    deployFleetAirSupport(state);
    state.time = BATTLE_DURATION_SECONDS - FIXED_STEP / 2;
    const owner = state.ships.find(ship => ship.id === "player")!;
    const fighter = state.airSquadrons.find(squadron => squadron.team === "player" && squadron.role === "fighter")!;
    const session = new LocalBattleSession(state);
    const command = { throttle: 0, rudder: 0, fire: false, aimPoint: { ...owner.aimPoint },
      airMission: { squadronId: fighter.id, kind: "defendShip" as const, targetId: owner.id } };
    const finalOutput = session.step(new Map([[owner.id, command]]), FIXED_STEP);
    expect(state.status).not.toBe("running");
    expect(state.endReason).toBe("time");
    expect(finalOutput.airEvents).toContainEqual(expect.objectContaining({
      kind: "orderAccepted", squadronId: fighter.id,
    }));
    const lastEvents = structuredClone(finalOutput.airEvents);
    const digest = fleetCalibrationStateHash(state);
    for (let tick = 0; tick < 120; ++tick) {
      const output = session.step(new Map([[owner.id, command]]), FIXED_STEP);
      expect(output.shots).toEqual([]);
      expect(output.impacts).toEqual([]);
      expect(output.airEvents).toEqual([]);
      expect(output.destroyedShips).toEqual([]);
      expect(output.hullDamage).toEqual([]);
    }
    expect(fleetCalibrationStateHash(state)).toBe(digest);
    expect(finalOutput.airEvents).toEqual(lastEvents);
  });
  it("reset resumes a fresh battle after the old session finished", () => {
    const old = createInitialState(81023, "battle");
    old.status = "draw";
    const session = new LocalBattleSession(old);
    session.step(new Map(), FIXED_STEP);
    const next = createInitialState(81024, "battle");
    session.reset(next);
    session.step(new Map(), FIXED_STEP);
    expect(session.state).toBe(next);
    expect(next.time).toBeCloseTo(FIXED_STEP);
    expect(next.ships.find(ship => ship.id === "enemy")!.aiDecision).toBeDefined();
    expect(old.time).toBe(0);
  });
});
