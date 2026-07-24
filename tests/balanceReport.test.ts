import { describe, expect, it } from "vitest";
import { runBalanceBatch } from "../src/sim/balanceLab";

const enabled = process.env.npm_lifecycle_event === "balance";
const requestedRuns = Number.parseInt(process.env.BATTLE_RUNS ?? "500", 10);
const runs = Number.isFinite(requestedRuns) ? Math.max(1, requestedRuns) : 500;

describe.skipIf(!enabled)("balance report", () => {
  it(`simulates ${runs} deterministic battles without rendering`, () => {
    const startedAt = performance.now();
    const report = runBalanceBatch(runs, 1);
    const elapsedSeconds = (performance.now() - startedAt) / 1_000;
    expect(report.runs).toBe(runs);
    expect(report.playerWins + report.enemyWins + report.draws).toBe(runs);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      simulationWallSeconds: Math.round(elapsedSeconds * 100) / 100,
      ...report,
    }, null, 2));
  }, 120_000);
});
