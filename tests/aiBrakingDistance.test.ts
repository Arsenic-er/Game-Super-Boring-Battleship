import { afterEach, describe, expect, it, vi } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { ObjectiveSupportNavigator, SUPPORT_NAVIGATION } from "../src/controllers/objectiveSupportNavigation";
import * as terrain from "../src/maps/atollMap";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { shipSpeedMetersPerSecond } from "../src/sim/config";
import { forwardStoppingDistance } from "../src/sim/navigationKinematics";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { Team } from "../src/sim/types";

const SUPPORT_RADIUS = 2372.5; // Line role 3650 m * .65 in clear weather.
const STATION_DISTANCE = 350;

function stationFixture(team: Team, weakEngine: boolean) {
  const state = createInitialState(0x81021, "battle");
  state.mapId = "open-sea-range";
  state.weatherId = "clear";
  state.airSupport = "none";
  state.airSquadrons = [];
  state.objective.owner = team;
  state.objective.captureProgress = 1;
  const center = state.objective.center;
  const ship = createDeveloperShipState({
    id: "support-braking", team, shipClassId: "yamato", aiControlled: true,
    position: { x: center.x, y: 0, z: center.z - SUPPORT_RADIUS - STATION_DISTANCE },
    heading: 0, secondaryGunIds: [], torpedoLauncherMounts: 0,
  });
  ship.speedKnots = 8;
  ship.rudder = 0;
  ship.rudderCommand = 0;
  ship.modules.engine.health = ship.modules.engine.maxHealth * (weakEngine ? .01 : 1);
  ship.performance.accelerationMultiplier = weakEngine ? .5 : 1;
  const water = terrain.terrainNavigationAt(state.mapId, ship.position.x,
    ship.position.z, terrain.shipDraftMeters(ship.shipClassId));
  ship.navigationZone = water.kind;
  ship.waterDepthMeters = water.depthMeters;
  const enemy = createDeveloperShipState({
    id: "unobserved", team: team === "player" ? "enemy" : "player", shipClassId: "fletcher",
    position: { x: 5600, y: 0, z: 5600 }, secondaryGunIds: [], torpedoLauncherMounts: 0,
  });
  state.ships = [ship, enemy];
  const observation = { ...observe(state, ship.id), fleetObjective: {
    duty: "support" as const, urgent: false, assignedAt: state.time, stationIndex: 0 as const,
  } };
  return { state, ship, observation };
}

function navigationFixture() {
  const ship = createDeveloperShipState({ id: "navigation-braking", team: "player", shipClassId: "yamato",
    position: { x: 0, y: 0, z: 0 }, heading: 0, secondaryGunIds: [], torpedoLauncherMounts: 0 });
  ship.speedKnots = 8;
  ship.navigationZone = "deep";
  return ship;
}

afterEach(() => vi.restoreAllMocks());

