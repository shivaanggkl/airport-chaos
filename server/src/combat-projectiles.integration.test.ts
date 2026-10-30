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
import { combatShotAimSample, combatAimBlend } from '../../shared/combat-aim.mjs';
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
        this.send({ type: 'state', position: this.pose, rotation: { x: this.pitch, y: this.yaw, z: 0 }, boostActive: false });
    }
}
test('real server shots travel before damage, ignore forged geometry, resolve once, reject stale samples and retain emitted direction', { timeout: 75000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'airport-combat-live-')), db = join(dir, 'profiles.sqlite');
    const profiles = new PlayerProfileStore(db), sessions = new PilotSessionStore(db);
    const one = sessions.issue(undefined, false), two = sessions.issue(undefined, false);
    profiles.getOrCreate(one.pilotId, 'Aim One');
    profiles.getOrCreate(two.pilotId, 'Aim Two');
    const p = await port();
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: resolve(import.meta.dirname, '../..'), env: { ...process.env, PORT: String(p), AIRPORT_CHAOS_PROFILE_DB: db, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => output += String(d));
    child.stderr.on('data', d => output += String(d));
    let a: Client | undefined, b: Client | undefined, timer: ReturnType<typeof setInterval> | undefined;
    try {
        await wait(() => output.includes('listening'), 'isolated server startup', 20000);
        a = new Client(p, one.cookie);
        b = new Client(p, two.cookie);
        await wait(() => Boolean(a?.pose && b?.pose), 'welcome');
        const shooter = a, target = b;
        shooter.goal = { ...shooter.pose!, y: shooter.pose!.y + 400 };
        target.goal = { x: shooter.goal.x, y: shooter.goal.y, z: shooter.goal.z - 800 };
        timer = setInterval(() => { shooter.step(); target.step(); }, 80);
        await wait(() => Math.hypot(shooter.pose!.y - shooter.goal!.y, target.pose!.z - target.goal!.z, target.pose!.y - target.goal!.y) < .01, 'legal airborne setup', 20000);
        await delay(500);
        for (let i = 0; i < 8; i++) {
            shooter.send({ type: 'lock', targetId: target.id, aimHorizontal: 0, aimVertical: 0 });
            await delay(100);
        }
        const sample = shooter.messages.filter(m => m.type === 'lockState').at(-1)!;
        assert.equal(sample.candidateId, target.id);
        const fireAt = Date.now();
        shooter.send({ type: 'fire', clientShotId: 'travel-once', targetId: target.id, aimSample: { from: sample.aimId, to: sample.aimId, blend: 1 }, transform: { position: { x: 999999, y: 999999, z: 999999 }, rotation: { x: 0, y: Math.PI, z: 0 }, aircraftType: 'fighter' }, damage: 999999 });
        await wait(() => shooter.messages.some(m => m.type === 'projectileSpawn' && m.clientShotId === 'travel-once'), 'shot spawn');
        const shot = shooter.messages.find(m => m.type === 'projectileSpawn' && m.clientShotId === 'travel-once')!;
        assert.ok(Math.abs(shot.position.x - shooter.pose!.x) < 10);
        assert.ok(shot.direction.z < -.99, 'forged fire transform is ignored');
        assert.ok(shot.speed >= 520 && shot.speed < 530);
        await delay(150);
        assert.equal(shooter.messages.filter(m => m.type === 'damage' && m.impactId === shot.projectileId).length, 0, 'no immediate assisted damage');
        shooter.goalYaw = .5;
        await delay(250);
        shooter.send({ type: 'fire', clientShotId: 'travel-once' });
        shooter.send({ type: 'damage', playerId: target.id, damage: 999999 });
        await wait(() => shooter.messages.some(m => m.type === 'damage' && m.impactId === shot.projectileId), 'traveling collision hit');
        const hits = shooter.messages.filter(m => m.type === 'damage' && m.impactId === shot.projectileId);
        assert.equal(hits.length, 1);
        assert.equal(hits[0]!.damage, 25);
        assert.ok(Date.now() - fireAt > 150);
        assert.ok(hits[0]!.impactPosition && Number.isFinite(hits[0]!.impactPosition.z));
        assert.equal(shooter.messages.filter(m => m.type === 'projectileSpawn' && m.clientShotId === 'travel-once').length, 1, 'replayed intent cannot emit twice');
        assert.equal(shooter.messages.some(m => m.type === 'assistedShot'), false);
        const states = shooter.messages.filter(m => m.type === 'projectileStates').flatMap(m => m.projectiles).filter(m => m.projectileId === shot.projectileId);
        assert.ok(states.length > 1);
        assert.ok(states.every(m => JSON.stringify(m.direction) === JSON.stringify(shot.direction)), 'turning never bends an emitted shot');
        await delay(400);
        shooter.send({ type: 'fire', clientShotId: 'invalid-aim', aimSample: { from: -1, to: 999999, blend: NaN } });
        await wait(() => shooter.messages.some(m => m.type === 'shotRejected' && m.clientShotId === 'invalid-aim'), 'invalid sample rejected');
        assert.equal(shooter.messages.some(m => m.type === 'projectileSpawn' && m.clientShotId === 'invalid-aim'), false);
        shooter.send({ type: 'fire', clientShotId: 'unaccepted-state', stateSequence: 999999 });
        await wait(() => shooter.messages.some(m => m.type === 'shotRejected' && m.clientShotId === 'unaccepted-state'), 'unaccepted transform revision rejected');
        shooter.send({ type: 'fire', clientShotId: 'new-heading' });
        await wait(() => shooter.messages.some(m => m.type === 'projectileSpawn' && m.clientShotId === 'new-heading'), 'new-heading shot');
        const turned = shooter.messages.find(m => m.type === 'projectileSpawn' && m.clientShotId === 'new-heading')!;
        assert.ok(turned.direction.x < -.3, 'new shots use newly accepted aircraft orientation');
        await delay(200);
        shooter.send({ type: 'lock' });
        await delay(100);
        const oldAim = shooter.messages.filter(m => m.type === 'lockState').at(-1)!;
        await delay(650);
        shooter.send({ type: 'lock' });
        await wait(() => shooter.messages.some(m => m.type === 'lockState' && m.aimId > oldAim.aimId), 'fresh aim after sparse lock updates');
        const freshAim = shooter.messages.filter(m => m.type === 'lockState').at(-1)!;
        shooter.send({ type: 'fire', clientShotId: 'legacy-converged-reference', aimSample: { from: oldAim.aimId, to: freshAim.aimId, blend: 1 } });
        await wait(() => shooter.messages.some(m => m.type === 'shotRejected' && m.clientShotId === 'legacy-converged-reference'), 'legacy converged packet reproduces stale-reference rejection');
        shooter.send({ type: 'fire', clientShotId: 'expired-contributing-reference', aimSample: { from: oldAim.aimId, to: freshAim.aimId, blend: .5 } });
        await wait(() => shooter.messages.some(m => m.type === 'shotRejected' && m.clientShotId === 'expired-contributing-reference'), 'expired contributing sample remains rejected');
        shooter.send({ type: 'fire', clientShotId: 'converged-fresh-reference', aimSample: combatShotAimSample(oldAim.aimId, freshAim.aimId, combatAimBlend(0, 650, 675)) });
        await wait(() => shooter.messages.some(m => m.type === 'projectileSpawn' && m.clientShotId === 'converged-fresh-reference'), 'converged shot accepts only the fresh sample');
        assert.equal(shooter.messages.some(m => m.type === 'projectileSpawn' && m.clientShotId === 'expired-contributing-reference'), false);
        // Reproduce the reported nearby, off-centre contact using real server acquisition.
        shooter.goalYaw = 0;
        target.goal = { x: shooter.pose!.x + 200, y: shooter.pose!.y + 35, z: shooter.pose!.z - 730 };
        await wait(() => Math.hypot(target.pose!.x-target.goal!.x, target.pose!.y-target.goal!.y, target.pose!.z-target.goal!.z) < .01 && Math.abs(shooter.yaw) < .001, 'off-centre airborne setup', 10000);
        await delay(300);
        const acquireStart = shooter.messages.length;
        for (let i=0;i<30;i++) {
            shooter.send({type:'lock', targetId:target.id});
            await delay(100);
            const latest=shooter.messages.filter(m=>m.type==='lockState').at(-1);
            if(latest?.targetId===target.id && latest.aimX>.2) break;
        }
        const nearby=shooter.messages.filter(m=>m.type==='lockState').at(-1)!;
        assert.equal(nearby.targetId,target.id,'nearby target receives an accurate automatic firing solution');
        assert.ok(nearby.aimX>.2,'assistance reaches the existing detection area beyond the old 0.10 rad limit');
        assert.ok(shooter.messages.slice(acquireStart).some(m=>m.type==='lockState' && m.candidateId===target.id && !m.targetId),'selection does not declare a lock before convergence');
        shooter.send({type:'fire',clientShotId:'nearby-offcentre',aimSample:{from:nearby.aimId,to:nearby.aimId,blend:1}});
        await wait(()=>shooter.messages.some(m=>m.type==='projectileSpawn' && m.clientShotId==='nearby-offcentre'),'nearby shot accepted');
        const nearbyShot=shooter.messages.find(m=>m.type==='projectileSpawn' && m.clientShotId==='nearby-offcentre')!;
        await wait(()=>shooter.messages.some(m=>m.type==='damage' && m.impactId===nearbyShot.projectileId),'off-centre target hit by actual travelling bullet');
        shooter.send({ type: 'respawn' });
        await wait(() => shooter.messages.some(m => m.type === 'projectileRemove' && m.projectileId === turned.projectileId), 'respawn removes stale projectile');
    }
    finally {
        if (timer)
            clearInterval(timer);
        a?.socket.close();
        b?.socket.close();
        child.kill('SIGTERM');
        await delay(200);
        rmSync(dir, { recursive: true, force: true });
    }
});
test('M8, M9 and M10 select their transport, allow steering to escorts, and damage the transport only on projectile arrival', { timeout: 120000 }, async () => {
    const db = `/private/tmp/airport-chaos-combat-${randomUUID()}.sqlite`;
    const profiles = new PlayerProfileStore(db, true, true), sessions = new PilotSessionStore(db), journeys = new JourneyAttemptStore(db, true);
    const pilots = [sessions.issue(undefined, false), sessions.issue(undefined, false), sessions.issue(undefined, false)];
    const missions = [journeyDallas08, journeyDallas09, journeyDallas10];
    const attempts = pilots.map((pilot, i) => { profiles.getOrCreate(pilot.pilotId, 'Mission QA'); profiles.grantAircraftEntitlements(pilot.pilotId, ['fighter'], 'test:combat'); profiles.equipAircraft(pilot.pilotId, 'fighter'); return journeys.launch(pilot.pilotId, 'fighter', Date.now(), missions[i]!.id); });
    const p = await port();
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: resolve(import.meta.dirname, '../..'), env: { ...process.env, PORT: String(p), AIRPORT_CHAOS_PROFILE_DB: db, AIRPORT_CHAOS_LOCAL_QA_UNLOCK_ALL: 'true', AIRPORT_CHAOS_DEV_QA: '1', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => output += String(d));
    child.stderr.on('data', d => output += String(d));
    const clients: Client[] = [];
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
        await wait(() => output.includes('listening'), 'mission QA server', 20000);
        clients.push(...pilots.map((pilot, i) => new Client(p, pilot.cookie, 'dallas', attempts[i]!.attemptId)));
        await wait(() => clients.every(c => Boolean(c.pose)), 'mission welcomes', 10000);
        for (let frame = 0; frame < 45; frame++) {
            for (const c of clients)
                c.step();
            await delay(80);
        }
        timer = setInterval(() => {
            for (const c of clients) {
                const state = c.messages.filter(m => m.type === 'transportState').at(-1);
                if (state) {
                    c.goal = { x: Math.max(-24500, state.pose.x + Math.sin(state.pose.yaw) * 1000), y: state.pose.y + 12, z: state.pose.x + Math.sin(state.pose.yaw) * 1000 < -24500 ? state.pose.z + 1500 : state.pose.z + Math.cos(state.pose.yaw) * 1000 };
                    c.goalYaw = state.pose.yaw;
                    if (c.aimTargetId) {
                        const escort = c.messages.filter(m => m.type === 'state' && m.playerId === c.aimTargetId).at(-1);
                        if (escort) {
                            c.goalYaw = Math.atan2(c.pose!.x - escort.position.x, c.pose!.z - escort.position.z);
                            c.goalPitch = Math.atan2(escort.position.y - c.pose!.y, Math.hypot(escort.position.x - c.pose!.x, escort.position.z - c.pose!.z));
                        }
                    }
                }
                c.step();
            }
        }, 80);
        for (const [i, c] of clients.entries()) {
            c.send({ type: 'transportReady', attemptId: attempts[i]!.attemptId });
            c.send({ type: 'journeyCountdownComplete', attemptId: attempts[i]!.attemptId });
        }
        await wait(() => clients.every(c => c.messages.some(m => m.type === 'transportState') && c.messages.some(m => m.type === 'journeyAttempt' && m.attempt.status === 'RACING')), 'transport encounter starts', 15000);
        await delay(160);
        await wait(() => clients.every(c => c.messages.filter(m => m.type === 'transportState').at(-1)!.pose.x + Math.sin(c.yaw) * 1000 > -24500 && c.pose && c.goal && Math.hypot(c.pose.x - c.goal.x, c.pose.y - c.goal.y, c.pose.z - c.goal.z) < 90), 'legal approach to all transports', 70000).catch(error => { console.error(JSON.stringify({ clients: clients.map(c => ({ pose: c.pose, goal: c.goal, yaw: c.yaw, journey: c.messages.filter(m => m.type === 'journeyAttempt').at(-1) })), log: output.slice(-4000) })); throw error; });
        for (const c of clients)
            for (let n = 0; n < 8; n++) {
                c.send({ type: 'lock' });
                await delay(100);
            }
        for (const [i, c] of clients.entries()) {
            c.send({ type: 'lock' });
            await delay(120);
            const sample = c.messages.filter(m => m.type === 'lockState').at(-1)!;
            assert.equal(sample.candidateId, `transport:${attempts[i]!.attemptId}`, JSON.stringify({ pose: c.pose, goal: c.goal, yaw: c.yaw, lock: sample, transport: c.messages.filter(m => m.type === 'transportState').at(-1), journey: c.messages.filter(m => m.type === 'journeyAttempt').at(-1), log: output.slice(-4000) }));
            assert.ok(sample.leadPoint);
            const before = c.messages.filter(m => m.type === 'transportState').at(-1)!;
            const id = `mission-${i}-travel`;
            c.send({ type: 'fire', clientShotId: id, aimSample: { from: sample.aimId, to: sample.aimId, blend: 1 } });
            await wait(() => c.messages.some(m => m.type === 'projectileSpawn' && m.clientShotId === id), 'mission shot accepted');
            await wait(() => c.messages.some(m => m.type === 'transportState' && m.hitSequence > before.hitSequence), 'transport projectile impact', 8000);
            const hit = c.messages.filter(m => m.type === 'transportState' && m.hitSequence > before.hitSequence)[0]!;
            assert.equal(hit.health, 1960);
            assert.ok(hit.hitPosition);
            const escort = c.messages.filter(m => m.type === 'state' && m.rearGuardEscort && m.lifeState === 'alive').at(-1);
            assert.ok(escort, 'assigned escorts are present');
            c.aimTargetId = escort.playerId;
            const turnUntil = Date.now() + 15000;
            let firingTick = 0;
            while (Date.now() < turnUntil) {
                c.send({ type: 'lock' });
                // Keep firing through the turn, as holding FIRE does in the app.
                if (firingTick++ % 2 === 0) {
                    const aim = c.messages.filter(m => m.type === 'lockState').at(-1)!;
                    c.send({ type: 'fire', clientShotId: `switch-${i}-${firingTick}`,
                        aimSample: { from: aim.aimId, to: aim.aimId, blend: 1 } });
                }
                await delay(100);
                if (c.messages.filter(m => m.type === 'lockState').at(-1)?.candidateId === escort.playerId)
                    break;
            }
            assert.ok(c.messages.some(m => m.type === 'lockState' && m.candidateId === escort.playerId), 'clear escort alignment can replace the mission objective: ' + JSON.stringify({ pose: c.pose, yaw: c.yaw, pitch: c.pitch, escort: c.messages.filter(m => m.type === 'state' && m.playerId === escort.playerId).at(-1), lock: c.messages.filter(m => m.type === 'lockState').at(-1) }));
            assert.ok(c.messages.some(m => m.type === 'projectileSpawn' &&
                String(m.clientShotId).startsWith(`switch-${i}-`)), 'firing remains active while switching targets');
        }
    }
    finally {
        if (timer)
            clearInterval(timer);
        for (const c of clients)
            c.socket.close();
        child.kill('SIGTERM');
        await delay(200);
        for (const suffix of ['', '-wal', '-shm'])
            rmSync(db + suffix, { force: true });
    }
});
