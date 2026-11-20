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
import {newCaptureCompetition,type CaptureOpponent} from './capture-competition.js';
import {cityAirports} from '../../shared/city-airports.mjs';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
import {journeyDallasTerritoryDomination01 as mission,journeyMissionOrder} from '../../shared/journey-mission.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=(s.address() as {port:number}).port;s.close(()=>resolve(port));});});}

test('live Ch5 M5: nine defeated opponents respect the full respawn buffer then take off from DFW',{timeout:90000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'m21-competition-live-')),path=join(dir,'p.sqlite');
 const sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false),profiles=new PlayerProfileStore(path);
 profiles.getOrCreate(identity.pilotId,'Pilot');
 const db=new DatabaseSync(path);db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(identity.pilotId,Date.now(),Date.now());
 const store=new JourneyAttemptStore(path,true),attempt=store.launch(identity.pilotId,'trainer',Date.now(),mission.id);
 for(const id of journeyMissionOrder)if(id!==mission.id)db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,id,id,Date.now(),1000);
 store.approach(identity.pilotId,attempt.attemptId);store.startTerritoryCapture(identity.pilotId,attempt.attemptId);
 let position={x:-40500,y:2500,z:-28050},sequence=0;
 const opponents=Array.from({length:9},(_,slot):CaptureOpponent=>({id:`bot:journey:${attempt.attemptId}:capture:${slot}`,aircraft:mission.owners[slot]?.aircraft??'fighter',level:'HARD',
  position:{x:position.x+Math.sin(slot)*700,y:2500,z:position.z+Math.cos(slot)*700},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-200},health:0,respawnRemainingMs:mission.opponentRespawnMs,goal:slot%6,role:slot<6?'owner':'attacker',name:mission.owners[slot]?.name??`HUNTER ${slot-1}`}));
 store.saveCaptureFlight(identity.pilotId,attempt.attemptId,{position,rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-200},health:100,updatedAt:Date.now(),competition:{...newCaptureCompetition(opponents,Date.now()),territories:mission.territoryIds.map((id,i)=>({id,ownerId:opponents[i]!.id,captureMs:0,contested:false}))}});
 const port=await freePort(),server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:new URL('../../',import.meta.url).pathname,env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='',socket:WebSocket|undefined,interval:ReturnType<typeof setInterval>|undefined;const packets:any[]=[];
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 async function wait(predicate:(p:any)=>boolean){for(let i=0;i<1600;i++){const p=packets.find(predicate);if(p)return p;if(server.exitCode!==null)throw Error(logs);await sleep(25);}throw Error(`Missing packet; last packets ${JSON.stringify(packets.slice(-3))}\n${logs}`);}
 try{
  for(let i=0;i<400&&!logs.includes('healthy and listening')&&server.exitCode===null;i++)await sleep(25);
  assert.equal(server.exitCode,null,logs);
  socket=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identity.cookie}`}});
  socket.on('message',b=>packets.push(JSON.parse(String(b))));
  await wait(p=>p.type==='welcome');
  const dfw=cityAirports.dallas.find(a=>a.id==='dfw')!;
  const started=Date.now();
  interval=setInterval(()=>{
   if(socket?.readyState!==WebSocket.OPEN)return;
   position={...position,z:position.z-15};
   socket.send(JSON.stringify({type:'state',position,rotation:{x:0,y:0,z:0},aircraftType:'trainer',stateSequence:++sequence}));
  },100);
  await sleep(30000);
  assert.equal(packets.some(p=>p.type==='playerState'&&opponents.some(enemy=>enemy.id===p.playerId)&&p.health>0),false,'opponents remain defeated after the old 30-second delay');
  const assigned=await wait(p=>p.type==='journeyAttempt'&&p.attempt.captureOpponentIds?.length===9);
  assert.equal(assigned.attempt.status,'RACING','respawns do not complete the takeover mission');
  for(const enemy of opponents){
   const born=await wait(p=>p.type==='playerState'&&p.playerId===enemy.id&&p.health>0);
   assert.ok(Date.now()-started>=59000,'a full fresh 60-second buffer precedes resurrection');
   assert.equal(born.position.x,dfw.x);assert.equal(born.position.z,dfw.z+dfw.runwayLength*.3);
  }
  const born=packets.find(p=>p.type==='playerState'&&p.playerId===opponents[0]!.id&&p.health>0);
  await wait(p=>p.type==='state'&&p.playerId===opponents[0]!.id&&p.position.y>born.position.y+100);
 }finally{
  if(interval)clearInterval(interval);socket?.terminate();server.kill();await sleep(100);db.close();rmSync(dir,{recursive:true,force:true});
 }
});
