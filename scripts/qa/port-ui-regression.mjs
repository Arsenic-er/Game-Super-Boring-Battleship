import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.qa/browsers');
process.env.LD_LIBRARY_PATH = [resolve('.qa/sysroot/usr/lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const { chromium } = await import('../../.qa/node_modules/playwright/index.mjs');
const out = resolve(process.env.PORT_QA_OUT ?? '.qa/port-079');
await mkdir(out, { recursive: true });
const report = { checks: [], errors: [], failedRequests: [], screenshots: [], renderer: 'Chromium SwiftShader; visual/interaction QA, not a hardware FPS measurement' };
let server, browser, page;
const check = (name, evidence = true) => { report.checks.push({ name, evidence }); console.log('PASS', name); };
async function shot(name) {
  const path = resolve(out, `${name}.png`); await page.screenshot({ path });
  report.screenshots.push({ name, path, viewport: page.viewportSize() });
}
async function outlineState() {
  return page.locator('.dock-preview').evaluate(canvas => ({
    key: canvas.dataset.dockHoverComponent ?? '',
    meshes: Number(canvas.dataset.dockOutlineMeshCount ?? 0),
  }));
}
async function findOutlinedComponent() {
  const box = await page.locator('.dock-preview').boundingBox();
  for (let y=.25; y<.82; y+=.065) for (let x=.12; x<.94; x+=.055) {
    const point = {x:box.x+box.width*x,y:box.y+box.height*y};
    await page.mouse.move(point.x,point.y);
    await page.waitForTimeout(85);
    const state = await outlineState();
    if (state.meshes > 0) {
      // First triangle hits can sit on an animated barrel edge. Find the
      // interior of the same component without freezing the ship motion.
      const hits = [];
      for (let dy=-24;dy<=24;dy+=8) for (let dx=-24;dx<=24;dx+=8) {
        const candidate={x:point.x+dx,y:point.y+dy};
        await page.mouse.move(candidate.x,candidate.y);
        await page.waitForTimeout(120);
        const sample=await outlineState();
        if(sample.key===state.key && sample.meshes===state.meshes) hits.push(candidate);
      }
      if(!hits.length) continue;
      const center=hits.reduce((a,p)=>({x:a.x+p.x/hits.length,y:a.y+p.y/hits.length}),{x:0,y:0});
      hits.sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y));
      for(const candidate of hits.slice(0,6)) {
        await page.mouse.move(candidate.x,candidate.y); await page.waitForTimeout(220);
        if((await outlineState()).key!==state.key) continue;
        await page.waitForTimeout(220);
        if((await outlineState()).key===state.key) return {...candidate,...state};
      }
    }
  }
  throw Error('No actual external component was outlined');
}

