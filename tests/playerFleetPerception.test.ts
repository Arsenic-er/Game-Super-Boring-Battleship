import { describe, expect, it } from "vitest";
import { SENSOR, shipSpeedMetersPerSecond } from "../src/sim/config";
import { PlayerFleetPerceptionTracker, selectPrimaryTarget } from "../src/sim/playerFleetPerception";
import { createInitialState, observe } from "../src/sim/simulation";
import type { Observation, PlayerTargetView, SensorContact } from "../src/sim/types";

const interval = SENSOR.observationIntervalSeconds;
const base = observe(createInitialState(481), "player");
const contact = (id: string, time = 0, overrides: Partial<SensorContact> = {}): SensorContact => ({
  id, team: "enemy", observedAt: time, position: { x: 1_000, y: 0, z: 100 },
  heading: 0, speedKnots: 20, rangeMeters: 1_005, confidence: .9,
  estimatedHullRatio: .95, ...overrides,
});
const observation = (time: number, contacts: SensorContact[] = [], changes: Partial<Observation> = {}): Observation =>
  ({ ...base, time, contacts, ...changes });
const view = (id: string, changes: Partial<PlayerTargetView> = {}): PlayerTargetView => ({
  id, team: "enemy", mode: "tracking", live: true, confidence: .9,
  lastObservedAt: 5, position: { x: 1_000, y: 0, z: 0 }, heading: 0,
  speedKnots: 20, rangeMeters: 1_000, estimatedHullRatio: 1, ...changes,
});
function acquire(tracker: PlayerFleetPerceptionTracker, ids: string[], start = 0): PlayerTargetView[] {
  let result: PlayerTargetView[] = [];
  for (let index = 0; index < SENSOR.acquisitionSamples; index += 1) {
    const time = start + index * interval;
    result = tracker.update(observation(time, ids.map((id) => contact(id, time))));
  }
  return result;
}

