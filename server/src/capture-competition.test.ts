import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {newCaptureCompetition,advanceCaptureCompetition,captureCompetitionOwned,releaseCaptureActor,type CaptureOpponent} from './capture-competition.ts';
import {JourneyAttemptStore} from './journey-attempts.ts';
import {PlayerProfileStore} from './player-profiles.ts';
import {journeyDallasTerritoryHold01,journeyCompetitiveCaptureMission,journeyDallasCaptureThree01 as mission} from '../../shared/journey-mission.mjs';
import {territoriesForCity} from '../../shared/city-territories.mjs';
import {keepDallasEscortInside} from './journey-hunter-airspace.ts';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {maxHealthForAircraft} from '../../shared/aircraft-health.mjs';
const actor=(id:string,territoryId?:string,alive=true)=>({id,territoryId,alive});
function ticks(state:ReturnType<typeof newCaptureCompetition>,actors:ReturnType<typeof actor>[],count=38){for(let i=0;i<count;i++)advanceCaptureCompetition(state,actors,state.updatedAt+400);}

test('all territories start neutral, capture in any order and require simultaneous ownership',()=>{
 const state=newCaptureCompetition([],0);
 assert.ok(state.territories.every(t=>!t.ownerId&&t.captureMs===0));
 for(const id of ['downtown','las-colinas','love-field'])ticks(state,[actor('pilot',id)]);
 assert.equal(captureCompetitionOwned(state),3);
 ticks(state,[actor('pilot'),actor('enemy','downtown')]);
 assert.equal(captureCompetitionOwned(state),2);
 ticks(state,[actor('pilot','downtown'),actor('enemy')]);
 assert.equal(captureCompetitionOwned(state),3);
});
test('owners defend against stealing; killing the owner resets its holdings to neutral',()=>{
 const state=newCaptureCompetition([],0),id='las-colinas';
 ticks(state,[actor('pilot'),actor('enemy',id)]);
 ticks(state,[actor('pilot',id),actor('enemy',id)],60);
 assert.equal(state.territories[0].ownerId,'enemy');
 assert.equal(state.territories[0].captureMs,mission.captureDurationMs*.95);
 advanceCaptureCompetition(state,[actor('pilot',id),actor('enemy',undefined,false)],state.updatedAt+400);
 assert.equal(state.territories[0].ownerId,undefined);
 assert.ok(state.territories[0].captureMs<=400);
 ticks(state,[actor('pilot',id),actor('enemy',undefined,false)]);
 assert.equal(state.territories[0].ownerId,'pilot');
});
test('contests, stalls, pause/reconnect gaps and leaving the territory cannot create progress',()=>{
 const state=newCaptureCompetition([],0),id='love-field';
 ticks(state,[actor('pilot',id)],10);
 advanceCaptureCompetition(state,[actor('pilot',id)],state.updatedAt+10000);
 assert.equal(state.territories[1].captureMs,4000,'update gap preserves progress without awarding missing time');
 ticks(state,[actor('pilot',id),actor('enemy',id)],50);
 assert.equal(state.territories[1].ownerId,undefined);
 assert.equal(state.territories[1].contested,true);
 assert.equal(state.territories[1].captureMs,4000,'a contested territory pauses existing capture progress');
 assert.equal(state.territories[1].capturingId,'pilot');
 ticks(state,[actor('pilot',id)],10);ticks(state,[actor('pilot')],1);
 assert.equal(state.territories[1].captureMs,0);
});

