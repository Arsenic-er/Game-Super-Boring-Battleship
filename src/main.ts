import "./style.css";
import "./pixel.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { RuleBasedAi } from "./controllers/ruleBasedAi";
import { PlayerInput } from "./controllers/playerInput";
import {
  activeControlledShipId,
  controlDeveloperShip,
  normalDeveloperView,
  observeDeveloperEntity,
  reconcileDeveloperView,
  type DeveloperViewSession,
} from "./controllers/developerView";
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
import { auxiliaryHudVisible } from "./ui/auxiliaryHud";
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
let shipAiById = new Map<string, RuleBasedAi>();
let developerView: DeveloperViewSession = normalDeveloperView();
const actorSeed = (id: string): number => {
  let seed = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    seed ^= id.charCodeAt(index);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
};
const playerPerception = new PlayerPerceptionTracker();
const audio = new CombatAudio();
let started = false;
let paused = true;
let accumulator = 0;
let currentMode: GameMode = "battle";
let battleRewarded = false;

function startMode(mode: GameMode): void {
  gameShell?.classList.remove("hud-details-held");
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
  shipAiById = new Map();
  developerView = normalDeveloperView();
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
  gameShell?.classList.remove("hud-details-held");
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
  developerView = normalDeveloperView();
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
const developerObserverHud = document.createElement("aside");
developerObserverHud.className = "developer-observer-hud";
developerObserverHud.hidden = true;
gameShell.append(developerObserverHud);
tacticalMap = new TacticalMap(gameShell, {
  locale: settings.locale,
  onOpen: () => {
    gameShell.classList.remove("hud-details-held");
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
    gameShell.classList.remove("hud-details-held");
    view.releasePointerLock();
    gameShell.classList.remove("game-active");
    paused = true;
    accumulator = 0;
  },
  onResume: () => {
    gameShell.classList.remove("hud-details-held");
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
    gameShell.classList.remove("hud-details-held");
    paused = true;
    accumulator = 0;
    gameShell.classList.remove("game-active");
    input.setSuppressed(true);
    view.setCameraInputEnabled(false);
    view.releasePointerLock();
  },
  onClose: () => {
    input.setSuppressed(false);
    view.setCameraInputEnabled(true);
    if (!started || state.status !== "running" || menus.isOpen()) return;
    paused = false;
    accumulator = 0;
    gameShell.classList.add("game-active");
    view.requestPointerLock();
  },
  onDebugColliders: (visible) => view.setDebugColliders(visible),
  onCursorStyle: (style) => hud.setCursorStyle(style),
  onObserveEntity: (id) => {
    const next = observeDeveloperEntity(state, id);
    if (!next) return;
    developerView = next;
    input.reset();
    playerPerception.reset();
    view.setAiming(false);
  },
  onControlShip: (id) => {
    const next = controlDeveloperShip(state, id);
    if (!next) return;
    developerView = next;
    input.reset();
    playerPerception.reset();
    view.setAiming(false);
  },
  onReleaseControl: () => {
    developerView = normalDeveloperView();
    input.reset();
    playerPerception.reset();
    view.setAiming(false);
  },
  getViewStatus: () => ({
    active: developerView.active,
    focusEntityId: developerView.focus?.id,
    controlledShipId: developerView.active ? developerView.controlledShipId : "player",
  }),
});

window.addEventListener("keydown", (event) => {
  if (!started || state.status !== "running") return;
  if (event.code === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const visible = auxiliaryHudVisible(true, {
      started,
      paused,
      running: state.status === "running",
      mapOpen: tacticalMap.isExpanded(),
      menuOpen: menus.isOpen(),
      developerOpen: Boolean(developerPanel?.isOpen()),
    });
    if (visible) {
      event.preventDefault();
      gameShell.classList.add("hud-details-held");
    } else {
      gameShell.classList.remove("hud-details-held");
    }
    return;
  }
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
    if (event.code === "Escape") {
      event.preventDefault();
      tacticalMap.close();
      return;
    }
    if (tacticalMap.handleKeyDown(event)) return;
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

window.addEventListener("keyup", (event) => {
  if (event.code !== "Tab") return;
  const held = gameShell.classList.contains("hud-details-held");
  gameShell.classList.remove("hud-details-held");
  if (held) event.preventDefault();
});
window.addEventListener("blur", () => gameShell.classList.remove("hud-details-held"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) gameShell.classList.remove("hud-details-held");
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== hud.canvas) gameShell.classList.remove("hud-details-held");
});

view.engine.runRenderLoop(() => {
  const reconciledView = reconcileDeveloperView(state, developerView);
  if (reconciledView !== developerView) {
    developerView = reconciledView;
    input.reset();
    playerPerception.reset();
  }
  const controlledShipId = activeControlledShipId(developerView);
  const focusedAir = developerView.focus?.kind === "airSquadron"
    ? state.airSquadrons.find(({ id }) => id === developerView.focus?.id)
    : undefined;
  const observerShipId = controlledShipId
    ?? (developerView.focus?.kind === "ship" ? developerView.focus.id : focusedAir?.controllerId)
    ?? "player";
  const frameSeconds = Math.min(view.engine.getDeltaTime() / 1_000, 0.1);
  let perceivedTarget = started && state.mode === "battle"
    ? playerPerception.update(observe(state, observerShipId))
    : undefined;
  if (started && !paused && state.status === "running") {
    accumulator += frameSeconds;
    while (accumulator >= FIXED_STEP) {
      const commands = new Map<string, ControlCommand>();
      const controlledShip = state.ships.find(({ id, hull }) => id === controlledShipId && hull > 0);
      if (controlledShip) {
        const playerCommand = input.command(controlledShip);
        const airMissions = controlledShip.id === "player" ? tacticalMap.consumeAirMissions() : [];
        if (airMissions.length > 0) playerCommand.airMissions = airMissions;
        commands.set(controlledShip.id, playerCommand);
      }
      const aiShips = state.ships.filter((ship) =>
        ship.hull > 0
        && !ship.isTestTarget
        && ship.id !== controlledShipId
        && (developerView.active || ship.id === "enemy" || ship.aiControlled));
      const activeAiIds = new Set(aiShips.map(({ id }) => id));
      for (const id of shipAiById.keys()) {
        if (!activeAiIds.has(id)) shipAiById.delete(id);
      }
      for (const aiShip of aiShips) {
        let controller = shipAiById.get(aiShip.id);
        if (!controller) {
          controller = new RuleBasedAi(state.randomSeed ^ actorSeed(aiShip.id));
          shipAiById.set(aiShip.id, controller);
        }
        commands.set(aiShip.id, controller.command(observe(state, aiShip.id)));
      }
      stepSimulation(state, commands, FIXED_STEP);
      tacticalMap.handleAirEvents(state.airEvents);
      perceivedTarget = state.mode === "battle"
        ? playerPerception.update(observe(state, observerShipId))
        : undefined;
      const visibleShots = state.shots.filter((shot) =>
        developerView.active || shot.team === "player" || Boolean(perceivedTarget?.live));
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

  const playerForAudio = state.ships.find((ship) => ship.id === observerShipId);
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
    developerView.active ? {
      focusEntityId: developerView.focus?.id,
      controlledShipId: developerView.controlledShipId,
      omniscient: true,
    } : undefined,
  );
  if (state.status !== "running") {
    gameShell.classList.remove("hud-details-held");
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
  hud.update(state, input.aimRange, input.selectedWeapon, perceivedTarget, observerShipId);
  tacticalMap.update(state, perceivedTarget);
  developerObserverHud.hidden = !developerView.active;
  if (developerView.active) {
    const focusShip = state.ships.find(({ id }) => id === developerView.focus?.id);
    const focusSquadron = state.airSquadrons.find(({ id }) => id === developerView.focus?.id);
    if (focusShip) {
      const decision = focusShip.aiDecision;
      developerObserverHud.textContent = `开发者视角 · ${developerView.controlledShipId === focusShip.id ? "人工接管" : "AI 观察"} ${focusShip.id} · ${decision ? `${decision.role}/${decision.phase} · 目标 ${decision.targetId ?? "无"} · 航向 ${((decision.desiredHeading * 180 / Math.PI + 360) % 360).toFixed(0)}° · 车钟 ${Math.round(decision.throttle * 100)}%${decision.avoidanceReason ? ` · ${decision.avoidanceReason}` : ""}` : "等待策略遥测"} · F3 切换实体`;
    } else if (focusSquadron) {
      developerObserverHud.textContent = `开发者视角 · 航空 AI ${focusSquadron.id} · ${focusSquadron.role}/${focusSquadron.phase} · 指令 ${focusSquadron.order?.kind ?? "自主"} · 目标 ${focusSquadron.order?.activeTargetId ?? focusSquadron.order?.targetId ?? "无"} · 编队 ${focusSquadron.aircraftOperational}/${focusSquadron.aircraftCapacity} · F3 切换实体`;
    }
  }
  developerPanel?.update();
  view.render();
});
