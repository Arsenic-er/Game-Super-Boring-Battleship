import { describe, expect, it } from "vitest";
import { CombatPointerLock } from "../src/controllers/combatPointerLock";
import { SUPPORTED_GAME_LOCALES, translateGameText } from "../src/i18n/gameLocale";

class Events {
  listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(type: string, handler: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set(); listeners.add(handler); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, handler: (event: unknown) => void): void { this.listeners.get(type)?.delete(handler); }
  emit(type: string, event: unknown = {}): void { for (const handler of this.listeners.get(type) ?? []) handler(event); }
}

function fixture() {
  const win = new Events();
  const classes = new Set<string>();
  const button = Object.assign(new Events(), { hidden:true, textContent:"", type:"", className:"",
    setAttribute: () => undefined, remove: () => undefined });
  const shell = { append: () => undefined, classList: { toggle: (name: string, value: boolean) => value ? classes.add(name) : classes.delete(name) } };
  let focused = true, active = true, requests = 0;
  let behavior: () => Promise<void> | void = () => undefined;
  const doc = Object.assign(new Events(), { defaultView:win, hidden:false, pointerLockElement:null as unknown,
    createElement: () => button, hasFocus: () => focused,
    exitPointerLock: () => { doc.pointerLockElement = null; doc.emit("pointerlockchange"); } });
  const canvas = Object.assign(new Events(), { ownerDocument:doc, closest: () => shell, parentElement:shell,
    requestPointerLock: () => { ++requests; return behavior(); } });
  const moves: Array<[number,number]> = [];
  const controller = new CombatPointerLock(canvas as unknown as HTMLCanvasElement, {
    isActive: () => active, onMove: (x,y) => moves.push([x,y]),
  });
  const move = (movementX = 10, movementY = 2, pointerType = "mouse") => canvas.emit("pointermove", { movementX,movementY,pointerType,clientX:9999,clientY:9999 });
  return {controller,canvas,doc,win,button,classes,moves,move,
    requests: () => requests,
    behavior: (next: typeof behavior) => { behavior = next; },
    active: (value: boolean) => { active = value; },
    focus: (value: boolean) => { focused = value; win.emit(value ? "focus" : "blur"); },
    grant: () => { doc.pointerLockElement = canvas; doc.emit("pointerlockchange"); },
    click: () => canvas.emit("pointerdown", {isTrusted:true,button:0,pointerType:"mouse"}),
  };
}

describe("combat pointer lock lifecycle", () => {
  it("reads relative movement only with actual owned lock, never client coordinates", () => {
    const f=fixture(); f.controller.request(); f.move(); f.move(); expect(f.moves).toEqual([]);
    f.grant(); f.move(500,500); expect(f.moves).toEqual([]);
    f.move(12,-4); expect(f.moves).toEqual([[12,-4]]);
    f.doc.exitPointerLock(); f.move(80,80); expect(f.moves).toHaveLength(1);
    expect(f.button.hidden).toBe(false); expect(f.classes.has("pointer-capture-needed")).toBe(true);
  });

  it("deduplicates pending requests and recovers from Promise rejection through a real-click handler", async () => {
    const f=fixture(); f.behavior(() => Promise.reject(new Error("gesture required")));
    f.controller.request(); f.controller.request(); expect(f.requests()).toBe(1);
    await Promise.resolve(); await Promise.resolve(); expect(f.button.hidden).toBe(false);
    f.behavior(() => undefined); f.button.emit("click", {isTrusted:true,button:0}); expect(f.requests()).toBe(2);
    f.grant(); expect(f.controller.isLocked).toBe(true); expect(f.button.hidden).toBe(true);
  });

  it("keeps synchronous exceptions and legacy pointerlockerror failures recoverable", () => {
    const f=fixture(); f.behavior(() => { throw new Error("unavailable"); });
    expect(() => f.controller.request()).not.toThrow(); expect(f.button.hidden).toBe(false);
    f.behavior(() => undefined); f.click(); expect(f.requests()).toBe(2);
    f.doc.emit("pointerlockerror"); f.click(); expect(f.requests()).toBe(3);
  });

  it("releases late grants after a modal opens and never captures inactive/menu clicks", async () => {
    const f=fixture(); let complete!: () => void;
    f.behavior(() => new Promise<void>(resolve => { complete=resolve; }));
    f.controller.request(); f.active(false); f.controller.release(); f.grant(); complete();
    await Promise.resolve(); expect(f.doc.pointerLockElement).toBe(null); expect(f.button.hidden).toBe(true);
    f.click(); f.controller.request(); expect(f.requests()).toBe(1);
    f.active(true); f.click(); expect(f.requests()).toBe(1);
    f.controller.request(); expect(f.requests()).toBe(2);
  });

  it("does not steal lock on focus return and drops the first resumed sample", () => {
    const f=fixture(); f.controller.request(); f.grant(); f.move(); f.move(5,3);
    f.focus(false); expect(f.doc.pointerLockElement).toBe(null); f.move();
    f.focus(true); expect(f.requests()).toBe(1); expect(f.button.hidden).toBe(false);
    f.click(); f.grant(); f.move(800,800); expect(f.moves).toEqual([[5,3]]);
    f.move(-7,2); expect(f.moves).toEqual([[5,3],[-7,2]]);
  });

  it("suspends hidden documents, ignores touch/synthetic presses and clamps finite locked deltas", () => {
    const f=fixture(); f.controller.request();
    f.doc.emit("pointerlockerror"); f.canvas.emit("pointerdown", {isTrusted:false,button:0,pointerType:"mouse"});
    f.canvas.emit("pointerdown", {isTrusted:true,button:0,pointerType:"touch"}); expect(f.requests()).toBe(1);
    f.grant(); f.move(); f.move(999,-999); expect(f.moves).toEqual([[80,-80]]);
    f.move(1,1,"touch"); f.move(); f.move(Number.NaN,Number.POSITIVE_INFINITY); expect(f.moves).toHaveLength(1);
    f.doc.hidden=true; f.doc.emit("visibilitychange"); expect(f.doc.pointerLockElement).toBe(null);
    expect(f.button.hidden).toBe(true); f.doc.hidden=false; f.doc.emit("visibilitychange"); expect(f.requests()).toBe(1);
  });

  it("removes listeners and prevents capture after disposal", () => {
    const f=fixture(); f.controller.request(); f.grant(); f.controller.dispose();
    f.click(); f.move(); f.controller.request(); expect(f.requests()).toBe(1);
    expect(f.doc.pointerLockElement).toBe(null); expect(f.moves).toHaveLength(0);
    expect([...f.canvas.listeners.values()].every(list => list.size===0)).toBe(true);
  });

  it("provides a specific recovery prompt in all seven locales", () => {
    const source="点击返回游戏并锁定鼠标";
    for (const locale of SUPPORTED_GAME_LOCALES) {
      const text=translateGameText(source,locale); expect(text.length).toBeGreaterThan(5);
      if (locale!=="zh-CN") expect(text).not.toBe(source);
    }
  });
});
