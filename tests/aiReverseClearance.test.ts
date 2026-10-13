import { describe, expect, it, vi } from "vitest";
import * as terrain from "../src/maps/atollMap";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { firstNavigationHazard, shipDraftMeters, terrainSafeHeading } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { FIXED_STEP, NAVIGATION_PACE, shipSpeedMetersPerSecond } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import type { Team } from "../src/sim/types";

// Exact hull poses from seed 465144, calibration-b-3. These are short physical
// fixtures, not a continuation of the original controller or whole battle.
const poses = {
  firstContact: { x: -363.0790995971549, z: 1028.2304040691,
    heading: -.9747418398685047, speed: .2685072, rudder: .82 },
  reverseContact: { x: -318.6476055929521, z: 997.4352530646455,
    heading: -.9646578189762068, speed: -.182, rudder: 0 },
} as const;
function fixture(pose: keyof typeof poses, team: Team = "player") {
  const record = poses[pose];
  const state = createInitialState(465144, "sea-trials");
  state.mapId = "atoll-prototype"; state.airSquadrons = []; state.airSupport = "none";
  const self = createDeveloperShipState({ id: "recovery-cruiser", team, shipClassId: "cleveland",
    position: { x: record.x, y: 0, z: record.z }, heading: record.heading,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0 });
  self.speedKnots = record.speed; self.rudder = record.rudder; self.navigationZone = "grounded";
  state.ships = [self];
  // Sea trials still need a live player team for status checks. This immobile,
  // distant friendly-side marker cannot influence the isolated navigation call.
  if (team === "enemy") state.ships.push(createDeveloperShipState({
    id: "status-marker", team: "player", shipClassId: "fletcher",
    position: { x: -5000, y: 0, z: -5000 }, heading: 0, mainGunMounts: 0,
    torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0,
  }));
  return { state, self, recovery: new AiNavigationRecovery() };
}

