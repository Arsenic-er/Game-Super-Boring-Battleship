import { describe, expect, it } from "vitest";
import { SUPPORTED_GAME_LOCALES } from "../src/i18n/gameLocale";
import { tacticalAirText } from "../src/i18n/tacticalAirLocale";

describe("tactical air localization", () => {
  it("covers every role, phase, weapon and mission in all seven locales", () => {
    for (const locale of SUPPORTED_GAME_LOCALES) {
      const text = tacticalAirText(locale);
      expect(Object.keys(text.roles)).toHaveLength(3);
      expect(Object.keys(text.phases)).toHaveLength(11);
      expect(Object.keys(text.weapons)).toHaveLength(3);
      expect(Object.keys(text.missions)).toHaveLength(6);
      expect(text.squadronStatus.trim()).not.toBe("");
    }
    expect(tacticalAirText("en-US").squadronStatus).not.toBe(
      tacticalAirText("zh-CN").squadronStatus,
    );
    expect(tacticalAirText("ru-RU").roles.diveBomber).not.toContain("轰炸");
  });
});
