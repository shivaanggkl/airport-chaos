import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import vm from 'node:vm';
import * as catalog from '../../shared/journey-mission.mjs';
import {territoriesForCity,territoryContains,territoryCaptureFlightEligible} from '../../shared/city-territories.mjs';
import {missionFocusForAttempt} from '../../shared/mission-focus.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {projectileDamageForAircraft} from '../../shared/protocol.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {createOpponent} from './opponent.js';
import {planOpponentTactics,recordOpponentHit,recordOpponentDamage} from './opponent-tactics.js';
import {advanceHunterFlight} from './hunter-flight.js';
const mission=catalog.journeyDallasTerritoryDefense01;
const territory=territoriesForCity('dallas').find(t=>t.id===mission.territoryId);
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
function runtime(names,context){const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');const ctx=vm.createContext({...catalog,...context});vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'territory-defense-')),path=join(dir,'p.sqlite'),db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");const store=new JourneyAttemptStore(path,true);return{dir,path,db,store,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
function start(f,now=1000){const a=f.store.launch('pilot','trainer',now,mission.id);f.store.approach('pilot',a.attemptId);f.store.assignFirstContact('pilot',a.attemptId,'invader');return a;}

test('M16 activates the correct slot with one real authoritative Las Colinas and unchanged neighboring identities',()=>{
 assert.equal(catalog.journeyMissionSlot(mission.id),16);assert.equal(catalog.journeyMissionSlot(catalog.journeyDallas16.id),17);assert.equal(catalog.journeyMissionSlot(catalog.journeyDallasTwinHunters01.id),15);
 assert.equal(territory.center.x,-40500);assert.equal(territory.center.z,-28050);assert.equal(territoryContains(territory,mission.airborneSpawn),true);assert.equal(territoryContains(territory,mission.enemySpawn),false);
 assert.equal(missionFocusForAttempt({missionId:mission.id,status:'RACING'}).showAmbientAIAircraft,false);assert.equal(mission.enemyHealth/projectileDamageForAircraft('trainer'),12);
 assert.equal(catalog.journeyDallas16.enemyHealth,300);assert.equal(catalog.journeyDallasTwinHunters01.enemyHealth,200);assert.equal(catalog.journeyDallasCapture01.captureDurationMs,60000);
});

test('GO, cumulative defense, paused presence, 2x recovery, no stale tick credit and exactly-once first clear',()=>{
 const f=fixture();try{const a=start(f);assert.equal(f.store.advanceTerritoryDefense('pilot',a.attemptId,true,false,1500),undefined);assert.equal(f.store.startFirstContact('pilot',a.attemptId,2000).deadlineAt,182000);assert.equal(f.store.startFirstContact('pilot',a.attemptId,2100),undefined);
 assert.equal(f.store.advanceTerritoryDefense('other',a.attemptId,true,false,2400),undefined);
 let state=f.store.advanceTerritoryDefense('pilot',a.attemptId,true,false,2400);assert.equal(state.defenseMs,400);assert.equal(state.enemyCaptureMs,0);
 state=f.store.advanceTerritoryDefense('pilot',a.attemptId,false,true,2800);assert.equal(state.defenseMs,400);assert.equal(state.enemyCaptureMs,400);
 state=f.store.advanceTerritoryDefense('pilot',a.attemptId,false,false,3200);assert.equal(state.enemyCaptureMs,400);
 state=f.store.advanceTerritoryDefense('pilot',a.attemptId,true,false,3300);assert.equal(state.defenseMs,500);assert.equal(state.enemyCaptureMs,200);
 state=f.store.advanceTerritoryDefense('pilot',a.attemptId,true,true,3700);assert.equal(state.enemyCaptureMs,0);
 state=f.store.advanceTerritoryDefense('pilot',a.attemptId,true,true,6000);assert.equal(state.defenseMs,900,'missed ticks give no catch-up');
 state=f.store.advanceTerritoryDefense('pilot',a.attemptId,true,true,6400,true);assert.equal(state.defenseMs,900,'invalid movement does not progress');assert.equal(state.enemyCaptureMs,400,'invalid player movement cannot freeze an authoritative invasion');
 let now=6400;while(state.status==='RACING'){now+=400;state=f.store.advanceTerritoryDefense('pilot',a.attemptId,true,true,now);}
 assert.equal(state.status,'COMPLETED');assert.equal(state.defenseMs,90000);assert.equal(state.firstClearCredits,1700);assert.equal(f.store.completeHunter('pilot',a.attemptId,'invader',now+1),undefined);
 const retry=start(f,now+1000);assert.equal(f.store.get('pilot',retry.attemptId).defenseMs,0);assert.equal(f.store.get('pilot',retry.attemptId).enemyCaptureMs,0);f.store.startFirstContact('pilot',retry.attemptId,now+2000);assert.equal(f.store.completeHunter('pilot',retry.attemptId,'wrong',now+2100),undefined);assert.equal(f.store.completeHunter('pilot',retry.attemptId,'invader',now+2200).firstClearCredits,0);assert.equal(f.db.prepare('SELECT credits FROM player_profiles').get().credits,1700);
 }finally{f.close();}
});

test('capture caps, deadline, crash, pause and reopen preserve private progress and assigned identity',()=>{
 const f=fixture();try{const a=start(f);f.store.startFirstContact('pilot',a.attemptId,2000);let state,now=2000;
 for(let i=0;i<151;i++){now+=400;state=f.store.advanceTerritoryDefense('pilot',a.attemptId,false,true,now);}
 assert.equal(state.enemyCaptureMs,60000);assert.equal(state.defenseMs,0);assert.equal(f.store.fail('pilot',a.attemptId,'TERRITORY_OVERRUN',now).failureReason,'TERRITORY_OVERRUN');assert.equal(f.store.completeHunter('pilot',a.attemptId,'invader',now+1),undefined);
 const b=start(f,now+1000);now+=2000;f.store.startFirstContact('pilot',b.attemptId,now);f.store.advanceTerritoryDefense('pilot',b.attemptId,true,false,now+400);f.store.advanceTerritoryDefense('pilot',b.attemptId,false,true,now+800);f.store.pause('pilot',b.attemptId,now+900);
 assert.equal(f.store.advanceTerritoryDefense('pilot',b.attemptId,true,false,now+1200),undefined);f.store.resume('pilot',b.attemptId,now+5900);
 const reopened=new JourneyAttemptStore(f.path,true),restored=reopened.get('pilot',b.attemptId);assert.equal(restored.defenseMs,400);assert.equal(restored.enemyCaptureMs,400);assert.equal(restored.targetId,'invader');assert.equal(restored.deadlineAt,now+185000);
 assert.equal(reopened.advanceTerritoryDefense('pilot',b.attemptId,true,false,restored.deadlineAt),undefined);assert.equal(reopened.completeHunter('pilot',b.attemptId,'invader',restored.deadlineAt),undefined);assert.equal(reopened.fail('pilot',b.attemptId,'TIME_UP',restored.deadlineAt).status,'FAILED');
 }finally{f.close();}
});

test('accepted presence requires alive airborne moving recent owned flight, with no extra altitude challenge',()=>{
 const now=10000,player={cityId:'dallas',lifeState:'alive',health:100,hasRespawnTransform:true,lastAcceptedTransformAt:now,lastAcceptedPosition:{x:-47000,y:900,z:-28050},velocity:{x:650,y:0,z:0}};
 const ctx=runtime(['territoryDefensePresence'],{territoriesForCity,territoryCaptureFlightEligible,hasOpenPlayerSocket:()=>true,botTerrainHeight:()=>0,landingFlightState:new Map([['owner',{airborne:true}]])});
 assert.equal(ctx.territoryDefensePresence('owner',player,now).eligible,true);
 for(const patch of [{health:0},{lifeState:'destroyed'},{lastAcceptedTransformAt:now-801},{velocity:{x:0,y:0,z:0}},{lastAcceptedPosition:{x:-22000,y:900,z:-28050}},{portalTransit:true}])assert.equal(ctx.territoryDefensePresence('owner',{...player,...patch},now).eligible,false);
 ctx.landingFlightState.set('owner',{airborne:false});assert.equal(ctx.territoryDefensePresence('owner',player,now).eligible,false);
 ctx.landingFlightState.set('owner',{airborne:true});assert.equal(ctx.territoryDefensePresence('owner',{...player,lastAcceptedPosition:{...player.lastAcceptedPosition,y:10000}},now).eligible,true);
});

test('production factory stages the real Sunset Red Medium Nightowl at exact coordinates and cruise',()=>{
 const players=new Map(),sent=[];const ctx=runtime(['createBot'],{createOpponent,players,nextBotSerial:1,botNames:['Hunter'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint:p=>p,botTerrainHeight:()=>120,botSafeFloor:()=>900,safeBotWaypoint:(_city,_from,to)=>to,journeyAceClearance:300,aircraftFlightEnvelope,DALLAS_WORLD_SCALE:3,sendToPlayer:(_id,p)=>sent.push(p),broadcastToCity:()=>assert.fail('private invader broadcast'),botStateMessage:(_id,p)=>p});
 const id=ctx.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'owner',target:{},firstContact:true,territoryDefense:true});const enemy=players.get(id);
 assert.equal(players.size,1);assert.equal(enemy.position.x,-22000);assert.equal(enemy.position.z,-28050);assert.ok(enemy.position.y>900);assert.equal(enemy.rotation.y,Math.PI/2);assert.equal(enemy.health,300);assert.equal(enemy.bot.speed,420);assert.equal(enemy.bot.opponent.definition.level,'MEDIUM');assert.equal(enemy.bot.opponent.definition.livery,mission.enemyLivery);assert.equal(enemy.spawnProtectedUntil,0);
});

