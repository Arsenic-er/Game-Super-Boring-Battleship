#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".qa/browsers");
process.env.LD_LIBRARY_PATH = [
  resolve(".qa/sysroot/usr/lib/x86_64-linux-gnu"), process.env.LD_LIBRARY_PATH,
].filter(Boolean).join(":");
const { chromium } = await import("../../.qa/node_modules/playwright/index.mjs");
const output = resolve(".qa/multi-contact-20261008");
const origin = "http://127.0.0.1:5286";
await mkdir(output, { recursive: true });
const report = {
  feature: "local-main-multiple-contacts",
  scope: "Real main.ts render-loop, optical observe(), Babylon GameView and TacticalMap in isolated Chromium. Deterministic open-sea fixtures freeze physics and advance sensor time; no contacts, visibility results or rendering outcomes are mocked. Not native Windows, actual LAN or hardware FPS acceptance.",
  checks: [], errors: [], warnings: [], screenshots: [],
};
const check = (name, evidence) => {
  report.checks.push({ name, evidence }); console.log("PASS", name);
};
let server, browser, page;
const bridge = String.raw`
import { createDeveloperShipState as qaCreateShip } from "/src/sim/simulation.ts";
import { Vector3 as qaCreateVector3 } from "/node_modules/@babylonjs/core/Maths/math.vector.js";
{
  const loops = [...view.engine._activeRenderLoops];
  view.engine.stopRenderLoop();
  const frame = loops[0];
  if (!frame) throw Error("No production render loop found");
  let consumedContacts = [];
  let primaryTargetId;
  const originalSync = view.sync.bind(view);
  view.sync = (...args) => {
    consumedContacts = (args[6] ?? []).map(contact => structuredClone(contact));
    primaryTargetId = args[2]?.id;
    return originalSync(...args);
  };
  function fixture(mode = "battle", hidden = false) {
    const next = createInitialState(727, mode);
    next.mapId = "open-sea-range";
    next.weatherId = "clear";
    const ship = (id, team, x, z, speedKnots = 0) => {
      const result = qaCreateShip({ id, team, shipClassId: "j-class",
        position: { x, y: 0, z }, heading: 0, aiControlled: false });
      result.speedKnots = speedKnots;
      return result;
    };
    next.ships = [
      ship("player", "player", 0, 0),
      ship("qa-observer", "player", -9000, -5000),
      ship("qa-enemy-a", "enemy", hidden ? 9000 : -450, 900, 12),
      ship("qa-enemy-b", "enemy", hidden ? 10000 : 450, 1100, 18),
      ship("qa-unseen", "enemy", 5000, 2000),
    ];
    next.time = 0;
    next.status = "running";
    next.airSquadrons = [];
    next.projectiles = [];
    next.smokeClouds = [];
    next.shots = [];
    next.impacts = [];
    next.airEvents = [];
    next.sensorSnapshots = {};
    currentMode = mode;
    session.reset(next);
    enterActiveBattle(next, "qa-multi-contact-" + crypto.randomUUID());
    paused = true;
    input.setSuppressed(true);
    view.setCameraInputEnabled(false);
    view.releasePointerLock();
    frame();
    return snapshot();
  }
  function snapshot() {
    const canvas = tacticalMap.largeMap;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    const markers = tacticalMap.airCommands.entities
      .filter(entity => entity.category === "enemyShip")
      .map(entity => {
        let redPixels = 0;
        if (rect.width && rect.height) {
          const x = Math.round(entity.point.x * canvas.width / rect.width);
          const y = Math.round(entity.point.y * canvas.height / rect.height);
          if (x >= 12 && y >= 12 && x < canvas.width - 12 && y < canvas.height - 12) {
            const data = context.getImageData(x - 12, y - 12, 24, 24).data;
            for (let i = 0; i < data.length; i += 4) {
              if (data[i] > 140 && data[i] > data[i + 1] * 1.15
                && data[i] > data[i + 2] * 1.15) redPixels++;
            }
          }
        }
        return { id: entity.id, redPixels, point: entity.point };
      });
    return {
      time: state.time, mode: state.mode, primaryTargetId,
      rawPlayerContactOrder: observe(state, "player").contacts.map(contact => contact.id),
      consumedContacts: structuredClone(consumedContacts),
      mapContacts: structuredClone(tacticalMap.lastContacts),
      markers, mapExpanded: tacticalMap.isExpanded(),
      ships: state.ships.map(ship => {
        const visual = view.ships.get(ship.id);
        return { id: ship.id, actualPosition: { ...ship.position },
          enabled: visual?.root.isEnabled(),
          rootPosition: visual?.root.position.asArray(),
          bodies: visual?.bodyMeshes.length ?? 0,
          outlinedBodies: visual?.bodyMeshes.filter(mesh => mesh.renderOutline).length ?? 0,
          maxBodyVisibility: Math.max(0, ...(visual?.bodyMeshes.map(mesh => mesh.visibility) ?? [])),
        };
      }),
      glError: view.engine._gl.getError(),
    };
  }
  window.__multiContactQA = {
    fixture, snapshot,
    async readiness() {
      await Promise.race([
        view.scene.whenReadyAsync(),
        new Promise((_, reject) => setTimeout(() => reject(Error("Scene readiness timeout")), 45000)),
      ]);
      frame();
      return snapshot();
    },
    tick(time) { state.time = time; frame(); return snapshot(); },
    move(id, x, z) {
      const ship = state.ships.find(candidate => candidate.id === id);
      if (!ship) throw Error("Unknown fixture ship " + id);
      ship.position.x = x; ship.position.z = z;
      ship.previousPosition = { ...ship.position };
    },
    reverseShipOrder() { state.ships.reverse(); },
    openMap() { tacticalMap.open(); frame(); return snapshot(); },
    closeMap() { tacticalMap.close(); paused = true; frame(); return snapshot(); },
    switchObserver(id) {
      developerPanel.callbacks.onObserveEntity(id);
      frame();
      return snapshot();
    },
    releaseObserver() {
      developerPanel.callbacks.onReleaseControl();
      frame();
      return snapshot();
    },
    renderOnly() {
      view.render();
      return snapshot();
    },
    overview() {
      const camera = view.scene.activeCamera;
      camera.setTarget(new qaCreateVector3(0, 0, 750));
      camera.radius = 1900; camera.beta = .68; camera.alpha = -Math.PI / 2;
      camera.getViewMatrix(true); view.render();
      return snapshot();
    },
  };
}
`;
const contact = (sample, id) => sample.consumedContacts.find(value => value.id === id);
const ship = (sample, id) => sample.ships.find(value => value.id === id);
const assertIds = (values, ids) => assert.deepEqual(values.map(value => value.id).sort(), [...ids].sort());
function assertFull(sample, id) {
  const target = contact(sample, id), visual = ship(sample, id);
  assert.equal(target?.mode, "tracking", id + " not tracking");
  assert.equal(target?.live, true, id + " not live");
  assert.equal(visual?.enabled, true, id + " disabled");
  assert(visual.bodies > 0, id + " missing actual ship meshes");
  assert.equal(visual.outlinedBodies, 0, id + " remains silhouette");
  assert(visual.maxBodyVisibility >= .99, id + " not fully rendered");
}
async function capture(name, map = false) {
  await page.evaluate(() => window.__multiContactQA.renderOnly());
  if (map) await page.evaluate(() => window.__multiContactQA.openMap());
  const sample = await page.evaluate(() => window.__multiContactQA.snapshot());
  const path = resolve(output, name + ".png");
  await page.screenshot({ path });
  report.screenshots.push(path);
  assert.equal(sample.glError, 0);
  return sample;
}
try {
  server = await createServer({
    cacheDir: ".qa/multi-contact-20261008/vite-cache", clearScreen: false,
    server: { host: "127.0.0.1", port: 5286, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("pageerror", error => report.errors.push(String(error.stack ?? error)));
  page.on("console", message => {
    if (message.type() === "warning") report.warnings.push(message.text());
  });
  await page.route("**/src/main.ts", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + "\n" + bridge });
  });
  await page.goto(origin, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__multiContactQA), undefined, { timeout: 60000 });
  await page.evaluate(() => window.__multiContactQA.fixture());
  await page.evaluate(() => window.__multiContactQA.readiness());
  let sample = await page.evaluate(() => window.__multiContactQA.snapshot());
  assertIds(sample.consumedContacts, ["qa-enemy-a", "qa-enemy-b"]);
  assertIds(sample.mapContacts, ["qa-enemy-a", "qa-enemy-b"]);
  for (const id of ["qa-enemy-a", "qa-enemy-b"]) {
    assert.equal(contact(sample, id)?.mode, "acquiring");
    assert.equal(ship(sample, id)?.enabled, true);
    assert(ship(sample, id).outlinedBodies > 0);
    assert(ship(sample, id).maxBodyVisibility < .1);
  }
  assert.equal(ship(sample, "qa-unseen")?.enabled, false);
  check("first real sensor sample renders two independent acquisition silhouettes, third ship hidden", sample);

  await page.evaluate(() => window.__multiContactQA.tick(2.5));
  sample = await page.evaluate(() => window.__multiContactQA.tick(5));
  assertFull(sample, "qa-enemy-a"); assertFull(sample, "qa-enemy-b");
  assert.equal(ship(sample, "qa-unseen")?.enabled, false);
  await page.evaluate(() => window.__multiContactQA.overview());
  sample = await capture("two-live-ships");
  check("three production sensor samples fully render both actual ships", sample);
  sample = await capture("two-live-map-markers", true);
  assertIds(sample.markers, ["qa-enemy-a", "qa-enemy-b"]);
  for (const marker of sample.markers) assert(marker.redPixels > 0, marker.id + " marker not drawn");
  check("actual large chart contains and draws two enemy markers, never unseen third", sample);
  await page.evaluate(() => window.__multiContactQA.closeMap());

  await page.evaluate(() => {
    window.__multiContactQA.move("qa-enemy-a", -450, 1400);
    window.__multiContactQA.move("qa-enemy-b", 450, 500);
    window.__multiContactQA.reverseShipOrder();
  });
  sample = await page.evaluate(() => window.__multiContactQA.tick(7.5));
  assertFull(sample, "qa-enemy-a"); assertFull(sample, "qa-enemy-b");
  assert.equal(sample.rawPlayerContactOrder[0], "qa-enemy-b");
  assert.equal(sample.primaryTargetId, "qa-enemy-b");
  check("nearest target reordering does not reset either established contact", sample);
  const lastB = structuredClone(contact(sample, "qa-enemy-b"));
  await page.evaluate(() => window.__multiContactQA.move("qa-enemy-b", 9000, 6000));
  sample = await page.evaluate(() => window.__multiContactQA.tick(10));
  assertFull(sample, "qa-enemy-a");
  assert.equal(contact(sample, "qa-enemy-b")?.live, false);
  assert.equal(ship(sample, "qa-enemy-b")?.enabled, true);
  assert(ship(sample, "qa-enemy-b").outlinedBodies > 0);
  assert(ship(sample, "qa-enemy-b").maxBodyVisibility < .1);
  const ghost = contact(sample, "qa-enemy-b");
  assert(Math.hypot(ghost.position.x - lastB.position.x, ghost.position.z - lastB.position.z) > 1);
  assert(Math.hypot(ghost.position.x - 9000, ghost.position.z - 6000) > 5000);
  assert(Math.abs(ship(sample, "qa-enemy-b").rootPosition[0] - ghost.position.x) < .001);
  assert(Math.abs(ship(sample, "qa-enemy-b").rootPosition[2] - ghost.position.z) < .001);
  check("only lost ship becomes outlined dead-reckoned ghost; other ship stays fully visible", sample);
  sample = await capture("one-live-one-ghost-map", true);
  assertIds(sample.mapContacts, ["qa-enemy-a", "qa-enemy-b"]);
  assertIds(sample.markers, ["qa-enemy-a"]);
  check("lost estimate remains chart information but is not a live selectable enemy", sample);
  await page.evaluate(() => window.__multiContactQA.closeMap());
  sample = await page.evaluate(() => window.__multiContactQA.tick(33));
  assertIds(sample.consumedContacts, ["qa-enemy-a"]);
  assertIds(sample.mapContacts, ["qa-enemy-a"]);
  assertFull(sample, "qa-enemy-a");
  assert.equal(ship(sample, "qa-enemy-b")?.enabled, false);
  check("expired lost contact disappears without disturbing surviving live track", sample);

  sample = await page.evaluate(() => window.__multiContactQA.switchObserver("qa-observer"));
  assertIds(sample.consumedContacts, []);
  assertIds(sample.mapContacts, []);
  check("actual developer observer-switch callback clears previous observer contacts", sample);
  sample = await page.evaluate(() => window.__multiContactQA.releaseObserver());
  assert.equal(contact(sample, "qa-enemy-a")?.mode, "acquiring");
  assert.equal(contact(sample, "qa-enemy-b"), undefined);
  check("returning to player observer reacquires rather than inheriting former lock", sample);
  sample = await page.evaluate(() => window.__multiContactQA.fixture("battle", true));
  assertIds(sample.consumedContacts, []);
  assertIds(sample.mapContacts, []);
  for (const id of ["qa-enemy-a", "qa-enemy-b", "qa-unseen"]) assert.equal(ship(sample, id)?.enabled, false);
  check("new battle lifecycle clears all prior tracks, including same entity IDs", sample);

  await page.evaluate(() => window.__multiContactQA.fixture("sea-trials", false));
  await page.evaluate(() => window.__multiContactQA.readiness());
  sample = await capture("sea-trials-all-enemy-markers", true);
  assertIds(sample.mapContacts, ["qa-enemy-a", "qa-enemy-b", "qa-unseen"]);
  assertIds(sample.markers, ["qa-enemy-a", "qa-enemy-b", "qa-unseen"]);
  for (const marker of sample.markers) assert(marker.redPixels > 0, marker.id + " sea-trials marker not drawn");
  for (const id of ["qa-enemy-a", "qa-enemy-b", "qa-unseen"]) {
    assert.equal(ship(sample, id)?.enabled, true);
    assert.equal(ship(sample, id)?.outlinedBodies, 0);
  }
  check("sea trials still expose every living target model and chart marker", sample);
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error.stack ?? error);
  console.error(report.failure); process.exitCode = 1;
  await page?.screenshot({ path: resolve(output, "failure.png"), timeout: 10000 }).catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  report.serverClosed = true;
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, checks: report.checks.length, errors: report.errors.length,
    serverClosed: report.serverClosed, report: resolve(output, "report.json") }));
}
