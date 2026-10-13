
import { describe, expect, it } from "vitest";
import { BATTLE_DURATION_SECONDS, FIXED_STEP } from "../src/sim/config";
import { fleetCalibrationStateHash, runFleetCalibration } from "./helpers/fleetCalibration";
import { prototypeSpawnSide } from "./helpers/fleetSmokeScenario";
import { prototypeSeedOffset } from "./helpers/objectiveSmokeMetrics";

const enabled = process.env.FLEET_AIR_CALIBRATION === "1";
const side = prototypeSpawnSide(process.env.PROTOTYPE_SPAWN_SIDE);
const offset = prototypeSeedOffset(process.env.PROTOTYPE_SEED_OFFSET);
const rawSwap = process.env.FLEET_CALIBRATION_LABEL_SWAP;
if (rawSwap !== undefined && rawSwap !== "0" && rawSwap !== "1") throw new Error("Invalid label swap");
const swapTeamLabels = rawSwap === "1";

describe.skipIf(!enabled)("full fleet support and weather sessions", () => {
  for (const teamSize of [5, 7] as const) for (const weather of ["clear", "rain-squall", "sea-fog"] as const) {
    it(teamSize + "v" + teamSize + " " + weather + " runs both fleets through actual AI and aircraft lifecycles", () => {
      const { state, session, report } = runFleetCalibration({
        teamSize, seed: (teamSize === 5 ? 0x71501 : 0x71701) + offset,
        side, weather, aviation: "fleet-support", swapTeamLabels,
      });
      console.log("FLEET_AIR_CALIBRATION_REPORT " + JSON.stringify(report));
      expect(state.status).not.toBe("running");
      expect(state.time).toBeLessThanOrEqual(BATTLE_DURATION_SECONDS);
      expect(["destroyed", "score", "time"]).toContain(state.endReason);
      expect(report.maximumSquadrons).toBe(6);
      expect(report.maximumOperationalAircraft).toBe(32);
      expect(report.initialAirFleet).toHaveLength(6);
      for (const team of ["player", "enemy"] as const) {
        const squadrons = report.aircraft.filter(squadron => squadron.team === team);
        expect(squadrons.reduce((sum, squadron) => sum + squadron.launches, 0), team + " launches").toBeGreaterThan(0);
        expect(squadrons.reduce((sum, squadron) => sum + squadron.releases, 0), team + " releases weapons").toBeGreaterThan(0);
        expect(report.damage[team], team + " damages opponents").toBeGreaterThan(0);
        expect(report.ships.filter(ship => ship.team === team && ship.shots > 0).length)
          .toBeGreaterThanOrEqual(Math.ceil(teamSize / 2));
      }
      for (const ship of report.ships) {
        expect(ship.travelMeters, ship.id + " moves").toBeGreaterThan(100);
        expect(ship.longestGroundedSeconds, ship.id + " does not remain stranded").toBeLessThan(30);
        expect(ship.objectiveDutySeconds, ship.id + " receives fleet duty").toBeGreaterThan(0);
      }
      for (const squadron of report.aircraft) {
        expect(squadron.maximumAltitude).toBeGreaterThanOrEqual(squadron.minimumAltitude);
        expect(Object.values(squadron.phaseSeconds).reduce((sum, time) => sum + time, 0)).toBeCloseTo(state.time, 0);
      }
      const final = fleetCalibrationStateHash(state);
      for (let tick = 0; tick < 120; ++tick) session.step(new Map(), FIXED_STEP);
      expect(fleetCalibrationStateHash(state), "terminal state remains frozen").toBe(final);
    }, 240_000);
  }
});
