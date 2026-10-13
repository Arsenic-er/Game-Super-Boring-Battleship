import { BATTLE_DURATION_SECONDS, OBJECTIVE, SENSOR, shipSpeedMetersPerSecond } from "../sim/config";
import { getShipClass } from "../ships/classes";
import { battleMapDefinition, type BattleMapId } from "../maps/atollMap";
import { ObjectiveCaptureNavigator } from "./objectiveCaptureNavigation";
import type { FleetObjectiveAssignment, Observation, Team } from "../sim/types";

const MAX_OBSERVERS = 64;
const UPDATE_SECONDS = 1;
const HOLD_SECONDS = 12;
const ROUTE_SECONDS = 4;
const NO_PROGRESS_SECONDS = 60;
const PROGRESS_METERS = 20;
const RETRY_SECONDS = 60;
type CaptureRoute = {
  context: string;
  navigators: [ObjectiveCaptureNavigator, ObjectiveCaptureNavigator];
  remaining: [number, number];
  sampledAt: number;
  eligible: boolean;
  inside: boolean;
  retryAfter: number;
  progress?: { station: 0 | 1; best: number; at: number; position: { x: number; z: number } };
};
const BUFFER_SECONDS = 30;
const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const otherTeam = (team: Team): Team => team === "player" ? "enemy" : "player";
const threshold = (classId: Observation["self"]["shipClassId"]): number => {
  const hull = getShipClass(classId)?.hullId;
  return hull === "destroyer" ? .36 : hull === "lightCruiser" ? .31 : .27;
};
const healthy = (observation: Readonly<Observation>): boolean =>
  observation.self.hull / observation.self.maxHull >= threshold(observation.self.shipClassId);
const distance = (observation: Readonly<Observation>): number => Math.hypot(
  observation.self.position.x - observation.objective.center.x,
  observation.self.position.z - observation.objective.center.z,
);
// Reaching the zone requires both propulsion and steering.
// An immobile hull already inside remains a legitimate capture participant.
const captureEligible = (observation: Readonly<Observation>): boolean => healthy(observation)
  && (distance(observation) <= observation.objective.radius
    || (observation.self.modules.engine.health > 0 && observation.self.modules.steering.health > 0));
const safelyOwned = (observation: Readonly<Observation>): boolean =>
  observation.objective.owner === observation.self.team && !observation.objective.contested
  && observation.objective.capturingTeam !== otherTeam(observation.self.team);

