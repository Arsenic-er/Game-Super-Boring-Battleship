import { describe, expect, it } from "vitest";
import {
  createLabShipMotion, knotsToMps, mpsToKnots, MOTION_PRESETS,
  LAB_SHIP_MOTION_LIMITS, type LabShipMotion, type LabShipMotionPreset,
} from "./shipMotion";

function run(motion: LabShipMotion, seconds: number, fps: number): void {
  for (let index = 0; index < Math.round(seconds * fps); index++) motion.step(1 / fps);
}

describe("material-B deterministic ship motion", () => {
  it("starts stopped at the origin in the J-class Babylon heading", () => {
    const motion = createLabShipMotion();
    expect(motion.state).toEqual({
      x: 0, z: 0, heading: -.2, speedMps: 0, distanceTravelled: 0, preset: "stop",
    });
    expect(Object.isFrozen(motion.state)).toBe(true);
    expect(motion.step(20)).toEqual(motion.state);
    expect(motion.state.x).toBe(0);
    expect(motion.state.z).toBe(0);
    expect(motion.state.heading).toBe(-.2);
  });

  it("exposes knots for labels but integrates speed in metres per second", () => {
    expect(knotsToMps(1)).toBeCloseTo(.514444444444, 10);
    expect(mpsToKnots(knotsToMps(18))).toBeCloseTo(18, 12);
    expect(Object.values(MOTION_PRESETS).map(p => p.speedKnots)).toEqual([0, 8, 18, 12]);
    for (const preset of ["slow", "cruise", "turn"] as const) {
      const motion = createLabShipMotion();
      motion.setPreset(preset);
      motion.step(40);
      expect(motion.state.speedMps).toBe(MOTION_PRESETS[preset].speedMps);
    }
  });

  it("does not teleport or snap heading or speed when selecting a preset", () => {
    const motion = createLabShipMotion();
    motion.setPreset("cruise");
    motion.step(35);
    for (const preset of ["turn", "slow", "cruise", "stop"] as const) {
      const before = motion.state;
      motion.setPreset(preset);
      expect(motion.state).toEqual({ ...before, preset });
      const after = motion.step(1 / 60);
      expect(Math.hypot(after.x - before.x, after.z - before.z))
        .toBeLessThanOrEqual(MOTION_PRESETS.cruise.speedMps / 60 + 1e-6);
      expect(Math.abs(after.heading - before.heading)).toBeLessThan(.15 / 60);
      expect(Math.abs(after.speedMps - before.speedMps)).toBeLessThanOrEqual(.85 / 60 + 1e-12);
    }
  });

  it("accelerates continuously, brakes to zero, then holds its position and heading", () => {
    const motion = createLabShipMotion();
    motion.setPreset("cruise");
    expect(motion.state.speedMps).toBe(0);
    motion.step(1);
    expect(motion.state.speedMps).toBeCloseTo(.65, 12);
    expect(motion.state.distanceTravelled).toBeCloseTo(.325, 12);
    motion.step(40);
    const speedBeforeStop = motion.state.speedMps;
    motion.setPreset("stop");
    expect(motion.state.speedMps).toBe(speedBeforeStop);
    motion.step(1);
    expect(motion.state.speedMps).toBeCloseTo(speedBeforeStop - .85, 12);
    motion.step(20);
    const stopped = motion.state;
    expect(stopped.speedMps).toBe(0);
    motion.step(120);
    expect(motion.state).toEqual(stopped);
  });

  it("produces identical states at 30fps and 60fps across mode changes", () => {
    const a = createLabShipMotion(), b = createLabShipMotion();
    const script: Array<[LabShipMotionPreset, number]> = [
      ["stop", 2], ["slow", 30], ["turn", 40], ["cruise", 60],
      ["turn", 45], ["slow", 15], ["stop", 30],
    ];
    for (const [preset, seconds] of script) {
      a.setPreset(preset); b.setPreset(preset);
      run(a, seconds, 30); run(b, seconds, 60);
      expect(a.state).toEqual(b.state);
    }
  });

  it("retains sub-tick time and matches coarse and irregular time slices", () => {
    const fine = createLabShipMotion(), coarse = createLabShipMotion(), irregular = createLabShipMotion();
    for (const motion of [fine, coarse, irregular]) motion.setPreset("turn");
    run(fine, 100, 60);
    coarse.step(100);
    const slices = [.003, .021, .047, .009, .013];
    let elapsed = 0, index = 0;
    while (elapsed < 100) {
      const dt = Math.min(slices[index++ % slices.length]!, 100 - elapsed);
      irregular.step(dt); elapsed += dt;
    }
    expect(coarse.state).toEqual(fine.state);
    expect(irregular.state).toEqual(fine.state);
    const partial = createLabShipMotion();
    partial.setPreset("slow");
    partial.step(1 / 240);
    expect(partial.state.distanceTravelled).toBe(0);
    partial.step(1 / 240);
    expect(partial.state.distanceTravelled).toBeGreaterThan(0);
  });

  it("keeps the path and J-class hull south of the near-island boundary without jumps", () => {
    const motion = createLabShipMotion();
    const limits = LAB_SHIP_MOTION_LIMITS;
    const centerX = 200 * Math.cos(-.2), centerZ = -200 * Math.sin(-.2);
    const modes = ["cruise", "turn", "slow", "turn", "stop", "cruise"] as const;
    let last = motion.state;
    for (let frame = 0; frame < 1200 * 30; frame++) {
      if (frame % 900 === 0) motion.setPreset(modes[Math.floor(frame / 900) % modes.length]!);
      const state = motion.step(1 / 30);
      const radius = Math.hypot(state.x - centerX, state.z - centerZ);
      expect(radius).toBeLessThanOrEqual(limits.outerRadiusMeters + 1e-9);
      expect(radius).toBeGreaterThanOrEqual(limits.turnRadiusMeters - 1e-9);
      expect(state.z + 54.35).toBeLessThan(300);
      expect(state.distanceTravelled).toBeGreaterThanOrEqual(last.distanceTravelled);
      expect(Math.hypot(state.x - last.x, state.z - last.z))
        .toBeLessThanOrEqual(MOTION_PRESETS.cruise.speedMps / 30 + 1e-6);
      expect(Math.abs(state.heading - last.heading)).toBeLessThan(.15 / 30);
      last = state;
    }
  });

  it("turn mode moves to a tighter continuous circuit, without an instantaneous yaw change", () => {
    const motion = createLabShipMotion();
    motion.setPreset("cruise"); motion.step(40);
    const before = motion.state;
    motion.setPreset("turn");
    expect(motion.state.heading).toBe(before.heading);
    motion.step(300);
    const centerX = 200 * Math.cos(-.2), centerZ = -200 * Math.sin(-.2);
    expect(Math.hypot(motion.state.x - centerX, motion.state.z - centerZ)).toBeLessThan(112);
    const initialHeading = motion.state.heading;
    motion.step(10);
    expect(motion.state.heading).toBeGreaterThan(initialHeading);
    expect(motion.state.speedMps).toBe(MOTION_PRESETS.turn.speedMps);
  });

  it("resets position, speed, travel, course, preset and fractional time", () => {
    const motion = createLabShipMotion(), fresh = createLabShipMotion();
    motion.setPreset("turn"); motion.step(37.003);
    expect(motion.reset()).toEqual(fresh.state);
    motion.setPreset("slow"); fresh.setPreset("slow");
    motion.step(.005); fresh.step(.005);
    expect(motion.state).toEqual(fresh.state);
    motion.step(15); fresh.step(15);
    expect(motion.state).toEqual(fresh.state);
  });

  it("rejects invalid input before changing the published state", () => {
    const motion = createLabShipMotion(), before = motion.state;
    for (const dt of [-1, NaN, Infinity, -Infinity]) expect(() => motion.step(dt)).toThrow(RangeError);
    expect(() => motion.setPreset("invalid" as LabShipMotionPreset)).toThrow(RangeError);
    expect(motion.state).toBe(before);
    expect(motion.step(0)).toBe(before);
  });
});
