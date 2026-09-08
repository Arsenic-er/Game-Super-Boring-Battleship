import { listPackage, extractFile } from '@electron/asar';
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('release/win-unpacked');
const asar = join(root, 'resources/app.asar');
const entries = listPackage(asar);
const packaged = JSON.parse(extractFile(asar, 'package.json').toString());
assert.equal(packaged.version, '0.7.1');
assert(entries.some(entry => entry.endsWith('/desktop/preload.cjs')));
assert(entries.some(entry => entry.endsWith('/node_modules/ws/package.json')));
const unwanted = entries.filter(entry => /\/node_modules\/(?:vite|vitest|electron-builder|playwright|postcss|undici|tar|typescript)\//.test(entry));
assert.equal(unwanted.length, 0, unwanted.slice(0, 12).join('\n'));
const files = [];
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, path);
    else if (entry.isFile()) files.push({ path, bytes: (await stat(absolute)).size, sha256: createHash('sha256').update(await readFile(absolute)).digest('hex') });
    else throw Error(`Unexpected release symlink: ${path}`);
  }
}
await walk(root);
assert(files.some(file => file.path.startsWith('resources/app.asar.unpacked/dist/assets/textures/')));
assert(files.some(file => file.path.startsWith('resources/app.asar.unpacked/dist/assets/cursors/')));
assert(files.some(file => file.path.startsWith('resources/app.asar.unpacked/dist/assets/equipment/')));
// Current sound effects are synthesized by Web Audio; no source audio directory exists.
files.sort((a, b) => a.path.localeCompare(b.path));
const report = { version: packaged.version, fileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), asarEntries: entries.length, excludedDevelopmentDependencies: true, files };
await writeFile('.qa/release-manifest.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, files: undefined }, null, 2));
