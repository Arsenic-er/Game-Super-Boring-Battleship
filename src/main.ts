import "./style.css";
import "./pixel.css";
import "./voyage.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
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
  battleLoadout,
  loadLocalProfileWithStatus,
} from "./profile/localProfile";
import type { LocalProfile } from "./profile/localProfile";
import { VoyageSession } from "./app/voyageSession";
import { VoyagePanel, type VoyageResultView } from "./ui/voyagePanel";
import { shouldOfferOnboarding } from "./progression/onboarding";
import { loadGameSettings, saveGameSettings } from "./settings/gameSettings";
import type { GameSettings } from "./settings/gameSettings";
import { LocalBattleSession } from "./session/localBattleSession";
import { FIXED_STEP } from "./sim/config";
import { createInitialState, observe } from "./sim/simulation";
import { deployFleetAirSupport } from "./sim/airOperations";
import { PlayerPerceptionTracker } from "./sim/playerPerception";
import { seaTrialsContacts } from "./sim/seaTrialsContacts";
import type { BattleState, ControlCommand, GameMode, PlayerTargetView } from "./sim/types";
import type { GameLaunchRequest } from "./sim/battleSetup";
import { createLanBridgeClient } from "./net/lanBridge";
import { LanMultiplayerRuntime } from "./net/lanMultiplayerRuntime";
import { GameMenus } from "./ui/gameMenus";
import { Hud } from "./ui/hud";
import { auxiliaryHudVisible } from "./ui/auxiliaryHud";
import { TacticalMap } from "./ui/tacticalMap";
import { DeveloperPanel } from "./ui/developerPanel";
import { translateGameText } from "./i18n/gameLocale";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root");

const loadedProfile = loadLocalProfileWithStatus();
let profile: LocalProfile = loadedProfile.profile;
const voyageSession = new VoyageSession(profile);
let voyagePanel: VoyagePanel;
let resultPresented = false;
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
const session = new LocalBattleSession(state);
let developerView: DeveloperViewSession = normalDeveloperView();
const playerPerception = new PlayerPerceptionTracker();
const audio = new CombatAudio();
const lanBridge = createLanBridgeClient();
let started = false;
let paused = true;
let accumulator = 0;
let currentMode: GameMode = "battle";
let currentLaunchRequest: GameLaunchRequest = {
  mode: "battle",
  buildId: profile.selectedBattleBuildId ?? profile.savedShipBuilds[0]?.id ?? "",
  teamSize: 5,
  weatherId: "clear",
};
const CLIENT_INPUT_INTERVAL_MS = 1_000 / 30;
let lastClientInputSentAt = -Infinity;
let lanRuntime: LanMultiplayerRuntime;
const consumedClientEvents = new Set<string>();

const localizedMultiplayerNotice = (source: string): string =>
  translateGameText(source, settings.locale);

function enterActiveBattle(nextState: BattleState, scope = `lan:${crypto.randomUUID()}`): void {
  gameShell?.classList.remove("hud-details-held");
  state = nextState;
  input.reset();
  input.setSuppressed(false);
  view.setCameraInputEnabled(true);
  view.resetTransient();
  view.beginVisualSession(scope, nextState.ships);
  voyagePanel?.clearBattle();
  resultPresented = false;
  tacticalMap?.close();
  tacticalMap?.resetForBattle();
  developerPanel?.close();
  menus?.closeAll();
  input.setSuppressed(false);
  view.setCameraInputEnabled(true);
  hud.resetMetrics();
  hud.setResultReturnLabel(localizedMultiplayerNotice(
    lanRuntime?.role !== "none" ? "返回联机大厅" : "返回主菜单",
  ));
  developerView = normalDeveloperView();
  playerPerception.reset();
  audio.unlock();
  started = true;
  paused = false;
  accumulator = 0;
  lastClientInputSentAt = -Infinity;
  gameShell?.classList.add("game-active");
  view.requestPointerLock();
}

function syncVoyageProfile(): void {
  profile = voyageSession.profile;
  menus?.setProfile(profile);
  lanRuntime?.setProfile(profile);
  voyagePanel?.setPending(voyageSession.progression.profileLocked);
  if (voyageSession.tutorialSaveFailure?.ok === false) {
    voyagePanel?.showNotice("saveFailed");
    voyageSession.tutorialSaveFailure = undefined;
  }
}

