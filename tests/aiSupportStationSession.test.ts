import { afterEach, describe, expect, it, vi } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { ObjectiveSupportNavigator, SUPPORT_NAVIGATION } from "../src/controllers/objectiveSupportNavigation";
import {
  ATOLL_MAP, firstNavigationHazard, shipDraftMeters, terrainNavigationAt, terrainSafeHeading,
} from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, FleetObjectiveAssignment, Vec3 } from "../src/sim/types";
import { createFleetSmokeBattle } from "./helpers/fleetSmokeScenario";

const SUPPORT_RADIUS = 2_372.5; // North Carolina line-role preference: 3650 * .65.
const angleDistance = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function fixture(position: Vec3, heading = 0) {
  const state = createInitialState(0x81010, "battle");
  state.airSupport = "none";
  state.objective.owner = "player";
  state.objective.captureProgress = 1;
  const self = createDeveloperShipState({
    id: "support", team: "player", shipClassId: "north-carolina", position, heading,
    aiControlled: true, secondaryGunIds: [],
  });
  const enemy = createDeveloperShipState({
    id: "hidden-enemy", team: "enemy", shipClassId: "fletcher",
    position: { x: 5_600, y: 0, z: 5_600 }, secondaryGunIds: [], torpedoLauncherMounts: 0,
  });
  const nav = terrainNavigationAt(state.mapId, position.x, position.z, shipDraftMeters(self.shipClassId));
  self.navigationZone = nav.kind;
  self.waterDepthMeters = nav.depthMeters;
  state.ships = [self, enemy];
  const observation = (duty: FleetObjectiveAssignment["duty"] = "support") => ({
    ...observe(state, self.id),
    fleetObjective: { duty, urgent: false, assignedAt: state.time, stationIndex: 0 as const },
  });
  const enemyIdle = (): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...enemy.aimPoint } });
  return { state, self, enemy, observation, enemyIdle };
}

afterEach(() => vi.restoreAllMocks());

