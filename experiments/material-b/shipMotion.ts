/**
 * Deterministic, bounded motion for the material-B preview only.
 * This is an art-direction demo, not the production ship simulation.
 */
export type LabShipMotionPreset = "stop" | "slow" | "cruise" | "turn";

const METERS_PER_SECOND_PER_KNOT = 1852 / 3600;
export const knotsToMps = (knots: number): number => knots * METERS_PER_SECOND_PER_KNOT;
export const mpsToKnots = (metersPerSecond: number): number =>
  metersPerSecond / METERS_PER_SECOND_PER_KNOT;

export const MOTION_PRESETS = {
  stop: { speedKnots: 0, speedMps: knotsToMps(0) },
  slow: { speedKnots: 8, speedMps: knotsToMps(8) },
  cruise: { speedKnots: 18, speedMps: knotsToMps(18) },
  turn: { speedKnots: 12, speedMps: knotsToMps(12) },
} as const;

export const LAB_SHIP_MOTION_LIMITS = {
  fixedStepSeconds: 1 / 120,
  initialHeading: -.2,
  outerRadiusMeters: 200,
  turnRadiusMeters: 110,
  accelerationMps2: .65,
  decelerationMps2: .85,
  maximumRadialSlope: .18,
  radialSlopeChangePerMeter: .004,
} as const;

export interface LabShipMotionState {
  readonly x: number;
  readonly z: number;
  /** Unwrapped Babylon yaw: +Z is forward; positive yaw turns toward +X. */
  readonly heading: number;
  readonly speedMps: number;
  /** Integrated forward path length in metres, reset only by explicit reset(). */
  readonly distanceTravelled: number;
  readonly preset: LabShipMotionPreset;
}

export interface LabShipMotion {
  /** Immutable snapshot. Read again after step(), setPreset(), or reset(). */
  readonly state: Readonly<LabShipMotionState>;
  setPreset(preset: LabShipMotionPreset): Readonly<LabShipMotionState>;
  /** Retains fractional ticks; no elapsed time is silently dropped. */
  step(dtSeconds: number): Readonly<LabShipMotionState>;
  /** The only operation which intentionally repositions the demonstration ship. */
  reset(): Readonly<LabShipMotionState>;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));
const approach = (value: number, target: number, maximumChange: number): number =>
  value + clamp(target - value, -maximumChange, maximumChange);

/**
 * All movement remains inside one fixed 200 m disc. Its north edge is z=239.734m;
 * even the 54.35m J-class half-length remains south of the near-island z=300m line.
 *
 * Slow/cruise follow the outer circuit. Turn eases inward to a tighter circuit.
 * Radius changes are distance-based and slope-limited: changing a preset never
 * moves or rotates the ship immediately, and a stopped ship cannot pivot in place.
 */
export function createLabShipMotion(): LabShipMotion {
  const limits = LAB_SHIP_MOTION_LIMITS;
  const centerX = limits.outerRadiusMeters * Math.cos(limits.initialHeading);
  const centerZ = -limits.outerRadiusMeters * Math.sin(limits.initialHeading);
  let x = 0, z = 0, heading: number = limits.initialHeading, speedMps = 0;
  let distanceTravelled = 0, phase: number = limits.initialHeading;
  let radius: number = limits.outerRadiusMeters, radialSlope = 0;
  let targetRadius: number = limits.outerRadiusMeters;
  let preset: LabShipMotionPreset = "stop";
  let remainderSeconds = 0;
  const snapshot = (): Readonly<LabShipMotionState> => Object.freeze({
    x, z, heading, speedMps, distanceTravelled, preset,
  });
  let published = snapshot();

  const tick = (): void => {
    const dt = limits.fixedStepSeconds;
    const targetSpeed = MOTION_PRESETS[preset].speedMps;
    const acceleration = targetSpeed >= speedMps
      ? limits.accelerationMps2 : limits.decelerationMps2;
    const oldSpeed = speedMps;
    const transitionSeconds = Math.min(dt, Math.abs(targetSpeed - oldSpeed) / acceleration);
    speedMps = approach(oldSpeed, targetSpeed, acceleration * dt);
    // Exact area under the clipped linear acceleration ramp for this fixed tick.
    const ds = (oldSpeed + speedMps) * .5 * transitionSeconds
      + speedMps * (dt - transitionSeconds);
    if (ds === 0) return;

    const desiredSlope = clamp((targetRadius - radius) * .004,
      -limits.maximumRadialSlope, limits.maximumRadialSlope);
    const nextSlope = approach(radialSlope, desiredSlope,
      limits.radialSlopeChangePerMeter * ds);
    const meanSlope = (radialSlope + nextSlope) * .5;
    const nextRadius = clamp(radius + meanSlope * ds,
      limits.turnRadiusMeters, limits.outerRadiusMeters);
    const actualMeanSlope = (nextRadius - radius) / ds;
    const tangentialDistance = ds * Math.sqrt(Math.max(0, 1 - actualMeanSlope ** 2));
    phase += tangentialDistance / ((radius + nextRadius) * .5);
    radius = nextRadius;
    radialSlope = (radius === limits.turnRadiusMeters && nextSlope < 0)
      || (radius === limits.outerRadiusMeters && nextSlope > 0) ? 0 : nextSlope;
    x = centerX - radius * Math.cos(phase);
    z = centerZ + radius * Math.sin(phase);
    heading = phase - Math.asin(radialSlope);
    distanceTravelled += ds;
  };

  return {
    get state() { return published; },
    setPreset(value) {
      if (!Object.hasOwn(MOTION_PRESETS, value)) {
        throw new RangeError("Unknown material-B ship motion preset");
      }
      preset = value;
      // Stopping preserves the active course while braking.
      if (value !== "stop") targetRadius = value === "turn"
        ? limits.turnRadiusMeters : limits.outerRadiusMeters;
      published = snapshot();
      return published;
    },
    step(dtSeconds) {
      if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
        throw new RangeError("Ship motion dt must be a finite non-negative number");
      }
      if (dtSeconds === 0) return published;
      const accumulated = remainderSeconds + dtSeconds;
      // Tolerance only absorbs floating-point residue at exact tick boundaries.
      const ticks = Math.floor((accumulated + 1e-10) / limits.fixedStepSeconds);
      remainderSeconds = Math.max(0, accumulated - ticks * limits.fixedStepSeconds);
      for (let index = 0; index < ticks; index++) tick();
      if (ticks > 0) published = snapshot();
      return published;
    },
    reset() {
      x = 0; z = 0; heading = limits.initialHeading; speedMps = 0;
      distanceTravelled = 0; phase = limits.initialHeading;
      radius = limits.outerRadiusMeters; radialSlope = 0;
      targetRadius = limits.outerRadiusMeters; preset = "stop"; remainderSeconds = 0;
      published = snapshot();
      return published;
    },
  };
}
