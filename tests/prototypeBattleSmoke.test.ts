import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { battleLoadoutFromSlots, createDefaultLocalProfile } from "../src/profile/localProfile";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { BATTLE_DURATION_SECONDS, BATTLE_SPAWN, FIXED_STEP } from "../src/sim/config";
import { createInitialState, observe, stepSimulation } from "../src/sim/simulation";
import type { BattleState, ControlCommand, ShipState, Team } from "../src/sim/types";

const enabled = process.env.PROTOTYPE_BATTLE_SMOKE === "1";
const cases = [{ teamSize: 5, seed: 0x71501 }, { teamSize: 7, seed: 0x71701 }] as const;
const teams = ["player", "enemy"] as const;
const round = (value: number): number => Math.round(value * 100) / 100;

function freshBattle(teamSize: 5 | 7, seed: number): BattleState {
  const profile = createDefaultLocalProfile();
  const build = profile.savedShipBuilds.find(({ id }) => id === profile.selectedBattleBuildId)!;
  const loadout = battleLoadoutFromSlots(build.shipClassId, build.slots);
  return createInitialState(seed, "battle", loadout.mainGunId, loadout, loadout.torpedoId,
    loadout.shipClassId, { teamSize, weatherId: "clear" });
}

function initialChecks(state: BattleState, teamSize: 5 | 7): number {
  expect(BATTLE_DURATION_SECONDS).toBe(20 * 60);
  expect(state.status).toBe("running");
  expect(state.time).toBe(0);
  expect(state.mapId).toBe("atoll-prototype");
  expect(state.weatherId).toBe("clear");
  expect(state.ships).toHaveLength(teamSize * 2);
  for (const team of teams) expect(state.ships.filter((ship) => ship.team === team)).toHaveLength(teamSize);
  expect(state.ships.every((ship) => ship.speedKnots === 0 && ship.throttle === 0)).toBe(true);
  expect(state.ships.every((ship) => ship.navigationZone === "deep")).toBe(true);
  expect(state.ships.filter((ship) => ship.team === "player" && ship.id !== "player").every((ship) => ship.aiControlled)).toBe(true);
  const minimum = Math.min(...state.ships.filter((ship) => ship.team === "player").flatMap((ally) =>
    state.ships.filter((ship) => ship.team === "enemy").map((enemy) => Math.hypot(enemy.position.x - ally.position.x, enemy.position.z - ally.position.z))));
  expect(minimum).toBeGreaterThanOrEqual(5_000);
  expect(minimum).toBeGreaterThanOrEqual(BATTLE_SPAWN.minimumSeparationMeters);
  return minimum;
}

describe("prototype battle launch invariants", () => {
  for (const { teamSize, seed } of cases) it(`${teamSize}v${teamSize} starts the real default saved build stationary, at least 5 km apart`, () => {
    initialChecks(freshBattle(teamSize, seed), teamSize);
  });
  it("clamps the floating-point boundary to exactly twenty minutes on the final scheduled tick", () => {
    const state = freshBattle(5, 0x71fff);
    state.time = BATTLE_DURATION_SECONDS - FIXED_STEP - 5e-10;
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.time).toBe(1_200);
    expect(state.status).toBe("draw");
    expect(state.endReason).toBe("time");
    stepSimulation(state, new Map(), FIXED_STEP);
    expect(state.time).toBe(1_200);
  });
});

interface ShipSmokeMetrics {
  id: string;
  team: Team;
  shipClassId: string;
  travelMeters: number;
  maxSpeedKnots: number;
  shots: number;
  coordinatedTargetChanges: number;
  coordinatedSeconds: number;
  lastCoordinatedTargetId?: string;
  firstShotSeconds?: number;
  firstTargetSeconds?: number;
  creditedHullDamage: number;
  groundedSeconds: number;
  longestGroundedSeconds: number;
  currentGroundedSeconds: number;
  lastPosition: { x: number; z: number };
}

function finiteState(state: BattleState): boolean {
  return state.ships.every((ship) => [ship.hull, ship.speedKnots, ship.heading, ship.position.x,
    ship.position.y, ship.position.z, ship.reloadRemaining, ship.torpedoReloadRemaining].every(Number.isFinite))
    && state.projectiles.every((projectile) => [projectile.position.x, projectile.position.y,
      projectile.position.z, projectile.velocity.x, projectile.velocity.y, projectile.velocity.z].every(Number.isFinite));
}

