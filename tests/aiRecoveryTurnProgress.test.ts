import { describe, expect, it } from "vitest";
import { AiNavigationRecovery, type AiNavigationCommand } from "../src/sim/aiNavigation";
import { battleMapDefinition, firstNavigationHazard, shipDraftMeters, terrainNavigationAt, terrainSafeHeading } from "../src/maps/atollMap";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import { getShipClass } from "../src/ships/classes";
import type { Team } from "../src/sim/types";

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const firstExit = .9037183269189253;
const driftingExit = 2.529301106370101;
const oppositeExit = 4.404187468814294;

// Public coastal placement starts a fresh navigation instance. Caller headings
// reproduce the observed destination drift; private recovery state is never seeded.
// This is a bounded navigation/physics regression, not the full historical battle.
function fixture(team: Team = "player") {
  const state = createInitialState(0x71501 + 211, "sea-trials");
  state.mapId = "atoll-prototype"; state.airSupport = "none"; state.airSquadrons = [];
  const ship = createDeveloperShipState({ id: "turn-progress", team, shipClassId: "edinburgh",
    position: { x: -445.75217743850914, y: 0, z: 700.1515572989904 }, heading: 5.298828989342599,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  const terrain = terrainNavigationAt(state.mapId, ship.position.x, ship.position.z, shipDraftMeters(ship.shipClassId));
  ship.navigationZone = terrain.kind; ship.waterDepthMeters = terrain.depthMeters;
  const sentinel = createDeveloperShipState({ id: "remote-sentinel", team: team === "player" ? "enemy" : "player",
    shipClassId: "fletcher", position: { x: 5000, y: 0, z: 5000 }, heading: 0,
    mainGunMounts: 0, torpedoLauncherMounts: 0, secondaryGunIds: [] });
  state.ships = [ship, sentinel];
  const recovery = new AiNavigationRecovery();
  let command: AiNavigationCommand;
  const step = (heading = firstExit, actualRudder?: number) => {
    command = recovery.command(state.mapId, ship, heading, state.time);
    stepSimulation(state, new Map([[ship.id, { throttle: command.throttleLimit ?? .88,
      rudder: actualRudder ?? Math.max(-.82, Math.min(.82, wrap(command.desiredHeading - ship.heading) * 1.25)),
      fire: false, aimPoint: { ...ship.aimPoint } }]]), FIXED_STEP);
    return command;
  };
  const advance = (seconds: number, heading = firstExit) => {
    for (let tick = 0; tick < Math.ceil(seconds / FIXED_STEP); ++tick) step(heading);
    return command!;
  };
  expect(step()).toMatchObject({ recovering: true, throttleLimit: -.25 });
  for (let tick = 0; tick < 90 / FIXED_STEP; ++tick) {
    step();
    if (recovery.getTelemetry()?.phase === "reorienting" && Math.abs(ship.speedKnots) < .1) break;
  }
  expect(recovery.getTelemetry()).toMatchObject({ phase: "reorienting", forwardClear: false });
  expect(Math.abs(ship.speedKnots)).toBeLessThan(.1);
  return { state, ship, recovery, step, advance };
}

function progressed(team: Team = "player", degrees = 40) {
  const result = fixture(team), initialHeading = result.ship.heading;
  for (let tick = 0; tick < 160 / FIXED_STEP; ++tick) {
    result.step();
    if (wrap(result.ship.heading - initialHeading) >= degrees * Math.PI / 180) break;
  }
  expect(wrap(result.ship.heading - initialHeading)).toBeGreaterThanOrEqual(degrees * Math.PI / 180);
  expect(result.recovery.getTelemetry()).toMatchObject({ phase: "reorienting", forwardClear: false, exitCommitted: false });
  return result;
}

function reverseCandidate(result: ReturnType<typeof fixture>) {
  result.advance(.6, driftingExit);
  return result.advance(.6, oppositeExit);
}

describe("blocked recovery preserves verified physical turn progress only on candidate reversal", () => {
  for (const team of ["player", "enemy"] as const) {
    it(team + " keeps an earlier safe exit after actual same-direction hull rotation", () => {
      const result = progressed(team), { ship, state, recovery } = result;
      const hull = getShipClass(ship.shipClassId), padding = hull.beam * .6 + 12;
      const end = { x: ship.position.x + Math.sin(firstExit) * 1000, y: 0,
        z: ship.position.z + Math.cos(firstExit) * 1000 };
      expect(firstNavigationHazard(state.mapId, ship.position, end, shipDraftMeters(ship.shipClassId), padding)).toBeUndefined();
      const command = reverseCandidate(result);
      expect(command.desiredHeading).toBeCloseTo(firstExit, 10);
      expect(wrap(command.desiredHeading - ship.heading)).toBeGreaterThan(0);
      expect(command.throttleLimit).toBe(0);
      expect(recovery.getTelemetry()?.exitCommitted).toBe(true);
      if (team === "player") {
        let released = false, normalSeconds = 0, normalTravel = 0, grounded = 0;
        for (let tick = 0; tick < 400 / FIXED_STEP; ++tick) {
          const before = { ...ship.position };
          const next = result.step(released ? firstExit : oppositeExit);
          if (!next.recovering) released = true;
          if (released) {
            expect(next.recovering).toBe(false);
            normalSeconds += FIXED_STEP;
            normalTravel += Math.hypot(ship.position.x - before.x, ship.position.z - before.z);
          }
          if (ship.navigationZone === "grounded") grounded += FIXED_STEP;
          if (normalSeconds >= 30) break;
        }
        expect(released).toBe(true);
        expect(normalSeconds).toBeGreaterThanOrEqual(30);
        expect(normalTravel).toBeGreaterThan(40);
        expect(grounded).toBe(0); // Center-contact physics; not a full-hull clearance claim.
      }
    });
  }
});


describe("uncommitted recovery turn history cannot manufacture continuity", () => {
  it("does not promote an earlier exit with less than twenty degrees of actual progress", () => {
    const result = progressed("player", 10);
    result.advance(.6, 1.8);
    const command = result.advance(.6, 2.8);
    expect(command.desiredHeading).toBeCloseTo(1.8, 10);
    expect(result.recovery.getTelemetry()?.exitCommitted).toBe(true);
  });

  it.each(["cached emergency", "time gap", "time reversal", "map change", "pose jump", "moving"] as const)(
    "discards earlier progress after %s without changing the old commitment rule", change => {
      const result = progressed(), { recovery, state, ship } = result;
      if (change === "cached emergency") {
        const cached = recovery.command(state.mapId, ship, firstExit, state.time);
        expect(recovery.command(state.mapId, ship, firstExit, state.time, true)).toEqual(cached);
      } else if (change === "time gap") state.time += 2;
      else if (change === "time reversal") recovery.command(state.mapId, ship, firstExit, state.time - 2);
      else if (change === "map change") recovery.command("open-sea-range", ship, firstExit, state.time);
      else if (change === "pose jump") { ship.position.x += 3; ship.previousPosition = { ...ship.position }; }
      else ship.speedKnots = 1;
      const command = reverseCandidate(result);
      expect(command.desiredHeading).toBeCloseTo(oppositeExit, 10);
    },
  );

  it("resets earlier credit when the real rudder physically turns back the other way", () => {
    const result = progressed();
    const before = result.ship.heading;
    // Public physical countersteering stands for changed control, not a private
    // navigation field injection or a synthetic instantaneous heading jump.
    for (let tick = 0; tick < 9 / FIXED_STEP; ++tick) result.step(firstExit, -.82);
    expect(wrap(result.ship.heading - before)).toBeLessThan(0);
    expect(reverseCandidate(result).desiredHeading).toBeCloseTo(oppositeExit, 10);
  });
});


describe("earlier exits keep their long-corridor and angular evidence requirements", () => {
  it("does not invent progress from repeated physical left/right motion", () => {
    const result = fixture(), initialHeading = result.ship.heading;
    let accumulatedTurn = 0;
    for (let tick = 0; tick < 120 / FIXED_STEP; ++tick) {
      const before = result.ship.heading;
      result.step(firstExit, Math.floor(tick * FIXED_STEP / 8) % 2 ? -.82 : .82);
      accumulatedTurn += Math.abs(wrap(result.ship.heading - before));
    }
    expect(accumulatedTurn).toBeGreaterThan(20 * Math.PI / 180);
    expect(Math.abs(wrap(result.ship.heading - initialHeading))).toBeLessThan(20 * Math.PI / 180);
    result.advance(.6, 1.8);
    expect(result.advance(.6, 2.8).desiredHeading).not.toBeCloseTo(firstExit, 8);
  });

  it("treats a plus/minus two-pi representation change as zero physical turn", () => {
    const result = progressed();
    result.ship.heading -= Math.PI * 2;
    expect(reverseCandidate(result).desiredHeading).toBeCloseTo(firstExit, 10);
  });

  it("does not record an exit whose short corridor clears but whose kilometre corridor crosses the map edge", () => {
    const result = fixture(), { state, ship, recovery } = result;
    // Public phase-boundary guard; the positive tests above enter recovery using
    // actual coastal physics. No private recovery fields are seeded here.
    state.mapId = "open-sea-range"; ship.position = { x: 0, y: 0, z: 5800 };
    ship.previousPosition = { ...ship.position }; ship.heading = 0; ship.speedKnots = 0;
    const hull = getShipClass(ship.shipClassId), limit = battleMapDefinition(state.mapId).halfExtentMeters - (hull.beam * .6 + 12);
    expect(ship.position.z + Math.cos(firstExit) * hull.length * 1.4).toBeLessThan(limit);
    expect(ship.position.z + Math.cos(firstExit) * 1000).toBeGreaterThan(limit);
    for (let tick = 0; tick < 150 / FIXED_STEP; ++tick) {
      result.step();
      if (ship.heading >= 40 * Math.PI / 180) break;
    }
    expect(ship.heading).toBeGreaterThanOrEqual(40 * Math.PI / 180);
    expect(recovery.getTelemetry()).toMatchObject({ phase: "reorienting", forwardClear: false, exitCommitted: false });
    result.advance(.6, 2.5);
    expect(result.advance(.6, -1).desiredHeading).toBeCloseTo(-1, 10);
  });

  it("revalidates the kilometre corridor after a history-derived exit has been committed", () => {
    const result = progressed(), { state, ship, recovery } = result;
    expect(reverseCandidate(result).desiredHeading).toBeCloseTo(firstExit, 10);
    const hull = getShipClass(ship.shipClassId), padding = hull.beam * .6 + 12;
    const limit = battleMapDefinition(state.mapId).halfExtentMeters - padding;
    ship.position = { x: limit - 300, y: 0, z: 0 }; ship.previousPosition = { ...ship.position };
    const shortEnd = { x: ship.position.x + Math.sin(firstExit) * hull.length * 1.4, y: 0,
      z: ship.position.z + Math.cos(firstExit) * hull.length * 1.4 };
    expect(shortEnd.x).toBeLessThan(limit);
    expect(firstNavigationHazard(state.mapId, ship.position, shortEnd, shipDraftMeters(ship.shipClassId), padding)).toBeUndefined();
    expect(ship.position.x + Math.sin(firstExit) * 1000).toBeGreaterThan(limit);
    const expected = terrainSafeHeading(state.mapId, ship.position, oppositeExit, ship.shipClassId);
    const next = result.advance(.6, oppositeExit);
    expect(next.desiredHeading).toBeCloseTo(expected, 10);
    expect(next.desiredHeading).not.toBeCloseTo(firstExit, 8);
    expect(recovery.getTelemetry()?.exitCommitted).toBe(false);

    // A later ordinary two-candidate commitment must not inherit the stronger
    // history-origin contract. Its established short-corridor behavior remains.
    state.mapId = "open-sea-range"; ship.position = { x: 0, y: 0, z: 5800 };
    ship.previousPosition = { ...ship.position }; ship.heading = 0; ship.speedKnots = 0;
    result.advance(.6, 2.5);
    expect(result.advance(.6, -1).desiredHeading).toBeCloseTo(-1, 10);
    expect(recovery.getTelemetry()?.exitCommitted).toBe(true);
    expect(ship.position.z + Math.cos(-1) * hull.length * 1.4).toBeLessThan(limit);
    expect(ship.position.z + Math.cos(-1) * 1000).toBeGreaterThan(limit);
    expect(result.advance(.6, 2.4).desiredHeading).toBeCloseTo(-1, 10);
    expect(recovery.getTelemetry()?.exitCommitted).toBe(true);
  });
  it("drops a history commitment when the short corridor clears but the kilometre corridor reaches a real atoll shoal", () => {
    const result = progressed(), { state, ship, recovery } = result;
    expect(reverseCandidate(result).desiredHeading).toBeCloseTo(firstExit, 10);
    // Public pose-change guard, not a claim that this relocation was sailed.
    ship.position = { x: -1500, y: 0, z: 200 }; ship.previousPosition = { ...ship.position };
    const hull = getShipClass(ship.shipClassId), padding = hull.beam * .6 + 12;
    const end = (distance: number) => ({ x: ship.position.x + Math.sin(firstExit) * distance, y: 0,
      z: ship.position.z + Math.cos(firstExit) * distance });
    const extent = battleMapDefinition(state.mapId).halfExtentMeters - padding;
    const longEnd = end(1000);
    expect(Math.max(Math.abs(longEnd.x), Math.abs(longEnd.z))).toBeLessThan(extent);
    expect(firstNavigationHazard(state.mapId, ship.position, end(hull.length * 1.4),
      shipDraftMeters(ship.shipClassId), padding)).toBeUndefined();
    const hazard = firstNavigationHazard(state.mapId, ship.position, longEnd, shipDraftMeters(ship.shipClassId), padding);
    expect(hazard?.zone.id).toBe("central-shoal-nw");
    const next = recovery.command(state.mapId, ship, oppositeExit, state.time + .6);
    expect(next.desiredHeading).not.toBeCloseTo(firstExit, 8);
    expect(next.desiredHeading).toBeCloseTo(terrainSafeHeading(state.mapId, ship.position, oppositeExit, ship.shipClassId), 10);
    expect(recovery.getTelemetry()?.exitCommitted).toBe(false);
  });

});
