import { BATTLE_DURATION_SECONDS, GUN, OBJECTIVE } from "../sim/config";
import {
  ballisticVelocity,
  dispersionAtRange,
  isGunFireBlocked,
  torpedoLaunchSolution,
  torpedoThreatsFor,
  turretAlignmentError,
} from "../sim/simulation";
import { getMainGun } from "../ships/components";
import { getTorpedo } from "../ships/torpedoes";
import type {
  AmmoType,
  BattleState,
  CompartmentId,
  DamageControlPriority,
  ImpactEvent,
  ModuleId,
  PenetrationResult,
  PlayerTargetView,
  ShipState,
  WeaponSlot,
} from "../sim/types";

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

const ammoLabels: Record<AmmoType, string> = {
  he: "HE 高爆弹",
  ap: "AP 穿甲弹",
};

const penetrationLabels: Record<PenetrationResult, string> = {
  penetration: "击穿",
  overpenetration: "过穿",
  ricochet: "跳弹",
  shatter: "未穿透",
};

const damageControlPriorityLabels: Record<DamageControlPriority, string> = {
  balanced: "均衡调度",
  fire: "灭火优先",
  flood: "堵漏优先",
  module: "模块优先",
};

const percent = (value: number, max: number): number => Math.round((value / max) * 100);
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private readonly speed: HTMLElement;
  private readonly throttle: HTMLElement;
  private readonly range: HTMLElement;
  private readonly targetRange: HTMLElement;
  private readonly targetMotion: HTMLElement;
  private readonly rangeCorrection: HTMLElement;
  private readonly reload: HTMLElement;
  private readonly reloadLabel: HTMLElement;
  private readonly flightTime: HTMLElement;
  private readonly dispersion: HTMLElement;
  private readonly hullFill: HTMLElement;
  private readonly hullText: HTMLElement;
  private readonly recoverableHullFill: HTMLElement;
  private readonly recoverableHullText: HTMLElement;
  private readonly repairHint: HTMLElement;
  private readonly enemyFill: HTMLElement;
  private readonly enemyText: HTMLElement;
  private readonly modules: HTMLElement;
  private readonly battleTime: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly modeLabel: HTMLElement;
  private readonly objectivePanel: HTMLElement;
  private readonly playerScore: HTMLElement;
  private readonly enemyScore: HTMLElement;
  private readonly objectiveState: HTMLElement;
  private readonly playerCapture: HTMLElement;
  private readonly enemyCapture: HTMLElement;
  private readonly targetPanel: HTMLElement;
  private readonly telemetry: HTMLElement;
  private readonly damageState: HTMLElement;
  private readonly damageControlPriority: HTMLElement;
  private readonly damageControlTasks: HTMLElement;
  private readonly aimReadout: HTMLElement;
  private readonly aimMode: HTMLElement;
  private readonly torpedoWarning: HTMLElement;
  private readonly gameShell: HTMLElement;
  private readonly gunSight: HTMLElement;
  private readonly scopeBearing: HTMLElement;
  private readonly scopeRange: HTMLElement;
  private readonly scopeOpticalRange: HTMLElement;
  private readonly scopeFlightTime: HTMLElement;
  private readonly scopeDispersion: HTMLElement;
  private readonly scopeGun: HTMLElement;
  private readonly scopeReload: HTMLElement;
  private readonly scopeBarrelMarker: HTMLElement;
  private readonly gameCursor: HTMLImageElement;
  private readonly result: HTMLElement;
  private readonly resultDetail: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly qualityButton: HTMLButtonElement;
  private readonly weaponBar: HTMLElement;
  private readonly weaponButtons: HTMLButtonElement[];
  private weaponSelectHandler?: (slot: WeaponSlot) => void;
  private maxObservedSpeed = 0;

  constructor(
    root: HTMLElement,
    onRestart: () => void,
    onQualityToggle: () => void,
    onMainMenu: () => void,
  ) {
    root.innerHTML = `
      <main class="game-shell">
        <canvas id="game-canvas" aria-label="3D 驱逐舰战斗画面"></canvas>
        <div class="vignette" aria-hidden="true"></div>
        <header class="topbar">
          <div class="brand"><span>DD-01</span><strong>灰海行动</strong><small id="mode-label">单人原型 · 1943</small></div>
          <div class="battle-clock"><span id="time-label">剩余时间</span><strong id="battle-time">10:00</strong></div>
          <button id="quality" class="ghost-button" type="button">画质：低</button>
        </header>
        <section id="objective-score" class="objective-score" aria-label="中央目标区积分">
          <div class="objective-score-row">
            <strong id="player-score">0</strong>
            <span>中央目标区 A</span>
            <strong id="enemy-score">0</strong>
          </div>
          <div class="capture-track" aria-hidden="true">
            <i id="player-capture" class="player-capture"></i>
            <i id="enemy-capture" class="enemy-capture"></i>
            <b></b>
          </div>
          <small id="objective-state">目标区中立 · 进入区域开始占领</small>
        </section>
        <section class="panel own-status">
          <p class="eyebrow">本舰状态</p>
          <div class="metric-row"><span>航速</span><strong id="speed">0.0 kn</strong></div>
          <div class="metric-row"><span>车钟</span><strong id="throttle">停车</strong></div>
          <div class="bar-label"><span>绝对血量</span><span id="hull-text">100%</span></div>
          <div class="health-track actual-health"><i id="hull-fill"></i></div>
          <div class="bar-label secondary-health-label"><span>可恢复血量</span><span id="recoverable-hull-text">100%</span></div>
          <div class="health-track recoverable-health"><i id="recoverable-hull-fill"></i></div>
          <div id="repair-hint" class="repair-hint"><kbd>H</kbd> 按住持续抢修</div>
          <div id="damage-state" class="damage-state">损管正常</div>
          <div class="damage-control">
            <div class="damage-control-heading">
              <span>损管人力调度</span>
              <strong id="damage-control-priority"><kbd>4</kbd> 均衡调度</strong>
            </div>
            <div id="damage-control-tasks" class="damage-control-tasks"></div>
          </div>
          <div class="metric-row weapon-status"><span id="reload-label">主炮装填</span><strong id="reload">火炮就绪 · 100%</strong></div>
          <div id="modules" class="modules"></div>
        </section>
        <section id="target-status" class="panel target-status">
          <p class="eyebrow">目标 · 敌方驱逐舰</p>
          <div class="bar-label"><span>舰体估计</span><span id="enemy-text">100%</span></div>
          <div class="bar enemy"><i id="enemy-fill"></i></div>
          <div class="metric-row"><span>设定距离</span><strong id="range">2,200 m</strong></div>
          <div class="metric-row"><span>光学估距</span><strong id="target-range">-- m</strong></div>
          <div class="metric-row"><span>目标运动</span><strong id="target-motion">--</strong></div>
          <div class="metric-row correction"><span>距离修正</span><strong id="range-correction">等待测距</strong></div>
          <div class="metric-row"><span>弹着时间</span><strong id="flight-time">3.1 s</strong></div>
          <div class="metric-row"><span>散布椭圆</span><strong id="dispersion">±20 m</strong></div>
        </section>
        <section id="telemetry" class="panel telemetry" hidden>
          <p class="eyebrow">海试性能遥测</p>
          <div class="metric-row"><span>最高航速</span><strong data-telemetry="max-speed">0.0 kn</strong></div>
          <div class="metric-row"><span>即时转向率</span><strong data-telemetry="turn-rate">0.0°/s</strong></div>
          <div class="metric-row"><span>航行距离</span><strong data-telemetry="distance">0 m</strong></div>
          <div class="metric-row"><span>航向</span><strong data-telemetry="heading">000°</strong></div>
          <div class="metric-row"><span>舵角输入</span><strong data-telemetry="rudder">0%</strong></div>
          <small>无攻击 AI · 静止碰撞靶船 · 无时间限制</small>
        </section>
        <section id="feedback" class="feedback-stack" aria-live="polite"></section>
        <div class="reticle" aria-hidden="true">
          <i></i><b></b><span></span><div class="reticle-ticks">−10　−5　│　+5　+10</div>
          <output id="aim-readout">方位 000° · 2,200 m</output>
          <small id="aim-mode">观察模式 · R 进入瞄准</small>
        </div>
        <div id="torpedo-warning" class="torpedo-warning" hidden>鱼雷接近</div>
        <div id="gun-sight" class="gun-sight" aria-hidden="true">
          <div class="scope-optic">
            <div class="scope-heading">
              <span>TYPE 93 光学舰炮瞄准镜</span>
              <strong id="scope-gun">127 mm 主炮</strong>
            </div>
            <div class="scope-bearing-scale"><span>−30</span><span>−20</span><span>−10</span><b>0</b><span>+10</span><span>+20</span><span>+30</span></div>
            <div class="scope-horizontal"></div>
            <div class="scope-vertical"></div>
            <div class="scope-mouse-marker"><i></i><span>鼠标解算</span></div>
            <div id="scope-barrel-marker" class="scope-barrel-marker"><i></i><span>炮管</span></div>
            <div class="scope-range-ladder left"><span>500</span><span>1000</span><span>2000</span><span>3000</span><span>4000</span></div>
            <div class="scope-range-ladder right"><span>+20</span><span>+10</span><span>0</span><span>−10</span><span>−20</span></div>
            <div class="scope-data scope-data-left">
              <span>设定距离 <b id="scope-range">2,200 m</b></span>
              <span>光学测距 <b id="scope-optical-range">-- m</b></span>
              <span>弹着时间 <b id="scope-flight-time">3.1 s</b></span>
            </div>
            <div class="scope-data scope-data-right">
              <span>相对方位 <b id="scope-bearing">+0.0°</b></span>
              <span>散布椭圆 <b id="scope-dispersion">--</b></span>
              <span>标记说明 <b class="scope-legend">◆ 鼠标　○ 炮管</b></span>
            </div>
            <div id="scope-reload" class="scope-reload">火炮就绪 · 100%</div>
            <div class="scope-exit-hint">R / ESC　退出瞄准镜</div>
          </div>
        </div>
        <img id="game-cursor" class="game-cursor neon-arrow" src="./assets/cursors/neon-arrow.png" alt="" aria-hidden="true" />
        <section id="weapon-bar" class="weapon-bar panel" aria-label="武器选择">
          <button type="button" data-weapon="mainGun"><kbd>1</kbd><span>主炮</span><small>HE 高爆弹 · Q 切换</small></button>
          <button type="button" data-weapon="torpedo"><kbd>2</kbd><span>鱼雷</span><small>双雷齐射</small></button>
          <button type="button" data-weapon="aircraft" class="reserved"><kbd>3</kbd><span>舰载机</span><small>预留</small></button>
        </section>
        <section class="controls panel">
          <span><kbd>W</kbd><kbd>S</kbd> 车钟</span><span><kbd>A</kbd><kbd>D</kbd> 舵</span><span><kbd>移动鼠标</kbd> 视角</span>
          <span><kbd>滚轮</kbd> 测距</span><span><kbd>R</kbd> 瞄准开关</span>
          <span><kbd>Q</kbd> HE / AP</span><span><kbd>Space</kbd> 齐射</span><span><kbd>4</kbd> 损管优先</span><span><kbd>H</kbd> 舰体抢修</span><span><kbd>M</kbd> 地图</span><span><kbd>F3</kbd> 调试</span>
        </section>
        <section id="result" class="result-card" hidden>
          <p class="eyebrow">战斗结束</p><h1></h1><p id="result-detail"></p>
          <button id="restart" type="button">重新出击</button>
          <button id="return-main-menu" class="secondary" type="button">返回主菜单</button>
        </section>
      </main>`;

    const find = <T extends Element>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`Missing UI element: ${selector}`);
      return element;
    };
    this.canvas = find("#game-canvas");
    this.speed = find("#speed");
    this.throttle = find("#throttle");
    this.range = find("#range");
    this.targetRange = find("#target-range");
    this.targetMotion = find("#target-motion");
    this.rangeCorrection = find("#range-correction");
    this.reload = find("#reload");
    this.reloadLabel = find("#reload-label");
    this.flightTime = find("#flight-time");
    this.dispersion = find("#dispersion");
    this.hullFill = find("#hull-fill");
    this.hullText = find("#hull-text");
    this.recoverableHullFill = find("#recoverable-hull-fill");
    this.recoverableHullText = find("#recoverable-hull-text");
    this.repairHint = find("#repair-hint");
    this.enemyFill = find("#enemy-fill");
    this.enemyText = find("#enemy-text");
    this.modules = find("#modules");
    this.battleTime = find("#battle-time");
    this.timeLabel = find("#time-label");
    this.modeLabel = find("#mode-label");
    this.objectivePanel = find("#objective-score");
    this.playerScore = find("#player-score");
    this.enemyScore = find("#enemy-score");
    this.objectiveState = find("#objective-state");
    this.playerCapture = find("#player-capture");
    this.enemyCapture = find("#enemy-capture");
    this.targetPanel = find("#target-status");
    this.telemetry = find("#telemetry");
    this.damageState = find("#damage-state");
    this.damageControlPriority = find("#damage-control-priority");
    this.damageControlTasks = find("#damage-control-tasks");
    this.aimReadout = find("#aim-readout");
    this.aimMode = find("#aim-mode");
    this.torpedoWarning = find("#torpedo-warning");
    this.gameShell = find(".game-shell");
    this.gunSight = find("#gun-sight");
    this.scopeBearing = find("#scope-bearing");
    this.scopeRange = find("#scope-range");
    this.scopeOpticalRange = find("#scope-optical-range");
    this.scopeFlightTime = find("#scope-flight-time");
    this.scopeDispersion = find("#scope-dispersion");
    this.scopeGun = find("#scope-gun");
    this.scopeReload = find("#scope-reload");
    this.scopeBarrelMarker = find("#scope-barrel-marker");
    this.gameCursor = find("#game-cursor");
    this.result = find("#result");
    this.resultDetail = find("#result-detail");
    this.feedback = find("#feedback");
    this.qualityButton = find("#quality");
    this.weaponBar = find("#weapon-bar");
    this.weaponButtons = Array.from(this.weaponBar.querySelectorAll<HTMLButtonElement>("[data-weapon]"));
    for (const button of this.weaponButtons) {
      button.addEventListener("click", () => {
        this.weaponSelectHandler?.(button.dataset.weapon as WeaponSlot);
      });
    }
    const gameShell = find<HTMLElement>(".game-shell");
    gameShell.addEventListener("pointermove", (event) => {
      if (document.pointerLockElement === this.canvas) return;
      this.gameCursor.style.left = `${event.clientX}px`;
      this.gameCursor.style.top = `${event.clientY}px`;
    });
    find<HTMLButtonElement>("#restart").addEventListener("click", onRestart);
    find<HTMLButtonElement>("#return-main-menu").addEventListener("click", onMainMenu);
    this.qualityButton.addEventListener("click", onQualityToggle);
  }

  resetMetrics(): void {
    this.maxObservedSpeed = 0;
  }

  setWeaponSelectHandler(handler: (slot: WeaponSlot) => void): void {
    this.weaponSelectHandler = handler;
  }

  setQuality(value: "low" | "medium"): void {
    this.qualityButton.textContent = `画质：${value === "low" ? "低" : "中"}`;
  }

  setAimMode(active: boolean): void {
    this.aimMode.textContent = active
      ? "精密瞄准 · 绿线 鼠标 / 蓝线 炮管 · R / Esc 退出"
      : "观察模式 · 淡绿 鼠标 / 淡蓝 炮管 · R 进入瞄准";
    this.aimMode.className = active ? "active" : "";
    this.gameShell.classList.toggle("aiming", active);
    this.gunSight.setAttribute("aria-hidden", String(!active));
  }

  setCursorStyle(style: "neon-arrow" | "neon-hand" | "crosshair"): void {
    this.gameCursor.src = `./assets/cursors/${style === "neon-arrow" ? "neon-arrow.png" : style === "neon-hand" ? "neon-hand.png" : "crosshair.png"}`;
    this.gameCursor.className = `game-cursor ${style}`;
  }

  private throttleLabel(value: number): string {
    if (value < 0) return "倒车";
    if (value < 0.1) return "停车";
    if (value < 0.4) return "前进 1/4";
    if (value < 0.65) return "前进 1/2";
    if (value < 0.9) return "前进 3/4";
    return "全速前进";
  }

  private renderModules(ship: ShipState): void {
    this.modules.innerHTML = (Object.keys(moduleLabels) as ModuleId[]).map((id) => {
      const module = ship.modules[id];
      const value = percent(module.health, module.maxHealth);
      const stateClass = value <= 0 ? "destroyed" : value < 45 ? "critical" : "";
      return `<div class="module ${stateClass}"><span>${moduleLabels[id]}</span><b>${value}%</b><i style="--value:${value}%"></i></div>`;
    }).join("");
  }

  consumeImpacts(impacts: readonly ImpactEvent[]): void {
    for (const impact of impacts) {
      if (impact.kind === "splash" || !impact.targetId || !impact.compartment) continue;
      const incoming = impact.targetId === "player";
      const moduleText = impact.module ? ` · ${moduleLabels[impact.module]}受损` : "";
      const hazard = `${impact.startedFire ? " · 起火" : ""}${impact.startedFlooding ? " · 进水" : ""}`;
      const armorResult = impact.penetrationResult
        ? ` · ${impact.ammoType ? ammoLabels[impact.ammoType].split(" ")[0] : ""}${penetrationLabels[impact.penetrationResult]}`
        : "";
      const element = document.createElement("div");
      element.className = `combat-message${incoming ? " incoming" : ""}`;
      const collision = impact.kind === "collision";
      element.textContent = incoming
        ? `${collision ? "碰撞" : "中弹"} · ${compartmentLabels[impact.compartment]}${armorResult}${moduleText}${hazard} · -${Math.round(impact.damage ?? 0)}`
        : `${collision ? "敌舰碰撞" : "命中敌舰"}${compartmentLabels[impact.compartment]}${armorResult}${moduleText}${hazard} · ${Math.round(impact.damage ?? 0)}`;
      this.feedback.prepend(element);
      while (this.feedback.children.length > 4) this.feedback.lastElementChild?.remove();
      window.setTimeout(() => element.remove(), 2_800);
    }
  }

  private updateTelemetry(player: ShipState): void {
    this.maxObservedSpeed = Math.max(this.maxObservedSpeed, Math.abs(player.speedKnots));
    const set = (name: string, value: string): void => {
      const element = this.telemetry.querySelector<HTMLElement>(`[data-telemetry="${name}"]`);
      if (element) element.textContent = value;
    };
    set("max-speed", `${this.maxObservedSpeed.toFixed(1)} kn`);
    set("turn-rate", `${Math.abs(player.turnRateRadians * 180 / Math.PI).toFixed(1)}°/s`);
    set("distance", player.distanceTravelled >= 1_000
      ? `${(player.distanceTravelled / 1_000).toFixed(2)} km`
      : `${Math.round(player.distanceTravelled)} m`);
    set("heading", `${String(Math.round((player.heading * 180 / Math.PI + 360) % 360)).padStart(3, "0")}°`);
    set("rudder", `${Math.round(player.rudder * 100)}%`);
  }

  update(
    state: BattleState,
    aimRange: number,
    selectedWeapon: WeaponSlot,
    target?: PlayerTargetView,
  ): void {
    const player = state.ships.find((ship) => ship.team === "player");
    if (!player) return;
    const torpedoDefinition = getTorpedo(player.torpedoId);
    const torpedoThreats = torpedoThreatsFor(state, player.id);
    const nearestTorpedo = torpedoThreats[0];
    this.torpedoWarning.hidden = !nearestTorpedo;
    this.torpedoWarning.textContent = nearestTorpedo
      ? `鱼雷接近 · ${Math.round(nearestTorpedo.distanceMeters)} m`
      : "";
    const seaTrials = state.mode === "sea-trials";
    const clockSeconds = seaTrials ? Math.floor(state.time) : Math.max(0, Math.ceil(BATTLE_DURATION_SECONDS - state.time));
    this.battleTime.textContent = `${Math.floor(clockSeconds / 60)}:${String(clockSeconds % 60).padStart(2, "0")}`;
    this.timeLabel.textContent = seaTrials ? "海试时间" : "剩余时间";
    this.modeLabel.textContent = seaTrials ? "舰船测试模式 · 无攻击 AI" : "单人战斗 · 1943";
    this.objectivePanel.hidden = seaTrials;
    this.targetPanel.hidden = seaTrials;
    this.telemetry.hidden = !seaTrials;

    if (!seaTrials) {
      const objective = state.objective;
      const playerObjectiveScore = Math.round(objective.scores.player);
      const enemyObjectiveScore = Math.round(objective.scores.enemy);
      this.playerScore.textContent = String(playerObjectiveScore);
      this.enemyScore.textContent = String(enemyObjectiveScore);
      const playerProgress = Math.max(0, objective.captureProgress) * 50;
      const enemyProgress = Math.max(0, -objective.captureProgress) * 50;
      this.playerCapture.style.width = `${playerProgress}%`;
      this.enemyCapture.style.width = `${enemyProgress}%`;
      const objectiveDistance = Math.round(Math.hypot(
        player.position.x - objective.center.x,
        player.position.z - objective.center.z,
      ));
      const ownerText = objective.owner === "player"
        ? "我方控制"
        : objective.owner === "enemy" ? "敌方控制" : "目标区中立";
      const activityText = objective.contested
        ? "双方争夺中"
        : objective.capturingTeam === "player"
          ? `${objective.owner === "enemy" ? "解除敌方控制" : "我方占领"} ${Math.round(Math.abs(objective.captureProgress) * 100)}%`
          : objective.capturingTeam === "enemy"
            ? `${objective.owner === "player" ? "敌方正在解除控制" : "敌方占领"} ${Math.round(Math.abs(objective.captureProgress) * 100)}%`
            : `${objectiveDistance.toLocaleString("zh-CN")} m`;
      this.objectiveState.textContent = `${ownerText} · ${activityText} · ${OBJECTIVE.scoreToWin} 分获胜`;
      this.objectivePanel.className = `objective-score${objective.contested ? " contested" : objective.owner ? ` owner-${objective.owner}` : ""}`;
    }

    const hull = percent(player.hull, player.maxHull);
    const recoverableHull = percent(player.recoverableHull, player.maxHull);
    this.speed.textContent = `${player.speedKnots.toFixed(1)} kn`;
    this.throttle.textContent = this.throttleLabel(player.throttle);
    this.range.textContent = `${Math.round(aimRange).toLocaleString("zh-CN")} m`;
    this.hullText.textContent = `${hull}%`;
    this.hullFill.style.width = `${hull}%`;
    this.recoverableHullText.textContent = `${recoverableHull}%`;
    this.recoverableHullFill.style.width = `${recoverableHull}%`;
    const repairing = player.hullRepairActive;
    this.repairHint.className = `repair-hint${repairing ? " active" : ""}`;
    this.repairHint.innerHTML = player.hull >= player.recoverableHull - 0.01
      ? "当前没有可恢复损伤"
      : repairing ? "<kbd>H</kbd> 抢修进行中 · 正在抽调人力" : "<kbd>H</kbd> 按住抢修 · 会占用损管人力";
    this.damageState.textContent = player.fireIntensity < 1 && player.flooding < 1
      ? "损管正常"
      : `火势 ${Math.round(player.fireIntensity)}% · 进水 ${Math.round(player.flooding)}%`;
    this.damageState.className = `damage-state${player.fireIntensity > 35 || player.flooding > 35 ? " critical" : ""}`;
    this.damageControlPriority.innerHTML = `<kbd>4</kbd> ${damageControlPriorityLabels[player.damageControlPriority]}`;
    const repairModule = player.damageControlModule
      ? ` · ${moduleLabels[player.damageControlModule]}`
      : "";
    const damageControlEntries = [
      {
        id: "fire",
        label: "灭火",
        allocation: player.damageControlAllocation.fire,
        needed: player.fireIntensity > 0,
      },
      {
        id: "flood",
        label: "堵漏",
        allocation: player.damageControlAllocation.flood,
        needed: player.flooding > 0,
      },
      {
        id: "module",
        label: `抢修${repairModule}`,
        allocation: player.damageControlAllocation.module,
        needed: Boolean(player.damageControlModule),
      },
      {
        id: "hull",
        label: "舰体恢复",
        allocation: player.damageControlAllocation.hull,
        needed: player.hull < player.recoverableHull,
      },
    ] as const;
    this.damageControlTasks.innerHTML = damageControlEntries.map((task) => {
      const allocation = Math.round(task.allocation * 100);
      const stateClass = allocation > 0 ? "active" : task.needed ? "waiting" : "idle";
      const status = allocation > 0 ? `${allocation}%` : task.needed ? "待命" : "无任务";
      return `<div class="damage-control-task ${stateClass}" data-task="${task.id}"><span>${task.label}</span><b>${status}</b><i style="--allocation:${allocation}%"></i></div>`;
    }).join("");
    this.renderModules(player);
    for (const button of this.weaponButtons) {
      const active = button.dataset.weapon === selectedWeapon;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
      if (button.dataset.weapon === "torpedo") {
        const readiness = Math.round(
          clamp(1 - player.torpedoReloadRemaining / player.torpedoReloadDuration, 0, 1) * 100,
        );
        const small = button.querySelector("small");
        if (small) small.textContent = player.torpedoReloadRemaining > 0
          ? `装填 ${readiness}% · ${player.torpedoReloadRemaining.toFixed(1)} s`
          : `${player.torpedoSpreadMode === "narrow" ? "窄扇面" : "宽扇面"} · Q 切换 · 就绪`;
      } else if (button.dataset.weapon === "mainGun") {
        const small = button.querySelector("small");
        if (small) small.textContent = `${ammoLabels[player.ammoType]} · Q 切换`;
      }
    }

    const aimBearing = Math.atan2(player.aimPoint.x - player.position.x, player.aimPoint.z - player.position.z);
    const relativeBearing = wrapAngle(aimBearing - player.heading) * 180 / Math.PI;
    this.aimReadout.textContent = `相对方位 ${relativeBearing >= 0 ? "+" : ""}${relativeBearing.toFixed(1)}° · ${Math.round(aimRange).toLocaleString("zh-CN")} m`;
    const gunDefinition = getMainGun(player.mainGunId);
    this.reloadLabel.textContent = `${ammoLabels[player.ammoType]} · ${gunDefinition.shortLabel}`;
    const velocity = ballisticVelocity(
      { x: 0, y: GUN.muzzleHeight, z: 0 },
      { x: 0, y: 1.5, z: aimRange },
      gunDefinition.muzzleVelocity,
    );
    const horizontalSpeed = velocity
      ? Math.hypot(velocity.x, velocity.z)
      : gunDefinition.muzzleVelocity;
    this.flightTime.textContent = `${(aimRange / horizontalSpeed).toFixed(1)} s`;
    const gunRatio = player.modules.gun.health / player.modules.gun.maxHealth;
    const spread = dispersionAtRange(aimRange, gunRatio, gunDefinition.dispersionMultiplier);
    this.dispersion.textContent = `纵 ±${Math.round(spread.longitudinal)} / 横 ±${Math.round(spread.lateral)} m`;
    const reloadDuration = gunDefinition.reloadSeconds
      * player.performance.reloadMultiplier
      / Math.max(0.25, gunRatio);
    const reloadPercent = Math.round(
      Math.max(0, Math.min(1, 1 - player.reloadRemaining / reloadDuration)) * 100,
    );
    const traverseError = Math.abs(turretAlignmentError(player)) * 180 / Math.PI;
    const fireBlocked = isGunFireBlocked(player);
    this.reload.textContent = player.modules.gun.health <= 0
      ? "已摧毁 · 0%"
      : player.reloadRemaining > 0
        ? `装填 ${reloadPercent}% · ${player.reloadRemaining.toFixed(1)} s${fireBlocked ? " · 射界受阻" : ""}`
        : fireBlocked
          ? "射界受阻 · 禁止开火"
          : `火炮就绪 · 100%${traverseError > 2.5 ? ` · 炮管差 ${traverseError.toFixed(1)}°` : ""}`;
    const barrelOffset = wrapAngle(player.turretHeading - aimBearing) * 180 / Math.PI;
    this.scopeBarrelMarker.style.left = `calc(50% + ${clamp(barrelOffset * 4.2, -230, 230).toFixed(1)}px)`;
    this.scopeBarrelMarker.classList.toggle("blocked", fireBlocked);
    this.scopeBearing.textContent = `${relativeBearing >= 0 ? "+" : ""}${relativeBearing.toFixed(1)}°`;
    this.scopeRange.textContent = `${Math.round(aimRange).toLocaleString("zh-CN")} m`;
    const perceivedRange = target
      ? target.live
        ? target.rangeMeters
        : Math.hypot(
          target.position.x - player.position.x,
          target.position.z - player.position.z,
        )
      : undefined;
    this.scopeOpticalRange.textContent = perceivedRange === undefined
      ? "无光学接触"
      : target?.live
        ? `约 ${Math.round(perceivedRange / 50) * 50} m`
        : `最后已知 ${Math.round(perceivedRange / 100) * 100} m`;
    this.scopeFlightTime.textContent = this.flightTime.textContent ?? "--";
    this.scopeDispersion.textContent = `纵±${Math.round(spread.longitudinal)} 横±${Math.round(spread.lateral)} m`;
    this.scopeGun.textContent = `${ammoLabels[player.ammoType]} · ${gunDefinition.name}`;
    this.scopeReload.textContent = this.reload.textContent ?? "--";
    this.scopeReload.classList.toggle("blocked", fireBlocked);
    const torpedoSolution = torpedoLaunchSolution(
      player,
      player.aimPoint,
      player.torpedoSpreadMode,
    );
    if (selectedWeapon === "torpedo") {
      const spreadLabel = player.torpedoSpreadMode === "narrow" ? "窄扇面" : "宽扇面";
      const torpedoReloadPercent = Math.round(
        clamp(1 - player.torpedoReloadRemaining / player.torpedoReloadDuration, 0, 1) * 100,
      );
      this.reloadLabel.textContent = `${torpedoDefinition.shortLabel} · ${spreadLabel}`;
      this.reload.textContent = player.modules.torpedoTubes.health <= 0
        ? "发射器失效 · 0%"
        : player.torpedoReloadRemaining > 0
          ? `装填 ${torpedoReloadPercent}% · ${player.torpedoReloadRemaining.toFixed(1)} s`
          : torpedoSolution.allowed
            ? `左/右舷可发射 · 100%`
            : "艏艉射界受阻";
      this.flightTime.textContent = `${(aimRange / torpedoDefinition.speedMetersPerSecond).toFixed(1)} s`;
      this.dispersion.textContent = `${spreadLabel} · 武装 ${torpedoDefinition.armingDistanceMeters} m`;
      this.scopeGun.textContent = `${torpedoDefinition.caliberMm} mm · ${torpedoDefinition.shortLabel}`;
      this.scopeFlightTime.textContent = this.flightTime.textContent;
      this.scopeDispersion.textContent = `射程 ${(torpedoDefinition.maximumRangeMeters / 1_000).toFixed(1)} km · 发现 ${torpedoDefinition.detectionRangeMeters} m`;
      this.scopeReload.textContent = this.reload.textContent;
      this.scopeReload.classList.toggle(
        "blocked",
        !torpedoSolution.allowed || player.torpedoReloadRemaining > 0,
      );
      this.scopeBarrelMarker.style.visibility = "hidden";
      this.aimMode.textContent = torpedoSolution.allowed
        ? `鱼雷模式 · ${spreadLabel} · Q 切换扇面`
        : `鱼雷模式 · 艏艉死区 · 转至侧舷`;
    } else {
      this.scopeBarrelMarker.style.visibility = "";
    }

    if (seaTrials) {
      this.updateTelemetry(player);
      this.result.hidden = true;
      return;
    }
    this.targetPanel.classList.toggle("contact-lost", Boolean(target && !target.live));
    this.targetPanel.classList.toggle("contact-acquiring", target?.mode === "acquiring");
    if (!target) {
      this.enemyText.textContent = "未发现";
      this.enemyFill.style.width = "0%";
      this.targetRange.textContent = "--";
      this.targetMotion.textContent = "--";
      this.rangeCorrection.textContent = "等待光学接触";
      this.rangeCorrection.className = "";
    } else if (target.mode === "acquiring") {
      this.enemyText.textContent = "识别中";
      this.enemyFill.style.width = "0%";
      this.targetRange.textContent = `约 ${Math.round(target.rangeMeters / 100) * 100} m`;
      this.targetMotion.textContent = `方位解算中 · 置信 ${Math.round(target.confidence * 100)}%`;
      this.rangeCorrection.textContent = "等待稳定跟踪";
      this.rangeCorrection.className = "";
    } else {
      const hullEstimate = Math.round(target.estimatedHullRatio * 100);
      this.enemyText.textContent = target.live ? `约 ${hullEstimate}%` : `失联 · ${hullEstimate}%`;
      this.enemyFill.style.width = `${hullEstimate}%`;
      const opticalEstimate = Math.round((perceivedRange ?? 0) / (target.live ? 50 : 100))
        * (target.live ? 50 : 100);
      const age = Math.max(0, state.time - target.lastObservedAt);
      this.targetRange.textContent = target.live
        ? `约 ${opticalEstimate.toLocaleString("zh-CN")} m`
        : `${opticalEstimate.toLocaleString("zh-CN")} m · ${age.toFixed(1)} s 前`;
      this.targetMotion.textContent = `${target.speedKnots.toFixed(0)} kn · ${String(Math.round((target.heading * 180 / Math.PI + 360) % 360)).padStart(3, "0")}° · ${Math.round(target.confidence * 100)}%`;
      if (target.live) {
        const rangeError = Math.round((aimRange - opticalEstimate) / 10) * 10;
        this.rangeCorrection.textContent = Math.abs(rangeError) <= 35
          ? "距离吻合"
          : rangeError > 0 ? `落点过远 ${rangeError} m` : `落点过近 ${Math.abs(rangeError)} m`;
        this.rangeCorrection.className = Math.abs(rangeError) <= 35 ? "matched" : "";
      } else {
        this.rangeCorrection.textContent = target.mode === "lost"
          ? "目标丢失 · 保持搜索"
          : "搜索最后已知区域";
        this.rangeCorrection.className = "";
      }
    }

    if (state.status === "running") {
      this.result.hidden = true;
      return;
    }
    this.result.hidden = false;
    const heading = this.result.querySelector("h1");
    if (heading) {
      heading.textContent = state.status === "player-won"
        ? "战斗胜利"
        : state.status === "enemy-won" ? "战斗失败" : "战斗平局";
    }
    this.resultDetail.textContent = state.endReason === "score"
      ? `一方中央目标积分达到 ${OBJECTIVE.scoreToWin} 分，取得海域控制权。`
      : state.endReason === "time"
        ? `十分钟结束：我方 ${Math.round(state.objective.scores.player)} 分，敌方 ${Math.round(state.objective.scores.enemy)} 分；同分时按舰体耐久判定。`
      : state.status === "player-won"
        ? "敌舰已经失去战斗能力。"
        : state.status === "enemy-won" ? "本舰已经失去战斗能力。" : "双方均未取得决定性优势。";
  }
}
