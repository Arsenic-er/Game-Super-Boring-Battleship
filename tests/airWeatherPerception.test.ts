import { describe, expect, it } from "vitest";
import { terrainBlocksLineOfSight } from "../src/maps/atollMap";
import { getShipClass } from "../src/ships/classes";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { createAirSquadronState } from "../src/sim/airOperations";
import { FIXED_STEP } from "../src/sim/config";
import {
  AIR_CONTACT_VALID_SECONDS, createDeveloperShipState, createInitialState,
  observe, validateAirMissionTarget,
} from "../src/sim/simulation";
import type { AircraftRole, AirMissionCommand, ControlCommand, ShipState, Team, Vec3 } from "../src/sim/types";
import type { WeatherId } from "../src/sim/weather";

const other = (team: Team): Team => team === "player" ? "enemy" : "player";
const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0, rudder: 0, fire: false, aimPoint: { ...ship.aimPoint },
});
function fixture(team: Team, weatherId: WeatherId) {
  const state = createInitialState(0x85101, "battle");
  state.mapId = "open-sea-range"; state.weatherId = weatherId;
  state.airSupport = "none"; state.airSquadrons = []; state.underwaterTargets = [];
  const make = (id: string, side: Team, x: number, z: number) => createDeveloperShipState({
    id, team: side, shipClassId: "fletcher", position: { x, y: 0, z },
    aiControlled: false, mainGunMounts: 0, torpedoLauncherMounts: 0,
    secondaryGunIds: [], antiAirMounts: 0, depthChargeMounts: 0,
  });
  const owner = make("observer-controller", team, -5500, -5500);
  const targetOwner = make("target-controller", other(team), 5500, 5500);
  state.ships = [owner, targetOwner];
  const session = new LocalBattleSession(state);
  const advance = (mission?: AirMissionCommand) => session.step(new Map([
    [owner.id, { ...idle(owner), ...(mission ? { airMission: mission } : {}) }],
    [targetOwner.id, idle(targetOwner)],
  ]), FIXED_STEP);
  return { state, owner, targetOwner, advance };
}
function airborne(id: string, owner: ShipState, position: Vec3, role: AircraftRole = "fighter") {
  const squadron = createAirSquadronState({ id, controllerId: owner.id, team: owner.team, role,
    position, heading: 0, recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: 5500 } },
  });
  squadron.phase = "outbound";
  squadron.flight = { speedMetersPerSecond: role === "fighter" ? 105 : 90, pitch: 0, bank: 0 };
  squadron.order = { squadronId: id, kind: "moveTo", issuedAt: 0,
    area: { center: { x: position.x, y: position.y, z: Math.min(5500, position.z + 2000) }, radius: 90 } };
  return squadron;
}
const weatherCases = ["clear", "rain-squall", "sea-fog"] as const;
const separation = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

