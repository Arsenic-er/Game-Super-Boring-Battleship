import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerInput } from "../src/controllers/playerInput";

afterEach(() => vi.unstubAllGlobals());

function dispatch(target: EventTarget, type: string, values: Record<string, unknown> = {}): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  target.dispatchEvent(event);
  return event;
}

function fixture() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    pointerLockElement: null as EventTarget | null,
  });
  const canvas = new EventTarget();
  const aimingChanges: boolean[] = [];
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  const input = new PlayerInput(canvas as HTMLCanvasElement, {
    aimPoint: () => ({ x: 0, y: 0, z: 0 }),
    setAiming: (value) => { aimingChanges.push(value); },
  });
  return {
    input, win, doc, canvas, aimingChanges,
    lock: (element: EventTarget | null = canvas) => {
      doc.pointerLockElement = element;
      dispatch(doc, "pointerlockchange");
    },
    down: (button = 1, buttons = 4) => dispatch(canvas, "mousedown", { button, buttons }),
    up: (button = 1, buttons = 0) => dispatch(win, "mouseup", { button, buttons }),
    move: (buttons: number) => dispatch(win, "mousemove", { buttons }),
    wheel: (deltaY: number) => dispatch(canvas, "wheel", { deltaY }),
    key: (code: string) => dispatch(win, "keydown", { code, repeat: false }),
  };
}

describe("middle-button aim readout hold", () => {
  it("starts hidden and requires the battle canvas to own pointer lock", () => {
    const f = fixture();
    expect(f.input.isAimReadoutHeld).toBe(false);
    expect(f.down().defaultPrevented).toBe(true);
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.lock(new EventTarget());
    f.down();
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.lock();
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.down();
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.up();
    expect(f.input.isAimReadoutHeld).toBe(false);
  });

  it("ignores other buttons and suppresses only middle-button default actions", () => {
    const f = fixture();
    f.lock();
    for (const button of [0, 2, 3, 4]) {
      expect(f.down(button).defaultPrevented).toBe(false);
      expect(f.input.isAimReadoutHeld).toBe(false);
      expect(dispatch(f.canvas, "auxclick", { button }).defaultPrevented).toBe(false);
    }
    expect(dispatch(f.canvas, "auxclick", { button: 1 }).defaultPrevented).toBe(true);
    expect(f.input.isAimReadoutHeld).toBe(false);
  });

  it("tracks middle-button changes even while another button remains held", () => {
    const f = fixture();
    f.lock();
    f.down(0, 1);
    f.down(1, 5);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.move(7);
    f.up(0, 6);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.up(1, 2);
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.down(1, 6);
    f.up(2, 4);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.up(1);
    expect(f.input.isAimReadoutHeld).toBe(false);
  });

  it("ignores pointer-lock recenter moves with buttons zero until an actual release", () => {
    const f = fixture();
    f.lock();
    f.down();
    f.move(5);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.move(0);
    f.move(0);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.up();
    expect(f.input.isAimReadoutHeld).toBe(false);
  });

  it("clears on suppression and requires a new press after controls resume", () => {
    const f = fixture();
    f.lock();
    f.down();
    f.input.setSuppressed(true);
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.down();
    expect(f.input.isAimReadoutHeld).toBe(false);
    const range = f.input.aimRange;
    expect(f.wheel(1).defaultPrevented).toBe(true);
    expect(f.input.aimRange).toBe(range);
    f.input.setSuppressed(false);
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.down();
    expect(f.input.isAimReadoutHeld).toBe(true);
  });

  it.each(["blur", "hidden", "unlock", "foreign-lock", "pointercancel", "reset"] as const)(
    "clears held state on %s without restoring it on focus or lock return",
    (reason) => {
      const f = fixture();
      f.lock();
      f.down();
      expect(f.input.isAimReadoutHeld).toBe(true);
      switch (reason) {
        case "blur": dispatch(f.win, "blur"); break;
        case "hidden": f.doc.hidden = true; dispatch(f.doc, "visibilitychange"); break;
        case "unlock": f.lock(null); break;
        case "foreign-lock": f.lock(new EventTarget()); break;
        case "pointercancel": dispatch(f.win, "pointercancel"); break;
        case "reset": f.input.reset(); break;
      }
      expect(f.input.isAimReadoutHeld).toBe(false);
      f.doc.hidden = false;
      dispatch(f.doc, "visibilitychange");
      dispatch(f.win, "focus");
      f.lock();
      expect(f.input.isAimReadoutHeld).toBe(false);
      f.down();
      expect(f.input.isAimReadoutHeld).toBe(true);
    },
  );

  it("preserves the hold through unchanged visibility and retained canvas lock", () => {
    const f = fixture();
    f.lock();
    f.down();
    dispatch(f.doc, "visibilitychange");
    f.lock();
    expect(f.input.isAimReadoutHeld).toBe(true);
  });

  it("keeps wheel range adjustment independent from middle-button hold", () => {
    const f = fixture();
    f.lock();
    const initialRange = f.input.aimRange;
    expect(f.wheel(1).defaultPrevented).toBe(true);
    expect(f.input.aimRange).toBe(initialRange + 150);
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.down();
    f.wheel(-1);
    expect(f.input.aimRange).toBe(initialRange);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.up();
    f.wheel(-1);
    expect(f.input.aimRange).toBe(initialRange - 150);
    expect(f.input.isAimReadoutHeld).toBe(false);
  });

  it("keeps R scope toggles independent from the readout hold", () => {
    const f = fixture();
    f.lock();
    f.down();
    expect(f.input.isAiming).toBe(false);
    expect(f.aimingChanges).toEqual([]);
    f.key("KeyR");
    expect(f.input.isAiming).toBe(true);
    expect(f.input.isAimReadoutHeld).toBe(true);
    f.up();
    expect(f.input.isAiming).toBe(true);
    expect(f.input.isAimReadoutHeld).toBe(false);
    f.key("KeyR");
    expect(f.input.isAiming).toBe(false);
    expect(f.input.isAimReadoutHeld).toBe(false);
    expect(f.aimingChanges).toEqual([true, false]);
  });
});
