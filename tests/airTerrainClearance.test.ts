import { describe, expect, it } from "vitest";
import { ATOLL_TERRAIN_ZONES, terrainHeightAt } from "../src/maps/atollMap";
import { AIR_FLIGHT_PROFILE, advanceAirKinematics } from "../src/sim/airFlightModel";
import { airTerrainClearance } from "../src/sim/airTerrainClearance";
import { AIR_NAVIGATION } from "../src/sim/airOperations";
import type { AircraftRole, AirSquadronState, Vec3 } from "../src/sim/types";

type FlightActor = Pick<AirSquadronState, "role" | "position" | "heading" | "flight">;
const aircraft = (role: AircraftRole = "torpedoBomber"): FlightActor => ({
  role, position: { x: 1680, y: 55, z: 1790 - 82 * 35 }, heading: 0,
  flight: { speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0 },
});
const north: Vec3 = { x: 1680, y: 55, z: 5500 };

describe("predictive aircraft terrain clearance", () => {
  it("keeps open sea and the central north/south navigation channel low", () => {
    expect(airTerrainClearance("open-sea-range", aircraft(), north)).toBe(18);
    const channel = { ...aircraft(), position: { x: 0, y: 55, z: -4000 } };
    expect(airTerrainClearance("atoll-prototype", channel, { x: 0, y: 55, z: 5000 })).toBe(18);
  });

  it("anticipates the real 340m mountain at least 35 seconds ahead of a low torpedo group", () => {
    const group = aircraft();
    const mountain = ATOLL_TERRAIN_ZONES.find(({ id }) => id === "mountain-ne")!;
    expect((mountain.z - group.position.z) / group.flight!.speedMetersPerSecond).toBe(35);
    expect(terrainHeightAt("atoll-prototype", group.position.x, group.position.z)).toBe(0);
    expect(airTerrainClearance("atoll-prototype", group, north)).toBe(mountain.heightMeters! + 55);
  });

  it("checks the forward corridor even when the requested destination turns away", () => {
    const group = aircraft();
    expect(airTerrainClearance("atoll-prototype", group,
      { x: -5000, y: 55, z: group.position.z })).toBe(395);
  });

  it("checks the destination corridor before the current heading points toward the mountain", () => {
    const group = { ...aircraft(), position: { x: 0, y: 55, z: 0 }, heading: Math.PI };
    expect(airTerrainClearance("atoll-prototype", group, { x: 1680, y: 55, z: 1790 })).toBe(395);
  });

  it("uses the full irregular coast and a turn margin instead of only the island centerline", () => {
    const group = { ...aircraft(), position: { x: 1680 + 1000, y: 55, z: -1200 } };
    // The line misses even the nominal 720m radius, but a broad bank/intercept corridor does not.
    expect(airTerrainClearance("atoll-prototype", group, { x: group.position.x, y: 55, z: 5000 })).toBeGreaterThanOrEqual(395);
  });

  it("does not keep a departed mountain's height forever or mutate its inputs", () => {
    const group = aircraft();
    const before = structuredClone(group);
    const destinationBefore = { ...north };
    const value = airTerrainClearance("atoll-prototype", group, north);
    expect(airTerrainClearance("atoll-prototype", group, north)).toBe(value);
    expect(group).toEqual(before);
    expect(north).toEqual(destinationBefore);
    expect(airTerrainClearance("atoll-prototype", { ...group, position: { x: 1680, y: 400, z: 6500 } },
      { x: 1680, y: 400, z: 9000 })).toBe(18);
  });

  it.each(["fighter", "diveBomber", "torpedoBomber"] as const)("flies %s continuously above the real mountain using guidance, without a terrain-height position clamp", (role) => {
    const profile = AIR_FLIGHT_PROFILE[role];
    const speed = AIR_NAVIGATION.speedMetersPerSecond[role];
    let group = aircraft(role);
    // North-side open water keeps all three role-specific 35s starts outside the other islands.
    group.position = { x: 1680, y: 55, z: 1790 + speed * 35 };
    group.heading = Math.PI;
    const destination = { x: 1680, y: 55, z: -5500 };
    const dt = 1 / 60;
    let highestTerrain = 0;
    let maximumAltitude = group.position.y;
    for (let frame = 0; frame < 70 * 60; frame += 1) {
      const clearance = airTerrainClearance("atoll-prototype", group, destination);
      const previous = group.position;
      const next = advanceAirKinematics({
        id: `terrain-${role}`, phase: "outbound", ...group,
        destination, speedMetersPerSecond: speed,
        targetAltitude: Math.max(55, clearance), minimumAltitude: 18,
        dt, time: frame * dt, canMove: true,
      });
      group = { role, ...next };
      const terrain = terrainHeightAt("atoll-prototype", group.position.x, group.position.z);
      highestTerrain = Math.max(highestTerrain, terrain);
      maximumAltitude = Math.max(maximumAltitude, group.position.y);
      expect(group.position.y).toBeGreaterThanOrEqual(terrain + 20);
      expect(Math.abs(group.position.y - previous.y)).toBeLessThanOrEqual(profile.verticalRateMetersPerSecond * dt + 0.01);
    }
    expect(highestTerrain).toBeGreaterThan(240);
    expect(maximumAltitude).toBeGreaterThan(360);
  });
});
