import { DEFAULT_GAME_LOCALE, isGameLocale } from "../i18n/gameLocale";
import type { GameLocale } from "../i18n/gameLocale";

export interface GameSettings {
  steeringSensitivity: number;
  aimSensitivity: number;
  masterVolume: number;
  muted: boolean;
  locale: GameLocale;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  steeringSensitivity: 1,
  aimSensitivity: 1,
  masterVolume: 0.7,
  muted: false,
  locale: DEFAULT_GAME_LOCALE,
};

const STORAGE_KEY = "grey-sea-game-settings-v1";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function normalizeGameSettings(value: unknown): GameSettings {
  const candidate = value && typeof value === "object"
    ? value as Partial<GameSettings>
    : {};
  const steering = typeof candidate.steeringSensitivity === "number"
    && Number.isFinite(candidate.steeringSensitivity)
    ? candidate.steeringSensitivity
    : DEFAULT_GAME_SETTINGS.steeringSensitivity;
  const aim = typeof candidate.aimSensitivity === "number"
    && Number.isFinite(candidate.aimSensitivity)
    ? candidate.aimSensitivity
    : DEFAULT_GAME_SETTINGS.aimSensitivity;
  const masterVolume = typeof candidate.masterVolume === "number"
    && Number.isFinite(candidate.masterVolume)
    ? candidate.masterVolume
    : DEFAULT_GAME_SETTINGS.masterVolume;
  const muted = typeof candidate.muted === "boolean"
    ? candidate.muted
    : DEFAULT_GAME_SETTINGS.muted;
  const locale = isGameLocale(candidate.locale)
    ? candidate.locale
    : DEFAULT_GAME_SETTINGS.locale;
  return {
    steeringSensitivity: clamp(steering, 0.35, 1),
    aimSensitivity: clamp(aim, 0.5, 2),
    masterVolume: clamp(masterVolume, 0, 1),
    muted,
    locale,
  };
}

export function loadGameSettings(): GameSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeGameSettings(JSON.parse(stored)) : { ...DEFAULT_GAME_SETTINGS };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function saveGameSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeGameSettings(settings)));
  } catch {
    // The game remains playable if storage is disabled or full.
  }
}
