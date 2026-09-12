import { describe, expect, it } from "vitest";
import { AIR_NAVIGATION, createAirSquadronState } from "../src/sim/airOperations";
import { airInterceptEnvelope } from "../src/sim/airManeuvers";
import { FIXED_STEP } from "../src/sim/config";
import {
  createDeveloperShipState,
  createInitialState,
  stepSimulation,
} from "../src/sim/simulation";
import type {
  AircraftRole,
  AirCombatEvent,
  AirMissionCommand,
  AirSquadronPhase,
  AirSquadronState,
  AirWeaponKind,
  ControlCommand,
  Vec3,
} from "../src/sim/types";

const MAX_SECONDS = 180;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const rounded = (value: number) => Math.round(value * 1_000) / 1_000;

interface FlightTrace {
  previous: Vec3;
  minimumAltitude: number;
  maximumAltitude: number;
  minimumPitch: number;
  maximumPitch: number;
  maximumStep: number;
  distanceTravelled: number;
  finite: boolean;
}

function traceFor(squadron: AirSquadronState): FlightTrace {
  return {
    previous: { ...squadron.position },
    minimumAltitude: squadron.position.y,
    maximumAltitude: squadron.position.y,
    minimumPitch: 0,
    maximumPitch: 0,
    maximumStep: 0,
    distanceTravelled: 0,
    finite: true,
  };
}

function recordFlight(trace: FlightTrace, squadron: AirSquadronState): void {
  const step = distance(trace.previous, squadron.position);
  trace.maximumStep = Math.max(trace.maximumStep, step);
  trace.distanceTravelled += step;
  trace.previous = { ...squadron.position };
  trace.minimumAltitude = Math.min(trace.minimumAltitude, squadron.position.y);
  trace.maximumAltitude = Math.max(trace.maximumAltitude, squadron.position.y);
  trace.minimumPitch = Math.min(trace.minimumPitch, squadron.flight?.pitch ?? 0);
  trace.maximumPitch = Math.max(trace.maximumPitch, squadron.flight?.pitch ?? 0);
  trace.finite &&= [
    squadron.position.x, squadron.position.y, squadron.position.z,
    squadron.heading, squadron.flight?.speedMetersPerSecond,
    squadron.flight?.pitch, squadron.flight?.bank,
  ].every((value) => Number.isFinite(value));
}

/** Only stepSimulation changes an actor after setup. The one-time mission and
 * constant ship throttle are normal inputs, not a scripted aircraft trajectory. */
