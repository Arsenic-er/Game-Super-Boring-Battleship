import { describe, expect, it } from "vitest";
import { SUPPORTED_GAME_LOCALES } from "../src/i18n/gameLocale";
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
