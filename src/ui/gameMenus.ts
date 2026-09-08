import type { LocalProfile, SavedShipBuild, SupplyDrawResult } from "../profile/localProfile";
import {
  GAME_LOCALE_OPTIONS,
  applyDocumentLocale,
  formatGameNumber,
  isGameLocale,
  localizeElement,
  translateGameText,
} from "../i18n/gameLocale";
import {
  drawSupplies,
  guaranteeProgress,
  installedCopies,
  normalizeLocalProfile,
  purchaseComponent,
  researchComponent,
  salvageComponent,
  sellComponent,
  setCommanderName,
} from "../profile/localProfile";
import {
  savedBuildReadiness,
  selectBattleBuild,
} from "../profile/savedBuilds";
import {
  CATEGORY_META,
  EQUIPMENT_BY_ID,
  EQUIPMENT_CATALOG,
  SHIP_CLASS_SLOT_COUNTS,
  isEquipmentCompatible,
} from "../profile/equipmentCatalog";
import type {
  EquipmentCategory,
  EquipmentDefinition,
  EquipmentRarity,
} from "../profile/equipmentCatalog";
import { SHIP_CLASSES, SHIP_CLASS_IDS } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { getMainBattery } from "../ships/mainBatteries";
import { getTorpedo } from "../ships/torpedoes";
import type { GameSettings, UiSoundStyle } from "../settings/gameSettings";
import {
  FLEET_SIZES,
  fleetCompositionForSize,
  type FleetSize,
  type GameLaunchRequest,
} from "../sim/battleSetup";
import { WEATHER_IDS, WEATHER_PRESETS, type WeatherId } from "../sim/weather";
import { DockPreview } from "../render/dockPreview";
import { DockPanel } from "./dockPanel";
import { equipmentLocale } from "../i18n/equipmentLocale";
import { voyageText } from "../i18n/voyageLocale";
import type { LanGuidanceReason } from "../net/lanGuidance";
import { equipmentArtworkMarkup } from "./equipmentArtwork";
import { MultiplayerMenu, type MultiplayerMenuCallbacks } from "./multiplayerMenu";

export interface GameMenuCallbacks {
  onStart: (request: GameLaunchRequest) => void | boolean;
  onRequestSolo?: () => void;
  onReplayTutorial?: (fromBattle: boolean) => void;
  isProfileLocked?: () => boolean;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
  onSettingsChange: (settings: GameSettings) => void;
  onQualityChange: (quality: "low" | "medium") => void;
  onProfileChange: (profile: LocalProfile) => void | boolean;
  multiplayer: MultiplayerMenuCallbacks;
}

type StartTab = "mission" | "store" | "dock" | "codex";
const hullTotalSlots = (shipClassId: ShipClassId): number =>
  Object.values(SHIP_CLASS_SLOT_COUNTS[shipClassId]).reduce((total, count) => total + count, 0);

const languageOptionsMarkup = (): string => GAME_LOCALE_OPTIONS
  .map(({ value, label }) => `<option value="${value}">${label}</option>`).join("");

const hullOptionsMarkup = (): string => ([
  ["destroyer", "驱逐舰"], ["lightCruiser", "轻巡洋舰"], ["battleship", "战列舰"],
] as const).map(([hullId, label]) => `<div class="hull-family"><h4>${label}</h4>${SHIP_CLASS_IDS.filter((id) => SHIP_CLASSES[id].hullId === hullId).map((shipClassId) => {
  const shipClass = SHIP_CLASSES[shipClassId];
  const battery = getMainBattery(shipClassId, "mk1-single", shipClass.starterSlots.mainGun);
  return `<button class="hull-option" data-ship-class-id="${shipClassId}" type="button"><b>${shipClass.name}</b><span>${shipClass.country} · ${shipClass.serviceYear}</span><small>${hullTotalSlots(shipClassId)} 槽 · ${shipClass.maxSpeedKnots} kn · ${(battery.maximumRangeMeters / 1_000).toFixed(2)} km 主炮 · ${shipClass.maxHull} HP</small></button>`;
}).join("")}</div>`).join("");

function equipmentSummary(item: EquipmentDefinition): string {
  if (item.torpedoId) {
    const torpedo = getTorpedo(item.torpedoId);
    return `${torpedo.speedMetersPerSecond} m/s · ${(torpedo.maximumRangeMeters / 1_000).toFixed(1)} km · 伤害 ${torpedo.damage}`;
  }
  return `核心增益 +${Math.round(item.bonus * 100)}%`;
}

