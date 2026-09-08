import { describe, expect, it } from "vitest";
import { ATOLL_MAP, canExitNavigationContact, shipDraftMeters, terrainContour, terrainNavigationAt,
  terrainSafeHeading, terrainZoneClearance } from "../src/maps/atollMap";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { getShipClass } from "../src/ships/classes";
import { AiNavigationRecovery } from "../src/sim/aiNavigation";
import { FIXED_STEP } from "../src/sim/config";
import { createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipState } from "../src/sim/types";

const idle = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint } });

function marginFixture() {
  const zone = ATOLL_MAP.terrain.find(({ id }) => id === "central-sand-nw")!;
  const padding = getShipClass("fletcher").beam * .42;
  const shore = terrainContour(zone, 24, 1 + padding / Math.min(zone.radiusX, zone.radiusZ) * .5)[0]!;
  const from = { ...shore, y: 0 };
  const length = Math.hypot(from.x - zone.x, from.z - zone.z);
  const outward = { x: (from.x - zone.x) / length, z: (from.z - zone.z) / length };
  return { zone, padding, from, outward, draft: shipDraftMeters("fletcher") };
}

describe("legal shoreline recovery", () => {
  it("allows a local outward step from hull padding but rejects inward, long cross-island and dry-land steps", () => {
    const { zone, padding, from, outward, draft } = marginFixture();
    expect(terrainNavigationAt(ATOLL_MAP.id, from.x, from.z, draft).kind).not.toBe("grounded");
    expect(terrainZoneClearance(zone, from.x, from.z, padding)).toBeLessThan(0);
    expect(canExitNavigationContact(ATOLL_MAP.id, from, { x: from.x + outward.x, y: 0, z: from.z + outward.z }, draft, padding)).toBe(true);
    expect(canExitNavigationContact(ATOLL_MAP.id, from, { x: from.x - outward.x, y: 0, z: from.z - outward.z }, draft, padding)).toBe(false);
    expect(canExitNavigationContact(ATOLL_MAP.id, from, { x: zone.x * 2 - from.x, y: 0, z: zone.z * 2 - from.z }, draft, padding)).toBe(false);
    expect(canExitNavigationContact(ATOLL_MAP.id, { x: zone.x, y: 0, z: zone.z },
      { x: zone.x + 1, y: 0, z: zone.z }, draft, padding)).toBe(false);
  });

  it("normal reverse propulsion leaves existing contact, while the same bow-in motion remains blocked", () => {
    const { from, outward } = marginFixture();
    for (const reverse of [false, true]) {
      const state = createInitialState(731, "battle");
      const ship = state.ships[0]!;
      ship.position = { ...from }; ship.previousPosition = { ...from };
      ship.heading = Math.atan2(-outward.x, -outward.z);
      ship.speedKnots = reverse ? -1 : 1;
      const commands = new Map(state.ships.map((entry) => [entry.id, idle(entry)]));
      commands.set(ship.id, { ...idle(ship), throttle: reverse ? -.25 : .25 });
      for (let step = 0; step < 600; ++step) stepSimulation(state, commands, FIXED_STEP);
      const travelled = Math.hypot(ship.position.x - from.x, ship.position.z - from.z);
      if (reverse) { expect(travelled).toBeGreaterThan(5); expect(ship.navigationZone).not.toBe("grounded"); }
      else { expect(travelled).toBeLessThan(.01); expect(ship.navigationZone).toBe("grounded"); }
    }
  });

  it("uses a bounded reverse command without modifying state or requiring engine/turning buffs", () => {
    const state = createInitialState(732, "battle");
    const ship = state.ships[0]!;
    ship.navigationZone = "grounded";
    const before = structuredClone(ship);
    const planner = new AiNavigationRecovery();
    const command = planner.command(state.mapId, ship, ship.heading, 3);
    expect(command.recovering).toBe(true);
    expect(command.throttleLimit).toBe(-.25);
    expect(ship).toEqual(before);
    expect(planner.command(state.mapId, ship, ship.heading + 1, 3.1)).toBe(command);
  });

  it("a normal AI escapes a padded shoreline overlap while keeping its center off land", () => {
    const { from, outward, draft } = marginFixture();
    const state = createInitialState(733, "battle");
    const ship = state.ships[0]!;
    ship.position = { ...from }; ship.previousPosition = { ...from };
    ship.heading = Math.atan2(-outward.x, -outward.z);
    ship.navigationZone = "grounded";
    const controller = new RuleBasedAi(733);
    let reversed = false;
    for (let step = 0; step < 60 * 60; ++step) {
      const command = controller.command(observe(state, ship.id));
      reversed ||= command.throttle < 0;
      stepSimulation(state, new Map(state.ships.map((entry) => [entry.id, entry.id === ship.id ? command : idle(entry)])), FIXED_STEP);
      expect(terrainNavigationAt(state.mapId, ship.position.x, ship.position.z, draft).kind).not.toBe("grounded");
    }
    expect(reversed).toBe(true);
    expect(Math.hypot(ship.position.x - from.x, ship.position.z - from.z)).toBeGreaterThan(15);
  });

  it("chooses a coast-clearing course instead of driving inward from contact", () => {
    const { from, outward } = marginFixture();
    const inward = Math.atan2(-outward.x, -outward.z);
    const safe = terrainSafeHeading(ATOLL_MAP.id, from, inward, "fletcher");
    for (const distance of [25, 65, 120]) {
      expect(terrainNavigationAt(ATOLL_MAP.id, from.x + Math.sin(safe) * distance,
        from.z + Math.cos(safe) * distance, shipDraftMeters("fletcher")).kind).not.toBe("grounded");
    }
  });
});
