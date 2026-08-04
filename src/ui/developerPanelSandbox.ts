import type { ShipClassId } from "../ships/classes";
import type { MainGunId } from "../ships/components";
import type { SecondaryGunId } from "../ships/secondaryGuns";
import type { TorpedoId } from "../ships/torpedoes";
import type { AircraftRole, BattleState, DeveloperShipOverrides, ShipState, Team } from "../sim/types";
import {
  clearDeveloperEntities,
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

  const actions = [
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
      if (action === "apply-loadout" && ship) {
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
