import { SENSOR, shipSpeedMetersPerSecond } from "./config";
import type {
  GameMode,
  Observation,
  PlayerTargetView,
  ProjectileState,
  SensorContact,
  ShotEvent,
  ShipState,
  Vec3,
} from "./types";
import { effectiveTorpedoDetectionRange } from "./detection";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const copyPosition = (position: Readonly<Vec3>): Vec3 => ({ ...position });

export type ShipPresentationMode = "hidden" | "contact" | "full" | "ghost";

export function shipPresentationMode(
  ship: Readonly<ShipState>,
  mode: GameMode,
  target?: Readonly<PlayerTargetView>,
): ShipPresentationMode {
  if (ship.team === "player" || mode === "sea-trials") return "full";
  if (!target || target.id !== ship.id || target.confidence <= .02) return "hidden";
  if (target.mode === "acquiring") return "contact";
  return target.live ? "full" : "ghost";
}

export function isShipVisibleToPlayer(
  ship: Readonly<ShipState>,
  mode: GameMode,
  target?: Readonly<PlayerTargetView>,
): boolean {
  return shipPresentationMode(ship, mode, target) === "full";
}

/** A spotted ship never grants visibility to another ship's muzzle flash/audio. */
export function isShotVisibleToPlayer(
  shot: Readonly<ShotEvent>,
  player: Readonly<ShipState> | undefined,
  target?: Readonly<PlayerTargetView>,
): boolean {
  return shot.team === (player?.team ?? "player")
    || Boolean(target?.live && target.id === shot.ownerId);
}

export function isProjectileVisibleToPlayer(
  projectile: Readonly<ProjectileState>,
  player: Readonly<ShipState> | undefined,
  target?: Readonly<PlayerTargetView>,
): boolean {
  if (projectile.team === (player?.team ?? "player")) return true;
  if (!player) return false;
  const distance = Math.hypot(
    projectile.position.x - player.position.x,
    projectile.position.z - player.position.z,
  );
  if (projectile.kind === "torpedo") {
    return distance <= effectiveTorpedoDetectionRange(player, projectile);
  }
  return Boolean(target?.live && target.id === projectile.ownerId) || distance <= 1_200;
}

/**
 * Converts sampled optical contacts into the target information the player UI
 * may consume. Live contacts are never kept as object references and stale
 * contacts are dead-reckoned only for a limited search window.
 */
export class PlayerPerceptionTracker {
  private lastContact?: SensorContact;
  private lastSample = Number.NEGATIVE_INFINITY;
  private acquisitionSamples = 0;
  private hadTrack = false;
  private lastEvaluatedSample = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.lastContact = undefined;
    this.lastSample = Number.NEGATIVE_INFINITY;
    this.acquisitionSamples = 0;
    this.hadTrack = false;
    this.lastEvaluatedSample = Number.NEGATIVE_INFINITY;
  }

  private copyContact(contact: Readonly<SensorContact>): SensorContact {
    return { ...contact, position: copyPosition(contact.position) };
  }

  private viewFromContact(
    contact: Readonly<SensorContact>,
    mode: PlayerTargetView["mode"],
    live: boolean,
    time: number,
  ): PlayerTargetView {
    const elapsed = live ? 0 : Math.max(0, time - contact.observedAt);
    const speed = shipSpeedMetersPerSecond(contact.speedKnots);
    const position = {
      x: contact.position.x + Math.sin(contact.heading) * speed * elapsed,
      y: contact.position.y,
      z: contact.position.z + Math.cos(contact.heading) * speed * elapsed,
    };
    return {
      id: contact.id,
      team: contact.team,
      mode,
      live,
      confidence: live
        ? contact.confidence
        : clamp(contact.confidence * (1 - elapsed / SENSOR.memorySeconds), 0, 1),
      lastObservedAt: contact.observedAt,
      position,
      heading: contact.heading,
      speedKnots: contact.speedKnots,
      rangeMeters: live ? contact.rangeMeters : 0,
      estimatedHullRatio: contact.estimatedHullRatio,
    };
  }

  update(observation: Observation): PlayerTargetView | undefined {
    const contact = observation.contacts[0];
    // A different target must acquire its own samples, even within one scan.
    if (contact && this.lastContact && contact.id !== this.lastContact.id) this.reset();
    const sampleIndex = Math.floor(observation.time / SENSOR.observationIntervalSeconds);
    if (sampleIndex !== this.lastEvaluatedSample) {
      if (contact && contact.observedAt !== this.lastSample) {
        this.acquisitionSamples += 1;
        this.lastContact = this.copyContact(contact);
        this.lastSample = contact.observedAt;
      } else if (!contact) {
        this.acquisitionSamples = this.hadTrack
          ? 0 : Math.max(0, this.acquisitionSamples - 1);
      }
      this.lastEvaluatedSample = sampleIndex;
    }

    if (contact) {
      const requiredSamples = this.hadTrack
        ? SENSOR.reacquisitionSamples : SENSOR.acquisitionSamples;
      const mode = this.acquisitionSamples >= requiredSamples
        ? "tracking" : "acquiring";
      if (mode === "tracking") this.hadTrack = true;
      return this.viewFromContact(contact, mode, true, observation.time);
    }

    if (!this.lastContact) return undefined;
    const age = observation.time - this.lastContact.observedAt;
    if (age > SENSOR.memorySeconds) {
      this.reset();
      return undefined;
    }
    return this.viewFromContact(
      this.lastContact,
      age <= SENSOR.fireFromMemorySeconds ? "lost" : "searching",
      false,
      observation.time,
    );
  }
}
