import { describe, expect, it } from "vitest";
import { AIR_OPERATION_TIMING, createAirSquadronState } from "../src/sim/airOperations";
import {
  buildAirSquadronStatusView,
  formatAirDuration,
} from "../src/ui/airSquadronStatus";

describe("air squadron status view", () => {
  it("reports fighter strength, fuel and gun ammunition", () => {
    const squadron = createAirSquadronState({
      id: "fighter-status", controllerId: "player", team: "player", role: "fighter",
      recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: 0 } },
      position: { x: 0, y: 180, z: 0 }, aircraftCapacity: 6, now: 0,
    });
    squadron.airframeHealth = 450;
    squadron.aircraftOperational = 5;
    squadron.fuelRemainingSeconds = AIR_OPERATION_TIMING.enduranceSeconds.fighter / 2;
    const view = buildAirSquadronStatusView(0, squadron);
    expect(view).toMatchObject({
      aircraftOperational: 5,
      aircraftCapacity: 6,
      strengthPercent: 75,
      fuelPercent: 50,
      resourceKind: "ammo",
      resourceCurrent: 6,
      resourceMaximum: 6,
    });
  });

  it("shows bomber ordnance and deterministic rearm progress", () => {
    const squadron = createAirSquadronState({
      id: "bomber-status", controllerId: "player", team: "player", role: "diveBomber",
      recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: 0 } },
      position: { x: 0, y: 180, z: 0 }, now: 0,
    });
    squadron.phase = "rearming";
    squadron.phaseStartedAt = 10;
    squadron.ordnanceRemaining = 0;
    const midpoint = 10 + AIR_OPERATION_TIMING.rearmSeconds.diveBomber / 2;
    expect(buildAirSquadronStatusView(midpoint, squadron)).toMatchObject({
      resourceKind: "ordnance",
      resourceCurrent: 0,
      resourceMaximum: 1,
      rearmRemainingSeconds: 21,
      rearmPercent: 50,
    });
  });

  it("formats duration without negative values", () => {
    expect(formatAirDuration(191.2)).toBe("03:12");
    expect(formatAirDuration(-5)).toBe("00:00");
  });
});
