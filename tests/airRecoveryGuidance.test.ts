import { describe, expect, it } from "vitest";
import { AIR_FLIGHT_PROFILE } from "../src/sim/airFlightModel";
import { AIR_NAVIGATION, AIR_OPERATION_TIMING, createAirSquadronState } from "../src/sim/airOperations";
import { airRecoveryFuelSeconds } from "../src/sim/airRecoveryGuidance";
import type { AircraftRole } from "../src/sim/types";

function aircraft(role: AircraftRole = "fighter") {
  const squadron = createAirSquadronState({ id: `recovery-${role}`, controllerId: "player", team: "player", role,
    position: { x: 0, y: 80, z: 0 }, recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: 0 } } });
  squadron.flight = { speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0 };
  return squadron;
}

describe("conservative recovery fuel guidance", () => {
  it.each(["fighter", "diveBomber", "torpedoBomber"] as const)("does not recall a full-fuel %s at launch", (role) => {
    const squadron = aircraft(role);
    for (const speed of [0, AIR_NAVIGATION.speedMetersPerSecond[role]]) {
      squadron.flight!.speedMetersPerSecond = speed;
      const budget = airRecoveryFuelSeconds(squadron, squadron.position);
      expect(budget).toBeGreaterThanOrEqual(35);
      expect(budget + AIR_OPERATION_TIMING.launchSeconds).toBeLessThan(squadron.fuelRemainingSeconds);
    }
  });

  it("grows with distance and plans below nominal cruise speed", () => {
    const squadron = aircraft();
    const near = airRecoveryFuelSeconds(squadron, { x: 0, y: 80, z: 0 });
    const far = airRecoveryFuelSeconds(squadron, { x: 0, y: 80, z: 5_200 });
    const halfTurn = Math.PI * 105 / (9.81 * Math.tan(AIR_FLIGHT_PROFILE.fighter.maximumBankRadians));
    // Near home the full re-entry circuit dominates; far away travel + half-turn dominates.
    expect(far - near).toBeCloseTo(5_200 / (105 * 0.8) - halfTurn);
    expect(far).toBeGreaterThan(5_200 / (105 * 0.8) + halfTurn + AIR_OPERATION_TIMING.landingSeconds + 12);
  });

  it("reserves descent time and more time for a slow or banked recovery", () => {
    const squadron = aircraft("torpedoBomber");
    const recovery = { x: 0, y: 80, z: 0 };
    squadron.position.z = 700;
    const low = airRecoveryFuelSeconds(squadron, recovery);
    squadron.position.y = 225;
    const high = airRecoveryFuelSeconds(squadron, recovery);
    expect(high - low).toBeCloseTo(145 / AIR_FLIGHT_PROFILE.torpedoBomber.verticalRateMetersPerSecond);
    squadron.flight!.speedMetersPerSecond = 40;
    squadron.flight!.bank = 0.5;
    squadron.flight!.pitch = -0.2;
    expect(airRecoveryFuelSeconds(squadron, recovery)).toBeGreaterThan(high);
  });

  it.each(["fighter", "diveBomber", "torpedoBomber"] as const)("budgets the observed near-home %s re-entry without enlarging fuel", (role) => {
    const squadron = aircraft(role);
    squadron.position = { x: 0, y: { fighter: 295, diveBomber: 390, torpedoBomber: 225 }[role], z: 700 };
    const budget = airRecoveryFuelSeconds(squadron, { x: 0, y: 80, z: 0 });
    const observedWorstLandingSeconds = { fighter: 36.74, diveBomber: 46.9, torpedoBomber: 59.54 }[role];
    expect(budget).toBeGreaterThan(observedWorstLandingSeconds + AIR_OPERATION_TIMING.landingSeconds);
    expect(budget).toBeLessThan(AIR_OPERATION_TIMING.enduranceSeconds[role]);
    expect(squadron.fuelRemainingSeconds).toBe(AIR_OPERATION_TIMING.enduranceSeconds[role]);
  });

  it("is finite for missing flight and malformed/extreme coordinates", () => {
    const squadron = aircraft();
    delete squadron.flight;
    expect(Number.isFinite(airRecoveryFuelSeconds(squadron, squadron.position))).toBe(true);
    squadron.position = { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: 0 };
    expect(Number.isFinite(airRecoveryFuelSeconds(squadron, { x: Number.NaN, y: 0, z: 0 }))).toBe(true);
    squadron.position.x = -Number.MAX_VALUE;
    expect(airRecoveryFuelSeconds(squadron, { x: Number.MAX_VALUE, y: 80, z: 0 })).toBe(3_600);
  });

  it("does not mutate aircraft fuel, flight, recovery point, or mission", () => {
    const squadron = aircraft();
    const recovery = { x: 0, y: 80, z: -5_200 };
    const before = structuredClone(squadron);
    const recoveryBefore = { ...recovery };
    expect(airRecoveryFuelSeconds(squadron, recovery)).toBe(airRecoveryFuelSeconds(squadron, recovery));
    expect(squadron).toEqual(before);
    expect(recovery).toEqual(recoveryBefore);
  });
});
