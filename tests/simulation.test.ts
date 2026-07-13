import { describe, expect, it } from "vitest";
import { RuleBasedAi } from "../src/controllers/ruleBasedAi";
import { BATTLE_DURATION_SECONDS, FIXED_STEP, GUN } from "../src/sim/config";
import {
  FRONT_TURRET_TRAVERSE_LIMIT_RADIANS,
  MAIN_GUNS,
} from "../src/ships/components";
import {
  ballisticVelocity,
  collisionDamageMultiplierFor,
  createInitialState,
  gunMuzzleOrigin,
  gunMuzzleOrigins,
  observe,
  stepSimulation,
  turretAimPoint,
} from "../src/sim/simulation";
import type { ControlCommand } from "../src/sim/types";

const idle = (x: number, z: number): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { x, y: 0, z },
  fire: false,
});

describe("deterministic battle simulation", () => {
  it("repeats the same state for the same seed and actions", () => {
    const left = createInitialState(42);
    const right = createInitialState(42);
    for (let tick = 0; tick < 600; tick += 1) {
      const commands = new Map([
        ["player", { ...idle(0, 1_200), throttle: 0.75, rudder: 0.25, fire: tick > 300 }],
        ["enemy", { ...idle(0, -900), throttle: 0.6, rudder: -0.2, fire: tick > 300 }],
      ]);
      stepSimulation(left, commands, FIXED_STEP);
      stepSimulation(right, commands, FIXED_STEP);
    }
    expect(right).toEqual(left);
  });

  it("crew damage slows module repair", () => {
    const healthyCrew = createInitialState();
    const weakCrew = createInitialState();
    healthyCrew.ships[0]!.modules.engine.health = 100;
    weakCrew.ships[0]!.modules.engine.health = 100;
    weakCrew.ships[0]!.modules.crew.health = 24;
    const commands = new Map([["player", idle(0, 1_000)], ["enemy", idle(0, -1_000)]]);
    for (let tick = 0; tick < 600; tick += 1) {
      stepSimulation(healthyCrew, commands, FIXED_STEP);
      stepSimulation(weakCrew, commands, FIXED_STEP);
    }
    expect(healthyCrew.ships[0]!.modules.engine.health)
      .toBeGreaterThan(weakCrew.ships[0]!.modules.engine.health);
  });

  it("does not repair a destroyed module", () => {
    const state = createInitialState();
    state.ships[0]!.modules.steering.health = 0;
    const commands = new Map([["player", idle(0, 1_000)], ["enemy", idle(0, -1_000)]]);
    for (let tick = 0; tick < 600; tick += 1) stepSimulation(state, commands, FIXED_STEP);
    expect(state.ships[0]!.modules.steering.health).toBe(0);
  });

  it("produces a finite low ballistic arc", () => {
    const velocity = ballisticVelocity(
      { x: 0, y: GUN.muzzleHeight, z: 0 },
      { x: 0, y: 0, z: 2_000 },
    );
    expect(velocity).not.toBeNull();
    expect(velocity!.y).toBeGreaterThan(0);
    expect(Math.hypot(velocity!.x, velocity!.y, velocity!.z)).toBeCloseTo(GUN.muzzleVelocity, 5);
  });

  it("fires along the current barrel direction before the turret is aligned", () => {
    const state = createInitialState(91);
    const player = state.ships[0]!;
    const turnAndFire: ControlCommand = {
      throttle: 0,
      rudder: 0,
      aimPoint: { x: 2_000, y: 0, z: player.position.z },
      fire: true,
    };
    const commands = new Map<string, ControlCommand>([
      ["player", turnAndFire],
      ["enemy", idle(180, -1_000)],
    ]);
    stepSimulation(state, commands, FIXED_STEP);
    expect(state.projectiles).toHaveLength(1);
    expect(player.turretHeading).toBeGreaterThan(0);
    const projectile = state.projectiles[0]!;
    expect(projectile.velocity.z).toBeGreaterThan(Math.abs(projectile.velocity.x) * 20);
    expect(player.reloadRemaining).toBeGreaterThan(0);
  });

  it("applies the equipped main gun stats to projectiles and reload", () => {
    const state = createInitialState(92, "sea-trials", "mk2-twin");
    const player = state.ships[0]!;
    const command = {
      ...idle(player.position.x, player.position.z + 2_000),
      fire: true,
    };
    stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    expect(player.mainGunId).toBe("mk2-twin");
    expect(state.projectiles).toHaveLength(2);
    expect(state.shots).toHaveLength(2);
    expect(state.projectiles.reduce((sum, projectile) => sum + projectile.damage, 0))
      .toBeCloseTo(MAIN_GUNS["mk2-twin"].damage, 5);
    expect(state.projectiles[0]?.position).not.toEqual(state.projectiles[1]?.position);
    expect(Math.hypot(
      (state.shots[0]?.position.x ?? 0) - (state.shots[1]?.position.x ?? 0),
      (state.shots[0]?.position.z ?? 0) - (state.shots[1]?.position.z ?? 0),
    )).toBeCloseTo(MAIN_GUNS["mk2-twin"].visual.barrelSpacing, 5);
    expect(player.reloadRemaining).toBeCloseTo(MAIN_GUNS["mk2-twin"].reloadSeconds, 1);
  });

  it("launches a two-torpedo spread from weapon slot 2 with an independent reload", () => {
    const state = createInitialState(96, "sea-trials");
    const player = state.ships[0]!;
    const command: ControlCommand = {
      ...idle(player.position.x, player.position.z + 2_000),
      fire: true,
      weaponSlot: "torpedo",
    };
    stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    const torpedoes = state.projectiles.filter((projectile) => projectile.kind === "torpedo");
    expect(torpedoes).toHaveLength(2);
    expect(state.shots.every((shot) => shot.kind === "torpedo")).toBe(true);
    expect(player.torpedoReloadRemaining).toBeGreaterThan(40);
    expect(torpedoes[0]?.position).not.toEqual(torpedoes[1]?.position);
    expect(torpedoes.every((torpedo) => torpedo.velocity.y === 0)).toBe(true);
  });

  it("keeps weapon slot 3 reserved without spawning a projectile", () => {
    const state = createInitialState(97, "sea-trials");
    const player = state.ships[0]!;
    stepSimulation(state, new Map([["player", {
      ...idle(player.position.x, player.position.z + 2_000),
      fire: true,
      weaponSlot: "aircraft",
    }]]), FIXED_STEP);
    expect(state.projectiles).toHaveLength(0);
    expect(state.shots).toHaveLength(0);
  });

  it("returns one physical muzzle origin for each installed barrel", () => {
    const single = createInitialState(94, "sea-trials", "mk1-single").ships[0]!;
    const twin = createInitialState(94, "sea-trials", "mk2-twin").ships[0]!;
    expect(gunMuzzleOrigins(single)).toHaveLength(1);
    expect(gunMuzzleOrigins(twin)).toHaveLength(2);
  });

  it("blocks the bow turret from firing through the ship", () => {
    const state = createInitialState(93, "sea-trials");
    const player = state.ships[0]!;
    const command = {
      ...idle(player.position.x, player.position.z - 2_000),
      fire: true,
    };
    for (let tick = 0; tick < 1_000; tick += 1) {
      stepSimulation(state, new Map([["player", command]]), FIXED_STEP);
    }
    const relativeTurret = Math.atan2(
      Math.sin(player.turretHeading - player.heading),
      Math.cos(player.turretHeading - player.heading),
    );
    expect(player.gunTraverseBlocked).toBe(true);
    expect(Math.abs(relativeTurret)).toBeLessThanOrEqual(
      FRONT_TURRET_TRAVERSE_LIMIT_RADIANS + 0.001,
    );
    expect(state.projectiles).toHaveLength(0);
  });

  it("slows turret traverse when the gun module is damaged", () => {
    const healthy = createInitialState(5);
    const damaged = createInitialState(5);
    damaged.ships[0]!.modules.gun.health *= 0.25;
    const target = { x: 2_000, y: 0, z: -900 };
    const commands = new Map<string, ControlCommand>([
      ["player", { throttle: 0, rudder: 0, aimPoint: target, fire: false }],
      ["enemy", idle(180, -1_000)],
    ]);
    for (let tick = 0; tick < 60; tick += 1) {
      stepSimulation(healthy, commands, FIXED_STEP);
      stepSimulation(damaged, commands, FIXED_STEP);
    }
    expect(healthy.ships[0]!.turretHeading).toBeGreaterThan(damaged.ships[0]!.turretHeading);
  });

  it("makes the rule AI bracket the target instead of hitting every salvo", () => {
    const state = createInitialState(77);
    const ai = new RuleBasedAi(77);
    let hits = 0;
    let splashes = 0;
    for (let tick = 0; tick < 7_200 && state.status === "running"; tick += 1) {
      const player = state.ships.find((ship) => ship.id === "player")!;
      const aiCommand = ai.command(observe(state, "enemy"));
      const commands = new Map<string, ControlCommand>([
        ["player", idle(player.position.x, player.position.z + 2_000)],
        ["enemy", aiCommand],
      ]);
      stepSimulation(state, commands, FIXED_STEP);
      hits += state.impacts.filter((impact) => impact.kind === "hit").length;
      splashes += state.impacts.filter((impact) => impact.kind === "splash").length;
    }
    expect(hits + splashes).toBeGreaterThan(4);
    expect(splashes).toBeGreaterThan(0);
    expect(hits).toBeLessThan(splashes);
    expect(hits / (hits + splashes)).toBeLessThan(0.35);
  });

  it("keeps sea trials running without an enemy or time limit", () => {
    const state = createInitialState(21, "sea-trials");
    expect(state.ships).toHaveLength(2);
    const target = state.ships.find((ship) => ship.isTestTarget);
    expect(target).toBeDefined();
    expect(target?.speedKnots).toBe(0);
    expect(target?.throttle).toBe(0);
    state.time = BATTLE_DURATION_SECONDS + 30;
    stepSimulation(state, new Map([["player", idle(0, 1_000)]]), FIXED_STEP);
    expect(state.status).toBe("running");
  });

  it("tracks ship performance telemetry deterministically", () => {
    const state = createInitialState(22, "sea-trials");
    const commands = new Map<string, ControlCommand>([[
      "player",
      { ...idle(0, 1_000), throttle: 1, rudder: 0.75 },
    ]]);
    for (let tick = 0; tick < 180; tick += 1) stepSimulation(state, commands, FIXED_STEP);
    const player = state.ships[0]!;
    expect(player.distanceTravelled).toBeGreaterThan(10);
    expect(Math.abs(player.turnRateRadians)).toBeGreaterThan(0);
  });

  it("uses the traversed turret direction for the muzzle position", () => {
    const state = createInitialState(23, "sea-trials");
    const player = state.ships[0]!;
    player.heading = 0;
    player.turretHeading = Math.PI / 2;
    const origin = gunMuzzleOrigin(player);
    expect(origin.x).toBeGreaterThan(player.position.x + 14);
    expect(origin.z).toBeGreaterThan(player.position.z + 30);
  });

  it("projects a separate aim point along the current turret direction", () => {
    const state = createInitialState(35, "sea-trials");
    const player = state.ships[0]!;
    player.turretHeading = Math.PI / 2;
    player.aimPoint = { x: player.position.x, y: 0, z: player.position.z + 1_200 };
    const origin = gunMuzzleOrigin(player);
    const barrelTarget = turretAimPoint(player, origin);
    expect(barrelTarget.x).toBeGreaterThan(origin.x + 1_000);
    expect(barrelTarget.z).toBeCloseTo(origin.z, 5);
  });

  it("lets crew gradually contain fire and flooding", () => {
    const state = createInitialState(24, "sea-trials");
    const player = state.ships[0]!;
    player.fireIntensity = 60;
    player.flooding = 45;
    const startingHull = player.hull;
    for (let tick = 0; tick < 600; tick += 1) {
      stepSimulation(state, new Map([["player", idle(0, 1_000)]]), FIXED_STEP);
    }
    expect(player.fireIntensity).toBeLessThan(60);
    expect(player.flooding).toBeLessThan(45);
    expect(player.hull).toBeLessThan(startingHull);
  });

  it("creates collision contacts and damages both physical hulls", () => {
    const state = createInitialState(31);
    const player = state.ships.find((ship) => ship.id === "player")!;
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    player.position = { x: 0, y: 0, z: 0 };
    enemy.position = { x: 0, y: 0, z: 72 };
    player.heading = 0;
    enemy.heading = Math.PI;
    player.speedKnots = 24;
    enemy.speedKnots = 24;
    const commands = new Map<string, ControlCommand>([
      ["player", { ...idle(0, 1_000), throttle: 1 }],
      ["enemy", { ...idle(0, -1_000), throttle: 1 }],
    ]);
    stepSimulation(state, commands, FIXED_STEP);
    expect(state.impacts.filter((impact) => impact.kind === "collision")).toHaveLength(2);
    expect(player.hull).toBeLessThan(player.maxHull);
    expect(enemy.hull).toBeLessThan(enemy.maxHull);
    expect(player.recoverableHull).toBeGreaterThanOrEqual(player.hull);
    expect(Math.abs(player.position.x - enemy.position.x)).toBeGreaterThan(11);
  });

  it("keeps the sea-trial collision target anchored while resolving overlap", () => {
    const state = createInitialState(34, "sea-trials");
    const player = state.ships.find((ship) => ship.id === "player")!;
    const target = state.ships.find((ship) => ship.isTestTarget)!;
    target.position = { x: 0, y: 0, z: 0 };
    target.previousPosition = { ...target.position };
    target.heading = Math.PI / 2;
    player.position = { x: 0, y: 0, z: -40 };
    player.previousPosition = { ...player.position };
    player.heading = 0;
    player.speedKnots = 26;
    const targetStart = { ...target.position };

    stepSimulation(
      state,
      new Map([["player", { ...idle(0, 1_000), throttle: 1 }]]),
      FIXED_STEP,
    );

    expect(target.position).toEqual(targetStart);
    expect(player.position.z).toBeLessThan(-60);
    expect(state.impacts.some((impact) => impact.kind === "collision")).toBe(true);
  });

  it("gives armored extremities more collision damage reduction", () => {
    expect(collisionDamageMultiplierFor("bow"))
      .toBeLessThan(collisionDamageMultiplierFor("bridge"));
    expect(collisionDamageMultiplierFor("stern"))
      .toBeLessThan(collisionDamageMultiplierFor("magazine"));
  });

  it("uses crew strength to determine H hull repair speed", () => {
    const healthy = createInitialState(32, "sea-trials");
    const depleted = createInitialState(32, "sea-trials");
    const healthyShip = healthy.ships[0]!;
    const depletedShip = depleted.ships[0]!;
    healthyShip.hull = 500;
    healthyShip.recoverableHull = 720;
    depletedShip.hull = 500;
    depletedShip.recoverableHull = 720;
    depletedShip.modules.crew.health = 24;
    const repairCommand = { ...idle(0, 1_000), repairHull: true };
    for (let tick = 0; tick < 600; tick += 1) {
      stepSimulation(healthy, new Map([["player", repairCommand]]), FIXED_STEP);
      stepSimulation(depleted, new Map([["player", repairCommand]]), FIXED_STEP);
    }
    expect(healthyShip.hull).toBeGreaterThan(depletedShip.hull);
    expect(healthyShip.hull).toBeLessThanOrEqual(healthyShip.recoverableHull);
  });

  it("does not repair permanent hull damage beyond the relative bar", () => {
    const state = createInitialState(33, "sea-trials");
    const player = state.ships[0]!;
    player.hull = 690;
    player.recoverableHull = 700;
    const repairCommand = { ...idle(0, 1_000), repairHull: true };
    for (let tick = 0; tick < 600; tick += 1) {
      stepSimulation(state, new Map([["player", repairCommand]]), FIXED_STEP);
    }
    expect(player.hull).toBeCloseTo(700, 5);
  });

  it("awards a time-limit victory to the ship with more hull remaining", () => {
    const state = createInitialState(12);
    state.time = BATTLE_DURATION_SECONDS - FIXED_STEP / 2;
    state.ships.find((ship) => ship.id === "player")!.hull = 720;
    state.ships.find((ship) => ship.id === "enemy")!.hull = 510;
    stepSimulation(state, new Map([
      ["player", idle(0, 1_000)],
      ["enemy", idle(0, -1_000)],
    ]), FIXED_STEP);
    expect(state.status).toBe("player-won");
    expect(state.endReason).toBe("time");
  });

  it("declares a draw when hull ratios are effectively equal at the time limit", () => {
    const state = createInitialState(13);
    state.time = BATTLE_DURATION_SECONDS - FIXED_STEP / 2;
    state.ships.find((ship) => ship.id === "player")!.hull = 604;
    state.ships.find((ship) => ship.id === "enemy")!.hull = 600;
    stepSimulation(state, new Map([
      ["player", idle(0, 1_000)],
      ["enemy", idle(0, -1_000)],
    ]), FIXED_STEP);
    expect(state.status).toBe("draw");
    expect(state.endReason).toBe("time");
  });
});
