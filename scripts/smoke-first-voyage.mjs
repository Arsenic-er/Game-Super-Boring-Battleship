import { chromium } from '../.qa/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Browser-only lifecycle hooks are appended to a Vite response, never to shipped source.
const port = 5187;
const origin = `http://127.0.0.1:${port}`;
await mkdir('.qa/screenshots', { recursive: true });
await writeFile('.qa/vite-qa.config.mjs', "export default { base: './', server: { watch: { ignored: ['**/*'] }, hmr: false } };\n");
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', '.qa/vite-qa.config.mjs', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
let serverLog = ''; server.stdout.on('data', data => { serverLog += data; }); server.stderr.on('data', data => { serverLog += data; });
const report = { checks: [], errors: [], screenshots: [], syntheticTerminal: true };
let browser, page;
try {
  for (let retry = 0; ; retry++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (retry > 60 || server.exitCode !== null) throw Error(`QA server failed: ${serverLog}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/src/main.ts', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__voyageQa = { state: () => state, voyage: () => voyageSession, view: () => view, input: () => input, menus: () => menus, finish: () => { state.status = 'player-won'; state.endReason = 'score'; }, paused: () => paused };\n` });
  });
  const shot = async name => { const path = `.qa/screenshots/${name}.png`; await page.screenshot({ path }); report.screenshots.push(path); };
  const check = (name, evidence) => { report.checks.push({ name, evidence }); console.log(`PASS ${name}: ${JSON.stringify(evidence)}`); };
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__voyageQa), undefined, { timeout: 30000 });
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  await shot('01-start-1440');
  check('boot', await page.title());
  await page.locator('.main-open-settings').click();
  assert(await page.locator('.settings-menu').isVisible());
  await page.keyboard.press('Escape');
  assert(!(await page.locator('.settings-menu').isVisible()));
  check('main-menu settings Escape', true);
  await page.locator('.start-battle').click();
  await page.locator('.voyage-briefing').waitFor({ state: 'visible' });
  await shot('02-briefing-1440');
  await page.locator('[data-voyage="begin"]').click();
  await page.waitForFunction(() => window.__voyageQa.voyage().tutorialActive);
  const initial = await page.evaluate(() => ({ ships: window.__voyageQa.state().ships.length, mode: window.__voyageQa.state().mode, onboarding: window.__voyageQa.voyage().profile.onboarding, uuid: window.__voyageQa.voyage().context.battleId }));
  assert.equal(initial.ships, 2);
  check('first voyage is real 1v1', initial);
  // Software WebGL on the headless server is not a gaming GPU benchmark.
  // Lower only this test renderer's pixel count while exercising real input/simulation.
  await page.evaluate(() => window.__voyageQa.view().engine.setHardwareScalingLevel(6));
  await page.keyboard.press('KeyW'); await page.keyboard.press('KeyW'); await page.keyboard.press('KeyW'); await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.__voyageQa.voyage().profile.onboarding.currentStepId === 'aim', undefined, { timeout: 60000 });
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__voyageQa.voyage().profile.onboarding.currentStepId === 'fire');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__voyageQa.voyage().profile.onboarding.currentStepId === 'objective');
  await page.keyboard.up('Space');
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.__voyageQa.voyage().profile.onboarding.status === 'completed');
  check('actual tutorial input/movement/fire/map', await page.evaluate(() => window.__voyageQa.voyage().profile.onboarding));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__voyageQa.view().engine.setHardwareScalingLevel(1.5));
  await shot('03-battle-1440');
  await page.evaluate(() => window.__voyageQa.finish());
  await page.locator('.voyage-result').waitFor({ state: 'visible', timeout: 30000 });
  await shot('04-result-1440');
  const settlement = await page.evaluate(() => ({ completion: window.__voyageQa.voyage().result, profile: window.__voyageQa.voyage().profile }));
  check('synthetic terminal UI, real settlement', { state: settlement.completion.saveResult, ledger: settlement.profile.settledBattles });
  const battleId = initial.uuid;
  await page.locator('.voyage-result [data-voyage="dock"]').click();
  assert(await page.locator('.dock-panel').isVisible());
  await page.waitForTimeout(1500);
  const preview = await page.evaluate(() => {
    const dock = window.__voyageQa.menus().dockPreview;
    const rect = document.querySelector('.dock-preview').getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, viewportHeight: innerHeight, activeMeshes: dock.scene.getActiveMeshes().length };
  });
  assert(preview.top > 0 && preview.bottom <= preview.viewportHeight && preview.height >= 160 && preview.activeMeshes > 0, JSON.stringify(preview));
  check('dock model rendered inside visible bounded canvas', preview);
  await shot('05-dock-1440');
  const locales = await page.locator('.start-menu .menu-language option').evaluateAll(options => options.map(option => option.value));
  assert.equal(locales.length, 7);
  for (const locale of locales) {
    await page.locator('.start-menu .menu-language').selectOption(locale);
    const text = await page.locator('.dock-view-state').innerText();
    const description = await page.locator('.component-detail').innerText();
    assert(text.length > 0 && description.length > 10);
    check(`dock locale ${locale}`, { text, description: description.slice(0, 160) });
  }
  await page.locator('.start-menu .menu-language').selectOption('en-US');
  await page.setViewportSize({ width: 1280, height: 720 });
  assert(!/[\u3400-\u9fff]/u.test(await page.locator('.component-detail').innerText()));
  await page.locator('[data-dock-category="engine"]').click();
  await page.locator('[data-item="engine-common"]').click();
  await page.waitForTimeout(800);
  await shot('06-dock-en-1280');
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert(overflow.scroll <= overflow.width + 2);
  check('1280x720 no horizontal page overflow', overflow);
  await page.locator('[data-menu-tab="mission"]').click();
  await page.locator('.start-battle').click();
  await page.locator('.battle-setup').waitFor({ state: 'visible' });
  await page.locator('[data-fleet-size="5"]').click();
  await shot('07-setup-en-1280');
  await page.locator('.confirm-battle-setup').click();
  await page.waitForFunction(old => window.__voyageQa.voyage().context?.battleId !== old && window.__voyageQa.state().ships.length === 10, battleId);
  check('5v5 launch from saved build creates new UUID', await page.evaluate(() => ({ uuid: window.__voyageQa.voyage().context.battleId, ships: window.__voyageQa.state().ships.length })));
  await page.evaluate(() => {
    window.__saveBeforeQa = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('QA quota', 'QuotaExceededError'); };
    window.__voyageQa.finish();
  });
  await page.locator('.voyage-result [data-voyage="retry"]').waitFor({ state: 'visible' });
  assert(await page.locator('.voyage-result [data-voyage="again"]').isDisabled());
  await shot('08-pending-en-1280');
  await page.locator('.voyage-result [data-voyage="menu"]').click();
  assert(await page.locator('.voyage-pending').isVisible());
  assert(await page.locator('.commander-name').isDisabled());
  await page.locator('.start-trials').click();
  await page.waitForFunction(() => window.__voyageQa.state().mode === 'sea-trials');
  assert(await page.evaluate(() => window.__voyageQa.voyage().progression.profileLocked));
  await page.keyboard.press('Escape');
  await page.locator('.exit-main-menu').click();
  await page.evaluate(() => { Storage.prototype.setItem = window.__saveBeforeQa; });
  await page.locator('.voyage-pending [data-voyage="retry"]').click();
  await page.waitForFunction(() => !window.__voyageQa.voyage().progression.profileLocked);
  assert(!(await page.locator('.commander-name').isDisabled()));
  check('quota failure survives menu/sea trials, same settlement retry unlocks profile', true);
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error.stack ?? error); console.error(report.failure); process.exitCode = 1;
  if (page) {
    await page.screenshot({ path: '.qa/screenshots/failure.png' }).catch(() => {});
    report.pageText = await page.locator('body').innerText().catch(() => 'unavailable');
    report.debug = await page.evaluate(() => ({ onboarding: window.__voyageQa?.voyage().profile.onboarding, player: window.__voyageQa?.state().ships.find(ship => ship.id === 'player'), paused: window.__voyageQa?.paused() })).catch(() => undefined);
  }
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await writeFile('.qa/first-voyage-browser-report.json', JSON.stringify(report, null, 2));
}
