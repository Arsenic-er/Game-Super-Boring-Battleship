import { describe, expect, it } from "vitest";
import {
  applyDeveloperEquipmentLoadout,
  developerStarterEquipmentSlots,
  normalizeDeveloperEquipmentSlots,
} from "../src/sim/developerSandbox";
import { createInitialState } from "../src/sim/simulation";
import { createDefaultLocalProfile } from "../src/profile/localProfile";
import {
  CATEGORY_META,
  EQUIPMENT_CATALOG,
  SHIP_CLASS_SLOT_COUNTS,
  isEquipmentCompatible,
  type EquipmentCategory,
} from "../src/profile/equipmentCatalog";
import { SHIP_CLASS_IDS } from "../src/ships/classes";

const categories = Object.keys(CATEGORY_META) as EquipmentCategory[];

describe("developer equipment armory", () => {
  it("exposes the exact formal slot layout for all fifteen historical ship classes", () => {
    expect(SHIP_CLASS_IDS).toHaveLength(15);
    for (const shipClassId of SHIP_CLASS_IDS) {
      const slots = developerStarterEquipmentSlots(shipClassId);
      for (const category of categories) {
        expect(slots[category], `${shipClassId} ${category}`)
          .toHaveLength(SHIP_CLASS_SLOT_COUNTS[shipClassId][category]);
      }
    }
  });

  it("accepts every catalog component without ownership, research or purchase checks", () => {
    expect(EQUIPMENT_CATALOG).toHaveLength(32);
    for (const item of EQUIPMENT_CATALOG) {
      const shipClassId = SHIP_CLASS_IDS.find((candidate) =>
        isEquipmentCompatible(item, candidate));
      expect(shipClassId, item.id).toBeDefined();
      const slots = developerStarterEquipmentSlots(shipClassId!);
      slots[item.category][0] = item.id;
      const normalized = normalizeDeveloperEquipmentSlots(shipClassId!, slots);
      expect(normalized[item.category], item.id).toContain(item.id);
    }
  });

  it("applies high-end utility and weapon bonuses to the selected runtime ship only", () => {
    const profile = createDefaultLocalProfile();
    const profileSnapshot = structuredClone(profile);
    const state = createInitialState(912, "sea-trials", undefined, undefined, undefined, "fletcher");
    const player = state.ships.find(({ id }) => id === "player")!;
    const originalPosition = { ...player.position };
    const slots = developerStarterEquipmentSlots("fletcher");

    for (const category of categories) {
      const itemId = `${category}-redGold`;
      slots[category] = slots[category].map(() =>
        EQUIPMENT_CATALOG.some((item) =>
          item.id === itemId && isEquipmentCompatible(item, "fletcher"))
          ? itemId
          : null);
    }

    const replacement = applyDeveloperEquipmentLoadout(
      state,
      player.id,
      "fletcher",
      slots,
    );

    expect(replacement).toBeDefined();
    expect(replacement!.id).toBe("player");
    expect(replacement!.team).toBe("player");
    expect(replacement!.position).toEqual(originalPosition);
    expect(replacement!.mainGunId).toBe("mk4-twin");
    expect(replacement!.torpedoId).toBe("type-93-mod-3");
    expect(replacement!.mainBatteryMounts).toHaveLength(SHIP_CLASS_SLOT_COUNTS.fletcher.mainGun);
    expect(replacement!.torpedoLauncherMounts).toBe(SHIP_CLASS_SLOT_COUNTS.fletcher.torpedo);
    expect(replacement!.antiAirMounts).toBe(SHIP_CLASS_SLOT_COUNTS.fletcher.antiAir);
    expect(replacement!.antiAirEfficiencyMultiplier).toBeCloseTo(1.15);
    expect(replacement!.performance.maxSpeedMultiplier).toBeCloseTo(1.15);
    expect(replacement!.performance.accelerationMultiplier).toBeCloseTo(1.1275);
    expect(replacement!.performance.turnMultiplier).toBeCloseTo(1.15);
    expect(replacement!.performance.reloadMultiplier).toBeCloseTo(0.892);
    expect(replacement!.developer?.equipmentSlots?.engine?.[0]).toBe("engine-redGold");
    expect(profile).toEqual(profileSnapshot);
  });

  it("rejects incompatible categories and unifies main-gun and torpedo models per battery", () => {
    const slots = developerStarterEquipmentSlots("fletcher");
    slots.sideGun = ["sideGun-redGold"];
    slots.mainGun = slots.mainGun.map((_, index) =>
      index % 2 === 0 ? "mainGun-purple" : "mainGun-gold");
    slots.torpedo = slots.torpedo.map((_, index) =>
      index % 2 === 0 ? "torpedo-redGold" : "torpedo-common");

    const normalized = normalizeDeveloperEquipmentSlots("fletcher", slots);

    expect(normalized.sideGun).toHaveLength(0);
    expect(new Set(normalized.mainGun.filter(Boolean))).toEqual(new Set(["mainGun-purple"]));
    expect(new Set(normalized.torpedo.filter(Boolean))).toEqual(new Set(["torpedo-redGold"]));
  });
});
