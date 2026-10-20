import { afterEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { type BattleMapId, shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { createDeveloperShipState } from "../src/sim/simulation";

const bow = 1.9319642701386281;
const blockedPosition = { x: 839.8414641286926, y: 0, z: -1226.4256758616373 };

function fixture() {
  const self = createDeveloperShipState({
    id: "telemetry-richelieu", team: "player", shipClassId: "richelieu",
    position: { x: blockedPosition.x + Math.sin(bow) * 280, y: 0,
      z: blockedPosition.z + Math.cos(bow) * 280 },
    heading: bow, mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  self.navigationZone = terrainNavigationAt("atoll-prototype", self.position.x,
    self.position.z, shipDraftMeters(self.shipClassId)).kind;
  return { self, recovery: new AiNavigationRecovery(), reference: new AiNavigationRecovery() };
}
type Fixture = ReturnType<typeof fixture>;

// Read telemetry repeatedly around a real command and compare with an identical
// navigator receiving no telemetry reads. No private recovery state is injected.
function command(f: Fixture, map: BattleMapId, desired: number, time: number, urgent = false) {
  const before = structuredClone(f.self);
  const priorSnapshot = f.recovery.getTelemetry();
  const priorValue = structuredClone(priorSnapshot);
  for (let read = 0; read < 4; ++read) expect(f.recovery.getTelemetry()).toEqual(priorValue);
  const expected = f.reference.command(map, structuredClone(f.self), desired, time, urgent);
  const actual = f.recovery.command(map, f.self, desired, time, urgent);
  expect(actual).toEqual(expected);
  expect(f.self).toEqual(before);
  expect(priorSnapshot).toEqual(priorValue);
  const value = f.recovery.getTelemetry();
  for (let read = 0; read < 4; ++read) expect(f.recovery.getTelemetry()).toEqual(value);
  return actual;
}

function blockedReorientation() {
  const f = fixture();
  expect(f.self.navigationZone).toBe("deep");
  expect(command(f, "atoll-prototype", 4.28, 0)).toMatchObject({ recovering: true, throttleLimit: -.25 });
  // Public position/time boundary fixture: the first real shallow approach has
  // timed out in safe water. This is not a continuous battle replay.
  f.self.position = { ...blockedPosition }; f.self.previousPosition = { ...blockedPosition };
  f.self.navigationZone = terrainNavigationAt("atoll-prototype", f.self.position.x,
    f.self.position.z, shipDraftMeters(f.self.shipClassId)).kind;
  expect(command(f, "atoll-prototype", 4.28, 241)).toMatchObject({ recovering: true, throttleLimit: 0 });
  return f;
}

function committedReorientation() {
  const f = blockedReorientation();
  command(f, "atoll-prototype", .43, 241.6);
  expect(command(f, "atoll-prototype", 4.28, 242.2).desiredHeading).toBeCloseTo(.43, 10);
  expect(f.recovery.getTelemetry()).toMatchObject({ phase: "reorienting", forwardClear: false, exitCommitted: true });
  return f;
}

afterEach(() => vi.restoreAllMocks());

describe("read-only navigation planning telemetry", () => {
  it("is absent before planning and reports cruising without fabricated clearance or commitment", () => {
    const f = fixture();
    expect(f.recovery.getTelemetry()).toBeUndefined();
    expect(command(f, "open-sea-range", .8, 0).recovering).toBe(false);
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "cruising" });
    expect(f.recovery.getTelemetry()?.throttleLimit).toBeUndefined();
    expect(f.recovery.getTelemetry()?.forwardClear).toBeUndefined();
    expect(f.recovery.getTelemetry()?.exitCommitted).toBeUndefined();
  });

  it("reports a terrain-triggered reverse and its actual throttle without claiming a bow check", () => {
    const f = fixture();
    expect(command(f, "atoll-prototype", 4.28, 0).throttleLimit).toBe(-.25);
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "reversing", throttleLimit: -.25 });
    expect(f.recovery.getTelemetry()?.forwardClear).toBeUndefined();
    expect(f.recovery.getTelemetry()?.exitCommitted).toBeUndefined();
    f.self.modules.engine.health = 0;
    expect(command(f, "atoll-prototype", 4.28, .6).throttleLimit).toBe(0);
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "reversing", throttleLimit: 0 });
  });

  it("reports blocked reorientation rather than mislabeling zero throttle as idle cruising", () => {
    const f = blockedReorientation();
    expect(f.recovery.getTelemetry()).toMatchObject({
      phase: "reorienting", throttleLimit: 0, forwardClear: false, exitCommitted: false,
    });
  });

  it("retains the last actual clearance calculation through cached calls and performs no work in getters", () => {
    const f = blockedReorientation(), snapshot = f.recovery.getTelemetry();
    f.self.position = { x: 0, y: 0, z: 0 }; f.self.previousPosition = { ...f.self.position }; f.self.heading = 0;
    const query = vi.spyOn(terrain, "firstNavigationHazard");
    const beforeReads = query.mock.calls.length;
    for (let read = 0; read < 12; ++read) expect(f.recovery.getTelemetry()).toEqual(snapshot);
    expect(query).toHaveBeenCalledTimes(beforeReads);
    expect(command(f, "open-sea-range", 1.2, 241.1).throttleLimit).toBe(0);
    expect(query).toHaveBeenCalledTimes(beforeReads);
    expect(f.recovery.getTelemetry()).toEqual(snapshot);
    expect(command(f, "open-sea-range", 1.2, 241.6).throttleLimit).toBe(.18);
    expect(query.mock.calls.length).toBeGreaterThan(beforeReads);
    expect(f.recovery.getTelemetry()).toMatchObject({
      phase: "reorienting", throttleLimit: .18, forwardClear: true, exitCommitted: false,
    });
  });

  it("reports a demonstrated exit commitment and its urgent invalidation at the real planning cadence", () => {
    const f = committedReorientation();
    expect(command(f, "atoll-prototype", 4.28, 242.3, true).desiredHeading).toBeCloseTo(.43, 10);
    // The urgent request clears internal intent immediately, but the command is
    // still cached: telemetry must describe that last actual planning result.
    expect(f.recovery.getTelemetry()?.exitCommitted).toBe(true);
    expect(command(f, "atoll-prototype", 4.28, 242.8, true).desiredHeading).toBeCloseTo(4.28, 10);
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "reorienting", forwardClear: false, exitCommitted: false });
  });

  it("removes reorientation-only fields when normal navigation resumes", () => {
    const f = blockedReorientation();
    f.self.position = { x: 0, y: 0, z: 0 }; f.self.previousPosition = { ...f.self.position }; f.self.heading = 0;
    command(f, "open-sea-range", 1.2, 241.6);
    const prior = f.recovery.getTelemetry();
    f.self.heading = 1.2;
    expect(command(f, "open-sea-range", 1.2, 242.2).recovering).toBe(false);
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "cruising" });
    expect(f.recovery.getTelemetry()?.forwardClear).toBeUndefined();
    expect(f.recovery.getTelemetry()?.exitCommitted).toBeUndefined();
    expect(prior).toMatchObject({ phase: "reorienting", forwardClear: true });
  });

  it("clears reorientation-only details when a new real shallow approach requires reverse", () => {
    const f = committedReorientation(), fresh = fixture();
    f.self.position = { ...fresh.self.position }; f.self.previousPosition = { ...f.self.position };
    f.self.heading = fresh.self.heading; f.self.navigationZone = fresh.self.navigationZone;
    expect(command(f, "atoll-prototype", 4.28, 242.8)).toMatchObject({
      recovering: true, throttleLimit: -.25,
    });
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "reversing", throttleLimit: -.25 });
    expect(f.recovery.getTelemetry()?.forwardClear).toBeUndefined();
    expect(f.recovery.getTelemetry()?.exitCommitted).toBeUndefined();
  });

  it("returns a detached snapshot that cannot mutate navigation decisions or later reads", () => {
    const f = committedReorientation(), snapshot = f.recovery.getTelemetry()!;
    const value = structuredClone(snapshot);
    Object.assign(snapshot, { phase: "cruising", throttleLimit: 1, forwardClear: true, exitCommitted: false });
    expect(f.recovery.getTelemetry()).toEqual(value);
    expect(command(f, "atoll-prototype", 4.15, 242.8).desiredHeading).toBeCloseTo(.43, 10);
    expect(f.recovery.getTelemetry()).toMatchObject({ phase: "reorienting", throttleLimit: 0, exitCommitted: true });
  });
});
