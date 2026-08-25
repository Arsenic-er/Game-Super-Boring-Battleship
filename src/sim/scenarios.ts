import { BATTLE_SPAWN } from "./config";
import type { BattleMapId } from "../maps/atollMap";
import { SHIP_CLASS_IDS, getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import type { HullId } from "../ships/hulls";
import {
  fleetCompositionForSize,
  fleetHullRoster,
  type FleetSize,
} from "./battleSetup";
import type { InstalledEquipmentIds, Team, Vec3 } from "./types";

export type ScenarioFleetRole = "flagship" | "screen" | "escort" | "line";

export interface ScenarioHumanPlayerDescriptor {
  peerId: string;
  shipClassId: ShipClassId;
  installedEquipment: InstalledEquipmentIds;
}

export interface ScenarioShipSlot {
  id: string;
  team: Team;
  role: ScenarioFleetRole;
  shipClassId: ShipClassId;
  position: Vec3;
  heading: number;
  playerControlled: boolean;
  aiControlled: boolean;
  countsForVictory: boolean;
  humanPeerId?: string;
  installedEquipment?: InstalledEquipmentIds;
}

export interface BattleScenarioDescriptor {
  id: string;
  mapId: BattleMapId;
  airSupport: "none" | "fleet-edge";
  ships: readonly ScenarioShipSlot[];
}

export interface AtollBattleScenarioOptions {
  playerShipClassId: ShipClassId;
  teamSize: FleetSize;
  seed?: number;
  humanPlayers?: readonly ScenarioHumanPlayerDescriptor[];
}

const SUPPORTED_FLEET_SIZES: readonly FleetSize[] = [1, 3, 5, 7];
const point = (x: number, z: number): Vec3 => ({ x, y: 0, z });
const roleForHull = (hullId: HullId): ScenarioFleetRole =>
  hullId === "destroyer" ? "screen" : hullId === "lightCruiser" ? "escort" : "line";
const classesByHull = (hullId: HullId): ShipClassId[] =>
  SHIP_CLASS_IDS.filter((id) => getShipClass(id).hullId === hullId);

function deterministicClass(hullId: HullId, index: number, seed: number, enemy: boolean): ShipClassId {
  const pool = classesByHull(hullId);
  const offset = Math.abs(seed + index * 3 + (enemy ? 2 : 0)) % pool.length;
  return pool[offset] ?? pool[0]!;
}

function cloneInstalledEquipment(installedEquipment: InstalledEquipmentIds): InstalledEquipmentIds {
  return {
    mainGun: [...installedEquipment.mainGun],
    torpedo: [...installedEquipment.torpedo],
    antiAir: [...installedEquipment.antiAir],
    sideGun: [...installedEquipment.sideGun],
    depthCharge: [...installedEquipment.depthCharge],
    magazine: [...installedEquipment.magazine],
    engine: [...installedEquipment.engine],
    steering: [...installedEquipment.steering],
  };
}

function alliedClassRoster(teamSize: FleetSize, playerShipClassId: ShipClassId, seed: number): ShipClassId[] {
  const hulls = fleetHullRoster(teamSize, playerShipClassId);
  const playerHull = getShipClass(playerShipClassId).hullId;
  const playerHullIndex = hulls.indexOf(playerHull);
  if (playerHullIndex >= 0) hulls.splice(playerHullIndex, 1);
  return [playerShipClassId, ...hulls.map((hullId, index) =>
    deterministicClass(hullId, index, seed, false))];
}

function enemyClassRoster(teamSize: FleetSize, playerShipClassId: ShipClassId, seed: number): ShipClassId[] {
  return fleetHullRoster(teamSize, playerShipClassId)
    .map((hullId, index) => deterministicClass(hullId, index, seed, true));
}

function friendlyPosition(index: number): Vec3 {
  if (index === 0) return point(BATTLE_SPAWN.player.x, BATTLE_SPAWN.player.z);
  const lane = Math.ceil(index / 2) * 360 * (index % 2 === 1 ? -1 : 1);
  return point(lane, BATTLE_SPAWN.player.z - 260 - Math.floor((index - 1) / 2) * 170);
}

function enemyPosition(index: number): Vec3 {
  const laneIndex = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 === 1 ? -1 : 1);
  return point(BATTLE_SPAWN.enemy.x + laneIndex * 360, BATTLE_SPAWN.enemy.z + Math.floor(index / 2) * 170);
}

