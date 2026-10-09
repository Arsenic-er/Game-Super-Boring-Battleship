import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { firstNavigationHazard, shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ShipClassId } from "../src/ships/classes";
import type { ControlCommand, ShipState } from "../src/sim/types";

const wrap = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const idle = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });
function shipAt(shipClassId: ShipClassId = "tashkent") {
  return createDeveloperShipState({ id: "player", team: "player", shipClassId,
    position: { x: 0, y: 0, z: 0 }, heading: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
}
function backedAway(ship = shipAt(), desired = Math.PI) {
  const recovery = new AiNavigationRecovery();
  ship.navigationZone = "grounded";
  const reverse = recovery.command("open-sea-range", ship, desired, 0);
  expect(reverse).toMatchObject({ throttleLimit: -.25, recovering: true });
  ship.navigationZone = "deep";
  ship.position.z = -70;
  ship.speedKnots = 0;
  return { recovery, ship };
}

describe("reverse recovery exits into a checked safe heading", () => {
  it("leaves ordinary unobstructed navigation unchanged without entering recovery", () => {
    const recovery = new AiNavigationRecovery(), ship = shipAt();
    const original = structuredClone(ship);
    expect(recovery.command("open-sea-range", ship, 1.2, 0)).toEqual({ desiredHeading: 1.2, throttleLimit: undefined, recovering: false });
    expect(recovery.command("open-sea-range", ship, -.7, .1)).toEqual({ desiredHeading: -.7, throttleLimit: undefined, recovering: false });
    expect(ship).toEqual(original);
  });

  it("permits checked slow steerage even when the safe route is behind the ship", () => {
    const { recovery, ship } = backedAway();
    const original = structuredClone(ship);
    const command = recovery.command("open-sea-range", ship, Math.PI, 13);
    expect(command).toMatchObject({ throttleLimit: .18, recovering: true });
    expect(Math.abs(wrap(command.desiredHeading - Math.PI))).toBeLessThan(1e-8);
    expect(ship).toEqual(original);
  });

  it("uses low-speed steerage only after the checked bow corridor is clear, then resumes normal travel", () => {
    const { recovery, ship } = backedAway();
    ship.heading = Math.PI / 3;
    expect(recovery.command("open-sea-range", ship, 0, 13)).toMatchObject({ throttleLimit: .18, recovering: true });
    ship.heading = Math.PI / 9;
    expect(recovery.command("open-sea-range", ship, 0, 14)).toEqual({ desiredHeading: 0, throttleLimit: undefined, recovering: false });
  });

  it("still brakes when actual shallow terrain blocks the hull-scaled bow corridor", () => {
    const { recovery, ship } = backedAway(shipAt("yamato"));
    const hull = getShipClass(ship.shipClassId), draft = shipDraftMeters(ship.shipClassId);
    const padding = hull.beam * .6 + 12, corridor = hull.length * 1.4;
    // Find a deterministic real deep-water approach to the existing NE shoal;
    // the obstacle is beyond the 100m immediate reverse probe, but inside the
    // larger battleship exit corridor. No mocked safety answer is involved.
    const approach = Array.from({ length: 57 }, (_, index) => ({ x: index * 25, y: 0, z: 1790 }))
      .find(position => {
        if (terrainNavigationAt("atoll-prototype", position.x, position.z, draft).kind !== "deep") return false;
        const hazard = firstNavigationHazard("atoll-prototype", position,
          { ...position, x: position.x + corridor }, draft, padding);
        const distance = hazard ? hazard.distanceFraction * corridor : Infinity;
        return distance > 130 && distance < 260;
      });
    expect(approach).toBeDefined();
    ship.position = approach!;
    ship.previousPosition = { ...ship.position };
    ship.heading = Math.PI / 2;
    const command = recovery.command("atoll-prototype", ship, -Math.PI / 2, 13);
    expect(command).toMatchObject({ throttleLimit: 0, recovering: true });
  });

  it("does not resume ahead propulsion while still making appreciable sternway", () => {
    const { recovery, ship } = backedAway();
    ship.heading = Math.PI;
    ship.speedKnots = -2;
    expect(recovery.command("open-sea-range", ship, Math.PI, 13)).toMatchObject({ throttleLimit: 0, recovering: true });
    ship.speedKnots = 0;
    expect(recovery.command("open-sea-range", ship, Math.PI, 14).recovering).toBe(false);
  });

  it("prioritizes a renewed grounded contact over the reorientation phase", () => {
    const { recovery, ship } = backedAway();
    expect(recovery.command("open-sea-range", ship, Math.PI, 13).throttleLimit).toBe(.18);
    ship.navigationZone = "grounded";
    expect(recovery.command("open-sea-range", ship, Math.PI, 13.1)).toMatchObject({ throttleLimit: -.25, recovering: true });
  });

  it("does not creep or return an outward exit course at the map boundary", () => {
    const { recovery, ship } = backedAway(shipAt("yamato"));
    ship.position = { x: 0, y: 0, z: 5950 };
    ship.heading = 0;
    const command = recovery.command("open-sea-range", ship, 0, 13);
    expect(command).toMatchObject({ throttleLimit: 0, recovering: true });
    expect(Math.cos(command.desiredHeading)).toBeLessThan(-.99);
    // Finishing the turn is not enough: the caller still requests an outward
    // course, and the hull has not moved away from the boundary yet.
    ship.heading = Math.PI;
    const turned = recovery.command("open-sea-range", ship, 0, 14);
    expect(turned).toMatchObject({ throttleLimit: .18, recovering: true });
    expect(Math.cos(turned.desiredHeading)).toBeLessThan(-.99);
    expect(recovery.command("open-sea-range", ship, 0, 14.1)).toEqual(turned);
  });

  it("holds the checked inward course until a battleship physically clears the boundary corridor", () => {
    const state = createInitialState(719, "sea-trials");
    state.mapId = "open-sea-range"; state.airSquadrons = []; state.time = 13;
    const { recovery, ship } = backedAway(shipAt("yamato"));
    ship.position = { x: 0, y: 0, z: 5950 };
    ship.previousPosition = { ...ship.position };
    ship.heading = Math.PI; ship.speedKnots = 0;
    state.ships = [ship];
    let released = false;
    for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
      // A stubborn outward caller must not defeat a recovery already under way.
      const navigation = recovery.command(state.mapId, ship, 0, state.time);
      expect(Math.cos(navigation.desiredHeading)).toBeLessThan(-.99);
      expect(ship.position.z).toBeLessThanOrEqual(5950);
      if (!navigation.recovering) {
        released = true;
        expect(ship.position.z).toBeLessThan(5600);
        // Once safely clear, ordinary callers regain control (including on the
        // next cached frame); no permanent boundary steering policy is added.
        expect(recovery.command(state.mapId, ship, .4, state.time + .1).desiredHeading).toBe(.4);
        break;
      }
      stepSimulation(state, new Map([[ship.id, {
        ...idle(ship), throttle: Math.min(.88, navigation.throttleLimit ?? 1),
        rudder: Math.max(-.82, Math.min(.82, wrap(navigation.desiredHeading - ship.heading) * 1.25)),
      }]]), FIXED_STEP);
    }
    expect(released).toBe(true);
    expect(ship.navigationZone).not.toBe("grounded");
  });

  it("uses unchanged battleship propulsion and rudder physics to finish a modest exit turn", () => {
    const state = createInitialState(711, "sea-trials");
    state.mapId = "open-sea-range"; state.airSquadrons = [];
    const { recovery, ship } = backedAway(shipAt("yamato"));
    state.ships = [ship]; state.time = 13;
    ship.heading = Math.PI / 3;
    const originalTurnModifier = ship.performance.turnMultiplier;
    let finished = false, maxRudder = 0;
    for (let step = 0; step < 180 / FIXED_STEP; ++step) {
      const navigation = recovery.command(state.mapId, ship, 0, state.time);
      finished ||= !navigation.recovering;
      const command = { ...idle(ship),
        throttle: Math.min(.88, navigation.throttleLimit ?? 1),
        rudder: Math.max(-.82, Math.min(.82, wrap(navigation.desiredHeading - ship.heading) * 1.25)) };
      maxRudder = Math.max(maxRudder, Math.abs(command.rudder));
      stepSimulation(state, new Map([[ship.id, command]]), FIXED_STEP);
    }
    expect(finished).toBe(true);
    expect(ship.position.z).toBeGreaterThan(0);
    expect(maxRudder).toBeLessThanOrEqual(.82);
    expect(ship.performance.turnMultiplier).toBe(originalTurnModifier);
    expect(ship.navigationZone).not.toBe("grounded");
  });


  it("makes physical progress during a full battleship exit turn rather than remaining stopped for most of a match", () => {
    const state = createInitialState(721, "sea-trials");
    state.mapId = "open-sea-range"; state.airSquadrons = []; state.time = 13;
    const { recovery, ship } = backedAway(shipAt("yamato"));
    state.ships = [ship];
    const start = { ...ship.position }, initialHeading = ship.heading;
    let maxRudder = 0;
    for (let tick = 0; tick < 180 / FIXED_STEP; ++tick) {
      const navigation = recovery.command(state.mapId, ship, Math.PI, state.time);
      const rudder = Math.max(-.82, Math.min(.82, wrap(navigation.desiredHeading - ship.heading) * 1.25));
      maxRudder = Math.max(maxRudder, Math.abs(rudder));
      stepSimulation(state, new Map([[ship.id, {
        ...idle(ship), throttle: Math.min(.88, navigation.throttleLimit ?? 1), rudder,
      }]]), FIXED_STEP);
      expect(ship.navigationZone).not.toBe("grounded");
      expect(Math.max(Math.abs(ship.position.x), Math.abs(ship.position.z))).toBeLessThan(6000);
    }
    // This is a progress bound, not an impossible instant 180-degree BB turn.
    expect(Math.hypot(ship.position.x - start.x, ship.position.z - start.z)).toBeGreaterThan(100);
    expect(Math.abs(wrap(ship.heading - initialHeading))).toBeGreaterThan(40 * Math.PI / 180);
    expect(maxRudder).toBeLessThanOrEqual(.82);
  });

  it("escapes the rounded near-coast DD pose without repeating short reverse/forward loops", () => {
    // This is a synthetic reset from a rounded historical log pose, not a replay
    // of the original battle's controllers, contacts or hidden recovery state.
    const state = createInitialState(901, "sea-trials");
    state.mapId = "atoll-prototype"; state.airSquadrons = []; state.time = 900;
    const ship = shipAt();
    ship.position = { x: 1183.37, y: 0, z: 1714.57 };
    ship.previousPosition = { ...ship.position }; ship.heading = -5.87;
    ship.speedKnots = 2.59; ship.rudder = -.82;
    ship.hull = ship.maxHull * .65; ship.recoverableHull = ship.hull;
    ship.modules.engine.health *= .9; ship.modules.steering.health *= .9;
    state.ships = [ship];
    state.objective.owner = "enemy"; state.objective.captureProgress = -1;
    const controller = new RuleBasedAi(901);
    let reverseSeconds = 0, reverseStarts = 0, wasReversing = false, groundedSeconds = 0;
    for (let step = 0; step < 360 / FIXED_STEP; ++step) {
      const command = controller.command({ ...observe(state, ship.id), gameMode: "battle",
        contacts: [], incomingTorpedoes: [], friendlies: [],
        fleetObjective: { duty: "capture", urgent: false, assignedAt: state.time, stationIndex: 0 } });
      command.fire = false;
      const reversing = command.throttle < 0;
      if (reversing && !wasReversing) ++reverseStarts;
      if (reversing) reverseSeconds += FIXED_STEP;
      wasReversing = reversing;
      stepSimulation(state, new Map([[ship.id, command]]), FIXED_STEP);
      if (ship.navigationZone === "grounded") groundedSeconds += FIXED_STEP;
    }
    expect(reverseStarts).toBe(1);
    expect(reverseSeconds).toBeLessThan(60);
    expect(groundedSeconds).toBe(0);
    expect(Math.hypot(ship.position.x - state.objective.center.x,
      ship.position.z - state.objective.center.z)).toBeLessThan(state.objective.radius);
  });
});
