import { describe, expect, it } from "vitest";
import { FIXED_STEP } from "../src/sim/config";
import { createInitialState, gunMuzzleOrigins, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipPerformanceModifiers } from "../src/sim/types";
import { MAIN_GUNS } from "../src/ships/components";
import type { ShipClassId } from "../src/ships/classes";
import { getShipClass } from "../src/ships/classes";
import { getMainBattery, mainBatteryBarrelCount } from "../src/ships/mainBatteries";

const layouts: Record<ShipClassId, readonly number[]> = {
  fletcher: [1], "j-class": [1], kagero: [1], "type-1936a": [1], tashkent: [1],
  cleveland: [3, 3, 3, 3], edinburgh: [3, 3, 3, 3], nurnberg: [3, 3, 3],
  agano: [2, 2, 2], dido: [2, 2, 2, 2, 2],
  "north-carolina": [3, 3, 3], "king-george-v": [4, 2, 4], bismarck: [2, 2, 2, 2],
  yamato: [3, 3, 3], richelieu: [4, 4],
};

const armament = (mainGunMounts: number): Partial<ShipPerformanceModifiers> & { mainGunMounts: number } => ({
  mainGunMounts,
});

describe("historical main batteries", () => {
  for (const shipClassId of [
    "cleveland", "edinburgh", "nurnberg", "agano", "dido",
    "north-carolina", "king-george-v", "bismarck", "yamato", "richelieu",
  ] as const) {
    it(`defines the historical ${shipClassId} turret layout`, () => {
      const expected = layouts[shipClassId];
      const battery = getMainBattery(shipClassId, "mk1-single", expected.length);
      expect(battery.mounts.map((mount) => mount.barrelCount)).toEqual(expected);
      expect(mainBatteryBarrelCount(battery)).toBe(expected.reduce((sum, count) => sum + count, 0));
      expect(battery.caliberMm).toBeGreaterThanOrEqual(133);
    });
  }

  it("fires one shell per Cleveland barrel without multiplying per-shell damage by mounts", () => {
    const state = createInitialState(41, "sea-trials", "mk1-single", armament(4), undefined, "cleveland");
    const player = state.ships[0]!;
    const battery = getMainBattery(player.shipClassId, player.mainGunId, player.mainGunMounts);
    const command: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { x: player.position.x, y: 0, z: player.position.z + 2_000 },
      fire: true,
    };
    stepSimulation(state, new Map([[player.id, command]]), FIXED_STEP);
    const salvoIds = new Set(state.projectiles.map((projectile) => projectile.salvoId));
    expect(salvoIds.size).toBe(1);
    expect([...salvoIds][0]).toBeDefined();
    expect(state.shots.every((shot) => shot.salvoId === [...salvoIds][0])).toBe(true);
    expect(state.projectiles).toHaveLength(12);
    expect(state.projectiles.reduce((sum, shell) => sum + shell.damage, 0))
      .toBeCloseTo(battery.damagePerShell * 12, 5);
    expect(player.reloadRemaining).toBeCloseTo(battery.reloadSeconds, 1);
  });

  it("tracks traverse and reload independently for every turret", () => {
    const state = createInitialState(43, "sea-trials", "mk1-single", armament(4), undefined, "cleveland");
    const player = state.ships[0]!;
    const broadsideCommand: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { x: player.position.x + 2_000, y: 0, z: player.position.z },
      fire: false,
    };
    stepSimulation(state, new Map([[player.id, broadsideCommand]]), 1);
    expect(player.mainBatteryMounts).toHaveLength(4);
    expect(player.mainBatteryMounts[0]!.heading).not.toBeCloseTo(
      player.mainBatteryMounts[3]!.heading,
      3,
    );

    const fireCommand = { ...broadsideCommand, fire: true };
    stepSimulation(state, new Map([[player.id, fireCommand]]), FIXED_STEP);
    expect(state.projectiles).toHaveLength(12);
    player.mainBatteryMounts[0]!.reloadRemaining = 0;
    stepSimulation(state, new Map([[player.id, fireCommand]]), FIXED_STEP);
    expect(state.projectiles).toHaveLength(15);
    expect(player.mainBatteryMounts[0]!.reloadRemaining).toBeGreaterThan(0);
    expect(player.mainBatteryMounts.slice(1).every((mount) => mount.reloadRemaining > 0)).toBe(true);
  });

  it("lets loaded turrets fire along their current barrel headings before alignment", () => {
    const state = createInitialState(44, "sea-trials", "mk1-single", armament(3), undefined, "north-carolina");
    const player = state.ships[0]!;
    const command: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { x: player.position.x + 2_000, y: 0, z: player.position.z },
      fire: true,
    };
    stepSimulation(state, new Map([[player.id, command]]), FIXED_STEP);
    expect(state.projectiles).toHaveLength(9);
    const shellBearings = state.projectiles.map((shell) => Math.atan2(shell.velocity.x, shell.velocity.z));
    expect(Math.max(...shellBearings) - Math.min(...shellBearings)).toBeGreaterThan(2);
  });

  it("preserves the King George V 4-2-4 muzzle groups", () => {
    const state = createInitialState(42, "sea-trials", "mk1-single", armament(3), undefined, "king-george-v");
    const player = state.ships[0]!;
    const origins = gunMuzzleOrigins(player);
    const groups = new Map<number, number>();
    for (const origin of origins) {
      const key = Math.round(origin.z * 10) / 10;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    expect([...groups.values()]).toEqual([4, 2, 4]);
  });

  it("keeps Richelieu's two quadruple turrets forward of amidships", () => {
    const battery = getMainBattery("richelieu", "mk1-single", 2);
    expect(battery.mounts).toHaveLength(2);
    expect(battery.mounts.every((mount) => mount.longitudinalFraction > 0)).toBe(true);
    expect(mainBatteryBarrelCount(battery)).toBe(8);
  });

  it("applies upgrades to performance without changing a historical layout", () => {
    const stock = getMainBattery("yamato", "mk1-single", 3);
    const upgraded = getMainBattery("yamato", "mk4-twin", 3);
    expect(upgraded.mounts).toEqual(stock.mounts);
    expect(upgraded.caliberMm).toBe(stock.caliberMm);
    expect(upgraded.damagePerShell).toBeGreaterThan(stock.damagePerShell);
    expect(upgraded.reloadSeconds).toBeLessThan(stock.reloadSeconds);
    expect(upgraded.dispersionMultiplier).toBeLessThan(stock.dispersionMultiplier);
  });

  it("keeps existing destroyer gun damage and barrel behavior unchanged", () => {
    const battery = getMainBattery("fletcher", "mk2-twin", 1);
    expect(mainBatteryBarrelCount(battery)).toBe(2);
    expect(battery.damagePerShell * 2).toBe(MAIN_GUNS["mk2-twin"].damage);
    expect(battery.reloadSeconds).toBe(MAIN_GUNS["mk2-twin"].reloadSeconds);
  });

  it("caps a perfect same-class penetration salvo below one quarter hull", () => {
    for (const shipClassId of [
      "cleveland", "edinburgh", "nurnberg", "agano", "dido",
      "north-carolina", "king-george-v", "bismarck", "yamato", "richelieu",
    ] as const) {
      const mountCount = layouts[shipClassId].length;
      const battery = getMainBattery(shipClassId, "mk1-single", mountCount);
      const penetratingDamage = battery.damagePerShell * mainBatteryBarrelCount(battery) * .33;
      expect(penetratingDamage).toBeLessThan(getShipClass(shipClassId).maxHull * .25);
    }
  });
});
