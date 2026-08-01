import { AIR_NAVIGATION } from "../sim/airOperations";
import type {
  AircraftRole,
  AirCombatEvent,
  AirMissionCommand,
  AirMissionKind,
  BattleState,
  Vec3,
} from "../sim/types";

export type TacticalEntityCategory =
  | "friendlySquadron" | "friendlyShip"
  | "enemySquadron" | "enemyShip";

export interface TacticalMapEntity {
  id: string;
  category: TacticalEntityCategory;
  label: string;
  point: { x: number; y: number };
  world: Vec3;
  role?: AircraftRole;
}

export interface NorthUpProjection {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AirCommandSquadron {
  id: string;
  role: AircraftRole;
}

export type TacticalAirCommandMode =
  | "defendShip" | "interceptSquadron" | "patrolArea" | "strikeShip";

export function normalizeSelectionRect(
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function entityIdsInRect(
  entities: readonly TacticalMapEntity[],
  rect: Readonly<SelectionRect>,
  categories: readonly TacticalEntityCategory[],
): string[] {
  const allowed = new Set(categories);
  return entities
    .filter((entity) => allowed.has(entity.category))
    .filter(({ point }) =>
      point.x >= rect.left && point.x <= rect.right
      && point.y >= rect.top && point.y <= rect.bottom)
    .map(({ id }) => id);
}

export function northUpMapToWorld(
  point: Readonly<{ x: number; y: number }>,
  projection: Readonly<NorthUpProjection>,
): Vec3 {
  return {
    x: (point.x - projection.centerX) / projection.scale,
    y: 180,
    z: (projection.centerY - point.y) / projection.scale,
  };
}

export function clampPatrolRadius(radius: number): number {
  return Math.min(
    AIR_NAVIGATION.patrolRadiusMaxMeters,
    Math.max(AIR_NAVIGATION.patrolRadiusMinMeters, radius),
  );
}

export function roleSupportsCommand(
  role: AircraftRole,
  kind: AirMissionKind,
): boolean {
  if (kind === "defendShip" || kind === "interceptSquadron") {
    return role === "fighter";
  }
  return true;
}

export function compileAirMissionCommands(
  squadrons: readonly AirCommandSquadron[],
  kind: AirMissionKind,
  options: {
    targetIds?: readonly string[];
    center?: Readonly<Vec3>;
    radius?: number;
  } = {},
): AirMissionCommand[] {
  const targetIds = [...new Set(options.targetIds ?? [])];
  return squadrons
    .filter(({ role }) => roleSupportsCommand(role, kind))
    .map(({ id }) => ({
      squadronId: id,
      kind,
      targetId: targetIds[0],
      targetIds: targetIds.length > 0 ? [...targetIds] : undefined,
      area: options.center ? {
        center: { ...options.center },
        radius: kind === "patrolArea"
          ? clampPatrolRadius(options.radius ?? 0)
          : AIR_NAVIGATION.arrivalRadiusMeters,
      } : undefined,
    }));
}

type GestureKind = "select" | "right" | "targetRect" | "patrol";

interface PointerGesture {
  kind: GestureKind;
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  shiftKey: boolean;
}

const ROLE_LABEL: Record<AircraftRole, string> = {
  fighter: "战斗机",
  diveBomber: "俯冲轰炸机",
  torpedoBomber: "鱼雷轰炸机",
};

const MODE_LABEL: Record<TacticalAirCommandMode, string> = {
  defendShip: "护卫友军",
  interceptSquadron: "攻击敌方机群",
  patrolArea: "设置巡逻范围",
  strikeShip: "攻击敌方舰船",
};

export class TacticalAirCommandController {
  private readonly selectedSquadronIds = new Set<string>();
  private readonly pendingTargetIds = new Set<string>();
  private readonly queuedCommands: AirMissionCommand[] = [];
  private readonly marquee: HTMLElement;
  private readonly patrolPreview: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly contextMenu: HTMLElement;
  private readonly status: HTMLElement;
  private mode?: TacticalAirCommandMode;
  private gesture?: PointerGesture;
  private state?: BattleState;
  private entities: TacticalMapEntity[] = [];
  private projection?: NorthUpProjection;
  private lastAirEventId = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    layer: HTMLElement,
    private readonly requestDraw: () => void,
  ) {
    const marquee = layer.querySelector<HTMLElement>(".map-marquee");
    const patrolPreview = layer.querySelector<HTMLElement>(".map-patrol-preview");
    const palette = layer.querySelector<HTMLElement>(".air-command-palette");
    const contextMenu = layer.querySelector<HTMLElement>(".air-context-menu");
    const status = layer.querySelector<HTMLElement>(".air-command-status");
    if (!marquee || !patrolPreview || !palette || !contextMenu || !status) {
      throw new Error("Failed to create tactical air command controls");
    }
    this.marquee = marquee;
    this.patrolPreview = patrolPreview;
    this.palette = palette;
    this.contextMenu = contextMenu;
    this.status = status;

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.cancelGesture);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    palette.addEventListener("click", this.onPaletteClick);
    contextMenu.addEventListener("click", this.onContextClick);
    this.setStatus("左键框选己方机群 · 右键空地移动 · C打开指令菜单");
  }

