import { describe, expect, it } from "vitest";
import { runBalanceMatrix } from "../src/sim/balanceLab";

const enabled = process.env.npm_lifecycle_event === "balance:matrix";
const requestedRuns = Number.parseInt(process.env.BATTLE_RUNS ?? "10", 10);
const runsPerSpawn = Number.isFinite(requestedRuns) ? Math.max(1, requestedRuns) : 10;

describe.skipIf(!enabled)("cross-class balance matrix report", () => {
  it(`simulates ${runsPerSpawn} paired seeds per spawn and matchup`, () => {
    const startedAt = performance.now();
    const report = runBalanceMatrix({
      runsPerSpawn,
      maximumSeconds: 600,
      includeMirroredSpawns: true,
      matchups: [
        {
          id: "fletcher-mirror",
          player: { shipClassId: "fletcher", loadoutPreset: "standard" },
          enemy: { shipClassId: "fletcher", loadoutPreset: "standard" },
        },
        {
          id: "kagero-vs-fletcher",
          player: { shipClassId: "kagero", loadoutPreset: "standard" },
          enemy: { shipClassId: "fletcher", loadoutPreset: "standard" },
        },
        {
          id: "cleveland-mirror",
          player: { shipClassId: "cleveland", loadoutPreset: "standard" },
          enemy: { shipClassId: "cleveland", loadoutPreset: "standard" },
        },
        {
          id: "yamato-mirror",
          player: { shipClassId: "yamato", loadoutPreset: "standard" },
          enemy: { shipClassId: "yamato", loadoutPreset: "standard" },
        },
      ],
    });
    expect(report.runs).toBe(runsPerSpawn * 2 * report.entries.length);
    for (const entry of report.entries) {
      expect(entry.defaultSpawn.runs).toBe(runsPerSpawn);
      expect(entry.mirroredSpawn?.runs).toBe(runsPerSpawn);
      expect(entry.combined.runs).toBe(runsPerSpawn * 2);
    }
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      simulationWallSeconds: Math.round((performance.now() - startedAt) / 10) / 100,
      ...report,
    }, null, 2));
  }, 300_000);
});
