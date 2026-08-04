import type { AircraftRole, AirSquadronPhase, Vec3 } from "./types";

export interface AirFlightProfile {
  cruiseAltitude: number;
  attackAltitude: number;
  maximumTurnRateRadians: number;
  verticalRateMetersPerSecond: number;
}

export const AIR_FLIGHT_PROFILE: Record<AircraftRole, AirFlightProfile> = {
  fighter: {
    cruiseAltitude: 295,
    attackAltitude: 270,
    maximumTurnRateRadians: 32 * Math.PI / 180,
    verticalRateMetersPerSecond: 72,
  },
  diveBomber: {
    cruiseAltitude: 390,
    attackAltitude: 92,
    maximumTurnRateRadians: 21 * Math.PI / 180,
    verticalRateMetersPerSecond: 108,
  },
  torpedoBomber: {
    cruiseAltitude: 225,
    attackAltitude: 68,
    maximumTurnRateRadians: 16 * Math.PI / 180,
    verticalRateMetersPerSecond: 58,
  },
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

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
  time: number,
  interceptedAltitude?: number,
): number {
  const profile = AIR_FLIGHT_PROFILE[role];
  const seed = airSquadronSeed(id);
  if (phase === "attackRun") return profile.attackAltitude + (seed - .5) * 12;
  if (phase === "intercepting" && role === "fighter" && interceptedAltitude !== undefined) {
    return clamp(interceptedAltitude + (seed - .5) * 18, 120, 460);
  }
  const layerOffset = (seed - .5) * 58;
  const gentleVariation = Math.sin(time * .055 + seed * Math.PI * 2) * 9;
  return profile.cruiseAltitude + layerOffset + gentleVariation;
}

export interface AirKinematicsInput {
  id: string;
  role: AircraftRole;
  phase: AirSquadronPhase;
  position: Readonly<Vec3>;
  heading: number;
  destination: Readonly<Vec3>;
  speedMetersPerSecond: number;
  dt: number;
  time: number;
  canMove: boolean;
}

export interface AirKinematicsResult {
  position: Vec3;
  heading: number;
}

export function advanceAirKinematics(input: Readonly<AirKinematicsInput>): AirKinematicsResult {
  if (!input.canMove || input.dt <= 0) {
    return { position: { ...input.position }, heading: input.heading };
  }
  const dx = input.destination.x - input.position.x;
  const dz = input.destination.z - input.position.z;
  const distance = Math.hypot(dx, dz);
  const desiredHeading = distance <= .001 ? input.heading : Math.atan2(dx, dz);
  const profile = AIR_FLIGHT_PROFILE[input.role];
  const turnLimit = profile.maximumTurnRateRadians * input.dt;
  const headingDelta = clamp(wrapAngle(desiredHeading - input.heading), -turnLimit, turnLimit);
  const heading = wrapAngle(input.heading + headingDelta);
  const step = Math.min(distance, input.speedMetersPerSecond * input.dt);
  const targetAltitude = airSquadronTargetAltitude(
    input.role,
    input.phase,
    input.id,
    input.time,
    input.phase === "intercepting" ? input.destination.y : undefined,
  );
  const altitudeDelta = clamp(
    targetAltitude - input.position.y,
    -profile.verticalRateMetersPerSecond * input.dt,
    profile.verticalRateMetersPerSecond * input.dt,
  );
  return {
    position: {
      x: input.position.x + Math.sin(heading) * step,
      y: input.position.y + altitudeDelta,
      z: input.position.z + Math.cos(heading) * step,
    },
    heading,
  };
}
