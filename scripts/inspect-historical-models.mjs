#!/usr/bin/env node
// Real WebGL gallery. Run only on the development server with its existing .qa runtime.
import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const [key, inline] = process.argv[i].split('=', 2);
  if (!key.startsWith('--')) throw Error(`Unexpected argument ${key}`);
  const next = process.argv[i + 1];
  args.set(key.slice(2), inline ?? (next && !next.startsWith('--') ? process.argv[++i] : true));
}
if (args.has('help')) {
  console.log('node scripts/inspect-historical-models.mjs [--kind aircraft|ships|equipment|all] [--ids a,b] [--views threequarter,side,top] [--hull-only] [--rarity common|purple|gold|redGold] [--background neutral|sky|transparent] [--port 5193] [--out .qa/historical-models]');
  process.exit(0);
}
const kind = String(args.get('kind') ?? 'all');
const ids = args.has('ids') ? String(args.get('ids')).split(',') : undefined;
const views = String(args.get('views') ?? 'threequarter,side,top').split(',');
const options = { hullOnly: args.has('hull-only'), rarity: String(args.get('rarity') ?? 'common'), background: String(args.get('background') ?? 'neutral') };
if (!['all', 'aircraft', 'ships', 'equipment'].includes(kind)) throw Error('Invalid --kind');
if (!['common', 'purple', 'gold', 'redGold'].includes(options.rarity)) throw Error('Invalid --rarity');
if (!['neutral', 'sky', 'transparent'].includes(options.background)) throw Error('Invalid --background');
if (views.some(view => !['threequarter', 'side', 'top', 'front', 'underside'].includes(view))) throw Error('Invalid --views');
const output = resolve(repo, String(args.get('out') ?? '.qa/historical-models'));
if (!output.startsWith(resolve(repo, '.qa') + '/')) throw Error('--out must remain inside this repository .qa directory');
const port = Number(args.get('port') ?? 5193);
await mkdir(output, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(repo, '.qa/browsers');
const sysroot = resolve(repo, '.qa/sysroot/usr/lib/x86_64-linux-gnu');
process.env.LD_LIBRARY_PATH = [sysroot, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const { chromium } = await import('../.qa/node_modules/playwright/index.mjs');
const report = { startedAt: new Date().toISOString(), kind, ids: ids ?? 'all', views, options,
  renderer: 'Real Babylon WebGL / Chromium SwiftShader; CPU submission timings are not a hardware gaming FPS benchmark',
  lightSource: 'CLEAR_DAY_RENDER plus exact gameView ambient/sun colour and direction',
  errors: [], warnings: [], requestsFailed: [], assets: [], contactSheets: [], ok: false };
let server, browser, page, closed = false;
async function cleanup() {
  if (closed) return;
  closed = true;
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => void cleanup().finally(() => process.exit(code)));
const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#3d454d}canvas{display:block;width:960px;height:640px}</style></head><body><canvas width="960" height="640"></canvas><script type="module" src="/scripts/qa/historicalModelsGallery.ts"></script></body></html>';
const escapeHtml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
try {
  server = await createServer({ root: repo, configFile: false, base: '/', cacheDir: join(output, '.vite-cache'), clearScreen: false,
    // Scan the actual gallery entry before first render, not the production index.html.
    // Otherwise late Babylon imports invalidate the cold cache and poison async shaders.
    optimizeDeps: { entries: ['scripts/qa/historicalModelsGallery.ts'] },
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
    plugins: [{ name: 'historical-qa-only', configureServer(vite) {
      vite.middlewares.use('/__historical_qa', (_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(options.background === 'transparent' ? html.replace('background:#3d454d', 'background:transparent') : html); });
    } }],
  });
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(String(error.stack ?? error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); else if (message.type() === 'warning') report.warnings.push(message.text()); });
  page.on('requestfailed', request => report.requestsFailed.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/__historical_qa`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__historicalModels), undefined, { timeout: 60000 });
  const catalogue = await page.evaluate(() => window.__historicalModels.catalogue);
  const selected = catalogue.filter(entry => (kind === 'all' || entry.kind === kind) && (!ids || ids.includes(entry.id)));
  if (!selected.length) throw Error('Selection contains no models');
  if (ids && ids.some(id => !selected.some(entry => entry.id === id))) throw Error('Some requested IDs were not found in selected kind');
  report.expectedModels = selected.length;
  for (const entry of selected) {
    const asset = { ...entry, shots: [], views: [] };
    report.assets.push(asset);
    try {
      await page.evaluate(async ({ entry, options }) => window.__historicalModels.load(entry, options), { entry, options });
      const folder = join(output, entry.kind, entry.id);
      await mkdir(folder, { recursive: true });
      for (const view of views) {
        const metrics = await page.evaluate(view => window.__historicalModels.render(view), view);
        if (metrics.actualDrawCalls <= 0 || metrics.modelTriangles <= 0) throw Error('Engine rendered no model geometry');
        const shot = join(folder, `${view}.png`);
        await page.locator('canvas').screenshot({ path: shot, timeout: 30000, omitBackground: options.background === 'transparent' });
        asset.shots.push({ view, path: relative(repo, shot) }); asset.views.push(metrics);
      }
      console.log(JSON.stringify({ id: entry.id, triangles: asset.views[0].modelTriangles, draws: asset.views[0].actualDrawCalls, size: asset.views[0].bounds.size }));
    } catch (error) { asset.error = String(error.stack ?? error); report.errors.push(`${entry.id}: ${asset.error}`); }
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  await page.evaluate(() => window.__historicalModels.dispose());
  const sheetPage = await browser.newPage({ viewport: { width: 1560, height: 1000 }, deviceScaleFactor: 1 });
  const groups = new Map();
  for (const asset of report.assets.filter(asset => !asset.error)) {
    const group = asset.kind === 'equipment' ? `equipment-${asset.category}` : asset.kind === 'ships' ? `ships-${asset.category}` : 'aircraft';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(asset);
  }
  for (const [group, assets] of groups) {
    const primary = views.includes('threequarter') ? 'threequarter' : views[0];
    const assembly = group.startsWith('ships') ? options.hullOnly ? 'hull-only' : 'live equipment assembly' : group === 'aircraft' ? 'historical aircraft geometry' : 'individual equipment geometry';
    const cards = await Promise.all(assets.map(async asset => {
      const shot = asset.shots.find(shot => shot.view === primary);
      const buffer = await readFile(resolve(repo, shot.path));
      const metric = asset.views.find(metric => metric.view === primary);
      return `<article><img src="data:image/png;base64,${buffer.toString('base64')}"><h2>${escapeHtml(asset.id)}</h2><p>${escapeHtml(asset.name)}</p><small>${metric.modelTriangles} triangles · ${metric.actualDrawCalls} draws · ${metric.bounds.size.map(n => n.toFixed(2)).join(' × ')} m</small></article>`;
    }));
    await sheetPage.setContent(`<html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#141c24;color:#e5eef5;font:16px Arial,sans-serif}h1{font-size:24px;margin:0 0 8px}header p{color:#b5c7d7;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{background:#24313d;padding-bottom:16px;border:1px solid #415466}img{display:block;width:100%;aspect-ratio:1.5;object-fit:contain}h2,p,small{margin:10px 14px;display:block}h2{font-size:19px}article p{min-height:20px;font-size:14px;color:#cad8e4}small{font-size:13px;color:#a9bfd0}</style></head><body><header><h1>${escapeHtml(group)} · ${escapeHtml(primary)} · ${options.hullOnly ? 'hull-only' : 'live equipment assembly'}</h1><p>Actual Babylon WebGL · CLEAR_DAY_RENDER · neutral-background QA · individual top/side images and full metrics in report.json</p></header><section class="grid">${cards.join('')}</section></body></html>`);
    await sheetPage.evaluate(({ group, primary, assembly, background }) => {
      document.querySelector('h1').textContent = `${group} · ${primary} · ${assembly}`;
      document.querySelector('header p').textContent = `Actual Babylon WebGL · CLEAR_DAY_RENDER · ${background} background · exact camera angles checked · full metrics in report.json`;
    }, { group, primary, assembly, background: options.background });
    await sheetPage.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const path = join(output, `contact-${group}.png`);
    await sheetPage.screenshot({ path, fullPage: true }); report.contactSheets.push(relative(repo, path));
  }
  await sheetPage.close();
  report.ok = report.errors.length === 0 && report.requestsFailed.length === 0 && report.assets.length === selected.length && report.assets.every(asset => asset.views.length === views.length);
  if (!report.ok) process.exitCode = 1;
} catch (error) { report.errors.push(String(error.stack ?? error)); process.exitCode = 1; }
finally {
  await cleanup();
  report.finishedAt = new Date().toISOString(); report.serverClosed = closed;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  const rows = report.assets.map(asset => {
    const m = asset.views[0];
    return m ? `| ${asset.kind} | ${asset.id} | ${m.modelTriangles} | ${m.actualDrawCalls} | ${m.bounds.size.map(n => n.toFixed(3)).join(' × ')} | ${m.cpuSubmitMedianMs.toFixed(2)} |` : `| ${asset.kind} | ${asset.id} | ERROR | — | — | — |`;
  });
  await writeFile(join(output, 'report.md'), `# Historical-model WebGL gallery\n\nStatus: ${report.ok ? 'render checks passed; human visual review still required' : 'needs attention'}\n\n${report.renderer}\n\nLighting: ${report.lightSource}. No ocean, fog, shadows or postprocessing beyond the game exposure/contrast; neutral isolation is intentional.\n\n| Kind | ID | Static triangles | Actual draw calls | XYZ world size (m) | CPU submit median ms |\n| --- | --- | ---: | ---: | --- | ---: |\n${rows.join('\n')}\n\n## Loading / runtime errors\n\n${report.errors.length ? report.errors.map(error => '- ' + error.replaceAll('\n', ' ')).join('\n') : 'None.'}\n\n## Contact sheets\n\n${report.contactSheets.map(path => '- ' + path).join('\n')}\n\nThe temporary Vite server was closed by the script. See report.json for every camera, slot loadout, warning, frame timing and failed request.\n`);
  console.log(JSON.stringify({ ok: report.ok, models: report.assets.length, errors: report.errors.length, sheets: report.contactSheets, output, serverClosed: closed }));
}
