import {
  AI_TORPEDO,
  GUN,
  HYDRO,
  SENSOR,
  SMOKE,
  TORPEDO,
  shipSpeedMetersPerSecond,
} from "../sim/config";
import { terrainSafeHeading } from "../maps/atollMap";
import { AiNavigationRecovery } from "../sim/aiNavigation";
import { planFleetCover, type FleetCoverPlan } from "../sim/fleetCover";
import { getShipClass } from "../ships/classes";
import { getTorpedo } from "../ships/torpedoes";
import { effectiveMainBattery } from "../ships/mainBatteries";
import {
  mainBatteryMountCanBear,
  torpedoInterceptPoint,
  torpedoLauncherAlignmentError,
  torpedoLaunchSolution,
} from "../sim/simulation";
import type {
  AmmoType,
  ControlCommand,
  Controller,
  DamageControlPriority,
  FleetAiPhase,
  FleetAiRole,
  FriendlyShipObservation,
  ModuleId,
  Observation,
  PerceptionMode,
  PerceptionTelemetry,
  SensorContact,
  ShipState,
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

export function fleetRoleForShip(
  ship: Pick<ShipState, "hullId">,
): FleetAiRole {
  if (ship.hullId === "destroyer") return "screen";
  if (ship.hullId === "lightCruiser") return "escort";
  return "line";
}

export interface FriendlyCollisionRisk {
  friendlyId: string;
  closestApproachMeters: number;
  timeToClosestApproach: number;
  avoidanceHeading: number;
}

/** Predicts close approaches without using enemy or hidden-state information. */
export function friendlyCollisionRisk(
  self: Readonly<ShipState>,
  friendlies: readonly Readonly<FriendlyShipObservation>[],
): FriendlyCollisionRisk | undefined {
  const selfSpeed = shipSpeedMetersPerSecond(self.speedKnots);
  const selfVx = Math.sin(self.heading) * selfSpeed;
  const selfVz = Math.cos(self.heading) * selfSpeed;
  const selfHull = getShipClass(self.shipClassId);
  let best: FriendlyCollisionRisk | undefined;
  for (const friendly of friendlies) {
    const dx = friendly.position.x - self.position.x;
    const dz = friendly.position.z - self.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 1_200 || distance < 0.01) continue;
    const friendlySpeed = shipSpeedMetersPerSecond(friendly.speedKnots);
    const relativeVx = Math.sin(friendly.heading) * friendlySpeed - selfVx;
    const relativeVz = Math.cos(friendly.heading) * friendlySpeed - selfVz;
    const relativeSpeedSquared = relativeVx ** 2 + relativeVz ** 2;
    const timeToClosestApproach = relativeSpeedSquared < 0.01
      ? 0
      : clamp(-(dx * relativeVx + dz * relativeVz) / relativeSpeedSquared, 0, 30);
    const closestX = dx + relativeVx * timeToClosestApproach;
    const closestZ = dz + relativeVz * timeToClosestApproach;
    const closestApproachMeters = Math.hypot(closestX, closestZ);
    const friendlyHull = getShipClass(friendly.shipClassId);
    const safeDistance = 85 + (selfHull.beam + friendlyHull.beam) * 0.75;
    if (closestApproachMeters >= safeDistance || (timeToClosestApproach === 0 && distance > safeDistance)) {
      continue;
    }
    const awayX = timeToClosestApproach > 0 ? -closestX : -dx;
    const awayZ = timeToClosestApproach > 0 ? -closestZ : -dz;
    const risk = {
      friendlyId: friendly.id,
      closestApproachMeters,
      timeToClosestApproach,
      avoidanceHeading: Math.atan2(awayX, awayZ),
    };
    if (!best || risk.closestApproachMeters < best.closestApproachMeters) best = risk;
  }
  return best;
}

/**
 * Chooses only from observed contacts. Lower score is better: close, damaged,
 * confidently tracked ships are more urgent, while a small hysteresis keeps
 * directors from oscillating between nearly equivalent targets.
 */
export function selectPriorityContact(
  contacts: readonly Readonly<SensorContact>[],
  currentTargetId: string | undefined,
): Readonly<SensorContact> | undefined {
  const priority = (contact: Readonly<SensorContact>): number =>
    contact.rangeMeters / 1_000
    + contact.estimatedHullRatio * 1.15
    - contact.confidence * 0.35;
  const best = [...contacts].sort((left, right) =>
    priority(left) - priority(right)
    || left.id.localeCompare(right.id))[0];
  const current = contacts.find(({ id }) => id === currentTargetId);
  if (!current || !best) return best;
  return priority(current) <= priority(best) + 0.28 ? current : best;
}

