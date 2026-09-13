import { afterEach, describe, expect, it, vi } from "vitest";
import { PORT_MOTION, portEnter, portVisibility } from "../src/ui/portMotion";

function fixture(hidden = true) {
  const animations: { finish: () => void; cancel: ReturnType<typeof vi.fn>; frames: Keyframe[] }[] = [];
  const element = { hidden, inert: hidden, animate: vi.fn((frames: Keyframe[]) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const cancel = vi.fn();
    animations.push({ finish, cancel, frames });
    return { finished, cancel };
  }) };
  return { element: element as unknown as HTMLElement, animations };
}
afterEach(() => vi.unstubAllGlobals());
describe("interruptible port motion", () => {
  it("uses brief, bounded motion timings", () => {
    expect(PORT_MOTION).toEqual({ hover: 120, panel: 220, ship: 350 });
  });
  it("shows immediately, then hides only after its exit finishes", async () => {
    const { element, animations } = fixture();
    portEnter(element);
    expect(element.hidden).toBe(false); expect(element.inert).toBe(false);
    animations[0].finish(); await Promise.resolve();
    portVisibility(element, false);
    expect(element.hidden).toBe(false); expect(element.inert).toBe(true);
    animations[1].finish(); await Promise.resolve();
    expect(element.hidden).toBe(true);
  });
  it("ignores obsolete completion after close is interrupted by reopening", async () => {
    const { element, animations } = fixture();
    portVisibility(element, true); portVisibility(element, false); portVisibility(element, true);
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    expect(animations[1].cancel).toHaveBeenCalledOnce();
    animations[1].finish(); animations[0].finish(); await Promise.resolve();
    expect(element.hidden).toBe(false); expect(element.inert).toBe(false);
    animations[2].finish(); await Promise.resolve();
    expect(element.hidden).toBe(false);
  });
  it("starts a reversal at the currently visible position", () => {
    vi.stubGlobal("getComputedStyle", () => ({ opacity: "0.42", transform: "matrix(1, 0, 0, 1, 0, 5)" }));
    const { element, animations } = fixture();
    portEnter(element); portVisibility(element, false);
    expect(animations[1].frames[0]).toEqual({ opacity: "0.42", transform: "matrix(1, 0, 0, 1, 0, 5)" });
  });
  it("supports reduced motion without delaying visibility or input", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { element, animations } = fixture();
    portEnter(element); expect(element.hidden).toBe(false);
    portVisibility(element, false); expect(element.hidden).toBe(true); expect(element.inert).toBe(true);
    expect(animations).toHaveLength(0);
  });
  it("does not animate an already hidden panel", () => {
    const { element, animations } = fixture();
    portVisibility(element, false);
    expect(animations).toHaveLength(0); expect(element.hidden).toBe(true);
  });
  it("handles runtimes without Web Animations", () => {
    const element = { hidden: true, inert: true } as HTMLElement;
    portEnter(element); expect(element.hidden).toBe(false); expect(element.inert).toBe(false);
    portVisibility(element, false); expect(element.hidden).toBe(true);
  });
});
