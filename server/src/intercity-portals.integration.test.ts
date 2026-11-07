import assert from 'node:assert/strict';
import {cityAirports} from '../../shared/city-airports.mjs';
import { DALLAS_WORLD_SCALE } from '../../shared/dallas-world-scale.mjs';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';
import { PortalTransitionStore } from './portal-transitions.js';
import { portalForCity, type PortalCity } from '../../shared/intercity-portals.mjs';
import { PROTOCOL_VERSION } from '../../shared/protocol.mjs';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Packet = Record<string, any>;
async function freePort() { return new Promise<number>(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as {
    port: number;
}).port; s.close(() => resolve(p)); }); }); }
class Client {
    packets: Packet[] = [];
    socket: WebSocket;
    sequence = 0;
    constructor(port: number, cookie: string, mode: string, city = 'dallas', fresh = false) { this.socket = new WebSocket(`ws://127.0.0.1:${port}/?city=${city}&launchMode=${mode}${fresh ? '&newFreeFly=1' : ''}&protocol=${PROTOCOL_VERSION}`, { origin: `http://127.0.0.1:${port}`, headers: { Cookie: `airport_chaos_session=${cookie}` } }); this.socket.on('message', b => this.packets.push(JSON.parse(String(b)))); }
    send(packet: Packet) { this.socket.send(JSON.stringify(packet)); }
    async wait(type: string, predicate: (p: Packet) => boolean = () => true) { for (let n = 0; n < 400; n++) {
        const p = this.packets.find(p => p.type === type && predicate(p));
        if (p)
            return p;
        await sleep(30);
    } throw new Error(`Missing ${type}: ${JSON.stringify(this.packets.filter(p => p.type === 'portalTransition'))}`); }
}
const elevation = JSON.parse(readFileSync('client/src/data/dallas-elevation.json', 'utf8'));
const bytes = Buffer.from(elevation.elevations, 'base64'), samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
function dallasHeight(x: number, z: number) { const d = elevation, xx = Math.max(0, Math.min(d.width - 1, (x / DALLAS_WORLD_SCALE - d.bounds.minX) / (d.bounds.maxX - d.bounds.minX) * (d.width - 1))), zz = Math.max(0, Math.min(d.height - 1, (z / DALLAS_WORLD_SCALE - d.bounds.minZ) / (d.bounds.maxZ - d.bounds.minZ) * (d.height - 1))), x0 = Math.floor(xx), z0 = Math.floor(zz), at = (a: number, b: number) => d.baseElevation + samples[b * d.width + a] * d.scale, mix = (a: number, b: number, t: number) => a + (b - a) * t; return mix(mix(at(x0, z0), at(Math.min(x0 + 1, d.width - 1), z0), xx - x0), mix(at(x0, Math.min(z0 + 1, d.height - 1)), at(Math.min(x0 + 1, d.width - 1), Math.min(z0 + 1, d.height - 1)), xx - x0), zz - z0) * DALLAS_WORLD_SCALE; }
test('authenticated solo and public portal handoffs, rejection, reward and reconnect', { timeout: 70000 }, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'portal-integration-')), path = join(directory, 'profiles.sqlite');
    const profiles = new PlayerProfileStore(path), sessions = new PilotSessionStore(path), transitions = new PortalTransitionStore(path);
    const identities = [0, 1, 2, 3].map(() => sessions.issue(undefined, false));
    identities.forEach((id, i) => profiles.getOrCreate(id.pilotId, `Pilot${i}`));
    const gate = portalForCity('dallas', dallasHeight)!;
    for (const [i, mode] of ['solo-free-fly', 'free-fly'].entries()) {
        const id = identities[i], pose = { position: { x: gate.x, y: gate.y, z: gate.z + 120 }, rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -300 } };
        const state = transitions.approve(id.pilotId, id.tokenHash, mode, 'milwaukee', 'dallas', 'milwaukee-dallas', pose, 75, Date.now() - 15000)!;
        state.phase = 'ARRIVED';
        state.updatedAt = Date.now() - 15000;
        transitions.save(state);
    }
    for (const [i, city, airportId] of [[2,'milwaukee','central'],[3,'dallas','love']] as const) {
        const airport=cityAirports[city].find(a=>a.id===airportId)!;
        const pose={position:{x:airport.x+250,y:city==='dallas'?dallasHeight(airport.x,airport.z)+200:200,z:airport.z+250},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:-100}};
        const from=city==='dallas'?'milwaukee':'dallas';
        const flight=transitions.approve(identities[i].pilotId,identities[i].tokenHash,'solo-free-fly',from,city,`${from}-${city}`,pose,75,Date.now()-15000)!;
        flight.phase='ARRIVED';transitions.save(flight);
    }
    const port = await freePort(), server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { env: { ...process.env, PORT: String(port), AIRPORT_CHAOS_PROFILE_DB: path, NODE_ENV: 'test', AIRPORT_CHAOS_DEV_QA: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    server.stdout.on('data', b => logs += b);
    server.stderr.on('data', b => logs += b);
    const clients: Client[] = [];
    try {
        for (let n = 0; n < 240 && !logs.includes('healthy and listening') && server.exitCode === null; n++)
            await sleep(30);
        assert.equal(server.exitCode, null, logs);
        for (const [i, mode] of ['solo-free-fly', 'free-fly'].entries()) {
            const c = new Client(port, identities[i].cookie, mode);
            clients.push(c);
            const welcome = await c.wait('welcome');
            assert.equal(welcome.cityId, 'dallas');
            assert.equal(welcome.health, 75);
            assert.ok(welcome.resumeFlight);
            c.send({ type: 'portalReady', transitionId: 'forged' });
            c.send({ type: 'portalEnter' });
            await sleep(100);
            assert.equal(c.packets.filter(p => p.type === 'portalTransition').length, 0, 'a request without accepted crossing cannot authorize travel');
            for (let n = 0; n < 7; n++) {
                await sleep(100);
                c.send({ type: 'state', stateSequence: ++c.sequence, position: { x: gate.x, y: gate.y, z: gate.z + 120 - n * 30 }, rotation: { x: 0, y: 0, z: 0 } });
            }
            c.send({ type: 'portalEnter' });
            const approved = await c.wait('portalTransition', p => p.phase === 'APPROVED');
            const before = profiles.getOrCreate(identities[i].pilotId, 'Pilot').credits;
            c.send({ type: 'portalReady', transitionId: 'forged' });
            await sleep(100);
            assert.equal(transitions.get(identities[i].pilotId)?.phase, 'APPROVED');
            c.send({ type: 'portalTransit', transitionId: approved.id });
            c.send({ type: 'portalReady', transitionId: approved.id });
            const committed = await c.wait('portalTransition', p => p.phase === 'COMMITTED');
            assert.equal(committed.cityId, 'milwaukee');
            assert.equal(committed.reward, 250);
            assert.equal(committed.health, 75);
            assert.ok(committed.pose.position.y > 60);
            assert.equal(profiles.getOrCreate(identities[i].pilotId, 'Pilot').credits, before + 250);
            c.send({ type: 'portalArrived', transitionId: approved.id });
            await c.wait('portalTransition', p => p.phase === 'ARRIVED');
            c.send({ type: 'portalReady', transitionId: approved.id });
            c.send({ type: 'portalArrived', transitionId: approved.id });
            await sleep(100);
            assert.equal(profiles.getOrCreate(identities[i].pilotId, 'Pilot').credits, before + 250);
            if (i === 0)
                assert.deepEqual(committed.players, []);
            else
                assert.ok(!committed.players.some((p: Packet) => p.playerId === clients[0].packets.find(p => p.type === 'welcome')?.playerId));
            c.socket.close();
            await sleep(150);
            const resumed = new Client(port, identities[i].cookie, mode, 'dallas');
            clients.push(resumed);
            const restored = await resumed.wait('welcome');
            assert.equal(restored.cityId, 'milwaukee');
            assert.ok(restored.resumeFlight);
            assert.equal(restored.tutorialMode, false);
            assert.equal(restored.health, 75);
            assert.ok(restored.portalNavigation.claimed === false);
            // Reverse direction uses accepted movement and the same socket. A gradual turn obeys rotation validation.
            let z = restored.resumeFlight.position.z;
            let yaw = restored.resumeFlight.rotation.y;
            for (let n = 0; n < 20; n++) {
                await sleep(100);
                yaw += Math.PI / 20;
                resumed.send({ type: 'state', stateSequence: ++resumed.sequence, position: { ...restored.resumeFlight.position, z }, rotation: { x: 0, y: yaw, z: 0 } });
            }
            const mg = restored.portalNavigation.gate;
            while (z < mg.z + 60) {
                await sleep(100);
                z += 30;
                resumed.send({ type: 'state', stateSequence: ++resumed.sequence, position: { x: mg.x, y: mg.y, z }, rotation: { x: 0, y: Math.PI, z: 0 } });
            }
            resumed.send({ type: 'portalEnter' });
            const reverse = await resumed.wait('portalTransition', p => p.phase === 'APPROVED');
            resumed.send({type:'portalTransit',transitionId:reverse.id});resumed.send({ type: 'portalReady', transitionId: reverse.id });
            const back = await resumed.wait('portalTransition', p => p.phase === 'COMMITTED');
            assert.equal(back.cityId, 'dallas');
            assert.equal(back.reward, 250);
            resumed.send({ type: 'portalArrived', transitionId: reverse.id });
            await resumed.wait('portalTransition', p => p.phase === 'ARRIVED');
            assert.equal(profiles.getOrCreate(identities[i].pilotId, 'Pilot').credits, before + 500);
            resumed.socket.close(1000, 'Exit flight');
            await sleep(150);
            const fresh = new Client(port, identities[i].cookie, mode, 'dallas', true);
            clients.push(fresh);
            const restarted = await fresh.wait('welcome');
            assert.equal(restarted.cityId, 'dallas');
            assert.equal(restarted.resumeFlight, undefined);
            assert.equal(restarted.spawnAirportId, mode === 'solo-free-fly' ? 'dfw' : undefined);
        }
        for (const [i, city, airportId] of [[2,'milwaukee','central'],[3,'dallas','love']] as const) {
            const pilot=identities[i],c=new Client(port,pilot.cookie,'solo-free-fly','dallas');clients.push(c);
            const welcome=await c.wait('welcome');assert.equal(welcome.cityId,city);
            const credits=profiles.getOrCreate(pilot.pilotId,'Pilot').credits;
            c.send({type:'respawn',cityId:'dallas',airportId:'dfw'});
            const recovery=await c.wait('respawn');
            const airport=cityAirports[city].find(a=>a.id===airportId)!;
            assert.ok(Math.hypot(recovery.spawnPosition.x-airport.x,recovery.spawnPosition.z-airport.z)<airport.runwayLength/2);
            assert.equal(recovery.health,recovery.maxHealth);
            assert.equal(transitions.get(pilot.pilotId)?.to,city);
            assert.deepEqual(transitions.get(pilot.pilotId)?.pose.position,recovery.spawnPosition);
            assert.equal(profiles.getOrCreate(pilot.pilotId,'Pilot').credits,credits);
            c.socket.close();await sleep(150);
            const reconnect=new Client(port,pilot.cookie,'solo-free-fly','dallas');clients.push(reconnect);
            const restored=await reconnect.wait('welcome');assert.equal(restored.cityId,city);
            assert.equal(restored.resumeFlight.onGround,true);
            assert.deepEqual(restored.resumeFlight.position,recovery.spawnPosition);
        }
    }
    catch (error) {
        console.error(logs);
        throw error;
    }
    finally {
        for (const c of clients)
            c.socket.close();
        server.kill();
        await new Promise(r => server.once('exit', r));
        transitions.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
