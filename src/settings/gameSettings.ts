export interface GameSettings {
  steeringSensitivity: number;
  aimSensitivity: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  steeringSensitivity: 1,
  aimSensitivity: 1,
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
  return {
    steeringSensitivity: clamp(steering, 0.35, 1),
    aimSensitivity: clamp(aim, 0.5, 2),
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
