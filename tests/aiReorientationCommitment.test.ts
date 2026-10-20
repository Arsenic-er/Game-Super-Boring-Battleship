import { afterEach, describe, expect, it, vi } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { firstNavigationHazard, shipDraftMeters, terrainNavigationAt, terrainSafeHeading } from "../src/maps/atollMap";
import { AiNavigationRecovery, type AiNavigationCommand } from "../src/sim/aiNavigation";
import { getShipClass } from "../src/ships/classes";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";

const wrap = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
const idle = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });
const baseHeading = 1.9319642701386281;

// Public placement reconstructed from 7v7 mirrored b5, then moved 280m toward
// the real shoal. This starts fresh controllers and ordinary production physics;
// it is not a replay of that battle's private state, equipment or moving targets.
function fixture(team: Team, headingDelta: number) {
  const state = createInitialState(0x71701 + 211, "battle");
  state.mapId = "atoll-prototype"; state.airSupport = "none"; state.airSquadrons = [];
  state.weatherId = "rain-squall";
  const other: Team = team === "player" ? "enemy" : "player";
  state.objective.owner = other; state.objective.captureProgress = other === "player" ? 1 : -1;
  const self = createDeveloperShipState({
    id: "reconstructed-b5", team, shipClassId: "richelieu",
    position: { x: 839.8414641286926 + Math.sin(baseHeading) * 280, y: 0,
      z: -1226.4256758616373 + Math.cos(baseHeading) * 280 },
    heading: baseHeading + headingDelta, aiControlled: true,
    torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  const target = createDeveloperShipState({
    id: "reconstructed-contact", team: other, shipClassId: "edinburgh",
    position: { x: -851.3478685825222, y: 0, z: 5.924982570474185 },
    heading: 0, torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  const navigation = terrainNavigationAt(state.mapId, self.position.x, self.position.z, shipDraftMeters(self.shipClassId));
  self.navigationZone = navigation.kind; self.waterDepthMeters = navigation.depthMeters;
  state.ships = [self, target];
  return { state, self, target, ai: new RuleBasedAi(0x71701 + 211) };
}

afterEach(() => vi.restoreAllMocks());

describe("reorientation commits to a verified exit instead of oscillating across terrain candidates", () => {
  for (const team of ["player", "enemy"] as const) {
    for (const headingDelta of [-.006, 0, .006]) {
      it(team + " heading offset " + headingDelta + " naturally recovers and resumes normal navigation", () => {
        const { state, self, target, ai } = fixture(team, headingDelta);
        expect(self.navigationZone).toBe("deep");
        const originalPerformance = { ...self.performance };
        const original = AiNavigationRecovery.prototype.command;
        let navigation: AiNavigationCommand | undefined;
        const calls = vi.spyOn(AiNavigationRecovery.prototype, "command")
          .mockImplementation(function (this: AiNavigationRecovery, ...args) {
            navigation = original.apply(this, args); return navigation;
          });
        let started = false, releasedAt: number | null = null, reorientationAt: number | null = null;
        let asternSeconds = 0, groundedSeconds = 0, stopped = 0, longestStopped = 0;
        let normalSeconds = 0, normalTravel = 0, reorientationHeading: number | undefined;
        let greatestTurn = 0, maxRudder = 0, reverseStarts = 0, wasReversing = false;
        for (let tick = 0; tick < 600 / FIXED_STEP; ++tick) {
          navigation = undefined;
          const command = ai.command({ ...observe(state, self.id), fleetObjective: {
            duty: "capture", urgent: true, assignedAt: state.time, stationIndex: 0,
          } });
          expect(navigation).toBeDefined();
          const current = navigation!;
          started ||= current.recovering;
          const reversing = command.throttle < 0;
          if (reversing && !wasReversing) ++reverseStarts;
          wasReversing = reversing;
          if (started && current.recovering && !reversing && reorientationAt === null) {
            reorientationAt = state.time; reorientationHeading = self.heading;
          }
          if (started && !current.recovering && releasedAt === null) releasedAt = state.time;
          if (releasedAt !== null && !current.recovering) normalSeconds += FIXED_STEP;
          else if (releasedAt !== null) break;
          const previous = { ...self.position };
          maxRudder = Math.max(maxRudder, Math.abs(command.rudder));
          stepSimulation(state, new Map([[self.id, command], [target.id, idle(target)]]), FIXED_STEP);
          if (self.speedKnots < -.1) asternSeconds += FIXED_STEP;
          if (self.navigationZone === "grounded") groundedSeconds += FIXED_STEP;
          stopped = Math.abs(self.speedKnots) < .1 ? stopped + FIXED_STEP : 0;
          longestStopped = Math.max(longestStopped, stopped);
          if (reorientationHeading !== undefined) greatestTurn = Math.max(greatestTurn,
            Math.abs(wrap(self.heading - reorientationHeading)));
          if (releasedAt !== null) normalTravel += Math.hypot(self.position.x - previous.x, self.position.z - previous.z);
          calls.mockClear();
          if (normalSeconds >= 30) break;
        }
        if (process.env.REORIENTATION_REPORT === "1") console.log("REORIENTATION_REPORT", JSON.stringify({
          team, headingDelta, started, releasedAt, reorientationAt, asternSeconds, groundedSeconds,
          longestStopped, normalSeconds, normalTravel, greatestTurn, reverseStarts,
        }));
        expect(started).toBe(true);
        expect(reorientationAt).not.toBeNull();
        expect(asternSeconds).toBeGreaterThan(30);
        expect(releasedAt, "the first physical recovery must finish, not keep seesawing at zero throttle").not.toBeNull();
        expect(normalSeconds).toBeGreaterThanOrEqual(30);
        expect(normalTravel).toBeGreaterThan(40);
        expect(greatestTurn).toBeGreaterThan(20 * Math.PI / 180);
        expect(longestStopped).toBeLessThan(30);
        expect(groundedSeconds).toBe(0);
        expect(reverseStarts).toBe(1);
        expect(maxRudder).toBeLessThanOrEqual(.82);
        expect(self.performance).toEqual(originalPerformance);
      }, 30_000);
    }
  }
});


// Only the six integration cases above establish recovery through real motion.
// The guards below set public navigation/pose boundaries, never private fields.
function guardBeforeHandoff() {
  const state = createInitialState(71831, "sea-trials");
  state.mapId = "open-sea-range"; state.airSupport = "none"; state.airSquadrons = [];
  const self = createDeveloperShipState({
    id: "reorientation-guard", team: "player", shipClassId: "richelieu",
    position: { x: 0, y: 0, z: 0 }, heading: 0,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [],
  });
  state.ships = [self];
  const recovery = new AiNavigationRecovery();
  self.navigationZone = "grounded";
  expect(recovery.command(state.mapId, self, 1.2, 0).throttleLimit).toBe(-.25);
  self.navigationZone = "deep"; self.position.z = -70; self.previousPosition = { ...self.position };
  state.time = 13;
  return { state, self, recovery };
}

function blockedGuard(firstHeading = 4.28) {
  const result = guardBeforeHandoff();
  const { state, self, recovery } = result;
  state.mapId = "atoll-prototype";
  // Public relocation is only a phase-boundary guard, not acceptance evidence.
  self.position = { x: 839.8414641286926, y: 0, z: -1226.4256758616373 };
  self.previousPosition = { ...self.position }; self.heading = baseHeading;
  const first = recovery.command(state.mapId, self, firstHeading, state.time);
  expect(first).toMatchObject({ recovering: true, throttleLimit: 0 });
  return { ...result, first };
}

function committedGuard() {
  const result = blockedGuard();
  const { state, self, recovery } = result;
  // Both full exit corridors are safe. The actual bow corridor is blocked.
  // A >45-degree candidate reversal with almost no hull rotation is the signal.
  expect(recovery.command(state.mapId, self, .43, 13.6).desiredHeading).toBeCloseTo(.43, 10);
  const first = recovery.command(state.mapId, self, 4.28, 14.2);
  expect(first.desiredHeading).toBeCloseTo(.43, 10);
  state.time = 14.2;
  return { ...result, first };
}

describe("demonstrated blocked reorientation chatter keeps safety and priority boundaries", () => {
  it("holds a verified exit only after a blocked low-speed candidate reversal and retains the half-second cache", () => {
    const { state, self, recovery, first } = committedGuard();
    const before = structuredClone(self);
    expect(recovery.command(state.mapId, self, 4.15, 14.3)).toEqual(first);
    expect(recovery.command(state.mapId, self, 4.15, 14.8).desiredHeading).toBeCloseTo(.43, 10);
    expect(recovery.command(state.mapId, self, 4.05, 15.4).desiredHeading).toBeCloseTo(.43, 10);
    expect(self).toEqual(before);
  });

  it("drops a demonstrated commitment for an emergency at the existing cadence and does not retain that emergency", () => {
    const { state, self, recovery, first } = committedGuard();
    expect(recovery.command(state.mapId, self, 4.28, 14.3, true)).toEqual(first);
    const emergency = recovery.command(state.mapId, self, 4.28, 14.8, true);
    expect(emergency.desiredHeading).toBeCloseTo(4.28, 10);
    expect(emergency.recovering).toBe(true);
    expect(recovery.command(state.mapId, self, 4.15, 15.4).desiredHeading).toBeCloseTo(4.15, 10);
    expect(recovery.command(state.mapId, self, 4.28, 16).desiredHeading).toBeCloseTo(4.28, 10);
  });

  it("lets renewed grounding bypass cached reorientation and clears the old exit before a new recovery", () => {
    const { state, self, recovery } = committedGuard();
    self.navigationZone = "grounded";
    expect(recovery.command(state.mapId, self, 4.28, 14.3)).toMatchObject({ recovering: true, throttleLimit: -.25 });
    state.mapId = "open-sea-range"; self.navigationZone = "deep";
    self.position = { x: 0, y: 0, z: -140 }; self.previousPosition = { ...self.position }; self.heading = 0;
    const next = recovery.command(state.mapId, self, -1.2, 27);
    expect(next).toMatchObject({ recovering: true, throttleLimit: .18 });
    expect(next.desiredHeading).toBeCloseTo(-1.2, 10);
  });

  it("revalidates a committed exit against a changed real terrain corridor rather than holding an unsafe direction", () => {
    const { state, self, recovery } = committedGuard();
    self.position = { x: 700, y: 0, z: -2300 }; self.previousPosition = { ...self.position }; self.heading = 0;
    const hull = getShipClass(self.shipClassId), draft = shipDraftMeters(self.shipClassId);
    const end = (heading: number, length = hull.length * 1.4) => ({
      x: self.position.x + Math.sin(heading) * length, y: 0,
      z: self.position.z + Math.cos(heading) * length,
    });
    expect(firstNavigationHazard(state.mapId, self.position, end(0, 100),
      draft, hull.beam * .6 + 12)).toBeUndefined();
    expect(firstNavigationHazard(state.mapId, self.position, end(.43),
      draft, hull.beam * .6 + 12)?.zone.id).toBe("lagoon-se");
    const command = recovery.command(state.mapId, self, -1.5, 14.8);
    expect(command.desiredHeading).toBeCloseTo(-1.5, 10);
    expect(firstNavigationHazard(state.mapId, self.position, end(command.desiredHeading),
      draft, hull.beam * .6 + 12)).toBeUndefined();
    expect(command).toMatchObject({ recovering: true, throttleLimit: 0 });
  });

  it("gives the boundary lock priority over a committed exit until the full inward corridor clears", () => {
    const { state, self, recovery } = committedGuard();
    state.mapId = "open-sea-range"; self.position = { x: 0, y: 0, z: 5950 };
    self.previousPosition = { ...self.position }; self.heading = 0;
    const outside = recovery.command(state.mapId, self, 0, 14.8);
    expect(outside).toMatchObject({ recovering: true, throttleLimit: 0 });
    expect(Math.cos(outside.desiredHeading)).toBeLessThan(-.99);
    self.heading = Math.PI;
    const inward = recovery.command(state.mapId, self, 0, 15.4);
    expect(inward).toMatchObject({ recovering: true, throttleLimit: .18 });
    expect(Math.cos(inward.desiredHeading)).toBeLessThan(-.99);
    self.position.z = 5500; self.previousPosition = { ...self.position };
    const cleared = recovery.command(state.mapId, self, 0, 16);
    expect(cleared.recovering).toBe(false);
    expect(Math.cos(cleared.desiredHeading)).toBeLessThan(-.99);
    expect(recovery.command(state.mapId, self, .4, 16.1).desiredHeading).toBe(.4);
  });

  it("withholds ahead propulsion while making sternway even after a committed exit becomes clear", () => {
    const { state, self, recovery } = committedGuard();
    state.mapId = "open-sea-range"; self.speedKnots = -2;
    const command = recovery.command(state.mapId, self, 4.28, 14.8);
    expect(command).toMatchObject({ recovering: true, throttleLimit: 0 });
    expect(command.desiredHeading).toBeCloseTo(.43, 10);
    expect(self.speedKnots).toBe(-2);
  });

  it.each([0, .1])("keeps real inertia and braking with engine ratio %s during committed reorientation", engineRatio => {
    const { state, self, recovery } = committedGuard();
    state.mapId = "open-sea-range";
    self.modules.engine.health = self.modules.engine.maxHealth * engineRatio; self.speedKnots = -2;
    const before = { ...self.position };
    const command = recovery.command(state.mapId, self, 4.28, 14.8);
    expect(command.throttleLimit).toBe(0);
    stepSimulation(state, new Map([[self.id, { ...idle(self), throttle: command.throttleLimit!, rudder: 0 }]]), FIXED_STEP);
    expect(Math.hypot(self.position.x - before.x, self.position.z - before.z)).toBeGreaterThan(0);
    expect(self.speedKnots).toBeLessThan(-1.9);
    if (engineRatio === 0) expect(self.speedKnots).toBe(-2);
    else expect(self.speedKnots).toBeGreaterThan(-2);
    expect(self.navigationZone).not.toBe("grounded");
  });

  it("clears the demonstrated commitment after recovery and returns ordinary heading control", () => {
    const { state, self, recovery } = committedGuard();
    self.heading = .43;
    const completed = recovery.command(state.mapId, self, 4.28, 14.8);
    expect(completed.recovering).toBe(false);
    expect(completed.desiredHeading).toBeCloseTo(.43, 10);
    expect(recovery.command(state.mapId, self, 4.28, 14.9).desiredHeading).toBe(4.28);
  });
});

describe("ordinary reorientation is not misclassified as blocked candidate chatter", () => {
  it("keeps a moving clear-water recovery responsive to a changing destination", () => {
    const { state, self, recovery } = guardBeforeHandoff();
    self.speedKnots = 5;
    const start = { ...self.position };
    for (const [index, heading] of [1.2, -.9, .8].entries()) {
      const command = recovery.command(state.mapId, self, heading, 13 + index * .6);
      expect(command).toMatchObject({ recovering: true, throttleLimit: .18 });
      expect(command.desiredHeading).toBeCloseTo(heading, 10);
      stepSimulation(state, new Map([[self.id, { ...idle(self), throttle: command.throttleLimit!,
        rudder: Math.max(-.82, Math.min(.82, wrap(heading - self.heading) * 1.25)) }]]), FIXED_STEP);
    }
    expect(Math.hypot(self.position.x - start.x, self.position.z - start.z)).toBeGreaterThan(0);
    expect(self.speedKnots).toBeGreaterThan(4);
  });

  it("does not lock a blocked, nearly stationary recovery that is steadily turning in the same direction", () => {
    const { state, self, recovery, first } = blockedGuard();
    expect(first.desiredHeading).toBeCloseTo(4.28, 10);
    const start = self.heading;
    for (const [index, requested] of [4.15, 4.05, 4.28].entries()) {
      const expected = terrainSafeHeading(state.mapId, self.position, requested, self.shipClassId);
      expect(wrap(expected - self.heading)).toBeGreaterThan(0);
      const command = recovery.command(state.mapId, self, requested, 13.6 + index * .6);
      expect(command).toMatchObject({ recovering: true, throttleLimit: 0 });
      expect(command.desiredHeading).toBeCloseTo(expected, 10);
      stepSimulation(state, new Map([[self.id, { ...idle(self), rudder: .82 }]]), FIXED_STEP);
    }
    expect(self.heading).toBeGreaterThan(start);
    expect(self.speedKnots).toBe(0);
  });

  it("does not mistake opposite signs across the plus/minus pi representation for a large candidate reversal", () => {
    const nearPositivePi = baseHeading + Math.PI - .02;
    const nearNegativePi = baseHeading - Math.PI + .02;
    const { state, self, recovery, first } = blockedGuard(nearPositivePi);
    expect(first.desiredHeading).toBeCloseTo(nearPositivePi, 10);
    const next = recovery.command(state.mapId, self, nearNegativePi, 13.6);
    expect(next.desiredHeading).toBeCloseTo(nearNegativePi, 10);
    expect(Math.abs(wrap(next.desiredHeading - first.desiredHeading))).toBeCloseTo(.04, 10);
    const changed = recovery.command(state.mapId, self, nearNegativePi + .1, 14.2);
    expect(changed.desiredHeading).toBeCloseTo(nearNegativePi + .1, 10);
    expect(changed.throttleLimit).toBe(0);
  });

  it("does not lock small near-alignment sign changes while braking and completes when sternway stops", () => {
    const { state, self, recovery } = guardBeforeHandoff();
    self.heading = 1.18; self.speedKnots = -1;
    const first = recovery.command(state.mapId, self, 1.2, 13);
    expect(first).toMatchObject({ recovering: true, throttleLimit: 0 });
    const overshoot = recovery.command(state.mapId, self, 1.17, 13.6);
    expect(overshoot.desiredHeading).toBeCloseTo(1.17, 10);
    expect(overshoot).toMatchObject({ recovering: true, throttleLimit: 0 });
    self.speedKnots = 0;
    const aligned = recovery.command(state.mapId, self, 1.16, 14.2);
    expect(aligned.recovering).toBe(false);
    expect(aligned.desiredHeading).toBeCloseTo(1.16, 10);
  });
});
