import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { battleMapDefinition } from "../src/maps/atollMap";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import { AI_TORPEDO, FIXED_STEP, GUN } from "../src/sim/config";
import {
  createDeveloperShipState, createInitialState, mainBatteryMountCanBear, observe, stepSimulation,
} from "../src/sim/simulation";
import type { ControlCommand, ShipState, Team } from "../src/sim/types";

const angleDifference = (a: number, b: number): number =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});

function fixture(shipClassId: ShipClassId = "fletcher", team: Team = "player") {
  const state = createInitialState(0x82010, "battle");
  state.mapId = "open-sea-range";
  state.airSupport = "none";
  const center = state.objective.center;
  const self = createDeveloperShipState({
    id: "station-gunner", team, shipClassId,
    position: { x: center.x - state.objective.radius * .3, y: 0, z: center.z },
    heading: 0, aiControlled: true,
    mainGunMounts: shipClassId === "fletcher" ? 1 : getShipClass(shipClassId).starterSlots.mainGun,
    torpedoLauncherMounts: 0, depthChargeMounts: 0, secondaryGunIds: [],
  });
  const target = createDeveloperShipState({
    id: "rear-contact", team: team === "player" ? "enemy" : "player", shipClassId,
    position: { x: self.position.x, y: 0, z: self.position.z - 380 },
    heading: 0, mainGunMounts: 1, torpedoLauncherMounts: 0, depthChargeMounts: 0,
    secondaryGunIds: [],
  });
  state.ships = [self, target];
  const observation = () => ({ ...observe(state, self.id), fleetObjective: {
    duty: "capture" as const, urgent: false, assignedAt: state.time, stationIndex: 0 as const,
  } });
  const advance = (command: ControlCommand) => stepSimulation(state,
    new Map([[self.id, command], [target.id, idle(target)]]), FIXED_STEP);
  return { state, self, target, observation, advance };
}

/** Acquire with the real sensor and clock while a stationary input owns the hull. */
function acquireAtStation(specimen: ReturnType<typeof fixture>, ai: RuleBasedAi): ControlCommand {
  let command!: ControlCommand;
  for (let tick = 0; tick <= 8 / FIXED_STEP; ++tick) {
    command = ai.command(specimen.observation());
    if (tick < 8 / FIXED_STEP) specimen.advance(idle(specimen.self));
  }
  expect(command.perception?.mode).toBe("tracking");
  expect(command.aiDecision?.contactSource).toBe("local");
  return command;
}

