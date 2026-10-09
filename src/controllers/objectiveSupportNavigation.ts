import {
  battleMapDefinition, firstNavigationHazard, shipDraftMeters, terrainNavigationAt,
  type BattleMapId,
} from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import type { ObjectiveObservation, ShipState, Vec3 } from "../sim/types";

export type SupportNavigationShip = Readonly<Pick<ShipState, "position" | "heading" | "shipClassId">>;
export type SupportNavigationObjective = Readonly<Pick<ObjectiveObservation, "center" | "radius">>;
export type ObjectiveSupportMode = "radial" | "alternative" | "hold" | "recovery";

export interface ObjectiveSupportPlan {
  mode: ObjectiveSupportMode;
  /** Recovery deliberately supplies no unsafe waypoint; use ordinary terrain recovery. */
  point?: Vec3;
  arrivalRadiusMeters: number;
}

export const SUPPORT_NAVIGATION = {
  planIntervalSeconds: 2,
  maximumCachedTravelMeters: 40,
  arrivalRadiusMeters: 220,
  underKeelReserveMeters: 1,
  radialStepMeters: 350,
  maximumCandidates: 48,
} as const;

const OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8]
  .map(step => step * Math.PI / 8);
const finitePoint = (point: Readonly<Vec3>): boolean =>
  [point.x, point.y, point.z].every(Number.isFinite);
const copyPlan = (plan: Readonly<ObjectiveSupportPlan>): ObjectiveSupportPlan =>
  ({ ...plan, ...(plan.point ? { point: { ...plan.point } } : {}) });

interface CachedPlan {
  context: string;
  time: number;
  position: Vec3;
  maximumTravelMeters: number;
  result: ObjectiveSupportPlan;
}

/**
 * One bounded, controller-local station planner. It consumes only own pose,
 * public objective geometry and static terrain, never contacts/enemy entities.
 * This is straight-line station selection, not capture or global pathfinding.
 */
export class ObjectiveSupportNavigator {
  private cached?: CachedPlan;

  reset(): void { this.cached = undefined; }

