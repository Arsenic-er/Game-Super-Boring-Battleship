import { describe, expect, it } from "vitest";
import { battleMapDefinition, shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { battleLoadoutFromSlots, createDefaultLocalProfile } from "../src/profile/localProfile";
import { getShipClass } from "../src/ships/classes";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import { savedBuildReadiness } from "../src/profile/savedBuilds";
import { BATTLE_SPAWN, FIXED_STEP } from "../src/sim/config";
import { createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { ShipState } from "../src/sim/types";
import {
  applyFleetSmokeSpawnSide, createFleetSmokeBattle, FLEET_SMOKE_SIDE_SWAP, prototypeSpawnSide,
  fleetSmokePlayerBuildReport, prepareFleetSmokeBuild, prototypePlayerBuild, PROTOTYPE_PLAYER_BUILDS,
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
      expect(createFleetSmokeBattle(teamSize, seed, "default", "default-fletcher")).toEqual(legacy);
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

describe("full-fleet smoke saved player builds", () => {
  it("accepts only explicit supported fixture names", () => {
    expect(prototypePlayerBuild(undefined)).toBe("default-fletcher");
    for (const fixture of PROTOTYPE_PLAYER_BUILDS) expect(prototypePlayerBuild(fixture)).toBe(fixture);
    for (const invalid of ["", "fletcher", "cleveland", "north-carolina", "default-fletcher ", "DEFAULT-FLETCHER"]) {
      expect(() => prototypePlayerBuild(invalid)).toThrow(/PROTOTYPE_PLAYER_BUILD/);
    }
  });

  it("builds a sea-ready Cleveland starter through its actual saved profile without spending resources", () => {
    const original = createDefaultLocalProfile();
    const { profile, build, loadout } = prepareFleetSmokeBuild("cleveland-starter");
    expect(profile.selectedBattleBuildId).toBe("smoke-cleveland-starter");
    expect(build.id).toBe(profile.selectedBattleBuildId);
    expect(build.shipClassId).toBe("cleveland");
    expect(savedBuildReadiness(profile, build)).toEqual({ ready: true, missing: [], missingSlots: [] });
    expect(build.slots).toEqual(profile.slotLoadoutsByShipClass.cleveland);
    expect(profile.credits).toBe(original.credits);
    expect(profile.researchPoints).toBe(original.researchPoints);
    expect(profile.materials).toEqual(original.materials);
    expect(profile.inventory).toEqual(original.inventory);
    expect(loadout).toMatchObject({ shipClassId: "cleveland", hullId: "lightCruiser",
      mainGunMounts: 4, torpedoLauncherMounts: 0, antiAirMounts: 2, depthChargeMounts: 0 });
    expect(loadout.secondaryGunIds).toHaveLength(6);
    expect(loadout.installedEquipment).toEqual(build.slots);
  });

  it("researches, buys, fits and saves one North Carolina magazine without granting resources", () => {
    const original = createDefaultLocalProfile();
    const { profile, build, loadout } = prepareFleetSmokeBuild("north-carolina-magazine-refit");
    expect(profile.selectedBattleBuildId).toBe("smoke-north-carolina-magazine-refit");
    expect(build.id).toBe(profile.selectedBattleBuildId);
    expect(savedBuildReadiness(profile, build)).toEqual({ ready: true, missing: [], missingSlots: [] });
    expect(profile.researchPoints).toBe(100);
    expect(profile.credits).toBe(8_200);
    expect(profile.materials).toEqual({ steel: 240, parts: 60 });
    expect(profile.unlockedEquipment["magazine-purple"]).toBe(true);
    expect(profile.inventory).toEqual({ ...original.inventory, "magazine-purple": 1 });
    expect(build.slots.magazine).toEqual(["magazine-purple"]);
    expect(profile.savedShipBuilds.find(({ id }) => id === "standard-north-carolina")!.slots.magazine)
      .toEqual(["magazine-common"]);
    expect(build.slots).toEqual(profile.slotLoadoutsByShipClass["north-carolina"]);
    expect(loadout).toMatchObject({ shipClassId: "north-carolina", hullId: "battleship",
      mainGunMounts: 3, torpedoLauncherMounts: 0, antiAirMounts: 2, depthChargeMounts: 0 });
    expect(loadout.secondaryGunIds).toHaveLength(10);
    expect(loadout.installedEquipment).toEqual(build.slots);
    expect(loadout.reloadMultiplier).toBeCloseTo(1 - .06 * .72, 12);
    expect(loadout.magazineRiskMultiplier).toBeCloseTo(1 + .06 * .24, 12);
    expect(loadout.maxSpeedMultiplier).toBeCloseTo(1.03, 12);
  });

  it("applies the purchased magazine to real battle-state reload after firing, not just metadata", () => {
    const state = createFleetSmokeBattle(5, 0x71501, "default", "north-carolina-magazine-refit");
    const player = state.ships.find(({ id }) => id === "player")!;
    expect(player.installedEquipment.magazine).toEqual(["magazine-purple"]);
    const battery = effectiveMainBattery(player);
    expect(battery.caliberMm).toBe(406);
    expect(battery.mounts.map(({ barrelCount }) => barrelCount)).toEqual([3, 3, 3]);
    stepSimulation(state, new Map([[player.id, {
      throttle: 0, rudder: 0, fire: true,
      aimPoint: { x: player.position.x + 2_000, y: 0, z: player.position.z },
    }]]), FIXED_STEP);
    expect(state.shots.filter(({ ownerId }) => ownerId === player.id)).toHaveLength(9);
    const expectedReload = battery.reloadSeconds * (1 - .06 * .72);
    expect(player.reloadRemaining).toBeCloseTo(expectedReload, 9);
    for (const mount of player.mainBatteryMounts) expect(mount.reloadRemaining).toBeCloseTo(expectedReload, 9);
    expect(expectedReload).toBeLessThan(battery.reloadSeconds * (1 - .03 * .72));
  });

  it("keeps old default report fields untouched and snapshots actual non-default equipment", () => {
    const defaultState = createFleetSmokeBattle(5, 0x71501);
    expect(fleetSmokePlayerBuildReport(defaultState, "default-fletcher")).toEqual({});
    const state = createFleetSmokeBattle(5, 0x71501, "default", "north-carolina-magazine-refit");
    const report = fleetSmokePlayerBuildReport(state, "north-carolina-magazine-refit");
    expect(report.playerBuild).toBe("north-carolina-magazine-refit");
    expect(report.playerBuildLoadout).toMatchObject({ shipClassId: "north-carolina",
      hullId: "battleship", mainGunMounts: 3, secondaryMounts: 10,
      installedEquipment: { magazine: ["magazine-purple"] },
      performance: { reloadMultiplier: 1 - .06 * .72 } });
    state.ships[0]!.installedEquipment.magazine[0] = "magazine-common";
    state.ships[0]!.performance.reloadMultiplier = 1;
    expect(report.playerBuildLoadout!.installedEquipment.magazine).toEqual(["magazine-purple"]);
    expect(report.playerBuildLoadout!.performance.reloadMultiplier).toBeCloseTo(1 - .06 * .72, 12);
  });

  for (const fixture of ["cleveland-starter", "north-carolina-magazine-refit"] as const) {
    for (const { teamSize, seed } of cases) {
      it(`${fixture} ${teamSize}v${teamSize} retains fleet identities, equipment and spacing across both spawn sides`, () => {
        const original = createFleetSmokeBattle(teamSize, seed, "default", fixture);
        const mirrored = createFleetSmokeBattle(teamSize, seed, "mirrored", fixture);
        expect(mirrored.randomSeed).toBe(original.randomSeed);
        expect(mirrored.objective).toEqual(original.objective);
        for (let index = 0; index < original.ships.length; ++index) {
          const before = original.ships[index]!, after = mirrored.ships[index]!;
          expect(nonPlacement(after)).toEqual(nonPlacement(before));
          for (const field of ["position", "previousPosition", "aimPoint"] as const) {
            expect(after[field]).toEqual({ x: 180 - before[field].x, y: before[field].y, z: 350 - before[field].z });
          }
          const oldHeadings = headings(before);
          headings(after).forEach((value, angleIndex) => {
            expect(Math.sin(value)).toBeCloseTo(-Math.sin(oldHeadings[angleIndex]!), 12);
            expect(Math.cos(value)).toBeCloseTo(-Math.cos(oldHeadings[angleIndex]!), 12);
          });
          for (let other = index + 1; other < original.ships.length; ++other) {
            expect(distance(after, mirrored.ships[other]!)).toBeCloseTo(distance(before, original.ships[other]!), 9);
          }
        }
        for (const state of [original, mirrored]) {
          const allied = state.ships.filter(({ team }) => team === "player");
          const enemy = state.ships.filter(({ team }) => team === "enemy");
          expect(allied).toHaveLength(teamSize);
          expect(enemy).toHaveLength(teamSize);
          expect(Math.min(...allied.flatMap((a) => enemy.map((b) => distance(a, b)))))
            .toBeGreaterThanOrEqual(5_000);
          for (const ship of state.ships) {
            expect(ship.speedKnots).toBe(0);
            expect(ship.throttle).toBe(0);
            expect(ship.navigationZone).toBe("deep");
            const dimensions = getShipClass(ship.shipClassId);
            for (const along of [-.5, -.25, 0, .25, .5]) for (const across of [-.5, 0, .5]) {
              const forward = along * dimensions.length, lateral = across * dimensions.beam;
              const x = ship.position.x + Math.sin(ship.heading) * forward + Math.cos(ship.heading) * lateral;
              const z = ship.position.z + Math.cos(ship.heading) * forward - Math.sin(ship.heading) * lateral;
              expect([x, z, ship.position.y, ...headings(ship)].every(Number.isFinite)).toBe(true);
              expect(terrainNavigationAt(state.mapId, x, z, shipDraftMeters(ship.shipClassId)).kind).toBe("deep");
            }
          }
        }
        applyFleetSmokeSpawnSide(mirrored, "mirrored");
        for (let index = 0; index < original.ships.length; ++index) {
          expect(mirrored.ships[index]!.position).toEqual(original.ships[index]!.position);
          expect(nonPlacement(mirrored.ships[index]!)).toEqual(nonPlacement(original.ships[index]!));
        }
      });
    }
  }
});
