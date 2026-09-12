import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createDelta, applyDelta } from '../release-delta.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'battleship-delta-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const old = path.join(root,'old'), next = path.join(root,'new'), out = path.join(root,'out'), patch = path.join(root,'patch.gz');
  fs.mkdirSync(old); fs.mkdirSync(next);
  return {root,old,next,out,patch};
}
function binary(length) {
  const data = Buffer.alloc(length); let state = 0x12345678;
  for (let i=0;i<length;i++) { state ^= state<<13; state ^= state>>>17; state ^= state<<5; data[i] = state&255; }
  return data;
}
function put(root,name,data) { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.writeFileSync(path.join(root,name),data); }
function patchMetadata(source,output,change) {
  const data = gunzipSync(fs.readFileSync(source)), length = data.readUInt32LE(8);
  const meta = JSON.parse(data.subarray(12,12+length)); change(meta);
  const json = Buffer.from(JSON.stringify(meta)), header = Buffer.from(data.subarray(0,12)); header.writeUInt32LE(json.length,8);
  fs.writeFileSync(output,gzipSync(Buffer.concat([header,json,data.subarray(12+length)])));
}

test('reconstructs shifted PE/asar-like binary entries, edits, deletions, new/removed/empty files and empty directories', async t => {
  const f = fixture(t), bytes = binary(2*1024*1024);
  const changed = Buffer.concat([bytes.subarray(0,17001), Buffer.from('new asar header and version bytes'),
    bytes.subarray(17001,505003), bytes.subarray(507911,1300000), Buffer.from('inserted metadata'), bytes.subarray(1300000)]);
  put(f.old,'resources/app.asar',bytes); put(f.next,'resources/app.asar',changed);
  const pe = Buffer.from(bytes), newPe = Buffer.from(bytes); newPe.write('0.7.2',66666); pe.write('0.7.1',66666);
  put(f.old,'Battleship.exe',pe); put(f.next,'Battleship.exe',newPe);
  put(f.old,'same.dat','same'); put(f.next,'same.dat','same');
  put(f.old,'removed.dat','old'); put(f.next,'new.dat','new'); put(f.next,'empty.dat',Buffer.alloc(0));
  fs.mkdirSync(path.join(f.old,'removed-empty')); fs.mkdirSync(path.join(f.next,'empty-dir'));
  const made = await createDelta(f.old,f.next,f.patch);
  assert.ok(made.copiedBytes > 0.95*made.targetBytes,JSON.stringify(made));
  assert.ok(made.patchBytes < 0.10*made.targetBytes,JSON.stringify(made));
  const done = applyDelta(f.old,f.out,f.patch); assert.equal(done.verified,true);
  for (const name of ['resources/app.asar','Battleship.exe','same.dat','new.dat','empty.dat']) assert.deepEqual(fs.readFileSync(path.join(f.out,name)),fs.readFileSync(path.join(f.next,name)));
  assert.ok(fs.statSync(path.join(f.out,'empty-dir')).isDirectory());
  assert.equal(fs.existsSync(path.join(f.out,'removed.dat')),false);
  assert.equal(fs.existsSync(path.join(f.out,'removed-empty')),false);
  assert.deepEqual(fs.readFileSync(path.join(f.old,'resources/app.asar')),bytes);
});

test('supports a completely new installation from an empty exact base',async t => {
  const f=fixture(t); put(f.next,'nested/file.bin',binary(33000));
  await createDelta(f.old,f.next,f.patch); applyDelta(f.old,f.out,f.patch);
  assert.deepEqual(fs.readFileSync(path.join(f.out,'nested/file.bin')),fs.readFileSync(path.join(f.next,'nested/file.bin')));
});

test('rejects changed, extra or missing base files before any output is created',async t => {
  const f=fixture(t); put(f.old,'copy.bin','old'); put(f.next,'copy.bin','old'); put(f.old,'removed.bin','removed');
  await createDelta(f.old,f.next,f.patch);
  put(f.old,'removed.bin','changed'); assert.throws(()=>applyDelta(f.old,f.out,f.patch),/Base SHA-256/); assert.equal(fs.existsSync(f.out),false);
  put(f.old,'removed.bin','removed'); put(f.old,'extra.bin','extra'); assert.throws(()=>applyDelta(f.old,f.out,f.patch),/Base manifest/); assert.equal(fs.existsSync(f.out),false);
  fs.unlinkSync(path.join(f.old,'extra.bin')); fs.unlinkSync(path.join(f.old,'removed.bin'));
  assert.throws(()=>applyDelta(f.old,f.out,f.patch),/Base manifest/); assert.equal(fs.existsSync(f.out),false);
});

