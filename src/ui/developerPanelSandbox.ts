import type { ShipClassId } from "../ships/classes";
import type { MainGunId } from "../ships/components";
import type { SecondaryGunId } from "../ships/secondaryGuns";
import type { TorpedoId } from "../ships/torpedoes";
import type { AircraftRole, BattleState, DeveloperShipOverrides, ShipState, Team } from "../sim/types";
import {
  CATEGORY_META,
  EQUIPMENT_BY_ID,
  EQUIPMENT_CATALOG,
  RARITY_META,
  SHIP_CLASS_SLOT_COUNTS,
  isEquipmentCompatible,
  type EquipmentCategory,
  type EquipmentDefinition,
} from "../profile/equipmentCatalog";
import { battleLoadoutFromSlots, type SlotLoadout } from "../profile/localProfile";
import {
  applyDeveloperEquipmentLoadout,
  clearDeveloperEntities,
  developerEquipmentSlotsForShip,
  developerStarterEquipmentSlots,
  enableDeveloperMode,
  refillDeveloperAircraft,
  refillDeveloperWeapons,
  reconfigureDeveloperShip,
  removeDeveloperEntity,
  spawnDeveloperAirSquadron,
  spawnDeveloperShip,
} from "../sim/developerSandbox";
import type { DeveloperLoadout } from "../sim/developerSandbox";