describe("fleet local perception", () => {
  it("independently confirms every sampled local contact and sorts by stable ID", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    const first = tracker.update(observation(0, [contact("zeta"), contact("alpha"), contact("beta")]));
    expect(first.map(({ id, mode }) => [id, mode])).toEqual([
      ["alpha", "acquiring"], ["beta", "acquiring"], ["zeta", "acquiring"],
    ]);
    tracker.update(observation(interval, [contact("beta", interval), contact("zeta", interval), contact("alpha", interval)]));
    const result = tracker.update(observation(interval * 2, [
      contact("alpha", interval * 2), contact("beta", interval * 2), contact("zeta", interval * 2),
    ]));
    expect(result.map(({ id, mode }) => [id, mode])).toEqual([
      ["alpha", "tracking"], ["beta", "tracking"], ["zeta", "tracking"],
    ]);
  });

  it("does not accumulate acquisition across repeated updates within a scan", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    for (let time = 0; time < interval; time += .1) {
      expect(tracker.update(observation(time, [contact("a"), contact("b")]))
        .every(({ mode }) => mode === "acquiring")).toBe(true);
    }
    expect(tracker.update(observation(interval, [contact("a", interval), contact("b", interval)]))
      .every(({ mode }) => mode === "acquiring")).toBe(true);
    expect(tracker.update(observation(interval * 2, [contact("a", interval * 2), contact("b", interval * 2)]))
      .every(({ mode }) => mode === "tracking")).toBe(true);
  });

  it("does not transfer acquisition from one enemy to a new ID", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    const result = tracker.update(observation(interval * 3, [contact("b", interval * 3)]));
    expect(result.find(({ id }) => id === "a")).toMatchObject({ live: false, mode: "lost" });
    expect(result.find(({ id }) => id === "b")).toMatchObject({ live: true, mode: "acquiring" });
  });

  it("loses and extrapolates only missing contacts without interrupting another live track", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a", "b"]);
    const time = interval * 3;
    const result = tracker.update(observation(time, [contact("b", time)]));
    const lost = result.find(({ id }) => id === "a")!;
    expect(lost).toMatchObject({ mode: "lost", live: false, lastObservedAt: interval * 2 });
    expect(lost.position.z).toBeCloseTo(100 + shipSpeedMetersPerSecond(20) * interval);
    expect(result.find(({ id }) => id === "b")).toMatchObject({ mode: "tracking", live: true });
    expect(tracker.update(observation(12.5, [contact("b", 12.5)]))
      .find(({ id }) => id === "a")?.mode).toBe("searching");
  });

  it("reacquires a lost tracked ID independently using the existing two-sample policy", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a", "b"]);
    tracker.update(observation(7.5, [contact("b", 7.5)]));
    expect(tracker.update(observation(10, [contact("a", 10), contact("b", 10)]))
      .map(({ id, mode }) => [id, mode])).toEqual([["a", "acquiring"], ["b", "tracking"]]);
    expect(tracker.update(observation(12.5, [contact("a", 12.5), contact("b", 12.5)]))
      .every(({ mode }) => mode === "tracking")).toBe(true);
  });

  it("expires old memories and requires full acquisition if their ID returns", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    expect(tracker.update(observation(5 + SENSOR.memorySeconds))).toHaveLength(1);
    expect(tracker.update(observation(5 + SENSOR.memorySeconds + .01))).toEqual([]);
    expect(tracker.update(observation(30, [contact("a", 30)]))[0]?.mode).toBe("acquiring");
    expect(tracker.update(observation(32.5, [contact("a", 32.5)]))[0]?.mode).toBe("acquiring");
    expect(tracker.update(observation(35, [contact("a", 35)]))[0]?.mode).toBe("tracking");
  });

  it("expires confirmation before a returning contact even when intermediate updates were skipped", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    expect(tracker.update(observation(40, [contact("a", 40)]))[0]?.mode).toBe("acquiring");
    expect(tracker.update(observation(42.5, [contact("a", 42.5)]))[0]?.mode).toBe("acquiring");
  });

  it("never promotes fleet radio reports to local visible contacts or refreshes their memory", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    const reports = [{ ...contact("radio"), sourceShipId: "ally", receivedAt: 3 }];
    expect(tracker.update(observation(3, [], { sharedContacts: reports }))).toEqual([]);
    acquire(tracker, ["a"], 5);
    const result = tracker.update(observation(12.5, [], {
      sharedContacts: [{ ...contact("a", 12.5), sourceShipId: "ally", receivedAt: 12.5 }],
    }));
    expect(result[0]).toMatchObject({ id: "a", live: false, lastObservedAt: 10 });
  });

  it("keeps memory without consulting authoritative entity existence or sunk state", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    const onlyObserver = observation(7.5);
    expect(tracker.update(onlyObserver)[0]).toMatchObject({ id: "a", mode: "lost", live: false });
  });

  it("copies samples so callers cannot mutate stored memory through contact or output", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    const input = contact("a");
    const result = tracker.update(observation(0, [input]));
    input.position.x = -900;
    result[0]!.position.x = 777;
    expect(tracker.update(observation(interval))[0]?.position.x).toBe(1_000);
  });

  it("clears tracks and confirmation when reset is explicitly called", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    tracker.reset();
    expect(tracker.update(observation(7.5))).toEqual([]);
    expect(tracker.update(observation(10, [contact("a", 10)]))[0]?.mode).toBe("acquiring");
  });

  it("clears tracks when the observed ship ID changes", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    const switched = { ...base.self, id: "other-player" };
    expect(tracker.update(observation(7.5, [contact("a", 7.5)], { self: switched }))[0]?.mode)
      .toBe("acquiring");
  });

  it("clears tracks when the same observed entity switches teams", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    const switched = { ...base.self, team: "enemy" as const };
    const result = tracker.update(observation(7.5, [
      contact("a", 7.5), contact("new-hostile", 7.5, { team: "player" }),
    ], { self: switched }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "new-hostile", mode: "acquiring" });
  });

  it("clears tracks on time rewind even if the same ship ID is reused", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    expect(tracker.update(observation(0, [contact("b")])).map(({ id, mode }) => [id, mode]))
      .toEqual([["b", "acquiring"]]);
  });

  it.each([NaN, Infinity, -Infinity, -1])("fails closed and resets on invalid time %s", (time) => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    expect(tracker.update(observation(time))).toEqual([]);
    expect(tracker.update(observation(10, [contact("a", 10)]))[0]?.mode).toBe("acquiring");
  });

  it.each([
    ["future", { observedAt: .01 }],
    ["non-finite time", { observedAt: NaN }],
    ["negative time", { observedAt: -1 }],
    ["non-finite position", { position: { x: Infinity, y: 0, z: 0 } }],
    ["non-finite heading", { heading: NaN }],
    ["non-finite speed", { speedKnots: Infinity }],
    ["dead-reckoning overflow", { speedKnots: Number.MAX_VALUE }],
    ["non-finite range", { rangeMeters: NaN }],
    ["negative range", { rangeMeters: -1 }],
    ["empty identity", { id: "" }],
    ["oversized identity", { id: "a".repeat(129) }],
    ["own entity", { id: base.self.id }],
    ["friendly", { team: "player" }],
    ["zero confidence", { confidence: 0 }],
    ["non-finite confidence", { confidence: NaN }],
    ["excess confidence", { confidence: 1.1 }],
    ["invalid hull", { estimatedHullRatio: -1 }],
  ] as Array<[string, Partial<SensorContact>]>)
  ("rejects %s samples before tracking", (_reason, overrides) => {
    expect(new PlayerFleetPerceptionTracker().update(observation(0, [contact("a", 0, overrides)])))
      .toEqual([]);
  });

  it("expires stale live samples rather than keeping them visible forever", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, ["a"]);
    expect(tracker.update(observation(10, [contact("a", 5)]))[0])
      .toMatchObject({ live: false, lastObservedAt: 5 });
    expect(new PlayerFleetPerceptionTracker().update(observation(10, [contact("a", 5)]))).toEqual([]);
  });

  it("rejects regressing local sample timestamps for the same ID", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    tracker.update(observation(1, [contact("a", 1)]));
    const result = tracker.update(observation(2, [contact("a", 0, { position: { x: 9_000, y: 0, z: 0 } })]));
    expect(result[0]).toMatchObject({ live: false, lastObservedAt: 1 });
    expect(result[0]?.position.x).toBe(1_000);
  });

  it("deduplicates contacts deterministically and does not confirm twice from duplicate entries", () => {
    const older = contact("a", 0, { rangeMeters: 20 });
    const newer = contact("a", 1, { rangeMeters: 50 });
    const first = new PlayerFleetPerceptionTracker().update(observation(1, [older, newer]));
    const reversed = new PlayerFleetPerceptionTracker().update(observation(1, [newer, older]));
    expect(first).toEqual(reversed);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ mode: "acquiring", lastObservedAt: 1, rangeMeters: 50 });
  });

  it("bounds live tracks to the nearest 64 regardless of input order", () => {
    const input = Array.from({ length: 100 }, (_, index) =>
      contact("contact-" + index.toString().padStart(3, "0"), 0, { rangeMeters: index + 10 }));
    const forward = new PlayerFleetPerceptionTracker().update(observation(0, input));
    const reverse = new PlayerFleetPerceptionTracker().update(observation(0, [...input].reverse()));
    expect(forward).toEqual(reverse);
    expect(forward).toHaveLength(64);
    expect(forward.at(-1)?.id).toBe("contact-063");
  });

  it("keeps bounded duplicate selection order-independent when newer samples have larger ranges", () => {
    const input = Array.from({ length: 80 }, (_, index) =>
      contact("contact-" + index.toString().padStart(3, "0"), 0, { rangeMeters: index + 10 }));
    input.push(contact("contact-000", 1, { rangeMeters: 10_000 }));
    const forward = new PlayerFleetPerceptionTracker().update(observation(1, input));
    const reverse = new PlayerFleetPerceptionTracker().update(observation(1, [...input].reverse()));
    expect(forward).toEqual(reverse);
    expect(forward).toHaveLength(64);
    expect(forward.find(({ id }) => id === "contact-000")?.lastObservedAt).toBe(1);
  });

  it("new live contacts displace old memory at the bound and evicted IDs reacquire afresh", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    acquire(tracker, Array.from({ length: 64 }, (_, index) => "old-" + index));
    const fresh = Array.from({ length: 64 }, (_, index) => contact("new-" + index, 7.5));
    expect(tracker.update(observation(7.5, fresh)).every(({ id, live }) => id.startsWith("new-") && live))
      .toBe(true);
    const result = tracker.update(observation(10, [contact("old-0", 10)]));
    expect(result).toHaveLength(64);
    expect(result.find(({ id }) => id === "old-0")?.mode).toBe("acquiring");
  });

  it("retains the most recently sampled memory when live tracks take available capacity", () => {
    const tracker = new PlayerFleetPerceptionTracker();
    tracker.update(observation(0, Array.from({ length: 64 }, (_, index) => contact("old-" + index))));
    tracker.update(observation(2.5, [contact("old-63", 2.5)]));
    const fresh = Array.from({ length: 63 }, (_, index) => contact("new-" + index, 5));
    const result = tracker.update(observation(5, fresh));
    expect(result.filter(({ live }) => !live).map(({ id }) => id)).toEqual(["old-63"]);
  });
});

