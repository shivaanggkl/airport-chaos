import { planOpponentTactics } from './opponent-tactics.js';
import { createOpponent } from './opponent.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHunterFlight, hunterBallisticSolution, hunterFlightIntercept, hunterObservedPosition } from './hunter-flight.js';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { ballisticShotSpeed } from '../../shared/protocol.mjs';
import { HunterMotionBuffer } from '../../shared/hunter-motion.mjs';

const aircraft = aircraftFlightEnvelope.privateJet;
function pilot() { return { aircraftType: 'privateJet' as const, position: { x: 0, y: 900, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -400 } }; }
function motion() { return { speed: 400, bankControl: 0, combatTurnSign: 1, flightAltitude: 900 }; }
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

test('Hunter keeps momentum, banks into a continuous turn and levels onto its new course', () => {
  const p = pilot(), m = motion(); let peakBank = 0, minSpeed = 1000;
  const target = { x: -20_000, y: 900, z: -20_000 };
  for (let i = 0; i < 400; i++) {
    const previous = { ...p.position }, heading = p.rotation.y, bank = p.rotation.z;
    advanceHunterFlight(p, m, target, 400, .05, () => 600);
    assert.ok(Math.abs(wrap(p.rotation.y - heading)) <= .05 * 1.2);
    assert.ok(Math.abs(p.rotation.z - bank) <= aircraft.rollRate * .05 + 1e-9);
    assert.ok(Math.hypot(p.position.x - previous.x, p.position.z - previous.z) > 15);
    const horizontal = Math.hypot(p.velocity.x, p.velocity.z);
    assert.ok((p.velocity.x * -Math.sin(p.rotation.y) + p.velocity.z * -Math.cos(p.rotation.y)) / horizontal > .9999);
    assert.ok(Math.abs(Math.atan2(p.velocity.y, horizontal) - p.rotation.x) < 1e-6);
    peakBank = Math.max(peakBank, Math.abs(p.rotation.z)); minSpeed = Math.min(minSpeed, horizontal);
  }
  assert.ok(peakBank > .3); assert.ok(minSpeed > 300); assert.ok(Math.abs(p.rotation.z) < .1);
});

test('altitude changes obey pitch and vertical acceleration limits without snapping or oscillating', () => {
  const p = pilot(), m = motion(); let peak = p.position.y;
  for (let i = 0; i < 600; i++) {
    const vy = p.velocity.y, y = p.position.y;
    advanceHunterFlight(p, m, { x: 0, y: i < 300 ? 1250 : 900, z: -100_000 }, 400, .05, () => 600);
    assert.ok(Math.abs(p.velocity.y - vy) <= 18 * .05 + 1e-7);
    assert.ok(Math.abs(p.position.y - y) < 5);
    assert.ok(p.rotation.x <= aircraft.maxClimbPitch + 1e-6 && p.rotation.x >= -aircraft.maxDivePitch - 1e-6);
    peak = Math.max(peak, p.position.y);
  }
  assert.ok(peak > 1200 && peak < 1270); assert.ok(p.position.y >= 890 && p.position.y < 980);
});

test('terrain is anticipated before the crossing instead of teleporting the aircraft upward', () => {
  const p = pilot(), m = motion();
  const floor = (_x: number, z: number) => z < -2000 ? 1400 : 600;
  for (let i = 0; i < 600; i++) {
    const y = p.position.y;
    advanceHunterFlight(p, m, { x: 0, y: 900, z: -50_000 }, 400, .05, floor);
    assert.ok(p.position.y > floor(p.position.x, p.position.z));
    assert.ok(Math.abs(p.position.y - y) < 5);
    assert.ok(Math.hypot(p.velocity.x, p.velocity.z) > 300);
  }
});

test('high-speed flight interception leads the route without increasing aircraft speed', () => {
  const point = hunterFlightIntercept({ x: 0, y: 900, z: 0 }, 400,
    { x: 0, y: 900, z: -10_000 }, { x: 700, y: 0, z: 0 });
  assert.ok(point.x > 700 * 1.75); assert.ok(Number.isFinite(point.z));
});

