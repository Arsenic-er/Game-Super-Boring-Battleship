import { describe, expect, it } from "vitest";
import { SUPPORTED_GAME_LOCALES, translateGameText } from "../src/i18n/gameLocale";

describe("bridge instrument localization", () => {
  it("translates the hold-to-show control in every supported locale", () => {
    for (const locale of SUPPORTED_GAME_LOCALES) {
      for (const label of ["中键", "按住显示瞄准标识"]) {
        const translated = translateGameText(label, locale);
        expect(translated).toBeTruthy();
        if (locale !== "zh-CN") expect(translated).not.toBe(label);
      }
    }
  });

  it("translates the new persistent HUD labels in every supported language", () => {
    const labels = ["舰船航行仪表", "详细舰况", "罗经", "舵角", "车钟", "舰体", "可恢复", "正舵"];
    for (const locale of SUPPORTED_GAME_LOCALES) {
      for (const label of labels) {
        const translated = translateGameText(label, locale);
        expect(translated.length).toBeGreaterThan(0);
        expect(typeof translated).toBe("string");
      }
    }
  });

  it("keeps representative navigation terms stable", () => {
    expect(translateGameText("罗经", "en-US")).toBe("Compass");
    expect(translateGameText("舵角", "ja-JP")).toBe("舵角");
    expect(translateGameText("车钟", "de-DE")).toBe("Maschinentelegraf");
    expect(translateGameText("舰体", "ru-RU")).toBe("Корпус");
    expect(translateGameText("可恢复", "es-ES")).toBe("Recuperable");
  });
});