  sync(
    state: BattleState,
    entities: readonly TacticalMapEntity[],
    projection: Readonly<NorthUpProjection>,
  ): void {
    this.state = state;
    this.entities = entities.map((entity) => ({
      ...entity,
      point: { ...entity.point },
      world: { ...entity.world },
    }));
    this.projection = { ...projection };
    const selectable = new Set(
      entities.filter(({ category }) => category === "friendlySquadron").map(({ id }) => id),
    );
    for (const id of this.selectedSquadronIds) {
      if (!selectable.has(id)) this.selectedSquadronIds.delete(id);
    }
    const visibleIds = new Set(entities.map(({ id }) => id));
    for (const id of this.pendingTargetIds) {
      if (!visibleIds.has(id)) this.pendingTargetIds.delete(id);
    }
  }

  handleAirEvents(events: readonly AirCombatEvent[]): void {
    const fresh = events.filter((event) =>
      event.id > this.lastAirEventId
      && event.controllerId === "player");
    if (events.length > 0) {
      this.lastAirEventId = Math.max(this.lastAirEventId, ...events.map(({ id }) => id));
    }
    if (fresh.length === 0) return;
    const accepted = fresh.filter(({ kind }) => kind === "orderAccepted").length;
    const rejected = fresh.filter(({ kind }) => kind === "orderRejected");
    const rejectLabels: Record<string, string> = {
      "unknown-squadron": "\u673a\u7fa4\u4e0d\u5b58\u5728",
      unavailable: "\u673a\u7fa4\u4e0d\u53ef\u7528",
      "target-required": "\u9700\u8981\u76ee\u6807",
      "wrong-role": "\u673a\u79cd/\u6b66\u5668\u4e0d\u5339\u914d",
      grounded: "\u673a\u7fa4\u5c1a\u672a\u8d77\u98de",
      committed: "\u673a\u7fa4\u6b63\u5728\u653b\u51fb\u6216\u964d\u843d",
      "invalid-target": "\u76ee\u6807\u5df2\u5931\u6548\u6216\u4e0d\u53ef\u89c1",
    };
    const rejectedReason = rejected[0]?.rejectReason
      ? rejectLabels[rejected[0].rejectReason] ?? rejected[0].rejectReason
      : "";
    const orderStatus = [
      accepted > 0 ? `\u5df2\u786e\u8ba4 ${accepted} \u652f\u673a\u7fa4` : "",
      rejected.length > 0 ? `\u5df2\u62d2\u7edd ${rejected.length} \u652f\uff1a${rejectedReason}` : "",
    ].filter(Boolean).join(" \u00b7 ");
    if (orderStatus) this.setStatus(orderStatus);
    const released = fresh.filter(({ kind }) => kind === "weaponReleased");
    const hits = fresh.filter(({ kind }) => kind === "attackHit");
    const misses = fresh.filter(({ kind }) => kind === "attackMiss");
    const losses = fresh.filter(({ kind }) => kind === "aircraftLost")
      .reduce((sum, event) => sum + (event.aircraftLost ?? 0), 0);
    if (released.length === 0 && hits.length === 0 && misses.length === 0 && losses === 0) return;
    const weaponLabels: Record<string, string> = {
      machineGun: "\u673a\u70ae", heBomb: "HE\u822a\u5f39", aerialTorpedo: "\u822a\u7a7a\u9c7c\u96f7",
    };
    const weapon = hits[0]?.weapon ?? released[0]?.weapon ?? misses[0]?.weapon;
    const damage = hits.reduce((sum, event) => sum + (event.damage ?? 0), 0);
    this.setStatus([
      weapon ? weaponLabels[weapon] ?? weapon : "\u822a\u7a7a\u653b\u51fb",
      released.length > 0 ? `\u5df2\u91ca\u653e ${released.length} \u6ce2` : "",
      hits.length > 0 ? `\u547d\u4e2d ${hits.length}` : "",
      misses.length > 0 ? `\u672a\u547d\u4e2d ${misses.length}` : "",
      damage > 0 ? `\u4f24\u5bb3 ${Math.round(damage)}` : "",
      losses > 0 ? `\u635f\u5931 ${losses} \u67b6` : "",
    ].filter(Boolean).join(" \u00b7 "));
  }

