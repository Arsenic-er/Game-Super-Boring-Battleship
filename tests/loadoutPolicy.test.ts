import { describe, expect, it } from "vitest";
import {
  autoEquipBestOwnedComponents,
  createDefaultLocalProfile,
  equipComponent,
  installedCopies,
  normalizeLocalProfile,
  selectShipClass,
  sellComponent,
} from "../src/profile/localProfile";
import { createMinimumSeaReadySlotLoadout, minimumSeaReadySlotCounts } from "../src/profile/loadoutPolicy";
import { savedBuildReadiness } from "../src/profile/savedBuilds";
import { CATEGORY_META, EQUIPMENT_CATALOG, SHIP_CLASS_SLOT_COUNTS } from "../src/profile/equipmentCatalog";
import { SHIP_CLASS_IDS } from "../src/ships/classes";

describe("automatic and minimum sea-ready loadouts", () => {
  it("defines a truthful minimum loadout for every historical ship class", () => {
    for (const shipClassId of SHIP_CLASS_IDS) {
      const counts = minimumSeaReadySlotCounts(shipClassId);
      const slots = createMinimumSeaReadySlotLoadout(shipClassId);
      for (const category of Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[]) {
        expect(slots[category]).toHaveLength(SHIP_CLASS_SLOT_COUNTS[shipClassId][category]);
        expect(slots[category].filter(Boolean), `${shipClassId} ${category}`).toHaveLength(counts[category]);
      }
    }
  });

  it("equips the strongest owned compatible components without stealing other ships' fittings", () => {
    const base = createDefaultLocalProfile();
    const owned = normalizeLocalProfile({
      ...base,
      inventory: {
        ...base.inventory,
        "mainGun-gold": 1,
        "engine-redGold": 1,
        "steering-purple": 1,
      },
    });
    const result = autoEquipBestOwnedComponents(owned);
    const current = result.profile.slotLoadoutsByShipClass.fletcher;
    expect(current.mainGun[0]).toBe("mainGun-gold");
    expect(current.engine[0]).toBe("engine-redGold");
    expect(current.steering[0]).toBe("steering-purple");
    expect(result.changedSlots).toBeGreaterThan(0);
    for (const item of EQUIPMENT_CATALOG) {
      expect(installedCopies(result.profile, item.id), item.id)
        .toBeLessThanOrEqual(result.profile.inventory[item.id] ?? 0);
    }
    expect(autoEquipBestOwnedComponents(result.profile).profile).toEqual(result.profile);
  });

  it("commissions a newly selected ship with a ready standard battle build", () => {
    const selected = selectShipClass(createDefaultLocalProfile(), "yamato");
    const build = selected.savedShipBuilds.find(({ shipClassId }) => shipClassId === "yamato");
    expect(build).toBeDefined();
    expect(selected.selectedBattleBuildId).toBe(build?.id);
    expect(savedBuildReadiness(selected, build!).ready).toBe(true);
    const repeated = selectShipClass(selected, "yamato");
    expect(repeated.savedShipBuilds.filter(({ shipClassId }) => shipClassId === "yamato")).toHaveLength(1);
  });

  it("does not regenerate an uninstalled baseline fitting after it is sold", () => {
    const base = createDefaultLocalProfile();
    const owned = normalizeLocalProfile({
      ...base,
      inventory: { ...base.inventory, "mainGun-gold": 1 },
    });
    const fitted = equipComponent(owned, "mainGun-gold");
    const before = fitted.inventory["mainGun-common"];
    const transaction = sellComponent(fitted, "mainGun-common");
    expect(transaction.success).toBe(true);
    expect(transaction.profile.inventory["mainGun-common"]).toBe(before - 1);
    expect(installedCopies(transaction.profile, "mainGun-common"))
      .toBe(transaction.profile.inventory["mainGun-common"]);
  });

  it("rejects a blueprint that does not meet minimum sea-ready slot counts", () => {
    const profile = createDefaultLocalProfile();
    const empty = {
      id: "empty",
      name: "Empty",
      shipClassId: "fletcher" as const,
      slots: Object.fromEntries(Object.entries(SHIP_CLASS_SLOT_COUNTS.fletcher).map(([category, count]) => [
        category,
        Array.from({ length: count }, () => null),
      ])) as typeof profile.slotLoadoutsByShipClass.fletcher,
    };
    const readiness = savedBuildReadiness(profile, empty);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toHaveLength(0);
    expect(readiness.missingSlots.length).toBeGreaterThan(0);
  });
});
