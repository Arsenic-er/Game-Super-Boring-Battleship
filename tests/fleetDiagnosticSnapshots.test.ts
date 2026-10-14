import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/sim/simulation";
import { fleetCalibrationStateHash } from "./helpers/fleetCalibration";
import { FleetDiagnosticSnapshots, fleetDiagnosticSnapshot } from "./helpers/fleetDiagnosticSnapshots";

describe("bounded late-battle diagnostic snapshots", () => {
  it("reads only current own aim data and never changes simulation state", () => {
    const state = createInitialState(71, "battle");
    state.ships[0]!.aiDecision = { role: "line", phase: "searching",
      desiredHeading: 0, throttle: .5, fireIntent: false, targetId: "missing",
      contactSource: "memory" };
    const before = fleetCalibrationStateHash(state);
    const snapshot = fleetDiagnosticSnapshot(state);
    expect(fleetCalibrationStateHash(state)).toBe(before);
    expect(snapshot.ships[0]!.aiDecision!.targetId).toBe("missing");
    snapshot.ships[0]!.position.x = 99;
    snapshot.ships[0]!.modules.gun!.health = 0;
    expect(fleetCalibrationStateHash(state)).toBe(before);
  });
  it("keeps at most two sampled milestones and one terminal state, without duplicate terminal samples", () => {
    const state = createInitialState(72, "battle"), recorder = new FleetDiagnosticSnapshots();
    for (const time of [0, 899, 900 - 1e-8, 900, 901, 1050, 1100]) {
      state.time = time; recorder.update(state);
    }
    state.time = 1200; state.status = "player-won";
    recorder.update(state); recorder.update(state);
    expect(recorder.report().map(s => Math.round(s.time))).toEqual([900, 1050, 1200]);
    const changed = recorder.report(); changed[0]!.objective.scores.player = -99;
    expect(recorder.report()[0]!.objective.scores.player).not.toBe(-99);
  });
  it("refreshes a same-time milestone to the real terminal state", () => {
    const state = createInitialState(75, "battle"), recorder = new FleetDiagnosticSnapshots();
    state.time = 1050; recorder.update(state);
    state.status = "enemy-won"; recorder.update(state);
    expect(recorder.report()).toHaveLength(1);
    expect(recorder.report()[0]!.status).toBe("enemy-won");
  });
  it("does not fabricate late milestones after an early ending", () => {
    const state = createInitialState(73, "battle"), recorder = new FleetDiagnosticSnapshots();
    state.time = 743; state.status = "enemy-won"; recorder.update(state);
    state.time = 1200; recorder.update(state);
    expect(recorder.report().map(s => s.time)).toEqual([743]);
  });
  it("does not duplicate a terminal milestone or infer states skipped by the sampler", () => {
    const state = createInitialState(74, "battle"), recorder = new FleetDiagnosticSnapshots();
    state.time = 1050; state.status = "enemy-won"; recorder.update(state);
    expect(recorder.report().map(s => s.time)).toEqual([1050]);
  });
});
