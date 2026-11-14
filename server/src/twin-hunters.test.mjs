import {journeyDallasTerritoryDefense01} from '../../shared/journey-mission.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {journeyCrossfireMission,journeyDallasTwinHunters01} from '../../shared/journey-mission.mjs';
import {journeyDallas18} from '../../shared/journey-mission.mjs';
import {journeyDallas17} from '../../shared/journey-mission.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import vm from 'node:vm';
import {journeyDallas16 as legacyMission,journeyDallas15,journeyDallas13,journeyDallas14,journeyDallas23,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import {projectileDamageForAircraft} from '../../shared/protocol.mjs';
import {CrossfireFireCoordinator} from './journey-crossfire.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {hunterObservedPosition} from './hunter-flight.js';
import {createOpponent} from './opponent.js';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {recordOpponentHit,recordOpponentDamage} from './opponent-tactics.js';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
function runtime(names,context){const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');const ctx=vm.createContext({journeyDallasTerritoryDefense01,journeyCrossfireMission,journeyDallasTwinHunters01,journeyDallas18,journeyDallas17,hunterObservedPosition,recordOpponentHit,recordOpponentDamage,...context});vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;}

const mission=journeyDallasTwinHunters01;
function fixture(){const dir=mkdtempSync(join(tmpdir(),'twin-hunters-')),path=join(dir,'p.sqlite'),db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");const store=new JourneyAttemptStore(path,true);return{dir,path,db,store};}
function assigned(f,at=1000){const a=f.store.launch('pilot','trainer',at,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignCrossfireHunter('pilot',a.attemptId,'one',1);f.store.assignCrossfireHunter('pilot',a.attemptId,'two',2);return a;}

test('M15 GO clock, no gate completion, two distinct kills, deadline and once-only reward',()=>{
 const f=fixture();try{const a=assigned(f);assert.equal(f.store.get('pilot',a.attemptId).startedAt,null);assert.equal(f.store.assignCrossfireHunter('pilot',a.attemptId,'duplicate',1),undefined);assert.equal(f.store.acceptGate('pilot',a.attemptId,0,1500),undefined);assert.equal(f.store.completeHunter('pilot',a.attemptId,'one',1500),undefined);
 const start=f.store.startDoubleThreat('pilot',a.attemptId,2000);assert.equal(start.deadlineAt,242000);assert.equal(f.store.startDoubleThreat('pilot',a.attemptId,2100),undefined);assert.equal(f.store.completeHunter('outsider',a.attemptId,'one',2200),undefined);assert.equal(f.store.completeHunter('pilot',a.attemptId,'wrong',2200),undefined);
 assert.equal(f.store.completeHunter('pilot',a.attemptId,'one',2500).status,'RACING');assert.equal(f.store.get('pilot',a.attemptId).crossfireKills,1);assert.equal(f.store.completeHunter('pilot',a.attemptId,'one',2600),undefined);assert.equal(f.store.progress('pilot',mission.id).completed,false);
 assert.equal(f.store.completeHunter('pilot',a.attemptId,'two',3000).firstClearCredits,1500);assert.equal(f.store.completeHunter('pilot',a.attemptId,'two',3100),undefined);
 const replay=assigned(f,4000);f.store.startDoubleThreat('pilot',replay.attemptId,4500);f.store.completeHunter('pilot',replay.attemptId,'two',4600);assert.equal(f.store.completeHunter('pilot',replay.attemptId,'one',4700).firstClearCredits,0);assert.equal(f.db.prepare('SELECT credits FROM player_profiles').get().credits,1500);
 const late=assigned(f,5000);f.store.startDoubleThreat('pilot',late.attemptId,6000);assert.equal(f.store.completeHunter('pilot',late.attemptId,'one',246000),undefined);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('production damage requires eight Bluejay hits per enemy and settles only after the second destruction',()=>{
 const f=fixture();try{const a=assigned(f);f.store.startDoubleThreat('pilot',a.attemptId,2000);const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,score:0,aircraftType:'trainer'};
 const make=type=>({entityType:'player',cityId:'dallas',lifeState:'alive',isBot:true,score:0,health:mission.enemyHealth,spawnProtectedUntil:0,aircraftType:type,position:{x:-13000,y:1000,z:-18000},bot:{journeyCrossfire:true,journeyCrossfireMissionId:mission.id,journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyProvoked:true}});
 const enemies=[make('privateJet'),make('trainer')],players=new Map([['owner',pilot],['one',enemies[0]],['two',enemies[1]]]),packets=[],updates=[];
 const ctx=runtime(['applyCombatHit','transportEscortHealth'],{journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas23,journeyDallas16:legacyMission,players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyDfwTakeoff:new Set(),playerJourneyRunwayPrep:new Set(),crossfireDefeatedHunters:new Map(),crossfireFireCoordinators:new Map([[a.attemptId,new CrossfireFireCoordinator()]]),crossfireHunterMotion:new Map(),runwayCombatProtected:()=>false,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena:()=>true,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),sendToPlayer:(_id,p)=>packets.push(p),sendJourneyState:(_id,a)=>updates.push(a.crossfireKills),provokeJourneyHunter:()=>{},markPlayerDestroyed:(_id,p)=>p.lifeState='destroyed',isHumanPilot:()=>false,botKillRewardMultiplier:.1,persistScore:()=>{},broadcastToCity:()=>assert.fail('private actor leaked'),broadcastLeaderboard:()=>{},removeBot:id=>players.delete(id),updateKing:()=>{},cityKings:new Map(),handleWantedDestruction:()=>{},challengeForPlayer:()=>undefined});
 enemies[0].bot.journeyProvoked=false;assert.equal(ctx.applyCombatHit('owner','one','dallas',2500,25),false,'takeoff alone cannot bypass safe-departure activation');assert.equal(enemies[0].health,mission.enemyHealth);enemies[0].bot.journeyProvoked=true;
 for(const [index,id] of ['one','two'].entries())for(let hit=1;hit<=8;hit++){assert.equal(ctx.applyCombatHit('owner',id,'dallas',3000+index*5000+hit*500,25),true);assert.equal(enemies[index].health,mission.enemyHealth-hit*25);assert.equal(f.store.get('pilot',a.attemptId).status,index===1&&hit===8?'COMPLETED':'RACING');}
 assert.equal(f.store.get('pilot',a.attemptId).firstClearCredits,1500);assert.equal(players.has('one')||players.has('two'),false);assert.equal(packets.filter(p=>p.type==='damage').length,16);assert.equal(updates.length,16,'both targets must refresh authoritative HUD health after every hit');
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('production M15 factory preserves exact already-scaled spawns, cosmetics and individual AI levels',()=>{
 const players=new Map(),sent=[];
 const ctx=runtime(['createBot','botStateMessage','transportEscortHealth','transportEscortCosmetics'],{
  smoothHunter:()=>true,createOpponent:(definition)=>{return createOpponent(definition);},journeyDallas16:legacyMission,journeyDallas13,journeyDallas14,players,nextBotSerial:1,botNames:['Enemy'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint:p=>p,botTerrainHeight:()=>120,botRunwayHeight:()=>120,safeBotWaypoint:(_c,_f,p)=>p,sendToPlayer:(_id,p)=>sent.push(p),broadcastToCity:()=>assert.fail('private enemy leaked'),aircraftFlightEnvelope,botSafeFloor:()=>1300,journeyEscapeHunterClearance:100,
 });
 for(const ordinal of [1,2]){const id=ctx.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'owner',target:{position:{x:0,y:0,z:0},rotation:{y:0}},crossfireOrdinal:ordinal,crossfireMissionId:mission.id});const enemy=players.get(id),config=mission.enemies[ordinal-1];assert.equal(enemy.aircraftType,config.aircraft);assert.equal(enemy.health,mission.enemyHealth);assert.equal(enemy.position.x,config.x);assert.equal(enemy.position.z,config.z);assert.ok(enemy.position.y>=1220+config.altitude);assert.equal(enemy.rotation.y,Math.PI);assert.equal(enemy.bot.opponent.profile,enemyAiLevels[config.level]);assert.equal(sent.at(-1).equippedCosmetics[`livery:${config.aircraft}`],config.livery);assert.ok(Math.hypot(enemy.velocity.x,enemy.velocity.z)>0);}
 assert.equal(players.size,2);
});

test('M15 catalog and M17 configuration remain distinct',()=>{
 assert.equal(journeyMissionSlot(mission.id),15);assert.equal(mission.timeLimitMs,240000);
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'APPROACH'}).showAmbientAIAircraft,false);assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'}).showAmbientAIMarkers,false);assert.equal(missionFocusForAttempt({missionId:mission.id,status:'COMPLETED'}),null);
 assert.equal(mission.enemyHealth,200);assert.deepEqual(mission.enemies.map(e=>e.level),['EASY','MEDIUM']);
 assert.deepEqual(mission.enemies.map(e=>e.fireDelayMs),[6000,8000]);
 assert.equal(mission.airborneSpawn.speed,650);assert.equal(mission.airborneSpawn.heading,Math.PI);
 assert.equal(legacyMission.enemyHealth,300);assert.equal(legacyMission.timeLimitMs,180000);assert.equal(legacyMission.startAirportId,'dfw');
});
test('M15 pause and durable reopen preserve enemy progress and remaining clock',()=>{
 const f=fixture();try{const a=assigned(f);f.store.startDoubleThreat('pilot',a.attemptId,2000);
 f.store.completeHunter('pilot',a.attemptId,'two',3000);
 f.store.pause('pilot',a.attemptId,4000);
 const resumed=f.store.resume('pilot',a.attemptId,9000);assert.equal(resumed.pausedMs,5000);
 const reopened=new JourneyAttemptStore(f.path,true).get('pilot',a.attemptId);
 assert.equal(reopened.crossfireKills,2);assert.equal(reopened.secondaryTargetId,'two');assert.equal(reopened.deadlineAt,247000);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('M15 activates both enemies at GO with independent first-shot safety delays',()=>{
 const f=fixture();try{const a=assigned(f),pilot={pilotId:'pilot'};
 const enemies=new Map(['one','two'].map(id=>[id,{lifeState:'alive',bot:{journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',nextFireAt:0,attackFireAfter:0}}]));
 const ctx=runtime(['provokeJourneyHunter'],{players:enemies,playerJourneyAttempts:new Map([['owner',a.attemptId]]),journeyStore:f.store,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16:legacyMission,journeyDallas19:{id:'19'},journeyDallas25:{id:'25'},journeyDallas21:{id:'21'},journeyDallas22:{id:'22'},journeyDallas23,journeyDallas24:{id:'24'},skyHunterDepartureReady:()=>true,beginHunterApproach:(_p,b)=>{b.nextFireAt=2100;b.attackFireAfter=2100;},sendJourneyState:()=>{}});
 ctx.provokeJourneyHunter('owner',pilot,'one',1500);assert.equal(enemies.get('one').bot.journeyProvoked,undefined);
 f.store.startDoubleThreat('pilot',a.attemptId,2000);
 for(const [i,id] of ['one','two'].entries()){ctx.provokeJourneyHunter('owner',pilot,id,2000);const bot=enemies.get(id).bot;assert.equal(bot.journeyProvoked,true);assert.equal(bot.nextFireAt,2000+mission.enemies[i].fireDelayMs);assert.equal(bot.attackFireAfter,bot.nextFireAt);}
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('M15 intro frames both real aircraft and hands off without changing their transforms',async()=>{
 const THREE=await import('three');const {CombatMissionIntroPath}=await import('../../client/src/mission-combat-intro.ts');
 const group=(x,z)=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(30,8,25)));g.position.set(x,1200,z);g.rotation.y=Math.PI;return g;};
 const player=group(-27000,-40000),one=group(-28900,-35700),two=group(-25100,-35700);
 const path=new CombatMissionIntroPath(one,player,15,false,false,undefined,undefined,false,false,false,undefined,false,two),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(-27000,1250,-40100),chaseTarget=player.position.clone();
 assert.equal(path.durationMs,10000);
 for(let t=0;t<=10000;t+=100){path.sample(t,position,target,chase,chaseTarget);assert.ok([...position,...target].every(Number.isFinite));if(t===5000){const camera=new THREE.PerspectiveCamera(path.fov(t,60),16/9,1,100000);camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();for(const g of [one,two]){const p=g.position.clone().project(camera);assert.ok(Math.abs(p.x)<.9&&Math.abs(p.y)<.9&&p.z<1,'both assigned hunters fit within the reveal');}}}
 assert.ok(position.distanceTo(chase)<1e-8);assert.ok(target.distanceTo(chaseTarget)<1e-8);
 for(const [i,g] of [player,one,two].entries()){g.updateMatrixWorld();if(i===0)continue;assert.equal(g.position.x,mission.enemies[i-1].x);assert.equal(g.position.z,mission.enemies[i-1].z);assert.equal(g.rotation.y,Math.PI);}
 player.children[0].geometry.dispose();one.children[0].geometry.dispose();two.children[0].geometry.dispose();
});

test('M15 verified ad continuation retains defeated hunter and cannot redeem twice',async()=>{
 const {PlayerProfileStore}=await import('./player-profiles.js');const {RewardedAdStore}=await import('./rewarded-ads.js');
 const dir=mkdtempSync(join(tmpdir(),'twin-continue-'));try{const path=join(dir,'p.sqlite'),profiles=new PlayerProfileStore(path);profiles.getOrCreate('pilot','Pilot');const store=new JourneyAttemptStore(path,true),f={store};const a=assigned(f);store.startDoubleThreat('pilot',a.attemptId,2000);store.completeHunter('pilot',a.attemptId,'one',3000);const failure=store.fail('pilot',a.attemptId,'CRASHED',62000);assert.ok(failure);
 assert.equal(store.saveContinuation('pilot',a.attemptId,62000,{position:{x:-27000,y:1100,z:-40000},heading:Math.PI,bots:[]}),true);
 const unit='ca-app-pub-3940256099942544/5224354917',ads=new RewardedAdStore(path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId:unit},webEnabled:false,providerRewardAmount:'1'}),ad=ads.createAttempt('pilot','android',62001,`${a.attemptId}:62000`);assert.equal(ad.ok,true);const id=ad.attempt.attemptId;
 assert.equal(store.continueAfterAd('pilot',a.attemptId,id,62002),undefined);
 assert.equal(ads.grantVerifiedReward({adUnit:unit,customData:id,rewardAmount:'1',rewardItem:'reward',timestamp:62004,transactionId:'twin-ad'},62004).rewarded,true);
 const resumed=store.continueAfterAd('pilot',a.attemptId,id,92000);assert.equal(resumed.crossfireKills,1);assert.equal(resumed.targetId,'one');assert.equal(resumed.secondaryTargetId,'two');assert.equal(resumed.deadlineAt-92000,240000);assert.equal(store.continueAfterAd('pilot',a.attemptId,id,92001),undefined);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('M15 insertion preserves earned M17 access and new progression unlocks M16',()=>{
 const f=fixture();try{
  const complete=f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)');
  complete.run('pilot','journey-dallas-05','old-clear',1);
  f.db.prepare('DELETE FROM journey_catalog_versions WHERE version=?').run(mission.id.replace('journey-',''));
  const store=new JourneyAttemptStore(f.path);
  assert.equal(store.canAccessMission('pilot',legacyMission.id),true,'earned Double Threat access survives insertion');
  f.db.prepare('INSERT INTO player_profiles VALUES(?,?,?)').run('new-pilot',0,0);
  complete.run('new-pilot','journey-dallas-05','new-clear',2);
  assert.equal(store.canAccessMission('new-pilot',mission.id),true);
  assert.equal(store.canAccessMission('new-pilot',legacyMission.id),false);
  const a=store.launch('new-pilot','trainer',1000,mission.id);store.approach('new-pilot',a.attemptId);
  store.assignCrossfireHunter('new-pilot',a.attemptId,'one',1);store.assignCrossfireHunter('new-pilot',a.attemptId,'two',2);
  store.startDoubleThreat('new-pilot',a.attemptId,2000);store.completeHunter('new-pilot',a.attemptId,'one',3000);store.completeHunter('new-pilot',a.attemptId,'two',4000);
  assert.equal(store.canAccessMission('new-pilot',journeyDallasTerritoryDefense01.id),true);assert.equal(store.canAccessMission('new-pilot',legacyMission.id),false);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});


test('M15 real assigned aircraft stay visible during intro while unrelated bots stay hidden',()=>{
 const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const expression=client.match(/const hiddenBot = (remote\.isBot && \([\s\S]*?\));/)[1];
 const ctx=vm.createContext({journeyDallasTerritoryDefense01,remote:{isBot:true,playerId:'one'},missionCombatIntroPath:{missionNumber:15},flightLaunchState:'active',missionFocus:{showAmbientAIAircraft:false},transportEscortInactive:()=>false,unrelatedFocusedBot:id=>!['one','two'].includes(id)});
 for(const id of ['one','two']){ctx.remote.playerId=id;assert.equal(vm.runInContext(expression,ctx),false);}
 ctx.remote.playerId='ambient';assert.equal(vm.runInContext(expression,ctx),true);
 ctx.remote.playerId='one';ctx.missionCombatIntroPath.missionNumber=10;assert.equal(vm.runInContext(expression,ctx),true,'legacy preview intro visibility stays unchanged');
});


test('shared combat recovery validates each mission count and preserves remaining hunter HP',async()=>{
 const catalog=await import('../../shared/journey-mission.mjs');
 for(const [definition,count] of [[mission,2],[legacyMission,2],[catalog.journeyDallas17,3],[catalog.journeyDallas18,4]]){
  const attempt={attemptId:'attempt',missionId:definition.id,crossfireKills:1};
  const pose={x:-27000,y:1200,z:-40000};
  const players=new Map([['owner',{position:pose,lastAcceptedPosition:pose,rotation:{y:Math.PI}}]]);
  for(let i=1;i<count;i++)players.set(`enemy-${i}`,{lifeState:'alive',health:125,position:pose,rotation:{y:0},velocity:{x:0,y:0,z:400},bot:{journeyAttemptId:'attempt'}});
  const ctx=runtime(['captureJourneyRecovery'],{...catalog,players,transportEncounters:new Map(),monsterEncounters:new Map(),rearGuardFire:new Map(),reinforcementWaves:new Map(),isMonsterJourneyMission:()=>false,botTerrainHeight:()=>0,queryBuildings:()=>{},transportBuildings:[]});
  const checkpoint=ctx.captureJourneyRecovery('owner',attempt,4000,false);assert.ok(checkpoint,definition.name);assert.equal(checkpoint.bots.length,count-1);assert.equal(checkpoint.bots[0].health,125);
 }
});
