import { AIR_FLIGHT_PROFILE } from "./airFlightModel";
import { AIR_NAVIGATION, AIR_OPERATION_TIMING } from "./airOperations";
import type { AirSquadronState, Vec3 } from "./types";

const GRAVITY = 9.81;
const CRUISE_SPEED_MARGIN = 0.8;
const SAFETY_SECONDS = 12;
const MAXIMUM_BUDGET_SECONDS = 3_600;
const finite = (value: number | undefined, fallback: number): number => Number.isFinite(value) ? value! : fallback;
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** Fuel needed to start recovery, not extra fuel or permission to bypass the landing gate.
 * A distant recovery needs at most a half-turn to face home; a high/near arrival
 * reserves a full re-entry circuit. Horizontal travel and descent run concurrently.
 * Uses only the aircraft and its own recovery point, never enemy/contact information.
 * Conservative open-air guidance; this is not terrain pathfinding or a reachability proof.
 */
export function airRecoveryFuelSeconds(
  squadron: Readonly<Pick<AirSquadronState, "role" | "position" | "flight">>,
  recoveryPoint: Readonly<Vec3>,
): number {
  const profile = AIR_FLIGHT_PROFILE[squadron.role];
  const cruiseSpeed = AIR_NAVIGATION.speedMetersPerSecond[squadron.role];
  const currentSpeed = clamp(finite(squadron.flight?.speedMetersPerSecond, cruiseSpeed),
    profile.minimumSpeedMetersPerSecond, profile.maximumSpeedMetersPerSecond);
  // Reserve travel time at a lower speed than commanded cruise, without division by
  // zero during launch. A fast dive must not promise an unrealistically short recovery.
  const usableSpeed = Math.max(profile.minimumSpeedMetersPerSecond,
    Math.min(cruiseSpeed, currentSpeed) * CRUISE_SPEED_MARGIN);
  const distance = Math.hypot(
    finite(squadron.position.x, 0) - finite(recoveryPoint.x, 0),
    finite(squadron.position.z, 0) - finite(recoveryPoint.z, 0),
  );
  const recoveryAltitude = Math.max(50, finite(recoveryPoint.y, 0));
  const altitudeSeconds = Math.abs(finite(squadron.position.y, recoveryAltitude) - recoveryAltitude)
    / profile.verticalRateMetersPerSecond;
  const turnSpeed = Math.max(cruiseSpeed, currentSpeed);
  const fullTurnSeconds = Math.PI * 2 * turnSpeed
    / (GRAVITY * Math.tan(profile.maximumBankRadians));
  const bank = clamp(finite(squadron.flight?.bank, 0), -profile.maximumBankRadians, profile.maximumBankRadians);
  const pitch = clamp(finite(squadron.flight?.pitch, 0), -profile.maximumDiveRadians, profile.maximumClimbRadians);
  const attitudeSeconds = (2 * profile.maximumBankRadians + Math.abs(bank)) / profile.rollRateRadiansPerSecond
    + Math.abs(pitch) / profile.pitchRateRadiansPerSecond;
  const budget = Math.max(distance / usableSpeed + fullTurnSeconds / 2,
    altitudeSeconds + fullTurnSeconds) + attitudeSeconds
    + AIR_OPERATION_TIMING.landingSeconds + SAFETY_SECONDS;
  // Extreme malformed coordinates must request early return, not produce NaN or
  // Infinity that would make the phase signal fall back to the old 35-second floor.
  return clamp(budget, AIR_OPERATION_TIMING.returnReserveSeconds, MAXIMUM_BUDGET_SECONDS);
}
