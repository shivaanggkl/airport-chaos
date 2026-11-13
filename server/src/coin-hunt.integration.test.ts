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
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
import {journeyDallasCoinHunt01 as mission} from '../../shared/journey-mission.mjs';
import {dallasCoinTrail as trail} from '../../shared/collectible-trail.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=(s.address() as {port:number}).port;s.close(()=>resolve(port));});});}
test('live M12: accepted Bluejay cruise collects 90; no fabricated pickups, teleport rewards or premature wallet deposits', {timeout:65000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'coins-live-')),path=join(directory,'profiles.sqlite');
 const sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false);
 const profiles=new PlayerProfileStore(path);const initial=profiles.getOrCreate(identity.pilotId,'Pilot').credits;
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?, 'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());
 const store=new JourneyAttemptStore(path,true),attempt=store.launch(identity.pilotId,'trainer',Date.now(),mission.id);
 db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,'journey-dallas-15','previous-clear',Date.now(),1000);
 const port=await freePort(),server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='',socket:WebSocket|undefined;
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 const packets:any[]=[];
 async function wait(predicate:(p:any)=>boolean){for(let n=0;n<400;n++){const packet=packets.find(predicate);if(packet)return packet;if(server.exitCode!==null)throw Error(logs);await sleep(25);}throw Error(`Missing packet; ${JSON.stringify(packets.slice(-6))}\n${logs}`);}
 try{
  for(let n=0;n<400&&!logs.includes('healthy and listening')&&server.exitCode===null;n++)await sleep(25);
  assert.equal(server.exitCode,null,logs);
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',b=>packets.push(JSON.parse(String(b))));
  const welcome=await wait(p=>p.type==='welcome');assert.ok(welcome.airborneSpawn);
  const approach=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='APPROACH');assert.equal(approach.attempt.deadlineAt,null);
  assert.equal(approach.attempt.coinHunt.collected,0);
  const position={...welcome.airborneSpawn.position};let heading=welcome.airborneSpawn.heading,sequence=0;
  const send=(message:any)=>socket!.send(JSON.stringify(message));
  const state=()=>send({type:'state',position:{...position},rotation:{x:0,y:heading,z:0},aircraftType:'trainer',stateSequence:++sequence,velocity:{x:0,y:0,z:0}});
  state();await sleep(100);send({type:'journeyCountdownComplete',attemptId:attempt.attemptId});
  const racing=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='RACING');assert.equal(racing.attempt.deadlineAt-racing.attempt.startedAt,240000);
  send({type:'coinPickup',attemptId:attempt.attemptId,coins:[...Array(100).keys()],credits:999999});
  send({type:'state',position:{x:trail[89]!.x,y:position.y,z:trail[89]!.z},rotation:{x:0,y:heading,z:0},aircraftType:'trainer',stateSequence:++sequence});
  await sleep(100);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.coinHunt!.collected,0);
  // Continuous 50 ms accepted movement at unchanged Bluejay MED cruise speed.
  let waypoint=0;const began=performance.now();let last=began;
  while(performance.now()-began<42000&&store.get(identity.pilotId,attempt.attemptId)!.status!=='COMPLETED'){
   await sleep(50);const now=performance.now(),distance=1222*(now-last)/1000;last=now;
   const target=trail[waypoint]!,dx=target.x-position.x,dz=target.z-position.z,length=Math.hypot(dx,dz);
   const travel=Math.min(distance,length);position.x+=dx/length*travel;position.z+=dz/length*travel;
   heading=Math.atan2(-dx,-dz);state();if(length<=distance&&waypoint<99)waypoint++;
   const progress=store.get(identity.pilotId,attempt.attemptId)!;
   if(progress.status!=='COMPLETED')assert.equal(profiles.getOrCreate(identity.pilotId,'Pilot').credits,initial);
  }
  const completed=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='COMPLETED');
  assert.equal(completed.attempt.coinHunt.collected,90);assert.equal(completed.attempt.firstClearCredits,900);
  assert.equal(profiles.getOrCreate(identity.pilotId,'Pilot').credits,initial+900);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=?').get(`journey:${mission.id}`)!.n,1);
  console.log(`Live M12 Bluejay MED completion: ${((performance.now()-began)/1000).toFixed(2)} s; 90 accepted pickups, +900 Credits`);
 }finally{
  socket?.terminate();server.kill('SIGTERM');if(server.exitCode===null)await new Promise<void>(r=>server.once('exit',()=>r()));
  db.close();rmSync(directory,{recursive:true,force:true});
 }
});
