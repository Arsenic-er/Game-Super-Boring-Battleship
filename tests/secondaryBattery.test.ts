import { describe, expect, it } from "vitest";
import { FIXED_STEP } from "../src/sim/config";
import { createDeveloperShipState, createInitialState, stepSimulation } from "../src/sim/simulation";
import type { ControlCommand, ShipState } from "../src/sim/types";
import type { ShipClassId } from "../src/ships/classes";
import { SECONDARY_GUNS } from "../src/ships/secondaryGuns";
import { battleStateFingerprint } from "../src/sim/balanceLab";

const idle = (ship: ShipState): ControlCommand => ({
  throttle: 0,
  rudder: 0,
  aimPoint: { x: ship.position.x, y: 0, z: ship.position.z + 1_000 },
  fire: false,
});

function runBroadsideExchange(shipClassId: ShipClassId): {
  playerShots: number;
  enemyShots: number;
  peakActiveSecondaryShells: number;
  fingerprint: string;
} {
  const state = createInitialState(
    81_000 + shipClassId.length,
    "battle",
    undefined,
    undefined,
    undefined,
    shipClassId,
  );
  const player = state.ships.find((ship) => ship.id === "player")!;
  const enemy = createDeveloperShipState({
    id: "enemy",
    team: "enemy",
    shipClassId,
    position: { x: 900, y: 0, z: 0 },
    countsForVictory: true,
  });
  state.ships = [player, enemy];
  player.position = { x: 0, y: 0, z: 0 };
  player.previousPosition = { ...player.position };
  enemy.position = { x: 900, y: 0, z: 0 };
  enemy.previousPosition = { ...enemy.position };
  player.heading = 0;
  enemy.heading = 0;
  player.speedKnots = 0;
  enemy.speedKnots = 0;
  let playerShots = 0;
  let enemyShots = 0;
  let peakActiveSecondaryShells = 0;
  for (let tick = 0; tick < 30 / FIXED_STEP; tick += 1) {
    stepSimulation(state, new Map([
      [player.id, idle(player)],
      [enemy.id, idle(enemy)],
    ]), FIXED_STEP);
    playerShots += state.shots.filter((shot) =>
      shot.team === "player" && shot.weaponSource === "secondary").length;
    enemyShots += state.shots.filter((shot) =>
      shot.team === "enemy" && shot.weaponSource === "secondary").length;
    peakActiveSecondaryShells = Math.max(
      peakActiveSecondaryShells,
      state.projectiles.filter((projectile) => projectile.weaponSource === "secondary").length,
    );
  }
  return {
    playerShots,
    enemyShots,
    peakActiveSecondaryShells,
    fingerprint: battleStateFingerprint(state),
  };
}

describe("automatic secondary batteries", () => {
  it("keeps the four historical models mechanically distinct", () => {
    const definitions = Object.values(SECONDARY_GUNS);
    expect(new Set(definitions.map((definition) => definition.caliberMm)).size).toBe(4);
    expect(new Set(definitions.map((definition) => definition.reloadSeconds)).size).toBe(4);
    expect(new Set(definitions.map((definition) => definition.maximumRangeMeters)).size).toBe(4);
  });

  for (const shipClassId of ["cleveland", "north-carolina"] as const) {
    it(`runs a bounded symmetric 30-second ${shipClassId} broadside exchange`, () => {
      const report = runBroadsideExchange(shipClassId);
      expect(report.playerShots).toBeGreaterThan(0);
      expect(report.enemyShots).toBeGreaterThan(0);
      expect(Math.abs(report.playerShots - report.enemyShots)).toBeLessThanOrEqual(5);
      expect(report.peakActiveSecondaryShells).toBeLessThanOrEqual(20);
      expect(runBroadsideExchange(shipClassId).fingerprint).toBe(report.fingerprint);
    });
  }
});
