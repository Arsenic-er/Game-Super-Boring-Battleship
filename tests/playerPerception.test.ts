import { describe, expect, it } from "vitest";
import { SENSOR } from "../src/sim/config";
import {
  isProjectileVisibleToPlayer,
  isShipVisibleToPlayer,
  PlayerPerceptionTracker,
} from "../src/sim/playerPerception";
import { createInitialState, observe } from "../src/sim/simulation";
import type { PlayerTargetView, ProjectileState } from "../src/sim/types";

const placeInsideGuaranteedDetection = (state: ReturnType<typeof createInitialState>): void => {
  const player = state.ships.find((ship) => ship.id === "player")!;
  const enemy = state.ships.find((ship) => ship.id === "enemy")!;
  enemy.position = {
    x: player.position.x + 1_100,
    y: player.position.y,
    z: player.position.z + 200,
  };
};

describe("player optical perception", () => {
  it("acquires, loses, searches, forgets and reacquires sampled contacts", () => {
    const state = createInitialState(301);
    placeInsideGuaranteedDetection(state);
    const tracker = new PlayerPerceptionTracker();

    const acquiring = tracker.update(observe(state, "player"));
    expect(acquiring?.mode).toBe("acquiring");
    expect(acquiring?.live).toBe(true);

    state.time = SENSOR.observationIntervalSeconds + 0.1;
    const tracking = tracker.update(observe(state, "player"));
    expect(tracking?.mode).toBe("tracking");

    const player = state.ships.find((ship) => ship.id === "player")!;
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    enemy.position.x = player.position.x + SENSOR.maximumDetectionMeters + 2_000;
    state.time += SENSOR.observationIntervalSeconds;
    const lost = tracker.update(observe(state, "player"));
    expect(lost?.mode).toBe("lost");
    expect(lost?.live).toBe(false);
    expect(lost?.position).not.toEqual(enemy.position);

    state.time += SENSOR.fireFromMemorySeconds + 0.1;
    const searching = tracker.update(observe(state, "player"));
    expect(searching?.mode).toBe("searching");

    enemy.position = {
      x: player.position.x + 1_000,
      y: player.position.y,
      z: player.position.z + 100,
    };
    state.time += SENSOR.observationIntervalSeconds;
    const reacquired = tracker.update(observe(state, "player"));
    expect(reacquired?.mode).toBe("tracking");
    expect(reacquired?.live).toBe(true);

    enemy.position.x = player.position.x + SENSOR.maximumDetectionMeters + 2_000;
    state.time += SENSOR.observationIntervalSeconds;
    tracker.update(observe(state, "player"));
    state.time += SENSOR.memorySeconds + SENSOR.observationIntervalSeconds;
    expect(tracker.update(observe(state, "player"))).toBeUndefined();
  });

  it("reports a coarse hull estimate and never exposes a live ship reference", () => {
    const state = createInitialState(302);
    placeInsideGuaranteedDetection(state);
    const enemy = state.ships.find((ship) => ship.id === "enemy")!;
    enemy.hull = 733;
    const contact = observe(state, "player").contacts[0]!;
    expect(contact.position).not.toBe(enemy.position);
    expect(contact.estimatedHullRatio).not.toBe(enemy.hull / enemy.maxHull);
    expect(contact.estimatedHullRatio * 20).toBeCloseTo(
      Math.round(contact.estimatedHullRatio * 20),
      8,
    );
    expect("hull" in contact).toBe(false);
  });

  it("gates enemy models and distant hostile projectiles", () => {
    const battle = createInitialState(303);
    const player = battle.ships.find((ship) => ship.id === "player")!;
    const enemy = battle.ships.find((ship) => ship.id === "enemy")!;
    const target: PlayerTargetView = {
      id: enemy.id,
      team: enemy.team,
      mode: "lost",
      live: false,
      confidence: 0.5,
      lastObservedAt: 0,
      position: { ...enemy.position },
      heading: enemy.heading,
      speedKnots: enemy.speedKnots,
      rangeMeters: 0,
      estimatedHullRatio: 1,
    };
    expect(isShipVisibleToPlayer(enemy, "battle")).toBe(false);
    expect(isShipVisibleToPlayer(enemy, "battle", target)).toBe(false);
    expect(isShipVisibleToPlayer(enemy, "sea-trials")).toBe(true);
    target.live = true;
    expect(isShipVisibleToPlayer(enemy, "battle", target)).toBe(true);

    const shell: ProjectileState = {
      id: 1,
      ownerId: enemy.id,
      team: "enemy",
      kind: "shell",
      ammoType: "he",
      position: { x: player.position.x + 2_000, y: 10, z: player.position.z },
      previousPosition: { x: player.position.x + 2_010, y: 10, z: player.position.z },
      velocity: { x: -100, y: 0, z: 0 },
      damage: 1,
      age: 1,
    };
    target.live = false;
    expect(isProjectileVisibleToPlayer(shell, player, target)).toBe(false);
    shell.position.x = player.position.x + 900;
    expect(isProjectileVisibleToPlayer(shell, player, target)).toBe(true);
  });

  it("uses each torpedo projectile's own wake detection distance", () => {
    const battle = createInitialState(304);
    const player = battle.ships.find((ship) => ship.id === "player")!;
    const torpedo: ProjectileState = {
      id: 2,
      ownerId: "enemy",
      team: "enemy",
      kind: "torpedo",
      position: { x: player.position.x + 600, y: 0, z: player.position.z },
      previousPosition: { x: player.position.x + 601, y: 0, z: player.position.z },
      velocity: { x: -27, y: 0, z: 0 },
      damage: 152,
      age: 1,
      detectionRange: 650,
    };
    expect(isProjectileVisibleToPlayer(torpedo, player)).toBe(true);
    torpedo.detectionRange = 360;
    expect(isProjectileVisibleToPlayer(torpedo, player)).toBe(false);
  });
});
