import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { readTitanAnimationAsset, TitanAnimationSampler } from '../../shared/titan-animation.mjs';
import { ashenWarlordModel as model } from '../../shared/ashen-warlord-model.mjs';
import { ashenWarlordGeometry as geometry } from '../../shared/ashen-warlord-geometry.mjs';
import { journeyDallas19 } from '../../shared/journey-mission.mjs';
import { titanAnchor } from '../../shared/titan-pose.mjs';
import { createAshenWarlordEncounter, ashenWarlordSpecies } from './ashen-warlord.js';
import { createAshenPose } from './ashen-warlord-pose.js';
import { createM19Encounter, stepM19, disposeM19 } from './m19-titan.js';
import { SpeciesRegistry } from './titan/definitions.js';
import { AshenWarlordModel,mixAshenClipTime } from '../../client/src/ashen-warlord-model.js';
const bytes = readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb', import.meta.url)), asset = readTitanAnimationAsset(bytes);
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture: async () => new THREE.Texture() }));
const source = loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
test('authoritative source geometry, 65-bone finger rig, texture and all 13 supplied clips are preserved', async () => {
    const g = await source;
    let triangles = 0, bones = 0, mesh;
    g.scene.traverse(o => { if (o.isBone)
        bones++; if (o.isSkinnedMesh) {
        mesh = o;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        assert(o.material.map);
        assert(o.material.emissiveMap);
    } });
    assert.equal(triangles, 42179);
    assert.equal(bones, 65);
    assert.equal(g.animations.length, 13);
    assert(mesh.skeleton.bones.some(b => b.name.includes('Thumb')));
    assert(bytes.length < 6500000);
    for (const c of Object.values(model.clips))
        assert(g.animations.some(a => a.name === c.name));
    const hips = asset.nodes.findIndex(n => n.name === 'mixamorig:Hips');
    for (const clip of Object.values(asset.clips)) {
        const tr = clip.tracks.find(t => t.node === hips && t.path === 'translation');
        for (let i = 0; i < tr.values.length; i += 3) {
            assert(Math.abs(tr.values[i] - asset.nodes[hips].position[0]) < 1e-6);
            assert(Math.abs(tr.values[i + 2] - asset.nodes[hips].position[2]) < 1e-6);
        }
    }
    assert.equal(ashenWarlordSpecies.abilities.length, 7);
    assert.equal(ashenWarlordSpecies.abilities.find(a => a.id === 'ground-smash').mechanism, 'leap');
    assert.equal(ashenWarlordSpecies.health, 2500);
    assert.equal(journeyDallas19.timeLimitMs, 240000);
    assert.equal(journeyDallas19.firstClearCredits, 2550);
});
test('authoritative skeletal sampler matches real glTF animation mixer for every supplied clip and cross-fade', async () => {
    const g = await source, root = clone(g.scene), mixer = new THREE.AnimationMixer(root), actions = new Map(g.animations.map(c => [c.name, mixer.clipAction(c)])), sampler = new TitanAnimationSampler(asset);
    for (const a of actions.values()) {
        a.play();
        a.enabled = false;
    }
    let error = 0;
    for (const c of Object.values(model.clips))
        for (const fraction of [.1, .5, .9]) {
            const f = { clip: c.name, time: c.duration * fraction, previousClip: model.clips.idle.name, previousTime: .3, blend: .65, offsetY: 0 };
            sampler.evaluate(f);
            for (const a of actions.values()) {
                a.enabled = false;
                a.setEffectiveWeight(0);
            }
            for (const [name, time, weight] of [[f.clip, f.time, f.blend], [f.previousClip, f.previousTime, 1 - f.blend]]) {
                const a = actions.get(name);
                if (name === f.clip && name === f.previousClip) {
                    a.enabled = true;
                    a.time = f.time;
                    a.setEffectiveWeight(1);
                    sampler.evaluate({ ...f, previousClip: undefined, blend: 1 });
                    break;
                }
                a.enabled = true;
                a.time = time;
                a.setEffectiveWeight(weight);
            }
            mixer.update(0);
            root.updateMatrixWorld(true);
            for (const node of Object.values(model.boneNodes)) {
                const b = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(asset.nodes[node].name)), p = b.getWorldPosition(new THREE.Vector3()), m = sampler.world[node];
                error = Math.max(error, p.distanceTo(new THREE.Vector3(m[12], m[13], m[14])));
            }
        }
    assert(error < 1e-5, 'skeletal mismatch ' + error);
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
});
test('all seven real attacks warn, activate, hit, and use the supplied visible hand/core motion; leap actually lifts and lands', async (t) => {
    const g = await source;
    for (const ability of ashenWarlordSpecies.abilities) {
        const cfg = structuredClone(ashenWarlordSpecies);
        cfg.id += '-' + ability.id;
        cfg.abilities = [{ ...ability, unlockBelow: 1 }];
        cfg.movement.traversalLeap = false;
        cfg.movement.walk = .01;
        if (ability.mechanism !== 'leap')
            cfg.movement.run = .01;
        cfg.movement.turnRate = .00001;
        const species = new SpeciesRegistry().register(cfg), e = createM19Encounter(ability.id, 'p', 0, () => 135, [], 2500, species, { geometry, spawn: journeyDallas19.monster, environmentDamage: true, articulate: createAshenPose() });
        const root = e.frame.position, yaw = e.frame.yaw;
        let target = titanAnchor(root, yaw, { x: 0, y: 730, z: 800 });
        if (ability.id === 'hand-strike')
            target = titanAnchor(root, yaw, { x: 150, y: 535, z: 375 });
        if (ability.id === 'two-hand-clap')
            target = titanAnchor(root, yaw, { x: 18, y: 800, z: 205 });
        if (ability.mechanism === 'leap')
            target = titanAnchor(root, yaw, { x: 0, y: 80, z: 300 });
        if (ability.mechanism === 'charge')
            target = titanAnchor(root, yaw, { x: 0, y: 600, z: 550 });
        if (ability.id === 'roaring-shockwave')
            target = titanAnchor(root, yaw, { x: 0, y: 700, z: 700 });
        const visual = new AshenWarlordModel(Promise.resolve(g));
        await visual.ready;
        let warning = false, active = false, hits = 0, error = 0, lift = 0, landed = false;
        for (let i = 1; i <= 280; i++) {
            stepM19(e, target, { x: 0, y: 0, z: 0 }, 18, i * 50);
            const f = e.frame;
            warning ||= f.ability?.stage === 'WARNING';
            active ||= f.ability?.stage === 'ACTIVE';
            hits += f.events.filter(v => v.kind === 'damage' && v.ability === ability.id).length;
            lift = Math.max(lift, f.position.y - root.y);
            landed ||= f.events.some(v => v.type === 'landing');
            visual.root.position.set(f.position.x, f.position.y, f.position.z);
            visual.root.rotation.y = f.yaw;
            visual.setTitanPose(f);
            visual.update(0, 2000, 0);
            visual.root.updateMatrixWorld(true);
            for (const [key, side] of [['hand-left', 'left'], ['hand-right', 'right'], ['gem', null]]) {
                const p = new THREE.Vector3();
                if (side)
                    visual.handPosition(side, p);
                else
                    visual.corePosition(p);
                const expected = f.limbs[key];
                error = Math.max(error, p.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)));
            }
        }
        visual.dispose();
        disposeM19(e);
        t.diagnostic(JSON.stringify({ id: ability.id, warning, active, hits, error, lift, landed }));
        assert(warning && active, ability.id);
        assert(hits > 0, ability.id + ' hit');
        assert(error < .02, ability.id + ' visible/authoritative mismatch ' + error);
        if (ability.mechanism === 'leap') {
            assert(lift > 100);
            assert(landed);
        }
    }
});
test('chest bonus and 100 ordinary Bluejay hits remain authoritative; replay and cross-encounter damage are rejected', () => {
    const e = createAshenWarlordEncounter('ashen', 'p', 0, () => 135, []), p = e.frame.limbs.gem, forward = { x: Math.sin(e.frame.yaw), z: Math.cos(e.frame.yaw) }, shot = { encounterId: 'ashen', source: 'p', sequence: 1, from: { x: p.x + forward.x * 400, y: p.y, z: p.z + forward.z * 400 }, to: p, radius: 1, amount: 25, delta: 0 };
    assert.equal(e.engine.damage(shot), 31.25);
    assert.equal(e.engine.damage(shot), 0);
    assert.equal(e.engine.damage({ ...shot, sequence: 2, encounterId: 'other' }), 0);
    disposeM19(e);
    const body = createAshenWarlordEncounter('body', 'p', 0, () => 135, []), q = body.frame.limbs.body, yaw = body.frame.yaw;
    for (let i = 1; i <= 100; i++) {
        const d = body.engine.damage({ encounterId: 'body', source: 'p', sequence: i, from: { x: q.x + Math.sin(yaw) * 500, y: q.y, z: q.z + Math.cos(yaw) * 500 }, to: q, radius: 1, amount: 25, delta: 0 });
        assert.equal(d, 25, 'body hit ' + i);
    }
    assert.equal(body.engine.snapshot().health, 0);
    assert.equal(body.engine.snapshot().ability, null);
    assert.equal(body.engine.snapshot().projectiles.length, 0);
    disposeM19(body);
});
test('beam bonus is exposed only during server-authorized warning/windup, at the actual animated core', () => {
    const cfg = structuredClone(ashenWarlordSpecies);
    cfg.id = 'core-window';
    cfg.abilities = [{ ...cfg.abilities.find(a => a.id === 'energy-beam'), unlockBelow: 1 }];
    const e = createM19Encounter('window', 'p', 0, () => 135, [], 2500, new SpeciesRegistry().register(cfg), { geometry, spawn: journeyDallas19.monster, environmentDamage: true, articulate: createAshenPose() }), target = titanAnchor(e.frame.position, e.frame.yaw, { x: 0, y: 750, z: 1000 });
    for (let i = 1; i < 40; i++) {
        stepM19(e, target, { x: 180, y: 0, z: 0 }, 18, i * 50);
        if (e.frame.ability?.stage === 'WARNING')
            break;
    }
    assert.equal(e.frame.ability?.stage, 'WARNING');
    const p = e.frame.limbs.gem;
    assert.deepEqual(e.frame.ability.origin, p);
    const yaw=e.frame.yaw;
    assert.equal(e.engine.damage({encounterId:'window',source:'p',sequence:1,from:{x:p.x+Math.sin(yaw)*400,y:p.y,z:p.z+Math.cos(yaw)*400},to:p,radius:1,amount:25,delta:0}),50);
    disposeM19(e);
});
test('Supplied-rig M19 victory, timeout, replay and progression mirror engine health into the transactional first-clear ledger exactly once', async () => {
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
            const e = createAshenWarlordEncounter(a.attemptId, 'p', now + 200, () => 135, []);
            let result;
            for (let i = 1; i <= 100; i++) {
                const p = e.frame.limbs.body, direction = { x: Math.sin(e.frame.yaw), y: 0, z: Math.cos(e.frame.yaw) }, amount = e.engine.damage({ encounterId: e.attemptId, source: 'p', sequence: i, delta: 0, from: { x: p.x + direction.x * 1000, y: p.y, z: p.z + direction.z * 1000 }, to: p, radius: 1, amount: 25 });
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
test('run, punch, jump, landing and clap keep the complete source mesh grounded and bounded',async(t)=>{
 const g=await source,visual=new AshenWarlordModel(Promise.resolve(g));await visual.ready;let mesh;visual.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const sampler=new TitanAnimationSampler(asset),point=new THREE.Vector3();let minimum=0,maximum=0;
 for(const[key,time]of[['run',.45],['punch',.7],['jump',.5],['landing',2.6],['clap',.22]]){const animation={clip:model.clips[key].name,time,blend:1,offsetY:0};sampler.evaluate(animation);animation.offsetY=-Math.min(...model.support.map(v=>sampler.point(v).y));visual.setTitanPose({animation,velocity:{x:0,y:0,z:0},locomotion:'idle',feet:{},limbs:{},ability:null});visual.update(0,2000,0);let low=Infinity,high=-Infinity;
 for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point);mesh.localToWorld(point);low=Math.min(low,point.y);high=Math.max(high,point.length());}minimum=Math.min(minimum,low);maximum=Math.max(maximum,high);t.diagnostic(JSON.stringify({key,groundError:low,bound:high}));
 }
 visual.dispose();assert(minimum>=-5,'ground penetration '+minimum);assert(maximum<1500,'exploding source deformation '+maximum);
});

test('authored gait interpolation crosses its loop boundary without reversing the run',()=>{const c=model.clips.run;const result=mixAshenClipTime(c.name,c.duration-.01,.01,.5);assert(Math.min(result,c.duration-result)<.001);assert.equal(mixAshenClipTime(model.clips.punch.name,.1,.7,.5),.4);});

test('M19 covers city-scale ground instead of parking below the player or repeatedly hopping on clear paths', async t => {
    const {loadMonsterDistrictBuildings}=await import('./monster-arrival.js');
    const data=JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json',import.meta.url),'utf8'));
    const bytes=Buffer.from(data.elevations,'base64'),samples=new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
    const ground=(wx,wz)=>{
        const x=Math.max(0,Math.min(1,(wx-data.bounds.minX)/(data.bounds.maxX-data.bounds.minX)))*(data.width-1);
        const z=Math.max(0,Math.min(1,(wz-data.bounds.minZ)/(data.bounds.maxZ-data.bounds.minZ)))*(data.height-1);
        const x0=Math.floor(x),z0=Math.floor(z),x1=Math.min(data.width-1,x0+1),z1=Math.min(data.height-1,z0+1);
        const at=(a,b)=>data.baseElevation+samples[b*data.width+a]*data.scale;
        return(at(x0,z0)*(1-x+x0)+at(x1,z0)*(x-x0))*(1-z+z0)+(at(x0,z1)*(1-x+x0)+at(x1,z1)*(x-x0))*(z-z0);
    };
    const buildings=loadMonsterDistrictBuildings();
    for(const moving of [false,true]){
        const e=createAshenWarlordEncounter('travel-'+moving,'p',0,ground,buildings);
        const origin={...e.frame.position};let previous={...origin},travel=0,extent=0,turning=0;
        for(let i=1;i<=1200;i++){
            stepM19(e,{x:-6000+(moving?i*.05*180:0),y:ground(-6000,-3000)+850,z:-3000},{x:moving?180:0,y:0,z:0},18,i*50);
            const f=e.frame,step=Math.hypot(f.position.x-previous.x,f.position.z-previous.z);
            assert(step<=ashenWarlordSpecies.movement.chargeSpeed*.05+.01,'no position snapping or speed bypass');
            assert(Math.abs(f.position.y-ground(f.position.x,f.position.z))<200,'terrain/ballistic altitude remains bounded');
            travel+=step;extent=Math.max(extent,Math.hypot(f.position.x-origin.x,f.position.z-origin.z));
            if(f.animation.clip===model.clips.turn.name)turning++;
            previous={...f.position};
        }
        assert(travel>5000,'must traverse meaningful city distance in a minute: '+travel);
        assert(extent>2500,'must leave the small spawn area: '+extent);
        assert(turning<400,'must not spend most of the battle turning in place');
        t.diagnostic(JSON.stringify({moving,travel,extent,turning}));disposeM19(e);
    }
});
