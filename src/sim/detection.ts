import { HYDRO, TORPEDO } from "./config";
import type { ProjectileState, ShipState } from "./types";

/** Shared by warnings, 3D rendering and maps so a detected torpedo is never
 * visible in one surface while absent from another. */
export function effectiveTorpedoDetectionRange(
  observer: Readonly<Pick<ShipState, "hydroActiveRemaining">>,
  projectile: Readonly<Pick<ProjectileState, "detectionRange">>,
): number {
  const nativeRange = projectile.detectionRange ?? TORPEDO.detectionRangeMeters;
  return observer.hydroActiveRemaining > 0
    ? Math.max(nativeRange, HYDRO.torpedoDetectionMeters)
    : nativeRange;
}
