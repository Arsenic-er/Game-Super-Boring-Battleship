import { SENSOR } from "../sim/config";
import { effectiveMainBattery } from "../ships/mainBatteries";
import { fleetEngagementBandForRole, fleetRoleForShip } from "./ruleBasedAi";
import type {
  FleetAiRole, FleetTargetAssignment, Observation, SensorContact, ShipState, Team,
} from "../sim/types";

export type { FleetTargetAssignment } from "../sim/types";

const MAX_OBSERVERS = 64;
const MAX_CONTACTS = 64;
const MAX_SAMPLE_AGE = SENSOR.observationIntervalSeconds + 1e-6;
const HOLD_SECONDS = SENSOR.observationIntervalSeconds * SENSOR.aiAcquisitionSamples;
const SELF_DEFENSE_METERS = 900;
const SWITCH_MARGIN = .35;

interface Observer {
  identity: string;
  team: Team;
  role: FleetAiRole;
  maximumRangeMeters: number;
  contactIds: Set<string>;
  assignment?: FleetTargetAssignment;
}

interface Input {
  observation: Observation;
  contacts: Map<string, Readonly<SensorContact>>;
}

const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const validTeam = (team: Team): boolean => team === "player" || team === "enemy";
const finitePosition = (position: Readonly<SensorContact["position"]>): boolean =>
  !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);

function validObserver(observation: Observation, time: number): boolean {
  const self = observation.self;
  // Eligibility is supplied by the session; aiControlled is not a second authority.
  return typeof self.id === "string" && self.id.length > 0 && validTeam(self.team)
    && Number.isFinite(self.hull) && self.hull > 0 && !self.isTestTarget
    && finitePosition(self.position) && Number.isFinite(observation.time)
    && observation.time >= 0 && observation.time <= time && time - observation.time <= MAX_SAMPLE_AGE;
}

function validContact(contact: Readonly<SensorContact>, self: Readonly<ShipState>, time: number): boolean {
  return typeof contact.id === "string" && contact.id.length > 0 && contact.id !== self.id
    && validTeam(contact.team) && contact.team !== self.team && finitePosition(contact.position)
    && Number.isFinite(contact.observedAt) && contact.observedAt >= 0 && contact.observedAt <= time
    && time - contact.observedAt <= MAX_SAMPLE_AGE
    && Number.isFinite(contact.heading) && Number.isFinite(contact.speedKnots)
    && Number.isFinite(contact.rangeMeters) && contact.rangeMeters >= 0
    && Number.isFinite(contact.confidence) && contact.confidence > 0 && contact.confidence <= 1
    && Number.isFinite(contact.estimatedHullRatio)
    && contact.estimatedHullRatio >= 0 && contact.estimatedHullRatio <= 1;
}

const localPriority = (contact: Readonly<SensorContact>): number =>
  contact.rangeMeters / 1_000 + contact.estimatedHullRatio * 1.15 - contact.confidence * .35;

function compareCandidate(a: Readonly<SensorContact>, b: Readonly<SensorContact>, observer: Observer): number {
  return Number(a.rangeMeters > SELF_DEFENSE_METERS) - Number(b.rangeMeters > SELF_DEFENSE_METERS)
    || Number(a.rangeMeters > observer.maximumRangeMeters) - Number(b.rangeMeters > observer.maximumRangeMeters)
    || score(a, observer) - score(b, observer) || b.observedAt - a.observedAt
    || compareId(a.id, b.id) || b.confidence - a.confidence
    || a.rangeMeters - b.rangeMeters || a.estimatedHullRatio - b.estimatedHullRatio
    || a.position.x - b.position.x || a.position.y - b.position.y || a.position.z - b.position.z
    || a.heading - b.heading || a.speedKnots - b.speedKnots;
}

/** Bounded selection avoids sorting arbitrarily large debug fleets/contact lists. */
function retainBest<T>(items: Map<string, T>, id: string, item: T, limit: number,
  compare: (a: T, b: T) => number): void {
  if (items.size < limit) {
    items.set(id, item);
    return;
  }
  let worstId: string | undefined;
  let worst: T | undefined;
  for (const [key, value] of items) {
    if (worst === undefined || compare(value, worst) > 0) {
      worstId = key;
      worst = value;
    }
  }
  if (worst !== undefined && compare(item, worst) < 0) {
    items.delete(worstId!);
    items.set(id, item);
  }
}