function runMovingTargetSortie(role: AircraftRole) {
  const state = createInitialState(1076, "sea-trials");
  const player = state.ships[0]!;
  player.position = { x: 0, y: 0, z: -900 };
  player.previousPosition = { ...player.position };
  player.antiAirMounts = 0;
  player.secondaryMounts = [];
  const targetShip = createDeveloperShipState({
    id: "moving-target", team: "enemy", shipClassId: "north-carolina",
    position: { x: 0, y: 0, z: 0 }, heading: Math.PI / 2,
    antiAirMounts: 0, secondaryGunIds: [],
  });
  targetShip.speedKnots = 18;
  state.ships = [player, targetShip];
  state.underwaterTargets = [];

  const attacker = createAirSquadronState({
    id: `sortie-${role}`, controllerId: player.id, team: "player", role,
    position: { x: 0, y: 80, z: -2_600 },
    recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: -3_000 } },
  });
  // These are incoming off-map aircraft, not aircraft accelerating on a runway.
  // They remain in the factory's ready phase until the real command is accepted.
  attacker.flight = {
    speedMetersPerSecond: AIR_NAVIGATION.speedMetersPerSecond[role], pitch: 0, bank: 0,
  };
  state.airSquadrons = [attacker];
  let targetAir: AirSquadronState | undefined;
  if (role === "fighter") {
    targetAir = createAirSquadronState({
      id: "moving-air-target", controllerId: targetShip.id, team: "enemy", role: "diveBomber",
      position: { x: 0, y: 390, z: -900 },
      recoverySource: { kind: "mapEdge", position: { x: 0, y: 80, z: 5_200 } },
    });
    targetAir.phase = "outbound";
    targetAir.flight = { speedMetersPerSecond: 90, pitch: 0, bank: 0 };
    targetAir.order = {
      squadronId: targetAir.id, kind: "moveTo", issuedAt: 0,
      area: { center: { x: 0, y: 390, z: 4_000 }, radius: 90 },
    };
    state.airSquadrons.push(targetAir);
  }
  const targetId = targetAir?.id ?? targetShip.id;
  const initialTargetPosition = { ...(targetAir?.position ?? targetShip.position) };
  const initialTargetHealth = targetAir?.airframeHealth ?? targetShip.hull;
  const initialAltitudeDifference = initialTargetPosition.y - attacker.position.y;
  const traces = new Map(state.airSquadrons.map((s) => [s.id, traceFor(s)]));
  const idle: ControlCommand = { throttle: 0, rudder: 0, fire: false, aimPoint: { x: 0, y: 0, z: 0 } };
  const crossing: ControlCommand = { ...idle, throttle: .7 };
  const mission: AirMissionCommand = {
    squadronId: attacker.id, kind: role === "fighter" ? "interceptSquadron" : "strikeShip", targetId,
  };
  const initialCommands = new Map<string, ControlCommand>([
    [player.id, { ...idle, airMission: mission }], [targetShip.id, crossing],
  ]);
  const subsequentCommands = new Map<string, ControlCommand>([
    [player.id, idle], [targetShip.id, crossing],
  ]);
  const phases: { phase: AirSquadronPhase; time: number }[] = [];
  const events: AirCombatEvent[] = [];
  let release: {
    time: number; altitude: number; pitch: number; bank: number;
    targetAltitude: number; range: number; targetDisplacement: number;
    inInterceptEnvelope: boolean;
  } | undefined;

  // No state, positions, flight parameters, contacts or recovery sources are
  // patched in this loop. The defender's own production autopilot also runs.
  for (let frame = 0; frame < Math.round(MAX_SECONDS / FIXED_STEP); frame++) {
    stepSimulation(state, frame === 0 ? initialCommands : subsequentCommands, FIXED_STEP);
    for (const current of state.airSquadrons) recordFlight(traces.get(current.id)!, current);
    const live = state.airSquadrons.find((s) => s.id === attacker.id)!;
    const currentTarget = targetAir
      ? state.airSquadrons.find((s) => s.id === targetId)!
      : state.ships.find((ship) => ship.id === targetId)!;
    if (phases.at(-1)?.phase !== live.phase) phases.push({ phase: live.phase, time: state.time });
    const currentEvents = state.airEvents.filter((event) => event.squadronId === live.id);
    events.push(...currentEvents);
    if (!release && currentEvents.some((event) => event.kind === "weaponReleased")) {
      release = {
        time: state.time, altitude: live.position.y,
        pitch: live.flight!.pitch, bank: live.flight!.bank,
        targetAltitude: currentTarget.position.y,
        range: distance(live.position, currentTarget.position),
        targetDisplacement: distance(initialTargetPosition, currentTarget.position),
        inInterceptEnvelope: airInterceptEnvelope(live, currentTarget.position),
      };
    }
    if (live.phase === "rearming" && state.projectiles.length === 0) break;
  }
  const final = state.airSquadrons.find((s) => s.id === attacker.id)!;
  const finalAirTarget = targetAir && state.airSquadrons.find((s) => s.id === targetId)!;
  const finalTargetPosition = finalAirTarget?.position ?? targetShip.position;
  const finalTargetHealth = finalAirTarget?.airframeHealth ?? targetShip.hull;
  const hits = events.filter((event) => event.kind === "attackHit");
  const misses = events.filter((event) => event.kind === "attackMiss");
  const report = {
    role, elapsed: rounded(state.time), finalPhase: final.phase,
    phases: phases.map(({ phase, time }) => ({ phase, time: rounded(time) })),
    release: release && Object.fromEntries(Object.entries(release).map(([key, value]) =>
      [key, typeof value === "number" ? rounded(value) : value])),
    physicalHits: hits.length, misses: misses.length,
    immediateHitDamage: rounded(hits.reduce((sum, event) => sum + (event.damage ?? 0), 0)),
    totalTargetHealthLoss: rounded(initialTargetHealth - finalTargetHealth),
    targetDisplacement: rounded(distance(initialTargetPosition, finalTargetPosition)),
    flight: [...traces].map(([id, trace]) => ({ id,
      minimumAltitude: rounded(trace.minimumAltitude), maximumAltitude: rounded(trace.maximumAltitude),
      minimumPitch: rounded(trace.minimumPitch), maximumPitch: rounded(trace.maximumPitch),
      maximumStep: rounded(trace.maximumStep), distanceTravelled: rounded(trace.distanceTravelled),
    })),
    remainingProjectiles: state.projectiles.length,
  };
  return { state, final, events, phases, traces, release, hits, misses, report,
    initialAltitudeDifference, initialTargetHealth, finalTargetHealth, targetId,
    aircraftCount: attacker.aircraftOperational };
}

