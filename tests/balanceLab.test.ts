import { describe, expect, it } from "vitest";
import {
  battleStateFingerprint,
  runBalanceBatch,
  runHeadlessBattle,
} from "../src/sim/balanceLab";
import { createInitialState } from "../src/sim/simulation";

describe("headless balance lab", () => {
  it("replays the same seed deterministically", () => {
    const first = runHeadlessBattle(0xdecafbad, 90);
    const second = runHeadlessBattle(0xdecafbad, 90);
    expect(second).toEqual(first);
  });

  it("fingerprints equivalent initial states identically", () => {
    expect(battleStateFingerprint(createInitialState(73)))
      .toBe(battleStateFingerprint(createInitialState(73)));
    expect(battleStateFingerprint(createInitialState(73)))
      .not.toBe(battleStateFingerprint(createInitialState(74)));
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
  });
});