test('real ballistic shots hit straight moving targets; post-launch evasive turns can defeat the same shots', () => {
  const origin = { x: 0, y: 900, z: 0 }, velocity = { x: 0, y: 0, z: -400 };
  const target = { x: 0, y: 900, z: -1800 }, moving = { x: 500, y: 0, z: -100 };
  const shot = hunterBallisticSolution(origin, velocity, target, moving);
  assert.ok(shot);
  let straightHits = 0, evasiveHits = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const error = Math.sin(attempt * 2.4) * .002;
    const length = Math.hypot(shot.direction.x + error, shot.direction.y, shot.direction.z);
    const d = { x: (shot.direction.x + error) / length, y: 0, z: shot.direction.z / length };
    const speed = ballisticShotSpeed(velocity, d);
    const evasive = { ...target }; let vx = moving.x, vz = moving.z, straight = false, evaded = false;
    for (let time = .005; time < shot.seconds + .4; time += .005) {
      if (time > .2) { const turn = .6 * .005, x = vx * Math.cos(turn) - vz * Math.sin(turn); vz = vx * Math.sin(turn) + vz * Math.cos(turn); vx = x; }
      evasive.x += vx * .005; evasive.z += vz * .005;
      const x = origin.x + d.x * speed * time, z = origin.z + d.z * speed * time;
      if (Math.hypot(x - target.x - moving.x * time, z - target.z - moving.z * time) < 6) straight = true;
      if (Math.hypot(x - evasive.x, z - evasive.z) < 6) evaded = true;
    }
    if (straight) straightHits++; if (evaded) evasiveHits++;
  }
  assert.ok(straightHits >= 15, `straight hits ${straightHits}/20`);
  assert.ok(evasiveHits < straightHits / 2, `evasions ${evasiveHits}/20`);
  assert.equal(hunterBallisticSolution(origin, velocity, { ...target, z: -6000 }, moving), null);
});

test('Hunter snapshot rendering stays continuous at packet joins and across heading wrap', () => {
  const buffer = new HunterMotionBuffer(); let previous = 0;
  for (let frame = 0; frame < 120; frame++) {
    const now = frame * 1000 / 60;
    if (frame % 12 === 0) buffer.push({ x: 0, y: 900, z: -now * .4 },
      { x: 0, y: now < 1000 ? 3.13 : -3.13, z: .3 }, { x: 0, y: 0, z: -400 }, 10000 + now, now);
    const pose = buffer.sample(now)!;
    if (now > 300) assert.ok(Math.abs(pose.position.z - previous) > 5 && Math.abs(pose.position.z - previous) < 8);
    if (frame > 0) assert.ok(Math.abs(wrap(pose.rotation.y - Math.PI)) < .03, 'heading wrap must not spin the model');
    previous = pose.position.z;
  }
});

// Exercise production phase/aim functions without starting a server or bypassing combat state.
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { COMBAT_RANGE } from '../../shared/protocol.mjs';
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function production(names: string[], dependencies: Record<string, unknown>) {
  const code = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? '')).map(n => n.getText(tree)).join('\n');
  const context = vm.createContext({runwayCombatProtected:()=>false,hunterObservedPosition,...dependencies});
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

test('production firing solution respects the forward cone and uses intercepts beyond the old 1.75-second cap', () => {
  const ctx = production(['botFireSolution', 'rotateLocalYxz', 'forwardDirection', 'hunterForward'], {
    smoothHunter: () => true, hunterBallisticSolution, aircraftFlightEnvelope,
    muzzleTransform: (p: ReturnType<typeof pilot>) => ({ position: p.position }),
    normalize: (v: {x:number;y:number;z:number}) => { const n = Math.hypot(v.x,v.y,v.z); return {x:v.x/n,y:v.y/n,z:v.z/n}; },
    dot: (a: {x:number;y:number;z:number},b: {x:number;y:number;z:number}) => a.x*b.x+a.y*b.y+a.z*b.z,
    hunterFireRange: COMBAT_RANGE, hunterFireCone: .2, defenderDownwardFireAngle: .3,
  });
  const shooter = pilot(), target = { ...pilot(), position: { x: 0, y: 900, z: -2000 }, velocity: { x: 0, y: 0, z: -100 } };
  assert.ok(hunterBallisticSolution(shooter.position, shooter.velocity, target.position, target.velocity)!.seconds > 1.75);
  assert.equal(ctx.botFireSolution(shooter, target, false).reason, undefined);
  target.position.x = 2000; assert.equal(ctx.botFireSolution(shooter, target, false).reason, 'NO_FORWARD_SOLUTION');
  target.position = { x: 0, y: 900, z: 500 }; assert.equal(ctx.botFireSolution(shooter, target, false).reason, 'NO_FORWARD_SOLUTION');
});

