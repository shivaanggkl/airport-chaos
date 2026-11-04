import {journeyDallas17} from '../../shared/journey-mission.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import vm from 'node:vm';
import {journeyDallas16 as mission,journeyDallas15,journeyDallas13,journeyDallas14,journeyDallas23,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import {projectileDamageForAircraft,ballisticShotSpeed,COMBAT_RANGE,AIM_ENVELOPE} from '../../shared/protocol.mjs';
import {CrossfireFireCoordinator} from './journey-crossfire.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {hunterBallisticSolution} from './hunter-flight.js';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {projectileImpactFraction} from '../../shared/projectile-collision.mjs';
import {createOpponent,opponentAim} from './opponent.js';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {recordOpponentHit,recordOpponentDamage} from './opponent-tactics.js';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
function runtime(names,context){const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');const ctx=vm.createContext({journeyDallas17,recordOpponentHit,recordOpponentDamage,...context});vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'double-threat-')),path=join(dir,'p.sqlite'),db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");const store=new JourneyAttemptStore(path);db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)').run('pilot',journeyDallas15.id,'m9',1);return{dir,path,db,store};}
function assigned(f,at=1000){const a=f.store.launch('pilot','trainer',at,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignCrossfireHunter('pilot',a.attemptId,'one',1);f.store.assignCrossfireHunter('pilot',a.attemptId,'two',2);return a;}

test('displayed M10 preserves identity, DFW entry, two appearances, health and distinct 10–12km bearings',()=>{
 assert.equal(journeyMissionSlot(mission.id),10);assert.equal(mission.startAirportId,'dfw');assert.equal(mission.name,'DOUBLE THREAT');assert.equal(mission.enemyHealth/projectileDamageForAircraft('trainer'),4);assert.equal(mission.gates.length,0);
 const dfw=cityAirports.dallas.find(a=>a.id==='dfw');assert.deepEqual(mission.enemies.map(e=>[e.aircraft,e.livery]),[['privateJet','nightowl-sunset-red'],['trainer','bluejay-skybolt']]);
 for(const e of mission.enemies){assert.ok(Math.hypot(e.x-dfw.x,e.z-dfw.z)>=10000&&Math.hypot(e.x-dfw.x,e.z-dfw.z)<=12000);assert.ok(e.altitude>=600&&e.altitude<=900);}
});

test('manual takeoff clock, no gate completion, two distinct kills, deadline and once-only reward',()=>{
 const f=fixture();try{const a=assigned(f);assert.equal(f.store.get('pilot',a.attemptId).startedAt,null);assert.equal(f.store.assignCrossfireHunter('pilot',a.attemptId,'duplicate',1),undefined);assert.equal(f.store.acceptGate('pilot',a.attemptId,0,1500),undefined);assert.equal(f.store.completeHunter('pilot',a.attemptId,'one',1500),undefined);
 const start=f.store.startDoubleThreat('pilot',a.attemptId,2000);assert.equal(start.deadlineAt,302000);assert.equal(f.store.startDoubleThreat('pilot',a.attemptId,2100),undefined);assert.equal(f.store.completeHunter('outsider',a.attemptId,'one',2200),undefined);assert.equal(f.store.completeHunter('pilot',a.attemptId,'wrong',2200),undefined);
 assert.equal(f.store.completeHunter('pilot',a.attemptId,'one',2500).status,'RACING');assert.equal(f.store.get('pilot',a.attemptId).crossfireKills,1);assert.equal(f.store.completeHunter('pilot',a.attemptId,'one',2600),undefined);assert.equal(f.store.progress('pilot',mission.id).completed,false);
 assert.equal(f.store.completeHunter('pilot',a.attemptId,'two',3000).firstClearCredits,2100);assert.equal(f.store.completeHunter('pilot',a.attemptId,'two',3100),undefined);
 const replay=assigned(f,4000);f.store.startDoubleThreat('pilot',replay.attemptId,4500);f.store.completeHunter('pilot',replay.attemptId,'two',4600);assert.equal(f.store.completeHunter('pilot',replay.attemptId,'one',4700).firstClearCredits,0);assert.equal(f.db.prepare('SELECT credits FROM player_profiles').get().credits,2100);
 const late=assigned(f,5000);f.store.startDoubleThreat('pilot',late.attemptId,6000);assert.equal(f.store.completeHunter('pilot',late.attemptId,'one',306000),undefined);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('dynamic firing permission follows useful geometry with hysteresis and safe handoffs, not alternating time',()=>{
 const c=new CrossfireFireCoordinator();c.select([{id:'one',score:1.8},{id:'two',score:1}],1000);assert.equal(c.activeShooterId,'one');assert.equal(c.canInitiate('one',true,1000),true);assert.equal(c.canInitiate('two',true,1000),false);assert.equal(c.canInitiate('one',false,1100),false);assert.equal(c.activeShooterId,'one','lining up does not revoke attack priority');
 c.select([{id:'one',score:1.8},{id:'two',score:1.7}],10000);assert.equal(c.activeShooterId,'one','time alone cannot alternate priority');
 c.select([{id:'two',score:1.9}],10100);assert.equal(c.activeShooterId,null);assert.equal(c.canInitiate('two',true,10500),false);c.select([{id:'two',score:1.9}],11000);assert.equal(c.activeShooterId,'two');assert.equal(c.canInitiate('one',true,11000),false);
 c.revoke('two',11100);assert.equal(c.canInitiate('one',true,12000),true);assert.equal(c.canInitiate('two',true,12000),false);
});

test('outdated active Crossfire attempts retire safely, while completion receipts and fresh retries survive',()=>{
 const f=fixture();try{const old=assigned(f);f.db.prepare('UPDATE journey_attempts SET definition_revision=0 WHERE attempt_id=?').run(old.attemptId);new JourneyAttemptStore(f.path);assert.equal(f.store.get('pilot',old.attemptId).failureReason,'MISSION_UPDATED');assert.equal(f.store.progress('pilot',journeyDallas15.id).completed,true);
 const retry=f.store.launch('pilot','trainer',5000,mission.id);assert.equal(retry.targetId,null);assert.equal(retry.secondaryTargetId,null);assert.equal(retry.crossfireKills,0);assert.equal(retry.deadlineAt,null);f.store.fail('pilot',retry.attemptId,'CRASHED',6000);assert.equal(f.store.completeHunter('pilot',retry.attemptId,'one',6500),undefined);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('production damage requires four Bluejay hits per enemy and settles only after the second destruction',()=>{
 const f=fixture();try{const a=assigned(f);f.store.startDoubleThreat('pilot',a.attemptId,2000);const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,score:0,aircraftType:'trainer'};
 const make=type=>({entityType:'player',cityId:'dallas',lifeState:'alive',isBot:true,score:0,health:100,spawnProtectedUntil:0,aircraftType:type,position:{x:-13000,y:1000,z:-18000},bot:{journeyCrossfire:true,journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyProvoked:true}});
 const enemies=[make('privateJet'),make('trainer')],players=new Map([['owner',pilot],['one',enemies[0]],['two',enemies[1]]]),packets=[],updates=[];
 const ctx=runtime(['applyCombatHit','transportEscortHealth'],{journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas23,journeyDallas16:mission,players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyDfwTakeoff:new Set(['owner']),playerJourneyRunwayPrep:new Set(),crossfireDefeatedHunters:new Map(),crossfireFireCoordinators:new Map([[a.attemptId,new CrossfireFireCoordinator()]]),crossfireHunterMotion:new Map(),runwayCombatProtected:()=>false,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena:()=>true,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),sendToPlayer:(_id,p)=>packets.push(p),sendJourneyState:(_id,a)=>updates.push(a.crossfireKills),provokeJourneyHunter:()=>{},markPlayerDestroyed:(_id,p)=>p.lifeState='destroyed',isHumanPilot:()=>false,botKillRewardMultiplier:.1,persistScore:()=>{},broadcastToCity:()=>assert.fail('private actor leaked'),broadcastLeaderboard:()=>{},removeBot:id=>players.delete(id),updateKing:()=>{},cityKings:new Map(),handleWantedDestruction:()=>{},challengeForPlayer:()=>undefined});
 for(const [index,id] of ['one','two'].entries())for(let hit=1;hit<=4;hit++){assert.equal(ctx.applyCombatHit('owner',id,'dallas',3000+index*3000+hit*500,25),true);assert.equal(enemies[index].health,100-hit*25);assert.equal(f.store.get('pilot',a.attemptId).status,index===1&&hit===4?'COMPLETED':'RACING');}
 assert.equal(f.store.get('pilot',a.attemptId).firstClearCredits,2100);assert.equal(players.has('one')||players.has('two'),false);assert.equal(packets.filter(p=>p.type==='damage').length,8);assert.equal(updates.length,8,'both targets must refresh authoritative HUD health after every hit');
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('production factory creates two correctly painted HARD aircraft, and aggression latches only after takeoff within 10km',()=>{
 const players=new Map(),sent=[];
 const ctx=runtime(['createBot','botStateMessage','transportEscortHealth','transportEscortCosmetics'],{
  smoothHunter:()=>true,createOpponent:(definition)=>{assert.equal(definition.level,'HARD');return createOpponent(definition);},journeyDallas16:mission,journeyDallas13,journeyDallas14,players,nextBotSerial:1,botNames:['Enemy'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint:p=>p,botTerrainHeight:()=>120,botRunwayHeight:()=>120,safeBotWaypoint:(_c,_f,p)=>p,sendToPlayer:(_id,p)=>sent.push(p),broadcastToCity:()=>assert.fail('private enemy leaked'),aircraftFlightEnvelope,
 });
 for(const ordinal of [1,2]){const id=ctx.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'owner',target:{position:{x:0,y:0,z:0},rotation:{y:0}},crossfireOrdinal:ordinal});const enemy=players.get(id),config=mission.enemies[ordinal-1];assert.equal(enemy.aircraftType,config.aircraft);assert.equal(enemy.health,100);assert.equal(enemy.position.y,120+config.altitude);assert.equal(enemy.bot.opponent.profile,enemyAiLevels.HARD);assert.equal(sent.at(-1).equippedCosmetics[`livery:${config.aircraft}`],config.livery);assert.ok(Math.hypot(enemy.velocity.x,enemy.velocity.z)>0);}
 const pilot={pilotId:'pilot',lifeState:'alive',position:{x:-22800,y:120,z:-13600}},ids=[...players.keys()],a={missionId:mission.id,attemptId:'attempt',status:'APPROACH',targetId:ids[0],secondaryTargetId:ids[1],crossfireKills:0};let activations=0;
 const logic=runtime(['ensureJourneyCrossfire'],{journeyDallas16:mission,players,crossfireFireCoordinators:new Map(),CrossfireFireCoordinator,COMBAT_RANGE:4500,hunterForward:p=>({x:-Math.sin(p.rotation.y),y:0,z:-Math.cos(p.rotation.y)}),botFireSolution:()=>({reason:'NO_FORWARD_SOLUTION'}),provokeJourneyHunter:(_id,_pilot,id)=>{players.get(id).bot.journeyProvoked=true;activations++;},failPlayerJourney:()=>assert.fail('unexpected failure')});
 logic.ensureJourneyCrossfire('owner',pilot,a,1000);assert.equal(activations,0);a.status='RACING';logic.ensureJourneyCrossfire('owner',pilot,a,2000);assert.equal(activations,0);
 pilot.position={...players.get(ids[0]).position,x:players.get(ids[0]).position.x-9999};logic.ensureJourneyCrossfire('owner',pilot,a,3000);assert.ok(activations>=1);const first=activations;pilot.position.x-=20000;logic.ensureJourneyCrossfire('owner',pilot,a,4000);assert.equal(activations,first);assert.equal(players.get(ids[0]).bot.journeyProvoked,true);
});

test('exit cleanup removes both owned aircraft, shooter permissions and projectiles without touching unrelated actors',()=>{
 const attempt={missionId:mission.id,attemptId:'attempt',targetId:'one',secondaryTargetId:'two'},owner={assistedAim:{},aimSamples:[]},players=new Map([['owner',owner],['one',{bot:{journeyAttemptId:'attempt'}}],['two',{bot:{journeyAttemptId:'attempt'}}],['other',{bot:{journeyAttemptId:'unrelated'}}]]),coordinators=new Map([['attempt',new CrossfireFireCoordinator()]]),removedShots=[];
 const ctx=runtime(['removeJourneyHunter'],{players,playerJourneyAttempts:new Map([['owner','attempt']]),setServerLock:()=>{},removePlayerProjectiles:id=>removedShots.push(id),journeyDallas07:{},journeyDallas08:{},journeyDallas09:{},journeyDallas10:{},journeyDallas11:{},journeyDallas12:{},journeyDallas19:{},journeyDallas18:{},journeyDallas23:{},journeyDallas24:{},doubleHunterMotion:new Map(),crossfireFireCoordinators:coordinators,crossfireDefeatedHunters:new Map(),crossfireHunterMotion:new Map(),removeBot:id=>players.delete(id)});
 ctx.removeJourneyHunter(attempt);assert.equal(players.has('one')||players.has('two'),false);assert.equal(players.has('other'),true);assert.equal(coordinators.has('attempt'),false);assert.deepEqual(removedShots,['owner']);
});

test('both HARD aircraft produce real forward ballistic hits against a moving Bluejay; evading after launch can miss',()=>{
 const normalize=v=>{const n=Math.hypot(v.x,v.y,v.z);return{x:v.x/n,y:v.y/n,z:v.z/n};},dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const ctx=runtime(['botFireSolution','muzzleTransform','rotateLocalYxz','forwardDirection','hunterForward'],{aircraftPresentationMuzzleSockets,aircraftFlightEnvelope,AIM_ENVELOPE,hunterBallisticSolution,smoothHunter:()=>true,runwayCombatProtected:()=>false,hunterFireCone:.2,hunterFireRange:COMBAT_RANGE,defenderDownwardFireAngle:.3,normalize,dot});
 for(const config of mission.enemies){
  const shooter={aircraftType:config.aircraft,position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-500},bot:{opponent:{profile:enemyAiLevels.HARD}}};
  const target={aircraftType:'trainer',position:{x:0,y:1000,z:-1200},rotation:{x:0,y:0,z:0},velocity:{x:100,y:0,z:-300}};
  const solution=ctx.botFireSolution(shooter,target,false);assert.equal(solution.reason,undefined);
  const aim=opponentAim(enemyAiLevels.HARD,solution.aimX,solution.aimY,()=>.6),direction=normalize(ctx.rotateLocalYxz({x:aim.x,y:aim.y,z:-1},shooter.rotation)),origin=ctx.muzzleTransform(shooter).position,speed=ballisticShotSpeed(shooter.velocity,direction);
  const hit=evasive=>{let previous={...origin},p={...target.position},v={...target.velocity};for(let t=.01;t<COMBAT_RANGE/speed;t+=.01){if(evasive&&t>.15){const x=v.x*Math.cos(.008)-v.z*Math.sin(.008);v.z=v.x*Math.sin(.008)+v.z*Math.cos(.008);v.x=x;}p={x:p.x+v.x*.01,y:p.y,z:p.z+v.z*.01};const end={x:origin.x+direction.x*speed*t,y:origin.y+direction.y*speed*t,z:origin.z+direction.z*speed*t};if(projectileImpactFraction(previous,end,p,v,.01,4.49)!==null)return true;previous=end;}return false;};
  assert.equal(hit(false),true,`${config.aircraft} can hit a genuinely moving target`);assert.equal(hit(true),false,'post-launch evasion does not redirect bullets');
 }
});
