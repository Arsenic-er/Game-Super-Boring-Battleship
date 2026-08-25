import { describe, expect, it } from "vitest";
import {
  battleStateFingerprint,
  createBalanceInitialState,
  runBalanceBatch,
  runBalanceMatrix,
  runHeadlessBattle,
} from "../src/sim/balanceLab";
import { createInitialState } from "../src/sim/simulation";

describe("headless balance lab", () => {
  it("replays the same seed deterministically", () => {
    const first = runHeadlessBattle(0xdecafbad, 90);
    const second = runHeadlessBattle(0xdecafbad, 90);
    expect(second).toEqual(first);
  });

  it("uses the live battle duration when no laboratory limit is supplied", () => {
    const result = runHeadlessBattle(2);
    expect(result.status).not.toBe("running");
    expect(result.endReason).toBeDefined();
  }, 10_000);

  it("fingerprints equivalent initial states identically", () => {
    expect(battleStateFingerprint(createInitialState(73)))
      .toBe(battleStateFingerprint(createInitialState(73)));
    expect(battleStateFingerprint(createInitialState(73)))
      .not.toBe(battleStateFingerprint(createInitialState(74)));
  });

  it("builds baseline and standard class loadouts without changing the legacy default", () => {
    const legacy = createBalanceInitialState(11);
    const baseline = createBalanceInitialState(11, {
      player: { shipClassId: "yamato", loadoutPreset: "baseline" },
      enemy: { shipClassId: "kagero", loadoutPreset: "baseline" },
    });
    const standard = createBalanceInitialState(11, {
      player: { shipClassId: "yamato", loadoutPreset: "standard" },
      enemy: { shipClassId: "kagero", loadoutPreset: "standard" },
    });

    expect(legacy.ships.find((ship) => ship.id === "player")?.shipClassId).toBe("fletcher");
    expect(legacy.ships.find((ship) => ship.id === "player")?.mainGunMounts).toBe(1);
    expect(baseline.ships.find((ship) => ship.id === "player")).toMatchObject({
      shipClassId: "yamato",
      mainGunMounts: 1,
      torpedoLauncherMounts: 0,
    });
    expect(standard.ships.find((ship) => ship.id === "player")).toMatchObject({
      shipClassId: "yamato",
      mainGunMounts: 3,
      torpedoLauncherMounts: 0,
      antiAirMounts: 3,
    });
    expect(standard.ships.find((ship) => ship.id === "enemy")).toMatchObject({
      shipClassId: "kagero",
      mainGunMounts: 3,
      torpedoLauncherMounts: 1,
      depthChargeMounts: 1,
    });
  });

  it("mirrors physical spawns while preserving team and class assignments", () => {
    const scenario = {
      player: { shipClassId: "cleveland" as const, loadoutPreset: "standard" as const },
      enemy: { shipClassId: "bismarck" as const, loadoutPreset: "standard" as const },
    };
    const normal = createBalanceInitialState(23, scenario);
    const mirrored = createBalanceInitialState(23, { ...scenario, spawnSide: "mirrored" });
    const normalPlayer = normal.ships.find((ship) => ship.id === "player")!;
    const normalEnemy = normal.ships.find((ship) => ship.id === "enemy")!;
    const mirroredPlayer = mirrored.ships.find((ship) => ship.id === "player")!;
    const mirroredEnemy = mirrored.ships.find((ship) => ship.id === "enemy")!;

    expect(mirroredPlayer.shipClassId).toBe(normalPlayer.shipClassId);
    expect(mirroredEnemy.shipClassId).toBe(normalEnemy.shipClassId);
    expect(mirroredPlayer.position).toEqual(normalEnemy.position);
    expect(mirroredEnemy.position).toEqual(normalPlayer.position);
    expect(mirroredPlayer.heading).toBeCloseTo(Math.PI);
    expect(mirroredEnemy.heading).toBeCloseTo(0);
  });

  it("reports paired cross-class matches with a spawn-side delta", () => {
    const matrix = runBalanceMatrix({
      matchups: [{
        player: { shipClassId: "fletcher", loadoutPreset: "baseline" },
        enemy: { shipClassId: "cleveland", loadoutPreset: "standard" },
      }],
      runsPerSpawn: 1,
      maximumSeconds: 1,
    });

    expect(matrix.runs).toBe(2);
    expect(matrix.entries).toHaveLength(1);
    expect(matrix.entries[0]?.defaultSpawn.runs).toBe(1);
    expect(matrix.entries[0]?.mirroredSpawn?.runs).toBe(1);
    expect(matrix.entries[0]?.combined.runs).toBe(2);
    expect(matrix.entries[0]?.spawnPlayerWinRateDelta).toBeTypeOf("number");
  });

  it("summarizes repeatable batch percentiles and combat rates", () => {
    const report = runBalanceBatch(4, 900);
    expect(report.runs).toBe(4);
    expect(report.draws).toBeGreaterThanOrEqual(0);
    expect(report.playerWins + report.enemyWins + report.draws).toBe(4);
    expect(report.destroyedBattles + report.scoreBattles + report.timedBattles).toBe(4);
    expect(report.noCaptureBattles).toBeGreaterThanOrEqual(0);
    expect(report.averageContestedSeconds).toBeGreaterThanOrEqual(0);
    expect(report.durationSeconds.p25).toBeLessThanOrEqual(report.durationSeconds.p50);
    expect(report.averagePlayerSalvos).toBeGreaterThan(12);
    expect(report.averageEnemySalvos).toBeGreaterThan(12);
    expect(report.durationSeconds.p50).toBeLessThanOrEqual(report.durationSeconds.p75);
    expect(report.playerHitRate).toBeGreaterThanOrEqual(0);
    expect(report.playerHitRate).toBeLessThanOrEqual(1);
    expect(report.enemyHitRate).toBeGreaterThanOrEqual(0);
    expect(report.enemyHitRate).toBeLessThanOrEqual(1);
    expect(report.firstTrackingSeconds.player.p50).toBeGreaterThanOrEqual(0);
    expect(report.averageTrackingFraction.player).toBeGreaterThan(0);
    expect(report.averageTrackingFraction.enemy).toBeGreaterThan(0);
    expect(report.shotsWhileUntracked).toBe(0);
    expect(report.torpedoHitRate).toBeGreaterThanOrEqual(0);
    expect(report.torpedoHitRate).toBeLessThanOrEqual(1);
    expect(report.averageTorpedoSalvosPerTeam).toBeGreaterThanOrEqual(0);
    expect(report.playerGunHitRate).toBeGreaterThanOrEqual(0);
    expect(report.playerGunHitRate).toBeLessThanOrEqual(1);
  }, 15_000);
});
