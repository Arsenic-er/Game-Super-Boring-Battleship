import { describe, expect, it } from "vitest";
import {
  battleLoadout,
  awardBattleResult,
  createDefaultLocalProfile,
  drawSupplies,
  equipComponent,
  normalizeLocalProfile,
  purchaseComponent,
  researchComponent,
  salvageComponent,
  sellComponent,
  selectHull,
  setCommanderName,
} from "../src/profile/localProfile";
import { EQUIPMENT_CATALOG } from "../src/profile/equipmentCatalog";
import { getTorpedo } from "../src/ships/torpedoes";

describe("local commander profile", () => {
  it("migrates the legacy main gun loadout into component inventory", () => {
    const profile = normalizeLocalProfile({ commanderName: "", credits: -10, loadout: { mainGun: "mk2-twin" } });
    expect(profile.commanderName).toBe("本地舰长");
    expect(profile.credits).toBe(0);
    expect(profile.inventory["mainGun-purple"]).toBeGreaterThanOrEqual(1);
    expect(profile.loadout.mainGun).toBe("mainGun-purple");
    expect(profile.version).toBe(4);
    expect(profile.unlockedEquipment["mainGun-purple"]).toBe(true);
  });

  it("guarantees purple at draw 10, gold at 50 and red-gold at 100", () => {
    let profile = { ...createDefaultLocalProfile(), supplyTokens: 120 };
    const rarities: string[] = [];
    for (let batch = 0; batch < 10; batch += 1) {
      const drawn = drawSupplies(profile, 10, () => 0.2);
      profile = drawn.profile;
      rarities.push(...drawn.results.map((result) => result.rarity));
    }
    expect(rarities[9]).toBe("purple");
    expect(rarities[49]).toBe("gold");
    expect(rarities[99]).toBe("redGold");
  });

  it("equips owned compatible components and applies battle bonuses", () => {
    const base = createDefaultLocalProfile();
    const source = normalizeLocalProfile({
      ...base,
      inventory: { ...base.inventory, "engine-gold": 1, "steering-purple": 1, "magazine-gold": 1 },
    });
    const equipped = equipComponent(equipComponent(equipComponent(source, "engine-gold"), "steering-purple"), "magazine-gold");
    const modifiers = battleLoadout(equipped);
    expect(modifiers.maxSpeedMultiplier).toBeGreaterThan(1.1);
    expect(modifiers.turnMultiplier).toBeGreaterThan(1.05);
    expect(modifiers.reloadMultiplier).toBeLessThan(1);
  });

  it("maps every historical torpedo component into a distinct battle definition", () => {
    const expected = ["mk-ix", "g7a-t1", "mk-15-mod-3", "type-93-mod-3"] as const;
    for (const [index, itemId] of [
      "torpedo-common",
      "torpedo-purple",
      "torpedo-gold",
      "torpedo-redGold",
    ].entries()) {
      const base = createDefaultLocalProfile();
      const owned = normalizeLocalProfile({
        ...base,
        inventory: { ...base.inventory, [itemId]: 1 },
      });
      const loadout = battleLoadout(equipComponent(owned, itemId));
      expect(loadout.torpedoId).toBe(expected[index]);
      expect(getTorpedo(loadout.torpedoId).name.length).toBeGreaterThan(8);
    }
  });

  it("normalizes the locally saved commander name", () => {
    expect(setCommanderName(createDefaultLocalProfile(), "  海风  ").commanderName).toBe("海风");
  });

  it("uses distinct historical model cards instead of color names", () => {
    expect(new Set(EQUIPMENT_CATALOG.map((item) => item.name)).size).toBe(EQUIPMENT_CATALOG.length);
    for (const item of EQUIPMENT_CATALOG) {
      expect(item.name).not.toMatch(/普通|紫色|金色|赤金/);
      expect(item.origin.length).toBeGreaterThan(4);
      expect(item.description.length).toBeGreaterThan(12);
    }
  });

  it("researches and purchases a component with one atomic resource transaction", () => {
    const base = normalizeLocalProfile({
      ...createDefaultLocalProfile(),
      credits: 10_000,
      researchPoints: 500,
      materials: { steel: 100, parts: 100 },
    });
    const researched = researchComponent(base, "engine-purple");
    expect(researched.success).toBe(true);
    expect(researched.profile.researchPoints).toBe(380);
    const purchased = purchaseComponent(researched.profile, "engine-purple");
    expect(purchased.success).toBe(true);
    expect(purchased.profile.credits).toBe(6_200);
    expect(purchased.profile.materials.parts).toBe(80);
    expect(purchased.profile.inventory["engine-purple"]).toBe(1);
  });

  it("does not mutate any balance when research or purchase resources are insufficient", () => {
    const base = normalizeLocalProfile({
      ...createDefaultLocalProfile(),
      credits: 0,
      researchPoints: 0,
      materials: { steel: 0, parts: 0 },
    });
    const research = researchComponent(base, "engine-gold");
    expect(research.success).toBe(false);
    expect(research.profile).toEqual(base);
    const purchase = purchaseComponent(base, "engine-gold");
    expect(purchase.success).toBe(false);
    expect(purchase.profile).toEqual(base);
  });

  it("protects installed and baseline parts while recycling spare copies", () => {
    const base = createDefaultLocalProfile();
    const installedSale = sellComponent(base, "engine-common");
    expect(installedSale.success).toBe(false);
    const spare = normalizeLocalProfile({
      ...base,
      inventory: { ...base.inventory, "engine-common": 2, "engine-purple": 2 },
      unlockedEquipment: { ...base.unlockedEquipment, "engine-purple": true },
    });
    const sold = sellComponent(spare, "engine-common");
    expect(sold.success).toBe(true);
    expect(sold.profile.inventory["engine-common"]).toBe(1);
    const salvaged = salvageComponent(spare, "engine-purple");
    expect(salvaged.success).toBe(true);
    expect(salvaged.profile.materials.parts).toBe(base.materials.parts + 18);
  });

  it("awards only game-earned currencies and a free supply ticket after battle", () => {
    const base = createDefaultLocalProfile();
    const won = awardBattleResult(base, "player-won");
    expect(won.profile.credits).toBe(base.credits + 2_200);
    expect(won.profile.researchPoints).toBe(base.researchPoints + 90);
    expect(won.profile.supplyTokens).toBe(base.supplyTokens + 1);
    expect(won.profile.battlesCompleted).toBe(1);
    expect(Object.keys(won.profile)).not.toContain("doubloons");
  });

  it("repairs invalid cross-category loadouts during v3 normalization", () => {
    const base = createDefaultLocalProfile();
    const profile = normalizeLocalProfile({
      ...base,
      inventory: { ...base.inventory, "engine-purple": 1 },
      loadout: { ...base.loadout, mainGun: "engine-purple" },
    });
    expect(profile.loadout.mainGun).toBe("mainGun-common");
  });

  it("preserves an independent loadout while switching among all three hulls", () => {
    const destroyer = createDefaultLocalProfile();
    const cruiser = selectHull(destroyer, "lightCruiser");
    expect(cruiser.hullId).toBe("lightCruiser");
    expect(battleLoadout(cruiser).hullId).toBe("lightCruiser");
    const battleship = selectHull(cruiser, "battleship");
    expect(battleship.loadout.torpedo).toBeNull();
    expect(battleship.loadout.sideGun).toBe("sideGun-common");
    const restored = selectHull(battleship, "destroyer");
    expect(restored.loadout).toEqual(destroyer.loadout);
  });

  it("rejects torpedoes on a battleship without a torpedo slot", () => {
    const battleship = selectHull(createDefaultLocalProfile(), "battleship");
    const attempted = equipComponent(battleship, "torpedo-common");
    expect(attempted.loadout.torpedo).toBeNull();
  });
});