  selectedIds(): ReadonlySet<string> {
    return this.selectedSquadronIds;
  }

  pendingTargets(): ReadonlySet<string> {
    return this.pendingTargetIds;
  }

  currentMode(): TacticalAirCommandMode | undefined {
    return this.mode;
  }

  consumeCommands(): AirMissionCommand[] {
    return this.queuedCommands.splice(0);
  }

  resetInteraction(clearSelection = false): void {
    this.cancelGesture();
    this.mode = undefined;
    this.pendingTargetIds.clear();
    this.palette.hidden = true;
    this.contextMenu.hidden = true;
    if (clearSelection) this.selectedSquadronIds.clear();
    this.setStatus("左键框选己方机群 · 右键空地移动 · C打开指令菜单");
    this.requestDraw();
  }

  resetForBattle(): void {
    this.lastAirEventId = 0;
    this.queuedCommands.splice(0);
    this.selectedSquadronIds.clear();
    this.resetInteraction(true);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (event.code === "KeyC") {
      event.preventDefault();
      this.contextMenu.hidden = true;
      this.palette.hidden = !this.palette.hidden;
      if (!this.palette.hidden) {
        this.setStatus(this.selectedSummary("选择一个航空指令"));
      }
      return true;
    }
    if (event.code === "Enter" && this.mode && this.pendingTargetIds.size > 0) {
      event.preventDefault();
      this.issueTargetCommand([...this.pendingTargetIds]);
      return true;
    }
    if (event.code === "Escape") {
      if (this.gesture) {
        event.preventDefault();
        this.cancelGesture();
        return true;
      }
      if (!this.contextMenu.hidden) {
        event.preventDefault();
        this.contextMenu.hidden = true;
        return true;
      }
      if (this.mode || !this.palette.hidden) {
        event.preventDefault();
        this.mode = undefined;
        this.pendingTargetIds.clear();
        this.palette.hidden = true;
        this.setStatus(this.selectedSummary("已取消指令"));
        this.requestDraw();
        return true;
      }
    }
    return false;
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    this.contextMenu.hidden = true;
    const start = this.canvasPoint(event);
    const kind: GestureKind = event.button === 0
      ? "select"
      : this.mode === "patrolArea" ? "patrol"
        : this.mode ? "targetRect"
          : "right";
    this.gesture = {
      kind,
      pointerId: event.pointerId,
      start,
      current: start,
      shiftKey: event.shiftKey,
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.updateGesturePreview();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;
    this.gesture.current = this.canvasPoint(event);
    this.updateGesturePreview();
  };

  private onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    gesture.current = this.canvasPoint(event);
    const distance = Math.hypot(
      gesture.current.x - gesture.start.x,
      gesture.current.y - gesture.start.y,
    );
    if (gesture.kind === "select") this.finishSquadronSelection(gesture, distance);
    else if (gesture.kind === "right") this.finishDefaultRightClick(gesture);
    else if (gesture.kind === "targetRect") this.finishTargetSelection(gesture, distance);
    else this.finishPatrol(gesture, distance);
    this.cancelGesture();
  };

  private cancelGesture = (): void => {
    this.gesture = undefined;
    this.marquee.hidden = true;
    this.patrolPreview.hidden = true;
  };

  private updateGesturePreview(): void {
    if (!this.gesture) return;
    if (this.gesture.kind === "patrol") {
      const radius = Math.hypot(
        this.gesture.current.x - this.gesture.start.x,
        this.gesture.current.y - this.gesture.start.y,
      );
      this.patrolPreview.hidden = false;
      Object.assign(this.patrolPreview.style, {
        left: `${this.gesture.start.x - radius}px`,
        top: `${this.gesture.start.y - radius}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
      });
      return;
    }
    if (this.gesture.kind === "select" || this.gesture.kind === "targetRect") {
      const rect = normalizeSelectionRect(this.gesture.start, this.gesture.current);
      this.marquee.hidden = false;
      Object.assign(this.marquee.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.right - rect.left}px`,
        height: `${rect.bottom - rect.top}px`,
      });
      this.marquee.classList.toggle("targeting", this.gesture.kind === "targetRect");
    }
  }