/** Deadline estimate from own propulsion and public scoring, never enemy entities. */
export function objectiveIsUrgent(observation: Readonly<Observation>): boolean {
  if (observation.gameMode === "sea-trials" || safelyOwned(observation)) return false;
  const { self, objective, time } = observation;
  const shipClass = getShipClass(self.shipClassId);
  if (!shipClass || !Number.isFinite(time) || time < 0 || !Number.isFinite(distance(observation))
    || !Number.isFinite(objective.radius) || objective.radius <= 0) return false;
  const opposingTeam = otherTeam(self.team);
  const ownScore = objective.scores[self.team];
  const opposingScore = objective.scores[opposingTeam];
  if (!Number.isFinite(ownScore) || !Number.isFinite(opposingScore)) return false;

  const engine = self.modules.engine;
  const engineRatio = engine.maxHealth > 0 ? clamp01(engine.health / engine.maxHealth) : 0;
  const floodingFactor = 1 - clamp01(self.flooding / 100) * .32;
  const speedKnots = shipClass.maxSpeedKnots * self.performance.maxSpeedMultiplier
    * engineRatio * floodingFactor;
  // Cruise allowance covers routine turns; acceleration avoids treating a stopped
  // destroyer as already at its catalogue speed. No terrain/enemy-state oracle.
  const travelDistance = Math.max(0, distance(observation) - objective.radius);
  const acceleration = shipClass.accelerationKnotsPerSecond
    * Math.max(.2, self.performance.accelerationMultiplier) * 2 * (.2 + engineRatio * .8);
  const travelSeconds = travelDistance > 0
    ? travelDistance / Math.max(1, shipSpeedMetersPerSecond(speedKnots) * .85)
      + Math.min(45, Math.max(0, speedKnots - self.speedKnots) / Math.max(.1, acceleration) * .5)
    : 0;
  const signedProgress = Math.max(-1, Math.min(1, objective.captureProgress))
    * (self.team === "player" ? 1 : -1);
  const captureRate = objective.contested ? OBJECTIVE.contestedCaptureMultiplier : 1;
  const neutralizeSeconds = Math.max(0, -signedProgress) * OBJECTIVE.captureSeconds / captureRate;
  // From -1 to +1 takes two capture intervals, not one.
  const captureSeconds = (1 - signedProgress) * OBJECTIVE.captureSeconds / captureRate;
  const enemyRate = objective.owner !== opposingTeam ? 0 : !objective.contested
    ? OBJECTIVE.scorePerSecond
    : objective.capturingTeam === opposingTeam
      ? OBJECTIVE.scorePerSecond * OBJECTIVE.contestedScoreMultiplier : 0;
  const projectedDeficit = Math.max(0, opposingScore - ownScore
    + enemyRate * (travelSeconds + neutralizeSeconds));
  const catchupSeconds = projectedDeficit / OBJECTIVE.scorePerSecond;
  const remaining = Math.max(0, BATTLE_DURATION_SECONDS - time);
  const projectedClockLoss = ownScore <= opposingScore + enemyRate * remaining;
  const lateRecovery = projectedClockLoss
    && remaining <= travelSeconds + captureSeconds + catchupSeconds + BUFFER_SECONDS;
  const scoreDeadline = enemyRate > 0
    && Math.max(0, OBJECTIVE.scoreToWin - opposingScore) / enemyRate
      <= travelSeconds + neutralizeSeconds + BUFFER_SECONDS;
  return lateRecovery || scoreDeadline;
}

function valid(observation: Readonly<Observation>, time: number): boolean {
  const { self } = observation;
  return !!self.id && (self.team === "player" || self.team === "enemy")
    && self.hull > 0 && Number.isFinite(self.maxHull) && self.maxHull > 0
    && !self.isTestTarget && !!getShipClass(self.shipClassId)
    && Number.isFinite(self.position.x) && Number.isFinite(self.position.z)
    && Number.isFinite(observation.time) && observation.time >= 0 && observation.time <= time
    && time - observation.time <= SENSOR.observationIntervalSeconds + 1e-6;
}

function rank(a: Readonly<Observation>, b: Readonly<Observation>, routes: ReadonlyMap<string, CaptureRoute>, time: number): number {
  const inZoneA = distance(a) <= a.objective.radius;
  const inZoneB = distance(b) <= b.objective.radius;
  const bias = (item: Readonly<Observation>): number => {
    const hull = getShipClass(item.self.shipClassId).hullId;
    return hull === "destroyer" ? 0 : hull === "lightCruiser" ? 450 : 900;
  };
  const routeA = routes.get(a.self.id), routeB = routes.get(b.self.id);
  const remainingA = Math.min(...(routeA?.remaining ?? [Infinity, Infinity]));
  const remainingB = Math.min(...(routeB?.remaining ?? [Infinity, Infinity]));
  return Number(inZoneB) - Number(inZoneA)
    || Number(Number.isFinite(remainingB)) - Number(Number.isFinite(remainingA))
    || Number((routeA?.retryAfter ?? 0) > time) - Number((routeB?.retryAfter ?? 0) > time)
    || (Number.isFinite(remainingA) ? remainingA : distance(a)) + bias(a)
      - (Number.isFinite(remainingB) ? remainingB : distance(b)) - bias(b)
    || compareId(a.self.id, b.self.id);
}

/**
 * Bounded cap duties over eligible AI and exact friendly navigation reports.
 * Missing observers release duties immediately (including human takeover).
 * At most two healthy ships are reserved; an uncontested owned zone scores empty.
 */
