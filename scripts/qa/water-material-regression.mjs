#!/usr/bin/env node
// Server-only real production-renderer QA. The inspection bridge exists only in intercepted responses.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map();
for (let index = 2; index < process.argv.length; index++) {
  const [key, value] = process.argv[index].split('=', 2);
  if (!key.startsWith('--')) throw Error(`Unexpected argument ${key}`);
  args.set(key.slice(2), value ?? process.argv[++index]);
}
const renderer = String(args.get('renderer') ?? 'swiftshader');
if (!['swiftshader', 'default'].includes(renderer)) throw Error('--renderer must be swiftshader or default');
const frames = Number(args.get('frames') ?? 30);
if (!Number.isInteger(frames) || frames < 12 || frames > 180) throw Error('--frames must be 12..180');
const torpedoAge = Number(args.get('torpedo-age') ?? 3.5);
if (!Number.isFinite(torpedoAge) || torpedoAge < 3 || torpedoAge > 15) throw Error('--torpedo-age must be 3..15 seconds');
const output = resolve(repo, String(args.get('out') ?? '.qa/water-material'));
if (!output.startsWith(resolve(repo, '.qa') + '/')) throw Error('--out must be inside this repository .qa directory');
const port = Number(args.get('port') ?? 5197);
const keepServer = args.get('keep-server') === 'true';
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid --port');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(repo, '.qa/browsers');
process.env.LD_LIBRARY_PATH = [resolve(repo, '.qa/sysroot/usr/lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const { chromium } = await import('../../.qa/node_modules/playwright/index.mjs');

const bridge = String.raw`
import { SceneInstrumentation as WaterQaSceneInstrumentation } from '/node_modules/@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { EngineInstrumentation as WaterQaEngineInstrumentation } from '/node_modules/@babylonjs/core/Instrumentation/engineInstrumentation.js';
import { Vector3 as WaterQaVector3 } from '/node_modules/@babylonjs/core/Maths/math.vector.js';
import { ATOLL_MAP as WaterQaAtoll } from '/src/maps/atollMap.ts';
{
  let installed=false,paused=true,pending=null,pose=null,sceneInstrumentation,engineInstrumentation,baseMapId;
  let reflectionCount=0,refractionCount=0,frameErrors=[],contextLosses=0;
  const water=()=>view.scene.getMeshByName('ocean');
  const material=()=>water()?.material;
  const targets=()=>[material()?.reflectionTexture,material()?.refractionTexture];
  const gl=()=>view.engine._gl;
  const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]??null;};
  const summary=values=>({median:median(values),p95:[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*.95)-1)]??null,samples:values.length});
  const checkGl=()=>{const errors=[];for(let index=0;index<16;index++){const error=gl().getError();if(!error)break;errors.push(error);}return errors;};
  function uniformValue(name) {
    const effect=water()?.subMeshes?.[0]?.effect??material()?.getEffect?.();
    const program=effect?.getPipelineContext?.()?.program;
    if(!program)return {available:false,reason:'No compiled WebGL program'};
    const location=gl().getUniformLocation(program,name);
    if(location===null)return {available:false,reason:'Uniform not active in the linked program'};
    const value=gl().getUniform(program,location);
    return {available:true,value:typeof value==='number'?value:Array.from(value??[])};
  }
  function targetInfo(target) {
    if(!target)return null;
    const list=target.renderList??[];
    return {name:target.name,size:target.getSize(),refreshRate:target.refreshRate,
      selfReferences:list.filter(mesh=>mesh===water()||mesh.material===material()).map(mesh=>mesh.name),
      listed:list.map(mesh=>({name:mesh.name,enabled:mesh.isEnabled(),visible:mesh.isVisible}))};
  }
  function snapshot() {
    const engine=view.engine,scene=view.scene,mesh=water(),waterMaterial=material();
    return {materialClass:waterMaterial?.getClassName?.(),vertices:mesh?.getTotalVertices(),triangles:(mesh?.getTotalIndices()??0)/3,
      waveHeight:waterMaterial?.waveHeight,boundWaveHeight:uniformValue('waveHeight'),boundWaveLength:uniformValue('waveLength'),boundTime:uniformValue('time'),
      reflection:targetInfo(targets()[0]),refraction:targetInfo(targets()[1]),
      renderSize:{width:engine.getRenderWidth(),height:engine.getRenderHeight()},hardwareScaling:engine.getHardwareScalingLevel(),
      camera:{position:scene.activeCamera.globalPosition.asArray(),alpha:scene.activeCamera.alpha,beta:scene.activeCamera.beta,radius:scene.activeCamera.radius},
      atmosphere:{fogStart:scene.fogStart,fogEnd:scene.fogEnd,exposure:scene.imageProcessingConfiguration.exposure},
      torpedoes:state.projectiles.filter(projectile=>projectile.kind==='torpedo').map(projectile=>({id:projectile.id,age:projectile.age,position:projectile.position})),
      wakes:scene.meshes.filter(mesh=>/^torpedo-wake-\d+-\d+$/.test(mesh.name)).map(mesh=>{const position=mesh.getAbsolutePosition();return {
        name:mesh.name,enabled:mesh.isEnabled(),visibility:mesh.visibility,position:position.asArray(),surfaceY:view.oceanWater.heightAt(position.x,position.z)};}),
      textureCount:scene.textures.length,meshCount:scene.meshes.length,contextLosses,glErrors:[...frameErrors,...checkGl()]};
  }
  function pixels() {
    // Read a water-dominant bottom-left patch, never the ship or HUD. Supplementary evidence only.
    const width=64,height=64,data=new Uint8Array(width*height*4);
    gl().readPixels(16,16,width,height,gl().RGBA,gl().UNSIGNED_BYTE,data);
    let sum=0,sum2=0,nonblack=0;let hash=2166136261;
    for(let index=0;index<data.length;index+=4){const luma=.2126*data[index]+.7152*data[index+1]+.0722*data[index+2];sum+=luma;sum2+=luma*luma;if(luma>3)nonblack++;hash=Math.imul(hash^data[index],16777619);hash=Math.imul(hash^data[index+1],16777619);hash=Math.imul(hash^data[index+2],16777619);}
    const count=width*height,mean=sum/count;
    return {width,height,meanLuma:mean,lumaStdDev:Math.sqrt(Math.max(0,sum2/count-mean*mean)),nonblackFraction:nonblack/count,hash:hash>>>0};
  }
  function applyPose(){if(!pose)return;const camera=view.scene.activeCamera;camera.setTarget(new WaterQaVector3(...pose.target));camera.alpha=pose.alpha;camera.beta=pose.beta;camera.radius=pose.radius;camera.getViewMatrix(true);view.syncWaterAtmosphere?.();}
  function loop(){
    if(paused)return;
    state.time+=1/60;
    view.sync(state,1/60);applyPose();
    const start=performance.now();view.render();const submit=performance.now()-start;
    frameErrors.push(...checkGl());
    if(pending){pending.cpu.push(submit);pending.draws.push(sceneInstrumentation.drawCallsCounter.current);
      const gpu=engineInstrumentation?.gpuFrameTimeCounter.current??0;if(gpu>0)pending.gpu.push(gpu/1e6);
      if(--pending.remaining===0){paused=true;const result={...snapshot(),frames:pending.cpu.length,
        boundTimeStart:pending.timeStart,cpuSubmitMs:summary(pending.cpu),gpuTimerMs:pending.gpu.length?summary(pending.gpu):null,
        drawCalls:summary(pending.draws),reflectionRenders:reflectionCount,refractionRenders:refractionCount,pixels:pixels()};
        const resolve=pending.resolve;clearTimeout(pending.timer);pending=null;resolve(result);}
    }
  }
  window.__waterQA={
    install(){if(installed)return;installed=true;baseMapId=state.mapId;view.engine.stopRenderLoop();document.exitPointerLock?.();
      sceneInstrumentation=new WaterQaSceneInstrumentation(view.scene);sceneInstrumentation.captureRenderTime=true;
      if(typeof view.engine.captureGPUFrameTime==='function'&&typeof view.engine.getGPUFrameTimeCounter==='function'){
        engineInstrumentation=new WaterQaEngineInstrumentation(view.engine);engineInstrumentation.captureGPUFrameTime=true;
      }
      document.querySelector('#game-canvas').addEventListener('webglcontextlost',()=>contextLosses++);
      view.engine.runRenderLoop(loop);
    },
    configure({weather,quality,angle,shore=false,target}){
      state.weatherId=weather;state.mapId=shore?'atoll-prototype':baseMapId;view.setQuality(quality);
      const ship=state.ships.find(ship=>ship.team==='player'&&ship.hull>0);if(!ship)throw Error('No live player ship');ship.speedKnots=18;
      const zone=WaterQaAtoll.terrain.find(zone=>zone.kind==='sandbar')??WaterQaAtoll.terrain[0];
      pose={target:shore?[zone.x,1,zone.z]:[ship.position.x,3,ship.position.z],alpha:-Math.PI/4,
        beta:angle==='underwater'?1.72:angle==='grazing'?1.54:1.15,radius:angle==='underwater'?70:shore?600:360};
      if(target==='submarine'){const body=state.underwaterTargets.find(target=>target.hull>0);if(!body)throw Error('No live underwater training target');
        pose.target=[body.position.x,body.position.y,body.position.z];pose.beta=1.38;pose.radius=58;}
      if(target==='torpedo'){const projectile=state.projectiles.find(projectile=>projectile.kind==='torpedo');if(!projectile)throw Error('No genuinely launched torpedo');
        const length=Math.hypot(projectile.velocity.x,projectile.velocity.z),dx=projectile.velocity.x/length,dz=projectile.velocity.z/length;
        const x=projectile.position.x-dx*10,z=projectile.position.z-dz*10;
        pose.target=[x,view.oceanWater.heightAt(x,z),z];pose.alpha=Math.atan2(dz,dx)+.45;pose.beta=.95;pose.radius=50;}
      view.sync(state,0);applyPose();
      for(const [index,target] of targets().entries())if(target&&!target.__waterQaHooked){target.__waterQaHooked=true;target.onBeforeRenderObservable.add(()=>{if(index===0)reflectionCount++;else refractionCount++;});}
      return snapshot();
    },
    sample(count){if(pending)throw Error('Sample already pending');frameErrors=[];reflectionCount=0;refractionCount=0;paused=false;
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{paused=true;pending=null;reject(Error('Water render sample timed out after 60s'));},60000);
        pending={remaining:count,timeStart:uniformValue('time'),cpu:[],gpu:[],draws:[],resolve,timer};});},
    ready:()=>Promise.race([view.scene.whenReadyAsync(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Water shader/texture readiness timed out after 30s')),30000))]),
    aimForTorpedo(){const ship=state.ships.find(ship=>ship.team==='player'&&ship.hull>0);view.scene.activeCamera.alpha=Math.PI-ship.heading;
      // Software-WebGL acquisition only. configure(setQuality) restores full requested quality before any sample or PNG.
      view.engine.setHardwareScalingLevel(4);},
    torpedoLaunched:minimumAge=>state.projectiles.some(projectile=>projectile.kind==='torpedo'&&projectile.age>=minimumAge),
    torpedoMotionEvidence(){const ship=state.ships.find(ship=>ship.team==='player'&&ship.hull>0),projectile=state.projectiles.find(projectile=>projectile.kind==='torpedo');
      return {simulationTime:state.time,age:projectile?.age,ship:ship?.position,projectile:projectile?.position,
        separation:projectile&&ship?Math.hypot(projectile.position.x-ship.position.x,projectile.position.z-ship.position.z):null};},
    diagnostics:()=>({simulationTime:state.time,torpedoes:state.projectiles.filter(projectile=>projectile.kind==='torpedo').map(projectile=>({id:projectile.id,age:projectile.age,position:projectile.position})),
      player:state.ships.filter(ship=>ship.team==='player').map(ship=>({loaded:ship.torpedoesLoaded,reject:ship.torpedoFireRejectReason,rejectedAt:ship.torpedoFireRejectedAt})),
      fps:view.engine.getFps(),scaling:view.engine.getHardwareScalingLevel()}),
    info(){const debug=gl().getExtension('WEBGL_debug_renderer_info');return {engine:view.engine.getClassName(),webglVersion:view.engine.webGLVersion,
      vendor:debug?gl().getParameter(debug.UNMASKED_VENDOR_WEBGL):gl().getParameter(gl().VENDOR),
      renderer:debug?gl().getParameter(debug.UNMASKED_RENDERER_WEBGL):gl().getParameter(gl().RENDERER),
      gpuTimerAvailable:Boolean(engineInstrumentation)&&Boolean(gl().getExtension('EXT_disjoint_timer_query_webgl2')||gl().getExtension('EXT_disjoint_timer_query')),
      gpuTimerApiAvailable:Boolean(engineInstrumentation)};},
    dispose(){paused=true;clearTimeout(pending?.timer);pending=null;view.engine.stopRenderLoop();sceneInstrumentation?.dispose();engineInstrumentation?.dispose();}
  };
}
`;

const allCases = [
  {id:'clear-low',weather:'clear',quality:'low',angle:'normal'},
  {id:'clear-medium',weather:'clear',quality:'medium',angle:'normal'},
  {id:'clear-grazing',weather:'clear',quality:'medium',angle:'grazing'},
  {id:'overcast-medium',weather:'overcast',quality:'medium',angle:'normal'},
  {id:'rain-squall-medium',weather:'rain-squall',quality:'medium',angle:'grazing'},
  {id:'sea-fog-medium',weather:'sea-fog',quality:'medium',angle:'grazing'},
  {id:'atoll-shore',weather:'clear',quality:'medium',angle:'normal',shore:true},
  {id:'underwater',weather:'clear',quality:'medium',angle:'underwater'},
  {id:'surface-return',weather:'clear',quality:'medium',angle:'normal'},
  {id:'training-target-close',weather:'clear',quality:'medium',angle:'underwater',target:'submarine'},
  {id:'torpedo-wake-close',weather:'clear',quality:'medium',angle:'normal',target:'torpedo'},
];
const selectedIds=String(args.get('cases')??allCases.slice(0,9).map(entry=>entry.id).join(',')).split(',');
if(selectedIds.some(id=>!allCases.some(entry=>entry.id===id)))throw Error('Unknown --cases ID');
const cases=allCases.filter(entry=>selectedIds.includes(entry.id));
const report = {startedAt:new Date().toISOString(),rendererRequested:renderer,
  serverPid:process.pid,serverUrl:`http://127.0.0.1:${port}/`,keepServer,
  scope:'Actual production GameView/WaterMaterial, frozen simulation fixture driven through its normal sync/render. QA-only response bridge; not gameplay, physical wave validation, or automatic artistic acceptance.',
  performanceBoundary:'CPU submission time is not GPU frame time. SwiftShader is software WebGL, not a hardware gaming FPS benchmark. GPU timer is null when unsupported.',
  visualReviewRequired:['water silhouette/temporal coherence','ship waterline and wake transparency','atoll shore blending','horizon and fog consistency','underwater/surface return'],
  cases:[],errors:[],warnings:[],requestsFailed:[],ok:false};
let server,browser,page;
await mkdir(output,{recursive:true});
try {
  server=await createServer({root:repo,configFile:false,base:'/',cacheDir:join(output,'.vite-cache'),
    optimizeDeps:{entries:['index.html'],include:['@babylonjs/core/Instrumentation/sceneInstrumentation','@babylonjs/core/Instrumentation/engineInstrumentation']},
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});
  await server.listen();
  browser=await chromium.launch({headless:true,args:['--no-sandbox',...(renderer==='swiftshader'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
  page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(String(error.stack??error)));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());else if(message.type()==='warning')report.warnings.push(message.text());});
  page.on('requestfailed',request=>report.requestsFailed.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)report.errors.push(`HTTP ${response.status()} ${response.url()}`);});
  await page.route('**/src/main.ts',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\n${bridge}`});});
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle',timeout:90000});
  await page.waitForFunction(()=>Boolean(window.__waterQA),undefined,{timeout:60000});
  await page.locator('.start-trials').click();await page.waitForFunction(()=>document.querySelector('.start-menu')?.hidden);
  if(cases.some(entry=>entry.target==='torpedo')){
    report.phase='genuine-torpedo-flight';report.flightAcquisitionScaling=4;
    await page.evaluate(()=>window.__waterQA.aimForTorpedo());await page.keyboard.press('2');await page.keyboard.press('Space');
    console.log('Waiting for genuine production-loop torpedo age '+torpedoAge+'s (temporary acquisition render scale 4, restored before screenshots)');
    await page.waitForFunction(minimumAge=>window.__waterQA.torpedoLaunched(minimumAge),torpedoAge,{timeout:60000});
    report.torpedoLaunchInput=`Trusted Digit2 then Space; the production game loop advanced real projectile simulation for at least ${torpedoAge} seconds before the render fixture was frozen.`;
    report.torpedoMotion=await page.evaluate(()=>window.__waterQA.torpedoMotionEvidence());
    assert.ok(report.torpedoMotion.age>=torpedoAge&&report.torpedoMotion.separation>35,'Torpedo has not genuinely travelled clear of the ship');
  }
  await page.evaluate(()=>window.__waterQA.install());
  report.phase='render-cases';
  report.renderer=await page.evaluate(()=>window.__waterQA.info());
  for(const entry of cases){
    await page.evaluate(entry=>window.__waterQA.configure(entry),entry);
    await page.evaluate(()=>window.__waterQA.sample(6));
    await page.evaluate(()=>window.__waterQA.ready());
    const metrics=await page.evaluate(frames=>window.__waterQA.sample(frames),frames);
    const result={...entry,metrics,screenshot:relative(repo,join(output,`${entry.id}.png`))};report.cases.push(result);
    await page.locator('#game-canvas').screenshot({path:join(output,`${entry.id}.png`),timeout:30000});
    assert.equal(metrics.materialClass,'WaterMaterial');
    assert.ok(metrics.vertices>9&&metrics.triangles>8,'Water must have actual subdivided geometry');
    assert.ok(metrics.waveHeight>0,'Water wave height is disabled');
    assert.equal(metrics.boundWaveHeight.available,true,'Compiled shader has no active waveHeight uniform');
    assert.ok(metrics.boundWaveHeight.value>0,'Actual linked shader has zero waveHeight');
    assert.equal(metrics.boundTime.available,true,'Compiled shader has no active time uniform');
    assert.equal(metrics.boundTimeStart.available,true,'Compiled shader time was unavailable at sample start');
    assert.ok(metrics.boundTime.value>metrics.boundTimeStart.value,'Bound water time did not advance through actual draws');
    assert.ok(metrics.drawCalls.median>0,'Scene issues no draws');
    assert.deepEqual(metrics.glErrors,[],'WebGL reported errors');assert.equal(metrics.contextLosses,0);
    for(const target of [metrics.reflection,metrics.refraction]){
      assert.ok(target,'Missing real water render target');assert.deepEqual(target.selfReferences,[],'Water is present in its own reflection/refraction list');
      assert.equal(target.size.width,entry.quality==='low'?256:512);assert.equal(target.size.height,target.size.width);
    }
    if(entry.angle!=='underwater'){
      assert.ok(metrics.reflectionRenders>0&&metrics.refractionRenders>0,'Water targets never actually rendered');
      assert.equal(metrics.reflection.refreshRate,entry.quality==='low'?3:1,'Unexpected reflection refresh policy');
      assert.equal(metrics.refraction.refreshRate,entry.quality==='low'?3:1,'Unexpected refraction refresh policy');
      assert.ok(Math.abs(metrics.reflectionRenders-frames/metrics.reflection.refreshRate)<=2,'Unexpected reflection refresh cadence');
      assert.ok(Math.abs(metrics.refractionRenders-frames/metrics.refraction.refreshRate)<=2,'Unexpected refraction refresh cadence');
      assert.ok(metrics.pixels.nonblackFraction>.1,'Water patch is effectively black');
    }
    if(entry.target==='submarine')assert.ok(metrics.refraction.listed.some(mesh=>mesh.name.startsWith('underwater-target-body-')&&mesh.enabled&&mesh.visible),'Live training target missing from refraction rendering');
    if(entry.target==='torpedo'){
      assert.ok(metrics.torpedoes.length>0&&metrics.wakes.length>0,'Launched torpedo has no actual wake mesh');
      for(const wake of metrics.wakes){assert.ok(wake.enabled&&wake.visibility>0,'Torpedo wake is invisible');
        const index=Number(wake.name.split('-').at(-1));assert.ok(Math.abs(wake.position[1]-wake.surfaceY-(.09+index*.008))<.001,'Wake is not anchored to displaced water');}
    }
    await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({id:entry.id,draws:metrics.drawCalls.median,reflectionRenders:metrics.reflectionRenders,cpuSubmitMs:metrics.cpuSubmitMs.median,gpuTimerMs:metrics.gpuTimerMs?.median??null}));
  }
  const fatalWarnings=report.warnings.filter(value=>/feedback loop|invalid[_ ]operation|framebuffer.*(incomplete|error)|shader.*(error|fail)/i.test(value));
  assert.deepEqual(fatalWarnings,[],'Rendering warning indicates invalid water pipeline');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requestsFailed,[]);
  report.ok=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;
  report.failureState=await Promise.race([page?.evaluate(()=>window.__waterQA?.diagnostics()).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve('diagnostic timed out'),3000))]);
  await page?.screenshot({path:join(output,'failure.png'),timeout:10000}).catch(()=>{});}
finally{
  await page?.evaluate(()=>window.__waterQA?.dispose()).catch(()=>{});
  await browser?.close();if(!keepServer)await server?.close();report.finishedAt=new Date().toISOString();report.closed=!keepServer;
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:report.ok,cases:report.cases.length,errors:report.errors.length,warnings:report.warnings.length,output,failure:report.failure}));
}
