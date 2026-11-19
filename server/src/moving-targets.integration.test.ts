import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';
import {PlayerProfileStore} from './player-profiles.js';
import {PilotSessionStore} from './session-auth.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
import {journeyDallasSharpshooter02 as mission} from '../../shared/journey-mission.mjs';
import {movingTargetPlacements} from '../../shared/sharpshooter-target.mjs';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('live mission two sends all six mapped targets, ignores intro shots and starts its clock only after handoff',{timeout:45000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'moving-live-')),path=join(directory,'profiles.sqlite');
 const identity=new PilotSessionStore(path).issue(undefined,false);
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate(identity.pilotId,'Pilot');
 const store=new JourneyAttemptStore(path);
 const db=new DatabaseSync(path),now=Date.now();
 db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(identity.pilotId,now,now);
 for(const id of ['journey-dallas-01','journey-dallas-sharpshooter-01'])db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,id,id,now,1000);
 db.close();
 let attempt:ReturnType<JourneyAttemptStore['launch']>;
 const port=await new Promise<number>(resolve=>{const listener=createServer();listener.listen(0,'127.0.0.1',()=>{const port=(listener.address() as {port:number}).port;listener.close(()=>resolve(port));});});
 const server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='',socket:WebSocket|undefined;const packets:any[]=[];server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 const wait=async(predicate:(packet:any)=>boolean)=>{for(let i=0;i<400;i++){const found=packets.find(predicate);if(found)return found;await sleep(25);}throw Error(logs+'\n'+JSON.stringify(packets.slice(-3)));};
 try{
  for(let i=0;i<400&&!logs.includes('Airport Chaos server')&&server.exitCode===null;i++)await sleep(25);
  assert.equal(server.exitCode,null,logs);
  const launched=await fetch(`http://127.0.0.1:${port}/api/journey/dallas/mission-sharpshooter-02/launch`,{
    method:'POST',headers:{Cookie:`airport_chaos_session=${identity.cookie}`,Origin:`http://127.0.0.1:${port}`,'Content-Type':'application/json'},body:'{}',
  });
  assert.equal(launched.status,201,await launched.clone().text());
  attempt=(await launched.json() as {attempt:ReturnType<JourneyAttemptStore['launch']>}).attempt;
  assert.equal(attempt.missionId,mission.id);

  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',data=>packets.push(JSON.parse(String(data))));
  const welcome=await wait(packet=>packet.type==='welcome');assert.ok(welcome.airborneSpawn);
  const approach=await wait(packet=>packet.type==='journeyAttempt'&&packet.attempt.status==='APPROACH'&&packet.attempt.sharpshooter?.targets?.length===6);
  assert.equal(approach.attempt.deadlineAt,null);
  for(const [index,t]of approach.attempt.sharpshooter.targets.entries()){assert.equal(t.x,movingTargetPlacements[index]!.x);assert.equal(t.z,movingTargetPlacements[index]!.z);assert.equal(t.motionAmplitude,index<4?450:0);}
  socket.send(JSON.stringify({type:'fire',clientShotId:'intro-shot'}));await sleep(100);assert.equal(store.get(identity.pilotId,attempt.attemptId)!.sharpshooter!.destroyed,0);
  socket.send(JSON.stringify({type:'state',position:welcome.airborneSpawn.position,rotation:{x:0,y:welcome.airborneSpawn.heading,z:0},aircraftType:'trainer',stateSequence:1,velocity:{x:0,y:0,z:0}}));
  socket.send(JSON.stringify({type:'journeyCountdownComplete',attemptId:attempt.attemptId}));
  const racing=await wait(packet=>packet.type==='journeyAttempt'&&packet.attempt.status==='RACING');
  assert.equal(racing.attempt.deadlineAt-racing.attempt.startedAt,180000);assert.equal(racing.attempt.sharpshooter.targets.length,6);
  const response=await fetch(`http://127.0.0.1:${port}/api/journey/dallas`,{headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  assert.equal(response.status,200);const progress=await response.json() as any;assert.equal(progress.missionSharpshooter02.eligible,true);
 }finally{socket?.terminate();server.kill('SIGTERM');if(server.exitCode===null)await new Promise<void>(resolve=>server.once('exit',()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});
