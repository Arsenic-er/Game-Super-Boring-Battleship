import { getShipClass } from "../ships/classes";
import { NAVIGATION_PACE, shipSpeedMetersPerSecond } from "./config";
import type { ControlCommand, ShipState, Vec3 } from "./types";

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


/** Motion-only state: no weapons, damage timers, battle state, entities or RNG. */
export interface ShipKinematicState {
  position: Vec3;
  heading: number;
  speedKnots: number;
  rudder: number;
  throttle: number;
  rudderCommand: number;
  turnRateRadians: number;
  distanceTravelled: number;
}

/** A value snapshot. Simulation refreshes this each tick; prediction freezes it. */
export interface ShipKinematicParameters {
  readonly engineRatio: number;
  readonly steeringRatio: number;
  readonly rudderShiftRate: number;
  readonly floodingSpeedFactor: number;
  readonly equippedMaxSpeed: number;
  readonly accelerationKnotsPerSecond: number;
  readonly brakingKnotsPerSecond: number;
  readonly maximumTurningSpeedLoss: number;
  readonly maxTurnRateRadians: number;
  readonly accelerationMultiplier: number;
  readonly turnMultiplier: number;
  readonly forcedSpeedKnots?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

/** Copies only motion fields, including position: advancing it cannot mutate a ship. */
export function createShipKinematicSnapshot(ship: Readonly<ShipKinematicState>): ShipKinematicState {
  return {
    position: { ...ship.position }, heading: ship.heading, speedKnots: ship.speedKnots,
    rudder: ship.rudder, throttle: ship.throttle, rudderCommand: ship.rudderCommand,
    turnRateRadians: ship.turnRateRadians, distanceTravelled: ship.distanceTravelled,
  };
}

export function shipKinematicParameters(ship: Readonly<ShipState>): ShipKinematicParameters {
  const hullDefinition = getShipClass(ship.shipClassId);
  const engineRatio = ship.modules.engine.maxHealth === 0 ? 0
    : ship.modules.engine.health / ship.modules.engine.maxHealth;
  const steeringRatio = ship.modules.steering.maxHealth === 0 ? 0
    : ship.modules.steering.health / ship.modules.steering.maxHealth;
  const rudderShiftRate = steeringRatio <= 0
    ? 0
    : hullDefinition.rudderShiftPerSecond * (0.18 + steeringRatio * 0.82) * NAVIGATION_PACE.travelTimeScale;
  const floodingSpeedFactor = 1 - clamp(ship.flooding / 100, 0, 1) * 0.32;
  const developerSpeedMultiplier = ship.developer?.enabled
    ? clamp(ship.developer.speedMultiplier, .1, 6)
    : 1;
  const equippedMaxSpeed = hullDefinition.maxSpeedKnots
    * ship.performance.maxSpeedMultiplier * developerSpeedMultiplier;
  return {
    engineRatio, steeringRatio, rudderShiftRate, floodingSpeedFactor, equippedMaxSpeed,
    accelerationKnotsPerSecond: hullDefinition.accelerationKnotsPerSecond,
    brakingKnotsPerSecond: hullDefinition.brakingKnotsPerSecond,
    maximumTurningSpeedLoss: hullDefinition.maximumTurningSpeedLoss,
    maxTurnRateRadians: hullDefinition.maxTurnRateRadians,
    accelerationMultiplier: ship.performance.accelerationMultiplier,
    turnMultiplier: ship.performance.turnMultiplier,
    forcedSpeedKnots: ship.developer?.enabled ? ship.developer.forcedSpeedKnots : undefined,
  };
}

/**
 * The production semi-implicit movement step, in its original arithmetic order.
 * Terrain speed is sampled at the OLD center by the caller before every step.
 * This does not resolve contact, advance repair, update weapons or consume RNG.
 * The caller must separately certify every swept hull, not just the endpoint.
 */
export function advanceShipKinematics(
  ship: ShipKinematicState,
  parameters: Readonly<ShipKinematicParameters>,
  controls: Readonly<Pick<ControlCommand, "throttle" | "rudder">>,
  navigationSpeedMultiplier: number,
  dt: number,
): void {
  ship.throttle = clamp(controls.throttle, -0.25, 1);
  ship.rudderCommand = clamp(controls.rudder, -1, 1);
  const { engineRatio, steeringRatio, rudderShiftRate, floodingSpeedFactor, equippedMaxSpeed } = parameters;
  ship.rudder += clamp(
    ship.rudderCommand - ship.rudder,
    -rudderShiftRate * dt,
    rudderShiftRate * dt,
  );
  const effectiveMaxSpeed = equippedMaxSpeed * engineRatio * floodingSpeedFactor
    * navigationSpeedMultiplier * Math.max(0, ship.throttle);
  const reverseTarget = ship.throttle < 0 ? equippedMaxSpeed * ship.throttle * 0.28 : effectiveMaxSpeed;
  const orderedSpeed = ship.throttle < 0 ? reverseTarget : effectiveMaxSpeed;
  const turningSpeedFactor = 1
    - Math.abs(ship.rudder) * parameters.maximumTurningSpeedLoss;
  const targetSpeed = orderedSpeed * turningSpeedFactor;
  const propulsionResponse = engineRatio <= 0 ? 0 : 0.2 + engineRatio * 0.8;
  const rate = (targetSpeed >= ship.speedKnots
    ? parameters.accelerationKnotsPerSecond * propulsionResponse
    : parameters.brakingKnotsPerSecond * (0.45 + engineRatio * 0.55))
    * parameters.accelerationMultiplier * NAVIGATION_PACE.propulsionResponseScale;
  ship.speedKnots += clamp(targetSpeed - ship.speedKnots, -rate * dt, rate * dt);
  if (parameters.forcedSpeedKnots !== undefined) {
    ship.speedKnots = clamp(parameters.forcedSpeedKnots, -40, 200);
  }

  const speedRatio = clamp(Math.abs(ship.speedKnots) / equippedMaxSpeed, 0, 1);
  const turnAuthority = steeringRatio * (0.2 + 0.8 * speedRatio);
  const previousHeading = ship.heading;
  ship.heading += ship.rudder * parameters.maxTurnRateRadians
    * parameters.turnMultiplier * turnAuthority
    * NAVIGATION_PACE.travelTimeScale * dt;
  ship.turnRateRadians = wrapAngle(ship.heading - previousHeading) / Math.max(dt, 0.0001);

  const metersPerSecond = shipSpeedMetersPerSecond(ship.speedKnots);
  const moveX = Math.sin(ship.heading) * metersPerSecond * dt;
  const moveZ = Math.cos(ship.heading) * metersPerSecond * dt;
  ship.position.x += moveX;
  ship.position.z += moveZ;
  ship.distanceTravelled += Math.hypot(moveX, moveZ);
}