test('production AI follows ordered route, enters near 17 seconds and cycles the interior patrol with shared flight',()=>{
 const enemy={cityId:'dallas',lifeState:'alive',aircraftType:'privateJet',position:{...mission.enemySpawn,y:1300},rotation:{x:0,y:Math.PI/2,z:0},velocity:{x:-420,y:0,z:0}},pilot={pilotId:'pilot',aircraftType:'trainer',lifeState:'alive',position:{x:-80000,y:1300,z:-28050},rotation:{x:0,y:0,z:0},velocity:{x:650,y:0,z:0}};
 const bot={personality:'hunter',journeyTerritoryDefense:true,journeyTargetPlayerId:'owner',journeyAttemptId:'attempt',speed:420,bankControl:0,combatTurnSign:1,opponent:createOpponent({aircraft:'privateJet',livery:mission.enemyLivery,level:'MEDIUM',cityId:'dallas',position:enemy.position,rotation:enemy.rotation,speed:420,health:300,behavior:'objective'})};
 const ctx=runtime(['hunterNavigationTarget'],{players:new Map([['owner',pilot]]),journeyStore:{activeSnapshot:()=>({status:'RACING'})},planOpponentTactics,territoriesForCity,territoryContains,botSafeFloor:()=>100,journeyAceClearance:300,safeBotWaypoint:(_city,_from,to)=>to,insideJourneyHunterArena:()=>true,botFireSolution:()=>({reason:'range'}),opponentReactionReady:()=>true});
 const visited=[0];let entered;
 for(let step=0;step<4400;step++){const now=step*50;const next=ctx.hunterNavigationTarget('invader',enemy,bot,now);advanceHunterFlight(enemy,bot,next.waypoint,bot.opponent.tactics.plan.cruise,.05,()=>100);if(entered===undefined&&territoryContains(territory,enemy.position))entered=step*.05;if(visited.at(-1)!==bot.journeyDefenseRouteIndex)visited.push(bot.journeyDefenseRouteIndex);if(visited.length>=5)break;}
 assert.ok(entered>=15&&entered<=20,`entry ${entered}`);assert.deepEqual(visited.slice(0,5),[0,1,2,3,1]);
});

