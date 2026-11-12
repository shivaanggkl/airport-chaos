/** Local, authenticated representative memory check; never connects to Render. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import WebSocket from 'ws';
import {PlayerProfileStore} from '../server/src/player-profiles.js';
import {PilotSessionStore} from '../server/src/session-auth.js';
import {JourneyAttemptStore} from '../server/src/journey-attempts.js';
import * as missions from '../shared/journey-mission.mjs';
import {cityAirports} from '../shared/city-airports.mjs';
import {dallasElevationAt} from '../server/src/dallas-elevation.js';
import {PROTOCOL_VERSION} from '../shared/protocol.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const dir=mkdtempSync('/private/tmp/airport-chaos-memory-'),path=dir+'.sqlite';
const profiles=new PlayerProfileStore(path),sessions=new PilotSessionStore(path),journeys=new JourneyAttemptStore(path,true),db=new DatabaseSync(path);
const fixtures:{mode:string;city:string;cookie:string;attemptId?:string}[]=[];
for(const [i,mode] of ['free-fly','free-fly','training','air-assault','sky-duel','sky-duel',...Array(8).fill('missions')].entries()){
  let identity=sessions.issue(undefined,false);profiles.getOrCreate(identity.pilotId,`Memory ${i}`);
  if(mode==='sky-duel'){
    const signed=await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${identity.cookie}`)!,`memory-${i}@example.com`,'local memory test password');
    assert.ok(signed.ok&&signed.cookie);identity={...identity,cookie:signed.cookie!};
    db.prepare('UPDATE player_profiles SET credits=5000 WHERE pilot_id=?').run(identity.pilotId);
  }
  let attemptId:string|undefined;
  if(mode==='training'){profiles.setTutorialState(identity.pilotId,'started');profiles.startTrainingSlides(identity.pilotId);}
  if(mode==='missions'){
    db.prepare("UPDATE pilot_tutorial_state SET status='completed',completed_at=? WHERE pilot_id=?").run(Date.now(),identity.pilotId);
    const mission=[missions.journeyDallas25,missions.journeyDallas20,missions.journeyDallas21,missions.journeyDallas22,missions.journeyDallas23,missions.journeyDallas19,missions.journeyDallas07,missions.journeyDallas12][i-6]!;
    const now=Date.now(),attempt=journeys.launch(identity.pilotId,'trainer',now-4000,mission.id);attemptId=attempt.attemptId;

  }
  fixtures.push({mode:mode==='training'?'missions':mode,city:mode==='training'?'milwaukee':'dallas',cookie:identity.cookie,attemptId});
}
const probe=join(dir,'probe.cjs');
writeFileSync(probe,`const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const start=performance.now(),samples=[];let peakHeap=0,peakRss=0;const original=setInterval,lag=monitorEventLoopDelay({resolution:10});lag.enable();
global.setInterval=(fn,ms,...args)=>original((...a)=>{const t=performance.now();try{return fn(...a)}finally{if(samples.length<100000)samples.push(performance.now()-t)}},ms,...args);
original(()=>{const m=process.memoryUsage();peakHeap=Math.max(peakHeap,m.heapUsed);peakRss=Math.max(peakRss,m.rss);},100);
process.on('message',m=>{if(m.type==='metrics'){global.gc();const p=process.memoryUsage(),s=samples.slice().sort((a,b)=>a-b);process.send({type:'metrics',heapMiB:p.heapUsed/1048576,rssMiB:p.rss/1048576,peakHeapMiB:peakHeap/1048576,peakRssMiB:Math.max(peakRss,process.resourceUsage().maxRSS*1024)/1048576,timerP95Ms:s[Math.floor(s.length*.95)]||0,eventLoopP95Ms:lag.percentile(95)/1e6,elapsedMs:performance.now()-start});}});`);
const net=createServer();await new Promise<void>(r=>net.listen(0,'127.0.0.1',r));const port=(net.address() as {port:number}).port;await new Promise<void>(r=>net.close(()=>r()));
const child=spawn(process.execPath,['--expose-gc','--require',probe,process.env.P0_SERVER_ENTRY??'server/dist/index.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,AIRPORT_CHAOS_LOCAL_QA_UNLOCK_ALL:'true',AIRPORT_CHAOS_DEV_QA:'1',AIRPORT_CHAOS_SKY_DUEL_STAKES_ENABLED:'1',NODE_ENV:'test'},stdio:['ignore','pipe','pipe','ipc']});
let log='';child.stdout!.on('data',d=>{log+=d;});child.stderr!.on('data',d=>{log+=d;});
const clients:{socket:WebSocket;messages:any[];pose:any;sequence:number}[]=[];
const wait=async(check:()=>boolean,label:string,timeout=15000)=>{const end=Date.now()+timeout;while(!check()&&Date.now()<end&&child.exitCode===null)await sleep(25);assert.ok(check(),`${label}: ${log.slice(-1000)}`);};
const metrics=()=>new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('metrics timeout')),5000);child.once('message',m=>{clearTimeout(timer);resolve(m);});child.send({type:'metrics'});});
let stateTimer:ReturnType<typeof setInterval>|undefined;
try{
  await wait(()=>log.includes('healthy and listening'),'startup');
  for(const f of fixtures){
    const params=new URLSearchParams({city:f.city,launchMode:f.mode,protocol:String(PROTOCOL_VERSION)});if(f.attemptId)params.set('journeyAttempt',f.attemptId);
    const c={socket:new WebSocket(`ws://127.0.0.1:${port}/?${params}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${f.cookie}`}}),messages:[] as any[],pose:null as any,sequence:0};clients.push(c);
    c.socket.on('close',(code,reason)=>{log+=`\nfixture ${clients.indexOf(c)} closed ${code}: ${reason}`;});
    c.socket.on('message',raw=>{const m=JSON.parse(String(raw));c.messages.push(m);if(c.messages.length>400)c.messages.splice(0,100);
      if(m.type==='welcome'){
        c.pose={...m.spawnPosition};
        if(m.airborneSpawn)c.pose={...m.airborneSpawn.position};
        else if(f.city==='dallas'){
          const a=cityAirports.dallas.find(a=>a.id===(m.spawnAirportId??'dfw'))!;
          const along=Math.min(a.runwayLength*.32,a.runwayLength*.5-120)+(m.spawnPosition.z-45);
          c.pose={x:a.x+Math.sin(a.heading)*along,y:dallasElevationAt(a.x,a.z),z:a.z+Math.cos(a.heading)*along};
        }
      }
      if(m.type==='skyDuelLoading')c.socket.send(JSON.stringify({type:'skyDuelPresentationReady'}));
      if(m.type==='skyDuelSpawn'){c.pose={...m.position};c.socket.send(JSON.stringify({type:'state',position:c.pose,rotation:{x:0,y:m.heading,z:0},boostActive:false}));c.socket.send(JSON.stringify({type:'skyDuelReady'}));}
    });
    await wait(()=>c.messages.some(m=>m.type==='welcome'),`welcome fixture ${clients.length-1}`);
    if(f.attemptId){c.socket.send(JSON.stringify({type:'state',position:c.pose,rotation:{x:0,y:0,z:0},boostActive:false}));c.socket.send(JSON.stringify({type:'transportReady',attemptId:f.attemptId}));c.socket.send(JSON.stringify({type:'journeyCountdownComplete',attemptId:f.attemptId}));}
    if(f.mode==='sky-duel')c.socket.send(JSON.stringify({type:'skyDuelQueue'}));
  }
  stateTimer=setInterval(()=>{for(const [i,c]of clients.entries())if(c.pose&&c.socket.readyState===WebSocket.OPEN){
    if(i!==4&&i!==5&&c.sequence<50)c.pose.y+=2;
    c.socket.send(JSON.stringify({type:'state',stateSequence:++c.sequence,position:c.pose,rotation:{x:0,y:0,z:0},boostActive:false}));
    if(i<2&&c.sequence%5===0)c.socket.send(JSON.stringify({type:'fire',clientShotId:`memory-${i}-${c.sequence}`,stateSequence:c.sequence}));
  }},50);
  await wait(()=>clients[4]!.messages.some(m=>m.type==='skyDuelFound'),'Sky Duel match');
  assert.ok(clients[2]!.messages.some(m=>m.type==='welcome'&&m.tutorialMode),'Training City is active');
  assert.ok(clients[3]!.messages.some(m=>m.type==='airAssault'&&m.enemies.length===30),'all 30 assault enemies loaded');
  for(const c of clients.slice(6,12))await wait(()=>c.messages.some(m=>m.type==='monsterState'),`monster state ${clients.indexOf(c)} ${JSON.stringify(c.messages.filter(m=>m.type==='journeyAttempt').at(-1))}`);
  for(const c of clients.slice(12))await wait(()=>c.messages.some(m=>m.type==='transportState'),'transport state');
  const before=await metrics();
  let healthChecks=0,maxHealthMs=0;
  for(let i=0;i<30;i++){
    const t=performance.now(),response=await fetch(`http://127.0.0.1:${port}/health`);assert.equal(response.status,200);await response.text();maxHealthMs=Math.max(maxHealthMs,performance.now()-t);healthChecks++;await sleep(1000);
  }
  const loaded=await metrics();clearInterval(stateTimer);stateTimer=undefined;
  for(const c of clients)c.socket.close();await sleep(3000);const released=await metrics();
  assert.equal(child.exitCode,null);assert.doesNotMatch(log,/heap out of memory|FATAL ERROR/);
  if(!process.env.P0_BASELINE)assert.ok(loaded.peakRssMiB<=384,JSON.stringify(loaded));if(!process.env.P0_BASELINE)assert.ok(loaded.peakHeapMiB<=180,JSON.stringify(loaded));assert.ok(loaded.timerP95Ms<=20,JSON.stringify(loaded));
  assert.ok(released.heapMiB<=before.heapMiB+8,'no retained city-sized copies after disconnect');
  const report={clients:clients.length,modes:['Dallas Free Fly','Training City','Sky Duel','Air Assault (30 enemies)','six monster encounters','two transports'],healthChecks,maxHealthMs,before,loaded,released};
  console.log(JSON.stringify(report));writeFileSync(`/tmp/airport-chaos-memory-p0/${process.env.P0_BASELINE?'before-':'after-'}representative-load.json`,JSON.stringify(report,null,2));
}finally{
  if(stateTimer)clearInterval(stateTimer);for(const c of clients)c.socket.terminate();child.kill('SIGTERM');if(child.exitCode===null)await new Promise(r=>child.once('exit',r));
  db.close();profiles.database.close();journeys.database.close();rmSync(dir,{recursive:true,force:true});for(const suffix of ['', '-wal','-shm'])rmSync(path+suffix,{force:true});
}
