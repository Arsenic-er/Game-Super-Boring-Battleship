import { describe, expect, it } from "vitest";
import {
  ATOLL_TERRAIN_ZONES, firstTerrainIntersection, terrainBlocksLineOfSight,
  terrainHeightAt, terrainZoneContains,
} from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { createAirSquadronState, shipAntiAirProfile } from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import {
  createDeveloperShipState, createInitialState, stepSimulation,
} from "../src/sim/simulation";
import type { BattleMapId } from "../src/maps/atollMap";
import type { ControlCommand, ShipState, Team, Vec3 } from "../src/sim/types";
import type { WeatherId } from "../src/sim/weather";

const a = { x: 3035.1183128077537, y: 0, z: -1037.8978638909757 };
const b = { x: 1710.5826835613698, y: 0, z: 3293.8307989388704 };
const along = (t: number, y = 0): Vec3 => ({
  x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t,
});
const origin = along(.56);
const lowTarget = along(.95, 20);
const other = (team: Team): Team => team === "player" ? "enemy" : "player";
const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
const draw = (seed: number) => (Math.imul(1_664_525, seed) + 1_013_904_223) >>> 0;

// Seed 7 misses the existing flak probability; seed 1972 hits it on the first
// fixed tick. Neither test changes flak rules, mocks randomness or mutates RNG.
function fixture(
  team: Team, mapId: BattleMapId, seed = 7, altitude = 20, weatherId: WeatherId = "clear",
) {
  const state = createInitialState(seed, "sea-trials");
  state.mapId = mapId; state.weatherId = weatherId; state.underwaterTargets = [];
  const battery = createDeveloperShipState({
    id: "aa-battery", team, shipClassId: "yamato", position: { ...origin },
    antiAirMounts: 8, secondaryGunIds: [], torpedoLauncherMounts: 0, aiControlled: false,
  });
  const owner = createDeveloperShipState({
    id: "air-owner", team: other(team), shipClassId: "fletcher",
    position: { x: -5_500, y: 0, z: -5_500 }, antiAirMounts: 0,
    secondaryGunIds: [], torpedoLauncherMounts: 0, aiControlled: false,
  });
  state.ships = [battery, owner];
  const position = { ...lowTarget, y: altitude };
  const aircraft = createAirSquadronState({
    id: "aa-target", controllerId: owner.id, team: owner.team, role: "fighter",
    position, heading: 0,
    recoverySource: { kind: "mapEdge", position: { x: position.x, y: 80, z: 5_500 } },
  });
  aircraft.phase = "outbound";
  aircraft.flight = { speedMetersPerSecond: 105, pitch: 0, bank: 0 };
  aircraft.order = {
    squadronId: aircraft.id, kind: "moveTo", issuedAt: 0,
    area: { center: { x: position.x, y: altitude, z: 5_000 }, radius: 90 },
  };
  state.airSquadrons = [aircraft];
  const advance = () => stepSimulation(state, new Map(state.ships.map(ship => [ship.id, idle(ship)])),
    FIXED_STEP, { automatedAirControllerIds: new Set() });
  return { state, battery, owner, aircraft, advance };
}

