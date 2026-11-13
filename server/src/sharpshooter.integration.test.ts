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
import {journeyDallasSharpshooter01 as mission} from '../../shared/journey-mission.mjs';
import {sharpshooterTargetPose} from '../../shared/sharpshooter-target.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=(s.address() as {port:number}).port;s.close(()=>resolve(port));});});}
test('live authenticated M08: intro has no deadline; real rounds hit all three private targets, completion and cleanup', {timeout:45000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sharp-live-')),path=join(directory,'profiles.sqlite');
 const sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false);
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate(identity.pilotId,'Pilot');
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?, 'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());db.close();
 const store=new JourneyAttemptStore(path,true),attempt=store.launch(identity.pilotId,'trainer',Date.now(),mission.id);
 const accessDb=new DatabaseSync(path);accessDb.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,'journey-dallas-airport-hop-01','previous-clear',Date.now(),1000);accessDb.close();
 const port=await freePort(),server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='',socket:WebSocket|undefined,heartbeat:ReturnType<typeof setInterval>|undefined;
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 const packets:any[]=[];
 async function wait(predicate:(p:any)=>boolean){for(let n=0;n<400;n++){const packet=packets.find(predicate);if(packet)return packet;if(server.exitCode!==null)throw Error(logs);await sleep(25);}throw Error(`Missing packet; ${JSON.stringify(packets.slice(-8))}\n${logs}`);}
 try{
  for(let n=0;n<400&&!logs.includes('healthy and listening')&&server.exitCode===null;n++)await sleep(25);
  assert.equal(server.exitCode,null,logs);
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',b=>packets.push(JSON.parse(String(b))));
  const welcome=await wait(p=>p.type==='welcome');assert.ok(welcome.airborneSpawn);
  const approach=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='APPROACH');assert.equal(approach.attempt.deadlineAt,null);
  const position=welcome.airborneSpawn.position;let heading=welcome.airborneSpawn.heading,sequence=0;
  const send=(message:any)=>socket!.send(JSON.stringify(message));
  const state=()=>send({type:'state',position,rotation:{x:0,y:heading,z:0},aircraftType:'trainer',stateSequence:++sequence,velocity:{x:0,y:0,z:0}});
  heartbeat=setInterval(state,50);state();
  send({type:'journeyCountdownComplete',attemptId:attempt.attemptId});
  const racing=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='RACING');assert.equal(racing.attempt.deadlineAt-racing.attempt.startedAt,180000);
  for(let stage=0;stage<3;stage++){
   const current=await wait(p=>p.type==='journeyAttempt'&&p.attempt.sharpshooter?.destroyed===stage&&p.attempt.status==='RACING');
   const t=current.attempt.sharpshooter.target;
   // Turn through accepted states; no teleport or client hit/completion event.
   const desired=t.heading;
   while(Math.abs(desired-heading)>.015){heading+=Math.sign(desired-heading)*.015;state();await sleep(30);}heading=desired;state();
   await sleep(100);
   for(let round=0;round<18;round++){
    const pose=sharpshooterTargetPose(t,Date.now()-racing.attempt.startedAt,{x:0,y:0,z:0});
    heading=Math.atan2(-(pose.x-position.x),-(pose.z-position.z));state();
    send({type:'fire',clientShotId:`stage-${stage}-${round}`});await sleep(220);
    if(packets.some(p=>p.type==='journeyAttempt'&&p.attempt.sharpshooter?.destroyed===stage+1))break;
   }
   await wait(p=>p.type==='journeyAttempt'&&p.attempt.sharpshooter?.destroyed===stage+1);
  }
  const completed=await wait(p=>p.type==='journeyAttempt'&&p.attempt.status==='COMPLETED');
  assert.equal(completed.attempt.firstClearCredits,800);assert.equal(completed.attempt.sharpshooter.target,null);
  assert.ok(packets.filter(p=>p.type==='projectileRemove'&&p.impactPosition).length>=3);
  assert.equal(store.get(identity.pilotId,attempt.attemptId)!.status,'COMPLETED');
  assert.ok(!packets.some(p=>p.type==='damage'),'no aircraft combat or target destruction rewards');
 }finally{
  if(heartbeat)clearInterval(heartbeat);socket?.terminate();server.kill('SIGTERM');
  if(server.exitCode===null)await new Promise<void>(r=>server.once('exit',()=>r()));
  rmSync(directory,{recursive:true,force:true});
 }
});