test('production navigation delegates overshoot spacing to the same universal planner', () => {
  const p = { ...pilot(), cityId: 'dallas', lifeState: 'alive' }, target = { ...pilot(), position: { x: 0, y: 900, z: 600 } };
  const opponent=createOpponent({aircraft:'privateJet',level:'HARD',cityId:'dallas',position:p.position,rotation:p.rotation,speed:400,health:150,behavior:'pursuit'});
  const bot = { ...motion(), opponent, personality: 'hunter', phase: 'attackPass', combatTargetId: 'pilot', combatWaypoint: { x: 0, y: 900, z: -2000 } };
  const ctx = production(['hunterNavigationTarget','isHunterCombatPhase'], {
    players:new Map(),hunterTarget:()=>['pilot',target],planOpponentTactics,opponentReactionReady:()=>true,
    projectiles:new Map(),botFireSolution:()=>({reason:'NO_FORWARD_SOLUTION'}),botCruiseFactor:()=>.7,
    safeBotWaypoint:(_city:unknown,_from:unknown,p:unknown)=>p,botSafeFloor:()=>100,hunterClearance:()=>600,aircraftFlightEnvelope,
  });
  ctx.hunterNavigationTarget('hunter',p,bot,0);
  ctx.hunterNavigationTarget('hunter',p,bot,500);
  assert.equal(bot.phase,'extend');assert.ok(bot.combatWaypoint.z<0);
  assert.equal(opponent.tactics?.plan.tactic,'extendAway');
});

test('common Hunter controller covers combat modes but leaves noncombat leaders and peaceful NPCs unchanged', () => {
  const ctx = production(['smoothHunter'], {});
  for(const p of [
    {bot:{personality:'hunter',opponent:{}}},
    {bot:{opponent:{}},skyDuelPracticeOwnerId:'owner'},
    {npcOpponent:{},airAssaultId:'encounter'},
    {bot:{opponent:{},journeyRearGuardEscort:1}},
  ]) assert.equal(ctx.smoothHunter(p),true);
  for(const p of [{bot:{personality:'casual'}},{bot:{opponent:{},journeyLeader:true}}]) assert.equal(ctx.smoothHunter(p),false);
});

import { opponentAim } from './opponent.js';
import { enemyAiLevels } from '../../shared/enemy-ai.mjs';
import { aircraftPresentationMuzzleSockets } from '../../shared/aircraft-presentation-scale.mjs';
import { projectileDamageForAircraft } from '../../shared/protocol.mjs';
import { projectileImpactFraction } from '../../shared/projectile-collision.mjs';
import { aircraftHitRadii } from '../../shared/remote-aircraft-visual-rules.mjs';

