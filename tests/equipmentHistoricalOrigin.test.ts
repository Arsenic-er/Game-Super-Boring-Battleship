import { describe, expect, it } from "vitest";
import { EQUIPMENT_BY_ID } from "../src/profile/equipmentCatalog";
import { equipmentLocale } from "../src/i18n/equipmentLocale";
import { SUPPORTED_GAME_LOCALES, type GameLocale } from "../src/i18n/gameLocale";
import { MAIN_GUNS } from "../src/ships/components";

const expectedOrigins: Record<GameLocale, string> = {
  "zh-CN": "英国 · 皇家海军驱逐舰",
  "zh-TW": "英國 · 皇家海軍驅逐艦",
  "en-US": "UK · Royal Navy destroyers",
  "ja-JP": "英国 · 王立海軍駆逐艦",
  "es-ES": "Reino Unido · destructores de la Marina Real",
  "de-DE": "Großbritannien · Zerstörer der Royal Navy",
  "ru-RU": "Великобритания · эсминцы Королевского флота",
};

describe("Mk IX / CP XVIII historical attribution", () => {
  it("uses the conservative Royal Navy origin and omits the unsupported 1938 pattern in every locale", () => {
    for (const locale of SUPPORTED_GAME_LOCALES) {
      const item = equipmentLocale(locale, "mainGun-common");
      expect(item.origin).toBe(expectedOrigins[locale]);
      expect(item.description).not.toContain("1938");
      expect(item.modelName).toBe("QF 4.7 in Mk IX / CP Mk XVIII");
    }
    const base = EQUIPMENT_BY_ID["mainGun-common"]!;
    expect(base.origin).toBe(expectedOrigins["zh-CN"]);
    expect(base.description).toBe(equipmentLocale("zh-CN", base.id).description);
  });

  it("preserves the single-gun component identity and the unrelated J/K/N engine attribution", () => {
    expect(EQUIPMENT_BY_ID["mainGun-common"]!.mainGunId).toBe("mk1-single");
    expect(MAIN_GUNS["mk1-single"].visual.barrelCount).toBe(1);
    expect(EQUIPMENT_BY_ID["engine-common"]!.origin).toContain("J/K/N");
    for (const locale of SUPPORTED_GAME_LOCALES) {
      expect(equipmentLocale(locale, "engine-common").origin).toContain("J/K/N");
    }
  });
});
