import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createOpponent, opponentAim, type OpponentAircraft, type OpponentRuntime } from './opponent.js';
import { planOpponentTactics, tacticalFlightSpace, recordOpponentShot, recordOpponentHit, recordOpponentDamage, shiftOpponentTactics, type TacticalAircraft } from './opponent-tactics.js';
import { advanceHunterFlight, hunterBallisticSolution } from './hunter-flight.js';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { enemyAiLevels, type EnemyAiLevel } from '../../shared/enemy-ai.mjs';
import { ballisticShotSpeed, COMBAT_RANGE } from '../../shared/protocol.mjs';
const wrap=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
const floor=()=>100;
function aircraft(type:OpponentAircraft='trainer',z=0):TacticalAircraft { return {aircraftType:type,position:{x:-14000,y:1000,z},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-400}}; }
function opponent(level:EnemyAiLevel='HARD',type:OpponentAircraft='trainer') {
 return createOpponent({aircraft:type,level,cityId:'dallas',position:{x:-14000,y:1000,z:0},rotation:{x:0,y:0,z:0},speed:400,health:150,behavior:'pursuit'});
}
function scenario(level:EnemyAiLevel,kind:'straight'|'circle'|'evasive',type:OpponentAircraft='trainer',seconds=90) {
 const runtime=opponent(level,type),p=aircraft(type),target=aircraft('trainer',-1800);
 const motion={speed:400,bankControl:0,combatTurnSign:1,expertControl:runtime.profile.tactics.expert},targetMotion={speed:400,bankControl:0,combatTurnSign:1};
 const bullets:{position:{x:number;y:number;z:number};direction:{x:number;y:number;z:number};speed:number;distance:number}[]=[];
 let shots=0,hits=0,fireAt=0,minRange=Infinity,closeNoShot=0,maxCloseNoShot=0,maxYaw=0,minSpeed=Infinity;
 const tactics=new Set<string>(),costs:number[]=[];
 for(let i=0;i<seconds*20;i++) {
  const now=i*50;
  const targetYaw=kind==='straight'?0:kind==='circle'?now*.00016:Math.sin(now*.0007)*.9;
  const goal={x:target.position.x-Math.sin(targetYaw)*12000,y:1000+(kind==='evasive'?Math.sin(now*.001)*250:0),z:target.position.z-Math.cos(targetYaw)*12000};
  advanceHunterFlight(target,targetMotion,goal,400,.05,floor);
  const shot=hunterBallisticSolution(p.position,p.velocity,target.position,target.velocity,runtime.profile.tactics.expert?runtime.tactics?.targetTurnRate??0:0);
  const yawError=shot?Math.abs(wrap(Math.atan2(-shot.direction.x,-shot.direction.z)-p.rotation.y)):Infinity;
  const pitchError=shot?Math.abs(Math.asin(shot.direction.y)-p.rotation.x):Infinity;
  const valid=Boolean(shot)&&yawError<.2&&pitchError<.2;
  const before=performance.now();
  const plan=planOpponentTactics(runtime,{enemy:p,target,targetId:'player',speed:motion.speed,now,cruise:450,firingSolution:valid,floorAt:floor});
  costs.push(performance.now()-before);tactics.add(plan.tactic);motion.combatTurnSign=plan.turnSign;
  const yaw=p.rotation.y;
  advanceHunterFlight(p,motion,plan.waypoint,plan.cruise,.05,floor);
  maxYaw=Math.max(maxYaw,Math.abs(wrap(p.rotation.y-yaw))/.05);minSpeed=Math.min(minSpeed,motion.speed);
  assert.ok(p.position.y>floor());assert.ok(motion.speed<=aircraftFlightEnvelope[type].maxSpeed);
  const range=Math.hypot(p.position.x-target.position.x,p.position.z-target.position.z);minRange=Math.min(minRange,range);
  closeNoShot=range<650&&!valid?closeNoShot+.05:0;maxCloseNoShot=Math.max(maxCloseNoShot,closeNoShot);
  if(valid&&shot&&now>=fireAt) {
   // Same independent angular dispersion; no homing, enlarged hitbox or forced hit.
   const spread=opponentAim(runtime.profile,0,0,()=>.5+.45*Math.sin(shots*2.4));
   const d={x:shot.direction.x+spread.x,y:shot.direction.y+spread.y,z:shot.direction.z};const length=Math.hypot(d.x,d.y,d.z);d.x/=length;d.y/=length;d.z/=length;
   bullets.push({position:{...p.position},direction:d,speed:ballisticShotSpeed(p.velocity,d),distance:0});
   fireAt=now+runtime.profile.shotIntervalMs;shots++;recordOpponentShot(runtime);
  }
  for(let j=bullets.length-1;j>=0;j--) {
   const b=bullets[j]!,r={x:b.position.x-target.position.x,y:b.position.y-target.position.y,z:b.position.z-target.position.z};
   const v={x:b.direction.x*b.speed-target.velocity.x,y:b.direction.y*b.speed-target.velocity.y,z:b.direction.z*b.speed-target.velocity.z};
   const t=Math.max(0,Math.min(.05,-(r.x*v.x+r.y*v.y+r.z*v.z)/(v.x*v.x+v.y*v.y+v.z*v.z)));
   const hit=Math.hypot(r.x+v.x*t,r.y+v.y*t,r.z+v.z*t)<6;
   b.position.x+=b.direction.x*b.speed*.05;b.position.y+=b.direction.y*b.speed*.05;b.position.z+=b.direction.z*b.speed*.05;b.distance+=b.speed*.05;
   if(hit){hits++;recordOpponentHit(runtime);}if(hit||b.distance>COMBAT_RANGE)bullets.splice(j,1);
  }
 }
 costs.sort((a,b)=>a-b);
 return {shots,hits,minRange,maxCloseNoShot,maxYaw,minSpeed,tactics:[...tactics],planningP95:costs[Math.floor(costs.length*.95)]!,runtime};
}