test('persisted ownership, lost territory and first-clear wallet protection survive database reload',()=>{
 const dir=mkdtempSync(join(tmpdir(),'m21-competitive-')),path=join(dir,'profiles.sqlite');
 try{
  const profiles=new PlayerProfileStore(path);const initial=profiles.getOrCreate('pilot','Pilot').credits;
  const store=new JourneyAttemptStore(path,true);let now=Date.now();
  for(let replay=0;replay<2;replay++){
   const launched=store.launch('pilot','trainer',now,mission.id);store.approach('pilot',launched.attemptId);
   const started=store.startTerritoryCapture('pilot',launched.attemptId,now)!;
   const state=newCaptureCompetition([],now);
   const flight={position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:100,y:0,z:0},health:100,updatedAt:now,competition:state};
   state.territories[0]!.ownerId='pilot';state.territories[1]!.ownerId='pilot';
   store.saveCaptureFlight('pilot',started.attemptId,flight);now+=400;
   let updated=store.advanceTerritoryCapture('pilot',started.attemptId,true,now,false,state)!;
   assert.equal(updated.status,'RACING');assert.equal(updated.captureStage,2);
   state.territories[0]!.ownerId='enemy';store.saveCaptureFlight('pilot',started.attemptId,{...flight,updatedAt:now});now+=400;
   updated=store.advanceTerritoryCapture('pilot',started.attemptId,true,now,false,state)!;assert.equal(updated.captureStage,1);
   const reopened=new JourneyAttemptStore(path,true),saved=reopened.get('pilot',started.attemptId)!;
   assert.equal(saved.captureFlight?.competition?.territories[0]?.ownerId,'enemy');
   // A completion event or old sequential tick alone cannot win M21.
   assert.equal(store.advanceTerritoryCapture('pilot',started.attemptId,true,now+1),undefined);
   state.territories.forEach(t=>{t.ownerId='pilot';});now+=400;
   updated=store.advanceTerritoryCapture('pilot',started.attemptId,true,now,false,state)!;
   assert.equal(updated.status,'COMPLETED');assert.equal(updated.firstClearCredits,replay===0?2250:0);
   assert.equal(store.advanceTerritoryCapture('pilot',started.attemptId,true,now+400,false,state),undefined);
  }
  assert.equal(profiles.getOrCreate('pilot','Pilot').credits,initial+2250);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const declarations=(names:string[])=>ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name!.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('production setup creates exactly six private opponents: three EASY and three HARD, no respawn on refresh',()=>{
 const players=new Map([['owner',{position:{x:0,y:1000,z:0}}]]),states=new Map(),spawns:any[]=[];
 const context=vm.createContext({journeyDallasTerritoryHold01,journeyCompetitiveCaptureMission,captureCompetitions:states,players,journeyDallasCaptureThree01:mission,territoriesForCity,keepDallasEscortInside,
  aircraftFlightEnvelope,maxHealthForAircraft,newCaptureCompetition,botSafeFloor:()=>1000,journeyAceClearance:300,
  createBot(_city:unknown,_defense:unknown,spawn:any){spawns.push(spawn);players.set(spawn.captureOpponent.id,{bot:{journeyAttemptId:spawn.attemptId,journeyTargetPlayerId:spawn.targetPlayerId}} as any);},
 });
 vm.runInContext(declarations(['ensureCaptureCompetition']),context);
 const attempt={attemptId:'attempt',captureFlight:undefined};
 const state=context.ensureCaptureCompetition('owner',attempt);
 assert.equal(spawns.length,6);assert.equal(state.opponents.filter((e:CaptureOpponent)=>e.level==='EASY').length,3);
 assert.equal(state.opponents.filter((e:CaptureOpponent)=>e.level==='HARD').length,3);
 assert.ok(state.territories.every((t:any)=>!t.ownerId));
 assert.ok(spawns.every(s=>s.targetPlayerId==='owner'&&s.attemptId==='attempt'));
 context.ensureCaptureCompetition('owner',attempt);assert.equal(spawns.length,6);
 state.opponents[0].health=0;players.delete(state.opponents[0].id);
 context.ensureCaptureCompetition('owner',attempt);assert.equal(spawns.length,6);
});

test('real bot factory preserves each assigned aircraft, EASY/HARD profile, health and city-private identity',async()=>{
 const missions=await import('../../shared/journey-mission.mjs');
 const {createOpponent}=await import('./opponent.ts');
 const {cityAirports}=await import('../../shared/city-airports.mjs');
 const {boundJourneyHunterPoint}=await import('./journey-hunter-airspace.ts');
 const players=new Map();
 const context=vm.createContext({journeyDallasTerritoryHold01,journeyCompetitiveCaptureMission,...missions,players,createOpponent,nextBotSerial:1,botNames:['Hunter'],botPersonalities:['hunter'],
  botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,botTerrainHeight:()=>100,botSafeFloor:()=>1200,
  safeBotWaypoint:(_city:unknown,_from:unknown,p:unknown)=>p,journeyAceClearance:300,aircraftFlightEnvelope,maxHealthForAircraft,DALLAS_WORLD_SCALE:3,
  sendToPlayer(){},broadcastToCity:()=>assert.fail('private opponent leaked'),botStateMessage:()=>({})});
 vm.runInContext(declarations(['createBot']),context);
 for(let slot=0;slot<6;slot++){
  const aircraft=(['trainer','fighter','privateJet','cargo'] as const)[slot%4]!;
  const enemy:CaptureOpponent={id:`bot:journey:attempt:capture:${slot}`,aircraft,level:slot<3?'EASY':'HARD',
   position:{x:2000+slot*100,y:2000,z:-5000},rotation:{x:0,y:1,z:0},velocity:{x:100,y:0,z:100},health:maxHealthForAircraft(aircraft),goal:slot%3};
  const id=context.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'pilot',target:{},captureOpponent:enemy,captureSlot:slot});
  const live=players.get(id);
  assert.equal(id,enemy.id);assert.equal(live.aircraftType,aircraft);assert.equal(live.health,enemy.health);
  assert.equal(live.bot.journeyCaptureSlot,slot);assert.equal(live.bot.journeyDallasEntered,true);
  assert.equal(live.bot.opponent.definition.level,enemy.level);assert.equal(live.bot.journeyTargetPlayerId,'pilot');
  assert.deepEqual({...live.position},enemy.position);
  enemy.runwayStart=true;enemy.role=slot<3?'owner':'attacker';enemy.name='RETURNING OPPONENT';enemy.velocity={x:0,y:0,z:0};
  context.createBot('dallas',undefined,{attemptId:'attempt',targetPlayerId:'pilot',target:{},captureOpponent:enemy,captureSlot:slot});
  const returned=players.get(id);assert.equal(returned.bot.phase,'taxi');assert.equal(returned.bot.speed,0);assert.equal(returned.displayName,enemy.name);assert.equal(returned.bot.routeIndex,0);
 }
});

