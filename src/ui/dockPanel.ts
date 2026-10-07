import { CATEGORY_META, EQUIPMENT_BY_ID, EQUIPMENT_CATALOG, SHIP_CLASS_SLOT_COUNTS, isEquipmentCompatible } from "../profile/equipmentCatalog";
import type { EquipmentCategory } from "../profile/equipmentCatalog";
import { autoEquipBestOwnedComponents, equipComponent, installedCopies, normalizeLocalProfile, selectShipClass, type LocalProfile, type SavedShipBuild } from "../profile/localProfile";
import { resolveEquipmentSlot } from "../profile/automaticEquipmentSlot";
import { deleteShipBuild, overwriteShipBuild, saveCurrentShipBuild, savedBuildReadiness, selectBattleBuild } from "../profile/savedBuilds";
import { SHIP_CLASSES, type ShipClassId } from "../ships/classes";
import { getMainBattery } from "../ships/mainBatteries";
import { equipmentLocale, shipClassLocale } from "../i18n/equipmentLocale";
import { localizeElement, translateGameText, type GameLocale } from "../i18n/gameLocale";
import { voyageText, type VoyageMessageKey } from "../i18n/voyageLocale";
import { DockPreview, type DockComponentHover } from "../render/dockPreview";
import { PORT_MOTION, portVisibility } from "./portMotion";
import { resolveLoadoutVisualPlan } from "../render/loadoutVisualPlan";
import { equipmentArtworkMarkup } from "./equipmentArtwork";

const categories = Object.keys(CATEGORY_META) as EquipmentCategory[];
const html = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));

export function loadBuildIntoEditor(profile: LocalProfile, build: SavedShipBuild): LocalProfile {
  const next = selectShipClass(profile, build.shipClassId);
  return normalizeLocalProfile({ ...next, selectedBattleBuildId: profile.selectedBattleBuildId,
    slotLoadoutsByShipClass: { ...next.slotLoadoutsByShipClass, [build.shipClassId]: structuredClone(build.slots) },
    loadout: Object.fromEntries(categories.map((category) => [category, build.slots[category].find(Boolean) ?? null])),
  });
}

export class DockPanel {
  private category: EquipmentCategory | "all" = "all";
  private selectedItemId?: string;
  private selectedSlotIndex?: number;
  private selectedSlotCategory?: EquipmentCategory;
  private inspectionBuildId?: string;
  private editingShipClassId: ShipClassId;
  private planKey = "";
  private previewGeneration = 0;
  private readonly viewState: HTMLElement;
  private noticeSource = "配装自动保存至本机";
  private noticeKey?: VoyageMessageKey;
  private readonly hoverTooltip: HTMLElement;

