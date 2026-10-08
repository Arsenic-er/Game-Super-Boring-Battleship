import { describe, expect, it } from "vitest";
import { ObjectiveSmokeMetrics, prototypeSeedOffset } from "./helpers/objectiveSmokeMetrics";
import type { Team } from "../src/sim/types";

const ship = (team: Team, x: number, hull = 100, z = 0) =>
  ({ team, hull, position: { x, y: 0, z } });
function snapshot(time = 0, ships = [ship("player", 0)],
  playerScore = 0, enemyScore = 0) {
  return { time, ships, objective: {
    center: { x: 0, y: 0, z: 0 }, radius: 100,
    scores: { player: playerScore, enemy: enemyScore },
  } };
}

describe("test-only objective smoke metrics", () => {
  it("counts physical living hull centers and includes the exact zone edge", () => {
    const metrics = new ObjectiveSmokeMetrics(snapshot());
    metrics.update(snapshot(2, [
      ship("player", 0), ship("player", 100), ship("player", 100.001),
      ship("player", 0, 0), ship("enemy", 0), ship("enemy", 0, -1),
    ]));
    expect(metrics.report()).toMatchObject({
      inZoneShipSeconds: { player: 4, enemy: 2 }, contestedSeconds: 2,
    });
  });

  it("counts contested wall-time once and stops when either team leaves", () => {
    const metrics = new ObjectiveSmokeMetrics(snapshot());
    metrics.update(snapshot(1, [ship("player", 0), ship("enemy", 0), ship("enemy", 20)]));
    metrics.update(snapshot(4, [ship("player", 0), ship("enemy", 101)]));
    metrics.update(snapshot(5, [ship("player", 101), ship("enemy", 101)]));
    expect(metrics.report()).toMatchObject({
      inZoneShipSeconds: { player: 4, enemy: 2 }, contestedSeconds: 1,
    });
  });

  it("counts only score gained after the 900-second fixed-step boundary", () => {
    const metrics = new ObjectiveSmokeMetrics(snapshot(899, [], 10, 20));
    metrics.update(snapshot(900, [], 15, 24));
    expect(metrics.report().lateScoreGain).toEqual({ player: 0, enemy: 0 });
    metrics.update(snapshot(900.1, [], 115, 24.25));
    metrics.update(snapshot(901, [], 115.5, 25));
    expect(metrics.report().lateScoreGain).toEqual({ player: 100.5, enemy: 1 });
    expect(metrics.report().lateScoreStartSeconds).toBe(900);
  });

  it("tolerates floating-point accumulation just below the exact 900-second boundary", () => {
    const metrics = new ObjectiveSmokeMetrics(snapshot(900 - 1e-8, [], 20, 30));
    metrics.update(snapshot(900 + 1 / 60, [], 20.25, 31));
    expect(metrics.report().lateScoreGain).toEqual({ player: .25, enemy: 1 });
  });

  it("is team-symmetric and ignores repeated post-step snapshots", () => {
    const player = new ObjectiveSmokeMetrics(snapshot(900, [], 10, 20));
    const enemy = new ObjectiveSmokeMetrics(snapshot(900, [], 20, 10));
    const a = snapshot(901, [ship("player", 0), ship("player", 30)], 11, 22);
    const b = snapshot(901, [ship("enemy", 0), ship("enemy", 30)], 22, 11);
    player.update(a); player.update(a);
    enemy.update(b);
    expect(player.report().inZoneShipSeconds.player).toBe(enemy.report().inZoneShipSeconds.enemy);
    expect(player.report().lateScoreGain.player).toBe(enemy.report().lateScoreGain.enemy);
    expect(player.report().lateScoreGain.enemy).toBe(enemy.report().lateScoreGain.player);
  });

  it("does not mutate inputs or leak mutable measurement references", () => {
    const input = snapshot(901);
    Object.freeze(input.ships[0]!.position);
    Object.freeze(input.ships[0]!);
    Object.freeze(input.ships);
    Object.freeze(input.objective.center);
    Object.freeze(input.objective.scores);
    Object.freeze(input.objective);
    Object.freeze(input);
    const before = structuredClone(input);
    const metrics = new ObjectiveSmokeMetrics(snapshot(900));
    metrics.update(input);
    const report = metrics.report();
    report.inZoneShipSeconds.player = 999;
    report.lateScoreGain.enemy = 999;
    expect(input).toEqual(before);
    expect(metrics.report().inZoneShipSeconds.player).toBe(1);
    expect(metrics.report().lateScoreGain.enemy).toBe(0);
  });
});

describe("explicit prototype seed offsets", () => {
  it("preserves defaults and accepts bounded decimal integers", () => {
    expect(prototypeSeedOffset(undefined)).toBe(0);
    for (const value of ["0", "1", "-1", "100000", "-100000"])
      expect(prototypeSeedOffset(value)).toBe(Number(value));
  });

  it.each(["", " ", "1.5", "1e3", "0x10", "NaN", "Infinity", "100001", "-100001", "9007199254740993"])(
    "rejects invalid offset %j", (value) => {
      expect(() => prototypeSeedOffset(value)).toThrow("PROTOTYPE_SEED_OFFSET");
    },
  );
});
