import type { BattleState, PlayerTargetView, ShipState } from "../sim/types";

export interface MapPoint {
  x: number;
  y: number;
}

export function worldToHeadingUpMap(
  dx: number,
  dz: number,
  heading: number,
  scale: number,
  centerX: number,
  centerY: number,
): MapPoint {
  const right = dx * Math.cos(heading) - dz * Math.sin(heading);
  const forward = dx * Math.sin(heading) + dz * Math.cos(heading);
  return { x: centerX + right * scale, y: centerY - forward * scale };
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  pixelRatioCap = 1.25,
): CanvasRenderingContext2D | null {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return context;
}

function drawShip(
  context: CanvasRenderingContext2D,
  ship: ShipState,
  point: MapPoint,
  heading: number,
  player: boolean,
): void {
  context.save();
  context.globalAlpha = ship.hull > 0 ? 1 : 0.42;
  context.translate(point.x, point.y);
  context.rotate(heading);
  context.beginPath();
  context.moveTo(0, player ? -10 : -8);
  context.lineTo(player ? 6 : 5, player ? 8 : 6);
  context.lineTo(0, player ? 5 : 4);
  context.lineTo(player ? -6 : -5, player ? 8 : 6);
  context.closePath();
  context.fillStyle = player ? "#9ce1bd" : "#ef806b";
  context.strokeStyle = player ? "#e8fff2" : "#ffe1d9";
  context.lineWidth = 1.2;
  context.fill();
  context.stroke();
  context.restore();
}

