import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createApexEncounter, apexSpecies } from './m20-apex.js';
import { createM19Encounter, stepM19, disposeM19, permittedM19Damage } from './m19-titan.js';
import { SpeciesRegistry } from './titan/definitions.js';
import { titanAnchor, titanAttackPose } from '../../shared/titan-pose.mjs';
import { journeyDallas19, journeyDallas20, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { armoredApexModel as binding } from '../../shared/armored-apex-model.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { MonsterArrivalModel } from '../../client/src/monster-arrival-model.js';
const bytes = readFileSync(new URL('../../client/public/assets/models/monsters/armored-apex.glb', import.meta.url));
// Geometry tests deliberately omit pixel decoding; the browser test renders the real packed textures.
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: async () => new THREE.Texture() }));
const source = loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
test('M20 character is an original skinned 3D mesh with textures, three LODs, and all animation clips', async () => {
    const gltf = await source, mesh = gltf.scene;
    assert(gltf.animations.some(a => a.name === 'Defeat'));
    assert(gltf.animations.some(a => a.name === 'Walk'));
    for (const [name, max] of [['MonsterNear', 60500], ['MonsterMid', 32000], ['MonsterFar', 12500]]) {
        let count = 0, skinned = 0;
        mesh.getObjectByName(name).traverse(o => { if (o.isSkinnedMesh) {
            skinned++;
            count += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
            assert(o.geometry.attributes.uv);
            assert(o.geometry.attributes.skinWeight);
        } });
        assert(skinned > 0);
        assert(count <= max, `${name}: ${count}`);
    }
    for (const name of Object.values(binding.bones))
        assert(mesh.getObjectByName(name), name);
    assert.equal(mesh.getObjectByName('TailBase'), undefined);
    assert.equal(apexSpecies.abilities.length, 4);
    assert.equal(apexSpecies.level, 'HARD');
    assert.equal(apexSpecies.health, 3000);
    assert(bytes.length < 9000000);
});
test('M20 keeps identity, reward and airborne start; old gates and race clock cannot complete it', () => {
    assert.equal(journeyDallas20.id, 'journey-dallas-20');
    assert.equal(journeyDallas20.firstClearCredits, 2700);
    assert.equal(journeyDallas20.timeLimitMs, 240000);
    assert.equal(journeyDallas20.gates.length, 0);
    assert.deepEqual(journeyDallas20.airborneSpawn, journeyDallas19.airborneSpawn);
    assert(authorizedJourneyAirborneSpawn({ missionId: journeyDallas20.id, status: 'APPROACH' }, journeyDallas20, () => 135));
    assert.equal(journeyGateCrossing({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 100 }, 0, 135, journeyDallas20), false);
});
test('Apex chest gem applies 1.5x once; normal body stays 1x and encounters remain isolated', () => {
    const e = createApexEncounter('apex', 'pilot', 0, () => 135, []), p = e.frame.limbs.gem, dir = { x: Math.sin(e.frame.yaw), y: 0, z: Math.cos(e.frame.yaw) }, shot = { encounterId: 'apex', source: 'pilot', sequence: 1, from: { x: p.x + dir.x * 500, y: p.y, z: p.z + dir.z * 500 }, to: p, radius: 1, amount: 25, delta: 0 };
    assert.equal(e.engine.damage(shot), 37.5);
    assert.equal(e.engine.damage(shot), 0);
    assert.equal(e.engine.damage({ ...shot, sequence: 2, encounterId: 'other' }), 0);
    const m19 = createM19Encounter('m19', 'other', 0, () => 135, []);
    assert.equal(m19.engine.snapshot().health, 2500);
    assert.equal(e.engine.snapshot().health, 2962.5);
    disposeM19(e);
    assert.equal(m19.engine.snapshot().health, 2500);
});
test('all four powers execute real warning/impact stages and the actual rig follows engine hand and mouth anchors', async (t) => {
    const gltf = await source, results = [];
    for (const ability of apexSpecies.abilities) {
        const config = structuredClone(apexSpecies);
        config.id += '-' + ability.id;
        config.abilities = [ability];
        config.movement.walk = .01;
        config.movement.run = .01;
        config.movement.turnRate = .00001;
        const species = new SpeciesRegistry().register(config), e = createApexEncounter(ability.id, 'p', 0, () => 135, []);
        // A trusted single-power definition uses the same host/model adapter, not a client attack command.
        const { createM19Encounter: host } = await import('./m19-titan.js'), { armoredApexGeometry: geometry } = await import('../../shared/armored-apex-geometry.mjs');
        disposeM19(e);
        const encounter = host(ability.id, 'p', 0, () => 135, [], 3000, species, { geometry, spawn: journeyDallas20.monster, environmentDamage: false }), root = encounter.frame.position, yaw = encounter.frame.yaw;
        let target = titanAnchor(root, yaw, { x: 0, y: 600, z: 650 });
        if (ability.mechanism === 'sweep')
            target = titanAttackPose(root, yaw, species.joints['hand-left'].position, ability, 'ACTIVE', .5);
        if (ability.id === 'ground-smash')
            target = titanAnchor(root, yaw, { x: -230, y: 60, z: 200 });
        if (ability.id === 'charging-rampage')
            target = titanAnchor(root, yaw, { x: 0, y: 330, z: 600 });
        const model = new MonsterArrivalModel(Promise.resolve(gltf), binding);
        await model.ready;
        let warning = false, active = false, hits = 0, error = 0;
        for (let i = 1; i <= 300; i++) {
            stepM19(encounter, target, { x: 0, y: 0, z: 0 }, 18, i * 50);
            const f = encounter.frame;
            warning ||= f.ability?.stage === 'WARNING';
            active ||= f.ability?.stage === 'ACTIVE';
            hits += f.events.filter(v => v.kind === 'damage' && v.ability === ability.id).length;
            model.root.position.set(f.position.x, f.position.y + (f.poseOffsetY ?? 0), f.position.z);
            model.root.rotation.y = f.yaw;
            model.setTitanPose(f);
            model.setMotion(f.velocity.x, f.velocity.z, f.yawVelocity, f.gait, f.headYaw, f.headPitch);
            model.update(.05, 2000, 0);
            model.root.updateMatrixWorld(true);
            for (const [key, name] of [['hand-left', 'LeftHand'], ['hand-right', 'RightHand'], ['mouth', 'Mouth']]) {
                const actual = model.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()), p = f.limbs[key];
                error = Math.max(error, actual.distanceTo(new THREE.Vector3(p.x, p.y, p.z)));
            }
        }
        model.dispose();
        results.push({ id: ability.id, warning, active, hits, error });
        t.diagnostic(JSON.stringify(results.at(-1)));
        assert(warning && active, ability.id);
        assert(hits > 0, `${ability.id} must genuinely hit`);
        assert(error < 2, `${ability.id} pose error ${error}`);
    }
    t.diagnostic(JSON.stringify(results));
});
test('M20 victory, timeout, replay, mission migration, and first-clear credits remain transactional', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-ledger-')), path = join(dir, 'profiles.sqlite'), db = new DatabaseSync(path);
    db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('p',0,0)");
    db.close();
    try {
        const store = new JourneyAttemptStore(path, true), win = now => { let a = store.launch('p', 'trainer', now, journeyDallas20.id); store.approach('p', a.attemptId, now + 1); assert.equal(store.startTimedGateClock('p', a.attemptId, now + 2), undefined); a = store.startMonsterArrival('p', a.attemptId, now + 3); assert.equal(a.deadlineAt, now + 240003); assert.equal(store.acceptGate('p', a.attemptId, 0, now + 4), undefined); for (let i = 0; i < 120; i++)
            a = store.hitMonster('p', a.attemptId, now + 200 + i * 250, 25); assert.equal(a.status, 'COMPLETED'); assert.equal(a.monsterHealth, 0); assert.equal(store.hitMonster('p', a.attemptId, now + 31000, 25), undefined); return a; };
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-21'), false);
        assert.equal(win(1000).firstClearCredits, 2700);
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-21'), true);
        assert.equal(win(40000).firstClearCredits, 0);
        assert(store.progress('p', journeyDallas20.id).completed);
        const a = store.launch('p', 'trainer', 80000, journeyDallas20.id);
        store.approach('p', a.attemptId, 80001);
        const start = store.startMonsterArrival('p', a.attemptId, 80002);
        assert.equal(store.hitMonster('p', a.attemptId, start.deadlineAt, 3000), undefined);
        assert.equal(store.fail('p', a.attemptId, 'TIME_UP', start.deadlineAt).status, 'FAILED');
        const old = store.launch('p', 'trainer', 400000, journeyDallas20.id), sql = new DatabaseSync(path);
        sql.prepare('UPDATE journey_attempts SET definition_revision=0 WHERE attempt_id=?').run(old.attemptId);
        sql.close();
        const reopened = new JourneyAttemptStore(path, true);
        assert.equal(reopened.get('p', old.attemptId).failureReason, 'MISSION_UPDATED');
        assert(reopened.progress('p', journeyDallas20.id).completed);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('roar genuinely hits a moving aircraft through real server collision', () => {
    const e = createApexEncounter('moving', 'p', 0, () => 135, []);
    let hit = false;
    const root = e.frame.position, yaw = e.frame.yaw;
    for (let i = 1; i <= 80; i++) {
        const position = titanAnchor(root, yaw, { x: i * .05 * 180, y: 800, z: 600 }), velocity = { x: Math.cos(yaw) * 180, y: 0, z: -Math.sin(yaw) * 180 };
        stepM19(e, position, velocity, 18, i * 50);
        hit ||= e.events.some(v => v.kind === 'damage');
    }
    assert(hit, 'real motion must remain hittable');
    disposeM19(e);
});
test('all four warned powers leave a genuine escape opportunity for a moving aircraft', async () => {
    const { armoredApexGeometry: geometry } = await import('../../shared/armored-apex-geometry.mjs');
    for (const ability of apexSpecies.abilities) {
        const config = structuredClone(apexSpecies);
        config.id += '-avoid-' + ability.id;
        config.abilities = [ability];
        const s = new SpeciesRegistry().register(config), e = createM19Encounter('avoid-' + ability.id, 'p', 0, () => 135, [], 3000, s, { geometry, spawn: journeyDallas20.monster, environmentDamage: false }), root = e.frame.position, yaw = e.frame.yaw;
        let p = titanAnchor(root, yaw, { x: 0, y: 800, z: 1200 });
        if (ability.mechanism === 'sweep')
            p = titanAttackPose(root, yaw, s.joints['hand-left'].position, ability, 'ACTIVE', .5);
        if (ability.id === 'ground-smash')
            p = titanAnchor(root, yaw, { x: -230, y: 60, z: 200 });
        if (ability.id === 'charging-rampage')
            p = titanAnchor(root, yaw, { x: 0, y: 330, z: 600 });
        const distance = Math.hypot(p.x - root.x, p.z - root.z), velocity = { x: (p.x - root.x) / distance * 400, y: 0, z: (p.z - root.z) / distance * 400 };
        let warned = false, active = false, hits = 0;
        for (let i = 1; i <= 200; i++) {
            if (warned)
                p = { x: p.x + velocity.x * .05, y: p.y, z: p.z + velocity.z * .05 };
            stepM19(e, p, velocity, 18, i * 50);
            warned ||= e.frame.ability?.stage === 'WARNING';
            active ||= e.frame.ability?.stage === 'ACTIVE';
            hits += e.events.filter(v => v.kind === 'damage' && v.ability === ability.id).length;
        }
        assert(active, ability.id + ' must actually attack');
        assert.equal(hits, 0, ability.id + ' must be avoidable');
        disposeM19(e);
    }
});
test('close-up head framing cannot cull the actor and the authored defeat reaches the ground', async () => {
    const gltf = await source, model = new MonsterArrivalModel(Promise.resolve(gltf), binding);
    await model.ready;
    model.root.updateMatrixWorld(true);
    const head = model.root.getObjectByName('Head').getWorldPosition(new THREE.Vector3()), camera = new THREE.OrthographicCamera(-90, 90, 90, -90, 1, 10000);
    camera.position.copy(head).add(new THREE.Vector3(0, 50, 2000));
    camera.lookAt(head);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let visible = 0;
    model.root.getObjectByName('MonsterNear').traverse(o => { if (o.isSkinnedMesh) {
        assert(o.boundingSphere.radius > 0);
        if (frustum.intersectsObject(o))
            visible++;
    } });
    assert(visible > 0, 'head-close camera must still draw the creature');
    model.finish('defeat');
    for (let i = 0; i < 100; i++)
        model.update(.05, 1500, 0);
    model.root.updateMatrixWorld(true);
    let low = Infinity;
    model.root.getObjectByName('MonsterNear').traverse(o => { if (!o.isSkinnedMesh)
        return; o.skeleton.update(); const p = new THREE.Vector3(), positions = o.geometry.attributes.position; for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i);
        o.applyBoneTransform(i, p);
        o.localToWorld(p);
        low = Math.min(low, p.y);
    } });
    assert(low >= -.5 && low < 3, `defeat ground clearance ${low}`);
    model.dispose();
});