test('rejects existing output and overlapping base/output or create input trees',async t => {
  const f=fixture(t); put(f.old,'f','a'); put(f.next,'f','b'); await createDelta(f.old,f.next,f.patch);
  assert.throws(()=>applyDelta(f.old,f.old,f.patch),/must not exist/);
  assert.throws(()=>applyDelta(f.old,path.join(f.old,'nested-out'),f.patch),/overlapping/);
  await assert.rejects(createDelta(f.old,f.old,path.join(f.root,'overlap.gz')),/overlapping/);
  await assert.rejects(createDelta(f.old,f.next,path.join(f.next,'inside.gz')),/overlapping/);
});

test('rejects unsafe names, copy references, duplicate paths and malformed operation bounds before creating output',async t => {
  const f=fixture(t); put(f.old,'safe.bin','abc'); put(f.next,'safe.bin','abc'); await createDelta(f.old,f.next,f.patch);
  const mutations = [
    m=>{m.target.files[0].path='../escape';}, m=>{m.target.files[0].path='/absolute';},
    m=>{m.target.files[0].path='C:/absolute';}, m=>{m.target.files[0].path='dir\\escape';},
    m=>{m.target.files[0].path='safe.bin:stream';}, m=>{m.target.files[0].path='CON';},
    m=>{m.target.files.push({...m.target.files[0],path:'SAFE.BIN'});},
    m=>{m.target.files[0].ops=[{copy:['../escape',0,3]}];},
    m=>{m.target.files[0].ops=[{copy:['safe.bin',2,3]}];},
    m=>{m.target.files[0].ops=[{literal:[0,3]}];},
    m=>{m.target.files[0].ops=[{copy:['safe.bin',0,2]}];},
  ];
  for (let i=0;i<mutations.length;i++) {
    const patch=path.join(f.root,`bad-${i}.gz`); patchMetadata(f.patch,patch,mutations[i]);
    assert.throws(()=>applyDelta(f.old,f.out,patch)); assert.equal(fs.existsSync(f.out),false);
  }
});

test('rejects symlink files, directories and output ancestors without touching their destinations',async t => {
  const f=fixture(t); put(f.old,'f','a'); put(f.next,'f','b'); await createDelta(f.old,f.next,f.patch);
  const outside=path.join(f.root,'outside'); fs.mkdirSync(outside); put(outside,'secret','do not touch');
  fs.symlinkSync(outside,path.join(f.root,'link'),'dir');
  assert.throws(()=>applyDelta(f.old,path.join(f.root,'link','out'),f.patch),/Symlink/);
  fs.symlinkSync(path.join(outside,'secret'),path.join(f.old,'sym'));
  assert.throws(()=>applyDelta(f.old,f.out,f.patch),/Symlink/); assert.equal(fs.existsSync(f.out),false);
  await assert.rejects(createDelta(f.old,f.next,path.join(f.root,'sym.gz')),/Symlink/);
  assert.equal(fs.readFileSync(path.join(outside,'secret'),'utf8'),'do not touch');
});

test('fails the exact target SHA gate on tampering and never modifies the base',async t => {
  const f=fixture(t); put(f.old,'f','base'); put(f.next,'f','target'); await createDelta(f.old,f.next,f.patch);
  const tampered=path.join(f.root,'tampered.gz'); patchMetadata(f.patch,tampered,m=>{m.target.files[0].sha256='0'.repeat(64);});
  assert.throws(()=>applyDelta(f.old,f.out,tampered),/Target SHA-256 mismatch/);
  assert.equal(fs.readFileSync(path.join(f.old,'f'),'utf8'),'base');
  assert.throws(()=>applyDelta(f.old,f.out,f.patch),/must not exist/);
});

test('rejects truncated, corrupt or unsupported patches before creating output',async t => {
  const f=fixture(t); put(f.old,'f','a'); put(f.next,'f','b'); await createDelta(f.old,f.next,f.patch);
  const bytes=fs.readFileSync(f.patch), truncated=path.join(f.root,'truncated.gz'); fs.writeFileSync(truncated,bytes.subarray(0,bytes.length-5));
  assert.throws(()=>applyDelta(f.old,f.out,truncated)); assert.equal(fs.existsSync(f.out),false);
  const unsupported=path.join(f.root,'unsupported.gz'); patchMetadata(f.patch,unsupported,m=>{m.format='unknown';});
  assert.throws(()=>applyDelta(f.old,f.out,unsupported),/Unsupported/); assert.equal(fs.existsSync(f.out),false);
});
