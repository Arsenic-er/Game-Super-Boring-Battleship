import { GUN, KNOT_TO_MPS } from "../sim/config";
import type {
  AmmoType,
  ControlCommand,
  Controller,
  DamageControlPriority,
  ModuleId,
  Observation,
  Vec3,
} from "../sim/types";

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const repairableModuleDamage = (observation: Observation): number =>
  (Object.keys(observation.self.modules) as ModuleId[]).reduce((worst, id) => {
    const module = observation.self.modules[id];
    if (module.health <= 0) return worst;
    return Math.max(worst, 1 - module.health / module.maxHealth);
  }, 0);

const damageControlPriority = (observation: Observation): DamageControlPriority => {
  const { fireIntensity, flooding } = observation.self;
  const moduleDamage = repairableModuleDamage(observation) * 100;
  if (flooding >= 18 && flooding >= fireIntensity * 0.8 && flooding >= moduleDamage * 0.55) {
    return "flood";
  }
  if (fireIntensity >= 18 && fireIntensity >= moduleDamage * 0.55) return "fire";
  if (moduleDamage >= 18) return "module";
  return "balanced";
};

/**
 * An intentionally fallible WWII optical director. It works from stale range,
 * bearing and speed estimates, hesitates between salvos, loses its solution
 * when either ship manoeuvres, and carries a persistent over/under-lead bias.
 */
export class RuleBasedAi implements Controller {
  private solutionQuality = 0.04;
  private estimatedRange = 2_000;
  private bearingError = 0;
  private leadScale = 0.58;
  private directorWander = 0;
  private nextEstimateAt = 0;
  private nextSalvoAt = 4;
  private fireWindowUntil = 0;
  private nextManoeuvreAt = 0;
  private manoeuvreOffset = 0;
  private lastTime = 0;
  private randomSeed: number;
  private selectedAmmo: AmmoType = "he";
  private nextAmmoDecisionAt = 0;

  constructor(seed = 0xa11ce) {
    this.randomSeed = seed >>> 0;
  }

  private random(): number {
    this.randomSeed = (Math.imul(1_664_525, this.randomSeed) + 1_013_904_223) >>> 0;
    return this.randomSeed / 0x1_0000_0000;
  }

  private centeredNoise(): number {
    return ((this.random() + this.random() + this.random()) - 1.5) / 1.5;
  }

  private signedEstimate(): number {
    const noise = this.centeredNoise();
    return Math.sign(noise || 1) * (0.35 + Math.abs(noise) * 0.65);
  }

  private updateFireControl(observation: Observation, actualRange: number): void {
    const target = observation.enemies[0];
    if (!target) return;
    const dt = clamp(observation.time - this.lastTime, 0, 0.2);
    this.lastTime = observation.time;

    const manoeuvre = Math.abs(observation.self.rudder) + Math.abs(target.rudder) * 1.35;
    const recovery = 0.0045;
    this.solutionQuality = clamp(
      this.solutionQuality + (recovery - manoeuvre * 0.0065) * dt,
      0.025,
      0.58,
    );
    if (manoeuvre > 0.55) this.nextEstimateAt = Math.min(this.nextEstimateAt, observation.time + 1.5);

    if (observation.time >= this.nextEstimateAt) {
      const rangeErrorFraction = 0.095 + (1 - this.solutionQuality) * 0.155;
      const bearingErrorRadians = 0.022 + (1 - this.solutionQuality) * 0.065;
      this.estimatedRange = clamp(
        actualRange * (1 + this.signedEstimate() * rangeErrorFraction),
        GUN.minAimRange,
        GUN.maxAimRange,
      );
      this.bearingError = this.signedEstimate() * bearingErrorRadians;
      this.leadScale = clamp(
        0.48 + this.solutionQuality * 0.38 + this.centeredNoise() * 0.26,
        0.28,
        0.92,
      );
      this.directorWander = this.centeredNoise() * 8;
      this.solutionQuality = Math.max(0.025, this.solutionQuality - 0.025 - this.random() * 0.035);
      this.nextEstimateAt = observation.time + 6.5 + this.random() * 7.5;
    }

    if (observation.time >= this.nextSalvoAt) {
      const hesitation = this.random();
      // A poor solution should produce a ranging salvo, not permanent silence.
      // Accuracy remains limited by stale range, bearing and lead estimates.
      if (hesitation > 0.22) {
        this.fireWindowUntil = observation.time + 3;
      }
      this.nextSalvoAt = observation.time + 8 + this.random() * 6;
    }
  }