test('AI navigates to capture and immediately attacks when the player invades its owned territory',()=>{
 const territory=territoriesForCity('dallas').find(t=>t.id==='las-colinas')!;
 const pilot={lifeState:'alive',health:100,position:{x:50000,y:2000,z:50000}};
 const enemy={cityId:'dallas',aircraftType:'fighter',position:{x:territory.center.x,y:2000,z:territory.center.z},rotation:{x:0,y:0,z:0}};
 const saved:CaptureOpponent={id:'enemy',aircraft:'fighter',level:'HARD',position:enemy.position,rotation:enemy.rotation,velocity:{x:100,y:0,z:100},health:200,goal:0};
 const state=newCaptureCompetition([saved],0),calls:any[]=[];
 const context=vm.createContext({journeyDallasTerritoryHold01,journeyCompetitiveCaptureMission,players:new Map([['pilot',pilot]]),captureCompetitions:new Map([['attempt',state]]),journeyDallasCaptureThree01:mission,
  territoriesForCity,territoryContains:(t:any,p:any)=>p.x>=t.bounds.minX&&p.x<=t.bounds.maxX&&p.z>=t.bounds.minZ&&p.z<=t.bounds.maxZ,
  COMBAT_RANGE:3000,aircraftFlightEnvelope,journeyAceClearance:300,insideAceInterceptAirspace:()=>true,
  botSafeFloor:()=>1000,botFireSolution:()=>({reason:undefined}),safeBotWaypoint:(_city:unknown,_from:unknown,to:unknown)=>to,
  planOpponentTactics(_opponent:unknown,args:any){calls.push(args);return {waypoint:args.objective??pilot.position,tactic:'attackPass',turnSign:1};},
 });
 vm.runInContext(declarations(['hunterNavigationTarget']),context);
 const bot={personality:'hunter',journeyCaptureSlot:0,journeyTargetPlayerId:'pilot',journeyAttemptId:'attempt',opponent:{},speed:250};
 let navigation=context.hunterNavigationTarget('enemy',enemy,bot,1000);
 assert.equal(navigation.target,undefined);assert.ok(calls.at(-1).objective);
 state.territories[0]!.ownerId='enemy';pilot.position={...territory.center,y:2000};
 navigation=context.hunterNavigationTarget('enemy',enemy,bot,2000);
 assert.equal(navigation.target[0],'pilot');assert.equal(calls.at(-1).objective,undefined);
 saved.role='owner';saved.goal=2;pilot.position={x:50000,y:2000,z:50000};
 navigation=context.hunterNavigationTarget('enemy',enemy,bot,3000);assert.equal(saved.goal,0);assert.equal(navigation.target,undefined);
 saved.provokedUntil=5000;navigation=context.hunterNavigationTarget('enemy',enemy,bot,4000);assert.equal(navigation.target[0],'pilot');
 saved.provokedUntil=0;saved.role='attacker';state.opponents[3]=saved;bot.journeyCaptureSlot=3;
 navigation=context.hunterNavigationTarget('enemy',enemy,bot,6000);assert.equal(navigation.target[0],'pilot');
 bot.phase='taxi';assert.equal(context.hunterNavigationTarget('enemy',enemy,bot,7000),undefined);
 bot.phase='takeoff';assert.equal(context.hunterNavigationTarget('enemy',enemy,bot,8000),undefined);
});

