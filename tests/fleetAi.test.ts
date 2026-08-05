import { describe, expect, it } from "vitest";
import {
  fleetRoleForShip,
  friendlyCollisionRisk,
  RuleBasedAi,
} from "../src/controllers/ruleBasedAi";
import { spawnDeveloperShip } from "../src/sim/developerSandbox";
import { createInitialState, observe } from "../src/sim/simulation";

describe("two-sided fleet AI", () => {
  it("assigns stable historical hull roles", () => {
    const state = createInitialState();
    const destroyer = state.ships.find(({ id }) => id === "player")!;
    const cruiser = spawnDeveloperShip(state, "player", "cleveland")!;
    const battleship = spawnDeveloperShip(state, "player", "bismarck")!;
    expect(fleetRoleForShip(destroyer)).toBe("screen");
    expect(fleetRoleForShip(cruiser)).toBe("escort");
    expect(fleetRoleForShip(battleship)).toBe("line");
  });

  it("predicts a head-on friendly close approach and steers away", () => {
    const state = createInitialState();
    const self = state.ships.find(({ id }) => id === "player")!;
    const ally = spawnDeveloperShip(state, "player", "cleveland")!;
    self.position = { x: 0, y: 0, z: 0 };
    self.heading = 0;
    self.speedKnots = 20;
    ally.position = { x: 0, y: 0, z: 240 };
    ally.heading = Math.PI;
    ally.speedKnots = 20;

    const risk = friendlyCollisionRisk(self, observe(state, self.id).friendlies);
    expect(risk?.friendlyId).toBe(ally.id);
    expect(risk?.timeToClosestApproach).toBeGreaterThan(0);
    expect(risk?.closestApproachMeters).toBeLessThan(5);
  });

  it("emits inspectable role, phase and navigation telemetry", () => {
    const state = createInitialState(818);
    const ally = spawnDeveloperShip(state, "player", "cleveland")!;
    const command = new RuleBasedAi(12).command(observe(state, ally.id));
    expect(command.aiDecision).toEqual(expect.objectContaining({
      role: "escort",
      desiredHeading: expect.any(Number),
      throttle: expect.any(Number),
      fireIntent: expect.any(Boolean),
    }));
  });

  it("shares exact friendly navigation only, while enemies remain sensor contacts", () => {
    const state = createInitialState(919);
    const ally = spawnDeveloperShip(state, "player", "cleveland")!;
    const observation = observe(state, "player");
    expect(observation.friendlies.some(({ id }) => id === ally.id)).toBe(true);
    expect(observation.friendlies.some(({ id }) => id === "enemy")).toBe(false);
    expect(observation.contacts.every(({ team }) => team === "enemy")).toBe(true);
  });
});