export class FleetObjectiveCoordinator {
  private assignments = new Map<string, FleetObjectiveAssignment>();
  private routes = new Map<string, CaptureRoute>();
  private geometry = new Map<BattleMapId, { sampledAt: number; signature: string; revision: number }>();
  private geometryRevision = 0;
  private identities = new Map<string, string>();
  private dutyStartedAt = new Map<string, number>();
  private signature = "";
  private computedAt = -Infinity;
  private updatedAt = -Infinity;

  reset(): void {
    this.assignments.clear();
    this.routes.clear();
    this.geometry.clear();
    this.geometryRevision = 0;
    this.identities.clear();
    this.dutyStartedAt.clear();
    this.signature = "";
    this.computedAt = this.updatedAt = -Infinity;
  }

  update(observations: readonly Readonly<Observation>[], time: number): Map<string, FleetObjectiveAssignment> {
    if (!Number.isFinite(time) || time < 0) { this.reset(); return new Map(); }
    if (time < this.updatedAt) this.reset();
    this.updatedAt = time;
    // Streaming lexicographic top-K bounds persistent work even in debug fleets.
    const active = new Map<string, Readonly<Observation>>();
    const duplicates = new Set<string>();
    for (const item of observations) {
      if (!valid(item, time) || item.gameMode === "sea-trials") continue;
      const id = item.self.id;
      if (active.has(id)) { active.delete(id); duplicates.add(id); continue; }
      if (duplicates.has(id)) continue;
      if (active.size >= MAX_OBSERVERS) {
        let greatest = "";
        for (const key of active.keys()) if (key > greatest) greatest = key;
        if (id >= greatest) continue;
        active.delete(greatest);
      }
      active.set(id, item);
    }
    for (const id of this.assignments.keys()) if (!active.has(id)) {
      this.assignments.delete(id);
      this.dutyStartedAt.delete(id);
    }
    for (const id of this.routes.keys()) if (!active.has(id)) this.routes.delete(id);
    const activeMaps = new Set([...active.values()].map(item => item.mapId));
    for (const mapId of this.geometry.keys()) if (!activeMaps.has(mapId)) this.geometry.delete(mapId);
    for (const mapId of activeMaps) {
      const previous = this.geometry.get(mapId);
      if (previous && time - previous.sampledAt < ROUTE_SECONDS) continue;
      const map = battleMapDefinition(mapId);
      const signature = JSON.stringify([map.halfExtentMeters, map.terrain]);
      this.geometry.set(mapId, { sampledAt: time, signature,
        revision: previous?.signature === signature ? previous.revision : ++this.geometryRevision });
    }
    const identities = new Map<string, string>();
    for (const [id, item] of active) {
      const identity = JSON.stringify([item.self.team, item.self.shipClassId, item.mapId,
        this.geometry.get(item.mapId)?.revision, item.objective.center.x, item.objective.center.y,
        item.objective.center.z, item.objective.radius]);
      identities.set(id, identity);
      if (this.identities.get(id) !== identity) {
        this.assignments.delete(id);
        this.dutyStartedAt.delete(id);
        this.routes.delete(id);
      }
      this.sampleRoute(item, identity, time);
    }
    this.identities = identities;
    const ids = [...active.keys()].sort(compareId);
    const groups = (["player", "enemy"] as const).map(team => {
      const members = ids.map(id => active.get(id)!).filter(item => item.self.team === team);
      const candidates = members.filter(captureEligible).sort((a, b) => rank(a, b, this.routes, time));
      const reference = candidates[0] ?? members[0];
      const humanIds = new Set<string>();
      if (reference) for (const friendly of reference.friendlies) {
        if (humanIds.size >= 2) break;
        if (active.has(friendly.id) || !Number.isFinite(friendly.hullRatio) || !getShipClass(friendly.shipClassId)
          || friendly.hullRatio < threshold(friendly.shipClassId)) continue;
        if (Math.hypot(friendly.position.x - reference.objective.center.x,
          friendly.position.z - reference.objective.center.z) <= reference.objective.radius) humanIds.add(friendly.id);
      }
      const urgent = reference ? objectiveIsUrgent(reference) : false;
      const needed = !reference || safelyOwned(reference) ? 0
        : (reference.objective.contested
          || reference.objective.capturingTeam === otherTeam(team) || urgent ? 2 : 1);
      return { members, candidates, reference, urgent, slots: Math.max(0, needed - humanIds.size) };
    });
    const signature = JSON.stringify([
      ids.map(id => { const item = active.get(id)!; return [id, identities.get(id), item.self.team, item.self.shipClassId,
        captureEligible(item), distance(item) <= item.objective.radius]; }),
      groups.map(group => { const objective = group.reference?.objective;
        return [group.slots, group.urgent, objective?.owner, objective?.capturingTeam, objective?.contested,
          objective?.center.x, objective?.center.z, objective?.radius]; }),
    ]);
    if (signature === this.signature && time - this.computedAt < UPDATE_SECONDS) return this.copy();

    const next = new Map<string, FleetObjectiveAssignment>();
    for (const { members, candidates, slots, urgent } of groups) {
      const reachable = (item: Readonly<Observation>): boolean =>
        this.routes.get(item.self.id)!.remaining.some(Number.isFinite);
      const current = candidates.filter(item => this.assignments.get(item.self.id)?.duty === "capture");
      // Only real, available replacements justify withdrawing a still-eligible
      // duty. All-unavailable fleets retain someone trying physical recovery.
      const handoff = current.map(item => item.self.id);
      let changed = false;
      if (current.length <= slots) for (const item of current) {
        const route = this.routes.get(item.self.id)!;
        if (distance(item) <= item.objective.radius || !route.progress
          || time - route.progress.at < NO_PROGRESS_SECONDS) continue;
        const partner = handoff.find(id => id !== item.self.id);
        const replacement = candidates.find(candidate => !current.includes(candidate)
          && !handoff.includes(candidate.self.id) && reachable(candidate)
          && this.routes.get(candidate.self.id)!.retryAfter <= time
          && (!partner || this.pairReachable(partner, candidate.self.id)));
        if (!replacement) continue;
        handoff[handoff.indexOf(item.self.id)] = replacement.self.id;
        route.retryAfter = time + RETRY_SECONDS;
        changed = true;
      }
      candidates.sort((a, b) => rank(a, b, this.routes, time));
      const selected: string[] = [];
      const reserve = (item: Readonly<Observation>): void => {
        if (selected.length < slots && !selected.includes(item.self.id)) selected.push(item.self.id);
      };
      // An already present healthy hull prevents reserving another distant hull.
      for (const item of candidates) if (distance(item) <= item.objective.radius) reserve(item);
      // Preserve the feasible pair used to justify a handoff; re-ranking alone
      // could otherwise select an incompatible alternative and undo it.
      if (changed) for (const id of handoff) reserve(active.get(id)!);
      for (const item of candidates) {
        const previous = this.assignments.get(item.self.id);
        if (previous?.duty === "capture" && this.routes.get(item.self.id)!.retryAfter <= time
          && (time - (this.dutyStartedAt.get(item.self.id) ?? time) < HOLD_SECONDS
            || !candidates.some(reachable))) reserve(item);
      }
      // Avoid choosing two ships that can only reach the same station when a
      // compatible second candidate exists. Deferred entries remain a fallback.
      for (const item of candidates) {
        if (selected.length === 1 && slots === 2 && !selected.includes(item.self.id)
          && !this.pairReachable(selected[0]!, item.self.id)) continue;
        reserve(item);
      }
      for (const item of candidates) reserve(item);
      selected.sort(compareId);
      const stations = this.assignStations(selected);
      for (const item of members) {
        const station = stations.get(item.self.id) ?? -1;
        const duty = station >= 0 ? "capture" : "support";
        const previous = this.assignments.get(item.self.id);
        if (previous?.duty !== duty) this.dutyStartedAt.set(item.self.id, time);
        const route = this.routes.get(item.self.id)!;
        if (station >= 0 && distance(item) > item.objective.radius) {
          const index = station as 0 | 1;
          if (!route.progress || previous?.duty !== "capture") {
            route.progress = { station: index, best: route.remaining[index], at: time,
              position: { x: item.self.position.x, z: item.self.position.z } };
          } else if (route.progress.station !== index) {
            // Rebase incomparable station distances, but do not let repeated
            // station changes reset the no-progress clock indefinitely.
            route.progress = { station: index, best: route.remaining[index], at: route.progress.at,
              position: { x: item.self.position.x, z: item.self.position.z } };
          }
        } else route.progress = undefined;
        next.set(item.self.id, { duty, urgent, assignedAt: time,
          ...(station >= 0 ? { stationIndex: station as 0 | 1 } : {}) });
      }
    }
    this.assignments = new Map([...next].sort(([a], [b]) => compareId(a, b)));
    this.signature = signature;
    this.computedAt = time;
    return this.copy();
  }

