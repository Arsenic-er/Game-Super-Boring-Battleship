import { describe, expect, it } from "vitest";
import {
  clampPatrolRadius,
  compileAirMissionCommands,
  entityIdsInRect,
  normalizeSelectionRect,
  northUpMapToWorld,
  roleSupportsCommand,
  type TacticalMapEntity,
} from "../src/ui/tacticalAirCommand";

const entities: TacticalMapEntity[] = [
  {
    id: "fighter-1",
    category: "friendlySquadron",
    label: "fighter",
    point: { x: 80, y: 60 },
    world: { x: -1_000, y: 180, z: 2_000 },
    role: "fighter",
  },
  {
    id: "bomber-1",
    category: "friendlySquadron",
    label: "bomber",
    point: { x: 170, y: 150 },
    world: { x: 500, y: 180, z: -800 },
    role: "diveBomber",
  },
  {
    id: "enemy-air-1",
    category: "enemySquadron",
    label: "enemy",
    point: { x: 100, y: 90 },
    world: { x: 0, y: 180, z: 0 },
    role: "fighter",
  },
];

describe("RTS tactical air command helpers", () => {
  it("normalizes drag direction and selects only requested categories", () => {
    const rect = normalizeSelectionRect({ x: 130, y: 120 }, { x: 50, y: 40 });
    expect(rect).toEqual({ left: 50, top: 40, right: 130, bottom: 120 });
    expect(entityIdsInRect(entities, rect, ["friendlySquadron"]))
      .toEqual(["fighter-1"]);
    expect(entityIdsInRect(entities, rect, ["enemySquadron"]))
      .toEqual(["enemy-air-1"]);
  });

  it("inverts the north-up projection for right-click destinations", () => {
    expect(northUpMapToWorld(
      { x: 350, y: 100 },
      { centerX: 250, centerY: 250, scale: 0.05 },
    )).toEqual({ x: 2_000, y: 180, z: 3_000 });
  });

  it("filters guard and intercept orders to fighters", () => {
    const selected = [
      { id: "fighter-1", role: "fighter" as const },
      { id: "dive-1", role: "diveBomber" as const },
      { id: "torpedo-1", role: "torpedoBomber" as const },
    ];
    expect(compileAirMissionCommands(selected, "defendShip", {
      targetIds: ["player", "ally"],
    })).toEqual([expect.objectContaining({
      squadronId: "fighter-1",
      targetIds: ["player", "ally"],
    })]);
    expect(roleSupportsCommand("diveBomber", "interceptSquadron")).toBe(false);
    expect(roleSupportsCommand("torpedoBomber", "strikeShip")).toBe(true);
  });

  it("compiles one patrol order per selected squadron and clamps the radius", () => {
    const commands = compileAirMissionCommands([
      { id: "fighter-1", role: "fighter" },
      { id: "dive-1", role: "diveBomber" },
    ], "patrolArea", {
      center: { x: 600, y: 180, z: -400 },
      radius: 9_000,
    });
    expect(commands).toHaveLength(2);
    expect(commands.every(({ area }) => area?.radius === clampPatrolRadius(9_000))).toBe(true);
    expect(clampPatrolRadius(1)).toBe(250);
    expect(clampPatrolRadius(9_000)).toBe(2_000);
  });
});
