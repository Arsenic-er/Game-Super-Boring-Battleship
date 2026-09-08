import "./developerPanelSandbox.css";
import { COMPARTMENT_MAX_HEALTH, HYDRO, SMOKE } from "../sim/config";
import { getShipClass, SHIP_CLASSES, SHIP_CLASS_IDS, torpedoesPerSalvo } from "../ships/classes";
import { mainBatteryMountCanBear, torpedoLauncherAlignmentError } from "../sim/simulation";
import type { BattleState, CompartmentId, ModuleId, ShipState } from "../sim/types";
import { getTorpedo, TORPEDO_DEFINITIONS } from "../ships/torpedoes";
import { getSecondaryGun, SECONDARY_GUNS } from "../ships/secondaryGuns";
import { getShipArmorProfile } from "../ships/armorProfiles";
import { effectiveMainBattery } from "../ships/mainBatteries";
import { MAIN_GUN_OPTIONS } from "../ships/components";
import {
  bindDeveloperSandboxControls,
  refreshDeveloperSandboxControls,
} from "./developerPanelSandbox";

export type CursorStyle = "neon-arrow" | "neon-hand" | "crosshair";

export interface DeveloperViewStatus {
  active: boolean;
  focusEntityId?: string;
  controlledShipId?: string;
}

export interface DeveloperPanelCallbacks {
  onMutation?: () => void;
  onOpen: () => void;
  onClose: () => void;
  onDebugColliders: (visible: boolean) => void;
  onCursorStyle: (style: CursorStyle) => void;
  onObserveEntity: (id: string) => void;
  onControlShip: (id: string) => void;
  onReleaseControl: () => void;
  getViewStatus: () => DeveloperViewStatus;
}

const moduleLabels: Record<ModuleId, string> = {
  gun: "主炮",
  torpedoTubes: "鱼雷发射器",
  engine: "动力",
  steering: "舵机",
  magazine: "弹药库",
  crew: "人力",
};