describe("stationed AI clears a genuine main-battery blind sector with physical movement", () => {
  for (const team of ["player", "enemy"] as const) {
    for (const shipClassId of ["fletcher", "richelieu"] as const) {
      it(`${team} ${shipClassId} turns its front-only battery into a tracked stern target without abandoning the cap`, () => {
        const specimen = fixture(shipClassId, team);
        const { state, self, target, observation, advance } = specimen;
        const ai = new RuleBasedAi(77);
        const start = { ...self.position };
        const startingHeading = self.heading;
        expect(Math.hypot(target.position.x - self.position.x, target.position.z - self.position.z))
          .toBeGreaterThanOrEqual(GUN.minAimRange);
        expect(Math.hypot(target.position.x - state.objective.center.x,
          target.position.z - state.objective.center.z)).toBeLessThan(state.objective.radius);
        expect(self.mainBatteryMounts.every(mount => !mainBatteryMountCanBear(self, mount.mountIndex, target.position)))
          .toBe(true);
        let tracked = false, fired = false, greatestThrottle = 0, greatestObjectiveDistance = 0;
        for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
          const input = observation();
          expect(input.contacts.map(contact => contact.id)).toContain(target.id);
          const command = ai.command(input);
          tracked ||= command.perception?.mode === "tracking";
          expect(command.aiDecision?.objectiveDuty).toBe("capture");
          greatestThrottle = Math.max(greatestThrottle, command.throttle);
          advance(command);
          greatestObjectiveDistance = Math.max(greatestObjectiveDistance,
            Math.hypot(self.position.x - state.objective.center.x, self.position.z - state.objective.center.z));
          expect([self.heading, self.speedKnots, self.position.x, self.position.z].every(Number.isFinite)).toBe(true);
          const bounds = battleMapDefinition(state.mapId).halfExtentMeters;
          expect(Math.max(Math.abs(self.position.x), Math.abs(self.position.z))).toBeLessThan(bounds);
          fired = state.shots.some(shot => shot.ownerId === self.id && shot.weaponSource === "mainGun");
          if (fired) break;
        }
        expect(tracked).toBe(true);
        expect(fired, "a live track must eventually produce a real main-gun shot through an available arc").toBe(true);
        expect(greatestThrottle).toBeGreaterThan(0);
        expect(greatestThrottle).toBeLessThanOrEqual(.65);
        expect(Math.hypot(self.position.x - start.x, self.position.z - start.z)).toBeGreaterThan(5);
        expect(angleDifference(self.heading, startingHeading)).toBeGreaterThan(10 * Math.PI / 180);
        expect(greatestObjectiveDistance).toBeLessThanOrEqual(state.objective.radius);
        expect(state.time).toBeLessThanOrEqual(180 + 1e-6);
      }, 30_000);
    }
  }

  for (const team of ["player", "enemy"] as const) {
    it(`${team} keeps a reachable healthy aft gun firing without needlessly moving the whole ship`, () => {
      const { state, self, target, observation, advance } = fixture("north-carolina", team);
      const ai = new RuleBasedAi(77);
      expect(self.mainBatteryMounts.some(mount => mainBatteryMountCanBear(self, mount.mountIndex, target.position)))
        .toBe(true);
      const start = { ...self.position }, heading = self.heading;
      let fired = false;
      for (let tick = 0; tick < 45 / FIXED_STEP; ++tick) {
        const command = ai.command(observation());
        expect(command.throttle).toBe(0);
        expect(Math.abs(command.rudder)).toBeLessThan(1e-8);
        advance(command);
        fired = state.shots.some(shot => shot.ownerId === self.id && shot.weaponSource === "mainGun");
        if (fired) break;
      }
      expect(fired).toBe(true);
      expect(self.position).toEqual(start);
      expect(angleDifference(self.heading, heading)).toBeLessThan(1e-9);
    });
  }

  it("does not start the firing maneuver before the real optical track is acquired", () => {
    const { observation, advance, self } = fixture();
    const ai = new RuleBasedAi(77);
    for (let tick = 0; tick < 7 / FIXED_STEP; ++tick) {
      const command = ai.command(observation());
      expect(command.perception?.mode).not.toBe("tracking");
      expect(command.throttle).toBe(0);
      expect(command.rudder).toBe(0);
      expect(command.fire).toBe(false);
      advance(command);
    }
    expect(self.speedKnots).toBe(0);
  });

  it("does not read a hidden enemy pose or maneuver toward an unobserved stern target", () => {
    const run = (x: number, z: number) => {
      const specimen = fixture("richelieu");
      specimen.target.position = { x, y: 0, z };
      specimen.target.previousPosition = { ...specimen.target.position };
      const ai = new RuleBasedAi(77);
      let result!: ControlCommand;
      for (let tick = 0; tick < 8 / FIXED_STEP; ++tick) {
        const input = specimen.observation();
        expect(input.contacts).toHaveLength(0);
        result = ai.command(input);
        expect(result.fire).toBe(false);
        expect(result.throttle).toBe(0);
        specimen.advance(result);
      }
      return result;
    };
    expect(run(5_500, 5_500)).toEqual(run(-5_500, -5_500));
  });


  it("cancels a pending firing maneuver when the acquired local contact is removed", () => {
    const specimen = fixture("richelieu");
    const ai = new RuleBasedAi(77);
    const acquired = acquireAtStation(specimen, ai);
    expect(acquired.throttle).toBeGreaterThan(0);
    specimen.state.ships = [specimen.self];
    const input = specimen.observation();
    expect(input.contacts).toHaveLength(0);
    const command = ai.command(input);
    expect(command.perception?.mode).not.toBe("tracking");
    expect(command.throttle).toBe(0);
    expect(command.fire).toBe(false);
  });

  it("returns a near-edge capper toward its station instead of driving a rear-gun turn out of the circle", () => {
    const specimen = fixture("richelieu");
    const { state, self, target } = specimen;
    self.position.x = state.objective.center.x + state.objective.radius - 70;
    self.previousPosition = { ...self.position };
    target.position.x = self.position.x;
    target.previousPosition = { ...target.position };
    const command = acquireAtStation(specimen, new RuleBasedAi(77));
    const towardCenter = Math.atan2(state.objective.center.x - self.position.x,
      state.objective.center.z - self.position.z);
    expect(command.aiDecision?.objectiveDuty).toBe("capture");
    expect(command.throttle).toBeGreaterThan(.2);
    expect(angleDifference(command.aiDecision!.desiredHeading, towardCenter)).toBeLessThan(.1);
  });

  it("keeps severe-damage withdrawal ahead of a live rear firing opportunity", () => {
    const specimen = fixture("richelieu");
    const ai = new RuleBasedAi(77);
    acquireAtStation(specimen, ai);
    specimen.self.hull = specimen.self.maxHull * .2;
    specimen.self.recoverableHull = specimen.self.hull;
    const command = ai.command(specimen.observation());
    expect(command.aiDecision?.phase).toBe("withdrawing");
    expect(command.throttle).toBeLessThanOrEqual(.52);
    expect(angleDifference(command.aiDecision!.desiredHeading, 0)).toBeLessThan(.05);
  });

  it.each(["gun", "engine", "steering"] as const)("does not request a firing-turn propulsion boost with a disabled %s", module => {
    const specimen = fixture("richelieu");
    const ai = new RuleBasedAi(77);
    acquireAtStation(specimen, ai);
    specimen.self.modules[module].health = 0;
    const command = ai.command(specimen.observation());
    expect(command.throttle).toBe(0);
    expect(command.fire).toBe(false);
  });

  it("preserves grounded reverse recovery despite a tracked rear target", () => {
    const specimen = fixture("richelieu");
    const ai = new RuleBasedAi(77);
    acquireAtStation(specimen, ai);
    // A grounded navigation state is the input boundary being exercised.
    specimen.self.navigationZone = "grounded";
    const command = ai.command(specimen.observation());
    expect(command.throttle).toBe(-.25);
    expect(command.throttle).not.toBe(0);
  });

  it("gives an actually observed approaching torpedo priority over the firing turn", () => {
    const specimen = fixture("richelieu");
    const { state, self, target, observation, advance } = specimen;
    const ai = new RuleBasedAi(77);
    acquireAtStation(specimen, ai);
    state.projectiles.push({
      id: 918, ownerId: target.id, team: target.team, kind: "torpedo",
      position: { x: self.position.x + 500, y: -1, z: self.position.z },
      previousPosition: { x: self.position.x + 500, y: -1, z: self.position.z },
      velocity: { x: -20, y: 0, z: 0 }, damage: 100, age: 10,
      distanceTravelled: 300, armingDistance: 120, maximumRange: 5_000, detectionRange: 700,
    });
    let command!: ControlCommand;
    let evadingSince: number | undefined;
    // The existing terrain/nav planners update at bounded subsecond intervals;
    // priority is immediate, but their returned heading need not change that frame.
    for (let tick = 0; tick <= (AI_TORPEDO.evasionReactionMaxSeconds + 1) / FIXED_STEP; ++tick) {
      const input = observation();
      expect(input.incomingTorpedoes.map(threat => threat.id)).toContain(918);
      command = ai.command(input);
      if (command.aiDecision?.phase === "evading") {
        evadingSince ??= state.time;
        expect(command.throttle).toBe(1);
        if (state.time - evadingSince >= .6) break;
      }
      advance(idle(self));
    }
    expect(command.aiDecision?.phase).toBe("evading");
    expect(command.throttle).toBe(1);
    expect(Math.abs(Math.sin(command.aiDecision!.desiredHeading))).toBeGreaterThan(.99);
  });
});