test('production gun solution, muzzle, dispersed launch and swept collision genuinely hit a moving Bluejay; banking evades',t=>{
 const projectiles=new Map<string,any>();let ordinal=0;
 const normalize=(v:{x:number;y:number;z:number})=>{const n=Math.hypot(v.x,v.y,v.z);return{x:v.x/n,y:v.y/n,z:v.z/n};};
 const ctx=production(['botFireSolution','createProjectile','muzzleTransform','rotateLocalYxz','forwardDirection','hunterForward'],{
  smoothHunter:()=>true,hunterBallisticSolution,aircraftFlightEnvelope,normalize,
  dot:(a:any,b:any)=>a.x*b.x+a.y*b.y+a.z*b.z,hunterFireRange:COMBAT_RANGE,hunterFireCone:.2,defenderDownwardFireAngle:.3,
  aircraftPresentationMuzzleSockets,canFire:()=>true,projectileBudget:{reserve:()=>true},playerJourneyAttempts:new Map(),
  randomUUID:()=>String(++ordinal),projectileDamageForAircraft,ballisticShotSpeed,projectiles,broadcastToCity:()=>{},
 });
 for(const level of ['MEDIUM','HARD','VERY_HARD','LEGENDARY'] as const) {
  let straightHits=0,evasiveHits=0,seed=0x1783ad9;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let attempt=0;attempt<40;attempt++) {
   const shooter={...pilot(),aircraftType:'trainer',cityId:'dallas',rotation:{x:0,y:0,z:.3}};
   const target={...pilot(),aircraftType:'trainer',position:{x:0,y:950,z:-1200},velocity:{x:60,y:0,z:-400}};
   const solution=ctx.botFireSolution(shooter,target,false);assert.equal(solution.reason,undefined);
   const aim=opponentAim(enemyAiLevels[level],solution.aimX,solution.aimY,random);
   projectiles.clear();assert.equal(ctx.createProjectile('enemy',shooter,undefined,undefined,aim),true);
   const shot=[...projectiles.values()][0]!;
   assert.equal(shot.damage,25);assert.equal(shot.mode,'ballistic');
   for(const evasive of [false,true]) {
    const targetPosition={...target.position},velocity={...target.velocity};let previous={...shot.position};
    for(let time=.01;time<COMBAT_RANGE/shot.speed;time+=.01) {
     if(evasive&&time>.2){const yaw=.006,x=velocity.x*Math.cos(yaw)-velocity.z*Math.sin(yaw);velocity.z=velocity.x*Math.sin(yaw)+velocity.z*Math.cos(yaw);velocity.x=x;}
     targetPosition.x+=velocity.x*.01;targetPosition.z+=velocity.z*.01;
     const end={x:shot.position.x+shot.direction.x*shot.speed*time,y:shot.position.y+shot.direction.y*shot.speed*time,z:shot.position.z+shot.direction.z*shot.speed*time};
     if(projectileImpactFraction(previous,end,targetPosition,velocity,.01,aircraftHitRadii.trainer*1.6+.65)!==null){if(evasive)evasiveHits++;else straightHits++;break;}
     previous=end;
    }
   }
  }
  t.diagnostic(`${level}: production shots hit straight ${straightHits}/40, evasive ${evasiveHits}/40`);
  assert.ok(straightHits>0);assert.ok(evasiveHits<straightHits);
 }
});

test('fast combat updates select Legendary combat only; runway, patrol and other levels retain their original cadence',()=>{
 const visits:string[]=[];let trainingTicks=0;
 const actor=(id:string,phase:string,expert:boolean)=>({isBot:true,skyDuelPracticeOwnerId:'pilot',skyDuelMatchId:id,bot:{phase,opponent:{profile:{tactics:{expert}}}}});
 const ctx=production(['updateBots','isHunterCombatPhase'],{
  players:new Map([['expert',actor('expert','attackPass',true)],['runway',actor('runway','takeoff',true)],['medium',actor('medium','attackPass',false)]]),
  playerJourneyAttempts:new Map(),updateTrainingTargets:()=>trainingTicks++,botTickMs:200,
  skyDuelSessions:{get:(id:string)=>{visits.push(id);return{phase:'loading'};}},
 });
 ctx.updateBots(1000);assert.deepEqual(visits,['runway','medium']);assert.equal(trainingTicks,1);
 visits.length=0;ctx.updateBots(1050,true);assert.deepEqual(visits,['expert']);assert.equal(trainingTicks,1);
});

import { AIM_ENVELOPE } from '../../shared/protocol.mjs';
test('Legendary uses the existing legal weapon cone for predictive shots while lower levels keep their current cone',()=>{
 const ctx=production(['botFireSolution','rotateLocalYxz','forwardDirection','hunterForward'],{
  smoothHunter:()=>true,hunterBallisticSolution,aircraftFlightEnvelope,AIM_ENVELOPE,
  muzzleTransform:(p:ReturnType<typeof pilot>)=>({position:p.position}),
  normalize:(v:{x:number;y:number;z:number})=>{const n=Math.hypot(v.x,v.y,v.z);return{x:v.x/n,y:v.y/n,z:v.z/n};},
  dot:(a:any,b:any)=>a.x*b.x+a.y*b.y+a.z*b.z,hunterFireRange:COMBAT_RANGE,hunterFireCone:.2,defenderDownwardFireAngle:.3,
 });
 const target={...pilot(),position:{x:600,y:900,z:-1200},velocity:{x:0,y:0,z:-400}};
 const shooter={...pilot(),bot:{opponent:{profile:enemyAiLevels.LEGENDARY,tactics:{targetTurnRate:0}}}};
 const expert=ctx.botFireSolution(shooter,target,false);assert.equal(expert.reason,undefined);assert.ok(expert.angle<=AIM_ENVELOPE);
 assert.equal(ctx.botFireSolution({...shooter,bot:{opponent:{profile:enemyAiLevels.HARD}}},target,false).reason,'NO_FORWARD_SOLUTION');
 target.position={x:2000,y:900,z:0};assert.equal(ctx.botFireSolution(shooter,target,false).reason,'NO_FORWARD_SOLUTION');
});

