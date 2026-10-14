import { SENSOR } from "../sim/config";
import { FLEET_RADIO_DELAY_SECONDS, FLEET_RADIO_TTL_SECONDS } from "../sim/fleetRadio";
import { getShipClass } from "../ships/classes";
import type { FleetContactReport, Observation, Vec3 } from "../sim/types";
import { weatherPreset } from "../sim/weather";
import { SUPPORT_NAVIGATION } from "./objectiveSupportNavigation";

type KnownSearchTrack = Readonly<{
  position: Vec3; observedAt: number; confidence: number;
}>;

/** Public weather changes station spacing, never weapon or sensor range. */
export function supportStationRadius(
  observation: Readonly<Observation>, preferredRange: number, weaponRange: number,
): number {
  const visibility = weatherPreset(observation.weatherId).opticalVisibilityMultiplier;
  const nominal = Math.min(preferredRange * .65, weaponRange * .55);
  // The station planner may stop anywhere in its arrival band. Reserve that
  // margin in reduced visibility, otherwise the OUTER edge stays blind even
  // when the requested station center is nominally close enough.
  const arrivalAllowance = visibility < 1 ? SUPPORT_NAVIGATION.arrivalRadiusMeters : 0;
  return Math.max(observation.objective.radius + 400, nominal * visibility - arrivalAllowance);
}

/**
 * A report is only a bounded search destination. It cannot supply optical
 * acquisition samples or weapon authority, and a support ship cannot chase
 * an old contact to the map edge while its own objective is abandoned.
 */
export function supportMaySearchKnownContact(
  observation: Readonly<Observation>, radius: number,
  track: KnownSearchTrack | undefined, radio: Readonly<FleetContactReport> | undefined,
): boolean {
  if (!track || !Number.isFinite(radius) || radius <= 0
    || ![track.position.x, track.position.y, track.position.z, track.observedAt, track.confidence,
      observation.time].every(Number.isFinite)
    || track.observedAt < 0 || track.observedAt > observation.time || track.confidence <= 0 || track.confidence > 1) return false;
  const age = observation.time - track.observedAt;
  if (radio ? age >= FLEET_RADIO_TTL_SECONDS : age > SENSOR.memorySeconds) return false;
  if (radio && (radio.team === observation.self.team
    || !Number.isFinite(radio.receivedAt) || radio.receivedAt - radio.observedAt < FLEET_RADIO_DELAY_SECONDS
    || radio.receivedAt > observation.time || !radio.sourceShipId)) return false;

  const { objective, self } = observation;
  const targetRadius = Math.hypot(track.position.x - objective.center.x, track.position.z - objective.center.z);
  const ownRadius = Math.hypot(self.position.x - objective.center.x, self.position.z - objective.center.z);
  if (targetRadius > radius + 1_600 || ownRadius > radius + 1_000) return false;
  const hull = getShipClass(self.shipClassId);
  const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
  const dx = track.position.x - self.position.x, dz = track.position.z - self.position.z;
  const lengthSquared = dx * dx + dz * dz;
  const fraction = lengthSquared > 1e-9 ? Math.max(0, Math.min(1,
    ((objective.center.x - self.position.x) * dx + (objective.center.z - self.position.z) * dz) / lengthSquared)) : 0;
  const nearestRadius = Math.hypot(self.position.x + dx * fraction - objective.center.x,
    self.position.z + dz * fraction - objective.center.z);
  // Search remains a support duty: never enter or cut across the capture disk.
  if (nearestRadius < objective.radius + padding) return false;
  const opposingTeam = self.team === "player" ? "enemy" : "player";
  const safelyLeading = objective.owner === self.team && !objective.contested
    && objective.capturingTeam !== opposingTeam && objective.scores[self.team] >= objective.scores[opposingTeam];
  // Protect a nearby objective threat even while leading, but do not abandon
  // a safely scoring zone for a distant report.
  return !safelyLeading || targetRadius <= objective.radius + 600;
}
