import { DEPTH_CHARGE } from "./config";
import { AIR_SQUADRON_LOADOUT, AIR_OPERATION_TIMING, createAirSquadronState } from "./airOperations";
import { airSquadronTargetAltitude } from "./airFlightModel";
import { createDeveloperShipState } from "./simulation";
import { MAIN_GUNS } from "../ships/components";
import type { MainGunId } from "../ships/components";
import { getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import { getTorpedo } from "../ships/torpedoes";
import type { TorpedoId } from "../ships/torpedoes";
import type { SecondaryGunId } from "../ships/secondaryGuns";
import type {
  AircraftRole,
  AirMissionOrder,
  AirSquadronState,
  BattleState,
  DeveloperShipOverrides,
  ShipState,
  Team,
  Vec3,
} from "./types";

export const DEFAULT_DEVELOPER_OVERRIDES: DeveloperShipOverrides = {
  enabled: true,
  unrestrictedWeapons: true,
  infiniteAmmunition: true,
  instantReload: true,
  speedMultiplier: 1,
};

export interface DeveloperLoadout {
  shipClassId: ShipClassId;
  mainBatteryClassId: ShipClassId;
  mainGunId: MainGunId;
  mainGunMounts: number;
  torpedoId: TorpedoId;
  torpedoLauncherMounts: number;
  secondaryGunId: SecondaryGunId;
  secondaryGunMounts: number;
  depthChargeMounts: number;
  antiAirMounts: number;
}

const finitePoint = (point: Readonly<Vec3>): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);

function nextActorId(state: BattleState, prefix: string): string {
  const used = new Set([
    ...state.ships.map(({ id }) => id),
    ...state.airSquadrons.map(({ id }) => id),
    ...state.underwaterTargets.map(({ id }) => id),
  ]);
  let id = "";
  do id = `${prefix}-${state.nextEntityId++}`;
  while (used.has(id));
  return id;
}

function defaultSpawnPoint(state: BattleState, team: Team, sequence: number): Vec3 {
  const player = state.ships.find(({ id }) => id === "player");
  const side = team === "player" ? -1 : 1;
  return {
    x: (player?.position.x ?? 0) + side * (360 + sequence % 5 * 95),
    y: 0,
    z: (player?.position.z ?? 0) + 520 + sequence % 4 * 140,
  };
}

export function enableDeveloperMode(ship: ShipState, enabled: boolean): void {
  ship.developer = {
    ...DEFAULT_DEVELOPER_OVERRIDES,
    ...ship.developer,
    enabled,
  };
}

export function reconfigureDeveloperShip(
  state: BattleState,
  shipId: string,
  loadout: Readonly<DeveloperLoadout>,
): ShipState | undefined {
  const index = state.ships.findIndex(({ id }) => id === shipId);
  const current = state.ships[index];
  if (!current) return undefined;
  const overrides: DeveloperShipOverrides = {
    ...DEFAULT_DEVELOPER_OVERRIDES,
    ...current.developer,
    enabled: true,
    mainBatteryClassId: loadout.mainBatteryClassId,
  };
  const replacement = createDeveloperShipState({
    id: current.id,
    team: current.team,
    shipClassId: loadout.shipClassId,
    position: current.position,
    heading: current.heading,
    mainGunId: loadout.mainGunId,
    torpedoId: loadout.torpedoId,
    mainGunMounts: Math.max(1, Math.min(8, Math.floor(loadout.mainGunMounts))),
    torpedoLauncherMounts: Math.max(0, Math.min(8, Math.floor(loadout.torpedoLauncherMounts))),
    depthChargeMounts: Math.max(0, Math.min(8, Math.floor(loadout.depthChargeMounts))),
    antiAirMounts: Math.max(0, Math.min(16, Math.floor(loadout.antiAirMounts))),
    secondaryGunIds: Array.from(
      { length: Math.max(0, Math.min(12, Math.floor(loadout.secondaryGunMounts))) },
      () => loadout.secondaryGunId,
    ),
    performance: { ...current.performance },
    developer: overrides,
    developerSpawned: current.developerSpawned,
    aiControlled: current.aiControlled,
    countsForVictory: current.countsForVictory,
  });
  replacement.speedKnots = current.speedKnots;
  replacement.throttle = current.throttle;
  replacement.rudder = current.rudder;
  replacement.rudderCommand = current.rudderCommand;
  state.ships[index] = replacement;
  state.sensorSnapshots = {};
  return replacement;
}

