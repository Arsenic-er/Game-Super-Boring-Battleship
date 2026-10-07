import { SENSOR, shipSpeedMetersPerSecond } from "./config";
import { PlayerPerceptionTracker } from "./playerPerception";
import type { Observation, PlayerTargetView, SensorContact, Team, Vec3 } from "./types";

const MAX_CONTACTS = 64;
const compareId = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const finitePosition = (position: Readonly<Vec3>): boolean =>
  Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);

/** Reject malformed/stale local samples before they can allocate tracking state. */
function validContact(contact: Readonly<SensorContact>, observation: Observation): boolean {
  if (!contact.id || contact.id.length > 128 || contact.id === observation.self.id
    || (contact.team !== "player" && contact.team !== "enemy")
    || contact.team === observation.self.team
    || !Number.isFinite(contact.observedAt) || contact.observedAt < 0
    || contact.observedAt > observation.time
    || observation.time - contact.observedAt > SENSOR.observationIntervalSeconds
    || !finitePosition(contact.position) || !Number.isFinite(contact.heading)
    || !Number.isFinite(contact.speedKnots) || !Number.isFinite(contact.rangeMeters)
    || contact.rangeMeters < 0 || !Number.isFinite(contact.confidence)
    || contact.confidence <= 0 || contact.confidence > 1
    || !Number.isFinite(contact.estimatedHullRatio)
    || contact.estimatedHullRatio < 0 || contact.estimatedHullRatio > 1) return false;
  // Finite individual fields can still overflow during dead reckoning.
  const distance = shipSpeedMetersPerSecond(contact.speedKnots) * SENSOR.memorySeconds;
  return Number.isFinite(distance)
    && Number.isFinite(contact.position.x + Math.sin(contact.heading) * distance)
    && Number.isFinite(contact.position.z + Math.cos(contact.heading) * distance);
}

function compareContact(left: Readonly<SensorContact>, right: Readonly<SensorContact>): number {
  return right.observedAt - left.observedAt
    || left.rangeMeters - right.rangeMeters || compareId(left.id, right.id);
}

/** Choose a deterministic sample when a malformed producer repeats one ID. */
function newerDuplicate(left: Readonly<SensorContact>, right: Readonly<SensorContact>): boolean {
  for (const key of ["observedAt"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key];
  }
  if (left.rangeMeters !== right.rangeMeters) return left.rangeMeters < right.rangeMeters;
  if (left.confidence !== right.confidence) return left.confidence > right.confidence;
  for (const key of ["heading", "speedKnots", "estimatedHullRatio"] as const) {
    if (left[key] !== right[key]) return left[key] < right[key];
  }
  for (const key of ["x", "y", "z"] as const) {
    if (left.position[key] !== right.position[key]) return left.position[key] < right.position[key];
  }
  return false;
}

interface TrackedContact {
  tracker: PlayerPerceptionTracker;
  lastObservedAt: number;
}

/**
 * Local optical tracks only. Every enemy gets its own acquisition and memory;
 * neither radio reports nor the authoritative enemy entity list are consulted.
 */
