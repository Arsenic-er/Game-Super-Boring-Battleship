import { isProjectileVisibleToPlayer } from "../sim/playerPerception";
import { observe } from "../sim/simulation";
import type { AirCombatEvent, BattleState, ImpactEvent, PlayerTargetView, ProjectileState, SensorContact, ShipState, ShotEvent, Vec3 } from "../sim/types";
import type { PlayerSnapshotPayload } from "./protocol";

const cloneVec = (value: Readonly<Vec3>): Vec3 => ({ ...value });
const distanceTo = (a: Readonly<Vec3>, b: Readonly<Vec3>): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

function contactView(contact: Readonly<SensorContact>): PlayerTargetView {
  return {
    id: contact.id,
    team: contact.team,
    mode: "tracking",
    live: true,
    confidence: contact.confidence,
    lastObservedAt: contact.observedAt,
    position: cloneVec(contact.position),
    heading: contact.heading,
    speedKnots: contact.speedKnots,
    rangeMeters: contact.rangeMeters,
    estimatedHullRatio: contact.estimatedHullRatio,
  };
}

function cloneSelf(ship: Readonly<ShipState>): PlayerSnapshotPayload["self"] {
  return {
    id: ship.id,
    team: ship.team,
    shipClassId: ship.shipClassId,
    position: cloneVec(ship.position),
    heading: ship.heading,
    speedKnots: ship.speedKnots,
    throttle: ship.throttle,
    hull: ship.hull,
    maxHull: ship.maxHull,
    reloadRemaining: ship.reloadRemaining,
    torpedoReloadRemaining: ship.torpedoReloadRemaining,
    smokeCharges: ship.smokeCharges,
    hydroCharges: ship.hydroCharges,
  };
}

function visibleProjectile(
  projectile: Readonly<ProjectileState>,
  viewer: Readonly<ShipState>,
  contactsById: ReadonlyMap<string, PlayerTargetView>,
): boolean {
  if (projectile.team === viewer.team) return true;
  return isProjectileVisibleToPlayer(projectile, viewer, contactsById.get(projectile.ownerId));
}

function visibleShot(
  shot: Readonly<ShotEvent>,
  viewer: Readonly<ShipState>,
  visibleEnemyIds: ReadonlySet<string>,
): boolean {
  return shot.team === viewer.team
    || visibleEnemyIds.has(shot.ownerId)
    || distanceTo(shot.position, viewer.position) <= 1_200;
}

function visibleImpact(
  impact: Readonly<ImpactEvent>,
  viewer: Readonly<ShipState>,
  friendlyIds: ReadonlySet<string>,
  visibleEnemyIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    (impact.targetId && friendlyIds.has(impact.targetId))
    || (impact.sourceId && visibleEnemyIds.has(impact.sourceId))
    || distanceTo(impact.position, viewer.position) <= 1_200,
  );
}

function visibleAirEvent(
  event: Readonly<AirCombatEvent>,
  friendlyIds: ReadonlySet<string>,
  visibleEnemyIds: ReadonlySet<string>,
): boolean {
  return friendlyIds.has(event.controllerId)
    || visibleEnemyIds.has(event.controllerId)
    || (event.targetId !== undefined && (friendlyIds.has(event.targetId) || visibleEnemyIds.has(event.targetId)));
}

