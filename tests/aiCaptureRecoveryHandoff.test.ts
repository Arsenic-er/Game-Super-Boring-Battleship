import { afterEach, describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import {
  CAPTURE_NAVIGATION, ObjectiveCaptureNavigator, clearObjectiveCaptureGraphCache,
  type ObjectiveCapturePlan,
} from "../src/controllers/objectiveCaptureNavigation";
import { getShipClass } from "../src/ships/classes";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";

afterEach(() => vi.restoreAllMocks());

describe("capture-route recovery handoff uses real terrain and ship motion", () => {
  it.each([-3000, 3000])("hands a moving ship leaving its verified corridor at x=%s back to physical navigation until replanning", startX => {
    clearObjectiveCaptureGraphCache();
    const state = createInitialState(71211, "sea-trials");
    state.mapId = "atoll-prototype"; state.airSquadrons = []; state.airSupport = "none";
    const self = createDeveloperShipState({
      id: "player", team: "player", shipClassId: "fletcher",
      position: { x: startX, y: 0, z: 2200 }, heading: 0,
      torpedoLauncherMounts: 0, secondaryGunIds: [],
    });
    state.ships = [self];
    state.objective.owner = "enemy"; state.objective.captureProgress = -1;
    const hull = getShipClass(self.shipClassId);
    const draft = terrain.shipDraftMeters(self.shipClassId) + CAPTURE_NAVIGATION.underKeelReserveMeters;
    const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
    const goal = { x: state.objective.center.x - state.objective.radius * .3,
      y: 0, z: state.objective.center.z };
    expect(terrain.firstNavigationHazard(state.mapId, self.position, goal, draft, padding)).toBeDefined();
    const probe = new ObjectiveCaptureNavigator().plan(state.mapId, self, state.objective, 0, 0);
    expect(probe.mode).toBe("waypoint");
    const initialLeg = Math.atan2(probe.point!.x - self.position.x, probe.point!.z - self.position.z);
    // Begin cruising across the future cached corridor, then let the actual
    // controller/propulsion/rudder integrate the departure; no teleport follows.
    const crossingHeading = [initialLeg + Math.PI / 2, initialLeg - Math.PI / 2].find(heading => {
      const end = { x: self.position.x + Math.sin(heading) * 180, y: 0,
        z: self.position.z + Math.cos(heading) * 180 };
      return !terrain.firstNavigationHazard(state.mapId, self.position, end, draft, padding);
    });
    expect(crossingHeading).toBeDefined();
    self.heading = crossingHeading!; self.speedKnots = hull.maxSpeedKnots;
    const start = { ...self.position };
    const hazard = vi.spyOn(terrain, "firstNavigationHazard");
    const headingPlanner = vi.spyOn(terrain, "terrainSafeHeading");
    const realPlan = ObjectiveCaptureNavigator.prototype.plan;
    const trace: Array<{ time: number; queries: number; result: ObjectiveCapturePlan }> = [];
    // Instrumentation delegates to the real method unchanged: no route, mode,
    // geometry query or obstacle result is fabricated for this integration test.
    vi.spyOn(ObjectiveCaptureNavigator.prototype, "plan").mockImplementation(function (this: ObjectiveCaptureNavigator, ...args) {
      const before = hazard.mock.calls.length;
      const result = realPlan.apply(this, args);
      trace.push({ time: args[4], queries: hazard.mock.calls.length - before, result });
      return result;
    });
    const ai = new RuleBasedAi(71211);
    let firstRecoveryAt: number | undefined;
    let recoveryFrames = 0;
    let recoveryHeadingRefreshes = 0;
    let replanned = false;
    for (let frame = 0; frame < 180; ++frame) {
      const headingCallsBefore = headingPlanner.mock.calls.length;
      const command = ai.command({ ...observe(state, self.id), gameMode: "battle",
        fleetObjective: { duty: "capture", urgent: false, assignedAt: state.time, stationIndex: 0 } });
      const current = trace.at(-1)!;
      expect(current).toBeDefined();
      if (frame === 0) expect(current.result.mode).toBe("waypoint");
      if (current.result.mode === "recovery") {
        firstRecoveryAt ??= state.time;
        ++recoveryFrames;
        expect(command.aiDecision?.objectiveDuty).toBe("capture");
        expect(command.aiDecision?.contactSource).toBeUndefined();
        expect(command.fire).toBe(false);
        // No trusted point exists now. Keep limited movement for recovery,
        // rather than either full cap pursuit or stop-at-self station braking.
        expect(command.throttle).toBeGreaterThan(0);
        expect(command.throttle).toBeLessThanOrEqual(.12);
        if (state.time < CAPTURE_NAVIGATION.planningIntervalSeconds) expect(current.queries).toBe(0);
        // The controller may retain its existing 0.4 s local-heading cache.
        // Whenever that cache refreshes during recovery, verify that intent is
        // handed back to the actual bow heading, never the blocked final goal.
        for (const call of headingPlanner.mock.calls.slice(headingCallsBefore)) {
          expect(call[2]).toBeCloseTo(self.heading, 8);
          const capBearing = Math.atan2(goal.x - self.position.x, goal.z - self.position.z);
          const difference = Math.atan2(Math.sin(call[2] - capBearing), Math.cos(call[2] - capBearing));
          expect(Math.abs(difference)).toBeGreaterThan(.25);
          ++recoveryHeadingRefreshes;
        }
      }
      if (firstRecoveryAt !== undefined && state.time >= CAPTURE_NAVIGATION.planningIntervalSeconds
        && current.queries > 0 && current.result.point) {
        expect(["waypoint", "direct", "in-zone"]).toContain(current.result.mode);
        expect(terrain.firstNavigationHazard(state.mapId, self.position, current.result.point, draft, padding))
          .toBeUndefined();
        expect(command.throttle).toBeGreaterThan(0);
        replanned = true;
        break;
      }
      command.fire = false;
      stepSimulation(state, new Map([[self.id, command]]), FIXED_STEP);
      expect(state.status).toBe("running");
      expect(self.navigationZone).not.toBe("grounded");
    }
    expect(firstRecoveryAt).toBeDefined();
    expect(firstRecoveryAt).toBeLessThan(CAPTURE_NAVIGATION.planningIntervalSeconds);
    expect(recoveryFrames).toBeGreaterThan(1);
    expect(recoveryHeadingRefreshes).toBeGreaterThan(0);
    expect(replanned).toBe(true);
    expect(Math.hypot(self.position.x - start.x, self.position.z - start.z))
      .toBeGreaterThan(CAPTURE_NAVIGATION.cachedCorridorMeters);
    expect(trace.filter(entry => entry.time > 0
      && entry.time < CAPTURE_NAVIGATION.planningIntervalSeconds).every(entry => entry.queries === 0)).toBe(true);
  });
});
