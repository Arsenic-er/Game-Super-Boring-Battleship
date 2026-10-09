import { describe, expect, it, vi } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { ObjectiveCaptureNavigator } from "../src/controllers/objectiveCaptureNavigation";
import { firstNavigationHazard, shipDraftMeters } from "../src/maps/atollMap";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
const cases: Array<{ shipClassId: ShipClassId; team: Team; x: number }> = [
  { shipClassId: "fletcher", team: "player", x: 3000 },
  { shipClassId: "fletcher", team: "enemy", x: -3000 },
  { shipClassId: "cleveland", team: "player", x: 3000 },
  { shipClassId: "yamato", team: "enemy", x: 3000 },
];

describe("physical capture routes around actual island barriers", () => {
  for (const specimen of cases) it(`${specimen.team} ${specimen.shipClassId} at x=${specimen.x} follows waypoints and captures`, () => {
    const state = createInitialState(0x81010, "battle");
    state.airSupport = "none";
    state.airSquadrons = [];
    const own = createDeveloperShipState({
      id: "route-capper", team: specimen.team, shipClassId: specimen.shipClassId,
      position: { x: specimen.x, y: 0, z: 2200 }, heading: 0, aiControlled: true,
      torpedoLauncherMounts: 0, secondaryGunIds: [],
    });
    const remote = createDeveloperShipState({
      id: "remote-opponent", team: specimen.team === "player" ? "enemy" : "player",
      shipClassId: "fletcher", position: { x: -5000, y: 0, z: -5000 }, heading: 0,
      torpedoLauncherMounts: 0, secondaryGunIds: [],
    });
    state.ships = [own, remote];
    const hull = getShipClass(own.shipClassId);
    const goal = { x: state.objective.center.x - state.objective.radius * .3,
      y: 0, z: state.objective.center.z };
    const routePadding = Math.max(hull.beam * .6 + 12, hull.length * .18);
    expect(firstNavigationHazard(state.mapId, own.position, goal,
      shipDraftMeters(own.shipClassId) + 1, routePadding)).toBeDefined();
    const planned = new ObjectiveCaptureNavigator().plan(state.mapId, own, state.objective, 0, 0);
    expect(planned.mode).toBe("waypoint");
    expect(planned.point).toBeDefined();
    // Start pointed along the first real safe leg, isolating route following
    // from the separately tested near-shore reverse/reorientation recovery.
    own.heading = Math.atan2(planned.point!.x - own.position.x, planned.point!.z - own.position.z);
    const controller = new RuleBasedAi(811);
    const observation = () => ({ ...observe(state, own.id), fleetObjective: {
      duty: "capture" as const, urgent: false, assignedAt: state.time, stationIndex: 0 as const,
    } });
    const planner = vi.spyOn(ObjectiveCaptureNavigator.prototype, "plan");
    let first: ControlCommand;
    try {
      first = controller.command(observation());
      expect(planner).toHaveBeenCalledOnce();
      expect(planner.mock.results[0]!.value.mode).toBe("waypoint");
      expect(first.throttle).toBeGreaterThan(0);
    } finally { planner.mockRestore(); }
    let groundedRun = 0, longestGrounded = 0;
    let enteredAt: number | undefined, capturedAt: number | undefined;
    for (let tick = 0; tick < 600 / FIXED_STEP; ++tick) {
      const command = tick === 0 ? first! : controller.command(observation());
      stepSimulation(state, new Map([[own.id, command], [remote.id, idle(remote)]]), FIXED_STEP);
      groundedRun = own.navigationZone === "grounded" ? groundedRun + FIXED_STEP : 0;
      longestGrounded = Math.max(longestGrounded, groundedRun);
      const distance = Math.hypot(own.position.x - state.objective.center.x,
        own.position.z - state.objective.center.z);
      if (distance <= state.objective.radius && enteredAt === undefined) enteredAt = state.time;
      if (state.objective.owner === own.team) { capturedAt = state.time; break; }
      if (state.status !== "running") break;
    }
    expect(enteredAt, "physical hull must enter the objective, not merely get a connected graph").toBeDefined();
    expect(capturedAt, "route must finish with a real capture").toBeDefined();
    expect(capturedAt).toBeLessThanOrEqual(600);
    expect(longestGrounded).toBeLessThan(1);
    expect(own.distanceTravelled).toBeGreaterThan(1000);
    expect(state.status).toBe("running");
    expect(state.objective.owner).toBe(own.team);
  }, 30_000);
});
