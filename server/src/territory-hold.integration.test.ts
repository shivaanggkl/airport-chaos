import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';
import {PlayerProfileStore} from './player-profiles.ts';
import {PilotSessionStore} from './session-auth.ts';
import {JourneyAttemptStore} from './journey-attempts.ts';
import {journeyDallasTerritoryHold01 as mission} from '../../shared/journey-mission.mjs';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('live M4 launch prepares six assigned enemies and three owned territories without leaking to Free Fly',{timeout:35000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hold-live-')),path=join(dir,'profiles.sqlite');
 const sessions=new PilotSessionStore(path),identity=sessions.issue(undefined,false),other=sessions.issue(undefined,false);
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate(identity.pilotId,'Pilot');profiles.getOrCreate(other.pilotId,'Observer');
 new JourneyAttemptStore(path);
 const db=new DatabaseSync(path),now=Date.now();
 for(const pilot of [identity.pilotId,other.pilotId])db.prepare("INSERT OR REPLACE INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at,required) VALUES(?,'tutorial_v1','completed',?,?,0)").run(pilot,now,now);
 for(const id of ['journey-dallas-01','journey-dallas-capture-three-01'])db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(identity.pilotId,id,id,now,1000);
 db.close();
 const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as any).port;s.close(()=>resolve(p));});});
 const server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 let ws:WebSocket|undefined,spectator:WebSocket|undefined;const packets:any[]=[],publicPackets:any[]=[];
 const wait=async(list:any[],predicate:(p:any)=>boolean)=>{for(let i=0;i<400;i++){const p=list.find(predicate);if(p)return p;await sleep(25);}throw Error(logs+'\n'+JSON.stringify(list.slice(-2)));};
 const headers=(cookie:string)=>({Cookie:`airport_chaos_session=${cookie}`,Origin:`http://127.0.0.1:${port}`,'Content-Type':'application/json'});
 try{
  for(let i=0;i<400&&!logs.includes('healthy and listening')&&server.exitCode===null;i++)await sleep(25);
  assert.equal(server.exitCode,null,logs);
  const launched=await fetch(`http://127.0.0.1:${port}/api/journey/dallas/mission-territory-hold-01/launch`,{method:'POST',headers:headers(identity.cookie),body:'{}'});
  assert.equal(launched.status,201,await launched.clone().text());const a=(await launched.json() as any).attempt;
  ws=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=missions&journeyAttempt=${a.attemptId}&protocol=${PROTOCOL_VERSION}`,{headers:headers(identity.cookie),origin:`http://127.0.0.1:${port}`});ws.on('message',b=>packets.push(JSON.parse(String(b))));
  const welcome=await wait(packets,p=>p.type==='welcome');assert.equal(welcome.spawnAirportId,'dfw');assert.equal(welcome.airborneSpawn,undefined);
  const briefing=await wait(packets,p=>p.type==='journeyAttempt'&&p.attempt.status==='APPROACH'&&p.attempt.captureOpponentIds?.length===6);
  assert.equal(briefing.attempt.deadlineAt,null);assert.equal(briefing.attempt.captureTerritories.length,3);
  for(const [i,t]of briefing.attempt.captureTerritories.entries()){
   assert.equal(t.id,mission.territoryIds[i]);assert.equal(t.controllerName,mission.owners[i]!.name);assert.ok(t.controllerId);assert.equal(t.captureProgress,0);
  }
  ws.send(JSON.stringify({type:'fire'}));await sleep(200);
  const store=new JourneyAttemptStore(path);assert.equal(store.get(identity.pilotId,a.attemptId)!.status,'APPROACH');assert.equal(store.get(identity.pilotId,a.attemptId)!.defenseMs,0);
  spectator=new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=free-fly&protocol=${PROTOCOL_VERSION}`,{headers:headers(other.cookie),origin:`http://127.0.0.1:${port}`});spectator.on('message',b=>publicPackets.push(JSON.parse(String(b))));
  const publicWelcome=await wait(publicPackets,p=>p.type==='welcome');
  const ids=new Set(briefing.attempt.captureOpponentIds);
  assert.ok(!publicWelcome.players.some((p:any)=>ids.has(p.playerId)));
  await sleep(300);assert.ok(!publicPackets.some(p=>ids.has(p.playerId)||ids.has(p.ownerId)));
  const progress=await fetch(`http://127.0.0.1:${port}/api/journey/dallas`,{headers:headers(identity.cookie)});assert.equal((await progress.json() as any).missionTerritoryHold01.eligible,true);
 }finally{ws?.terminate();spectator?.terminate();server.kill('SIGTERM');if(server.exitCode===null)await new Promise<void>(resolve=>server.once('exit',()=>resolve()));rmSync(dir,{recursive:true,force:true});}
});
