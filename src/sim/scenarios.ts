import { BATTLE_SPAWN } from "./config";
import type { BattleMapId } from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import type { Team, Vec3 } from "./types";

export type ScenarioFleetRole = "flagship" | "screen" | "escort" | "line";

/** Declarative participant slot. Runtime factories remain in simulation.ts. */
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
  id: "dawn-atoll-3v3";
  mapId: BattleMapId;
  airSupport: "fleet-edge";
  ships: readonly ScenarioShipSlot[];
}

const point = (x: number, z: number): Vec3 => ({ x, y: 0, z });

function alliedComplements(playerClassId: ShipClassId): readonly [ShipClassId, ShipClassId] {
  const hullId = getShipClass(playerClassId).hullId;
  if (hullId === "destroyer") return ["cleveland", "north-carolina"];
  if (hullId === "lightCruiser") return ["fletcher", "north-carolina"];
  return ["fletcher", "cleveland"];
}

/**
 * Minimal mixed-fleet mission used by normal battle mode. Keeping its roster
 * and formation declarative makes future missions data changes, not rewrites.
 */
export function buildDawnAtollBattleScenario(
  playerClassId: ShipClassId,
): BattleScenarioDescriptor {
  const [friendlyScreen, friendlySupport] = alliedComplements(playerClassId);
  return {
    id: "dawn-atoll-3v3",
    mapId: "atoll-prototype",
    airSupport: "fleet-edge",
    ships: [
      {
        id: "player", team: "player", role: "flagship", shipClassId: playerClassId,
        position: point(BATTLE_SPAWN.player.x, BATTLE_SPAWN.player.z), heading: 0,
        playerControlled: true, aiControlled: false, countsForVictory: true,
      },
      {
        id: "enemy", team: "enemy", role: "screen", shipClassId: "kagero",
        position: point(BATTLE_SPAWN.enemy.x, BATTLE_SPAWN.enemy.z), heading: Math.PI,
        playerControlled: false, aiControlled: true, countsForVictory: true,
      },
      {
        id: "ally-screen", team: "player", role: "screen", shipClassId: friendlyScreen,
        position: point(-360, -2_650), heading: 0,
        playerControlled: false, aiControlled: true, countsForVictory: true,
      },
      {
        id: "ally-support", team: "player", role: "escort", shipClassId: friendlySupport,
        position: point(360, -2_700), heading: 0,
        playerControlled: false, aiControlled: true, countsForVictory: true,
      },
      {
        id: "enemy-line", team: "enemy", role: "line", shipClassId: "bismarck",
        position: point(540, 3_000), heading: Math.PI,
        playerControlled: false, aiControlled: true, countsForVictory: true,
      },
      {
        id: "enemy-escort", team: "enemy", role: "escort", shipClassId: "edinburgh",
        position: point(-180, 3_050), heading: Math.PI,
        playerControlled: false, aiControlled: true, countsForVictory: true,
      },
    ],
  };
}
