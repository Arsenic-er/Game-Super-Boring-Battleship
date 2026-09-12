import { createServer as createViteServer } from 'vite';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.qa/browsers');
process.env.LD_LIBRARY_PATH = [resolve('.qa/sysroot/usr/lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const { chromium } = await import('../../.qa/node_modules/playwright/index.mjs');

// Independent component fixture with the real browser Pointer Lock API. No shipped test global.
const html = `<!doctype html><html><head><style>
body{margin:0;background:#123;color:white}canvas{display:block;width:640px;height:360px;background:#345}
.pointer-lock-recovery{position:fixed;top:400px;left:20px}[hidden]{display:none!important}
button{min-height:40px;margin:8px}
</style></head><body><button id="start">Start/resume</button><main class="game-shell"><canvas id="game-canvas" width="640" height="360"></canvas></main>
<script type="module">
import { CombatPointerLock } from '/src/controllers/combatPointerLock.ts';
const canvas=document.querySelector('canvas'),shell=document.querySelector('main');
let active=false,yaw=0,pitch=0,moves=0,requests=0,rejectNext=false;const raw=[],focusEvents=[];
for(const name of ['blur','focus'])window.addEventListener(name,event=>focusEvents.push({name,trusted:event.isTrusted,focused:document.hasFocus()}));
const nativeRequest=canvas.requestPointerLock.bind(canvas);
canvas.requestPointerLock=()=>{requests++;if(rejectNext){rejectNext=false;return Promise.reject(new DOMException('Injected first-request refusal','NotAllowedError'));}return nativeRequest();};
const controller=new CombatPointerLock(canvas,{isActive:()=>active,onMove:(x,y)=>{yaw+=x;pitch+=y;moves++;}});
canvas.addEventListener('pointermove',event=>{raw.push({trusted:event.isTrusted,x:event.movementX,y:event.movementY,clientX:event.clientX,clientY:event.clientY,locked:document.pointerLockElement===canvas,yaw,pitch});});
const resume=()=>{active=true;shell.classList.add('game-active');controller.request();};
document.querySelector('#start').addEventListener('click',resume);
window.probe={state:()=>({locked:document.pointerLockElement===canvas,eligibleLocked:controller.isLocked,yaw,pitch,moves,requests,
hint:!document.querySelector('.pointer-lock-recovery').hidden,active,focused:document.hasFocus(),focusEvents,raw:raw.slice(-12)}),
modal:()=>{active=false;shell.classList.remove('game-active');controller.release();},
arm:()=>{active=true;shell.classList.add('game-active');},reject:()=>{rejectNext=true;},controller};
</script></body></html>`;

const report={scope:'real Chromium component Pointer Lock; actual packaged-game checks are separate',checks:[],skipped:[],errors:[]};
let vite,server,browser;
const check=(name,evidence)=>{report.checks.push({name,evidence});console.log(`PASS ${name}: ${JSON.stringify(evidence)}`);};
try {
  vite=await createViteServer({configFile:false,root:process.cwd(),appType:'custom',
    server:{middlewareMode:true,hmr:false,watch:{ignored:['**/*']}},optimizeDeps:{noDiscovery:true,include:[]}});
  server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else vite.middlewares(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1100,height:720}}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>Boolean(window.probe));
  const state=()=>page.evaluate(()=>window.probe.state());
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.pointerLockElement===document.querySelector('canvas'));
  assert.equal((await state()).requests,1);check('start trusted click owns native pointer lock in one request',await state());
  // Native mouse events continue to reach the locked canvas beyond its 640px edge.
  for(const x of [100,350,700,1000])await page.mouse.move(x,180);
  const moved=await state();assert.ok(moved.moves>=2);assert.equal(moved.locked,true);
  // Headless absolute-coordinate injection emits a +delta/-delta recenter pair.
  // Verify each real event's camera response, not the cancelling final yaw sum.
  let changed=0;
  for(let i=1;i<moved.raw.length;i++) {
    const before=moved.raw[i-1],event=moved.raw[i];
    assert.equal(event.trusted,true);assert.equal(event.locked,true);
    assert.equal(event.yaw-before.yaw,Math.max(-80,Math.min(80,event.x)));
    assert.equal(event.pitch-before.pitch,Math.max(-80,Math.min(80,event.y)));
    if(event.yaw!==before.yaw)changed++;
  }
  assert.ok(changed>=2);assert.ok(moved.raw.some(event=>Math.abs(event.x)>640));
  check('each real relative event turns view beyond canvas bounds (headless recenter pairs)',moved);
  await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>!document.pointerLockElement);
  const released=await state();await page.mouse.move(80,140);await page.mouse.move(600,320);
  assert.equal((await state()).yaw,released.yaw);assert.equal((await state()).moves,released.moves);
  assert.equal((await state()).hint,true);check('native unlock leaves movement inert and recovery visible',await state());
  await page.locator('.pointer-lock-recovery').click();await page.waitForFunction(()=>Boolean(document.pointerLockElement));
  assert.equal((await state()).hint,false);check('trusted recovery button reacquires actual lock',await state());

  for(const modal of ['map','pause','developer']) {
    await page.evaluate(()=>window.probe.modal());await page.waitForFunction(()=>!document.pointerLockElement);
    const before=await state();await page.locator('canvas').click({position:{x:250,y:170}});
    const after=await state();assert.equal(after.locked,false);assert.equal(after.requests,before.requests);assert.equal(after.hint,false);
    await page.locator('#start').click();await page.waitForFunction(()=>Boolean(document.pointerLockElement));
    check(`${modal} release does not steal lock; trusted resume restores it`,await state());
  }

  const beforeFocus=await state();
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  // Some headless builds mark every page focused; do not fabricate a native blur pass.
  await page.waitForFunction(()=>!document.hasFocus()||window.probe.state().focusEvents.some(event=>event.name==='blur'),{},{timeout:1000}).catch(()=>{});
  const background=await state(),otherFocused=await other.evaluate(()=>document.hasFocus());
  const focusUnavailable=background.focused&&otherFocused&&!background.focusEvents.some(event=>event.name==='blur');
  if(focusUnavailable) {
    report.skipped.push({name:'native page focus loss/return',status:'environment-skipped',
      reason:'Headless bringToFront leaves both pages focused and emits no blur; blur/focus behavior remains unit-tested, native desktop focus is not certified here.',
      evidence:{originalFocused:background.focused,otherFocused,locked:background.locked,focusEvents:background.focusEvents}});
    console.log('ENVIRONMENT-SKIPPED native page focus loss/return: both pages focused, no blur emitted');
    await page.bringToFront();await page.evaluate(()=>document.exitPointerLock());
    await page.waitForFunction(()=>!document.pointerLockElement);
  } else {
    await page.waitForFunction(()=>!document.pointerLockElement);
    await page.bringToFront();await page.waitForFunction(()=>document.hasFocus());
    const focusBack=await state();assert.equal(focusBack.locked,false);assert.equal(focusBack.requests,beforeFocus.requests);assert.equal(focusBack.hint,true);
    check('real page focus loss/return clears capture without automatic relock',focusBack);
  }
  await page.locator('canvas').click({position:{x:300,y:160}});await page.waitForFunction(()=>Boolean(document.pointerLockElement));
  check(focusUnavailable?'trusted canvas click recovers after native unlock':'trusted canvas click recovers after focus return',await state());await other.close();

  await page.evaluate(()=>{window.probe.modal();window.probe.reject();});await page.waitForFunction(()=>!document.pointerLockElement);
  await page.locator('#start').click();await page.waitForFunction(()=>window.probe.state().hint);
  assert.equal((await state()).locked,false);
  await mkdir('.qa',{recursive:true});await page.screenshot({path:'.qa/pointer-lock-recovery.png'});
  await page.locator('.pointer-lock-recovery').click();await page.waitForFunction(()=>Boolean(document.pointerLockElement));
  check('injected Promise refusal remains recoverable through a subsequent native request',await state());
  assert.equal(report.errors.length,0,report.errors.join('\n'));report.ok=true;
} catch(error) {report.ok=false;report.failure=error.stack??String(error);console.error(report.failure);process.exitCode=1;}
finally {
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await vite?.close();
  await mkdir('.qa',{recursive:true});await writeFile('.qa/pointer-lock-report.json',JSON.stringify(report,null,2));
}
