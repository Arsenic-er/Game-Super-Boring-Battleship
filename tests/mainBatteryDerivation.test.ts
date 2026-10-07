import { afterEach, describe, expect, it, vi } from "vitest";
import { EQUIPMENT_BY_ID } from "../src/profile/equipmentCatalog";
import { SHIP_CLASSES } from "../src/ships/classes";
import type { ShipClassId } from "../src/ships/classes";
import * as components from "../src/ships/components";
import type { MainGunId } from "../src/ships/components";
import {
  effectiveMainBattery,
  getMainBattery,
  installedMainBattery,
  MAIN_BATTERY_DECK_HEIGHT,
  MAIN_BATTERY_SUPERFIRING_HEIGHT,
} from "../src/ships/mainBatteries";
import type {
  EffectiveMainBatteryDefinition,
  MainBatteryMountDefinition,
} from "../src/ships/mainBatteries";

/** Deliberately unoptimized reference: derive a complete battery for every slot. */
function referenceInstalledBattery(
  shipClassId: ShipClassId,
  mainGunId: MainGunId,
  equippedMounts: number,
  installed?: readonly (string | null)[],
): EffectiveMainBatteryDefinition {
  const battery = getMainBattery(shipClassId, mainGunId, equippedMounts);
  if (!installed) return battery;
  const mounts = installed.flatMap((equipmentId, slotIndex): MainBatteryMountDefinition[] => {
    if (equipmentId === null) return [];
    const item = EQUIPMENT_BY_ID[equipmentId];
    const id = item?.category === "mainGun" ? item.mainGunId ?? "mk1-single" : "mk1-single";
    const slotBattery = getMainBattery(shipClassId, id, installed.length);
    const safeCount = Math.max(1, installed.length);
    const fallback = Array.from({ length: safeCount }, (_, index): MainBatteryMountDefinition => ({
      longitudinalFraction: safeCount === 1 ? .28 : .30 - index * (.62 / (safeCount - 1)),
      lateralFraction: 0,
      localHeight: safeCount >= 3 && (index === 1 || index === safeCount - 2)
        ? MAIN_BATTERY_SUPERFIRING_HEIGHT : MAIN_BATTERY_DECK_HEIGHT,
      barrelCount: slotBattery.visual.barrelCount,
    }));
    const hardpoint = slotBattery.mounts[slotIndex] ?? fallback[slotIndex];
    if (!hardpoint) return [];
    return [{
      ...hardpoint,
      slotIndex,
      visual: { ...slotBattery.visual, barrelCount: hardpoint.barrelCount },
    }];
  });
  return { ...battery, mounts };
}

const upgrades: MainGunId[] = ["mk1-single", "mk2-twin", "mk3-twin", "mk4-twin"];
const equipment = ["mainGun-common", "mainGun-purple", "mainGun-gold", "mainGun-redGold"];

afterEach(() => vi.restoreAllMocks());