export function spawnDeveloperShip(
  state: BattleState,
  team: Team,
  shipClassId: ShipClassId,
  position?: Readonly<Vec3>,
): ShipState | undefined {
  const sequence = state.nextEntityId;
  const spawn = position ? { ...position } : defaultSpawnPoint(state, team, sequence);
  if (!finitePoint(spawn)) return undefined;
  const definition = getShipClass(shipClassId);
  const id = nextActorId(state, `dev-ship-${team}`);
  const ship = createDeveloperShipState({
    id,
    team,
    shipClassId,
    position: spawn,
    heading: team === "player" ? 0 : Math.PI,
    mainGunMounts: definition.starterSlots.mainGun,
    torpedoLauncherMounts: definition.starterSlots.torpedo,
    depthChargeMounts: definition.starterSlots.depthCharge,
    antiAirMounts: definition.starterSlots.antiAir,
    developerSpawned: true,
    aiControlled: true,
    countsForVictory: false,
  });
  state.ships.push(ship);
  state.sensorSnapshots = {};
  return ship;
}

export function spawnDeveloperAirSquadron(
  state: BattleState,
  team: Team,
  role: AircraftRole,
  aircraftCapacity = 5,
): AirSquadronState | undefined {
  const controller = state.ships.find((ship) => ship.team === team && ship.hull > 0);
  if (!controller) return undefined;
  const id = nextActorId(state, `dev-air-${team}-${role}`);
  const position = defaultSpawnPoint(state, team, state.nextEntityId);
  position.y = airSquadronTargetAltitude(role, "patrolling", id, state.time);
  const squadron = createAirSquadronState({
    id,
    controllerId: controller.id,
    team,
    role,
    recoverySource: { kind: "mapEdge", position: { ...position } },
    position,
    heading: team === "player" ? 0 : Math.PI,
    aircraftCapacity: Math.max(1, Math.min(12, Math.floor(aircraftCapacity))),
    now: state.time,
  });
  squadron.phase = "patrolling";
  squadron.phaseStartedAt = state.time;
  squadron.order = {
    squadronId: squadron.id,
    kind: "patrolArea",
    area: { center: { ...position }, radius: 420 },
    issuedAt: state.time,
  };
  if (team === "enemy") {
    squadron.contactsByTeam.player = {
      observedAt: state.time,
      lastKnownPosition: { ...position },
      confidence: 1,
      observedRole: role,
      observedHeading: squadron.heading,
      estimatedAircraft: squadron.aircraftOperational,
    };
  }
  state.airSquadrons.push(squadron);
  return squadron;
}

function removeTargetFromOrder(order: AirMissionOrder | undefined, id: string): AirMissionOrder | undefined {
  if (!order) return undefined;
  const targetIds = order.targetIds?.filter((targetId) => targetId !== id);
  const candidateTargetIds = order.candidateTargetIds?.filter((targetId) => targetId !== id);
  const copy = { ...order, targetIds, candidateTargetIds };
  if (copy.targetId === id) copy.targetId = targetIds?.[0] ?? candidateTargetIds?.[0];
  if (copy.activeTargetId === id) copy.activeTargetId = copy.targetId;
  for (const key of ["lastKnownPositions", "lastKnownHeadings", "lastKnownSpeedsKnots"] as const) {
    const values = copy[key];
    if (values && id in values) {
      const next = { ...values };
      delete next[id];
      (copy as unknown as Record<string, unknown>)[key] = next;
    }
  }
  return copy;
}

