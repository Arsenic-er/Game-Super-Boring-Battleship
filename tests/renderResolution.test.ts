import { afterEach, describe, expect, it, vi } from "vitest";
import { GameView } from "../src/render/gameView";
import {
  LOW_RENDER_MIN_SCALING,
  LOW_RENDER_PIXEL_BUDGET,
  renderResolutionFor,
} from "../src/render/renderResolution";

describe("3D render resolution budget", () => {
  it.each([
    [320, 240], [844, 390], [1280, 720], [1440, 900],
    [1920, 1080], [1920, 1280], [2880, 1920], [3840, 2160],
    [1080, 2400], [5120, 1440],
  ])("caps low quality at %i x %i without upsampling", (width, height) => {
    const result = renderResolutionFor("low", width, height);
    expect(result.hardwareScalingLevel).toBeGreaterThanOrEqual(LOW_RENDER_MIN_SCALING);
    expect(result.width * result.height).toBeLessThanOrEqual(LOW_RENDER_PIXEL_BUDGET);
    expect(result.width).toBeLessThanOrEqual(width);
    expect(result.height).toBeLessThanOrEqual(height);
    // Both axes share one scale. Only final integer framebuffer rounding differs.
    expect(Math.abs(result.width - width / result.hardwareScalingLevel)).toBeLessThan(1);
    expect(Math.abs(result.height - height / result.hardwareScalingLevel)).toBeLessThan(1);
  });

  it("retains the existing minimum downscale on small displays", () => {
    expect(renderResolutionFor("low", 844, 390)).toMatchObject({
      hardwareScalingLevel: 1.35, width: 625, height: 288,
    });
  });

  it("keeps medium at the old CSS-native resolution even above the low budget", () => {
    expect(renderResolutionFor("medium", 2880, 1920)).toMatchObject({
      hardwareScalingLevel: 1, width: 2880, height: 1920,
    });
  });

  it.each([[0, 0], [1920, 0], [-1, 720], [Infinity, 720], [1280, NaN]])(
    "uses a finite default for temporary invalid layout %s x %s", (width, height) => {
      const result = renderResolutionFor("low", width, height);
      expect(result.cssWidth).toBe(1280);
      expect(result.cssHeight).toBe(720);
      expect(Number.isFinite(result.hardwareScalingLevel)).toBe(true);
      expect(result.width * result.height).toBeLessThanOrEqual(LOW_RENDER_PIXEL_BUDGET);
    },
  );
});

function viewHarness(width: number, height: number) {
  const canvas = {
    clientWidth: width, clientHeight: height,
    width: 300, height: 150,
    style: { width: "100%", height: "100%" },
    getBoundingClientRect: () => ({ width: canvas.clientWidth, height: canvas.clientHeight }),
  };
  let hardwareScalingLevel = 1;
  const engine = {
    getHardwareScalingLevel: () => hardwareScalingLevel,
    setHardwareScalingLevel: vi.fn((value: number) => {
      hardwareScalingLevel = value;
      // Model Babylon's real intrinsic-size fallback so the zero-layout case
      // catches repeated scaling and quality changes that fail to resize.
      engine.setSize(
        (canvas.clientWidth || canvas.width * value || 100) / value,
        (canvas.clientHeight || canvas.height * value || 100) / value,
      );
    }),
    setSize: vi.fn((renderWidth: number, renderHeight: number) => {
      canvas.width = Math.floor(renderWidth);
      canvas.height = Math.floor(renderHeight);
    }),
  };
  const oceanWater = { setQuality: vi.fn() };
  const view = Object.create(GameView.prototype) as GameView;
  Object.assign(view, { engine, canvas, oceanWater, quality: "low" });
  return { canvas, engine, oceanWater, view };
}

afterEach(() => vi.unstubAllGlobals());