  private estimatedAimPoint(observation: Observation, actualBearing: number): Vec3 {
    const target = observation.enemies[0];
    if (!target) return observation.self.aimPoint;
    const estimatedBearing = actualBearing + this.bearingError;
    const flightTime = this.estimatedRange / GUN.muzzleVelocity;
    const targetSpeed = target.speedKnots * KNOT_TO_MPS;
    return {
      x: observation.self.position.x
        + Math.sin(estimatedBearing) * this.estimatedRange
        + Math.sin(target.heading) * targetSpeed * flightTime * this.leadScale
        + Math.cos(estimatedBearing) * this.directorWander,
      y: 3,
      z: observation.self.position.z
        + Math.cos(estimatedBearing) * this.estimatedRange
        + Math.cos(target.heading) * targetSpeed * flightTime * this.leadScale
        - Math.sin(estimatedBearing) * this.directorWander,
    };
  }

  command(observation: Observation): ControlCommand {
    const enemy = observation.enemies[0];
    if (!enemy) {
      return { throttle: 0, rudder: 0, aimPoint: observation.self.aimPoint, fire: false };
    }

    const dx = enemy.position.x - observation.self.position.x;
    const dz = enemy.position.z - observation.self.position.z;
    const range = Math.hypot(dx, dz);
    const bearingToEnemy = Math.atan2(dx, dz);
    this.updateFireControl(observation, range);

    if (observation.time >= this.nextAmmoDecisionAt) {
      const relativeTargetHeading = Math.abs(wrapAngle(enemy.heading - bearingToEnemy));
      const broadsideExposure = Math.abs(Math.sin(relativeTargetHeading));
      this.selectedAmmo = range < 2_500
        && broadsideExposure > 0.42
        && broadsideExposure < 0.88
        ? "ap" : "he";
      this.nextAmmoDecisionAt = observation.time + 12 + this.random() * 8;
    }

    if (observation.time >= this.nextManoeuvreAt) {
      this.manoeuvreOffset = (this.random() - 0.5) * 0.7;
      this.nextManoeuvreAt = observation.time + 14 + this.random() * 18;
    }

    const objective = observation.objective;
    const objectiveDx = objective.center.x - observation.self.position.x;
    const objectiveDz = objective.center.z - observation.self.position.z;
    const objectiveDistance = Math.hypot(objectiveDx, objectiveDz);
    const objectiveBearing = Math.atan2(objectiveDx, objectiveDz);
    const ownScore = objective.scores[observation.self.team];
    const opposingScore = objective.scores[
      observation.self.team === "player" ? "enemy" : "player"
    ];
    const opponentInZone = objective.occupants[
      observation.self.team === "player" ? "enemy" : "player"
    ] > 0;
    const shouldSecureObjective = objectiveDistance > objective.radius * 0.68
      && (
        objective.owner !== observation.self.team
        || opponentInZone
        || ownScore - opposingScore < 300
      );

    // Fight from a readable destroyer gunnery band instead of charging into a
    // point-blank accuracy contest. The broadside offset also creates periods
    // in which both the hull and fire-control solution can settle.
    let desiredHeading = shouldSecureObjective
      ? objectiveBearing
        + this.manoeuvreOffset * 0.16
      : bearingToEnemy + this.manoeuvreOffset;
    if (!shouldSecureObjective && range < 1_200) desiredHeading += Math.PI * 0.82;
    else if (!shouldSecureObjective && range < 1_900) desiredHeading += Math.PI * 0.42;
    const headingError = wrapAngle(desiredHeading - observation.self.heading);
    const damaged = observation.self.hull / observation.self.maxHull < 0.38;
    const tacticalThrottle = shouldSecureObjective
      ? 0.9
      : range < 1_200 ? 0.88 : range > 2_300 ? 0.76 : 0.62;
    const priority = damageControlPriority(observation);
    const recoverableDamage = observation.self.recoverableHull - observation.self.hull;
    const repairHull = priority === "balanced"
      && recoverableDamage >= 35
      && observation.self.hull / observation.self.maxHull < 0.86;

    return {
      throttle: damaged ? Math.min(tacticalThrottle, 0.52) : tacticalThrottle,
      rudder: clamp(headingError * 1.25, -0.82, 0.82),
      aimPoint: this.estimatedAimPoint(observation, bearingToEnemy),
      ammoType: this.selectedAmmo,
      damageControlPriority: priority,
      repairHull,
      fire: observation.time <= this.fireWindowUntil
        && range >= GUN.minAimRange
        && range <= GUN.maxAimRange,
    };
  }
}
