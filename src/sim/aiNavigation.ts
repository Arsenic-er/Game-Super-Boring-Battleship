import { battleMapDefinition, canExitNavigationContact, firstNavigationHazard, shipDraftMeters, terrainNavigationAt, terrainSafeHeading, type BattleMapId } from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import { NAVIGATION_PACE, shipSpeedMetersPerSecond } from "./config";
import type { ShipState, Vec3 } from "./types";

export interface AiNavigationCommand {
  desiredHeading: number;
  throttleLimit?: number;
  recovering: boolean;
}

/**
 * Validate the actual hull margin, not just the planner's wider padding. A reverse
 * may leave one lobe of a concave shoal and meet another before its 65 m retreat.
 * Existing margin overlap permits only monotonically outward one-metre steps.
 */
function clearReverseCorridor(
  mapId: BattleMapId, position: Readonly<Vec3>, heading: number, distance: number,
  draft: number, padding: number,
): boolean {
  const extent = battleMapDefinition(mapId).halfExtentMeters;
  const point = (meters: number): Vec3 => ({
    x: position.x + Math.sin(heading) * meters, y: 0,
    z: position.z + Math.cos(heading) * meters,
  });
  const end = point(distance);
  if (Math.abs(end.x) > extent || Math.abs(end.z) > extent
    || terrainNavigationAt(mapId, end.x, end.z, draft).kind === "grounded") return false;
  let from = { ...position };
  // A finite hull-margin escape may precede an otherwise clear corridor.
  const escapeSteps = Math.ceil(padding * 4);
  for (let step = 0; step <= escapeSteps; ++step) {
    const hazard = firstNavigationHazard(mapId, from, end, draft, padding);
    if (!hazard) return true;
    if (hazard.distanceFraction > 0 || step >= escapeSteps || step >= distance) return false;
    const next = point(Math.min(distance, step + 1));
    if (!canExitNavigationContact(mapId, from, next, draft, padding)) return false;
    from = next;
  }
  return false;
}

/** Controller-local state, never replicated: coarse planning with normal rudder/propulsion controls. */
export class AiNavigationRecovery {
  private reverseFrom?: Vec3;
  private reverseStartedAt = 0;
  private reorienting = false;
  private boundaryReorientation = false;
  private nextCheckAt = 0;
  private cached?: AiNavigationCommand;