function localContacts(observation: Observation, time: number,
  observer: Observer): Map<string, Readonly<SensorContact>> {
  const contacts = new Map<string, Readonly<SensorContact>>();
  // Never inspect sharedContacts, other observers' contacts or live enemy entities.
  for (const contact of observation.contacts) {
    if (!validContact(contact, observation.self, time) || contact.observedAt > observation.time) continue;
    const previous = contacts.get(contact.id);
    if (previous) {
      // The same total order for duplicates and capacity makes streaming top-K
      // independent of input order, without an unbounded per-target sample map.
      if (compareCandidate(contact, previous, observer) < 0) contacts.set(contact.id, contact);
    } else retainBest(contacts, contact.id, contact, MAX_CONTACTS,
      (a, b) => compareCandidate(a, b, observer));
  }
  return contacts;
}

function observerIdentity(self: Readonly<ShipState>): string {
  return JSON.stringify([self.team, self.hullId, self.shipClassId, self.mainGunId,
    self.mainGunMounts, self.developer?.enabled, self.developer?.mainBatteryClassId,
    self.installedEquipment?.mainGun]);
}

function score(contact: Readonly<SensorContact>, observer: Observer): number {
  const band = fleetEngagementBandForRole(observer.role);
  const bandMismatch = Math.max(0, band.minimumMeters - contact.rangeMeters,
    contact.rangeMeters - band.maximumMeters) / 1_000;
  const beyondGunRange = Math.max(0, contact.rangeMeters - observer.maximumRangeMeters);
  return localPriority(contact) + bandMismatch * .35
    + Math.min(6, beyondGunRange / 300);
}

function immediateThreat(contacts: ReadonlyMap<string, Readonly<SensorContact>>,
  current: Readonly<SensorContact> | undefined): Readonly<SensorContact> | undefined {
  let closest: Readonly<SensorContact> | undefined;
  for (const contact of contacts.values()) {
    if (contact.rangeMeters > SELF_DEFENSE_METERS) continue;
    if (!closest || contact.rangeMeters < closest.rangeMeters
      || (contact.rangeMeters === closest.rangeMeters && compareId(contact.id, closest.id) < 0)) closest = contact;
  }
  if (closest && current && current.rangeMeters <= SELF_DEFENSE_METERS
    && current.rangeMeters <= closest.rangeMeters + 150) return current;
  return closest;
}

/**
 * Soft fleet claims over each AI's own optical contacts, never a shared sensor.
 * Supply the entire current AI roster each step; omission releases claims immediately.
 * Internal state is capped at 64 observers and 64 local contact IDs per observer.
 */
export class FleetTargetCoordinator {
  private readonly observers = new Map<string, Observer>();
  private assignments = new Map<string, FleetTargetAssignment>();
  private lastUpdateAt?: number;
  private lastComputedAt = -Infinity;

  reset(): void {
    this.observers.clear();
    this.assignments.clear();
    this.lastUpdateAt = undefined;
    this.lastComputedAt = -Infinity;
  }

