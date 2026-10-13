
import { describe, expect, it } from "vitest";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { FIXED_STEP } from "../src/sim/config";
import { WEATHER_IDS, type WeatherId } from "../src/sim/weather";
import type { AirSquadronState } from "../src/sim/types";
import { createFleetCalibration, fleetCalibrationStateHash } from "./helpers/fleetCalibration";
import { FLEET_SMOKE_SIDE_SWAP } from "./helpers/fleetSmokeScenario";

const seed = 0x71501 + 211;
function resources(squadron: AirSquadronState) {
  const { id, controllerId, team, position, previousPosition, heading, recoverySource, contactsByTeam, ...rest } = squadron;
  return rest;
}
describe("weather and paired aviation calibration fixtures", () => {
  it("keeps the existing surface-only fixture as the default", () => {
    const basic = createFleetCalibration({ teamSize: 5, seed });
    expect(createFleetCalibration({ teamSize: 5, seed, weather: "clear", aviation: "none" })).toEqual(basic);
    expect(basic.airSquadrons).toEqual([]);
    expect(basic.weatherId).toBe("clear");
  });
  it.each(WEATHER_IDS)("applies %s before any sensor has observed", weather => {
    const baseline = createFleetCalibration({ teamSize: 5, seed });
    expect(createFleetCalibration({ teamSize: 5, seed, weather }))
      .toEqual({ ...baseline, weatherId: weather });
  });
  it("rejects invalid settings rather than silently testing clear weather or no aircraft", () => {
    expect(() => createFleetCalibration({ teamSize: 5, seed, weather: "storm" as WeatherId })).toThrow();
    expect(() => createFleetCalibration({ teamSize: 5, seed, aviation: "other" as "none" })).toThrow();
  });
  for (const teamSize of [5, 7] as const) {
    it(teamSize + "v" + teamSize + " pairs real support resources and binds every squadron to a live controller", () => {
      const state = createFleetCalibration({ teamSize, seed, aviation: "fleet-support" });
      expect(state.airSquadrons).toHaveLength(6);
      for (const role of ["fighter", "diveBomber", "torpedoBomber"] as const) {
        const pair = state.airSquadrons.filter(squadron => squadron.role === role);
        expect(pair).toHaveLength(2);
        const [a, b] = pair;
        expect(resources(a!)).toEqual(resources(b!));
        expect(a!.aircraftCapacity).toBe(role === "fighter" ? 6 : 5);
        expect(a!.phase).toBe("ready");
        expect(b!.position.x).toBeCloseTo(2 * FLEET_SMOKE_SIDE_SWAP.centerX - a!.position.x, 10);
        expect(b!.position.z).toBeCloseTo(2 * FLEET_SMOKE_SIDE_SWAP.centerZ - a!.position.z, 10);
        expect(b!.position.y).toBe(a!.position.y);
        expect(Math.sin(b!.heading)).toBeCloseTo(-Math.sin(a!.heading), 10);
        expect(Math.cos(b!.heading)).toBeCloseTo(-Math.cos(a!.heading), 10);
      }
      for (const squadron of state.airSquadrons) {
        const controller = state.ships.find(ship => ship.id === squadron.controllerId)!;
        expect(controller).toBeDefined();
        expect(controller.team).toBe(squadron.team);
        expect(controller.aiControlled).toBe(true);
        expect(Object.keys(squadron.contactsByTeam)).toEqual([squadron.team]);
        expect(squadron.contactsByTeam[squadron.team]!.lastKnownPosition).toEqual(squadron.position);
        expect(squadron.contactsByTeam[squadron.team]!.observedHeading).toBe(squadron.heading);
        expect(squadron.recoverySource).toEqual({ kind: "mapEdge", position: squadron.position });
        expect(squadron.order).toBeUndefined();
      }
      const fresh = createFleetCalibration({ teamSize, seed, aviation: "fleet-support" });
      state.airSquadrons[0]!.position.x += 100;
      state.airSquadrons[0]!.contactsByTeam.player!.lastKnownPosition.z += 100;
      expect(state.airSquadrons[1]).toEqual(fresh.airSquadrons[1]);
      expect(fresh).toEqual(createFleetCalibration({ teamSize, seed, aviation: "fleet-support" }));
    });
    it(teamSize + "v" + teamSize + " mirrors aircraft, recovery and contact poses with the ships", () => {
      const baseline = createFleetCalibration({ teamSize, seed, aviation: "fleet-support" });
      const mirror = createFleetCalibration({ teamSize, seed, aviation: "fleet-support", side: "mirrored" });
      baseline.airSquadrons.forEach((squadron, index) => {
        const actual = mirror.airSquadrons[index]!;
        expect(actual.id).toBe(squadron.id);
        expect(actual.controllerId).toBe(squadron.controllerId);
        expect(resources(actual)).toEqual(resources(squadron));
        expect(actual.position.x).toBeCloseTo(2 * FLEET_SMOKE_SIDE_SWAP.centerX - squadron.position.x, 10);
        expect(actual.position.z).toBeCloseTo(2 * FLEET_SMOKE_SIDE_SWAP.centerZ - squadron.position.z, 10);
        expect(actual.recoverySource).toEqual({ kind: "mapEdge", position: actual.position });
        expect(actual.contactsByTeam[actual.team]!.lastKnownPosition).toEqual(actual.position);
      });
    });
    it(teamSize + "v" + teamSize + " relabels aircraft ownership and contacts without changing identity or pose", () => {
      for (const side of ["default", "mirrored"] as const) {
        const baseline = createFleetCalibration({ teamSize, seed, aviation: "fleet-support", side });
        const swapped = createFleetCalibration({ teamSize, seed, aviation: "fleet-support", side, swapTeamLabels: true });
        expect(fleetCalibrationStateHash(swapped, true)).toBe(fleetCalibrationStateHash(baseline));
        const identity = createFleetCalibration({ teamSize, seed, aviation: "fleet-support", side, swapFleetIdentities: true });
        baseline.airSquadrons.forEach((squadron, index) => {
          const actual = identity.airSquadrons[index]!;
          expect(actual.position).toEqual(squadron.position);
          expect(actual.team).toBe(squadron.team);
          expect(actual.controllerId).not.toBe(squadron.controllerId);
          expect(identity.ships.find(ship => ship.id === actual.controllerId)?.team).toBe(actual.team);
          expect(resources(actual)).toEqual(resources(squadron));
        });
      }
    });
  }
  it.each(["clear", "rain-squall", "sea-fog"] as const)(
    "%s retains exact team-label symmetry through aircraft launch, patrol and surface acquisition", weather => {
      const options = { teamSize: 5 as const, seed, aviation: "fleet-support" as const, weather };
      const normal = createFleetCalibration(options);
      const swapped = createFleetCalibration({ ...options, swapTeamLabels: true });
      const sessions = [new LocalBattleSession(normal), new LocalBattleSession(swapped)];
      for (let tick = 0; tick < 3_600; ++tick) {
        for (const session of sessions) session.step(new Map(), FIXED_STEP);
      }
      expect(normal.time).toBeCloseTo(60, 8);
      expect(fleetCalibrationStateHash(swapped, true)).toBe(fleetCalibrationStateHash(normal));
      for (const team of ["player", "enemy"] as const) {
        expect(normal.airSquadrons.find(squadron => squadron.team === team && squadron.role === "fighter")!.phase).not.toBe("ready");
      }
    });
});
