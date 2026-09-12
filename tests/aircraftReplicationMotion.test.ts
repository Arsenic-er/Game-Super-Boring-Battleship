import { describe, expect, it } from "vitest";
import { ClientBattleSession } from "../src/net/clientBattleSession";
import { LAN_CONTENT_HASH, LAN_GAME_VERSION } from "../src/net/networkFingerprint";
import type { PlayerSnapshotPayload } from "../src/net/protocol";
import { replicationViewFor } from "../src/net/replicationView";
import { createInitialState } from "../src/sim/simulation";
import type { AirSquadronState } from "../src/sim/types";

const radians = (degrees: number): number => degrees * Math.PI / 180;

function squadron(overrides: Partial<AirSquadronState> = {}): AirSquadronState {
  return {
    id: "friendly-flight", controllerId: "player", team: "player", role: "fighter",
    recoverySource: { kind: "mapEdge", position: { x: 0, y: 300, z: 0 } },
    contactsByTeam: {}, phase: "patrolling",
    position: { x: 0, y: 300, z: 0 }, previousPosition: { x: 0, y: 300, z: 0 }, heading: 0,
    flight: { speedMetersPerSecond: 100, pitch: 0.1, bank: 0.2 },
    aircraftCapacity: 6, aircraftOperational: 6, airframeHealth: 100, maxAirframeHealth: 100,
    ammoRemaining: 100, ordnanceRemaining: 0, cohesion: 1, fuelRemainingSeconds: 300,
    phaseStartedAt: 0, lastUpdatedAt: 0, attackRunReleased: false,
    ...overrides,
  };
}

function wireAircraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "flight-a", controllerId: "player", team: "player", role: "fighter", phase: "patrolling",
    position: { x: 0, y: 300, z: 0 }, heading: 0, aircraftOperational: 6,
    flight: { speedMetersPerSecond: 100, pitch: 0.1, bank: 0.2 },
    ...overrides,
  };
}

function snapshot(aircraft: Record<string, unknown>[], serverTick = 1, time = 0): PlayerSnapshotPayload {
  return {
    controlledShipId: "player", serverTick, lastProcessedInputSequence: 0, time,
    self: {
      id: "player", team: "player", shipClassId: "fletcher", position: { x: 0, y: 0, z: 0 },
      heading: 0, speedKnots: 0, throttle: 0, hull: 900, maxHull: 1_000,
    },
    friendlies: [], contacts: [], projectiles: [], torpedoes: [], aircraft, events: [],
    objective: {},
  };
}

function client(): ClientBattleSession {
  return new ClientBattleSession({
    roomId: "air-motion", peerId: "guest", gameVersion: LAN_GAME_VERSION, contentHash: LAN_CONTENT_HASH,
  });
}

function pair(previous: Record<string, unknown>[], next: Record<string, unknown>[]): ClientBattleSession {
  const session = client();
  session.receiveSnapshot(snapshot(previous), 0);
  session.receiveSnapshot(snapshot(next, 2, 0.2), 200);
  return session;
}

