import type { AircraftRole, AirFlightState, AirSquadronPhase, Vec3 } from "./types";

export interface AirFlightProfile {
  cruiseAltitude: number;
  attackAltitude: number;
  /** Autopilot demand limit; actual yaw rate comes from coordinated banking. */
  maximumTurnRateRadians: number;
  /** Altitude-hold climb/descent limit; an explicit dive path can exceed this. */
  verticalRateMetersPerSecond: number;
  maximumBankRadians: number;
  rollRateRadiansPerSecond: number;
  pitchRateRadiansPerSecond: number;
  maximumClimbRadians: number;
  maximumDiveRadians: number;
  minimumSpeedMetersPerSecond: number;
  maximumSpeedMetersPerSecond: number;
  longitudinalAccelerationMetersPerSecondSquared: number;
}

const radians = (degrees: number): number => degrees * Math.PI / 180;
export const AIR_FLIGHT_PROFILE: Record<AircraftRole, AirFlightProfile> = {
  fighter: {
    cruiseAltitude: 295, attackAltitude: 270,
    maximumTurnRateRadians: radians(32), verticalRateMetersPerSecond: 22,
    maximumBankRadians: radians(65), rollRateRadiansPerSecond: radians(55),
    pitchRateRadiansPerSecond: radians(20), maximumClimbRadians: radians(25),
    maximumDiveRadians: radians(55), minimumSpeedMetersPerSecond: 44,
    maximumSpeedMetersPerSecond: 175, longitudinalAccelerationMetersPerSecondSquared: 5,
  },
  diveBomber: {
    cruiseAltitude: 390, attackAltitude: 92,
    maximumTurnRateRadians: radians(21), verticalRateMetersPerSecond: 18,
    maximumBankRadians: radians(55), rollRateRadiansPerSecond: radians(38),
    pitchRateRadiansPerSecond: radians(16), maximumClimbRadians: radians(20),
    maximumDiveRadians: radians(65), minimumSpeedMetersPerSecond: 42,
    maximumSpeedMetersPerSecond: 150, longitudinalAccelerationMetersPerSecondSquared: 4.2,
  },
  torpedoBomber: {
    cruiseAltitude: 225, attackAltitude: 68,
    maximumTurnRateRadians: radians(16), verticalRateMetersPerSecond: 12,
    maximumBankRadians: radians(45), rollRateRadiansPerSecond: radians(28),
    pitchRateRadiansPerSecond: radians(10), maximumClimbRadians: radians(16),
    maximumDiveRadians: radians(22), minimumSpeedMetersPerSecond: 40,
    maximumSpeedMetersPerSecond: 135, longitudinalAccelerationMetersPerSecondSquared: 3.5,
  },
};

const GRAVITY = 9.81;
const MAXIMUM_STEP = 1 / 120;
const MAXIMUM_ELAPSED = 2;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const finite = (value: number | undefined, fallback: number): number => Number.isFinite(value) ? value! : fallback;
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (value: number, target: number, maximumDelta: number): number => value + clamp(target - value, -maximumDelta, maximumDelta);

export function airSquadronSeed(id: string): number {
  let value = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    value ^= id.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 0xffffffff;
}

export function airSquadronTargetAltitude(
  role: AircraftRole,
  phase: AirSquadronPhase,
  id: string,
  _time: number,
  interceptedAltitude?: number,
): number {
  const profile = AIR_FLIGHT_PROFILE[role];
  const seed = airSquadronSeed(id);
  if (phase === "attackRun") return profile.attackAltitude + (seed - .5) * 12;
  if (phase === "intercepting" && role === "fighter" && Number.isFinite(interceptedAltitude)) {
    return clamp(interceptedAltitude! + (seed - .5) * 18, 120, 460);
  }
  // A stable formation layer, not a slow sine animation masquerading as flight dynamics.
  return profile.cruiseAltitude + (seed - .5) * 58;
}

export interface AirKinematicsInput {
  id: string;
  role: AircraftRole;
  phase: AirSquadronPhase;
  position: Readonly<Vec3>;
  heading: number;
  destination: Readonly<Vec3>;
  /** Target airspeed, not a distance increment. */
  speedMetersPerSecond: number;
  dt: number;
  time: number;
  canMove: boolean;
  flight?: Readonly<AirFlightState>;
  targetAltitude?: number;
  /** Flight-path angle in radians: positive climb, negative descent. */
  targetPitch?: number;
  minimumAltitude?: number;
}

export interface AirKinematicsResult {
  position: Vec3;
  heading: number;
  flight: AirFlightState;
}

/**
 * Lightweight 3D point-mass autopilot, independently implemented. Altitude -> climb rate ->
 * pitch and heading -> bank are bounded control cascades; bank drives a coordinated turn.
 * Flight-path pitch equals the velocity inclination (angle of attack/stall aerodynamics are
 * deliberately outside this model). Positive bank turns right; renderers convert their signs.
 */