function equipmentDetailRows(item: EquipmentDefinition): string {
  if (item.torpedoId) {
    const torpedo = getTorpedo(item.torpedoId);
    return [
      ["航速", `${torpedo.speedMetersPerSecond} m/s`],
      ["最大射程", `${(torpedo.maximumRangeMeters / 1_000).toFixed(1)} km`],
      ["装药伤害", String(torpedo.damage)],
      ["再装填", `${torpedo.reloadSeconds} s`],
      ["发现距离", `${torpedo.detectionRangeMeters} m`],
      ["武装距离", `${torpedo.armingDistanceMeters} m`],
      ["舰上风险", `×${torpedo.storageRiskMultiplier.toFixed(2)}`],
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }
  return `<div><dt>核心增益</dt><dd>+${Math.round(item.bonus * 100)}%</dd></div>${item.drawback ? `<div><dt>殉爆风险</dt><dd>+${Math.round(item.drawback * 100)}%</dd></div>` : ""}`;
}

export class GameMenus {
  private readonly startOverlay: HTMLElement;
  private readonly pauseOverlay: HTMLElement;
  private readonly settingsOverlay: HTMLElement;
  private readonly steering: HTMLInputElement;
  private readonly aim: HTMLInputElement;
  private readonly masterVolume: HTMLInputElement;
  private readonly muteAudio: HTMLButtonElement;
  private readonly steeringValue: HTMLOutputElement;
  private readonly aimValue: HTMLOutputElement;
  private readonly masterVolumeValue: HTMLOutputElement;
  private readonly qualityButtons: HTMLButtonElement[];
  private readonly uiSoundButtons: HTMLButtonElement[];
  private readonly languageSelectors: HTMLSelectElement[];
  private readonly tabButtons: HTMLButtonElement[];
  private readonly panels: Record<StartTab, HTMLElement>;
  private readonly commanderName: HTMLInputElement;
  private readonly credits: HTMLElement;
  private readonly researchPoints: HTMLElement;
  private readonly supplyTokens: HTMLElement;
  private readonly materialSummary: HTMLElement;
  private readonly guaranteePanel: HTMLElement;
  private readonly drawResults: HTMLElement;
  private readonly armoryGrid: HTMLElement;
  private readonly armoryDetail: HTMLElement;
  private readonly armoryNotice: HTMLElement;
  private readonly warehouseGrid: HTMLElement;
  private readonly warehouseDetail: HTMLElement;
  private readonly warehouseNotice: HTMLElement;
  private readonly codexBody: HTMLElement;
  private readonly dockPreview: DockPreview;
  private readonly dockPanel: DockPanel;
  private settingsFromStart = false;
  private readonly multiplayerMenu: MultiplayerMenu;
  private settings: GameSettings;
  private profile: LocalProfile;
  private armoryCategory: EquipmentCategory | "all" = "all";
  private warehouseCategory: EquipmentCategory | "all" = "all";
  private selectedArmoryItemId?: string;
  private selectedWarehouseItemId?: string;
  private armoryView: "catalog" | "inventory" = "catalog";
  private battleSetupOpen = false;
  private selectedFleetSize: FleetSize = 5;
  private selectedWeatherId: WeatherId = "clear";
  private pauseOpen = false;
  private settingsOpen = false;

  constructor(
    parent: HTMLElement,
    initialSettings: GameSettings,
    initialProfile: LocalProfile,
    initialQuality: "low" | "medium",
    private readonly callbacks: GameMenuCallbacks,
  ) {
    this.settings = { ...initialSettings };
    this.profile = normalizeLocalProfile(initialProfile);
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="game-menu-overlay start-menu">
        <section class="game-menu-card start-card command-center" role="dialog" aria-label="开始战斗、军需商店与舰队船坞">
          <div class="profile-strip">
            <label><span>本地舰长档案</span><input class="commander-name" maxlength="20" aria-label="本地舰长昵称" /></label>
            <label class="profile-language"><span>界面语言</span><select class="menu-language" aria-label="界面语言">${languageOptionsMarkup()}</select></label>
            <div class="profile-resources">
              <span><i class="fa-solid fa-coins"></i> 银币 <strong class="profile-credits">0</strong></span>
              <span><i class="fa-solid fa-flask"></i> 研发 <strong class="profile-research">0</strong></span>
              <span><i class="fa-solid fa-box"></i> 战斗补给券 <strong class="profile-tokens">0</strong></span>
              <span class="material-summary">钢材 0 · 零件 0</span>
            </div>
          </div>
          <div class="menu-tabs command-tabs" role="tablist" aria-label="主菜单选项卡">
            <button type="button" role="tab" data-menu-tab="mission" aria-selected="true"><i class="fa-solid fa-flag"></i> 出击</button>
            <button type="button" role="tab" data-menu-tab="store" aria-selected="false"><i class="fa-solid fa-anchor"></i> 军械库</button>
            <button type="button" role="tab" data-menu-tab="dock" aria-selected="false"><i class="fa-solid fa-ship"></i> 船坞</button>
            <button type="button" role="tab" data-menu-tab="codex" aria-selected="false"><i class="fa-solid fa-book"></i> 图鉴</button>
          </div>
          <div class="menu-tab-panel mission-panel" data-menu-panel="mission">
            <p class="eyebrow">二战海战 · 单人与双人局域网合作</p><h1>灰海行动</h1>
            <p>从船坞保存舰船方案，再选择舰队规模、天气与旗舰出击；海试仍使用当前船坞配装。</p>
            <div class="mission-brief">击沉敌舰，或控制中央 A 区率先达到 2000 分。双方争夺时，舰体状态更好的一方会缓慢建立区域优势。当前本地配装会真实影响战斗性能。</div>
            <div class="menu-controls">
              <span><kbd>W S</kbd> 航速</span><span><kbd>A D</kbd> 转向</span><span><kbd>移动鼠标</kbd> 视角</span>
              <span><kbd>R</kbd> 瞄准</span><span><kbd>Space</kbd> 开火</span><span><kbd>4</kbd> 损管优先</span><span><kbd>H</kbd> 舰体抢修</span>
              <span><kbd>M</kbd> 地图</span><span><kbd>F3</kbd> 调试</span><span><kbd>Esc</kbd> 暂停</span>
            </div>
            <div class="mode-choice">
              <button class="mode-card start-battle" type="button"><b>单人战斗</b><span>选择规模、天气与已保存旗舰后开始</span></button>
              <button class="mode-card open-multiplayer-menu" type="button"><b>多人联机</b><span>创建或加入 2 人局域网房间。</span></button>
              <button class="mode-card start-trials" type="button"><b>舰船测试模式</b><span>无攻击 AI · 无时间限制 · 测试装配性能</span></button>
            </div>
            <div class="multiplayer-menu-host" hidden></div>
            <div class="battle-setup" hidden>
              <div class="screen-heading"><div><p class="eyebrow">单人战斗准备</p><h2>编成与海况</h2></div><button class="text-button battle-setup-back" type="button">返回任务</button></div>
              <div class="battle-setup-grid">
                <section><h3>1 · 对战规模</h3><div class="fleet-size-options"></div><div class="fleet-composition"></div></section>
                <section><h3>2 · 天气</h3><div class="weather-options"></div><p class="weather-gameplay-note">天气会同时影响天空、海况与双方光学发现距离。</p></section>
                <section><h3>3 · 选择旗舰方案</h3><div class="battle-build-list"></div></section>
              </div>
              <div class="battle-setup-footer"><span class="battle-setup-status" aria-live="polite"></span><button class="menu-button primary confirm-battle-setup" type="button">确认编成并开始战斗</button></div>
            </div>
          </div>
          <div class="menu-tab-panel store-panel" data-menu-panel="store" hidden>
            <div class="screen-heading"><div><p class="eyebrow">纯游戏内资源 · 常驻明码兑换</p><h2>舰队军械库</h2></div><button class="text-button open-codex" type="button">查看完整组件表</button></div>
            <div class="armory-mode-tabs" role="tablist" aria-label="军械库与仓库"><button class="armory-mode-tab active" data-armory-view-button="catalog" type="button" aria-selected="true">军械库</button><button class="armory-mode-tab" data-armory-view-button="inventory" type="button" aria-selected="false">仓库</button></div>
            <div class="armory-subview" data-armory-view="catalog">
              <div class="store-layout">
                <aside class="armory-nav"><h3>常驻分类</h3><div class="armory-filters"></div><p class="ethical-store-note"><i class="fa-solid fa-shield-heart"></i> 无现金货币、无会员、无限时促销。所有战斗组件均可定向研发和购买。</p><button class="open-warehouse" type="button">前往仓库管理</button></aside>
                <section class="armory-catalog"><div class="armory-toolbar"><h3>历史舰装目录</h3><span>研发解锁 → 银币与材料采购</span></div><div class="armory-grid"></div><p class="armory-notice" aria-live="polite"></p></section>
                <aside class="armory-side"><div class="armory-detail"></div><section class="battle-supply"><h3><i class="fa-solid fa-box-open"></i> 免费战斗补给</h3><p>补给券只能通过有效战斗获得，不能购买。全部组件也可在上方直接研发采购。</p><div class="draw-actions"><button class="draw-once" type="button">开启 1 张</button><button class="draw-ten" type="button">开启 10 张</button></div><div class="guarantee-panel"></div><div class="draw-results" aria-live="polite"></div></section></aside>
              </div>
            </div>
            <div class="armory-subview inventory-panel" data-armory-view="inventory" hidden>
              <div class="warehouse-layout">
                <aside class="warehouse-nav"><h3>仓库筛选</h3><div class="warehouse-filters"></div><p>出售重复件可回收银币；拆解重复件可获得定向采购所需零件。</p><button class="open-dock" type="button">前往船坞配装</button></aside>
                <section class="warehouse-catalog"><div class="armory-toolbar"><h3>持有组件</h3><span class="warehouse-count"></span></div><div class="warehouse-grid"></div><p class="warehouse-notice" aria-live="polite"></p></section>
                <aside class="warehouse-detail"></aside>
              </div>
            </div>
          </div>
          <div class="menu-tab-panel dock-panel" data-menu-panel="dock" hidden>
            <div class="screen-heading"><div><p class="eyebrow">模块化船坞蓝图</p><h2>舰队船坞</h2></div><div class="dock-build-tools"><button class="auto-equip-ship" type="button">自动最优装配</button><input class="build-name" maxlength="24" placeholder="方案名称" aria-label="方案名称" /><button class="save-ship-build" type="button">保存当前方案</button><span class="dock-save-state">配装自动保存至本机</span></div></div>
            <div class="saved-build-list" aria-label="已保存舰船方案"></div>
            <div class="dock-layout">
              <aside class="hull-list"><h3>更换舰体</h3>${hullOptionsMarkup()}<div class="slot-list"></div></aside>
              <section class="dock-blueprint"><canvas class="dock-preview" aria-label="可旋转舰艇船坞预览"></canvas><div class="dock-callouts"></div><small>拖动舰船预览可旋转 · 滚轮缩放</small></section>
              <aside class="component-library"><h3>组件库</h3><div class="component-filters"></div><div class="inventory-grid"></div><div class="component-detail"></div></aside>
            </div>
          </div>
          <div class="menu-tab-panel codex-panel" data-menu-panel="codex" hidden>
            <div class="screen-heading"><div><p class="eyebrow">二战舰装档案</p><h2>组件图鉴</h2></div><span>边框表示舰装档位 · 名称采用历史型号</span></div>
            <div class="codex-table-wrap"><table class="codex-table"><thead><tr><th>类别</th><th>常备舰装</th><th>改装舰装</th><th>精锐舰装</th><th>舰队试验</th><th>当前舰型</th></tr></thead><tbody></tbody></table></div>
            <p class="codex-note">历史鱼雷与侧炮型号已接入实际战斗性能；轻巡洋舰和战列舰的侧炮会在火控连续确认目标后自动接战。防空炮已接入舰载机空战，其防空效能随装备数量与性能变化。</p>
          </div>
        </section>
      </div>
      <div class="game-menu-overlay pause-menu" hidden><section class="game-menu-card" role="dialog" aria-modal="true" aria-label="暂停菜单"><p class="eyebrow">战斗暂停</p><h2>舰桥指令</h2><p>战场模拟已暂停。舰装更换需返回主菜单。</p><div class="menu-buttons"><button class="menu-button primary resume-battle" type="button">返回战斗</button><button class="menu-button open-settings" type="button">设置</button><button class="menu-button danger restart-battle" type="button">重新开始</button><button class="menu-button exit-main-menu" type="button">退出到主菜单</button></div></section></div>
      <div class="game-menu-overlay settings-menu" hidden><section class="game-menu-card" role="dialog" aria-modal="true" aria-label="游戏设置"><p class="eyebrow">游戏设置</p><h2>操控与画面</h2><div class="settings-group language-settings"><label>界面语言</label><select class="menu-language" aria-label="界面语言">${languageOptionsMarkup()}</select><small>语言切换会立即生效并保存在本机</small></div><div class="settings-group"><label>操控灵敏度</label><div class="sensitivity-row"><span>转向</span><input class="menu-steering" type="range" min="35" max="100" step="5" /><output class="menu-steering-value">100%</output></div><div class="sensitivity-row"><span>瞄准</span><input class="menu-aim" type="range" min="50" max="200" step="10" /><output class="menu-aim-value">100%</output></div></div><div class="settings-group"><label>画面质量</label><div class="quality-options"><button class="quality-option" type="button" data-quality="low">低（推荐）</button><button class="quality-option" type="button" data-quality="medium">中等</button></div></div><div class="menu-buttons"><button class="menu-button settings-back" type="button">返回暂停菜单</button></div></section></div>`;
    while (container.firstElementChild) parent.append(container.firstElementChild);

    const dockStatus = document.createElement("div");
    dockStatus.className = "dock-preview-status";
    dockStatus.setAttribute("aria-live", "polite");
    dockStatus.textContent = "\u9009\u62e9\u7ec4\u4ef6\u5373\u53ef\u4e34\u65f6\u9884\u89c8";
    parent.querySelector(".dock-blueprint > small")?.before(dockStatus);

    const audioSettings = document.createElement("div");
    audioSettings.className = "settings-group audio-settings";
    audioSettings.innerHTML = `<label>声音</label><div class="sensitivity-row"><span>主音量</span><input class="menu-master-volume" type="range" min="0" max="100" step="5" aria-label="主音量" /><output class="menu-master-volume-value">70%</output></div><div class="quality-options"><button class="quality-option menu-mute-audio" type="button" aria-pressed="false">静音：关</button></div><label>界面音效</label><div class="quality-options ui-sound-options"><button class="quality-option" data-ui-sound-style="bridge" type="button"><span>舰桥继电器</span><small>试听</small></button><button class="quality-option" data-ui-sound-style="lever" type="button"><span>机械拨杆</span><small>试听</small></button><button class="quality-option" data-ui-sound-style="pixel" type="button"><span>像素电报码</span><small>试听</small></button></div>`;
    parent.querySelector(".settings-menu .menu-buttons")?.before(audioSettings);

    const find = <T extends Element>(selector: string): T => {
      const element = parent.querySelector<T>(selector);
      if (!element) throw new Error(`Missing game menu element: ${selector}`);
      return element;
    };
    this.startOverlay = find(".start-menu"); this.pauseOverlay = find(".pause-menu"); this.settingsOverlay = find(".settings-menu");
    this.steering = find(".menu-steering"); this.aim = find(".menu-aim"); this.masterVolume = find(".menu-master-volume"); this.muteAudio = find(".menu-mute-audio"); this.steeringValue = find(".menu-steering-value"); this.aimValue = find(".menu-aim-value"); this.masterVolumeValue = find(".menu-master-volume-value");
    this.qualityButtons = Array.from(parent.querySelectorAll("[data-quality]")); this.tabButtons = Array.from(parent.querySelectorAll("[data-menu-tab]"));
    this.uiSoundButtons = Array.from(parent.querySelectorAll("[data-ui-sound-style]"));
    this.languageSelectors = Array.from(parent.querySelectorAll(".menu-language"));
    this.panels = { mission: find(".mission-panel"), store: find(".store-panel"), dock: find(".dock-panel"), codex: find(".codex-panel") };
    this.commanderName = find(".commander-name"); this.credits = find(".profile-credits"); this.researchPoints = find(".profile-research"); this.supplyTokens = find(".profile-tokens"); this.materialSummary = find(".material-summary");
    this.guaranteePanel = find(".guarantee-panel"); this.drawResults = find(".draw-results");
    this.armoryGrid = find(".armory-grid"); this.armoryDetail = find(".armory-detail"); this.armoryNotice = find(".armory-notice");
    this.warehouseGrid = find(".warehouse-grid"); this.warehouseDetail = find(".warehouse-detail"); this.warehouseNotice = find(".warehouse-notice"); this.codexBody = find(".codex-table tbody");
    this.dockPreview = new DockPreview(find(".dock-preview"));
    this.dockPanel = new DockPanel(this.panels.dock, this.dockPreview, () => this.profile, () => this.settings.locale,
      () => Boolean(this.callbacks.isProfileLocked?.()), (next) => { this.profile = next; return this.emitProfile(); });
    this.multiplayerMenu = new MultiplayerMenu(find(".multiplayer-menu-host"), {
      locale: this.settings.locale,
      profile: this.profile,
      callbacks: this.callbacks.multiplayer,
      onBack: () => this.closeMultiplayerMenu(),
    });
    this.steering.value = String(Math.round(this.settings.steeringSensitivity * 100)); this.aim.value = String(Math.round(this.settings.aimSensitivity * 100)); this.masterVolume.value = String(Math.round(this.settings.masterVolume * 100)); this.commanderName.value = this.profile.commanderName;
    for (const selector of this.languageSelectors) selector.value = this.settings.locale;
    this.renderStaticContent(); this.updateSensitivityLabels(); this.setQuality(initialQuality); this.renderProfile(); this.setStartTab("mission");

    find<HTMLButtonElement>(".start-battle").addEventListener("click", () => this.callbacks.onRequestSolo ? this.callbacks.onRequestSolo() : this.openBattleSetup());
    find<HTMLButtonElement>(".open-multiplayer-menu").addEventListener("click", () => this.openMultiplayerMenu());
    find<HTMLButtonElement>(".start-trials").addEventListener("click", () => this.start({ mode: "sea-trials" }));
    find<HTMLButtonElement>(".battle-setup-back").addEventListener("click", () => this.closeBattleSetup());
    find<HTMLButtonElement>(".confirm-battle-setup").addEventListener("click", () => this.confirmBattleSetup());
    find<HTMLButtonElement>(".resume-battle").addEventListener("click", () => this.resume()); find<HTMLButtonElement>(".open-settings").addEventListener("click", () => this.openSettings());
    find<HTMLButtonElement>(".restart-battle").addEventListener("click", () => this.restart()); find<HTMLButtonElement>(".exit-main-menu").addEventListener("click", () => this.exitToMenu()); find<HTMLButtonElement>(".settings-back").addEventListener("click", () => this.backToPause());
    find<HTMLButtonElement>(".draw-once").addEventListener("click", () => this.draw(1)); find<HTMLButtonElement>(".draw-ten").addEventListener("click", () => this.draw(10)); find<HTMLButtonElement>(".open-codex").addEventListener("click", () => this.setStartTab("codex"));
    find<HTMLButtonElement>(".open-warehouse").addEventListener("click", () => this.setArmoryView("inventory"));
    find<HTMLButtonElement>(".open-dock").addEventListener("click", () => this.setStartTab("dock"));
    for (const button of parent.querySelectorAll<HTMLButtonElement>("[data-armory-view-button]")) {
      button.addEventListener("click", () => this.setArmoryView(button.dataset.armoryViewButton === "inventory" ? "inventory" : "catalog"));
    }
    for (const button of this.tabButtons) button.addEventListener("click", () => this.setStartTab((button.dataset.menuTab as StartTab) ?? "mission"));
    this.commanderName.addEventListener("change", () => { this.profile = setCommanderName(this.profile, this.commanderName.value); this.commanderName.value = this.profile.commanderName; this.emitProfile(); });
    this.steering.addEventListener("input", () => { this.settings = { ...this.settings, steeringSensitivity: Number(this.steering.value) / 100 }; this.emitSettings(); });
    this.aim.addEventListener("input", () => { this.settings = { ...this.settings, aimSensitivity: Number(this.aim.value) / 100 }; this.emitSettings(); });
    this.masterVolume.addEventListener("input", () => { this.settings = { ...this.settings, masterVolume: Number(this.masterVolume.value) / 100 }; this.emitSettings(); });
    this.muteAudio.addEventListener("click", () => { this.settings = { ...this.settings, muted: !this.settings.muted }; this.emitSettings(); });
    for (const button of this.uiSoundButtons) button.addEventListener("click", () => {
      const style = button.dataset.uiSoundStyle as UiSoundStyle;
      this.settings = { ...this.settings, uiSoundStyle: style };
      this.emitSettings();
    });
    for (const selector of this.languageSelectors) selector.addEventListener("change", () => {
      if (!isGameLocale(selector.value)) return;
      this.settings = { ...this.settings, locale: selector.value };
      for (const sibling of this.languageSelectors) sibling.value = selector.value;
      this.renderProfile();
      this.applyLocale();
      this.emitSettings();
    });
    for (const button of this.qualityButtons) button.addEventListener("click", () => { const quality = button.dataset.quality === "medium" ? "medium" : "low"; this.setQuality(quality); this.callbacks.onQualityChange(quality); });
    const settingsButton = document.createElement("button"); settingsButton.className = "main-open-settings"; settingsButton.type = "button";
    settingsButton.setAttribute("data-i18n-keyed", "");
    this.panels.mission.querySelector(".mode-choice")?.after(settingsButton);
    settingsButton.addEventListener("click", () => { this.settingsFromStart = true; this.openSettings(); });
    const replay = document.createElement("button"); replay.type = "button"; replay.className = "replay-voyage";
    replay.setAttribute("data-i18n-keyed", "");
    this.settingsOverlay.querySelector(".menu-buttons")?.prepend(replay);
    replay.addEventListener("click", () => this.callbacks.onReplayTutorial?.(!this.settingsFromStart));
    this.startOverlay.addEventListener("click", (event) => {
      if (!this.callbacks.isProfileLocked?.()) return;
      const target = (event.target as Element).closest(".armory-action,.warehouse-sell,.warehouse-salvage,.draw-once,.draw-ten,[data-battle-build]");
      if (target) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this.commanderName.addEventListener("change", (event) => {
      if (!this.callbacks.isProfileLocked?.()) return;
      event.stopImmediatePropagation(); this.commanderName.value = this.profile.commanderName;
    }, true);
    this.applyLocale();
  }

  private renderStaticContent(): void {
    const categories = Object.entries(CATEGORY_META) as [EquipmentCategory, typeof CATEGORY_META[EquipmentCategory]][];
    const pool = this.startOverlay.querySelector<HTMLElement>(".pool-categories");
    if (pool) pool.innerHTML = categories.map(([, meta]) => `<span><i class="${meta.icon}"></i>${meta.label}</span>`).join("");
    const createCategoryFilters = (
      selector: string,
      onSelect: (category: EquipmentCategory | "all") => void,
    ): void => {
      const host = this.startOverlay.querySelector<HTMLElement>(selector);
      if (!host) return;
      host.innerHTML = `<button class="active" data-category="all">全部组件</button>${categories.map(([category, meta]) => `<button data-category="${category}"><i class="${meta.icon}"></i>${meta.label}</button>`).join("")}`;
      for (const button of host.querySelectorAll<HTMLButtonElement>("button")) {
        button.addEventListener("click", () => {
          for (const item of host.querySelectorAll("button")) item.classList.toggle("active", item === button);
          onSelect((button.dataset.category as EquipmentCategory | "all") ?? "all");
        });
      }
    };
    createCategoryFilters(".armory-filters", (category) => { this.armoryCategory = category; this.renderStore(); });
    createCategoryFilters(".warehouse-filters", (category) => { this.warehouseCategory = category; this.renderWarehouse(); });
    this.renderCodex();
  }

  private renderCodex(): void {
    const counts = SHIP_CLASS_SLOT_COUNTS[this.profile.shipClassId];
    this.codexBody.innerHTML = (Object.entries(CATEGORY_META) as [
      EquipmentCategory,
      typeof CATEGORY_META[EquipmentCategory],
    ][]).map(([category, meta]) => `<tr><th><i class="${meta.icon}"></i>${meta.label}</th>${(["common", "purple", "gold", "redGold"] as EquipmentRarity[]).map((rarity) => { const item = this.localizedEquipment(EQUIPMENT_BY_ID[`${category}-${rarity}`]); return `<td class="rarity-${rarity}"><b>${this.equipmentTextMarkup(item, "name")}</b><small>${this.equipmentTextMarkup(item, "origin")}<br>${equipmentSummary(item)}</small></td>`; }).join("")}<td>${counts[category] > 0 ? `可装 ×${counts[category]}` : "不可安装"}</td></tr>`).join("");
  }

  private renderProfile(): void {
    this.commanderName.disabled = Boolean(this.callbacks.isProfileLocked?.());
    this.credits.textContent = formatGameNumber(this.profile.credits, this.settings.locale);
    this.researchPoints.textContent = formatGameNumber(this.profile.researchPoints, this.settings.locale);
    this.supplyTokens.textContent = String(this.profile.supplyTokens);
    this.materialSummary.textContent = `钢材 ${this.profile.materials.steel} · 零件 ${this.profile.materials.parts}`;
    this.renderCodex();
    this.renderStore();
    this.renderWarehouse();
    this.dockPanel.render();
    this.multiplayerMenu.setProfile(this.profile);
    if (this.battleSetupOpen) this.renderBattleSetup();
    for (const button of this.startOverlay.querySelectorAll<HTMLButtonElement>(".armory-action,.warehouse-sell,.warehouse-salvage,.draw-once,.draw-ten,[data-battle-build]")) {
      if (this.callbacks.isProfileLocked?.()) { button.disabled = true; button.title = voyageText(this.settings.locale, "profileLocked"); }
    }
    this.applyLocale();
  }

  private renderStore(): void {
    const listed = EQUIPMENT_CATALOG.map((item) => this.localizedEquipment(item)).filter((item) => this.armoryCategory === "all" || item.category === this.armoryCategory);
    if (!this.selectedArmoryItemId || !listed.some((item) => item.id === this.selectedArmoryItemId)) this.selectedArmoryItemId = listed[0]?.id;
    this.armoryGrid.innerHTML = listed.map((item) => {
      const unlocked = Boolean(this.profile.unlockedEquipment[item.id]);
      const owned = this.profile.inventory[item.id] ?? 0;
      const cost = item.purchaseCost;
      return `<button class="armory-item rarity-${item.rarity}${unlocked ? " researched" : " locked"}" data-armory-item="${item.id}" type="button"><i class="${CATEGORY_META[item.category].icon}"></i><span>${this.equipmentTextMarkup(item, "name")}</span><small>${this.equipmentTextMarkup(item, "origin")}</small><b>${unlocked ? `${formatGameNumber(cost.credits, this.settings.locale)} ${this.t("银币")}` : `${item.researchCost} ${this.t("研发解锁")}`}</b><em>${this.t("持有")} ×${owned}</em></button>`;
    }).join("");
    this.decorateEquipmentCards(this.armoryGrid, "[data-armory-item]", "armoryItem");
    for (const button of this.armoryGrid.querySelectorAll<HTMLButtonElement>("[data-armory-item]")) {
      button.addEventListener("click", () => { this.selectedArmoryItemId = button.dataset.armoryItem; this.renderStore(); });
    }
    const selected = this.selectedArmoryItemId ? EQUIPMENT_BY_ID[this.selectedArmoryItemId] : undefined;
    if (selected) this.renderArmoryDetail(this.localizedEquipment(selected));
    this.guaranteePanel.innerHTML = `<h4>公开保底</h4>${([10, 50, 100] as const).map((threshold) => { const rarity: EquipmentRarity = threshold === 10 ? "purple" : threshold === 50 ? "gold" : "redGold"; const progress = guaranteeProgress(this.profile.drawCount, threshold); return `<div class="guarantee rarity-${rarity}"><div><span>${threshold} 次</span><b>${progress}/${threshold}</b></div><i><em style="width:${progress / threshold * 100}%"></em></i></div>`; }).join("")}<p>仅使用免费战斗补给券 · 累计 ${this.profile.drawCount} 次</p>`;
    const recent = this.profile.recentDraws;
    this.drawResults.innerHTML = recent.length ? recent.slice(0, 3).map((result) => this.resultMarkup(result)).join("") : "<small>尚无补给记录</small>";
    for (const button of this.startOverlay.querySelectorAll<HTMLButtonElement>(".draw-once,.draw-ten")) button.disabled = this.profile.supplyTokens < (button.classList.contains("draw-ten") ? 10 : 1);
    this.localizeNodes(this.armoryGrid, this.armoryDetail, this.guaranteePanel, this.drawResults, this.armoryNotice);
  }

  private priceMarkup(item: EquipmentDefinition): string {
    const cost = item.purchaseCost;
    return `<span><i class="fa-solid fa-coins"></i>${formatGameNumber(cost.credits, this.settings.locale)}</span>${cost.steel ? `<span>钢材 ${cost.steel}</span>` : ""}${cost.parts ? `<span>零件 ${cost.parts}</span>` : ""}`;
  }

  private renderArmoryDetail(item: EquipmentDefinition): void {
    const unlocked = Boolean(this.profile.unlockedEquipment[item.id]);
    const cost = item.purchaseCost;
    const affordable = this.profile.credits >= cost.credits
      && this.profile.materials.steel >= cost.steel
      && this.profile.materials.parts >= cost.parts;
    const currentId = this.profile.loadout[item.category];
    const current = currentId ? this.localizedEquipment(EQUIPMENT_BY_ID[currentId]) : undefined;
    const difference = item.bonus - (current?.bonus ?? 0);
    const compatibility = isEquipmentCompatible(item, this.profile.shipClassId)
      ? `${this.localizedShipClassName(this.profile.shipClassId)} · ${this.t("可安装")}`
      : this.t("当前舰型无可用槽位");
    this.armoryDetail.innerHTML = `<div class="detail-heading rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><div><b>${this.equipmentTextMarkup(item, "name")}</b><small>${this.t(CATEGORY_META[item.category].label)} · ${this.equipmentTextMarkup(item, "origin")}</small></div></div><p>${this.equipmentTextMarkup(item, "description")}</p><dl>${equipmentDetailRows(item)}<div><dt>当前装备</dt><dd>${current ? this.equipmentTextMarkup(current, "name") : this.t("无")}</dd></div><div><dt>相对核心增益</dt><dd class="${difference >= 0 ? "stat-positive" : "stat-negative"}">${difference >= 0 ? "+" : ""}${Math.round(difference * 100)}%</dd></div><div><dt>适配</dt><dd>${compatibility}</dd></div><div><dt>当前持有</dt><dd>×${this.profile.inventory[item.id] ?? 0}</dd></div></dl><div class="armory-price">${unlocked ? this.priceMarkup(item) : `<span><i class="fa-solid fa-flask"></i>${item.researchCost} ${this.t("研发资料")}</span>`}</div><button class="armory-action" type="button" ${unlocked && !affordable ? "disabled" : ""}>${this.t(unlocked ? affordable ? "采购组件" : "资源不足" : this.profile.researchPoints >= item.researchCost ? "研发解锁" : "研发资料不足")}</button>`;
    this.decorateEquipmentDetail(this.armoryDetail, item);
    const action = this.armoryDetail.querySelector<HTMLButtonElement>(".armory-action");
    if (!action) return;
    action.disabled = action.disabled || (!unlocked && this.profile.researchPoints < item.researchCost);
    action.addEventListener("click", () => {
      const transaction = unlocked
        ? purchaseComponent(this.profile, item.id)
        : researchComponent(this.profile, item.id);
      this.armoryNotice.innerHTML = transaction.success
        ? `${this.t(unlocked ? "已采购" : "研发完成")}：${this.equipmentTextMarkup(item, "name")}`
        : this.t("交易未完成，请检查资源与研发状态。");
      if (transaction.success) { this.profile = transaction.profile; this.emitProfile(); }
    });
  }

  private resultMarkup(result: SupplyDrawResult): string {
    if (result.kind === "material") return `<span class="draw-result rarity-common"><i class="fa-solid fa-cubes"></i><b>${result.material === "steel" ? "钢材" : "零件"}</b><small>+${result.amount}</small></span>`;
    const item = result.itemId ? this.localizedEquipment(EQUIPMENT_BY_ID[result.itemId]) : undefined;
    return item ? `<span class="draw-result rarity-${item.rarity}">${equipmentArtworkMarkup(item, "result")}<b>${this.equipmentTextMarkup(item, "name")}</b><small>${this.equipmentTextMarkup(item, "origin")}</small></span>` : "";
  }

  private draw(count: 1 | 10): void {
    const outcome = drawSupplies(this.profile, count); if (!outcome.results.length) return; this.profile = outcome.profile; this.emitProfile();
    this.drawResults.classList.remove("reveal"); requestAnimationFrame(() => this.drawResults.classList.add("reveal"));
  }

  private renderWarehouse(): void {
    const owned = EQUIPMENT_CATALOG.map((item) => this.localizedEquipment(item)).filter((item) =>
      (this.profile.inventory[item.id] ?? 0) > 0
      && (this.warehouseCategory === "all" || item.category === this.warehouseCategory));
    if (!this.selectedWarehouseItemId || !owned.some((item) => item.id === this.selectedWarehouseItemId)) this.selectedWarehouseItemId = owned[0]?.id;
    const total = Object.values(this.profile.inventory).reduce((sum, count) => sum + count, 0);
    const count = this.startOverlay.querySelector<HTMLElement>(".warehouse-count");
    if (count) count.textContent = `${owned.length} ${this.t("型号")} · ${total} ${this.t("件组件")}`;
    this.warehouseGrid.innerHTML = owned.map((item) => {
      const installed = installedCopies(this.profile, item.id);
      const quantity = this.profile.inventory[item.id] ?? 0;
      return `<button class="warehouse-item rarity-${item.rarity}${installed ? " installed" : ""}" data-warehouse-item="${item.id}" type="button"><i class="${CATEGORY_META[item.category].icon}"></i><span>${this.equipmentTextMarkup(item, "name")}</span><small>${this.equipmentTextMarkup(item, "origin")}</small><b>×${quantity}</b><em>${installed ? `${this.t("已安装")} ×${installed}` : this.t(quantity > 1 ? "有重复件" : "在库")}</em></button>`;
    }).join("") || '<p class="empty-inventory">该分类暂无组件</p>';
    this.decorateEquipmentCards(this.warehouseGrid, "[data-warehouse-item]", "warehouseItem");
    for (const button of this.warehouseGrid.querySelectorAll<HTMLButtonElement>("[data-warehouse-item]")) {
      button.addEventListener("click", () => { this.selectedWarehouseItemId = button.dataset.warehouseItem; this.renderWarehouse(); });
    }
    const item = this.selectedWarehouseItemId ? this.localizedEquipment(EQUIPMENT_BY_ID[this.selectedWarehouseItemId]) : undefined;
    if (!item) { this.warehouseDetail.innerHTML = "<p>选择组件查看库存详情</p>"; this.localizeNodes(this.warehouseGrid, this.warehouseDetail, this.warehouseNotice, count); return; }
    const quantity = this.profile.inventory[item.id] ?? 0;
    const installed = installedCopies(this.profile, item.id);
    const disposable = Math.max(0, quantity - installed);
    const baselineProtected = item.rarity === "common" && quantity <= 1;
    const canRecycle = disposable > 0 && !baselineProtected;
    const currentId = this.profile.loadout[item.category];
    const current = currentId ? this.localizedEquipment(EQUIPMENT_BY_ID[currentId]) : undefined;
    const difference = item.bonus - (current?.bonus ?? 0);
    this.warehouseDetail.innerHTML = `<div class="detail-heading rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><div><b>${this.equipmentTextMarkup(item, "name")}</b><small>${this.t(CATEGORY_META[item.category].label)} · ${this.equipmentTextMarkup(item, "origin")}</small></div></div><p>${this.equipmentTextMarkup(item, "description")}</p><dl>${equipmentDetailRows(item)}<div><dt>当前装备</dt><dd>${current ? this.equipmentTextMarkup(current, "name") : this.t("无")}</dd></div><div><dt>相对核心增益</dt><dd class="${difference >= 0 ? "stat-positive" : "stat-negative"}">${difference >= 0 ? "+" : ""}${Math.round(difference * 100)}%</dd></div><div><dt>持有 / 已安装</dt><dd>${quantity} / ${installed}</dd></div><div><dt>可处理</dt><dd>${canRecycle ? disposable : 0}</dd></div></dl><div class="warehouse-actions"><button class="warehouse-sell" type="button" ${canRecycle ? "" : "disabled"}>${this.t("出售")} 1 ${this.t("件")} · +${item.sellCredits} ${this.t("银币")}</button><button class="warehouse-salvage" type="button" ${canRecycle ? "" : "disabled"}>${this.t("拆解")} 1 ${this.t("件")} · +${item.salvageParts} ${this.t("零件")}</button></div><small class="warehouse-protection">${this.t(canRecycle ? "只处理未安装的副本。" : installed ? "舰队预设中的副本已安装，无法处理。" : "最后一套基础组件受到保护。")}</small>`;
    this.decorateEquipmentDetail(this.warehouseDetail, item);
    const transact = (mode: "sell" | "salvage"): void => {
      const result = mode === "sell"
        ? sellComponent(this.profile, item.id)
        : salvageComponent(this.profile, item.id);
      this.warehouseNotice.innerHTML = result.success
        ? `${this.t(mode === "sell" ? "已出售" : "已拆解")}：${this.equipmentTextMarkup(item, "name")}`
        : this.t("无法处理已安装组件或最后一套基础组件。");
      if (result.success) { this.profile = result.profile; this.emitProfile(); }
    };
    this.warehouseDetail.querySelector<HTMLButtonElement>(".warehouse-sell")?.addEventListener("click", () => transact("sell"));
    this.warehouseDetail.querySelector<HTMLButtonElement>(".warehouse-salvage")?.addEventListener("click", () => transact("salvage"));
    this.localizeNodes(this.warehouseGrid, this.warehouseDetail, this.warehouseNotice, count);
  }

  showBattleSetup(): void { this.openBattleSetup(); }

  private openBattleSetup(): void {
    this.battleSetupOpen = true;
    this.panels.mission.classList.add("setup-active");
    const panel = this.panels.mission.querySelector<HTMLElement>(".battle-setup");
    if (panel) panel.hidden = false;
    const selected = this.profile.savedShipBuilds.find(({ id }) =>
      id === this.profile.selectedBattleBuildId);
    if ((!selected || !savedBuildReadiness(this.profile, selected).ready) && !this.callbacks.isProfileLocked?.()) {
      const id = this.profile.savedShipBuilds.find((build) => savedBuildReadiness(this.profile, build).ready)?.id;
      if (id) { this.profile = selectBattleBuild(this.profile, id); this.emitProfile(); }
    }
    this.renderBattleSetup();
  }

  private closeBattleSetup(): void {
    this.battleSetupOpen = false;
    this.panels.mission.classList.remove("setup-active");
    const panel = this.panels.mission.querySelector<HTMLElement>(".battle-setup");
    if (panel) panel.hidden = true;
  }

  private openMultiplayerMenu(): void {
    this.closeBattleSetup();
    this.panels.mission.classList.add("multiplayer-active");
    const panel = this.panels.mission.querySelector<HTMLElement>(".multiplayer-menu-host");
    if (panel) panel.hidden = false;
    void this.multiplayerMenu.show();
  }

  private closeMultiplayerMenu(): void {
    this.panels.mission.classList.remove("multiplayer-active");
    const panel = this.panels.mission.querySelector<HTMLElement>(".multiplayer-menu-host");
    if (panel) panel.hidden = true;
    this.multiplayerMenu.hide();
  }

  private renderBattleSetup(): void {
    const build = this.profile.savedShipBuilds.find(({ id }) =>
      id === this.profile.selectedBattleBuildId);
    const shipClassId = build?.shipClassId ?? this.profile.shipClassId;
    const composition = fleetCompositionForSize(this.selectedFleetSize, shipClassId);
    const sizeHost = this.panels.mission.querySelector<HTMLElement>(".fleet-size-options");
    const compositionHost = this.panels.mission.querySelector<HTMLElement>(".fleet-composition");
    const weatherHost = this.panels.mission.querySelector<HTMLElement>(".weather-options");
    const buildHost = this.panels.mission.querySelector<HTMLElement>(".battle-build-list");
    const confirm = this.panels.mission.querySelector<HTMLButtonElement>(".confirm-battle-setup");
    const status = this.panels.mission.querySelector<HTMLElement>(".battle-setup-status");
    if (sizeHost) {
      sizeHost.innerHTML = FLEET_SIZES.map((size) => `<button type="button" data-fleet-size="${size}" class="${size === this.selectedFleetSize ? "active" : ""}">${size} v ${size}<small>${size === 5 ? "推荐" : size === 7 ? "较高负载" : "快速战斗"}</small></button>`).join("");
      for (const button of sizeHost.querySelectorAll<HTMLButtonElement>("[data-fleet-size]")) {
        button.addEventListener("click", () => {
          this.selectedFleetSize = Number(button.dataset.fleetSize) as FleetSize;
          this.renderBattleSetup();
        });
      }
    }
    if (compositionHost) compositionHost.innerHTML = `<h4>双方自动编成</h4><span>驱逐舰 <b>${composition.destroyer}</b></span><span>轻巡洋舰 <b>${composition.lightCruiser}</b></span><span>战列舰 <b>${composition.battleship}</b></span><span>航母 <b>${composition.carrier}</b></span><span>舰队航空支援 <b>${composition.airSupport ? "有" : "无"}</b></span><small>双方舰种数量完全对称。真正航母舰体尚未实装，因此不会用其他舰型冒充。</small>`;
    if (weatherHost) {
      const selectedWeather = WEATHER_PRESETS[this.selectedWeatherId];
      weatherHost.innerHTML = `<label class="weather-select-field"><span>天气</span><select class="weather-select" aria-label="选择战斗天气">${WEATHER_IDS.map((id) => {
        const weather = WEATHER_PRESETS[id];
        return `<option value="${id}" ${id === this.selectedWeatherId ? "selected" : ""}>${weather.name}</option>`;
      }).join("")}</select></label><div class="weather-selection-summary"><b>${selectedWeather.name}</b><small>${selectedWeather.description}</small><em><span>能见度</span> ${Math.round(selectedWeather.opticalVisibilityMultiplier * 100)}%</em></div>`;
      weatherHost.querySelector<HTMLSelectElement>(".weather-select")?.addEventListener("change", (event) => {
        this.selectedWeatherId = (event.currentTarget as HTMLSelectElement).value as WeatherId;
        this.renderBattleSetup();
      });
    }
    if (buildHost) {
      buildHost.innerHTML = this.profile.savedShipBuilds.map((entry) => {
        const readiness = savedBuildReadiness(this.profile, entry);
        const state = this.t(readiness.ready ? "装备完整" : readiness.missingSlots.length ? "未达到最低出海配置" : "缺少库存组件");
        return `<button type="button" data-battle-build="${entry.id}" class="${entry.id === this.profile.selectedBattleBuildId ? "active" : ""}" ${readiness.ready ? "" : "disabled"}><b>${this.localizedBuildName(entry)}</b><span>${this.localizedShipClassName(entry.shipClassId)}</span><small>${state}</small></button>`;
      }).join("") || "<p>请先到船坞保存一套舰船方案。</p>";
      for (const button of buildHost.querySelectorAll<HTMLButtonElement>("[data-battle-build]")) {
        button.addEventListener("click", () => {
          this.profile = selectBattleBuild(this.profile, button.dataset.battleBuild ?? "");
          this.callbacks.onProfileChange(this.profile);
          this.dockPanel.inspect(this.profile.selectedBattleBuildId ?? undefined);
          this.renderBattleSetup();
        });
      }
    }
    const ready = Boolean(build && savedBuildReadiness(this.profile, build).ready);
    if (confirm) confirm.disabled = !ready || Boolean(this.callbacks.isProfileLocked?.());
    if (status) status.textContent = ready
      ? `${this.localizedBuildName(build!)} · ${this.selectedFleetSize}v${this.selectedFleetSize} · ${this.t(WEATHER_PRESETS[this.selectedWeatherId].name)}`
      : this.t("请先选择一套装备完整的舰船方案");
    this.applyLocale();
  }

  private confirmBattleSetup(): void {
    const buildId = this.profile.selectedBattleBuildId;
    const build = buildId ? this.profile.savedShipBuilds.find(({ id }) => id === buildId) : undefined;
    if (!buildId || !build || !savedBuildReadiness(this.profile, build).ready) return;
    this.start({ mode: "battle", buildId, teamSize: this.selectedFleetSize, weatherId: this.selectedWeatherId });
  }

  private decorateEquipmentCards(
    root: HTMLElement,
    selector: string,
    dataKey: "armoryItem" | "warehouseItem" | "item",
  ): void {
    for (const card of root.querySelectorAll<HTMLElement>(selector)) {
      const id = card.dataset[dataKey];
      const item = id ? EQUIPMENT_BY_ID[id] : undefined;
      if (item && dataKey === "item") {
        const slots = this.profile.slotLoadoutsByShipClass[this.profile.shipClassId][item.category];
        card.classList.toggle("installed", slots.includes(item.id));
      }
      const icon = card.querySelector(":scope > i");
      if (!item || !icon) continue;
      icon.insertAdjacentHTML("afterend", equipmentArtworkMarkup(item));
      icon.remove();
    }
  }

  private decorateEquipmentDetail(
    root: HTMLElement,
    item: EquipmentDefinition,
  ): void {
    const icon = root.querySelector(".detail-heading > i");
    if (!icon) return;
    icon.insertAdjacentHTML("afterend", equipmentArtworkMarkup(item, "detail"));
    icon.remove();
  }

  private localizedEquipment(item: EquipmentDefinition): EquipmentDefinition { return { ...item, ...equipmentLocale(this.settings.locale, item.id) }; }

  private equipmentTextMarkup(item: EquipmentDefinition, field: "name" | "origin" | "description" | "modelName"): string {
    const value = equipmentLocale(this.settings.locale, item.id)[field]
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return `<span data-i18n-keyed data-equipment-id="${item.id}" data-equipment-field="${field}">${value}</span>`;
  }

  private t(source: string): string {
    return translateGameText(source, this.settings.locale);
  }

  private localizedShipClassName(shipClassId: ShipClassId): string {
    const shipClass = SHIP_CLASSES[shipClassId];
    return this.settings.locale === "zh-CN" || this.settings.locale === "zh-TW"
      ? shipClass.name
      : shipClass.englishName;
  }

  private localizedBuildName(build: SavedShipBuild): string {
    const suffix = build.id === "default-fletcher" || build.id.startsWith("standard-")
      ? "标准配置"
      : build.id === "legacy-current" ? "继承配置" : undefined;
    return suffix
      ? `${this.localizedShipClassName(build.shipClassId)} ${this.t(suffix)}`
      : build.name;
  }

  private localizeNodes(...roots: (Element | null | undefined)[]): void {
    for (const root of roots) if (root) localizeElement(root, this.settings.locale);
  }

  private applyLocale(): void {
    this.multiplayerMenu.setLocale(this.settings.locale);
    const settings = this.startOverlay.querySelector<HTMLElement>(".main-open-settings");
    if (settings) settings.textContent = voyageText(this.settings.locale, "settings");
    const replay = this.settingsOverlay.querySelector<HTMLElement>(".replay-voyage");
    if (replay) replay.textContent = voyageText(this.settings.locale, "replayTutorial");
    applyDocumentLocale(this.settings.locale);
    for (const node of this.startOverlay.querySelectorAll<HTMLElement>("[data-equipment-id][data-equipment-field]")) {
      const id = node.dataset.equipmentId!;
      const field = node.dataset.equipmentField;
      if (EQUIPMENT_BY_ID[id] && (field === "name" || field === "origin" || field === "description" || field === "modelName")) {
        node.textContent = equipmentLocale(this.settings.locale, id)[field];
      }
    }
    localizeElement(document.body, this.settings.locale);
    for (const selector of this.languageSelectors) selector.value = this.settings.locale;
    document.body.dataset.locale = this.settings.locale;
  }

  setMultiplayerLobby(snapshot: import("../net/lobbyState").LobbySnapshot, localPeerId: string): void {
    this.multiplayerMenu.setLobby(snapshot, localPeerId);
  }

  showMultiplayerLobby(snapshot: import("../net/lobbyState").LobbySnapshot, localPeerId: string): void {
    this.showStart();
    this.multiplayerMenu.setLobby(snapshot, localPeerId);
    this.openMultiplayerMenu();
  }

  private setArmoryView(view: "catalog" | "inventory"): void {
    this.armoryView = view;
    for (const panel of this.startOverlay.querySelectorAll<HTMLElement>("[data-armory-view]")) {
      panel.hidden = panel.dataset.armoryView !== view;
    }
    for (const button of this.startOverlay.querySelectorAll<HTMLButtonElement>("[data-armory-view-button]")) {
      const active = button.dataset.armoryViewButton === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
  }

  private emitProfile(): boolean { const saved = this.callbacks.onProfileChange(normalizeLocalProfile(this.profile)); this.renderProfile(); return saved !== false; }
  private setStartTab(tab: StartTab): void {
    const enteringDock = tab === "dock" && this.panels.dock.hidden;
    for (const [id, panel] of Object.entries(this.panels)) panel.hidden = id !== tab;
    for (const button of this.tabButtons) { const active = button.dataset.menuTab === tab; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); }
    if (tab === "store") this.setArmoryView(this.armoryView);
    if (tab === "dock") {
      if (enteringDock) this.dockPanel.inspect(this.profile.selectedBattleBuildId ?? undefined); else this.dockPanel.render();
      setTimeout(() => this.dockPreview.resize(), 0);
    }
  }
  private start(request: GameLaunchRequest): void { if (this.callbacks.onStart(request) !== false) this.startOverlay.hidden = true; }
  openPause(): void { this.pauseOpen = true; this.settingsOpen = false; this.pauseOverlay.hidden = false; this.settingsOverlay.hidden = true; this.callbacks.onPause(); }
  private resume(): void { this.pauseOpen = false; this.pauseOverlay.hidden = true; this.callbacks.onResume(); }
  private restart(): void { this.closeAll(); this.callbacks.onRestart(); }
  private exitToMenu(): void { this.showStart(); this.callbacks.onExitToMenu(); }
  private openSettings(): void { if (this.pauseOpen) this.settingsFromStart = false; this.settingsOpen = true; this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = false; const back = this.settingsOverlay.querySelector<HTMLElement>(".settings-back"); if (back) back.textContent = this.t(this.settingsFromStart ? "返回主菜单" : "返回暂停菜单"); }
  private backToPause(): void { this.settingsOpen = false; this.settingsOverlay.hidden = true; this.pauseOverlay.hidden = this.settingsFromStart; }
  handleEscape(): void { if (this.settingsOpen) this.backToPause(); else if (this.pauseOpen) this.resume(); else this.openPause(); }
  isOpen(): boolean { return !this.startOverlay.hidden || this.pauseOpen || this.settingsOpen; }
  isSettingsOpen(): boolean { return this.settingsOpen; }
  closeAll(): void { this.startOverlay.hidden = true; this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = true; this.pauseOpen = false; this.settingsOpen = false; }
  setProfile(profile: LocalProfile): void { this.profile = normalizeLocalProfile(profile); this.commanderName.value = this.profile.commanderName; this.renderProfile(); }
  showDock(shipClassId?: ShipClassId, buildId?: string): void { this.showStart(); this.setStartTab("dock"); if (shipClassId) this.dockPanel.showLastBattle(shipClassId, buildId); else this.dockPanel.inspect(buildId ?? this.profile.selectedBattleBuildId ?? undefined); }
  setLanGuidance(reason: LanGuidanceReason): void { this.multiplayerMenu.setGuidance(reason); }
  showMultiplayerDirectory(): void { this.showStart(); this.multiplayerMenu.returnToDirectory(); this.openMultiplayerMenu(); }
  refreshProfileLock(): void { this.commanderName.disabled = Boolean(this.callbacks.isProfileLocked?.()); this.renderProfile(); }
  showStart(): void { this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = true; this.startOverlay.hidden = false; this.pauseOpen = false; this.settingsOpen = false; this.closeBattleSetup(); this.closeMultiplayerMenu(); this.setStartTab("mission"); }
  setQuality(quality: "low" | "medium"): void { for (const button of this.qualityButtons) button.classList.toggle("active", button.dataset.quality === quality); }
  private emitSettings(): void { this.updateSensitivityLabels(); this.applyLocale(); this.callbacks.onSettingsChange({ ...this.settings }); }
  private updateSensitivityLabels(): void { this.steeringValue.textContent = `${Math.round(this.settings.steeringSensitivity * 100)}%`; this.aimValue.textContent = `${Math.round(this.settings.aimSensitivity * 100)}%`; this.masterVolumeValue.textContent = `${Math.round(this.settings.masterVolume * 100)}%`; this.muteAudio.textContent = this.settings.muted ? "静音：开" : "静音：关"; this.muteAudio.setAttribute("aria-pressed", String(this.settings.muted)); this.muteAudio.classList.toggle("active", this.settings.muted); for (const button of this.uiSoundButtons) { const active = button.dataset.uiSoundStyle === this.settings.uiSoundStyle; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); } }
}
