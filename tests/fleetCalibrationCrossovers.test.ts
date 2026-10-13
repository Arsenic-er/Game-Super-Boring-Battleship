import { afterEach, describe, expect, it, vi } from "vitest";
import { battleMapDefinition } from "../src/maps/atollMap";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import type { BattleState, ShipState } from "../src/sim/types";
import {
  calibrationRosterOrder, createFleetCalibration, FLEET_CALIBRATION_ROSTER_ORDERS,
  fleetCalibrationManifest, fleetCalibrationStateHash, runFleetCalibration,
  type FleetCalibrationOptions, type FleetCalibrationRosterOrder,
} from "./helpers/fleetCalibration";
import { PROTOTYPE_PLAYER_BUILDS } from "./helpers/fleetSmokeScenario";

const seed = 0x71501;
const variants = ([5, 7] as const).flatMap(teamSize =>
  PROTOTYPE_PLAYER_BUILDS.map(build => ({ teamSize, build })));
const otherId = (id: string): string => id.startsWith("calibration-a-")
  ? id.replace("calibration-a-", "calibration-b-")
  : id.replace("calibration-b-", "calibration-a-");

function permute<T>(items: readonly T[], size: number, order: FleetCalibrationRosterOrder): T[] {
  const a = items.slice(0, size), b = items.slice(size);
  if (order === "b-then-a") return [...b, ...a];
  if (order === "interleaved") return a.flatMap((item, index) => [item, b[index]!]);
  return [...items];
}

function expectedCrossover(baseline: BattleState, options: FleetCalibrationOptions): BattleState {
  const expected = structuredClone(baseline);
  for (const ship of expected.ships) {
    if (options.swapFleetIdentities) ship.id = otherId(ship.id);
    if (options.swapTeamLabels) ship.team = ship.team === "player" ? "enemy" : "player";
  }
  expected.ships = permute(expected.ships, options.teamSize, options.rosterOrder ?? "a-then-b");
  return expected;
}

function nestedObjects(value: unknown, objects = new Set<object>()): Set<object> {
  if (value !== null && typeof value === "object" && !objects.has(value)) {
    objects.add(value);
    for (const child of Object.values(value)) nestedObjects(child, objects);
  }
  return objects;
}

function expectIndependent(a: unknown, b: unknown): void {
  const references = nestedObjects(a);
  for (const value of nestedObjects(b)) expect(references.has(value)).toBe(false);
}

function byPhysicalPose(ships: readonly ShipState[]): ShipState[] {
  return [...ships].sort((a, b) => a.position.x - b.position.x || a.position.z - b.position.z);
}

afterEach(() => vi.restoreAllMocks());

