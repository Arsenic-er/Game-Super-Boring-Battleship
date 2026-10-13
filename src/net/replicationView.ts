import { isProjectileVisibleToPlayer } from "../sim/playerPerception";
import { AIR_CONTACT_VALID_SECONDS, observe } from "../sim/simulation";
import type {
  AirContactSnapshot,
  AirSquadronState,
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

function authorizedAirContact(squadron: Readonly<AirSquadronState>, team: ShipState["team"],
  time: number): Readonly<AirContactSnapshot> | undefined {
  const contact = squadron.contactsByTeam[team];
  if (!contact || !Number.isFinite(time) || !Number.isFinite(contact.observedAt)
    || contact.observedAt < 0 || contact.observedAt > time
    || time - contact.observedAt > AIR_CONTACT_VALID_SECONDS
    || !Number.isFinite(contact.confidence) || contact.confidence <= 0
    || ![contact.lastKnownPosition.x, contact.lastKnownPosition.y, contact.lastKnownPosition.z,
      contact.observedHeading, contact.estimatedAircraft].every(value => Number.isFinite(value))
    || contact.estimatedAircraft! < 0
    || !["fighter", "diveBomber", "torpedoBomber"].includes(contact.observedRole ?? "")) return undefined;
  // Missing old-schema metadata must not fall back to hidden live aircraft state.
  return contact;
}

function cloneAirFlight(squadron: Readonly<AirSquadronState>): Record<string, unknown> {
  return squadron.flight ? { flight: {
    speedMetersPerSecond: squadron.flight.speedMetersPerSecond,
    pitch: squadron.flight.pitch, bank: squadron.flight.bank,
  } } : {};
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
  const friendlyAirIds = new Set(state.airSquadrons.filter(air => air.team === self.team).map(air => air.id));
  const liveEnemyAirIds = new Set<string>();
  // LAN is always viewer-scoped, including developer/sea-trials sessions.
  // A visible controller or a nearby unobserved aircraft grants no optical authority.
  const aircraft = state.airSquadrons.flatMap((squadron): Record<string, unknown>[] => {
    if (squadron.team === self.team) return [{
      id: squadron.id, controllerId: squadron.controllerId, team: squadron.team,
      role: squadron.role, phase: squadron.phase, position: cloneVec(squadron.position),
      heading: squadron.heading, ...cloneAirFlight(squadron), aircraftOperational: squadron.aircraftOperational,
    }];
    const contact = authorizedAirContact(squadron, self.team, state.time);
    if (!contact) return [];
    const live = state.time - contact.observedAt <= 1e-6;
    if (live) liveEnemyAirIds.add(squadron.id);
    // Up to five seconds of stale contact means a frozen observed marker, not
    // five seconds of hidden live pose, count, role or flight telemetry.
    return [{
      id: squadron.id,
      ...(visibleEnemyIds.has(squadron.controllerId) ? { controllerId: squadron.controllerId } : {}),
      team: squadron.team, role: contact.observedRole,
      contact: {
        observedAt: contact.observedAt, confidence: contact.confidence,
        lastKnownPosition: cloneVec(contact.lastKnownPosition),
        observedRole: contact.observedRole, observedHeading: contact.observedHeading,
        estimatedAircraft: contact.estimatedAircraft,
      },
      phase: live ? squadron.phase : "patrolling",
      position: cloneVec(contact.lastKnownPosition), heading: contact.observedHeading,
      ...(live ? cloneAirFlight(squadron) : {}),
      aircraftOperational: contact.estimatedAircraft,
    }];
  });
  const visibleTargetIds = new Set([...friendlyIds, ...friendlyAirIds, ...visibleEnemyIds, ...liveEnemyAirIds]);
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
    ...state.airEvents.flatMap((event) => {
      const friendlySource = event.team === self.team;
      // Enemy commands are private even when their aircraft or controller is seen.
      if (!friendlySource && (event.kind === "orderAccepted" || event.kind === "orderRejected")) return [];
      const sourceVisible = friendlySource || liveEnemyAirIds.has(event.squadronId);
      const targetVisible = Boolean(event.targetId && visibleTargetIds.has(event.targetId));
      const impact = event.kind === "attackHit" || event.kind === "attackMiss";
      if (!sourceVisible && !(impact && targetVisible)) return [];
      // Release/loss/phase events locate their source; hit/miss events locate an
      // impact. Being the target must never reveal an unseen attacker's position.
      const positionVisible = impact
        ? targetVisible || Boolean(event.position && distanceTo(event.position, self.position) <= VISUAL_EVENT_RANGE_METERS)
        : sourceVisible;
      return [{
        id: event.id, time: event.time, kind: event.kind, team: event.team,
        ...(sourceVisible ? { squadronId: event.squadronId } : {}),
        ...(sourceVisible && (friendlySource || visibleEnemyIds.has(event.controllerId))
          ? { controllerId: event.controllerId } : {}),
        ...(targetVisible && event.targetId ? { targetId: event.targetId } : {}),
        ...(event.position && positionVisible ? { position: cloneVec(event.position) } : {}),
        ...(friendlySource ? { orderKind: event.orderKind, rejectReason: event.rejectReason } : {}),
        weapon: event.weapon,
        ...(friendlySource || targetVisible ? { damage: event.damage } : {}),
        ...(sourceVisible ? { aircraftLost: event.aircraftLost, lossCause: event.lossCause } : {}),
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
