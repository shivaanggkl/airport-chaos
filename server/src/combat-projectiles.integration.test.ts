import * as THREE from 'three';
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
import { journeyDallas08, journeyDallas09, journeyDallas10 } from '../../shared/journey-mission.mjs';
import { PROTOCOL_VERSION } from '../../shared/protocol.mjs';
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
                    this.pose = { x: airport.x, y: ground(airport.x, airport.z), z: airport.z + Math.min(airport.runwayLength * .32, airport.runwayLength * .5 - 120) };
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
 }finally{if(timer)clearInterval(timer);a?.socket.close();b?.socket.close();child.kill('SIGTERM');await delay(200);rmSync(dir,{recursive:true,force:true})}
});
