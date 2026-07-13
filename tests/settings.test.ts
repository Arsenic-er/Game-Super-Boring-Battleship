import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings } from "../src/settings/gameSettings";

describe("game settings", () => {
  it("uses safe defaults for invalid settings", () => {
    expect(normalizeGameSettings({ aimSensitivity: Number.NaN })).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it("clamps sensitivity values to supported ranges", () => {
    expect(normalizeGameSettings({
      steeringSensitivity: 2,
      aimSensitivity: 0.1,
    })).toEqual({
      steeringSensitivity: 1,
      aimSensitivity: 0.5,
    });
  });
});