export function replicationViewFor(
  state: Readonly<BattleState>,
  controlledShipId: string,
  serverTick: number,
  lastProcessedInputSequence: number,
): PlayerSnapshotPayload {
  const observation = observe(state as BattleState, controlledShipId);
  const self = state.ships.find((ship) => ship.id === controlledShipId);
  if (!self) throw new Error(`Unknown ship: ${controlledShipId}`);

  const contacts = observation.contacts.map((contact) => ({
    id: contact.id,
    team: contact.team,
    observedAt: contact.observedAt,
    position: cloneVec(contact.position),
    heading: contact.heading,
    speedKnots: contact.speedKnots,
    rangeMeters: contact.rangeMeters,
    confidence: contact.confidence,
    estimatedHullRatio: contact.estimatedHullRatio,
  }));
  const contactsById = new Map(contacts.map((contact) => [contact.id, contactView(contact)]));
  const visibleEnemyIds = new Set(contacts.map((contact) => contact.id));
  const friendlyIds = new Set<string>([controlledShipId, ...observation.friendlies.map((ship) => ship.id)]);

  const projectiles = state.projectiles
    .filter((projectile) => projectile.kind !== "torpedo")
    .filter((projectile) => visibleProjectile(projectile, self, contactsById))
    .map((projectile) => ({
      id: projectile.id,
      ownerId: projectile.ownerId,
      team: projectile.team,
      kind: projectile.kind,
      ammoType: projectile.ammoType,
      position: cloneVec(projectile.position),
      previousPosition: cloneVec(projectile.previousPosition),
      velocity: cloneVec(projectile.velocity),
      age: projectile.age,
    }));
  const torpedoes = state.projectiles
    .filter((projectile) => projectile.kind === "torpedo")
    .filter((projectile) => visibleProjectile(projectile, self, contactsById))
    .map((projectile) => ({
      id: projectile.id,
      ownerId: projectile.ownerId,
      team: projectile.team,
      kind: projectile.kind,
      position: cloneVec(projectile.position),
      previousPosition: cloneVec(projectile.previousPosition),
      velocity: cloneVec(projectile.velocity),
      age: projectile.age,
      detectionRange: projectile.detectionRange,
    }));
  const aircraft = state.airSquadrons
    .filter((squadron) => squadron.team === self.team || visibleEnemyIds.has(squadron.controllerId))
    .map((squadron) => ({
      id: squadron.id,
      controllerId: squadron.controllerId,
      team: squadron.team,
      role: squadron.role,
      phase: squadron.phase,
      position: cloneVec(squadron.position),
      heading: squadron.heading,
      aircraftOperational: squadron.aircraftOperational,
    }));
  const events = [
    ...state.shots
      .filter((shot) => visibleShot(shot, self, visibleEnemyIds))
      .map((shot) => ({
        id: shot.id,
        kind: "shot",
        team: shot.team,
        ownerId: shot.team === self.team || visibleEnemyIds.has(shot.ownerId) ? shot.ownerId : undefined,
        projectileKind: shot.kind,
        ammoType: shot.ammoType,
        weaponSource: shot.weaponSource,
        position: cloneVec(shot.position),
      })),
    ...state.impacts
      .filter((impact) => visibleImpact(impact, self, friendlyIds, visibleEnemyIds))
      .map((impact) => ({
        id: impact.id,
        kind: impact.kind,
        position: cloneVec(impact.position),
        sourceId: impact.sourceId && (impact.sourceTeam === self.team || visibleEnemyIds.has(impact.sourceId)) ? impact.sourceId : undefined,
        sourceTeam: impact.sourceTeam,
        targetId: impact.targetId && (friendlyIds.has(impact.targetId) || visibleEnemyIds.has(impact.targetId)) ? impact.targetId : undefined,
        damage: impact.damage,
        projectileKind: impact.projectileKind,
        ammoType: impact.ammoType,
      })),
    ...state.airEvents
      .filter((event) => visibleAirEvent(event, friendlyIds, visibleEnemyIds))
      .map((event) => ({
        id: event.id,
        kind: event.kind,
        controllerId: friendlyIds.has(event.controllerId) || visibleEnemyIds.has(event.controllerId) ? event.controllerId : undefined,
        squadronId: event.squadronId,
        targetId: event.targetId && (friendlyIds.has(event.targetId) || visibleEnemyIds.has(event.targetId)) ? event.targetId : undefined,
        position: event.position ? cloneVec(event.position) : undefined,
      })),
  ];

  return {
    controlledShipId,
    serverTick,
    lastProcessedInputSequence,
    time: state.time,
    self: cloneSelf(self),
    friendlies: observation.friendlies.map((ship) => ({
      id: ship.id,
      shipClassId: ship.shipClassId,
      position: cloneVec(ship.position),
      heading: ship.heading,
      speedKnots: ship.speedKnots,
      hullRatio: ship.hullRatio,
    })),
    contacts,
    projectiles,
    torpedoes,
    aircraft,
    objective: {
      center: cloneVec(observation.objective.center),
      radius: observation.objective.radius,
      captureProgress: observation.objective.captureProgress,
      owner: observation.objective.owner,
      capturingTeam: observation.objective.capturingTeam,
      contested: observation.objective.contested,
      scores: { ...observation.objective.scores },
    },
    events,
  };
}
