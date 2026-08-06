export type WeatherId = "clear" | "scattered" | "overcast" | "rain-squall" | "sea-fog";

export interface WeatherPreset {
  id: WeatherId;
  name: string;
  description: string;
  skyTexture: "clear" | "overcast";
  exposure: number;
  contrast: number;
  ambientIntensity: number;
  sunIntensity: number;
  fogStart: number;
  sunDiskVisibility: number;
  fogEnd: number;
  fogColor: readonly [number, number, number];
  oceanScrollMultiplier: number;
  oceanBumpLevel: number;
  waveVisibilityMultiplier: number;
  opticalVisibilityMultiplier: number;
  rainOpacity: number;
}

export const WEATHER_IDS = [
  "clear", "scattered", "overcast", "rain-squall", "sea-fog",
] as const satisfies readonly WeatherId[];

/** Clear is the locked visual reference. Do not tune it through other presets. */
export const WEATHER_PRESETS: Readonly<Record<WeatherId, WeatherPreset>> = {
  clear: {
    id: "clear", name: "万里晴空", description: "最佳能见度 · 平静海况",
    skyTexture: "clear", exposure: 1.1, contrast: 1.06,
    ambientIntensity: 0.8, sunIntensity: 1.15, sunDiskVisibility: 1,
    fogStart: 7_000, fogEnd: 13_000, fogColor: [0.7, 0.86, 0.95],
    oceanScrollMultiplier: 1, oceanBumpLevel: 0.16,
    waveVisibilityMultiplier: 1, opticalVisibilityMultiplier: 1, rainOpacity: 0,
  },
  scattered: {
    id: "scattered", name: "晴间多云", description: "柔和日照 · 轻微海风",
    skyTexture: "clear", exposure: 1.02, contrast: 1.07,
    ambientIntensity: 0.76, sunIntensity: 0.9, sunDiskVisibility: 0.55,
    fogStart: 5_500, fogEnd: 10_500, fogColor: [0.62, 0.76, 0.84],
    oceanScrollMultiplier: 1.08, oceanBumpLevel: 0.18,
    waveVisibilityMultiplier: 1.08, opticalVisibilityMultiplier: 0.9, rainOpacity: 0,
  },
  overcast: {
    id: "overcast", name: "阴天", description: "云层压低 · 中等海况",
    skyTexture: "overcast", exposure: 0.94, contrast: 1.08,
    ambientIntensity: 0.66, sunIntensity: 0.35, sunDiskVisibility: 0.08,
    fogStart: 4_300, fogEnd: 8_000, fogColor: [0.42, 0.56, 0.63],
    oceanScrollMultiplier: 1.18, oceanBumpLevel: 0.21,
    waveVisibilityMultiplier: 1.16, opticalVisibilityMultiplier: 0.78, rainOpacity: 0,
  },
  "rain-squall": {
    id: "rain-squall", name: "海上阵雨", description: "局地强雨 · 较强风浪",
    skyTexture: "overcast", exposure: 0.84, contrast: 1.1,
    ambientIntensity: 0.52, sunIntensity: 0.18, sunDiskVisibility: 0,
    fogStart: 2_200, fogEnd: 5_000, fogColor: [0.31, 0.43, 0.5],
    oceanScrollMultiplier: 1.38, oceanBumpLevel: 0.25,
    waveVisibilityMultiplier: 1.32, opticalVisibilityMultiplier: 0.62, rainOpacity: 0.36,
  },
  "sea-fog": {
    id: "sea-fog", name: "海雾", description: "近距离交战 · 低风浪",
    skyTexture: "overcast", exposure: 0.9, contrast: 1.02,
    ambientIntensity: 0.58, sunIntensity: 0.25, sunDiskVisibility: 0.12,
    fogStart: 550, fogEnd: 1_800, fogColor: [0.64, 0.7, 0.71],
    oceanScrollMultiplier: 0.82, oceanBumpLevel: 0.13,
    waveVisibilityMultiplier: 0.72, opticalVisibilityMultiplier: 0.45, rainOpacity: 0,
  },
};

export function isWeatherId(value: unknown): value is WeatherId {
  return typeof value === "string" && (WEATHER_IDS as readonly string[]).includes(value);
}

export function normalizeWeatherId(value: unknown): WeatherId {
  return isWeatherId(value) ? value : "clear";
}

export function weatherPreset(value: unknown): WeatherPreset {
  return WEATHER_PRESETS[normalizeWeatherId(value)];
}
