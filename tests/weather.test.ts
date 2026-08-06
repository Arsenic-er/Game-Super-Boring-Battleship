import { describe, expect, it } from "vitest";
import {
  WEATHER_IDS,
  WEATHER_PRESETS,
  normalizeWeatherId,
} from "../src/sim/weather";

describe("battle weather presets", () => {
  it("keeps cloudless clear weather as the immutable reference", () => {
    expect(WEATHER_PRESETS.clear).toMatchObject({
      exposure: 1.1,
      contrast: 1.06,
      ambientIntensity: 0.8,
      sunIntensity: 1.15,
      fogStart: 7_000,
      fogEnd: 13_000,
      opticalVisibilityMultiplier: 1,
    });
  });

  it("provides five valid low-cost weather steps with reduced bad-weather visibility", () => {
    expect(WEATHER_IDS).toHaveLength(5);
    for (const id of WEATHER_IDS) {
      const preset = WEATHER_PRESETS[id];
      expect(preset.fogEnd).toBeGreaterThan(preset.fogStart);
      expect(preset.oceanScrollMultiplier).toBeGreaterThan(0);
    }
    expect(WEATHER_PRESETS["rain-squall"].opticalVisibilityMultiplier)
      .toBeLessThan(WEATHER_PRESETS.overcast.opticalVisibilityMultiplier);
    expect(WEATHER_PRESETS["sea-fog"].fogEnd).toBeLessThan(WEATHER_PRESETS.clear.fogEnd);
    expect(normalizeWeatherId("unknown")).toBe("clear");
  });
});
