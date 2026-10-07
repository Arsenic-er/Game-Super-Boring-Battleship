#!/usr/bin/env node
// Reproducible CPU profile and whole-telemetry comparison for the existing slow batch.
// No network listener or renderer is started; all outputs stay under ignored .qa.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Session } from "node:inspector/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";

const label = process.argv[2] ?? "current";
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error("Use a simple output label");
const baselineLabel = process.argv[3];
if (baselineLabel && !/^[a-zA-Z0-9_-]+$/.test(baselineLabel)) throw Error("Invalid baseline label");
if (baselineLabel === label) throw Error("Baseline and output labels must differ");
const output = resolve(".qa/balance-performance-" + label);
await mkdir(output, { recursive: true });
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
let server;
const profiler = new Session();
try {
  server = await createServer({
    configFile: false, clearScreen: false, appType: "custom",
    cacheDir: resolve(".qa/balance-performance-vite"),
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const { runHeadlessBattle, summarizeBattles } = await server.ssrLoadModule("/src/sim/balanceLab.ts");
  const { BATTLE_DURATION_SECONDS } = await server.ssrLoadModule("/src/sim/config.ts");
  // A fixed warm-up, excluded from timings and results, avoids measuring module startup.
  runHeadlessBattle(0xdecafbad, 30);
  profiler.connect();
  await profiler.post("Profiler.enable");
  await profiler.post("Profiler.start");
  const battles = [];
  const elapsedMs = [];
  const start = performance.now();
  for (let seed = 900; seed < 904; seed++) {
    const before = performance.now();
    const battle = runHeadlessBattle(seed, BATTLE_DURATION_SECONDS);
    elapsedMs.push(performance.now() - before);
    battles.push(battle);
    console.log(JSON.stringify({ seed, elapsedMs: Math.round(elapsedMs.at(-1)),
      durationSeconds: battle.durationSeconds, fingerprintSha256: createHash("sha256").update(battle.finalStateFingerprint).digest("hex") }));
  }
  const totalMs = performance.now() - start;
  const { profile } = await profiler.post("Profiler.stop");
  const result = { sourceCommit, nodeVersion: process.version, seeds: [900, 901, 902, 903],
    maximumSeconds: BATTLE_DURATION_SECONDS, elapsedMs, totalMs,
    battles, report: summarizeBattles(battles) };
  await writeFile(resolve(output, "results.json"), JSON.stringify(result, null, 2) + "\n");
  await writeFile(resolve(output, "cpu.cpuprofile"), JSON.stringify(profile));
  if (baselineLabel) {
    const before = JSON.parse(await readFile(resolve(".qa/balance-performance-" + baselineLabel, "results.json"), "utf8"));
    assert.deepEqual(result.seeds, before.seeds);
    assert.equal(result.maximumSeconds, before.maximumSeconds);
    assert.deepEqual(result.battles, before.battles, "Whole battle telemetry changed");
    assert.deepEqual(result.report, before.report, "Batch aggregate changed");
    console.log("PASS identical whole telemetry and batch aggregate");
    console.log(JSON.stringify({ baselineMs: Math.round(before.totalMs), currentMs: Math.round(totalMs),
      reductionPercent: +(100 * (before.totalMs - totalMs) / before.totalMs).toFixed(1) }));
  } else {
    console.log(JSON.stringify({ totalMs: Math.round(totalMs), output }));
  }
} finally {
  profiler.disconnect();
  await server?.close();
}