  private nearestEntity(
    point: Readonly<{ x: number; y: number }>,
    categories: readonly TacticalEntityCategory[],
    maxDistance = 16,
  ): TacticalMapEntity | undefined {
    const allowed = new Set(categories);
    return this.entities
      .filter(({ category }) => allowed.has(category))
      .map((entity) => ({
        entity,
        distance: Math.hypot(entity.point.x - point.x, entity.point.y - point.y),
      }))
      .filter(({ distance }) => distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance)[0]?.entity;
  }

  private finishSquadronSelection(gesture: PointerGesture, distance: number): void {
    const ids = distance < 6
      ? [this.nearestEntity(gesture.current, ["friendlySquadron"])?.id].filter(Boolean) as string[]
      : entityIdsInRect(
        this.entities,
        normalizeSelectionRect(gesture.start, gesture.current),
        ["friendlySquadron"],
      );
    if (!gesture.shiftKey) this.selectedSquadronIds.clear();
    ids.forEach((id) => this.selectedSquadronIds.add(id));
    this.setStatus(this.selectedSummary(ids.length > 0 ? "机群已选择" : "没有框选到己方机群"));
    this.requestDraw();
  }

  private finishDefaultRightClick(gesture: PointerGesture): void {
    const friendly = this.nearestEntity(
      gesture.current,
      ["friendlyShip", "friendlySquadron"],
    );
    if (friendly) {
      this.showContextMenu(friendly, gesture.current);
      return;
    }
    const point = this.worldPoint(gesture.current);
    if (!point) return;
    this.issue("moveTo", { center: point });
  }

  private targetCategories(): TacticalEntityCategory[] {
    if (this.mode === "defendShip") return ["friendlyShip", "friendlySquadron"];
    if (this.mode === "interceptSquadron") return ["enemySquadron"];
    return ["enemyShip"];
  }

  private finishTargetSelection(gesture: PointerGesture, distance: number): void {
    const categories = this.targetCategories();
    if (gesture.shiftKey && distance < 6) {
      const target = this.nearestEntity(gesture.current, categories);
      if (target) {
        if (this.pendingTargetIds.has(target.id)) this.pendingTargetIds.delete(target.id);
        else this.pendingTargetIds.add(target.id);
        this.setStatus(`${MODE_LABEL[this.mode!]} · 已选 ${this.pendingTargetIds.size} 个目标 · Enter确认`);
        this.requestDraw();
      }
      return;
    }
    const targetIds = distance < 6
      ? [this.nearestEntity(gesture.current, categories)?.id].filter(Boolean) as string[]
      : entityIdsInRect(
        this.entities,
        normalizeSelectionRect(gesture.start, gesture.current),
        categories,
      );
    if (targetIds.length === 0) {
      this.setStatus(`${MODE_LABEL[this.mode!]} · 没有选中可见合法目标`);
      return;
    }
    this.issueTargetCommand(targetIds);
  }

  private finishPatrol(gesture: PointerGesture, distancePixels: number): void {
    const point = this.worldPoint(gesture.start);
    if (!point || !this.projection) return;
    this.issue("patrolArea", {
      center: point,
      radius: clampPatrolRadius(distancePixels / this.projection.scale),
    });
  }

  private worldPoint(point: Readonly<{ x: number; y: number }>): Vec3 | undefined {
    if (!this.projection) return undefined;
    const world = northUpMapToWorld(point, this.projection);
    if (Math.abs(world.x) > AIR_NAVIGATION.mapHalfExtentMeters
      || Math.abs(world.z) > AIR_NAVIGATION.mapHalfExtentMeters) return undefined;
    return world;
  }

  private selectedSquadrons(): AirCommandSquadron[] {
    const roleById = new Map(
      (this.state?.airSquadrons ?? [])
        .filter(({ team }) => team === "player")
        .map(({ id, role }) => [id, role]),
    );
    return [...this.selectedSquadronIds]
      .map((id) => ({ id, role: roleById.get(id) }))
      .filter((entry): entry is AirCommandSquadron => Boolean(entry.role));
  }