  update(observations: readonly Observation[], time: number): ReadonlyMap<string, FleetTargetAssignment> {
    if (!Number.isFinite(time) || time < 0) {
      this.reset();
      return new Map();
    }
    if (this.lastUpdateAt !== undefined && time < this.lastUpdateAt) this.reset();
    this.lastUpdateAt = time;
    const active = new Map<string, Observation>();
    const duplicateIds = new Set<string>();
    const seenIds = new Set<string>();
    for (const observation of observations) {
      if (!validObserver(observation, time)) continue;
      const id = observation.self.id;
      if (seenIds.has(id)) {
        duplicateIds.add(id);
        active.delete(id);
        continue;
      }
      seenIds.add(id);
      retainBest(active, id, observation, MAX_OBSERVERS,
        (a, b) => compareId(a.self.id, b.self.id));
    }
    // Ambiguous duplicate observers cannot inherit another observer's director.
    if (duplicateIds.size) {
      active.clear();
      for (const observation of observations) {
        if (!validObserver(observation, time) || duplicateIds.has(observation.self.id)) continue;
        retainBest(active, observation.self.id, observation, MAX_OBSERVERS,
          (a, b) => compareId(a.self.id, b.self.id));
      }
    }
    let changed = time - this.lastComputedAt >= SENSOR.observationIntervalSeconds;
    for (const id of this.observers.keys()) {
      if (!active.has(id)) {
        this.observers.delete(id);
        changed = true;
      }
    }
    const inputs = new Map<string, Input>();
    for (const [id, observation] of active) {
      const identity = observerIdentity(observation.self);
      let observer = this.observers.get(id);
      if (!observer || observer.identity !== identity) {
        const battery = effectiveMainBattery(observation.self);
        observer = { identity, team: observation.self.team, role: fleetRoleForShip(observation.self),
          maximumRangeMeters: battery.mounts.length ? battery.maximumRangeMeters : 0,
          contactIds: new Set() };
        this.observers.set(id, observer);
        changed = true;
      }
      const contacts = localContacts(observation, time, observer);
      if (observer.contactIds.size !== contacts.size
        || [...contacts.keys()].some(contactId => !observer!.contactIds.has(contactId))) changed = true;
      const current = contacts.get(observer.assignment?.targetId ?? "");
      const threat = immediateThreat(contacts, current);
      if (observer.assignment && !current || threat && threat.id !== current?.id) changed = true;
      inputs.set(id, { observation, contacts });
    }
    if (!changed) return this.copyAssignments();

    const ids = [...active.keys()].sort(compareId);
    const occupancy: Record<Team, Map<string, number>> = { player: new Map(), enemy: new Map() };
    const claim = (team: Team, targetId: string, delta: number): void => {
      const count = (occupancy[team].get(targetId) ?? 0) + delta;
      if (count > 0) occupancy[team].set(targetId, count);
      else occupancy[team].delete(targetId);
    };
    for (const id of ids) {
      const observer = this.observers.get(id)!;
      const contacts = inputs.get(id)!.contacts;
      observer.contactIds = new Set(contacts.keys());
      if (observer.assignment && !contacts.has(observer.assignment.targetId)) observer.assignment = undefined;
      if (observer.assignment) claim(observer.team, observer.assignment.targetId, 1);
    }

    const reconsider: string[] = [];
    const assign = (observer: Observer, target: Readonly<SensorContact> | undefined): void => {
      const previous = observer.assignment;
      if (previous) claim(observer.team, previous.targetId, -1);
      observer.assignment = target ? { targetId: target.id,
        assignedAt: previous?.targetId === target.id ? previous.assignedAt : time,
        role: observer.role, friendlyAssignedCount: 0 } : undefined;
      if (target) claim(observer.team, target.id, 1);
    };
    // Reserve every valid previous claim before considering switches. Releasing the
    // entire fleet at once would make symmetric groups swap targets every scan.
    for (const id of ids) {
      const observer = this.observers.get(id)!;
      const contacts = inputs.get(id)!.contacts;
      const current = contacts.get(observer.assignment?.targetId ?? "");
      const threat = immediateThreat(contacts, current);
      if (threat) {
        assign(observer, threat);
        continue;
      }
      let severelyInferior = false;
      if (current) {
        const currentScore = score(current, observer);
        for (const candidate of contacts.values()) {
          if (currentScore > score(candidate, observer) + 1.25
            || current.rangeMeters > observer.maximumRangeMeters * 1.08
              && candidate.rangeMeters <= observer.maximumRangeMeters) severelyInferior = true;
        }
      }
      if (!current || !observer.assignment || severelyInferior
        || time - observer.assignment.assignedAt >= HOLD_SECONDS) reconsider.push(id);
    }
    for (const id of reconsider) {
      const observer = this.observers.get(id)!;
      const contacts = inputs.get(id)!.contacts;
      const previous = observer.assignment;
      const current = contacts.get(previous?.targetId ?? "");
      if (previous) claim(observer.team, previous.targetId, -1);
      const coordinatedScore = (contact: Readonly<SensorContact>): number =>
        score(contact, observer)
          // Progressive across the full 64-AI bound: no early plateau that
          // traps large fleets on the first target. Damage can justify focus.
          + Math.min(6, Math.log2(1 + (occupancy[observer.team].get(contact.id) ?? 0)))
            * (.55 + .45 * contact.estimatedHullRatio);
      let best: Readonly<SensorContact> | undefined;
      let bestScore = Infinity;
      for (const contact of contacts.values()) {
        const candidateScore = coordinatedScore(contact);
        if (candidateScore < bestScore || candidateScore === bestScore
          && (!best || compareId(contact.id, best.id) < 0)) {
          best = contact;
          bestScore = candidateScore;
        }
      }
      if (current && coordinatedScore(current) <= bestScore + SWITCH_MARGIN) best = current;
      // Restore the old claim so assign has exactly one claim to replace.
      if (previous) claim(observer.team, previous.targetId, 1);
      assign(observer, best);
    }
    this.assignments = new Map();
    for (const id of ids) {
      const observer = this.observers.get(id)!;
      if (!observer.assignment) continue;
      observer.assignment.friendlyAssignedCount = occupancy[observer.team].get(observer.assignment.targetId) ?? 0;
      this.assignments.set(id, observer.assignment);
    }
    this.lastComputedAt = time;
    return this.copyAssignments();
  }

  private copyAssignments(): Map<string, FleetTargetAssignment> {
    return new Map([...this.assignments].map(([id, assignment]) => [id, { ...assignment }]));
  }
}