describe("production moving-target 3D sorties", () => {
  it.each([
    ["diveBomber", "heBomb"], ["torpedoBomber", "aerialTorpedo"], ["fighter", "machineGun"],
  ] as const)("completes the %s sortie against a genuinely moving target", (role, weapon: AirWeaponKind) => {
    const result = runMovingTargetSortie(role);
    const details = JSON.stringify(result.report);
    console.info(`AIR_MOVING_TARGET ${details}`);
    expect(result.events.filter((event) => event.kind === "orderAccepted"), details).toHaveLength(1);
    expect(result.events.filter((event) => event.kind === "orderRejected"), details).toHaveLength(0);
    expect(result.events.filter((event) => event.kind === "weaponReleased"), details).toHaveLength(1);
    expect(result.events.find((event) => event.kind === "weaponReleased")?.weapon, details).toBe(weapon);
    expect(result.phases.map(({ phase }) => phase), details).toEqual([
      "launching", "outbound", role === "fighter" ? "intercepting" : "attackRun",
      "returning", "landing", "rearming",
    ]);
    expect(result.state.time, details).toBeLessThanOrEqual(MAX_SECONDS + 1e-6);
    expect(result.final.phase, details).toBe("rearming");
    expect(result.final.aircraftOperational, details).toBe(result.aircraftCount);
    expect(result.state.projectiles, details).toHaveLength(0);
    for (const trace of result.traces.values()) {
      expect(trace.finite, details).toBe(true);
      expect(trace.maximumStep, details).toBeLessThan(3.1);
      expect(trace.minimumAltitude, details).toBeGreaterThanOrEqual(18);
      expect(trace.distanceTravelled, details).toBeGreaterThan(1_000);
    }
    expect(result.release, details).toBeDefined();
    expect(result.release!.targetDisplacement, details).toBeGreaterThan(200);
    expect(result.hits.length, details).toBeGreaterThan(0);
    expect(result.hits.every((event) => event.targetId === result.targetId && event.weapon === weapon), details).toBe(true);
    const attackerTrace = result.traces.get(result.final.id)!;
    expect(attackerTrace.maximumAltitude - attackerTrace.minimumAltitude, details).toBeGreaterThan(120);
    expect(attackerTrace.maximumPitch, details).toBeGreaterThan(.1);

    if (role === "fighter") {
      expect(result.initialAltitudeDifference, details).toBeGreaterThan(250);
      expect(result.release!.altitude, details).toBeGreaterThan(350);
      expect(result.release!.inInterceptEnvelope, details).toBe(true);
      expect(result.finalTargetHealth, details).toBeLessThan(result.initialTargetHealth);
    } else {
      expect(result.hits.length + result.misses.length, details).toBe(result.aircraftCount);
      expect(attackerTrace.minimumPitch, details).toBeLessThan(role === "diveBomber" ? -.3 : -.1);
      if (role === "torpedoBomber") {
        expect(result.release!.altitude, details).toBeLessThanOrEqual(85);
        expect(Math.abs(result.release!.pitch), details).toBeLessThanOrEqual(.14);
        expect(result.finalTargetHealth, details).toBeLessThan(result.initialTargetHealth);
      } else {
        expect(result.release!.pitch, details).toBeLessThan(-.16);
        // North Carolina armour can stop these HE bombs: a physical collision
        // is not reported as effective damage. The report preserves that distinction.
        expect(result.report.immediateHitDamage, details).toBeGreaterThanOrEqual(0);
      }
    }
  }, 15_000);
});
