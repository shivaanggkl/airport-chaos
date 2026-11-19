import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';
import {PilotSessionStore} from './session-auth.js';
import {PlayerProfileStore} from './player-profiles.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {journeyCategorySlots} from '../../shared/journey-categories.mjs';
import {journeyMissionOrder} from '../../shared/journey-mission.mjs';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test('Ch5 regular missions start at DFW and all five chapter bonuses use the same airborne launch',{timeout:35000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ch5-start-')),path=join(dir,'profiles.sqlite');
 const sessions=new PilotSessionStore(path),profiles=new PlayerProfileStore(path);new JourneyAttemptStore(path);
 const slots=[...journeyCategorySlots.filter(s=>s.categoryId==='territory-missions'&&s.kind==='main'&&s.implementation==='playable'),...journeyCategorySlots.filter(s=>s.kind==='bonus')];
 const db=new DatabaseSync(path),now=Date.now();
 const identities=slots.map(()=>{const identity=sessions.issue(undefined,false);profiles.getOrCreate(identity.pilotId,'Pilot');
  db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(identity.pilotId,now,now);
  for(const id of journeyMissionOrder)db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,id,id,now,1000);
  return identity;});db.close();
 const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as any).port;s.close(()=>resolve(p));});});
 const server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const sockets:WebSocket[]=[];
 const base=`http://127.0.0.1:${port}`,headers=(i:number)=>({Cookie:`airport_chaos_session=${identities[i]!.cookie}`,Origin:base,'Content-Type':'application/json'});
 try{
  for(let i=0;i<400&&!logs.includes('healthy and listening')&&server.exitCode===null;i++)await sleep(25);
  assert.ok(logs.includes('healthy and listening'),logs);
  const launch=(i:number,body:unknown)=>fetch(`${base}/api/journey/dallas/${slots[i]!.missionId.replace('journey-dallas-','mission-')}/launch`,{method:'POST',headers:headers(i),body:JSON.stringify(body)});
  for(const body of [{journeySlotId:'journey-dallas-coin-hunt-05'},{journeySlotId:'placeholder-dallas-territory-missions-5'},{journeySlotId:8},{unexpected:true}])assert.equal((await launch(0,body)).status,400);
  let bonusSpawn:unknown;
  for(const [i,slot]of slots.entries()){
   const response=await launch(i,{});assert.equal(response.status,201,await response.clone().text());const attempt=(await response.json() as any).attempt;
   assert.equal(attempt.missionId,slot.missionId);
   const packets:any[]=[];const ws=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${attempt.attemptId}&protocol=${PROTOCOL_VERSION}`,{origin:base,headers:headers(i)});sockets.push(ws);ws.on('message',b=>packets.push(JSON.parse(String(b))));
   for(let n=0;n<300&&!packets.some(p=>p.type==='welcome');n++)await sleep(20);
   const welcome=packets.find(p=>p.type==='welcome');assert.ok(welcome,logs+JSON.stringify(packets.slice(-1)));
   if(slot.kind==='main'){assert.equal(welcome.spawnAirportId,'dfw',slot.id);assert.equal(welcome.airborneSpawn,undefined,slot.id);const dfw=cityAirports.dallas.find(a=>a.id==='dfw')!;assert.equal(welcome.runwaySpawn.heading,dfw.heading+Math.PI);assert.ok(welcome.runwaySpawn.position.z<dfw.z);}
   else {assert.equal(welcome.runwaySpawn,undefined);assert.ok(welcome.airborneSpawn,'all chapters retain the identical airborne bonus');if(bonusSpawn)assert.deepEqual(welcome.airborneSpawn,bonusSpawn);else bonusSpawn=welcome.airborneSpawn;}
   for(let n=0;n<100&&!packets.some(p=>p.type==='journeyAttempt');n++)await sleep(20);
   assert.equal(packets.find(p=>p.type==='journeyAttempt').attempt.missionId,slot.missionId);
   ws.terminate();
  }
 }finally{for(const ws of sockets)ws.terminate();server.kill('SIGTERM');if(server.exitCode===null)await new Promise<void>(resolve=>server.once('exit',()=>resolve()));rmSync(dir,{recursive:true,force:true});}
});
