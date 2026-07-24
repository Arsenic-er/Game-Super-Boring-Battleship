import type { BattleState, ShipState } from "../sim/types";

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
      this.drawLargeMap(this.lastState);
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

  update(state: BattleState): void {
    this.lastState = state;
    const player = state.ships.find((ship) => ship.team === "player");
    if (!player) return;
    this.compassNeedle.style.transform = `rotate(${-player.heading}rad)`;
    if (this.lastDrawTime >= 0 && state.time - this.lastDrawTime < 1 / 15) return;
    this.lastDrawTime = state.time;
    this.drawMinimap(state, player);
    if (
      this.expanded
      && (this.lastLargeMapDrawTime < 0 || state.time - this.lastLargeMapDrawTime >= 1 / 4)
    ) {
      this.lastLargeMapDrawTime = state.time;
      this.drawLargeMap(state);
    }
  }

  private drawMinimap(state: BattleState, player: ShipState): void {
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
    for (const ship of state.ships) {
      const point = worldToHeadingUpMap(
        ship.position.x - player.position.x,
        ship.position.z - player.position.z,
        player.heading,
        scale,
        center.x,
        center.y,
      );
      if (point.x < 6 || point.x > width - 6 || point.y < 6 || point.y > height - 6) continue;
      drawShip(context, ship, point, ship.heading - player.heading, ship.id === player.id);
    }
  }

  private drawLargeMap(state: BattleState): void {
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
    for (const ship of state.ships) {
      const point = { x: center.x + ship.position.x * scale, y: center.y - ship.position.z * scale };
      drawShip(context, ship, point, ship.heading, ship.team === "player");
      context.fillStyle = ship.team === "player" ? "#b7ebce" : "#ffad9d";
      context.fillText(ship.team === "player" ? "本舰" : "敌舰", point.x + 10, point.y - 8);
    }
  }
}
