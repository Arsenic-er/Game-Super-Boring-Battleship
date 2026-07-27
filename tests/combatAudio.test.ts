import { describe, expect, it } from "vitest";
import {
  audioAngularDelta,
  mountTraversed,
  throttleOrderChanged,
} from "../src/render/combatAudio";

describe("combat audio telemetry", () => {
  it("rings the engine telegraph only after a real throttle order change", () => {
    expect(throttleOrderChanged(undefined, 0.55)).toBe(false);
    expect(throttleOrderChanged(0.55, 0.55)).toBe(false);
    expect(throttleOrderChanged(0.55, 0.8)).toBe(true);
    expect(throttleOrderChanged(0.8, 0.55)).toBe(true);
  });

  it("detects mount traversal without treating angle wrapping as a full rotation", () => {
    const almostPositivePi = 179 * Math.PI / 180;
    const almostNegativePi = -179 * Math.PI / 180;
    expect(mountTraversed(undefined, 0)).toBe(false);
    expect(mountTraversed(0.4, 0.4)).toBe(false);
    expect(mountTraversed(0.4, 0.42)).toBe(true);
    expect(audioAngularDelta(almostPositivePi, almostNegativePi)).toBeCloseTo(2 * Math.PI / 180);
  });
});
