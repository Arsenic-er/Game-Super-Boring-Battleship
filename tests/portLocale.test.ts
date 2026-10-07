import { describe, expect, it } from "vitest";
import { SUPPORTED_GAME_LOCALES, GAME_LOCALE_MESSAGES, translateGameText } from "../src/i18n/gameLocale";
import { PORT_MESSAGES, portText, type PortMessageKey } from "../src/i18n/portLocale";
describe("port translations", () => {
  it("has explicit nonempty translations in all seven supported languages", () => {
    expect(SUPPORTED_GAME_LOCALES).toHaveLength(7);
    for (const [key, row] of Object.entries(PORT_MESSAGES)) {
      expect(row, key).toHaveLength(7);
      SUPPORTED_GAME_LOCALES.forEach((locale, i) => {
        expect(portText(locale, key as PortMessageKey), `${locale}:${key}`).toBe(row[i]);
        expect(row[i].trim().length).toBeGreaterThan(0);
      });
    }
  });
  it("does not fall back to Chinese for newly added western-language controls", () => {
    for (const locale of ["en-US", "es-ES", "de-DE", "ru-RU"] as const)
      for (const key of Object.keys(PORT_MESSAGES) as PortMessageKey[])
        expect(portText(locale, key)).not.toMatch(/[\u3400-\u9fff]/);
  });
});

describe("dock slot-control translations", () => {
  it("provides explicit translations for every new slot-control label in all seven languages", () => {
    for (const source of ["装配位置", "自动选择槽位", "槽位", "空槽", "替换所选槽位"]) {
      const row = GAME_LOCALE_MESSAGES.find(entry => entry.source === source);
      expect(row, source).toBeDefined();
      for (const locale of SUPPORTED_GAME_LOCALES) {
        const translated = translateGameText(source, locale);
        expect(translated).toBe(locale === "zh-CN" ? source : row![locale]);
        expect(translated.trim()).not.toBe("");
        if (["en-US", "es-ES", "de-DE", "ru-RU"].includes(locale))
          expect(translated).not.toMatch(/[\u3400-\u9fff]/);
      }
    }
  });
});
