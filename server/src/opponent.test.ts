import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { enemyAiLevels, enemyAiProfile, skyHuntersDifficulty, type EnemyAiLevel } from '../../shared/enemy-ai.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { ballisticShotSpeed, fireIntervalMs } from '../../shared/protocol.mjs';
import { airAssaultManifest, airAssaultTiers } from '../../shared/air-assault.mjs';
import { createOpponent, opponentAim, opponentReactionReady, opponentDodge, incomingOpponentThreat, hasClientOpponentOverride, type OpponentDefinition } from './opponent.js';
import { advanceHunterFlight, hunterBallisticSolution } from './hunter-flight.js';
import { AirAssaultEncounter } from './air-assault.js';
const definition: OpponentDefinition={aircraft:'trainer',level:'MEDIUM',cityId:'dallas',position:{x:-14000,y:1000,z:-10000},rotation:{x:0,y:0,z:0},speed:400,health:150,behavior:'pursuit',ownerId:'pilot',encounterId:'test'};
const levels=Object.keys(enemyAiLevels) as EnemyAiLevel[];

test('exactly five immutable canonical levels, future chapter defaults and no hull/aircraft entitlements',()=>{
 assert.deepEqual(levels,['EASY','MEDIUM','HARD','VERY_HARD','LEGENDARY']);
 assert.deepEqual(Object.values(enemyAiLevels).map(p=>[p.reactionMs,p.trackingMs,p.shotIntervalMs,p.aimError,p.dodgeCooldownMs]),[[900,1400,900,.014,9000],[600,1050,650,.009,6500],[400,750,450,.006,4500],[280,550,325,.004,3300],[45,100,165,.000625,1200]]);
 for(const level of levels) {assert.equal(enemyAiProfile(level),enemyAiLevels[level]);assert.ok(Object.isFrozen(enemyAiLevels[level]));}
 assert.ok(Object.isFrozen(enemyAiLevels));assert.equal(skyHuntersDifficulty[7],'EASY');assert.equal(skyHuntersDifficulty[8],'MEDIUM');assert.equal(skyHuntersDifficulty[12],'LEGENDARY');
 for(const [tier,level] of [['medium','MEDIUM'],['hard','HARD'],['legendary','LEGENDARY']] as const) assert.equal(airAssaultTiers[tier].ai,enemyAiLevels[level]);
});

test('4 aircraft × 5 levels × every compatible livery including premium and retired remain physically identical',()=>{
 for(const aircraft of Object.keys(aircraftFlightEnvelope) as OpponentDefinition['aircraft'][]) {
  for(const level of levels) for(const livery of cosmeticCatalog.filter(c=>c.aircraftRestriction===aircraft)) {
   const config=createOpponent({...definition,aircraft,level,livery:livery.id});
   assert.equal(config.cosmetics[`livery:${aircraft}`],livery.id);assert.equal(config.profile,enemyAiLevels[level]);assert.equal(config.definition.health,150);
   const p={aircraftType:aircraft,position:{...definition.position},rotation:{...definition.rotation},velocity:{x:0,y:0,z:-400}};
   const motion={speed:400,bankControl:0,combatTurnSign:1};const envelope=aircraftFlightEnvelope[aircraft];
   for(let i=0;i<60;i++) {
    const previous={...p.position},yaw=p.rotation.y;
    advanceHunterFlight(p,motion,{x:-17000,y:1400,z:-17000},500,.05,()=>200);
    assert.ok(motion.speed<=envelope.maxSpeed);assert.ok(Math.hypot(p.velocity.x,p.velocity.z)>100);
    assert.ok(Math.abs(Math.atan2(Math.sin(p.rotation.y-yaw),Math.cos(p.rotation.y-yaw)))<=.05*(envelope.yawRate/envelope.inertia+envelope.bankTurn)+1e-8);
    assert.ok(Math.abs(p.position.y-previous.y)<=motion.speed*Math.sin(envelope.maxClimbPitch)*.05+1e-5);
   }
  }
 }
});