  private sampleRoute(item: Readonly<Observation>, context: string, time: number): void {
    let route = this.routes.get(item.self.id);
    const eligible = captureEligible(item);
    const inside = distance(item) <= item.objective.radius;
    if (!route || route.context !== context) {
      route = { context, navigators: [new ObjectiveCaptureNavigator(), new ObjectiveCaptureNavigator()],
        remaining: [Infinity, Infinity], sampledAt: -Infinity, eligible, inside, retryAfter: 0 };
      this.routes.set(item.self.id, route);
    }
    if (time - route.sampledAt < ROUTE_SECONDS && route.eligible === eligible && route.inside === inside) return;
    route.sampledAt = time; route.eligible = eligible; route.inside = inside;
    route.remaining = inside ? [0, 0] : !eligible ? [Infinity, Infinity]
      : [route.navigators[0].remainingDistanceMeters(item.mapId, item.self, item.objective, 0, time),
        route.navigators[1].remainingDistanceMeters(item.mapId, item.self, item.objective, 1, time)];
    const progress = route.progress;
    if (progress && !inside && eligible) {
      const remaining = route.remaining[progress.station];
      // A newly longer detour may reset the distance baseline, never the clock.
      // A later decrease must also be backed by own physical displacement:
      // stationary planner cost fluctuations must not fabricate progress.
      const displaced = Math.hypot(item.self.position.x - progress.position.x,
        item.self.position.z - progress.position.z) >= PROGRESS_METERS;
      const rebased = !Number.isFinite(remaining) || !Number.isFinite(progress.best)
        || remaining > progress.best + PROGRESS_METERS;
      const advanced = Number.isFinite(remaining) && remaining <= progress.best - PROGRESS_METERS
        && displaced;
      if (rebased || advanced) {
        progress.best = remaining;
        progress.position = { x: item.self.position.x, z: item.self.position.z };
        if (advanced && !rebased) progress.at = time;
      }
    }
  }

