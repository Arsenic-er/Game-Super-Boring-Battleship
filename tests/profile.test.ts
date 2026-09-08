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
  selectShipClass,
  setCommanderName,
} from "../src/profile/localProfile";
import { EQUIPMENT_CATALOG, SHIP_CLASS_SLOT_COUNTS } from "../src/profile/equipmentCatalog";
import { getTorpedo } from "../src/ships/torpedoes";
import { SHIP_CLASSES, SHIP_CLASS_IDS } from "../src/ships/classes";

describe("local commander profile", () => {
  it("migrates the legacy main gun loadout into component inventory", () => {
    const profile = normalizeLocalProfile({ commanderName: "", credits: -10, loadout: { mainGun: "mk2-twin" } });
    expect(profile.commanderName).toBe("本地舰长");
    expect(profile.credits).toBe(0);
    expect(profile.inventory["mainGun-purple"]).toBeGreaterThanOrEqual(1);
    expect(profile.loadout.mainGun).toBe("mainGun-purple");
    expect(profile.version).toBe(7);
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
    expect(modifiers.maxSpeedMultiplier).toBeCloseTo(1.1);
    expect(modifiers.turnMultiplier).toBeGreaterThan(1.05);
    expect(modifiers.reloadMultiplier).toBeLessThan(1);
    expect(modifiers.antiAirMounts).toBeGreaterThan(0);
    expect(modifiers.antiAirEfficiencyMultiplier).toBeGreaterThan(1);
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
      inventory: { ...base.inventory, "engine-common": base.inventory["engine-common"] + 1, "engine-purple": 2 },
      unlockedEquipment: { ...base.unlockedEquipment, "engine-purple": true },
    });
    const sold = sellComponent(spare, "engine-common");
    expect(sold.success).toBe(true);
    expect(sold.profile.inventory["engine-common"]).toBe(base.inventory["engine-common"]);
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

  it("preserves independent slot loadouts while switching historical ship classes", () => {
    const destroyer = createDefaultLocalProfile();
    const cruiser = selectShipClass(destroyer, "cleveland");
    expect(cruiser.hullId).toBe("lightCruiser");
    expect(cruiser.shipClassId).toBe("cleveland");
    expect(battleLoadout(cruiser).hullId).toBe("lightCruiser");
    const battleship = selectShipClass(cruiser, "bismarck");
    expect(battleship.loadout.torpedo).toBeNull();
    expect(battleship.loadout.sideGun).toBe("sideGun-common");
    const restored = selectShipClass(battleship, "fletcher");
    expect(restored.loadout).toEqual(destroyer.loadout);
  });

  it("rejects torpedoes on a battleship without a torpedo slot", () => {
    const battleship = selectShipClass(createDefaultLocalProfile(), "north-carolina");
    const attempted = equipComponent(battleship, "torpedo-common");
    expect(attempted.loadout.torpedo).toBeNull();
  });

  it("provides five historical classes per hull family with truthful starter gaps", () => {
    expect(SHIP_CLASS_IDS).toHaveLength(15);
    for (const hullId of ["destroyer", "lightCruiser", "battleship"] as const) {
      expect(SHIP_CLASS_IDS.filter((id) => SHIP_CLASSES[id].hullId === hullId)).toHaveLength(5);
    }
    const profile = createDefaultLocalProfile();
    for (const id of SHIP_CLASS_IDS) {
      const definition = SHIP_CLASSES[id];
      const slots = profile.slotLoadoutsByShipClass[id];
      expect(slots.mainGun.filter(Boolean)).toHaveLength(definition.starterSlots.mainGun);
      expect(Object.values(definition.starterSlots).reduce((sum, count) => sum + count, 0))
        .toBeLessThan(Object.values(definition.slotCounts).reduce((sum, count) => sum + count, 0));
      expect(slots.mainGun).toHaveLength(SHIP_CLASS_SLOT_COUNTS[id].mainGun);
    }
  });

  it("keeps depth charges exclusive to destroyers and visibly unfilled for upgrades", () => {
    const profile = createDefaultLocalProfile();
    for (const id of SHIP_CLASS_IDS) {
      const definition = SHIP_CLASSES[id];
      expect(definition.slotCounts.depthCharge).toBe(definition.hullId === "destroyer" ? 2 : 0);
    }
    const destroyer = equipComponent(normalizeLocalProfile({
      ...profile,
      inventory: {
        ...profile.inventory,
        "depthCharge-common": profile.inventory["depthCharge-common"] + 1,
      },
    }), "depthCharge-common");
    expect(destroyer.slotLoadoutsByShipClass.fletcher.depthCharge.filter(Boolean)).toHaveLength(2);
    expect(battleLoadout(profile).depthChargeMounts).toBe(1);
    expect(battleLoadout(destroyer).depthChargeMounts).toBe(2);
    const cruiser = selectShipClass(profile, "agano");
    expect(battleLoadout(cruiser).depthChargeMounts).toBe(0);
    expect(equipComponent(cruiser, "depthCharge-common")).toEqual(cruiser);
  });
  it("passes every fitted historical side-gun slot into battle in slot order", () => {
    const base = selectShipClass(createDefaultLocalProfile(), "agano");
    const mixed = normalizeLocalProfile({
      ...base,
      inventory: { ...base.inventory, "sideGun-purple": 1 },
      unlockedEquipment: { ...base.unlockedEquipment, "sideGun-purple": true },
      slotLoadoutsByShipClass: {
        ...base.slotLoadoutsByShipClass,
        agano: {
          ...base.slotLoadoutsByShipClass.agano,
          sideGun: ["sideGun-common", "sideGun-purple"],
        },
      },
    });
    expect(battleLoadout(mixed).secondaryGunIds)
      .toEqual(["sideGun-common", "sideGun-purple"]);
    expect(battleLoadout(selectShipClass(mixed, "fletcher")).secondaryGunIds).toEqual([]);
  });

  it("passes fitted anti-air slots and their historical component quality into battle", () => {
    const base = createDefaultLocalProfile();
    const upgraded = normalizeLocalProfile({
      ...base,
      inventory: { ...base.inventory, "antiAir-redGold": 1 },
      unlockedEquipment: { ...base.unlockedEquipment, "antiAir-redGold": true },
      slotLoadoutsByShipClass: {
        ...base.slotLoadoutsByShipClass,
        fletcher: {
          ...base.slotLoadoutsByShipClass.fletcher,
          antiAir: ["antiAir-common", "antiAir-redGold", null, null],
        },
      },
    });
    const loadout = battleLoadout(upgraded);
    expect(loadout.antiAirMounts).toBe(2);
    expect(loadout.antiAirEfficiencyMultiplier).toBeCloseTo(1.09);
  });
});