test('invalid aircraft, city, level, cosmetic, hull, runway and client override are rejected without substitution',()=>{
 for(const patch of [{aircraft:'fake'},{level:'IMPOSSIBLE'},{cityId:'fake'},{livery:'nope'},{livery:'firehawk-inferno'},{health:NaN},{speed:-1},{airportId:'fake'},{ownerId:undefined},{position:{x:NaN,y:1,z:2}},{position:{x:1e9,y:1000,z:0}}]) assert.throws(()=>createOpponent({...definition,...patch} as OpponentDefinition));
 assert.equal(hasClientOpponentOverride({type:'state',difficulty:'LEGENDARY'}),true);
 assert.equal(hasClientOpponentOverride({type:'configure',opponentConfig:definition}),true);
 assert.equal(hasClientOpponentOverride({type:'state',position:{x:0,y:1,z:2}}),false);
 assert.equal(hasClientOpponentOverride(null),false);
});

test('reaction, independent bounded angular dispersion, tracking and legal shot opportunity improve monotonically',()=>{
 let previousReaction=Infinity,previousShots=0,previousTrack=Infinity;
 for(const level of levels) {
  const r=createOpponent({...definition,level});
  assert.equal(opponentReactionReady(r,'target',1000),false);
  assert.equal(opponentReactionReady(r,'target',1000+r.profile.reactionMs-1),false);
  assert.equal(opponentReactionReady(r,'target',1000+r.profile.reactionMs),true);
  assert.equal(opponentReactionReady(r,'new-target',5000),false);
  const values=[0,1];const aim=opponentAim(r.profile,.1,-.2,()=>values.shift()!);
  assert.ok(Math.abs(Math.atan(aim.x)-Math.atan(.1)+r.profile.aimError)<1e-10);
  assert.ok(Math.abs(Math.atan(aim.y)-Math.atan(-.2)-r.profile.aimError)<1e-10);
  const shots=Math.floor((20000-r.profile.reactionMs)/Math.max(fireIntervalMs('trainer'),r.profile.shotIntervalMs));
  assert.ok(r.profile.reactionMs<previousReaction);assert.ok(r.profile.trackingMs<previousTrack);assert.ok(shots>=previousShots);
  previousReaction=r.profile.reactionMs;previousShots=shots;previousTrack=r.profile.trackingMs;
 }
});

// Real fixed-velocity server ballistic trajectories; changing the target after launch never redirects a bullet.
function hits(level:EnemyAiLevel,evasive:boolean):number {
 const target={x:0,y:900,z:-1200},velocity={x:220,y:0,z:-250},origin={x:0,y:900,z:0},shooterVelocity={x:0,y:0,z:-400};
 const solution=hunterBallisticSolution(origin,shooterVelocity,target,velocity)!;assert.ok(solution);
 const sx=solution.direction.x/-solution.direction.z,sy=solution.direction.y/-solution.direction.z;
 let hits=0;
 for(let i=0;i<20;i++)for(let j=0;j<20;j++) {
  const samples=[(i+.5)/20,(j+.5)/20];const aim=opponentAim(enemyAiLevels[level],sx,sy,()=>samples.shift()!);
  const length=Math.hypot(aim.x,aim.y,1),direction={x:aim.x/length,y:aim.y/length,z:-1/length};
  const speed=ballisticShotSpeed(shooterVelocity,direction);const p={...target};let vx=velocity.x,vz=velocity.z;
  for(let time=.005;time<3;time+=.005) {
   if(evasive&&time>.15){const a=.8*.005,nx=vx*Math.cos(a)-vz*Math.sin(a);vz=vx*Math.sin(a)+vz*Math.cos(a);vx=nx;}
   p.x+=vx*.005;p.z+=vz*.005;
   if(Math.hypot(direction.x*speed*time-p.x,origin.y+direction.y*speed*time-p.y,direction.z*speed*time-p.z)<=6){hits++;break;}
  }
 }
 return hits;
}
test('all five levels hit a moving straight player with real shots, higher accuracy improves hits, evasive flight remains effective',()=>{
 let previous=-1;
 for(const level of levels){const straight=hits(level,false),evasive=hits(level,true);assert.ok(straight>0,`${level} straight hits`);assert.ok(straight>=previous,`${level} monotonic hits`);assert.ok(evasive<straight,`${level} evasion works`);previous=straight;}
});

