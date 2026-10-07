import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.qa/browsers');
process.env.LD_LIBRARY_PATH = [
  resolve('.qa/sysroot/usr/lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH,
].filter(Boolean).join(':');
const { chromium } = await import('../../.qa/node_modules/playwright/index.mjs');

const origin = 'http://127.0.0.1:5284';
const out = resolve('.qa/render-budget-20261007');
await mkdir(out, { recursive: true });
const report = {
  checks: [], errors: [], screenshots: [],
  renderer: 'Real game HTML and Babylon in isolated Chromium SwiftShader; not Surface/mobile hardware FPS',
  interaction: 'Launch and quality buttons use programmatic HTMLElement.click() on real handlers; not mouse or touch usability acceptance',
};
let server, browser, activePage;
const check = (name, evidence) => {
  report.checks.push({ name, evidence }); console.log('PASS', name);
};

async function snapshot(page) {
  return page.evaluate(() => {
    const view = window.__renderBudgetQA.view();
    const canvas = document.querySelector('#game-canvas');
    const rect = canvas.getBoundingClientRect();
    const box = selector => {
      const element = document.querySelector(selector), r = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return { x: r.x, y: r.y, width: r.width, height: r.height,
        fontSize: css.fontSize, transform: css.transform, display: css.display };
    };
    const engine = view.engine;
    return {
      quality: view.getQuality(), mode: window.__renderBudgetQA.mode(),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      css: { width: rect.width, height: rect.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight },
      framebuffer: { width: canvas.width, height: canvas.height,
        engineWidth: engine.getRenderWidth(), engineHeight: engine.getRenderHeight() },
      hardwareScalingLevel: engine.getHardwareScalingLevel(),
      adaptToDeviceRatio: engine.adaptToDeviceRatio,
      glError: engine._gl.getError(),
      hud: { weaponBar: box('#weapon-bar'), dashboard: box('.ship-dashboard') },
    };
  });
}

function assertResolution(sample, quality) {
  assert.equal(sample.quality, quality);
  assert.equal(sample.adaptToDeviceRatio, false);
  assert.equal(sample.glError, 0);
  assert.equal(sample.css.width, sample.viewport.width);
  assert.equal(sample.css.height, sample.viewport.height);
  const scale = quality === 'low'
    ? Math.max(1.35, Math.sqrt(sample.css.width * sample.css.height / (1280 * 720))) : 1;
  assert(Math.abs(sample.hardwareScalingLevel - scale) < 1e-10);
  assert.equal(sample.framebuffer.width, Math.floor(sample.css.width / scale));
  assert.equal(sample.framebuffer.height, Math.floor(sample.css.height / scale));
  assert.equal(sample.framebuffer.engineWidth, sample.framebuffer.width);
  assert.equal(sample.framebuffer.engineHeight, sample.framebuffer.height);
  if (quality === 'low') assert(sample.framebuffer.width * sample.framebuffer.height <= 1280 * 720);
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function launch(viewport, deviceScaleFactor = 1, mobile = false) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor, isMobile: mobile, hasTouch: mobile,
  });
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => report.errors.push({ viewport, message: String(error.stack ?? error) }));
  await page.route('**/src/main.ts', async route => {
    const response = await route.fetch();
    // Expose references for observations only: no render/simulation method is replaced.
    await route.fulfill({ response, body: (await response.text())
      + '\nwindow.__renderBudgetQA={view:()=>view,mode:()=>currentMode};\n' });
  });
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__renderBudgetQA));
  await page.locator('.port-shell[data-port-tab="dock"]').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  const initial = await snapshot(page);
  assertResolution(initial, 'low');
  check('constructor/default low ' + viewport.width + 'x' + viewport.height + ' DPR ' + deviceScaleFactor, initial);
  await page.locator('.port-departure').evaluate(button => button.click());
  await page.locator('.start-trials').evaluate(button => button.click());
  await page.waitForFunction(() => document.querySelector('.game-shell')?.classList.contains('game-active')
    && window.__renderBudgetQA.mode() === 'sea-trials');
  await settle(page);
  const trials = await snapshot(page);
  assertResolution(trials, 'low');
  check('real port departure and sea-trials low ' + viewport.width + 'x' + viewport.height, trials);
  return { context, page };
}

