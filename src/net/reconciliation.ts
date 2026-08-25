import type { Vec3 } from "../sim/types";

export const BLEND_DISTANCE_METERS = 5;
export const SNAP_DISTANCE_METERS = 20;
export const SNAP_HEADING_DEGREES = 10;

export function reconciliationMode(
  positionErrorMeters: number,
  headingErrorDegrees: number,
): "blend" | "converge" | "snap" {
  if (positionErrorMeters >= SNAP_DISTANCE_METERS || headingErrorDegrees >= SNAP_HEADING_DEGREES) {
    return "snap";
  }
  if (positionErrorMeters >= BLEND_DISTANCE_METERS) return "converge";
  return "blend";
}

export function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

export function lerpNumber(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

export function lerpAngle(start: number, end: number, alpha: number): number {
  return wrapAngle(start + wrapAngle(end - start) * alpha);
}

export function lerpVec3(start: Readonly<Vec3>, end: Readonly<Vec3>, alpha: number): Vec3 {
  return {
    x: lerpNumber(start.x, end.x, alpha),
    y: lerpNumber(start.y, end.y, alpha),
    z: lerpNumber(start.z, end.z, alpha),
  };
}

export function distanceMeters(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function headingErrorDegrees(current: number, authoritative: number): number {
  return Math.abs(wrapAngle(current - authoritative)) * 180 / Math.PI;
}