test('M21 keeps the common fire button and aim renderer',()=>{const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');assert.match(client,/function updateLockCircle/);assert.match(client,/function fireWeaponOnce/);});

test('production M21 capture covers all territory edges and corners at low and high altitude',async()=>{
 const {territoryCaptureFlightEligible}=await import('../../shared/city-territories.mjs');
 const state=newCaptureCompetition([],1000);
 const player={cityId:'dallas',pilotId:'pilot',lifeState:'alive',health:100,hasRespawnTransform:true,portalTransit:false,
  lastStateAt:1400,lastAcceptedTransformAt:1400,lastAcceptedPosition:{x:0,y:1000,z:0},velocity:{x:100,y:0,z:0}};
 const attempt={attemptId:'attempt',status:'RACING',pausedAt:null,deadlineAt:1e9,captureFlight:undefined};
 const context=vm.createContext({journeyDallasTerritoryHold01,journeyCompetitiveCaptureMission,journeyDallasCaptureThree01:mission,territoriesForCity,territoryCaptureFlightEligible,
  pausedJourneyAttempts:new Set(),hasOpenPlayerSocket:()=>true,botTerrainHeight:()=>100,
  landingFlightState:new Map([['owner',{airborne:true}]]),players:new Map(),
  ensureCaptureCompetition:()=>state,advanceCaptureCompetition,checkpointJourneyCapture(){},
  journeyStore:{advanceTerritoryCapture(){return undefined;}}});
 vm.runInContext(declarations(['updateCompetitiveCapture']),context);
 let now=1400;
 for(const territory of territoriesForCity('dallas').filter(t=>mission.territoryIds.includes(t.id as any))){
  const {minX,maxX,minZ,maxZ}=territory.bounds;
  for(const [x,z] of [[minX+1,minZ+1],[minX+1,maxZ-1],[maxX-1,minZ+1],[maxX-1,maxZ-1],
    [minX+1,territory.center.z],[maxX-1,territory.center.z],[territory.center.x,minZ+1],[territory.center.x,maxZ-1],
    [territory.center.x,territory.center.z]]){
   for(const altitude of [500,6000,20000]){
    state.territories.forEach(t=>{t.captureMs=0;t.capturingId=undefined;});state.updatedAt=now-400;
    player.lastStateAt=player.lastAcceptedTransformAt=now;player.lastAcceptedPosition={x:x!,y:altitude,z:z!};
    context.updateCompetitiveCapture('owner',player,attempt,now);
    assert.equal(state.territories.find(t=>t.id===territory.id)!.captureMs,400,`${territory.id}: (${x},${z}) at ${altitude}m should capture`);
    now+=400;
   }
  }
 }
 // A brief stale packet interval neither advances nor destroys prior progress.
 const inside=territoriesForCity('dallas').find(t=>t.id==='las-colinas')!;
 player.lastAcceptedPosition={...inside.center,y:10000};player.lastStateAt=player.lastAcceptedTransformAt=now;
 state.updatedAt=now-400;context.updateCompetitiveCapture('owner',player,attempt,now);
 const before=state.territories[0]!.captureMs;
 context.updateCompetitiveCapture('owner',player,attempt,now+1200);
 assert.equal(state.territories[0]!.captureMs,before);
 // An accepted departure from the marked territory still resets its unfinished capture.
 now+=1600;player.lastStateAt=player.lastAcceptedTransformAt=now;player.lastAcceptedPosition.x=inside.bounds.minX-1;
 context.updateCompetitiveCapture('owner',player,attempt,now);
 assert.equal(state.territories[0]!.captureMs,0);
});


test('an interrupted challenge returns to its existing owner, whether the challenger leaves or is defeated',()=>{
 for(const interruptedBy of ['departure','defeat'] as const){
  const state=newCaptureCompetition([],0),id='las-colinas';
  ticks(state,[actor('pilot',id)]);
  ticks(state,[actor('pilot'),actor('challenger',id)],20);
  const territory=state.territories[0]!;
  assert.equal(territory.ownerId,'pilot');assert.equal(territory.contested,true);assert.equal(territory.captureMs,8000);
  if(interruptedBy==='defeat')releaseCaptureActor(state,'challenger');
  advanceCaptureCompetition(state,[actor('pilot',id),actor('challenger',undefined,interruptedBy!=='defeat')],state.updatedAt+400);
  assert.equal(territory.ownerId,'pilot');assert.equal(territory.contested,false);
  assert.equal(territory.capturingId,undefined);assert.equal(territory.captureMs,0);
  assert.equal(captureCompetitionOwned(state),1);
 }
});
test('an absent owner retains the territory through a contested tick and challenger departure',()=>{
 const state=newCaptureCompetition([],0),id='love-field';
 ticks(state,[actor('pilot',id)]);
 advanceCaptureCompetition(state,[actor('challenger',id)],state.updatedAt+400);
 const territory=state.territories[1]!;
 assert.equal(territory.ownerId,'pilot');assert.equal(territory.contested,true);
 advanceCaptureCompetition(state,[],state.updatedAt+400);
 assert.equal(territory.ownerId,'pilot');assert.equal(territory.contested,false);
 assert.equal(territory.captureMs,0);
});
test('ownership transfers only at full capture, with no intermediate unassigned state',()=>{
 const state=newCaptureCompetition([],0),id='downtown';
 ticks(state,[actor('pilot',id)]);
 const territory=state.territories[2]!;
 for(let tick=1;tick<=38;tick++){
  advanceCaptureCompetition(state,[actor('pilot'),actor('challenger',id)],state.updatedAt+400);
  assert.equal(territory.ownerId,tick<38?'pilot':'challenger');
  assert.equal(territory.contested,tick<38);
 }
 assert.equal(territory.capturingId,undefined);assert.equal(territory.captureMs,0);
});
