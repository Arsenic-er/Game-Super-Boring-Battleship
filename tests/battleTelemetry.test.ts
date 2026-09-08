import { describe, expect, it } from "vitest";
import { BattleTelemetryAccumulator } from "../src/progression/battleTelemetry";
import { LocalBattleSession } from "../src/session/localBattleSession";
import { createInitialState, takeLocalShipDestroyedEvents } from "../src/sim/simulation";
import { replicationViewFor } from "../src/net/replicationView";
import type { BattleState, ControlCommand, ProjectileState, ShipState } from "../src/sim/types";
import type { BattleStepOutput } from "../src/session/battleSession";

function fixture(seed = 17) {
  const state = createInitialState(seed, "sea-trials");
  const target = state.ships.find((ship) => ship.id === "test-target")!;
  target.position = { x: 0, y: 0, z: 0 };
  target.previousPosition = { ...target.position };
  target.heading = 0;
  const session = new LocalBattleSession(state);
  const telemetry = new BattleTelemetryAccumulator("player");
  return { state, target, session, telemetry };
}
function commands(state: BattleState): Map<string, ControlCommand> {
  return new Map(state.ships.map((ship) => [ship.id, { throttle: 0, rudder: 0, aimPoint: { ...ship.aimPoint }, fire: false }]));
}
function shoot(state: BattleState, ownerId = "player", kind: ProjectileState["kind"] = "shell", weaponSource: ProjectileState["weaponSource"] = "mainGun", damage = 105) {
  const position = { x: -20, y: kind === "torpedo" ? 0 : 5, z: 0 };
  state.projectiles.push({ id: state.nextEntityId++, ownerId, team: "player", kind, weaponSource, ammoType: "he",
    position, previousPosition: { ...position }, velocity: { x: 1000, y: 0, z: 0 }, damage, age: 1 });
}
function addAlly(state: BattleState): ShipState {
  const ally = structuredClone(state.ships.find((ship) => ship.id === "player")!);
  ally.id = "ally-ai";
  ally.position = { x: 2000, y: 0, z: -1000 };
  ally.previousPosition = { ...ally.position };
  state.ships.push(ally);
  return ally;
}

