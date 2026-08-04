export interface ShipInstrumentInput {
  headingRadians: number;
  rudder: number;
  throttle: number;
  speedKnots: number;
  maximumSpeedKnots: number;
}

export interface ShipInstrumentSnapshot {
  headingDegrees: number;
  headingText: string;
  compassRotationDegrees: number;
  rudderPercent: number;
  rudderText: string;
  throttlePercent: number;
  throttleText: string;
  speedText: string;
  speedRatio: number;
  speedNeedleDegrees: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));

export function wrapHeadingDegrees(headingRadians: number): number {
  const degrees = Number.isFinite(headingRadians) ? headingRadians * 180 / Math.PI : 0;
  const rounded = Math.round(degrees);
  return ((rounded % 360) + 360) % 360;
}

export function formatHeading(headingRadians: number): string {
  return `${String(wrapHeadingDegrees(headingRadians)).padStart(3, "0")}°`;
}

export function formatRudder(value: number): string {
  const percent = Math.round(clamp(value, -1, 1) * 100);
  if (Math.abs(percent) < 2) return "正舵";
  return `${percent < 0 ? "左" : "右"} ${Math.abs(percent)}%`;
}

export function throttleLabel(value: number): string {
  const throttle = clamp(value, -1, 1);
  if (throttle < 0) return "倒车";
  if (throttle < 0.1) return "停车";
  if (throttle < 0.4) return "前进 1/4";
  if (throttle < 0.65) return "前进 1/2";
  if (throttle < 0.9) return "前进 3/4";
  return "全速前进";
}

export function shipInstrumentSnapshot(input: ShipInstrumentInput): ShipInstrumentSnapshot {
  const headingDegrees = wrapHeadingDegrees(input.headingRadians);
  const rudder = clamp(input.rudder, -1, 1);
  const throttle = clamp(input.throttle, -1, 1);
  const speed = Number.isFinite(input.speedKnots) ? input.speedKnots : 0;
  const maximumSpeed = Number.isFinite(input.maximumSpeedKnots) && input.maximumSpeedKnots > 0
    ? input.maximumSpeedKnots
    : 1;
  const speedRatio = clamp(Math.abs(speed) / maximumSpeed, 0, 1);
  return {
    headingDegrees,
    headingText: `${String(headingDegrees).padStart(3, "0")}°`,
    compassRotationDegrees: -headingDegrees,
    rudderPercent: Math.round(rudder * 100),
    rudderText: formatRudder(rudder),
    throttlePercent: Math.round(throttle * 100),
    throttleText: throttleLabel(throttle),
    speedText: speed.toFixed(1),
    speedRatio,
    speedNeedleDegrees: -128 + speedRatio * 256,
  };
}
