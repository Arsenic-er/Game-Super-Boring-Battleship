import { isProjectileVisibleToPlayer } from "../sim/playerPerception";
import { observe } from "../sim/simulation";
import type {
  AirCombatEvent,
  BattleState,
  ImpactEvent,
  PlayerTargetView,
  ProjectileState,
  SensorContact,
  ShipState,
  Vec3,
} from "../sim/types";
import type { PlayerSnapshotPayload } from "./protocol";

const VISUAL_EVENT_RANGE_METERS = 1_200;

const cloneVec = (value: Readonly<Vec3>): Vec3 => ({ ...value });
const distanceTo = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => Math.hypot(a.x - b.x, a.z - b.z);

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
    ...cloneVisibleLoadout(ship),
  };
}

function cloneVisibleLoadout(ship: Readonly<ShipState>): Record<string, unknown> {
  return {
    mainGunId: ship.mainGunId,
    torpedoId: ship.torpedoId,
    mainGunMounts: ship.mainGunMounts,
    torpedoLauncherMounts: ship.torpedoLauncherMounts,
    depthChargeMounts: ship.depthChargeMounts,
    antiAirMounts: ship.antiAirMounts,
    antiAirEfficiencyMultiplier: ship.antiAirEfficiencyMultiplier,
    installedEquipment: {
      mainGun: [...ship.installedEquipment.mainGun],
      torpedo: [...ship.installedEquipment.torpedo],
      antiAir: [...ship.installedEquipment.antiAir],
      sideGun: [...ship.installedEquipment.sideGun],
      depthCharge: [...ship.installedEquipment.depthCharge],
      magazine: [...ship.installedEquipment.magazine],
      engine: [...ship.installedEquipment.engine],
      steering: [...ship.installedEquipment.steering],
    },
    performance: { ...ship.performance },
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

function visibleImpact(
  impact: Readonly<ImpactEvent>,
  viewer: Readonly<ShipState>,
  friendlyIds: ReadonlySet<string>,
  visibleEnemyIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    (impact.targetId && friendlyIds.has(impact.targetId))
    || (impact.sourceId && visibleEnemyIds.has(impact.sourceId))
    || distanceTo(impact.position, viewer.position) <= VISUAL_EVENT_RANGE_METERS,
  );
}

function visibleAirEvent(
  event: Readonly<AirCombatEvent>,
  viewer: Readonly<ShipState>,
  friendlyIds: ReadonlySet<string>,
  visibleEnemyIds: ReadonlySet<string>,
): boolean {
  return friendlyIds.has(event.controllerId)
    || visibleEnemyIds.has(event.controllerId)
    || Boolean(event.targetId && (friendlyIds.has(event.targetId) || visibleEnemyIds.has(event.targetId)))
    || Boolean(event.position && distanceTo(event.position, viewer.position) <= VISUAL_EVENT_RANGE_METERS);
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
      ...(projectile.team === self.team || visibleEnemyIds.has(projectile.ownerId) ? { ownerId: projectile.ownerId } : {}),
      team: projectile.team,
      kind: projectile.kind,
      ammoType: projectile.ammoType,
      position: cloneVec(projectile.position),
      ...(projectile.team === self.team || visibleEnemyIds.has(projectile.ownerId)
        ? { previousPosition: cloneVec(projectile.previousPosition) }
        : {}),
      velocity: cloneVec(projectile.velocity),
      age: projectile.age,
    }));
  const torpedoes = state.projectiles
    .filter((projectile) => projectile.kind === "torpedo")
    .filter((projectile) => visibleProjectile(projectile, self, contactsById))
    .map((projectile) => ({
      id: projectile.id,
      ...(projectile.team === self.team || visibleEnemyIds.has(projectile.ownerId) ? { ownerId: projectile.ownerId } : {}),
      team: projectile.team,
      kind: projectile.kind,
      position: cloneVec(projectile.position),
      ...(projectile.team === self.team || visibleEnemyIds.has(projectile.ownerId)
        ? { previousPosition: cloneVec(projectile.previousPosition) }
        : {}),
      velocity: cloneVec(projectile.velocity),
      age: projectile.age,
      detectionRange: projectile.detectionRange,
    }));
  const aircraft = state.airSquadrons
    .filter((squadron) =>
      squadron.team === self.team
      || distanceTo(squadron.position, self.position) <= VISUAL_EVENT_RANGE_METERS
      || visibleEnemyIds.has(squadron.controllerId))
    .map((squadron) => {
      const sourceVisible = squadron.team === self.team || visibleEnemyIds.has(squadron.controllerId);
      return {
        ...(sourceVisible ? { id: squadron.id, controllerId: squadron.controllerId } : {}),
        team: squadron.team,
        role: squadron.role,
        phase: squadron.phase,
        position: cloneVec(squadron.position),
        heading: squadron.heading,
        ...(squadron.flight ? { flight: {
          speedMetersPerSecond: squadron.flight.speedMetersPerSecond,
          pitch: squadron.flight.pitch,
          bank: squadron.flight.bank,
        } } : {}),
        aircraftOperational: squadron.aircraftOperational,
      };
    });
  const events = [
    ...state.shots
      .filter((shot) => shot.team === self.team || visibleEnemyIds.has(shot.ownerId))
      .map((shot) => ({
        id: shot.id,
        kind: "shot",
        team: shot.team,
        ...(shot.team === self.team || visibleEnemyIds.has(shot.ownerId)
          ? { ownerId: shot.ownerId, position: cloneVec(shot.position) }
          : {}),
        projectileKind: shot.kind,
        ammoType: shot.ammoType,
        weaponSource: shot.weaponSource,
        airWeapon: shot.airWeapon,
      })),
    ...state.impacts
      .filter((impact) => visibleImpact(impact, self, friendlyIds, visibleEnemyIds))
      .map((impact) => ({
        id: impact.id,
        kind: impact.kind,
        position: cloneVec(impact.position),
        ...(impact.sourceId && (impact.sourceTeam === self.team || visibleEnemyIds.has(impact.sourceId))
          ? { sourceId: impact.sourceId }
          : {}),
        sourceTeam: impact.sourceTeam,
        ...(impact.targetId && (friendlyIds.has(impact.targetId) || visibleEnemyIds.has(impact.targetId))
          ? { targetId: impact.targetId }
          : {}),
        damage: impact.damage,
        projectileKind: impact.projectileKind,
        ammoType: impact.ammoType,
        weaponSource: impact.weaponSource,
        airWeapon: impact.airWeapon,
      })),
    ...state.airEvents
      .filter((event) => visibleAirEvent(event, self, friendlyIds, visibleEnemyIds))
      .flatMap((event) => {
        const sourceVisible = friendlyIds.has(event.controllerId) || visibleEnemyIds.has(event.controllerId);
        const targetVisible = Boolean(event.targetId && (friendlyIds.has(event.targetId) || visibleEnemyIds.has(event.targetId)));
        const positionVisible = Boolean(event.position && distanceTo(event.position, self.position) <= VISUAL_EVENT_RANGE_METERS);
        if (!sourceVisible && !targetVisible && !positionVisible) return [];
        return [{
          id: event.id,
          time: event.time,
          kind: event.kind,
          team: event.team,
          ...(sourceVisible ? { controllerId: event.controllerId, squadronId: event.squadronId } : {}),
          ...(targetVisible && event.targetId ? { targetId: event.targetId } : {}),
          ...(event.position && (sourceVisible || positionVisible || targetVisible)
            ? { position: cloneVec(event.position) }
            : {}),
          orderKind: event.orderKind,
          rejectReason: event.rejectReason,
          weapon: event.weapon,
          damage: event.damage,
          aircraftLost: event.aircraftLost,
          lossCause: event.lossCause,
        }];
      }),
  ];

  return {
    controlledShipId,
    serverTick,
    lastProcessedInputSequence,
    time: state.time,
    status: state.status,
    ...(state.endReason ? { endReason: state.endReason } : {}),
    self: cloneSelf(self),
    friendlies: observation.friendlies.flatMap((ship) => {
      const fullShip = state.ships.find(({ id }) => id === ship.id);
      if (!fullShip || fullShip.team !== self.team) return [];
      return [{
        id: ship.id,
        shipClassId: ship.shipClassId,
        position: cloneVec(ship.position),
        heading: ship.heading,
        speedKnots: ship.speedKnots,
        hullRatio: ship.hullRatio,
        ...cloneVisibleLoadout(fullShip),
      }];
    }),
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
