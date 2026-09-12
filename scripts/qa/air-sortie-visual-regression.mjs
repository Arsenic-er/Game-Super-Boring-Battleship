#!/usr/bin/env node
// Real UI order + unmodified production simulation, with test-only inspection bridge.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const args=new Map(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
const output=resolve(repo,args.get('out')??'.qa/air-sortie-076');
if(!output.startsWith(resolve(repo,'.qa/air-sortie-076')))throw Error('Output must stay under .qa/air-sortie-076');
const roles=(args.get('roles')??'diveBomber,torpedoBomber').split(',');
if(roles.some(role=>!['diveBomber','torpedoBomber'].includes(role)))throw Error('Unknown sortie role');
process.env.PLAYWRIGHT_BROWSERS_PATH??=resolve(repo,'.qa/browsers');
process.env.LD_LIBRARY_PATH=[resolve(repo,'.qa/sysroot/usr/lib/x86_64-linux-gnu'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const {chromium}=await import('../../.qa/node_modules/playwright/index.mjs');
const bridge=String.raw`
{
  let id,loops=[],samples=[],lastTime=-1,release,minimumAfterRelease=Infinity,complete=false,initialOrdnance=0,focused=false,focusedAt;
  const projectileEvidence=new Map(),eventEvidence=new Map();
  let panel,glErrors=[];
  function projectBounds(plane){
    const canvas=view.engine.getRenderingCanvas().getBoundingClientRect(),camera=view.scene.activeCamera,viewport=camera.viewport,m=view.scene.getTransformMatrix().m;
    const corners=plane.body.getBoundingInfo().boundingBox.vectorsWorld.map(point=>{
      const w=point.x*m[3]+point.y*m[7]+point.z*m[11]+m[15];
      const x=(point.x*m[0]+point.y*m[4]+point.z*m[8]+m[12])/w,y=(point.x*m[1]+point.y*m[5]+point.z*m[9]+m[13])/w;
      return {x:canvas.left+(viewport.x+(x+1)*.5*viewport.width)*canvas.width,y:canvas.top+(1-viewport.y-(y+1)*.5*viewport.height)*canvas.height,w};
    });
    const safe={left:canvas.left+canvas.width*.05,right:canvas.left+canvas.width*.95,top:canvas.top+canvas.height*.18,bottom:canvas.top+canvas.height*.78};
    const bounds={left:Math.min(...corners.map(point=>point.x)),right:Math.max(...corners.map(point=>point.x)),top:Math.min(...corners.map(point=>point.y)),bottom:Math.max(...corners.map(point=>point.y))};
    return {corners,bounds,safe,insideSafe:corners.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.w>0&&point.x>=safe.left&&point.x<=safe.right&&point.y>=safe.top&&point.y<=safe.bottom)};
  }
  function sample(){const squadron=state.airSquadrons.find(s=>s.id===id);if(!squadron)return null;
    const visual=view.airSquadronVisuals.get(id),activePlanes=visual?.planes.filter(plane=>plane.root.isEnabled())??[],planes=activePlanes.map((plane,index)=>{plane.root.computeWorldMatrix(true);plane.body.computeWorldMatrix(true);return {index,position:plane.root.getAbsolutePosition().asArray(),rotation:plane.root.rotation.asArray(),bodyCenter:plane.body.getBoundingInfo().boundingBox.centerWorld.asArray(),screen:projectBounds(plane)};});
    const overlapPairs=[];for(let a=0;a<activePlanes.length;a++)for(let b=a+1;b<activePlanes.length;b++)if(activePlanes[a].body.intersectsMesh(activePlanes[b].body,true))overlapPairs.push([a,b]);
    for(const projectile of state.projectiles)if(projectile.weaponSource==='aircraft'&&projectile.team==='player'&&!projectileEvidence.has(projectile.id))projectileEvidence.set(projectile.id,{id:projectile.id,time:state.time,kind:projectile.kind,airWeapon:projectile.airWeapon,position:{...projectile.position},velocity:{...projectile.velocity},age:projectile.age});
    for(const event of state.airEvents)if(event.squadronId===id&&!eventEvidence.has(event.id))eventEvidence.set(event.id,{...event});
    let separation=Infinity;for(let a=0;a<planes.length;a++)for(let b=a+1;b<planes.length;b++)separation=Math.min(separation,Math.hypot(...planes[a].bodyCenter.map((value,axis)=>value-planes[b].bodyCenter[axis])));
    const camera=view.scene.activeCamera;
    const current={time:state.time,id:squadron.id,role:squadron.role,phase:squadron.phase,position:{...squadron.position},heading:squadron.heading,flight:squadron.flight?{...squadron.flight}:null,count:squadron.aircraftOperational,released:squadron.attackRunReleased,ordnance:squadron.ordnanceRemaining,order:squadron.order?.kind,planes,minimumSeparation:separation,overlapPairs,camera:{radius:camera.radius,fov:camera.fov,position:camera.position.asArray(),target:camera.target.asArray(),sinceFocus:focusedAt===undefined?null:state.time-focusedAt}};
    if(current.ordnance<initialOrdnance&&!release)release=current;
    if(release){minimumAfterRelease=Math.min(minimumAfterRelease,current.position.y);complete=current.time-release.time>6&&current.position.y-minimumAfterRelease>=35&&current.phase==='returning';}
    return current;
  }
  window.__sortieQA={
    prepare(role){loops=[...view.engine._activeRenderLoops];view.engine.stopRenderLoop();document.exitPointerLock?.();
      const target=state.ships.find(ship=>ship.id==='test-target');target.position={x:0,y:0,z:0};target.speedKnots=0;
      for(const ship of state.ships)ship.antiAirMounts=0;
      const squadron=state.airSquadrons.find(s=>s.team==='player'&&s.role===role);id=squadron.id;initialOrdnance=squadron.ordnanceRemaining;
      squadron.position={x:role==='torpedoBomber'?340:0,y:role==='torpedoBomber'?225:390,z:-2400};squadron.previousPosition={...squadron.position};squadron.heading=0;
      squadron.flight={speedMetersPerSecond:role==='torpedoBomber'?82:90,pitch:0,bank:0};
      squadron.recoverySource={kind:'mapEdge',position:{x:squadron.position.x,y:squadron.position.y,z:-3400}};
      state.time+=1/60;finishFrame(state,1/60,'player');view.render();
      return {id,role,time:state.time,target:{...target.position},initial:sample(),scope:'Initial conditions only: stationary target at origin, AA mount count0 to isolate flight; ready selected squadron2.4km south. From resume onward no entity position or flight-state writes.'};
    },
    map(){const rect=tacticalMap.largeMap.getBoundingClientRect();return {entities:tacticalMap.airCommands.entities.map(entity=>({...entity,screen:{x:rect.x+entity.point.x,y:rect.y+entity.point.y}}))};},
    resume(){view.setQuality('low');view.engine.setHardwareScalingLevel(1.5);view.scene.activeCamera.alpha=.12;view.scene.activeCamera.beta=1.41;view.scene.activeCamera.radius=185;view.setCameraInputEnabled(false);
      panel=document.createElement('pre');Object.assign(panel.style,{position:'fixed',right:'12px',top:'12px',zIndex:10000,color:'#d9faf7',background:'#062029c9',padding:'6px',font:'12px/14px monospace',pointerEvents:'none'});document.body.append(panel);
      view.scene.onAfterRenderObservable.add(()=>{if(state.time-lastTime<.099)return;lastTime=state.time;const current=sample();if(!current)return;samples.push(current);
        // Consume the trusted queued UI order as the normal player before entering spectator mode.
        if(!focused&&current.phase!=='ready'){developerView=observeDeveloperEntity(state,id);focused=true;focusedAt=state.time;}
        panel.textContent='REAL SIM / '+current.role+'\n'+current.phase+'  '+current.time.toFixed(1)+'s\nAltitude '+current.position.y.toFixed(1)+'m\nSpeed '+(current.flight?.speedMetersPerSecond??0).toFixed(1)+'m/s\nPitch '+((current.flight?.pitch??0)*180/Math.PI).toFixed(1)+' deg\nBank '+((current.flight?.bank??0)*180/Math.PI).toFixed(1)+' deg\nAircraft '+current.planes.length+'/'+current.count;
        const gl=view.engine._gl;for(let index=0;index<8;index++){const error=gl.getError();if(!error)break;glErrors.push(error);}
      });for(const loop of loops)view.engine.runRenderLoop(loop);},
    progress:()=>({current:sample(),release,minimumAfterRelease,complete,samples:samples.length}),
    result(){view.engine.stopRenderLoop();const gl=view.engine._gl,debug=gl.getExtension('WEBGL_debug_renderer_info');return {samples,release,initialOrdnance,projectileEvidence:[...projectileEvidence.values()],eventEvidence:[...eventEvidence.values()],minimumAfterRelease,complete,glErrors,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};},
  };
}
`;
const report={startedAt:new Date().toISOString(),scope:'Trusted menu/keyboard/mouse orders followed by unchanged production loop. Initial navigation fixture is declared per case; no sampled leader-position injection. Software WebGL, not hardware performance.',cases:[],errors:[],warnings:[],ok:false};
let server,browser,context,page;
await mkdir(output,{recursive:true});
try{
  server=await createServer({root:repo,configFile:false,base:'/',cacheDir:join(output,'.vite-cache'),server:{host:'127.0.0.1',port:5199,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});await server.listen();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const role of roles){
    const caseDir=join(output,role);await mkdir(caseDir,{recursive:true});
    context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:caseDir,size:{width:1280,height:720}}});page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(String(error.stack??error)));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
    await page.route('**/src/main.ts',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\n${bridge}`});});
    await page.goto('http://127.0.0.1:5199/',{waitUntil:'networkidle',timeout:90000});await page.waitForFunction(()=>Boolean(window.__sortieQA));
    await page.locator('.start-trials').click();await page.waitForFunction(()=>document.querySelector('.start-menu')?.hidden);
    const fixture=await page.evaluate(role=>window.__sortieQA.prepare(role),role);
    await page.keyboard.press('m');await page.locator('.map-overlay').waitFor({state:'visible'});const map=await page.evaluate(()=>window.__sortieQA.map());
    const source=map.entities.find(entity=>entity.id===fixture.id),target=map.entities.find(entity=>entity.id==='test-target');assert.ok(source&&target,'Missing selectable aircraft or target');
    await page.mouse.click(source.screen.x,source.screen.y);await page.keyboard.press('c');await page.locator('[data-air-command="strikeShip"]').click();
    await page.mouse.click(target.screen.x,target.screen.y,{button:'right'});await page.keyboard.press('Escape');await page.locator('.map-overlay').waitFor({state:'hidden'});
    await page.evaluate(()=>window.__sortieQA.resume());
    const images=new Set();const deadline=Date.now()+240000;let progress,lastProgress=-10;
    while(Date.now()<deadline){
      progress=await page.evaluate(()=>window.__sortieQA.progress());const current=progress.current;
      if(current.time-lastProgress>=10){lastProgress=current.time;console.log(JSON.stringify({role,progressTime:current.time,phase:current.phase,altitude:current.position.y,ordnance:current.ordnance}));}
      const tag=current.phase==='attackRun'?(current.released?'released':current.flight?.pitch<-.2?'dive':'attack-entry'):current.phase==='returning'?(current.flight?.pitch>.08?'recovery-climb':'exit-leg'):current.phase==='outbound'?'outbound':null;
      if(tag&&!images.has(tag)){images.add(tag);await page.screenshot({path:join(caseDir,`${tag}.png`)});console.log(JSON.stringify({role,tag,time:current.time,altitude:current.position.y,flight:current.flight,count:current.planes.length}));}
      if(progress.complete||current.phase==='destroyed'||current.time-fixture.time>120)break;
      await page.waitForTimeout(400);
    }
    const metrics=await page.evaluate(()=>window.__sortieQA.result());const result={role,fixture,metrics,video:join(caseDir,'sortie.webm')};report.cases.push(result);
    const video=page.video();await context.close();context=undefined;page=undefined;await video.saveAs(join(caseDir,'sortie.webm'));await video.delete();
    await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
    assert.ok(metrics.samples.length>30,'Too few real flight samples');assert.deepEqual(metrics.glErrors,[]);assert.ok(metrics.release,'No ordnance inventory decrease');assert.ok(metrics.projectileEvidence.some(projectile=>projectile.airWeapon===(role==='diveBomber'?'heBomb':'aerialTorpedo')),'No actual aircraft projectile created');assert.ok(metrics.complete,'No35m post-release recovery climb');
    const release=metrics.release;assert.ok(release.flight,'Missing physical flight state');
    if(role==='diveBomber'){assert.ok(release.position.y>=65&&release.position.y<=320);assert.ok(release.flight.pitch<-.16);}
    else{assert.ok(release.position.y>=25&&release.position.y<=85);assert.ok(Math.abs(release.flight.pitch)<=.14);}
    const airborneSamples=metrics.samples.filter(sample=>['outbound','attackRun','returning'].includes(sample.phase));
    assert.ok(airborneSamples.length>30,'Insufficient airborne evidence');assert.ok(airborneSamples.every(sample=>sample.planes.length===5&&sample.count===5),'Full squadron not preserved throughout sortie');
    result.minimumAircraftSeparation=Math.min(...metrics.samples.filter(sample=>sample.planes.length===5).map(sample=>sample.minimumSeparation));
    result.bodyBoxIntersections=metrics.samples.filter(sample=>sample.overlapPairs.length>0).map(sample=>({time:sample.time,pairs:sample.overlapPairs}));
    result.maximumPitchRate=0;result.maximumBankRate=0;
    for(let index=1;index<metrics.samples.length;index++){const before=metrics.samples[index-1],after=metrics.samples[index],dt=after.time-before.time;if(dt<=0||dt>.5||before.planes.length!==5||after.planes.length!==5)continue;for(let slot=0;slot<5;slot++){result.maximumPitchRate=Math.max(result.maximumPitchRate,Math.abs(after.planes[slot].rotation[0]-before.planes[slot].rotation[0])/dt);result.maximumBankRate=Math.max(result.maximumBankRate,Math.abs(after.planes[slot].rotation[2]-before.planes[slot].rotation[2])/dt);}}
    assert.ok(result.minimumAircraftSeparation>(role==='diveBomber'?14.37:16.51),'Aircraft spacing smaller than historical full wingspan');assert.deepEqual(result.bodyBoxIntersections,[],'Full aircraft including wing bounding boxes intersected');
    const settledViewSamples=metrics.samples.filter(sample=>sample.camera.sinceFocus!==null&&sample.camera.sinceFocus>=.8&&sample.planes.length===5);
    assert.ok(settledViewSamples.length>30,'Insufficient settled camera samples');
    result.cameraSafeRegion={horizontal:[.05,.95],vertical:[.18,.78],initialFocusTransitionSeconds:.8};
    result.cameraFramingViolations=settledViewSamples.flatMap(sample=>sample.planes.filter(plane=>!plane.screen.insideSafe).map(plane=>({time:sample.time,index:plane.index,bounds:plane.screen.bounds,safe:plane.screen.safe,camera:sample.camera})));
    assert.deepEqual(result.cameraFramingViolations,[],'Full plane bounds clipped by viewport or persistent HUD after camera transition');
    console.log(JSON.stringify({role,complete:metrics.complete,samples:metrics.samples.length,releaseAltitude:release.position.y,minimumAltitude:metrics.minimumAfterRelease}));
  }
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;if(page){await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});report.failureProgress=await page.evaluate(()=>window.__sortieQA?.progress()).catch(()=>null);}}
finally{await context?.close();await browser?.close();await server?.close();report.finishedAt=new Date().toISOString();report.closed=true;await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,cases:report.cases.length,errors:report.errors.length,failure:report.failure,output,closed:report.closed}));}
