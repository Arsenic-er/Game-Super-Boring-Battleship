import { firstNavigationHazard, shipDraftMeters, terrainSafeHeading, type BattleMapId } from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import { NAVIGATION_PACE, shipSpeedMetersPerSecond } from "./config";
import type { ShipState, Vec3 } from "./types";

export interface AiNavigationCommand {
  desiredHeading: number;
  throttleLimit?: number;
  recovering: boolean;
}

/** Controller-local state, never replicated: coarse planning with normal rudder/propulsion controls. */
export class AiNavigationRecovery {
  private reverseFrom?: Vec3;
  private reverseStartedAt = 0;
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
    }
    if (this.reverseFrom) {
      const backedAway = Math.hypot(ship.position.x - this.reverseFrom.x, ship.position.z - this.reverseFrom.z);
      if (!grounded && time - this.reverseStartedAt >= 12 && (backedAway >= 65 || time - this.reverseStartedAt >= 45)) {
        this.reverseFrom = undefined;
      } else {
        // The bow points opposite the safe astern travel direction. Steering remains physical.
        const astern = terrainSafeHeading(mapId, ship.position, ship.heading + Math.PI, ship.shipClassId);
        this.cached = { desiredHeading: astern + Math.PI, throttleLimit: -.25, recovering: true };
        return this.cached;
      }
    }
    const throttleLimit = distance < Math.max(85, speed * 6) ? .12
      : distance < lookahead ? .35 : undefined;
    this.cached = { desiredHeading, throttleLimit, recovering: false };
    return this.cached;
  }
}
