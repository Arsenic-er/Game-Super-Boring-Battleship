import type { FleetContactReport, Observation, SensorContact, ShipState, Team } from "./types";

export const FLEET_RADIO_DELAY_SECONDS = 3;
export const FLEET_RADIO_TTL_SECONDS = 15;
const MAX_SOURCES = 64;
const MAX_TARGETS_PER_SOURCE = 64;

interface Packet {
  contact: SensorContact;
  receivedAt: number;
}

interface Track {
  latestObservedAt: number;
  pending: Packet[];
  delivered?: Packet;
}

interface Source {
  team: Team;
  targets: Map<string, Track>;
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function validTeam(team: Team): boolean {
  return team === "player" || team === "enemy";
}

function validShip(ship: Readonly<ShipState>): boolean {
  return typeof ship.id === "string" && ship.id.length > 0 && validTeam(ship.team)
    && Number.isFinite(ship.hull) && ship.hull > 0 && !ship.isTestTarget;
}

function validPosition(position: Readonly<SensorContact["position"]>): boolean {
  return [position.x, position.y, position.z].every(Number.isFinite);
}

function copyContact(contact: Readonly<SensorContact>, source: Readonly<ShipState>, time: number): SensorContact | undefined {
  if (typeof contact.id !== "string" || !contact.id || contact.id === source.id
    || !validTeam(contact.team) || contact.team === source.team || !validPosition(contact.position)
    || ![contact.observedAt, contact.heading, contact.speedKnots, contact.rangeMeters,
      contact.confidence, contact.estimatedHullRatio].every(Number.isFinite)
    || contact.observedAt < 0 || contact.observedAt > time
    || time - contact.observedAt >= FLEET_RADIO_TTL_SECONDS
    || contact.speedKnots < 0 || contact.rangeMeters < 0 || contact.confidence <= 0) return undefined;
  // List fields explicitly: never carry a live entity or an accidental extension into radio state.
  return {
    id: contact.id, team: contact.team, observedAt: contact.observedAt,
    position: { ...contact.position }, heading: contact.heading, speedKnots: contact.speedKnots,
    rangeMeters: contact.rangeMeters, confidence: Math.min(1, contact.confidence),
    estimatedHullRatio: Math.max(0, Math.min(1, contact.estimatedHullRatio)),
  };
}

function compareContact(a: SensorContact, b: SensorContact): number {
  return b.observedAt - a.observedAt || b.confidence - a.confidence || compareId(a.id, b.id)
    || a.position.x - b.position.x || a.position.y - b.position.y || a.position.z - b.position.z
    || a.heading - b.heading || a.speedKnots - b.speedKnots
    || a.estimatedHullRatio - b.estimatedHullRatio || a.rangeMeters - b.rangeMeters;
}

/**
 * Controller-only, delayed friendly search hints. This is not a sensor, target resolver or weapon feed.
 * Each update must include all current ships' local observations, including sources with no contacts.
 */
export class FleetRadioNetwork {
  private readonly sources = new Map<string, Source>();
  private lastUpdateAt?: number;

  reset(): void {
    this.sources.clear();
    this.lastUpdateAt = undefined;
  }

  update(observations: readonly Observation[], time: number): void {
    if (!Number.isFinite(time) || time < 0) {
      this.reset();
      return;
    }
    if (this.lastUpdateAt !== undefined && time < this.lastUpdateAt) this.reset();
    this.lastUpdateAt = time;

    // Sorting makes capacity and tie decisions independent of ship iteration order.
    const active = observations.filter(({ self }) => validShip(self))
      .slice().sort((a, b) => compareId(a.self.id, b.self.id)).slice(0, MAX_SOURCES);
    const activeIds = new Set(active.map(({ self }) => self.id));
    for (const id of this.sources.keys()) if (!activeIds.has(id)) this.sources.delete(id);

    for (const observation of active) {
      const self = observation.self;
      let source = this.sources.get(self.id);
      if (!source || source.team !== self.team) {
        source = { team: self.team, targets: new Map() };
        this.sources.set(self.id, source);
      }
      for (const [id, track] of source.targets) {
        track.pending = track.pending.filter(({ contact }) => time - contact.observedAt < FLEET_RADIO_TTL_SECONDS);
        if (track.delivered && time - track.delivered.contact.observedAt >= FLEET_RADIO_TTL_SECONDS)
          track.delivered = undefined;
        // Retain the first pending sample while newer scans arrive; replacing it would starve delivery.
        while (track.pending.length && track.pending[0].receivedAt <= time) {
          const packet = track.pending.shift()!;
          if (!track.delivered || packet.contact.observedAt > track.delivered.contact.observedAt)
            track.delivered = packet;
        }
        if (!track.pending.length && !track.delivered) source.targets.delete(id);
      }

      const samples = observation.contacts.map((contact) => copyContact(contact, self, time))
        .filter((contact): contact is SensorContact => contact !== undefined).sort(compareContact);
      const sampledIds = new Set<string>();
      for (const contact of samples) {
        if (sampledIds.has(contact.id)) continue;
        sampledIds.add(contact.id);
        let track = source.targets.get(contact.id);
        if (!track) {
          track = { latestObservedAt: -1, pending: [] };
          source.targets.set(contact.id, track);
        }
        if (contact.observedAt <= track.latestObservedAt) continue;
        track.latestObservedAt = contact.observedAt;
        const packet = { contact, receivedAt: time + FLEET_RADIO_DELAY_SECONDS };
        if (track.pending.length < 2) track.pending.push(packet);
        else track.pending[1] = packet;
      }
      // Cap retained state even when a debug scene cycles through arbitrarily many target IDs.
      if (source.targets.size > MAX_TARGETS_PER_SOURCE) {
        const retained = [...source.targets].sort(([aId, a], [bId, b]) =>
          b.latestObservedAt - a.latestObservedAt || compareId(aId, bId)).slice(0, MAX_TARGETS_PER_SOURCE);
        source.targets = new Map(retained);
      }
    }
  }

  contactsFor(self: Readonly<ShipState>, time: number): FleetContactReport[] {
    if (!Number.isFinite(time) || time < 0 || (this.lastUpdateAt !== undefined && time < this.lastUpdateAt)) {
      this.reset();
      return [];
    }
    if (!validShip(self) || !validPosition(self.position)) return [];
    const best = new Map<string, FleetContactReport>();
    for (const [sourceShipId, source] of this.sources) {
      if (sourceShipId === self.id || source.team !== self.team) continue;
      for (const { delivered } of source.targets.values()) {
        if (!delivered || delivered.receivedAt > time) continue;
        const contact = delivered.contact;
        const age = time - contact.observedAt;
        if (age < 0 || age >= FLEET_RADIO_TTL_SECONDS) continue;
        const rangeMeters = Math.hypot(contact.position.x - self.position.x, contact.position.z - self.position.z);
        if (!Number.isFinite(rangeMeters)) continue;
        const report: FleetContactReport = {
          ...contact, position: { ...contact.position }, rangeMeters,
          confidence: contact.confidence * (1 - age / FLEET_RADIO_TTL_SECONDS),
          sourceShipId, receivedAt: delivered.receivedAt,
        };
        const previous = best.get(report.id);
        if (!previous || report.observedAt > previous.observedAt
          || (report.observedAt === previous.observedAt && (report.confidence > previous.confidence
            || (report.confidence === previous.confidence && compareId(sourceShipId, previous.sourceShipId) < 0))))
          best.set(report.id, report);
      }
    }
    return [...best.values()].sort((a, b) => compareId(a.id, b.id));
  }
}
