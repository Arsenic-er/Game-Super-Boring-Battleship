import { describe, expect, it } from "vitest";
import { terrainNavigationAt, shipDraftMeters } from "../src/maps/atollMap";
import { getShipClass, type ShipClassId } from "../src/ships/classes";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import { SENSOR } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, observe } from "../src/sim/simulation";
import type { Team, Vec3 } from "../src/sim/types";

const cases: Array<{ name: string; shipClassId: ShipClassId; a: Vec3; b: Vec3 }> = [
  { name: "nearby destroyers", shipClassId: "kagero",
    a: { x: 2505.3040611092003, y: 0, z: 694.7936012409628 },
    b: { x: 1843.0362464860082, y: 0, z: 2860.6579326558857 } },
  { name: "long-range battleships", shipClassId: "north-carolina",
    a: { x: 3035.1183128077537, y: 0, z: -1037.8978638909757 },
    b: { x: 1710.5826835613698, y: 0, z: 3293.8307989388704 } },
];

describe("real optical sensors behind a multi-lobed mountain", () => {
  for (const fixture of cases) for (const swapTeams of [false, true]) for (const reverseReads of [false, true]) {
    it(`${fixture.name}: labels ${swapTeams ? "swapped" : "normal"}, reads ${reverseReads ? "B-first" : "A-first"}`, () => {
      const state = createInitialState(71410, "battle");
      state.weatherId = "clear";
      const team: Team = swapTeams ? "enemy" : "player";
      const make = (id: string, side: Team, position: Vec3) => {
        const ship = createDeveloperShipState({ id, team: side, shipClassId: fixture.shipClassId, position });
        ship.lastMainGunFiredAt = 0;
        return ship;
      };
      const a = make("sensor-a", team, fixture.a);
      const b = make("sensor-b", team === "player" ? "enemy" : "player", fixture.b);
      state.ships = [a, b];
      const range = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
      for (const ship of state.ships) {
        expect(Math.min(SENSOR.gunBloomDetectionMeters, effectiveMainBattery(ship).maximumRangeMeters))
          .toBeGreaterThan(range);
        expect(terrainNavigationAt("atoll-prototype", ship.position.x, ship.position.z,
          shipDraftMeters(ship.shipClassId)).kind).not.toBe("grounded");
        expect(getShipClass(ship.shipClassId).deckHeight + 12).toBeLessThan(43);
      }
      const ids = reverseReads ? [b.id, a.id] : [a.id, b.id];
      for (const time of [0, 2.5, 5]) {
        state.time = time;
        state.mapId = "atoll-prototype";
        state.sensorSnapshots = {};
        for (const id of ids) expect(observe(state, id).contacts, id + " must not see through the second ridge").toEqual([]);
        // Same ships/range/weather/bloom, with terrain removed. This proves an
        // empty contact list was not just random non-detection or insufficient range.
        state.mapId = "open-sea-range";
        state.sensorSnapshots = {};
        for (const id of ids) {
          expect(observe(state, id).contacts.map(contact => contact.id)).toEqual([id === a.id ? b.id : a.id]);
        }
      }
    });
  }
});