export function removeDeveloperEntity(state: BattleState, id: string): boolean {
  if (id === "player") return false;
  const ship = state.ships.find((candidate) => candidate.id === id);
  const air = state.airSquadrons.find((candidate) => candidate.id === id);
  if (!ship && !air) return false;
  const removedIds = new Set<string>([id]);
  if (ship) {
    for (const squadron of state.airSquadrons) {
      if (squadron.controllerId === id) removedIds.add(squadron.id);
    }
    state.ships = state.ships.filter((candidate) => candidate.id !== id);
    state.airSquadrons = state.airSquadrons.filter((squadron) => !removedIds.has(squadron.id));
  } else {
    state.airSquadrons = state.airSquadrons.filter((squadron) => squadron.id !== id);
  }
  for (const candidate of state.ships) {
    if (candidate.secondaryTargetId && removedIds.has(candidate.secondaryTargetId)) {
      candidate.secondaryTargetId = undefined;
      candidate.secondaryAcquisitionSamples = 0;
      candidate.secondaryLastObservationAt = undefined;
    }
  }
  for (const squadron of state.airSquadrons) {
    for (const removedId of removedIds) {
      squadron.order = removeTargetFromOrder(squadron.order, removedId);
      squadron.resumeOrder = removeTargetFromOrder(squadron.resumeOrder, removedId);
    }
  }
  state.projectiles = state.projectiles.filter(({ ownerId }) => !removedIds.has(ownerId));
  state.depthCharges = state.depthCharges.filter(({ ownerId }) => !removedIds.has(ownerId));
  state.smokeClouds = state.smokeClouds.filter(({ ownerId }) => !removedIds.has(ownerId));
  state.shots = state.shots.filter(({ ownerId }) => !removedIds.has(ownerId));
  state.impacts = state.impacts.filter(({ sourceId, targetId }) =>
    (sourceId === undefined || !removedIds.has(sourceId))
      && (targetId === undefined || !removedIds.has(targetId)),
  );
  state.airEvents = state.airEvents.filter(({ squadronId, targetId }) =>
    !removedIds.has(squadronId) && (targetId === undefined || !removedIds.has(targetId)),
  );
  state.collisionCooldowns = Object.fromEntries(
    Object.entries(state.collisionCooldowns).filter(([key]) =>
      !key.split(":").some((actorId) => removedIds.has(actorId)),
    ),
  );
  state.sensorSnapshots = {};
  return true;
}

export function clearDeveloperEntities(state: BattleState): string[] {
  const ids = [
    ...state.ships.filter(({ developerSpawned }) => developerSpawned).map(({ id }) => id),
    ...state.airSquadrons.filter(({ id }) => id.startsWith("dev-air-")).map(({ id }) => id),
  ];
  ids.forEach((id) => removeDeveloperEntity(state, id));
  return ids;
}

export function refillDeveloperWeapons(ship: ShipState): void {
  ship.reloadRemaining = 0;
  ship.pendingAmmoType = undefined;
  for (const mount of ship.mainBatteryMounts) mount.reloadRemaining = 0;
  for (const mount of ship.secondaryMounts) mount.reloadRemaining = 0;
  ship.torpedoesLoaded = 2;
  ship.torpedoReserveSalvos = Math.max(ship.torpedoReserveSalvos, getTorpedo(ship.torpedoId).reserveSalvos);
  ship.torpedoReloadRemaining = 0;
  ship.depthChargeSalvos = Math.max(ship.depthChargeSalvos, DEPTH_CHARGE.salvos);
  ship.depthChargeReloadRemaining = 0;
}

export function refillDeveloperAircraft(state: BattleState, team: Team): void {
  for (const squadron of state.airSquadrons.filter((candidate) => candidate.team === team)) {
    squadron.ammoRemaining = AIR_SQUADRON_LOADOUT.ammo[squadron.role];
    squadron.ordnanceRemaining = AIR_SQUADRON_LOADOUT.ordnance[squadron.role];
    squadron.fuelRemainingSeconds = AIR_OPERATION_TIMING.enduranceSeconds[squadron.role];
  }
}

export const developerMainGunOptions = Object.values(MAIN_GUNS);
