import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stationaryWarlordSpecies, createStationaryWarlordEncounter } from './stationary-warlord.js';
import { ashenWarlordSpecies } from './ashen-warlord.js';
import { createAshenPose } from './ashen-warlord-pose.js';
import { stepM19, disposeM19, permittedM19Damage } from './m19-titan.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { journeyDallas25, journeyDallas19, journeyMissionSlot } from '../../shared/journey-mission.mjs';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import { AshenWarlordModel } from '../../client/src/ashen-warlord-model.js';
import { MonsterArrivalView } from '../../client/src/monster-arrival.js';
const bytes = readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb', import.meta.url));
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: async () => new THREE.Texture() }));
const source = loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const encounter = () => createStationaryWarlordEncounter('easy', 'pilot', 0, () => 0, []);
const far = { x: 0, y: 2000, z: 0 }, zero = { x: 0, y: 0, z: 0 };
test('M19 has an isolated EASY profile; M24 retains its existing battle', () => {
    assert.equal(journeyMissionSlot(journeyDallas25.id), 19);
    assert.equal(journeyMissionSlot(journeyDallas19.id), 24);
    assert.equal(stationaryWarlordSpecies.health, 500);
    assert.equal(stationaryWarlordSpecies.level, 'EASY');
    assert.deepEqual(stationaryWarlordSpecies.abilities.map(a => a.id), ['hand-strike']);
    assert.equal(stationaryWarlordSpecies.abilities[0].damage, 15);
    assert.equal(stationaryWarlordSpecies.abilities[0].cooldown, 4);
    assert.equal(stationaryWarlordSpecies.contactDamage ?? 0, 0);
    assert.equal(ashenWarlordSpecies.health, 2500);
    assert(ashenWarlordSpecies.abilities.some(a => a.mechanism === 'projectile'));
});
test('stationary server pose stays fixed, uses only authored Idle/Punch/Roar, and roar never damages', () => {
    const e = encounter(), initial = e.frame.position, yaw = e.frame.yaw, clips = new Set();
    for (let ms = 50; ms <= 65000; ms += 50) {
        stepM19(e, far, zero, 20, ms);
        assert.deepEqual(e.frame.position, initial);
        assert.equal(e.frame.yaw, yaw);
        assert.equal(e.frame.projectiles.length, 0);
        assert(!e.events.some(v => v.kind === 'damage'));
        clips.add(e.frame.animation.clip);
    }
    assert.deepEqual([...clips].sort(), [model.clips.idle.name, model.clips.roar.name].sort());
    disposeM19(e);
});
test('only swept authored fist contact hurts; attacks and damage events are deduplicated', () => {
    const e = encounter();
    const limbs = {}, feet = {}, axes = {};
    createAshenPose(500, true)(limbs, feet, e.frame.position, e.frame.yaw, axes, { time: .7, health: 500, gait: 0, velocity: zero, yawVelocity: 0, airborne: false, ability: { id: 'hand-strike', stage: 'ACTIVE', progress: .5, elapsed: .7, active: .3, warning: .35, windup: .2, recovery: 1.4 } });
    const target = limbs['hand-left'];
    let damage = 0;
    const strikes = [];
    for (let ms = 50; ms <= 18000; ms += 50) {
        stepM19(e, target, zero, 20, ms);
        for (const event of e.events)
            if (event.kind === 'damage') {
                assert.equal(e.frame.ability?.stage, 'ACTIVE');
                assert.equal(event.ability, 'hand-strike');
                assert.equal(event.amount, 15);
                const amount = permittedM19Damage(e, event, 100000 + ms);
                assert.equal(amount, 15);
                assert.equal(permittedM19Damage(e, event, 100000 + ms), 0);
                damage += amount;
                strikes.push(ms);
            }
    }
    assert(damage > 0, 'a plane touching the actual animated fist is hit');
    for (let i = 1; i < strikes.length; i++)
        assert(strikes[i] - strikes[i - 1] >= 4000);
    const before = damage;
    for (let ms = 18050; ms <= 24000; ms += 50) {
        stepM19(e, far, zero, 20, ms);
        assert(!e.events.some(v => v.kind === 'damage'));
    }
    assert.equal(damage, before);
    disposeM19(e);
});
test('20 confirmed 25-damage shots defeat the server boss; replayed shots do not count and defeat stops attacks', () => {
    const e = encounter(), body = e.frame.limbs.body;
    for (let sequence = 1; sequence <= 20; sequence++) {
        const shot = { encounterId: e.attemptId, source: 'pilot', sequence, from: { x: body.x - 4000, y: body.y, z: body.z }, to: { x: body.x + 4000, y: body.y, z: body.z }, amount: 25, radius: 1, delta: 0 };
        assert.equal(e.engine.damage(shot), 25);
        assert.equal(e.engine.damage(shot), 0);
        assert.equal(e.engine.snapshot().health, 500 - sequence * 25);
    }
    stepM19(e, far, zero, 20, 50);
    assert.equal(e.frame.ability, null);
    assert(!e.events.some(v => v.kind === 'damage'));
    disposeM19(e);
    assert.equal(e.disposed, true);
});
test('M19 persists completion once, starts its four-minute clock at GO, times out and retries cleanly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stationary-boss-')), path = join(dir, 'profile.sqlite');
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
    const store = new JourneyAttemptStore(path, true);
    try {
        for (const start of [1000, 300000]) {
            const a = store.launch('pilot', 'trainer', start, journeyDallas25.id);
            assert.equal(a.monsterHealth, 500);
            store.approach('pilot', a.attemptId, start + 100);
            assert.equal(store.startMonsterArrival('pilot', a.attemptId, start + 3000)?.deadlineAt, start + 243000);
            for (let i = 1; i <= 20; i++) {
                const result = store.hitMonster('pilot', a.attemptId, start + 3000 + i * 100, 25);
                assert.equal(result.status, i === 20 ? 'COMPLETED' : 'RACING');
                if (i === 20)
                    assert.equal(result.firstClearCredits, start === 1000 ? 2550 : 0);
            }
            assert.equal(store.hitMonster('pilot', a.attemptId, start + 6000, 25), undefined);
        }
        assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2550);
        const a = store.launch('pilot', 'trainer', 600000, journeyDallas25.id);
        store.approach('pilot', a.attemptId, 600100);
        store.startMonsterArrival('pilot', a.attemptId, 603000);
        assert.equal(store.hitMonster('pilot', a.attemptId, 843000, 500), undefined);
        assert.equal(store.fail('pilot', a.attemptId, 'TIME_UP', 843000)?.status, 'FAILED');
        const retry = store.launch('pilot', 'trainer', 900000, journeyDallas25.id);
        assert.equal(retry.monsterHealth, 500);
        assert.equal(store.abandon('pilot', retry.attemptId, 900100)?.status, 'ABANDONED');
    }
    finally {
        db.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('stationary client permits exactly four authored clips and finishes the full defeat once before fading', async () => {
    const actor = new AshenWarlordModel(source, true);
    await actor.ready;
    const actions = actor.actions;
    const allowed = ['idle', 'punch', 'roar', 'defeat'].map(key => model.clips[key].name);
    assert([...actions.keys()].every(name => allowed.includes(name.replace(/#(?:upper|lower)$/, ''))));
    actor.setIntroTime(1);
    actor.update(.05, 1000, 0);
    const before = new THREE.Vector3();
    actor.root.getObjectByName(model.bones.head).getWorldPosition(before);
    actor.finish('defeat');
    for (let i = 0; i < 40; i++)
        actor.update(.05, 1000, 0);
    const middle = new THREE.Vector3();
    actor.root.getObjectByName(model.bones.head).getWorldPosition(middle);
    assert(before.distanceTo(middle) > 10, 'authored defeat moves the skeleton during playback');
    for (let i = 40; i < 169; i++)
        actor.update(.05, 1000, 0);
    assert(actor.root.visible, 'full 8.5-second defeat must remain visible');
    const after = new THREE.Vector3();
    actor.root.getObjectByName(model.bones.head).getWorldPosition(after);
    assert(Math.abs(actions.get(model.clips.defeat.name).time - 8.45) < .01, 'defeat reaches its final authored frames');
    for (let i = 0; i < 17; i++)
        actor.update(.05, 1000, 0);
    assert(!actor.root.visible);
    actor.dispose();
    const scene = new THREE.Scene(), view = new MonsterArrivalView(scene, 0, 0, undefined, source, () => 0, () => 390, model, true);
    await view.ready;
    let ended = 0;
    view.onEndingComplete = () => ended++;
    view.finish('timeout');
    for (let i = 0; i < 100; i++)
        view.update(.05);
    assert.equal(ended, 1);
    assert.equal(scene.getObjectByName('m19-downtown-timeout-blast'), undefined);
    view.dispose();
    assert.equal(scene.children.length, 0);
});