try {
  server = await createServer({
    cacheDir: '.qa/render-budget-vite',
    server: { host: '127.0.0.1', port: 5284, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
    clearScreen: false,
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const desktop = await launch({ width: 1440, height: 900 });
  const lowBefore = await snapshot(desktop.page);
  await desktop.page.locator('[data-quality="medium"]').evaluate(button => button.click());
  await settle(desktop.page);
  const medium = await snapshot(desktop.page);
  assertResolution(medium, 'medium');
  assert.deepEqual(medium.hud, lowBefore.hud);
  assert.deepEqual(medium.css, lowBefore.css);
  check('actual medium quality handler keeps CSS-native framebuffer and identical HUD', medium);
  await desktop.page.locator('[data-quality="low"]').evaluate(button => button.click());
  await settle(desktop.page);
  const lowAgain = await snapshot(desktop.page);
  assertResolution(lowAgain, 'low');
  assert.deepEqual(lowAgain.framebuffer, lowBefore.framebuffer);
  assert.deepEqual(lowAgain.hud, lowBefore.hud);
  check('actual low quality handler restores budget without resizing HUD', lowAgain);

  await desktop.page.setViewportSize({ width: 2880, height: 1920 });
  await settle(desktop.page);
  const surface = await snapshot(desktop.page);
  assertResolution(surface, 'low');
  check('2880x1920 CSS resize stays within 720p-area budget', surface);
  const surfacePath = resolve(out, 'surface-resolution-low.png');
  await desktop.page.screenshot({ path: surfacePath });
  report.screenshots.push(surfacePath);
  for (let index = 0; index < 12; index++) {
    await desktop.page.evaluate(() => dispatchEvent(new Event('resize')));
    await settle(desktop.page);
  }
  const repeated = await snapshot(desktop.page);
  assertResolution(repeated, 'low');
  assert.deepEqual(repeated.framebuffer, surface.framebuffer);
  assert.deepEqual(repeated.hud, surface.hud);
  check('12 real window resize events do not progressively shrink framebuffer', repeated);

  await desktop.page.setViewportSize({ width: 844, height: 390 });
  await settle(desktop.page);
  const smallAgain = await snapshot(desktop.page);
  assertResolution(smallAgain, 'low');
  assert.equal(smallAgain.hardwareScalingLevel, 1.35);
  check('resizing downward restores minimum low scale', smallAgain);
  await desktop.context.close();

  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const mobile = await launch(viewport, 3, true);
    const low = await snapshot(mobile.page);
    assert.equal(low.viewport.dpr, 3);
    await mobile.page.locator('[data-quality="medium"]').evaluate(button => button.click());
    await settle(mobile.page);
    const mediumMobile = await snapshot(mobile.page);
    assertResolution(mediumMobile, 'medium');
    assert.deepEqual(mediumMobile.hud, low.hud);
    await mobile.page.locator('[data-quality="low"]').evaluate(button => button.click());
    await settle(mobile.page);
    const restored = await snapshot(mobile.page);
    assertResolution(restored, 'low');
    assert.deepEqual(restored.framebuffer, low.framebuffer);
    assert.deepEqual(restored.hud, low.hud);
    check('DPR3 quality roundtrip preserves CSS/HUD ' + viewport.width + 'x' + viewport.height, restored);
    const path = resolve(out, 'mobile-' + viewport.width + 'x' + viewport.height + '-dpr3.png');
    await mobile.page.screenshot({ path });
    report.screenshots.push(path);
    await mobile.context.close();
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = String(error.stack ?? error);
  console.error(report.failure);
  process.exitCode = 1;
  await activePage?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  report.serverClosed = true;
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, checks: report.checks.length, errors: report.errors.length, report: resolve(out, 'report.json') }));
}