function effectiveTeamSize(options: AtollBattleScenarioOptions): FleetSize {
  const humans = options.humanPlayers?.length ?? 0;
  if (humans <= 1) return options.teamSize;
  const minimum = Math.max(options.teamSize, humans);
  return SUPPORTED_FLEET_SIZES.find((size) => size >= minimum) ?? 7;
}

function buildSinglePlayerScenario(options: AtollBattleScenarioOptions): BattleScenarioDescriptor {
  const seed = options.seed ?? 0;
  const friendlyClasses = alliedClassRoster(options.teamSize, options.playerShipClassId, seed);
  const enemyClasses = enemyClassRoster(options.teamSize, options.playerShipClassId, seed);
  const composition = fleetCompositionForSize(options.teamSize, options.playerShipClassId);
  const friendlyShips: ScenarioShipSlot[] = friendlyClasses.map((shipClassId, index) => ({
    id: index === 0 ? "player" : `ally-${getShipClass(shipClassId).hullId}-${index}`,
    team: "player",
    role: index === 0 ? "flagship" : roleForHull(getShipClass(shipClassId).hullId),
    shipClassId,
    position: friendlyPosition(index),
    heading: 0,
    playerControlled: index === 0,
    aiControlled: index !== 0,
    countsForVictory: true,
  }));
  const enemyShips: ScenarioShipSlot[] = enemyClasses.map((shipClassId, index) => ({
    id: index === 0 ? "enemy" : `enemy-${getShipClass(shipClassId).hullId}-${index}`,
    team: "enemy",
    role: roleForHull(getShipClass(shipClassId).hullId),
    shipClassId,
    position: enemyPosition(index),
    heading: Math.PI,
    playerControlled: false,
    aiControlled: true,
    countsForVictory: true,
  }));
  return {
    id: `dawn-atoll-${options.teamSize}v${options.teamSize}`,
    mapId: "atoll-prototype",
    airSupport: composition.airSupport > 0 ? "fleet-edge" : "none",
    ships: [...friendlyShips, ...enemyShips],
  };
}

export function buildAtollBattleScenario(
  options: AtollBattleScenarioOptions,
): BattleScenarioDescriptor {
  if (!options.humanPlayers || options.humanPlayers.length <= 1) {
    return buildSinglePlayerScenario(options);
  }

  const teamSize = effectiveTeamSize(options);
  const seed = options.seed ?? 0;
  const primaryClassId = options.humanPlayers[0]!.shipClassId;
  const friendlyClasses = alliedClassRoster(teamSize, primaryClassId, seed);
  const enemyClasses = enemyClassRoster(teamSize, primaryClassId, seed);
  const composition = fleetCompositionForSize(teamSize, primaryClassId);
  const friendlyShips: ScenarioShipSlot[] = friendlyClasses.map((defaultClassId, index) => {
    const human = options.humanPlayers?.[index];
    const shipClassId = human?.shipClassId ?? defaultClassId;
    return {
      id: index === 0 ? "player" : `ally-${getShipClass(shipClassId).hullId}-${index}`,
      team: "player",
      role: index === 0 ? "flagship" : roleForHull(getShipClass(shipClassId).hullId),
      shipClassId,
      position: friendlyPosition(index),
      heading: 0,
      playerControlled: Boolean(human),
      aiControlled: !human,
      countsForVictory: true,
      ...(human ? {
        humanPeerId: human.peerId,
        installedEquipment: cloneInstalledEquipment(human.installedEquipment),
      } : {}),
    };
  });
  const enemyShips: ScenarioShipSlot[] = enemyClasses.map((shipClassId, index) => ({
    id: index === 0 ? "enemy" : `enemy-${getShipClass(shipClassId).hullId}-${index}`,
    team: "enemy",
    role: roleForHull(getShipClass(shipClassId).hullId),
    shipClassId,
    position: enemyPosition(index),
    heading: Math.PI,
    playerControlled: false,
    aiControlled: true,
    countsForVictory: true,
  }));
  return {
    id: `dawn-atoll-${teamSize}v${teamSize}`,
    mapId: "atoll-prototype",
    airSupport: composition.airSupport > 0 ? "fleet-edge" : "none",
    ships: [...friendlyShips, ...enemyShips],
  };
}

/** Backward-compatible default used by existing callers and balance fixtures. */
export function buildDawnAtollBattleScenario(
  playerShipClassId: ShipClassId,
): BattleScenarioDescriptor {
  return buildAtollBattleScenario({ playerShipClassId, teamSize: 3, seed: 0 });
}
