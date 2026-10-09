import { describe, expect, it } from "vitest";
import { BATTLE_DURATION_SECONDS, FIXED_STEP } from "../src/sim/config";
import { runFleetCalibration } from "./helpers/fleetCalibration";
import { prototypePlayerBuild, prototypeSpawnSide } from "./helpers/fleetSmokeScenario";
import { prototypeSeedOffset } from "./helpers/objectiveSmokeMetrics";

const enabled = process.env.FLEET_CALIBRATION === "1";
const seedOffset = prototypeSeedOffset(process.env.PROTOTYPE_SEED_OFFSET);
const build = prototypePlayerBuild(process.env.PROTOTYPE_PLAYER_BUILD);
const side = prototypeSpawnSide(process.env.PROTOTYPE_SPAWN_SIDE);
const rawLabelSwap = process.env.FLEET_CALIBRATION_LABEL_SWAP;
if (rawLabelSwap !== undefined && rawLabelSwap !== "0" && rawLabelSwap !== "1") {
  throw new Error("FLEET_CALIBRATION_LABEL_SWAP must be 0 or 1");
}
const swapTeamLabels = rawLabelSwap === "1";

describe.skipIf(!enabled)("equal-loadout full-session fleet calibration", () => {
  for (const teamSize of [5, 7] as const) {
    it(`${teamSize}v${teamSize} uses equivalent ships and the production AI path for both fleets`, () => {
      const seed = (teamSize === 5 ? 0x71501 : 0x71701) + seedOffset;
      const { state, session, report } = runFleetCalibration({ teamSize, seed, side, build, swapTeamLabels });
      console.log(`FLEET_CALIBRATION_REPORT ${JSON.stringify(report)}`);
      expect(state.status).not.toBe("running");
      expect(state.time).toBeLessThanOrEqual(BATTLE_DURATION_SECONDS);
      expect(["destroyed", "score", "time"]).toContain(state.endReason);
      // These are operational acceptance checks, not an asserted winner or a 50% win-rate target.
      expect(report.maximumAircraft, "surface-only calibration: no autonomous aviation asymmetry").toBe(0);
      for (const ship of report.ships) {
        expect(ship.travelMeters, `${ship.id} moved`).toBeGreaterThan(100);
        expect(ship.firstTargetSeconds, `${ship.id} acquired a local target`).not.toBeNull();
        expect(ship.objectiveDutySeconds, `${ship.id} participates in session coordination`).toBeGreaterThan(0);
        expect(ship.longestGroundedSeconds, `${ship.id} is not stranded for thirty seconds`).toBeLessThan(30);
      }
      for (const team of ["player", "enemy"] as const) {
        expect(report.damage[team], `${team} damages its opponent`).toBeGreaterThan(0);
        expect(report.ships.filter(ship => ship.team === team && ship.shots > 0).length,
          `${team} has a firing majority`).toBeGreaterThanOrEqual(Math.ceil(teamSize / 2));
      }
      const time = state.time, status = state.status;
      for (let index = 0; index < 120; ++index) session.step(new Map(), FIXED_STEP);
      expect(state.time).toBe(time);
      expect(state.status).toBe(status);
    }, 240_000);
  }
});
