import { COMPARTMENT_MAX_HEALTH } from "../sim/config";
import type { BattleState, CompartmentId, ModuleId, ShipState } from "../sim/types";

export type CursorStyle = "neon-arrow" | "neon-hand" | "crosshair";

export interface DeveloperPanelCallbacks {
  onOpen: () => void;
  onClose: () => void;
  onDebugColliders: (visible: boolean) => void;
  onCursorStyle: (style: CursorStyle) => void;
}

const moduleLabels: Record<ModuleId, string> = {
  gun: "主炮",
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
  private readonly live: HTMLElement;
  private open = false;

  constructor(
    parent: HTMLElement,
    private readonly getState: () => BattleState,
    private readonly callbacks: DeveloperPanelCallbacks,
  ) {
    this.element = document.createElement("aside");
    this.element.className = "developer-panel";
    this.element.hidden = true;
    this.element.innerHTML = `
      <header><div><small>DEVELOPER TOOLS · F3</small><h2>舰船状态调试器</h2></div><button data-action="close" type="button">×</button></header>
      <label class="dev-select"><span>调试对象</span><select data-role="ship"></select></label>
      <div class="dev-live" data-role="live">等待状态</div>
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
        <h3>装甲分区</h3>
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
      </div>`;
    parent.append(this.element);
    const shipSelect = this.element.querySelector<HTMLSelectElement>('[data-role="ship"]');
    const live = this.element.querySelector<HTMLElement>('[data-role="live"]');
    if (!shipSelect || !live) throw new Error("Missing developer panel controls");
    this.shipSelect = shipSelect;
    this.live = live;
    this.bindControls();
  }

  private field(id: string, label: string, min: number, max: number, step: number): string {
    return `<label class="dev-range"><span>${label}</span><input data-field="${id}" type="range" min="${min}" max="${max}" step="${step}" /><output>0</output></label>`;
  }

  private percentField(kind: "module" | "compartment", id: string, label: string): string {
    return `<label class="dev-range"><span>${label}</span><input data-${kind}="${id}" type="range" min="0" max="100" step="1" /><output>100%</output></label>`;
  }

  private selectedShip(): ShipState | undefined {
    return this.getState().ships.find((ship) => ship.id === this.shipSelect.value);
  }

  private syncShipOptions(): void {
    const ships = this.getState().ships;
    const previous = this.shipSelect.value;
    this.shipSelect.innerHTML = ships.map((ship) =>
      `<option value="${ship.id}">${ship.id === "player" ? "本舰" : ship.isTestTarget ? "碰撞靶船" : "敌舰 AI"}</option>`
    ).join("");
    if (ships.some((ship) => ship.id === previous)) this.shipSelect.value = previous;
  }

  private bindControls(): void {
    this.element.querySelector('[data-action="close"]')?.addEventListener("click", () => this.close());
    this.shipSelect.addEventListener("change", () => this.refresh());
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
        ship.compartments[id] = COMPARTMENT_MAX_HEALTH[id] * Number(input.value) / 100;
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
    if (action === "collision") {
      const state = this.getState();
      const player = state.ships.find((ship) => ship.id === "player");
      const target = state.ships.find((ship) => ship.isTestTarget)
        ?? state.ships.find((ship) => ship.id === "enemy");
      if (player && target) {
        player.position = { x: 0, y: 0, z: -130 };
        player.previousPosition = { ...player.position };
        player.heading = 0;
        player.turretHeading = 0;
        player.speedKnots = 26;
        player.throttle = 1;
        target.position = { x: 0, y: 0, z: 0 };
        target.previousPosition = { ...target.position };
        target.heading = Math.PI / 2;
        target.turretHeading = target.heading;
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
      }
      if (action === "sink") ship.hull = 0;
    }
    this.refresh();
  }

  private resetShip(ship: ShipState): void {
    ship.hull = ship.maxHull;
    ship.recoverableHull = ship.maxHull;
    ship.fireIntensity = 0;
    ship.flooding = 0;
    for (const module of Object.values(ship.modules)) module.health = module.maxHealth;
    for (const id of Object.keys(ship.compartments) as CompartmentId[]) {
      ship.compartments[id] = COMPARTMENT_MAX_HEALTH[id];
    }
  }

  private refresh(): void {
    this.syncShipOptions();
    const ship = this.selectedShip();
    if (!ship) return;
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
      input.value = String(Math.round(ship.compartments[id] / COMPARTMENT_MAX_HEALTH[id] * 100));
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
    this.live.textContent = `速度 ${ship.speedKnots.toFixed(1)} kn · 转向率 ${(ship.turnRateRadians * 180 / Math.PI).toFixed(2)}°/s · 坐标 ${ship.position.x.toFixed(0)}, ${ship.position.z.toFixed(0)}`;
  }
}