test('extended 1v1: five levels physically intercept and fire on a moving Bluejay, without close orbit traps',t=>{
 for(const level of Object.keys(enemyAiLevels) as EnemyAiLevel[]) {
  const result=scenario(level,'straight');
  t.diagnostic(JSON.stringify({level,...result,runtime:undefined}));
  assert.ok(result.shots>=6,`${level}: meaningful repeated firing opportunities`);
  if(level!=='EASY')assert.ok(result.hits>0,`${level}: actual moving-target ballistic hit`);
  assert.ok(result.tactics.length>=(level==='LEGENDARY'?2:3));assert.ok(result.maxCloseNoShot<10);assert.ok(result.minSpeed>100);
  assert.ok(result.runtime.tactics!.transitions.length<=12);
 }
});
test('circling and evasive targets change tactical decisions rather than forcing the same loop',t=>{
 const straight=scenario('LEGENDARY','straight'),circle=scenario('LEGENDARY','circle'),evasive=scenario('LEGENDARY','evasive');
 for(const [kind,r] of Object.entries({straight,circle,evasive}))t.diagnostic(JSON.stringify({kind,...r,runtime:undefined}));
 assert.ok(circle.maxCloseNoShot<10);assert.notDeepEqual(circle.tactics,straight.tactics);
 assert.ok(evasive.hits<straight.hits,'maneuvering can evade real ballistic shots');
 assert.ok(circle.runtime.tactics!.turning>straight.runtime.tactics!.turning);
});
test('aircraft-derived flight space and actual trajectories differ without difficulty physics buffs',t=>{
 const spaces=Object.keys(aircraftFlightEnvelope).map(type=>tacticalFlightSpace(type as OpponentAircraft,500));
 assert.ok(spaces[2]!.radius>spaces[3]!.radius);
 for(const type of Object.keys(aircraftFlightEnvelope) as OpponentAircraft[]) {
  const r=scenario('HARD','circle',type,45);t.diagnostic(JSON.stringify({type,...r,runtime:undefined}));
  assert.ok(r.maxCloseNoShot<10);assert.ok(Number.isFinite(r.maxYaw));
 }
});
test('overshoot commits forward, reactive lock defense is delayed, projectile dodge obeys cooldown and memory decays',()=>{
 const runtime=opponent('LEGENDARY'),enemy=aircraft(),target=aircraft('trainer',200);
 target.rotation.y=Math.PI;
 const input={enemy,target,targetId:'player',speed:400,now:0,cruise:450,firingSolution:false,floorAt:floor};
 planOpponentTactics(runtime,input);
 const plan=planOpponentTactics(runtime,{...input,now:500});assert.equal(plan.tactic,'extendAway');assert.ok(plan.waypoint.z<enemy.position.z);
 assert.equal(planOpponentTactics(runtime,{...input,now:600}).waypoint,plan.waypoint);
 const before=runtime.tactics!.plan.until;shiftOpponentTactics(runtime,1000);assert.equal(runtime.tactics!.plan.until,before+1000);
 const locked=opponent('LEGENDARY');target.position.z=1800;target.rotation.y=0;
 planOpponentTactics(locked,{...input,now:0,lockedByTarget:true});
 assert.notEqual(planOpponentTactics(locked,{...input,now:250,lockedByTarget:true}).tactic,'defensiveBreak');
 const defensive=planOpponentTactics(locked,{...input,now:500,lockedByTarget:true});assert.equal(defensive.tactic,'defensiveBreak');
 assert.ok(defensive.waypoint.x!==enemy.position.x);
 const until=locked.dodgeAt;planOpponentTactics(locked,{...input,now:750,lockedByTarget:true});assert.equal(locked.dodgeAt,until);
 const projectile=opponent('LEGENDARY');target.position.z=-1800;
 const bullets=[{position:{...enemy.position,z:-1200},direction:{x:0,y:0,z:1},speed:1500}];
 planOpponentTactics(projectile,{...input,now:0,bullets});
 planOpponentTactics(projectile,{...input,now:250,bullets});
 const dodge=planOpponentTactics(projectile,{...input,now:500,bullets});assert.equal(dodge.tactic,'defensiveBreak');
 assert.ok(projectile.dodgeAt>=projectile.profile.reactionMs);
});

