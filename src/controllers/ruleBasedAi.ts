import { GUN, HYDRO, KNOT_TO_MPS, SENSOR, SMOKE, TORPEDO } from "../sim/config";
import { getTorpedo } from "../ships/torpedoes";
import {
  torpedoInterceptPoint,
  torpedoLauncherAlignmentError,
  torpedoLaunchSolution,
} from "../sim/simulation";
import type {
  AmmoType,
  ControlCommand,
  Controller,
  DamageControlPriority,
  ModuleId,
  Observation,
  PerceptionMode,
  PerceptionTelemetry,
  SensorContact,
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

/**
 * Uses AP against a close, exposed broadside and HE against angled or distant
 * destroyers. Separate enter/exit thresholds prevent repeated shell swapping.
 */
export function recommendedAmmoForTarget(
  rangeMeters: number,
  bearingFromShooter: number,
  targetHeading: number,
  currentAmmo: AmmoType,
): AmmoType {
  const broadsideExposure = Math.abs(Math.sin(
    wrapAngle(targetHeading - bearingFromShooter),
  ));
  if (currentAmmo === "ap") {
    return rangeMeters <= 3_000 && broadsideExposure >= 0.55 ? "ap" : "he";
  }
  return rangeMeters <= 2_600 && broadsideExposure >= 0.72 ? "ap" : "he";
}

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

interface TrackEstimate {
  id: string;
  position: Vec3;
  heading: number;
  speedKnots: number;
  observedAt: number;
  confidence: number;
}

interface PerceptionResult {
  mode: PerceptionMode;
  track?: TrackEstimate;
  telemetry: PerceptionTelemetry;
}

/**
 * Fallible WWII optical director. It only sees sampled sensor contacts, needs
 * two observations to acquire a firing solution, predicts a lost contact for
 * search/navigation, and is never permitted to fire without a live track.
 */
export class RuleBasedAi implements Controller {
  private solutionQuality = 0.04;
  private estimatedRange = 2_000;
  private bearingError = 0;
  private leadScale = 0.7;
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
  private nextTorpedoAt = 12;
  private nextSmokeAt = 10;
  private nextHydroAt = 15;
  private torpedoEvasionReactionAt = Number.POSITIVE_INFINITY;
  private lastContact?: TrackEstimate;
  private lastContactSample = Number.NEGATIVE_INFINITY;
  private acquisitionSamples = 0;
  private hadTrack = false;

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

  private copyContact(contact: Readonly<SensorContact>): TrackEstimate {
    return {
      id: contact.id,
      position: { ...contact.position },
      heading: contact.heading,
      speedKnots: contact.speedKnots,
      observedAt: contact.observedAt,
      confidence: contact.confidence,
    };
  }

  private predictedTrack(time: number): TrackEstimate | undefined {
    if (!this.lastContact) return undefined;
    const elapsed = Math.max(0, time - this.lastContact.observedAt);
    const speed = this.lastContact.speedKnots * KNOT_TO_MPS;
    return {
      ...this.lastContact,
      position: {
        x: this.lastContact.position.x + Math.sin(this.lastContact.heading) * speed * elapsed,
        y: this.lastContact.position.y,
        z: this.lastContact.position.z + Math.cos(this.lastContact.heading) * speed * elapsed,
      },
      confidence: clamp(
        this.lastContact.confidence * (1 - elapsed / SENSOR.memorySeconds),
        0,
        1,
      ),
    };
  }

  private updatePerception(observation: Observation): PerceptionResult {
    const contact = observation.contacts[0];
    if (contact && contact.observedAt !== this.lastContactSample) {
      const recentMemory = this.lastContact
        && observation.time - this.lastContact.observedAt <= SENSOR.memorySeconds;
      this.acquisitionSamples = this.hadTrack && recentMemory
        ? SENSOR.acquisitionSamples
        : this.acquisitionSamples + 1;
      this.lastContact = this.copyContact(contact);
      this.lastContactSample = contact.observedAt;
    }

    if (contact) {
      const acquired = this.acquisitionSamples >= SENSOR.acquisitionSamples;
      if (acquired) this.hadTrack = true;
      const mode: PerceptionMode = acquired ? "tracking" : "acquiring";
      return {
        mode,
        track: this.copyContact(contact),
        telemetry: {
          mode,
          confidence: acquired ? contact.confidence : contact.confidence * 0.5,
          lastObservedAt: contact.observedAt,
          estimatedPosition: { ...contact.position },
        },
      };
    }

    const predicted = this.predictedTrack(observation.time);
    if (!predicted || observation.time - predicted.observedAt > SENSOR.memorySeconds) {
      this.lastContact = undefined;
      this.acquisitionSamples = 0;
      this.hadTrack = false;
      return {
        mode: "unaware",
        telemetry: { mode: "unaware", confidence: 0 },
      };
    }

    const age = observation.time - predicted.observedAt;
    const mode: PerceptionMode = age <= SENSOR.fireFromMemorySeconds ? "lost" : "searching";
    return {
      mode,
      track: predicted,
      telemetry: {
        mode,
        confidence: predicted.confidence,
        lastObservedAt: predicted.observedAt,
        estimatedPosition: { ...predicted.position },
      },
    };
  }

  private updateFireControl(
    observation: Observation,
    target: TrackEstimate,
    estimatedRange: number,
  ): void {
    const dt = clamp(observation.time - this.lastTime, 0, 0.2);
    this.lastTime = observation.time;

    const manoeuvre = Math.abs(observation.self.rudder);
    const recovery = 0.006 * target.confidence;
    this.solutionQuality = clamp(
      this.solutionQuality + (recovery - manoeuvre * 0.0065) * dt,
      0.025,
      0.62,
    );
    if (manoeuvre > 0.55) this.nextEstimateAt = Math.min(this.nextEstimateAt, observation.time + 1.5);

    if (observation.time >= this.nextEstimateAt) {
      const rangeErrorFraction = 0.13 + (1 - this.solutionQuality) * 0.2;
      const bearingErrorRadians = 0.03 + (1 - this.solutionQuality) * 0.09;
      this.estimatedRange = clamp(
        estimatedRange * (1 + this.signedEstimate() * rangeErrorFraction),
        GUN.minAimRange,
        GUN.maxAimRange,
      );
      this.bearingError = this.signedEstimate() * bearingErrorRadians;
      this.leadScale = clamp(
        0.48 + this.solutionQuality * 0.38 + this.centeredNoise() * 0.27,
        0.27,
        0.94,
      );
      this.directorWander = this.centeredNoise() * 9;
      this.solutionQuality = Math.max(0.025, this.solutionQuality - 0.02 - this.random() * 0.03);
      this.nextEstimateAt = observation.time + 5.5 + this.random() * 6.5;
    }

    if (observation.time >= this.nextSalvoAt) {
      if (this.random() > 0.22) this.fireWindowUntil = observation.time + 3;
      this.nextSalvoAt = observation.time + 8 + this.random() * 6;
    }
  }

  private estimatedAimPoint(
    observation: Observation,
    target: TrackEstimate,
    bearing: number,
  ): Vec3 {
    const estimatedBearing = bearing + this.bearingError;
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
    const perception = this.updatePerception(observation);
    const target = perception.track;
    const objective = observation.objective;
    const objectiveDx = objective.center.x - observation.self.position.x;
    const objectiveDz = objective.center.z - observation.self.position.z;
    const objectiveDistance = Math.hypot(objectiveDx, objectiveDz);
    const objectiveBearing = Math.atan2(objectiveDx, objectiveDz);
    const ownScore = objective.scores[observation.self.team];
    const opposingTeam = observation.self.team === "player" ? "enemy" : "player";
    const opposingScore = objective.scores[opposingTeam];
    const opponentInZone = objective.contested
      || objective.capturingTeam === opposingTeam
      || objective.owner === opposingTeam;
    const shouldSecureObjective = objectiveDistance > objective.radius * 0.68
      && (
        objective.owner !== observation.self.team
        || opponentInZone
        || ownScore - opposingScore < 300
      );

    if (observation.time >= this.nextManoeuvreAt) {
      this.manoeuvreOffset = (this.random() - 0.5) * 0.7;
      this.nextManoeuvreAt = observation.time + 14 + this.random() * 18;
    }

    let range = Number.POSITIVE_INFINITY;
    let bearingToTarget = objectiveBearing;
    if (target) {
      const dx = target.position.x - observation.self.position.x;
      const dz = target.position.z - observation.self.position.z;
      range = Math.hypot(dx, dz);
      bearingToTarget = Math.atan2(dx, dz);
    }
    const torpedoSpread = "narrow" as const;
    const torpedo = getTorpedo(observation.self.torpedoId);
    const torpedoAim = perception.mode === "tracking" && target
      ? torpedoInterceptPoint(observation.self, target)
      : undefined;
    const torpedoSolution = torpedoAim
      ? torpedoLaunchSolution(observation.self, torpedoAim, torpedoSpread)
      : undefined;
    const torpedoReady = Boolean(
      torpedoAim
      && range >= 900
      && range <= Math.min(2_200, torpedo.maximumRangeMeters)
      && observation.self.torpedoReloadRemaining <= 0
      && observation.self.torpedoesLoaded > 0
      && observation.self.modules.torpedoTubes.health > 0
      && observation.time >= this.nextTorpedoAt,
    );
    const launcherAligned = Math.abs(torpedoLauncherAlignmentError(observation.self))
      <= TORPEDO.launcherFireToleranceRadians;
    const launchTorpedoes = Boolean(
      torpedoReady && torpedoSolution?.allowed && launcherAligned,
    );
    if (launchTorpedoes) {
      this.nextTorpedoAt = observation.time + 120 + this.random() * 80;
    }

    if (perception.mode === "tracking" && target) {
      this.updateFireControl(observation, target, range);
      if (observation.time >= this.nextAmmoDecisionAt) {
        this.selectedAmmo = recommendedAmmoForTarget(
          range,
          bearingToTarget,
          target.heading,
          this.selectedAmmo,
        );
        this.nextAmmoDecisionAt = observation.time + 18 + this.random() * 8;
      }
    } else {
      this.fireWindowUntil = 0;
      this.solutionQuality = Math.max(0.025, this.solutionQuality - 0.012);
    }

    let desiredHeading = shouldSecureObjective || !target
      ? objectiveBearing + this.manoeuvreOffset * 0.16
      : bearingToTarget + this.manoeuvreOffset;
    if (torpedoReady && target && !torpedoSolution?.allowed) {
      const portBroadside = bearingToTarget + Math.PI / 2;
      const starboardBroadside = bearingToTarget - Math.PI / 2;
      desiredHeading = Math.abs(wrapAngle(portBroadside - observation.self.heading))
        < Math.abs(wrapAngle(starboardBroadside - observation.self.heading))
        ? portBroadside
        : starboardBroadside;
    }
    if (target && range < 850) {
      desiredHeading = bearingToTarget + Math.PI;
    } else if (target && range < 1_300) {
      desiredHeading = bearingToTarget + Math.PI * 0.72;
    } else if (!torpedoReady && !shouldSecureObjective && target && range < 1_900) {
      desiredHeading += Math.PI * 0.42;
    }
    const incomingTorpedo = observation.incomingTorpedoes[0];
    if (incomingTorpedo && !Number.isFinite(this.torpedoEvasionReactionAt)) {
      this.torpedoEvasionReactionAt = observation.time + 6 + this.random() * 6;
    } else if (!incomingTorpedo) {
      this.torpedoEvasionReactionAt = Number.POSITIVE_INFINITY;
    }
    const evadingTorpedo = incomingTorpedo
      && observation.time >= this.torpedoEvasionReactionAt
      ? incomingTorpedo
      : undefined;
    if (evadingTorpedo) {
      const pathBearing = Math.atan2(
        evadingTorpedo.velocity.x,
        evadingTorpedo.velocity.z,
      );
      const reverseBearing = wrapAngle(pathBearing + Math.PI);
      desiredHeading = Math.abs(wrapAngle(pathBearing - observation.self.heading))
        < Math.abs(wrapAngle(reverseBearing - observation.self.heading))
        ? pathBearing
        : reverseBearing;
    }
    const headingError = wrapAngle(desiredHeading - observation.self.heading);
    const damaged = observation.self.hull / observation.self.maxHull < 0.38;
    const tacticalThrottle = evadingTorpedo
      ? 1
      : target && range < 850
        ? 0.35
      : target && range < 1_300
        ? 0.62
      : shouldSecureObjective || !target
      ? 0.9
      : range < 1_200 ? 0.88 : range > 2_300 ? 0.76 : 0.62;
    const priority = damageControlPriority(observation);
    const recoverableDamage = observation.self.recoverableHull - observation.self.hull;
    const repairHull = priority === "balanced"
      && recoverableDamage >= 35
      && observation.self.hull / observation.self.maxHull < 0.86;
    const fallbackAim = {
      x: observation.self.position.x + Math.sin(desiredHeading) * 1_000,
      y: 3,
      z: observation.self.position.z + Math.cos(desiredHeading) * 1_000,
    };
    const smokeNeeded = observation.self.smokeCharges > 0
      && observation.self.smokeCooldownRemaining <= 0
      && observation.self.smokeDeploymentRemaining <= 0
      && (observation.contacts.length > 0 || observation.incomingTorpedoes.length > 0)
      && (
        observation.self.hull / observation.self.maxHull < 0.55
        || observation.self.fireIntensity >= 25
        || observation.self.flooding >= 25
        || observation.incomingTorpedoes.length > 0
      );
    const activateSmoke = smokeNeeded && observation.time >= this.nextSmokeAt;
    if (activateSmoke) this.nextSmokeAt = observation.time + SMOKE.cooldownSeconds + 12;
    const hydroThreat = observation.incomingTorpedoes.length > 0
      || (
        (perception.mode === "lost" || perception.mode === "searching")
        && Boolean(target)
        && range <= HYDRO.shipDetectionMeters + 250
      );
    const activateHydro = hydroThreat
      && observation.self.hydroCharges > 0
      && observation.self.hydroCooldownRemaining <= 0
      && observation.self.hydroActiveRemaining <= 0
      && observation.time >= this.nextHydroAt;
    if (activateHydro) {
      this.nextHydroAt = observation.time
        + HYDRO.activeSeconds
        + HYDRO.cooldownSeconds
        + 5;
    }
    const concealmentRetreat = damaged
      && !shouldSecureObjective
      && Boolean(target)
      && range > 1_300;
    const suppressMainGun = activateSmoke
      || observation.self.smokeDeploymentRemaining > 0
      || concealmentRetreat;

    return {
      throttle: damaged ? Math.min(tacticalThrottle, 0.52) : tacticalThrottle,
      rudder: clamp(headingError * 1.25, -0.82, 0.82),
      aimPoint: torpedoReady && torpedoAim
        ? torpedoAim
        : target
          ? this.estimatedAimPoint(observation, target, bearingToTarget)
        : fallbackAim,
      weaponSlot: launchTorpedoes ? "torpedo" : "mainGun",
      torpedoSpread,
      ammoType: this.selectedAmmo,
      damageControlPriority: priority,
      repairHull,
      perception: perception.telemetry,
      activateSmoke,
      activateHydro,
      fire: launchTorpedoes || (
        !suppressMainGun
          &&
        perception.mode === "tracking"
          && observation.time <= this.fireWindowUntil
          && range >= GUN.minAimRange
          && range <= GUN.maxAimRange
      ),
    };
  }
}