test('predicted dodges follow the same aircraft integrator and require a genuine incoming trajectory',()=>{
 const enemy={position:{x:0,y:1000,z:0},velocity:{x:0,y:0,z:-400},rotation:{x:0,y:0,z:0}};
 const bullet={position:{x:0,y:1000,z:-1000},direction:{x:0,y:0,z:1},speed:600};
 assert.ok(incomingOpponentThreat(enemy,[bullet]));
 assert.equal(incomingOpponentThreat(enemy,[{...bullet,direction:{x:0,y:0,z:-1}}]),undefined);
 for(const aircraft of Object.keys(aircraftFlightEnvelope) as OpponentDefinition['aircraft'][]) assert.ok(opponentDodge(aircraft,enemy,400,[bullet],()=>100));
});

test('Air Assault alternate authored appearances use common opponents without changing its roster or hull rules',()=>{
 const manifest=airAssaultManifest();
 const encounter=new AirAssaultEncounter('dallas','owner',{elevation:()=>100,activate(){},move(){},remove(){},fire:()=>false,bullets:()=>[],heal(){},finish:()=>({reward:0,dailyClaimed:false})},0,
  manifest.map((row,i)=>({...row,aircraft:i%2?'cargo':'trainer',livery:i%2?'mammoth-sand':'bluejay-aurora'})));
 assert.equal(encounter.enemies.length,30);
 for(const enemy of encounter.enemies){assert.equal(enemy.opponent.profile,airAssaultTiers[enemy.tier].ai);assert.equal(enemy.health,airAssaultTiers[enemy.tier].health);assert.equal(enemy.aircraftType,enemy.opponent.definition.aircraft);}
 const source=readFileSync('server/src/index.ts','utf8');
 assert.ok(source.includes("level:'LEGENDARY',cityId:'dallas'"));assert.ok(source.includes("'EASY' : 'MEDIUM'"));
 assert.ok(source.includes('hasClientOpponentOverride(message)'));
});

test('production broadcasts keep Journey actors private and suppress unrelated aircraft for focused pilots',async()=>{
 const ts=await import('typescript');const vm=await import('node:vm');
 const ast=ts.createSourceFile('index.ts',readFileSync('server/src/index.ts','utf8'),ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='broadcastToCity')!;
 const sent:Array<[string,object]>=[];
 const players=new Map<string,object>([['pilot',{cityId:'dallas'}],['other',{cityId:'dallas'}],['public',{cityId:'dallas'}],['enemy',{cityId:'dallas',isBot:true,bot:{journeyAttemptId:'a',journeyTargetPlayerId:'pilot'}}]]);
 const clients=new Set(['pilot-socket','other-socket','public-socket']);
 const context={players,server:{clients},playerSockets:new Map([['pilot-socket','pilot'],['other-socket','other'],['public-socket','public']]),
  playerJourneyAttempts:new Map([['pilot','a'],['other','b']]),missionFocusedPlayers:new Set(['pilot','other']),
  allowedFocusedBot:(enemy:string,pilot:string)=>enemy==='enemy'&&pilot==='pilot',
  encodeSocketMessage:(m:object)=>m,sendToPlayer:(id:string,m:object)=>sent.push([id,m]),sendEncodedSocketMessage:(id:string,m:object)=>sent.push([id,m])};
 vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+"\nbroadcastToCity('dallas',{type:'state',playerId:'enemy'});",context);
 assert.deepEqual(sent.map(v=>v[0]),['pilot']);sent.length=0;
 vm.runInNewContext("broadcastToCity('dallas',{type:'state',playerId:'public'});",context);
 assert.deepEqual(sent.map(v=>v[0]),['public-socket']);sent.length=0;
 vm.runInNewContext("broadcastToCity('dallas',{type:'state',playerId:'pilot'});",context);
 assert.deepEqual(sent.map(v=>v[0]),['pilot']);
});
