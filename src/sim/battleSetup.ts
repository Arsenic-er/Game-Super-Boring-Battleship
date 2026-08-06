import { getShipClass } from "../ships/classes";
import type { ShipClassId } from "../ships/classes";
import type { HullId } from "../ships/hulls";
import type { WeatherId } from "./weather";

export type FleetSize = 1 | 3 | 5 | 7;

export interface FleetComposition {
  destroyer: number;
  lightCruiser: number;
  battleship: number;
  carrier: number;
  airSupport: number;
}

export interface BattleSetup {
  teamSize: FleetSize;
  weatherId: WeatherId;
}

export type GameLaunchRequest =
  | { mode: "battle"; buildId: string; teamSize: FleetSize; weatherId: WeatherId }
  | { mode: "sea-trials" };

export const FLEET_SIZES = [1, 3, 5, 7] as const satisfies readonly FleetSize[];

export function isFleetSize(value: unknown): value is FleetSize {
  return typeof value === "number" && (FLEET_SIZES as readonly number[]).includes(value);
}

export function fleetCompositionForSize(
  teamSize: FleetSize,
  playerShipClassId: ShipClassId,
): FleetComposition {
  const playerHull = getShipClass(playerShipClassId).hullId;
  if (teamSize === 1) {
    return {
      destroyer: playerHull === "destroyer" ? 1 : 0,
      lightCruiser: playerHull === "lightCruiser" ? 1 : 0,
      battleship: playerHull === "battleship" ? 1 : 0,
      carrier: 0,
      airSupport: 0,
    };
  }
  if (teamSize === 3) return { destroyer: 1, lightCruiser: 1, battleship: 1, carrier: 0, airSupport: 0 };
  if (teamSize === 5) return { destroyer: 2, lightCruiser: 2, battleship: 1, carrier: 0, airSupport: 0 };
  return { destroyer: 2, lightCruiser: 3, battleship: 2, carrier: 0, airSupport: 1 };
}

export function compositionTotal(composition: FleetComposition): number {
  return composition.destroyer + composition.lightCruiser + composition.battleship + composition.carrier;
}

export function fleetHullRoster(
  teamSize: FleetSize,
  playerShipClassId: ShipClassId,
): HullId[] {
  const composition = fleetCompositionForSize(teamSize, playerShipClassId);
  return [
    ...Array.from({ length: composition.destroyer }, () => "destroyer" as const),
    ...Array.from({ length: composition.lightCruiser }, () => "lightCruiser" as const),
    ...Array.from({ length: composition.battleship }, () => "battleship" as const),
  ];
}