function startMode(request: GameLaunchRequest, tutorial = false): boolean {
  const launch = voyageSession.launch(request, tutorial);
  syncVoyageProfile();
  if (!launch.ok) { voyagePanel.showNotice(launch.reason); return false; }
  const mode = request.mode;
  currentMode = mode;
  currentLaunchRequest = request;
  const equipment = launch.equipment;
  state = createInitialState(
    undefined,
    mode,
    equipment.mainGunId,
    equipment,
    equipment.torpedoId,
    equipment.shipClassId,
    request.mode === "battle"
      ? { teamSize: request.teamSize, weatherId: request.weatherId }
      : { weatherId: "clear" },
  );
  if (state.airSupport === "fleet-edge") deployFleetAirSupport(state);
  session.reset(state);
  enterActiveBattle(state, launch.visualScope);
  return true;
}

function requestSolo(): void {
  const saved = voyageSession.progression.prepareRewardBattle();
  syncVoyageProfile();
  if (!saved.ok) { voyagePanel.showNotice("profileLocked"); return; }
  if (!shouldOfferOnboarding(profile.onboarding)) { menus.showBattleSetup(); return; }
  voyagePanel.showBriefing(() => {
    const request = voyageSession.tutorialRequest();
    if (!request) { voyagePanel.showNotice("buildUnavailable"); menus.showBattleSetup(); return; }
    startMode(request, true);
  }, () => { voyageSession.skipTutorial(); syncVoyageProfile(); menus.showBattleSetup(); });
}

function presentVoyageResult(): void {
  const completion = voyageSession.result;
  if (!completion) return;
  const report: VoyageResultView = { status: completion.result.status,
    reason: completion.result.endReason === "score" ? "目标积分达到胜利门槛" : completion.result.endReason === "time" ? "战斗时间结束" : "一方舰队被击沉",
    ...completion.result.performance, reward: completion.settlement?.reward,
    balances: completion.settlement?.balancesAfter,
    saveState: !completion.eligible ? "ineligible" : completion.saveResult?.ok ? "saved" : "pending" };
  voyagePanel.showResult(report);
}

function restart(): void {
  if (lanRuntime?.role !== "none") {
    if (state.status !== "running") void lanRuntime.callbacks.returnToLobby?.();
    else returnToMainMenu();
    return;
  }
  const tutorial = voyageSession.hasQueuedReplay && currentLaunchRequest.mode === "battle";
  const request = tutorial ? voyageSession.tutorialRequest() : currentLaunchRequest;
  if (!request || !startMode(request, tutorial)) returnToMainMenu();
}