export function advanceAirKinematics(input: Readonly<AirKinematicsInput>): AirKinematicsResult {
  const profile = AIR_FLIGHT_PROFILE[input.role];
  const targetSpeed = clamp(finite(input.speedMetersPerSecond, 90), 0, profile.maximumSpeedMetersPerSecond);
  const position = {
    x: finite(input.position.x, 0), y: finite(input.position.y, 0), z: finite(input.position.z, 0),
  };
  let heading = finite(input.heading, 0);
  const flight: AirFlightState = {
    speedMetersPerSecond: clamp(finite(input.flight?.speedMetersPerSecond, targetSpeed), 0, profile.maximumSpeedMetersPerSecond),
    pitch: clamp(finite(input.flight?.pitch, 0), -profile.maximumDiveRadians, profile.maximumClimbRadians),
    bank: clamp(finite(input.flight?.bank, 0), -profile.maximumBankRadians, profile.maximumBankRadians),
  };
  const elapsed = clamp(finite(input.dt, 0), 0, MAXIMUM_ELAPSED);
  if (!input.canMove || elapsed === 0) return { position, heading, flight };
  const floor = Math.max(0, finite(input.minimumAltitude, 5));
  const targetAltitude = Math.max(floor, finite(input.targetAltitude, airSquadronTargetAltitude(
    input.role, input.phase, input.id, input.time,
    input.phase === "intercepting" ? input.destination.y : undefined,
  )));
  // Same small integration steps at 30/60/120 Hz, with a hard CPU bound for malformed/late ticks.
  const steps = Math.max(1, Math.ceil(elapsed / MAXIMUM_STEP - 1e-9));
  const dt = elapsed / steps;
  for (let step = 0; step < steps; step += 1) {
    const oldSpeed = flight.speedMetersPerSecond;
    const oldPitch = flight.pitch;
    const oldBank = flight.bank;
    const dx = finite(input.destination.x, position.x) - position.x;
    const dz = finite(input.destination.z, position.z) - position.z;
    const distance = Math.hypot(dx, dz);
    // Fly through a waypoint; the mission planner selects the next leg. Never stop in mid-air.
    const headingError = distance < Math.max(2, oldSpeed * 0.08)
      ? 0 : wrapAngle(Math.atan2(dx, dz) - heading);
    const horizontalSpeed = Math.max(10, oldSpeed * Math.cos(oldPitch));
    const turnDemand = clamp(headingError * 1.6, -profile.maximumTurnRateRadians, profile.maximumTurnRateRadians);
    const lowSpeedAuthority = clamp(oldSpeed / profile.minimumSpeedMetersPerSecond, 0, 1);
    const desiredBank = clamp(Math.atan(turnDemand * horizontalSpeed / GRAVITY),
      -profile.maximumBankRadians, profile.maximumBankRadians) * lowSpeedAuthority;
    flight.bank = approach(oldBank, desiredBank, profile.rollRateRadiansPerSecond * dt);

    const desiredClimbRate = clamp((targetAltitude - position.y) * 0.4,
      -profile.verticalRateMetersPerSecond, profile.verticalRateMetersPerSecond);
    const altitudePitch = Math.asin(clamp(desiredClimbRate / Math.max(1, oldSpeed), -1, 1));
    let desiredPitch = clamp(finite(input.targetPitch, altitudePitch), -profile.maximumDiveRadians, profile.maximumClimbRadians);
    // Preserve low-speed continuity during launch, but do not spend unavailable energy on a climb.
    const climbAuthority = clamp((oldSpeed - profile.minimumSpeedMetersPerSecond) / 18, 0, 1);
    desiredPitch = Math.min(desiredPitch, profile.maximumClimbRadians * climbAuthority);
    const descentAngle = Math.max(0, -oldPitch);
    const recoverySeconds = descentAngle / profile.pitchRateRadiansPerSecond;
    const recoverySpeed = Math.min(profile.maximumSpeedMetersPerSecond,
      oldSpeed + profile.longitudinalAccelerationMetersPerSecondSquared * recoverySeconds);
    const recoveryHeight = recoverySpeed * (1 - Math.cos(descentAngle)) / profile.pitchRateRadiansPerSecond;
    if (position.y - floor < recoveryHeight + 12) desiredPitch = Math.max(0, desiredPitch);
    flight.pitch = approach(oldPitch, desiredPitch, profile.pitchRateRadiansPerSecond * dt);

    const midPitch = (oldPitch + flight.pitch) * 0.5;
    const midBank = (oldBank + flight.bank) * 0.5;
    const accelerationLimit = profile.longitudinalAccelerationMetersPerSecondSquared;
    const speedControl = clamp((targetSpeed - oldSpeed) * 0.65, -accelerationLimit, accelerationLimit);
    const inducedDrag = 0.7 * (1 / Math.cos(midBank) - 1);
    const acceleration = clamp(speedControl - GRAVITY * Math.sin(midPitch) - inducedDrag,
      -accelerationLimit, accelerationLimit);
    flight.speedMetersPerSecond = clamp(oldSpeed + acceleration * dt, 0, profile.maximumSpeedMetersPerSecond);
    const speed = (oldSpeed + flight.speedMetersPerSecond) * 0.5;
    const horizontal = speed * Math.cos(midPitch);
    const yawRate = GRAVITY * Math.tan(midBank) / Math.max(10, horizontal);
    const headingDelta = yawRate * dt;
    const travelHeading = heading + headingDelta * 0.5;
    position.x += Math.sin(travelHeading) * horizontal * dt;
    position.y = Math.max(floor, position.y + Math.sin(midPitch) * speed * dt);
    position.z += Math.cos(travelHeading) * horizontal * dt;
    heading = wrapAngle(heading + headingDelta);
  }
  return { position, heading, flight };
}
