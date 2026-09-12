#!/usr/bin/env node
// Test-only response bridge; production assets and code remain unmodified.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')));
const output = resolve(repo, args.get('out') ?? '.qa/fleet-075');
if (!output.startsWith(resolve(repo, '.qa/fleet-075'))) throw Error('Output must stay under .qa/fleet-075');
const phase = args.get('phase') ?? 'initial';
const port = 5198;
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(repo, '.qa/browsers');
process.env.LD_LIBRARY_PATH = [resolve(repo, '.qa/sysroot/usr/lib/x86_64-linux-gnu'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
const { chromium } = await import('../../.qa/node_modules/playwright/index.mjs');
const bridge = String.raw`
import { Vector3 as FleetQaVector3, Matrix as FleetQaMatrix } from '/node_modules/@babylonjs/core/Maths/math.vector.js';
{
  let stopped=false,savedLoops=[];
  const context=()=>view.engine._gl;
  const errors=()=>{const out=[];for(let index=0;index<16;index++){const value=context().getError();if(!value)break;out.push(value);}return out;};
  const vector=value=>value?.asArray?.()??null;
  function worldBounds(meshes){
    const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
    let active=0;
    for(const mesh of meshes){if(!mesh.isEnabled()||!mesh.isVisible||mesh.visibility<=0)continue;mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;
      const min=box.minimumWorld.asArray(),max=box.maximumWorld.asArray();active++;
      for(let axis=0;axis<3;axis++){minimum[axis]=Math.min(minimum[axis],min[axis]);maximum[axis]=Math.max(maximum[axis],max[axis]);}}
    if(!active)return {active:0};
    const viewport=view.scene.activeCamera.viewport.toGlobal(view.engine.getRenderWidth(),view.engine.getRenderHeight());
    const projected=[];
    for(const x of [minimum[0],maximum[0]])for(const y of [minimum[1],maximum[1]])for(const z of [minimum[2],maximum[2]]){
      projected.push(FleetQaVector3.Project(new FleetQaVector3(x,y,z),FleetQaMatrix.Identity(),view.scene.getTransformMatrix(),viewport).asArray());}
    const pixelMin=[Math.min(...projected.map(point=>point[0])),Math.min(...projected.map(point=>point[1]))];
    const pixelMax=[Math.max(...projected.map(point=>point[0])),Math.max(...projected.map(point=>point[1]))];
    return {active,minimum,maximum,center:minimum.map((value,axis)=>(value+maximum[axis])/2),projectedPixels:{minimum:pixelMin,maximum:pixelMax,width:pixelMax[0]-pixelMin[0],height:pixelMax[1]-pixelMin[1],onScreen:pixelMax[0]>=0&&pixelMax[1]>=0&&pixelMin[0]<=viewport.width&&pixelMin[1]<=viewport.height&&projected.some(point=>point[2]>=0&&point[2]<=1)}};
  }
  function uniforms(mesh,names){const effect=mesh?.subMeshes?.[0]?.effect??mesh?.material?.getEffect?.(),gl=context(),program=effect?.getPipelineContext?.()?.program;return {defines:effect?.defines,values:Object.fromEntries(names.map(name=>{const location=program?gl.getUniformLocation(program,name):null;const value=location!==null?gl.getUniform(program,location):null;return [name,typeof value==='number'?value:value?Array.from(value):null];}))};}
  function fogInfo(){const ocean=view.scene.getMeshByName('ocean'),sky=view.scene.getMeshByName('sky-dome')??view.scene.meshes.find(mesh=>mesh.name.includes('sky'));return {ocean:{applyFog:ocean?.applyFog,materialFogEnabled:ocean?.material?.fogEnabled,bounds:ocean?worldBounds([ocean]):null,...uniforms(ocean,['vFogInfos','vFogColor','eyePosition'])},scene:{fogEnabled:view.scene.fogEnabled,fogMode:view.scene.fogMode,fogColor:vector(view.scene.fogColor),fogStart:view.scene.fogStart,fogEnd:view.scene.fogEnd},sky:{name:sky?.name,...uniforms(sky,['navalHorizon','navalHorizonColor','navalHorizonBlend'])}};}
  function snapshot(){const camera=view.scene.activeCamera;return {
    time:state.time,mode:state.mode,weather:state.weatherId,renderSize:[view.engine.getRenderWidth(),view.engine.getRenderHeight()],
    camera:{position:vector(camera.globalPosition),target:vector(camera.target),alpha:camera.alpha,beta:camera.beta,radius:camera.radius},
    ships:state.ships.map(ship=>{const visual=view.ships.get(ship.id);return {id:ship.id,team:ship.team,hull:ship.hull,position:ship.position,enabled:visual?.root.isEnabled(),meshCount:visual?.bodyMeshes.length,bounds:visual?worldBounds(visual.bodyMeshes):null};}),
    squadrons:state.airSquadrons.map(squadron=>{const visual=view.airSquadronVisuals.get(squadron.id);return {id:squadron.id,role:squadron.role,team:squadron.team,phase:squadron.phase,capacity:squadron.aircraftCapacity,operational:squadron.aircraftOperational,position:squadron.position,heading:squadron.heading,enabled:visual?.root.isEnabled(),planes:visual?.planes.map((plane,index)=>({index,enabled:plane.root.isEnabled(),position:vector(plane.root.getAbsolutePosition()),rotation:vector(plane.root.rotation),body:worldBounds([plane.body]),all:worldBounds(plane.root.getChildMeshes())}))??[]};}),
    glErrors:errors(),waterReady:view.scene.getMeshByName('ocean')?.material?.isReadyForSubMesh(view.scene.getMeshByName('ocean'),view.scene.getMeshByName('ocean')?.subMeshes?.[0]),
  };}
  window.__fleetQA={
    time:()=>state.time,
    stop(){if(!stopped)savedLoops=[...view.engine._activeRenderLoops];view.engine.stopRenderLoop();stopped=true;document.exitPointerLock?.();view.setCameraInputEnabled(false);return snapshot();},
    resume(){stopped=false;for(const loop of savedLoops)view.engine.runRenderLoop(loop);},
    acquisitionScale(){view.engine.setHardwareScalingLevel(4);},
    restoreQuality(){view.setQuality('low');view.sync(state,0);},
    flightStatus:()=>({time:state.time,squadrons:state.airSquadrons.map(({id,phase,aircraftOperational,position,heading,order})=>({id,phase,aircraftOperational,position,heading,order})),events:state.airEvents?.slice(-12)}),
    fogInfo,
    mapInfo(){const canvas=tacticalMap.largeMap,rect=canvas.getBoundingClientRect(),context=canvas.getContext('2d');return {expanded:tacticalMap.expanded,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},contacts:tacticalMap.lastContacts,entities:tacticalMap.airCommands.entities.map(entity=>{let redPixels=0;if(entity.category==='enemyShip'){const x=Math.round(entity.point.x*canvas.width/rect.width),y=Math.round(entity.point.y*canvas.height/rect.height);const data=context.getImageData(Math.max(0,x-12),Math.max(0,y-12),24,24).data;for(let index=0;index<data.length;index+=4)if(data[index]>140&&data[index]>data[index+1]*1.15&&data[index]>data[index+2]*1.15)redPixels++;}return {...entity,screenPoint:{x:rect.x+entity.point.x,y:rect.y+entity.point.y},redPixels};})};},
    snapshot,
    async readiness(){await Promise.race([view.scene.whenReadyAsync(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Shader readiness timeout')),45000))]);},
    async draw(count=3){if(!stopped)throw Error('Call stop first');for(let index=0;index<count;index++){view.render();await new Promise(resolve=>setTimeout(resolve,16));}return snapshot();},
    horizon(weather){state.weatherId=weather;view.sync(state,0);const camera=view.scene.activeCamera;camera.beta=1.505;camera.radius=400;camera.getViewMatrix(true);view.syncWaterAtmosphere?.();return snapshot();},
    aircraftFocus(id){const options={focusEntityId:id,omniscient:true};view.sync(state,1/60,undefined,'aircraft','narrow',options);const camera=view.scene.activeCamera;const squadron=state.airSquadrons.find(s=>s.id===id);camera.setTarget(new FleetQaVector3(squadron.position.x,squadron.position.y,squadron.position.z));camera.radius=170;camera.beta=1.08;camera.alpha=-Math.PI/4;camera.getViewMatrix(true);return snapshot();},
    prepareVisualTurnFixture(){for(const [index,squadron] of state.airSquadrons.filter(s=>s.team==='player').entries()){squadron.phase='outbound';squadron.position={x:index*110,y:220+index*45,z:-900};squadron.previousPosition={...squadron.position};squadron.heading=0;squadron.lastUpdatedAt=state.time;}view.sync(state,1/60,undefined,'aircraft','narrow',{omniscient:true});},
    motionFixture(id,count,turning=false){const squadron=state.airSquadrons.find(s=>s.id===id);if(!squadron)throw Error('No squadron');const results=[];
      for(let frame=0;frame<count;frame++){const dt=1/60;state.time+=dt;squadron.previousPosition={...squadron.position};if(turning)squadron.heading+=.32*dt;squadron.position.x+=Math.sin(squadron.heading)*80*dt;squadron.position.z+=Math.cos(squadron.heading)*80*dt;squadron.position.y+=turning?.4*dt:0;squadron.lastUpdatedAt=state.time;
        view.sync(state,dt,undefined,'aircraft','narrow',{focusEntityId:id,omniscient:true});if(frame===0||frame===count-1||frame%30===0)results.push(snapshot());}
      return results;},
    info(){const gl=context(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl:view.engine.webGLVersion};},
  };
}
`;

const report={startedAt:new Date().toISOString(),scope:'Actual production GameView. Initial sea-trials is unmodified live simulation captured after trusted menu click. Horizon and motion cases are explicitly frozen rendering fixtures. SwiftShader is not hardware FPS evidence.',phase,cases:[],errors:[],warnings:[],failedRequests:[],ok:false};
let server,browser,page;
await mkdir(output,{recursive:true});
try {
  server=await createServer({root:repo,configFile:false,base:'/',cacheDir:join(output,'.vite-cache'),server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});
  await server.listen();
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(String(error.stack??error)));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
  page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  await page.route('**/src/main.ts',async route=>{const response=await route.fetch();await route.fulfill({response,body:`${await response.text()}\n${bridge}`});});
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle',timeout:90000});
  await page.waitForFunction(()=>Boolean(window.__fleetQA),undefined,{timeout:60000});
  await page.locator('.start-trials').click();
  await page.waitForFunction(()=>document.querySelector('.start-menu')?.hidden&&window.__fleetQA.time()>=.25,undefined,{timeout:45000});
  report.unmodifiedInitial=await page.evaluate(()=>window.__fleetQA.stop());
  report.renderer=await page.evaluate(()=>window.__fleetQA.info());
  await page.evaluate(()=>window.__fleetQA.readiness());
  const capture=async(id,scope)=>{const snapshot=await page.evaluate(()=>window.__fleetQA.draw(3));await page.screenshot({path:join(output,`${id}.png`)});report.cases.push({id,scope,snapshot});assert.deepEqual(snapshot.glErrors,[]);console.log(JSON.stringify({id,ships:snapshot.ships.map(s=>({id:s.id,enabled:s.enabled,pixels:s.bounds?.projectedPixels})),squadrons:snapshot.squadrons.map(s=>({id:s.id,operational:s.operational,visible:s.planes.filter(p=>p.enabled&&p.body.active).length}))}));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));return snapshot;};
  const initial=await capture('initial-sea-trials','Unmodified initial third-person camera and gameplay visibility policy; no synthetic contact/position.');
  if(phase==='final')assert.ok(initial.ships.some(s=>s.team==='enemy'&&s.hull>0&&s.enabled&&s.bounds?.projectedPixels?.onScreen),'No rendered initial enemy on screen');
  await page.keyboard.press('m');await page.locator('.map-overlay').waitFor({state:'visible'});report.map=await page.evaluate(()=>window.__fleetQA.mapInfo());await page.screenshot({path:join(output,'sea-trials-map.png')});assert.ok(report.map.contacts.some(contact=>contact.id==='test-target'&&contact.live),'Test target not supplied to map');assert.ok(report.map.entities.some(entity=>entity.id==='test-target'&&entity.category==='enemyShip'&&entity.redPixels>0),'Enemy map marker not actually drawn');
  if(phase==='final'){
    const positions=report.map.entities.filter(entity=>entity.category==='friendlySquadron').map(entity=>entity.screenPoint);
    const min={x:Math.min(...positions.map(p=>p.x))-14,y:Math.min(...positions.map(p=>p.y))-14},max={x:Math.max(...positions.map(p=>p.x))+14,y:Math.max(...positions.map(p=>p.y))+14};
    await page.mouse.move(min.x,min.y);await page.mouse.down();await page.mouse.move(max.x,max.y,{steps:12});await page.mouse.up();
    const own=report.map.entities.find(entity=>entity.id==='player');await page.mouse.click(own.screenPoint.x+35,own.screenPoint.y-25,{button:'right'});await page.screenshot({path:join(output,'squadrons-move-order.png')});
    report.flightStart=await page.evaluate(()=>window.__fleetQA.flightStatus());await page.keyboard.press('Escape');await page.locator('.map-overlay').waitFor({state:'hidden'});
    await page.evaluate(()=>{window.__fleetQA.acquisitionScale();window.__fleetQA.resume();});
    await page.waitForFunction(start=>{const result=window.__fleetQA.flightStatus();return result.time-start>=10&&result.squadrons.filter(s=>s.id.startsWith('player-')).every(s=>!['ready','launching'].includes(s.phase));},report.flightStart.time,{timeout:90000});
    report.actualFlight=await page.evaluate(()=>{window.__fleetQA.stop();window.__fleetQA.restoreQuality();return window.__fleetQA.flightStatus();});
    report.actualFlight.scope='Trusted M, left drag selected 3 ready squadrons, right-click sea move order, Escape closed map, unmodified production simulation advanced >=10s; render scale4 only during acquisition, restored before visual assertions.';
    await capture('actual-flight-third-person','Actual movement after UI order, unchanged third-person player camera. Distant aircraft may be outside frame; focus cases below validate individual bodies.');
  } else await page.keyboard.press('m');
  for(const weather of phase==='turn-fixture'?[]:['clear','overcast']){await page.evaluate(weather=>window.__fleetQA.horizon(weather),weather);await page.evaluate(()=>window.__fleetQA.readiness());const result=await capture(`${weather}-near-level-horizon`,'Frozen weather + normal near-level camera fixture; same production material/shader.');result.fog=await page.evaluate(()=>window.__fleetQA.fogInfo());}
  if(phase==='final'||phase==='turn-fixture'){
    if(phase==='turn-fixture'){await page.evaluate(()=>window.__fleetQA.prepareVisualTurnFixture());report.fixtureNote='Synthetic outbound poses only, to recheck final heading-filter adjustment. The separate fleet-075-final report contains trusted real UI launch evidence.';}
    await page.evaluate(()=>window.__fleetQA.horizon('clear'));
    const ids=initial.squadrons.filter(s=>s.team==='player'&&s.operational>1).slice(0,3).map(s=>s.id);assert.ok(ids.length>=2,'Expected friendly multi-plane squadrons');
    for(const id of ids){await page.evaluate(id=>window.__fleetQA.aircraftFocus(id),id);await page.evaluate(()=>window.__fleetQA.readiness());const snap=await capture(`aircraft-focus-${id}`,phase==='turn-fixture'?'Synthetic outbound pose, production developer focus rendering.':'Production developer focus view on actual deployed squadron.');const squadron=snap.squadrons.find(s=>s.id===id);const enabled=squadron.planes.filter(p=>p.enabled&&p.body.active);assert.equal(enabled.length,squadron.operational);const distinct=new Set(enabled.map(p=>p.body.center.map(x=>x.toFixed(2)).join(',')));assert.equal(distinct.size,enabled.length,'Aircraft bodies share frozen world bounds');}
    const id=ids[0];report.motionFixture={id,scope:'Synthetic leader 80m/s, then0.32rad/s turn + climb, production visual-follow integration. Not proof of tactical AI.',straight:await page.evaluate(id=>window.__fleetQA.motionFixture(id,180,false),id),turn:await page.evaluate(id=>window.__fleetQA.motionFixture(id,240,true),id)};
    await page.evaluate(id=>window.__fleetQA.aircraftFocus(id),id);const turned=await capture('aircraft-turn-trailing','Synthetic turn after4seconds; production per-aircraft follow poses.');
    const planes=turned.squadrons.find(s=>s.id===id).planes.filter(p=>p.enabled&&p.body.active);assert.ok(new Set(planes.map(p=>p.rotation.map(value=>value.toFixed(3)).join(','))).size>1,'Aircraft share a rigid orientation during a turn');
    let minimumSeparation=Infinity;for(let a=0;a<planes.length;a++)for(let b=a+1;b<planes.length;b++)minimumSeparation=Math.min(minimumSeparation,Math.hypot(...planes[a].body.center.map((value,axis)=>value-planes[b].body.center[axis])));assert.ok(minimumSeparation>4,'Aircraft bodies collapsed together');report.motionFixture.minimumFinalSeparation=minimumSeparation;
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);
  report.ok=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;await page?.screenshot({path:join(output,'failure.png'),timeout:10000}).catch(()=>{});}
finally {await browser?.close();await server?.close();report.closed=true;report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,cases:report.cases.length,errors:report.errors.length,output,failure:report.failure,closed:report.closed}));}
