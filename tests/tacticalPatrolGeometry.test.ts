import { describe, expect, it } from "vitest";
import { TACTICAL_AIR_TEXT, tacticalAirText } from "../src/i18n/tacticalAirLocale";
import {
  TacticalAirCommandController,
  entityIdsInRect,
  normalizeSelectionRect,
  type TacticalMapEntity,
} from "../src/ui/tacticalAirCommand";
import {
  patrolAreaFromDrag,
  type NorthUpProjection,
} from "../src/ui/tacticalPatrolGeometry";
import type { BattleState } from "../src/sim/types";

const projection: NorthUpProjection = {
  centerX: 300, centerY: 300, scale: .1, worldCenterX: 400, worldCenterZ: -200,
};
const drags = [
  [{ x: 100, y: 140 }, { x: 300, y: 260 }],
  [{ x: 300, y: 260 }, { x: 100, y: 140 }],
  [{ x: 100, y: 260 }, { x: 300, y: 140 }],
  [{ x: 300, y: 140 }, { x: 100, y: 260 }],
] as const;

describe("patrol diameter drag geometry", () => {
  it.each(drags)("uses the midpoint and half the distance in every drag direction", (start, end) => {
    const geometry = patrolAreaFromDrag(start, end, projection)!;
    expect(geometry.area.center).toEqual({ x: -600, y: 180, z: 800 });
    expect(geometry.area.radius).toBeCloseTo(Math.hypot(200, 120) / .2, 8);
    expect(geometry.preview.left + geometry.preview.width / 2).toBeCloseTo(200, 8);
    expect(geometry.preview.top + geometry.preview.height / 2).toBeCloseTo(200, 8);
    expect(geometry.preview.width).toBeCloseTo(geometry.area.radius * .2, 8);
    expect(geometry.preview.height).toBe(geometry.preview.width);
  });

  it("preserves the same world area under zoom and a translated map center", () => {
    const start = { x: -1600, z: 1200 }, end = { x: 400, z: -800 };
    const views: NorthUpProjection[] = [
      { centerX: 300, centerY: 300, scale: .05 },
      { centerX: 320, centerY: 280, scale: .1, worldCenterX: -500, worldCenterZ: 300 },
    ];
    const areas = views.map(view => {
      const screen = (world: { x: number; z: number }) => ({
        x: view.centerX + (world.x - (view.worldCenterX ?? 0)) * view.scale,
        y: view.centerY - (world.z - (view.worldCenterZ ?? 0)) * view.scale,
      });
      const geometry = patrolAreaFromDrag(screen(start), screen(end), view)!;
      expect(geometry.preview.width / (2 * view.scale)).toBeCloseTo(geometry.area.radius, 8);
      return geometry.area;
    });
    expect(areas[0]!.center).toEqual({ x: -600, y: 180, z: 200 });
    expect(areas[1]!.center).toEqual(areas[0]!.center);
    expect(areas[1]!.radius).toBeCloseTo(areas[0]!.radius, 8);
  });

  it.each([
    [{ x: 100, y: 100 }, { x: 100, y: 100 }, 250],
    [{ x: 100, y: 100 }, { x: 120, y: 100 }, 250],
    [{ x: 50, y: 50 }, { x: 550, y: 550 }, 2000],
  ] as const)("uses the same minimum/maximum radius for preview and mission", (start, end, radius) => {
    const geometry = patrolAreaFromDrag(start, end, projection)!;
    expect(geometry.area.radius).toBe(radius);
    expect(geometry.preview.width).toBe(radius * 2 * projection.scale);
    expect(geometry.preview.height).toBe(geometry.preview.width);
  });

  it("rejects invalid projections and centers outside the command map", () => {
    expect(patrolAreaFromDrag({ x: 100, y: 100 }, { x: 200, y: 200 }, { ...projection, scale: 0 })).toBeUndefined();
    expect(patrolAreaFromDrag({ x: NaN, y: 100 }, { x: 200, y: 200 }, projection)).toBeUndefined();
    expect(patrolAreaFromDrag({ x: 10000, y: 10000 }, { x: 11000, y: 11000 }, projection)).toBeUndefined();
  });
});

class ElementStub {
  hidden = true;
  textContent = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  classes = new Set<string>();
  classList = { toggle: (name: string, on: boolean) => {
    if (on) this.classes.add(name); else this.classes.delete(name);
  } };
  private listeners = new Map<string, EventListener[]>();
  addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string, event: unknown): void {
    this.listeners.get(name)?.forEach(listener => listener(event as Event));
  }
  querySelector(): undefined { return undefined; }
}