test('12-second shared territory cinematic uses real aircraft and exact text with unchanged handoff transforms',async()=>{
 const THREE=await import('three'),{MissionCaptureIntroPath}=await import('../../client/src/mission-capture-intro.ts');const player=new THREE.Group(),invader=new THREE.Group();player.position.set(-47000,900,-28050);invader.position.set(-22000,1100,-28050);
 const intro=new MissionCaptureIntroPath(territory,90000,()=>0,{player,invader}),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(-48000,1200,-28050),aim=player.position.clone();assert.equal(intro.durationMs,12000);
 assert.deepEqual([0,3000,6000,9000].map(t=>intro.text(t)),['TERRITORY DEFENSE','LAS COLINAS is yours to defend!','Stay inside the marked territory.','Defend for 90 seconds or destroy the enemy!']);
 for(let t=0;t<=12000;t+=100){intro.sample(t,position,target,chase,aim);assert.ok([...position,...target].every(Number.isFinite));assert.equal(intro.demonstrationPercent(t),undefined);}
 assert.ok(position.equals(chase));assert.ok(target.equals(aim));assert.equal(player.position.x,-47000);assert.equal(invader.position.x,-22000);
});

test('production projectile damage rejects pre-GO and early enemy fire; twelve 25HP hits win once',()=>{
 const f=fixture();try{const a=start(f);const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',health:100,isBot:false,score:0,aircraftType:'trainer',position:{x:-47000,y:1000,z:-28050}};
 const enemy={entityType:'player',cityId:'dallas',lifeState:'alive',isBot:true,score:0,health:300,spawnProtectedUntil:0,aircraftType:'privateJet',position:{x:-45000,y:1100,z:-28050},bot:{journeyFirstContact:true,journeyTerritoryDefense:true,journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyProvoked:true}};
 const players=new Map([['owner',pilot],['invader',enemy]]),packets=[];
 const ctx=runtime(['applyCombatHit','transportEscortHealth'],{players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyRunwayPrep:new Set(),runwayCombatProtected:()=>false,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena:()=>true,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),sendToPlayer:(_id,p)=>packets.push(p),sendJourneyState:()=>{},provokeJourneyHunter:()=>{},markPlayerDestroyed:(_id,p)=>p.lifeState='destroyed',isHumanPilot:()=>false,botKillRewardMultiplier:.1,persistScore:()=>{},broadcastToCity:()=>assert.fail('private actor leaked'),broadcastLeaderboard:()=>{},removeBot:id=>players.delete(id),updateKing:()=>{},cityKings:new Map(),handleWantedDestruction:()=>{},challengeForPlayer:()=>undefined,recordOpponentHit,recordOpponentDamage});
 assert.equal(ctx.applyCombatHit('owner','invader','dallas',1500,25),false);f.store.startFirstContact('pilot',a.attemptId,2000);assert.equal(ctx.applyCombatHit('invader','owner','dallas',9999,25),false);assert.equal(pilot.health,100);
 for(let i=1;i<=12;i++){assert.equal(ctx.applyCombatHit('owner','invader','dallas',2100+i*100,25),true);assert.equal(enemy.health,300-i*25);assert.equal(f.store.get('pilot',a.attemptId).status,i===12?'COMPLETED':'RACING');}
 assert.equal(f.store.get('pilot',a.attemptId).firstClearCredits,1700);assert.equal(f.db.prepare('SELECT credits FROM player_profiles').get().credits,1700);assert.equal(players.has('invader'),false);assert.equal(packets.filter(p=>p.type==='damage').length,12);assert.equal(packets.find(p=>p.type==='damage').maxHealth,300);
 }finally{f.close();}
});

