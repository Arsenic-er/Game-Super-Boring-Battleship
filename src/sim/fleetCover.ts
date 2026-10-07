import {
  battleMapDefinition, firstNavigationHazard, shipDraftMeters, terrainBlocksLineOfSight,
  terrainNavigationAt, type BattleMapId,
} from "../maps/atollMap";
import { getShipClass, SHIP_CLASSES } from "../ships/classes";
import type { ShipState, Vec3 } from "./types";

export type FleetCoverShip = Readonly<Pick<ShipState, "position" | "heading" | "shipClassId">>;

export interface FleetCoverPlan {
  /** A navigable holding point, not an island center or an A* path. */
  point: Vec3;
  heading: number;
  distanceMeters: number;
  /** Slowdown radius only; hold after the current position is confirmed in cover. */
  arrivalRadiusMeters: number;
}

const DISTANCES = [400, 800, 1_400, 2_000] as const;
const BEARINGS = 16;
const UNDER_KEEL_RESERVE = 1;
// An unidentified contact may be the tallest standard hull. Never query its hidden entity.
const UNKNOWN_CONTACT_EYE_HEIGHT = Math.max(...Object.values(SHIP_CLASSES).map((hull) => hull.deckHeight + 12));
const finitePoint = (point: Readonly<Vec3>): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);

/**
 * Bounded local retreat planning from ONE observed hostile position. The caller owns
 * observation freshness, damage policy and a 1–2 s cache; no hidden entities are read.
 * Only straight reachable cover is considered: an island requiring a detour is not
 * reported as reachable. Dynamic hull avoidance remains the steering controller's job.
 */
export function planFleetCover(
  mapId: BattleMapId,
  ship: FleetCoverShip,
  observedEnemyPosition: Readonly<Vec3>,
): FleetCoverPlan | undefined {
  if (mapId === "open-sea-range" || !finitePoint(ship.position)
    || !finitePoint(observedEnemyPosition) || !Number.isFinite(ship.heading)) return undefined;
  const map = battleMapDefinition(mapId);
  if (!map.terrain.some((zone) => zone.kind === "mountain")) return undefined;
  const hull = getShipClass(ship.shipClassId);
  const draft = shipDraftMeters(ship.shipClassId) + UNDER_KEEL_RESERVE;
  const covered = (point: Readonly<Vec3>): boolean => terrainBlocksLineOfSight(
    mapId, observedEnemyPosition, point, UNKNOWN_CONTACT_EYE_HEIGHT, hull.deckHeight + 12,
  );
  const padding = Math.max(hull.beam * .6 + 12, hull.length * .18);
  const arrivalRadiusMeters = Math.max(80, hull.length * .55);
  const withinBounds = (point: Readonly<Vec3>): boolean =>
    Math.abs(point.x) < map.halfExtentMeters - padding
    && Math.abs(point.z) < map.halfExtentMeters - padding;
  const safe = (point: Readonly<Vec3>): boolean => withinBounds(point)
    && terrainNavigationAt(mapId, point.x, point.z, draft).kind !== "grounded";
  if (!safe(ship.position)
    || firstNavigationHazard(mapId, ship.position, ship.position, draft, padding)) return undefined;

  // A damaged ship already in cover should stop instead of orbiting into a firing lane.
  if (covered(ship.position)) {
    return { point: { ...ship.position }, heading: ship.heading, distanceMeters: 0, arrivalRadiusMeters };
  }
  const enemyDistance = Math.hypot(
    ship.position.x - observedEnemyPosition.x, ship.position.z - observedEnemyPosition.z,
  );
  if (enemyDistance < 1) return undefined;
  const awayHeading = Math.atan2(
    ship.position.x - observedEnemyPosition.x, ship.position.z - observedEnemyPosition.z,
  );
  let best: FleetCoverPlan | undefined;
  let bestScore = Infinity;
  for (const distanceMeters of DISTANCES) {
    for (let bearing = 0; bearing < BEARINGS; ++bearing) {
      const heading = awayHeading + bearing / BEARINGS * Math.PI * 2;
      const sine = Math.sin(heading);
      const cosine = Math.cos(heading);
      const point = {
        x: ship.position.x + sine * distanceMeters,
        y: ship.position.y,
        z: ship.position.z + cosine * distanceMeters,
      };
      const retreatGain = Math.hypot(point.x - observedEnemyPosition.x,
        point.z - observedEnemyPosition.z) - enemyDistance;
      // Permit a short lateral cut behind a nearby island, not a charge toward the enemy.
      if (retreatGain < -150 || !safe(point)) continue;
      if (!covered(point)) continue;
      // Reserve a hull-length stopping corridor beyond the destination, as well as
      // the entire route. This is not a substitute for physical braking/shore avoidance.
      const runout = arrivalRadiusMeters + hull.length * .5;
      const end = { x: point.x + sine * runout, y: point.y, z: point.z + cosine * runout };
      if (!safe(end) || firstNavigationHazard(mapId, ship.position, end, draft, padding)) continue;
      const turn = Math.abs(Math.atan2(Math.sin(heading - ship.heading), Math.cos(heading - ship.heading)));
      const navigation = terrainNavigationAt(mapId, point.x, point.z, draft);
      const score = distanceMeters + turn * 90 - Math.min(600, Math.max(0, retreatGain)) * .25
        + (navigation.kind === "shallow" ? 180 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { point, heading: Math.atan2(sine, cosine), distanceMeters, arrivalRadiusMeters };
      }
    }
  }
  return best;
}
