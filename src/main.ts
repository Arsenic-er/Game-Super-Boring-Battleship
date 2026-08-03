import "./style.css";
import "./pixel.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { RuleBasedAi } from "./controllers/ruleBasedAi";
import { PlayerInput } from "./controllers/playerInput";
import { GameView } from "./render/gameView";
import { CombatAudio } from "./render/combatAudio";
import {
  awardBattleResult,
  battleLoadout,
  loadLocalProfile,
  saveLocalProfile,
} from "./profile/localProfile";
import type { LocalProfile } from "./profile/localProfile";
import { loadGameSettings, saveGameSettings } from "./settings/gameSettings";
import type { GameSettings } from "./settings/gameSettings";
import { FIXED_STEP } from "./sim/config";
import { createInitialState, observe, stepSimulation } from "./sim/simulation";
import { deployFleetAirSupport } from "./sim/airOperations";
import { PlayerPerceptionTracker } from "./sim/playerPerception";
import type { BattleState, ControlCommand, GameMode } from "./sim/types";
import { GameMenus } from "./ui/gameMenus";
import { Hud } from "./ui/hud";
import { TacticalMap } from "./ui/tacticalMap";
import { DeveloperPanel } from "./ui/developerPanel";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

let profile: LocalProfile = loadLocalProfile();
const initialEquipment = battleLoadout(profile);
let state: BattleState = createInitialState(
  undefined,
  "battle",
  initialEquipment.mainGunId,
  initialEquipment,
  initialEquipment.torpedoId,
  initialEquipment.shipClassId,
);
let view: GameView;
let input: PlayerInput;
let tacticalMap: TacticalMap;
let menus: GameMenus;
let developerPanel: DeveloperPanel | undefined;
let ai = new RuleBasedAi();
const playerPerception = new PlayerPerceptionTracker();
const audio = new CombatAudio();
let started = false;
let paused = true;
let accumulator = 0;
let currentMode: GameMode = "battle";
let battleRewarded = false;

function startMode(mode: GameMode): void {
  currentMode = mode;
  battleRewarded = false;
  const equipment = battleLoadout(profile);
  state = createInitialState(
    undefined,
    mode,
    equipment.mainGunId,
    equipment,
    equipment.torpedoId,
    equipment.shipClassId,
  );
  deployFleetAirSupport(state);
  input.reset();
  view.resetTransient();
  tacticalMap?.close();
  tacticalMap?.resetForBattle();
  developerPanel?.close();
  menus?.closeAll();
  hud.resetMetrics();
  ai = new RuleBasedAi(state.randomSeed ^ 0xa11ce);
  playerPerception.reset();
  audio.unlock();
  started = true;
  paused = false;
  accumulator = 0;
  gameShell?.classList.add("game-active");
  view.requestPointerLock();
}

function restart(): void {
  startMode(currentMode);
}

function returnToMainMenu(): void {
  started = false;
  paused = true;
  accumulator = 0;
  input.reset();
  tacticalMap?.close();
  developerPanel?.close();
  view.releasePointerLock();
  view.setAiming(false);
  gameShell?.classList.remove("game-active", "aiming");
  const equipment = battleLoadout(profile);
  state = createInitialState(
    undefined,
    "battle",
    equipment.mainGunId,
    equipment,
    equipment.torpedoId,
    equipment.shipClassId,
  );
  playerPerception.reset();
  view.resetTransient();
  hud.resetMetrics();
  menus?.showStart();
}

function applyQuality(quality: "low" | "medium"): void {
  view.setQuality(quality);
  hud.setQuality(quality);
  menus?.setQuality(quality);
}

function toggleQuality(): void {
  applyQuality(view.getQuality() === "low" ? "medium" : "low");
}

const hud = new Hud(root, restart, toggleQuality, returnToMainMenu);
view = new GameView(hud.canvas);
input = new PlayerInput(hud.canvas, view);
const settings = loadGameSettings();

function applyControlSettings(next: GameSettings): void {
  input.setSteeringSensitivity(next.steeringSensitivity);
  view.setAimSensitivity(next.aimSensitivity);
  audio.configure(next.masterVolume, next.muted);
  tacticalMap?.setLocale(next.locale);
  saveGameSettings(next);
}

