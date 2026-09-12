import { describe, expect, it } from "vitest";
import { AIR_FLIGHT_PROFILE, advanceAirKinematics, airSquadronTargetAltitude } from "../src/sim/airFlightModel";

describe("air squadron flight model", () => {
  it("assigns stable role-specific and squadron-specific altitude layers", () => {
    const fighter = airSquadronTargetAltitude("fighter", "outbound", "fighter-alpha", 0);
    const secondFighter = airSquadronTargetAltitude("fighter", "outbound", "fighter-bravo", 0);
    const diveBomber = airSquadronTargetAltitude("diveBomber", "outbound", "dive-alpha", 0);
    const torpedoAttack = airSquadronTargetAltitude("torpedoBomber", "attackRun", "torp-alpha", 0);
    expect(fighter).not.toBe(secondFighter);
    expect(diveBomber).toBeGreaterThan(fighter);
    expect(torpedoAttack).toBeLessThan(90);
    expect(airSquadronTargetAltitude("fighter", "outbound", "fighter-alpha", 100)).toBe(fighter);
  });

  it("rolls into a coordinated turn instead of directly stepping heading to its rate limit", () => {
    const result = advanceAirKinematics({
      id: "fighter-alpha", role: "fighter", phase: "outbound",
      position: { x: 0, y: 300, z: 0 }, heading: 0,
      destination: { x: 10_000, y: 300, z: 0 }, targetAltitude: 300,
      speedMetersPerSecond: 100, dt: .5, time: 5, canMove: true,
    });
    expect(result.flight.bank).toBeGreaterThan(0);
    expect(result.flight.bank).toBeLessThanOrEqual(AIR_FLIGHT_PROFILE.fighter.rollRateRadiansPerSecond * .5 + 1e-9);
    expect(result.heading).toBeGreaterThan(0);
    expect(result.heading).toBeLessThan(AIR_FLIGHT_PROFILE.fighter.maximumTurnRateRadians * .5 * .25);
    expect(result.position.z).toBeGreaterThan(45);
    expect(result.position.x).toBeGreaterThan(0);
  });

  it("changes height through bounded pitch and forward motion, not a vertical elevator", () => {
    const base = {
      id: "dive-alpha", role: "diveBomber" as const, heading: 0,
      destination: { x: 0, y: 0, z: 10_000 },
      speedMetersPerSecond: 90, dt: 1, time: 0, canMove: true,
    };
    const climb = advanceAirKinematics({ ...base, phase: "outbound", position: { x: 0, y: 100, z: 0 } });
    expect(climb.flight.pitch).toBeGreaterThan(0);
    expect(climb.position.y).toBeGreaterThan(103);
    expect(climb.position.y).toBeLessThan(100 + AIR_FLIGHT_PROFILE.diveBomber.verticalRateMetersPerSecond);
    expect(climb.position.z).toBeGreaterThan(80);
    const dive = advanceAirKinematics({ ...base, phase: "attackRun", position: { x: 0, y: 390, z: 0 }, targetPitch: -1 });
    expect(dive.flight.pitch).toBeLessThan(0);
    expect(dive.position.y).toBeLessThan(385);
    expect(dive.position.y).toBeGreaterThan(360);
    expect(dive.position.z).toBeGreaterThan(80);
  });
});