test('verified ad continuation preserves defense, invasion, identity and real enemy HP without extra rewards',async()=>{
 const {PlayerProfileStore}=await import('./player-profiles.js'),{RewardedAdStore}=await import('./rewarded-ads.js');
 const dir=mkdtempSync(join(tmpdir(),'m16-continue-'));try{const path=join(dir,'p.sqlite'),profiles=new PlayerProfileStore(path);const initial=profiles.getOrCreate('pilot','Pilot').credits,store=new JourneyAttemptStore(path,true),a=start({store});store.startFirstContact('pilot',a.attemptId,2000);store.advanceTerritoryDefense('pilot',a.attemptId,true,false,2400);store.advanceTerritoryDefense('pilot',a.attemptId,false,true,2800);store.fail('pilot',a.attemptId,'CRASHED',3000);
 const checkpoint={position:{x:-47000,y:1000,z:-28050},heading:-Math.PI/2,bots:[{id:'invader',health:175}]};assert.equal(store.saveContinuation('pilot',a.attemptId,3000,checkpoint),true);
 const unit='ca-app-pub-3940256099942544/5224354917',ads=new RewardedAdStore(path,{enabled:true,ios:{enabled:false},android:{enabled:true,adUnitId:unit},webEnabled:false,providerRewardAmount:'1'}),ad=ads.createAttempt('pilot','android',3001,`${a.attemptId}:3000`);assert.equal(ad.ok,true);const id=ad.attempt.attemptId;assert.equal(store.continueAfterAd('pilot',a.attemptId,id,3002),undefined);
 assert.equal(ads.grantVerifiedReward({adUnit:unit,customData:id,rewardAmount:'1',rewardItem:'reward',timestamp:3004,transactionId:'m16-ad'},3004).rewarded,true);
 const reopened=new JourneyAttemptStore(path,true);assert.equal(reopened.continuation('pilot',a.attemptId,3005).data.bots[0].health,175);
 const resumed=reopened.continueAfterAd('pilot',a.attemptId,id,33000);assert.equal(resumed.defenseMs,400);assert.equal(resumed.enemyCaptureMs,400);assert.equal(resumed.targetId,'invader');assert.equal(resumed.deadlineAt-33000,180000);assert.equal(reopened.continueAfterAd('pilot',a.attemptId,id,33001),undefined);assert.equal(profiles.getOrCreate('pilot','Pilot').credits,initial);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('M16 rollout preserves earned M17 access once; new M15 clears unlock M16 before M17',()=>{
 const f=fixture();try{const completion=f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,0)');completion.run('pilot',catalog.journeyDallasTwinHunters01.id,'old-m15',1);f.db.prepare('DELETE FROM journey_catalog_versions WHERE version=?').run('dallas-territory-defense-01');
 const store=new JourneyAttemptStore(f.path);assert.equal(store.canAccessMission('pilot',catalog.journeyDallas16.id),true);
 f.db.prepare('INSERT INTO player_profiles VALUES(?,?,?)').run('new',0,0);completion.run('new',catalog.journeyDallasTwinHunters01.id,'new-m15',2);assert.equal(store.canAccessMission('new',mission.id),true);assert.equal(store.canAccessMission('new',catalog.journeyDallas16.id),false);
 const a=store.launch('new','trainer',1000,mission.id);store.approach('new',a.attemptId);store.assignFirstContact('new',a.attemptId,'own-invader');store.startFirstContact('new',a.attemptId,2000);store.completeHunter('new',a.attemptId,'own-invader',3000);assert.equal(store.canAccessMission('new',catalog.journeyDallas16.id),true);assert.equal(store.progress('pilot',catalog.journeyDallasTwinHunters01.id).firstAttemptId,'old-m15');
 }finally{f.close();}
});

test('invader returns to its next ordered patrol waypoint after a shared attack pass',()=>{
 const enemy={cityId:'dallas',lifeState:'alive',position:{x:-40000,y:1300,z:-28050}},pilot={pilotId:'pilot',lifeState:'alive',position:{x:-41000,y:1300,z:-28050}},bot={personality:'hunter',journeyTerritoryDefense:true,journeyTargetPlayerId:'owner',journeyAttemptId:'attempt',journeyDefenseRouteIndex:1,speed:420,opponent:{}};let phase=0;const objectives=[];
 const ctx=runtime(['hunterNavigationTarget'],{players:new Map([['owner',pilot]]),journeyStore:{activeSnapshot:()=>({status:'RACING'})},territoriesForCity,territoryContains,botSafeFloor:()=>100,journeyAceClearance:300,insideJourneyHunterArena:()=>true,botFireSolution:()=>({}),opponentReactionReady:()=>true,planOpponentTactics:(_bot,input)=>{objectives.push(input.objective);return{tactic:phase++===0?'attackPass':'extendAway',waypoint:{x:0,y:1300,z:0},turnSign:1};}});
 ctx.hunterNavigationTarget('invader',enemy,bot,1000);ctx.hunterNavigationTarget('invader',enemy,bot,2000);ctx.hunterNavigationTarget('invader',enemy,bot,3000);
 assert.equal(objectives[0],undefined);assert.equal(objectives[1],undefined);assert.equal(objectives[2].x,mission.patrolRoute[1].x);assert.equal(bot.journeyDefenseReturning,true);
});
