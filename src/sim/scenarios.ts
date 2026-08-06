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
import type { Team, Vec3 } from "./types";

export type ScenarioFleetRole = "flagship" | "screen" | "escort" | "line";

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
}

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

function alliedClassRoster(options: AtollBattleScenarioOptions): ShipClassId[] {
  const hulls = fleetHullRoster(options.teamSize, options.playerShipClassId);
  const playerHull = getShipClass(options.playerShipClassId).hullId;
  const playerHullIndex = hulls.indexOf(playerHull);
  if (playerHullIndex >= 0) hulls.splice(playerHullIndex, 1);
  return [options.playerShipClassId, ...hulls.map((hullId, index) =>
    deterministicClass(hullId, index, options.seed ?? 0, false))];
}

function enemyClassRoster(options: AtollBattleScenarioOptions): ShipClassId[] {
  return fleetHullRoster(options.teamSize, options.playerShipClassId)
    .map((hullId, index) => deterministicClass(hullId, index, options.seed ?? 0, true));
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

export function buildAtollBattleScenario(
  options: AtollBattleScenarioOptions,
): BattleScenarioDescriptor {
  const friendlyClasses = alliedClassRoster(options);
  const enemyClasses = enemyClassRoster(options);
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

/** Backward-compatible default used by existing callers and balance fixtures. */
export function buildDawnAtollBattleScenario(
  playerShipClassId: ShipClassId,
): BattleScenarioDescriptor {
  return buildAtollBattleScenario({ playerShipClassId, teamSize: 3, seed: 0 });
}
