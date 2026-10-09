import { BATTLE_DURATION_SECONDS, OBJECTIVE, SENSOR, shipSpeedMetersPerSecond } from "../sim/config";
import { getShipClass } from "../ships/classes";
import type { FleetObjectiveAssignment, Observation, Team } from "../sim/types";

const MAX_OBSERVERS = 64;
const UPDATE_SECONDS = 1;
const HOLD_SECONDS = 12;
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

function rank(a: Readonly<Observation>, b: Readonly<Observation>): number {
  const inZoneA = distance(a) <= a.objective.radius;
  const inZoneB = distance(b) <= b.objective.radius;
  const bias = (item: Readonly<Observation>): number => {
    const hull = getShipClass(item.self.shipClassId).hullId;
    return hull === "destroyer" ? 0 : hull === "lightCruiser" ? 450 : 900;
  };
  return Number(inZoneB) - Number(inZoneA)
    || distance(a) + bias(a) - distance(b) - bias(b)
    || compareId(a.self.id, b.self.id);
}

/**
 * Bounded cap duties over eligible AI and exact friendly navigation reports.
 * Missing observers release duties immediately (including human takeover).
 * At most two healthy ships are reserved; an uncontested owned zone scores empty.
 */
export class FleetObjectiveCoordinator {
  private assignments = new Map<string, FleetObjectiveAssignment>();
  private identities = new Map<string, string>();
  private dutyStartedAt = new Map<string, number>();
  private signature = "";
  private computedAt = -Infinity;
  private updatedAt = -Infinity;

  reset(): void {
    this.assignments.clear();
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
    const identities = new Map<string, string>();
    for (const [id, item] of active) {
      const identity = item.self.team + ":" + item.self.shipClassId;
      identities.set(id, identity);
      if (this.identities.get(id) !== identity) {
        this.assignments.delete(id);
        this.dutyStartedAt.delete(id);
      }
    }
    this.identities = identities;
    const ids = [...active.keys()].sort(compareId);
    const groups = (["player", "enemy"] as const).map(team => {
      const members = ids.map(id => active.get(id)!).filter(item => item.self.team === team);
      const candidates = members.filter(captureEligible).sort(rank);
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
      ids.map(id => { const item = active.get(id)!; return [id, item.self.team, item.self.shipClassId,
        captureEligible(item), distance(item) <= item.objective.radius]; }),
      groups.map(group => { const objective = group.reference?.objective;
        return [group.slots, group.urgent, objective?.owner, objective?.capturingTeam, objective?.contested,
          objective?.center.x, objective?.center.z, objective?.radius]; }),
    ]);
    if (signature === this.signature && time - this.computedAt < UPDATE_SECONDS) return this.copy();

    const next = new Map<string, FleetObjectiveAssignment>();
    for (const { members, candidates, slots, urgent } of groups) {
      const selected: string[] = [];
      const reserve = (item: Readonly<Observation>): void => {
        if (selected.length < slots && !selected.includes(item.self.id)) selected.push(item.self.id);
      };
      // An already present healthy hull prevents reserving another distant hull.
      for (const item of candidates) if (distance(item) <= item.objective.radius) reserve(item);
      for (const item of candidates) {
        const previous = this.assignments.get(item.self.id);
        if (previous?.duty === "capture"
          && time - (this.dutyStartedAt.get(item.self.id) ?? time) < HOLD_SECONDS) reserve(item);
      }
      for (const item of candidates) reserve(item);
      selected.sort(compareId);
      for (const item of members) {
        const station = selected.indexOf(item.self.id);
        const duty = station >= 0 ? "capture" : "support";
        const previous = this.assignments.get(item.self.id);
        if (previous?.duty !== duty) this.dutyStartedAt.set(item.self.id, time);
        next.set(item.self.id, { duty, urgent, assignedAt: time,
          ...(station >= 0 ? { stationIndex: station as 0 | 1 } : {}) });
      }
    }
    this.assignments = new Map([...next].sort(([a], [b]) => compareId(a, b)));
    this.signature = signature;
    this.computedAt = time;
    return this.copy();
  }

  private copy(): Map<string, FleetObjectiveAssignment> {
    return new Map([...this.assignments].map(([id, assignment]) => [id, { ...assignment, assignedAt: this.updatedAt }]));
  }
}
