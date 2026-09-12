import { AIR_FLIGHT_PROFILE, airSquadronTargetAltitude } from "./airFlightModel";
import type { AirSquadronState, AirWeaponKind, Vec3 } from "./types";

const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const angleError = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export interface AirManeuverPlan {
  destination: Vec3;
  targetAltitude: number;
  targetPitch?: number;
  speedMultiplier: number;
}

/** Mission guidance supplies a three-dimensional flight path, never a position teleport.
 * Fixed-wing aircraft keep flying through waypoints; patrol is a tangent intercept,
 * not pursuit of a clock-driven point that can rotate faster than the airplane. */
export function planAirManeuver(
  squadron: Readonly<AirSquadronState>, target: Readonly<Vec3>, time: number,
): AirManeuverPlan {
  const range = Math.hypot(target.x - squadron.position.x, target.z - squadron.position.z);
  const bearing = Math.atan2(target.x - squadron.position.x, target.z - squadron.position.z);
  const cruise = airSquadronTargetAltitude(squadron.role, "outbound", squadron.id, time);
  const plan: AirManeuverPlan = { destination: { ...target }, targetAltitude: cruise, speedMultiplier: 1 };
  const elapsed = Math.max(0, time - squadron.phaseStartedAt);

  if (squadron.phase === "patrolling" || squadron.phase === "searching") {
    const speed = squadron.flight?.speedMetersPerSecond ?? 100;
    const turnRadius = speed ** 2 / (9.81 * Math.tan(AIR_FLIGHT_PROFILE[squadron.role].maximumBankRadians));
    const radius = Math.max(squadron.order?.area?.radius ?? 700, turnRadius * 1.35);
    const radial = range > 1 ? Math.atan2(squadron.position.x - target.x, squadron.position.z - target.z) : squadron.heading;
    const direction = squadron.team === "player" ? 1 : -1;
    const lead = clamp(speed * 5 / radius, .24, .7) * direction;
    plan.destination = { x: target.x + Math.sin(radial + lead) * radius, y: cruise, z: target.z + Math.cos(radial + lead) * radius };
  } else if (squadron.phase === "intercepting" || (squadron.phase === "outbound" && squadron.order?.kind === "interceptSquadron")) {
    // Climb to an altitude advantage on approach, then converge to the target's
    // actual observed flight level. Overshoot calls for a climbing break turn.
    const behind = Math.abs(angleError(bearing, squadron.heading)) > Math.PI * .65 && range < 650;
    plan.targetAltitude = clamp(target.y + (behind ? 120 : range > 650 ? 75 : 0), 80, 900);
    plan.speedMultiplier = behind ? .87 : 1.08;
  } else if (squadron.phase === "attackRun") {
    const weapon = squadron.order?.selectedWeapon;
    if (weapon === "aerialTorpedo") {
      plan.targetAltitude = 55;
      plan.speedMultiplier = .86;
    } else if (weapon === "heBomb") {
      const yawError = Math.abs(angleError(bearing, squadron.heading));
      // Roll in before diving. Aim at a low release gate in front of the ship;
      // dropping is separately gated by the projected ballistic footprint.
      if (range < 1_050 && yawError < .55) {
        plan.targetAltitude = 65;
        plan.targetPitch = -clamp(Math.atan2(Math.max(0, squadron.position.y - 65), Math.max(100, range - 120)), .18, .95);
      }
    } else if (weapon === "machineGun") {
      plan.targetAltitude = 90;
      plan.targetPitch = -clamp(Math.atan2(Math.max(0, squadron.position.y - 35), Math.max(150, range)), .05, .42);
    }
  } else if (squadron.phase === "returning") {
    if (squadron.attackRunReleased && elapsed < 6) {
      // Fly clear and climb before turning home, instead of immediately reversing
      // the entire group through its own attack stream.
      plan.destination = { x: squadron.position.x + Math.sin(squadron.heading) * 1_200, y: cruise, z: squadron.position.z + Math.cos(squadron.heading) * 1_200 };
    } else if (range < 2_000) plan.targetAltitude = Math.max(50, target.y);
  } else if (squadron.phase === "landing") {
    plan.targetAltitude = Math.max(35, target.y);
    plan.speedMultiplier = .8;
    plan.destination = { x: squadron.position.x + Math.sin(squadron.heading) * 900, y: plan.targetAltitude, z: squadron.position.z + Math.cos(squadron.heading) * 900 };
  } else if (squadron.phase === "launching") {
    plan.speedMultiplier = .9;
  }
  return plan;
}

export function airFlightVelocity(squadron: Readonly<AirSquadronState>): Vec3 {
  const speed = squadron.flight?.speedMetersPerSecond ?? 90;
  const pitch = squadron.flight?.pitch ?? 0;
  const horizontal = speed * Math.cos(pitch);
  return { x: Math.sin(squadron.heading) * horizontal, y: Math.sin(pitch) * speed, z: Math.cos(squadron.heading) * horizontal };
}

export function bombFallSeconds(height: number, verticalSpeed: number, gravity: number): number {
  return (verticalSpeed + Math.sqrt(verticalSpeed ** 2 + 2 * gravity * Math.max(0, height))) / gravity;
}

/** No omniscient target state: callers must supply their observed/predicted aim point. */
export function airStrikeEnvelope(
  squadron: Readonly<AirSquadronState>, aim: Readonly<Vec3>, weapon: AirWeaponKind, gravity: number,
): boolean {
  const flight = squadron.flight;
  if (!flight || flight.speedMetersPerSecond < 35) return false;
  const dx = aim.x - squadron.position.x, dz = aim.z - squadron.position.z;
  const range = Math.hypot(dx, dz);
  const yaw = Math.abs(angleError(Math.atan2(dx, dz), squadron.heading));
  if (yaw > .3 || Math.abs(flight.bank) > .48) return false;
  if (weapon === "aerialTorpedo") {
    return squadron.position.y >= 25 && squadron.position.y <= 85
      && Math.abs(flight.pitch) <= .14 && range >= 225 && range <= 1_100;
  }
  if (weapon === "heBomb") {
    if (squadron.position.y < 65 || squadron.position.y > 320 || flight.pitch > -.16) return false;
    const velocity = airFlightVelocity(squadron);
    const t = bombFallSeconds(squadron.position.y, velocity.y, gravity);
    const missX = dx - velocity.x * t, missZ = dz - velocity.z * t;
    const along = missX * Math.sin(squadron.heading) + missZ * Math.cos(squadron.heading);
    const across = missX * Math.cos(squadron.heading) - missZ * Math.sin(squadron.heading);
    return Math.abs(along) <= 18 && Math.abs(across) <= 35;
  }
  const targetPitch = Math.atan2(aim.y - squadron.position.y, Math.max(1, range));
  return range <= 650 && Math.abs(targetPitch - flight.pitch) < .24;
}

export function airInterceptEnvelope(squadron: Readonly<AirSquadronState>, target: Readonly<Vec3>): boolean {
  const dx = target.x - squadron.position.x, dy = target.y - squadron.position.y, dz = target.z - squadron.position.z;
  const horizontal = Math.hypot(dx, dz);
  return Math.hypot(horizontal, dy) <= 560
    && Math.abs(angleError(Math.atan2(dx, dz), squadron.heading)) <= .3
    && Math.abs(Math.atan2(dy, Math.max(1, horizontal)) - (squadron.flight?.pitch ?? 0)) <= .24;
}
