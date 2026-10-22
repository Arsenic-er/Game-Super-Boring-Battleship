import { afterEach, describe, expect, it, vi } from "vitest";
import * as footprint from "../src/sim/shipFootprint";
import * as terrain from "../src/maps/atollMap";
import { AiManeuverScheduler } from "../src/sim/aiManeuverScheduler";
import { FIXED_STEP } from "../src/sim/config";
import { predictShipManeuver, type ShipManeuverPlan } from "../src/sim/shipManeuver";
import { createDeveloperShipState } from "../src/sim/simulation";

function fixture(id = "a", embedded = false) {
  return createDeveloperShipState({ id, team: "player", shipClassId: "edinburgh",
    position: embedded ? { x: 1700, y: 0, z: 1600 } : { x: 0, y: 0, z: 0 },
    heading: 0, mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
}
const plan = (durationSeconds = 1): ShipManeuverPlan => ({
  segments: [{ durationSeconds, throttle: .5, rudder: .3 }], brakeToStop: false,
});
function tick(scheduler: AiManeuverScheduler, frame: number, ids = ["a"]) {
  scheduler.beginFrame(frame * FIXED_STEP, ids);
  scheduler.runBackground();
}
afterEach(() => vi.restoreAllMocks());

describe("instance-owned fair maneuver scheduler", () => {
  it("performs no work at frame setup or submission and shares its default ceiling", () => {
    const query = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const scheduler = new AiManeuverScheduler();
    scheduler.beginFrame(0, ["a"]);
    scheduler.submit("a", fixture(), "open-sea-range", [plan(20)]);
    expect(query).not.toHaveBeenCalled();
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    scheduler.runBackground();
    expect(scheduler.work.motionSteps).toBe(1024);
    expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(64);
    const first = scheduler.work;
    scheduler.runBackground();
    expect(scheduler.work.motionSteps).toBe(1024);
    expect(scheduler.work.terrainQueries).toBeGreaterThanOrEqual(first.terrainQueries);
    expect(scheduler.result("a")).toBeUndefined();
  });

  it("rotates incomplete owners across frames instead of restarting from the first ship", () => {
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 30, maxTerrainQueries: 2 });
    const ids = ["a", "b", "c"];
    scheduler.beginFrame(0, ids);
    for (const id of ids) scheduler.submit(id, fixture(id), "open-sea-range", [plan(1)]);
    const completed: string[] = [];
    for (let frame = 0; frame < 9; frame++) {
      tick(scheduler, frame, ids);
      expect(scheduler.work.motionSteps).toBeLessThanOrEqual(30);
      expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(2);
      for (const id of ids) if (scheduler.result(id) && !completed.includes(id)) completed.push(id);
    }
    expect(completed).toEqual(ids);
    expect(scheduler.getTelemetry().queuedOwners).toBe(0);
    for (const id of ids) expect(scheduler.result(id)?.results[0]?.status).toBe("clear");
  });

  it("shares foreground confirmation consumption with background work in the same frame", () => {
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 45, maxTerrainQueries: 4 });
    const s = fixture(), confirmPlan = plan(.25);
    scheduler.beginFrame(0, ["a"]);
    scheduler.submit("a", s, "open-sea-range", [plan(.5)]);
    const confirmed = scheduler.confirm("a", "open-sea-range", s, confirmPlan);
    expect(confirmed.status).toBe("clear");
    expect(scheduler.work).toEqual({ motionSteps: 15, terrainQueries: 2 });
    scheduler.runBackground();
    expect(scheduler.work).toEqual({ motionSteps: 45, terrainQueries: 4 });
    expect(scheduler.remaining).toEqual({ motionSteps: 0, terrainQueries: 0 });
    expect(scheduler.result("a")?.results[0]?.status).toBe("clear");
    const query = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const blockedByBudget = scheduler.confirm("a", "open-sea-range", s, confirmPlan);
    expect(blockedByBudget.status).toBe("incomplete");
    expect(blockedByBudget.reason).toBe("terrain-budget");
    expect(query).not.toHaveBeenCalled();
    expect(scheduler.getTelemetry().queuedOwners).toBe(0);
  });

  it("uses a fresh ship pose for confirmation without replacing the queued generation", () => {
    const scheduler = new AiManeuverScheduler();
    const s = fixture();
    scheduler.beginFrame(10, ["a"]);
    const generation = scheduler.submit("a", s, "atoll-prototype", [plan(1)]);
    s.position = { x: 1700, y: 0, z: 1600 };
    const confirmation = scheduler.confirm("a", "atoll-prototype", s, plan(.1));
    expect(confirmation.reason).toBe("initial-contact");
    scheduler.runBackground();
    expect(scheduler.result("a")?.generation).toBe(generation);
    expect(scheduler.result("a")?.createdAt).toBe(10);
    expect(scheduler.result("a")?.results[0]?.status).toBe("clear");
  });

  it.each([
    { maxMotionSteps: 0, maxTerrainQueries: 4, reason: "motion-budget" },
    { maxMotionSteps: 30, maxTerrainQueries: 0, reason: "terrain-budget" },
  ])("never certifies fresh confirmation clear when the frame has no usable budget: %j", limits => {
    const scheduler = new AiManeuverScheduler(limits), s = fixture();
    scheduler.beginFrame(0, ["a"]);
    const query = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const result = scheduler.confirm("a", "open-sea-range", s, plan(.1));
    expect(result.status).toBe("incomplete"); expect(result.reason).toBe(limits.reason);
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it("replaces pending and completed generations without leaking any former result", () => {
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 30, maxTerrainQueries: 4 });
    const s = fixture();
    scheduler.beginFrame(0, ["a"]);
    const old = scheduler.submit("a", s, "open-sea-range", [plan(10)]);
    scheduler.runBackground(); expect(scheduler.result("a")).toBeUndefined();
    scheduler.beginFrame(1, ["a"]);
    const replacement = scheduler.submit("a", s, "open-sea-range", [plan(.1)]);
    expect(old).toBeDefined(); expect(replacement).toBeGreaterThan(old!);
    scheduler.runBackground();
    expect(scheduler.result("a")?.generation).toBe(replacement);
    expect(scheduler.result("a")?.createdAt).toBe(1);
    const newest = scheduler.submit("a", s, "open-sea-range", [plan(.2)]);
    expect(scheduler.result("a")).toBeUndefined();
    tick(scheduler, 120);
    expect(scheduler.result("a")?.generation).toBe(newest);
    expect(scheduler.result("a")?.results[0]?.motionSteps).toBe(12);
  });

  it("prunes both pending jobs and published results when owners die or switch to humans", () => {
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 30, maxTerrainQueries: 4 });
    scheduler.beginFrame(0, ["a", "b"]);
    scheduler.submit("a", fixture("a"), "open-sea-range", [plan(.1)]);
    scheduler.submit("b", fixture("b"), "open-sea-range", [plan(10)]);
    scheduler.runBackground();
    expect(scheduler.result("a")).toBeDefined();
    expect(scheduler.getTelemetry().queuedOwners).toBe(1);
    scheduler.beginFrame(1, []);
    expect(scheduler.result("a")).toBeUndefined(); expect(scheduler.result("b")).toBeUndefined();
    expect(scheduler.getTelemetry().queuedOwners).toBe(0);
    scheduler.runBackground(); expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    expect(() => scheduler.submit("a", fixture("a"), "open-sea-range", [plan()])).toThrow(RangeError);
  });

  it("clears all state on rewind and reset while preserving unique generation receipts", () => {
    const scheduler = new AiManeuverScheduler();
    scheduler.beginFrame(10, ["a", "b"]);
    const old = scheduler.submit("a", fixture(), "open-sea-range", [plan(.1)]);
    scheduler.submit("b", fixture("b"), "open-sea-range", [plan(20)]);
    scheduler.runBackground();
    expect(scheduler.result("a")).toBeDefined();
    scheduler.beginFrame(2, ["a", "b"]);
    expect(scheduler.result("a")).toBeUndefined();
    expect(scheduler.getTelemetry().queuedOwners).toBe(0);
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    const generation = scheduler.submit("a", fixture(), "open-sea-range", [plan(.1)]);
    expect(old).toBeDefined(); expect(generation).toBeGreaterThan(old!);
    scheduler.reset();
    expect(scheduler.getTelemetry().time).toBeUndefined();
    expect(scheduler.getTelemetry().activeOwners).toBe(0);
    expect(scheduler.totals).toEqual({ motionSteps: 0, terrainQueries: 0 });
  });

  it("does not replenish a spent budget when beginFrame is called again at the same timestamp", () => {
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 6, maxTerrainQueries: 2 });
    scheduler.beginFrame(0, ["a"]);
    scheduler.confirm("a", "open-sea-range", fixture(), plan(.1));
    const spent = scheduler.work;
    scheduler.beginFrame(0, ["a"]);
    expect(scheduler.work).toEqual(spent);
    expect(scheduler.remaining.motionSteps).toBe(0);
    scheduler.beginFrame(FIXED_STEP, ["a"]);
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
  });

  it("isolates separate battles and returns detached telemetry/result copies", () => {
    const left = new AiManeuverScheduler(), right = new AiManeuverScheduler();
    left.beginFrame(0, ["a"]); right.beginFrame(0, ["a"]);
    left.submit("a", fixture(), "open-sea-range", [plan(.1)]); left.runBackground();
    expect(right.work).toEqual({ motionSteps: 0, terrainQueries: 0 });
    expect(right.result("a")).toBeUndefined();
    const published = left.result("a")!, expected = structuredClone(published);
    published.results[0]!.end.position.x = 12345; published.results.length = 0;
    const work = left.work; work.motionSteps = 0;
    const telemetry = left.getTelemetry(); telemetry.remaining.motionSteps = 0;
    expect(left.result("a")).toEqual(expected); expect(left.work.motionSteps).toBe(6);
    expect(left.remaining.motionSteps).toBe(1018);
  });

  it("stops after a clear primary without spending work on its alternatives", () => {
    const scheduler = new AiManeuverScheduler();
    const s = fixture(), primary = plan(.5);
    scheduler.beginFrame(0, ["a"]);
    scheduler.submit("a", s, "open-sea-range", [primary, plan(20), plan(40)]);
    scheduler.runBackground();
    const result = scheduler.result("a")!;
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual(predictShipManeuver("open-sea-range", s, primary,
      { maxMotionSteps: 3600, maxTerrainQueries: 256 }));
    expect(scheduler.work).toEqual({ motionSteps: 30, terrainQueries: 2 });
  });

  it("stops after an incomplete primary rather than using alternatives as a false safety certificate", () => {
    const scheduler = new AiManeuverScheduler();
    const s = fixture();
    s.developer = { enabled: true, speedMultiplier: 1, forcedSpeedKnots: 8,
      unrestrictedWeapons: false, infiniteAmmunition: false, instantReload: false };
    scheduler.beginFrame(0, ["a"]);
    scheduler.submit("a", s, "open-sea-range", [{ segments: [], brakeToStop: true }, plan(.1)]);
    for (let i = 0; i < 5 && !scheduler.result("a"); i++) tick(scheduler, i);
    const result = scheduler.result("a")!;
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.reason).toBe("motion-budget");
    expect(result.results[0]?.motionSteps).toBe(3600);
  });

  it("runs the same-snapshot alternatives only after a blocked primary, across frame budgets", () => {
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 30, maxTerrainQueries: 2 });
    const s = fixture("a", true);
    scheduler.beginFrame(0, ["a"]);
    scheduler.submit("a", s, "atoll-prototype", [plan(), { segments: [], brakeToStop: true }, plan(.1)]);
    s.position = { x: 0, y: 0, z: 0 };
    scheduler.runBackground(); expect(scheduler.result("a")).toBeUndefined();
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 2 });
    tick(scheduler, 1);
    const result = scheduler.result("a")!;
    expect(result.results).toHaveLength(3);
    expect(result.results.every(item => item.reason === "initial-contact")).toBe(true);
    expect(scheduler.work).toEqual({ motionSteps: 0, terrainQueries: 1 });
  });

  it("enforces the frame ceiling even when every envelope requires thirty refinement queries", () => {
    vi.spyOn(footprint, "shipTerrainTrajectoryEnvelopeContact")
      .mockReturnValue({ blocked: true, boundary: false, zoneIds: ["conservative-pocket"] });
    const initial = vi.spyOn(footprint, "shipTerrainFootprintContact");
    const envelope = vi.mocked(footprint.shipTerrainTrajectoryEnvelopeContact);
    const sweep = vi.spyOn(footprint, "constrainShipTerrainMotion");
    const water = vi.spyOn(terrain, "terrainNavigationAt");
    const scheduler = new AiManeuverScheduler({ maxMotionSteps: 90, maxTerrainQueries: 7 });
    const ids = ["a", "b", "c"];
    scheduler.beginFrame(0, ids);
    for (const id of ids) scheduler.submit(id, fixture(id), "open-sea-range", [plan(.5)]);
    for (let frame = 0; frame < 20; frame++) {
      const beforeQueries = initial.mock.calls.length + envelope.mock.calls.length + sweep.mock.calls.length;
      const beforeWater = water.mock.calls.length;
      tick(scheduler, frame, ids);
      expect(scheduler.work.terrainQueries).toBeLessThanOrEqual(7);
      expect(scheduler.work.motionSteps).toBeLessThanOrEqual(90);
      expect(initial.mock.calls.length + envelope.mock.calls.length + sweep.mock.calls.length - beforeQueries)
        .toBe(scheduler.work.terrainQueries);
      expect(water.mock.calls.length - beforeWater).toBe(scheduler.work.motionSteps);
      if (ids.every(id => scheduler.result(id))) break;
    }
    expect(ids.every(id => scheduler.result(id)?.results[0]?.status === "clear")).toBe(true);
    expect(scheduler.totals).toEqual({ motionSteps: 90, terrainQueries: 96 });
  });

  it("copies plan contents immediately and preserves ship/plan inputs", () => {
    const scheduler = new AiManeuverScheduler(), s = fixture();
    const primary = plan(.1), beforeShip = structuredClone(s), beforePlan = structuredClone(primary);
    const expected = predictShipManeuver("open-sea-range", s, primary);
    scheduler.beginFrame(0, ["a"]); scheduler.submit("a", s, "open-sea-range", [primary]);
    expect(s).toEqual(beforeShip); expect(primary).toEqual(beforePlan);
    s.speedKnots = 100; s.performance.turnMultiplier = 10;
    (primary.segments[0] as { durationSeconds: number }).durationSeconds = 20;
    scheduler.runBackground();
    expect(scheduler.result("a")?.results[0]).toEqual(expected);
  });


  it("accepts developer fleets above 64 ships while bounding resident jobs and completed results", () => {
    const ids = Array.from({ length: 80 }, (_, i) => "ship-" + i);
    const scheduler = new AiManeuverScheduler();
    expect(() => scheduler.beginFrame(0, ids)).not.toThrow();
    expect(scheduler.getTelemetry().activeOwners).toBe(80);
    for (const id of ids.slice(0, 64)) {
      expect(scheduler.submit(id, fixture(id), "open-sea-range", [plan(0)])).toBeTypeOf("number");
    }
    const overflow = fixture(ids[64]!);
    Object.defineProperty(overflow, "performance", { get() { throw new Error("Must not snapshot overflow"); } });
    expect(scheduler.submit(overflow.id, overflow, "open-sea-range", [plan()])).toBeUndefined();
    expect(scheduler.getTelemetry().queuedOwners).toBe(64);
    scheduler.runBackground();
    expect(scheduler.getTelemetry().completedOwners).toBe(64);
    expect(scheduler.getTelemetry().queuedOwners).toBe(0);
    expect(scheduler.submit(ids[65]!, fixture(ids[65]!), "open-sea-range", [plan()])).toBeUndefined();
    scheduler.beginFrame(FIXED_STEP, ids);
    // Fresh emergency confirmations do not require a free background slot.
    expect(scheduler.confirm(ids[79]!, "open-sea-range", fixture(ids[79]!), plan(.1)).status).toBe("clear");
    scheduler.cancel(ids[0]!);
    expect(scheduler.submit(ids[65]!, fixture(ids[65]!), "open-sea-range", [plan(.1)])).toBeTypeOf("number");
    expect(scheduler.getTelemetry().queuedOwners + scheduler.getTelemetry().completedOwners).toBe(64);
    // Replacing an existing resident is also allowed at capacity.
    expect(scheduler.submit(ids[1]!, fixture(ids[1]!), "open-sea-range", [plan(.1)])).toBeTypeOf("number");
    expect(scheduler.getTelemetry().queuedOwners + scheduler.getTelemetry().completedOwners).toBe(64);
  });

  it.each([
    { maxMotionSteps: -1 }, { maxTerrainQueries: -1 }, { maxMotionSteps: Infinity },
    { maxTerrainQueries: 1.5 }, { maxMotionSteps: 7201 }, { maxTerrainQueries: 1025 },
  ])("rejects invalid frame budget %j", budget => {
    expect(() => new AiManeuverScheduler(budget)).toThrow(RangeError);
  });

  it("bounds plans and rejects invalid frame/owner use without losing prior work", () => {
    const scheduler = new AiManeuverScheduler();
    expect(() => scheduler.submit("a", fixture(), "open-sea-range", [plan()])).toThrow(RangeError);
    expect(() => scheduler.beginFrame(NaN, ["a"])).toThrow(RangeError);
    expect(() => scheduler.beginFrame(0, ["a"], 0)).toThrow(RangeError);
    scheduler.beginFrame(0, new Set(["a"]));
    const generation = scheduler.submit("a", fixture(), "open-sea-range", [plan(.1)]);
    expect(() => scheduler.submit("a", fixture(), "open-sea-range", [])).toThrow(RangeError);
    expect(() => scheduler.submit("a", fixture(), "open-sea-range", [plan(), plan(), plan(), plan()])).toThrow(RangeError);
    expect(() => scheduler.submit("b", fixture("b"), "open-sea-range", [plan()])).toThrow(RangeError);
    expect(() => scheduler.confirm("a", "open-sea-range", fixture("b"), plan())).toThrow(RangeError);
    scheduler.runBackground();
    expect(scheduler.result("a")?.generation).toBe(generation);
  });
});
