import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.qa/browsers');
process.env.LD_LIBRARY_PATH = [resolve('.qa/sysroot/usr/lib/x86_64-linux-gnu'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const {chromium}=await import('../../.qa/node_modules/playwright/index.mjs');
const out=resolve(process.env.DOCK_QA_OUT??'.qa/dock-slots-current');
await mkdir(out,{recursive:true});
const report={version:'0.7.9',feature:'explicit-hardpoint-selection',checks:[],errors:[],renderer:'isolated real Chromium/Babylon development-module QA; not native Windows or GPU performance'};
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
  const boot=async(seed)=>page.evaluate(async(seed)=>{
    const {createDefaultLocalProfile,PROFILE_STORAGE_KEY}=await import('/src/profile/localProfile.ts');
    const {DockPreview}=await import('/src/render/dockPreview.ts');
    const source=createDefaultLocalProfile();
    source.shipClassId='fletcher';
    source.slotLoadoutsByShipClass.fletcher.mainGun=source.slotLoadoutsByShipClass.fletcher.mainGun.map((_,i)=>i===0?'mainGun-common':null);
    source.inventory['mainGun-gold']=2;
    source.inventory['mainGun-common']+=10;
    if(seed) localStorage.setItem(PROFILE_STORAGE_KEY,JSON.stringify(source));
    window.__dockInstallQA={storageKey:PROFILE_STORAGE_KEY,preview:null};
    const original=DockPreview.prototype.previewEquipment;
    DockPreview.prototype.previewEquipment=function(item,slotIndex=0){
      window.__dockInstallQA.dock=this;
      const result=original.call(this,item,slotIndex);
      const overlay=this.renderer.overlay;
      window.__dockInstallQA.preview={itemId:item?.id??null,slotIndex,rootName:overlay?.name??null,
        meshCount:overlay?.getChildMeshes().length??0};
      return result;
    };
    await import('/src/main.ts');
  },seed);
  await boot(true);
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
  const waitCandidate=async(id,slot)=>page.waitForFunction(({id,slot})=>{
    const p=window.__dockInstallQA.preview;
    return p?.itemId===id&&p.slotIndex===slot&&p.rootName==='dock-inspection-'+id+'-'+slot&&p.meshCount>0;
  },{id,slot},{timeout:15000});
  const chooseSlot=async(index)=>page.locator('button[data-dock-slot="'+index+'"]').click();
  await chooseSlot(4);
  await waitCandidate('mainGun-gold',4);
  assert(await page.locator('.equip-selected').isDisabled());
  assert.equal(await page.locator('button[data-dock-slot="4"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await slots(),exhausted);
  check('explicit aft slot previews there but cannot bypass inventory',await candidate());
  await select('mainGun-common',4);
  await page.locator('.equip-selected').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey)).slotLoadoutsByShipClass.fletcher.mainGun[4]==='mainGun-common');
  assert.deepEqual((await slots()).slice(0,4),exhausted.slice(0,4));
  check('explicit empty aft slot installs without changing other mounts',await slots());
  await chooseSlot(0);await waitCandidate('mainGun-common',0);
  await page.locator('.equip-selected').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey)).slotLoadoutsByShipClass.fletcher.mainGun[0]==='mainGun-common');
  await chooseSlot(4);await select('mainGun-gold',4);
  assert.equal(await page.locator('.equip-selected').innerText(),'替换所选槽位');
  await page.locator('.equip-selected').click();
  const finalSlots=['mainGun-common','mainGun-gold',null,null,'mainGun-gold'];
  await page.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem(window.__dockInstallQA.storageKey)).slotLoadoutsByShipClass.fletcher.mainGun)===JSON.stringify(expected),finalSlots);
  check('explicit replacement reuses a released copy and preserves forward mount',await slots());
  // Observe actual model-space turret meshes, then use normal mouse picking.
  await page.keyboard.press('Escape');
  const surfaces=await page.evaluate(async()=>{
    const {Vector3,Matrix}=await import('/node_modules/@babylonjs/core/Maths/math.vector.js');
    const dock=window.__dockInstallQA.dock, actual=dock.renderer.current;
    const canvas=dock.engine.getRenderingCanvas(), rect=canvas.getBoundingClientRect();
    const camera=dock.scene.activeCamera, viewport=camera.viewport.toGlobal(canvas.width,canvas.height);
    const nodes=actual.equipment.root.getDescendants().filter(node=>node.metadata?.category==='mainGun'&&node.metadata?.slotIndex===4);
    const meshes=nodes.flatMap(node=>typeof node.getChildMeshes==='function'?node.getChildMeshes():[]);
    const result=[];
    for(const mesh of [...new Set(meshes)]){
      if(!mesh.getTotalVertices()||!mesh.isEnabled()||!mesh.isVisible)continue;
      mesh.computeWorldMatrix(true);
      for(const point of [mesh.getBoundingInfo().boundingBox.centerWorld,...mesh.getBoundingInfo().boundingBox.vectorsWorld]){
        const p=Vector3.Project(point,Matrix.Identity(),dock.scene.getTransformMatrix(),viewport);
        result.push({x:rect.left+p.x/canvas.width*rect.width,y:rect.top+p.y/canvas.height*rect.height});
      }
    }
    return result.filter(p=>p.x>rect.left&&p.x<rect.right&&p.y>rect.top&&p.y<rect.bottom);
  });
  let picked=false,pickedPoint;
  for(const point of surfaces){
    await page.mouse.move(point.x,point.y);await page.waitForTimeout(160);
    const hover=await page.evaluate(()=>window.__dockInstallQA.dock.getComponentHover());
    if(hover?.category==='mainGun'&&hover.slotIndex===4){
      await page.mouse.click(point.x,point.y);picked=true;pickedPoint=point;break;
    }
  }
  assert(picked,'Actual aft turret should be pickable in the normal dock view');
  await page.locator('button[data-dock-slot="4"][aria-pressed="true"]').waitFor();
  await waitCandidate('mainGun-gold',4);
  check('clicking actual aft turret keeps its physical index through the menu callback',true);
  await page.keyboard.press('Escape');
  await page.locator('.port-drawer-equipment').waitFor({state:'hidden'});
  await page.mouse.move(pickedPoint.x,pickedPoint.y);await page.waitForTimeout(200);
  assert.equal((await page.evaluate(()=>window.__dockInstallQA.dock.getComponentHover()))?.slotIndex,4);
  await page.mouse.down();
  // This is the same notification emitted synchronously by DockPanel.render
  // when a keyboard-driven ship/refit change happens during a pointer gesture.
  await page.evaluate(()=>document.querySelector('.dock-panel').dispatchEvent(new CustomEvent('dock-preview-change')));
  await page.mouse.up();
  assert.equal(await page.evaluate(()=>document.querySelector('.port-shell').dataset.portDrawer),undefined);
  await page.locator('.port-drawer-equipment').waitFor({state:'hidden'});
  check('loadout-change notification cancels a cached component press before release',true);
  await page.locator('.port-ship-actions [data-port-label="equipment"]').click();
  for (const locale of ['en-US','de-DE','ru-RU','ja-JP','es-ES','zh-TW','zh-CN']) {
    await page.keyboard.press('Escape');await page.locator('.port-account').click();
    await page.locator('.port-drawer-profile .menu-language').selectOption(locale);
    await page.keyboard.press('Escape');await page.locator('.port-ship-actions [data-port-label="equipment"]').click();
    await chooseSlot(4);await select('mainGun-common',4);
    const label=await page.locator('.dock-slot-picker').innerText();
    assert(await page.locator('.dock-slot-picker').isVisible());
    if(!['zh-CN','zh-TW'].includes(locale))assert(!/装配位置|自动选择槽位|空槽|替换所选槽位/.test(label),'Slot controls must be localized: '+locale);
  }
  check('explicit slot controls are translated in all seven languages',true);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(350);
  assert(await page.locator('.dock-slot-picker').isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),844);
  await page.screenshot({path:resolve(out,'explicit-slot-mobile.png')});
  check('slot selector remains available in compact landscape without horizontal page overflow',true);
  await page.setViewportSize({width:1440,height:900});
  await page.reload({waitUntil:'networkidle'});await boot(false);
  await page.locator('.dock-preview[data-model-ready="true"]').waitFor({timeout:90000});
  assert.deepEqual(await slots(),finalSlots);
  await page.locator('.port-ship-actions [data-port-label="equipment"]').click();
  await select('mainGun-common',2);
  assert.equal(await page.locator('button[data-dock-slot="auto"]').getAttribute('aria-pressed'),'true');
  check('reload preserves equipped physical slots and resets transient slot selection',await slots());
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.ok=true;
} catch(e) {
  report.failure=String(e.stack??e); console.error(report.failure); process.exitCode=1;
} finally {
  await browser?.close(); await server?.close();
  report.serverClosed=true;
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
}
