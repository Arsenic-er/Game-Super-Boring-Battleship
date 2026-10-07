import { describe, expect, it } from "vitest";
import { RuleBasedAi, type TrackEstimate } from "../src/controllers/ruleBasedAi";
import { SENSOR } from "../src/sim/config";
import { createInitialState, observe } from "../src/sim/simulation";
import type { FleetContactReport, Observation, SensorContact } from "../src/sim/types";

function fixture(): Observation {
  const state = createInitialState(811);
  state.mapId = "open-sea-range";
  state.ships[0]!.position = { x: 0, y: 0, z: 0 };
  return { ...observe(state, "player"), contacts: [], friendlies: [], time: 0 };
}

function contact(id: string, observedAt: number): SensorContact {
  return {
    id, team: "enemy", observedAt, position: { x: 1_200, y: 0, z: 100 },
    heading: 0, speedKnots: 18, rangeMeters: Math.hypot(1_200, 100),
    confidence: .9, estimatedHullRatio: .8,
  };
}

function setup() {
  const ai = new RuleBasedAi(77), base = fixture();
  const sample = (id: string, time: number, observedAt = time) =>
    ai.command({ ...base, time, contacts: [contact(id, observedAt)] });
  const lose = (time: number) => ai.command({ ...base, time });
  const acquire = (id = "A", start = 0) => {
    let command;
    for (let index = 0; index < SENSOR.aiAcquisitionSamples; index++) {
      command = sample(id, start + index * SENSOR.observationIntervalSeconds);
    }
    expect(command?.perception?.mode).toBe("tracking");
  };
  return { ai, base, sample, lose, acquire };
}

function expectAcquiring(command: ReturnType<RuleBasedAi["command"]>) {
  expect(command.perception?.mode).toBe("acquiring");
  expect(command.fire).toBe(false);
  expect(command.weaponSlot).toBe("mainGun");
}

