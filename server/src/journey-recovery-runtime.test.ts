import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {queryBuildings} from './collision-buildings.js';
import * as missions from '../../shared/journey-mission.mjs';
import {transportPose} from '../../shared/giant-incoming.mjs';
import {createOpponent} from './opponent.js';
import {createStationaryWarlordEncounter} from './stationary-warlord.js';
import {createStrikingWarlordEncounter} from './striking-warlord.js';
import {createHuntingWarlordEncounter} from './hunting-warlord.js';
import {createShowdownWarlordEncounter} from './showdown-warlord.js';
import {createPursuitWarlordEncounter} from './pursuit-warlord.js';
import {createFinalWarlordEncounter} from './final-warlord.js';
import {createTransportEncounter} from './giant-incoming.js';

// Exercise the production coordinator with private encounter fixtures, not a second recovery implementation.
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const block=source.slice(source.indexOf('type JourneyRecovery ='),source.indexOf('function failPlayerJourney('));
function fixture() {
  const players=new Map<string,any>(),transportEncounters=new Map<string,any>(),monsterEncounters=new Map<string,any>();
  const pilot={pilotId:'pilot',aircraftType:'trainer',position:{x:0,y:1000,z:0},lastAcceptedPosition:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}};
  players.set('owner',pilot);
  const context=createContext({...missions,queryBuildings,players,transportEncounters,monsterEncounters,transportPose,structuredClone,
    rearGuardFire:new Map(),reinforcementWaves:new Map(),botTerrainHeight:()=>100,transportBuildings:[],
    dallasTerrain:{elevationAt:()=>100},monsterDistrictBuildings:[],createOpponent,
    createStationaryWarlordEncounter,createStrikingWarlordEncounter,createHuntingWarlordEncounter,
    createShowdownWarlordEncounter,createPursuitWarlordEncounter,createFinalWarlordEncounter});
  runInContext(ts.transpileModule(block,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);
  const api=runInContext('({captureJourneyRecovery,restoreJourneyRecovery,pursuitRecoveryPoses})',context);
  return {players,transportEncounters,monsterEncounters,api};
}

test('Golden Gates recovery uses the next accepted objective for all six races',()=>{
  for (const mission of [missions.journeyDallas01,missions.journeyDallas02,missions.journeyDallas03,missions.journeyDallas04,missions.journeyDallas05,missions.journeyDallas06]) {
    const f=fixture(),a={attemptId:'a',missionId:mission.id,gateIndex:4};
    const recovery=f.api.captureJourneyRecovery('owner',a,5000,false);
    assert.ok(recovery); assert.ok(Math.abs(Math.hypot(recovery.position.x-mission.gates[4].x,recovery.position.z-mission.gates[4].z)-1800)<.001);
    assert.ok(recovery.position.y>=400);assert.equal(a.gateIndex,4);
  }
});

test('hunter recovery retains damaged survivors, skips dead aircraft and requires a prior escape pose',()=>{
  const f=fixture(),a={attemptId:'a',missionId:missions.journeyDallas15.id};
  const bot={journeyAttemptId:'a',journeyTargetPlayerId:'owner',personality:'hunter',phase:'cruise',route:[],routeIndex:0,
    journeyPursuit:{index:1,previous:{x:0,y:1000,z:0},remaining:2000,escaped:true}};
  f.players.set('enemy',{bot,health:75,lifeState:'alive',aircraftType:'airliner',displayName:'MAMMOTH',position:{x:1000,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:100}});
  assert.equal(f.api.captureJourneyRecovery('owner',a,5000,true),undefined);
  f.api.pursuitRecoveryPoses.set('enemy',{position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},pursuit:{...bot.journeyPursuit,escaped:false,remaining:6000}});
  const recovery=JSON.parse(JSON.stringify(f.api.captureJourneyRecovery('owner',a,5000,true)));
  assert.equal(recovery.bots[0].health,75); assert.equal(recovery.bots[0].bot.journeyPursuit.escaped,false);
  f.players.delete('enemy'); f.api.restoreJourneyRecovery('owner',a,recovery);
  assert.equal(f.players.get('enemy').health,75);assert.equal(f.players.get('enemy').bot.journeyTargetPlayerId,'owner');
  f.players.get('enemy').lifeState='destroyed';assert.equal(f.api.captureJourneyRecovery('owner',a,5000,false),undefined);
});