interface DeveloperSandboxPanelContext {
  root: HTMLElement;
  getState: () => BattleState;
  getSelectedShip: () => ShipState | undefined;
  selectShip: (id: string) => void;
  refresh: () => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const equipmentCategories = Object.keys(CATEGORY_META) as EquipmentCategory[];

function equipmentOptions(shipClassId: ShipClassId, category: EquipmentCategory): EquipmentDefinition[] {
  return EQUIPMENT_CATALOG.filter((item) =>
    item.category === category && isEquipmentCompatible(item, shipClassId));
}

function equipmentOption(item: EquipmentDefinition): string {
  return `<option value="${item.id}">${item.name} · ${item.origin}</option>`;
}

function styleEquipmentSelect(control: HTMLSelectElement): void {
  for (const rarity of Object.keys(RARITY_META)) control.classList.remove(`rarity-${rarity}`);
  control.classList.remove("rarity-empty");
  const item = EQUIPMENT_BY_ID[control.value];
  control.classList.add(item ? `rarity-${item.rarity}` : "rarity-empty");
  control.title = item?.description ?? "保留空槽";
}

function readDeveloperEquipmentSlots(root: HTMLElement, shipClassId: ShipClassId): SlotLoadout {
  const slots = developerStarterEquipmentSlots(shipClassId);
  for (const category of equipmentCategories) {
    const count = SHIP_CLASS_SLOT_COUNTS[shipClassId][category];
    if (category === "mainGun" || category === "torpedo") {
      const model = select(root, `[data-dev-equipment-model="${category}"]`)?.value ?? null;
      const requested = Number(input(root, `[data-dev-equipment-count="${category}"]`)?.value ?? 0);
      const installed = clamp(Math.floor(requested), category === "mainGun" && count > 0 ? 1 : 0, count);
      slots[category] = Array.from({ length: count }, (_, index) => index < installed ? model : null);
      continue;
    }
    slots[category] = Array.from({ length: count }, (_, index) =>
      select(root, `[data-dev-equipment-category="${category}"][data-dev-equipment-index="${index}"]`)?.value || null);
  }
  return slots;
}

function updateDeveloperEquipmentSummary(root: HTMLElement, shipClassId: ShipClassId): void {
  const summary = root.querySelector<HTMLElement>('[data-role="developer-equipment-summary"]');
  if (!summary) return;
  const runtime = battleLoadoutFromSlots(shipClassId, readDeveloperEquipmentSlots(root, shipClassId));
  summary.textContent = [
    `主炮 ${runtime.mainGunMounts} 座`,
    `鱼雷 ${runtime.torpedoLauncherMounts} 座`,
    `副炮 ${runtime.secondaryGunIds.length} 座`,
    `防空 ${runtime.antiAirMounts} 座 ×${runtime.antiAirEfficiencyMultiplier.toFixed(2)}`,
    `极速 ×${runtime.maxSpeedMultiplier.toFixed(2)}`,
    `转向 ×${runtime.turnMultiplier.toFixed(2)}`,
    `装填 ×${runtime.reloadMultiplier.toFixed(2)}`,
  ].join(" · ");
}

function renderDeveloperEquipmentControls(
  root: HTMLElement,
  ship: ShipState,
  shipClassId: ShipClassId,
  requested?: SlotLoadout,
): void {
  const container = root.querySelector<HTMLElement>('[data-role="developer-equipment-slots"]');
  if (!container) return;
  const slots = requested ?? (shipClassId === ship.shipClassId
    ? developerEquipmentSlotsForShip(ship)
    : developerStarterEquipmentSlots(shipClassId));
  container.dataset.shipClassId = shipClassId;
  container.innerHTML = equipmentCategories.map((category) => {
    const count = SHIP_CLASS_SLOT_COUNTS[shipClassId][category];
    if (count <= 0) return "";
    const meta = CATEGORY_META[category];
    const options = equipmentOptions(shipClassId, category);
    if (category === "mainGun" || category === "torpedo") {
      const selected = slots[category].find((id): id is string => Boolean(id)) ?? options[0]?.id ?? "";
      const installed = slots[category].filter(Boolean).length;
      const minimum = category === "mainGun" ? 1 : 0;
      return `<div class="dev-equipment-row dev-equipment-model-row">
        <div class="dev-equipment-category"><i class="${meta.icon}"></i><span>${meta.label}</span><small>${count} 个槽位</small></div>
        <label><span>型号</span><select class="dev-equipment-select" data-dev-equipment-model="${category}">${options.map(equipmentOption).join("")}</select></label>
        <label class="dev-equipment-count"><span>安装座数</span><input data-dev-equipment-count="${category}" type="number" min="${minimum}" max="${count}" step="1" value="${clamp(installed, minimum, count)}" /></label>
        <template data-selected="${selected}"></template>
      </div>`;
    }
    return `<div class="dev-equipment-row">
      <div class="dev-equipment-category"><i class="${meta.icon}"></i><span>${meta.label}</span><small>${count} 个槽位</small></div>
      <div class="dev-equipment-slot-list">${Array.from({ length: count }, (_, index) => {
        const selected = slots[category][index] ?? "";
        return `<label><span>槽位 ${index + 1}</span><select class="dev-equipment-select" data-dev-equipment-category="${category}" data-dev-equipment-index="${index}">
          <option value="">— 空槽 —</option>${options.map(equipmentOption).join("")}
        </select><template data-selected="${selected}"></template></label>`;
      }).join("")}</div>
      ${category === "depthCharge" ? '<small class="dev-equipment-caveat">首版各历史型号沿用标准深弹参数</small>' : ""}
    </div>`;
  }).join("");
  for (const template of container.querySelectorAll<HTMLTemplateElement>("template[data-selected]")) {
    const control = template.previousElementSibling instanceof HTMLSelectElement
      ? template.previousElementSibling
      : template.parentElement?.querySelector<HTMLSelectElement>("select");
    if (control && template.dataset.selected) control.value = template.dataset.selected;
    template.remove();
  }
  for (const control of container.querySelectorAll<HTMLSelectElement>("select.dev-equipment-select")) {
    styleEquipmentSelect(control);
    control.addEventListener("change", () => {
      styleEquipmentSelect(control);
      updateDeveloperEquipmentSummary(root, shipClassId);
    });
  }
  for (const control of container.querySelectorAll<HTMLInputElement>("input[data-dev-equipment-count]")) {
    control.addEventListener("input", () => updateDeveloperEquipmentSummary(root, shipClassId));
  }
  updateDeveloperEquipmentSummary(root, shipClassId);
}

function input(root: HTMLElement, selector: string): HTMLInputElement | undefined {
  return root.querySelector<HTMLInputElement>(selector) ?? undefined;
}

function select(root: HTMLElement, selector: string): HTMLSelectElement | undefined {
  return root.querySelector<HTMLSelectElement>(selector) ?? undefined;
}

function ensureDeveloper(ship: ShipState): DeveloperShipOverrides {
  enableDeveloperMode(ship, true);
  return ship.developer!;
}

function setChecked(root: HTMLElement, role: string, checked: boolean): void {
  const control = input(root, `[data-role="${role}"]`);
  if (control) control.checked = checked;
}

function setRange(root: HTMLElement, field: string, value: number, suffix = ""): void {
  const control = input(root, `[data-dev-field="${field}"]`);
  if (!control) return;
  control.value = String(value);
  const output = control.parentElement?.querySelector("output");
  if (output) output.textContent = `${value}${suffix}`;
}

function setSelect(root: HTMLElement, field: string, value: string): void {
  const control = select(root, `[data-loadout="${field}"]`);
  if (control) control.value = value;
}

function setNumber(root: HTMLElement, field: string, value: number): void {
  const control = input(root, `[data-loadout-number="${field}"]`);
  if (control) control.value = String(value);
}

function readLoadout(root: HTMLElement, ship: ShipState): DeveloperLoadout {
  const readSelect = (field: string, fallback: string): string =>
    select(root, `[data-loadout="${field}"]`)?.value || fallback;
  const readNumber = (field: string, fallback: number): number => {
    const value = Number(input(root, `[data-loadout-number="${field}"]`)?.value);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    shipClassId: readSelect("shipClassId", ship.shipClassId) as ShipClassId,
    mainBatteryClassId: readSelect(
      "mainBatteryClassId",
      ship.developer?.mainBatteryClassId ?? ship.shipClassId,
    ) as ShipClassId,
    mainGunId: readSelect("mainGunId", ship.mainGunId) as MainGunId,
    mainGunMounts: readNumber("mainGunMounts", ship.mainBatteryMounts.length),
    torpedoId: readSelect("torpedoId", ship.torpedoId) as TorpedoId,
    torpedoLauncherMounts: readNumber("torpedoLauncherMounts", ship.torpedoLauncherMounts),
    secondaryGunId: readSelect(
      "secondaryGunId",
      ship.secondaryMounts[0]?.definitionId ?? "sideGun-common",
    ) as SecondaryGunId,
    secondaryGunMounts: readNumber("secondaryGunMounts", ship.secondaryMounts.length),
    depthChargeMounts: readNumber("depthChargeMounts", ship.depthChargeMounts),
    antiAirMounts: readNumber("antiAirMounts", ship.antiAirMounts),
    antiAirEfficiencyMultiplier: 1,
    performance: {
      maxSpeedMultiplier: 1,
      accelerationMultiplier: 1,
      turnMultiplier: 1,
      reloadMultiplier: 1,
      magazineRiskMultiplier: 1,
    },
    equipmentSlots: null,
  };
}

export function bindDeveloperSandboxControls(context: DeveloperSandboxPanelContext): void {
  const { root, getState, getSelectedShip, selectShip, refresh } = context;
  input(root, '[data-role="developer-enabled"]')?.addEventListener("change", (event) => {
    const ship = getSelectedShip();
    if (!ship) return;
    enableDeveloperMode(ship, (event.currentTarget as HTMLInputElement).checked);
    refresh();
  });

  const booleanOverrides: Array<[string, keyof DeveloperShipOverrides]> = [
    ["developer-unrestricted", "unrestrictedWeapons"],
    ["developer-infinite", "infiniteAmmunition"],
    ["developer-instant", "instantReload"],
  ];
  for (const [role, field] of booleanOverrides) {
    input(root, `[data-role="${role}"]`)?.addEventListener("change", (event) => {
      const ship = getSelectedShip();
      if (!ship) return;
      const developer = ensureDeveloper(ship);
      developer[field] = (event.currentTarget as HTMLInputElement).checked as never;
      refresh();
    });
  }

  input(root, '[data-dev-field="speedMultiplier"]')?.addEventListener("input", (event) => {
    const ship = getSelectedShip();
    if (!ship) return;
    ensureDeveloper(ship).speedMultiplier = clamp(Number((event.currentTarget as HTMLInputElement).value), .1, 6);
  });
  const forcedSpeed = input(root, '[data-dev-field="forcedSpeedKnots"]');
  const speedLock = input(root, '[data-role="developer-speed-lock"]');
  forcedSpeed?.addEventListener("input", () => {
    const ship = getSelectedShip();
    if (!ship || !speedLock?.checked) return;
    ensureDeveloper(ship).forcedSpeedKnots = clamp(Number(forcedSpeed.value), -40, 200);
  });
  speedLock?.addEventListener("change", () => {
    const ship = getSelectedShip();
    if (!ship) return;
    const developer = ensureDeveloper(ship);
    if (speedLock.checked) developer.forcedSpeedKnots = clamp(Number(forcedSpeed?.value ?? ship.speedKnots), -40, 200);
    else delete developer.forcedSpeedKnots;
    refresh();
  });

  select(root, '[data-loadout="shipClassId"]')?.addEventListener("change", (event) => {
    const ship = getSelectedShip();
    if (!ship) return;
    const shipClassId = (event.currentTarget as HTMLSelectElement).value as ShipClassId;
    renderDeveloperEquipmentControls(root, ship, shipClassId, developerStarterEquipmentSlots(shipClassId));
  });

  const actions = [
    "apply-equipment-loadout",
    "apply-loadout",
    "spawn-ship",
    "spawn-air",
    "remove-entity",
    "clear-dev-entities",
    "reload-all",
    "refill-air",
  ];
  for (const action of actions) {
    root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      const state = getState();
      const ship = getSelectedShip();
      if (action === "apply-equipment-loadout" && ship) {
        const shipClassId = (select(root, '[data-loadout="shipClassId"]')?.value ?? ship.shipClassId) as ShipClassId;
        const replacement = applyDeveloperEquipmentLoadout(
          state,
          ship.id,
          shipClassId,
          readDeveloperEquipmentSlots(root, shipClassId),
        );
        if (replacement) selectShip(replacement.id);
      } else if (action === "apply-loadout" && ship) {
        const replacement = reconfigureDeveloperShip(state, ship.id, readLoadout(root, ship));
        if (replacement) selectShip(replacement.id);
      } else if (action === "spawn-ship") {
        const team = (select(root, '[data-spawn="team"]')?.value ?? "player") as Team;
        const shipClassId = (select(root, '[data-spawn="ship-class"]')?.value ?? "fletcher") as ShipClassId;
        const spawned = spawnDeveloperShip(state, team, shipClassId);
        if (spawned) selectShip(spawned.id);
      } else if (action === "spawn-air") {
        const team = (select(root, '[data-spawn="team"]')?.value ?? "player") as Team;
        const role = (select(root, '[data-spawn="air-role"]')?.value ?? "fighter") as AircraftRole;
        const count = clamp(Number(input(root, '[data-spawn="air-count"]')?.value ?? 5), 1, 12);
        const spawned = spawnDeveloperAirSquadron(state, team, role, count);
        const entity = select(root, '[data-role="entity"]');
        if (spawned && entity) entity.value = spawned.id;
      } else if (action === "remove-entity") {
        const id = select(root, '[data-role="entity"]')?.value;
        if (id) removeDeveloperEntity(state, id);
      } else if (action === "clear-dev-entities") {
        clearDeveloperEntities(state);
      } else if (action === "reload-all" && ship) {
        refillDeveloperWeapons(ship);
      } else if (action === "refill-air" && ship) {
        refillDeveloperAircraft(state, ship.team);
      }
      refresh();
    });
  }
}

