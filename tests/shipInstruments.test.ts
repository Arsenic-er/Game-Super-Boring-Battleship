import { describe, expect, it } from "vitest";
import {
  formatHeading,
  formatRudder,
  shipInstrumentSnapshot,
  throttleLabel,
  wrapHeadingDegrees,
} from "../src/ui/shipInstruments";

describe("ship bridge instruments", () => {
  it("wraps and pads headings across multiple turns", () => {
    expect(formatHeading(0)).toBe("000°");
    expect(formatHeading(Math.PI * 2)).toBe("000°");
    expect(formatHeading(-Math.PI * 3)).toBe("180°");
    expect(formatHeading(Math.PI * 7)).toBe("180°");
    expect(wrapHeadingDegrees(359.6 * Math.PI / 180)).toBe(0);
  });

  it("keeps the established telegraph detents", () => {
    expect(throttleLabel(-1)).toBe("倒车");
    expect(throttleLabel(0)).toBe("停车");
    expect(throttleLabel(.1)).toBe("前进 1/4");
    expect(throttleLabel(.4)).toBe("前进 1/2");
    expect(throttleLabel(.65)).toBe("前进 3/4");
    expect(throttleLabel(.9)).toBe("全速前进");
  });

  it("shows port, amidships, and starboard rudder without mirroring", () => {
    expect(formatRudder(-.42)).toBe("左 42%");
    expect(formatRudder(0)).toBe("正舵");
    expect(formatRudder(.37)).toBe("右 37%");
  });

  it("clamps needles and sanitizes non-finite telemetry", () => {
    const fast = shipInstrumentSnapshot({
      headingRadians: -Math.PI / 2,
      rudder: 2,
      throttle: 2,
      speedKnots: 48,
      maximumSpeedKnots: 32,
    });
    expect(fast.headingText).toBe("270°");
    expect(fast.rudderPercent).toBe(100);
    expect(fast.throttlePercent).toBe(100);
    expect(fast.speedRatio).toBe(1);
    expect(fast.speedNeedleDegrees).toBe(128);

    const invalid = shipInstrumentSnapshot({
      headingRadians: Number.NaN,
      rudder: Number.POSITIVE_INFINITY,
      throttle: Number.NaN,
      speedKnots: Number.NEGATIVE_INFINITY,
      maximumSpeedKnots: 0,
    });
    expect(invalid.headingText).toBe("000°");
    expect(invalid.speedText).toBe("0.0");
    expect(invalid.speedRatio).toBe(0);
    expect(invalid.rudderText).toBe("正舵");
  });
});
