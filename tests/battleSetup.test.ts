import { describe, expect, it } from "vitest";
import { terrainNavigationAt, shipDraftMeters } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import {
  FLEET_SIZES,
  compositionTotal,
  fleetCompositionForSize,
} from "../src/sim/battleSetup";
import { BATTLE_SPAWN } from "../src/sim/config";
import { buildAtollBattleScenario } from "../src/sim/scenarios";

describe("single-player fleet setup", () => {
  it("builds symmetric historical surface fleets for every supported size", () => {
    for (const teamSize of FLEET_SIZES) {
      const composition = fleetCompositionForSize(teamSize, "cleveland");
      expect(compositionTotal(composition)).toBe(teamSize);
      const scenario = buildAtollBattleScenario({
        playerShipClassId: "cleveland",
        teamSize,
        seed: 91,
      });
      expect(scenario.ships).toHaveLength(teamSize * 2);
      expect(new Set(scenario.ships.map(({ id }) => id)).size).toBe(teamSize * 2);
      const hullCounts = (team: "player" | "enemy") => Object.fromEntries(
        ["destroyer", "lightCruiser", "battleship"].map((hullId) => [
          hullId,
          scenario.ships.filter((slot) =>
            slot.team === team && getShipClass(slot.shipClassId).hullId === hullId).length,
        ]),
      );
      expect(hullCounts("player")).toEqual(hullCounts("enemy"));
      expect(scenario.ships.filter(({ playerControlled }) => playerControlled)).toHaveLength(1);
    }
  });

  it("keeps the largest low-GPU formation in deep water and fleets five kilometres apart", () => {
    const scenario = buildAtollBattleScenario({
      playerShipClassId: "fletcher",
      teamSize: 7,
      seed: 12,
    });
    for (const slot of scenario.ships) {
      expect(terrainNavigationAt(
        scenario.mapId,
        slot.position.x,
        slot.position.z,
        shipDraftMeters(slot.shipClassId),
      ).kind).toBe("deep");
    }
    const friendlies = scenario.ships.filter(({ team }) => team === "player");
    const enemies = scenario.ships.filter(({ team }) => team === "enemy");
    const minimum = Math.min(...friendlies.flatMap((friendly) => enemies.map((enemy) =>
      Math.hypot(enemy.position.x - friendly.position.x, enemy.position.z - friendly.position.z))));
    expect(minimum).toBeGreaterThanOrEqual(BATTLE_SPAWN.minimumSeparationMeters);
    expect(scenario.airSupport).toBe("fleet-edge");
  });
});
