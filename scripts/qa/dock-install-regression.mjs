import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.qa/browsers');
process.env.LD_LIBRARY_PATH = [resolve('.qa/sysroot/usr/lib/x86_64-linux-gnu'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const {chromium}=await import('../../.qa/node_modules/playwright/index.mjs');
const out=resolve('.qa/dock-install-079');
await mkdir(out,{recursive:true});
const report={version:'0.7.9',checks:[],errors:[],renderer:'isolated real Chromium/Babylon development-module QA; not native Windows or GPU performance'};
let server,browser;
const check=(name,evidence)=>{report.checks.push({name,evidence});console.log('PASS',name);};
try {
  server=await createServer({server:{host:'127.0.0.1',port:5282,strictPort:true},clearScreen:false});
  await server.listen();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  // Delay the actual entry point only to seed isolated storage and observe the
  // real preview renderer; no production source or rendering result is mocked.
  await page.route('http://127.0.0.1:5282/',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace('<script type="module" src="/src/main.ts"></script>','');
    await route.fulfill({response,body});
  });
  await page.goto('http://127.0.0.1:5282/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    const {createDefaultLocalProfile,PROFILE_STORAGE_KEY}=await import('/src/profile/localProfile.ts');
    const {DockPreview}=await import('/src/render/dockPreview.ts');
    const source=createDefaultLocalProfile();
    source.shipClassId='fletcher';
    source.slotLoadoutsByShipClass.fletcher.mainGun=source.slotLoadoutsByShipClass.fletcher.mainGun.map((_,i)=>i===0?'mainGun-common':null);
    source.inventory['mainGun-gold']=2;
    source.inventory['mainGun-common']+=10;
    localStorage.setItem(PROFILE_STORAGE_KEY,JSON.stringify(source));
    window.__dockInstallQA={storageKey:PROFILE_STORAGE_KEY,preview:null};
    const original=DockPreview.prototype.previewEquipment;
    DockPreview.prototype.previewEquipment=function(item,slotIndex=0){
      const result=original.call(this,item,slotIndex);
      const overlay=this.renderer.overlay;
      window.__dockInstallQA.preview={itemId:item?.id??null,slotIndex,rootName:overlay?.name??null,
        meshCount:overlay?.getChildMeshes().length??0};
      return result;
    };
    await import('/src/main.ts');
  });
  await page.locator('.dock-preview[data-model-ready="true"]').waitFor({timeout:90000});
  await page.locator('.port-ship-actions [data-port-label="equipment"]').click();
  const slots=()=>page.evaluate(()=>JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey)).slotLoadoutsByShipClass.fletcher.mainGun);
  const candidate=()=>page.evaluate(()=>window.__dockInstallQA.preview);
  const select=async(id,slot)=>{
    await page.locator('.inventory-item[data-item="'+id+'"]').click();
    await page.waitForFunction(({id,slot})=>{
      const p=window.__dockInstallQA.preview;
      return p?.itemId===id&&p.slotIndex===slot&&p.rootName==='dock-inspection-'+id+'-'+slot&&p.meshCount>0;
    },{id,slot},{timeout:15000});
  };
  const before=await slots();
  await select('mainGun-gold',0);
  assert.equal(await page.locator('.equip-selected').innerText(),'替换首个槽位');
  assert.deepEqual(await slots(),before);
  check('new model previews the real slot-zero ghost without altering save',await candidate());
  await page.screenshot({path:resolve(out,'new-model-slot-zero.png')});
  await page.locator('.equip-selected').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey)).slotLoadoutsByShipClass.fletcher.mainGun[0]==='mainGun-gold');
  assert.deepEqual(await slots(),['mainGun-gold',...before.slice(1)]);
  check('new model installs exactly where it was previewed',await slots());
  await select('mainGun-gold',1);
  assert.equal(await page.locator('.equip-selected').innerText(),'安装到空槽');
  await page.locator('.equip-selected').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey)).slotLoadoutsByShipClass.fletcher.mainGun[1]==='mainGun-gold');
  check('same model appends to first empty slot',await slots());
  await select('mainGun-gold',2);
  assert.equal(await page.locator('.equip-selected').isDisabled(),true);
  assert.equal(await page.locator('.equip-selected').innerText(),'组件不足');
  const exhausted=await slots();
  await page.locator('.equip-selected').evaluate(button=>button.click());
  assert.deepEqual(await slots(),exhausted);
  check('exhausted inventory leaves comparison preview but blocks install',await candidate());
  // Actual saves and credits must not be spent by equipment rearrangement.
  const economic=await page.evaluate(()=>{
    const p=JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey));
    return {ownedGold:p.inventory['mainGun-gold'],savedBuild:p.savedShipBuilds.find(b=>b.id==='default-fletcher')?.slots.mainGun};
  });
  assert.equal(economic.ownedGold,2);
  assert(economic.savedBuild.every(id=>id!=='mainGun-gold'));
  check('equipping preserves owned counts and saved blueprints',economic);
  for (const locale of ['en-US','de-DE','ru-RU','ja-JP','es-ES','zh-TW','zh-CN']) {
    await page.keyboard.press('Escape');
    await page.locator('.port-account').click();
    await page.locator('.port-drawer-profile .menu-language').selectOption(locale);
    await page.keyboard.press('Escape');
    await page.locator('.port-ship-actions [data-port-label="equipment"]').click();
    await select('mainGun-gold',2);
    const text=await page.locator('.equip-selected').innerText();
    assert(await page.locator('.equip-selected').isDisabled());
    if(!['zh-CN','zh-TW'].includes(locale)) assert(!text.includes('组件不足'));
  }
  check('all seven locales retain correct disabled state and translated text',true);
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.ok=true;
} catch(e) {
  report.failure=String(e.stack??e); console.error(report.failure); process.exitCode=1;
} finally {
  await browser?.close(); await server?.close();
  report.serverClosed=true;
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
}
