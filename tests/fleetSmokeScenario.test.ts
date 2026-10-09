import { describe, expect, it } from "vitest";
import { battleMapDefinition, shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { battleLoadoutFromSlots, createDefaultLocalProfile } from "../src/profile/localProfile";
import { getShipClass } from "../src/ships/classes";
import { BATTLE_SPAWN } from "../src/sim/config";
import { createInitialState, observe } from "../src/sim/simulation";
import type { ShipState } from "../src/sim/types";
import {
  applyFleetSmokeSpawnSide, createFleetSmokeBattle, FLEET_SMOKE_SIDE_SWAP, prototypeSpawnSide,
} from "./helpers/fleetSmokeScenario";

const cases = [{ teamSize: 5, seed: 0x71501 }, { teamSize: 7, seed: 0x71701 }] as const;
const distance = (a: ShipState, b: ShipState): number =>
  Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
const headings = (ship: ShipState): number[] => [
  ship.heading, ship.turretHeading, ship.torpedoLauncherHeading,
  ...ship.mainBatteryMounts.map((mount) => mount.heading),
  ...ship.secondaryMounts.map((mount) => mount.heading),
];
function nonPlacement(ship: ShipState) {
  const { position, previousPosition, aimPoint, heading, turretHeading, torpedoLauncherHeading,
    mainBatteryMounts, secondaryMounts, navigationZone, waterDepthMeters, ...rest } = ship;
  return { ...rest, mainBatteryMounts: mainBatteryMounts.map(({ heading, ...mount }) => mount),
    secondaryMounts: secondaryMounts.map(({ heading, ...mount }) => mount) };
}
function originalBattle(teamSize: 5 | 7, seed: number) {
  const profile = createDefaultLocalProfile();
  const build = profile.savedShipBuilds.find(({ id }) => id === profile.selectedBattleBuildId)!;
  const loadout = battleLoadoutFromSlots(build.shipClassId, build.slots);
  return createInitialState(seed, "battle", loadout.mainGunId, loadout, loadout.torpedoId,
    loadout.shipClassId, { teamSize, weatherId: "clear" });
}

describe("full-fleet smoke spawn sides", () => {
  it("defaults explicitly and rejects malformed environment settings", () => {
    expect(prototypeSpawnSide(undefined)).toBe("default");
    expect(prototypeSpawnSide("default")).toBe("default");
    expect(prototypeSpawnSide("mirrored")).toBe("mirrored");
    for (const invalid of ["", "Mirror", "mirrored ", "1", "default\n"]) {
      expect(() => prototypeSpawnSide(invalid)).toThrow(/PROTOTYPE_SPAWN_SIDE/);
    }
  });

  for (const { teamSize, seed } of cases) {
    it(`${teamSize}v${teamSize} default is unchanged from the original smoke factory`, () => {
      const legacy = originalBattle(teamSize, seed);
      expect(createFleetSmokeBattle(teamSize, seed)).toEqual(legacy);
      expect(createFleetSmokeBattle(teamSize, seed, "default")).toEqual(legacy);
      expect(applyFleetSmokeSpawnSide(legacy, "default")).toBe(legacy);
    });

    it(`${teamSize}v${teamSize} swaps anchor sides while preserving all identities, equipment and formations`, () => {
      const original = createFleetSmokeBattle(teamSize, seed);
      const mirrored = createFleetSmokeBattle(teamSize, seed, "mirrored");
      expect(FLEET_SMOKE_SIDE_SWAP).toEqual({ kind: "rigid-180-degree-rotation",
        centerX: 90, centerZ: 175, terrainTransformed: false });
      expect(mirrored.ships.find(({ id }) => id === "player")!.position).toEqual(
        { ...BATTLE_SPAWN.enemy, y: 0 });
      expect(mirrored.ships.find(({ id }) => id === "enemy")!.position).toEqual(
        { ...BATTLE_SPAWN.player, y: 0 });
      expect(mirrored.randomSeed).toBe(original.randomSeed);
      expect(mirrored.objective).toEqual(original.objective);
      expect(mirrored.mapId).toBe(original.mapId);
      for (let i = 0; i < original.ships.length; ++i) {
        const before = original.ships[i]!, after = mirrored.ships[i]!;
        expect(nonPlacement(after)).toEqual(nonPlacement(before));
        for (const field of ["position", "previousPosition", "aimPoint"] as const) {
          expect(after[field]).toEqual({ x: 180 - before[field].x, y: before[field].y,
            z: 350 - before[field].z });
        }
        const oldHeadings = headings(before);
        headings(after).forEach((value, index) => {
          expect(Number.isFinite(value)).toBe(true);
          expect(Math.sin(value)).toBeCloseTo(-Math.sin(oldHeadings[index]!), 12);
          expect(Math.cos(value)).toBeCloseTo(-Math.cos(oldHeadings[index]!), 12);
        });
        for (let j = i + 1; j < original.ships.length; ++j) {
          expect(distance(after, mirrored.ships[j]!)).toBeCloseTo(distance(before, original.ships[j]!), 9);
        }
      }
    });

    it(`${teamSize}v${teamSize} half-turn applied twice restores every pose and heading`, () => {
      const state = createFleetSmokeBattle(teamSize, seed);
      const original = structuredClone(state);
      applyFleetSmokeSpawnSide(state, "mirrored");
      applyFleetSmokeSpawnSide(state, "mirrored");
      for (let i = 0; i < state.ships.length; ++i) {
        const after = state.ships[i]!, before = original.ships[i]!;
        expect(after.position).toEqual(before.position);
        expect(after.previousPosition).toEqual(before.previousPosition);
        expect(after.aimPoint).toEqual(before.aimPoint);
        const oldHeadings = headings(before);
        headings(after).forEach((value, index) => {
          expect(Math.sin(value)).toBeCloseTo(Math.sin(oldHeadings[index]!), 12);
          expect(Math.cos(value)).toBeCloseTo(Math.cos(oldHeadings[index]!), 12);
        });
        expect(nonPlacement(after)).toEqual(nonPlacement(before));
      }
    });

    it(`${teamSize}v${teamSize} both sides start finite, stationary, clear of terrain and at least 5 km apart`, () => {
      const terrainBefore = structuredClone(battleMapDefinition("atoll-prototype"));
      for (const side of ["default", "mirrored"] as const) {
        const state = createFleetSmokeBattle(teamSize, seed, side);
        const player = state.ships.filter(({ team }) => team === "player");
        const enemy = state.ships.filter(({ team }) => team === "enemy");
        expect(Math.min(...player.flatMap((a) => enemy.map((b) => distance(a, b)))))
          .toBeGreaterThanOrEqual(Math.max(5_000, BATTLE_SPAWN.minimumSeparationMeters));
        for (const ship of state.ships) {
          expect(ship.speedKnots).toBe(0);
          expect(ship.throttle).toBe(0);
          expect(ship.navigationZone).toBe("deep");
          const dimensions = getShipClass(ship.shipClassId);
          // Check a 5x3 grid spanning the hull's bounding footprint, not only its center.
          for (const along of [-.5, -.25, 0, .25, .5]) for (const across of [-.5, 0, .5]) {
            const forward = along * dimensions.length, lateral = across * dimensions.beam;
            const x = ship.position.x + Math.sin(ship.heading) * forward + Math.cos(ship.heading) * lateral;
            const z = ship.position.z + Math.cos(ship.heading) * forward - Math.sin(ship.heading) * lateral;
            expect([x, z, ship.position.y].every(Number.isFinite)).toBe(true);
            const nav = terrainNavigationAt(state.mapId, x, z, shipDraftMeters(ship.shipClassId));
            expect(nav.kind, `${side}: ${ship.id} footprint (${along},${across})`).toBe("deep");
            expect(nav.depthMeters - shipDraftMeters(ship.shipClassId)).toBeGreaterThan(.5);
          }
        }
      }
      expect(battleMapDefinition("atoll-prototype")).toEqual(terrainBefore);
    });
  }

  it("rejects live or already observed states before mutating them", () => {
    const progressed = createFleetSmokeBattle(5, 0x71501);
    progressed.time = 1;
    const progressedCopy = structuredClone(progressed);
    expect(() => applyFleetSmokeSpawnSide(progressed, "mirrored")).toThrow(/fresh, unobserved/);
    expect(progressed).toEqual(progressedCopy);
    const observed = createFleetSmokeBattle(5, 0x71501);
    observe(observed, "player");
    const observedCopy = structuredClone(observed);
    expect(() => applyFleetSmokeSpawnSide(observed, "mirrored")).toThrow(/fresh, unobserved/);
    expect(observed).toEqual(observedCopy);
  });
});