describe("AI support stations use real static terrain through the controller", () => {
  for (const mountain of ATOLL_MAP.terrain.filter(({ kind }) => kind === "mountain")) {
    it(`chooses a safe alternative instead of the radial station on ${mountain.id}`, () => {
      const center = { x: 90, y: 0, z: 175 };
      const bearing = Math.atan2(mountain.x - center.x, mountain.z - center.z);
      const position = { x: center.x + Math.sin(bearing) * 700, y: 0,
        z: center.z + Math.cos(bearing) * 700 };
      const { state, self, observation } = fixture(position);
      expect(self.navigationZone).not.toBe("grounded");
      const oldPoint = { x: center.x + Math.sin(bearing) * SUPPORT_RADIUS, y: 0,
        z: center.z + Math.cos(bearing) * SUPPORT_RADIUS };
      expect(terrainNavigationAt(state.mapId, oldPoint.x, oldPoint.z,
        shipDraftMeters(self.shipClassId)).kind).toBe("grounded");
      const expected = new ObjectiveSupportNavigator().plan(state.mapId, self, state.objective, SUPPORT_RADIUS, 0);
      expect(expected.mode).toBe("alternative");
      expect(expected.point).toBeDefined();
      const point = expected.point!;
      const desired = Math.atan2(point.x - self.position.x, point.z - self.position.z);
      self.heading = desired;
      const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan"); // Real call-through.
      const input = observation();
      expect(input.contacts).toHaveLength(0);
      const command = new RuleBasedAi(811).command(input);
      expect(planner).toHaveBeenCalledTimes(1);
      const actual = planner.mock.results[0]!.value;
      expect(actual).toEqual(expected);
      expect(actual.point).not.toEqual(oldPoint);
      expect(terrainNavigationAt(state.mapId, point.x, point.z,
        shipDraftMeters(self.shipClassId)).kind).not.toBe("grounded");
      const hull = getShipClass(self.shipClassId);
      expect(firstNavigationHazard(state.mapId, self.position, point,
        shipDraftMeters(self.shipClassId) + SUPPORT_NAVIGATION.underKeelReserveMeters,
        Math.max(hull.beam * .6 + 12, hull.length * .18))).toBeUndefined();
      const safeHeading = terrainSafeHeading(state.mapId, self.position, desired, self.shipClassId);
      expect(angleDistance(command.aiDecision!.desiredHeading, safeHeading)).toBeLessThan(1e-9);
      expect(command.aiDecision?.objectiveDuty).toBe("support");
      expect(command.throttle).toBeGreaterThan(0);
      expect(command.fire).toBe(false);
    });
  }

  it("keeps the existing open-water radial station and stop behavior", () => {
    const { state, self, observation } = fixture({ x: 90, y: 0, z: 175 - SUPPORT_RADIUS });
    state.mapId = "open-sea-range";
    const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan");
    const command = new RuleBasedAi(812).command(observation());
    expect(planner).toHaveBeenCalledTimes(1);
    const plan = planner.mock.results[0]!.value;
    expect(plan.mode).toBe("radial");
    expect(plan.point.x).toBeCloseTo(self.position.x, 9);
    expect(plan.point.z).toBeCloseTo(self.position.z, 9);
    expect(command.throttle).toBe(0);
    expect(angleDistance(command.aiDecision!.desiredHeading, self.heading)).toBeLessThan(1e-9);
  });

  it("does not call the support planner for a capture order", () => {
    const { state, self, observation } = fixture({ x: 90, y: 0, z: -2400 });
    state.mapId = "open-sea-range";
    state.objective.owner = undefined;
    state.objective.captureProgress = 0;
    const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan");
    const command = new RuleBasedAi(813).command(observation("capture"));
    expect(planner).not.toHaveBeenCalled();
    const originalCapturePoint = { x: state.objective.center.x - state.objective.radius * .3,
      z: state.objective.center.z };
    expect(angleDistance(command.aiDecision!.desiredHeading,
      Math.atan2(originalCapturePoint.x - self.position.x, originalCapturePoint.z - self.position.z)))
      .toBeLessThan(1e-9);
    expect(command.throttle).toBeGreaterThan(0);
    expect(command.aiDecision?.objectiveDuty).toBe("capture");
  });

  it("does not introduce support planning into sea trials, even with an explicit support order", () => {
    const { state, observation } = fixture({ x: 90, y: 0, z: -2400 });
    state.mode = "sea-trials";
    const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan");
    const command = new RuleBasedAi(814).command(observation());
    expect(planner).not.toHaveBeenCalled();
    expect(command.aiDecision?.objectiveDuty).toBeUndefined();
  });

  it("leaves genuine no-safe-point recovery to physical navigation instead of holding a fake station", () => {
    const mountain = ATOLL_MAP.terrain.find(({ id }) => id === "mountain-nw")!;
    const { self, observation } = fixture({ x: mountain.x, y: 0, z: mountain.z });
    expect(self.navigationZone).toBe("grounded");
    const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan");
    const command = new RuleBasedAi(815).command(observation());
    expect(planner).toHaveBeenCalledTimes(1);
    expect(planner.mock.results[0]!.value).toEqual({
      mode: "recovery", arrivalRadiusMeters: SUPPORT_NAVIGATION.arrivalRadiusMeters,
    });
    expect(command.throttle).toBeLessThan(0);
    expect(command.throttle).toBeGreaterThanOrEqual(-.25);
    expect(Number.isFinite(command.aiDecision!.desiredHeading)).toBe(true);
    expect(command.fire).toBe(false);
  });


  it("navigates the actual Cleveland fleet's Yamato toward a safe alternative station", () => {
    const state = createFleetSmokeBattle(5, 464129, "default", "cleveland-starter");
    const self = state.ships.find(({ id }) => id === "ally-battleship-4")!;
    expect(self.shipClassId).toBe("yamato");
    expect(Math.hypot(self.position.x - state.objective.center.x, self.position.z - state.objective.center.z))
      .toBeGreaterThan(SUPPORT_RADIUS + SUPPORT_NAVIGATION.arrivalRadiusMeters);
    const before = structuredClone(self);
    const planner = vi.spyOn(ObjectiveSupportNavigator.prototype, "plan");
    const input = { ...observe(state, self.id), fleetObjective: {
      duty: "support" as const, urgent: false, assignedAt: state.time, stationIndex: 0 as const,
    } };
    expect(input.contacts).toHaveLength(0);
    const command = new RuleBasedAi(817).command(input);
    expect(planner).toHaveBeenCalledTimes(1);
    expect(planner.mock.results[0]!.value.mode).toBe("alternative");
    expect(planner.mock.results[0]!.value.point).toBeDefined();
    expect(command.throttle).toBeGreaterThan(0);
    expect(command.aiDecision?.objectiveDuty).toBe("support");
    expect(command.fire).toBe(false);
    expect(self).toEqual(before);
  });

  it("moves the real Cleveland fleet's Yamato inside its actual arrival band without a stationary braking dead zone", () => {
    const state = createFleetSmokeBattle(5, 464129, "default", "cleveland-starter");
    const self = state.ships.find(({ id }) => id === "ally-battleship-4")!;
    const start = { ...self.position };
    const controller = new RuleBasedAi(817);
    let groundedRun = 0, maximumGroundedRun = 0, arrivalHoldSeconds = 0;
    // All untouched ships remain real stationary obstacles; only the support
    // order is supplied. No pose, speed, module, weapon or map edits are made.
    for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
      const input = { ...observe(state, self.id), fleetObjective: {
        duty: "support" as const, urgent: false, assignedAt: state.time, stationIndex: 0 as const,
      } };
      const command = controller.command(input);
      const commands = new Map(state.ships.map(ship => [ship.id, ship.id === self.id ? command : {
        throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
      }]));
      stepSimulation(state, commands, FIXED_STEP);
      groundedRun = self.navigationZone === "grounded" ? groundedRun + FIXED_STEP : 0;
      maximumGroundedRun = Math.max(maximumGroundedRun, groundedRun);
      if (command.throttle === 0 && Math.abs(self.speedKnots) < .5) {
        const plan = new ObjectiveSupportNavigator().plan(state.mapId, self, state.objective, SUPPORT_RADIUS, state.time);
        arrivalHoldSeconds = plan.point && Math.hypot(self.position.x - plan.point.x,
          self.position.z - plan.point.z) <= plan.arrivalRadiusMeters + 1
          ? arrivalHoldSeconds + FIXED_STEP : 0;
      } else arrivalHoldSeconds = 0;
      if (arrivalHoldSeconds >= 5) break;
    }
    expect(state.status).toBe("running");
    expect(state.time).toBeLessThanOrEqual(180 + 1e-6);
    const finalPlan = new ObjectiveSupportNavigator().plan(state.mapId, self, state.objective, SUPPORT_RADIUS, state.time);
    expect(finalPlan.point).toBeDefined();
    expect(Math.hypot(self.position.x - finalPlan.point!.x, self.position.z - finalPlan.point!.z))
      .toBeLessThanOrEqual(finalPlan.arrivalRadiusMeters + 1);
    expect(arrivalHoldSeconds).toBeGreaterThanOrEqual(5);
    expect(Math.hypot(self.position.x - start.x, self.position.z - start.z)).toBeGreaterThan(100);
    expect(maximumGroundedRun).toBeLessThan(1);
  }, 30_000);

  it("physically moves a battleship from a clear near-shore start to a safe support hold within 180 seconds", () => {
    const { state, self, enemy, observation, enemyIdle } = fixture({ x: -1241.94, y: 0, z: 2430.17 });
    const initial = new ObjectiveSupportNavigator().plan(state.mapId, self, state.objective, SUPPORT_RADIUS, 0);
    expect(initial.mode).toBe("alternative");
    expect(self.navigationZone).not.toBe("grounded");
    expect(initial.point).toBeDefined();
    self.heading = Math.atan2(initial.point!.x - self.position.x, initial.point!.z - self.position.z);
    const controller = new RuleBasedAi(816);
    const start = { ...self.position };
    let groundedRun = 0, maximumGroundedRun = 0, stoppedSeconds = 0;
    for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
      const command = controller.command(observation());
      stepSimulation(state, new Map([[self.id, command], [enemy.id, enemyIdle()]]), FIXED_STEP);
      groundedRun = self.navigationZone === "grounded" ? groundedRun + FIXED_STEP : 0;
      maximumGroundedRun = Math.max(maximumGroundedRun, groundedRun);
      stoppedSeconds = command.throttle === 0 && Math.abs(self.speedKnots) < .5
        ? stoppedSeconds + FIXED_STEP : 0;
      if (stoppedSeconds >= 5) break;
    }
    expect(Math.hypot(self.position.x - start.x, self.position.z - start.z)).toBeGreaterThan(100);
    const finalPlan = new ObjectiveSupportNavigator().plan(state.mapId, self, state.objective, SUPPORT_RADIUS, state.time);
    expect(finalPlan.point).toBeDefined();
    expect(Math.hypot(self.position.x - finalPlan.point!.x, self.position.z - finalPlan.point!.z))
      .toBeLessThanOrEqual(finalPlan.arrivalRadiusMeters + 1);
    const hull = getShipClass(self.shipClassId);
    // Arrival is acceptable only when the stopped hull itself remains entirely
    // clear of the hazard padding, not merely when the controller emits zero.
    expect(firstNavigationHazard(state.mapId, self.position, self.position,
      shipDraftMeters(self.shipClassId) + SUPPORT_NAVIGATION.underKeelReserveMeters,
      hull.length * .5)).toBeUndefined();
    expect(maximumGroundedRun).toBeLessThan(1);
    expect(stoppedSeconds).toBeGreaterThanOrEqual(5);
    expect(state.time).toBeLessThanOrEqual(180);
    expect(terrainNavigationAt(state.mapId, self.position.x, self.position.z,
      shipDraftMeters(self.shipClassId)).kind).not.toBe("grounded");
    expect(Math.hypot(self.position.x - state.objective.center.x, self.position.z - state.objective.center.z))
      .toBeGreaterThan(state.objective.radius);
  }, 30_000);
});