describe("AI optical reacquisition", () => {
  it("drops a tracked solution immediately when contact vanishes within the same scan", () => {
    const { acquire, lose, sample } = setup();
    acquire();
    const lost = lose(7.6);
    expect(lost.perception?.mode).toBe("lost");
    expect(lost.fire).toBe(false);
    expect(lost.weaponSlot).toBe("mainGun");
    expectAcquiring(sample("A", 7.7, 7.5));
  });

  it("requires two genuinely new sensor samples after loss, not cached or older samples", () => {
    const { acquire, lose, sample } = setup();
    acquire();
    lose(7.6);
    for (const time of [7.7, 8, 9, 10]) {
      expectAcquiring(sample("A", time, 7.5));
    }
    expectAcquiring(sample("A", 10.1, 10));
    expectAcquiring(sample("A", 11, 10));
    expect(sample("A", 12.5).perception?.mode).toBe("tracking");
  });

  it("counts at most one acquisition sample per sensor interval", () => {
    const { acquire, lose, sample } = setup();
    acquire();
    lose(7.6);
    // Artificially finer timestamps must not manufacture additional scans.
    expectAcquiring(sample("A", 8));
    expectAcquiring(sample("A", 9.9));
    expectAcquiring(sample("A", 10));
    expectAcquiring(sample("A", 10.1));
    expectAcquiring(sample("A", 12.4));
    expect(sample("A", 12.5).perception?.mode).toBe("tracking");
  });

  it("does not acquire a new target from repeated or out-of-order timestamps", () => {
    const { sample } = setup();
    expectAcquiring(sample("A", 5));
    expectAcquiring(sample("A", 5.1, 5));
    const regressed = sample("A", 6, 4);
    expect(regressed.perception?.mode).toBe("lost");
    expect(regressed.fire).toBe(false);
    for (const time of [7.5, 10, 12.5]) expectAcquiring(sample("A", time));
    expect(sample("A", 15).perception?.mode).toBe("tracking");
  });

  it("does not count negative, non-finite, or future-dated samples", () => {
    const { sample } = setup();
    for (const observedAt of [-1, Number.NaN, Number.POSITIVE_INFINITY, 100]) {
      const command = sample("A", 0, observedAt);
      expect(command.perception?.mode).toBe("unaware");
      expect(command.fire).toBe(false);
    }
    for (const time of [0, 2.5, 5]) expectAcquiring(sample("A", time));
    expect(sample("A", 7.5).perception?.mode).toBe("tracking");
  });

  it.each([
    ["stale", 10.1, 7.5],
    ["out-of-order", 7.7, 7.4],
    ["future", 7.7, 10],
    ["non-finite", 7.7, Number.NaN],
  ])("treats a %s sample after tracking as immediate loss, never firing authority", (_kind, time, observedAt) => {
    const { acquire, sample } = setup();
    acquire();
    const command = sample("A", time, observedAt);
    expect(command.perception?.mode).toBe("lost");
    expect(command.perception?.lastObservedAt).toBe(7.5);
    expect(command.fire).toBe(false);
    expect(command.weaponSlot).toBe("mainGun");
    expectAcquiring(sample("A", 12.5));
    expect(sample("A", 15).perception?.mode).toBe("tracking");
  });

  it("falls back from a stale coordinated target to a fresh local contact without borrowing authority", () => {
    const { ai, base, acquire } = setup();
    acquire();
    const command = ai.command({
      ...base, time: 10.1, contacts: [contact("A", 7.5), contact("B", 10)],
      fleetTarget: {
        targetId: "A", assignedAt: 10, role: "screen", friendlyAssignedCount: 1,
      },
    });
    expectAcquiring(command);
    expect(command.aiDecision?.targetId).toBe("B");
    expect(command.aiDecision?.contactSource).toBe("local");
    expect(command.aiDecision?.coordinatedTarget).toBe(false);
    expect(command.aiDecision?.friendlyTargetLoad).toBeUndefined();
  });

  it("restarts two-sample reacquisition after another loss and never preserves a partial torpedo pair", () => {
    const { ai, acquire, lose, sample } = setup();
    const state = ai as unknown as { previousContact?: TrackEstimate };
    acquire();
    lose(7.6);
    expectAcquiring(sample("A", 10));
    lose(10.1);
    expect(state.previousContact).toBeUndefined();
    expectAcquiring(sample("A", 10.2, 10));
    expectAcquiring(sample("A", 12.5));
    expect(state.previousContact).toBeUndefined();
    expect(sample("A", 15).perception?.mode).toBe("tracking");
    expect(state.previousContact?.observedAt).toBe(12.5);
  });

  it("remembers a recently tracked A across A to B to A without inheriting B samples", () => {
    const { acquire, sample } = setup();
    acquire();
    expectAcquiring(sample("B", 7.6, 7.5));
    expectAcquiring(sample("A", 7.7, 7.5));
    expectAcquiring(sample("A", 10));
    expect(sample("A", 12.5).perception?.mode).toBe("tracking");
  });

  it("still demands four independent observations for a different new B", () => {
    const { acquire, sample } = setup();
    acquire();
    expectAcquiring(sample("B", 7.6, 7.5));
    expectAcquiring(sample("B", 10));
    expectAcquiring(sample("B", 12.5));
    expect(sample("B", 15).perception?.mode).toBe("tracking");
  });

  it("does not remember a target that was only acquiring before switching away", () => {
    const { sample } = setup();
    expectAcquiring(sample("A", 0));
    expectAcquiring(sample("A", 2.5));
    expectAcquiring(sample("A", 5));
    expectAcquiring(sample("B", 7.5));
    for (const time of [10, 12.5, 15]) expectAcquiring(sample("A", time));
    expect(sample("A", 17.5).perception?.mode).toBe("tracking");
  });

  it("expires a same-ID direct track before processing a long time-jump return", () => {
    const { acquire, sample } = setup();
    acquire();
    for (const time of [32.5, 35, 37.5]) expectAcquiring(sample("A", time));
    expect(sample("A", 40).perception?.mode).toBe("tracking");
  });

  it("expires remembered A while switching between other locally visible targets", () => {
    const { acquire, sample } = setup();
    acquire();
    for (const time of [10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30]) {
      sample("B", time);
    }
    for (const time of [32.5, 35, 37.5]) expectAcquiring(sample("A", time));
    expect(sample("A", 40).perception?.mode).toBe("tracking");
  });

  it("expires history from actual observation time, not a late processing call", () => {
    const { acquire, sample, lose } = setup();
    acquire();
    const stale = sample("A", 30, 7.5);
    expect(stale.perception?.mode).toBe("searching");
    expect(stale.fire).toBe(false);
    lose(30.1);
    // Only 2.5 s elapsed since processing, but the observation is 25 s old.
    for (const time of [32.5, 35, 37.5]) expectAcquiring(sample("A", time));
    expect(sample("A", 40).perception?.mode).toBe("tracking");
  });

  it("does not prolong successful-track history by merely acquiring a fresh sample", () => {
    const { acquire, sample, lose } = setup();
    acquire();
    lose(10);
    expectAcquiring(sample("A", 30));
    // Last successful tracking sample remains 7.5, so reacquisition expires.
    expectAcquiring(sample("A", 32.5));
    expectAcquiring(sample("A", 35));
    expect(sample("A", 37.5).perception?.mode).toBe("tracking");
  });

  it("radio-only reports neither prime a new lock nor refresh an old one", () => {
    const { ai, base, acquire, sample } = setup();
    acquire();
    for (const time of [11, 16, 21, 26, 31]) {
      const report: FleetContactReport = {
        ...contact("A", time - 3), sourceShipId: "scout", receivedAt: time,
      };
      const command = ai.command({ ...base, time, sharedContacts: [report] });
      expect(command.aiDecision?.contactSource).toBe("radio");
      expect(command.fire).toBe(false);
      expect(command.weaponSlot).toBe("mainGun");
    }
    for (const time of [32.5, 35, 37.5]) expectAcquiring(sample("A", time));
    expect(sample("A", 40).perception?.mode).toBe("tracking");
  });

  it("keeps last-known search coordinates isolated from mutated input and output objects", () => {
    const { ai, base, sample } = setup();
    for (const time of [0, 2.5, 5]) sample("A", time);
    const seen = contact("A", 7.5);
    const command = ai.command({ ...base, time: 7.5, contacts: [seen] });
    seen.position.x = -999_999;
    seen.observedAt = 300;
    command.perception!.estimatedPosition!.x = 999_999;
    const lost = ai.command({ ...base, time: 7.6 });
    expect(lost.perception?.lastObservedAt).toBe(7.5);
    expect(lost.perception?.estimatedPosition?.x).toBe(1_200);
    expectAcquiring(sample("B", 7.7, 7.5));
    expectAcquiring(sample("A", 10));
    expect(sample("A", 12.5).perception?.mode).toBe("tracking");
  });

  it("clears the old torpedo pair on loss and never pairs samples across targets", () => {
    const { ai, acquire, lose, sample } = setup();
    // Inspect existing internal state without adding a production test hook.
    const state = ai as unknown as { previousContact?: TrackEstimate };
    acquire();
    expect(state.previousContact?.observedAt).toBe(5);
    lose(7.6);
    expect(state.previousContact).toBeUndefined();
    expectAcquiring(sample("A", 7.7, 7.5));
    expect(state.previousContact).toBeUndefined();
    expectAcquiring(sample("A", 10));
    expect(state.previousContact).toBeUndefined();
    sample("A", 12.5);
    expect(state.previousContact?.observedAt).toBe(10);
    expectAcquiring(sample("B", 12.6, 12.5));
    expect(state.previousContact).toBeUndefined();
  });

  it("bounds remembered identities and stores only independent primitive timestamps", () => {
    const { ai } = setup();
    const state = ai as unknown as {
      rememberTrackedContact(contact: TrackEstimate): void;
      trackedContactHistory: Map<string, number>;
    };
    for (let index = 0; index < 70; index++) {
      state.rememberTrackedContact(contact("target-" + index, index));
    }
    expect(state.trackedContactHistory.size).toBe(64);
    expect(state.trackedContactHistory.has("target-5")).toBe(false);
    expect(state.trackedContactHistory.get("target-6")).toBe(6);
    const last = contact("target-69", 70);
    state.rememberTrackedContact(last);
    last.observedAt = 800;
    expect(state.trackedContactHistory.get("target-69")).toBe(70);
    state.rememberTrackedContact(contact("target-69", 60));
    expect(state.trackedContactHistory.get("target-69")).toBe(70);
  });
});
