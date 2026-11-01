import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';
import { PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import type { AssaultSnapshot } from '../../shared/air-assault.mjs';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Packet = Record<string, any>;
async function port() { return new Promise<number>(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const n = (server.address() as {
  port: number;
}).port; server.close(() => resolve(n)); }); }); }
class Client {
  packets: Packet[] = [];
  socket: WebSocket;
  constructor(p: number, cookie: string, mode: string) { this.socket = new WebSocket(`ws://127.0.0.1:${p}/?city=dallas&launchMode=${mode}&time=day&protocol=${PROTOCOL_VERSION}`, { origin: `http://127.0.0.1:${p}`, headers: { Cookie: `airport_chaos_session=${cookie}` } }); this.socket.on('message', data => this.packets.push(JSON.parse(String(data)))); }
  send(packet: Packet) { this.socket.send(JSON.stringify(packet)); }
  async wait(type: string, predicate: (m: Packet) => boolean = () => true, timeout = 12000): Promise<Packet> { const end = Date.now() + timeout; while (Date.now() < end) {
    const m = this.packets.find(m => m.type === type && predicate(m));
    if (m)
      return m;
    await sleep(25);
  } throw new Error(`Missing ${type}: ${JSON.stringify(this.packets.slice(-3))}`); }
}
test('Real authenticated server isolates encounters, validates takeoff, freezes intro, resumes without replay and rejects forged actions', { timeout: 50000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'assault-live-')), path = join(directory, 'profiles.sqlite');
  const profiles = new PlayerProfileStore(path), sessions = new PilotSessionStore(path);
  const identity = sessions.issue(undefined, false), other = sessions.issue(undefined, false);
  profiles.getOrCreate(identity.pilotId, 'Assault');
  profiles.getOrCreate(other.pilotId, 'Free Fly');
  const p = await port();
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { env: { ...process.env, PORT: String(p), AIRPORT_CHAOS_PROFILE_DB: path, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  server.stdout.on('data', b => logs += b);
  server.stderr.on('data', b => logs += b);
  const clients: Client[] = [];
  try {
    for (let i = 0; i < 240 && !logs.includes('healthy and listening') && server.exitCode === null; i++)
      await sleep(50);
    assert.equal(server.exitCode, null, logs);
    const a = new Client(p, identity.cookie, 'air-assault');
    clients.push(a);
    const welcome = await a.wait('welcome');
    assert.equal(welcome.airAssaultSupported, true);
    assert.equal(welcome.activeAircraftType, 'trainer');
    assert.deepEqual(welcome.players, []);
    const intro = await a.wait('airAssault') as AssaultSnapshot;
    assert.equal(intro.phase, 'intro');
    assert.equal(intro.enemies.length, 30);
    assert.equal(intro.startedAt, null);
    const b = new Client(p, other.cookie, 'free-fly');
    clients.push(b);
    const free = await b.wait('welcome');
    assert.ok(!free.players.some((e: Packet) => e.playerId === welcome.playerId));
    const data = JSON.parse(readFileSync('client/src/data/dallas-elevation.json', 'utf8'));
    const bytes = Buffer.from(data.elevations, 'base64'), samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const x = (-22800 - data.bounds.minX) / (data.bounds.maxX - data.bounds.minX) * (data.width - 1), z = (-13600 - data.bounds.minZ) / (data.bounds.maxZ - data.bounds.minZ) * (data.height - 1), x0 = Math.floor(x), z0 = Math.floor(z);
    const at = (a: number, b: number) => data.baseElevation + samples[b * data.width + a]! * data.scale;
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const runwayY = mix(mix(at(x0, z0), at(x0 + 1, z0), x - x0), mix(at(x0, z0 + 1), at(x0 + 1, z0 + 1), x - x0), z - z0);
    const position = { x: -22800, y: runwayY, z: -13600 + 4100 * .32 };
    let sequence = 0;
    const state = () => a.send({ type: 'state', position: { ...position }, rotation: { x: 0, y: 0, z: 0 }, stateSequence: ++sequence, aircraftType: 'trainer' });
    state();
    a.send({ type: 'fire', clientShotId: 'forged', targetId: intro.enemies[0]!.id });
    a.send({ type: 'respawn' });
    a.send({ type: 'equipAircraft', aircraftType: 'fighter' });
    a.send({ type: 'airAssaultKill', enemyId: intro.enemies[0]!.id });
    a.send({ type: 'airAssaultReady' });
    await sleep(1150);
    a.send({ type: 'airAssaultSkip' });
    await a.wait('airAssault', m => m.phase === 'takeoff');
    const pre = a.packets.filter(m => m.type === 'airAssault').at(-1)!;
    assert.equal(pre.startedAt, null);
    assert.equal(pre.destroyed, 0);
    assert.equal(a.packets.some(m => m.type === 'projectileSpawn'), false);
    // Real time, bounded packets along DFW runway; no injected kills, damage or server clock changes.
    state();
    for (let i = 0; i < 50; i++) {
      position.z -= 8;
      position.y = i > 40 ? runwayY + (i - 40) * 1.3 : runwayY;
      state();
      await sleep(100);
    }
    const active = await a.wait('airAssault', m => m.phase === 'active');
    assert.equal(active.deadlineAt - active.startedAt, 480000);
    assert.equal(active.destroyed, 0);
    await a.wait('airAssault', m => m.enemies.some((e: Packet) => e.phase === 'takeoff'));
    const encounterId = active.id;
    a.socket.close();
    await sleep(150);
    const resumed = new Client(p, identity.cookie, 'air-assault');
    clients.push(resumed);
    const resumedWelcome = await resumed.wait('welcome');
    assert.ok(resumedWelcome.resumeFlight);
    const snapshot = await resumed.wait('airAssault');
    assert.equal(snapshot.id, encounterId);
    assert.equal(snapshot.phase, 'active');
    assert.equal(snapshot.startedAt, active.startedAt);
    assert.ok(!b.packets.some(m => m.type === 'airAssault' || m.type === 'projectileSpawn' && m.ownerId === welcome.playerId));
    resumed.send({ type: 'airAssaultExit' });
    await resumed.wait('airAssault', m => m.phase === 'finished' && m.result === 'exit');
    assert.equal(profiles.getOrCreate(identity.pilotId, 'Assault').credits, welcome.profile.credits);
    // A real, accepted ground pose can lose before takeoff; no timer or reward is invented.
    const ground = new Client(p, identity.cookie, 'air-assault'); clients.push(ground);
    await ground.wait('welcome');
    ground.send({type:'state',position:{x:-22800,y:runwayY,z:-13600+4100*.32},rotation:{x:0,y:0,z:0},stateSequence:1,aircraftType:'trainer'});
    ground.send({type:'airAssaultReady'});await sleep(1100);ground.send({type:'airAssaultSkip'});
    await ground.wait('airAssault',m=>m.phase==='takeoff');
    ground.send({type:'state',position:{x:-22800,y:runwayY,z:-13600+4100*.32},rotation:{x:0,y:0,z:0},stateSequence:2,aircraftType:'trainer'});
    ground.send({type:'airAssaultCrash'});
    const crashed=await ground.wait('airAssault',m=>m.phase==='finished');
    assert.equal(crashed.result,'destroyed');assert.equal(crashed.startedAt,null);assert.equal(crashed.reward,0);

  }
  finally {
    for (const client of clients)
      client.socket.terminate();
    server.kill('SIGTERM');
    await new Promise(r => server.once('exit', r));
    rmSync(directory, { recursive: true, force: true });
  }
});