export interface FleetEngagementBand {
  minimumMeters: number;
  preferredMeters: number;
  maximumMeters: number;
}

/** Role-specific spacing keeps mixed fleets from collapsing into one blob. */
export function fleetEngagementBandForRole(role: FleetAiRole): FleetEngagementBand {
  if (role === "screen") {
    return { minimumMeters: 900, preferredMeters: 1_650, maximumMeters: 3_100 };
  }
  if (role === "escort") {
    return { minimumMeters: 1_500, preferredMeters: 2_650, maximumMeters: 4_000 };
  }
  return { minimumMeters: 2_450, preferredMeters: 3_650, maximumMeters: 4_800 };
}

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

/**
 * Restricts AI torpedo attacks to a short, useful interception window.
 */
export function isTorpedoAttackWindow(
  rangeMeters: number,
  interceptSeconds: number,
  maximumRangeMeters: number,
): boolean {
  return rangeMeters >= AI_TORPEDO.minimumAttackRangeMeters
    && rangeMeters <= Math.min(
      AI_TORPEDO.maximumAttackRangeMeters,
      maximumRangeMeters,
    )
    && interceptSeconds <= AI_TORPEDO.maximumInterceptSeconds;
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

export interface TrackEstimate {
  id: string;
  position: Vec3;
  heading: number;
  speedKnots: number;
  observedAt: number;
  confidence: number;
}

/**
 * Builds a conservative torpedo track from two consecutive optical samples.
 * Circular averaging keeps headings around -PI/PI from flipping direction.
 */
export function stableTorpedoTrack(
  previous: Readonly<TrackEstimate> | undefined,
  current: Readonly<TrackEstimate> | undefined,
): TrackEstimate | undefined {
  if (!previous || !current || previous.id !== current.id) return undefined;
  const sampleGap = current.observedAt - previous.observedAt;
  const headingChange = Math.abs(wrapAngle(current.heading - previous.heading));
  if (
    sampleGap <= 0
    || sampleGap > AI_TORPEDO.maximumTrackSampleGapSeconds
    || current.confidence < AI_TORPEDO.minimumTrackConfidence
    || headingChange > AI_TORPEDO.maximumHeadingChangeRadians
    || Math.abs(current.speedKnots - previous.speedKnots)
      > AI_TORPEDO.maximumSpeedChangeKnots
  ) return undefined;
  return {
    ...current,
    position: { ...current.position },
    heading: Math.atan2(
      Math.sin(previous.heading) + Math.sin(current.heading),
      Math.cos(previous.heading) + Math.cos(current.heading),
    ),
    speedKnots: (previous.speedKnots + current.speedKnots) / 2,
  };
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
  private plannedTerrainHeading?: number;
  private nextTerrainPlanAt = 0;
  private readonly navigationRecovery = new AiNavigationRecovery();
  private coverPlan?: FleetCoverPlan;
  private nextCoverPlanAt = 0;
  private coverTargetId?: string;
  private radioTargetId?: string;
  private randomSeed: number;
  private selectedAmmo: AmmoType = "he";
  private nextAmmoDecisionAt = 0;
  private nextTorpedoAt = 12;
  private nextSmokeAt = 10;
  private nextHydroAt = 15;
  private torpedoEvasionReactionAt = Number.POSITIVE_INFINITY;
  private lastContact?: TrackEstimate;
  private previousContact?: TrackEstimate;
  private lastContactSample = Number.NEGATIVE_INFINITY;
  private acquisitionSamples = 0;
  private lastEvaluatedSensorSample = Number.NEGATIVE_INFINITY;
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
    const speed = shipSpeedMetersPerSecond(this.lastContact.speedKnots);
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
    // Coordination only selects among this observer's own contacts. It never
    // imports another ship's sightings or bypasses optical acquisition below.
    const assignment = observation.fleetTarget;
    const assignedContact = assignment && Number.isFinite(assignment.assignedAt)
      && assignment.assignedAt >= 0 && assignment.assignedAt <= observation.time
      ? observation.contacts.find((contact) => contact.id === assignment.targetId
        && contact.team !== observation.self.team)
      : undefined;
    const contact = assignedContact ?? selectPriorityContact(observation.contacts, this.lastContact?.id);
    // Identity changes are not scan events: reset even when both contacts have
    // the same timestamp, so a new ship cannot inherit a previous firing lock.
    if (contact && contact.id !== this.lastContact?.id) {
      this.lastContact = undefined;
      this.previousContact = undefined;
      this.acquisitionSamples = 0;
      this.hadTrack = false;
      this.lastContactSample = Number.NEGATIVE_INFINITY;
      this.lastEvaluatedSensorSample = Number.NEGATIVE_INFINITY;
      this.fireWindowUntil = 0;
      this.solutionQuality = 0.04;
      this.nextEstimateAt = observation.time;
      this.lastTime = observation.time;
    }
    const sampleIndex = Math.floor(observation.time / SENSOR.observationIntervalSeconds);
    if (sampleIndex !== this.lastEvaluatedSensorSample) {
      if (contact && contact.observedAt !== this.lastContactSample) {
        this.acquisitionSamples += 1;
        this.previousContact = this.lastContact?.id === contact.id
          ? this.lastContact
          : undefined;
        this.lastContact = this.copyContact(contact);
        this.lastContactSample = contact.observedAt;
      } else if (!contact) {
        this.acquisitionSamples = this.hadTrack
          ? 0 : Math.max(0, this.acquisitionSamples - 1);
      }
      this.lastEvaluatedSensorSample = sampleIndex;
    }

    if (contact) {
      const requiredSamples = this.hadTrack
        ? SENSOR.reacquisitionSamples : SENSOR.aiAcquisitionSamples;
      const acquired = this.acquisitionSamples >= requiredSamples;
      if (acquired) this.hadTrack = true;
      const mode: PerceptionMode = acquired ? "tracking" : "acquiring";
      return {
        mode,
        track: this.copyContact(contact),
        telemetry: {
          mode,
          confidence: acquired ? contact.confidence : contact.confidence * 0.42,
          lastObservedAt: contact.observedAt,
          estimatedPosition: { ...contact.position },
        },
      };
    }

    const predicted = this.predictedTrack(observation.time);
    if (!predicted || observation.time - predicted.observedAt > SENSOR.memorySeconds) {
      this.lastContact = undefined;
      this.previousContact = undefined;
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
      const mainBatteryRange = effectiveMainBattery(observation.self).maximumRangeMeters;
      const rangeErrorFraction = 0.13 + (1 - this.solutionQuality) * 0.2;
      const bearingErrorRadians = 0.03 + (1 - this.solutionQuality) * 0.09;
      this.estimatedRange = clamp(
        estimatedRange * (1 + this.signedEstimate() * rangeErrorFraction),
        GUN.minAimRange,
        mainBatteryRange,
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
    const muzzleVelocity = effectiveMainBattery(observation.self).muzzleVelocity;
    const flightTime = this.estimatedRange / muzzleVelocity;
    const targetSpeed = shipSpeedMetersPerSecond(target.speedKnots);
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
    const mainBatteryRange = effectiveMainBattery(observation.self).maximumRangeMeters;
    const perception = this.updatePerception(observation);
    const localTarget = perception.track;
    const localContact = perception.mode === "tracking" || perception.mode === "acquiring";
    const radioCandidate = !localContact
      ? selectPriorityContact(observation.sharedContacts ?? [], this.radioTargetId)
      : undefined;
    const radioReport = radioCandidate
      && (!localTarget || radioCandidate.observedAt > localTarget.observedAt)
      ? observation.sharedContacts?.find((report) => report.id === radioCandidate.id)
      : undefined;
    // A radio report may update a search waypoint, never the optical director,
    // acquisition counter or two-sample torpedo firing track.
    const target = radioReport ? this.copyContact(radioReport) : localTarget;
    const activeAssignment = localContact && observation.fleetTarget
      && observation.fleetTarget.targetId === target?.id
      && Number.isFinite(observation.fleetTarget.assignedAt)
      && observation.fleetTarget.assignedAt >= 0
      && observation.fleetTarget.assignedAt <= observation.time
      ? observation.fleetTarget : undefined;
    this.radioTargetId = radioReport?.id;
    const searchingTarget = Boolean(target) && !localContact;
    const telemetry = radioReport ? {
      mode: "searching" as const,
      confidence: radioReport.confidence,
      lastObservedAt: radioReport.observedAt,
      estimatedPosition: { ...radioReport.position },
    } : perception.telemetry;
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
    const torpedoTrack = perception.mode === "tracking"
      ? stableTorpedoTrack(this.previousContact, target)
      : undefined;
    const torpedoAim = torpedoTrack
      ? torpedoInterceptPoint(observation.self, torpedoTrack)
      : undefined;
    const torpedoInterceptSeconds = torpedoAim
      ? Math.hypot(
        torpedoAim.x - observation.self.position.x,
        torpedoAim.z - observation.self.position.z,
      ) / torpedo.speedMetersPerSecond
      : Number.POSITIVE_INFINITY;
    const torpedoSolution = torpedoAim
      ? torpedoLaunchSolution(observation.self, torpedoAim, torpedoSpread)
      : undefined;
    const torpedoReady = Boolean(
      torpedoAim
      && target
      && isTorpedoAttackWindow(
        range,
        torpedoInterceptSeconds,
        torpedo.maximumRangeMeters,
      )
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

    const role = fleetRoleForShip(observation.self);
    const engagementBand = fleetEngagementBandForRole(role);
    const friendlies = observation.friendlies ?? [];
    const capitalAnchor = friendlies.find((friendly) =>
      getShipClass(friendly.shipClassId).hullId === "battleship");
    const tacticalObjectivePush = shouldSecureObjective && (
      role !== "line"
      || !target
      || opposingScore - ownScore > 140
    );
    let desiredHeading = searchingTarget
      ? bearingToTarget + (range < 350 ? Math.PI / 2 : 0)
      : tacticalObjectivePush || !target
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
    if (target && !searchingTarget && range < engagementBand.minimumMeters) {
      desiredHeading = bearingToTarget + Math.PI;
    } else if (target && !searchingTarget && !tacticalObjectivePush && range < engagementBand.preferredMeters) {
      const angle = role === "screen" && torpedoReady ? Math.PI * 0.52 : Math.PI * 0.7;
      desiredHeading = bearingToTarget + angle;
    } else if (target && !searchingTarget && range > engagementBand.maximumMeters) {
      desiredHeading = bearingToTarget;
    }
    const incomingTorpedo = observation.incomingTorpedoes[0];
    if (incomingTorpedo && !Number.isFinite(this.torpedoEvasionReactionAt)) {
      const reactionWindow = AI_TORPEDO.evasionReactionMaxSeconds
        - AI_TORPEDO.evasionReactionMinSeconds;
      this.torpedoEvasionReactionAt = observation.time
        + AI_TORPEDO.evasionReactionMinSeconds
        + this.random() * reactionWindow;
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
    if (role === "screen" && capitalAnchor && !target) {
      const screenX = capitalAnchor.position.x + Math.sin(capitalAnchor.heading) * 850;
      const screenZ = capitalAnchor.position.z + Math.cos(capitalAnchor.heading) * 850;
      const screenDx = screenX - observation.self.position.x;
      const screenDz = screenZ - observation.self.position.z;
      if (Math.hypot(screenDx, screenDz) > 320) {
        desiredHeading = Math.atan2(screenDx, screenDz);
      }
    } else if (role === "escort" && capitalAnchor && !target) {
      const anchorDx = capitalAnchor.position.x - observation.self.position.x;
      const anchorDz = capitalAnchor.position.z - observation.self.position.z;
      const anchorDistance = Math.hypot(anchorDx, anchorDz);
      if (anchorDistance > 1_200) {
        desiredHeading = Math.atan2(anchorDx, anchorDz);
      } else if (anchorDistance < 550) {
        desiredHeading = Math.atan2(-anchorDx, -anchorDz);
      } else {
        desiredHeading = capitalAnchor.heading;
      }
    }
    const hullRatio = observation.self.hull / observation.self.maxHull;
    const withdrawThreshold = role === "screen" ? 0.36 : role === "escort" ? 0.31 : 0.27;
    const damaged = hullRatio < withdrawThreshold;
    if (damaged && target && !evadingTorpedo) desiredHeading = bearingToTarget + Math.PI;
    if (damaged && target && !evadingTorpedo) {
      if (observation.time >= this.nextCoverPlanAt || this.coverTargetId !== target.id) {
        this.coverPlan = planFleetCover(observation.mapId, observation.self, target.position);
        this.coverTargetId = target.id;
        this.nextCoverPlanAt = observation.time + 2;
        this.nextTerrainPlanAt = 0;
      }
    } else {
      this.coverPlan = undefined;
      this.coverTargetId = undefined;
      this.nextCoverPlanAt = 0;
    }
    const coverDistance = this.coverPlan
      ? Math.hypot(this.coverPlan.point.x - observation.self.position.x,
        this.coverPlan.point.z - observation.self.position.z)
      : Number.POSITIVE_INFINITY;
    // Only a zero-distance plan verifies cover at the current position. The
    // arrival radius is a slowdown band, not proof the ship has crossed the ridge.
    const holdingCover = this.coverPlan?.distanceMeters === 0
      && coverDistance <= this.coverPlan.arrivalRadiusMeters;
    if (this.coverPlan && !holdingCover) {
      desiredHeading = Math.atan2(this.coverPlan.point.x - observation.self.position.x,
        this.coverPlan.point.z - observation.self.position.z);
    } else if (this.coverPlan) {
      desiredHeading = observation.self.heading;
    }
    if (observation.time >= this.nextTerrainPlanAt || this.plannedTerrainHeading === undefined) {
      this.plannedTerrainHeading = terrainSafeHeading(
        observation.mapId,
        observation.self.position,
        desiredHeading,
        observation.self.shipClassId,
      );
      this.nextTerrainPlanAt = observation.time + 0.4;
    }
    desiredHeading = this.plannedTerrainHeading;
    const collisionRisk = friendlyCollisionRisk(observation.self, friendlies);
    if (collisionRisk) desiredHeading = collisionRisk.avoidanceHeading;
    const navigation = this.navigationRecovery.command(observation.mapId, observation.self, desiredHeading, observation.time);
    desiredHeading = navigation.desiredHeading;
    const headingError = wrapAngle(desiredHeading - observation.self.heading);
    let tacticalThrottle = evadingTorpedo
      ? 1
      : searchingTarget ? (range > 500 ? 0.72 : 0.42)
      : target && range < engagementBand.minimumMeters
        ? 0.58
      : target && range < engagementBand.preferredMeters
        ? 0.68
      : tacticalObjectivePush || !target
        ? 0.88
      : range > engagementBand.maximumMeters ? 0.9 : 0.62;
    if (role === "screen" && !damaged) tacticalThrottle = Math.min(1, tacticalThrottle + 0.1);
    if (role === "line" && target && !tacticalObjectivePush) {
      tacticalThrottle = Math.min(tacticalThrottle, 0.74);
    }
    if (this.coverPlan && !collisionRisk && !evadingTorpedo) {
      tacticalThrottle = Math.min(tacticalThrottle,
        holdingCover ? 0
          : coverDistance < this.coverPlan.arrivalRadiusMeters * 2 ? 0.2 : 0.52);
    }
    if (collisionRisk) tacticalThrottle = Math.min(tacticalThrottle, 0.35);
    if (navigation.throttleLimit !== undefined) tacticalThrottle = Math.min(tacticalThrottle, navigation.throttleLimit);
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
      && !tacticalObjectivePush
      && Boolean(target)
      && range > 1_300;
    const suppressMainGun = activateSmoke
      || observation.self.smokeDeploymentRemaining > 0
      || concealmentRetreat
      || Boolean(this.coverPlan);
    const mainGunAim = target
      ? this.estimatedAimPoint(observation, target, bearingToTarget)
      : fallbackAim;
    const mainGunBearingAllowed = observation.self.mainBatteryMounts.some((mount) =>
      mainBatteryMountCanBear(observation.self, mount.mountIndex, mainGunAim)
    );
    const fireIntent = launchTorpedoes || (
      !suppressMainGun
        && perception.mode === "tracking"
        && observation.time <= this.fireWindowUntil
        && range >= GUN.minAimRange
        && range <= mainBatteryRange
        && mainGunBearingAllowed
    );
    const phase: FleetAiPhase = evadingTorpedo || collisionRisk
      ? "evading"
      : damaged ? "withdrawing"
        : searchingTarget ? "searching"
          : target ? "engaging"
            : tacticalObjectivePush ? "securing" : "forming";

    return {
      throttle: damaged ? Math.min(tacticalThrottle, 0.52) : tacticalThrottle,
      rudder: clamp(headingError * 1.25, -0.82, 0.82),
      aimPoint: torpedoReady && torpedoAim
        ? torpedoAim
        : mainGunAim,
      weaponSlot: launchTorpedoes ? "torpedo" : "mainGun",
      torpedoSpread,
      ammoType: this.selectedAmmo,
      damageControlPriority: priority,
      repairHull,
      perception: telemetry,
      activateSmoke,
      activateHydro,
      fire: fireIntent,
      aiDecision: {
        role,
        phase,
        targetId: target?.id,
        contactSource: target ? radioReport ? "radio" : localContact ? "local" : "memory" : undefined,
        reportSourceId: radioReport?.sourceShipId,
        reportAgeSeconds: radioReport ? Math.max(0, observation.time - radioReport.observedAt) : undefined,
        seekingCover: Boolean(this.coverPlan) && !collisionRisk && !evadingTorpedo,
        coordinatedTarget: Boolean(activeAssignment),
        friendlyTargetLoad: activeAssignment?.friendlyAssignedCount,
        desiredHeading,
        throttle: damaged ? Math.min(tacticalThrottle, 0.52) : tacticalThrottle,
        fireIntent,
        avoidanceReason: collisionRisk
          ? `规避友舰 ${collisionRisk.friendlyId}`
          : undefined,
      },
    };
  }
}
