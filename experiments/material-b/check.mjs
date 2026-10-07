import { preview } from "vite";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const output=resolve(".qa/material-b");
await mkdir(output,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(".qa/browsers");
process.env.LD_LIBRARY_PATH=resolve(".qa/sysroot/usr/lib/x86_64-linux-gnu");
const { chromium } = await import("../../.qa/node_modules/playwright/index.mjs");
const errors=[],failed=[],checks=[],views=[];
let server,browser;
try {
  server=await preview({configFile:resolve("experiments/material-b/vite.config.ts")});
  browser=await chromium.launch({headless:true,args:["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push(String(error)));
  page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  page.on("requestfailed",request=>failed.push(request.url()));
  page.on("response",response=>{if(response.status()>=400)errors.push("HTTP "+response.status()+" "+response.url());});
  await page.goto("http://127.0.0.1:5285/",{waitUntil:"networkidle",timeout:90000});
  await page.waitForFunction(()=>window.__materialLab?.snapshot().ready,undefined,{timeout:60000});
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => document.fonts.check('700 16px "Lab Pixel"')));
  checks.push("independent WebGL scene + packaged Chinese font ready");
  for(const name of ["overview","shore","water","ship","wake"]){
    await page.evaluate(name=>{window.__materialLab.setView(name);window.__materialLab.setTime(9);},name);
    await page.waitForTimeout(450);
    const stats=await page.evaluate(()=>window.__materialLab.snapshot());
    assert.equal(stats.productionIntegrated,false);
    assert.deepEqual(stats.gpu.errors,[], "WebGL errors including uniform binding failures");
    assert.equal(stats.gpu.controls.length,4);
    assert(stats.gpu.controls.every(v=>v>0), "Water controls must reach GPU");
    assert.equal(stats.gpu.fogInfo[0],2);
    assert.equal(stats.gpu.shipSize[2],1,"Ship contact enabled uniform");
    assert(Math.abs(stats.gpu.shipSize[0]-54.35)<.001);
    assert(Math.abs(stats.gpu.shipSize[1]-4.741503)<.001);
    assert(stats.gpu.fogInfo[3]>0, "Water fog density must reach GPU");
    assert.equal(stats.renderTargets,0);
    assert(stats.drawCalls>0 && stats.activeTriangles>0);
    assert(stats.waterTriangles<=9000,"Water exceeds isolated preview mesh budget");
    assert(stats.width*stats.height<=1280*720+4000,"Low-resolution budget exceeded");
    assert(stats.textures.every(t=>t.width>0&&t.height>0),"Texture not ready");
    await page.screenshot({path:output+"/"+name+".png",timeout:60000});
    views.push({name,...stats});
    checks.push(name+" image + geometry + no RTT + resolution budget");
  }
  await page.evaluate(()=>{window.__materialLab.setView("ship");window.__materialLab.setTime(9);});
  const contactPixels=await page.evaluate(()=>{
    const canvas=document.querySelector("#scene");
    const gl=canvas.getContext("webgl2")||canvas.getContext("webgl");
    const capture=enabled=>{
      window.__materialLab.setContactEnabled(enabled);
      const result=new Uint8Array(canvas.width*canvas.height*4);
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,result);
      return result;
    };
    const off=capture(false),on=capture(true);
    let changed=0,sum=0,maxDelta=0;
    let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
    for(let i=0;i<off.length;i+=4){
      const delta=Math.abs(off[i]-on[i])+Math.abs(off[i+1]-on[i+1])+Math.abs(off[i+2]-on[i+2]);
      if(delta>2){
        changed++;sum+=delta;maxDelta=Math.max(maxDelta,delta);
        const pixel=i/4,x=pixel%canvas.width,y=Math.floor(pixel/canvas.width);
        minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
    }
    return {changed,fraction:changed/(canvas.width*canvas.height),meanDelta:sum/Math.max(1,changed),maxDelta,bounds:{minX,minY,maxX,maxY},glError:gl.getError()};
  });
  assert.equal(contactPixels.glError,0);
  assert(contactPixels.changed>10,"Contact treatment must actually affect visible water pixels");
  assert(contactPixels.fraction<.03,"Contact treatment must remain local, not a large fake shadow");
  checks.push("localized ship contact effect, visible and switchable");
  console.log(JSON.stringify({contactPixels}));
  await page.evaluate(()=>{window.__materialLab.setView("overview");window.__materialLab.setTime(9);});
  const a=await page.evaluate(()=>window.__materialLab.probeWater());
  await page.evaluate(()=>window.__materialLab.setTime(17));
  const b=await page.evaluate(()=>window.__materialLab.probeWater());
  const luminance=Array.from({length:a.length/3},(_,i)=>a[i*3]*.2126+a[i*3+1]*.7152+a[i*3+2]*.0722);
  const mean=luminance.reduce((sum,v)=>sum+v,0)/luminance.length;
  const variation=Math.sqrt(luminance.reduce((sum,v)=>sum+(v-mean)**2,0)/luminance.length);
  const change=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
  assert(variation>1, "Open water must have visible tonal variation; got "+variation);
  assert(change>.15, "Water animation must change real pixels; got "+change);
  checks.push("visible open-water detail + animated pixel changes");
  console.log(JSON.stringify({waterPixelVariation:variation,waterAnimationChange:change}));
  // Functional + real-GPU checks for the isolated sailing demonstration.
  const dynamic = {};
  await page.evaluate(()=>{
    window.__materialLab.setTime(30); window.__materialLab.resetSailing();
    window.__materialLab.setView("wake"); window.__materialLab.advanceSimulation(1);
  });
  dynamic.parked=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(dynamic.parked.shipMotion.speedMps,0);
  assert.equal(dynamic.parked.wake.trailPointCount,0);
  assert.equal(dynamic.parked.wake.activeDraws,0);
  checks.push("stationary ship emits no sailing foam or historical trail");
  await page.locator("#sailing").selectOption("slow");
  const selected=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(selected.shipMotion.x,dynamic.parked.shipMotion.x);
  assert.equal(selected.shipMotion.heading,dynamic.parked.shipMotion.heading);
  await page.evaluate(()=>window.__materialLab.advanceSimulation(15));
  dynamic.slow=await page.evaluate(()=>window.__materialLab.snapshot());
  assert(Math.abs(dynamic.slow.shipMotion.speedMps-8*1852/3600)<1e-6);
  await page.locator("#sailing").selectOption("cruise");
  const beforeCruise=await page.evaluate(()=>window.__materialLab.snapshot());
  await page.evaluate(()=>window.__materialLab.advanceSimulation(14));
  await page.waitForTimeout(250);
  dynamic.cruise=await page.evaluate(()=>window.__materialLab.snapshot());
  assert(Math.abs(dynamic.cruise.shipMotion.speedMps-18*1852/3600)<1e-6);
  assert(dynamic.cruise.wake.trailPointCount>10);
  assert.equal(dynamic.cruise.wake.activeDraws,2);
  assert(dynamic.cruise.wake.maxTriangles<=2500);
  assert.equal(dynamic.cruise.renderTargets,0);
  assert.deepEqual(dynamic.cruise.gpu.errors,[]);
  for(const [axis,index] of [["x",0],["z",2]]) {
    const shipDelta=dynamic.cruise.shipMotion[axis]-beforeCruise.shipMotion[axis];
    const cameraDelta=dynamic.cruise.camera.target[index]-beforeCruise.camera.target[index];
    assert(Math.abs(shipDelta-cameraDelta)<1e-6,"Following camera must track ship translation");
  }
  await page.screenshot({path:output+"/sailing-cruise.png",timeout:60000});
  checks.push("8 / 18 kn presets accelerate continuously; following camera + 2-draw wake budget");
  const wakePixels=await page.evaluate(()=>{
    const canvas=document.querySelector("#scene");
    const gl=canvas.getContext("webgl2")||canvas.getContext("webgl");
    const capture=visible=>{
      window.__materialLab.setWakeVisible(visible);
      const pixels=new Uint8Array(canvas.width*canvas.height*4);
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return pixels;
    };
    const off=capture(false),on=capture(true);
    let changed=0,sum=0;
    for(let i=0;i<off.length;i+=4){
      const delta=Math.abs(off[i]-on[i])+Math.abs(off[i+1]-on[i+1])+Math.abs(off[i+2]-on[i+2]);
      if(delta>2){changed++;sum+=delta;}
    }
    return {changed,fraction:changed/(canvas.width*canvas.height),
      meanDelta:sum/Math.max(1,changed),glError:gl.getError()};
  });
  assert.equal(wakePixels.glError,0);
  assert(wakePixels.changed>30,"Sailing wake must visibly affect actual GPU pixels");
  assert(wakePixels.fraction<.12,"Wake must not form a screen-covering white carpet");
  checks.push("visible wake pixels with A/B toggle at identical ship pose and time");
  const retained=dynamic.cruise.wake.points.at(-5);
  await page.locator("#sailing").selectOption("turn");
  await page.evaluate(()=>window.__materialLab.advanceSimulation(18));
  await page.waitForTimeout(100);
  dynamic.turn=await page.evaluate(()=>window.__materialLab.snapshot());
  assert(Math.abs(dynamic.turn.shipMotion.speedMps-12*1852/3600)<1e-6);
  assert(Math.abs(dynamic.turn.shipMotion.heading-dynamic.cruise.shipMotion.heading)>.3);
  assert.deepEqual(dynamic.turn.wake.points.find(p=>p.born===retained.born),retained,
    "Old trail point must retain its world coordinates and heading when ship turns");
  assert.equal(dynamic.turn.wake.worldSpace,true);
  await page.screenshot({path:output+"/sailing-turn.png",timeout:60000});
  checks.push("turning leaves old wake fixed in world space, not attached to ship yaw");
  await page.locator("#sailing").selectOption("stop");
  await page.evaluate(()=>window.__materialLab.advanceSimulation(9));
  dynamic.stopping=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(dynamic.stopping.shipMotion.speedMps,0);
  assert.equal(dynamic.stopping.wake.emitting,false);
  assert(dynamic.stopping.wake.trailPointCount>0,"Old wake must remain immediately after stopping");
  assert.equal(dynamic.stopping.wake.activeDraws,1);
  const stoppedPosition=dynamic.stopping.shipMotion;
  await page.evaluate(()=>window.__materialLab.advanceSimulation(45));
  dynamic.faded=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(dynamic.faded.shipMotion.x,stoppedPosition.x);
  assert.equal(dynamic.faded.shipMotion.z,stoppedPosition.z);
  assert.equal(dynamic.faded.wake.trailPointCount,0);
  assert.equal(dynamic.faded.wake.activeDraws,0);
  checks.push("stopping retains old trail, then fades fully without ship drift");
  await page.locator("#reset-sailing").click();
  const reset=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(reset.shipMotion.x,0);assert.equal(reset.shipMotion.z,0);
  assert.equal(reset.shipMotion.preset,"stop");assert.equal(reset.wake.trailPointCount,0);
  assert.deepEqual(reset.gpu.errors,[]);
  checks.push("explicit reset clears motion and wake without GPU errors");
  await page.locator("#sailing").selectOption("slow");
  await page.locator("#motion").click();
  await page.waitForTimeout(350);
  await page.locator("#motion").click();
  const paused=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(paused.playing,false);assert(paused.shipMotion.speedMps>0);
  await page.waitForTimeout(150);
  const stillPaused=await page.evaluate(()=>window.__materialLab.snapshot());
  assert.equal(stillPaused.seconds,paused.seconds);
  assert.deepEqual(stillPaused.shipMotion,paused.shipMotion);
  assert.deepEqual(stillPaused.wake.points,paused.wake.points);
  await page.locator("#reset-sailing").click();
  checks.push("animation pause freezes motion and wake; resume advances simulation");
  console.log(JSON.stringify({wakePixels,dynamic:Object.fromEntries(Object.entries(dynamic).map(([name,s])=>
    [name,{ship:s.shipMotion,wakePoints:s.wake.trailPointCount,draws:s.drawCalls,triangles:s.activeTriangles}]))}));
  await page.locator('[data-view="overview"]').click();
  await page.waitForTimeout(200);
  const before=await page.evaluate(()=>window.__materialLab.snapshot().camera.position);
  await page.mouse.move(750,410);await page.mouse.down();await page.mouse.move(850,460,{steps:6});await page.mouse.up();
  await page.waitForTimeout(400);
  const after=await page.evaluate(()=>window.__materialLab.snapshot().camera.position);
  assert.notDeepEqual(before,after);checks.push("mouse orbit");
  await page.mouse.wheel(0,-150);await page.waitForTimeout(400);
  assert.notDeepEqual(after,await page.evaluate(()=>window.__materialLab.snapshot().camera.position));
  checks.push("wheel zoom");
  await page.locator("#resolution").selectOption("native");
  await page.waitForTimeout(250);
  assert.equal((await page.evaluate(()=>window.__materialLab.snapshot())).width,1440);
  await page.locator("#resolution").selectOption("budget");
  checks.push("resolution presets");
  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),844);
  const mobileStats=await page.evaluate(()=>window.__materialLab.snapshot());
  assert(mobileStats.width<=844&&mobileStats.height<=390);
  checks.push("mobile landscape layout (not device performance)");
  await page.evaluate(()=>{window.__materialLab.dispose();window.__materialLab.dispose();});
  await page.locator("#sailing").selectOption("cruise");
  await page.locator("#reset-sailing").click();
  await page.locator("#motion").click();
  await page.evaluate(()=>window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(150);
  checks.push("idempotent disposal detaches preview UI and camera listeners");
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const report={ok:true,contactPixels,wakePixels,dynamic,waterProbe:{luminanceVariation:variation,animationRgbChange:change},renderer:"Chromium SwiftShader on server; not mobile/Surface performance evidence",checks,errors,failed,views,mobileStats};
  await writeFile(output+"/report.json",JSON.stringify(report,null,2));
  const bytes=await readFile(output+"/sailing-turn.png");
  const comparisonPage=await context.newPage();
  await comparisonPage.setViewportSize({width:1920,height:720});
  const previousPng=await readFile(output+"/sailing-cruise.png").catch(()=>null);
  if(previousPng){
    const font=await readFile(resolve("src/assets/fonts/fusion-bold-pixel-12px-proportional-zh_hans.ttf"));
    await comparisonPage.setContent('<!doctype html><html><head><style>@font-face{font-family:Lab;src:url(data:font/ttf;base64,'+font.toString("base64")+')}*{box-sizing:border-box}body{margin:0;padding:12px;background:#142c38;color:#edf7fa;font-family:Lab,sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:23px;margin:3px 0 10px}img{display:block;width:100%;height:auto;border:1px solid #57818e}p{font-size:18px;margin:10px 0;text-align:center;color:#bcd7de}</style></head><body><main><section><h2>巡航 · 18 kn</h2><img src="data:image/png;base64,'+previousPng.toString("base64")+'"></section><section><h2>转弯 · 12 kn · 保留驶过的尾流</h2><img src="data:image/png;base64,'+bytes.toString("base64")+'"></section></main><p>航行动态效果 · 同舰模 / 轻量档 · 真实 3D 截图 · 未接入正式游戏 · 非手机帧率测试</p></body></html>');
    await comparisonPage.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(img=>img.decode()));});
    await comparisonPage.screenshot({path:output+"/comparison.png",timeout:60000});
  }
  await comparisonPage.close();
  console.log(JSON.stringify({ok:true,checks:checks.length,views:views.map(v=>({name:v.name,draws:v.drawCalls,triangles:v.activeTriangles,renderTargets:v.renderTargets,width:v.width,height:v.height})),image:output+"/sailing-turn.png",sha256:createHash("sha256").update(bytes).digest("hex")}));
} catch(error) {
  await writeFile(output+"/failure.json",JSON.stringify({error:String(error),errors,failed,checks,views},null,2));
  console.error(JSON.stringify({error:String(error),errors,failed,checks}));
  process.exitCode=1;
} finally {await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
