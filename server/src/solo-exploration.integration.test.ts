import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import WebSocket from 'ws';
import {PlayerProfileStore} from './player-profiles.js';
import {PilotSessionStore} from './session-auth.js';
import {cityAirports} from '../../shared/city-airports.mjs';
import {PROTOCOL_VERSION} from '../../shared/protocol.mjs';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Packet=Record<string,any>;
async function freePort(){return new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as {port:number}).port;s.close(()=>resolve(p));});});}
class Client{
 packets:Packet[]=[];socket:WebSocket;
 constructor(port:number,cookie:string,mode:string,city='dallas'){this.socket=new WebSocket(`ws://127.0.0.1:${port}/?city=${city}&launchMode=${mode}&protocol=${PROTOCOL_VERSION}`,{origin:`http://127.0.0.1:${port}`,headers:{Cookie:`airport_chaos_session=${cookie}`}});this.socket.on('message',b=>this.packets.push(JSON.parse(String(b))));}
 send(packet:Packet){this.socket.send(JSON.stringify(packet));}
 async wait(type:string){for(let n=0;n<200;n++){const p=this.packets.find(p=>p.type===type);if(p)return p;await sleep(30);}throw new Error(`Missing ${type}`);}
}
function runwayPose(){
 const d=JSON.parse(readFileSync('client/src/data/dallas-elevation.json','utf8'));
 const bytes=Buffer.from(d.elevations,'base64'),samples=new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
 const airport=cityAirports.dallas.find(a=>a.id==='dfw')!;
 const x=(airport.x-d.bounds.minX)/(d.bounds.maxX-d.bounds.minX)*(d.width-1),z=(airport.z-d.bounds.minZ)/(d.bounds.maxZ-d.bounds.minZ)*(d.height-1);
 const x0=Math.floor(x),z0=Math.floor(z),at=(a:number,b:number)=>d.baseElevation+samples[b*d.width+a]*d.scale,mix=(a:number,b:number,t:number)=>a+(b-a)*t;
 return {x:airport.x+Math.sin(airport.heading)*airport.runwayLength*.32,y:mix(mix(at(x0,z0),at(x0+1,z0),x-x0),mix(at(x0,z0+1),at(x0+1,z0+1),x-x0),z-z0),z:airport.z+Math.cos(airport.heading)*airport.runwayLength*.32};
}
test('solo exploration starts at DFW and remains isolated from public traffic, combat, missions and territory', {timeout:30000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'solo-explore-')),path=join(directory,'profiles.sqlite');
 const profiles=new PlayerProfileStore(path),sessions=new PilotSessionStore(path);
 const identities=[0,1,2,3].map(()=>sessions.issue(undefined,false));
 identities.forEach((id,i)=>profiles.getOrCreate(id.pilotId,`Pilot${i}`));
 const port=await freePort(),server=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{env:{...process.env,PORT:String(port),AIRPORT_CHAOS_PROFILE_DB:path,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 const clients:Client[]=[];
 try{
  for(let n=0;n<240&&!logs.includes('healthy and listening')&&server.exitCode===null;n++)await sleep(30);
  assert.equal(server.exitCode,null,logs);
  const a=new Client(port,identities[0].cookie,'solo-free-fly');clients.push(a);
  const welcome=await a.wait('welcome');assert.equal(welcome.soloExploreSupported,true);assert.equal(welcome.spawnAirportId,'dfw');assert.equal(welcome.activeAircraftType,'trainer');assert.deepEqual(welcome.players,[]);assert.deepEqual(welcome.territories,[]);assert.equal(welcome.event,undefined);
  const publicClient=new Client(port,identities[1].cookie,'free-fly');clients.push(publicClient);
  const normal=await publicClient.wait('welcome');assert.ok(normal.players.length>0,'normal Dallas still has ambient server bots');assert.ok(!normal.players.some((p:Packet)=>p.playerId===welcome.playerId));
  const b=new Client(port,identities[2].cookie,'solo-free-fly');clients.push(b);const second=await b.wait('welcome');assert.deepEqual(second.players,[]);
  const position=runwayPose(),state={type:'state',position,rotation:{x:0,y:0,z:0},aircraftType:'trainer',stateSequence:1};
  a.send(state);b.send(state);publicClient.send(state);
  a.send({type:'fire',targetId:normal.players[0].playerId,clientShotId:'forged-solo-shot'});
  a.send({type:'missionAccept',missionId:'sightseeing'});a.send({type:'eventJoin',eventId:'forged'});a.send({type:'challengeStart',challengeId:'dfw-speed'});a.send({type:'skyDuelQueue'});a.send({type:'airAssaultReady'});a.send({type:'equipAircraft',aircraftType:'fighter',equipRequestId:1});
  await sleep(1500);
  assert.ok(a.packets.some(p=>p.type==='equipRejected'),'ownership checks are retained');
  assert.ok(!a.packets.some(p=>['playerState','state','projectileSpawn','projectileState','damage','territories','event','airAssault','skyDuelFound'].includes(p.type)&&p.playerId!==welcome.playerId),JSON.stringify(a.packets.map(p=>p.type)));
  assert.ok(!publicClient.packets.some(p=>p.playerId===welcome.playerId||p.playerId===second.playerId),'solo movement is never broadcast to normal Dallas');
  const invalid=new Client(port,identities[3].cookie,'solo-free-fly','milwaukee');clients.push(invalid);await new Promise<void>(resolve=>invalid.socket.once('close',()=>resolve()));assert.ok(!invalid.packets.some(p=>p.type==='welcome'));
  a.socket.close();await sleep(150);
  const reconnect=new Client(port,identities[0].cookie,'solo-free-fly');clients.push(reconnect);const again=await reconnect.wait('welcome');assert.equal(again.spawnAirportId,'dfw');assert.deepEqual(again.players,[]);
  assert.ok(!publicClient.packets.some(p=>p.type==='remove'&&p.playerId===welcome.playerId),'solo cleanup does not leak public presence');
 }finally{for(const c of clients)c.socket.terminate();server.kill('SIGTERM');await new Promise<void>(r=>server.once('exit',()=>r()));rmSync(directory,{recursive:true,force:true});}
});
