import { describe, expect, it } from "vitest";
import { shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { createDeveloperShipState } from "../src/sim/simulation";

const mapId = "atoll-prototype";
const bow = 1.9319642701386281;
const blockedPosition = { x: 839.8414641286926, y: 0, z: -1226.4256758616373 };

// A public pose/time boundary fixture, not a continuous physics replay. A real
// shallow approach starts reverse; public relocation then reaches reorientation.
// No private recovery state or terrain implementation is injected.
function committedRecovery() {
  const self = createDeveloperShipState({
    id: "interrupt-cache-richelieu", team: "player", shipClassId: "richelieu",
    position: { x: blockedPosition.x + Math.sin(bow) * 280, y: 0,
      z: blockedPosition.z + Math.cos(bow) * 280 },
    heading: bow, mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  const syncWater = () => {
    const water = terrainNavigationAt(mapId, self.position.x, self.position.z, shipDraftMeters(self.shipClassId));
    self.navigationZone = water.kind; self.waterDepthMeters = water.depthMeters;
  };
  syncWater();
  expect(self.navigationZone).toBe("deep");
  const recovery = new AiNavigationRecovery();
  expect(recovery.command(mapId, self, 4.28, 0)).toMatchObject({ recovering: true, throttleLimit: -.25 });

  self.position = { ...blockedPosition }; self.previousPosition = { ...blockedPosition };
  syncWater();
  expect(recovery.command(mapId, self, 4.28, 241)).toMatchObject({ recovering: true, throttleLimit: 0 });
  expect(recovery.command(mapId, self, .43, 241.6).desiredHeading).toBeCloseTo(.43, 10);
  const committed = recovery.command(mapId, self, 4.28, 242.2);
  expect(committed).toMatchObject({ recovering: true, throttleLimit: 0 });
  expect(committed.desiredHeading).toBeCloseTo(.43, 10);
  expect(recovery.getTelemetry()).toMatchObject({
    phase: "reorienting", forwardClear: false, exitCommitted: true,
  });
  return { self, recovery, committed };
}

describe("a one-shot recovery interruption survives the existing planning cache", () => {
  it.each([242.21, 242.4, 242.69])("clears the old exit when the only true pulse is cached at %s", pulseTime => {
    const { self, recovery, committed } = committedRecovery();
    const before = structuredClone(self);
    // The event occurs before the 242.7 planning deadline. Its immediate output
    // and telemetry still describe the previous plan, not an invented replan.
    expect(recovery.command(mapId, self, 4.28, pulseTime, true)).toEqual(committed);
    expect(recovery.getTelemetry()?.exitCommitted).toBe(true);
    expect(recovery.command(mapId, self, 4.28, pulseTime + .005, false)).toEqual(committed);

    // There is deliberately no second true call. The previous cached event must
    // have cleared the retained exit before these new ordinary plans are made.
    const replanned = recovery.command(mapId, self, 4.28, 242.8, false);
    expect(replanned).toMatchObject({ recovering: true, throttleLimit: 0 });
    expect(replanned.desiredHeading).toBeCloseTo(4.28, 10);
    expect(recovery.getTelemetry()).toMatchObject({
      phase: "reorienting", forwardClear: false, exitCommitted: false,
    });
    expect(recovery.command(mapId, self, 4.15, 243.4, false).desiredHeading).toBeCloseTo(4.15, 10);
    expect(recovery.getTelemetry()?.exitCommitted).toBe(false);
    expect(self).toEqual(before);
  });

  it("keeps a safe demonstrated commitment through repeated false calls and replans", () => {
    const { self, recovery, committed } = committedRecovery();
    const before = structuredClone(self);
    for (const time of [242.21, 242.4, 242.69]) {
      expect(recovery.command(mapId, self, 4.28, time, false)).toEqual(committed);
    }
    for (const [time, desired] of [[242.8, 4.28], [243.4, 4.15], [244, 4.05]]) {
      expect(recovery.command(mapId, self, desired, time, false).desiredHeading).toBeCloseTo(.43, 10);
      expect(recovery.getTelemetry()).toMatchObject({
        phase: "reorienting", forwardClear: false, exitCommitted: true,
      });
    }
    expect(self).toEqual(before);
  });
});