describe("aircraft flight replication", () => {
  it("copies only the three optional flight fields without sharing simulation references", () => {
    const state = createInitialState(476, "battle");
    const aircraft = squadron();
    Object.assign(aircraft.flight!, { privateFutureField: "must-not-replicate" });
    state.airSquadrons = [aircraft];
    const wire = replicationViewFor(state, "player", 1, 0).aircraft[0]!;
    expect(wire.flight).toEqual({ speedMetersPerSecond: 100, pitch: 0.1, bank: 0.2 });
    expect(wire.flight).not.toBe(aircraft.flight);
    (wire.flight as Record<string, unknown>).pitch = 0.8;
    (wire.position as Record<string, unknown>).y = 900;
    expect(aircraft.flight!.pitch).toBe(0.1);
    expect(aircraft.position.y).toBe(300);
  });

  it("omits flight entirely when the simulation still supplies the old state shape", () => {
    const state = createInitialState(477, "battle");
    const aircraft = squadron();
    delete aircraft.flight;
    state.airSquadrons = [aircraft];
    expect(replicationViewFor(state, "player", 1, 0).aircraft[0]).not.toHaveProperty("flight");
  });

  it("keeps far hidden hostile flights absent and near hidden-controller flights anonymous", () => {
    const state = createInitialState(478, "battle");
    const player = state.ships.find((ship) => ship.id === "player")!;
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    enemy.position = { x: player.position.x + 6_000, y: 0, z: player.position.z + 6_000 };
    enemy.previousPosition = { ...enemy.position };
    state.airSquadrons = [
      squadron({ id: "secret-far-flight", controllerId: enemy.id, team: "enemy",
        position: { x: player.position.x + 5_000, y: 300, z: player.position.z + 5_000 } }),
      squadron({ id: "secret-near-flight", controllerId: enemy.id, team: "enemy",
        position: { x: player.position.x + 600, y: 300, z: player.position.z + 100 } }),
    ];
    const wire = replicationViewFor(state, "player", 1, 0);
    expect(wire.contacts).toHaveLength(0);
    expect(wire.aircraft).toHaveLength(1);
    expect(wire.aircraft[0]).not.toHaveProperty("id");
    expect(wire.aircraft[0]).not.toHaveProperty("controllerId");
    expect(wire.aircraft[0]!.flight).toEqual(state.airSquadrons[1]!.flight);
    expect(JSON.stringify(wire.aircraft)).not.toContain("secret-");
  });

  it("preserves flight and existing identity when the hostile controller is visible", () => {
    const state = createInitialState(479, "battle");
    const player = state.ships.find((ship) => ship.id === "player")!;
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    enemy.position = { x: player.position.x + 1_100, y: 0, z: player.position.z + 200 };
    enemy.previousPosition = { ...enemy.position };
    state.time = 1;
    state.airSquadrons = [squadron({ id: "visible-flight", controllerId: enemy.id, team: "enemy" })];
    const wire = replicationViewFor(state, "player", 1, 0);
    expect(wire.aircraft[0]).toMatchObject({
      id: "visible-flight", controllerId: enemy.id, flight: state.airSquadrons[0]!.flight,
    });
  });
});

