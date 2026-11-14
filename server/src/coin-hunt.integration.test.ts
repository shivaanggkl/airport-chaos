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
import {dallasCoinTrail as trail,coinCenterline} from '../../shared/collectible-trail.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=(s.address() as {port:number}).port;s.close(()=>resolve(port));});});}
test('live bonus round: validated pickups, airborne recovery, reconnect, cash-out and disconnected expiry', {timeout:35000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'coins-live-')),path=join(directory,'profiles.sqlite');
 const sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false);
 const profiles=new PlayerProfileStore(path);const initial=profiles.getOrCreate(identity.pilotId,'Pilot').credits;
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?, 'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());
 const store=new JourneyAttemptStore(path,true),attempt=store.launch(identity.pilotId,'trainer',Date.now(),mission.id);
 db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,'journey-dallas-15','previous-clear',Date.now(),1000);
 // A second durable round expires without ever opening a socket.
 const offline=sessions.issue(undefined,false);profiles.getOrCreate(offline.pilotId,'Offline');
 const offlineAttempt=store.launch(offline.pilotId,'trainer',Date.now(),mission.id);
 store.approach(offline.pilotId,offlineAttempt.attemptId);store.prepareCoinHunt(offline.pilotId,offlineAttempt.attemptId,1691.3);
 store.startCoinHunt(offline.pilotId,offlineAttempt.attemptId,Date.now()-mission.timeLimitMs+1000);
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
  const racing=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='RACING');assert.equal(racing.attempt.deadlineAt-racing.attempt.startedAt,mission.timeLimitMs);
  const launch=async(id:string)=>fetch(`http://127.0.0.1:${port}/api/journey/dallas/${id}/launch`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${port}`,Cookie:`airport_chaos_session=${identity.cookie}`},body:'{}'});
  const same=await launch('mission-coin-hunt-01');assert.equal(same.status,201);assert.equal((await same.json() as any).attempt.attemptId,attempt.attemptId);
  assert.equal((await launch('mission-01')).status,409);
  send({type:'coinPickup',attemptId:attempt.attemptId,coins:[...Array(1000).keys()],credits:999999});
  send({type:'state',position:{x:trail[89]!.x,y:position.y,z:trail[89]!.z},rotation:{x:0,y:heading,z:0},aircraftType:'trainer',stateSequence:++sequence});
  await sleep(100);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.coinHunt!.collected,0);
  // Accepted approach movement. No gameplay progress or wallet writes from forged claims.
  const began=performance.now();let last=began;
  while(performance.now()-began<4500){
   await sleep(50);const now=performance.now(),distance=1200*(now-last)/1000;last=now;
   const target=coinCenterline(.025),dx=target.x-position.x,dz=target.z-position.z,length=Math.hypot(dx,dz);
   position.x+=dx/length*distance;position.z+=dz/length*distance;heading=Math.atan2(-dx,-dz);state();
  }
  const progress=store.get(identity.pilotId,attempt.attemptId)!;assert.ok(progress.coinHunt!.collected>0);assert.equal(progress.status,'RACING');
  assert.equal(profiles.getOrCreate(identity.pilotId,'Pilot').credits,initial);
  send({type:'journeyCrash'});
  const recovery=await wait(p=>p.type==='respawn'&&p.bonusRecovery);assert.equal(recovery.lifeState,'alive');assert.equal(recovery.bonusRecovery.speed,1200);
  assert.equal(recovery.spawnPosition.y,progress.coinHunt!.altitude);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.coinHunt!.collected,progress.coinHunt!.collected);
  assert.equal(store.get(identity.pilotId,attempt.attemptId)!.deadlineAt,progress.deadlineAt);
  Object.assign(position,recovery.spawnPosition);heading=recovery.spawnHeading;state();await sleep(100);
  // Reconnect never pauses or restarts the bonus clock or manufactures a pickup segment.
  socket!.terminate();await sleep(150);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.pausedAt,null);
  packets.length=0;socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',b=>packets.push(JSON.parse(String(b))));
  const rejoined=await wait(p=>p.type==='welcome');assert.ok(rejoined.resumeFlight);assert.equal(rejoined.resumeFlight.onGround,false);
  const restored=await wait(p=>p.type==='journeyAttempt');assert.equal(restored.attempt.status,'RACING');assert.equal(restored.attempt.deadlineAt,progress.deadlineAt);
  assert.equal(restored.attempt.coinHunt.collected,store.get(identity.pilotId,attempt.attemptId)!.coinHunt!.collected);
  Object.assign(position,rejoined.resumeFlight.position);heading=rejoined.resumeFlight.rotation.y;sequence=0;state();await sleep(80);
  for(let n=0;n<10;n++){await sleep(50);position.x-=Math.sin(heading)*60;position.z-=Math.cos(heading)*60;state();}
  await sleep(80);assert.ok(store.get(identity.pilotId,attempt.attemptId)!.coinHunt!.collected>restored.attempt.coinHunt.collected,'reconnected flight continues collecting');
  const cashout=()=>fetch(`http://127.0.0.1:${port}/api/journey/dallas/mission-coin-hunt-01/abandon`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://127.0.0.1:${port}`,Cookie:`airport_chaos_session=${identity.cookie}`},body:JSON.stringify({attemptId:attempt.attemptId})});
  const response=await cashout();assert.equal(response.status,200);const completed=(await response.json() as any).attempt;
  assert.equal(completed.status,'COMPLETED');assert.equal(completed.firstClearCredits,completed.coinHunt.collected);
  assert.equal((await cashout()).status,200);assert.equal(profiles.getOrCreate(identity.pilotId,'Pilot').credits,initial+completed.coinHunt.collected);
  assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE idempotency_key=? AND pilot_id=?').get(`journey:${mission.id}`,identity.pilotId)!.n,1);
  assert.equal(store.get(offline.pilotId,offlineAttempt.attemptId)!.status,'COMPLETED');assert.equal(store.get(offline.pilotId,offlineAttempt.attemptId)!.firstClearCredits,0);
  console.log(`Live M12: ${completed.coinHunt.collected} accepted coins, exact cash-out, safe recovery/reconnect; offline zero-coin expiry completed.`);
 }finally{
  socket?.terminate();server.kill('SIGTERM');if(server.exitCode===null)await new Promise<void>(r=>server.once('exit',()=>r()));
  db.close();rmSync(directory,{recursive:true,force:true});
 }
});