describe("AA fire paths respect real atoll relief", () => {
  it("uses an offshore battery and a genuine separated-lobe ray within legal AA range", () => {
    const zone = ATOLL_TERRAIN_ZONES.find(zone => zone.id === "mountain-ne")!;
    const profile = shipAntiAirProfile("yamato", 8);
    expect(Math.hypot(origin.x - lowTarget.x, origin.z - lowTarget.z)).toBeLessThan(profile.rangeMeters);
    expect(terrainHeightAt("atoll-prototype", origin.x, origin.z)).toBe(0);
    expect(terrainHeightAt("atoll-prototype", lowTarget.x, lowTarget.z)).toBe(0);
    const p1 = along(.62), gap = along(.647), p2 = along(.72);
    expect(terrainZoneContains(zone, p1.x, p1.z)).toBe(true);
    expect(terrainHeightAt("atoll-prototype", p1.x, p1.z)).toBeLessThan(17.5);
    expect(terrainZoneContains(zone, gap.x, gap.z)).toBe(false);
    expect(terrainZoneContains(zone, p2.x, p2.z)).toBe(true);
    expect(terrainHeightAt("atoll-prototype", p2.x, p2.z)).toBeGreaterThan(20);
    const first = firstTerrainIntersection("atoll-prototype", { ...origin, y: 20 }, lowTarget, ["mountain"]);
    expect(first?.zone.id).toBe("mountain-ne");
    expect(first!.distanceFraction).toBeGreaterThan((.649 - .56) / (.95 - .56));
  });

  for (const team of ["player", "enemy"] as const) {
    it.each([7, 1972])(`${team}: blocks continuous fire and seeded flak behind a concave ridge (seed %s)`, seed => {
      const { state, battery, aircraft, advance } = fixture(team, "atoll-prototype", seed);
      expect(terrainBlocksLineOfSight(state.mapId, battery.position, aircraft.position,
        getShipClass(battery.shipClassId).deckHeight, 0)).toBe(true);
      const health = aircraft.airframeHealth;
      advance();
      const live = state.airSquadrons[0]!;
      expect(terrainBlocksLineOfSight(state.mapId, battery.position, live.position,
        getShipClass(battery.shipClassId).deckHeight, 0)).toBe(true);
      expect(live.airframeHealth).toBe(health);
      expect(state.airEvents.filter(event => event.kind === "aircraftLost")).toEqual([]);
      // No physical fire => no flak draw, just as for out-of-range batteries.
      expect(state.randomSeed).toBe(seed);
    });

    it.each([7, 1972])(`${team}: preserves exact open-sea continuous/flak damage and one draw (seed %s)`, seed => {
      const { state, battery, aircraft, advance } = fixture(team, "open-sea-range", seed);
      const profile = shipAntiAirProfile(battery.shipClassId, battery.antiAirMounts,
        battery.antiAirEfficiencyMultiplier);
      const flakHit = draw(seed) / 0x1_0000_0000
        < 1 - Math.exp(-profile.flakBurstsPerSecond * FIXED_STEP);
      expect(flakHit).toBe(seed === 1972);
      const expected = profile.continuousDps * FIXED_STEP + (flakHit ? profile.flakDamage : 0);
      const health = aircraft.airframeHealth;
      advance();
      expect(health - state.airSquadrons[0]!.airframeHealth).toBeCloseTo(expected, 8);
      expect(state.randomSeed).toBe(draw(seed));
    });

    it(`${team}: can fire over the ridge at high aircraft without changing AA range`, () => {
      const { state, battery, aircraft, advance } = fixture(team, "atoll-prototype", 1972, 450);
      expect(terrainBlocksLineOfSight(state.mapId, battery.position, aircraft.position,
        getShipClass(battery.shipClassId).deckHeight, 0)).toBe(false);
      const health = aircraft.airframeHealth;
      advance();
      expect(state.airSquadrons[0]!.airframeHealth).toBeLessThan(health);
      expect(state.randomSeed).toBe(draw(1972));
    });

    it(`${team}: excludes only blocked batteries from a mixed clear/blocked AA group`, () => {
      const run = (includeBlocked: boolean) => {
        const { state, battery, aircraft, advance } = fixture(team, "atoll-prototype", 1972);
        const visible = createDeveloperShipState({
          id: "clear-battery", team, shipClassId: "fletcher", antiAirMounts: 1,
          position: { x: lowTarget.x + 300, y: 0, z: lowTarget.z },
          secondaryGunIds: [], torpedoLauncherMounts: 0, aiControlled: false,
        });
        expect(terrainBlocksLineOfSight(state.mapId, visible.position, aircraft.position,
          getShipClass(visible.shipClassId).deckHeight, 0)).toBe(false);
        state.ships.push(visible);
        if (!includeBlocked) battery.antiAirMounts = 0;
        const health = aircraft.airframeHealth;
        advance();
        return { damage: health - state.airSquadrons[0]!.airframeHealth, seed: state.randomSeed };
      };
      const clearOnly = run(false);
      expect(clearOnly.damage).toBeGreaterThan(0);
      expect(run(true)).toEqual(clearOnly);
    });

    it.each(["rain-squall", "sea-fog"] as const)(
      `${team}: weather does not shorten physical AA range or alter its damage (%s)`, weather => {
        const run = (weatherId: WeatherId) => {
          const { state, aircraft, advance } = fixture(team, "open-sea-range", 1972, 20, weatherId);
          const health = aircraft.airframeHealth;
          advance();
          return {
            damage: health - state.airSquadrons[0]!.airframeHealth,
            seed: state.randomSeed,
            seen: state.airSquadrons[0]!.contactsByTeam[team]?.observedAt === state.time,
          };
        };
        const clear = run("clear"), obscured = run(weather);
        expect(clear.seen).toBe(true);
        expect(obscured.seen).toBe(false);
        expect(obscured.damage).toBe(clear.damage);
        expect(obscured.seed).toBe(clear.seed);
      },
    );

    it(`${team}: does not consume flak RNG when every battery is outside unchanged range`, () => {
      const { state, battery, aircraft, advance } = fixture(team, "open-sea-range", 1972);
      const range = shipAntiAirProfile(battery.shipClassId, battery.antiAirMounts).rangeMeters;
      aircraft.position = { x: battery.position.x + range + 200, y: 100, z: battery.position.z };
      aircraft.previousPosition = { ...aircraft.position };
      const health = aircraft.airframeHealth;
      advance();
      expect(state.airSquadrons[0]!.airframeHealth).toBe(health);
      expect(state.randomSeed).toBe(1972);
    });
  }
});