const compartmentLabels: Record<CompartmentId, string> = {
  bow: "舰艏",
  bridge: "舰桥",
  engineRoom: "动力舱",
  magazine: "弹药舱",
  stern: "舰艉",
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class DeveloperPanel {
  private readonly element: HTMLElement;
  private readonly shipSelect: HTMLSelectElement;
  private readonly entitySelect: HTMLSelectElement;
  private readonly live: HTMLElement;
  private readonly perception: HTMLElement;
  private readonly torpedoStatus: HTMLElement;
  private readonly secondaryStatus: HTMLElement;
  private readonly armorStatus: HTMLElement;
  private readonly viewStatus: HTMLElement;
  private readonly strategyStatus: HTMLElement;
  private open = false;

  constructor(
    parent: HTMLElement,
    private readonly getState: () => BattleState,
    private readonly callbacks: DeveloperPanelCallbacks,
  ) {
    this.element = document.createElement("aside");
    this.element.className = "developer-panel";
    this.element.hidden = true;
    const shipClassOptions = SHIP_CLASS_IDS.map((id) =>
      `<option value="${id}">${SHIP_CLASSES[id].name} · ${SHIP_CLASSES[id].englishName}</option>`).join("");
    const gunOptions = MAIN_GUN_OPTIONS.map((gun) =>
      `<option value="${gun.id}">${gun.name}</option>`).join("");
    const torpedoOptions = Object.values(TORPEDO_DEFINITIONS).map((torpedo) =>
      `<option value="${torpedo.id}">${torpedo.name}</option>`).join("");
    const secondaryOptions = Object.values(SECONDARY_GUNS).map((gun) =>
      `<option value="${gun.id}">${gun.shortLabel}</option>`).join("");
    this.element.innerHTML = `
      <header><div><small>DEVELOPER TOOLS · F3</small><h2>舰船状态调试器</h2></div><button data-action="close" type="button">×</button></header>
      <label class="dev-select"><span>调试对象</span><select data-role="ship"></select></label>
      <section class="dev-section dev-options dev-sandbox-options">
        <h3>开发者模式</h3>
        <div class="dev-sandbox-status" data-role="sandbox-status">未启用</div>
        <label><input data-role="developer-enabled" type="checkbox" /> 启用所选舰开发者覆盖</label>
        <label><input data-role="developer-unrestricted" type="checkbox" /> 解除舰体武器限制</label>
        <label><input data-role="developer-infinite" type="checkbox" /> 无限鱼雷与深弹</label>
        <label><input data-role="developer-instant" type="checkbox" /> 即时装填（0.2s 安全间隔）</label>
        ${this.devField("speedMultiplier", "极速倍率", .1, 6, .1)}
        <label><input data-role="developer-speed-lock" type="checkbox" /> 锁定绝对航速</label>
        ${this.devField("forcedSpeedKnots", "锁定航速 kn", -40, 200, 1)}
      </section>
      <section class="dev-section dev-equipment-armory">
        <h3>全装备直装</h3>
        <div class="dev-equipment-note">完整装备目录已开放 · 不检查购买、研发、库存或货币 · 仅当前战斗生效</div>
        <label class="dev-select"><span>舰体型号</span><select data-loadout="shipClassId">${shipClassOptions}</select></label>
        <div class="dev-equipment-slots" data-role="developer-equipment-slots"></div>
        <div class="dev-equipment-summary" data-role="developer-equipment-summary">等待选择装备</div>
        <button class="dev-wide-action dev-equipment-apply" data-action="apply-equipment-loadout" type="button">立即装配所选装备</button>
      </section>
      <section class="dev-section dev-loadout">
        <h3>越界实验：舰体与武器</h3>
        <div class="dev-equipment-note">允许跨舰型炮术方案与超量挂载；会退出上方的正式槽位配置。</div>
        <label class="dev-select"><span>主炮方案</span><select data-loadout="mainBatteryClassId">${shipClassOptions}</select></label>
        <label class="dev-select"><span>炮术组件</span><select data-loadout="mainGunId">${gunOptions}</select></label>
        ${this.loadoutNumber("mainGunMounts", "主炮座", 1, 8)}
        <label class="dev-select"><span>鱼雷型号</span><select data-loadout="torpedoId">${torpedoOptions}</select></label>
        ${this.loadoutNumber("torpedoLauncherMounts", "鱼雷座", 0, 8)}
        <label class="dev-select"><span>副炮型号</span><select data-loadout="secondaryGunId">${secondaryOptions}</select></label>
        ${this.loadoutNumber("secondaryGunMounts", "副炮座", 0, 12)}
        ${this.loadoutNumber("depthChargeMounts", "深弹架", 0, 8)}
        ${this.loadoutNumber("antiAirMounts", "防空座", 0, 16)}
        <button class="dev-wide-action" data-action="apply-loadout" type="button">应用越界实验配置</button>
      </section>
      <section class="dev-section dev-entity-tools">
        <h3>战场实体编辑器</h3>
        <label class="dev-select"><span>场上实体</span><select data-role="entity"></select></label>
        <div class="dev-spawn-grid">
          <label>阵营<select data-spawn="team"><option value="player">己方</option><option value="enemy">敌方</option></select></label>
          <label>舰级<select data-spawn="ship-class">${shipClassOptions}</select></label>
          <label>飞机<select data-spawn="air-role"><option value="fighter">战斗机</option><option value="diveBomber">俯冲轰炸机</option><option value="torpedoBomber">鱼雷机</option></select></label>
          <label>飞机数<input data-spawn="air-count" type="number" min="1" max="12" value="5" /></label>
        </div>
        <div class="dev-entity-actions">
          <button data-action="spawn-ship" type="button">＋ 添加舰船</button>
          <button data-action="spawn-air" type="button">＋ 添加机群</button>
          <button class="danger" data-action="remove-entity" type="button">－ 移除所选</button>
          <button class="danger" data-action="clear-dev-entities" type="button">清除新增实体</button>
        </div>
        <div class="dev-view-status" data-role="view-status">开发者视角未启用</div>
        <div class="dev-entity-actions dev-view-actions">
          <button data-action="observe-entity" type="button">观察所选</button>
          <button data-action="control-ship" type="button">接管所选舰船</button>
          <button data-action="release-control" type="button">交还 AI / 返回本舰</button>
        </div>
        <div class="dev-strategy-status" data-role="strategy-status">策略：选择一个舰船或机群</div>
      </section>
      <div class="dev-live" data-role="live">等待状态</div>
      <div class="dev-perception" data-role="perception">感知：无遥测</div>
      <div class="dev-perception" data-role="torpedo">鱼雷：等待状态</div>
      <div class="dev-perception" data-role="secondary">副炮：等待状态</div>
      <div class="dev-perception" data-role="armor">装甲：等待状态</div>
      <section class="dev-section">
        <h3>船体与运动</h3>
        ${this.field("hull", "当前生命", 0, 1000, 1)}
        ${this.field("recoverableHull", "可恢复上限", 0, 1000, 1)}
        ${this.field("fireIntensity", "火势", 0, 100, 1)}
        ${this.field("flooding", "进水", 0, 100, 1)}
        ${this.field("speedKnots", "航速 kn", -20, 100, 0.5)}
        ${this.field("throttle", "车钟", -0.25, 1, 0.05)}
        ${this.field("heading", "航向 °", 0, 359, 1)}
        <div class="dev-coordinates">
          <label>X <input data-number="x" type="number" step="10" /></label>
          <label>Z <input data-number="z" type="number" step="10" /></label>
        </div>
      </section>
      <section class="dev-section">
        <h3>主要模块</h3>
        ${(Object.keys(moduleLabels) as ModuleId[]).map((id) => this.percentField("module", id, moduleLabels[id])).join("")}
      </section>
      <section class="dev-section">
        <h3>舱段生命（非装甲厚度）</h3>
        ${(Object.keys(compartmentLabels) as CompartmentId[]).map((id) => this.percentField("compartment", id, compartmentLabels[id])).join("")}
      </section>
      <section class="dev-section dev-options">
        <h3>显示与测试</h3>
        <label><input data-role="colliders" type="checkbox" checked /> 显示碰撞体积</label>
        <label>游戏光标
          <select data-role="cursor-style">
            <option value="neon-arrow">CC0 霓虹蓝箭头</option>
            <option value="neon-hand">CC0 霓虹蓝手形</option>
            <option value="crosshair">CC0 蓝色准星</option>
          </select>
        </label>
      </section>
      <div class="dev-actions">
        <button data-action="collision" type="button">布置碰撞测试</button>
        <button data-action="critical" type="button">设为重伤</button>
        <button data-action="reset" type="button">完全修复</button>
        <button data-action="sink" type="button">生命归零</button>
        <button data-action="reload-all" type="button">全部武器立即装填</button>
        <button data-action="refill-air" type="button">补满己方飞机资源</button>
        <button data-action="torpedo-reload" type="button">鱼雷立即装填</button>
        <button data-action="torpedo-incoming" type="button">生成来袭鱼雷</button>
        <button data-action="torpedo-clear" type="button">清除水中鱼雷</button>
        <button data-action="smoke-deploy" type="button">立即施放烟幕</button>
        <button data-action="smoke-refill" type="button">补满烟幕次数</button>
        <button data-action="smoke-clear" type="button">清除全部烟幕</button>
        <button data-action="hydro-activate" type="button">立即启动水听</button>
        <button data-action="hydro-refill" type="button">补满水听次数</button>
        <button data-action="hydro-stop" type="button">结束水听</button>
      </div>`;
    parent.append(this.element);
    const shipSelect = this.element.querySelector<HTMLSelectElement>('[data-role="ship"]');
    const entitySelect = this.element.querySelector<HTMLSelectElement>('[data-role="entity"]');
    const sandboxStatus = this.element.querySelector<HTMLElement>('[data-role="sandbox-status"]');
    const live = this.element.querySelector<HTMLElement>('[data-role="live"]');
    const perception = this.element.querySelector<HTMLElement>('[data-role="perception"]');
    const torpedoStatus = this.element.querySelector<HTMLElement>('[data-role="torpedo"]');
    const secondaryStatus = this.element.querySelector<HTMLElement>('[data-role="secondary"]');
    const armorStatus = this.element.querySelector<HTMLElement>('[data-role="armor"]');
    const viewStatus = this.element.querySelector<HTMLElement>('[data-role="view-status"]');
    const strategyStatus = this.element.querySelector<HTMLElement>('[data-role="strategy-status"]');
    if (!shipSelect || !entitySelect || !sandboxStatus || !live || !perception || !torpedoStatus || !secondaryStatus || !armorStatus || !viewStatus || !strategyStatus) throw new Error("Missing developer panel controls");
    this.shipSelect = shipSelect;
    this.entitySelect = entitySelect;
    this.live = live;
    this.perception = perception;
    this.torpedoStatus = torpedoStatus;
    this.secondaryStatus = secondaryStatus;
    this.armorStatus = armorStatus;
    this.viewStatus = viewStatus;
    this.strategyStatus = strategyStatus;
    this.bindControls();
  }

  private field(id: string, label: string, min: number, max: number, step: number): string {
    return `<label class="dev-range"><span>${label}</span><input data-field="${id}" type="range" min="${min}" max="${max}" step="${step}" /><output>0</output></label>`;
  }

  private percentField(kind: "module" | "compartment", id: string, label: string): string {
    return `<label class="dev-range"><span>${label}</span><input data-${kind}="${id}" type="range" min="0" max="100" step="1" /><output>100%</output></label>`;
  }

  private devField(id: string, label: string, min: number, max: number, step: number): string {
    return `<label class="dev-range"><span>${label}</span><input data-dev-field="${id}" type="range" min="${min}" max="${max}" step="${step}" /><output>0</output></label>`;
  }

  private loadoutNumber(id: string, label: string, min: number, max: number): string {
    return `<label class="dev-select"><span>${label}</span><input data-loadout-number="${id}" type="number" min="${min}" max="${max}" step="1" /></label>`;
  }

  private selectedShip(): ShipState | undefined {
    return this.getState().ships.find((ship) => ship.id === this.shipSelect.value);
  }

  private syncShipOptions(): void {
    const ships = this.getState().ships;
    const previous = this.shipSelect.value;
    this.shipSelect.innerHTML = ships.map((ship) =>
      `<option value="${ship.id}">${ship.id === "player" ? "本舰" : ship.team === "player" ? "己方" : ship.aiControlled || ship.id === "enemy" ? "敌方 AI" : "敌方靶舰"} · ${getShipClass(ship.shipClassId).name} · ${ship.id}</option>`
    ).join("");
    if (ships.some((ship) => ship.id === previous)) this.shipSelect.value = previous;
    this.syncEntityOptions();
  }

  private syncEntityOptions(): void {
    const state = this.getState();
    const previous = this.entitySelect.value;
    this.entitySelect.innerHTML = [
      ...state.ships.map((ship) => `<option value="${ship.id}">[舰] ${ship.team === "player" ? "己方" : "敌方"} · ${getShipClass(ship.shipClassId).name} · ${ship.id}</option>`),
      ...state.airSquadrons.map((squadron) => `<option value="${squadron.id}">[航空] ${squadron.team === "player" ? "己方" : "敌方"} · ${squadron.role} · ${squadron.id}</option>`),
    ].join("");
    if ([...state.ships, ...state.airSquadrons].some(({ id }) => id === previous)) {
      this.entitySelect.value = previous;
    }
  }

  private bindControls(): void {
    // Observe UI events before individual handlers mutate the battle; viewing alone stays read-only.
    for (const eventName of ["input", "change"] as const) {
      this.element.addEventListener(eventName, (event) => {
        const control = event.target as HTMLElement;
        if (control.matches("[data-field],[data-module],[data-compartment],[data-number],[data-dev-field],[data-role^='developer-']")) this.callbacks.onMutation?.();
      }, true);
    }
    this.element.addEventListener("click", (event) => {
      const action = (event.target as Element).closest<HTMLElement>("button[data-action]")?.dataset.action;
      if (action && !["close", "observe-entity", "release-control"].includes(action)) this.callbacks.onMutation?.();
    }, true);
    this.element.querySelector('[data-action="close"]')?.addEventListener("click", () => this.close());
    this.shipSelect.addEventListener("change", () => this.refresh());
    this.entitySelect.addEventListener("change", () => {
      const selectedShip = this.getState().ships.find(({ id }) => id === this.entitySelect.value);
      if (selectedShip) this.shipSelect.value = selectedShip.id;
      this.refresh();
    });
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-field]")) {
      input.addEventListener("input", () => {
        const ship = this.selectedShip();
        if (!ship) return;
        const value = Number(input.value);
        const field = input.dataset.field;
        if (field === "hull") ship.hull = clamp(value, 0, ship.maxHull);
        else if (field === "recoverableHull") ship.recoverableHull = clamp(value, ship.hull, ship.maxHull);
        else if (field === "fireIntensity") ship.fireIntensity = clamp(value, 0, 100);
        else if (field === "flooding") ship.flooding = clamp(value, 0, 100);
        else if (field === "speedKnots") ship.speedKnots = clamp(value, -20, 100);
        else if (field === "throttle") ship.throttle = clamp(value, -0.25, 1);
        else if (field === "heading") {
          ship.heading = value * Math.PI / 180;
          ship.turretHeading = ship.heading;
          for (const mount of ship.mainBatteryMounts) mount.heading = ship.heading;
          ship.torpedoLauncherHeading = ship.heading + Math.PI / 2;
        }
        ship.recoverableHull = Math.max(ship.hull, ship.recoverableHull);
        this.updateOutput(input, field === "heading" ? "°" : "");
      });
    }
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-module]")) {
      input.addEventListener("input", () => {
        const ship = this.selectedShip();
        const id = input.dataset.module as ModuleId | undefined;
        if (!ship || !id) return;
        ship.modules[id].health = ship.modules[id].maxHealth * Number(input.value) / 100;
        this.updateOutput(input, "%");
      });
    }
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-compartment]")) {
      input.addEventListener("input", () => {
        const ship = this.selectedShip();
        const id = input.dataset.compartment as CompartmentId | undefined;
        if (!ship || !id) return;
        ship.compartments[id] = COMPARTMENT_MAX_HEALTH[id]
          * getShipClass(ship.shipClassId).compartmentHealthMultiplier
          * Number(input.value) / 100;
        this.updateOutput(input, "%");
      });
    }
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-number]")) {
      input.addEventListener("change", () => {
        const ship = this.selectedShip();
        if (!ship) return;
        if (input.dataset.number === "x") ship.position.x = Number(input.value);
        if (input.dataset.number === "z") ship.position.z = Number(input.value);
        ship.previousPosition = { ...ship.position };
      });
    }
    const colliders = this.element.querySelector<HTMLInputElement>('[data-role="colliders"]');
    colliders?.addEventListener("change", () => this.callbacks.onDebugColliders(Boolean(colliders.checked)));
    const cursor = this.element.querySelector<HTMLSelectElement>('[data-role="cursor-style"]');
    cursor?.addEventListener("change", () => this.callbacks.onCursorStyle(cursor.value as CursorStyle));
    bindDeveloperSandboxControls({
      root: this.element,
      getState: this.getState,
      getSelectedShip: () => this.selectedShip(),
      selectShip: (id) => { this.shipSelect.value = id; },
      refresh: () => this.refresh(),
    });
    for (const button of this.element.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
      button.addEventListener("click", () => this.runAction(button.dataset.action ?? ""));
    }
  }

  private updateOutput(input: HTMLInputElement, suffix: string): void {
    const output = input.parentElement?.querySelector("output");
    if (output) output.textContent = `${input.value}${suffix}`;
  }

  private runAction(action: string): void {
    if (action === "close") return;
    const state = this.getState();
    if (action === "observe-entity") {
      if (this.entitySelect.value) this.callbacks.onObserveEntity(this.entitySelect.value);
      this.close();
      return;
    }
    if (action === "control-ship") {
      if (state.ships.some(({ id, hull }) => id === this.entitySelect.value && hull > 0)) {
        this.callbacks.onControlShip(this.entitySelect.value);
        this.close();
      }
      return;
    }
    if (action === "release-control") {
      this.callbacks.onReleaseControl();
      this.close();
      return;
    }
    if (action === "smoke-clear") {
      state.smokeClouds = [];
    } else if (action === "smoke-deploy") {
      const ship = this.selectedShip();
      if (!ship) return;
      ship.smokeCharges = Math.max(1, ship.smokeCharges);
      ship.smokeCooldownRemaining = 0;
      ship.smokeDeploymentRemaining = SMOKE.deploymentSeconds;
      ship.smokeNextPuffAt = state.time;
    } else if (action === "smoke-refill") {
      const ship = this.selectedShip();
      if (!ship) return;
      ship.smokeCharges = SMOKE.charges;
      ship.smokeCooldownRemaining = 0;
    } else if (action === "hydro-activate") {
      const ship = this.selectedShip();
      if (!ship) return;
      ship.hydroCharges = Math.max(1, ship.hydroCharges);
      ship.hydroCooldownRemaining = 0;
      ship.hydroActiveRemaining = HYDRO.activeSeconds;
      delete state.sensorSnapshots[ship.id];
    } else if (action === "hydro-refill") {
      const ship = this.selectedShip();
      if (!ship) return;
      ship.hydroCharges = HYDRO.charges;
      ship.hydroCooldownRemaining = 0;
    } else if (action === "hydro-stop") {
      const ship = this.selectedShip();
      if (!ship) return;
      ship.hydroActiveRemaining = 0;
      ship.hydroCooldownRemaining = HYDRO.cooldownSeconds;
      delete state.sensorSnapshots[ship.id];
    } else if (action === "torpedo-clear") {
      state.projectiles = state.projectiles.filter((projectile) => projectile.kind !== "torpedo");
    } else if (action === "torpedo-incoming") {
      const ship = this.selectedShip();
      if (!ship) return;
      const torpedo = getTorpedo(ship.torpedoId);
      const origin = { x: ship.position.x + 500, y: 0.35, z: ship.position.z };
      state.projectiles.push({
        id: state.nextEntityId++,
        ownerId: "developer-tools",
        team: ship.team === "player" ? "enemy" : "player",
        kind: "torpedo",
        position: { ...origin },
        previousPosition: { ...origin },
        velocity: { x: -torpedo.speedMetersPerSecond, y: 0, z: 0 },
        damage: torpedo.damage,
        age: 0,
        distanceTravelled: torpedo.armingDistanceMeters + 1,
        armingDistance: torpedo.armingDistanceMeters,
        maximumRange: torpedo.maximumRangeMeters,
        detectionRange: torpedo.detectionRangeMeters,
      });
    } else if (action === "torpedo-reload") {
      const ship = this.selectedShip();
      if (!ship) return;
      ship.torpedoesLoaded = torpedoesPerSalvo(ship.shipClassId, ship.torpedoLauncherMounts);
      ship.torpedoReloadRemaining = 0;
    } else
    if (action === "collision") {
      const player = state.ships.find((ship) => ship.id === "player");
      const target = state.ships.find((ship) => ship.isTestTarget)
        ?? state.ships.find((ship) => ship.id === "enemy");
      if (player && target) {
        player.position = { x: 0, y: 0, z: -130 };
        player.previousPosition = { ...player.position };
        player.heading = 0;
        player.turretHeading = 0;
        for (const mount of player.mainBatteryMounts) mount.heading = 0;
        player.torpedoLauncherHeading = Math.PI / 2;
        player.speedKnots = 26;
        player.throttle = 1;
        target.position = { x: 0, y: 0, z: 0 };
        target.previousPosition = { ...target.position };
        target.heading = Math.PI / 2;
        target.turretHeading = target.heading;
        for (const mount of target.mainBatteryMounts) mount.heading = target.heading;
        target.torpedoLauncherHeading = target.heading + Math.PI / 2;
        target.speedKnots = 0;
        target.throttle = 0;
      }
    } else {
      const ship = this.selectedShip();
      if (!ship) return;
      if (action === "reset") this.resetShip(ship);
      if (action === "critical") {
        ship.hull = ship.maxHull * 0.28;
        ship.recoverableHull = ship.maxHull * 0.46;
        ship.fireIntensity = 52;
        ship.flooding = 38;
        for (const module of Object.values(ship.modules)) module.health = module.maxHealth * 0.34;
        for (const mount of ship.mainBatteryMounts) mount.health = mount.maxHealth * 0.34;
      }
      if (action === "sink") ship.hull = 0;
    }
    this.refresh();
  }

  private resetShip(ship: ShipState): void {
    const torpedo = getTorpedo(ship.torpedoId);
    ship.hull = ship.maxHull;
    ship.recoverableHull = ship.maxHull;
    ship.fireIntensity = 0;
    ship.flooding = 0;
    ship.smokeCharges = SMOKE.charges;
    ship.smokeCooldownRemaining = 0;
    ship.smokeDeploymentRemaining = 0;
    ship.hydroCharges = HYDRO.charges;
    ship.hydroCooldownRemaining = 0;
    ship.hydroActiveRemaining = 0;
    ship.ammoType = "he";
    ship.pendingAmmoType = undefined;
    ship.reloadRemaining = 0;
    for (const mount of ship.mainBatteryMounts) {
      mount.reloadRemaining = 0;
      mount.health = mount.maxHealth;
      mount.lastFiredAt = undefined;
    }
    ship.torpedoesLoaded = torpedoesPerSalvo(ship.shipClassId, ship.torpedoLauncherMounts);
    ship.torpedoReserveSalvos = torpedo.reserveSalvos;
    ship.torpedoReloadRemaining = 0;
    for (const mount of ship.secondaryMounts) mount.reloadRemaining = 0;
    ship.secondaryAcquisitionSamples = 0;
    ship.secondaryTargetId = undefined;
    ship.secondaryLastObservationAt = undefined;
    for (const module of Object.values(ship.modules)) module.health = module.maxHealth;
    for (const id of Object.keys(ship.compartments) as CompartmentId[]) {
      ship.compartments[id] = COMPARTMENT_MAX_HEALTH[id]
        * getShipClass(ship.shipClassId).compartmentHealthMultiplier;
    }
  }

  private refresh(): void {
    this.syncShipOptions();
    const ship = this.selectedShip();
    if (!ship) return;
    const status = this.callbacks.getViewStatus();
    this.viewStatus.textContent = status.active
      ? `开发者视角 · 观察 ${status.focusEntityId ?? "—"} · ${status.controlledShipId ? `人工接管 ${status.controlledShipId}` : "仅观察 / 舰船全由 AI 驾驶"}`
      : "开发者视角未启用 · 正常控制本舰";
    const selectedEntityIsShip = this.getState().ships.some(({ id, hull }) =>
      id === this.entitySelect.value && hull > 0);
    const controlButton = this.element.querySelector<HTMLButtonElement>('[data-action="control-ship"]');
    if (controlButton) {
      controlButton.disabled = !selectedEntityIsShip;
      controlButton.title = selectedEntityIsShip ? "接管该舰的车钟、舵与武器" : "飞机只允许观察，仍由 AI 驾驶";
    }
    refreshDeveloperSandboxControls(this.element, this.getState(), ship);
    const values: Record<string, number> = {
      hull: ship.hull,
      recoverableHull: ship.recoverableHull,
      fireIntensity: ship.fireIntensity,
      flooding: ship.flooding,
      speedKnots: ship.speedKnots,
      throttle: ship.throttle,
      heading: (ship.heading * 180 / Math.PI + 360) % 360,
    };
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-field]")) {
      const field = input.dataset.field ?? "";
      input.value = String(values[field] ?? 0);
      this.updateOutput(input, field === "heading" ? "°" : "");
    }
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-module]")) {
      const id = input.dataset.module as ModuleId;
      input.value = String(Math.round(ship.modules[id].health / ship.modules[id].maxHealth * 100));
      this.updateOutput(input, "%");
    }
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-compartment]")) {
      const id = input.dataset.compartment as CompartmentId;
      input.value = String(Math.round(
        ship.compartments[id]
          / (COMPARTMENT_MAX_HEALTH[id] * getShipClass(ship.shipClassId).compartmentHealthMultiplier)
          * 100,
      ));
      this.updateOutput(input, "%");
    }
    const x = this.element.querySelector<HTMLInputElement>('input[data-number="x"]');
    const z = this.element.querySelector<HTMLInputElement>('input[data-number="z"]');
    if (x) x.value = ship.position.x.toFixed(0);
    if (z) z.value = ship.position.z.toFixed(0);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.element.hidden = false;
    this.refresh();
    const colliders = this.element.querySelector<HTMLInputElement>('[data-role="colliders"]');
    this.callbacks.onDebugColliders(Boolean(colliders?.checked));
    this.callbacks.onOpen();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.element.hidden = true;
    this.callbacks.onDebugColliders(false);
    this.callbacks.onClose();
  }

  isOpen(): boolean {
    return this.open;
  }

  update(): void {
    if (!this.open) return;
    const ship = this.selectedShip();
    if (!ship) return;
    const entityId = this.entitySelect.value;
    const entityShip = this.getState().ships.find(({ id }) => id === entityId);
    const entityAir = this.getState().airSquadrons.find(({ id }) => id === entityId);
    if (entityShip) {
      const decision = entityShip.aiDecision;
      this.strategyStatus.textContent = decision
        ? `舰队 AI · ${decision.role} / ${decision.phase} · 目标 ${decision.targetId ?? "无"} · 航向 ${((decision.desiredHeading * 180 / Math.PI + 360) % 360).toFixed(0)}° · 车钟 ${Math.round(decision.throttle * 100)}% · ${decision.fireIntent ? "准备开火" : "保持火力"}${decision.avoidanceReason ? ` · ${decision.avoidanceReason}` : ""}`
        : `舰船 ${entityShip.id} · ${this.callbacks.getViewStatus().controlledShipId === entityShip.id ? "人工接管中" : "等待 AI 决策"}`;
    } else if (entityAir) {
      this.strategyStatus.textContent = `航空 AI · ${entityAir.role} / ${entityAir.phase} · 指令 ${entityAir.order?.kind ?? "自主巡逻"} · 目标 ${entityAir.order?.activeTargetId ?? entityAir.order?.targetId ?? "无"} · 武器 ${entityAir.order?.selectedWeapon ?? "待选择"} · 编队 ${entityAir.aircraftOperational}/${entityAir.aircraftCapacity} · 凝聚 ${(entityAir.cohesion * 100).toFixed(0)}% · 油量 ${Math.max(0, entityAir.fuelRemainingSeconds).toFixed(0)}s`;
    } else {
      this.strategyStatus.textContent = "策略：所选实体已不存在";
    }
    const speedOverride = ship.developer?.enabled && ship.developer.forcedSpeedKnots !== undefined
      ? ` · 开发锁速 ${ship.developer.forcedSpeedKnots.toFixed(0)} kn` : "";
    this.live.textContent = `速度 ${ship.speedKnots.toFixed(1)} kn${speedOverride} · 转向率 ${(ship.turnRateRadians * 180 / Math.PI).toFixed(2)}°/s · 坐标 ${ship.position.x.toFixed(0)}, ${ship.position.z.toFixed(0)} · 水听 ${ship.hydroActiveRemaining > 0 ? `启用 ${ship.hydroActiveRemaining.toFixed(1)}s` : ship.hydroCooldownRemaining > 0 ? `冷却 ${ship.hydroCooldownRemaining.toFixed(0)}s` : `就绪 ${ship.hydroCharges}`}`;
    const tubeRatio = ship.modules.torpedoTubes.health / ship.modules.torpedoTubes.maxHealth;
    const reloadEta = tubeRatio > 0 ? ship.torpedoReloadRemaining / tubeRatio : Number.POSITIVE_INFINITY;
    const relativeLauncher = ((ship.torpedoLauncherHeading - ship.heading) * 180 / Math.PI + 540) % 360 - 180;
    const alignment = torpedoLauncherAlignmentError(ship) * 180 / Math.PI;
    const torpedoSalvoSize = torpedoesPerSalvo(ship.shipClassId, ship.torpedoLauncherMounts);
    this.torpedoStatus.textContent = `鱼雷 · 发射器 ${relativeLauncher >= 0 ? "右" : "左"} ${Math.abs(relativeLauncher).toFixed(1)}° · 偏差 ${alignment.toFixed(1)}° · 管内 ${ship.torpedoesLoaded}/${torpedoSalvoSize} · 备用 ${ship.torpedoReserveSalvos} 组 · 装填 ${Number.isFinite(reloadEta) ? `${reloadEta.toFixed(1)} s` : "已停止"}`;
    const secondaryReloads = ship.secondaryMounts.map((mount) => ({
      side: mount.side,
      seconds: mount.reloadRemaining,
      model: getSecondaryGun(mount.definitionId).shortLabel,
    }));
    const portReload = secondaryReloads.filter((mount) => mount.side === -1)
      .reduce((minimum, mount) => Math.min(minimum, mount.seconds), Number.POSITIVE_INFINITY);
    const starboardReload = secondaryReloads.filter((mount) => mount.side === 1)
      .reduce((minimum, mount) => Math.min(minimum, mount.seconds), Number.POSITIVE_INFINITY);
    this.secondaryStatus.textContent = ship.secondaryMounts.length > 0
      ? `副炮 · ${ship.secondaryBatteryStatus} · 目标 ${ship.secondaryTargetId ?? "无"} · 确认 ${ship.secondaryAcquisitionSamples} 次 · 左/右装填 ${Number.isFinite(portReload) ? portReload.toFixed(1) : "-"}/${Number.isFinite(starboardReload) ? starboardReload.toFixed(1) : "-"} s · ${[...new Set(secondaryReloads.map((mount) => mount.model))].join(" / ")}`
      : "副炮 · 未安装";
    const armor = getShipArmorProfile(ship.shipClassId);
    const battery = effectiveMainBattery(ship);
    const mainTurrets = ship.mainBatteryMounts.map((mount) =>
      `#${mount.mountIndex + 1} ${Math.round(mount.health / mount.maxHealth * 100)}%/${mount.reloadRemaining.toFixed(1)}s/${mainBatteryMountCanBear(ship, mount.mountIndex) ? "射界内" : "遮挡"}`
    ).join(" · ");
    this.armorStatus.textContent = `装甲 · ${armor.scheme} · 侧舷 艏/机舱/弹药库 ${armor.zones.side.bow}/${armor.zones.side.engineRoom}/${armor.zones.side.magazine} mm · 甲板 ${armor.zones.deck.magazine} mm · ${battery.caliberMm} mm 主炮 射程 ${(battery.maximumRangeMeters / 1_000).toFixed(2)} km / HE穿深 ${battery.shellProfile.hePenetrationMm} mm / AP炮口 ${Math.round(battery.shellProfile.apMuzzlePenetrationMm)} mm · 炮塔 ${mainTurrets}`;
    const telemetry = ship.perception;
    if (!telemetry) {
      this.perception.textContent = "感知：玩家/无 AI 遥测";
      return;
    }
    const labels = {
      unaware: "未发现",
      acquiring: "识别中",
      tracking: "稳定跟踪",
      lost: "目标丢失",
      searching: "搜索预测区",
    };
    const age = telemetry.lastObservedAt === undefined
      ? "—"
      : `${Math.max(0, this.getState().time - telemetry.lastObservedAt).toFixed(1)} s`;
    const position = telemetry.estimatedPosition
      ? `${telemetry.estimatedPosition.x.toFixed(0)}, ${telemetry.estimatedPosition.z.toFixed(0)}`
      : "—";
    this.perception.textContent = `感知 ${labels[telemetry.mode]} · 置信度 ${(telemetry.confidence * 100).toFixed(0)}% · 观测龄 ${age} · 估位 ${position}`;
  }
}
