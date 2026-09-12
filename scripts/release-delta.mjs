#!/usr/bin/env node
/** Dependency-free artifact transport, not a game build. Failed apply retains its fresh staging directory. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createGzip, gunzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const MAGIC = Buffer.from('BSDLT001');
const HEADER = 12;
const MAX_METADATA = 32 * 1024 * 1024;
const MAX_PAYLOAD = 512 * 1024 * 1024;
const MAX_FILE = 1024 * 1024 * 1024;
const MIN_CHUNK = 2048, MAX_CHUNK = 32768, MASK = 8191;
const FORMAT = 'battleship-delta-v1';
const sha = data => createHash('sha256').update(data).digest('hex');
const fail = message => { throw new Error(message); };
const integer = (n, name, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > max) fail(`Invalid ${name}`);
  return n;
};
const exists = p => { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const portableKey = p => p.toLowerCase();

function relativeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || path.posix.isAbsolute(name)) fail('Unsafe relative path');
  for (const part of name.split('/')) {
    if (!part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) fail(`Unsafe relative path: ${name}`);
  }
  return name;
}

function noSymlinkAncestors(p) {
  let current = path.resolve(p);
  while (true) {
    if (exists(current) && fs.lstatSync(current).isSymbolicLink()) fail(`Symlink path rejected: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(p);
}

function within(parent, child) {
  const a = process.platform === 'win32' ? parent.toLowerCase() : parent;
  const b = process.platform === 'win32' ? child.toLowerCase() : child;
  const rel = path.relative(a, b);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function separate(a, b) {
  if (within(a, b) || within(b, a)) fail(`Unsafe overlapping paths: ${a} / ${b}`);
}

function directoryRoot(p) {
  const root = noSymlinkAncestors(p);
  if (!fs.statSync(root).isDirectory()) fail(`Not a directory: ${root}`);
  return root;
}

function freshOutput(p) {
  const output = noSymlinkAncestors(p);
  if (exists(output)) fail(`Output must not exist: ${output}`);
  if (!fs.statSync(path.dirname(output)).isDirectory()) fail('Output parent must exist');
  return output;
}

function readRegular(file) {
  if (!fs.lstatSync(file).isFile()) fail(`Non-regular file rejected: ${file}`);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_FILE) fail(`Invalid or oversized file: ${file}`);
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}

function scan(root) {
  const files = [], directories = [];
  const visit = (folder, prefix = '') => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const name = relativeName(prefix ? `${prefix}/${entry.name}` : entry.name);
      const full = path.join(folder, entry.name), stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) fail(`Symlink rejected: ${name}`);
      if (stat.isDirectory()) { directories.push(name); visit(full, name); }
      else if (stat.isFile()) {
        const bytes = readRegular(full);
        files.push({ path: name, size: bytes.length, sha256: sha(bytes), mode: stat.mode & 0o777 });
      } else fail(`Non-regular entry rejected: ${name}`);
    }
  };
  visit(root);
  const manifest = { directories, files };
  validateManifest(manifest, false);
  return manifest;
}

function validateManifest(manifest, operations) {
  if (!manifest || !Array.isArray(manifest.files) || !Array.isArray(manifest.directories)
    || manifest.files.length + manifest.directories.length > 100000) fail('Invalid manifest');
  const names = new Map();
  for (const name of manifest.directories) {
    relativeName(name); const key = portableKey(name);
    if (names.has(key)) fail(`Duplicate path: ${name}`);
    names.set(key, 'dir');
  }
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') fail('Invalid file record');
    relativeName(file.path); const key = portableKey(file.path);
    if (names.has(key)) fail(`Duplicate path: ${file.path}`);
    names.set(key, 'file');
    integer(file.size, 'file size', MAX_FILE); integer(file.mode, 'file mode', 0o777);
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) fail('Invalid SHA-256');
    if (operations && !Array.isArray(file.ops)) fail('Missing file operations');
  }
  for (const [name] of names) {
    let parent = path.posix.dirname(name);
    while (parent !== '.') {
      if (names.get(parent) !== 'dir') fail(`Missing or conflicting parent directory: ${name}`);
      parent = path.posix.dirname(parent);
    }
  }
}

const GEAR = (() => {
  const table = new Uint32Array(256); let seed = 0x9e3779b9;
  for (let i = 0; i < 256; ++i) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; table[i] = seed >>> 0;
  }
  return table;
})();

function* chunks(data) {
  let start = 0, hash = 0;
  for (let i = 0; i < data.length; ++i) {
    hash = ((hash << 1) + GEAR[data[i]]) >>> 0;
    const length = i + 1 - start;
    if (length >= MAX_CHUNK || (length >= MIN_CHUNK && (hash & MASK) === 0)) {
      yield [start, length]; start = i + 1; hash = 0;
    }
  }
  if (start < data.length) yield [start, data.length - start];
}

export async function createDelta(oldDirectory, newDirectory, patchFile) {
  const oldRoot = directoryRoot(oldDirectory), newRoot = directoryRoot(newDirectory);
  separate(oldRoot, newRoot);
  const output = freshOutput(patchFile); separate(oldRoot, output); separate(newRoot, output);
  const base = scan(oldRoot), target = scan(newRoot), oldFiles = new Map(base.files.map(f => [f.path, f]));
  const literals = []; let literalBytes = 0, copiedBytes = 0;
  for (const file of target.files) {
    const data = readRegular(path.join(newRoot, file.path));
    if (sha(data) !== file.sha256) fail(`Target changed during creation: ${file.path}`);
    const old = oldFiles.get(file.path); file.ops = [];
    if (old && old.sha256 === file.sha256 && old.size === file.size) {
      if (file.size) file.ops.push({ copy: [old.path, 0, old.size] });
      copiedBytes += file.size; continue;
    }
    const index = new Map();
    if (old) {
      const bytes = readRegular(path.join(oldRoot, old.path));
      if (sha(bytes) !== old.sha256) fail(`Base changed during creation: ${old.path}`);
      for (const [offset, size] of chunks(bytes)) {
        const key = `${size}:${sha(bytes.subarray(offset, offset + size))}`;
        const offsets = index.get(key) ?? []; offsets.push(offset); index.set(key, offsets);
      }
    }
    for (const [offset, size] of chunks(data)) {
      const bytes = data.subarray(offset, offset + size), candidates = index.get(`${size}:${sha(bytes)}`);
      const last = file.ops.at(-1);
      if (candidates) {
        const end = last?.copy ? last.copy[1] + last.copy[2] : -1;
        const source = candidates.includes(end) ? end : candidates[0];
        if (last?.copy && last.copy[0] === old.path && end === source) last.copy[2] += size;
        else file.ops.push({ copy: [old.path, source, size] });
        copiedBytes += size;
      } else {
        if (last?.literal && last.literal[0] + last.literal[1] === literalBytes) last.literal[1] += size;
        else file.ops.push({ literal: [literalBytes, size] });
        literals.push(bytes); literalBytes += size;
      }
    }
  }
  const metadata = { format: FORMAT, algorithm: 'gear32-2k-8k-32k-sha256', base, target, literalBytes };
  const json = Buffer.from(JSON.stringify(metadata));
  if (json.length > MAX_METADATA || json.length + literalBytes + HEADER > MAX_PAYLOAD) fail('Patch payload exceeds safety limit');
  const header = Buffer.alloc(HEADER); MAGIC.copy(header); header.writeUInt32LE(json.length, 8);
  const stream = fs.createWriteStream(output, { flags: 'wx' });
  try { await pipeline(Readable.from([header, json, ...literals]), createGzip({ level: 9 }), stream); }
  catch (error) { throw new Error(`Patch creation failed; incomplete patch may remain at ${output}`, { cause: error }); }
  return { mode: 'create', baseFiles: base.files.length, targetFiles: target.files.length,
    copiedBytes, literalBytes, patchBytes: fs.statSync(output).size,
    targetBytes: target.files.reduce((sum, file) => sum + file.size, 0) };
}

function decodePatch(patchFile) {
  const compressed = readRegular(patchFile);
  const payload = gunzipSync(compressed, { maxOutputLength: MAX_PAYLOAD });
  if (payload.length < HEADER || !payload.subarray(0, 8).equals(MAGIC)) fail('Invalid patch header');
  const size = payload.readUInt32LE(8);
  if (size > MAX_METADATA || HEADER + size > payload.length) fail('Invalid metadata length');
  const meta = JSON.parse(payload.subarray(HEADER, HEADER + size).toString('utf8'));
  if (meta.format !== FORMAT || meta.algorithm !== 'gear32-2k-8k-32k-sha256') fail('Unsupported patch format');
  validateManifest(meta.base, false); validateManifest(meta.target, true);
  integer(meta.literalBytes, 'literal length', MAX_PAYLOAD);
  const literals = payload.subarray(HEADER + size);
  if (literals.length !== meta.literalBytes) fail('Literal payload length mismatch');
  const base = new Map(meta.base.files.map(file => [file.path, file]));
  let total = 0;
  for (const file of meta.target.files) {
    let written = 0;
    if (file.ops.length > 1000000) fail('Too many operations');
    for (const op of file.ops) {
      if (!op || typeof op !== 'object' || (!!op.copy === !!op.literal) || Object.keys(op).length !== 1) fail('Invalid copy/literal operation');
      let length;
      if (op.copy) {
        if (!Array.isArray(op.copy) || op.copy.length !== 3) fail('Invalid copy operation');
        const [name, offset, size] = op.copy; relativeName(name);
        const source = base.get(name); integer(offset, 'copy offset'); integer(size, 'copy size');
        if (!source || size === 0 || offset > source.size || size > source.size - offset) fail('Copy exceeds base file');
        length = size;
      } else {
        if (!Array.isArray(op.literal) || op.literal.length !== 2) fail('Invalid literal operation');
        const [offset, size] = op.literal; integer(offset, 'literal offset'); integer(size, 'literal size');
        if (size === 0 || offset > literals.length || size > literals.length - offset) fail('Literal exceeds payload');
        length = size;
      }
      written += length;
      if (!Number.isSafeInteger(written) || written > file.size) fail('Operations exceed target size');
    }
    if (written !== file.size) fail('Operations do not fill target');
    total += file.size;
    if (total > 4 * MAX_FILE) fail('Target exceeds safety limit');
  }
  return { meta, literals };
}

function verifyBase(root, expected) {
  const actual = scan(root), a = new Map(actual.files.map(f => [f.path, f]));
  if (actual.files.length !== expected.files.length
    || JSON.stringify([...actual.directories].sort()) !== JSON.stringify([...expected.directories].sort())) fail('Base manifest mismatch');
  for (const file of expected.files) {
    const found = a.get(file.path);
    if (!found || found.size !== file.size || found.sha256 !== file.sha256) fail(`Base SHA-256 mismatch: ${file.path}`);
  }
}

export function applyDelta(oldDirectory, outputDirectory, patchFile) {
  const base = directoryRoot(oldDirectory), output = freshOutput(outputDirectory);
  const patch = noSymlinkAncestors(patchFile); separate(base, output); separate(output, patch);
  const { meta, literals } = decodePatch(patch);
  // Verify ALL old files, including removed/unchanged ones, before creating output or copying any bytes.
  verifyBase(base, meta.base);
  fs.mkdirSync(output);
  const handles = new Map(), buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (const name of [...meta.target.directories].sort((a,b) => a.split('/').length-b.split('/').length || a.localeCompare(b))) {
      fs.mkdirSync(path.join(output, name));
    }
    for (const file of meta.target.files) {
      const target = path.join(output, file.path);
      noSymlinkAncestors(path.dirname(target));
      const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
      const digest = createHash('sha256'); let count = 0;
      const write = bytes => {
        let position = 0;
        while (position < bytes.length) position += fs.writeSync(fd, bytes, position, bytes.length-position);
        digest.update(bytes); count += bytes.length;
      };
      try {
        for (const op of file.ops) {
          if (op.literal) {
            const [start, length] = op.literal;
            for (let offset = 0; offset < length; offset += buffer.length) write(literals.subarray(start+offset, start+Math.min(length,offset+buffer.length)));
          } else {
            const [name, start, length] = op.copy;
            let source = handles.get(name);
            if (source === undefined) {
              noSymlinkAncestors(path.join(base, name));
              source = fs.openSync(path.join(base, name), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
              if (!fs.fstatSync(source).isFile()) { fs.closeSync(source); fail('Base file is no longer regular'); }
              handles.set(name, source);
            }
            for (let offset = 0; offset < length;) {
              const wanted = Math.min(buffer.length, length-offset);
              const n = fs.readSync(source, buffer, 0, wanted, start+offset);
              if (n === 0) fail(`Unexpected end of base file: ${name}`);
              write(buffer.subarray(0,n)); offset += n;
            }
          }
        }
        if (count !== file.size || digest.digest('hex') !== file.sha256) fail(`Target SHA-256 mismatch: ${file.path}`);
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      fs.chmodSync(target, file.mode);
    }
    // Independent reread, not merely the hash of bytes offered to write(). No success before this gate.
    verifyBase(output, meta.target);
    return { mode: 'apply', verified: true, targetFiles: meta.target.files.length,
      targetBytes: meta.target.files.reduce((sum, file) => sum+file.size, 0), output };
  } catch (error) {
    throw new Error(`Reconstruction failed; incomplete staging retained at ${output}: ${error.message}`, { cause: error });
  } finally { for (const fd of handles.values()) fs.closeSync(fd); }
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Create: node release-delta.mjs create OLD_DIR NEW_DIR OUT_GZ\nApply:  node release-delta.mjs apply OLD_DIR OUT_DIR PATCH_GZ\nOutputs must not exist; inputs/outputs must not overlap or use symlinks. Base is never modified. Failed apply retains incomplete staging.');
    return;
  }
  if (args.length !== 4 || !['create','apply'].includes(args[0])) fail('Usage: release-delta.mjs create OLD_DIR NEW_DIR OUT_GZ | apply OLD_DIR OUT_DIR PATCH_GZ');
  const result = args[0] === 'create' ? await createDelta(...args.slice(1)) : applyDelta(...args.slice(1));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