applyControlSettings(settings);
const gameShell = root.querySelector<HTMLElement>(".game-shell");
if (!gameShell) throw new Error("Missing game shell");
tacticalMap = new TacticalMap(gameShell, {
  locale: settings.locale,
  onOpen: () => {
    input.setSuppressed(true);
    view.releasePointerLock();
    gameShell.classList.add("map-active");
  },
  onClose: () => {
    gameShell.classList.remove("map-active");
    input.setSuppressed(false);
    if (!started || paused || state.status !== "running"
      || menus?.isOpen() || developerPanel?.isOpen()) return;
    gameShell.classList.add("game-active");
    view.requestPointerLock();
  },
});
hud.setWeaponSelectHandler((slot) => {
  input.selectWeapon(slot);
  if (slot !== "aircraft" || !started || paused || state.status !== "running"
    || menus?.isOpen() || developerPanel?.isOpen()) return;
  tacticalMap.open();
});
menus = new GameMenus(gameShell, settings, profile, view.getQuality(), {
  onStart: startMode,
  onPause: () => {
    view.releasePointerLock();
    gameShell.classList.remove("game-active");
    paused = true;
    accumulator = 0;
  },
  onResume: () => {
    audio.unlock();
    gameShell.classList.add("game-active");
    view.requestPointerLock();
    paused = false;
    accumulator = 0;
  },
  onRestart: restart,
  onExitToMenu: returnToMainMenu,
  onSettingsChange: applyControlSettings,
  onQualityChange: applyQuality,
  onProfileChange: (nextProfile) => {
    profile = nextProfile;
    saveLocalProfile(profile);
  },
});
developerPanel = new DeveloperPanel(gameShell, () => state, {
  onOpen: () => {
    paused = true;
    accumulator = 0;
    gameShell.classList.remove("game-active");
    view.releasePointerLock();
  },
  onClose: () => {
    if (!started || state.status !== "running" || menus.isOpen()) return;
    paused = false;
    accumulator = 0;
    gameShell.classList.add("game-active");
    view.requestPointerLock();
  },
  onDebugColliders: (visible) => view.setDebugColliders(visible),
  onCursorStyle: (style) => hud.setCursorStyle(style),
});

window.addEventListener("keydown", (event) => {
  if (!started || state.status !== "running") return;
  if (event.code === "Digit3" && !event.repeat) {
    if (menus.isOpen() || developerPanel?.isOpen()) return;
    event.preventDefault();
    input.selectWeapon("aircraft");
    tacticalMap.open();
    return;
  }
  if (event.code === "KeyM") {
    if (menus.isOpen() || developerPanel?.isOpen()) return;
    event.preventDefault();
    tacticalMap.toggle();
    return;
  }
  if (tacticalMap.isExpanded()) {
    if (tacticalMap.handleKeyDown(event)) return;
    if (event.code === "Escape") {
      event.preventDefault();
      tacticalMap.close();
      return;
    }
    if (event.code === "F3") return;
  }
  if (event.code === "F3") {
    event.preventDefault();
    developerPanel?.toggle();
    return;
  }
  if (event.code === "Escape") {
    event.preventDefault();
    if (developerPanel?.isOpen()) developerPanel.close();
    else if (input.exitAiming()) return;
    else menus.handleEscape();
  }
});

view.engine.runRenderLoop(() => {
  const frameSeconds = Math.min(view.engine.getDeltaTime() / 1_000, 0.1);
  let perceivedTarget = started && state.mode === "battle"
    ? playerPerception.update(observe(state, "player"))
    : undefined;
  if (started && !paused && state.status === "running") {
    accumulator += frameSeconds;
    while (accumulator >= FIXED_STEP) {
      const player = state.ships.find((ship) => ship.id === "player");
      if (!player) break;
      const commands = new Map<string, ControlCommand>();
      const playerCommand = input.command(player);
      const airMissions = tacticalMap.consumeAirMissions();
      if (airMissions.length > 0) playerCommand.airMissions = airMissions;
      commands.set("player", playerCommand);
      if (state.mode === "battle" && state.ships.some((ship) => ship.id === "enemy")) {
        commands.set("enemy", ai.command(observe(state, "enemy")));
      }
      stepSimulation(state, commands, FIXED_STEP);
      tacticalMap.handleAirEvents(state.airEvents);
      perceivedTarget = state.mode === "battle"
        ? playerPerception.update(observe(state, "player"))
        : undefined;
      const visibleShots = state.shots.filter((shot) =>
        shot.team === "player" || Boolean(perceivedTarget?.live));
      view.consumeShots(visibleShots);
      view.consumeImpacts(state.impacts);
      audio.consumeShots(visibleShots);
      audio.consumeImpacts(state.impacts);
      hud.consumeImpacts(state.impacts);
      accumulator -= FIXED_STEP;
    }
  } else {
    accumulator = 0;
  }

  const playerForAudio = state.ships.find((ship) => ship.id === "player");
  audio.sync(
    playerForAudio,
    started && !paused && state.status === "running",
  );

  view.sync(
    state,
    frameSeconds,
    perceivedTarget,
    input.selectedWeapon,
    input.selectedTorpedoSpread,
  );
  if (state.status !== "running") {
    tacticalMap.close();
    if (currentMode === "battle" && !battleRewarded) {
      const economy = awardBattleResult(profile, state.status);
      profile = economy.profile;
      saveLocalProfile(profile);
      menus.setProfile(profile);
      battleRewarded = true;
    }
    gameShell.classList.remove("game-active");
    view.releasePointerLock();
  }
  hud.setAimMode(input.isAiming);
  hud.update(state, input.aimRange, input.selectedWeapon, perceivedTarget);
  tacticalMap.update(state, perceivedTarget);
  developerPanel?.update();
  view.render();
});