describe("per-call installed main-battery derivation", () => {
  for (const shipClassId of Object.keys(SHIP_CLASSES) as ShipClassId[]) {
    it(`preserves all aggregate values and physical slots for ${shipClassId}`, () => {
      const slotCount = SHIP_CLASSES[shipClassId].slotCounts.mainGun;
      const sparse = new Array<string | null>(7);
      sparse[1] = "mainGun-purple";
      sparse[4] = null;
      sparse[6] = "mainGun-gold";
      const layouts: (readonly (string | null)[] | undefined)[] = [
        undefined,
        [],
        Array(slotCount).fill(null),
        Array(slotCount).fill("mainGun-common"),
        Array.from({ length: slotCount }, (_, index) => equipment[index % equipment.length]!),
        ["mainGun-purple", null, "mainGun-purple", "mainGun-gold", null, "mainGun-gold", "mainGun-redGold"],
        ["unknown-component", "engine-common", "", null, "mainGun-common"],
        sparse,
      ];
      for (const upgrade of upgrades) {
        for (const installed of layouts) {
          for (const count of [0, 1, installed?.length ?? slotCount, slotCount + 3]) {
            expect(installedMainBattery(shipClassId, upgrade, count, installed))
              .toEqual(referenceInstalledBattery(shipClassId, upgrade, count, installed));
          }
        }
      }
    });
  }

  it("uses the aggregate derivation once for a uniform matching installation", () => {
    const derive = vi.spyOn(components, "getMainGun");
    const result = installedMainBattery("fletcher", "mk1-single", 5, Array(5).fill("mainGun-common"));
    expect(result.mounts).toHaveLength(5);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("derives each distinct remaining slot upgrade only once", () => {
    const derive = vi.spyOn(components, "getMainGun");
    const slots = ["mainGun-common", "mainGun-purple", "mainGun-purple", "mainGun-gold", "mainGun-gold"];
    installedMainBattery("fletcher", "mk1-single", slots.length, slots);
    expect(derive.mock.calls.map(([id]) => id)).toEqual(["mk1-single", "mk2-twin", "mk3-twin"]);
  });

  it("does not reuse aggregate hardpoints when the aggregate mount count differs", () => {
    const slots = ["mainGun-common", "mainGun-common", null, "mainGun-purple", "mainGun-purple"];
    const expected = referenceInstalledBattery("fletcher", "mk1-single", 1, slots);
    const derive = vi.spyOn(components, "getMainGun");
    const result = installedMainBattery("fletcher", "mk1-single", 1, slots);
    expect(result).toEqual(expected);
    expect(derive.mock.calls.map(([id]) => id)).toEqual(["mk1-single", "mk1-single", "mk2-twin"]);
    expect(result.mounts.map((mount) => mount.slotIndex)).toEqual([0, 1, 3, 4]);
  });

  it("performs no slot derivations for empty, null-only, or hole-only installations", () => {
    const derive = vi.spyOn(components, "getMainGun");
    for (const slots of [[], [null, null], new Array<string | null>(5)]) {
      derive.mockClear();
      expect(installedMainBattery("fletcher", "mk1-single", 5, slots).mounts).toEqual([]);
      expect(derive).toHaveBeenCalledTimes(1);
    }
  });

  it("observes in-place loadout edits and count changes on the next call", () => {
    const slots: (string | null)[] = ["mainGun-common", null, "mainGun-purple"];
    const first = installedMainBattery("j-class", "mk1-single", 3, slots);
    slots[0] = "mainGun-redGold";
    slots[1] = "mainGun-gold";
    slots[2] = null;
    const second = installedMainBattery("j-class", "mk1-single", 3, slots);
    expect(second).toEqual(referenceInstalledBattery("j-class", "mk1-single", 3, slots));
    expect(first.mounts.map((mount) => mount.slotIndex)).toEqual([0, 2]);
    expect(second.mounts.map((mount) => mount.slotIndex)).toEqual([0, 1]);
    expect(second.mounts[0]!.visual!.barrelCount).toBe(2);
    slots.push("mainGun-purple");
    expect(installedMainBattery("j-class", "mk3-twin", 1, slots))
      .toEqual(referenceInstalledBattery("j-class", "mk3-twin", 1, slots));
  });

  it("preserves developer battery overrides and applies toggles immediately", () => {
    const ship: Parameters<typeof effectiveMainBattery>[0] = {
      shipClassId: "fletcher",
      mainGunId: "mk3-twin",
      mainGunMounts: 1,
      developer: {
        enabled: true, unrestrictedWeapons: true, infiniteAmmunition: true,
        instantReload: true, speedMultiplier: 1, mainBatteryClassId: "king-george-v",
      },
      installedEquipment: {
        mainGun: ["mainGun-gold", null, "mainGun-purple", "mainGun-common"],
        torpedo: [], antiAir: [], sideGun: [], depthCharge: [], magazine: [], engine: [], steering: [],
      },
    };
    const slots = ship.installedEquipment!.mainGun;
    expect(effectiveMainBattery(ship))
      .toEqual(referenceInstalledBattery("king-george-v", "mk3-twin", 1, slots));
    ship.developer!.mainBatteryClassId = "richelieu";
    expect(effectiveMainBattery(ship))
      .toEqual(referenceInstalledBattery("richelieu", "mk3-twin", 1, slots));
    ship.developer!.enabled = false;
    expect(effectiveMainBattery(ship))
      .toEqual(referenceInstalledBattery("fletcher", "mk3-twin", 1, slots));
  });

  it("does not share derived mount or per-mount visual objects within or between calls", () => {
    for (const shipClassId of ["fletcher", "king-george-v"] as const) {
      const slots = ["mainGun-common", "mainGun-common", "mainGun-common"];
      const first = installedMainBattery(shipClassId, "mk1-single", 3, slots);
      const second = installedMainBattery(shipClassId, "mk1-single", 3, slots);
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect(first.mounts).not.toBe(second.mounts);
      expect(new Set(first.mounts.map((mount) => mount.visual)).size).toBe(3);
      for (let i = 0; i < first.mounts.length; i += 1) {
        expect(first.mounts[i]).not.toBe(second.mounts[i]);
        expect(first.mounts[i]!.visual).not.toBe(second.mounts[i]!.visual);
      }
      first.mounts[0]!.longitudinalFraction = 999;
      first.mounts[0]!.visual!.barrelLength = 999;
      expect(second).toEqual(referenceInstalledBattery(shipClassId, "mk1-single", 3, slots));
      expect(installedMainBattery(shipClassId, "mk1-single", 3, slots)).toEqual(second);
    }
  });
});