describe.skipIf(!enabled)("prototype long-running fixed-step battle smoke", () => {
  for (const { teamSize, seed } of cases) it(`${teamSize}v${teamSize} AI fleets navigate, acquire, fire, damage and terminate within twenty minutes`, () => {
    const start = performance.now();
    const state = freshBattle(teamSize, seed);
    const minimumSeparationMeters = initialChecks(state, teamSize);
    const session = new LocalBattleSession(state);
    // Substitute a normal controller for keyboard input only. Allied/enemy AI is the production session path.
    const playerProxy = new RuleBasedAi(seed ^ 0x071a);
    const metrics = new Map<string, ShipSmokeMetrics>(state.ships.map((ship) => [ship.id, {
      id: ship.id, team: ship.team, shipClassId: ship.shipClassId, travelMeters: 0, maxSpeedKnots: 0,
      shots: 0, coordinatedTargetChanges: 0, coordinatedSeconds: 0,
      creditedHullDamage: 0, groundedSeconds: 0, longestGroundedSeconds: 0,
      currentGroundedSeconds: 0, lastPosition: { x: ship.position.x, z: ship.position.z },
    }]));
    const fleetGroundedRun: Record<Team, number> = { player: 0, enemy: 0 };
    const maxFleetGrounded: Record<Team, number> = { player: 0, enemy: 0 };
    const damage: Record<Team, number> = { player: 0, enemy: 0 };
    const maximumConcurrentAssignedTargets: Record<Team, number> = { player: 0, enemy: 0 };
    let firstDamageSeconds: number | undefined;
    let steps = 0;
    const stepBudget = Math.ceil(BATTLE_DURATION_SECONDS / FIXED_STEP) + 2;
    while (state.status === "running" && steps < stepBudget) {
      const player = state.ships.find(({ id }) => id === "player")!;
      const commands = new Map<string, ControlCommand>();
      if (player.hull > 0) commands.set(player.id, playerProxy.command(observe(state, player.id)));
      const output = session.step(commands, FIXED_STEP);
      ++steps;
      for (const shot of output.shots) {
        const metric = metrics.get(shot.ownerId);
        if (metric) { ++metric.shots; metric.firstShotSeconds ??= state.time; }
      }
      for (const event of output.hullDamage ?? []) {
        const source = event.creditedOwnerId ? metrics.get(event.creditedOwnerId) : undefined;
        const target = metrics.get(event.targetId);
        if (source && target && source.team !== target.team && event.damage > 0) {
          source.creditedHullDamage += event.damage;
          damage[source.team] += event.damage;
          firstDamageSeconds ??= state.time;
        }
      }
      for (const ship of state.ships) {
        const metric = metrics.get(ship.id)!;
        metric.travelMeters += Math.hypot(ship.position.x - metric.lastPosition.x, ship.position.z - metric.lastPosition.z);
        metric.lastPosition = { x: ship.position.x, z: ship.position.z };
        metric.maxSpeedKnots = Math.max(metric.maxSpeedKnots, Math.abs(ship.speedKnots));
        if (ship.aiDecision?.targetId) metric.firstTargetSeconds ??= state.time;
        if (ship.hull > 0 && ship.aiDecision?.coordinatedTarget && ship.aiDecision.targetId) {
          const id = ship.aiDecision.targetId;
          if (metric.lastCoordinatedTargetId && metric.lastCoordinatedTargetId !== id)
            metric.coordinatedTargetChanges += 1;
          metric.lastCoordinatedTargetId = id;
          metric.coordinatedSeconds += FIXED_STEP;
        }
        if (ship.hull > 0 && ship.navigationZone === "grounded") {
          metric.groundedSeconds += FIXED_STEP;
          metric.currentGroundedSeconds += FIXED_STEP;
          metric.longestGroundedSeconds = Math.max(metric.longestGroundedSeconds, metric.currentGroundedSeconds);
        } else metric.currentGroundedSeconds = 0;
      }
      for (const team of teams) {
        const alive = state.ships.filter((ship) => ship.team === team && ship.hull > 0);
        const assignedIds = new Set(alive.filter((ship) => ship.aiDecision?.coordinatedTarget)
          .map((ship) => ship.aiDecision?.targetId).filter(Boolean));
        maximumConcurrentAssignedTargets[team] = Math.max(
          maximumConcurrentAssignedTargets[team], assignedIds.size,
        );
        const stalled = alive.length >= 2 && alive.every((ship) => ship.navigationZone === "grounded" && Math.abs(ship.speedKnots) < .25);
        fleetGroundedRun[team] = stalled ? fleetGroundedRun[team] + FIXED_STEP : 0;
        maxFleetGrounded[team] = Math.max(maxFleetGrounded[team], fleetGroundedRun[team]);
      }
      if (steps % 60 === 0) expect(finiteState(state), `finite state at ${state.time}s`).toBe(true);
    }
    const all = [...metrics.values()];
    const allies = all.filter((metric) => metric.team === "player" && metric.id !== "player");
    const report = {
      kind: "representative-ai-battle", teamSize, seed, weather: state.weatherId,
      defaultBuild: "default-fletcher", fixedStep: FIXED_STEP, minimumSeparationMeters,
      status: state.status, endReason: state.endReason, durationSeconds: round(state.time), steps,
      wallSeconds: round((performance.now() - start) / 1_000), firstDamageSeconds: firstDamageSeconds === undefined ? null : round(firstDamageSeconds),
      opposingHullDamage: { player: round(damage.player), enemy: round(damage.enemy) },
      finalScores: state.objective.scores, maximumFleetAllGroundedSeconds: maxFleetGrounded,
      maximumConcurrentAssignedTargets,
      ships: all.map((metric) => ({ id: metric.id, class: metric.shipClassId, team: metric.team,
        travelMeters: round(metric.travelMeters), maxSpeedKnots: round(metric.maxSpeedKnots), shots: metric.shots,
        coordinatedTargetChanges: metric.coordinatedTargetChanges, coordinatedSeconds: round(metric.coordinatedSeconds),
        firstTargetSeconds: metric.firstTargetSeconds === undefined ? null : round(metric.firstTargetSeconds),
        firstShotSeconds: metric.firstShotSeconds === undefined ? null : round(metric.firstShotSeconds),
        creditedHullDamage: round(metric.creditedHullDamage), longestGroundedSeconds: round(metric.longestGroundedSeconds),
        remainingHull: round(state.ships.find(({ id }) => id === metric.id)!.hull),
      })),
    };
    console.log(`PROTOTYPE_BATTLE_REPORT ${JSON.stringify(report)}`);
    expect(state.status).not.toBe("running");
    expect(state.time).toBeLessThanOrEqual(BATTLE_DURATION_SECONDS);
    expect(["destroyed", "score", "time"]).toContain(state.endReason);
    for (const ally of allies) {
      expect(ally.travelMeters, `${ally.id} moved`).toBeGreaterThan(100);
      expect(ally.firstTargetSeconds, `${ally.id} acquired an enemy`).toBeDefined();
    }
    for (const ship of all) {
      expect(ship.longestGroundedSeconds, `${ship.id} is not stranded individually for 30 seconds`).toBeLessThan(30);
    }
    expect(allies.filter((metric) => metric.shots > 0).length).toBeGreaterThanOrEqual(Math.ceil(allies.length / 2));
    for (const team of teams) {
      expect(damage[team], `${team} damaged an opponent`).toBeGreaterThan(0);
      expect(maxFleetGrounded[team], `${team} is not a wholly grounded fleet for 30 seconds`).toBeLessThan(30);
    }
    const finalTime = state.time;
    const finalStatus = state.status;
    for (let index = 0; index < 120; ++index) session.step(new Map(), FIXED_STEP);
    expect(state.time).toBe(finalTime);
    expect(state.status).toBe(finalStatus);
  }, 240_000);

  it("a separate no-input control executes the entire 20-minute clock and terminates exactly at the limit", () => {
    const start = performance.now();
    const state = freshBattle(5, 0x71fff);
    initialChecks(state, 5);
    const session = new LocalBattleSession(state);
    const stationary = (ship: ShipState): ControlCommand => ({ throttle: 0, rudder: 0, aimPoint: { ...ship.aimPoint }, fire: false });
    // Explicit commands suppress automatic controllers, preserving a combat-free clock-control case.
    const commands = new Map(state.ships.map((ship) => [ship.id, stationary(ship)]));
    let steps = 0;
    const budget = Math.ceil(BATTLE_DURATION_SECONDS / FIXED_STEP) + 2;
    while (state.status === "running" && steps < budget) { session.step(commands, FIXED_STEP); ++steps; }
    console.log(`PROTOTYPE_BATTLE_REPORT ${JSON.stringify({ kind: "full-clock-control", teamSize: 5, seed: 0x71fff,
      steps, durationSeconds: round(state.time), status: state.status, endReason: state.endReason,
      wallSeconds: round((performance.now() - start) / 1_000) })}`);
    expect(steps).toBe(72_000);
    expect(state.time).toBe(1_200);
    expect(state.status).toBe("draw");
    expect(state.endReason).toBe("time");
    expect(state.ships.every((ship) => ship.hull === ship.maxHull && ship.speedKnots === 0)).toBe(true);
  }, 180_000);
});