export function refreshDeveloperSandboxControls(
  root: HTMLElement,
  state: BattleState,
  ship: ShipState,
): void {
  const developer = ship.developer;
  setChecked(root, "developer-enabled", developer?.enabled === true);
  setChecked(root, "developer-unrestricted", developer?.unrestrictedWeapons === true);
  setChecked(root, "developer-infinite", developer?.infiniteAmmunition === true);
  setChecked(root, "developer-instant", developer?.instantReload === true);
  setChecked(root, "developer-speed-lock", developer?.forcedSpeedKnots !== undefined);
  setRange(root, "speedMultiplier", developer?.speedMultiplier ?? 1, "×");
  setRange(root, "forcedSpeedKnots", developer?.forcedSpeedKnots ?? ship.speedKnots, " kn");

  setSelect(root, "shipClassId", ship.shipClassId);
  setSelect(root, "mainBatteryClassId", developer?.mainBatteryClassId ?? ship.shipClassId);
  setSelect(root, "mainGunId", ship.mainGunId);
  setNumber(root, "mainGunMounts", ship.mainBatteryMounts.length);
  setSelect(root, "torpedoId", ship.torpedoId);
  setNumber(root, "torpedoLauncherMounts", ship.torpedoLauncherMounts);
  setSelect(root, "secondaryGunId", ship.secondaryMounts[0]?.definitionId ?? "sideGun-common");
  setNumber(root, "secondaryGunMounts", ship.secondaryMounts.length);
  setNumber(root, "depthChargeMounts", ship.depthChargeMounts);
  setNumber(root, "antiAirMounts", ship.antiAirMounts);
  renderDeveloperEquipmentControls(root, ship, ship.shipClassId);

  const status = root.querySelector<HTMLElement>('[data-role="sandbox-status"]');
  if (status) {
    const battery = developer?.mainBatteryClassId ?? ship.shipClassId;
    const speed = developer?.forcedSpeedKnots === undefined
      ? `极速 ×${(developer?.speedMultiplier ?? 1).toFixed(1)}`
      : `锁速 ${developer.forcedSpeedKnots.toFixed(0)} kn`;
    status.textContent = developer?.enabled
      ? `已启用 · 主炮方案 ${battery} · ${developer.instantReload ? "快速装填" : "标准装填"} · ${developer.infiniteAmmunition ? "无限弹药" : "有限弹药"} · ${speed}`
      : "未启用：使用正常舰体、装填、弹药与航速规则";
  }

  const entity = select(root, '[data-role="entity"]');
  if (entity && !entity.value && state.ships.length > 0) entity.value = state.ships[0].id;
}
