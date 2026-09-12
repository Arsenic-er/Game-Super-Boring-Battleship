import { battleMapDefinition, type BattleMapId } from "../maps/atollMap";
import { AIR_FLIGHT_PROFILE } from "./airFlightModel";
import { AIR_NAVIGATION } from "./airOperations";
import type { AirSquadronState, Vec3 } from "./types";

interface AirTerrainBound {
  x: number;
  z: number;
  radius: number;
  safeAltitude: number;
}

const SEA_CLEARANCE = 18;
const TERRAIN_MARGIN = 55;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const finite = (value: number | undefined, fallback: number): number => Number.isFinite(value) ? value! : fallback;

function boundsFor(mapId: BattleMapId): readonly AirTerrainBound[] {
  return battleMapDefinition(mapId).terrain
    .filter((zone) => zone.kind !== "shallow" && (zone.heightMeters ?? 0) > 0)
    .map((zone) => ({
      x: zone.x,
      z: zone.z,
      // Enclose all rotations and the irregular radial coast, not just the nominal ellipse.
      // The defaults match the maximum radial factors used by the shared map geometry.
      radius: Math.max(zone.radiusX, zone.radiusZ) * (zone.radialProfile
        ? Math.max(...zone.radialProfile)
        : zone.kind === "sandbar" ? 1.38 : 1.31),
      safeAltitude: (zone.heightMeters ?? 0) + TERRAIN_MARGIN,
    }));
}

// Immutable map-derived bounds are prepared once. Each query uses only small segment/circle tests;
// it does not evaluate the terrain's ridges, exponentials or individual height samples.
const MAP_BOUNDS: Readonly<Record<BattleMapId, readonly AirTerrainBound[]>> = {
  "atoll-prototype": boundsFor("atoll-prototype"),
  "open-sea-range": boundsFor("open-sea-range"),
};

function corridorTouches(
  bound: Readonly<AirTerrainBound>, x: number, z: number,
  endX: number, endZ: number, halfWidth: number,
): boolean {
  const dx = endX - x;
  const dz = endZ - z;
  const lengthSquared = dx * dx + dz * dz;
  const along = lengthSquared > 1e-8
    ? clamp(((bound.x - x) * dx + (bound.z - z) * dz) / lengthSquared, 0, 1) : 0;
  const separationX = bound.x - (x + dx * along);
  const separationZ = bound.z - (z + dz * along);
  return separationX * separationX + separationZ * separationZ <= (bound.radius + halfWidth) ** 2;
}

/**
 * Conservative altitude guidance for a lightweight aircraft autopilot. Two broad corridors cover
 * continuing on the current heading and intercepting the intended route. Returns a target only;
 * never moves the aircraft or changes its mission. This is not obstacle-avoiding pathfinding and
 * cannot promise recovery from developer spawns/teleports already inside a mountain.
 */
export function airTerrainClearance(
  mapId: BattleMapId,
  squadron: Readonly<Pick<AirSquadronState, "role" | "position" | "heading" | "flight">>,
  destination: Readonly<Vec3>,
): number {
  const bounds = MAP_BOUNDS[mapId];
  if (bounds.length === 0) return SEA_CLEARANCE;
  const profile = AIR_FLIGHT_PROFILE[squadron.role];
  // Anticipate acceleration out of launch/low-speed legs, not only this frame's airspeed.
  const speed = clamp(Math.max(AIR_NAVIGATION.speedMetersPerSecond[squadron.role],
    finite(squadron.flight?.speedMetersPerSecond, 0)),
  profile.minimumSpeedMetersPerSecond, profile.maximumSpeedMetersPerSecond);
  const turnRadius = speed * speed / (9.81 * Math.tan(profile.maximumBankRadians));
  const maximumAltitude = Math.max(...bounds.map(({ safeAltitude }) => safeAltitude));
  const climbSeconds = Math.max(0, maximumAltitude - finite(squadron.position.y, 0))
    / profile.verticalRateMetersPerSecond;
  const pitchSeconds = profile.maximumClimbRadians / profile.pitchRateRadiansPerSecond;
  const turnSeconds = Math.min(6, turnRadius / speed * 0.5);
  const lookaheadSeconds = clamp(climbSeconds + pitchSeconds + turnSeconds + 2, 25, 40);
  const reach = speed * lookaheadSeconds;
  const halfWidth = clamp(turnRadius * .35, 120, 420) + 70;
  const x = finite(squadron.position.x, 0);
  const z = finite(squadron.position.z, 0);
  const heading = finite(squadron.heading, 0);
  const forwardX = x + Math.sin(heading) * reach;
  const forwardZ = z + Math.cos(heading) * reach;
  const dx = finite(destination.x, x) - x;
  const dz = finite(destination.z, z) - z;
  const range = Math.hypot(dx, dz);
  // Do not extrapolate a turning waypoint's new course indefinitely; the current-forward
  // corridor already covers flying through it. Both include a turn-radius-sized lateral margin.
  const routeScale = range > 1e-8 ? Math.min(1, reach / range) : 0;
  const routeX = x + dx * routeScale;
  const routeZ = z + dz * routeScale;
  let clearance = SEA_CLEARANCE;
  for (const bound of bounds) {
    if (corridorTouches(bound, x, z, forwardX, forwardZ, halfWidth)
      || corridorTouches(bound, x, z, routeX, routeZ, halfWidth)) {
      clearance = Math.max(clearance, bound.safeAltitude);
    }
  }
  return clearance;
}
