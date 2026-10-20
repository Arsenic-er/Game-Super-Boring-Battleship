import { getShipClass } from "../ships/classes";
import { NAVIGATION_PACE, shipSpeedMetersPerSecond } from "./config";
import type { ShipState } from "./types";

/**
 * Continuous-distance upper bound for positive headway at zero throttle, with
 * current engine damage and installed acceleration performance held constant.
 * Matches moveShip's forward braking branch; this is not astern braking, a turn
 * prediction, or permission to sail the corridor. No state or RNG is changed.
 */
export function forwardStoppingDistance(ship: Readonly<ShipState>): number {
  const speedKnots = Math.max(0, ship.speedKnots);
  if (speedKnots === 0) return 0;
  if (!Number.isFinite(speedKnots)) return Number.POSITIVE_INFINITY;
  if (ship.developer?.enabled && ship.developer.forcedSpeedKnots !== undefined) {
    // Forced speed overwrites propulsion each step, even at zero throttle.
    return ship.developer.forcedSpeedKnots === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  const engine = ship.modules.engine;
  const engineRatio = engine.maxHealth === 0 ? 0 : engine.health / engine.maxHealth;
  // A destroyed engine still has the simulator's 0.45 forward drag term.
  const brakingRate = getShipClass(ship.shipClassId).brakingKnotsPerSecond
    * (0.45 + engineRatio * 0.55)
    * ship.performance.accelerationMultiplier * NAVIGATION_PACE.propulsionResponseScale;
  // Invalid non-finite state must not look like a zero-length safe stop.
  // This is defensive planning behavior, not a change to normal propulsion.
  if (!Number.isFinite(brakingRate) || !(brakingRate > 0)) return Number.POSITIVE_INFINITY;
  return shipSpeedMetersPerSecond(speedKnots) * speedKnots / (2 * brakingRate);
}
