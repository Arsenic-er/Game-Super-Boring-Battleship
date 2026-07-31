import type { LocalProfile, SupplyDrawResult } from "../profile/localProfile";
import {
  battleLoadout,
  drawSupplies,
  equipComponent,
  guaranteeProgress,
  installedCopies,
  normalizeLocalProfile,
  purchaseComponent,
  researchComponent,
  salvageComponent,
  selectShipClass,
  sellComponent,
  setCommanderName,
} from "../profile/localProfile";
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
import type { GameSettings } from "../settings/gameSettings";
import type { GameMode } from "../sim/types";
import { DockPreview } from "../render/dockPreview";

export interface GameMenuCallbacks {
  onStart: (mode: GameMode) => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
  onSettingsChange: (settings: GameSettings) => void;
  onQualityChange: (quality: "low" | "medium") => void;
  onProfileChange: (profile: LocalProfile) => void;
}

type StartTab = "mission" | "store" | "inventory" | "dock" | "codex";
const hullTotalSlots = (shipClassId: ShipClassId): number =>
  Object.values(SHIP_CLASS_SLOT_COUNTS[shipClassId]).reduce((total, count) => total + count, 0);

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
  private readonly tabButtons: HTMLButtonElement[];
  private readonly panels: Record<StartTab, HTMLElement>;
  private readonly commanderName: HTMLInputElement;
  private readonly credits: HTMLElement;
  private readonly researchPoints: HTMLElement;
  private readonly supplyTokens: HTMLElement;
  private readonly materialSummary: HTMLElement;
  private readonly guaranteePanel: HTMLElement;
  private readonly drawResults: HTMLElement;
  private readonly inventoryGrid: HTMLElement;
  private readonly componentDetail: HTMLElement;
  private readonly armoryGrid: HTMLElement;
  private readonly armoryDetail: HTMLElement;
  private readonly armoryNotice: HTMLElement;
  private readonly warehouseGrid: HTMLElement;
  private readonly warehouseDetail: HTMLElement;
  private readonly warehouseNotice: HTMLElement;
  private readonly codexBody: HTMLElement;
  private readonly dockPreview: DockPreview;
  private settings: GameSettings;
  private profile: LocalProfile;
  private activeCategory: EquipmentCategory | "all" = "all";
  private selectedItemId?: string;
  private armoryCategory: EquipmentCategory | "all" = "all";
  private warehouseCategory: EquipmentCategory | "all" = "all";
  private selectedArmoryItemId?: string;
  private selectedWarehouseItemId?: string;
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
            <button type="button" role="tab" data-menu-tab="inventory" aria-selected="false"><i class="fa-solid fa-warehouse"></i> 仓库</button>
            <button type="button" role="tab" data-menu-tab="dock" aria-selected="false"><i class="fa-solid fa-ship"></i> 船坞</button>
            <button type="button" role="tab" data-menu-tab="codex" aria-selected="false"><i class="fa-solid fa-book"></i> 图鉴</button>
          </div>
          <div class="menu-tab-panel mission-panel" data-menu-panel="mission">
            <p class="eyebrow">单人战术原型 · 1943</p><h1>灰海行动</h1>
            <p>使用当前船坞配装出击，或进入海试场验证舰船性能。</p>
            <div class="mission-brief">击沉敌舰，或控制中央 A 区率先达到 200 分。双方争夺时，舰体状态更好的一方会缓慢建立区域优势。当前本地配装会真实影响战斗性能。</div>
            <div class="menu-controls">
              <span><kbd>W S</kbd> 航速</span><span><kbd>A D</kbd> 转向</span><span><kbd>移动鼠标</kbd> 视角</span>
              <span><kbd>R</kbd> 瞄准</span><span><kbd>Space</kbd> 开火</span><span><kbd>4</kbd> 损管优先</span><span><kbd>H</kbd> 舰体抢修</span>
              <span><kbd>M</kbd> 地图</span><span><kbd>F3</kbd> 调试</span><span><kbd>Esc</kbd> 暂停</span>
            </div>
            <div class="mode-choice">
              <button class="mode-card start-battle" type="button"><b>单人战斗</b><span>10 分钟 · 击沉或 200 分获胜 · 对抗 AI</span></button>
              <button class="mode-card start-trials" type="button"><b>舰船测试模式</b><span>无攻击 AI · 无时间限制 · 测试装配性能</span></button>
            </div>
          </div>
          <div class="menu-tab-panel store-panel" data-menu-panel="store" hidden>
            <div class="screen-heading"><div><p class="eyebrow">纯游戏内资源 · 常驻明码兑换</p><h2>舰队军械库</h2></div><button class="text-button open-codex" type="button">查看完整组件表</button></div>
            <div class="store-layout">
              <aside class="armory-nav"><h3>常驻分类</h3><div class="armory-filters"></div><p class="ethical-store-note"><i class="fa-solid fa-shield-heart"></i> 无现金货币、无会员、无限时促销。所有战斗组件均可定向研发和购买。</p><button class="open-warehouse" type="button">前往仓库管理</button></aside>
              <section class="armory-catalog"><div class="armory-toolbar"><h3>历史舰装目录</h3><span>研发解锁 → 银币与材料采购</span></div><div class="armory-grid"></div><p class="armory-notice" aria-live="polite"></p></section>
              <aside class="armory-side"><div class="armory-detail"></div><section class="battle-supply"><h3><i class="fa-solid fa-box-open"></i> 免费战斗补给</h3><p>补给券只能通过有效战斗获得，不能购买。全部组件也可在上方直接研发采购。</p><div class="draw-actions"><button class="draw-once" type="button">开启 1 张</button><button class="draw-ten" type="button">开启 10 张</button></div><div class="guarantee-panel"></div><div class="draw-results" aria-live="polite"></div></section></aside>
            </div>
          </div>
          <div class="menu-tab-panel inventory-panel" data-menu-panel="inventory" hidden>
            <div class="screen-heading"><div><p class="eyebrow">无限容量 · 免费保管</p><h2>舰队仓库</h2></div><span>已安装件与最后一套基础组件受保护</span></div>
            <div class="warehouse-layout">
              <aside class="warehouse-nav"><h3>仓库筛选</h3><div class="warehouse-filters"></div><p>出售重复件可回收银币；拆解重复件可获得定向采购所需零件。</p><button class="open-dock" type="button">前往船坞配装</button></aside>
              <section class="warehouse-catalog"><div class="armory-toolbar"><h3>持有组件</h3><span class="warehouse-count"></span></div><div class="warehouse-grid"></div><p class="warehouse-notice" aria-live="polite"></p></section>
              <aside class="warehouse-detail"></aside>
            </div>
          </div>
          <div class="menu-tab-panel dock-panel" data-menu-panel="dock" hidden>
            <div class="screen-heading"><div><p class="eyebrow">模块化船坞蓝图</p><h2>舰队船坞</h2></div><span class="dock-save-state">配装自动保存至本机</span></div>
            <div class="dock-layout">
              <aside class="hull-list"><h3>更换舰体</h3>${hullOptionsMarkup()}<div class="slot-list"></div></aside>
              <section class="dock-blueprint"><canvas class="dock-preview" aria-label="可旋转舰艇船坞预览"></canvas><div class="dock-callouts"></div><small>拖动舰船预览可旋转 · 滚轮缩放</small></section>
              <aside class="component-library"><h3>组件库</h3><div class="component-filters"></div><div class="inventory-grid"></div><div class="component-detail"></div></aside>
            </div>
          </div>
          <div class="menu-tab-panel codex-panel" data-menu-panel="codex" hidden>
            <div class="screen-heading"><div><p class="eyebrow">二战舰装档案</p><h2>组件图鉴</h2></div><span>边框表示舰装档位 · 名称采用历史型号</span></div>
            <div class="codex-table-wrap"><table class="codex-table"><thead><tr><th>类别</th><th>常备舰装</th><th>改装舰装</th><th>精锐舰装</th><th>舰队试验</th><th>当前舰型</th></tr></thead><tbody></tbody></table></div>
            <p class="codex-note">历史鱼雷与侧炮型号已接入实际战斗性能；轻巡洋舰和战列舰的侧炮会在火控连续确认目标后自动接战。防空炮等待舰载机系统。</p>
          </div>
        </section>
      </div>
      <div class="game-menu-overlay pause-menu" hidden><section class="game-menu-card" role="dialog" aria-modal="true" aria-label="暂停菜单"><p class="eyebrow">战斗暂停</p><h2>舰桥指令</h2><p>战场模拟已暂停。舰装更换需返回主菜单。</p><div class="menu-buttons"><button class="menu-button primary resume-battle" type="button">返回战斗</button><button class="menu-button open-settings" type="button">设置</button><button class="menu-button danger restart-battle" type="button">重新开始</button><button class="menu-button exit-main-menu" type="button">退出到主菜单</button></div></section></div>
      <div class="game-menu-overlay settings-menu" hidden><section class="game-menu-card" role="dialog" aria-modal="true" aria-label="游戏设置"><p class="eyebrow">游戏设置</p><h2>操控与画面</h2><div class="settings-group"><label>操控灵敏度</label><div class="sensitivity-row"><span>转向</span><input class="menu-steering" type="range" min="35" max="100" step="5" /><output class="menu-steering-value">100%</output></div><div class="sensitivity-row"><span>瞄准</span><input class="menu-aim" type="range" min="50" max="200" step="10" /><output class="menu-aim-value">100%</output></div></div><div class="settings-group"><label>画面质量</label><div class="quality-options"><button class="quality-option" type="button" data-quality="low">低（推荐）</button><button class="quality-option" type="button" data-quality="medium">中</button></div></div><div class="menu-buttons"><button class="menu-button settings-back" type="button">返回暂停菜单</button></div></section></div>`;
    while (container.firstElementChild) parent.append(container.firstElementChild);

    const audioSettings = document.createElement("div");
    audioSettings.className = "settings-group audio-settings";
    audioSettings.innerHTML = `<label>声音</label><div class="sensitivity-row"><span>主音量</span><input class="menu-master-volume" type="range" min="0" max="100" step="5" aria-label="主音量" /><output class="menu-master-volume-value">70%</output></div><div class="quality-options"><button class="quality-option menu-mute-audio" type="button" aria-pressed="false">静音：关</button></div>`;
    parent.querySelector(".settings-menu .menu-buttons")?.before(audioSettings);

    const find = <T extends Element>(selector: string): T => {
      const element = parent.querySelector<T>(selector);
      if (!element) throw new Error(`Missing game menu element: ${selector}`);
      return element;
    };
    this.startOverlay = find(".start-menu"); this.pauseOverlay = find(".pause-menu"); this.settingsOverlay = find(".settings-menu");
    this.steering = find(".menu-steering"); this.aim = find(".menu-aim"); this.masterVolume = find(".menu-master-volume"); this.muteAudio = find(".menu-mute-audio"); this.steeringValue = find(".menu-steering-value"); this.aimValue = find(".menu-aim-value"); this.masterVolumeValue = find(".menu-master-volume-value");
    this.qualityButtons = Array.from(parent.querySelectorAll("[data-quality]")); this.tabButtons = Array.from(parent.querySelectorAll("[data-menu-tab]"));
    this.panels = { mission: find(".mission-panel"), store: find(".store-panel"), inventory: find(".inventory-panel"), dock: find(".dock-panel"), codex: find(".codex-panel") };
    this.commanderName = find(".commander-name"); this.credits = find(".profile-credits"); this.researchPoints = find(".profile-research"); this.supplyTokens = find(".profile-tokens"); this.materialSummary = find(".material-summary");
    this.guaranteePanel = find(".guarantee-panel"); this.drawResults = find(".draw-results"); this.inventoryGrid = find(".inventory-grid"); this.componentDetail = find(".component-detail");
    this.armoryGrid = find(".armory-grid"); this.armoryDetail = find(".armory-detail"); this.armoryNotice = find(".armory-notice");
    this.warehouseGrid = find(".warehouse-grid"); this.warehouseDetail = find(".warehouse-detail"); this.warehouseNotice = find(".warehouse-notice"); this.codexBody = find(".codex-table tbody");
    this.dockPreview = new DockPreview(find(".dock-preview"));
    this.steering.value = String(Math.round(this.settings.steeringSensitivity * 100)); this.aim.value = String(Math.round(this.settings.aimSensitivity * 100)); this.masterVolume.value = String(Math.round(this.settings.masterVolume * 100)); this.commanderName.value = this.profile.commanderName;
    this.renderStaticContent(); this.updateSensitivityLabels(); this.setQuality(initialQuality); this.renderProfile(); this.setStartTab("mission");

    find<HTMLButtonElement>(".start-battle").addEventListener("click", () => this.start("battle"));
    find<HTMLButtonElement>(".start-trials").addEventListener("click", () => this.start("sea-trials"));
    find<HTMLButtonElement>(".resume-battle").addEventListener("click", () => this.resume()); find<HTMLButtonElement>(".open-settings").addEventListener("click", () => this.openSettings());
    find<HTMLButtonElement>(".restart-battle").addEventListener("click", () => this.restart()); find<HTMLButtonElement>(".exit-main-menu").addEventListener("click", () => this.exitToMenu()); find<HTMLButtonElement>(".settings-back").addEventListener("click", () => this.backToPause());
    find<HTMLButtonElement>(".draw-once").addEventListener("click", () => this.draw(1)); find<HTMLButtonElement>(".draw-ten").addEventListener("click", () => this.draw(10)); find<HTMLButtonElement>(".open-codex").addEventListener("click", () => this.setStartTab("codex"));
    find<HTMLButtonElement>(".open-warehouse").addEventListener("click", () => this.setStartTab("inventory"));
    find<HTMLButtonElement>(".open-dock").addEventListener("click", () => this.setStartTab("dock"));
    for (const button of this.tabButtons) button.addEventListener("click", () => this.setStartTab((button.dataset.menuTab as StartTab) ?? "mission"));
    for (const button of parent.querySelectorAll<HTMLButtonElement>("[data-ship-class-id]")) {
      button.addEventListener("click", () => {
        const shipClassId = button.dataset.shipClassId as ShipClassId;
        this.profile = selectShipClass(this.profile, shipClassId);
        this.emitProfile();
      });
    }
    this.commanderName.addEventListener("change", () => { this.profile = setCommanderName(this.profile, this.commanderName.value); this.commanderName.value = this.profile.commanderName; this.emitProfile(); });
    this.steering.addEventListener("input", () => { this.settings = { ...this.settings, steeringSensitivity: Number(this.steering.value) / 100 }; this.emitSettings(); });
    this.aim.addEventListener("input", () => { this.settings = { ...this.settings, aimSensitivity: Number(this.aim.value) / 100 }; this.emitSettings(); });
    this.masterVolume.addEventListener("input", () => { this.settings = { ...this.settings, masterVolume: Number(this.masterVolume.value) / 100 }; this.emitSettings(); });
    this.muteAudio.addEventListener("click", () => { this.settings = { ...this.settings, muted: !this.settings.muted }; this.emitSettings(); });
    for (const button of this.qualityButtons) button.addEventListener("click", () => { const quality = button.dataset.quality === "medium" ? "medium" : "low"; this.setQuality(quality); this.callbacks.onQualityChange(quality); });
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
    this.renderHullSlots();
    const callouts = this.startOverlay.querySelector<HTMLElement>(".dock-callouts");
    if (callouts) callouts.innerHTML = categories.filter(([category]) => category !== "sideGun").map(([, meta], index) => `<span class="callout c${index}"><i class="${meta.icon}"></i>${meta.label}</span>`).join("");
    const filters = this.startOverlay.querySelector<HTMLElement>(".component-filters");
    if (filters) {
      filters.innerHTML = `<button class="active" data-category="all">全部</button>${categories.map(([category, meta]) => `<button data-category="${category}" title="${meta.label}"><i class="${meta.icon}"></i></button>`).join("")}`;
      for (const button of filters.querySelectorAll<HTMLButtonElement>("button")) button.addEventListener("click", () => { this.activeCategory = (button.dataset.category as EquipmentCategory | "all") ?? "all"; for (const item of filters.querySelectorAll("button")) item.classList.toggle("active", item === button); this.renderDock(); });
    }
    this.renderCodex();
  }

  private renderHullSlots(): void {
    const slots = this.startOverlay.querySelector<HTMLElement>(".slot-list");
    if (!slots) return;
    const counts = SHIP_CLASS_SLOT_COUNTS[this.profile.shipClassId];
    const loadout = this.profile.slotLoadoutsByShipClass[this.profile.shipClassId];
    const shipClass = SHIP_CLASSES[this.profile.shipClassId];
    slots.innerHTML = (Object.entries(CATEGORY_META) as [
      EquipmentCategory,
      typeof CATEGORY_META[EquipmentCategory],
    ][]).map(([category, meta]) => {
      const filled = loadout[category].filter(Boolean).length;
      const note = category === "depthCharge" && counts[category] > 0 ? "<small>无水下目标 · 战斗中暂不可用</small>" : "";
      return `<div class="${counts[category] === 0 ? "locked" : filled < counts[category] ? "partially-filled" : ""}"><i class="${meta.icon}"></i><span>${meta.label}${note}</span><b>${counts[category] === 0 ? "锁定" : `${filled}/${counts[category]}`}</b></div>`;
    }).join("") + `<p class="stock-armament"><b>${shipClass.englishName}</b><span>${shipClass.role}</span><small>${shipClass.historicalArmament}</small></p>`;
  }

  private renderCodex(): void {
    const counts = SHIP_CLASS_SLOT_COUNTS[this.profile.shipClassId];
    this.codexBody.innerHTML = (Object.entries(CATEGORY_META) as [
      EquipmentCategory,
      typeof CATEGORY_META[EquipmentCategory],
    ][]).map(([category, meta]) => `<tr><th><i class="${meta.icon}"></i>${meta.label}</th>${(["common", "purple", "gold", "redGold"] as EquipmentRarity[]).map((rarity) => { const item = EQUIPMENT_BY_ID[`${category}-${rarity}`]; return `<td class="rarity-${rarity}"><b>${item.name}</b><small>${item.origin}<br>${equipmentSummary(item)}</small></td>`; }).join("")}<td>${counts[category] > 0 ? `可装 ×${counts[category]}` : "不可安装"}</td></tr>`).join("");
  }

  private renderProfile(): void {
    this.credits.textContent = this.profile.credits.toLocaleString("zh-CN");
    this.researchPoints.textContent = this.profile.researchPoints.toLocaleString("zh-CN");
    this.supplyTokens.textContent = String(this.profile.supplyTokens);
    this.materialSummary.textContent = `钢材 ${this.profile.materials.steel} · 零件 ${this.profile.materials.parts}`;
    for (const button of this.startOverlay.querySelectorAll<HTMLButtonElement>("[data-ship-class-id]")) {
      button.classList.toggle("active", button.dataset.shipClassId === this.profile.shipClassId);
    }
    this.renderHullSlots();
    this.renderCodex();
    this.renderStore(); this.renderWarehouse(); this.renderDock();
    const equipment = battleLoadout(this.profile);
    this.dockPreview.setShipClass(equipment.shipClassId);
    this.dockPreview.setMainGun(equipment.mainGunId);
    this.dockPreview.setTorpedo(equipment.torpedoId);
  }

  private renderStore(): void {
    const listed = EQUIPMENT_CATALOG.filter((item) => this.armoryCategory === "all" || item.category === this.armoryCategory);
    if (!this.selectedArmoryItemId || !listed.some((item) => item.id === this.selectedArmoryItemId)) this.selectedArmoryItemId = listed[0]?.id;
    this.armoryGrid.innerHTML = listed.map((item) => {
      const unlocked = Boolean(this.profile.unlockedEquipment[item.id]);
      const owned = this.profile.inventory[item.id] ?? 0;
      const cost = item.purchaseCost;
      return `<button class="armory-item rarity-${item.rarity}${unlocked ? " researched" : " locked"}" data-armory-item="${item.id}" type="button"><i class="${CATEGORY_META[item.category].icon}"></i><span>${item.name}</span><small>${item.origin}</small><b>${unlocked ? `${cost.credits.toLocaleString("zh-CN")} 银币` : `${item.researchCost} 研发解锁`}</b><em>持有 ×${owned}</em></button>`;
    }).join("");
    for (const button of this.armoryGrid.querySelectorAll<HTMLButtonElement>("[data-armory-item]")) {
      button.addEventListener("click", () => { this.selectedArmoryItemId = button.dataset.armoryItem; this.renderStore(); });
    }
    const selected = this.selectedArmoryItemId ? EQUIPMENT_BY_ID[this.selectedArmoryItemId] : undefined;
    if (selected) this.renderArmoryDetail(selected);
    this.guaranteePanel.innerHTML = `<h4>公开保底</h4>${([10, 50, 100] as const).map((threshold) => { const rarity: EquipmentRarity = threshold === 10 ? "purple" : threshold === 50 ? "gold" : "redGold"; const progress = guaranteeProgress(this.profile.drawCount, threshold); return `<div class="guarantee rarity-${rarity}"><div><span>${threshold} 次</span><b>${progress}/${threshold}</b></div><i><em style="width:${progress / threshold * 100}%"></em></i></div>`; }).join("")}<p>仅使用免费战斗补给券 · 累计 ${this.profile.drawCount} 次</p>`;
    const recent = this.profile.recentDraws;
    this.drawResults.innerHTML = recent.length ? recent.slice(0, 3).map((result) => this.resultMarkup(result)).join("") : "<small>尚无补给记录</small>";
    for (const button of this.startOverlay.querySelectorAll<HTMLButtonElement>(".draw-once,.draw-ten")) button.disabled = this.profile.supplyTokens < (button.classList.contains("draw-ten") ? 10 : 1);
  }

  private priceMarkup(item: EquipmentDefinition): string {
    const cost = item.purchaseCost;
    return `<span><i class="fa-solid fa-coins"></i>${cost.credits.toLocaleString("zh-CN")}</span>${cost.steel ? `<span>钢材 ${cost.steel}</span>` : ""}${cost.parts ? `<span>零件 ${cost.parts}</span>` : ""}`;
  }

  private renderArmoryDetail(item: EquipmentDefinition): void {
    const unlocked = Boolean(this.profile.unlockedEquipment[item.id]);
    const cost = item.purchaseCost;
    const affordable = this.profile.credits >= cost.credits
      && this.profile.materials.steel >= cost.steel
      && this.profile.materials.parts >= cost.parts;
    const currentId = this.profile.loadout[item.category];
    const current = currentId ? EQUIPMENT_BY_ID[currentId] : undefined;
    const difference = item.bonus - (current?.bonus ?? 0);
    const compatibility = isEquipmentCompatible(item, this.profile.shipClassId)
      ? `当前${SHIP_CLASSES[this.profile.shipClassId].name}可装`
      : "当前舰型无可用槽位";
    this.armoryDetail.innerHTML = `<div class="detail-heading rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><div><b>${item.name}</b><small>${CATEGORY_META[item.category].label} · ${item.origin}</small></div></div><p>${item.description}</p><dl>${equipmentDetailRows(item)}<div><dt>当前装备</dt><dd>${current?.name ?? "无"}</dd></div><div><dt>相对核心增益</dt><dd class="${difference >= 0 ? "stat-positive" : "stat-negative"}">${difference >= 0 ? "+" : ""}${Math.round(difference * 100)}%</dd></div><div><dt>适配</dt><dd>${compatibility}</dd></div><div><dt>当前持有</dt><dd>×${this.profile.inventory[item.id] ?? 0}</dd></div></dl><div class="armory-price">${unlocked ? this.priceMarkup(item) : `<span><i class="fa-solid fa-flask"></i>${item.researchCost} 研发资料</span>`}</div><button class="armory-action" type="button" ${unlocked && !affordable ? "disabled" : ""}>${unlocked ? affordable ? "采购组件" : "资源不足" : this.profile.researchPoints >= item.researchCost ? "研发解锁" : "研发资料不足"}</button>`;
    const action = this.armoryDetail.querySelector<HTMLButtonElement>(".armory-action");
    if (!action) return;
    action.disabled = action.disabled || (!unlocked && this.profile.researchPoints < item.researchCost);
    action.addEventListener("click", () => {
      const transaction = unlocked
        ? purchaseComponent(this.profile, item.id)
        : researchComponent(this.profile, item.id);
      this.armoryNotice.textContent = transaction.success
        ? unlocked ? `已采购：${item.name}` : `研发完成：${item.name}`
        : "交易未完成，请检查资源与研发状态。";
      if (transaction.success) { this.profile = transaction.profile; this.emitProfile(); }
    });
  }

  private resultMarkup(result: SupplyDrawResult): string {
    if (result.kind === "material") return `<span class="draw-result rarity-common"><i class="fa-solid fa-cubes"></i><b>${result.material === "steel" ? "钢材" : "零件"}</b><small>+${result.amount}</small></span>`;
    const item = result.itemId ? EQUIPMENT_BY_ID[result.itemId] : undefined;
    return item ? `<span class="draw-result rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><b>${item.name}</b><small>${item.origin}</small></span>` : "";
  }

  private draw(count: 1 | 10): void {
    const outcome = drawSupplies(this.profile, count); if (!outcome.results.length) return; this.profile = outcome.profile; this.emitProfile();
    this.drawResults.classList.remove("reveal"); requestAnimationFrame(() => this.drawResults.classList.add("reveal"));
  }

  private renderWarehouse(): void {
    const owned = EQUIPMENT_CATALOG.filter((item) =>
      (this.profile.inventory[item.id] ?? 0) > 0
      && (this.warehouseCategory === "all" || item.category === this.warehouseCategory));
    if (!this.selectedWarehouseItemId || !owned.some((item) => item.id === this.selectedWarehouseItemId)) this.selectedWarehouseItemId = owned[0]?.id;
    const total = Object.values(this.profile.inventory).reduce((sum, count) => sum + count, 0);
    const count = this.startOverlay.querySelector<HTMLElement>(".warehouse-count");
    if (count) count.textContent = `${owned.length} 型号 · ${total} 件组件`;
    this.warehouseGrid.innerHTML = owned.map((item) => {
      const installed = installedCopies(this.profile, item.id);
      const quantity = this.profile.inventory[item.id] ?? 0;
      return `<button class="warehouse-item rarity-${item.rarity}${installed ? " installed" : ""}" data-warehouse-item="${item.id}" type="button"><i class="${CATEGORY_META[item.category].icon}"></i><span>${item.name}</span><small>${item.origin}</small><b>×${quantity}</b><em>${installed ? `已安装 ×${installed}` : quantity > 1 ? "有重复件" : "在库"}</em></button>`;
    }).join("") || '<p class="empty-inventory">该分类暂无组件</p>';
    for (const button of this.warehouseGrid.querySelectorAll<HTMLButtonElement>("[data-warehouse-item]")) {
      button.addEventListener("click", () => { this.selectedWarehouseItemId = button.dataset.warehouseItem; this.renderWarehouse(); });
    }
    const item = this.selectedWarehouseItemId ? EQUIPMENT_BY_ID[this.selectedWarehouseItemId] : undefined;
    if (!item) { this.warehouseDetail.innerHTML = "<p>选择组件查看库存详情</p>"; return; }
    const quantity = this.profile.inventory[item.id] ?? 0;
    const installed = installedCopies(this.profile, item.id);
    const disposable = Math.max(0, quantity - installed);
    const baselineProtected = item.rarity === "common" && quantity <= 1;
    const canRecycle = disposable > 0 && !baselineProtected;
    const currentId = this.profile.loadout[item.category];
    const current = currentId ? EQUIPMENT_BY_ID[currentId] : undefined;
    const difference = item.bonus - (current?.bonus ?? 0);
    this.warehouseDetail.innerHTML = `<div class="detail-heading rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><div><b>${item.name}</b><small>${CATEGORY_META[item.category].label} · ${item.origin}</small></div></div><p>${item.description}</p><dl>${equipmentDetailRows(item)}<div><dt>当前装备</dt><dd>${current?.name ?? "无"}</dd></div><div><dt>相对核心增益</dt><dd class="${difference >= 0 ? "stat-positive" : "stat-negative"}">${difference >= 0 ? "+" : ""}${Math.round(difference * 100)}%</dd></div><div><dt>持有 / 已安装</dt><dd>${quantity} / ${installed}</dd></div><div><dt>可处理</dt><dd>${canRecycle ? disposable : 0}</dd></div></dl><div class="warehouse-actions"><button class="warehouse-sell" type="button" ${canRecycle ? "" : "disabled"}>出售 1 件 · +${item.sellCredits} 银币</button><button class="warehouse-salvage" type="button" ${canRecycle ? "" : "disabled"}>拆解 1 件 · +${item.salvageParts} 零件</button></div><small class="warehouse-protection">${canRecycle ? "只处理未安装的副本。" : installed ? "舰队预设中的副本已安装，无法处理。" : "最后一套基础组件受到保护。"}</small>`;
    const transact = (mode: "sell" | "salvage"): void => {
      const result = mode === "sell"
        ? sellComponent(this.profile, item.id)
        : salvageComponent(this.profile, item.id);
      this.warehouseNotice.textContent = result.success
        ? mode === "sell" ? `已出售：${item.name}` : `已拆解：${item.name}`
        : "无法处理已安装组件或最后一套基础组件。";
      if (result.success) { this.profile = result.profile; this.emitProfile(); }
    };
    this.warehouseDetail.querySelector<HTMLButtonElement>(".warehouse-sell")?.addEventListener("click", () => transact("sell"));
    this.warehouseDetail.querySelector<HTMLButtonElement>(".warehouse-salvage")?.addEventListener("click", () => transact("salvage"));
  }

  private renderDock(): void {
    const owned = EQUIPMENT_CATALOG.filter((item) => (this.profile.inventory[item.id] ?? 0) > 0 && (this.activeCategory === "all" || item.category === this.activeCategory));
    if (!this.selectedItemId || !owned.some((item) => item.id === this.selectedItemId)) this.selectedItemId = owned[0]?.id;
    this.inventoryGrid.innerHTML = owned.map((item) => { const installed = this.profile.loadout[item.category] === item.id; return `<button class="inventory-item rarity-${item.rarity}${installed ? " installed" : ""}" data-item="${item.id}" type="button"><i class="${CATEGORY_META[item.category].icon}"></i><span>${item.name}</span><small>${CATEGORY_META[item.category].label} · ${item.origin} · ×${this.profile.inventory[item.id]}</small></button>`; }).join("") || '<p class="empty-inventory">该分类暂无组件</p>';
    for (const button of this.inventoryGrid.querySelectorAll<HTMLButtonElement>("[data-item]")) button.addEventListener("click", () => { this.selectedItemId = button.dataset.item; this.renderDock(); });
    const item = this.selectedItemId ? EQUIPMENT_BY_ID[this.selectedItemId] : undefined;
    if (!item) { this.componentDetail.innerHTML = "<p>选择组件查看详情</p>"; return; }
    const compatible = isEquipmentCompatible(item, this.profile.shipClassId);
    const slots = this.profile.slotLoadoutsByShipClass[this.profile.shipClassId][item.category];
    const filled = slots.filter(Boolean).length;
    this.componentDetail.innerHTML = `<div class="detail-heading rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><div><b>${item.name}</b><small>${CATEGORY_META[item.category].label} · ${item.origin}</small></div></div><p>${item.description}</p><dl>${equipmentDetailRows(item)}<div><dt>适配</dt><dd>${compatible ? SHIP_CLASSES[this.profile.shipClassId].name : "当前舰级不可用"}</dd></div><div><dt>槽位占用</dt><dd>${filled}/${slots.length}</dd></div></dl><button class="equip-selected" type="button" ${!compatible ? "disabled" : ""}>${compatible ? filled < slots.length ? "安装到空槽" : "替换首个槽位" : "该舰级不可安装"}</button>`;
    this.componentDetail.querySelector<HTMLButtonElement>(".equip-selected")?.addEventListener("click", () => { this.profile = equipComponent(this.profile, item.id); this.emitProfile(); });
  }

  private emitProfile(): void { this.renderProfile(); this.callbacks.onProfileChange(normalizeLocalProfile(this.profile)); }
  private setStartTab(tab: StartTab): void { for (const [id, panel] of Object.entries(this.panels)) panel.hidden = id !== tab; for (const button of this.tabButtons) { const active = button.dataset.menuTab === tab; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); } if (tab === "dock") setTimeout(() => this.dockPreview.resize(), 0); }
  private start(mode: GameMode): void { this.startOverlay.hidden = true; this.callbacks.onStart(mode); }
  openPause(): void { this.pauseOpen = true; this.settingsOpen = false; this.pauseOverlay.hidden = false; this.settingsOverlay.hidden = true; this.callbacks.onPause(); }
  private resume(): void { this.pauseOpen = false; this.pauseOverlay.hidden = true; this.callbacks.onResume(); }
  private restart(): void { this.closeAll(); this.callbacks.onRestart(); }
  private exitToMenu(): void { this.showStart(); this.callbacks.onExitToMenu(); }
  private openSettings(): void { this.settingsOpen = true; this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = false; }
  private backToPause(): void { this.settingsOpen = false; this.settingsOverlay.hidden = true; this.pauseOverlay.hidden = false; }
  handleEscape(): void { if (this.settingsOpen) this.backToPause(); else if (this.pauseOpen) this.resume(); else this.openPause(); }
  isOpen(): boolean { return !this.startOverlay.hidden || this.pauseOpen || this.settingsOpen; }
  closeAll(): void { this.startOverlay.hidden = true; this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = true; this.pauseOpen = false; this.settingsOpen = false; }
  setProfile(profile: LocalProfile): void { this.profile = normalizeLocalProfile(profile); this.renderProfile(); }
  showStart(): void { this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = true; this.startOverlay.hidden = false; this.pauseOpen = false; this.settingsOpen = false; this.setStartTab("mission"); }
  setQuality(quality: "low" | "medium"): void { for (const button of this.qualityButtons) button.classList.toggle("active", button.dataset.quality === quality); }
  private emitSettings(): void { this.updateSensitivityLabels(); this.callbacks.onSettingsChange({ ...this.settings }); }
  private updateSensitivityLabels(): void { this.steeringValue.textContent = `${Math.round(this.settings.steeringSensitivity * 100)}%`; this.aimValue.textContent = `${Math.round(this.settings.aimSensitivity * 100)}%`; this.masterVolumeValue.textContent = `${Math.round(this.settings.masterVolume * 100)}%`; this.muteAudio.textContent = this.settings.muted ? "静音：开" : "静音：关"; this.muteAudio.setAttribute("aria-pressed", String(this.settings.muted)); this.muteAudio.classList.toggle("active", this.settings.muted); }
}
