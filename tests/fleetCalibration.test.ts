import { afterEach, describe, expect, it, vi } from "vitest";
import { FleetObjectiveCoordinator } from "../src/controllers/fleetObjectiveCoordinator";
import { FleetTargetCoordinator } from "../src/controllers/fleetTargetCoordinator";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { battleMapDefinition, shipDraftMeters, terrainNavigationAt } from "../src/maps/atollMap";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { getShipClass } from "../src/ships/classes";
import { effectiveMainBattery } from "../src/ships/mainBatteries";
import { BATTLE_SPAWN, FIXED_STEP } from "../src/sim/config";
import { FleetRadioNetwork } from "../src/sim/fleetRadio";
import type { BattleState, ShipState, Vec3 } from "../src/sim/types";
import {
  createFleetCalibration, fleetCalibrationEquipment, fleetCalibrationManifest, fleetCalibrationStateHash, runFleetCalibration,
} from "./helpers/fleetCalibration";
import {
  createFleetSmokeBattle, FLEET_SMOKE_SIDE_SWAP, PROTOTYPE_PLAYER_BUILDS,
} from "./helpers/fleetSmokeScenario";

const seed = 0x71501;
const teams = ["player", "enemy"] as const;
const variants = ([5, 7] as const).flatMap(teamSize => PROTOTYPE_PLAYER_BUILDS.map(build => ({ teamSize, build })));
const rotatedPoint = (point: Readonly<Vec3>): Vec3 => ({
  x: 2 * FLEET_SMOKE_SIDE_SWAP.centerX - point.x, y: point.y,
  z: 2 * FLEET_SMOKE_SIDE_SWAP.centerZ - point.z,
});
const headings = (ship: Readonly<ShipState>): number[] => [
  ship.heading, ship.turretHeading, ship.torpedoLauncherHeading,
  ...ship.mainBatteryMounts.map(mount => mount.heading), ...ship.secondaryMounts.map(mount => mount.heading),
];
function oppositePose(a: Readonly<ShipState>, b: Readonly<ShipState>): void {
  for (const field of ["position", "previousPosition", "aimPoint"] as const) {
    expect(b[field]).toEqual(rotatedPoint(a[field]));
  }
  const aHeadings = headings(a);
  expect(headings(b)).toHaveLength(aHeadings.length);
  headings(b).forEach((heading, index) => {
    expect(Math.sin(heading)).toBeCloseTo(-Math.sin(aHeadings[index]!), 12);
    expect(Math.cos(heading)).toBeCloseTo(-Math.cos(aHeadings[index]!), 12);
  });
}
function nestedObjects(value: unknown, objects = new Set<object>()): Set<object> {
  if (value !== null && typeof value === "object" && !objects.has(value)) {
    objects.add(value);
    for (const child of Object.values(value)) nestedObjects(child, objects);
  }
  return objects;
}
function noSharedObjects(a: unknown, b: unknown): void {
  const references = nestedObjects(a);
  for (const value of nestedObjects(b)) expect(references.has(value)).toBe(false);
}
function footprintIsSafe(state: Readonly<BattleState>, ship: Readonly<ShipState>): void {
  const dimensions = getShipClass(ship.shipClassId);
  const map = battleMapDefinition(state.mapId);
  const draft = shipDraftMeters(ship.shipClassId);
  for (const along of [-.5, -.25, 0, .25, .5]) for (const across of [-.5, 0, .5]) {
    const forward = along * dimensions.length, lateral = across * dimensions.beam;
    const x = ship.position.x + Math.sin(ship.heading) * forward + Math.cos(ship.heading) * lateral;
    const z = ship.position.z + Math.cos(ship.heading) * forward - Math.sin(ship.heading) * lateral;
    expect([x, z, ship.position.y].every(Number.isFinite)).toBe(true);
    expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(map.halfExtentMeters);
    const nav = terrainNavigationAt(state.mapId, x, z, draft);
    expect(nav.kind, ship.id + " footprint " + along + "," + across).toBe("deep");
    expect(nav.depthMeters - draft).toBeGreaterThan(.5);
  }
}
afterEach(() => vi.restoreAllMocks());

