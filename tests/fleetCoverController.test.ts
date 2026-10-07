import { afterEach, describe, expect, it, vi } from "vitest";
import * as cover from "../src/sim/fleetCover";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import { AI_TORPEDO, FIXED_STEP } from "../src/sim/config";
import { SHIP_CLASSES, getShipClass } from "../src/ships/classes";
import { terrainBlocksLineOfSight } from "../src/maps/atollMap";
import type { Observation } from "../src/sim/types";

const contactPosition = { x: 0, y: 0, z: 3000 };
function damagedFixture() {
  const state = createInitialState(848, "battle");
  state.mapId = "atoll-prototype";
  const ship = createDeveloperShipState({ id: "player", team: "player", shipClassId: "fletcher",
    position: { x: -3000, y: 0, z: 2000 }, heading: 0, secondaryGunIds: [] });
  ship.hull = ship.maxHull * .2;
  ship.recoverableHull = ship.hull;
  ship.smokeCharges = 0;
  state.ships = [ship, state.ships.find(s => s.id === "enemy")!];
  const observation = (time: number): Observation => ({
    ...observe(state, ship.id), time, contacts: [], friendlies: [],
    sharedContacts: [{ id: "enemy", team: "enemy", observedAt: Math.max(0, time - 3),
      position: { ...contactPosition }, heading: 0, speedKnots: 0,
      rangeMeters: Math.hypot(ship.position.x, ship.position.z - 3000),
      confidence: .7, estimatedHullRatio: .9, sourceShipId: "scout", receivedAt: time }],
    incomingTorpedoes: [],
  });
  return { state, ship, observation };
}
afterEach(() => vi.restoreAllMocks());

describe("fleet cover controller integration", () => {
  it("plans at a bounded cadence, suppresses firing, and clears cover after repairs", () => {
    const { ship, observation } = damagedFixture();
    const planner = vi.spyOn(cover, "planFleetCover");
    const ai = new RuleBasedAi(81);
    for (let frame = 0; frame < 120; frame++) {
      const command = ai.command(observation(3 + frame * FIXED_STEP));
      expect(command.aiDecision?.phase).toBe("withdrawing");
      expect(command.aiDecision?.seekingCover).toBe(true);
      expect(command.fire).toBe(false);
    }
    expect(planner).toHaveBeenCalledTimes(1);
    ai.command(observation(5.01));
    expect(planner).toHaveBeenCalledTimes(2);
    ship.hull = ship.maxHull;
    expect(ai.command(observation(5.02)).aiDecision?.seekingCover).toBe(false);
  });

  it("stops at verified cover rather than continuing through its waypoint", () => {
    const { ship, observation } = damagedFixture();
    const plan = cover.planFleetCover("atoll-prototype", ship, contactPosition)!;
    expect(plan).toBeDefined();
    ship.position = { ...plan.point };
    ship.previousPosition = { ...plan.point };
    ship.speedKnots = 0;
    const maxEnemyEyeHeight = Math.max(...Object.values(SHIP_CLASSES).map(hull => hull.deckHeight + 12));
    expect(terrainBlocksLineOfSight("atoll-prototype", contactPosition, ship.position,
      maxEnemyEyeHeight, getShipClass(ship.shipClassId).deckHeight + 12)).toBe(true);
    const command = new RuleBasedAi(82).command(observation(3));
    expect(command.aiDecision?.seekingCover).toBe(true);
    expect(command.throttle).toBe(0);
    expect(command.fire).toBe(false);
  });

  it("gives torpedo evasion priority over a cached island retreat", () => {
    const { ship, observation } = damagedFixture();
    const ai = new RuleBasedAi(83);
    expect(ai.command(observation(3)).aiDecision?.seekingCover).toBe(true);
    const threat = { id: 9, position: { x: ship.position.x, y: 0, z: ship.position.z + 100 },
      velocity: { x: 20, y: 0, z: 0 }, distanceMeters: 100, armed: true,
      side: "port" as const, closingSpeedMetersPerSecond: 20, closestApproachMeters: 0, timeToClosestApproach: 5 };
    ai.command({ ...observation(3.1), incomingTorpedoes: [threat] });
    const command = ai.command({ ...observation(3.1 + AI_TORPEDO.evasionReactionMaxSeconds + .1), incomingTorpedoes: [threat] });
    expect(command.aiDecision?.phase).toBe("evading");
    expect(command.aiDecision?.seekingCover).toBe(false);
  });

  it("holds a protected damaged ship through real movement steps without running aground", () => {
    const { state, ship, observation } = damagedFixture();
    const plan = cover.planFleetCover(state.mapId, ship, contactPosition)!;
    ship.position = { ...plan.point };
    ship.previousPosition = { ...plan.point };
    ship.heading = plan.heading;
    ship.speedKnots = 8;
    const start = { ...ship.position };
    const ai = new RuleBasedAi(84);
    let grounded = false;
    for (let frame = 0; frame < 60 * 20; frame++) {
      const command = ai.command(observation(state.time + 3));
      stepSimulation(state, new Map(state.ships.map(other => [other.id, other.id === ship.id
        ? command : { throttle: 0, rudder: 0, fire: false, aimPoint: other.aimPoint }])), FIXED_STEP);
      grounded ||= ship.navigationZone === "grounded";
    }
    expect(grounded).toBe(false);
    expect(Math.abs(ship.speedKnots)).toBeLessThan(.5);
    expect(Math.hypot(ship.position.x - start.x, ship.position.z - start.z)).toBeLessThan(150);
    expect(ship.hull).toBeCloseTo(ship.maxHull * .2);
  }, 15000);

  it.each([0, -2.2852459628902633])("reaches protective terrain from an exposed position (initial heading %s)", (heading) => {
    const { state, ship, observation } = damagedFixture();
    ship.heading = heading;
    const ai = new RuleBasedAi(85);
    const maxEnemyEyeHeight = Math.max(...Object.values(SHIP_CLASSES).map(hull => hull.deckHeight + 12));
    let reachedCover = false, grounded = false;
    for (let frame = 0; frame < 60 * 180; frame++) {
      const command = ai.command(observation(state.time + 3));
      stepSimulation(state, new Map(state.ships.map(other => [other.id, other.id === ship.id
        ? command : { throttle: 0, rudder: 0, fire: false, aimPoint: other.aimPoint }])), FIXED_STEP);
      grounded ||= ship.navigationZone === "grounded";
      reachedCover = terrainBlocksLineOfSight(state.mapId, contactPosition, ship.position,
        maxEnemyEyeHeight, getShipClass(ship.shipClassId).deckHeight + 12);
      if (reachedCover && Math.abs(ship.speedKnots) < .5) break;
    }
    expect(grounded).toBe(false);
    expect(reachedCover).toBe(true);
    expect(Math.abs(ship.speedKnots)).toBeLessThan(.5);
    expect(ship.hull).toBeCloseTo(ship.maxHull * .2);
  }, 15000);

  it("treats arrival radius as slowdown, not proof the hull is already behind the ridge", () => {
    const { ship, observation } = damagedFixture();
    vi.spyOn(cover, "planFleetCover").mockReturnValue({
      point: { x: ship.position.x - 40, y: 0, z: ship.position.z },
      heading: -Math.PI / 2, distanceMeters: 40, arrivalRadiusMeters: 80,
    });
    const command = new RuleBasedAi(86).command(observation(3));
    expect(command.aiDecision?.seekingCover).toBe(true);
    expect(command.throttle).toBeGreaterThan(0);
    expect(command.throttle).toBeLessThanOrEqual(.2);
  });
});
