/** Local-only protocol load test. Never connects to staging or production. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import WebSocket from 'ws';
import { PlayerProfileStore } from '../server/src/player-profiles.js';
import { PilotSessionStore } from '../server/src/session-auth.js';
import { PROTOCOL_VERSION } from '../shared/protocol.mjs';

const arg = (name: string, fallback: string) => process.argv.find(v => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const counts = arg('counts', '10,25,50,100').split(',').map(Number);
const seconds = Number(arg('seconds', '30'));
const scenario = arg('scenario', 'parallel');
const cadence = arg('cadence', 'synchronized');
if (!['synchronized','staggered'].includes(cadence)) throw Error('Unknown cadence');
if (!['parallel','pairs'].includes(scenario)) throw Error('Unknown scenario');
const output = arg('output', '/tmp/airport-combat-load.json');
const serverRoot = arg('server-root', resolve(import.meta.dirname,'..'));
const driverLag = monitorEventLoopDelay({resolution:10});driverLag.enable();
if (counts.some(n => !Number.isInteger(n) || n < 2 || n > 100) || !Number.isFinite(seconds) || seconds < 10 || seconds > 300) throw Error('Use 2–100 clients and 10–300 seconds.');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const quantile = (a: number[], q: number) => a.length ? [...a].sort((a,b)=>a-b)[Math.min(a.length-1, Math.floor(a.length*q))] : 0;
const wait = async (check: () => boolean, label: string, timeout = 20000) => { const end = Date.now()+timeout; while (!check() && Date.now()<end) await sleep(25); if (!check()) throw Error(label); };
async function freePort() { const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p; }
const dir = mkdtempSync(join(tmpdir(), 'airport-combat-load-'));
const probe = join(dir, 'metrics.mjs');
writeFileSync(probe, `import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
const original=globalThis.setInterval;const samples=new Map();let cpu=process.cpuUsage(),started=performance.now();const lag=monitorEventLoopDelay({resolution:10});lag.enable();
globalThis.setInterval=(fn,ms,...args)=>{const name=fn.toString().replace(/\\s+/g,' ').slice(0,170);return original((...a)=>{const start=performance.now();try{return fn(...a)}finally{const values=samples.get(name)||[];if(values.length<20000)values.push(performance.now()-start);samples.set(name,values)}},ms,...args)};
process.on('message',m=>{if(m.type==='reset'){samples.clear();cpu=process.cpuUsage();started=performance.now();lag.reset();process.send({type:'reset'})}if(m.type==='snapshot'){const used=process.cpuUsage(cpu);const q=(v,p)=>v.sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]||0;process.send({type:'snapshot',rssMiB:process.memoryUsage().rss/1048576,heapMiB:process.memoryUsage().heapUsed/1048576,cpuCorePercent:(used.user+used.system)/(performance.now()-started)/10,eventLoopP95Ms:lag.percentile(95)/1e6,eventLoopMaxMs:lag.max/1e6,timers:[...samples].map(([name,v])=>({name,count:v.length,p95Ms:q(v,.95),maxMs:q(v,1)}))})}});
`);
const results: unknown[] = [];
try {
 for (const count of counts) {
  const db=`/private/tmp/airport-chaos-combat-load-${randomUUID()}.sqlite`;
  const profiles=new PlayerProfileStore(db),sessions=new PilotSessionStore(db);
  const identities=Array.from({length:count},(_,i)=>{const s=sessions.issue(undefined,false);profiles.getOrCreate(s.pilotId,`Load ${i}`);profiles.grantAircraftEntitlements(s.pilotId,['fighter'],'test:combat-load');profiles.equipAircraft(s.pilotId,'fighter');return s;});
  const port=await freePort();
  const child=spawn(process.execPath,['--import','tsx','--import',probe,'server/src/index.ts'],{cwd:serverRoot,env:{...process.env,PORT:String(port),NODE_ENV:'test',AIRPORT_CHAOS_PROFILE_DB:db,AIRPORT_CHAOS_DEV_QA:'1'},stdio:['ignore','pipe','pipe','ipc']});
  let log='',bytes=0,received=0,damage=0,destructions=0,maxActive=0,measuring=false;
  const bytesByType:Record<string,number>={};
  const active=new Set<string>(),spawns=new Map<string,number>(),rtt:number[]=[];
  child.stdout.on('data',b=>{log+=String(b);if(log.length>300000)log=log.slice(-300000)});child.stderr.on('data',b=>{log+=String(b)});
  const ipc=(type:string)=>new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>{child.off('message',handler);reject(Error('Metrics IPC timed out'))},5000);const handler=(m:any)=>{if(m.type===type){clearTimeout(timeout);child.off('message',handler);resolve(m)}};child.on('message',handler);child.send({type});});
  const clients: {socket:WebSocket;id:string;pose:any;goal:any;sent:number;accepted:number;rejected:number;lastFire:number;sequence:number;alive:boolean;yaw:number;nextState:number;tick:number}[]=[];
  let timer:ReturnType<typeof setInterval>|undefined;
  try {
   await wait(()=>log.includes('listening'),'server did not start');
   for (let i=0;i<count;i++) {
    const c={socket:new WebSocket(`ws://127.0.0.1:${port}/?city=milwaukee&launchMode=free-fly&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${identities[i]!.cookie}`}}),id:'',pose:null as any,goal:null as any,sent:0,accepted:0,rejected:0,lastFire:0,sequence:0,alive:false,yaw:scenario==='pairs'&&i%2?Math.PI:0,nextState:0,tick:0};clients.push(c);
    c.socket.on('message',raw=>{
     const buffer=Buffer.isBuffer(raw)?raw:Buffer.from(String(raw));
     const type=buffer.subarray(0,100).toString().match(/"type":"([^"]+)"/)?.[1]??'unknown';
     if(measuring){bytes+=buffer.length;received++;bytesByType[type]=(bytesByType[type]??0)+buffer.length;}
     // The load driver measures transport, not 100 copies of a renderer. Avoid parsing unused snapshots.
     if(!['welcome','projectileSpawn','projectileRemove','shotRejected','damage','playerState','respawn'].includes(type))return;
     const m=JSON.parse(buffer.toString());
     if(m.type==='welcome'){c.id=m.playerId;c.pose={...m.spawnPosition};c.goal={x:m.spawnPosition.x+(scenario==='pairs'?Math.floor(i/2)*140:i*70),y:m.spawnPosition.y+1000,z:m.spawnPosition.z-(scenario==='pairs'&&i%2?1000:0)};}
     if(m.type==='playerState'&&m.playerId===c.id)c.alive=m.lifeState==='alive';
     if(m.type==='respawn'&&m.playerId===c.id){c.pose={...m.spawnPosition};c.alive=false;}
     if(m.type==='damage'&&m.playerId===c.id&&m.health===0){c.alive=false;if(scenario==='pairs')setTimeout(()=>{if(c.socket.readyState===WebSocket.OPEN)c.socket.send(JSON.stringify({type:'respawn'}))},1000);}
     if(m.type==='projectileSpawn'&&m.ownerId===c.id&&m.clientShotId?.startsWith('load-')){const at=spawns.get(m.clientShotId);if(at)c.accepted++;if(at)rtt.push(performance.now()-at);spawns.delete(m.clientShotId);}
     if(m.type==='shotRejected'){if(spawns.has(m.clientShotId))c.rejected++;spawns.delete(m.clientShotId);}
     if(i===0&&m.type==='projectileSpawn'){active.add(m.projectileId);maxActive=Math.max(maxActive,active.size)}
     if(i===0&&m.type==='projectileRemove')active.delete(m.projectileId);
     if(i===0&&m.type==='damage'&&measuring){damage++;if(m.health===0)destructions++;}
    });
    c.socket.on('error',()=>{});
    if(i%10===9)await sleep(25);
   }
   await wait(()=>clients.every(c=>c.id),'not all clients received welcome');
   if(scenario==='pairs'){
    const anchor={...clients[0]!.pose};
    for(const [i,c]of clients.entries())c.goal={x:anchor.x+Math.floor(i/2)*140,y:anchor.y+1000,z:anchor.z-(i%2?1000:0)};
   }
   if(cadence==='staggered')for(const [i,c]of clients.entries())c.nextState=performance.now()+i/count*50;
   let tick=0;
   const send=(c:typeof clients[number],m:object)=>{if(c.socket.readyState===WebSocket.OPEN)c.socket.send(JSON.stringify(m));};
   timer=setInterval(()=>{const now=performance.now();tick++;
    for(const [i,c] of clients.entries()){
     if(cadence==='staggered'&&now<c.nextState)continue;
     c.nextState=now+50;c.tick++;
     const step=(a:number,b:number)=>a+Math.max(-45,Math.min(45,b-a));
     c.pose={x:step(c.pose.x,c.goal.x),y:step(c.pose.y,c.goal.y),z:step(c.pose.z,c.goal.z)};
     send(c,{type:'state',stateSequence:++c.sequence,position:c.pose,rotation:{x:0,y:c.yaw,z:0},boostActive:false});
     if(c.tick%2===0)send(c,{type:'lock'});
     if(measuring&&c.alive&&now-c.lastFire>=(cadence==='staggered'?200:180)){c.lastFire=now;const id=`load-${i}-${++c.sent}`;spawns.set(id,now);send(c,{type:'fire',clientShotId:id,stateSequence:c.sequence});}
    }
   },cadence==='staggered'?5:50);
   await wait(()=>clients.every(c=>Math.hypot(c.pose.x-c.goal.x,c.pose.y-c.goal.y,c.pose.z-c.goal.z)<1),'airborne positioning');
   await sleep(4000);
   await ipc('reset');driverLag.reset();measuring=true;const start=performance.now();await sleep(seconds*1000);measuring=false;
   const metrics=await ipc('snapshot');const wall=performance.now()-start;await sleep(750);
   const fireBlockedReasons:Record<string,number>={};for(const m of log.matchAll(/FIRE_BLOCKED (\w+)/g))fireBlockedReasons[m[1]!]=(fireBlockedReasons[m[1]!]??0)+1;
   const row={fireBlockedReasons,aliveAtEnd:clients.filter(c=>c.alive).length,openAtEnd:clients.filter(c=>c.socket.readyState===WebSocket.OPEN).length,driverEventLoopP95Ms:driverLag.percentile(95)/1e6,bytesByType,unacknowledged:spawns.size,count,seconds:wall/1000,scenario,cadence,clientKind:'validated synthetic protocol clients; not human pilots or physical devices',sent:clients.reduce((n,c)=>n+c.sent,0),accepted:clients.reduce((n,c)=>n+c.accepted,0),rejected:clients.reduce((n,c)=>n+c.rejected,0),acceptedPerPilot:clients.map(c=>c.accepted),damage,destructions,maxActive,aggregateMbps:bytes*8/wall/1000,receivedMessages:received,ackP50Ms:quantile(rtt,.5),ackP95Ms:quantile(rtt,.95),transformRejects:(log.match(/TRANSFORM_REJECT/g)||[]).length,...metrics};
   results.push(row);writeFileSync(output,JSON.stringify({node:process.version,platform:process.platform,results},null,2));console.log(JSON.stringify(row));
  } finally {if(timer)clearInterval(timer);for(const c of clients)c.socket.terminate();child.kill('SIGTERM');await sleep(300);for(const s of ['','-wal','-shm'])rmSync(db+s,{force:true});}
 }
} finally {driverLag.disable();rmSync(dir,{recursive:true,force:true});}