test('giant recovery retains turret damage and firing clocks without stale projectiles',()=>{
  const f=fixture(),a={attemptId:'a',missionId:missions.journeyDallas10.id,startedAt:1000,rearGuardKills:15};
  const e=createTransportEncounter('a','owner',1000,1500,260000,true,false,a.missionId);
  e.fortressTurrets=[0,42];e.nextBurstAt=9000;
  f.transportEncounters.set('a',e);
  const recovery=JSON.parse(JSON.stringify(f.api.captureJourneyRecovery('owner',a,5000,false)));
  f.transportEncounters.clear();f.api.restoreJourneyRecovery('owner',a,recovery);
  const restored=f.transportEncounters.get('a');
  assert.deepEqual(restored.fortressTurrets,[0,42]); assert.equal(restored.nextBurstAt,9000);assert.equal(restored.shots.length,0);
});

test('monster recovery preserves live health, location and attack clock through serialization',()=>{
  const f=fixture(),a={attemptId:'a',missionId:missions.journeyDallas23.id,startedAt:1000,finishedAt:5000,monsterHealth:137};
  const e=createPursuitWarlordEncounter('a','owner',1000,()=>100,[],137);
  f.monsterEncounters.set('a',e);
  const recovery=JSON.parse(JSON.stringify(f.api.captureJourneyRecovery('owner',a,5000,false)));
  f.monsterEncounters.clear();f.api.restoreJourneyRecovery('owner',a,recovery);
  assert.deepEqual(f.monsterEncounters.get('a').engine.checkpoint(),e.engine.checkpoint());
  assert.equal(f.monsterEncounters.get('a').lastTickAt,5000);
});

