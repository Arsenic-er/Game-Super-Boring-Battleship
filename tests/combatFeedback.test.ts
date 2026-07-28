import { describe, expect, it } from "vitest";
import { summarizePlayerSalvos } from "../src/ui/hud";
import type { ImpactEvent, PenetrationResult } from "../src/sim/types";

const hit = (
  id: number,
  salvoId: number,
  penetrationResult: PenetrationResult,
  damage: number,
  overrides: Partial<ImpactEvent> = {},
): ImpactEvent => ({
  id,
  kind: "hit",
  position: { x: 0, y: 1, z: 0 },
  sourceId: "player",
  sourceTeam: "player",
  salvoId,
  targetId: "enemy",
  damage,
  compartment: "bridge",
  penetrationResult,
  projectileKind: "shell",
  weaponSource: "mainGun",
  ...overrides,
});

describe("main-battery salvo ribbons", () => {
  it("aggregates armor results, hazards, modules and damage by exact salvo", () => {
    const summaries = summarizePlayerSalvos([
      hit(1, 100, "penetration", 30, { startedFire: true }),
      hit(2, 100, "penetration", 35, { module: "gun", moduleDamage: 8 }),
      hit(3, 100, "overpenetration", 10),
      hit(4, 100, "ricochet", 0),
      hit(5, 100, "shatter", 0),
    ]);

    expect(summaries).toEqual([{
      salvoId: 100,
      hits: 5,
      penetration: 2,
      overpenetration: 1,
      ricochet: 1,
      shatter: 1,
      fires: 1,
      floods: 0,
      modules: 1,
      damage: 75,
    }]);
  });

  it("keeps simultaneous salvos separate and excludes enemy and secondary hits", () => {
    const summaries = summarizePlayerSalvos([
      hit(10, 7, "penetration", 20),
      hit(11, 8, "overpenetration", 8, { startedFlooding: true }),
      hit(12, 9, "penetration", 99, { sourceId: "enemy", targetId: "player" }),
      hit(13, 10, "penetration", 99, { weaponSource: "secondary" }),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.salvoId)).toEqual([7, 8]);
    expect(summaries.map((summary) => summary.damage)).toEqual([20, 8]);
    expect(summaries[1]!.floods).toBe(1);
  });

  it("uses an impact id fallback for legacy events without a salvo id", () => {
    const summary = summarizePlayerSalvos([
      hit(21, 12, "penetration", 17, { salvoId: undefined }),
    ])[0];
    expect(summary?.salvoId).toBe(21);
    expect(summary?.damage).toBe(17);
  });
});