describe("GameView quality and resize paths", () => {
  it("applies the budget through the actual setQuality method and preserves ocean quality", () => {
    vi.stubGlobal("window", { innerWidth: 2880, innerHeight: 1920, devicePixelRatio: 2 });
    const { view, canvas, oceanWater, engine } = viewHarness(2880, 1920);
    view.setQuality("low");
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(LOW_RENDER_PIXEL_BUDGET);
    expect(engine.getHardwareScalingLevel()).toBeCloseTo(Math.sqrt(6));
    expect(oceanWater.setQuality).toHaveBeenLastCalledWith("low");
    expect(view.getQuality()).toBe("low");
    view.setQuality("medium");
    expect([canvas.width, canvas.height]).toEqual([2880, 1920]);
    expect(engine.getHardwareScalingLevel()).toBe(1);
    expect(oceanWater.setQuality).toHaveBeenLastCalledWith("medium");
    expect(view.getQuality()).toBe("medium");
    view.setQuality("low");
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(LOW_RENDER_PIXEL_BUDGET);
  });

  it("recomputes on resize in either direction without feeding framebuffer size back", () => {
    vi.stubGlobal("window", { innerWidth: 3840, innerHeight: 2160, devicePixelRatio: 1 });
    const { view, canvas, engine } = viewHarness(3840, 2160);
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
    canvas.clientWidth = 844; canvas.clientHeight = 390;
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([625, 288]);
    expect(engine.getHardwareScalingLevel()).toBe(1.35);
    for (let index = 0; index < 20; index++) view.resize();
    expect([canvas.width, canvas.height]).toEqual([625, 288]);
    canvas.clientWidth = 2880; canvas.clientHeight = 1920;
    view.resize();
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(LOW_RENDER_PIXEL_BUDGET);
    expect(canvas.style).toEqual({ width: "100%", height: "100%" });
  });

  it("ignores device-pixel-ratio changes and leaves DOM HUD sizing untouched", () => {
    const viewport = { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 };
    vi.stubGlobal("window", viewport);
    const { view, canvas } = viewHarness(844, 390);
    view.resize();
    const initial = [canvas.width, canvas.height];
    viewport.devicePixelRatio = 3;
    view.resize();
    expect([canvas.width, canvas.height]).toEqual(initial);
    expect([canvas.clientWidth, canvas.clientHeight]).toEqual([844, 390]);
    expect(canvas.style).toEqual({ width: "100%", height: "100%" });
    view.setQuality("medium");
    expect([canvas.width, canvas.height]).toEqual([844, 390]);
  });

  it("uses bounding rectangle dimensions when client dimensions are unavailable", () => {
    vi.stubGlobal("window", { innerWidth: 1, innerHeight: 1 });
    const { view, canvas } = viewHarness(0, 0);
    canvas.getBoundingClientRect = () => ({ width: 3840, height: 2160 });
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
  });

  it("falls back to viewport for a hidden initial canvas and recovers when laid out", () => {
    vi.stubGlobal("window", { innerWidth: 2880, innerHeight: 1920, devicePixelRatio: 2 });
    const { view, canvas } = viewHarness(0, 0);
    view.resize();
    const fallback = [canvas.width, canvas.height];
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(LOW_RENDER_PIXEL_BUDGET);
    for (let index = 0; index < 20; index++) view.resize();
    expect([canvas.width, canvas.height]).toEqual(fallback);
    canvas.clientWidth = 1280; canvas.clientHeight = 720;
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([948, 533]);
  });

  it("retains the last valid aspect ratio while hidden, including quality changes", () => {
    vi.stubGlobal("window", { innerWidth: 1, innerHeight: 1 });
    const { view, canvas } = viewHarness(2880, 1920);
    view.setQuality("medium");
    canvas.clientWidth = 0; canvas.clientHeight = 0;
    view.setQuality("low");
    const resolution = renderResolutionFor("low", 2880, 1920);
    expect([canvas.width, canvas.height]).toEqual([resolution.width, resolution.height]);
    view.setQuality("medium");
    expect([canvas.width, canvas.height]).toEqual([2880, 1920]);
    canvas.clientWidth = 844; canvas.clientHeight = 390;
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([844, 390]);
  });

  it("survives a zero-size viewport at startup until a later resize", () => {
    vi.stubGlobal("window", { innerWidth: 0, innerHeight: 0 });
    const { view, canvas } = viewHarness(0, 0);
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([948, 533]);
    canvas.clientWidth = 1920; canvas.clientHeight = 1080;
    view.resize();
    expect([canvas.width, canvas.height]).toEqual([1280, 720]);
  });
});
