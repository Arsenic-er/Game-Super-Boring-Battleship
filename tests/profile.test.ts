import { describe, expect, it } from "vitest";
import {
  battleLoadout,
  createDefaultLocalProfile,
  drawSupplies,
  equipComponent,
  normalizeLocalProfile,
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
});
