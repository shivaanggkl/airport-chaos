import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import WebSocket from 'ws';
import {DatabaseSync} from 'node:sqlite';
import {PlayerProfileStore} from './player-profiles.js';
import {PilotSessionStore} from './session-auth.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {cityAirports} from '../../shared/city-airports.mjs';
import {dallasElevationAt} from './dallas-elevation.js';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
import {journeyDallasTerritoryDefense01 as mission,journeyMissionOrder} from '../../shared/journey-mission.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=(s.address() as {port:number}).port;s.close(()=>resolve(port));});});}
test('live Ch5 M2: private staging, repeated DFW invader takeoffs, progress, reconnect and failure cleanup',{timeout:60000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'m16-live-')),path=join(dir,'p.sqlite'),sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false),profiles=new PlayerProfileStore(path);const initialCredits=profiles.getOrCreate(identity.pilotId,'Pilot').credits;
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());
 const store=new JourneyAttemptStore(path,true);
 for(const id of journeyMissionOrder)if(id!==mission.id)db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,id,id,Date.now(),1000);
 const attempt=store.launch(identity.pilotId,'trainer',Date.now(),mission.id);
 const port=await freePort(),server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='',socket:WebSocket|undefined;server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const packets:any[]=[];
 async function wait(predicate:(p:any)=>boolean,timeoutMs=10000){for(let i=0;i<Math.ceil(timeoutMs/25);i++){const p=packets.find(predicate);if(p)return p;if(server.exitCode!==null)throw Error(logs);await sleep(25);}throw Error(`Missing packet: ${JSON.stringify(packets.slice(-4))}\n${logs}`);}
 try{
  for(let i=0;i<400&&!logs.includes('healthy and listening')&&server.exitCode===null;i++)await sleep(25);assert.equal(server.exitCode,null,logs);
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});socket.on('message',b=>packets.push(JSON.parse(String(b))));
  const welcome=await wait(p=>p.type==='welcome');assert.equal(welcome.airborneSpawn,undefined);assert.equal(welcome.spawnAirportId,'dfw');
  const airport=cityAirports.dallas.find(item=>item.id==='dfw')!;const position={...welcome.runwaySpawn.position};let sequence=0;const state=()=>socket!.send(JSON.stringify({type:'state',position:{...position},rotation:{x:0,y:welcome.runwaySpawn.heading,z:0},aircraftType:'trainer',stateSequence:++sequence,velocity:{x:0,y:0,z:0}}));
  state();const assigned=await wait(p=>p.type==='journeyAttempt'&&p.attempt.targetId);let id=assigned.attempt.targetId;const staged=await wait(p=>(p.type==='playerState'||p.type==='state')&&p.playerId===id);assert.equal(staged.position.x,-22000);assert.equal(staged.position.z,-28050);assert.equal(staged.health,300);assert.equal(staged.maxHealth,300);assert.equal(staged.equippedCosmetics['livery:privateJet'],'nightowl-sunset-red');
  await sleep(900);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.deadlineAt,null);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.defenseMs,0);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.enemyCaptureMs,0);
  assert.ok(packets.filter(p=>(p.type==='playerState'||p.type==='state')&&p.playerId===id).length>=2,'frozen real aircraft keeps receiving fresh presentation snapshots');
  for(const p of packets.filter(p=>(p.type==='playerState'||p.type==='state')&&p.playerId===id)){assert.equal(p.position.x,-22000);assert.deepEqual(p.velocity,{x:0,y:0,z:0});}
  socket.send(JSON.stringify({type:'journeyCountdownComplete',attemptId:attempt.attemptId}));const go=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='RACING');assert.equal(go.attempt.deadlineAt-go.attempt.startedAt,mission.timeLimitMs);
  for(let i=0;i<16;i++){await sleep(100);state();}
  const progress=store.get(identity.pilotId,attempt.attemptId)!;assert.equal(progress.captureMs,0);assert.equal(progress.defenseMs,0);assert.equal(progress.enemyCaptureMs,0);assert.equal(profiles.getOrCreate(identity.pilotId,'Pilot').credits,initialCredits,'private defense cannot award multiplayer territory credits');assert.ok(packets.some(p=>(p.type==='playerState'||p.type==='state')&&p.playerId===id&&p.position.x<-22200),JSON.stringify(packets.filter(p=>(p.type==='playerState'||p.type==='state')&&p.playerId===id).slice(-3).map(p=>p.position)));assert.equal(packets.some(p=>p.type==='projectileSpawn'&&p.ownerId===id),false,'no firing against a runway-protected player');
  const before=progress.defenseMs;socket.send(JSON.stringify({type:'state',position:{x:0,y:position.y,z:0},rotation:{x:0,y:welcome.runwaySpawn.heading,z:0},aircraftType:'trainer',stateSequence:++sequence}));await sleep(900);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.defenseMs,before,'rejected teleport cannot capture or defend');
  for(let round=0;round<2;round++){
   const previousId=id,previous=store.get(identity.pilotId,attempt.attemptId)!;
   // Seed the authoritative post-destruction marker; the damage path is covered separately.
   db.prepare('UPDATE journey_attempts SET crossfire_kills=1 WHERE attempt_id=?').run(attempt.attemptId);
   const respawn=await wait(p=>p.type==='journeyAttempt'&&p.attempt.targetId&&p.attempt.targetId!==previousId&&p.attempt.crossfireKills===0);
   id=respawn.attempt.targetId;
   const born=await wait(p=>p.type==='playerState'&&p.playerId===id);
   assert.equal(born.position.x,airport.x);assert.equal(born.position.z,airport.z+airport.runwayLength*.30);assert.equal(born.health,300);
   assert.equal(respawn.attempt.captureMs,previous.captureMs);assert.equal(respawn.attempt.defenseMs,previous.defenseMs);assert.equal(respawn.attempt.deadlineAt,previous.deadlineAt);
   await wait(p=>p.type==='remove'&&p.playerId===previousId);
   const fly=await wait(p=>(p.type==='playerState'||p.type==='state')&&p.playerId===id&&p.position.y>born.position.y+(round===0?300:100),30000);
   assert.ok(fly.position.z<born.position.z,'DFW runway takeoff moves north and climbs');
   packets.splice(0,packets.length);
  }
  const originalDeadline=store.get(identity.pilotId,attempt.attemptId)!.deadlineAt!;
  socket.terminate();await sleep(150);packets.length=0;
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});socket.on('message',b=>packets.push(JSON.parse(String(b))));
  const rejoined=await wait(p=>p.type==='welcome');assert.ok(rejoined.resumeFlight);const resumed=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='RACING');
  assert.equal(resumed.attempt.targetId,id);assert.equal(resumed.attempt.defenseMs,before);assert.ok(resumed.attempt.deadlineAt>=originalDeadline);assert.equal(resumed.attempt.targetHealth,300);
  socket.send(JSON.stringify({type:'journeyResume',attemptId:attempt.attemptId}));await wait(p=>p.type==='journeyPauseState'&&p.paused===false);
  db.prepare('UPDATE journey_attempts SET deadline_at=? WHERE attempt_id=?').run(Date.now()-1,attempt.attemptId);
  const failed=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='FAILED');assert.equal(failed.attempt.failureReason,'TIME_UP');await wait(p=>p.type==='remove'&&p.playerId===id);assert.equal(store.progress(identity.pilotId,mission.id).completed,false);
 }finally{socket?.terminate();server.kill();await sleep(100);db.close();rmSync(dir,{recursive:true,force:true});}
});