  plan(
    mapId: BattleMapId,
    ship: SupportNavigationShip,
    objective: SupportNavigationObjective,
    requestedRadius: number,
    time: number,
  ): ObjectiveSupportPlan {
    const arrivalRadiusMeters = SUPPORT_NAVIGATION.arrivalRadiusMeters;
    const recovery: ObjectiveSupportPlan = { mode: "recovery", arrivalRadiusMeters };
    if (!Number.isFinite(time) || time < 0 || !finitePoint(ship.position)
      || !finitePoint(objective.center) || !Number.isFinite(ship.heading)
      || !Number.isFinite(objective.radius) || objective.radius <= 0
      || !Number.isFinite(requestedRadius) || requestedRadius <= 0) {
      this.reset();
      return recovery;
    }
    const hull = getShipClass(ship.shipClassId);
    const routePadding = Math.max(hull.beam * .6 + 12, hull.length * .18);
    // A stopped ship may finish anywhere in its arrival band. Keep that entire
    // band plus half a hull clear, including the outward post-waypoint runout.
    const stationPadding = arrivalRadiusMeters + hull.length * .5;
    const minimumRadius = objective.radius + Math.max(400, stationPadding + 20);
    const supportRadius = Math.max(requestedRadius, minimumRadius);
    const context = JSON.stringify([mapId, ship.shipClassId, objective.center.x,
      objective.center.y, objective.center.z, objective.radius, supportRadius]);
    const previous = this.cached;
    if (previous && previous.context === context && time >= previous.time
      && time - previous.time < SUPPORT_NAVIGATION.planIntervalSeconds) {
      if (Math.hypot(ship.position.x - previous.position.x,
        ship.position.z - previous.position.z) <= previous.maximumTravelMeters) {
        return copyPlan(previous.result);
      }
      // Movement invalidates permission to use the old route, not the search
      // deadline. Keep ordinary terrain recovery in charge until the hard
      // two-second planning interval expires, including zero-margin coasts.
      return recovery;
    }
    const finish = (result: ObjectiveSupportPlan, maximumTravelMeters: number = SUPPORT_NAVIGATION.maximumCachedTravelMeters): ObjectiveSupportPlan => {
      this.cached = { context, time, position: { ...ship.position },
        maximumTravelMeters, result: copyPlan(result) };
      return copyPlan(result);
    };
    const map = battleMapDefinition(mapId);
    const draft = shipDraftMeters(ship.shipClassId) + SUPPORT_NAVIGATION.underKeelReserveMeters;
    const clearPoint = (point: Readonly<Vec3>, padding: number): boolean =>
      Math.abs(point.x) + padding < map.halfExtentMeters
      && Math.abs(point.z) + padding < map.halfExtentMeters
      && (mapId === "open-sea-range"
        || (terrainNavigationAt(mapId, point.x, point.z, draft).kind !== "grounded"
          && !firstNavigationHazard(mapId, point, point, draft, padding)));
    if (!clearPoint(ship.position, routePadding)) return finish(recovery);

    const ownRadius = Math.hypot(ship.position.x - objective.center.x,
      ship.position.z - objective.center.z);
    const radialBearing = ownRadius > 1
      ? Math.atan2(ship.position.x - objective.center.x, ship.position.z - objective.center.z)
      : ship.heading + Math.PI;
    const ringPoint = (radius: number, offset: number): Vec3 => ({
      x: objective.center.x + Math.sin(radialBearing + offset) * radius,
      y: ship.position.y,
      z: objective.center.z + Math.cos(radialBearing + offset) * radius,
    });
    const outsideCapture = (point: Readonly<Vec3>): boolean =>
      Math.hypot(point.x - objective.center.x, point.z - objective.center.z)
        >= objective.radius + stationPadding;
    const clearApproach = (point: Readonly<Vec3>): number | undefined => {
      if (!outsideCapture(point) || !clearPoint(point, stationPadding)) return undefined;
      const dx = point.x - ship.position.x, dz = point.z - ship.position.z;
      const distance = Math.hypot(dx, dz);
      const sine = distance > 1 ? dx / distance : Math.sin(ship.heading);
      const cosine = distance > 1 ? dz / distance : Math.cos(ship.heading);
      const end = { x: point.x + sine * stationPadding, y: point.y,
        z: point.z + cosine * stationPadding };
      if (!clearPoint(end, routePadding)) return undefined;
      // Support arriving from outside must not cut across the capture disk.
      // A released capper already inside may take an outward exit.
      const endDx = end.x - ship.position.x, endDz = end.z - ship.position.z;
      const lengthSquared = endDx * endDx + endDz * endDz;
      const fraction = lengthSquared > 1e-9 ? Math.max(0, Math.min(1,
        ((objective.center.x - ship.position.x) * endDx
          + (objective.center.z - ship.position.z) * endDz) / lengthSquared)) : 0;
      if (ownRadius > objective.radius + routePadding
        && Math.hypot(ship.position.x + endDx * fraction - objective.center.x,
          ship.position.z + endDz * fraction - objective.center.z) < objective.radius + routePadding) return undefined;
      if (mapId === "open-sea-range") return SUPPORT_NAVIGATION.maximumCachedTravelMeters;
      // Reserve cache travel in the swept corridor. Near a coast, reduce reuse
      // distance instead of rejecting a genuinely clear base-width approach.
      for (const margin of [SUPPORT_NAVIGATION.maximumCachedTravelMeters, 20, 10, 0]) {
        if (!firstNavigationHazard(mapId, ship.position, end, draft, routePadding + margin)) return margin;
      }
      return undefined;
    };

    const radial = ringPoint(supportRadius, 0);
    const radialMargin = clearApproach(radial);
    if (radialMargin !== undefined) return finish({ mode: "radial", point: radial, arrivalRadiusMeters }, radialMargin);
    // Keep a still-reachable detour stable instead of reselecting a different
    // angular candidate every two seconds while steering toward it.
    if (previous?.context === context && previous.result.mode === "alternative"
      && previous.result.point && time >= previous.time) {
      const retainedMargin = clearApproach(previous.result.point);
      if (retainedMargin !== undefined) return finish(previous.result, retainedMargin);
    }
    const radii = [supportRadius, supportRadius + SUPPORT_NAVIGATION.radialStepMeters,
      Math.max(minimumRadius, supportRadius - SUPPORT_NAVIGATION.radialStepMeters)];
    let best: Vec3 | undefined;
    let bestCost = Infinity;
    let bestMargin = 0;
    for (const radius of radii) for (const offset of OFFSETS) {
      // The original radial candidate was already checked.
      if (radius === supportRadius && offset === 0) continue;
      const point = ringPoint(radius, offset);
      const cost = Math.hypot(point.x - radial.x, point.z - radial.z)
        + Math.hypot(point.x - ship.position.x, point.z - ship.position.z) * .2;
      if (cost >= bestCost) continue;
      const margin = clearApproach(point);
      if (margin === undefined) continue;
      best = point;
      bestCost = cost;
      bestMargin = margin;
    }
    if (best) return finish({ mode: "alternative", point: best, arrivalRadiusMeters }, bestMargin);
    // A safe-water spawn is not a completed support station. Hold only after
    // reaching the support band; a distant ship without a direct candidate must
    // retain ordinary navigation/recovery rather than freezing at deployment.
    const nearSupportBand = Math.abs(ownRadius - supportRadius) <= arrivalRadiusMeters;
    if (nearSupportBand && outsideCapture(ship.position) && clearPoint(ship.position, stationPadding)) {
      return finish({ mode: "hold", point: { ...ship.position }, arrivalRadiusMeters });
    }
    return finish(recovery);
  }
}