export class PlayerFleetPerceptionTracker {
  private readonly trackers = new Map<string, TrackedContact>();
  private observerId?: string;
  private observerTeam?: Team;
  private lastTime = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.trackers.clear();
    this.observerId = undefined;
    this.observerTeam = undefined;
    this.lastTime = Number.NEGATIVE_INFINITY;
  }

  update(observation: Observation): PlayerTargetView[] {
    if (!Number.isFinite(observation.time) || observation.time < 0) {
      this.reset();
      return [];
    }
    if (this.observerId !== observation.self.id || this.observerTeam !== observation.self.team
      || observation.time < this.lastTime) this.reset();
    this.observerId = observation.self.id;
    this.observerTeam = observation.self.team;
    this.lastTime = observation.time;
    for (const [id, tracked] of this.trackers) {
      if (observation.time - tracked.lastObservedAt > SENSOR.memorySeconds) this.trackers.delete(id);
    }

    // Keep input allocation bounded as well as the retained tracker collection.
    // Rank newest samples first, then nearest; replacing a duplicate can only
    // improve its rank, so capped selection is independent of input ordering.
    const contacts = new Map<string, Readonly<SensorContact>>();
    for (const contact of observation.contacts) {
      if (!validContact(contact, observation)
        || contact.observedAt < (this.trackers.get(contact.id)?.lastObservedAt ?? -Infinity)) continue;
      const duplicate = contacts.get(contact.id);
      if (duplicate) {
        if (newerDuplicate(contact, duplicate)) contacts.set(contact.id, contact);
        continue;
      }
      if (contacts.size < MAX_CONTACTS) {
        contacts.set(contact.id, contact);
        continue;
      }
      let farthest: Readonly<SensorContact> | undefined;
      for (const kept of contacts.values()) {
        if (!farthest || compareContact(kept, farthest) > 0) farthest = kept;
      }
      if (farthest && compareContact(contact, farthest) < 0) {
        contacts.delete(farthest.id);
        contacts.set(contact.id, contact);
      }
    }

    const views: PlayerTargetView[] = [];
    const ids = new Set([...this.trackers.keys(), ...contacts.keys()]);
    for (const id of ids) {
      const contact = contacts.get(id);
      const tracked = this.trackers.get(id) ?? {
        tracker: new PlayerPerceptionTracker(),
        lastObservedAt: Number.NEGATIVE_INFINITY,
      };
      const view = tracked.tracker.update({
        ...observation,
        contacts: contact ? [contact] : [],
        sharedContacts: undefined,
      });
      if (!view) {
        this.trackers.delete(id);
        continue;
      }
      if (contact) tracked.lastObservedAt = contact.observedAt;
      this.trackers.set(id, tracked);
      views.push(view);
    }

    // Fresh contacts displace old memories, not vice versa. The final public
    // ordering is stable by ID, independent of sensor range/order fluctuations.
    views.sort((left, right) => Number(right.live) - Number(left.live)
      || (left.live && right.live ? left.rangeMeters - right.rangeMeters
        : right.lastObservedAt - left.lastObservedAt)
      || compareId(left.id, right.id));
    const retained = views.slice(0, MAX_CONTACTS);
    const retainedIds = new Set(retained.map(({ id }) => id));
    for (const id of this.trackers.keys()) {
      if (!retainedIds.has(id)) this.trackers.delete(id);
    }
    return retained.sort((left, right) => compareId(left.id, right.id));
  }
}

const targetRank = (target: Readonly<PlayerTargetView>): number =>
  target.live ? target.mode === "tracking" ? 0 : 1 : target.mode === "lost" ? 2 : 3;

/**
 * Presentation choice only, never an authoritative firing lock. Prefer live
 * confirmed targets, but keep a similarly distant previous target to avoid HUD
 * flicker from sampled range noise. Memory is a fallback, never a live upgrade.
 */
export function selectPrimaryTarget(
  views: readonly PlayerTargetView[],
  previousTargetId?: string,
  observerPosition?: Readonly<Vec3>,
): PlayerTargetView | undefined {
  const distance = (view: PlayerTargetView): number => {
    if (observerPosition && finitePosition(observerPosition)) {
      return Math.hypot(view.position.x - observerPosition.x, view.position.z - observerPosition.z);
    }
    return view.live && Number.isFinite(view.rangeMeters) ? view.rangeMeters : Infinity;
  };
  const candidates = views.filter((view) => Number.isFinite(view.confidence) && view.confidence > .02);
  candidates.sort((left, right) => targetRank(left) - targetRank(right)
    || distance(left) - distance(right)
    || right.lastObservedAt - left.lastObservedAt || compareId(left.id, right.id));
  const nearest = candidates[0];
  if (!nearest) return undefined;
  const previous = candidates.find(({ id }) => id === previousTargetId);
  return previous && targetRank(previous) === targetRank(nearest)
    && distance(previous) <= distance(nearest) * 1.25 + 150 ? previous : nearest;
}