describe("physical astern recovery checks hull-margin clearance", () => {
  it("rejects the concave shoal's blocked reverse corridor before entering its next lobe", () => {
    const { state, self, recovery } = fixture("firstContact");
    const draft = shipDraftMeters(self.shipClassId), hull = getShipClass(self.shipClassId);
    const previousChoice = terrainSafeHeading(state.mapId, self.position,
      self.heading + Math.PI, self.shipClassId);
    const end = (heading: number) => ({ x: self.position.x + Math.sin(heading) * 100, y: 0,
      z: self.position.z + Math.cos(heading) * 100 });
    const blocked = firstNavigationHazard(state.mapId, self.position, end(previousChoice), draft, hull.beam * .42)!;
    expect(blocked.zone.id).toBe("central-shoal-nw");
    expect(blocked.distanceFraction * 100).toBeGreaterThan(50);
    expect(blocked.distanceFraction * 100).toBeLessThan(60);
    const result = recovery.command(state.mapId, self, 0, 0);
    expect(result.recovering).toBe(true);
    expect(result.throttleLimit).toBe(-.25);
    expect(firstNavigationHazard(state.mapId, self.position,
      end(result.desiredHeading + Math.PI), draft, hull.beam * .42)).toBeUndefined();
  });

  it("stops astern propulsion when the immediate stern corridor is already blocked", () => {
    const { state, self, recovery } = fixture("reverseContact");
    const result = recovery.command(state.mapId, self, 0, 0);
    expect(result.recovering).toBe(true);
    expect(result.throttleLimit).toBe(0);
    expect(Math.abs(Math.atan2(Math.sin(result.desiredHeading - self.heading),
      Math.cos(result.desiredHeading - self.heading)))).toBeGreaterThan(.2);
  });

  for (const team of ["player", "enemy"] as const) {
    for (const pose of ["firstContact", "reverseContact"] as const) {
      it(`${team} ${pose} physically clears the shallow contact without persistent grounding`, () => {
        const { state, self, recovery } = fixture(pose, team);
        const start = { ...self.position };
        let run = 0, longest = 0, reverseFinished = false;
        for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
          const result = recovery.command(state.mapId, self, 0, state.time);
          const error = Math.atan2(Math.sin(result.desiredHeading - self.heading),
            Math.cos(result.desiredHeading - self.heading));
          const commands = new Map([[self.id, { throttle: Math.min(.5, result.throttleLimit ?? .5),
            rudder: Math.max(-.82, Math.min(.82, error * 1.25)), fire: false, aimPoint: { ...self.aimPoint } }]]);
          stepSimulation(state, commands, FIXED_STEP);
          expect(state.status).toBe("running");
          expect([self.position.x, self.position.z, self.heading, self.speedKnots].every(Number.isFinite)).toBe(true);
          if (self.navigationZone === "grounded") { run += FIXED_STEP; longest = Math.max(longest, run); }
          else run = 0;
          reverseFinished ||= result.throttleLimit !== undefined && result.throttleLimit >= 0;
        }
        expect(longest).toBeLessThan(1);
        expect(Math.hypot(self.position.x - start.x, self.position.z - start.z)).toBeGreaterThan(65);
        expect(reverseFinished).toBe(true);
        expect(self.navigationZone).not.toBe("grounded");
      });
    }
  }

  it("does not approve powered astern travel for a powerless ship already moving backward", () => {
    const { state, self, recovery } = fixture("firstContact");
    state.mapId = "open-sea-range";
    self.position = { x: 0, y: 0, z: 0 }; self.previousPosition = { ...self.position };
    self.heading = 0; self.rudder = 0; self.speedKnots = -2;
    self.modules.engine.health = 0;
    const before = { ...self.position };
    const result = recovery.command(state.mapId, self, 0, 0);
    expect(result.recovering).toBe(true);
    expect(result.throttleLimit).toBe(0);
    expect(self.position).toEqual(before);
    expect(self.speedKnots).toBe(-2);
    stepSimulation(state, new Map([[self.id, { throttle: result.throttleLimit!,
      rudder: 0, fire: false, aimPoint: { ...self.aimPoint } }]]), FIXED_STEP);
    // No fake stopping or teleport: the existing zero-power inertia still moves
    // the hull astern. This change only withholds an unsafe propulsion command.
    expect(self.speedKnots).toBe(-2);
    expect(self.position.x).toBe(before.x);
    expect(self.position.z).toBeCloseTo(before.z + shipSpeedMetersPerSecond(-2) * FIXED_STEP, 10);
  });

  it("checks the full stopping corridor for a heavily damaged battleship engine", () => {
    const self = createDeveloperShipState({ id: "damaged-yamato", team: "player", shipClassId: "yamato",
      position: { x: 0, y: 0, z: 0 }, heading: 0, mainGunMounts: 0,
      torpedoLauncherMounts: 0, secondaryGunIds: [], depthChargeMounts: 0 });
    self.speedKnots = -2; self.navigationZone = "grounded";
    self.modules.engine.health = self.modules.engine.maxHealth * .01;
    const hull = getShipClass(self.shipClassId);
    const speed = shipSpeedMetersPerSecond(2);
    const braking = hull.accelerationKnotsPerSecond * self.performance.accelerationMultiplier
      * NAVIGATION_PACE.propulsionResponseScale * (.2 + .8 * .01);
    expect(braking).toBeLessThan(.1);
    const expectedCorridor = Math.max(10, speed * 2 / braking * .5 + speed * .5 + 2);
    const oldClampedCorridor = Math.max(10, speed * 2 / .1 * .5 + speed * .5 + 2);
    expect(expectedCorridor).toBeGreaterThan(oldClampedCorridor + 10);
    const query = vi.spyOn(terrain, "firstNavigationHazard");
    try {
      const result = new AiNavigationRecovery().command("open-sea-range", self, 0, 0);
      expect(result.throttleLimit).toBe(-.25);
      // Call-through observes real open-water clearance. The final query is the
      // current stern's stopping corridor, not the candidate's 100 m route.
      const [map, from, to, draft, padding] = query.mock.calls.at(-1)!;
      expect(map).toBe("open-sea-range");
      expect(draft).toBe(shipDraftMeters("yamato"));
      expect(padding).toBe(hull.beam * .42);
      expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeCloseTo(expectedCorridor, 8);
    } finally { query.mockRestore(); }
  });

  it("bounds reverse corridor queries and reuses the existing half-second cache", () => {
    const { state, self, recovery } = fixture("firstContact");
    const query = vi.spyOn(terrain, "firstNavigationHazard");
    try {
      const first = recovery.command(state.mapId, self, 0, 0);
      const firstCount = query.mock.calls.length;
      expect(firstCount).toBeGreaterThan(0);
      expect(firstCount).toBeLessThan(80);
      for (let tick = 1; tick < 30; ++tick) {
        expect(recovery.command(state.mapId, self, 1, tick * FIXED_STEP)).toEqual(first);
      }
      expect(query.mock.calls).toHaveLength(firstCount);
      recovery.command(state.mapId, self, 0, .5);
      expect(query.mock.calls.length - firstCount).toBeGreaterThan(0);
      expect(query.mock.calls.length - firstCount).toBeLessThan(80);
    } finally { query.mockRestore(); }
  });

  it("preserves the existing unobstructed reverse throttle and heading", () => {
    const { self, recovery } = fixture("firstContact");
    self.position = { x: 0, y: 0, z: 0 }; self.previousPosition = { ...self.position };
    self.heading = .7; self.speedKnots = 0;
    const result = recovery.command("open-sea-range", self, 1.2, 0);
    expect(result.throttleLimit).toBe(-.25);
    expect(Math.atan2(Math.sin(result.desiredHeading - self.heading),
      Math.cos(result.desiredHeading - self.heading))).toBeCloseTo(0);
  });
});
