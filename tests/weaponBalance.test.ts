import { describe, expect, it } from "vitest";
import { SHIP_CLASSES } from "../src/ships/classes";
import { MAIN_GUNS } from "../src/ships/components";
import {
  getMainBattery,
  mainBatteryBarrelCount,
  MAIN_BATTERY_MAXIMUM_RANGE_METERS,
} from "../src/ships/mainBatteries";
import { SECONDARY_GUNS } from "../src/ships/secondaryGuns";

const rawMainBatteryDpm = (battery: ReturnType<typeof getMainBattery>): number =>
  battery.damagePerShell * mainBatteryBarrelCount(battery) * 60 / battery.reloadSeconds;

describe("weapon balance budgets", () => {
  it("keeps generic destroyer shells on one shared damage scale", () => {
    for (const gun of Object.values(MAIN_GUNS)) {
      const perShellDamage = gun.damage / gun.visual.barrelCount;
      expect(perShellDamage).toBeGreaterThanOrEqual(50);
      expect(perShellDamage).toBeLessThanOrEqual(60);
    }
  });

  it("keeps a five-mount destroyer near cruiser and battleship raw DPM", () => {
    const stock = getMainBattery("fletcher", "mk1-single", 5);
    const upgraded = getMainBattery("fletcher", "mk4-twin", 5);

    expect(rawMainBatteryDpm(stock)).toBeCloseTo(3_000, 5);
    expect(rawMainBatteryDpm(upgraded)).toBeGreaterThan(rawMainBatteryDpm(stock));
    expect(rawMainBatteryDpm(upgraded)).toBeLessThanOrEqual(rawMainBatteryDpm(stock) * 1.25);
    expect(rawMainBatteryDpm(upgraded))
      .toBeLessThan(rawMainBatteryDpm(getMainBattery("cleveland", "mk1-single", 4)));
  });

  it("caps historical battery vertical DPM growth near ten percent", () => {
    for (const shipClass of Object.values(SHIP_CLASSES).filter(({ hullId }) => hullId !== "destroyer")) {
      const mountCount = shipClass.slotCounts.mainGun;
      const stock = getMainBattery(shipClass.id, "mk1-single", mountCount);
      const upgraded = getMainBattery(shipClass.id, "mk4-twin", mountCount);
      expect(rawMainBatteryDpm(upgraded)).toBeGreaterThan(rawMainBatteryDpm(stock));
      expect(rawMainBatteryDpm(upgraded)).toBeLessThanOrEqual(rawMainBatteryDpm(stock) * 1.1);
    }
  });

  it("keeps every secondary envelope below the shortest compatible main battery", () => {
    const shortestCompatibleMainBattery = Math.min(...Object.values(SHIP_CLASSES)
      .filter((shipClass) => shipClass.slotCounts.sideGun > 0)
      .map((shipClass) => MAIN_BATTERY_MAXIMUM_RANGE_METERS[shipClass.id]));
    for (const definition of Object.values(SECONDARY_GUNS)) {
      expect(definition.maximumRangeMeters).toBeLessThan(shortestCompatibleMainBattery);
      expect(definition.maximumRangeMeters).toBeLessThanOrEqual(shortestCompatibleMainBattery * .75);
    }
  });

  it("limits strict secondary DPM growth while preserving progression", () => {
    const dpm = Object.values(SECONDARY_GUNS)
      .map((definition) => definition.damage * 60 / definition.reloadSeconds);
    for (let index = 1; index < dpm.length; index += 1) {
      expect(dpm[index]).toBeGreaterThan(dpm[index - 1]!);
    }
    expect(dpm.at(-1)).toBeLessThanOrEqual(dpm[0]! * 1.25);
  });
});