function returnToMainMenu(leaveRoom = true): void {
  if (leaveRoom && lanRuntime?.role !== "none") void lanRuntime.callbacks.leaveRoom();
  gameShell?.classList.remove("hud-details-held");
  started = false;
  paused = true;
  accumulator = 0;
  lastClientInputSentAt = -Infinity;
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
  session.reset(state);
  developerView = normalDeveloperView();
  playerPerception.reset();
  view.resetTransient();
  voyageSession.leave();
  voyagePanel?.clearBattle();
  voyagePanel?.setPending(voyageSession.progression.profileLocked);
  resultPresented = false;
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

function exitBattleResult(): void {
  if (lanRuntime?.role !== "none" && state.status !== "running") {
    void lanRuntime.callbacks.returnToLobby?.();
    return;
  }
  returnToMainMenu();
}

const hud = new Hud(root, restart, toggleQuality, exitBattleResult);
view = new GameView(hud.canvas);
input = new PlayerInput(hud.canvas, view);
const settings = loadGameSettings();

function applyControlSettings(next: GameSettings): void {
  Object.assign(settings, next);
  input.setSteeringSensitivity(next.steeringSensitivity);
  view.setAimSensitivity(next.aimSensitivity);
  view.setPointerLockHint(translateGameText("点击返回游戏并锁定鼠标", next.locale));
  audio.configure(next.masterVolume, next.muted, next.uiSoundStyle);
  tacticalMap?.setLocale(next.locale);
  voyagePanel?.setLocale(next.locale);
  saveGameSettings(next);
}

applyControlSettings(settings);
const gameShell = root.querySelector<HTMLElement>(".game-shell");
if (!gameShell) throw new Error("Missing game shell");
voyagePanel = new VoyagePanel(gameShell, settings.locale, {
  skip: () => { voyageSession.skipTutorial(); syncVoyageProfile(); },
  retry: () => {
    const saved = voyageSession.retry(); syncVoyageProfile();
    if (voyageSession.result) presentVoyageResult();
    if (!saved.ok) voyagePanel.showNotice("saveFailed");
  },
  again: restart,
  dock: () => {
    const target = voyageSession.getDockTarget();
    returnToMainMenu(); menus.showDock(target?.shipClassId, target?.savedBuildId); voyageSession.clearDockTarget();
  },
  menu: returnToMainMenu,
});
gameShell.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button");
  if (!button || !gameShell.contains(button) || button.disabled) return;
  audio.unlock();
  audio.playUiCue();
});
const developerObserverHud = document.createElement("aside");
developerObserverHud.className = "developer-observer-hud";
developerObserverHud.hidden = true;
gameShell.append(developerObserverHud);
tacticalMap = new TacticalMap(gameShell, {
  locale: settings.locale,
  onOpen: () => {
    gameShell?.classList.remove("hud-details-held");
    input.setSuppressed(true);
    view.releasePointerLock();
    gameShell.classList.add("map-active");
    if (voyageSession.advance({ mapOpened: true })) syncVoyageProfile();
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
lanRuntime = new LanMultiplayerRuntime(lanBridge, profile, {
  onHostMatchStarted: (hostSession) => {
    consumedClientEvents.clear();
    currentMode = "battle";
    voyageSession.leave();
    enterActiveBattle(hostSession.state);
  },
  onClientMatchStarted: (clientSession) => {
    consumedClientEvents.clear();
    currentMode = "battle";
    voyageSession.leave();
    enterActiveBattle(clientSession.renderState(performance.now()).state);
  },
  onReturnToMenu: (notice) => {
    hud.showMultiplayerNotice(localizedMultiplayerNotice(notice));
    returnToMainMenu();
    menus?.showMultiplayerDirectory();
  },
  onGuidance: (reason) => menus?.setLanGuidance(reason),
  onNotice: (notice) => {
    hud.showMultiplayerNotice(localizedMultiplayerNotice(notice));
  },
  onLobbyUpdated: (snapshot, localPeerId) => menus?.setMultiplayerLobby(snapshot, localPeerId),
  onLobbyReturned: (snapshot, localPeerId) => {
    returnToMainMenu(false);
    menus?.showMultiplayerLobby(snapshot, localPeerId);
  },
});
menus = new GameMenus(gameShell, settings, profile, view.getQuality(), {
  onStart: startMode,
  onRequestSolo: requestSolo,
  isProfileLocked: () => voyageSession.progression.profileLocked,
  onReplayTutorial: (fromBattle) => {
    const saved = voyageSession.queueTutorialReplay(); syncVoyageProfile();
    if (!saved.ok) { voyagePanel.showNotice(saved.error === "pending-settlement" ? "profileLocked" : "saveFailed"); return; }
    if (fromBattle) voyagePanel.showNotice("replayQueued");
    else { menus.showStart(); requestSolo(); }
  },
  onPause: () => {
    gameShell?.classList.remove("hud-details-held");
    view.releasePointerLock();
    gameShell?.classList.remove("game-active");
    if (lanRuntime.role !== "none") {
      input.setSuppressed(true);
      view.setCameraInputEnabled(false);
      return;
    }
    paused = true;
    accumulator = 0;
  },
  onResume: () => {
    gameShell?.classList.remove("hud-details-held");
    audio.unlock();
    gameShell.classList.add("game-active");
    input.setSuppressed(false);
    view.setCameraInputEnabled(true);
    view.requestPointerLock();
    if (lanRuntime.role !== "none") return;
    paused = false;
    accumulator = 0;
  },
  onRestart: () => {
    if (lanRuntime.role !== "none") {
      if (state.status !== "running") void lanRuntime.callbacks.returnToLobby?.();
      else returnToMainMenu();
      return;
    }
    restart();
  },
  onExitToMenu: returnToMainMenu,
  onSettingsChange: applyControlSettings,
  onQualityChange: applyQuality,
  onProfileChange: (nextProfile) => {
    const result = voyageSession.progression.updateProfile(nextProfile);
    syncVoyageProfile();
    if (!result.ok) voyagePanel.showNotice(result.error === "pending-settlement" ? "profileLocked" : "saveFailed");
    return result.ok;
  },
  multiplayer: lanRuntime.callbacks,
});
if (loadedProfile.migrationSaveResult?.ok === false) voyagePanel.showNotice("saveFailed");
developerPanel = new DeveloperPanel(gameShell, () => state, {
  onMutation: () => voyageSession.invalidateRewards(),
  onOpen: () => {
    gameShell?.classList.remove("hud-details-held");
    paused = true;
    accumulator = 0;
    gameShell?.classList.remove("game-active");
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
    voyageSession.invalidateRewards();
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
  if (voyagePanel.isBriefingOpen()) {
    if (event.code === "Escape") { event.preventDefault(); voyagePanel.hideBriefing(); }
    return;
  }
  if (!started && event.code === "Escape") { if (menus.isSettingsOpen()) { event.preventDefault(); menus.handleEscape(); } return; }
  if (!started || state.status !== "running") return;
  if (event.code === "F1" && voyageSession.tutorialActive && !menus.isOpen()) {
    event.preventDefault(); voyageSession.skipTutorial(); syncVoyageProfile(); return;
  }
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
      gameShell?.classList.remove("hud-details-held");
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
    if (lanRuntime.role !== "none") {
      hud.showMultiplayerNotice(localizedMultiplayerNotice("多人联机已禁用开发者改动。"));
      return;
    }
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
  gameShell?.classList.remove("hud-details-held");
  if (held) event.preventDefault();
});
window.addEventListener("blur", () => gameShell.classList.remove("hud-details-held"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) gameShell?.classList.remove("hud-details-held");
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== hud.canvas) gameShell?.classList.remove("hud-details-held");
});

function idleCommandFor(ship: BattleState["ships"][number]): ControlCommand {
  return {
    throttle: 0,
    rudder: 0,
    aimPoint: { ...ship.aimPoint },
    fire: false,
  };
}

function observerShipIdForState(activeState: BattleState): string {
  return activeState.ships.find(({ id, hull }) => id === "player" && hull > 0)?.id
    ?? activeState.ships.find(({ team, hull }) => team === "player" && hull > 0)?.id
    ?? activeState.ships.find(({ team }) => team === "player")?.id
    ?? activeState.ships[0]?.id
    ?? "player";
}

function primaryContact(contacts: readonly PlayerTargetView[]): PlayerTargetView | undefined {
  return contacts.find(({ live }) => live) ?? contacts[0];
}

function finishFrame(
  activeState: BattleState,
  frameSeconds: number,
  observerShipId: string,
  perceivedTarget?: PlayerTargetView,
  contactViews: readonly PlayerTargetView[] = perceivedTarget ? [perceivedTarget] : [],
): void {
  const multiplayerActive = lanRuntime.role !== "none";
  const playerForAudio = activeState.ships.find((ship) => ship.id === observerShipId);
  audio.sync(
    playerForAudio,
    started && activeState.status === "running" && (multiplayerActive || !paused),
  );

  view.sync(
    activeState,
    frameSeconds,
    perceivedTarget,
    input.selectedWeapon,
    input.selectedTorpedoSpread,
    multiplayerActive ? undefined : developerView.active ? {
      focusEntityId: developerView.focus?.id,
      controlledShipId: developerView.controlledShipId,
      omniscient: true,
    } : undefined,
    contactViews,
    lanRuntime.role === "client",
  );
  if (activeState.status !== "running") {
    gameShell?.classList.remove("hud-details-held");
    tacticalMap.close();
    if (!multiplayerActive && started && currentMode === "battle" && !resultPresented) {
      if (voyageSession.finish(activeState)) {
        syncVoyageProfile(); presentVoyageResult();
        input.setSuppressed(true); view.setCameraInputEnabled(false);
      }
      resultPresented = true;
    }
    gameShell?.classList.remove("game-active");
    view.releasePointerLock();
  }
  hud.setAimMode(input.isAiming);
  hud.update(activeState, input.aimRange, input.selectedWeapon, perceivedTarget, observerShipId);
  voyagePanel.setTutorial(voyageSession.tutorialActive ? profile.onboarding.currentStepId ?? "move" : null,
    started && !paused && activeState.status === "running" && !multiplayerActive && !menus.isOpen() && !tacticalMap.isExpanded() && !developerPanel?.isOpen());
  // Training targets need chart markers even though sea trials do not run combat sensors.
  const mapContacts = activeState.mode === "sea-trials"
    ? seaTrialsContacts(activeState, observerShipId)
    : contactViews;
  tacticalMap.update(activeState, perceivedTarget, mapContacts);
  developerObserverHud.hidden = multiplayerActive || !developerView.active;
  if (!multiplayerActive && developerView.active) {
    const focusShip = activeState.ships.find(({ id }) => id === developerView.focus?.id);
    const focusSquadron = activeState.airSquadrons.find(({ id }) => id === developerView.focus?.id);
    if (focusShip) {
      const decision = focusShip.aiDecision;
      developerObserverHud.textContent = `开发者视角 · ${developerView.controlledShipId === focusShip.id ? "人工接管" : "AI 观察"} ${focusShip.id} · ${decision ? `${decision.role}/${decision.phase} · 目标 ${decision.targetId ?? "无"} · 航向 ${((decision.desiredHeading * 180 / Math.PI + 360) % 360).toFixed(0)}° · 车钟 ${Math.round(decision.throttle * 100)}%${decision.avoidanceReason ? ` · ${decision.avoidanceReason}` : ""}` : "等待策略遥测"} · F3 切换实体`;
    } else if (focusSquadron) {
      developerObserverHud.textContent = `开发者视角 · 航空 AI ${focusSquadron.id} · ${focusSquadron.role}/${focusSquadron.phase} · 指令 ${focusSquadron.order?.kind ?? "自主"} · 目标 ${focusSquadron.order?.activeTargetId ?? focusSquadron.order?.targetId ?? "无"} · 编队 ${focusSquadron.aircraftOperational}/${focusSquadron.aircraftCapacity} · F3 切换实体`;
    }
  }
  developerPanel?.update();
  view.render();
}

function renderHostFrame(frameSeconds: number): void {
  const hostSession = lanRuntime.hostSession;
  if (!hostSession) return;
  state = hostSession.state;
  const hostShipId = hostSession.assignments.get(lanRuntime.localPeerId);
  const observerShipId = hostShipId ?? observerShipIdForState(state);
  let perceivedTarget = started && state.mode === "battle"
    ? playerPerception.update(observe(state, observerShipId))
    : undefined;

  if (started && state.status === "running") {
    accumulator += frameSeconds;
    while (accumulator >= FIXED_STEP) {
      const controlledShip = hostShipId
        ? state.ships.find(({ id, hull }) => id === hostShipId && hull > 0)
        : undefined;
      const playerCommand = controlledShip ? input.command(controlledShip) : idleCommandFor(state.ships[0]!);
      const airMissions = controlledShip ? tacticalMap.consumeAirMissions() : [];
      if (airMissions.length > 0) playerCommand.airMissions = airMissions;
      const stepOutput = hostSession.step(playerCommand, FIXED_STEP);
      tacticalMap.handleAirEvents(stepOutput.airEvents);
      perceivedTarget = state.mode === "battle"
        ? playerPerception.update(observe(state, observerShipId))
        : undefined;
      const visibleShots = stepOutput.shots.filter((shot) =>
        shot.team === "player" || Boolean(perceivedTarget?.live));
      view.consumeShots(visibleShots);
      view.consumeImpacts(stepOutput.impacts);
      audio.consumeShots(visibleShots);
      audio.consumeImpacts(stepOutput.impacts);
      hud.consumeImpacts(stepOutput.impacts);
      void lanRuntime.publishHostStep(stepOutput);
      accumulator -= FIXED_STEP;
    }
  } else {
    accumulator = 0;
  }

  finishFrame(state, frameSeconds, observerShipId, perceivedTarget);
}

function renderClientFrame(frameSeconds: number): void {
  const clientSession = lanRuntime.clientSession;
  if (!clientSession) return;
  const now = performance.now();
  const replicated = clientSession.renderState(now);
  state = replicated.state;
  const observerShipId = replicated.controlledShipId ?? observerShipIdForState(state);
  const contacts = replicated.contacts;
  const perceivedTarget = primaryContact(contacts);
  const newShots = state.shots.filter((event) => !consumedClientEvents.has(`shot:${event.id}`));
  const newImpacts = state.impacts.filter((event) => !consumedClientEvents.has(`impact:${event.id}`));
  const newAirEvents = state.airEvents.filter((event) => !consumedClientEvents.has(`air:${event.id}`));
  for (const event of newShots) consumedClientEvents.add(`shot:${event.id}`);
  for (const event of newImpacts) consumedClientEvents.add(`impact:${event.id}`);
  for (const event of newAirEvents) consumedClientEvents.add(`air:${event.id}`);
  view.consumeShots(newShots);
  view.consumeImpacts(newImpacts);
  audio.consumeShots(newShots);
  audio.consumeImpacts(newImpacts);
  hud.consumeImpacts(newImpacts);
  tacticalMap.handleAirEvents(newAirEvents);

  if (started && state.status === "running" && now - lastClientInputSentAt >= CLIENT_INPUT_INTERVAL_MS) {
    const controlledShip = state.ships.find(({ id, hull }) => id === observerShipId && hull > 0);
    if (controlledShip) {
      const playerCommand = input.command(controlledShip);
      const airMissions = tacticalMap.consumeAirMissions();
      if (airMissions.length > 0) playerCommand.airMissions = airMissions;
      try {
        const frame = clientSession.submitLocalCommand(playerCommand, now);
        lastClientInputSentAt = now;
        void lanRuntime.send(lanRuntime.createEnvelope("input-frame", frame.payload));
      } catch {
        // Ignore locally invalid or non-monotonic samples until the next frame.
      }
    }
  }

  finishFrame(state, frameSeconds, observerShipId, perceivedTarget, contacts);
}

view.engine.runRenderLoop(() => {
  const frameSeconds = Math.min(view.engine.getDeltaTime() / 1_000, 0.1);

  if (lanRuntime.role === "host") {
    renderHostFrame(frameSeconds);
    return;
  }
  if (lanRuntime.role === "client") {
    renderClientFrame(frameSeconds);
    return;
  }

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
  const liveControlledShipId = state.ships.some(({ id, hull }) =>
    id === controlledShipId && hull > 0) ? controlledShipId : undefined;
  const fallbackObserverShipId = observerShipIdForState(state);
  const observerShipId = liveControlledShipId
    ?? (developerView.focus?.kind === "ship" ? developerView.focus.id : focusedAir?.controllerId)
    ?? fallbackObserverShipId;
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
      const stepOutput = session.step(commands, FIXED_STEP, {
        includeDeveloperAi: developerView.active,
      });
      if (voyageSession.observe(stepOutput, input.isAiming)) syncVoyageProfile();
      tacticalMap.handleAirEvents(stepOutput.airEvents);
      perceivedTarget = state.mode === "battle"
        ? playerPerception.update(observe(state, observerShipId))
        : undefined;
      const visibleShots = stepOutput.shots.filter((shot) =>
        developerView.active || shot.team === "player" || Boolean(perceivedTarget?.live));
      view.consumeShots(visibleShots);
      view.consumeImpacts(stepOutput.impacts);
      audio.consumeShots(visibleShots);
      audio.consumeImpacts(stepOutput.impacts);
      hud.consumeImpacts(stepOutput.impacts);
      accumulator -= FIXED_STEP;
    }
  } else {
    accumulator = 0;
  }

  finishFrame(state, frameSeconds, observerShipId, perceivedTarget);
});
