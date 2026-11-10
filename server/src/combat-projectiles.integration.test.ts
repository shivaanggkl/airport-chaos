import * as THREE from 'three';
import { dallasElevationAt } from './dallas-elevation.js';
import { aircraftPresentationMuzzleSockets } from '../../shared/aircraft-presentation-scale.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import WebSocket from 'ws';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';
import { randomUUID } from 'node:crypto';
import { JourneyAttemptStore } from './journey-attempts.js';
import { cityAirports } from '../../shared/city-airports.mjs';
import { journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10 } from '../../shared/journey-mission.mjs';
import { BASE_PROJECTILE_SPEED, PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import { combatShotAimSample, combatAimBlend, combatLockReady } from '../../shared/combat-aim.mjs';
type Vec = {
    x: number;
    y: number;
    z: number;
};
type Msg = {
    type: string;
    [key: string]: any;
};
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check: () => boolean, message: string, ms = 6000): Promise<void> {
    const end = Date.now() + ms;
    while (!check() && Date.now() < end)
        await delay(25);
    assert.ok(check(), message);
}
async function port(): Promise<number> {
    const server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const p = (server.address() as {
        port: number;
    }).port;
    await new Promise<void>(r => server.close(() => r()));
    return p;
}
const elevation = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8'));
const heightBytes = Buffer.from(elevation.elevations, 'base64'), heightSamples = new Uint16Array(heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 2);
function ground(wx: number, wz: number): number { const x = Math.max(0, Math.min(1, (wx - elevation.bounds.minX) / (elevation.bounds.maxX - elevation.bounds.minX))) * (elevation.width - 1), z = Math.max(0, Math.min(1, (wz - elevation.bounds.minZ) / (elevation.bounds.maxZ - elevation.bounds.minZ))) * (elevation.height - 1); const x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(elevation.width - 1, x0 + 1), z1 = Math.min(elevation.height - 1, z0 + 1); const at = (a: number, b: number) => elevation.baseElevation + heightSamples[b * elevation.width + a]! * elevation.scale; const lerp = (a: number, b: number, t: number) => a + (b - a) * t; return lerp(lerp(at(x0, z0), at(x1, z0), x - x0), lerp(at(x0, z1), at(x1, z1), x - x0), z - z0); }
class Client {
    messages: Msg[] = [];
    socket: WebSocket;
    pose?: Vec;
    goal?: Vec;
    yaw = 0;
    goalYaw = 0;
    pitch = 0;
    goalPitch = 0;
    roll = 0;
    goalRoll = 0;
    id = '';
    aimTargetId?: string;
    constructor(port: number, cookie: string, readonly city: 'milwaukee' | 'dallas' = 'milwaukee', attempt?: string) {
        this.socket = new WebSocket(`ws://127.0.0.1:${port}/?city=${city}&launchMode=${attempt ? 'missions' : 'free-fly'}&protocol=${PROTOCOL_VERSION}${attempt ? '&journeyAttempt=' + attempt : ''}`, { origin: `http://127.0.0.1:${port}`, headers: { Cookie: `airport_chaos_session=${cookie}` } });
        this.socket.on('message', raw => {
            const m = JSON.parse(String(raw));
            this.messages.push(m);
            if (m.type === 'welcome') {
                this.id = m.playerId;
                this.pose = { ...m.spawnPosition };
                if (city === 'dallas') {
                    const airport = cityAirports.dallas.find(a => a.id === m.spawnAirportId)!;
                    const along=Math.min(airport.runwayLength*.32,airport.runwayLength*.5-120);
                    this.pose = { x: airport.x+Math.sin(airport.heading)*along, y: dallasElevationAt(airport.x,airport.z)+1.2, z: airport.z+Math.cos(airport.heading)*along };
                    this.yaw=this.goalYaw=airport.heading;
                }
                this.goal = { ...this.pose! };
            }
        });
    }
    send(message: object) { this.socket.send(JSON.stringify(message)); }
    step() {
        if (!this.pose || !this.goal || this.socket.readyState !== WebSocket.OPEN)
            return;
        const step = (a: number, b: number, n: number) => a + Math.max(-n, Math.min(n, b - a));
        this.pose = { x: step(this.pose.x, this.goal.x, this.city === 'dallas' ? 85 : 6), y: step(this.pose.y, this.goal.y, this.city === 'dallas' ? 40 : 8), z: step(this.pose.z, this.goal.z, this.city === 'dallas' ? 85 : 15) };
        this.yaw = step(this.yaw, this.goalYaw, .04);
        this.pitch = step(this.pitch, this.goalPitch, .02);
        this.roll = step(this.roll, this.goalRoll, .04);
        this.send({ type: 'state', position: this.pose, rotation: { x: this.pitch, y: this.yaw, z: this.roll }, boostActive: false });
    }
}
// Acceptance for the explicitly restored October 28 combat contract.
test('restored lock gives one authoritative assisted hit; unlocked shots remain ballistic and invalid samples fail closed', {timeout:45000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'airport-restored-combat-')),db=join(dir,'profiles.sqlite');
 const profiles=new PlayerProfileStore(db),sessions=new PilotSessionStore(db);
 const one=sessions.issue(undefined,false),two=sessions.issue(undefined,false);
 profiles.getOrCreate(one.pilotId,'Restored One');profiles.getOrCreate(two.pilotId,'Restored Two');
 const p=await port();const child=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:resolve(import.meta.dirname,'../..'),env:{...process.env,PORT:String(p),AIRPORT_CHAOS_PROFILE_DB:db,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',d=>output+=String(d));child.stderr.on('data',d=>output+=String(d));
 let a:Client|undefined,b:Client|undefined,timer:ReturnType<typeof setInterval>|undefined;
 try{
  await wait(()=>output.includes('listening'),'isolated server startup',20000);
  a=new Client(p,one.cookie);b=new Client(p,two.cookie);await wait(()=>Boolean(a?.pose&&b?.pose),'authenticated welcomes');
  const shooter=a,target=b;shooter.goal={...shooter.pose!,y:shooter.pose!.y+400};target.goal={x:shooter.goal.x,y:shooter.goal.y,z:shooter.goal.z-800};
  timer=setInterval(()=>{shooter.step();target.step()},80);
  await wait(()=>Math.hypot(shooter.pose!.y-shooter.goal!.y,target.pose!.z-target.goal!.z,target.pose!.y-target.goal!.y)<.01,'legal airborne combat setup',20000);
  for(let i=0;i<8;i++){shooter.send({type:'lock',targetId:target.id,aimHorizontal:0,aimVertical:0});await delay(100)}
  const aim=shooter.messages.filter(m=>m.type==='lockState').at(-1)!;
  assert.equal(aim.targetId,target.id,'old angular acquisition locks the airborne target');
  const fire={type:'fire',targetId:target.id,clientShotId:'restored-assisted',aimSample:{from:aim.aimId,to:aim.aimId,blend:1},transform:{position:{x:999999,y:999999,z:999999},rotation:{x:0,y:Math.PI,z:0},aircraftType:'fighter'},damage:999999};
  shooter.send(fire);
  await wait(()=>shooter.messages.some(m=>m.type==='assistedShot'&&m.clientShotId==='restored-assisted'),'restored assisted-shot event');
  await wait(()=>shooter.messages.some(m=>m.type==='damage'&&m.playerId===target.id),'authoritative assisted damage');
  const event=shooter.messages.find(m=>m.type==='assistedShot'&&m.clientShotId==='restored-assisted')!;
  assert.ok(Math.abs(event.origin.x-shooter.pose!.x)<10,'forged muzzle position is ignored');
  const hits=()=>shooter.messages.filter(m=>m.type==='damage'&&m.playerId===target.id);
  assert.equal(hits().length,1);assert.equal(hits()[0]!.damage,25,'client damage cannot change weapon balance');
  assert.equal(hits()[0]!.health,75);
  assert.equal(hits()[0]!.impactId,event.shotId);
  assert.deepEqual(hits()[0]!.impactPosition,event.targetPosition);
  await wait(()=>target.messages.some(m=>m.type==='assistedShot'&&m.shotId===event.shotId),'observer receives the same confirmed tracer');
  const observed = target.messages.find(m=>m.type==='assistedShot'&&m.shotId===event.shotId)!;
  assert.deepEqual(observed.origin,event.origin);
  assert.deepEqual(observed.targetPosition,event.targetPosition);
  assert.equal(observed.speed,event.speed);
  assert.ok(event.speed>=BASE_PROJECTILE_SPEED);
  assert.equal(shooter.messages.some(m=>m.type==='projectileSpawn'&&m.clientShotId==='restored-assisted'),false,'no second ballistic damage path');
  await delay(400);shooter.send(fire);await delay(150);
  assert.equal(hits().length,1,'duplicate intent cannot apply another reward or hit');
  assert.equal(shooter.messages.filter(m=>m.type==='assistedShot'&&m.clientShotId==='restored-assisted').length,1);
  shooter.goalYaw=.8;await wait(()=>Math.abs(shooter.yaw-.8)<.001,'ordinary pilot turn');
  for(let i=0;i<5;i++){shooter.send({type:'lock',targetId:target.id});await delay(100)}
  const unlocked=shooter.messages.filter(m=>m.type==='lockState').at(-1)!;assert.notEqual(unlocked.targetId,target.id,'turning away clears the lock');
  shooter.send({type:'fire',clientShotId:'restored-ballistic',aimSample:{from:unlocked.aimId,to:unlocked.aimId,blend:1}});
  await wait(()=>shooter.messages.some(m=>m.type==='projectileSpawn'&&m.clientShotId==='restored-ballistic'),'unlocked ballistic projectile');
  assert.equal(shooter.messages.some(m=>m.type==='assistedShot'&&m.clientShotId==='restored-ballistic'),false);
  assert.equal(hits().length,1,'unlocked fire does not grant an assisted hit');
  await delay(400);shooter.send({type:'fire',clientShotId:'invalid-sample',targetId:target.id,aimSample:{from:-1,to:999999,blend:1}});
  await wait(()=>shooter.messages.some(m=>m.type==='shotRejected'&&m.clientShotId==='invalid-sample'),'invalid server-sample reference rejected');
  assert.equal(hits().length,1);
  shooter.goalYaw=0;
  await wait(()=>shooter.yaw===0,'shooter realigns for ballistic contact');
  shooter.send({type:'fire',clientShotId:'ballistic-contact'});
  await wait(()=>shooter.messages.some(m=>m.type==='projectileSpawn'&&m.clientShotId==='ballistic-contact'),'ballistic contact round spawned');
  const ballistic=shooter.messages.find(m=>m.type==='projectileSpawn'&&m.clientShotId==='ballistic-contact')!;
  await wait(()=>hits().some(hit=>hit.impactId===ballistic.projectileId),'server swept hit for the ballistic shot');
  const receipt=hits().find(hit=>hit.impactId===ballistic.projectileId)!;
  const removal=shooter.messages.find(m=>m.type==='projectileRemove'&&m.projectileId===ballistic.projectileId)!;
  assert.deepEqual(removal.impactPosition,receipt.impactPosition);
  assert.equal(receipt.health,50);
 }finally{if(timer)clearInterval(timer);a?.socket.close();b?.socket.close();child.kill('SIGTERM');await delay(200);rmSync(dir,{recursive:true,force:true})}
});

