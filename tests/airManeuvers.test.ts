import { describe, expect, it } from "vitest";
import { createAirSquadronState, AIR_NAVIGATION } from "../src/sim/airOperations";
import { airFlightVelocity, airInterceptEnvelope, airStrikeEnvelope, bombFallSeconds, planAirManeuver } from "../src/sim/airManeuvers";
import { createInitialState, stepSimulation } from "../src/sim/simulation";
import { GUN, FIXED_STEP } from "../src/sim/config";
import type { AircraftRole, AirWeaponKind } from "../src/sim/types";

const squadron = (role: AircraftRole = "diveBomber") => {
  const result = createAirSquadronState({ id: `sortie-${role}`, controllerId: "player", team: "player", role,
    position: { x: 0, y: 390, z: -2_400 }, recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: -5_200 } } });
  result.phase = "outbound";
  result.flight = { speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0 };
  return result;
};

describe("mission-driven 3D flight", () => {
  it("uses a reachable tangent patrol without clock-driven waypoint motion", () => {
    const s = squadron("torpedoBomber"); s.phase = "patrolling"; s.position = { x: 0, y: 225, z: 0 };
    const a = planAirManeuver(s, { x: 0, y: 0, z: 0 }, 10);
    const b = planAirManeuver(s, { x: 0, y: 0, z: 0 }, 100);
    expect(a).toEqual(b);
    expect(Math.hypot(a.destination.x, a.destination.z)).toBeGreaterThan(800);
  });

  it("does not let retained intercept orders override returning or landing guidance", () => {
    const s = squadron("fighter");
    s.order = { squadronId: s.id, kind: "interceptSquadron", issuedAt: 0 };
    s.phase = "returning";
    expect(planAirManeuver(s, { x: 0, y: 60, z: -2_800 }, 20).targetAltitude).toBe(60);
    s.phase = "landing";
    expect(planAirManeuver(s, { x: 0, y: 60, z: -2_800 }, 20).speedMultiplier).toBe(.8);
  });

  it("requires low, level and aligned torpedo release instead of a timer alone", () => {
    const s = squadron("torpedoBomber"); s.position = { x: 0, y: 55, z: -650 };
    const aim = { x: 0, y: 0, z: 0 };
    expect(airStrikeEnvelope(s, aim, "aerialTorpedo", GUN.gravity)).toBe(true);
    for (const bad of [{ height: 180, pitch: 0, heading: 0 }, { height: 55, pitch: -.3, heading: 0 }, { height: 55, pitch: 0, heading: Math.PI }]) {
      s.position.y = bad.height; s.flight!.pitch = bad.pitch; s.heading = bad.heading;
      expect(airStrikeEnvelope(s, aim, "aerialTorpedo", GUN.gravity)).toBe(false);
    }
  });

  it("releases bombs near the actual forward ballistic footprint, not 100m early", () => {
    const s = squadron(); s.position = { x: 0, y: 120, z: 0 };
    s.flight = { speedMetersPerSecond: 100, pitch: -.6, bank: 0 };
    const v = airFlightVelocity(s), fall = bombFallSeconds(s.position.y, v.y, GUN.gravity);
    const aim = { x: 0, y: 0, z: v.z * fall };
    expect(airStrikeEnvelope(s, aim, "heBomb", GUN.gravity)).toBe(true);
    expect(airStrikeEnvelope(s, { ...aim, z: aim.z + 100 }, "heBomb", GUN.gravity)).toBe(false);
    expect(fall).toBeLessThan(Math.sqrt(2 * s.position.y / GUN.gravity));
  });

  it("requires a three-dimensional forward gun cone for interceptions", () => {
    const s = squadron("fighter"); s.position = { x: 0, y: 300, z: 0 };
    expect(airInterceptEnvelope(s, { x: 0, y: 300, z: 400 })).toBe(true);
    expect(airInterceptEnvelope(s, { x: 0, y: 800, z: 400 })).toBe(false);
    expect(airInterceptEnvelope(s, { x: 0, y: 300, z: -400 })).toBe(false);
  });

  it.each([["diveBomber", "heBomb"], ["torpedoBomber", "aerialTorpedo"]] as const)(
    "flies a complete %s approach, physical release and climbing egress", (role: AircraftRole, weapon: AirWeaponKind) => {
      const state = createInitialState(976, "sea-trials");
      const target = state.ships.find(ship => ship.team === "enemy")!;
      target.position = { x: 0, y: 0, z: 0 }; target.previousPosition = { ...target.position };
      for (const ship of state.ships) ship.antiAirMounts = 0;
      const s = squadron(role);
      if (role === "torpedoBomber") s.position.y = 225;
      s.previousPosition = { ...s.position };
      s.order = { squadronId: s.id, kind: "strikeShip", targetId: target.id, targetIds: [target.id],
        candidateTargetIds: [target.id], activeTargetId: target.id, selectedWeapon: weapon, issuedAt: 0,
        lastKnownPosition: { ...target.position }, lastKnownPositions: { [target.id]: { ...target.position } } };
      state.airSquadrons = [s];
      let release: { time: number; height: number; pitch: number; range: number } | undefined;
      let minimumPitch = 0, climbedAfterRelease = false;
      const phases = new Set<string>();
      let previous = { ...s.position };
      for (let frame = 0; frame < 90 / FIXED_STEP; frame++) {
        stepSimulation(state, new Map(), FIXED_STEP);
        const live = state.airSquadrons[0]!;
        phases.add(live.phase); minimumPitch = Math.min(minimumPitch, live.flight!.pitch);
        expect(Math.hypot(live.position.x - previous.x, live.position.y - previous.y, live.position.z - previous.z)).toBeLessThan(3.1);
        previous = { ...live.position };
        if (state.airEvents.some(event => event.kind === "weaponReleased" && event.squadronId === live.id)) {
          release = { time: state.time, height: live.position.y, pitch: live.flight!.pitch, range: Math.hypot(live.position.x, live.position.z) };
        }
        if (release && live.position.y > release.height + 35 && live.flight!.pitch > .04) { climbedAfterRelease = true; break; }
      }
      const details = JSON.stringify({ release, minimumPitch, phases: [...phases], final: state.airSquadrons[0] });
      expect(release, details).toBeDefined();
      expect(phases.has("attackRun"), details).toBe(true);
      expect(phases.has("returning"), details).toBe(true);
      expect(climbedAfterRelease, details).toBe(true);
      expect(minimumPitch).toBeLessThan(role === "diveBomber" ? -.3 : -.1);
      if (role === "torpedoBomber") {
        expect(release!.height).toBeLessThanOrEqual(85);
        expect(Math.abs(release!.pitch)).toBeLessThanOrEqual(.14);
      } else expect(release!.pitch).toBeLessThan(-.16);
    },
  );
});
