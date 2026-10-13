import { describe, expect, it } from "vitest";
import { ObjectiveCaptureNavigator } from "../src/controllers/objectiveCaptureNavigation";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP, OBJECTIVE } from "../src/sim/config";
import { createDeveloperShipState, createInitialState } from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
function fixture(team: Team, terrain: boolean) {
  const state = createInitialState(0x84101, "battle");
  state.mapId = terrain ? "atoll-prototype" : "open-sea-range";
  state.weatherId = "clear"; state.airSupport = "none"; state.airSquadrons = [];
  if (!terrain) state.objective.center = { x: 0, y: 0, z: 0 };
  const make = (id: string, x: number, z: number) => createDeveloperShipState({
    id, team, shipClassId: "fletcher", position: { x, y: 0, z },
    heading: 0, aiControlled: true, mainGunMounts: 0,
    torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0,
  });
  const near = make("near-candidate", terrain ? -400 : -135, terrain ? 800 : -800);
  const clear = make("clear-candidate", terrain ? -800 : -135, terrain ? 0 : -1900);
  const remote = make("remote-status-marker", -5000, -5000);
  remote.team = team === "player" ? "enemy" : "player"; remote.aiControlled = false;
  state.ships = [near, clear, remote];
  const plan = new ObjectiveCaptureNavigator().plan(state.mapId, clear, state.objective, 0, 0);
  expect(plan.point).toBeDefined();
  clear.heading = Math.atan2(plan.point!.x - clear.position.x, plan.point!.z - clear.position.z);
  const session = new LocalBattleSession(state);
  const advance = () => session.step(new Map([[remote.id, idle(remote)]]), FIXED_STEP);
  const distance = (ship: ShipState) => Math.hypot(ship.position.x - state.objective.center.x,
    ship.position.z - state.objective.center.z);
  return { state, near, clear, advance, distance };
}

describe("route and progress duties through the real battle session", () => {
  for (const team of ["player", "enemy"] as const) {
    it(`${team} chooses the reachable hull and physically captures behind the concave shoal`, () => {
      const { state, near, clear, advance, distance } = fixture(team, true);
      expect(distance(near)).toBeLessThan(distance(clear));
      expect(new ObjectiveCaptureNavigator().plan(state.mapId, near, state.objective, 0, 0).mode)
        .toBe("recovery");
      expect(new ObjectiveCaptureNavigator().plan(state.mapId, clear, state.objective, 0, 0).mode)
        .toBe("direct");
      advance();
      expect(clear.aiDecision?.objectiveDuty).toBe("capture");
      expect(near.aiDecision?.objectiveDuty).toBe("support");
      let enteredAt: number | undefined, ownedAt: number | undefined, run = 0, longest = 0;
      let nearEntered = false, clearExited = false;
      for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
        advance();
        run = clear.navigationZone === "grounded" ? run + FIXED_STEP : 0;
        longest = Math.max(longest, run);
        nearEntered ||= distance(near) <= state.objective.radius;
        if (distance(clear) <= state.objective.radius) enteredAt ??= state.time;
        else if (enteredAt !== undefined) clearExited = true;
        if (state.objective.owner === team) { ownedAt = state.time; break; }
        expect(state.status).toBe("running");
      }
      expect(nearEntered).toBe(false);
      expect(clearExited).toBe(false);
      expect(enteredAt).toBeDefined();
      expect(ownedAt).toBeDefined();
      expect(ownedAt! - enteredAt!).toBeGreaterThanOrEqual(OBJECTIVE.captureSeconds - FIXED_STEP * 2);
      expect(clear.distanceTravelled).toBeGreaterThan(400);
      expect(longest).toBeLessThan(1);
      expect(state.objective.owner).toBe(team);
      expect(state.objective.captureProgress).toBe(team === "player" ? 1 : -1);
    }, 15_000);

    it(`${team} hands a speed-limited developer hull's duty to a mobile ally and completes capture`, () => {
      const { state, near, clear, advance, distance } = fixture(team, false);
      // Deliberate developer-speed fixture: the real propulsion/steering and
      // session run normally, but this hull cannot make useful cap progress.
      // This does not claim a production damage/repair balance outcome.
      near.performance.maxSpeedMultiplier = .001;
      advance();
      expect(near.aiDecision?.objectiveDuty).toBe("capture");
      expect(clear.aiDecision?.objectiveDuty).toBe("support");
      let handedAt: number | undefined, enteredAt: number | undefined, ownedAt: number | undefined;
      let reclaimedBeforeEntry = false, nearEntered = false;
      for (let tick = 0; tick < 220 / FIXED_STEP; ++tick) {
        advance();
        expect(near.modules.engine.health).toBe(near.modules.engine.maxHealth);
        nearEntered ||= distance(near) <= state.objective.radius;
        if (clear.aiDecision?.objectiveDuty === "capture") handedAt ??= state.time;
        if (handedAt !== undefined && enteredAt === undefined
          && near.aiDecision?.objectiveDuty === "capture") reclaimedBeforeEntry = true;
        if (distance(clear) <= state.objective.radius) enteredAt ??= state.time;
        if (state.objective.owner === team) { ownedAt = state.time; break; }
        expect(state.status).toBe("running");
      }
      expect(handedAt).toBeDefined();
      expect(handedAt!).toBeGreaterThanOrEqual(45);
      expect(handedAt!).toBeLessThanOrEqual(75);
      expect(reclaimedBeforeEntry).toBe(false);
      expect(nearEntered).toBe(false);
      expect(enteredAt).toBeDefined();
      expect(ownedAt).toBeDefined();
      expect(ownedAt! - enteredAt!).toBeGreaterThanOrEqual(OBJECTIVE.captureSeconds - FIXED_STEP * 2);
      expect(clear.distanceTravelled).toBeGreaterThan(1000);
      expect(state.objective.owner).toBe(team);
    }, 15_000);
  }
});