describe("equal-loadout production-session fleet calibration", () => {
  for (const { teamSize, build } of variants) {
    it(teamSize + "v" + teamSize + " " + build + " pairs complete real equipment without sharing mutable state", () => {
      const original = createFleetSmokeBattle(teamSize, seed, "default", build);
      const source = original.ships.filter(ship => ship.team === "player");
      const state = createFleetCalibration({ teamSize, seed, build });
      expect(state.ships).toHaveLength(teamSize * 2);
      expect(new Set(state.ships.map(ship => ship.id)).size).toBe(teamSize * 2);
      expect(state.ships.map(ship => ship.id)).toEqual([
        ...source.map((_, index) => "calibration-a-" + index),
        ...source.map((_, index) => "calibration-b-" + index),
      ]);
      for (let index = 0; index < teamSize; ++index) {
        const a = state.ships[index]!, b = state.ships[index + teamSize]!;
        expect(a.team).toBe("player"); expect(b.team).toBe("enemy");
        expect(fleetCalibrationEquipment(a)).toEqual(fleetCalibrationEquipment({
          ...source[index]!, aiControlled: true, countsForVictory: true,
        }));
        expect(fleetCalibrationEquipment(b)).toEqual(fleetCalibrationEquipment(a));
        // Includes null hardpoints, each turret's health/reload, all five
        // performance multipliers, resources and upgrade-derived tuning.
        expect(b.installedEquipment).toEqual(a.installedEquipment);
        expect(effectiveMainBattery(b)).toEqual(effectiveMainBattery(a));
        expect(a.position).toEqual(source[index]!.position);
        oppositePose(a, b);
        expect(a.developer).toBeUndefined(); expect(b.developer).toBeUndefined();
        noSharedObjects(a, b);
      }
      for (let index = 0; index < state.ships.length; ++index) {
        for (let other = index + 1; other < state.ships.length; ++other) {
          noSharedObjects(state.ships[index], state.ships[other]);
        }
      }
      const snapshot = fleetCalibrationEquipment(state.ships[teamSize]!);
      state.ships[0]!.installedEquipment.mainGun[0] = null;
      state.ships[0]!.mainBatteryMounts[0]!.health = 0;
      state.ships[0]!.performance.reloadMultiplier = .5;
      state.ships[0]!.modules.engine.health = 0;
      expect(fleetCalibrationEquipment(state.ships[teamSize]!)).toEqual(snapshot);
      // Both new fixtures and the normal gameplay scenario remain independent.
      expect(createFleetCalibration({ teamSize, seed, build }).ships[0]!.installedEquipment.mainGun[0]).not.toBeNull();
      expect(createFleetSmokeBattle(teamSize, seed, "default", build)).toEqual(original);
    });

    it(teamSize + "v" + teamSize + " " + build + " retains symmetric, safe formations on both terrain sides", () => {
      const terrainBefore = structuredClone(battleMapDefinition("atoll-prototype"));
      for (const side of ["default", "mirrored"] as const) {
        const state = createFleetCalibration({ teamSize, seed, build, side });
        expect(state.mode).toBe("battle"); expect(state.status).toBe("running");
        expect(state.time).toBe(0); expect(state.weatherId).toBe("clear");
        const a = state.ships.slice(0, teamSize), b = state.ships.slice(teamSize);
        for (let index = 0; index < teamSize; ++index) oppositePose(a[index]!, b[index]!);
        const minimum = Math.min(...a.flatMap(ally => b.map(enemy =>
          Math.hypot(ally.position.x - enemy.position.x, ally.position.z - enemy.position.z))));
        expect(minimum).toBeGreaterThanOrEqual(Math.max(5000, BATTLE_SPAWN.minimumSeparationMeters));
        for (const ship of state.ships) {
          expect(ship.aiControlled).toBe(true); expect(ship.countsForVictory).toBe(true);
          expect(ship.speedKnots).toBe(0); expect(ship.throttle).toBe(0);
          expect(ship.rudder).toBe(0); expect(ship.rudderCommand).toBe(0);
          expect(ship.navigationZone).toBe("deep");
          expect(ship.aiDecision).toBeUndefined(); expect(ship.perception).toBeUndefined();
          footprintIsSafe(state, ship);
        }
        expect(state.sensorSnapshots).toEqual({}); expect(state.collisionCooldowns).toEqual({});
      }
      expect(battleMapDefinition("atoll-prototype")).toEqual(terrainBefore);
    });

    it(teamSize + "v" + teamSize + " " + build + " rotates placement only and exchanges team labels only", () => {
      const normal = createFleetCalibration({ teamSize, seed, build });
      const mirrored = createFleetCalibration({ teamSize, seed, build, side: "mirrored" });
      expect(mirrored.randomSeed).toBe(normal.randomSeed);
      expect(mirrored.objective).toEqual(normal.objective);
      expect(mirrored.mapId).toBe(normal.mapId);
      normal.ships.forEach((ship, index) => {
        const other = mirrored.ships[index]!;
        expect(other.id).toBe(ship.id); expect(other.team).toBe(ship.team);
        expect(fleetCalibrationEquipment(other)).toEqual(fleetCalibrationEquipment(ship));
        oppositePose(ship, other);
      });
      for (const side of ["default", "mirrored"] as const) {
        const before = createFleetCalibration({ teamSize, seed, build, side });
        const swapped = createFleetCalibration({ teamSize, seed, build, side, swapTeamLabels: true });
        const expected = structuredClone(before);
        for (const ship of expected.ships) ship.team = ship.team === "player" ? "enemy" : "player";
        expect(swapped).toEqual(expected);
        for (const team of teams) expect(swapped.ships.filter(ship => ship.team === team)).toHaveLength(teamSize);
      }
    });
  }

  it("compares derived tuning and physical hardpoints, not merely shipClassId", () => {
    const state = createFleetCalibration({ teamSize: 5, seed, build: "north-carolina-magazine-refit" });
    const a = state.ships[0]!, b = state.ships[5]!;
    expect(a.shipClassId).toBe("north-carolina");
    expect(a.installedEquipment.magazine).toEqual(["magazine-purple"]);
    expect(a.performance.reloadMultiplier).toBeCloseTo(.9568, 12);
    expect(a.performance.magazineRiskMultiplier).toBeCloseTo(1.0144, 12);
    expect(a.performance.maxSpeedMultiplier).toBeCloseTo(1.03, 12);
    expect(a.secondaryMounts).toHaveLength(10);
    expect(effectiveMainBattery(a).mounts.map(mount => mount.barrelCount)).toEqual([3, 3, 3]);
    expect(fleetCalibrationEquipment(a)).toEqual(fleetCalibrationEquipment(b));
    b.mainBatteryMounts[0]!.reloadRemaining = 1;
    expect(a.shipClassId).toBe(b.shipClassId);
    expect(fleetCalibrationEquipment(a)).not.toEqual(fleetCalibrationEquipment(b));
  });

  it("records matching SHA-256 evidence for each pair in all saved-build rosters", () => {
    for (const { teamSize, build } of variants) {
      const state = createFleetCalibration({ teamSize, seed, build });
      const manifest = fleetCalibrationManifest(state);
      expect(manifest).toHaveLength(teamSize * 2);
      for (let index = 0; index < teamSize; ++index) {
        const a = manifest[index]!, b = manifest[index + teamSize]!;
        expect(a.equipmentSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(b.equipmentSha256).toBe(a.equipmentSha256);
        expect(a.id).toBe(state.ships[index]!.id);
        expect(a.installedEquipment).toEqual(state.ships[index]!.installedEquipment);
        expect(a.performance).toEqual(state.ships[index]!.performance);
      }
      const mirrored = fleetCalibrationManifest(createFleetCalibration({ teamSize, seed, build,
        side: "mirrored", swapTeamLabels: true }));
      expect(mirrored.map(ship => ship.equipmentSha256)).toEqual(manifest.map(ship => ship.equipmentSha256));
    }
  });

  it.each(["mount-health", "installed-component", "performance"] as const)(
    "changes its complete non-pose digest when %s changes", field => {
      const state = createFleetCalibration({ teamSize: 5, seed, build: "north-carolina-magazine-refit" });
      const before = fleetCalibrationManifest(state);
      const changed = state.ships[0]!;
      if (field === "mount-health") changed.mainBatteryMounts[0]!.health -= 1;
      if (field === "installed-component") changed.installedEquipment.magazine[0] = "magazine-common";
      if (field === "performance") changed.performance.reloadMultiplier += .01;
      const after = fleetCalibrationManifest(state);
      expect(after[0]!.equipmentSha256).not.toBe(before[0]!.equipmentSha256);
      expect(after.slice(1).map(ship => ship.equipmentSha256))
        .toEqual(before.slice(1).map(ship => ship.equipmentSha256));
    },
  );

  it("keeps manifest snapshots independent of the live state and the paired opponent", () => {
    const state = createFleetCalibration({ teamSize: 5, seed });
    const manifest = fleetCalibrationManifest(state);
    const before = structuredClone(manifest);
    noSharedObjects(state, manifest);
    for (let index = 1; index < manifest.length; ++index) noSharedObjects(manifest[0], manifest[index]);
    state.ships[0]!.position.x += 100;
    state.ships[0]!.installedEquipment.mainGun[0] = null;
    state.ships[0]!.performance.reloadMultiplier = .5;
    expect(manifest).toEqual(before);
    const changedState = structuredClone(state);
    manifest[0]!.position.z += 500;
    manifest[0]!.installedEquipment.engine[0] = null;
    manifest[0]!.performance.maxSpeedMultiplier = 20;
    expect(state).toEqual(changedState);
    expect(manifest[5]).toEqual(before[5]);
  });

  it("limits manifest output to game evidence and does not include account or credential material", () => {
    const state = createFleetCalibration({ teamSize: 5, seed });
    const baseline = fleetCalibrationManifest(state);
    const syntheticSecret = "test-only-private-account-sentinel-not-a-real-credential";
    // This sentinel is synthetic; no real credentials or environment values are
    // accessed by either the helper or this test.
    Object.assign(state, { authentication: { token: syntheticSecret },
      localProfile: { privateAccount: syntheticSecret }, privateStorage: syntheticSecret });
    const manifest = fleetCalibrationManifest(state);
    expect(manifest).toEqual(baseline);
    expect(JSON.stringify(manifest)).not.toContain(syntheticSecret);
    const keys = ["id", "team", "shipClassId", "position", "heading", "equipmentSha256", "mainGunId",
      "torpedoId", "mainGunMounts", "torpedoLauncherMounts", "antiAirMounts", "secondaryMounts",
      "installedEquipment", "performance"].sort();
    for (const ship of manifest) expect(Object.keys(ship).sort()).toEqual(keys);
  });

  it("normalizes team labels in exact fresh and 120-tick states without mutating either input", () => {
    const options = { teamSize: 5 as const, seed, build: "cleveland-starter" as const };
    const normal = createFleetCalibration(options);
    const reversed = createFleetCalibration({ ...options, swapTeamLabels: true });
    const normalSession = new LocalBattleSession(normal), reversedSession = new LocalBattleSession(reversed);
    for (const ticks of [0, 120]) {
      for (let tick = 0; tick < ticks; ++tick) {
        normalSession.step(new Map(), FIXED_STEP);
        reversedSession.step(new Map(), FIXED_STEP);
      }
      const normalBefore = structuredClone(normal), reversedBefore = structuredClone(reversed);
      const digest = fleetCalibrationStateHash(normal);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      expect(fleetCalibrationStateHash(reversed, true)).toBe(digest);
      expect(fleetCalibrationStateHash(reversed)).not.toBe(digest);
      expect(normal).toEqual(normalBefore); expect(reversed).toEqual(reversedBefore);
    }
  });

  it("hashes unrounded positions and simulation RNG seed, while ignoring object-key insertion order", () => {
    const state = createFleetCalibration({ teamSize: 5, seed });
    const digest = fleetCalibrationStateHash(state);
    const moved = structuredClone(state);
    moved.ships[0]!.position.x += .000001;
    expect(Math.round(moved.ships[0]!.position.x * 100) / 100).toBe(state.ships[0]!.position.x);
    expect(fleetCalibrationStateHash(moved)).not.toBe(digest);
    const reseeded = structuredClone(state);
    reseeded.randomSeed += 1;
    expect(fleetCalibrationStateHash(reseeded)).not.toBe(digest);
    const reordered = Object.fromEntries(Object.entries(structuredClone(state)).reverse()) as unknown as BattleState;
    reordered.objective = Object.fromEntries(Object.entries(reordered.objective).reverse()) as BattleState["objective"];
    expect(fleetCalibrationStateHash(reordered)).toBe(digest);
    expect(fleetCalibrationStateHash(state)).toBe(digest);
  });

  it("normalizes signed capture progress, ownership, scores and winner labels in the state digest", () => {
    const state = createFleetCalibration({ teamSize: 5, seed });
    state.status = "player-won";
    state.objective.captureProgress = .25;
    state.objective.owner = "player";
    state.objective.capturingTeam = "enemy";
    state.objective.occupants = { player: 1, enemy: 2 };
    state.objective.scores = { player: 31.234567, enemy: 12.345678 };
    const reversed = structuredClone(state);
    for (const ship of reversed.ships) ship.team = ship.team === "player" ? "enemy" : "player";
    reversed.status = "enemy-won";
    reversed.objective.captureProgress = -.25;
    reversed.objective.owner = "enemy";
    reversed.objective.capturingTeam = "player";
    reversed.objective.occupants = { player: 2, enemy: 1 };
    reversed.objective.scores = { player: 12.345678, enemy: 31.234567 };
    expect(fleetCalibrationStateHash(reversed, true)).toBe(fleetCalibrationStateHash(state));
  });

  it("runs every ship through the real empty-command session and both fleet coordinators", () => {
    const command = vi.spyOn(RuleBasedAi.prototype, "command");
    const radio = vi.spyOn(FleetRadioNetwork.prototype, "update");
    const targets = vi.spyOn(FleetTargetCoordinator.prototype, "update");
    const objectives = vi.spyOn(FleetObjectiveCoordinator.prototype, "update");
    const stepOriginal = LocalBattleSession.prototype.step;
    const stop = new Error("bounded calibration runner test: one real tick complete");
    let tickState: BattleState | undefined;
    const step = vi.spyOn(LocalBattleSession.prototype, "step").mockImplementation(function (
      this: LocalBattleSession, commands, dt, options,
    ) {
      const output = stepOriginal.call(this, commands, dt, options);
      tickState = structuredClone(output.state);
      // Stop the full-duration runner without fabricating an end-of-battle
      // result, changing production time limits, or mutating the real tick.
      throw stop;
    });
    expect(() => runFleetCalibration({ teamSize: 7, seed, build: "cleveland-starter" })).toThrow(stop);
    expect(step).toHaveBeenCalledTimes(1);
    expect(step.mock.calls[0]![0].size).toBe(0);
    expect(step.mock.calls[0]![1]).toBe(FIXED_STEP);
    const ids = tickState!.ships.map(ship => ship.id).sort();
    expect(command).toHaveBeenCalledTimes(14);
    expect(command.mock.calls.map(([observation]) => observation.self.id).sort()).toEqual(ids);
    for (const spy of [radio, targets, objectives]) {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0].map(observation => observation.self.id).sort()).toEqual(ids);
    }
    for (const [observation] of command.mock.calls) {
      expect(observation.sharedContacts).toBeDefined();
      expect(observation.fleetObjective?.duty).toMatch(/capture|support/);
    }
    expect(tickState!.time).toBe(FIXED_STEP);
    for (const ship of tickState!.ships) expect(ship.aiDecision?.objectiveDuty).toMatch(/capture|support/);
    // Symmetric control means the same production control path. Identity-based
    // RNG and terrain deliberately do not imply paired actions or 50% wins.
  });

  it.each([5, 7] as const)("%s-ship same-seed production sessions repeat exactly for 120 ticks", teamSize => {
    const options = { teamSize, seed, build: "north-carolina-magazine-refit" as const,
      side: "mirrored" as const, swapTeamLabels: true };
    const run = (): BattleState => {
      const state = createFleetCalibration(options);
      const session = new LocalBattleSession(state);
      for (let tick = 0; tick < 120; ++tick) session.step(new Map(), FIXED_STEP);
      return state;
    };
    const first = run(), second = run();
    expect(first.time).toBeCloseTo(120 * FIXED_STEP, 10);
    expect(second).toEqual(first);
    expect(first.ships.every(ship => ship.aiDecision?.objectiveDuty)).toBe(true);
    // A battleship already in its support arrival band may correctly hold.
    // Capture-assigned ships on both teams must still receive active navigation.
    for (const team of teams) {
      const capturers = first.ships.filter(ship => ship.team === team && ship.aiDecision?.objectiveDuty === "capture");
      expect(capturers.length).toBeGreaterThan(0);
      expect(capturers.every(ship => ship.distanceTravelled > 0)).toBe(true);
    }
    expect(first.ships.every(ship => ship.navigationZone !== "grounded")).toBe(true);
  });
});
