import { KNOT_TO_MPS, SENSOR, TORPEDO } from "./config";
import type {
  GameMode,
  Observation,
  PlayerTargetView,
  ProjectileState,
  SensorContact,
  ShipState,
  Vec3,
} from "./types";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const copyPosition = (position: Readonly<Vec3>): Vec3 => ({ ...position });

export function isShipVisibleToPlayer(
  ship: Readonly<ShipState>,
  mode: GameMode,
  target?: Readonly<PlayerTargetView>,
): boolean {
  return ship.team === "player"
    || mode === "sea-trials"
    || (target?.id === ship.id && (target.live || ship.hull <= 0));
}

export function isProjectileVisibleToPlayer(
  projectile: Readonly<ProjectileState>,
  player: Readonly<ShipState> | undefined,
  target?: Readonly<PlayerTargetView>,
): boolean {
  if (projectile.team === "player") return true;
  if (!player) return false;
  const distance = Math.hypot(
    projectile.position.x - player.position.x,
    projectile.position.z - player.position.z,
  );
  if (projectile.kind === "torpedo") {
    return distance <= TORPEDO.detectionRangeMeters;
  }
  return Boolean(target?.live) || distance <= 1_200;
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

  reset(): void {
    this.lastContact = undefined;
    this.lastSample = Number.NEGATIVE_INFINITY;
    this.acquisitionSamples = 0;
    this.hadTrack = false;
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
    const speed = contact.speedKnots * KNOT_TO_MPS;
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
    if (contact && contact.observedAt !== this.lastSample) {
      const remembered = this.lastContact
        && observation.time - this.lastContact.observedAt <= SENSOR.memorySeconds;
      this.acquisitionSamples = this.hadTrack && remembered
        ? SENSOR.acquisitionSamples
        : this.acquisitionSamples + 1;
      this.lastContact = this.copyContact(contact);
      this.lastSample = contact.observedAt;
    }

    if (contact) {
      const mode = this.acquisitionSamples >= SENSOR.acquisitionSamples
        ? "tracking"
        : "acquiring";
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