describe("real-session aircraft optical perception in weather", () => {
  for (const team of ["player", "enemy"] as const) {
    for (const weather of weatherCases) {
      it(`${team}: ship sees aircraft at 2100m only in clear weather (${weather})`, () => {
        const { state, owner, targetOwner, advance } = fixture(team, weather);
        owner.position = { x: 0, y: 0, z: 0 }; owner.previousPosition = { ...owner.position };
        const enemy = airborne("target-air", targetOwner, { x: 2100, y: 180, z: 0 });
        state.airSquadrons = [enemy];
        advance();
        const current = state.airSquadrons[0]!;
        const contact = current.contactsByTeam[team];
        if (weather === "clear") {
          expect(contact?.observedAt).toBe(state.time);
          expect(separation(contact!.lastKnownPosition, current.position)).toBeLessThan(50);
        } else expect(contact).toBeUndefined();
        // Friendly navigation remains authoritative, not an optical enemy sighting.
        expect(current.contactsByTeam[current.team]?.observedAt).toBe(state.time);
        expect(current.contactsByTeam[current.team]?.lastKnownPosition).toEqual(current.position);
      });

      it(`${team}: aircraft sees opposing aircraft at 1900m only in clear weather (${weather})`, () => {
        const { state, owner, targetOwner, advance } = fixture(team, weather);
        state.airSquadrons = [
          airborne("observer-air", owner, { x: 0, y: 180, z: 0 }),
          airborne("target-air", targetOwner, { x: 1900, y: 180, z: 0 }),
        ];
        advance();
        const target = state.airSquadrons.find(air => air.id === "target-air")!;
        if (weather === "clear") expect(target.contactsByTeam[team]?.observedAt).toBe(state.time);
        else expect(target.contactsByTeam[team]).toBeUndefined();
        for (const air of state.airSquadrons) {
          expect(air.contactsByTeam[air.team]?.lastKnownPosition).toEqual(air.position);
        }
      });

      it(`${team}: an existing bomber mission cannot refresh a 2000m surface fix through ${weather}`, () => {
        const { state, owner, targetOwner, advance } = fixture(team, weather);
        targetOwner.position = { x: 2000, y: 0, z: 0 };
        targetOwner.previousPosition = { ...targetOwner.position };
        const bomber = airborne("observer-air", owner, { x: 0, y: 180, z: 0 }, "diveBomber");
        const historicalPosition = { x: 1750, y: 0, z: 150 };
        // An already issued mission retains a historical fix. No sensor contact
        // is injected; only actual session physics/perception runs after setup.
        bomber.order = { squadronId: bomber.id, kind: "strikeShip", issuedAt: 0,
          targetId: targetOwner.id, targetIds: [targetOwner.id], candidateTargetIds: [targetOwner.id],
          activeTargetId: targetOwner.id, selectedWeapon: "heBomb",
          lastKnownPosition: { ...historicalPosition },
          lastKnownPositions: { [targetOwner.id]: { ...historicalPosition } },
        };
        state.airSquadrons = [bomber];
        expect(observe(state, owner.id).contacts).toEqual([]);
        advance();
        const current = state.airSquadrons[0]!;
        const fix = current.order!.lastKnownPositions![targetOwner.id]!;
        if (weather === "clear") {
          expect(fix).not.toEqual(historicalPosition);
          expect(separation(fix, targetOwner.position)).toBeLessThan(60);
          expect(current.phase).toBe("outbound");
        } else {
          expect(fix).toEqual(historicalPosition);
          expect(current.order!.lastKnownPosition).toEqual(historicalPosition);
          expect(current.phase).toBe("searching");
        }
        expect(state.shots).toEqual([]);
      });
    }

    it(`${team}: fog stops refreshing a real old contact and rejects an expired intercept without hiding its own unit`, () => {
      const { state, owner, targetOwner, advance } = fixture(team, "clear");
      owner.position = { x: 0, y: 0, z: 0 }; owner.previousPosition = { ...owner.position };
      state.airSquadrons = [airborne("target-air", targetOwner, { x: 2100, y: 180, z: 0 })];
      advance();
      const first = structuredClone(state.airSquadrons[0]!.contactsByTeam[team]!);
      expect(first.observedAt).toBe(state.time);
      const mission: AirMissionCommand = { squadronId: "ready-interceptor", kind: "interceptSquadron", targetId: "target-air" };
      expect(validateAirMissionTarget(state, owner, mission).rejectReason).toBeUndefined();
      state.weatherId = "sea-fog";
      // Only weather changes at the boundary. The aircraft physically flies;
      // no positions, clocks or contacts are manually advanced afterward.
      while (state.time - first.observedAt <= AIR_CONTACT_VALID_SECONDS + .1) advance();
      const current = state.airSquadrons[0]!;
      expect(current.contactsByTeam[team]).toEqual(first);
      expect(separation(current.position, first.lastKnownPosition)).toBeGreaterThan(200);
      expect(current.contactsByTeam[current.team]?.lastKnownPosition).toEqual(current.position);
      expect(validateAirMissionTarget(state, owner, mission).rejectReason).toBe("invalid-target");
      const interceptor = createAirSquadronState({ id: mission.squadronId, controllerId: owner.id,
        team, role: "fighter", position: { x: 0, y: 180, z: 0 },
        recoverySource: { kind: "mapEdge", position: { x: 0, y: 180, z: -5000 } }, now: state.time });
      state.airSquadrons.push(interceptor);
      advance(mission);
      expect(state.airEvents).toContainEqual(expect.objectContaining({
        kind: "orderRejected", squadronId: interceptor.id, rejectReason: "invalid-target",
      }));
    });

    it(`${team}: a real mountain blocks low-aircraft sightings from a ship, with an open-sea positive control`, () => {
      for (const mapId of ["atoll-prototype", "open-sea-range"] as const) {
        const { state, owner, targetOwner, advance } = fixture(team, "clear");
        state.mapId = mapId;
        owner.position = { x: 2505.3040611092003, y: 0, z: 694.7936012409628 };
        owner.previousPosition = { ...owner.position };
        const enemy = airborne("target-air", targetOwner, { x: 1843.0362464860082, y: 55, z: 2860.6579326558857 });
        state.airSquadrons = [enemy];
        expect(separation(owner.position, enemy.position)).toBeLessThan(2400);
        expect(terrainBlocksLineOfSight(mapId, owner.position, enemy.position,
          getShipClass(owner.shipClassId).deckHeight + 12, 0)).toBe(mapId === "atoll-prototype");
        advance();
        const contact = state.airSquadrons[0]!.contactsByTeam[team];
        if (mapId === "atoll-prototype") expect(contact).toBeUndefined();
        else expect(contact?.observedAt).toBe(state.time);
      }
    });

    it(`${team}: two low aircraft cannot see through a mountain but can see over it at 450m`, () => {
      for (const altitude of [55, 450]) {
        const { state, owner, targetOwner, advance } = fixture(team, "clear");
        state.mapId = "atoll-prototype";
        const observer = airborne("observer-air", owner, { x: 1680, y: altitude, z: 700 });
        const target = airborne("target-air", targetOwner, { x: 1680, y: altitude, z: 2800 });
        state.airSquadrons = [observer, target];
        expect(terrainBlocksLineOfSight(state.mapId, observer.position, target.position, 0, 0))
          .toBe(altitude === 55);
        advance();
        const contact = state.airSquadrons.find(air => air.id === target.id)!.contactsByTeam[team];
        if (altitude === 55) expect(contact).toBeUndefined();
        else expect(contact?.observedAt).toBe(state.time);
      }
    });
  }
});
