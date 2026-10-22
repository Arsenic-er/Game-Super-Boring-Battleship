// Laboratory acceptance: intentionally exits 1 while useful-navigation recovery fails.
// Run from repository root: node scripts/qa/coastal-maneuver-acceptance.mjs --experimental-terrain-maneuvers
import { registerHooks } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

if (!process.argv.includes("--experimental-terrain-maneuvers")) {
  console.error("This checks an explicitly experimental AI path. Pass --experimental-terrain-maneuvers to opt in.");
  process.exit(2);
}
const root = process.cwd(), folder = ".qa/coastal-planning-acceptance/";
mkdirSync(folder, { recursive: true });
const sources = new Map(), loaded = new Set();
for (const p of execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src"], {encoding:"utf8"}).trim().split("\n").filter(p => p.endsWith(".ts"))) sources.set(root + "/" + p, readFileSync(p,"utf8"));
registerHooks({
  resolve(s,c,n) { try { return n(s,c); } catch (error) { if (s.startsWith(".")) return n(s + ".ts",c); throw error; } },
  load(url,c,n) { const result=n(url,c); if(url.startsWith("file:")) { const p=fileURLToPath(url), source=sources.get(p); if(source!==undefined) { loaded.add(p); return {...result,source}; } } return result; }
});
const { createInitialState, createDeveloperShipState } = await import("../../src/sim/simulation.ts");
const { LocalBattleSession } = await import("../../src/session/localBattleSession.ts");
const { RuleBasedAi } = await import("../../src/controllers/ruleBasedAi.ts");
const { AiManeuverScheduler } = await import("../../src/sim/aiManeuverScheduler.ts");
const { FIXED_STEP } = await import("../../src/sim/config.ts");
const state = createInitialState(123, "sea-trials");
state.mapId="atoll-prototype"; state.airSquadrons=[]; state.airSupport="none";
const human=state.ships.find(s=>s.id==="player");
human.position={x:-5000,y:0,z:-5000};
const ship=createDeveloperShipState({
  id:"audit",team:"player",shipClassId:"edinburgh",
  position:{x:1695,y:0,z:1282},heading:-.5,aiControlled:true,
  mainGunMounts:0,torpedoLauncherMounts:0,secondaryGunIds:[]
});
ship.speedKnots=.3; ship.rudder=-.82; state.ships=[human,ship];
const session=new LocalBattleSession(state,{experimentalTerrainManeuvers:true});
const initial=structuredClone(ship), phases={}, navigationPhases={}, trace=[], scheduler={frames:0,maxMotionSteps:0,maxTerrainQueries:0,motionSteps:0,terrainQueries:0};
let lateStartTravel=0,minHeading=ship.heading,maxHeading=ship.heading,brakeReleases=0,wasBraking=false,firstBrake=null,previousPhase;
const command=RuleBasedAi.prototype.command, background=AiManeuverScheduler.prototype.runBackground;
RuleBasedAi.prototype.command=function(observation,...context) {
  const out=command.call(this,observation,...context);
  if(observation.self.id!=="audit") return out;
  const guard=this.getManeuverTelemetry(), phase=out.aiDecision?.navigation?.phase??"none";
  phases[guard.phase]=(phases[guard.phase]??0)+1; navigationPhases[phase]=(navigationPhases[phase]??0)+1;
  const braking=out.throttle===0;
  if(braking) firstBrake??=observation.time;
  if(wasBraking&&!braking) brakeReleases++;
  wasBraking=braking;
  if(guard.phase!==previousPhase||trace.length===0||observation.time-(trace.at(-1)?.time??0)>=5) trace.push({
    time:observation.time,position:{...ship.position},heading:ship.heading,speed:ship.speedKnots,
    distance:ship.distanceTravelled,controls:{throttle:out.throttle,rudder:out.rudder},guard,navigation:out.aiDecision?.navigation
  });
  previousPhase=guard.phase;
  return out;
};
AiManeuverScheduler.prototype.runBackground=function() {
  const out=background.call(this),work=this.work;
  scheduler.frames++;scheduler.motionSteps+=work.motionSteps;scheduler.terrainQueries+=work.terrainQueries;
  scheduler.maxMotionSteps=Math.max(scheduler.maxMotionSteps,work.motionSteps);scheduler.maxTerrainQueries=Math.max(scheduler.maxTerrainQueries,work.terrainQueries);
  return out;
};
const started=performance.now();
try {
  for(let frame=0;frame<3600;frame++) {
    if(frame===1800) lateStartTravel=ship.distanceTravelled;
    session.step(new Map(),FIXED_STEP);
    minHeading=Math.min(minHeading,ship.heading);maxHeading=Math.max(maxHeading,ship.heading);
  }
} finally {
  RuleBasedAi.prototype.command=command;AiManeuverScheduler.prototype.runBackground=background;
}
const elapsedWallMs=performance.now()-started;
const travel60s=ship.distanceTravelled-initial.distanceTravelled, travelLast30s=ship.distanceTravelled-lateStartTravel;
const gates=[];
if(!(travel60s>5)) gates.push("FAILED recovery: real session must travel > 5 m in 60 seconds; observed "+travel60s);
if(scheduler.maxMotionSteps>1024) gates.push("FAILED shared motion budget");
if(scheduler.maxTerrainQueries>64) gates.push("FAILED shared geometry budget");
if(scheduler.frames!==3600) gates.push("FAILED experimental fixture activation");
const hashes=Object.fromEntries([...loaded].sort().map(p=>[p.slice(root.length+1),createHash("sha256").update(sources.get(p)).digest("hex")]));
const summary={experimentalTerrainManeuvers:true,durationSeconds:state.time,travel60s,travelLast30s,firstBrake,brakeReleases,minHeading,maxHeading,phases,navigationPhases,scheduler,elapsedWallMs,gates};
writeFileSync(folder+"neutral-lock-session-report.json",JSON.stringify({
  baseline:"bd508ef",status:gates.length?"FAILED_DO_NOT_ENABLE":"PASS_THIS_FIXTURE_ONLY",
  acceptance:"The real AI must resume useful movement: more than 5 m over 60 seconds. No fixed forced commands, teleportation or current-pose substitution.",
  summary,initial,end:structuredClone(ship),trace,hashes
},null,2)+"\n");
console.log("EXPERIMENTAL_NEUTRAL_LOCK",JSON.stringify(summary));
if(gates.length) process.exitCode=1;
