import { describe, expect, it } from "vitest";
import { terrainNavigationAt, shipDraftMeters } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { BATTLE_SPAWN } from "../src/sim/config";
import {
  buildDawnAtollBattleScenario,
  buildAtollBattleScenario,
} from "../src/sim/scenarios";
import { createInitialState } from "../src/sim/simulation";
import { deployFleetAirSupport } from "../src/sim/airOperations";
import type { InstalledEquipmentIds } from "../src/sim/types";

function installedEquipment(overrides: Partial<InstalledEquipmentIds> = {}): InstalledEquipmentIds {
  return {
    mainGun: ["mainGun-common", null, null, null, null],
    torpedo: ["torpedo-common", null],
    antiAir: ["antiAir-common", null, null, null, null, null],
    sideGun: [],
    depthCharge: ["depthCharge-common", null],
    magazine: ["magazine-common"],
    engine: ["engine-common"],
    steering: ["steering-common"],
    ...overrides,
  };
}

describe("Dawn Atoll 3v3 scenario", () => {
  it("builds mixed three-ship fleets around the selected player class", () => {
    for (const playerClassId of ["fletcher", "cleveland", "yamato"] as const) {
      const scenario = buildDawnAtollBattleScenario(playerClassId);
      expect(scenario.ships).toHaveLength(6);
      expect(new Set(scenario.ships.map(({ id }) => id)).size).toBe(6);
      for (const team of ["player", "enemy"] as const) {
        const fleet = scenario.ships.filter((slot) => slot.team === team);
        expect(fleet).toHaveLength(3);
        expect(new Set(fleet.map(({ shipClassId }) => getShipClass(shipClassId).hullId)))
          .toEqual(new Set(["destroyer", "lightCruiser", "battleship"]));
      }
    }
  });

  it("keeps every spawn stopped, navigable and safely separated", () => {
    const state = createInitialState(91, "battle", undefined, undefined, undefined, "yamato");
    expect(state.ships).toHaveLength(6);
    expect(state.ships.every((ship) => ship.speedKnots === 0 && ship.throttle === 0)).toBe(true);
    for (const ship of state.ships) {
      expect(terrainNavigationAt(
        state.mapId,
        ship.position.x,
        ship.position.z,
        shipDraftMeters(ship.shipClassId),
      ).kind).toBe("deep");
    }
    const friendlies = state.ships.filter(({ team }) => team === "player");
    const enemies = state.ships.filter(({ team }) => team === "enemy");
    const crossFleetRanges = friendlies.flatMap((friendly) => enemies.map((enemy) =>
      Math.hypot(enemy.position.x - friendly.position.x, enemy.position.z - friendly.position.z),
    ));
    expect(Math.min(...crossFleetRanges)).toBeGreaterThanOrEqual(BATTLE_SPAWN.minimumSeparationMeters);
  });

  it("keeps sea trials isolated while normal battle accepts fleet aviation", () => {
    const trial = createInitialState(92, "sea-trials");
    expect(trial.mapId).toBe("open-sea-range");
    expect(trial.ships.filter(({ isTestTarget }) => !isTestTarget)).toHaveLength(1);
    expect(trial.ships.some(({ aiControlled }) => aiControlled)).toBe(false);

    const battle = createInitialState(93, "battle");
    expect(battle.ships.filter(({ team }) => team === "player")).toHaveLength(3);
    expect(battle.ships.filter(({ team }) => team === "enemy")).toHaveLength(3);
    expect(battle.ships.filter(({ aiControlled }) => aiControlled)).toHaveLength(5);
    deployFleetAirSupport(battle);
    expect(new Set(battle.airSquadrons.map(({ team }) => team)))
      .toEqual(new Set(["player", "enemy"]));
    expect(battle.airSquadrons.every(({ controllerId }) =>
      battle.ships.some(({ id }) => id === controllerId))).toBe(true);
  });

  it("supports explicit two-human allied builds without regressing equivalent single-player inputs", () => {
    const singlePlayer = buildAtollBattleScenario({
      playerShipClassId: "fletcher",
      teamSize: 3,
      seed: 77,
    });
    const equivalentSinglePlayer = buildAtollBattleScenario({
      playerShipClassId: "fletcher",
      teamSize: 3,
      seed: 77,
      humanPlayers: [{
        peerId: "peer-host-1",
        shipClassId: "fletcher",
        installedEquipment: installedEquipment(),
      }],
    });

    expect(equivalentSinglePlayer).toEqual(singlePlayer);

    const coop = buildAtollBattleScenario({
      playerShipClassId: "fletcher",
      teamSize: 1,
      seed: 78,
      humanPlayers: [
        {
          peerId: "peer-host-1",
          shipClassId: "fletcher",
          installedEquipment: installedEquipment(),
        },
        {
          peerId: "peer-guest-1",
          shipClassId: "cleveland",
          installedEquipment: installedEquipment({
            mainGun: ["mainGun-common", "mainGun-common", "mainGun-common", "mainGun-common"],
            torpedo: [],
            antiAir: ["antiAir-common", "antiAir-common", null, null, null, null],
            sideGun: ["sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common", "sideGun-common"],
            depthCharge: [],
          }),
        },
      ],
    });

    const alliedHumans = coop.ships.filter((slot) => slot.team === "player" && slot.playerControlled);
    const alliedAi = coop.ships.filter((slot) => slot.team === "player" && !slot.playerControlled);

    expect(coop.ships.filter((slot) => slot.team === "player")).toHaveLength(3);
    expect(alliedHumans).toHaveLength(2);
    expect(new Set(alliedHumans.map((slot) => slot.id)).size).toBe(2);
    expect(new Set(alliedHumans.map((slot) => slot.shipClassId))).toEqual(new Set(["fletcher", "cleveland"]));
    expect(alliedHumans.every((slot) => slot.aiControlled === false)).toBe(true);
    expect(alliedAi.every((slot) => slot.aiControlled === true)).toBe(true);
  });
});
