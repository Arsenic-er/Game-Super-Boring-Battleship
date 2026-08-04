import { describe, expect, it } from "vitest";
import {
  AIR_FLIGHT_PROFILE,
  advanceAirKinematics,
  airSquadronTargetAltitude,
} from "../src/sim/airFlightModel";

describe("air squadron flight model", () => {
  it("assigns role-specific and squadron-specific altitude layers", () => {
    const fighter = airSquadronTargetAltitude("fighter", "outbound", "fighter-alpha", 0);
    const secondFighter = airSquadronTargetAltitude("fighter", "outbound", "fighter-bravo", 0);
    const diveBomber = airSquadronTargetAltitude("diveBomber", "outbound", "dive-alpha", 0);
    const torpedoAttack = airSquadronTargetAltitude("torpedoBomber", "attackRun", "torp-alpha", 0);
    expect(fighter).not.toBe(secondFighter);
    expect(diveBomber).toBeGreaterThan(fighter);
    expect(torpedoAttack).toBeLessThan(90);
  });

  it("limits heading change instead of snapping to the destination", () => {
    const result = advanceAirKinematics({
      id: "fighter-alpha",
      role: "fighter",
      phase: "outbound",
      position: { x: 0, y: 180, z: 0 },
      heading: 0,
      destination: { x: 1_000, y: 300, z: 0 },
      speedMetersPerSecond: 100,
      dt: .5,
      time: 5,
      canMove: true,
    });
    expect(result.heading).toBeCloseTo(AIR_FLIGHT_PROFILE.fighter.maximumTurnRateRadians * .5);
    expect(result.position.z).toBeGreaterThan(0);
    expect(result.position.x).toBeGreaterThan(0);
  });

  it("climbs and descends gradually", () => {
    const climb = advanceAirKinematics({
      id: "dive-alpha",
      role: "diveBomber",
      phase: "outbound",
      position: { x: 0, y: 100, z: 0 },
      heading: 0,
      destination: { x: 0, y: 0, z: 1_000 },
      speedMetersPerSecond: 90,
      dt: 1,
      time: 0,
      canMove: true,
    });
    expect(climb.position.y).toBe(100 + AIR_FLIGHT_PROFILE.diveBomber.verticalRateMetersPerSecond);
    const dive = advanceAirKinematics({
      id: "dive-alpha",
      role: "diveBomber",
      phase: "attackRun",
      position: { x: 0, y: 390, z: 0 },
      heading: 0,
      destination: { x: 0, y: 0, z: 1_000 },
      speedMetersPerSecond: 90,
      dt: 1,
      time: 0,
      canMove: true,
    });
    expect(dive.position.y).toBe(390 - AIR_FLIGHT_PROFILE.diveBomber.verticalRateMetersPerSecond);
  });
});
