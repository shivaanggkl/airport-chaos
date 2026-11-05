import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createM19Encounter, stepM19, m19Species } from './m19-titan.js';
import { loadMonsterDistrictBuildings } from './monster-arrival.js';
import { MonsterArrivalModel } from '../../client/src/monster-arrival-model.js';
const data = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8')), bytes = Buffer.from(data.elevations, 'base64'), samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
const ground = (wx, wz) => { const x = Math.max(0, Math.min(1, (wx - data.bounds.minX) / (data.bounds.maxX - data.bounds.minX))) * (data.width - 1), z = Math.max(0, Math.min(1, (wz - data.bounds.minZ) / (data.bounds.maxZ - data.bounds.minZ))) * (data.height - 1), x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(data.width - 1, x0 + 1), z1 = Math.min(data.height - 1, z0 + 1), at = (a, b) => data.baseElevation + samples[b * data.width + a] * data.scale; return (at(x0, z0) * (1 - x + x0) + at(x1, z0) * (x - x0)) * (1 - z + z0) + (at(x0, z1) * (1 - x + x0) + at(x1, z1) * (x - x0)) * (z - z0); };
const buildings = loadMonsterDistrictBuildings();
test('actual model compatibility and authoritative anchor agreement', async (t) => {
    const buffer = readFileSync(new URL('../../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url));
    const source = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    const model = new MonsterArrivalModel(Promise.resolve(source));
    await model.ready;
    const e = createM19Encounter('a', 'p', 0, ground, buildings);
    let maxHand = 0, maxMouth = 0, maxFoot = 0;
    for (let i = 1; i <= 200; i++) {
        stepM19(e, { x: -7000, y: ground(-7000, -3000) + 800, z: -3000 }, { x: 150, y: 0, z: 0 }, 18, i * 50);
        const f = e.frame;
        model.root.position.set(f.position.x, f.position.y, f.position.z);
        model.root.rotation.y = f.yaw;
        model.setTitanPose(f);
        model.setMotion(f.velocity.x, f.velocity.z, 0, f.gait, f.headYaw, f.headPitch);
        model.update(.05, 2000, 0);
        model.root.updateMatrixWorld(true);
        for (const [key, bone] of Object.entries({ 'hand-left': 'LeftHand', 'hand-right': 'RightHand', mouth: 'Mouth', 'foot-left': 'LeftFoot' })) {
            const p = model.root.getObjectByName(bone).getWorldPosition(new THREE.Vector3()), a = key.startsWith('foot') ? f.feet[key] : f.limbs[key];
            const d = p.distanceTo(new THREE.Vector3(a.x, a.y, a.z));
            if (key.startsWith('hand'))
                maxHand = Math.max(maxHand, d);
            if (key === 'mouth')
                maxMouth = Math.max(maxMouth, d);
            if (key.startsWith('foot'))
                maxFoot = Math.max(maxFoot, d);
        }
    }
    t.diagnostic(JSON.stringify({ maxHand, maxMouth, maxFoot, position: e.frame.position }));
    model.dispose();
    assert(maxHand < 15, 'visible hands must match real collision');
    assert(maxMouth < 15, 'visible muzzle must match beam/projectiles');
    assert(maxFoot < 15, 'visible feet must remain planted');
});
test('M19 configuration retains identity and all ten enabled mechanisms', () => { assert.equal(m19Species.abilities.length, 10); assert.equal(m19Species.health, 2500); assert.equal(m19Species.level, 'HARD'); assert.equal(m19Species.movement.run, 110); });
test('ten M19 powers produce real timed attacks with compatible model poses', async (t) => {
    const { SpeciesRegistry } = await import('./titan/definitions.js');
    const { titanAttackPose, titanAnchor } = await import('../../shared/titan-pose.mjs');
    const buffer = readFileSync(new URL('../../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url)), source = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    const results = [];
    for (const ability of m19Species.abilities) {
        const config = structuredClone(m19Species);
        config.id += '-' + ability.id;
        config.abilities = [ability];
        const species = new SpeciesRegistry().register(config), e = createM19Encounter(ability.id, 'p', 0, () => 135, [], 1500, species), model = new MonsterArrivalModel(Promise.resolve(source));
        await model.ready;
        const root = e.frame.position, yaw = e.frame.yaw;
        let point = titanAnchor(root, yaw, { x: 0, y: 800, z: 1200 });
        if (ability.mechanism === 'sweep')
            point = titanAttackPose(root, yaw, species.joints[ability.requires[0]].position, ability, 'ACTIVE', .5);
        if (['area', 'leap'].includes(ability.mechanism))
            point = titanAnchor(root, yaw, { x: 0, y: 40, z: 150 });
        if (ability.id === 'two-hand-clap')
            point = titanAnchor(root, yaw, { x: 0, y: 640, z: 250 });
        if (ability.id === 'roaring-shockwave')
            point = titanAnchor(root, yaw, { x: 0, y: 700, z: 1200 });
        if (ability.mechanism === 'charge')
            point = titanAnchor(root, yaw, { x: 0, y: 330, z: 500 });
        const events = [], stages = new Set();
        let maxError = 0;
        for (let i = 1; i <= 400; i++) {
            stepM19(e, point, { x: 0, y: 0, z: 0 }, 18, i * 50);
            const f = e.frame;
            if (f.ability)
                stages.add(f.ability.stage);
            events.push(...f.events);
            model.root.position.set(f.position.x, f.position.y + (f.poseOffsetY ?? 0), f.position.z);
            model.root.rotation.y = f.yaw;
            model.setTitanPose(f);
            model.setMotion(f.velocity.x, f.velocity.z, 0, f.gait, f.headYaw, f.headPitch);
            model.update(.05, 2000, 0);
            model.root.updateMatrixWorld(true);
            for (const [key, bone] of Object.entries({ 'hand-left': 'LeftHand', 'hand-right': 'RightHand', tail: 'TailTip', mouth: 'Mouth' })) {
                const p = model.root.getObjectByName(bone).getWorldPosition(new THREE.Vector3()), a = f.limbs[key];
                maxError = Math.max(maxError, p.distanceTo(new THREE.Vector3(a.x, a.y, a.z)));
            }
        }
        results.push({ id: ability.id, stages: [...stages], hits: events.filter(e => e.kind === 'damage' && e.ability === ability.id).length, maxError });
        model.dispose();
    }
    t.diagnostic(JSON.stringify(results));
    assert(results.every(r => r.stages.includes('ACTIVE')), 'every power must activate');
    assert(results.every(r => r.hits > 0), 'all powers must have real contacts');
    assert(results.every(r => r.maxError < 15), 'all physical end effectors must agree');
});
test('real Dallas navigation remains clear and can reposition across the encounter area', async (t) => {
    const { monsterMotionClear, nearbyMotionBuildings } = await import('./monster-arrival.js');
    const e = createM19Encounter('navigation', 'p', 0, ground, buildings), probe = { x: e.x, z: e.z };
    let travel = 0, lastWindowTravel = 0, previous = e.frame.position, maxSpeed = 0, maxFootLift = 0;
    for (let i = 1; i <= 1200; i++) {
        const a = i * .003, position = { x: -6800 + Math.sin(a) * 1100, y: 1050, z: -2400 + Math.cos(a) * 1000 };
        stepM19(e, position, { x: 66 * Math.cos(a), y: 0, z: -60 * Math.sin(a) }, 18, i * 50);
        const f = e.frame;
        for (const key of ['foot-left', 'foot-right']) {
            const p = f.feet[key];
            if (p && f.locomotion !== 'jump') {
                const lift = p.y - ground(p.x, p.z) - 960 * .07024747;
                if (lift > maxFootLift)
                    maxFootLift = lift;
            }
        }
        const moved = Math.hypot(f.position.x - previous.x, f.position.z - previous.z);
        travel += moved;
        if (i > 1000)
            lastWindowTravel += moved;
        previous = f.position;
        maxSpeed = Math.max(maxSpeed, Math.hypot(f.velocity.x, f.velocity.z));
        if (i % 20 === 0) {
            probe.x = f.position.x;
            probe.z = f.position.z;
            assert(monsterMotionClear(f.position.x, f.position.z, f.yaw + Math.PI, ground, nearbyMotionBuildings(probe, buildings), Math.max(0, f.position.y - ground(f.position.x, f.position.z)), 0), 'body cannot rotate through mapped buildings');
        }
    }
    t.diagnostic(JSON.stringify({ travel, lastWindowTravel, maxSpeed, maxFootLift, end: e.frame.position }));
    assert(travel > 400);
    assert(lastWindowTravel > 25, 'cannot remain stuck against buildings');
    assert(maxSpeed <= 140.01);
    assert(maxFootLift < 40, 'repositioning steps must remain within planted-leg reach');
});
test('anatomical weak points, beam interruption and duplicate protection use one health outcome', async () => {
    const { titanAnchor } = await import('../../shared/titan-pose.mjs');
    const { SpeciesRegistry } = await import('./titan/definitions.js');
    const e = createM19Encounter('weak', 'p', 0, () => 135, []);
    const shoot = (point, sequence) => { const forward = { x: Math.sin(e.frame.yaw), y: 0, z: Math.cos(e.frame.yaw) }; return e.engine.damage({ encounterId: e.attemptId, source: 'p', sequence, delta: 0, from: { x: point.x + forward.x * 1000, y: point.y, z: point.z + forward.z * 1000 }, to: point, radius: 1, amount: 25 }); };
    const torso = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 294, z: 0 });
    assert.equal(shoot(torso, 1), 25);
    assert.equal(shoot(torso, 1), 0);
    const head = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 940, z: 50 });
    assert.equal(shoot(head, 2), 37.5);
    const s = structuredClone(m19Species);
    s.id += '-beam-check';
    s.abilities = s.abilities.filter(a => a.id === 'energy-beam');
    const beam = createM19Encounter('beam', 'p', 0, () => 135, [], 1500, new SpeciesRegistry().register(s));
    const target = titanAnchor(beam.frame.position, beam.frame.yaw, { x: 0, y: 850, z: 1200 });
    for (let i = 1; i <= 20; i++)
        stepM19(beam, target, { x: 0, y: 0, z: 0 }, 18, i * 50);
    assert.equal(beam.frame.ability?.id, 'energy-beam');
    assert(['WARNING', 'WINDUP'].includes(beam.frame.ability.stage));
    const mouth = beam.frame.limbs.mouth, forward = { x: Math.sin(beam.frame.yaw), y: 0, z: Math.cos(beam.frame.yaw) }, hit = { encounterId: beam.attemptId, source: 'p', sequence: 1, delta: 0, from: { x: mouth.x + forward.x * 200, y: mouth.y, z: mouth.z + forward.z * 200 }, to: mouth, radius: 1, amount: 25 };
    assert.equal(beam.engine.damage(hit), 50);
    assert.equal(beam.engine.damage({ ...hit, sequence: 2 }), 50);
    assert.equal(beam.engine.snapshot().ability, null, 'sufficient exposed-mouth damage interrupts the charge');
});
test('M19 damage-event receipts, contact immunity and disposal reject stale/replayed events', async () => {
    const { permittedM19Damage, disposeM19 } = await import('./m19-titan.js');
    const e = createM19Encounter('receipt', 'p', 0, () => 135, []);
    const hit = { id: 'receipt:event:1', encounterId: 'receipt', kind: 'damage', type: 'sweep', targetId: 'p', position: { x: 0, y: 0, z: 0 }, amount: 25 };
    assert.equal(permittedM19Damage(e, hit, 1000), 25);
    assert.equal(permittedM19Damage(e, hit, 3000), 0);
    assert.equal(permittedM19Damage(e, { ...hit, id: 'receipt:event:2' }, 1500), 0);
    assert.equal(permittedM19Damage(e, { ...hit, id: 'receipt:event:3' }, 2100), 25);
    disposeM19(e);
    assert.equal(permittedM19Damage(e, { ...hit, id: 'receipt:event:4' }, 4000), 0);
    assert.equal(e.debris.size, 0);
    assert.equal(e.destroyedSites.size, 0);
});
test('Bluejay body projectiles mirror engine health into the transactional first-clear ledger exactly once', async () => {
    const { DatabaseSync } = await import('node:sqlite'), { mkdtempSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path'), { JourneyAttemptStore } = await import('./journey-attempts.js'), { titanAnchor } = await import('../../shared/titan-pose.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'm19-combat-')), path = join(dir, 'profile.sqlite'), db = new DatabaseSync(path);
    db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES ('pilot',0,0)");
    db.close();
    try {
        const store = new JourneyAttemptStore(path, true);
        const win = (now) => {
            const a = store.launch('pilot', 'trainer', now, 'journey-dallas-19');
            store.approach('pilot', a.attemptId, now + 100);
            store.startMonsterArrival('pilot', a.attemptId, now + 200);
            const e = createM19Encounter(a.attemptId, 'p', now + 200, () => 135, []);
            let result;
            for (let i = 1; i <= 100; i++) {
                const p = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 294, z: 0 }), direction = { x: Math.sin(e.frame.yaw), y: 0, z: Math.cos(e.frame.yaw) }, amount = e.engine.damage({ encounterId: e.attemptId, source: 'p', sequence: i, delta: 0, from: { x: p.x + direction.x * 1000, y: p.y, z: p.z + direction.z * 1000 }, to: p, radius: 1, amount: 25 });
                assert.equal(amount, 25);
                result = store.hitMonster('pilot', a.attemptId, now + 500 + i * 250, amount);
                assert.equal(result.monsterHealth, e.engine.snapshot().health);
            }
            assert.equal(result.status, 'COMPLETED');
            assert.equal(store.hitMonster('pilot', a.attemptId, now + 27000, 25), undefined);
            return result;
        };
        assert.equal(win(1000).firstClearCredits, 2550);
        assert.equal(win(40000).firstClearCredits, 0);
        const a = store.launch('pilot', 'trainer', 80000, 'journey-dallas-19');
        store.approach('pilot', a.attemptId, 80100);
        const start = store.startMonsterArrival('pilot', a.attemptId, 80200);
        assert.equal(start.deadlineAt, 320200);
        assert.equal(store.hitMonster('pilot', a.attemptId, start.deadlineAt, 25), undefined);
        assert.equal(store.fail('pilot', a.attemptId, 'TIME_UP', start.deadlineAt).status, 'FAILED');
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('HARD interception can hit a laterally moving aircraft and normal body hits cannot pin its brain', async () => {
    const { SpeciesRegistry } = await import('./titan/definitions.js'), { titanAnchor } = await import('../../shared/titan-pose.mjs');
    const config = structuredClone(m19Species);
    config.id += '-moving-intercept';
    config.abilities = config.abilities.filter(a => a.id === 'fireball-barrage');
    const e = createM19Encounter('moving', 'p', 0, () => 135, [], 2500, new SpeciesRegistry().register(config)), target = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 850, z: 1500 }), velocity = { x: Math.cos(e.frame.yaw) * 220, y: 0, z: -Math.sin(e.frame.yaw) * 220 };
    let hits = 0, releases = 0;
    for (let i = 1; i <= 200; i++) {
        target.x += velocity.x * .05;
        target.z += velocity.z * .05;
        stepM19(e, target, velocity, 18, i * 50);
        hits += e.events.filter(v => v.kind === 'damage' && v.type === 'projectile').length;
        releases += e.events.filter(v => v.type === 'release').length;
        if (i % 5 === 0) {
            const p = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 294, z: 0 }), dir = { x: Math.sin(e.frame.yaw), y: 0, z: Math.cos(e.frame.yaw) };
            e.engine.damage({ encounterId: e.attemptId, source: 'pilot', sequence: i, delta: 0, from: { x: p.x + dir.x * 1000, y: p.y, z: p.z + dir.z * 1000 }, to: p, radius: 1, amount: 25 });
        }
    }
    assert(releases > 0, 'valid sustained incoming hits must not freeze all monster attacks');
    assert(hits > 0, 'real ballistic interception must threaten a moving aircraft');
});
test('renderer safely waits for the asynchronous rig before its first animation update', async () => {
    const buffer = readFileSync(new URL('../../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url));
    let release;
    const source = new Promise(resolve => release = resolve), model = new MonsterArrivalModel(source);
    assert.doesNotThrow(() => model.update(.016, 2000, 0));
    release(await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), ''));
    await model.ready;
    model.update(.016, 2000, 0);
    model.dispose();
});
test('HARD threat response can evade while preserving a valid ranged counterattack', async () => {
    const { titanAnchor } = await import('../../shared/titan-pose.mjs');
    const e = createM19Encounter('threat', 'p', 0, () => 135, []), target = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 850, z: 1300 });
    let defended = false, attacked = false;
    for (let i = 1; i <= 100; i++) {
        const p = e.frame.limbs.body, dir = { x: Math.sin(e.frame.yaw), y: 0, z: Math.cos(e.frame.yaw) };
        stepM19(e, target, { x: 0, y: 0, z: 0 }, 18, i * 50, [{ id: 'incoming', encounterId: e.attemptId, position: { x: p.x + dir.x * 1000, y: p.y, z: p.z + dir.z * 1000 }, velocity: { x: -dir.x * 1500, y: 0, z: -dir.z * 1500 }, radius: 1 }]);
        defended ||= e.frame.tactic === 'defend';
        attacked ||= e.events.some(v => v.type === 'release');
    }
    assert(defended);
    assert(attacked, 'defending must not become passive immunity to continuous fire');
});
test('all ten warned powers can be avoided by sustained, ordinary 400 m/s flight', async (t) => {
    const { SpeciesRegistry } = await import('./titan/definitions.js'), { titanAnchor, titanAttackPose } = await import('../../shared/titan-pose.mjs');
    const results = [];
    for (const ability of m19Species.abilities) {
        const s = structuredClone(m19Species);
        s.id += '-evade-' + ability.id;
        s.abilities = [ability];
        const e = createM19Encounter('evade-' + ability.id, 'p', 0, () => 135, [], 1500, new SpeciesRegistry().register(s)), root = e.frame.position, yaw = e.frame.yaw;
        let p = titanAnchor(root, yaw, { x: 0, y: 850, z: 5700 });
        if (ability.mechanism === 'sweep')
            p = titanAttackPose(root, yaw, s.joints[ability.requires[0]].position, ability, 'ACTIVE', .5);
        if (['area', 'leap'].includes(ability.mechanism))
            p = titanAnchor(root, yaw, { x: 0, y: 40, z: 150 });
        if (ability.id === 'energy-beam')
            p = titanAnchor(root, yaw, { x: 0, y: 850, z: 900 });
        if (ability.id === 'roaring-shockwave')
            p = titanAnchor(root, yaw, { x: 0, y: 700, z: 1200 });
        if (ability.id === 'two-hand-clap')
            p = titanAnchor(root, yaw, { x: 0, y: 640, z: 350 });
        if (ability.mechanism === 'charge')
            p = titanAnchor(root, yaw, { x: 0, y: 330, z: 500 });
        const distance = Math.hypot(p.x - root.x, p.z - root.z), lateral = ability.id === 'energy-beam', v = lateral ? { x: Math.cos(yaw) * 400, y: 0, z: -Math.sin(yaw) * 400 } : { x: (p.x - root.x) / distance * 400, y: 0, z: (p.z - root.z) / distance * 400 };
        let active = false, warned = false, hits = 0;
        const impacts = [];
        for (let i = 1; i <= 200; i++) {
            if (warned)
                p = { x: p.x + v.x * .05, y: p.y, z: p.z + v.z * .05 };
            stepM19(e, p, v, 18, i * 50);
            warned ||= e.frame.ability?.stage === 'WARNING';
            active ||= e.frame.ability?.stage === 'ACTIVE';
            const hitEvents = e.events.filter(event => event.kind === 'damage' && event.ability === ability.id);
            hits += hitEvents.length;
            for (const event of hitEvents)
                impacts.push({ type: event.type, time: i * .05, position: { ...p } });
        }
        results.push({ power: ability.id, active, hits, impacts });
    }
    t.diagnostic(JSON.stringify(results));
    assert(results.every(r => r.active), 'avoidance must follow a real activated attack');
    assert(results.every(r => r.hits === 0), 'warnings must leave a physically meaningful escape opportunity');
});
test('live view preserves the initial forward axis and muzzle with a rotated world root', async () => {
    const { MonsterArrivalView } = await import('../../client/src/monster-arrival.ts');
    const buffer = readFileSync(new URL('../../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url)), source = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    const scene = new THREE.Scene(), view = new MonsterArrivalView(scene, 135, 135, undefined, Promise.resolve(source), () => 135);
    await view.ready;
    const model = scene.getObjectByName('monster-arrival-supplied-model');
    model.updateWorldMatrix(true, true);
    const before = model.getWorldQuaternion(new THREE.Quaternion());
    const e = createM19Encounter('view-axis', 'p', 0, () => 135, []), f = e.frame;
    view.setState({ type: 'monsterState', attemptId: e.attemptId, x: f.position.x, y: f.position.y, z: f.position.z, yaw: f.yaw, phase: 'walk', hitSequence: 0, velocity: f.velocity, gaitPhase: f.gait, aimYaw: f.headYaw, aimPitch: f.headPitch, titan: f, shots: [], serverNow: 0 });
    view.update(.016);
    model.updateWorldMatrix(true, true);
    assert(before.angleTo(model.getWorldQuaternion(new THREE.Quaternion())) < 1e-5, 'adapter handoff cannot visibly flip the monster');
    const mouth = model.getObjectByName('Mouth').getWorldPosition(new THREE.Vector3()), anchor = f.limbs.mouth;
    assert(mouth.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z)) < .01, 'bind rotations must be relative to the actor, not the city root');
    view.dispose();
    assert.equal(scene.children.length, 0);
});
test('reconnecting sessions retain a stable pilot target and cannot repeat one beam impact', async () => {
    const { SpeciesRegistry } = await import('./titan/definitions.js'), { titanAnchor } = await import('../../shared/titan-pose.mjs');
    const config = structuredClone(m19Species);
    config.id += '-reconnect';
    config.abilities = config.abilities.filter(a => a.id === 'energy-beam');
    const e = createM19Encounter('reconnect', 'session-a', 0, () => 135, [], 1500, new SpeciesRegistry().register(config));
    e.pilotId = 'same-pilot';
    const target = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 850, z: 1200 });
    let hits = 0, reconnected = false;
    for (let i = 1; i <= 100; i++) {
        stepM19(e, target, { x: 0, y: 0, z: 0 }, 18, i * 50);
        const damage = e.events.filter(event => event.kind === 'damage' && event.ability === 'energy-beam');
        hits += damage.length;
        if (damage.length) {
            assert.equal(damage[0].targetId, 'same-pilot');
            e.playerId = 'session-b';
            reconnected = true;
        }
    }
    assert(reconnected);
    assert.equal(hits, 1);
});
test('M19 pursues across Dallas beyond the old pen and uses real traversal jumps', t => {
    const e = createM19Encounter('city-travel', 'p', 0, ground, buildings);
    let travel = 0, jumps = 0, previous = e.frame.position, wasJump = false, minX = previous.x, minZ = previous.z, maxStep = 0;
    for (let i = 1; i <= 2400; i++) {
        const seconds = i * .05, position = { x: -7500 - seconds * 85, y: ground(-7500 - seconds * 85, -3555 - seconds * 20) + 850, z: -3555 - seconds * 20 };
        stepM19(e, position, { x: -85, y: 0, z: -20 }, 18, i * 50);
        const f = e.frame, d = Math.hypot(f.position.x - previous.x, f.position.z - previous.z);
        travel += d;
        maxStep = Math.max(maxStep, d);
        minX = Math.min(minX, f.position.x);
        minZ = Math.min(minZ, f.position.z);
        const jumping = f.locomotion === 'jump';
        if (jumping && !wasJump)
            jumps++;
        wasJump = jumping;
        previous = f.position;
    }
    t.diagnostic(JSON.stringify({ travel, jumps, minX, minZ, maxStep }));
    assert(travel > 3000, 'must make sustained city-scale progress');
    assert(minX < -9400 || minZ < -4300, 'must leave the former small encounter pen');
    assert(jumps > 0, 'must use a real safe traversal jump against airborne aircraft');
    assert(maxStep <= 7.01, 'no positional jumps or teleporting');
});
test('repaired hand skin cannot follow a leg and stays continuous through live poses', async (t) => {
    const bytes = readFileSync(new URL('../../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url)), source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const model = new MonsterArrivalModel(Promise.resolve(source));
    await model.ready;
    for (const name of ['MonsterNear', 'MonsterMid', 'MonsterFar']) {
        const mesh = model.root.getObjectByName(name), indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < weights.count; i++) {
            let arm = false, leg = false, total = 0;
            for (let k = 0; k < 4; k++) {
                const amount = weights.getComponent(i, k);
                total += amount;
                if (amount < .001)
                    continue;
                const n = mesh.skeleton.bones[indices.getComponent(i, k)].name;
                arm ||= /UpperArm|Forearm|Hand/.test(n);
                leg ||= /Thigh|Shin|Foot/.test(n);
            }
            assert(!(arm && leg), `${name}: one surface vertex cannot be attached to separate limbs`);
            assert(Math.abs(total - 1) < 1e-5);
        }
    }
    const mesh = model.root.getObjectByName('MonsterNear'), p = mesh.geometry.attributes.position, ix = mesh.geometry.index, rest = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i)), pairs = [];
    for (let i = 0; i < ix.count; i += 3)
        for (let k = 0; k < 3; k++) {
            const a = ix.getX(i + k), b = ix.getX(i + (k + 1) % 3), u = rest[a], v = rest[b], length = u.distanceTo(v);
            if (length > .001 && Math.abs(u.x) > .34 && u.y > .14 && u.y < .4 && Math.abs(v.x) > .34 && v.y > .14 && v.y < .4)
                pairs.push({ a, b, length });
        }
    const e = createM19Encounter('skin-quality', 'p', 0, () => 135, []);
    let worst = 0;
    for (let i = 1; i <= 160; i++) {
        stepM19(e, { x: -7000, y: 985, z: -3555 }, { x: 0, y: 0, z: 110 }, 18, i * 50);
        const f = e.frame;
        model.root.position.set(f.position.x, f.position.y, f.position.z);
        model.root.rotation.y = f.yaw;
        model.setTitanPose(f);
        model.setMotion(f.velocity.x, f.velocity.z, f.yawVelocity, f.gait, f.headYaw, f.headPitch);
        model.update(.05, 1800, 0);
        if (i % 20)
            continue;
        mesh.updateMatrixWorld(true);
        mesh.skeleton.update();
        const posed = rest.map((p, i) => mesh.applyBoneTransform(i, p.clone()));
        for (const { a, b, length } of pairs)
            worst = Math.max(worst, posed[a].distanceTo(posed[b]) / length);
    }
    model.dispose();
    t.diagnostic(JSON.stringify({ worstHandEdgeStretch: worst }));
    assert(worst < 2, 'no hand spikes or stretched ribbons during real motion');
});