describe("primary optical HUD target", () => {
  it("prefers confirmed live contacts over closer unconfirmed or memory contacts", () => {
    const result = selectPrimaryTarget([
      view("memory", { live: false, mode: "lost", rangeMeters: 0 }),
      view("acquiring", { mode: "acquiring", rangeMeters: 100 }),
      view("tracking", { rangeMeters: 3_000 }),
    ], "memory");
    expect(result?.id).toBe("tracking");
  });

  it("preserves a similarly distant previous target despite sampled range jitter", () => {
    expect(selectPrimaryTarget([view("a", { rangeMeters: 1_000 }), view("b", { rangeMeters: 1_200 })], "b")?.id)
      .toBe("b");
  });

  it("switches from a much farther previous target and never promotes memory above live", () => {
    expect(selectPrimaryTarget([view("a"), view("b", { rangeMeters: 3_000 })], "b")?.id).toBe("a");
    expect(selectPrimaryTarget([view("a", { mode: "acquiring" }), view("b", { live: false, mode: "lost" })], "b")?.id)
      .toBe("a");
  });

  it("uses observer-relative positions to select among memory contacts with zero reported range", () => {
    const views = [
      view("a", { live: false, mode: "searching", rangeMeters: 0, position: { x: 1_000, y: 0, z: 0 } }),
      view("b", { live: false, mode: "searching", rangeMeters: 0, position: { x: 100, y: 0, z: 0 } }),
    ];
    expect(selectPrimaryTarget(views, "a", { x: 0, y: 0, z: 0 })?.id).toBe("b");
  });

  it("returns no target for empty or completely faded contacts", () => {
    expect(selectPrimaryTarget([])).toBeUndefined();
    expect(selectPrimaryTarget([view("a", { confidence: 0 }), view("b", { confidence: NaN })])).toBeUndefined();
  });

  it("does not mutate caller ordering and deterministically resolves equal distances", () => {
    const input = [view("z"), view("a")];
    expect(selectPrimaryTarget(input)?.id).toBe("a");
    expect(input.map(({ id }) => id)).toEqual(["z", "a"]);
  });
});