  constructor(private readonly host: HTMLElement, private readonly preview: DockPreview,
    private readonly getProfile: () => LocalProfile, private readonly getLocale: () => GameLocale,
    private readonly isLocked: () => boolean, private readonly onChange: (next: LocalProfile) => void | boolean) {
    this.editingShipClassId = getProfile().shipClassId;
    this.viewState = document.createElement("div"); this.viewState.className = "dock-view-state";
    this.viewState.setAttribute("data-i18n-keyed", "");
    for (const element of host.querySelectorAll(".slot-list,.saved-build-list,.component-filters,.inventory-grid,.component-detail,.dock-callouts,.dock-preview-status,.dock-save-state,[data-ship-class-id]")) {
      element.setAttribute("data-i18n-keyed", "");
    }
    host.querySelector(".screen-heading")?.after(this.viewState);
    host.querySelector<HTMLElement>(".dock-callouts")!.innerHTML = '<div class="dock-hover-tooltip" role="tooltip" data-i18n-keyed hidden></div>';
    this.hoverTooltip = host.querySelector<HTMLElement>(".dock-hover-tooltip")!;
    this.preview.setComponentHoverCallback?.((hover) => this.showHover(hover));
    host.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button || button.disabled) return;
      const data = button.dataset;
      if (data.dockCategory) { if (data.dockCategory !== this.category) this.clearSlotSelection(); this.category = data.dockCategory as typeof this.category; this.render(); }
      if (data.item) {
        if (EQUIPMENT_BY_ID[data.item]?.category !== this.selectedSlotCategory) this.clearSlotSelection();
        this.selectedItemId = data.item; this.render();
      }
      if (data.dockSlot !== undefined) { this.selectSlot(data.dockSlot); return; }
      if (data.buildInspect) { this.clearSlotSelection(); this.inspectionBuildId = data.buildInspect; this.render(); }
      if (data.dockAction === "edit") { this.clearSlotSelection(); this.inspectionBuildId = undefined; this.render(); }
      if (data.shipClassId && data.shipClassId in SHIP_CLASSES) {
        this.clearSlotSelection(); this.editingShipClassId = data.shipClassId as ShipClassId; this.inspectionBuildId = undefined;
        if (!this.isLocked()) this.onChange(selectShipClass(this.getProfile(), this.editingShipClassId)); else this.render();
        return;
      }
      if (this.isLocked()) return;
      const profile = this.getProfile();
      const editorProfile = () => selectShipClass(profile, this.editingShipClassId);
      if (data.buildSelect) { this.clearSlotSelection(); this.onChange(selectBattleBuild(profile, data.buildSelect)); }
      if (data.buildDelete) { if (this.inspectionBuildId === data.buildDelete) { this.inspectionBuildId = undefined; this.clearSlotSelection(); } this.onChange(deleteShipBuild(profile, data.buildDelete)); }
      if (data.buildOverwrite) this.onChange(overwriteShipBuild(editorProfile(), data.buildOverwrite));
      if (data.buildLoad) {
        const build = profile.savedShipBuilds.find(({ id }) => id === data.buildLoad);
        if (build && savedBuildReadiness(profile, build).ready) { this.clearSlotSelection(); this.inspectionBuildId = undefined; this.editingShipClassId = build.shipClassId; this.onChange(loadBuildIntoEditor(profile, build)); }
      }
      if (button.classList.contains("auto-equip-ship")) { this.clearSlotSelection(); this.inspectionBuildId = undefined; this.onChange(autoEquipBestOwnedComponents(editorProfile()).profile); }
      if (button.classList.contains("save-ship-build")) this.save();
      if (button.classList.contains("equip-selected") && this.selectedItemId && !this.inspectionBuildId) this.onChange(equipComponent(editorProfile(), this.selectedItemId, this.requestedSlot(EQUIPMENT_BY_ID[this.selectedItemId].category)));
    });
  }

  private showHover(hover?: DockComponentHover): void {
    if (!hover || this.host.hidden) { portVisibility(this.hoverTooltip, false, PORT_MOTION.hover); return; }
    const title = equipmentLocale(this.getLocale(), hover.equipmentId).name;
    const category = this.t(CATEGORY_META[hover.category].label);
    this.hoverTooltip.innerHTML = `<b>${html(title)}</b><span>${html(category)}</span>`;
    if (this.hoverTooltip.hidden || this.hoverTooltip.inert) portVisibility(this.hoverTooltip, true, PORT_MOTION.hover);
    const canvas = this.host.querySelector<HTMLCanvasElement>(".dock-preview")!;
    const x = Math.max(8, Math.min(hover.canvasX + 18, canvas.clientWidth - this.hoverTooltip.offsetWidth - 8));
    const y = Math.max(8, Math.min(hover.canvasY - this.hoverTooltip.offsetHeight - 14, canvas.clientHeight - this.hoverTooltip.offsetHeight - 8));
    this.hoverTooltip.style.left = `${x}px`; this.hoverTooltip.style.top = `${y}px`;
  }
  inspectEquipment(category: EquipmentCategory, equipmentId: string, slotIndex?: number): void {
    const item = EQUIPMENT_BY_ID[equipmentId];
    if (slotIndex !== undefined) {
      const { slots, shipClassId } = this.currentLoadout();
      if (!item || item.category !== category || !isEquipmentCompatible(item, shipClassId)
        || !(this.getProfile().inventory[equipmentId] > 0)
        || !resolveEquipmentSlot(slots[category], equipmentId, slotIndex)) return;
    }
    this.clearSlotSelection();
    this.category = category;
    this.selectedItemId = this.getProfile().inventory[equipmentId] > 0 ? equipmentId : undefined;
    if (this.selectedItemId && slotIndex !== undefined) {
      this.selectedSlotCategory = category; this.selectedSlotIndex = slotIndex;
    }
    this.render();
  }
  private clearSlotSelection(): void { this.selectedSlotIndex = undefined; this.selectedSlotCategory = undefined; }
  private requestedSlot(category: EquipmentCategory): number | undefined {
    return this.selectedSlotCategory === category ? this.selectedSlotIndex : undefined;
  }
  private currentLoadout() {
    const profile = this.getProfile();
    const build = profile.savedShipBuilds.find(({ id }) => id === this.inspectionBuildId);
    const shipClassId = build?.shipClassId ?? this.editingShipClassId;
    return { shipClassId, slots: build?.slots ?? profile.slotLoadoutsByShipClass[shipClassId] };
  }
  private selectSlot(value: string): void {
    if (this.isLocked() || this.inspectionBuildId) return;
    const item = this.selectedItemId ? EQUIPMENT_BY_ID[this.selectedItemId] : undefined;
    if (!item) return;
    const { slots, shipClassId } = this.currentLoadout();
    if (!isEquipmentCompatible(item, shipClassId)) return;
    if (value === "auto") this.clearSlotSelection();
    else {
      if (!/^\d+$/.test(value)) return;
      const slotIndex = Number(value);
      if (!resolveEquipmentSlot(slots[item.category], item.id, slotIndex)) return;
      this.selectedSlotCategory = item.category; this.selectedSlotIndex = slotIndex;
    }
    this.render();
    this.host.querySelector<HTMLButtonElement>(`[data-dock-slot="${value}"]`)?.focus?.({ preventScroll: true });
  }
  private updateCandidatePreview(): void {
    const { slots, shipClassId } = this.currentLoadout();
    const candidate = this.selectedItemId ? EQUIPMENT_BY_ID[this.selectedItemId] : undefined;
    const target = candidate && isEquipmentCompatible(candidate, shipClassId)
      ? resolveEquipmentSlot(slots[candidate.category], candidate.id, this.requestedSlot(candidate.category)) : undefined;
    this.preview.previewEquipment(target ? candidate : undefined, target?.slotIndex ?? 0);
  }

  private t(source: string): string { return translateGameText(source, this.getLocale()); }
  private name(build: SavedShipBuild): string {
    const ship = SHIP_CLASSES[build.shipClassId];
    const suffix = build.id === "default-fletcher" || build.id.startsWith("standard-") ? "标准配置" : build.id === "legacy-current" ? "继承配置" : undefined;
    return suffix ? `${this.t(ship.name)} ${this.t(suffix)}` : build.name;
  }
  inspect(buildId?: string): void { this.clearSlotSelection(); this.inspectionBuildId = buildId; this.render(); }
  showLastBattle(shipClassId: ShipClassId, buildId?: string): void {
    this.clearSlotSelection();
    const profile = this.getProfile();
    const build = profile.savedShipBuilds.find(({ id }) => id === buildId);
    this.editingShipClassId = shipClassId;
    if (build && build.shipClassId === shipClassId && savedBuildReadiness(profile, build).ready) this.inspectionBuildId = build.id;
    else this.inspectionBuildId = undefined;
    this.render();
    if (!this.inspectionBuildId && buildId) this.notice("", "buildUnavailable");
  }
  private notice(source: string, key?: VoyageMessageKey): void {
    this.noticeSource = source; this.noticeKey = key; this.renderNotice();
  }
  private renderNotice(): void {
    const element = this.host.querySelector<HTMLElement>(".dock-save-state");
    if (element) element.textContent = this.noticeKey ? voyageText(this.getLocale(), this.noticeKey) : this.t(this.noticeSource);
  }
  private save(): void {
    const input = this.host.querySelector<HTMLInputElement>(".build-name");
    const profile = selectShipClass(this.getProfile(), this.editingShipClassId);
    const ship = SHIP_CLASSES[profile.shipClassId];
    const result = saveCurrentShipBuild(profile, input?.value || `${ship.englishName} ${this.t("配置")} ${profile.savedShipBuilds.length + 1}`);
    if (!result.success) { this.notice(result.reason === "limit" ? "最多保存 24 套方案" : "请输入方案名称"); return; }
    if (this.onChange(result.profile) === false) { this.notice("", "saveFailed"); return; }
    if (input) input.value = "";
    this.notice("方案已保存（本机）");
  }
  render(): void {
    const profile = this.getProfile(); const locale = this.getLocale();
    this.renderNotice();
    const build = profile.savedShipBuilds.find(({ id }) => id === this.inspectionBuildId);
    if (!build && this.inspectionBuildId) { this.inspectionBuildId = undefined; this.clearSlotSelection(); }
    const shipClassId = build?.shipClassId ?? this.editingShipClassId;
    const slots = build?.slots ?? profile.slotLoadoutsByShipClass[shipClassId];
    const ship = SHIP_CLASSES[shipClassId];
    const locked = this.isLocked();
    this.host.classList.toggle("is-inspecting", Boolean(build));
    this.viewState.innerHTML = `<b>${html(voyageText(locale, build ? "inspectingBuild" : "editingLoadout"))}</b><span>${html(build ? this.name(build) : this.t(ship.name))}</span>${build ? `<button type="button" data-dock-action="edit">${html(voyageText(locale, "exitInspection"))}</button>` : ""}`;
    for (const button of this.host.querySelectorAll<HTMLButtonElement>("[data-ship-class-id]")) {
      button.classList.toggle("active", button.dataset.shipClassId === shipClassId); button.disabled = false;
      const item = SHIP_CLASSES[button.dataset.shipClassId as ShipClassId];
      button.querySelector("b")!.textContent = this.t(item.name);
      button.querySelector("span")!.textContent = `${this.t(item.country)} · ${this.t(item.serviceYear)}`;
      const battery = getMainBattery(item.id, "mk1-single", item.starterSlots.mainGun);
      const count = Object.values(SHIP_CLASS_SLOT_COUNTS[item.id]).reduce((total, value) => total + value, 0);
      button.querySelector("small")!.textContent = `${count} ${this.t("槽")} · ${item.maxSpeedKnots} kn · ${(battery.maximumRangeMeters / 1000).toFixed(2)} km ${this.t("主炮")} · ${item.maxHull} HP`;
    }
    const slotHost = this.host.querySelector<HTMLElement>(".slot-list")!;
    slotHost.innerHTML = categories.map((category) => `<div><i class="${CATEGORY_META[category].icon}"></i><span>${html(this.t(CATEGORY_META[category].label))}</span><b>${slots[category].filter(Boolean).length}/${SHIP_CLASS_SLOT_COUNTS[shipClassId][category]}</b></div>`).join("")
      + `<p class="stock-armament"><b>${html(ship.englishName)}</b><small>${html(shipClassLocale(locale, shipClassId).historicalArmament)}</small></p>`;
    const savedHost = this.host.querySelector<HTMLElement>(".saved-build-list")!;
    savedHost.innerHTML = profile.savedShipBuilds.map((entry) => {
      const ready = savedBuildReadiness(profile, entry).ready;
      return `<article class="saved-build-card${profile.selectedBattleBuildId === entry.id ? " selected" : ""}"><div><b>${html(this.name(entry))}</b><span>${html(this.t(ready ? "可出击" : "未达到最低出海配置"))}</span></div><div>
        <button data-build-inspect="${html(entry.id)}">${html(voyageText(locale, "inspectBuild"))}</button>
        <button data-build-load="${html(entry.id)}" ${locked || !ready ? "disabled" : ""}>${html(voyageText(locale, "loadBuild"))}</button>
        <button data-build-select="${html(entry.id)}" ${locked || !ready ? "disabled" : ""}>${html(this.t("设为出击舰"))}</button>
        <button data-build-overwrite="${html(entry.id)}" ${locked || Boolean(build) ? "disabled" : ""}>${html(this.t("以当前配装覆盖"))}</button>
        <button data-build-delete="${html(entry.id)}" ${locked ? "disabled" : ""}>${html(this.t("删除"))}</button></div></article>`;
    }).join("");
    this.host.querySelector<HTMLElement>(".component-filters")!.innerHTML = ["all", ...categories].map((category) => `<button data-dock-category="${category}" class="${category === this.category ? "active" : ""}">${html(this.t(category === "all" ? "全部" : CATEGORY_META[category as EquipmentCategory].label))}</button>`).join("");
    const owned = EQUIPMENT_CATALOG.filter((item) => profile.inventory[item.id] > 0 && (this.category === "all" || item.category === this.category));
    if (this.selectedItemId && !owned.some(({ id }) => id === this.selectedItemId)) this.selectedItemId = undefined;
    this.host.querySelector<HTMLElement>(".inventory-grid")!.innerHTML = owned.map((item) => {
      const text = equipmentLocale(locale, item.id);
      return `<button class="inventory-item rarity-${item.rarity}${slots[item.category].includes(item.id) ? " installed" : ""}${this.selectedItemId === item.id ? " active" : ""}" data-item="${item.id}">${equipmentArtworkMarkup(item)}<span>${html(text.name)}</span><small>${html(text.origin)} · ×${profile.inventory[item.id]}</small></button>`;
    }).join("");
    const item = this.selectedItemId ? EQUIPMENT_BY_ID[this.selectedItemId] : undefined;
    if (!item || (this.selectedSlotIndex !== undefined && (this.selectedSlotCategory !== item.category
      || !resolveEquipmentSlot(slots[item.category], item.id, this.selectedSlotIndex)))) this.clearSlotSelection();
    const detail = this.host.querySelector<HTMLElement>(".component-detail")!;
    if (item) {
      const text = equipmentLocale(locale, item.id); const compatible = isEquipmentCompatible(item, shipClassId);
      const target = compatible ? resolveEquipmentSlot(slots[item.category], item.id, this.requestedSlot(item.category)) : undefined;
      const enoughCopies = target && (slots[item.category][target.slotIndex] === item.id
        || profile.inventory[item.id] > installedCopies(profile, item.id));
      const actionText = !target ? "该舰级不可安装" : !enoughCopies ? "组件不足"
        : target.action === "install" ? "安装到空槽" : this.selectedSlotIndex === undefined ? "替换首个槽位" : "替换所选槽位";
      const slotPicker = compatible && slots[item.category].length > 0 ? `<fieldset class="dock-slot-picker"><legend>${html(this.t("装配位置"))}</legend><div class="dock-slot-options"><button type="button" data-dock-slot="auto" aria-pressed="${this.selectedSlotIndex === undefined}" ${locked || build ? "disabled" : ""}>${html(this.t("自动选择槽位"))}</button>${slots[item.category].map((installed, slotIndex) => `<button type="button" data-dock-slot="${slotIndex}" aria-pressed="${this.selectedSlotIndex === slotIndex}" ${locked || build ? "disabled" : ""}><b>${html(this.t("槽位"))} ${slotIndex + 1}</b><span>${html(installed ? equipmentLocale(locale, installed).name : this.t("空槽"))}</span></button>`).join("")}</div></fieldset>` : "";
      detail.innerHTML = `<div class="detail-heading rarity-${item.rarity}">${equipmentArtworkMarkup(item, "detail")}<div><b>${html(text.name)}</b><small>${html(text.origin)}</small></div></div><p>${html(text.description)}</p><dl><div><dt>${html(this.t("核心增益"))}</dt><dd>+${Math.round(item.bonus * 100)}%</dd></div><div><dt>${html(this.t("槽位占用"))}</dt><dd>${slots[item.category].filter(Boolean).length}/${slots[item.category].length}</dd></div></dl>${slotPicker}<button class="equip-selected" ${locked || !target || !enoughCopies || build ? "disabled" : ""}>${html(this.t(actionText))}</button>`;
    } else detail.textContent = this.t("选择组件查看详情");
    const plan = resolveLoadoutVisualPlan(shipClassId, slots);
    const nextKey = JSON.stringify([shipClassId, slots]);
    if (nextKey !== this.planKey) {
      this.planKey = nextKey; const generation = ++this.previewGeneration;
      void this.preview.setLoadout(plan).then((result) => {
        if (generation !== this.previewGeneration) return;
        if (result.status === "failed") { this.planKey = ""; this.notice("", "buildUnavailable"); }
        this.updateCandidatePreview();
      });
    } else {
      this.updateCandidatePreview();
    }
    this.showHover(this.preview.getComponentHover?.());
    const status = this.host.querySelector<HTMLElement>(".dock-preview-status");
    const previewTarget = item && isEquipmentCompatible(item, shipClassId)
      ? resolveEquipmentSlot(slots[item.category], item.id, this.requestedSlot(item.category)) : undefined;
    if (status) status.textContent = item && previewTarget ? `${this.t(slots[item.category][previewTarget.slotIndex] === item.id ? "当前已安装" : "候选装配预览")} · ${this.t("槽位")} ${previewTarget.slotIndex + 1} · ${equipmentLocale(locale, item.id).name}` : "";
    for (const button of this.host.querySelectorAll<HTMLButtonElement>(".auto-equip-ship,.save-ship-build")) button.disabled = locked || Boolean(build);
    localizeElement(this.host, locale);
    this.host.dispatchEvent?.(new CustomEvent("dock-preview-change"));
  }
}