test('M13 real Bluejay socket acquires transport lock and inflicts an assisted hit',{timeout:100000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'airport-m13-lock-')),db='/private/tmp/airport-chaos-m13-'+randomUUID()+'.sqlite';
 const profiles=new PlayerProfileStore(db,true,true),sessions=new PilotSessionStore(db),identity=sessions.issue(undefined,false);
 profiles.getOrCreate(identity.pilotId,'M13 QA');
 const journeys=new JourneyAttemptStore(db,true); const p=await port();
 const child=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:resolve(import.meta.dirname,'../..'),env:{...process.env,PORT:String(p),AIRPORT_CHAOS_PROFILE_DB:db,AIRPORT_CHAOS_DEV_QA:'1',AIRPORT_CHAOS_LOCAL_QA_UNLOCK_ALL:'true',NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',d=>output+=String(d));child.stderr.on('data',d=>output+=String(d));
 let a:Client|undefined,timer:ReturnType<typeof setInterval>|undefined;
 try{
  await wait(()=>output.includes('listening'),'isolated server startup',20000);
  const attempt=journeys.launch(identity.pilotId,'trainer',Date.now(),journeyDallas07.id);
  a=new Client(p,identity.cookie,'dallas',attempt.attemptId);
  await wait(()=>!!a?.pose,'mission welcome');
  a.send({type:'transportReady',attemptId:attempt.attemptId});a.send({type:'journeyCountdownComplete',attemptId:attempt.attemptId});
  a.send({type:'state',position:a.pose,rotation:{x:0,y:a.yaw,z:0},boostActive:false});
  timer=setInterval(()=>a!.send({type:'state',position:a!.pose,rotation:{x:0,y:a!.yaw,z:0},boostActive:false}),80);
  await wait(()=>journeys.get(identity.pilotId,attempt.attemptId)?.status==='RACING','mission RACING after real countdown and accepted transform',8000);
  clearInterval(timer);
  timer=setInterval(()=>{
   const state=a!.messages.filter(m=>m.type==='transportState').at(-1);
   if(state){
    const ahead=Math.min(.2,Math.max(0,(Date.now()-state.serverNow)/1000)),pose=state.pose;
    a!.goal={x:pose.x+pose.velocity.x*ahead+Math.sin(pose.yaw)*2800,y:pose.y+180,z:pose.z+pose.velocity.z*ahead+Math.cos(pose.yaw)*2800};
    const dx=pose.x-a!.pose!.x,dy=pose.y+12-a!.pose!.y,dz=pose.z-a!.pose!.z;
    a!.goalYaw=Math.atan2(-dx,-dz);a!.goalPitch=Math.atan2(dy,Math.hypot(dx,dz));
   }
   a!.step();a!.send({type:'lock',targetId:`transport:${attempt.attemptId}`,aimHorizontal:0,aimVertical:0});
  },80);
  await wait(()=>a!.messages.some(m=>m.type==='lockState'&&m.targetId===`transport:${attempt.attemptId}:body`),'M13 Bluejay acquired body lock; '+JSON.stringify({attempt:journeys.get(identity.pilotId,attempt.attemptId)}),65000);
  const aim=a.messages.filter(m=>m.type==='lockState'&&m.targetId).at(-1)!;
  const live=a.messages.filter(m=>m.type==='transportState').at(-1)!.pose;
  const forward=new THREE.Vector3(live.x-a.pose!.x,live.y+12-a.pose!.y,live.z-a.pose!.z).normalize();
  const firePosition=new THREE.Vector3().copy(a.pose!).addScaledVector(forward,40); // A current frame between 80ms movement packets.
  a.send({type:'fire',targetId:aim.targetId,clientShotId:'m13-real-hit',aimSample:{from:aim.aimId,to:aim.aimId,blend:1},transform:{position:firePosition,rotation:{x:a.pitch,y:a.yaw,z:a.roll},aircraftType:'trainer'}});
  await wait(()=>a!.messages.some(m=>m.type==='assistedShot'&&m.clientShotId==='m13-real-hit'),'M13 assisted shot');
  await wait(()=>journeys.get(identity.pilotId,attempt.attemptId)!.monsterHealth===journeyDallas07.bossHealth-25,'M13 authoritative 25 HP damage');
 }catch(e){console.log('M13_NETWORK_DIAGNOSTICS',JSON.stringify({pose:a?.pose,latestTransport:a?.messages.filter(m=>m.type==='transportState').at(-1),latestJourney:a?.messages.filter(m=>m.type==='journeyAttempt').at(-1),tail:a?.messages.slice(-3),output:output.slice(0,2000)+output.slice(-1500)}));throw e;}
 finally{if(timer)clearInterval(timer);a?.socket.close();child.kill('SIGTERM');await delay(200);rmSync(dir,{recursive:true,force:true});for(const suffix of ['', '-wal','-shm'])rmSync(db+suffix,{force:true});}
});
