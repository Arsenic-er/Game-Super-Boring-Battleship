import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '../../.qa/node_modules/playwright/index.mjs';

const report = { checks: [], errors: [] };
const output = '.qa/v073-input-regression';
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, base: './',
  server: { host: '127.0.0.1', port: 5195, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: { entries: ['index.html'] },
});
let browser, page;
const check = (name, evidence) => {
  report.checks.push({ name, evidence }); console.log(`PASS ${name}: ${JSON.stringify(evidence)}`);
};
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/src/main.ts', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.__inputQa={state:()=>state,map:()=>tacticalMap,view:()=>view,paused:()=>paused};\n` });
  });
  await page.goto('http://127.0.0.1:5195/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__inputQa));
  await page.locator('.start-trials').click();
  await page.waitForFunction(() => document.querySelector('.start-menu').hidden);
  await page.evaluate(() => window.__inputQa.view().engine.setHardwareScalingLevel(8));
  await page.keyboard.press('m');
  await page.locator('.large-map-canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__inputQa.map().airCommands.entities.filter(e => e.category === 'friendlySquadron').length === 3);

  const mapData = () => page.evaluate(() => {
    const map = window.__inputQa.map().airCommands;
    const c = document.querySelector('.large-map-canvas'), r = c.getBoundingClientRect();
    return { entities: map.entities, projection: map.projection,
      canvas: { x: r.x, y: r.y, width: r.width, height: r.height, pixelWidth: c.width, pixelHeight: c.height } };
  });
  const client = (point, canvas) => ({ x: canvas.x + point.x, y: canvas.y + point.y });
  let data = await mapData();
  const squads = data.entities.filter(e => e.category === 'friendlySquadron');
  const lo = { x: Math.min(...squads.map(e => e.point.x)) - 14, y: Math.min(...squads.map(e => e.point.y)) - 14 };
  const hi = { x: Math.max(...squads.map(e => e.point.x)) + 14, y: Math.max(...squads.map(e => e.point.y)) + 14 };
  let start = client(lo, data.canvas), end = client(hi, data.canvas);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  const rectangle = await page.locator('.map-marquee').evaluate(e => ({ visible: !e.hidden, width: e.style.width, height: e.style.height }));
  assert(rectangle.visible && parseFloat(rectangle.width) > 0 && parseFloat(rectangle.height) > 0);
  await page.mouse.up();
  const ids = await page.evaluate(() => [...window.__inputQa.map().airCommands.selectedIds()]);
  assert.deepEqual([...ids].sort(), squads.map(e => e.id).sort());
  check('real left drag still selects all three friendly squadrons with a rectangle', { ids, rectangle });

  async function patrolCase(name, reverse) {
    await page.keyboard.press('c');
    await page.locator('[data-air-command="patrolArea"]').click();
    data = await mapData();
    const p = data.projection;
    const a = { x: p.centerX - 65, y: p.centerY - 35 };
    const b = { x: p.centerX + 80, y: p.centerY + 75 };
    start = client(reverse ? b : a, data.canvas); end = client(reverse ? a : b, data.canvas);
    await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' });
    await page.mouse.move(end.x, end.y, { steps: 8 });
    const actual = await page.evaluate(() => {
      const c = window.__inputQa.map().airCommands, e = document.querySelector('.map-patrol-preview');
      return { gesture: c.gesture, projection: c.projection, preview: {
        visible: !e.hidden, left: parseFloat(e.style.left), top: parseFloat(e.style.top),
        width: parseFloat(e.style.width), height: parseFloat(e.style.height) } };
    });
    const g = actual.gesture, projection = actual.projection;
    const mid = { x: (g.start.x + g.current.x) / 2, y: (g.start.y + g.current.y) / 2 };
    const radius = Math.min(2000, Math.max(250, Math.hypot(g.current.x - g.start.x, g.current.y - g.start.y) / projection.scale / 2));
    const expected = { center: { x: (projection.worldCenterX ?? 0) + (mid.x - projection.centerX) / projection.scale,
      y: 180, z: (projection.worldCenterZ ?? 0) + (projection.centerY - mid.y) / projection.scale }, radius };
    assert(actual.preview.visible);
    assert(Math.abs(actual.preview.left + actual.preview.width / 2 - mid.x) < 1);
    assert(Math.abs(actual.preview.top + actual.preview.height / 2 - mid.y) < 1);
    assert(Math.abs(actual.preview.width / 2 - radius * projection.scale) < 1);
    assert.equal(actual.preview.width, actual.preview.height);
    await page.screenshot({ path: `${output}/${name}.png` });
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(({ ids, expected }) => ids.every(id => {
      const area = window.__inputQa.state().airSquadrons.find(s => s.id === id)?.order?.area;
      return area && Math.abs(area.center.x - expected.center.x) < .01
        && Math.abs(area.center.z - expected.center.z) < .01 && Math.abs(area.radius - expected.radius) < .01;
    }), { ids, expected }, { timeout: 20000 });
    check(name, { preview: actual.preview, expected, ids });
    return expected;
  }
  await patrolCase('patrol-midpoint-forward', false);
  const previousScale = (await mapData()).projection.scale;
  await page.keyboard.press('Equal');
  await page.waitForFunction(scale => window.__inputQa.map().airCommands.projection.scale > scale, previousScale);
  const expected = await patrolCase('patrol-midpoint-reverse-zoomed', true);
  await page.keyboard.press('Escape');
  const orders = await page.evaluate(ids => ids.map(id => window.__inputQa.state().airSquadrons.find(s => s.id === id)?.order), ids);
  for (const order of orders) {
    assert.equal(order.kind, 'patrolArea'); assert(Math.abs(order.area.radius - expected.radius) < .01);
  }
  check('closing map retains the committed patrol orders', orders);
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error.stack ?? error); process.exitCode = 1;
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
} finally {
  await browser?.close(); await server.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