describe("orthogonal fleet calibration identity and roster-order crossovers", () => {
  it("parses only the three explicit orders and defaults to the original order", () => {
    expect(calibrationRosterOrder(undefined)).toBe("a-then-b");
    expect(FLEET_CALIBRATION_ROSTER_ORDERS).toEqual(["a-then-b", "b-then-a", "interleaved"]);
    for (const order of FLEET_CALIBRATION_ROSTER_ORDERS) expect(calibrationRosterOrder(order)).toBe(order);
    for (const invalid of ["", "reversed", "random", "A-then-B", " interleaved", "interleaved "]) {
      expect(() => calibrationRosterOrder(invalid)).toThrow("FLEET_CALIBRATION_ROSTER_ORDER");
      expect(() => createFleetCalibration({
        teamSize: 5, seed, rosterOrder: invalid as FleetCalibrationRosterOrder,
      })).toThrow("FLEET_CALIBRATION_ROSTER_ORDER");
    }
  });

  for (const { teamSize, build } of variants) {
    const label = teamSize + "v" + teamSize + " " + build;

    it(label + " exchanges paired IDs without changing any other world, team or equipment field", () => {
      const normal = createFleetCalibration({ teamSize, seed, build });
      const changed = createFleetCalibration({ teamSize, seed, build, swapFleetIdentities: true });
      const expected = structuredClone(normal);
      for (const ship of expected.ships) ship.id = otherId(ship.id);
      expect(changed).toEqual(expected);
      expect(changed.ships.map(ship => ship.team)).toEqual(normal.ships.map(ship => ship.team));
      expect(new Set(changed.ships.map(ship => ship.id)).size).toBe(teamSize * 2);
      expect(changed.randomSeed).toBe(normal.randomSeed);
      expect(changed.sensorSnapshots).toEqual({});
      expect(changed.collisionCooldowns).toEqual({});
      expect(changed.airSquadrons).toEqual([]);
      expect(changed.projectiles).toEqual([]);
    });

    it(label + " changes only array order for both alternative traversals", () => {
      const normal = createFleetCalibration({ teamSize, seed, build });
      for (const rosterOrder of ["b-then-a", "interleaved"] as const) {
        const actual = createFleetCalibration({ teamSize, seed, build, rosterOrder });
        const expected = structuredClone(normal);
        expected.ships = permute(expected.ships, teamSize, rosterOrder);
        expect(actual).toEqual(expected);
        expect(byPhysicalPose(actual.ships)).toEqual(byPhysicalPose(normal.ships));
        expect(actual.randomSeed).toBe(normal.randomSeed);
        // Exact state hashes intentionally preserve array order: do not erase
        // the very independent variable this experiment is testing.
        expect(fleetCalibrationStateHash(actual)).not.toBe(fleetCalibrationStateHash(normal));
      }
    });

    it(label + " retains the default fixture when all new controls are omitted or explicitly disabled", () => {
      for (const side of ["default", "mirrored"] as const) {
        for (const swapTeamLabels of [false, true]) {
          const options = { teamSize, seed, build, side, swapTeamLabels };
          const implicit = createFleetCalibration(options);
          const explicit = createFleetCalibration({
            ...options, swapFleetIdentities: false, rosterOrder: "a-then-b",
          });
          expect(explicit).toEqual(implicit);
          expect(fleetCalibrationStateHash(explicit)).toBe(fleetCalibrationStateHash(implicit));
          expect(fleetCalibrationManifest(explicit)).toEqual(fleetCalibrationManifest(implicit));
          expect(implicit.ships.map(ship => ship.id)).toEqual([
            ...Array.from({ length: teamSize }, (_, index) => "calibration-a-" + index),
            ...Array.from({ length: teamSize }, (_, index) => "calibration-b-" + index),
          ]);
        }
      }
    });

    it(label + " does not share mutable objects between pairs, fixtures or manifest snapshots", () => {
      const options = { teamSize, seed, build, side: "mirrored" as const,
        swapTeamLabels: true, swapFleetIdentities: true, rosterOrder: "interleaved" as const };
      const state = createFleetCalibration(options);
      const other = createFleetCalibration(options);
      const snapshot = structuredClone(other);
      const manifest = fleetCalibrationManifest(state);
      const manifestBefore = structuredClone(manifest);
      expectIndependent(state, other);
      expectIndependent(state, manifest);
      for (let index = 0; index < state.ships.length; ++index) {
        for (let next = index + 1; next < state.ships.length; ++next) {
          expectIndependent(state.ships[index], state.ships[next]);
        }
      }
      const partner = structuredClone(state.ships[1]!);
      state.ships[0]!.installedEquipment.mainGun[0] = null;
      state.ships[0]!.mainBatteryMounts[0]!.health = 0;
      state.ships[0]!.position.x += 500;
      state.ships[0]!.performance.reloadMultiplier = .5;
      state.ships[0]!.modules.engine.health = 0;
      expect(state.ships[1]).toEqual(partner);
      expect(other).toEqual(snapshot);
      expect(manifest).toEqual(manifestBefore);
      expect(createFleetCalibration(options)).toEqual(snapshot);
    });
  }

  it.each([5, 7] as const)(
    "%s-ship identity, team, spawn-side and order changes compose without recategorizing spatial cohorts",
    teamSize => {
      const terrainBefore = structuredClone(battleMapDefinition("atoll-prototype"));
      for (const side of ["default", "mirrored"] as const) {
        const baseline = createFleetCalibration({ teamSize, seed, side, build: "north-carolina-magazine-refit" });
        for (const swapTeamLabels of [false, true]) for (const swapFleetIdentities of [false, true]) {
          for (const rosterOrder of FLEET_CALIBRATION_ROSTER_ORDERS) {
            const options = { teamSize, seed, side, build: "north-carolina-magazine-refit" as const,
              swapTeamLabels, swapFleetIdentities, rosterOrder };
            const optionsBefore = structuredClone(options);
            const actual = createFleetCalibration(options);
            expect(actual).toEqual(expectedCrossover(baseline, options));
            expect(options).toEqual(optionsBefore);
            // Rotation changes the physical coast. Neither identities, labels
            // nor traversal ordering are allowed to transform the map instead.
            expect(battleMapDefinition("atoll-prototype")).toEqual(terrainBefore);
            const manifest = fleetCalibrationManifest(actual);
            const expectedManifest = fleetCalibrationManifest(expectedCrossover(baseline, options));
            expect(manifest).toEqual(expectedManifest);
            for (let index = 0; index < actual.ships.length; ++index) {
              const ship = actual.ships[index]!, item = manifest[index]!;
              expect(item.id).toBe(ship.id); expect(item.team).toBe(ship.team);
              expect(item.position).toEqual(ship.position); expect(item.heading).toBe(ship.heading);
              const paired = manifest.find(other => other.id === otherId(item.id))!;
              expect(paired.equipmentSha256).toBe(item.equipmentSha256);
              expect(paired.team).not.toBe(item.team);
            }
          }
        }
      }
    },
  );

  it("retains the simulation seed through every crossover and respects an independently supplied seed", () => {
    const base = { teamSize: 5 as const, build: "cleveland-starter" as const };
    const defaultState = createFleetCalibration({ ...base, seed });
    for (const alternateSeed of [seed, seed + 1, 0xffffffff]) {
      const normal = createFleetCalibration({ ...base, seed: alternateSeed });
      expect(normal.randomSeed).toBe(alternateSeed >>> 0);
      for (const rosterOrder of FLEET_CALIBRATION_ROSTER_ORDERS) {
        const crossed = createFleetCalibration({ ...base, seed: alternateSeed, rosterOrder,
          swapFleetIdentities: true, swapTeamLabels: true });
        expect(crossed.randomSeed).toBe(normal.randomSeed);
        expect(crossed).toEqual(expectedCrossover(normal, {
          ...base, seed: alternateSeed, rosterOrder, swapFleetIdentities: true, swapTeamLabels: true,
        }));
      }
      if (alternateSeed !== seed) {
        expect(fleetCalibrationStateHash(normal)).not.toBe(fleetCalibrationStateHash(defaultState));
      }
    }
  });

  it.each(FLEET_CALIBRATION_ROSTER_ORDERS)(
    "%s is repeatable through 60 real session ticks with every crossover enabled",
    rosterOrder => {
      const options = { teamSize: 5 as const, seed, build: "cleveland-starter" as const,
        side: "mirrored" as const, swapTeamLabels: true, swapFleetIdentities: true, rosterOrder };
      const run = (): BattleState => {
        const state = createFleetCalibration(options);
        const session = new LocalBattleSession(state);
        for (let tick = 0; tick < 60; ++tick) session.step(new Map(), FIXED_STEP);
        return state;
      };
      const first = run(), second = run();
      expect(first.time).toBeCloseTo(60 * FIXED_STEP, 10);
      expect(first.status).toBe("running");
      expect(second).toEqual(first);
      expect(fleetCalibrationStateHash(second)).toBe(fleetCalibrationStateHash(first));
      expect(first.ships.every(ship => ship.aiDecision?.objectiveDuty)).toBe(true);
      expect(first.ships.every(ship => ship.navigationZone !== "grounded")).toBe(true);
      // Different crossovers are not expected to produce equal combat results.
      // This asserts repeatability only, not balanced wins or permutation invariance.
    },
  );

  it.each(FLEET_CALIBRATION_ROSTER_ORDERS)(
    "passes identity/order controls through the full runner for %s without faking a completed match",
    rosterOrder => {
      const options = { teamSize: 7 as const, seed, build: "north-carolina-magazine-refit" as const,
        side: "mirrored" as const, swapTeamLabels: true, swapFleetIdentities: true, rosterOrder };
      const expected = createFleetCalibration(options);
      const stop = new Error("bounded crossover check: one real session tick completed");
      const original = LocalBattleSession.prototype.step;
      let initial: BattleState | undefined;
      let after: BattleState | undefined;
      const step = vi.spyOn(LocalBattleSession.prototype, "step").mockImplementation(function (
        this: LocalBattleSession, commands, dt, stepOptions,
      ) {
        initial = structuredClone(this.state);
        const output = original.call(this, commands, dt, stepOptions);
        after = structuredClone(output.state);
        throw stop;
      });
      expect(() => runFleetCalibration(options)).toThrow(stop);
      expect(step).toHaveBeenCalledTimes(1);
      expect(step.mock.calls[0]![0].size).toBe(0);
      expect(step.mock.calls[0]![1]).toBe(FIXED_STEP);
      expect(initial).toEqual(expected);
      expect(after!.status).toBe("running");
      expect(after!.time).toBe(FIXED_STEP);
      expect(after!.ships.map(ship => ship.id)).toEqual(expected.ships.map(ship => ship.id));
      expect(after!.ships.every(ship => ship.aiDecision?.objectiveDuty)).toBe(true);
    },
  );
});
