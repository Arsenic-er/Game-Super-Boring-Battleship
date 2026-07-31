import type { AirMissionCommand, AircraftRole, AirSquadronState, BattleState, PlayerTargetView, ShipState } from "../sim/types";
import { HYDRO } from "../sim/config";
import { isProjectileVisibleToPlayer } from "../sim/playerPerception";
import {
  TacticalAirCommandController,
  type TacticalMapEntity,
} from "./tacticalAirCommand";

export interface MapPoint {
  x: number;
  y: number;
}

export interface TacticalMapOptions {
  onOpen?: () => void;
  onClose?: () => void;
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

const AIR_CONTACT_VALID_SECONDS = 5;

const AIR_ROLE_GLYPH: Record<AircraftRole, string> = {
  fighter: "F",
  diveBomber: "D",
  torpedoBomber: "T",
};

const AIR_ROLE_LABEL: Record<AircraftRole, string> = {
  fighter: "\u6218\u6597\u673a",
  diveBomber: "\u4fef\u51b2\u8f70\u70b8",
  torpedoBomber: "\u9c7c\u96f7\u8f70\u70b8",
};

function drawAirSquadron(
  context: CanvasRenderingContext2D,
  squadron: {
    role?: AircraftRole;
    heading: number;
    aircraftOperational: number;
    order?: AirSquadronState["order"];
  },
  point: MapPoint,
  friendly: boolean,
  selected: boolean,
  pending: boolean,
): void {
  context.save();
  context.translate(point.x, point.y);
  context.rotate(squadron.heading);
  context.fillStyle = friendly ? "#58d9d2" : "#f47f6a";
  context.strokeStyle = selected
    ? "#fff3b1" : pending ? "#ffb65c" : friendly ? "#dcffff" : "#ffe2d9";
  context.lineWidth = selected ? 2.2 : 1.2;
  context.beginPath();
  context.moveTo(0, -8);
  context.lineTo(7, 5);
  context.lineTo(2, 3);
  context.lineTo(0, 7);
  context.lineTo(-2, 3);
  context.lineTo(-7, 5);
  context.closePath();
  context.fill();
  context.stroke();
  if (selected || pending) {
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.stroke();
  }
  context.rotate(-squadron.heading);
  context.fillStyle = friendly ? "#d9fffb" : "#ffe0d7";
  context.font = "700 9px monospace";
  context.textAlign = "center";
  context.fillText(squadron.role ? AIR_ROLE_GLYPH[squadron.role] : "?", 0, 3);
  context.textAlign = "left";
  const roleLabel = squadron.role ? AIR_ROLE_LABEL[squadron.role] : "\u672a\u8bc6\u522b\u673a\u7fa4";
  const countLabel = squadron.aircraftOperational > 0
    ? ` x~${squadron.aircraftOperational}` : "";
  context.fillText(`${roleLabel}${countLabel}`, 12, -3);
  if (friendly && squadron.order?.selectedWeapon) {
    const weapon = squadron.order.selectedWeapon === "aerialTorpedo"
      ? "\u822a\u7a7a\u9c7c\u96f7"
      : squadron.order.selectedWeapon === "heBomb" ? "HE\u822a\u5f39" : "\u673a\u70ae";
    context.fillStyle = "#e8c57c";
    context.fillText(weapon, 12, 8);
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

function drawSmoke(
  context: CanvasRenderingContext2D,
  state: BattleState,
  project: (x: number, z: number) => MapPoint,
  scale: number,
): void {
  context.save();
  context.fillStyle = "rgba(172, 190, 188, .16)";
  context.strokeStyle = "rgba(205, 220, 216, .34)";
  context.lineWidth = 1;
  for (const cloud of state.smokeClouds) {
    const point = project(cloud.position.x, cloud.position.z);
    context.beginPath();
    context.arc(point.x, point.y, cloud.radius * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawHydroRange(
  context: CanvasRenderingContext2D,
  player: ShipState,
  point: MapPoint,
  scale: number,
): void {
  if (player.hydroActiveRemaining <= 0) return;
  context.save();
  context.strokeStyle = "rgba(84, 220, 232, .7)";
  context.fillStyle = "rgba(84, 220, 232, .035)";
  context.lineWidth = 1.35;
  context.setLineDash([5, 4]);
  context.beginPath();
  context.arc(point.x, point.y, HYDRO.shipDetectionMeters * scale, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

function drawDetectedTorpedoes(
  context: CanvasRenderingContext2D,
  state: BattleState,
  player: ShipState,
  project: (x: number, z: number) => MapPoint,
  headingOffset = 0,
): void {
  context.save();
  context.fillStyle = "#74e9f0";
  context.strokeStyle = "rgba(216, 255, 255, .92)";
  context.lineWidth = 1;
  for (const projectile of state.projectiles) {
    if (
      projectile.kind !== "torpedo"
      || projectile.team === player.team
      || !isProjectileVisibleToPlayer(projectile, player)
    ) continue;
    const point = project(projectile.position.x, projectile.position.z);
    const heading = Math.atan2(projectile.velocity.x, projectile.velocity.z) - headingOffset;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(heading);
    context.beginPath();
    context.moveTo(0, -5);
    context.lineTo(3.5, 4);
    context.lineTo(-3.5, 4);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
  }
  context.restore();
}

export class TacticalMap {
  private readonly minimap: HTMLCanvasElement;
  private readonly largeMap: HTMLCanvasElement;
  private readonly overlay: HTMLElement;
  private readonly compassNeedle: HTMLElement;
  private readonly airCommands: TacticalAirCommandController;
  private expanded = false;
  private lastDrawTime = -1;
  private lastLargeMapDrawTime = -1;
  private lastState?: BattleState;
  private lastTarget?: PlayerTargetView;

  constructor(
    parent: HTMLElement,
    private readonly options: TacticalMapOptions = {},
  ) {
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
    const airLayer = document.createElement("div");
    airLayer.className = "air-command-layer";
    airLayer.innerHTML = `<div class="map-marquee" hidden></div><div class="map-patrol-preview" hidden></div><div class="air-command-status">\u5de6\u952e\u6846\u9009\u5df1\u65b9\u673a\u7fa4 \u00b7 \u53f3\u952e\u7a7a\u5730\u79fb\u52a8 \u00b7 C\u6253\u5f00\u6307\u4ee4\u83dc\u5355</div><aside class="air-command-palette" hidden><strong>\u822a\u7a7a\u6307\u4ee4 C</strong><button data-air-command="defendShip">\u62a4\u536b\u53cb\u519b</button><button data-air-command="interceptSquadron">\u653b\u51fb\u654c\u65b9\u673a\u7fa4</button><button data-air-command="patrolArea">\u8bbe\u7f6e\u5de1\u903b\u8303\u56f4</button><button data-air-command="strikeShip">\u653b\u51fb\u654c\u65b9\u8230\u8239</button><button data-air-command="recall">\u5168\u90e8\u8fd4\u822a</button><button data-air-command="close">\u5173\u95ed</button></aside><aside class="air-context-menu" hidden><strong>\u53cb\u519b\u76ee\u6807</strong><button data-air-context="guard">\u62a4\u536b\u8be5\u76ee\u6807</button><button data-air-context="patrol">\u5728\u76ee\u6807\u5468\u56f4\u5de1\u903b</button><button data-air-context="move">\u79fb\u52a8\u81f3\u76ee\u6807</button><button data-air-context="close">\u5173\u95ed</button></aside>`;
    const stage = document.createElement("div");
    stage.className = "large-map-stage";
    largeMap.replaceWith(stage);
    stage.append(largeMap, airLayer);
    this.minimap = minimap;
    this.largeMap = largeMap;
    this.overlay = overlay;
    this.compassNeedle = compassNeedle;

    minimapPanel.addEventListener("click", () => this.open());
    this.airCommands = new TacticalAirCommandController(largeMap, airLayer, () => {
      if (this.lastState) this.drawLargeMap(this.lastState, this.lastTarget);
    });
    minimapPanel.addEventListener("keydown", (event) => {
      if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        this.open();
      }
    });
  }

  open(): void {
    if (this.expanded) return;
    this.expanded = true;
    this.overlay.hidden = false;
    this.options.onOpen?.();
    if (this.lastState) {
      this.drawLargeMap(this.lastState, this.lastTarget);
      this.lastLargeMapDrawTime = this.lastState.time;
    }
  }

  close(): void {
    if (!this.expanded) return;
    this.airCommands.resetInteraction();
    this.expanded = false;
    this.overlay.hidden = true;
    this.options.onClose?.();
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    return this.airCommands.handleKeyDown(event);
  }

  consumeAirMissions(): AirMissionCommand[] {
    return this.airCommands.consumeCommands();
  }

  handleAirEvents(events: Readonly<BattleState["airEvents"]>): void {
    this.airCommands.handleAirEvents(events);
  }

  resetForBattle(): void {
    this.airCommands.resetForBattle();
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
    drawSmoke(
      context,
      state,
      (x, z) => worldToHeadingUpMap(
        x - player.position.x,
        z - player.position.z,
        player.heading,
        scale,
        center.x,
        center.y,
      ),
      scale,
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
    drawHydroRange(context, player, playerPoint, scale);
    drawShip(context, player, playerPoint, 0, true);
    drawDetectedTorpedoes(
      context,
      state,
      player,
      (x, z) => worldToHeadingUpMap(
        x - player.position.x,
        z - player.position.z,
        player.heading,
        scale,
        center.x,
        center.y,
      ),
      player.heading,
    );
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
    const project = (x: number, z: number): MapPoint =>
      ({ x: center.x + x * scale, y: center.y - z * scale });
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
    drawSmoke(
      context,
      state,
      project,
      scale,
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
    const entities: TacticalMapEntity[] = [];
    for (const ship of state.ships.filter(({ team }) => team === "player")) {
      entities.push({
        id: ship.id,
        category: "friendlyShip",
        label: ship.id === "player" ? "\u672c\u8230" : "\u53cb\u519b\u8230\u8239",
        point: project(ship.position.x, ship.position.z),
        world: { ...ship.position },
      });
    }
    if (target?.live) {
      entities.push({
        id: target.id,
        category: "enemyShip",
        label: target.live ? "\u654c\u8230\u89c2\u6d4b" : "\u6700\u540e\u5df2\u77e5\u654c\u8230",
        point: project(target.position.x, target.position.z),
        world: { ...target.position },
      });
    }
    const player = state.ships.find((ship) => ship.team === "player");
    if (player) {
      const point = {
        x: center.x + player.position.x * scale,
        y: center.y - player.position.z * scale,
      };
      drawHydroRange(context, player, point, scale);
      drawShip(context, player, point, player.heading, true);
      drawDetectedTorpedoes(
        context,
        state,
        player,
        project,
      );
      context.fillStyle = "#b7ebce";
      context.fillText("本舰", point.x + 10, point.y - 8);
    }
    const friendlyAir = state.airSquadrons.filter(({ team }) => team === "player");
    const selectableAir = friendlyAir.filter(({ phase }) =>
      !["destroyed", "rearming", "landing", "attackRun"].includes(phase))
      .filter(({ aircraftOperational }) => aircraftOperational > 0);
    const observedEnemyAir = state.airSquadrons.flatMap(({ id, team, contactsByTeam }) => {
      if (team !== "enemy") return [];
      const contact = contactsByTeam.player;
      if (!contact || state.time - contact.observedAt > AIR_CONTACT_VALID_SECONDS) return [];
      return [{ id, contact, position: contact.lastKnownPosition }];
    });
    for (const squadron of selectableAir) {
      entities.push({
        id: squadron.id,
        category: "friendlySquadron",
        label: `${AIR_ROLE_LABEL[squadron.role]} ${squadron.aircraftOperational}`,
        point: project(squadron.position.x, squadron.position.z),
        world: { ...squadron.position },
        role: squadron.role,
      });
    }
    for (const { id, contact, position } of observedEnemyAir) {
      entities.push({
        id,
        category: "enemySquadron",
        label: contact.observedRole ? `\u654c\u65b9${AIR_ROLE_LABEL[contact.observedRole]}` : "\u654c\u673a\u63a5\u89e6",
        point: project(position.x, position.z),
        world: { ...position },
        role: contact.observedRole,
      });
    }
    this.airCommands.sync(state, entities, { centerX: center.x, centerY: center.y, scale });
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    context.save();
    context.setLineDash([5, 4]);
    for (const squadron of friendlyAir) {
      const start = project(squadron.position.x, squadron.position.z);
      const targetId = squadron.order?.activeTargetId ?? squadron.order?.candidateTargetIds?.[0];
      const destinationWorld = squadron.order?.area?.center
        ?? (targetId ? byId.get(targetId)?.world : undefined)
        ?? squadron.order?.lastKnownPosition;
      if (destinationWorld) {
        const destination = project(destinationWorld.x, destinationWorld.z);
        context.strokeStyle = "rgba(92, 224, 210, .55)";
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(destination.x, destination.y);
        context.stroke();
      }
      if (squadron.order?.area && squadron.order.kind === "patrolArea") {
        const patrol = project(squadron.order.area.center.x, squadron.order.area.center.z);
        context.strokeStyle = "rgba(235, 195, 103, .62)";
        context.beginPath();
        context.arc(patrol.x, patrol.y, squadron.order.area.radius * scale, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();
    const selected = this.airCommands.selectedIds();
    const pending = this.airCommands.pendingTargets();
    for (const squadron of friendlyAir) {
      drawAirSquadron(context, squadron, project(squadron.position.x, squadron.position.z), true, selected.has(squadron.id), pending.has(squadron.id));
    }
    for (const { id, contact, position } of observedEnemyAir) {
      drawAirSquadron(context, {
        role: contact.observedRole,
        heading: contact.observedHeading ?? 0,
        aircraftOperational: contact.estimatedAircraft ?? 0,
      }, project(position.x, position.z), false, false, pending.has(id));
    }
    if (target) {
      const point = {
        x: center.x + target.position.x * scale,
        y: center.y - target.position.z * scale,
      };
      if (pending.has(target.id)) {
        context.strokeStyle = "#ffb65c";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(point.x, point.y, 13, 0, Math.PI * 2);
        context.stroke();
      }
      drawContact(context, target, point, target.heading, state.time);
      context.fillStyle = target.live ? "#ffad9d" : "#e4b97b";
      context.fillText(target.live ? "敌舰观测" : "最后已知", point.x + 10, point.y - 8);
    }
  }
}
