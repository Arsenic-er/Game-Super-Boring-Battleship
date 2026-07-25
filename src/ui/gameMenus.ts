import type { LocalProfile, SupplyDrawResult } from "../profile/localProfile";
import {
  battleLoadout,
  drawSupplies,
  equipComponent,
  guaranteeProgress,
  normalizeLocalProfile,
  setCommanderName,
} from "../profile/localProfile";
import {
  CATEGORY_META,
  DESTROYER_SLOT_COUNTS,
  EQUIPMENT_BY_ID,
  EQUIPMENT_CATALOG,
} from "../profile/equipmentCatalog";
import type {
  EquipmentCategory,
  EquipmentDefinition,
  EquipmentRarity,
} from "../profile/equipmentCatalog";
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

type StartTab = "mission" | "store" | "dock" | "codex";
const DESTROYER_TOTAL_SLOTS = Object.values(DESTROYER_SLOT_COUNTS)
  .reduce((total, count) => total + count, 0);

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
  private readonly steeringValue: HTMLOutputElement;
  private readonly aimValue: HTMLOutputElement;
  private readonly qualityButtons: HTMLButtonElement[];
  private readonly tabButtons: HTMLButtonElement[];
  private readonly panels: Record<StartTab, HTMLElement>;
  private readonly commanderName: HTMLInputElement;
  private readonly credits: HTMLElement;
  private readonly supplyTokens: HTMLElement;
  private readonly materialSummary: HTMLElement;
  private readonly guaranteePanel: HTMLElement;
  private readonly drawResults: HTMLElement;
  private readonly inventoryGrid: HTMLElement;
  private readonly componentDetail: HTMLElement;
  private readonly codexBody: HTMLElement;
  private readonly dockPreview: DockPreview;
  private settings: GameSettings;
  private profile: LocalProfile;
  private activeCategory: EquipmentCategory | "all" = "all";
  private selectedItemId?: string;
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
              <span><i class="fa-solid fa-coins"></i> 军需 <strong class="profile-credits">0</strong></span>
              <span><i class="fa-solid fa-box"></i> 补给券 <strong class="profile-tokens">0</strong></span>
              <span class="material-summary">钢材 0 · 零件 0</span>
            </div>
          </div>
          <div class="menu-tabs command-tabs" role="tablist" aria-label="主菜单选项卡">
            <button type="button" role="tab" data-menu-tab="mission" aria-selected="true"><i class="fa-solid fa-flag"></i> 出击</button>
            <button type="button" role="tab" data-menu-tab="store" aria-selected="false"><i class="fa-solid fa-cart-shopping"></i> 商店</button>
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
            <div class="screen-heading"><div><p class="eyebrow">军需抽取终端</p><h2>军需商店</h2></div><button class="text-button open-codex" type="button">查看完整组件表</button></div>
            <div class="store-layout">
              <aside class="supply-pool"><h3>物资池详情</h3><p>普通材料与二战历史舰装</p><div class="pool-categories"></div><small>第 10 / 50 / 100 抽分别触发对应档位累计保底；边框标识舰装档位。</small></aside>
              <section class="supply-terminal">
                <i class="fa-solid fa-box-open supply-crate"></i><h3>舰队补给箱</h3><p>获得升级材料或可安装舰装</p>
                <div class="draw-actions"><button class="draw-once" type="button">抽取一次</button><button class="draw-ten primary" type="button">抽取十次</button></div>
                <div class="draw-results" aria-live="polite"></div>
              </section>
              <aside class="guarantee-panel"></aside>
            </div>
          </div>
          <div class="menu-tab-panel dock-panel" data-menu-panel="dock" hidden>
            <div class="screen-heading"><div><p class="eyebrow">模块化船坞蓝图</p><h2>舰队船坞</h2></div><span class="dock-save-state">配装自动保存至本机</span></div>
            <div class="dock-layout">
              <aside class="hull-list"><h3>更换舰体</h3><button class="hull-option active" type="button"><b>驱逐舰 DD-01</b><span>${DESTROYER_TOTAL_SLOTS} 个可用槽位</span></button><button class="hull-option" disabled><b>轻巡洋舰 CL-01</b><span>尚未解锁</span></button><button class="hull-option" disabled><b>战列舰 BB-01</b><span>尚未解锁</span></button><div class="slot-list"></div></aside>
              <section class="dock-blueprint"><canvas class="dock-preview" aria-label="可旋转驱逐舰船坞预览"></canvas><div class="dock-callouts"></div><small>拖动舰船预览可旋转 · 滚轮缩放</small></section>
              <aside class="component-library"><h3>组件库</h3><div class="component-filters"></div><div class="inventory-grid"></div><div class="component-detail"></div></aside>
            </div>
          </div>
          <div class="menu-tab-panel codex-panel" data-menu-panel="codex" hidden>
            <div class="screen-heading"><div><p class="eyebrow">二战舰装档案</p><h2>组件图鉴</h2></div><span>边框表示舰装档位 · 名称采用历史型号</span></div>
            <div class="codex-table-wrap"><table class="codex-table"><thead><tr><th>类别</th><th>常备舰装</th><th>改装舰装</th><th>精锐舰装</th><th>舰队试验</th><th>驱逐舰</th></tr></thead><tbody></tbody></table></div>
            <p class="codex-note">历史鱼雷型号已接入战斗性能与发射器损伤；防空炮和侧炮仍等待对应战斗系统。侧炮仅供轻巡洋舰与战列舰。</p>
          </div>
        </section>
      </div>
      <div class="game-menu-overlay pause-menu" hidden><section class="game-menu-card" role="dialog" aria-modal="true" aria-label="暂停菜单"><p class="eyebrow">战斗暂停</p><h2>舰桥指令</h2><p>战场模拟已暂停。舰装更换需返回主菜单。</p><div class="menu-buttons"><button class="menu-button primary resume-battle" type="button">返回战斗</button><button class="menu-button open-settings" type="button">设置</button><button class="menu-button danger restart-battle" type="button">重新开始</button><button class="menu-button exit-main-menu" type="button">退出到主菜单</button></div></section></div>
      <div class="game-menu-overlay settings-menu" hidden><section class="game-menu-card" role="dialog" aria-modal="true" aria-label="游戏设置"><p class="eyebrow">游戏设置</p><h2>操控与画面</h2><div class="settings-group"><label>操控灵敏度</label><div class="sensitivity-row"><span>转向</span><input class="menu-steering" type="range" min="35" max="100" step="5" /><output class="menu-steering-value">100%</output></div><div class="sensitivity-row"><span>瞄准</span><input class="menu-aim" type="range" min="50" max="200" step="10" /><output class="menu-aim-value">100%</output></div></div><div class="settings-group"><label>画面质量</label><div class="quality-options"><button class="quality-option" type="button" data-quality="low">低（推荐）</button><button class="quality-option" type="button" data-quality="medium">中</button></div></div><div class="menu-buttons"><button class="menu-button settings-back" type="button">返回暂停菜单</button></div></section></div>`;
    while (container.firstElementChild) parent.append(container.firstElementChild);

    const find = <T extends Element>(selector: string): T => {
      const element = parent.querySelector<T>(selector);
      if (!element) throw new Error(`Missing game menu element: ${selector}`);
      return element;
    };
    this.startOverlay = find(".start-menu"); this.pauseOverlay = find(".pause-menu"); this.settingsOverlay = find(".settings-menu");
    this.steering = find(".menu-steering"); this.aim = find(".menu-aim"); this.steeringValue = find(".menu-steering-value"); this.aimValue = find(".menu-aim-value");
    this.qualityButtons = Array.from(parent.querySelectorAll("[data-quality]")); this.tabButtons = Array.from(parent.querySelectorAll("[data-menu-tab]"));
    this.panels = { mission: find(".mission-panel"), store: find(".store-panel"), dock: find(".dock-panel"), codex: find(".codex-panel") };
    this.commanderName = find(".commander-name"); this.credits = find(".profile-credits"); this.supplyTokens = find(".profile-tokens"); this.materialSummary = find(".material-summary");
    this.guaranteePanel = find(".guarantee-panel"); this.drawResults = find(".draw-results"); this.inventoryGrid = find(".inventory-grid"); this.componentDetail = find(".component-detail"); this.codexBody = find(".codex-table tbody");
    this.dockPreview = new DockPreview(find(".dock-preview"));
    this.steering.value = String(Math.round(this.settings.steeringSensitivity * 100)); this.aim.value = String(Math.round(this.settings.aimSensitivity * 100)); this.commanderName.value = this.profile.commanderName;
    this.renderStaticContent(); this.updateSensitivityLabels(); this.setQuality(initialQuality); this.renderProfile(); this.setStartTab("mission");

    find<HTMLButtonElement>(".start-battle").addEventListener("click", () => this.start("battle"));
    find<HTMLButtonElement>(".start-trials").addEventListener("click", () => this.start("sea-trials"));
    find<HTMLButtonElement>(".resume-battle").addEventListener("click", () => this.resume()); find<HTMLButtonElement>(".open-settings").addEventListener("click", () => this.openSettings());
    find<HTMLButtonElement>(".restart-battle").addEventListener("click", () => this.restart()); find<HTMLButtonElement>(".exit-main-menu").addEventListener("click", () => this.exitToMenu()); find<HTMLButtonElement>(".settings-back").addEventListener("click", () => this.backToPause());
    find<HTMLButtonElement>(".draw-once").addEventListener("click", () => this.draw(1)); find<HTMLButtonElement>(".draw-ten").addEventListener("click", () => this.draw(10)); find<HTMLButtonElement>(".open-codex").addEventListener("click", () => this.setStartTab("codex"));
    for (const button of this.tabButtons) button.addEventListener("click", () => this.setStartTab((button.dataset.menuTab as StartTab) ?? "mission"));
    this.commanderName.addEventListener("change", () => { this.profile = setCommanderName(this.profile, this.commanderName.value); this.commanderName.value = this.profile.commanderName; this.emitProfile(); });
    this.steering.addEventListener("input", () => { this.settings = { ...this.settings, steeringSensitivity: Number(this.steering.value) / 100 }; this.emitSettings(); });
    this.aim.addEventListener("input", () => { this.settings = { ...this.settings, aimSensitivity: Number(this.aim.value) / 100 }; this.emitSettings(); });
    for (const button of this.qualityButtons) button.addEventListener("click", () => { const quality = button.dataset.quality === "medium" ? "medium" : "low"; this.setQuality(quality); this.callbacks.onQualityChange(quality); });
  }

  private renderStaticContent(): void {
    const categories = Object.entries(CATEGORY_META) as [EquipmentCategory, typeof CATEGORY_META[EquipmentCategory]][];
    const pool = this.startOverlay.querySelector<HTMLElement>(".pool-categories");
    if (pool) pool.innerHTML = categories.map(([, meta]) => `<span><i class="${meta.icon}"></i>${meta.label}</span>`).join("");
    const slots = this.startOverlay.querySelector<HTMLElement>(".slot-list");
    if (slots) slots.innerHTML = categories.map(([category, meta]) => `<div class="${DESTROYER_SLOT_COUNTS[category] === 0 ? "locked" : ""}"><i class="${meta.icon}"></i><span>${meta.slot}</span><b>${DESTROYER_SLOT_COUNTS[category] === 0 ? "锁定" : `×${DESTROYER_SLOT_COUNTS[category]}`}</b></div>`).join("");
    const callouts = this.startOverlay.querySelector<HTMLElement>(".dock-callouts");
    if (callouts) callouts.innerHTML = categories.filter(([category]) => category !== "sideGun").map(([, meta], index) => `<span class="callout c${index}"><i class="${meta.icon}"></i>${meta.label}</span>`).join("");
    const filters = this.startOverlay.querySelector<HTMLElement>(".component-filters");
    if (filters) {
      filters.innerHTML = `<button class="active" data-category="all">全部</button>${categories.map(([category, meta]) => `<button data-category="${category}" title="${meta.label}"><i class="${meta.icon}"></i></button>`).join("")}`;
      for (const button of filters.querySelectorAll<HTMLButtonElement>("button")) button.addEventListener("click", () => { this.activeCategory = (button.dataset.category as EquipmentCategory | "all") ?? "all"; for (const item of filters.querySelectorAll("button")) item.classList.toggle("active", item === button); this.renderDock(); });
    }
    this.codexBody.innerHTML = categories.map(([category, meta]) => `<tr><th><i class="${meta.icon}"></i>${meta.label}</th>${(["common", "purple", "gold", "redGold"] as EquipmentRarity[]).map((rarity) => { const item = EQUIPMENT_BY_ID[`${category}-${rarity}`]; return `<td class="rarity-${rarity}"><b>${item.name}</b><small>${item.origin}<br>${equipmentSummary(item)}</small></td>`; }).join("")}<td>${DESTROYER_SLOT_COUNTS[category] > 0 ? `可装 ×${DESTROYER_SLOT_COUNTS[category]}` : "不可安装"}</td></tr>`).join("");
  }

  private renderProfile(): void {
    this.credits.textContent = this.profile.credits.toLocaleString("zh-CN"); this.supplyTokens.textContent = String(this.profile.supplyTokens); this.materialSummary.textContent = `钢材 ${this.profile.materials.steel} · 零件 ${this.profile.materials.parts}`;
    this.renderStore(); this.renderDock();
    const equipment = battleLoadout(this.profile);
    this.dockPreview.setMainGun(equipment.mainGunId);
    this.dockPreview.setTorpedo(equipment.torpedoId);
  }

  private renderStore(): void {
    this.guaranteePanel.innerHTML = `<h3>累计保底进度</h3>${([10, 50, 100] as const).map((threshold) => { const rarity: EquipmentRarity = threshold === 10 ? "purple" : threshold === 50 ? "gold" : "redGold"; const progress = guaranteeProgress(this.profile.drawCount, threshold); return `<div class="guarantee rarity-${rarity}"><div><span>${threshold} 抽保底</span><b>${progress} / ${threshold}</b></div><i><em style="width:${progress / threshold * 100}%"></em></i></div>`; }).join("")}<p>总抽取 ${this.profile.drawCount} 次</p>`;
    const recent = this.profile.recentDraws;
    this.drawResults.innerHTML = recent.length ? recent.slice(0, 5).map((result) => this.resultMarkup(result)).join("") : "<small>补给箱尚未开启</small>";
    for (const button of this.startOverlay.querySelectorAll<HTMLButtonElement>(".draw-once,.draw-ten")) button.disabled = this.profile.supplyTokens < (button.classList.contains("draw-ten") ? 10 : 1);
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

  private renderDock(): void {
    const owned = EQUIPMENT_CATALOG.filter((item) => (this.profile.inventory[item.id] ?? 0) > 0 && (this.activeCategory === "all" || item.category === this.activeCategory));
    if (!this.selectedItemId || !owned.some((item) => item.id === this.selectedItemId)) this.selectedItemId = owned[0]?.id;
    this.inventoryGrid.innerHTML = owned.map((item) => { const installed = this.profile.loadout[item.category] === item.id; return `<button class="inventory-item rarity-${item.rarity}${installed ? " installed" : ""}" data-item="${item.id}" type="button"><i class="${CATEGORY_META[item.category].icon}"></i><span>${item.name}</span><small>${CATEGORY_META[item.category].label} · ${item.origin} · ×${this.profile.inventory[item.id]}</small></button>`; }).join("") || '<p class="empty-inventory">该分类暂无组件</p>';
    for (const button of this.inventoryGrid.querySelectorAll<HTMLButtonElement>("[data-item]")) button.addEventListener("click", () => { this.selectedItemId = button.dataset.item; this.renderDock(); });
    const item = this.selectedItemId ? EQUIPMENT_BY_ID[this.selectedItemId] : undefined;
    if (!item) { this.componentDetail.innerHTML = "<p>选择组件查看详情</p>"; return; }
    const compatible = item.compatibleHulls.includes(this.profile.hullId); const installed = this.profile.loadout[item.category] === item.id;
    this.componentDetail.innerHTML = `<div class="detail-heading rarity-${item.rarity}"><i class="${CATEGORY_META[item.category].icon}"></i><div><b>${item.name}</b><small>${CATEGORY_META[item.category].label} · ${item.origin}</small></div></div><p>${item.description}</p><dl>${equipmentDetailRows(item)}<div><dt>适配</dt><dd>${compatible ? "驱逐舰" : "轻巡 / 战列"}</dd></div></dl><button class="equip-selected" type="button" ${installed || !compatible ? "disabled" : ""}>${installed ? "已安装" : compatible ? "安装组件" : "该舰型不可安装"}</button>`;
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
  showStart(): void { this.pauseOverlay.hidden = true; this.settingsOverlay.hidden = true; this.startOverlay.hidden = false; this.pauseOpen = false; this.settingsOpen = false; this.setStartTab("mission"); }
  setQuality(quality: "low" | "medium"): void { for (const button of this.qualityButtons) button.classList.toggle("active", button.dataset.quality === quality); }
  private emitSettings(): void { this.updateSensitivityLabels(); this.callbacks.onSettingsChange({ ...this.settings }); }
  private updateSensitivityLabels(): void { this.steeringValue.textContent = `${Math.round(this.settings.steeringSensitivity * 100)}%`; this.aimValue.textContent = `${Math.round(this.settings.aimSensitivity * 100)}%`; }
}