describe("real AI stopping-distance integration", () => {
  for (const team of ["player", "enemy"] as const) {
    it(team + " weak propulsion brakes before entering a support station's arrival band", () => {
      const { ship, observation } = stationFixture(team, true);
      const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan"); // Real call-through.
      const recovery = vi.spyOn(AiNavigationRecovery.prototype, "command");
      expect(observation.contacts).toHaveLength(0);
      expect(ship.hull).toBe(ship.maxHull); // Engine damage is not a withdrawal order.
      const command = new RuleBasedAi(8121).command(observation);
      expect(planner).toHaveBeenCalledTimes(1);
      const plan = planner.mock.results[0]!.value;
      expect(plan.mode).toBe("radial");
      expect(Math.hypot(plan.point.x - ship.position.x, plan.point.z - ship.position.z))
        .toBeCloseTo(STATION_DISTANCE, 8);
      expect(forwardStoppingDistance(ship) + SUPPORT_NAVIGATION.arrivalRadiusMeters)
        .toBeGreaterThan(STATION_DISTANCE);
      expect(recovery.mock.results[0]!.value).toMatchObject({ recovering: false });
      expect(recovery.mock.results[0]!.value.throttleLimit).toBeUndefined();
      expect(command.aiDecision?.objectiveDuty).toBe("support");
      expect(command.throttle).toBe(0);
      expect(command.fire).toBe(false);
    });

    it(team + " healthy propulsion retains the existing slow approach at the same station distance", () => {
      const { ship, observation } = stationFixture(team, false);
      const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan");
      expect(observation.contacts).toHaveLength(0);
      const command = new RuleBasedAi(8121).command(observation);
      expect(planner).toHaveBeenCalledTimes(1);
      const plan = planner.mock.results[0]!.value;
      expect(Math.hypot(plan.point.x - ship.position.x, plan.point.z - ship.position.z))
        .toBeCloseTo(STATION_DISTANCE, 8);
      expect(forwardStoppingDistance(ship) + SUPPORT_NAVIGATION.arrivalRadiusMeters)
        .toBeLessThan(STATION_DISTANCE);
      expect(command.throttle).toBe(.24);
      expect(command.fire).toBe(false);
    });
  }

  it.each([false, true])("feeds the real terrain query a stopping-distance lookahead (weak engine %s)", weak => {
    const ship = navigationFixture();
    ship.modules.engine.health = ship.modules.engine.maxHealth * (weak ? .01 : 1);
    ship.performance.accelerationMultiplier = weak ? .5 : 1;
    const query = vi.spyOn(terrain, "firstNavigationHazard"); // Execute the real terrain query.
    const planner = new AiNavigationRecovery();
    const expected = Math.max(100, Math.min(800,
      forwardStoppingDistance(ship) + shipSpeedMetersPerSecond(ship.speedKnots) * 6 + 80));
    const result = planner.command("open-sea-range", ship, 0, 0);
    expect(query).toHaveBeenCalledTimes(1);
    const [map, from, to, draft] = query.mock.calls[0]!;
    expect(map).toBe("open-sea-range");
    expect(from).toEqual(ship.position);
    expect(draft).toBe(terrain.shipDraftMeters(ship.shipClassId));
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeCloseTo(expected, 9);
    expect(result.recovering).toBe(false);
    // Preserve the existing half-second planning cache rather than adding queries.
    planner.command("open-sea-range", ship, .1, .49);
    expect(query).toHaveBeenCalledTimes(1);
    planner.command("open-sea-range", ship, .1, .5);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each(["zero-acceleration", "forced-speed"] as const)("keeps infinite stopping-distance queries bounded for %s", mode => {
    const ship = navigationFixture();
    if (mode === "zero-acceleration") ship.performance.accelerationMultiplier = 0;
    else ship.developer = { enabled: true, unrestrictedWeapons: false, infiniteAmmunition: false,
      instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 8 };
    expect(forwardStoppingDistance(ship)).toBe(Infinity);
    const query = vi.spyOn(terrain, "firstNavigationHazard");
    const result = new AiNavigationRecovery().command("open-sea-range", ship, 0, 0);
    expect(query).toHaveBeenCalledTimes(1);
    const [, from, to] = query.mock.calls[0]!;
    expect([to.x, to.y, to.z].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeCloseTo(800, 9);
    expect(Number.isFinite(result.desiredHeading)).toBe(true);
    expect(result.throttleLimit).toBe(0);
    // Bounded query work is not a claim that this ship can stop or turn safely.
  });

  it.each(["zero-acceleration", "forced-speed"] as const)("does not grant reorientation steerage with unbounded forward stopping for %s", mode => {
    const ship = navigationFixture();
    const planner = new AiNavigationRecovery();
    // A public phase-boundary guard, not a reconstructed history or a claim of
    // real astern motion: ordinary commands establish the private recovery state.
    ship.speedKnots = 0;
    ship.navigationZone = "grounded";
    expect(planner.command("open-sea-range", ship, Math.PI / 2, 0))
      .toMatchObject({ recovering: true, throttleLimit: -.25 });
    ship.navigationZone = "deep";
    ship.position.z = -70;
    ship.previousPosition = { ...ship.position };
    ship.speedKnots = 8;
    if (mode === "zero-acceleration") ship.performance.accelerationMultiplier = 0;
    else ship.developer = { enabled: true, unrestrictedWeapons: false, infiniteAmmunition: false,
      instantReload: false, speedMultiplier: 1, forcedSpeedKnots: 8 };
    expect(forwardStoppingDistance(ship)).toBe(Infinity);
    const before = structuredClone(ship);
    const result = planner.command("open-sea-range", ship, Math.PI / 2, 13);
    expect(planner.getTelemetry()?.phase).toBe("reorienting");
    expect(result.recovering).toBe(true);
    expect(result.throttleLimit).toBe(0);
    expect(Number.isFinite(result.desiredHeading)).toBe(true);
    expect(ship.speedKnots).toBe(8);
    expect(ship).toEqual(before); // A throttle request cannot erase inertia.
  });
});