  command(mapId: BattleMapId, ship: Readonly<ShipState>, desiredHeading: number, time: number): AiNavigationCommand {
    const grounded = ship.navigationZone === "grounded";
    if (time < this.nextCheckAt && this.cached && (!grounded || this.reverseFrom)) {
      return this.cached.recovering ? this.cached : { ...this.cached, desiredHeading };
    }
    this.nextCheckAt = time + .5;
    const hull = getShipClass(ship.shipClassId);
    const padding = hull.beam * .6 + 12;
    const speed = Math.max(0, shipSpeedMetersPerSecond(ship.speedKnots));
    const braking = hull.brakingKnotsPerSecond * NAVIGATION_PACE.propulsionResponseScale;
    const stopDistance = speed * Math.max(0, ship.speedKnots) / Math.max(.1, braking) * .5;
    const lookahead = Math.max(100, Math.min(800, stopDistance + speed * 6 + 80));
    const ahead = { x: ship.position.x + Math.sin(ship.heading) * lookahead, y: 0,
      z: ship.position.z + Math.cos(ship.heading) * lookahead };
    const hazard = firstNavigationHazard(mapId, ship.position, ahead, shipDraftMeters(ship.shipClassId), padding);
    const distance = hazard ? hazard.distanceFraction * lookahead : Infinity;
    if (!this.reverseFrom && (grounded || (distance < hull.beam + 8 && ship.speedKnots < 3))) {
      this.reverseFrom = { ...ship.position };
      this.reverseStartedAt = time;
      this.reorienting = false;
    }
    if (this.reverseFrom) {
      const backedAway = Math.hypot(ship.position.x - this.reverseFrom.x, ship.position.z - this.reverseFrom.z);
      const exitLookahead = Math.max(180, Math.min(480, hull.length * 1.4 + stopDistance));
      const extent = battleMapDefinition(mapId).halfExtentMeters - padding;
      const bowEnd = { x: ship.position.x + Math.sin(ship.heading) * exitLookahead, y: 0,
        z: ship.position.z + Math.cos(ship.heading) * exitLookahead };
      const hasTurningRoom = Math.abs(bowEnd.x) <= extent && Math.abs(bowEnd.z) <= extent
        && !firstNavigationHazard(mapId, ship.position, bowEnd, shipDraftMeters(ship.shipClassId), padding);
      const reverseElapsed = time - this.reverseStartedAt;
      // A 65m retreat can leave a long battleship facing the same nearby shoal.
      // Keep the verified astern corridor until there is room for normal ahead
      // steerage. Stop a stalled or excessively long attempt rather than looping.
      const clearedApproach = backedAway >= 65 && (hasTurningRoom || backedAway >= exitLookahead);
      const shortRecovery = hull.hullId !== "battleship" && (backedAway >= 65 || reverseElapsed >= 45);
      const stalledAttempt = reverseElapsed >= 45 && backedAway < 10;
      if (!grounded && reverseElapsed >= 12
        && (shortRecovery || clearedApproach || stalledAttempt || reverseElapsed >= 240)) {
        this.reverseFrom = undefined;
        this.reorienting = true;
      } else {
        // The bow points opposite the safe astern travel direction. Steering remains physical.
        const preferredAstern = terrainSafeHeading(mapId, ship.position,
          (hull.hullId === "battleship" && reverseElapsed >= 45 ? desiredHeading : ship.heading) + Math.PI,
          ship.shipClassId);
        const draft = shipDraftMeters(ship.shipClassId);
        const contactPadding = hull.beam * .42;
        const offsets = [0, 22.5, -22.5, 45, -45, 67.5, -67.5, 90, -90,
          112.5, -112.5, 135, -135, 157.5, -157.5, 180];
        const astern = offsets.map(degrees => preferredAstern + degrees * Math.PI / 180)
          .find(heading => clearReverseCorridor(mapId, ship.position, heading, 100, draft, contactPadding));
        const reverseSpeed = shipSpeedMetersPerSecond(Math.max(0, -ship.speedKnots));
        const engineRatio = Math.max(0, Math.min(1,
          ship.modules.engine.health / Math.max(1, ship.modules.engine.maxHealth)));
        const reverseBraking = hull.accelerationKnotsPerSecond
          * ship.performance.accelerationMultiplier * NAVIGATION_PACE.propulsionResponseScale
          * (engineRatio <= 0 ? 0 : .2 + .8 * engineRatio);
        // Match propulsion's zero-power case: stopping distance is not finite.
        // A zero throttle request does not erase the simulation's existing inertia.
        const brakingCorridor = reverseBraking > 0
          ? Math.max(10, reverseSpeed * Math.max(0, -ship.speedKnots)
            / reverseBraking * .5 + reverseSpeed * .5 + 2)
          : Number.POSITIVE_INFINITY;
        const canBack = reverseBraking > 0 && astern !== undefined && clearReverseCorridor(mapId, ship.position,
          ship.heading + Math.PI, brakingCorridor, draft, contactPadding);
        // Turn physically with zero throttle until the current stern direction
        // has braking clearance; never continue astern into a blocked short step.
        this.cached = { desiredHeading: (astern ?? preferredAstern) + Math.PI,
          throttleLimit: canBack ? -.25 : 0, recovering: true };
        return this.cached;
      }
    }
    if (this.reorienting) {
      // Backing away is not permission to drive bow-first into the same coast.
      // Brake, then use the existing low-speed rudder authority to face the
      // caller's safe route. This branch runs only after an actual reverse.
      const exitLookahead = Math.max(180, Math.min(480, hull.length * 1.4 + stopDistance));
      const extent = battleMapDefinition(mapId).halfExtentMeters - padding;
      const endpoint = (heading: number): Vec3 => ({
        x: ship.position.x + Math.sin(heading) * exitLookahead, y: 0,
        z: ship.position.z + Math.cos(heading) * exitLookahead,
      });
      const inBounds = (point: Readonly<Vec3>): boolean =>
        Math.abs(point.x) <= extent && Math.abs(point.z) <= extent;
      let exitHeading = terrainSafeHeading(mapId, ship.position, desiredHeading, ship.shipClassId);
      if (!inBounds(endpoint(exitHeading))) this.boundaryReorientation = true;
      if (this.boundaryReorientation) {
        // Do not hand a still-near-edge hull back to an outward caller as soon
        // as its bow turns inward. Keep this recovery-local guard until there is
        // a full checked corridor between the ship and every map edge.
        exitHeading = terrainSafeHeading(mapId, ship.position,
          Math.atan2(-ship.position.x, -ship.position.z), ship.shipClassId);
        const edgeClearance = extent - Math.max(Math.abs(ship.position.x), Math.abs(ship.position.z));
        if (edgeClearance >= exitLookahead) this.boundaryReorientation = false;
      }
      const forward = endpoint(ship.heading);
      const clearForward = inBounds(forward)
        && !firstNavigationHazard(mapId, ship.position, forward, shipDraftMeters(ship.shipClassId), padding);
      const angle = Math.abs(Math.atan2(Math.sin(exitHeading - ship.heading),
        Math.cos(exitHeading - ship.heading)));
      if (clearForward && angle <= Math.PI / 6 && ship.speedKnots >= -.5 && !this.boundaryReorientation) {
        this.reorienting = false;
        // Return the route just validated, not the unsafe original request that
        // terrain or boundary handling may have replaced during reorientation.
        desiredHeading = exitHeading;
      } else {
        // A checked, hull-scaled corridor permits slow steerage on larger hulls;
        // otherwise stop rather than making another short approach into land.
        // A large remaining turn is not itself a collision risk. A clear
        // stopping corridor lets even a slow battleship retain steerage instead
        // of spending many minutes turning at its stationary rudder authority.
        const steerage = clearForward && ship.speedKnots >= -.5 ? .18 : 0;
        this.cached = { desiredHeading: exitHeading, throttleLimit: steerage, recovering: true };
        return this.cached;
      }
    }
    const throttleLimit = distance < Math.max(85, speed * 6) ? .12
      : distance < lookahead ? .35 : undefined;
    this.cached = { desiredHeading, throttleLimit, recovering: false };
    return this.cached;
  }
}