  private issue(
    kind: AirMissionKind,
    options: { targetIds?: readonly string[]; center?: Vec3; radius?: number } = {},
  ): void {
    const selected = this.selectedSquadrons();
    if (selected.length === 0) {
      this.setStatus("请先用左键框选至少一支己方机群");
      return;
    }
    const commands = compileAirMissionCommands(selected, kind, options);
    if (commands.length === 0) {
      this.setStatus("所选机群无法执行该指令；护卫与对空截击需要战斗机");
      return;
    }
    this.queuedCommands.push(...commands);
    const skipped = selected.length - commands.length;
    const weaponHint = kind === "strikeShip"
      ? " · AI按舰型选择机炮/HE炸弹/航空鱼雷"
      : "";
    this.setStatus(`已提交 ${commands.length} 支机群${this.commandLabel(kind)} · 等待确认${skipped ? ` · 跳过${skipped}支不兼容机群` : ""}${weaponHint}`);
    this.mode = undefined;
    this.pendingTargetIds.clear();
    this.palette.hidden = true;
    this.contextMenu.hidden = true;
    this.requestDraw();
  }

  private issueTargetCommand(targetIds: readonly string[]): void {
    if (!this.mode || this.mode === "patrolArea") return;
    this.issue(this.mode, { targetIds });
  }

  private onPaletteClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-air-command]");
    if (!button) return;
    event.stopPropagation();
    const command = button.dataset.airCommand;
    if (command === "close") {
      this.palette.hidden = true;
      this.mode = undefined;
      this.pendingTargetIds.clear();
      this.setStatus(this.selectedSummary("已关闭指令菜单"));
      this.requestDraw();
      return;
    }
    if (command === "recall") {
      this.issue("recall");
      return;
    }
    this.mode = command as TacticalAirCommandMode;
    this.pendingTargetIds.clear();
    this.setStatus(
      this.mode === "patrolArea"
        ? "巡逻：按住右键从中心向外拖出巡逻圆"
        : `${MODE_LABEL[this.mode]}：右键拖框，或 Shift+右键逐个选择后按 Enter`,
    );
    this.requestDraw();
  };

  private showContextMenu(
    entity: TacticalMapEntity,
    point: Readonly<{ x: number; y: number }>,
  ): void {
    this.contextMenu.dataset.targetId = entity.id;
    this.contextMenu.dataset.targetX = String(entity.world.x);
    this.contextMenu.dataset.targetZ = String(entity.world.z);
    const title = this.contextMenu.querySelector<HTMLElement>("strong");
    if (title) title.textContent = entity.label;
    this.contextMenu.hidden = false;
    this.contextMenu.style.left = `${Math.min(point.x + 12, this.canvas.clientWidth - 190)}px`;
    this.contextMenu.style.top = `${Math.min(point.y + 12, this.canvas.clientHeight - 150)}px`;
  }

  private onContextClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-air-context]");
    if (!button) return;
    event.stopPropagation();
    const targetId = this.contextMenu.dataset.targetId;
    const x = Number(this.contextMenu.dataset.targetX);
    const z = Number(this.contextMenu.dataset.targetZ);
    if (!targetId || !Number.isFinite(x) || !Number.isFinite(z)) return;
    if (button.dataset.airContext === "guard") this.issue("defendShip", { targetIds: [targetId] });
    else if (button.dataset.airContext === "patrol") {
      this.issue("patrolArea", { center: { x, y: 180, z }, radius: 500 });
    } else if (button.dataset.airContext === "move") {
      this.issue("moveTo", { center: { x, y: 180, z } });
    } else this.contextMenu.hidden = true;
  };

  private commandLabel(kind: AirMissionKind): string {
    const labels: Record<AirMissionKind, string> = {
      moveTo: "移动指令",
      defendShip: "护卫指令",
      interceptSquadron: "截击指令",
      patrolArea: "巡逻指令",
      strikeShip: "对舰攻击指令",
      recall: "返航指令",
    };
    return labels[kind];
  }

  private selectedSummary(prefix: string): string {
    const selected = this.selectedSquadrons();
    if (selected.length === 0) return `${prefix} · 尚未选择机群`;
    const roles = selected.map(({ role }) => ROLE_LABEL[role]).join(" / ");
    return `${prefix} · 已选 ${selected.length} 支：${roles}`;
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }
}