try {
  server = await preview({ preview: { host: '127.0.0.1', port: 5278, strictPort: true }, clearScreen: false });
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error.stack ?? error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto('http://127.0.0.1:5278/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('.port-shell[data-port-tab="dock"]').waitFor({ state: 'visible' });
  await page.locator('.dock-preview[data-model-ready="true"]').waitFor({state:'visible'});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);
  await shot('initial-complete-hull');
  assert.equal(await page.locator('.port-drawer:visible').count(), 0);
  assert.equal(await page.locator('.dock-hover-tooltip:visible').count(), 0);
  check('startup is uncluttered dockyard without instructions or permanent component labels');
  await page.locator('[data-ship-class-id="j-class"]').click();
  await page.waitForTimeout(1600);
  await shot('port-wide');
  const store = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  report.profileKeys = Object.keys(store);
  await page.locator('.port-ship-actions [data-port-label="equipment"]').click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.port-drawer-equipment:visible').count(), 1);
  await shot('equipment');
  await page.keyboard.press('Escape'); await page.locator('.port-drawer-equipment').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.port-drawer:visible').count(), 0);
  assert.equal(await page.locator('.port-ship-actions [data-port-label="equipment"]').evaluate(e => e === document.activeElement), true);
  check('equipment drawer closes with Escape and restores focus');
  await page.locator('.port-ship-actions [data-port-label="builds"]').click();
  await page.waitForTimeout(350); await shot('loadouts');
  await page.locator('.port-drawer-builds [data-port-label="close"]').click();
  await page.locator('.port-drawer-builds').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.port-ship-actions [data-port-label="builds"]').evaluate(e => e === document.activeElement), true);
  check('close button returns focus to its opening control');
  // Very rapid input must cancel previous animation, not queue visibility work.
  await page.locator('.port-ship-actions [data-port-label="equipment"]').evaluate(button => { for(let i=0;i<7;i++) button.click(); });
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.port-drawer-equipment:visible').count(), 1);
  assert.equal(await page.locator('.port-drawer-equipment').evaluate(e => e.inert), false);
  await page.keyboard.press('Escape'); await page.locator('.port-drawer-equipment').waitFor({ state: 'hidden' });
  check('seven rapid toggles leave exactly one fully interactive panel');
  const canvas = await page.locator('.dock-preview').boundingBox();
  let hover = false;
  for (let y=.3; y<.75 && !hover; y+=.07) for (let x=.15; x<.9 && !hover; x+=.065) {
    await page.mouse.move(canvas.x+canvas.width*x,canvas.y+canvas.height*y);
    await page.waitForTimeout(70);
    hover = await page.locator('.dock-hover-tooltip:visible').count() > 0;
  }
  assert.ok(hover, 'at least one real component should be hoverable');
  await page.waitForTimeout(180); await shot('component-hover');
  check('hovering actual 3D geometry identifies its component', await page.locator('.dock-hover-tooltip').innerText());
  await page.mouse.move(10,10); await page.locator('.dock-hover-tooltip').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.dock-hover-tooltip:visible').count(), 0);
  check('component tooltip disappears when pointer leaves ship');
  await shot('outline-before');
  let outlined = await findOutlinedComponent();
  assert.match(outlined.key, /^(mainGun|torpedo|antiAir|sideGun|depthCharge):/);
  assert.ok(outlined.meshes > 0 && outlined.meshes < 100);
  assert.equal(await page.locator('.dock-hover-tooltip:visible').count(), 1);
  await page.waitForTimeout(250); await shot('outline-hover');
  check('actual external component has a bounded outline matching its tooltip', outlined);
  for (let cycle=0; cycle<30; cycle++) {
    await page.mouse.move(10,10); await page.waitForTimeout(30);
    assert.equal((await outlineState()).meshes, 0);
    await page.mouse.move(outlined.x,outlined.y);
    await page.waitForFunction(key=>document.querySelector('.dock-preview')?.dataset.dockHoverComponent===key,
      outlined.key,{timeout:1500});
    assert.equal((await outlineState()).key, outlined.key);
    assert.equal((await outlineState()).meshes, outlined.meshes);
  }
  check('thirty hover/leave cycles retain one component and clear every time');
  await page.mouse.down();
  assert.equal((await outlineState()).meshes, 0);
  await page.mouse.move(outlined.x+24,outlined.y+12,{steps:3});
  assert.equal((await outlineState()).meshes, 0);
  await page.mouse.up();
  await page.mouse.move(10,10); await page.waitForTimeout(400);
  outlined = await findOutlinedComponent();
  await page.mouse.wheel(0,160);
  await page.waitForTimeout(100);
  assert.equal((await outlineState()).meshes, 0);
  check('orbit drag and zoom clear the previous component outline');
  for (const [width,height] of [[1280,720],[1440,900]]) {
    await page.setViewportSize({width,height}); await page.waitForTimeout(650);
    const sample = await findOutlinedComponent();
    await page.waitForTimeout(180); await shot(`outline-${width}`);
    check(`component outline renders at ${width}x${height}`,sample);
  }
  await page.mouse.move(10,10);
  await page.setViewportSize({width:1672,height:941}); await page.waitForTimeout(650);
  await page.locator('.port-departure').click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('.mission-panel:visible').count(), 1);
  await shot('voyage');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  assert.equal(await page.locator('.dock-panel:visible').count(), 1);
  check('departure opens real mode selection; Escape returns to port');
  for(const width of [1280,1024]) {
    await page.setViewportSize({ width, height: width === 1024 ? 640 : 720 });
    await page.waitForTimeout(1000); await shot(`port-${width}`);
    for(const selector of ['.port-departure','.port-utilities','.port-ship-caption','.hull-list']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x+box.width <= width+1 && box.y+box.height <= page.viewportSize().height+1, `${selector} fits ${width}`);
    }
    check(`persistent controls fit ${width}px viewport`);
  }
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))), store, 'inspection and navigation must not mutate loadout/profile saves');
  check('viewing, opening drawers and navigation preserve profile data');
  await page.setViewportSize({ width: 1672, height: 941 });
  for(const locale of ['en-US','de-DE','ru-RU','ja-JP','es-ES','zh-TW','zh-CN']) {
    await page.locator('.port-account').click();
    await page.locator('.port-drawer-profile').waitFor({ state: 'visible' });
    await page.locator('.port-drawer-profile .menu-language').selectOption(locale);
    await page.keyboard.press('Escape');
    await page.locator('.port-drawer-profile').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.port-shell').getAttribute('data-port-locale'), locale);
    assert.equal(await page.title(), await page.locator('.port-brand h1').innerText());
    if(['en-US','de-DE','ru-RU'].includes(locale)) await shot(`port-${locale}`);
  }
  check('all seven languages update port controls and window title');
  for(const tab of ['store','codex']) {
    await page.locator(`[data-menu-tab="${tab}"]`).click();
    await page.locator(`[data-menu-panel="${tab}"]`).waitFor({ state: 'visible' });
    await shot(tab);
    await page.keyboard.press('Escape');
    await page.locator('.dock-panel').waitFor({ state: 'visible' });
  }
  check('armory and collection remain accessible and return to dockyard');
  await page.locator('.port-departure').click();
  await page.locator('.start-battle').click();
  await page.locator('.voyage-briefing:visible,.battle-setup:visible').first().waitFor({state:'visible'});
  if(await page.locator('.voyage-briefing:visible').count()) await page.locator('[data-voyage="briefing-skip"]').click();
  await page.locator('.battle-setup').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.confirm-battle-setup').isEnabled(),true);
  await shot('battle-setup');
  await page.locator('.battle-setup-back').click();
  await page.locator('.open-multiplayer-menu').click();
  await page.locator('.multiplayer-menu-host').waitFor({ state: 'visible' });
  await shot('multiplayer');
  check('single-player preparation and multiplayer directory are reachable');
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.failedRequests.length, 0, JSON.stringify(report.failedRequests));
  report.ok = true;
} catch (error) {
  report.failure = String(error.stack ?? error); console.error(report.failure);
  if(page) {
    report.failureDom = await page.evaluate(() => [...document.querySelectorAll('.port-drawer')].map(e => ({ classes: e.className, hidden: e.hidden, inert: e.inert, opacity: getComputedStyle(e).opacity, animations: e.getAnimations().map(a => ({ state: a.playState, time: a.currentTime })) }))).catch(()=>[]);
    await shot('failure').catch(()=>{});
  }
  process.exitCode = 1;
}
finally {
  await browser?.close();
  if(server) await new Promise(resolve => server.httpServer.close(resolve));
  report.serverClosed = true; report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out,'ui-report.json'), JSON.stringify(report,null,2));
}
