import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import WebSocket from 'ws';
import {DatabaseSync} from 'node:sqlite';
import {PlayerProfileStore} from './player-profiles.ts';
import {PilotSessionStore} from './session-auth.ts';
import {JourneyAttemptStore} from './journey-attempts.ts';
import {newCaptureCompetition,type CaptureOpponent} from './capture-competition.ts';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
import {journeyDallasCaptureThree01 as mission,journeyMissionOrder} from '../../shared/journey-mission.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=(s.address() as {port:number}).port;s.close(()=>resolve(port));});});}

test('live M21: six private opponents, real bullets, neutral territories, pause and isolation',{timeout:35000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'m21-competition-live-')),path=join(dir,'p.sqlite');
 const sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false),profiles=new PlayerProfileStore(path);
 const initialCredits=profiles.getOrCreate(identity.pilotId,'Pilot').credits;
 const spectatorIdentity=sessions.issue(undefined,false);profiles.getOrCreate(spectatorIdentity.pilotId,'Spectator');
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());
 db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(spectatorIdentity.pilotId,Date.now(),Date.now());
 const store=new JourneyAttemptStore(path,true),attempt=store.launch(identity.pilotId,'trainer',Date.now(),mission.id);
 for(const id of journeyMissionOrder)if(id!==mission.id)db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,id,id,Date.now(),1000);
 store.approach(identity.pilotId,attempt.attemptId);store.startTerritoryCapture(identity.pilotId,attempt.attemptId);
 let position={x:-40500,y:2500,z:-28050},sequence=0;
 const opponents=Array.from({length:6},(_,slot):CaptureOpponent=>({id:`bot:journey:${attempt.attemptId}:capture:${slot}`,aircraft:'trainer',level:slot<3?'EASY':'HARD',
  position:{x:position.x+Math.sin(slot)*700,y:2500,z:position.z+Math.cos(slot)*700},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-200},health:100,goal:slot%3}));
 store.saveCaptureFlight(identity.pilotId,attempt.attemptId,{position,rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-200},health:100,updatedAt:Date.now(),competition:newCaptureCompetition(opponents,Date.now())});
 const port=await freePort(),server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:new URL('../../',import.meta.url).pathname,env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='',socket:WebSocket|undefined,spectator:WebSocket|undefined,interval:ReturnType<typeof setInterval>|undefined;const packets:any[]=[];
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 async function wait(predicate:(p:any)=>boolean){for(let i=0;i<600;i++){const p=packets.find(predicate);if(p)return p;if(server.exitCode!==null)throw Error(logs);await sleep(25);}throw Error(`Missing packet; last packets ${JSON.stringify(packets.slice(-3))}\n${logs}`);}
 try{
  for(let i=0;i<400&&!logs.includes('healthy and listening')&&server.exitCode===null;i++)await sleep(25);
  assert.equal(server.exitCode,null,logs);
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',b=>packets.push(JSON.parse(String(b))));
  await wait(p=>p.type==='welcome');
  const assigned=await wait(p=>p.type==='journeyAttempt'&&p.attempt.captureOpponentIds?.length===6);
  assert.ok(assigned.attempt.captureTerritories.every((t:any)=>!t.controllerId));
  const publicPackets:any[]=[];
  spectator=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=free-fly&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${spectatorIdentity.cookie}`}});
  spectator.on('message',b=>publicPackets.push(JSON.parse(String(b))));
  for(let i=0;i<200&&!publicPackets.some(p=>p.type==='welcome');i++)await sleep(25);
  const publicWelcome=publicPackets.find(p=>p.type==='welcome');assert.ok(publicWelcome);
  assert.equal(publicWelcome.players.some((p:any)=>opponents.some(enemy=>enemy.id===p.playerId)),false,'private mission opponents cannot leak through public welcome');

  interval=setInterval(()=>{
   if(socket?.readyState!==WebSocket.OPEN)return;
   position={...position,z:position.z-15};
   socket.send(JSON.stringify({type:'state',position,rotation:{x:0,y:0,z:0},aircraftType:'trainer',stateSequence:++sequence}));
  },100);
  await wait(p=>(p.type==='state'||p.type==='playerState')&&opponents.some(enemy=>enemy.id===p.playerId));
  const shot=await wait(p=>p.type==='projectileSpawn'&&opponents.some(enemy=>enemy.id===p.ownerId));
  assert.ok(shot,'real authoritative opponent projectiles spawn');
  socket.send(JSON.stringify({type:'fire',aimHorizontal:0,aimVertical:0}));
  await wait(p=>p.type==='projectileSpawn'&&!opponents.some(enemy=>enemy.id===p.ownerId));
  socket.send(JSON.stringify({type:'journeyPause',attemptId:attempt.attemptId}));
  await wait(p=>p.type==='journeyPauseState'&&p.paused===true);
  const before=store.get(identity.pilotId,attempt.attemptId)!.captureFlight!.competition!;
  await sleep(500);
  assert.deepEqual(store.get(identity.pilotId,attempt.attemptId)!.captureFlight!.competition!.territories,before.territories);
  assert.equal(profiles.getOrCreate(identity.pilotId,'Pilot').credits,initialCredits);
  assert.equal(publicPackets.some(p=>opponents.some(enemy=>enemy.id===p.playerId||enemy.id===p.ownerId)),false,'private actor and projectile updates stay with the mission owner');
 }finally{
  if(interval)clearInterval(interval);socket?.terminate();spectator?.terminate();server.kill();await sleep(100);db.close();rmSync(dir,{recursive:true,force:true});
 }
});
