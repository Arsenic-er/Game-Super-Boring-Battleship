// Explicit experimental acceptance, not part of normal gameplay. Failing gates intentionally exit 1.
// From repository root: node scripts/qa/coastal-recovery-acceptance.mjs --experimental-terrain-maneuvers
import { registerHooks } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
if(!process.argv.includes("--experimental-terrain-maneuvers")){
 console.error("Pass --experimental-terrain-maneuvers to run this opt-in recovery acceptance.");
 process.exit(2);
}
const root=process.cwd(), folder=".qa/coastal-recovery-acceptance/", sources=new Map(), loaded=new Set();
mkdirSync(folder,{recursive:true});
const baseline=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
for(const p of execFileSync("git",["ls-files","--cached","--others","--exclude-standard","src"],{encoding:"utf8"}).trim().split("\n").filter(p=>p.endsWith(".ts"))) sources.set(root+"/"+p,readFileSync(p,"utf8"));
registerHooks({
 resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith("."))return n(s+".ts",c);throw e}},
 load(url,c,n){const result=n(url,c);if(url.startsWith("file:")){const p=fileURLToPath(url),source=sources.get(p);if(source!==undefined){loaded.add(p);return{...result,source}}}return result}
});
const {createInitialState,createDeveloperShipState}=await import("../../src/sim/simulation.ts");
const {LocalBattleSession}=await import("../../src/session/localBattleSession.ts");
const {RuleBasedAi}=await import("../../src/controllers/ruleBasedAi.ts");
const {AiTerrainManeuverGuard}=await import("../../src/controllers/aiTerrainManeuverGuard.ts");
const {AiManeuverScheduler}=await import("../../src/sim/aiManeuverScheduler.ts");
const {advanceShipKinematics,createShipKinematicSnapshot,shipKinematicParameters}=await import("../../src/sim/navigationKinematics.ts");
const {constrainShipTerrainMotion,shipTerrainFootprintContact}=await import("../../src/sim/shipFootprint.ts");
const {terrainNavigationAt,shipDraftMeters}=await import("../../src/maps/atollMap.ts");
const {FIXED_STEP}=await import("../../src/sim/config.ts");
const mapId="atoll-prototype", ownership=new Set(["braking","holding","recovery-planning","retreating","turning","settling"]);
const duration=240, cases=[];
for(const fixture of ["neutral-lock","seeded-565-pose"]){
 const state=createInitialState(123,"sea-trials");state.mapId=mapId;state.airSupport="none";state.airSquadrons=[];
 const human=state.ships.find(s=>s.id==="player");human.position={x:-5000,y:0,z:-5000};
 const neutral=fixture==="neutral-lock";
 const ship=createDeveloperShipState({
  id:"audit",team:"player",shipClassId:"edinburgh",aiControlled:true,
  position:neutral?{x:1695,y:0,z:1282}:{x:1716.718394917268,y:0,z:1259.1558367375565},
  heading:neutral?-.5:-.37734690229167844,mainGunMounts:0,torpedoLauncherMounts:0,secondaryGunIds:[]
 });
 ship.speedKnots=neutral?.3:4.954934015343935;ship.rudder=-.82;
 if(!neutral){ship.modules.engine.health=170.0268526021338;ship.modules.steering.health=136.97632928536274;}
 state.ships=[human,ship];const initial=structuredClone(ship),session=new LocalBattleSession(state,{experimentalTerrainManeuvers:true});
 const phases={}, reasons={},trace=[],scheduler={frames:0,maxMotionSteps:0,maxTerrainQueries:0,motionSteps:0,terrainQueries:0};
 let path=0,last60Path=0,last30At60=0,firstUnsafe,unsafeIntentTicks=0,unsafeActualTicks=0;
 let commandInput,commandOutput,telemetry,previousPhase,previousReason,episodeStarts=0,rejoinedCount=0,failedTransitions=0;
 let wasStoppedOrder=false,forwardReleasedAt=null,brakeReleases=0,shortBrakeCycles=0;
 let ordinaryRun=0,longestOrdinaryRun=0,afterRejoinRun=0,longestAfterRejoinRun=0;
 let firstUnverified,unverifiedRun=0,longestUnverifiedRun=0;
 let noProgressAnchor={...ship.position},noProgressSince=0,longestNoProgress=0,checkpoint60;
 const ordinary=RuleBasedAi.prototype.command,guard=AiTerrainManeuverGuard.prototype.command,background=AiManeuverScheduler.prototype.runBackground;
 AiTerrainManeuverGuard.prototype.command=function(o,controls,...args){if(o.self.id==="audit")commandInput={...controls};return guard.call(this,o,controls,...args);};
 RuleBasedAi.prototype.command=function(o,...args){
  const out=ordinary.call(this,o,...args);if(o.self.id!=="audit")return out;
  commandOutput=out;telemetry=this.getManeuverTelemetry();
  const phase=telemetry.phase,reason=telemetry.reason??"none";
  phases[phase]=(phases[phase]??0)+1;reasons[reason]=(reasons[reason]??0)+1;
  if(phase==="unverified")firstUnverified??={time:o.time,reason,controls:{throttle:out.throttle,rudder:out.rudder}};
  unverifiedRun=phase==="unverified"?unverifiedRun+FIXED_STEP:0;
  longestUnverifiedRun=Math.max(longestUnverifiedRun,unverifiedRun);
  if(phase==="braking"&&!ownership.has(previousPhase))episodeStarts++;
  if(phase==="rejoined"&&previousPhase!=="rejoined")rejoinedCount++;
  if(phase==="recovery-failed"&&(phase!==previousPhase||reason!==previousReason))failedTransitions++;
  const stoppedOrder=out.throttle===0;
  if(wasStoppedOrder&&out.throttle>0){brakeReleases++;forwardReleasedAt=o.time;}
  if(stoppedOrder&&!wasStoppedOrder&&forwardReleasedAt!==null){if(o.time-forwardReleasedAt<2)shortBrakeCycles++;forwardReleasedAt=null;}
  wasStoppedOrder=stoppedOrder;
  const ordinaryControl=!ownership.has(phase)&&phase!=="unverified"&&commandInput?.throttle===out.throttle&&commandInput?.rudder===out.rudder;
  ordinaryRun=ordinaryControl&&Math.abs(o.self.speedKnots)>1?ordinaryRun+FIXED_STEP:0;
  longestOrdinaryRun=Math.max(longestOrdinaryRun,ordinaryRun);
  afterRejoinRun=rejoinedCount>0&&ordinaryControl&&Math.abs(o.self.speedKnots)>1?afterRejoinRun+FIXED_STEP:0;
  longestAfterRejoinRun=Math.max(longestAfterRejoinRun,afterRejoinRun);
  const from=createShipKinematicSnapshot(o.self),next=createShipKinematicSnapshot(o.self);
  const water=terrainNavigationAt(mapId,from.position.x,from.position.z,shipDraftMeters(o.self.shipClassId));
  advanceShipKinematics(next,shipKinematicParameters(o.self),out,water.speedMultiplier,FIXED_STEP);
  const sweep=constrainShipTerrainMotion(mapId,o.self.shipClassId,from,next);
  if(sweep.blocked||sweep.rotationBlocked||sweep.budgetExhausted||sweep.contact.blocked){
   unsafeIntentTicks++;firstUnsafe??={time:o.time,kind:"intended-full-hull-sweep",position:{...ship.position},controls:{throttle:out.throttle,rudder:out.rudder},telemetry,sweep};
  }
  if(phase!==previousPhase||reason!==previousReason||trace.length===0||o.time-trace.at(-1).time>=5)trace.push({
   time:o.time,position:{...ship.position},heading:ship.heading,speed:ship.speedKnots,rudder:ship.rudder,path,
   controls:{throttle:out.throttle,rudder:out.rudder},input:commandInput,telemetry,navigation:out.aiDecision?.navigation,
   engine:ship.modules.engine.health,steering:ship.modules.steering.health
  });
  previousPhase=phase;previousReason=reason;
  return out;
 };
 AiManeuverScheduler.prototype.runBackground=function(){const out=background.call(this),work=this.work;scheduler.frames++;
  scheduler.motionSteps+=work.motionSteps;scheduler.terrainQueries+=work.terrainQueries;
  scheduler.maxMotionSteps=Math.max(scheduler.maxMotionSteps,work.motionSteps);scheduler.maxTerrainQueries=Math.max(scheduler.maxTerrainQueries,work.terrainQueries);return out;};
 const started=performance.now();
 try{
  for(let frame=0;frame<duration*60;frame++){
   const previous={...ship.position};session.step(new Map(),FIXED_STEP);
   const distance=Math.hypot(ship.position.x-previous.x,ship.position.z-previous.z);path+=distance;
   if(frame>=1800&&frame<3600)last30At60+=distance;if(frame>=10800)last60Path+=distance;
   if(Math.hypot(ship.position.x-noProgressAnchor.x,ship.position.z-noProgressAnchor.z)>=1){noProgressAnchor={...ship.position};noProgressSince=state.time;}
   longestNoProgress=Math.max(longestNoProgress,state.time-noProgressSince);
   const contact=shipTerrainFootprintContact(mapId,ship.shipClassId,ship);
   if(contact.blocked){unsafeActualTicks++;firstUnsafe??={time:state.time,kind:"actual-full-hull-contact",contact};}
   if(frame===3599)checkpoint60={path,net:Math.hypot(ship.position.x-initial.position.x,ship.position.z-initial.position.z),last30Path:last30At60,
    phase:telemetry?.phase,episodeStarts,rejoinedCount,unsafeIntentTicks,unsafeActualTicks};
  }
 }finally{RuleBasedAi.prototype.command=ordinary;AiTerrainManeuverGuard.prototype.command=guard;AiManeuverScheduler.prototype.runBackground=background;}
 const net=Math.hypot(ship.position.x-initial.position.x,ship.position.z-initial.position.z),gates=[];
 const check=(condition,name)=>{if(!condition)gates.push(name);};
 const unverifiedTicks=phases.unverified??0;
 check(!firstUnsafe,"no complete-hull contact");
 check(unverifiedTicks===0,"no unverified live control ticks");
 check(path>100,"240s actual path > 100m");check(net>50,"240s net displacement > 50m");check(last60Path>50,"last60s actual path > 50m");
 check(longestNoProgress<=30,"longest <1m progress interval <=30s");
 check(shortBrakeCycles===0,"no brake/forward/brake cycles shorter than2s");
 check(brakeReleases<=6,"no more than6 forward releases");
 if(episodeStarts>0){check(rejoinedCount>0,"at least one verified rejoin");check(longestAfterRejoinRun>=10,"10s ordinary movement after verified rejoin");}
 check(scheduler.maxMotionSteps<=1024,"shared motion budget");check(scheduler.maxTerrainQueries<=64,"shared geometry budget");
 check(checkpoint60.path>5&&checkpoint60.net>5&&checkpoint60.last30Path>5,"60s actual path/net/last30 all >5m");
 const summary={fixture,seed:123,duration,checkpoint60,path,net,last60Path,longestNoProgress,firstUnsafe,unsafeIntentTicks,unsafeActualTicks,
  episodeStarts,rejoinedCount,failedTransitions,brakeReleases,shortBrakeCycles,longestOrdinaryRun,longestAfterRejoinRun,unverifiedTicks,firstUnverified,longestUnverifiedRun,
  phases,reasons,scheduler,wallMs:performance.now()-started,gates};
 cases.push({summary,initial,end:structuredClone(ship),trace});
 console.log("RECOVERY_SESSION",JSON.stringify(summary));
}
const hashes=Object.fromEntries([...loaded].sort().map(p=>[p.slice(root.length+1),createHash("sha256").update(sources.get(p)).digest("hex")]));
writeFileSync(folder+"session-acceptance.json",JSON.stringify({baseline,experimentalTerrainManeuvers:true,
 disclaimer:"Seeded real-controller/session fixtures, not a replay of the entire original natural battle. Progress is derived only from actual post-step positions; checks never modify movement.",
 hashes,cases},null,2)+"\n");
if(cases.some(c=>c.summary.gates.length))process.exitCode=1;