describe("client aircraft motion", () => {
  it("interpolates XYZ, speed and pitch, with shortest-path heading and bank wrapping", () => {
    const session = pair([
      wireAircraft({ heading: radians(350),
        flight: { speedMetersPerSecond: 80, pitch: -0.2, bank: radians(170) } }),
    ], [
      wireAircraft({ position: { x: 20, y: 340, z: 60 }, heading: radians(10),
        flight: { speedMetersPerSecond: 120, pitch: 0.4, bank: radians(-170) } }),
    ]);
    const aircraft = session.renderState(220)!.state.airSquadrons[0]!;
    expect(aircraft.position).toEqual({ x: 10, y: 320, z: 30 });
    expect(aircraft.previousPosition).toEqual(aircraft.position);
    expect(aircraft.heading).toBeCloseTo(0);
    expect(aircraft.flight!.speedMetersPerSecond).toBeCloseTo(100);
    expect(aircraft.flight!.pitch).toBeCloseTo(0.1);
    expect(Math.abs(aircraft.flight!.bank)).toBeCloseTo(Math.PI);
  });

  it("matches stable identities across reordering and never resurrects removed aircraft", () => {
    const session = pair([
      wireAircraft({ id: "a", position: { x: 0, y: 300, z: 0 } }),
      wireAircraft({ id: "b", position: { x: 100, y: 300, z: 0 } }),
      wireAircraft({ id: "gone", position: { x: 999, y: 300, z: 0 } }),
    ], [
      wireAircraft({ id: "b", position: { x: 120, y: 300, z: 0 } }),
      wireAircraft({ id: "new", position: { x: 500, y: 300, z: 0 } }),
      wireAircraft({ id: "a", position: { x: 20, y: 300, z: 0 } }),
    ]);
    expect(session.renderState(220)!.state.airSquadrons.map(({ id, position }) => [id, position.x]))
      .toEqual([["b", 110], ["new", 500], ["a", 10]]);
  });

  it("does not treat anonymous array indices as stable hostile identities", () => {
    const anonymous = { id: undefined, controllerId: undefined, team: "enemy" };
    const session = pair([
      wireAircraft({ ...anonymous, position: { x: 0, y: 300, z: 0 } }),
      wireAircraft({ ...anonymous, position: { x: 900, y: 300, z: 0 } }),
    ], [
      wireAircraft({ ...anonymous, position: { x: 920, y: 350, z: 0 } }),
      wireAircraft({ ...anonymous, position: { x: 20, y: 320, z: 0 } }),
    ]);
    expect(session.renderState(220)!.state.airSquadrons.map(({ position }) => position.x)).toEqual([920, 20]);
  });

  it("does not cross-match an anonymous flight when its controller becomes visible", () => {
    const session = pair([wireAircraft({ id: undefined, controllerId: undefined })], [
      wireAircraft({ position: { x: 60, y: 300, z: 0 } }),
    ]);
    expect(session.renderState(220)!.state.airSquadrons[0]!.position.x).toBe(60);
  });

  it.each([
    { team: "enemy" }, { role: "diveBomber" }, { controllerId: "different-controller" },
  ])("does not blend a reused id across changed ownership or role: %j", (changed) => {
    const session = pair([wireAircraft()], [wireAircraft({ ...changed, position: { x: 60, y: 300, z: 0 } })]);
    expect(session.renderState(220)!.state.airSquadrons[0]!.position.x).toBe(60);
  });

  it("still interpolates positions and heading for old snapshots without flight", () => {
    const session = pair([wireAircraft({ flight: undefined, heading: radians(350) })], [
      wireAircraft({ flight: undefined, heading: radians(10), position: { x: 20, y: 340, z: 0 } }),
    ]);
    const aircraft = session.renderState(220)!.state.airSquadrons[0]!;
    expect(aircraft.position).toEqual({ x: 10, y: 320, z: 0 });
    expect(aircraft.heading).toBeCloseTo(0);
    expect(aircraft).not.toHaveProperty("flight");
  });

  it("accepts new flight state without inventing a zero attitude in the old snapshot", () => {
    const session = pair([wireAircraft({ flight: undefined })], [wireAircraft()]);
    expect(session.renderState(220)!.state.airSquadrons[0]!.flight)
      .toEqual({ speedMetersPerSecond: 100, pitch: 0.1, bank: 0.2 });
  });

  it("does not retain stale flight state when the newer snapshot omits it", () => {
    const session = pair([wireAircraft()], [wireAircraft({ flight: undefined })]);
    expect(session.renderState(220)!.state.airSquadrons[0]).not.toHaveProperty("flight");
  });

  it.each([
    null, [], "flight", {},
    { speedMetersPerSecond: 100, pitch: 0 },
    { speedMetersPerSecond: "100", pitch: 0, bank: 0 },
    { speedMetersPerSecond: Number.NaN, pitch: 0, bank: 0 },
    { speedMetersPerSecond: 100, pitch: Number.POSITIVE_INFINITY, bank: 0 },
    { speedMetersPerSecond: 100, pitch: 0, bank: Number.NEGATIVE_INFINITY },
  ].map((flight) => ({ flight })))("ignores malformed optional flight while retaining a valid aircraft: $flight", ({ flight }) => {
    const session = pair([wireAircraft()], [wireAircraft({ flight })]);
    const aircraft = session.renderState(220)!.state.airSquadrons;
    expect(aircraft).toHaveLength(1);
    expect(aircraft[0]).not.toHaveProperty("flight");
    expect(aircraft[0]!.position.y).toBe(300);
  });

  it.each([-1, 1])("bounds finite but extreme speed and angles (sign %s) without looping", (sign) => {
    const session = client();
    session.receiveSnapshot(snapshot([wireAircraft({
      heading: sign * Number.MAX_VALUE,
      flight: { speedMetersPerSecond: sign * Number.MAX_VALUE, pitch: sign * Number.MAX_VALUE, bank: sign * Number.MAX_VALUE },
    })]), 0);
    const aircraft = session.renderState(120)!.state.airSquadrons[0]!;
    expect(aircraft.flight!.speedMetersPerSecond).toBe(sign < 0 ? 0 : 500);
    expect(aircraft.flight!.pitch).toBe(sign * Math.PI / 2);
    expect(Number.isFinite(aircraft.heading)).toBe(true);
    expect(Number.isFinite(aircraft.flight!.bank)).toBe(true);
    expect(Math.abs(aircraft.heading)).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(aircraft.flight!.bank)).toBeLessThanOrEqual(Math.PI);
  });

  it("does not let flight metadata rescue a malformed aircraft position or heading", () => {
    const session = client();
    session.receiveSnapshot(snapshot([
      wireAircraft({ heading: Number.POSITIVE_INFINITY }),
      wireAircraft({ position: { x: 0, y: Number.NaN, z: 0 } }),
    ]), 0);
    expect(session.renderState(120)!.state.airSquadrons).toEqual([]);
  });

  it("uses the ship extrapolation/freeze timeline and keeps flight bounded during packet loss", () => {
    const session = pair([
      wireAircraft({ flight: { speedMetersPerSecond: 100, pitch: 0, bank: radians(170) } }),
    ], [
      wireAircraft({ position: { x: 20, y: 340, z: 60 }, heading: radians(20),
        flight: { speedMetersPerSecond: 300, pitch: 1, bank: radians(-170) } }),
    ]);
    const freeze = session.renderState(700)!.state.airSquadrons[0]!;
    const later = session.renderState(5_000)!.state.airSquadrons[0]!;
    expect(freeze.position.x).toBeCloseTo(58);
    expect(freeze.position.y).toBeCloseTo(416);
    expect(freeze.heading).toBeCloseTo(radians(58));
    expect(freeze.flight!.speedMetersPerSecond).toBe(500);
    expect(freeze.flight!.pitch).toBe(Math.PI / 2);
    expect(Math.abs(freeze.flight!.bank)).toBeLessThanOrEqual(Math.PI);
    expect(later.position).toEqual(freeze.position);
    expect(later.heading).toBe(freeze.heading);
    expect(later.flight).toEqual(freeze.flight);
  });

  it.each([220, 700])("falls back to finite authority if position blending overflows at %s ms", (now) => {
    const session = pair([
      wireAircraft({ position: { x: -Number.MAX_VALUE, y: 300, z: 0 } }),
    ], [
      wireAircraft({ position: { x: Number.MAX_VALUE, y: 300, z: 0 } }),
    ]);
    const aircraft = session.renderState(now)!.state.airSquadrons[0]!;
    expect(aircraft.position).toEqual({ x: Number.MAX_VALUE, y: 300, z: 0 });
    expect(aircraft.previousPosition).toEqual(aircraft.position);
  });

  it("isolates received and rendered flight objects from the interpolation buffer", () => {
    const session = client();
    const first = snapshot([wireAircraft()]);
    session.receiveSnapshot(first, 0);
    (first.aircraft[0]!.flight as Record<string, unknown>).bank = 2;
    const rendered = session.renderState(120)!.state.airSquadrons[0]!;
    expect(rendered.flight!.bank).toBe(0.2);
    rendered.flight!.bank = 1;
    rendered.position.y = 999;
    const again = session.renderState(120)!.state.airSquadrons[0]!;
    expect(again.flight!.bank).toBe(0.2);
    expect(again.position.y).toBe(300);
  });
});
