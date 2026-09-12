import type { Vec3 } from "../sim/types";

/** Frame the rendered formation, not just the authoritative leader. The sphere
 * fits regardless of orbit angle and leaves vertical space for battle HUD bars. */
export function aircraftCameraPlan(
  positions: readonly Readonly<Vec3>[], fallback: Readonly<Vec3>, aspectRatio: number,
): { target: Vec3; radius: number; fov: number } {
  const points = positions.filter(point => [point.x, point.y, point.z].every(Number.isFinite));
  const fov = .72;
  if (!points.length) return { target: { ...fallback }, radius: 140, fov };
  const target = {
    x: (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))) / 2,
    y: (Math.min(...points.map(point => point.y)) + Math.max(...points.map(point => point.y))) / 2,
    z: (Math.min(...points.map(point => point.z)) + Math.max(...points.map(point => point.z))) / 2,
  };
  const extent = Math.max(...points.map(point => Math.hypot(point.x - target.x, point.y - target.y, point.z - target.z))) + 20;
  const aspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  // Use the central52% vertically (24% top/bottom margins),90% horizontally.
  // The20m world-space allowance includes the full airframe and short camera lag.
  const angle = Math.atan(Math.tan(fov / 2) * Math.min(.52, aspect * .9));
  return { target, radius: Math.max(140, extent / Math.sin(angle)), fov };
}
