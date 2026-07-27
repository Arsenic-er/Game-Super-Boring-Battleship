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
      masterVolume: 0.7,
      muted: false,
    });
  });

  it("migrates old settings and clamps audio preferences", () => {
    expect(normalizeGameSettings({
      steeringSensitivity: 0.65,
      aimSensitivity: 1.2,
    })).toEqual({
      steeringSensitivity: 0.65,
      aimSensitivity: 1.2,
      masterVolume: 0.7,
      muted: false,
    });
    expect(normalizeGameSettings({ masterVolume: 4, muted: true })).toEqual({
      steeringSensitivity: 1,
      aimSensitivity: 1,
      masterVolume: 1,
      muted: true,
    });
    expect(normalizeGameSettings({ masterVolume: Number.NaN, muted: "yes" })).toEqual(
      DEFAULT_GAME_SETTINGS,
    );
  });
});