test('HTTP and WebSocket resume persisted checkpoints for each family, with idempotent redemption', {timeout:45000}, async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
  const {createServer}=await import('node:net');const {spawn}=await import('node:child_process');
  const {DatabaseSync}=await import('node:sqlite');const {default:WebSocket}=await import('ws');
  const {PROTOCOL_VERSION}=await import('../../shared/protocol.mjs');
  const {PlayerProfileStore}=await import('./player-profiles.js');const {PilotSessionStore}=await import('./session-auth.js');
  const {JourneyAttemptStore}=await import('./journey-attempts.js');const {RewardedAdStore}=await import('./rewarded-ads.js');
  const dir=mkdtempSync('/private/tmp/airport-chaos-continuation-'),path=dir+'.sqlite';
  const profiles=new PlayerProfileStore(path),sessions=new PilotSessionStore(path),journeys=new JourneyAttemptStore(path,true);
  const adUnitId='ca-app-pub-3940256099942544/1712485313';
  const ads=new RewardedAdStore(path,{enabled:true,ios:{enabled:true,adUnitId},android:{enabled:false},webEnabled:false,providerRewardAmount:'1'});
  const db=new DatabaseSync(path),now=Date.now(),fixtures:any[]=[],sockets:any[]=[];
  let child:ReturnType<typeof spawn>|undefined;
  try {
    for(const mission of [missions.journeyDallasCapture01,missions.journeyDallas01,missions.journeyDallas13,missions.journeyDallas07,missions.journeyDallas23]) {
      const session=sessions.issue(undefined,false,now);profiles.getOrCreate(session.pilotId,'Pilot');
      db.prepare("UPDATE pilot_tutorial_state SET status='completed',updated_at=?,completed_at=? WHERE pilot_id=?").run(now,now,session.pilotId);
      const a=journeys.launch(session.pilotId,'trainer',now-4000,mission.id);
      db.prepare("UPDATE journey_attempts SET status='RACING',started_at=?,deadline_at=?,monster_health=137,target_id=?,rookie_gate_index=2 WHERE attempt_id=?")
        .run(now-3000,now+100000,mission.id===missions.journeyDallas13.id?'enemy:'+a.attemptId:null,a.attemptId);
      const f=fixture();
      if(mission.id===missions.journeyDallas13.id) {
        f.players.set('enemy:'+a.attemptId,{health:75,lifeState:'alive',aircraftType:'privateJet',displayName:'NIGHTOWL',
          position:{x:-20000,y:2000,z:-20000},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-100},
          bot:{journeyAttemptId:a.attemptId,journeyTargetPlayerId:'owner',journeyFirstContact:true,journeyContactOrdinal:1,
            personality:'hunter',phase:'cruise',route:[{x:-20000,y:2000,z:-30000}],routeIndex:0,speed:100,desiredSpeed:100,
            nextDecisionAt:now,nextFireAt:now+1000,respawnAt:0,homeAirportIndex:0,combatPhaseUntil:0,combatWaypointRefreshAt:0,
            attackFireAfter:0,combatTurnSign:1,bankControl:0,blindZoneEscapeUntil:0}});
      }
      if(mission.id===missions.journeyDallas07.id) f.transportEncounters.set(a.attemptId,createTransportEncounter(a.attemptId,'owner',now-3000,2000,mission.timeLimitMs,true,false,mission.id));
      if(mission.id===missions.journeyDallas23.id) f.monsterEncounters.set(a.attemptId,createPursuitWarlordEncounter(a.attemptId,'owner',now-3000,()=>100,[],137));
      const active=journeys.get(session.pilotId,a.attemptId)!;
      const checkpoint=f.api.captureJourneyRecovery('owner',active,now,false);assert.ok(checkpoint);
      journeys.fail(session.pilotId,a.attemptId,'CRASHED',now);assert.equal(journeys.saveContinuation(session.pilotId,a.attemptId,now,checkpoint),true);
      const issued=ads.createAttempt(session.pilotId,'ios',now+1,`${a.attemptId}:${now}`);assert.ok(issued.ok);if(!issued.ok)throw Error('fixture ad');
      // Verified receipt fixture: native video callbacks are never simulated in the running server.
      assert.equal(ads.grantVerifiedReward({adUnit:adUnitId,customData:issued.attempt.attemptId,rewardAmount:'1',rewardItem:'reward',timestamp:now+2,transactionId:a.attemptId},now+2).rewarded,true);
      fixtures.push({session,attemptId:a.attemptId,adAttemptId:issued.attempt.attemptId});
    }
    const captureSession=sessions.issue(undefined,false,now);
    profiles.getOrCreate(captureSession.pilotId,'Pilot');
    db.prepare("UPDATE pilot_tutorial_state SET status='completed',updated_at=?,completed_at=? WHERE pilot_id=?").run(now,now,captureSession.pilotId);
    const retiredSession=sessions.issue(undefined,false,now);
    profiles.getOrCreate(retiredSession.pilotId,'Pilot');
    db.prepare(`INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at,definition_revision)
      VALUES('retired-ws',?,'journey-dallas-25','dallas','trainer','RACING',?,2)`).run(retiredSession.pilotId,now);
    const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));
    const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
    child=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:resolve(import.meta.dirname,'../..'),
      env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,AIRPORT_CHAOS_DEV_QA:'1',AIRPORT_CHAOS_LOCAL_QA_UNLOCK_ALL:'true',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout!.on('data',d=>output+=String(d));child.stderr!.on('data',d=>output+=String(d));
    const deadline=Date.now()+15000;while(!output.includes('listening')&&Date.now()<deadline&&child.exitCode===null)await new Promise(r=>setTimeout(r,50));
    assert.ok(output.includes('listening'),output);
    const captureHeaders={Origin:'capacitor://localhost',Cookie:`airport_chaos_session=${captureSession.cookie}`,'Content-Type':'application/json'};
    const launched=await fetch(`http://127.0.0.1:${port}/api/journey/dallas/mission-capture-01/launch`,{method:'POST',headers:captureHeaders,body:'{}'});
    assert.equal(launched.status,201,await launched.clone().text());
    const captureAttempt=(await launched.json() as any).attempt;
    assert.equal(captureAttempt.missionId,missions.journeyDallasCapture01.id);assert.equal(captureAttempt.deadlineAt,null);
    const progress=await fetch(`http://127.0.0.1:${port}/api/journey/dallas`,{headers:captureHeaders});
    assert.equal((await progress.json() as any).missionCapture01.eligible,true);
    const captureMessages:any[]=[];
    const captureSocket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&protocol=${PROTOCOL_VERSION}&journeyAttempt=${captureAttempt.attemptId}`,
      {origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${captureSession.cookie}`}});
    sockets.push(captureSocket);captureSocket.on('message',d=>captureMessages.push(JSON.parse(String(d))));
    const waitFor=async(predicate:()=>boolean)=>{const until=Date.now()+5000;while(!predicate()&&Date.now()<until)await new Promise(r=>setTimeout(r,25));assert.ok(predicate(),JSON.stringify(captureMessages));};
    await waitFor(()=>captureMessages.some(m=>m.type==='journeyAttempt'));
    const welcome=captureMessages.find(m=>m.type==='welcome');
    assert.ok(welcome.airborneSpawn);assert.equal(welcome.airborneSpawn.heading,missions.journeyDallasCapture01.airborneSpawn.heading);
    assert.equal(journeys.get(captureSession.pilotId,captureAttempt.attemptId)!.deadlineAt,null);
    captureSocket.send(JSON.stringify({type:'journeyCountdownComplete',attemptId:captureAttempt.attemptId}));
    await waitFor(()=>captureMessages.some(m=>m.type==='journeyAttempt'&&m.attempt.status==='RACING'));
    const started=journeys.get(captureSession.pilotId,captureAttempt.attemptId)!;
    assert.equal(started.deadlineAt!-started.startedAt!,240000);assert.equal(started.captureMs,0);
    const abandoned=await fetch(`http://127.0.0.1:${port}/api/journey/dallas/mission-capture-01/abandon`,{method:'POST',headers:captureHeaders,body:JSON.stringify({attemptId:captureAttempt.attemptId})});
    assert.equal(abandoned.status,200);captureSocket.close();
    for (const internal of ['25','20','21','22','24']) {
      const denied=await fetch(`http://127.0.0.1:${port}/api/journey/dallas/mission-${internal}/launch`, {
        method:'POST',headers:{Origin:'capacitor://localhost',Cookie:`airport_chaos_session=${retiredSession.cookie}`,'Content-Type':'application/json'},body:'{}'});
      assert.equal(denied.status,403,`retired mission ${internal}`);
      assert.equal((await denied.json() as {error:string}).error,'Mission unavailable.');
    }
    for (const slot of missions.journeyCatalog.filter(slot=>slot.implementation==='placeholder')) {
      const denied=await fetch(`http://127.0.0.1:${port}/api/journey/dallas/${slot.id}/launch`, {
        method:'POST',headers:{Origin:'capacitor://localhost',Cookie:`airport_chaos_session=${retiredSession.cookie}`,'Content-Type':'application/json'},body:'{}'});
      assert.equal(denied.status,405,slot.id);
    }
    const rejected=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&protocol=${PROTOCOL_VERSION}&journeyAttempt=retired-ws`, {
      origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${retiredSession.cookie}`}});
    sockets.push(rejected);
    const rejectedMessages:any[]=[];
    rejected.on('message',d=>rejectedMessages.push(JSON.parse(String(d))));
    const closeCode=await new Promise<number>((resolve,reject)=>{rejected.once('close',resolve);rejected.once('error',reject);});
    assert.equal(closeCode,4003);
    assert.equal(rejectedMessages.some(message=>message.type==='journeyAttempt'),false);
    for(const f of fixtures) {
      const messages:any[]=[],socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&protocol=${PROTOCOL_VERSION}&pilotId=${f.session.pilotId}&journeyAttempt=${f.attemptId}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${f.session.cookie}`}});
      sockets.push(socket);socket.on('message',d=>messages.push(JSON.parse(String(d))));
      const until=Date.now()+5000;while(!messages.some(m=>m.type==='journeyAttempt')&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
      assert.equal(messages.find(m=>m.type==='journeyAttempt')?.attempt.canContinueAfterAd,true,JSON.stringify(messages));
      const post=()=>fetch(`http://127.0.0.1:${port}/api/rewarded-ads/journey-continue`,{method:'POST',headers:{Origin:'capacitor://localhost',Cookie:`airport_chaos_session=${f.session.cookie}`,'Content-Type':'application/json'},body:JSON.stringify({attemptId:f.attemptId,adAttemptId:f.adAttemptId})});
      const response=await post();assert.equal(response.status,200,await response.clone().text());
      const resumed=await response.json() as any;assert.equal(resumed.health,resumed.maxHealth);assert.ok(resumed.resumeFlight.position.y>300);
      const duplicate=await post();assert.equal(duplicate.status,200,'lost-response retry is idempotent');
      assert.equal(journeys.get(f.session.pilotId,f.attemptId)!.status,'RACING');
      assert.ok(messages.some(m=>m.type==='journeyAttempt'&&m.attempt.status==='RACING'));
      socket.close();
    }
  } finally {
    for(const socket of sockets)socket.close();child?.kill('SIGTERM');
    if(child&&child.exitCode===null)await new Promise(r=>child!.once('exit',r));
    db.close();rmSync(dir,{recursive:true,force:true});
    for(const suffix of ['', '-wal', '-shm'])rmSync(path+suffix,{force:true});
  }
});
