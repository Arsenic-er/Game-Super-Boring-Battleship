import { terrainBlocksLineOfSight } from "../maps/atollMap";
import { getShipClass } from "../ships/classes";
import type { BattleState, PlayerTargetView } from "./types";

/** Map-only training contacts; never supplements combat perception or AI targeting. */
export function seaTrialsContacts(
  state: Readonly<Pick<BattleState, "mode" | "mapId" | "time" | "ships">>,
  observerShipId = "player",
): PlayerTargetView[] {
  if (state.mode !== "sea-trials") return [];
  const friendlies = state.ships.filter(ship => ship.team === "player" && ship.hull > 0);
  const observer = friendlies.find(ship => ship.id === observerShipId)
    ?? friendlies.find(ship => ship.id === "player")
    ?? friendlies[0];
  if (!observer) return [];
  const observerHeight = getShipClass(observer.shipClassId).deckHeight + 12;
  return state.ships.flatMap((ship): PlayerTargetView[] => {
    if (ship.team !== "enemy" || ship.hull <= 0) return [];
    if (terrainBlocksLineOfSight(
      state.mapId, observer.position, ship.position,
      observerHeight, getShipClass(ship.shipClassId).deckHeight + 12,
    )) return [];
    return [{
      id: ship.id,
      team: ship.team,
      mode: "tracking",
      live: true,
      confidence: 1,
      lastObservedAt: state.time,
      position: { ...ship.position },
      heading: ship.heading,
      speedKnots: ship.speedKnots,
      rangeMeters: Math.hypot(
        ship.position.x - observer.position.x,
        ship.position.z - observer.position.z,
      ),
      estimatedHullRatio: Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull))),
    }];
  });
}