function drawContact(
  context: CanvasRenderingContext2D,
  target: PlayerTargetView,
  point: MapPoint,
  heading: number,
  time: number,
): void {
  const stale = !target.live;
  const age = Math.max(0, time - target.lastObservedAt);
  context.save();
  context.globalAlpha = stale ? Math.max(0.28, target.confidence) : 0.72 + target.confidence * 0.28;
  context.translate(point.x, point.y);
  context.rotate(heading);
  context.strokeStyle = stale ? "#e4b97b" : "#ffe1d9";
  context.fillStyle = stale ? "rgba(228, 185, 123, .18)" : "#ef806b";
  context.lineWidth = stale ? 1 : 1.2;
  if (stale) context.setLineDash([3, 3]);
  context.beginPath();
  if (stale) {
    context.moveTo(0, -7);
    context.lineTo(7, 0);
    context.lineTo(0, 7);
    context.lineTo(-7, 0);
  } else {
    context.moveTo(0, -8);
    context.lineTo(5, 6);
    context.lineTo(0, 4);
    context.lineTo(-5, 6);
  }
  context.closePath();
  context.fill();
  context.stroke();
  if (stale) {
    context.rotate(-heading);
    context.beginPath();
    context.arc(0, 0, Math.min(28, 9 + age * 0.75), 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function objectiveColor(state: BattleState): string {
  if (state.objective.contested) return "#e2b66c";
  if (state.objective.owner === "player") return "#72d5a3";
  if (state.objective.owner === "enemy") return "#df7965";
  return "rgba(207, 225, 222, .68)";
}

function drawObjective(
  context: CanvasRenderingContext2D,
  state: BattleState,
  point: MapPoint,
  radius: number,
): void {
  context.save();
  context.strokeStyle = objectiveColor(state);
  context.fillStyle = state.objective.owner === "player"
    ? "rgba(74, 171, 119, .1)"
    : state.objective.owner === "enemy"
      ? "rgba(181, 75, 59, .1)"
      : "rgba(192, 216, 212, .055)";
  context.lineWidth = state.objective.contested ? 2 : 1.2;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = objectiveColor(state);
  context.font = "700 10px monospace";
  context.textAlign = "center";
  context.fillText("A", point.x, point.y + 3);
  context.restore();
}

export class TacticalMap {
  private readonly minimap: HTMLCanvasElement;
  private readonly largeMap: HTMLCanvasElement;
  private readonly overlay: HTMLElement;
  private readonly compassNeedle: HTMLElement;
  private expanded = false;
  private lastDrawTime = -1;
  private lastLargeMapDrawTime = -1;
  private lastState?: BattleState;
  private lastTarget?: PlayerTargetView;

  constructor(parent: HTMLElement) {
    const minimapPanel = document.createElement("section");
    minimapPanel.className = "minimap panel";
    minimapPanel.setAttribute("role", "button");
    minimapPanel.setAttribute("tabindex", "0");
    minimapPanel.setAttribute("aria-label", "展开实时战术地图");
    minimapPanel.title = "点击或按 M 展开大地图";
    minimapPanel.innerHTML = `
      <div class="map-heading"><span>战术海图</span><small>点击展开 · M</small></div>
      <canvas class="minimap-canvas" aria-label="本舰周边态势"></canvas>
      <div class="compass-indicator" aria-hidden="true">
        <span class="compass-n">N</span><span class="compass-needle">↑</span>
      </div>`;

    const overlay = document.createElement("div");
    overlay.className = "map-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="large-map-card" role="dialog" aria-modal="true" aria-label="大战术地图">
        <div class="large-map-heading">
          <div><p class="eyebrow">作战区域</p><h2>北向上战术地图</h2></div>
          <div class="large-map-north"><b>↑</b><span>N</span></div>
        </div>
        <canvas class="large-map-canvas" aria-label="完整作战区域"></canvas>
        <footer><span>绿色：本舰</span><span>红色：敌舰</span><kbd>M</kbd><span>开关地图</span><kbd>ESC</kbd><span>退出</span></footer>
      </section>`;

    parent.append(minimapPanel, overlay);
    const minimap = minimapPanel.querySelector<HTMLCanvasElement>(".minimap-canvas");
    const largeMap = overlay.querySelector<HTMLCanvasElement>(".large-map-canvas");
    const compassNeedle = minimapPanel.querySelector<HTMLElement>(".compass-needle");
    if (!minimap || !largeMap || !compassNeedle) throw new Error("Failed to create tactical map");
    this.minimap = minimap;
    this.largeMap = largeMap;
    this.overlay = overlay;
    this.compassNeedle = compassNeedle;

    minimapPanel.addEventListener("click", () => this.open());
    minimapPanel.addEventListener("keydown", (event) => {
      if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        this.open();
      }
    });
  }

  open(): void {
    this.expanded = true;
    this.overlay.hidden = false;
    if (this.lastState) {
      this.drawLargeMap(this.lastState, this.lastTarget);
      this.lastLargeMapDrawTime = this.lastState.time;
    }
  }

  close(): void {
    this.expanded = false;
    this.overlay.hidden = true;
  }

  toggle(): void {
    if (this.expanded) this.close();
    else this.open();
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  update(state: BattleState, target?: PlayerTargetView): void {
    this.lastState = state;
    this.lastTarget = target;
    const player = state.ships.find((ship) => ship.team === "player");
    if (!player) return;
    this.compassNeedle.style.transform = `rotate(${-player.heading}rad)`;
    if (this.lastDrawTime >= 0 && state.time - this.lastDrawTime < 1 / 15) return;
    this.lastDrawTime = state.time;
    this.drawMinimap(state, player, target);
    if (
      this.expanded
      && (this.lastLargeMapDrawTime < 0 || state.time - this.lastLargeMapDrawTime >= 1 / 4)
    ) {
      this.lastLargeMapDrawTime = state.time;
      this.drawLargeMap(state, target);
    }
  }

  private drawMinimap(
    state: BattleState,
    player: ShipState,
    target?: PlayerTargetView,
  ): void {
    const context = resizeCanvas(this.minimap);
    if (!context) return;
    const width = this.minimap.clientWidth;
    const height = this.minimap.clientHeight;
    const center = { x: width / 2, y: height / 2 };
    const scale = Math.min(width, height) * 0.45 / 3_000;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(5, 25, 34, .94)";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(139, 187, 190, .18)";
    context.lineWidth = 1;
    for (const meters of [1_000, 2_000, 3_000]) {
      context.beginPath();
      context.arc(center.x, center.y, meters * scale, 0, Math.PI * 2);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(center.x, 0);
    context.lineTo(center.x, height);
    context.moveTo(0, center.y);
    context.lineTo(width, center.y);
    context.stroke();
    const objectivePoint = worldToHeadingUpMap(
      state.objective.center.x - player.position.x,
      state.objective.center.z - player.position.z,
      player.heading,
      scale,
      center.x,
      center.y,
    );
    drawObjective(context, state, objectivePoint, state.objective.radius * scale);
    const playerPoint = worldToHeadingUpMap(
      0,
      0,
      player.heading,
      scale,
      center.x,
      center.y,
    );
    drawShip(context, player, playerPoint, 0, true);
    if (target) {
      const point = worldToHeadingUpMap(
        target.position.x - player.position.x,
        target.position.z - player.position.z,
        player.heading,
        scale,
        center.x,
        center.y,
      );
      if (point.x >= 6 && point.x <= width - 6 && point.y >= 6 && point.y <= height - 6) {
        drawContact(context, target, point, target.heading - player.heading, state.time);
      }
    }
  }

  private drawLargeMap(state: BattleState, target?: PlayerTargetView): void {
    const context = resizeCanvas(this.largeMap, 1);
    if (!context) return;
    const width = this.largeMap.clientWidth;
    const height = this.largeMap.clientHeight;
    const center = { x: width / 2, y: height / 2 };
    const halfExtent = 6_000;
    const scale = Math.min(width, height) * 0.46 / halfExtent;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#071f2a";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(133, 185, 190, .18)";
    context.fillStyle = "rgba(174, 211, 212, .5)";
    context.font = "10px monospace";
    context.lineWidth = 1;
    for (let meters = -halfExtent; meters <= halfExtent; meters += 1_000) {
      const x = center.x + meters * scale;
      const y = center.y - meters * scale;
      context.beginPath();
      context.moveTo(x, center.y - halfExtent * scale);
      context.lineTo(x, center.y + halfExtent * scale);
      context.moveTo(center.x - halfExtent * scale, y);
      context.lineTo(center.x + halfExtent * scale, y);
      context.stroke();
      if (meters !== 0) context.fillText(`${Math.abs(meters / 1_000)} km`, center.x + 4, y - 3);
    }
    context.strokeStyle = "rgba(192, 224, 221, .48)";
    context.strokeRect(
      center.x - halfExtent * scale,
      center.y - halfExtent * scale,
      halfExtent * 2 * scale,
      halfExtent * 2 * scale,
    );
    drawObjective(
      context,
      state,
      {
        x: center.x + state.objective.center.x * scale,
        y: center.y - state.objective.center.z * scale,
      },
      state.objective.radius * scale,
    );
    const player = state.ships.find((ship) => ship.team === "player");
    if (player) {
      const point = {
        x: center.x + player.position.x * scale,
        y: center.y - player.position.z * scale,
      };
      drawShip(context, player, point, player.heading, true);
      context.fillStyle = "#b7ebce";
      context.fillText("本舰", point.x + 10, point.y - 8);
    }
    if (target) {
      const point = {
        x: center.x + target.position.x * scale,
        y: center.y - target.position.z * scale,
      };
      drawContact(context, target, point, target.heading, state.time);
      context.fillStyle = target.live ? "#ffad9d" : "#e4b97b";
      context.fillText(target.live ? "敌舰观测" : "最后已知", point.x + 10, point.y - 8);
    }
  }
}