describe("local battle telemetry with authoritative hull loss", () => {
  it("clamps overkill to actual hull loss, attributes a direct sink once, and never leaks local events onto LAN", () => {
    const { state, target, session, telemetry } = fixture();
    target.hull = 1;
    shoot(state);
    const output = session.step(commands(state), 0.05);
    expect(output.impacts.some((impact) => impact.targetId === target.id && impact.damage! > 1)).toBe(true);
    expect(output.destroyedShips).toEqual([{ targetId: target.id, creditedOwnerId: "player", cause: "direct" }]);
    expect(output.hullDamage!.reduce((sum, event) => sum + event.damage, 0)).toBe(1);
    telemetry.consume(output); telemetry.consume(output);
    expect(telemetry.summary(state)).toMatchObject({ damageDealt: 1, shellHits: 1, torpedoHits: 0, shipsSunk: 1 });
    expect(takeLocalShipDestroyedEvents(state)).toEqual([]);
    const payload = replicationViewFor(state, "player", 2, 0);
    expect(payload.events.some((event) => event.kind === "hit")).toBe(true);
    expect(payload.events.every((event) => event.kind !== "destroyed" && event.kind !== "hullDamage")).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("creditedOwnerId");
    expect(Object.keys(state)).not.toContain("destroyedShips");
    expect(Object.keys(state)).not.toContain("hullDamage");
    const next = session.step(commands(state), 0.05);
    expect(next.destroyedShips).toEqual([]);
  });
  it("counts actual module secondary hull damage in addition to nominal impact damage", () => {
    const { state, target, session, telemetry } = fixture();
    // A low side hit through the magazine triggers secondary hull loss.
    shoot(state);
    state.projectiles[0]!.position.z = -25;
    state.projectiles[0]!.previousPosition.z = -25;
    const before = target.hull;
    const output = session.step(commands(state), 0.05);
    telemetry.consume(output);
    expect(output.impacts.some((impact) => impact.targetId === target.id)).toBe(true);
    expect(telemetry.summary(state).damageDealt).toBeCloseTo(before - target.hull, 10);
    expect(output.hullDamage!.length).toBeGreaterThan(1);
  });
  it("excludes friendly AI damage and kills even though the owner team is player", () => {
    const { state, target, session, telemetry } = fixture();
    addAlly(state);
    target.hull = 1;
    shoot(state, "ally-ai");
    const output = session.step(commands(state), 0.05);
    expect(output.destroyedShips![0]!.creditedOwnerId).toBe("ally-ai");
    telemetry.consume(output);
    expect(telemetry.summary(state)).toMatchObject({ damageDealt: 0, shellHits: 0, torpedoHits: 0, shipsSunk: 0 });
  });
  it("counts only main-gun shell and ship torpedo hits, while secondary and aircraft damage remains player-owned", () => {
    const { state, session, telemetry } = fixture();
    for (const [kind, source] of [["shell", "mainGun"], ["shell", "secondary"], ["shell", "aircraft"], ["torpedo", undefined], ["torpedo", "aircraft"]] as const) {
      const target = state.ships.find((ship) => ship.id === "test-target")!;
      target.hull = target.maxHull;
      shoot(state, "player", kind, source, 10);
      const output = session.step(commands(state), 0.05);
      expect(output.impacts.some((impact) => impact.targetId === target.id)).toBe(true);
      telemetry.consume(output);
    }
    expect(telemetry.summary(state)).toMatchObject({ shellHits: 1, torpedoHits: 1, shipsSunk: 0 });
    expect(telemetry.summary(state).damageDealt).toBeGreaterThan(0);
  });
  it.each(["fire", "flood"] as const)("attributes a later %s sink to the projectile that caused the ongoing effect", (cause) => {
    let found: ReturnType<typeof fixture> | undefined;
    let initial: BattleStepOutput | undefined;
    for (let seed = 1; seed <= 100; seed++) {
      const setup = fixture(seed);
      shoot(setup.state, "player", cause === "fire" ? "shell" : "torpedo", "mainGun", 10);
      const output = setup.session.step(commands(setup.state), 0.05);
      if (cause === "fire" ? output.impacts.some((impact) => impact.startedFire) : output.impacts.some((impact) => impact.startedFlooding)) {
        found = setup; initial = output; break;
      }
    }
    expect(found, "at least one fixed seed must produce the actual effect").toBeDefined();
    const { state, target, session, telemetry } = found!;
    telemetry.consume(initial!);
    const damageBefore = telemetry.summary(state).damageDealt;
    target.hull = 0.01;
    if (cause === "fire") target.flooding = 0; else target.fireIntensity = 0;
    const output = session.step(commands(state), 0.05);
    expect(output.destroyedShips).toEqual([{ targetId: target.id, creditedOwnerId: "player", cause }]);
    expect(output.impacts.filter((impact) => impact.kind === "hit")).toEqual([]);
    telemetry.consume(output);
    expect(telemetry.summary(state).damageDealt - damageBefore).toBeCloseTo(0.01, 10);
    expect(telemetry.summary(state).shipsSunk).toBe(1);
    expect(session.step(commands(state), 0.05).destroyedShips).toEqual([]);
  });
  it("does not invent ownership for a pre-existing fire", () => {
    const { state, target, session, telemetry } = fixture();
    target.fireIntensity = 100; target.hull = 0.01;
    const output = session.step(commands(state), 0.05);
    expect(output.destroyedShips).toEqual([{ targetId: target.id, creditedOwnerId: undefined, cause: "fire" }]);
    telemetry.consume(output);
    expect(telemetry.summary(state)).toMatchObject({ damageDealt: 0, shipsSunk: 0 });
  });
  it("does not credit a collision sink to either ship", () => {
    const state = createInitialState(31, "battle", undefined, undefined, undefined, undefined, { teamSize: 1 });
    const player = state.ships.find((ship) => ship.id === "player")!;
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    player.position = { x: 0, y: 0, z: 0 }; enemy.position = { x: 0, y: 0, z: 72 };
    player.heading = 0; enemy.heading = Math.PI;
    player.speedKnots = 24; enemy.speedKnots = 24; enemy.hull = 0.01;
    const session = new LocalBattleSession(state);
    const output = session.step(commands(state), 1 / 60);
    expect(output.destroyedShips!.some((event) => event.targetId === "enemy" && event.cause === "collision" && event.creditedOwnerId === undefined)).toBe(true);
    const telemetry = new BattleTelemetryAccumulator("player"); telemetry.consume(output);
    expect(telemetry.summary(state).shipsSunk).toBe(0);
  });
  it("freezes final statistics and objective scores even if later frames or callers mutate their copies", () => {
    const { state, target, session, telemetry } = fixture();
    target.hull = 1; shoot(state);
    const output = session.step(commands(state), 0.05);
    state.status = "player-won"; state.time = 81;
    state.objective.scores.player = 60; state.objective.scores.enemy = 17;
    telemetry.consume(output);
    const frozen = telemetry.summary(state);
    expect(frozen).toMatchObject({ durationSeconds: 81, damageDealt: 1, shipsSunk: 1, playerScore: 60, enemyScore: 17 });
    frozen.damageDealt = 999;
    state.time = 1000; state.objective.scores.player = 1000;
    telemetry.consume(output);
    expect(telemetry.summary(state)).toMatchObject({ durationSeconds: 81, damageDealt: 1, playerScore: 60 });
  });
});