test('personality is validated separately; encounter feedback is bounded and decays without global persistence',()=>{
 const definition=opponent().definition;
 for(const personality of ['balanced','aggressive','patient','defensive','energy'] as const)assert.equal(createOpponent({...definition,personality}).definition.personality,personality);
 assert.throws(()=>createOpponent({...definition,personality:'invalid'} as never));
 const runtime=opponent('HARD'),enemy=aircraft(),target=aircraft('trainer',-2000);
 const input={enemy,target,targetId:'player',speed:400,now:0,cruise:450,firingSolution:false,floorAt:floor};
 planOpponentTactics(runtime,input);planOpponentTactics(runtime,{...input,now:1000});
 recordOpponentShot(runtime);recordOpponentHit(runtime);recordOpponentDamage(runtime);
 const memory=runtime.tactics!;memory.usefulness[0]=1;
 assert.equal(memory.hits,1);assert.equal(memory.threatDamage,1);
 planOpponentTactics(runtime,{...input,now:30000});
 assert.ok(memory.threatDamage<1);assert.ok(memory.usefulness[0]!<1);assert.equal(memory.usefulness.length,13);
 const other=opponent('HARD');assert.equal(other.tactics,undefined);
 planOpponentTactics(runtime,{...input,targetId:'other',now:31000});assert.equal(runtime.tactics!.hits,0);
});

test('useful separation ends extension early instead of wasting a fixed maneuver timer',()=>{
 const runtime=opponent('HARD'),enemy=aircraft(),target=aircraft('trainer',600);
 target.rotation.y=Math.PI;
 const input={enemy,target,targetId:'player',speed:400,now:0,cruise:450,firingSolution:false,floorAt:floor};
 planOpponentTactics(runtime,input);
 const extend=planOpponentTactics(runtime,{...input,now:500});assert.equal(extend.tactic,'extendAway');
 const separation=tacticalFlightSpace('trainer',400).separation;
 target.position.z=separation*2;
 const next=planOpponentTactics(runtime,{...input,now:1600});
 assert.ok(1600<extend.until,'physical separation is achieved before nominal commitment expires');
 assert.notEqual(next.tactic,'extendAway');
});

// Same airframes, pursuit controls and initial conditions; only the intelligence profile changes.
test('Legendary Firehawk breaks a Bluejay firing lane and creates legal counterattack opportunities',t=>{
 const results:{baseline:boolean;exposed:number;opportunities:number}[]=[];
for(const baseline of [true,false]){
 const r=createOpponent({aircraft:'fighter',level:'LEGENDARY',cityId:'dallas',position:{x:-14000,y:1200,z:0},rotation:{x:0,y:0,z:0},speed:900,health:100,behavior:'attack'});
 const runtime:OpponentRuntime={...r,profile:baseline?{...r.profile,reactionMs:180,trackingMs:400,shotIntervalMs:220,aimError:.0025,dodgeCooldownMs:2400,tactics:{...r.profile.tactics,expert:false,commitment:1800}}:r.profile};
 const e={aircraftType:'fighter' as const,position:{...r.definition.position},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-900}},p={aircraftType:'trainer' as const,position:{x:-14000,y:1200,z:1000},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-800}};
 const em={speed:900,bankControl:0,combatTurnSign:1,expertControl:!baseline},pm={speed:800,bankControl:0,combatTurnSign:1};let exposed=0,opportunities=0;const tactics=new Set();
 for(let i=0;i<1200;i++){
 const dx=e.position.x-p.position.x,dz=e.position.z-p.position.z,range=Math.hypot(dx,dz);const cone=Math.abs(wrap(Math.atan2(-dx,-dz)-p.rotation.y))<.2&&Math.abs(Math.atan2(e.position.y-p.position.y,range)-p.rotation.x)<.2&&range<4500;if(cone)exposed+=.05;
 const sol=hunterBallisticSolution(e.position,e.velocity,p.position,p.velocity,runtime.profile.tactics.expert?runtime.tactics?.targetTurnRate??0:0);const firing=!!sol&&Math.abs(wrap(Math.atan2(-sol.direction.x,-sol.direction.z)-e.rotation.y))<.2&&Math.abs(Math.asin(sol.direction.y)-e.rotation.x)<.2;if(firing)opportunities+=.05;
 const plan=planOpponentTactics(runtime,{enemy:e,target:p,targetId:'p',speed:em.speed,now:i*50,cruise:1046,firingSolution:firing,lockedByTarget:cone,floorAt:()=>100});tactics.add(plan.tactic);em.combatTurnSign=plan.turnSign;
 advanceHunterFlight(e,em,plan.waypoint,plan.cruise,.05,()=>100);advanceHunterFlight(p,pm,{...e.position},800,.05,()=>100);
 }
 results.push({baseline,exposed,opportunities});t.diagnostic(JSON.stringify({baseline,exposed,opportunities,tactics:[...tactics]}));
}
 assert.ok(results[1]!.exposed<results[0]!.exposed/4,'developing firing-lane exposure is substantially reduced');
 assert.ok(results[1]!.opportunities>0,'defense must produce an offensive opening rather than only running away');
});