function controllerFixture() {
  const canvas = Object.assign(new ElementStub(), {
    clientWidth: 600, clientHeight: 600,
    getBoundingClientRect: () => ({ left: 40, top: 30, width: 600, height: 600 }),
    setPointerCapture: (_id: number) => {},
  });
  const elements = Object.fromEntries([
    ".map-marquee", ".map-patrol-preview", ".air-command-palette", ".air-context-menu", ".air-command-status",
  ].map(name => [name, new ElementStub()]));
  const layer = { querySelector: (name: string) => elements[name] };
  const controller = new TacticalAirCommandController(
    canvas as unknown as HTMLCanvasElement,
    layer as unknown as HTMLElement,
    () => {},
    "en-US",
  );
  const state = { airSquadrons: [{ id: "fighter", team: "player", role: "fighter" }] } as unknown as BattleState;
  const entities: TacticalMapEntity[] = [
    { id: "fighter", category: "friendlySquadron", label: "fighter", point: { x: 100, y: 100 }, world: { x: 0, y: 180, z: 0 }, role: "fighter" },
    { id: "enemy", category: "enemyShip", label: "enemy", point: { x: 250, y: 200 }, world: { x: 100, y: 0, z: 0 } },
    { id: "outside", category: "enemyShip", label: "outside", point: { x: 500, y: 400 }, world: { x: 500, y: 0, z: 0 } },
  ];
  controller.sync(state, entities, projection);
  const pointer = (type: string, button: number, x: number, y: number) => canvas.emit(type, {
    pointerId: 1, button, clientX: x + 40, clientY: y + 30, shiftKey: false, preventDefault() {},
  });
  const mode = (kind: string) => elements[".air-command-palette"]!.emit("click", {
    target: { closest: () => ({ dataset: { airCommand: kind } }) }, stopPropagation() {},
  });
  pointer("pointerdown", 0, 120, 120);
  pointer("pointermove", 0, 80, 80);
  pointer("pointerup", 0, 80, 80);
  expect([...controller.selectedIds()]).toEqual(["fighter"]);
  return { controller, elements, state, entities, pointer, mode };
}

describe("patrol controller preview and submission", () => {
  it.each(drags)("submits precisely the world area shown by the preview", (start, end) => {
    const f = controllerFixture();
    f.mode("patrolArea");
    f.pointer("pointerdown", 2, start.x, start.y);
    f.pointer("pointermove", 2, end.x, end.y);
    const geometry = patrolAreaFromDrag(start, end, projection)!;
    const preview = f.elements[".map-patrol-preview"]!;
    expect(preview.hidden).toBe(false);
    for (const [key, value] of Object.entries(geometry.preview)) expect(parseFloat(preview.style[key]!)).toBeCloseTo(value, 8);
    f.pointer("pointerup", 2, end.x, end.y);
    expect(f.controller.consumeCommands()).toEqual([expect.objectContaining({ kind: "patrolArea", area: geometry.area })]);
    expect(preview.hidden).toBe(true);
  });

  it("refreshes the clamped preview when zoom/pan changes during a gesture", () => {
    const f = controllerFixture();
    f.mode("patrolArea");
    f.pointer("pointerdown", 2, 100, 100);
    f.pointer("pointermove", 2, 110, 110);
    const next = { ...projection, scale: .2, worldCenterX: -200, worldCenterZ: 500 };
    f.controller.sync(f.state, f.entities, next);
    const geometry = patrolAreaFromDrag({ x: 100, y: 100 }, { x: 110, y: 110 }, next)!;
    expect(parseFloat(f.elements[".map-patrol-preview"]!.style.width!)).toBe(geometry.preview.width);
    f.pointer("pointerup", 2, 110, 110);
    expect(f.controller.consumeCommands()[0]!.area).toEqual(geometry.area);
  });

  it("keeps normal squadron selection and reverse target dragging rectangular", () => {
    const f = controllerFixture();
    expect([...f.controller.selectedIds()]).toEqual(["fighter"]);
    f.mode("strikeShip");
    f.pointer("pointerdown", 2, 300, 250);
    f.pointer("pointermove", 2, 200, 150);
    expect(f.elements[".map-marquee"]!.style).toMatchObject({ left: "200px", top: "150px", width: "100px", height: "100px" });
    expect(f.elements[".map-marquee"]!.classes.has("targeting")).toBe(true);
    expect(f.elements[".map-patrol-preview"]!.hidden).toBe(true);
    f.pointer("pointerup", 2, 200, 150);
    expect(f.controller.consumeCommands()[0]).toMatchObject({ kind: "strikeShip", targetIds: ["enemy"] });
    const rect = normalizeSelectionRect({ x: 300, y: 250 }, { x: 200, y: 150 });
    expect(entityIdsInRect(f.entities, rect, ["enemyShip"])).toEqual(["enemy"]);
  });

  it("uses the selected locale for the patrol drag hint and updates it live", () => {
    const f = controllerFixture();
    f.controller.handleKeyDown({ code: "KeyC", preventDefault() {} } as KeyboardEvent);
    expect(f.elements[".air-command-palette"]!.hidden).toBe(false);
    f.mode("patrolArea");
    expect(f.elements[".air-command-palette"]!.hidden).toBe(true);
    expect(f.controller.currentMode()).toBe("patrolArea");
    expect(f.elements[".air-command-status"]!.textContent).toBe(tacticalAirText("en-US").patrolDragHint);
    f.controller.setLocale("ja-JP");
    expect(f.elements[".air-command-status"]!.textContent).toBe(tacticalAirText("ja-JP").patrolDragHint);
    const hints = Object.values(TACTICAL_AIR_TEXT).map(text => text.patrolDragHint);
    expect(hints).toHaveLength(7);
    expect(new Set(hints).size).toBe(7);
    expect(hints.every(hint => hint.length > 10 && !hint.includes("从中心向外"))).toBe(true);
  });
});