  private pairReachable(a: string, b: string): boolean {
    const left = this.routes.get(a)!.remaining, right = this.routes.get(b)!.remaining;
    return Number.isFinite(left[0]) && Number.isFinite(right[1])
      || Number.isFinite(left[1]) && Number.isFinite(right[0]);
  }

  private assignStations(selected: readonly string[]): Map<string, 0 | 1> {
    if (!selected.length) return new Map();
    const options: Array<Array<0 | 1>> = selected.length === 1 ? [[0], [1]] : [[0, 1], [1, 0]];
    const score = (stations: Array<0 | 1>) => {
      let unreachable = 0, retained = 0, total = 0;
      selected.forEach((id, index) => {
        const remaining = this.routes.get(id)!.remaining[stations[index]!];
        if (Number.isFinite(remaining)) total += remaining; else ++unreachable;
        const previous = this.assignments.get(id);
        if (previous?.duty === "capture" && previous.stationIndex === stations[index]) ++retained;
      });
      return { unreachable, retained, total };
    };
    options.sort((a, b) => {
      const left = score(a), right = score(b);
      return left.unreachable - right.unreachable || right.retained - left.retained || left.total - right.total;
    });
    return new Map(selected.map((id, index) => [id, options[0]![index]!]));
  }

  private copy(): Map<string, FleetObjectiveAssignment> {
    return new Map([...this.assignments].map(([id, assignment]) => [id, { ...assignment, assignedAt: this.updatedAt }]));
  }
}
