import { describe, expect, it } from "vitest";
import {
  GAME_LOCALE_MESSAGES,
  GAME_LOCALE_OPTIONS,
  SUPPORTED_GAME_LOCALES,
  formatGameNumber,
  translateGameText,
} from "../src/i18n/gameLocale";

describe("game locales", () => {
  it("offers the seven required languages in their native names", () => {
    expect(GAME_LOCALE_OPTIONS).toEqual([
      { value: "zh-CN", label: "简体中文" },
      { value: "zh-TW", label: "繁體中文" },
      { value: "en-US", label: "English" },
      { value: "ja-JP", label: "日本語" },
      { value: "es-ES", label: "Español" },
      { value: "de-DE", label: "Deutsch" },
      { value: "ru-RU", label: "Русский" },
    ]);
    expect(SUPPORTED_GAME_LOCALES).toHaveLength(7);
  });

  it("has a non-empty translation for every locale and message", () => {
    for (const row of GAME_LOCALE_MESSAGES) {
      expect(row.source.trim()).not.toBe("");
      for (const locale of SUPPORTED_GAME_LOCALES) {
        if (locale === "zh-CN") continue;
        expect(row[locale].trim(), `${locale}: ${row.source}`).not.toBe("");
      }
    }
  });

  it("translates navigation and formats numbers with the active locale", () => {
    expect(translateGameText("出击", "en-US")).toBe("Battle");
    expect(translateGameText("舰队船坞", "en-US")).toBe("Fleet Dockyard");
    expect(translateGameText("舰队军械库", "ja-JP")).toBe("艦隊武器庫");
    const english = translateGameText("游戏设置", "en-US");
    expect(translateGameText(english, "zh-CN")).toBe("游戏设置");
    expect(translateGameText("钢材 12 · 零件 3", "de-DE")).toBe("Stahl 12 · Teile 3");
    expect(translateGameText("这段主炮说明保持原样", "en-US")).toBe("这段主炮说明保持原样");
    expect(formatGameNumber(12345, "de-DE")).toBe("12.345");
  });
});