test('Sky Duel can pursue outside Journey airspace; authored Journey opponents retain their arena guard',()=>{
 const p={...pilot(),cityId:'dallas',lifeState:'alive'},target={...pilot(),position:{x:-30000,y:900,z:5000}};
 const opponent=createOpponent({aircraft:'privateJet',level:'LEGENDARY',cityId:'dallas',position:p.position,rotation:p.rotation,speed:400,health:100,behavior:'attack'});
 const bot={...motion(),opponent,personality:'hunter',phase:'approach',combatTargetId:'pilot',journeyTargetPlayerId:'pilot',journeyProvoked:true};
 let clears=0;
 const ctx=production(['hunterNavigationTarget','isHunterCombatPhase'],{
  players:new Map([['pilot',target]]),hunterTarget:()=>['pilot',target],planOpponentTactics,opponentReactionReady:()=>true,
  projectiles:new Map(),botFireSolution:()=>({reason:'NO_FORWARD_SOLUTION'}),botCruiseFactor:()=>.7,
  insideJourneyHunterArena:()=>false,boundJourneyHunterPoint:(p:unknown)=>p,clearHunterCombat:()=>clears++,
  safeBotWaypoint:(_city:unknown,_from:unknown,p:unknown)=>p,botSafeFloor:()=>100,hunterClearance:()=>600,aircraftFlightEnvelope,
 });
 const duel=ctx.hunterNavigationTarget('hunter',{...p,skyDuelPracticeOwnerId:'pilot'},bot,500);
 assert.ok(duel.target);assert.equal(clears,0);
 const journey=ctx.hunterNavigationTarget('hunter',p,{...bot,journeyAttemptId:'mission'},1000);
 assert.equal(journey.target,undefined);assert.equal(clears,1);
});

test('Legendary lead and swept hits share the accepted movement clock without enlarging the hitbox',()=>{
 const origin={x:0,y:900,z:0},shooterVelocity={x:0,y:0,z:-400},accepted={x:0,y:900,z:-1200},v={x:200,y:0,z:-100};
 assert.deepEqual(hunterObservedPosition(accepted,v,1000,1200),{x:30,y:900,z:-1215});
 assert.equal(hunterObservedPosition(accepted,v,1200,1000),accepted);
 assert.equal(hunterObservedPosition(accepted,v,undefined,1000),accepted);
 let correctedHits=0,oldAimHits=0;
 for(const age of [20,40,60,80]) {
  const current=hunterObservedPosition(accepted,v,1000,1000+age);
  for(const corrected of [false,true]) {
   const shot=hunterBallisticSolution(origin,shooterVelocity,corrected?current:accepted,v)!;assert.ok(shot);
   let previous={...origin};
   for(let t=.01;t<COMBAT_RANGE/shot.speed;t+=.01) {
    const end={x:origin.x+shot.direction.x*shot.speed*t,y:origin.y+shot.direction.y*shot.speed*t,z:origin.z+shot.direction.z*shot.speed*t};
    const now=1000+age+t*1000,sampleAt=1000+Math.floor((now-1000)/100)*100;
    const sample={x:accepted.x+v.x*(sampleAt-1000)/1000,y:900,z:accepted.z+v.z*(sampleAt-1000)/1000};
    const observed=hunterObservedPosition(sample,v,sampleAt,now);
    const actual={x:current.x+v.x*t,y:900,z:current.z+v.z*t};
    assert.ok(Math.hypot(observed.x-actual.x,observed.z-actual.z)<.00001);
    if(projectileImpactFraction(previous,end,observed,v,.01,aircraftHitRadii.trainer*1.6+.65)!==null){if(corrected)correctedHits++;else oldAimHits++;break;}
    previous=end;
   }
  }
 }
 assert.equal(correctedHits,4);assert.ok(oldAimHits<correctedHits);
});
