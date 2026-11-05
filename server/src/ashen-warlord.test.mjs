import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { readTitanAnimationAsset, TitanAnimationSampler,calibrateTitanGait,titanGaitTime } from '../../shared/titan-animation.mjs';
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
    assert.deepEqual(ashenWarlordSpecies.abilities.map(a=>a.id).sort(),['charging-rampage','fireball-barrage','hand-strike']);
    assert.equal(ashenWarlordSpecies.movement.traversalLeap,false);
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
test('all three retained attacks warn, activate and hit with synchronized visible motion', async (t) => {
    const g = await source;
    for (const ability of ashenWarlordSpecies.abilities) {
        const cfg = structuredClone(ashenWarlordSpecies);
        cfg.id += '-' + ability.id;
        cfg.director=undefined;
        cfg.abilities = [{ ...ability, unlockBelow: 1 }];
        cfg.movement.traversalLeap = false;
        cfg.movement.walk = .01;
        if (ability.mechanism !== 'leap')
            cfg.movement.run = .01;
        cfg.movement.turnRate = .00001;
        const species = new SpeciesRegistry().register(cfg), e = createM19Encounter(ability.id, 'p', 0, () => 135, [], 2500, species, { geometry, spawn: journeyDallas19.monster, environmentDamage: true, articulate: createAshenPose() });
        const root = e.frame.position, yaw = e.frame.yaw;
        let target = titanAnchor(root, yaw, { x: 0, y: 1460, z: 1600 });
        if (ability.id === 'hand-strike')
            target = titanAnchor(root, yaw, { x: 300, y: 1070, z: 750 });
        if (ability.id === 'two-hand-clap')
            target = titanAnchor(root, yaw, { x: 36, y: 1600, z: 410 });
        if (ability.mechanism === 'leap')
            target = titanAnchor(root, yaw, { x: 0, y: 80, z: 3800 });
        if (ability.mechanism === 'charge')
            target = titanAnchor(root, yaw, { x: 0, y: 1200, z: 1100 });
        if (ability.id === 'roaring-shockwave')
            target = titanAnchor(root, yaw, { x: 0, y: 1400, z: 1400 });
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
test('retained running, punching, shooting, turning and hit motions keep the source mesh grounded',async(t)=>{
 const g=await source,visual=new AshenWarlordModel(Promise.resolve(g));await visual.ready;let mesh;visual.root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const sampler=new TitanAnimationSampler(asset),point=new THREE.Vector3();let minimum=0,maximum=0;
 for(const[key,time]of[['run',.45],['punch',.7],['shoot',1.5],['turn',.5],['hit',.4]]){const animation={clip:model.clips[key].name,time,blend:1,offsetY:0};sampler.evaluate(animation);animation.offsetY=-Math.min(...model.support.map(v=>sampler.point(v).y));visual.setTitanPose({animation,velocity:{x:0,y:0,z:0},locomotion:'idle',feet:{},limbs:{},ability:null});visual.update(0,2000,0);let low=Infinity,high=-Infinity;
 for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point);mesh.localToWorld(point);low=Math.min(low,point.y);high=Math.max(high,point.length());}minimum=Math.min(minimum,low);maximum=Math.max(maximum,high);t.diagnostic(JSON.stringify({key,groundError:low,bound:high}));
 }
 visual.dispose();assert(minimum>=-5,'ground penetration '+minimum);assert(maximum<3000,'exploding source deformation '+maximum);
});

test('authored gait interpolation crosses its loop boundary without reversing the run',()=>{const c=model.clips.run;const result=mixAshenClipTime(c.name,c.duration-.01,.01,.5);assert(Math.min(result,c.duration-result)<.001);assert.equal(mixAshenClipTime(model.clips.punch.name,.1,.7,.5),.4);});

function loadDallasTerrain(){
    const data=JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json',import.meta.url),'utf8'));
    const bytes=Buffer.from(data.elevations,'base64'),samples=new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
    const ground=(wx,wz)=>{
        const x=Math.max(0,Math.min(1,(wx-data.bounds.minX)/(data.bounds.maxX-data.bounds.minX)))*(data.width-1);
        const z=Math.max(0,Math.min(1,(wz-data.bounds.minZ)/(data.bounds.maxZ-data.bounds.minZ)))*(data.height-1);
        const x0=Math.floor(x),z0=Math.floor(z),x1=Math.min(data.width-1,x0+1),z1=Math.min(data.height-1,z0+1);
        const at=(a,b)=>data.baseElevation+samples[b*data.width+a]*data.scale;
        return(at(x0,z0)*(1-x+x0)+at(x1,z0)*(x-x0))*(1-z+z0)+(at(x0,z1)*(1-x+x0)+at(x1,z1)*(x-x0))*(z-z0);
    };
    return ground;
}

test('M19 is ground-only and uses the authored running stride',()=>{
    assert.equal(ashenWarlordSpecies.movement.runOnly,true);
    assert.equal(ashenWarlordSpecies.movement.walk,ashenWarlordSpecies.movement.run);
    assert.equal(ashenWarlordSpecies.movement.traversalLeap,false);
    assert(!ashenWarlordSpecies.abilities.some(a=>['leap','beam','area'].includes(a.mechanism)));
    assert(!ashenWarlordSpecies.regions.some(r=>r.weakDuring==='energy-beam'));
});

test('M19 pursues an authorized distant/occluded pilot but remains inside the Dallas boundary',async()=>{
    const {TitanEncounter}=await import('./titan/engine.js');
    const cfg=structuredClone(ashenWarlordSpecies);cfg.id+='-pursuit';cfg.abilities=[];
    const species=new SpeciesRegistry().register(cfg);
    const env={bounds:{minX:-25000,maxX:25000,minZ:-25000,maxZ:25000},ground:()=>0,traversable:()=>true,lineOfSight:()=>false,obstruction:()=>null};
    const e=new TitanEncounter('pursue',species,{x:23000,y:0,z:23000},env,{yaw:Math.PI/4});
    const target={id:'p',encounterId:'pursue',authorized:true,alive:true,position:{x:40000,y:30000,z:40000},velocity:{x:0,y:0,z:0},radius:18};
    let max=0;
    for(let i=0;i<600;i++){
        const f=e.step(.05,[target],[]);max=Math.max(max,Math.hypot(f.position.x-23000,f.position.z-23000));
        assert(f.position.x<=25000-species.radius&&f.position.z<=25000-species.radius,'must not leave Dallas');
    }
    assert(max>1000,'must pursue until the doubled body reaches its safe boundary clearance');
    e.reset();
});

test('M19 barrage reaches a genuinely high-altitude aircraft through ordinary non-homing projectiles',async t=>{
    const cfg=structuredClone(ashenWarlordSpecies);cfg.id+='-altitude';cfg.movement.traversalLeap=false;
    cfg.abilities=[{...cfg.abilities.find(a=>a.id==='fireball-barrage'),spread:0}];
    const species=new SpeciesRegistry().register(cfg),e=createM19Encounter('high','p',0,()=>0,[],2500,species,{geometry,spawn:journeyDallas19.monster,environmentDamage:true,articulate:createAshenPose()});
    const target={x:e.frame.position.x,y:12000,z:e.frame.position.z+500};let hits=0,high=0;
    for(let i=1;i<=600;i++){
        stepM19(e,target,{x:0,y:0,z:0},18,i*50);const f=e.frame;
        for(const p of f.projectiles)high=Math.max(high,p.position.y);
        hits+=f.events.filter(v=>v.kind==='damage'&&v.ability==='fireball-barrage').length;
    }
    t.diagnostic(JSON.stringify({high,hits,ability:e.frame.ability?.id,phase:e.frame.ability?.stage,yaw:e.frame.yaw,pos:e.frame.position}));
    assert(high>10000,'shots must not expire at the former range/altitude cap');assert(hits>0,'valid high-altitude projectile collision');disposeM19(e);
});


test('authored contact-calibrated walk/run curves agree with world distance and remain bounded',()=>{
    for(const key of['walk','run']){const clip=model.clips[key],calibrated=calibrateTitanGait(asset,clip.name,[model.boneNodes['foot-left'],model.boneNodes['foot-right']]);assert(Math.abs(clip.stride-calibrated.stride)<1e-8);for(let i=0;i<calibrated.distanceCurve.length;i++){const time=titanGaitTime(clip,calibrated.distanceCurve[i]);if(i<calibrated.distanceCurve.length-1)assert(Math.abs(time/clip.duration-i/(calibrated.distanceCurve.length-1))<1e-8);}assert(clip.stride>.5);}
    assert.equal(model.height,1920);assert.equal(ashenWarlordSpecies.height,1920);assert.equal(ashenWarlordSpecies.movement.idleBetweenActions,undefined);
});

test('running legs and bounded head aim use the same authored blended pose on server and renderer',async()=>{
    const visual=new AshenWarlordModel(Promise.resolve(await source));await visual.ready;
    const pose=createAshenPose(),limbs={},feet={},axes={},root={x:0,y:0,z:0};let error=0;
    for(let i=1;i<=60;i++){root.z+=ashenWarlordSpecies.movement.walk*.05;const animation=pose(limbs,feet,root,0,axes,{time:i*.05,health:2500,gait:0,headYaw:.5,headPitch:.3,velocity:{x:0,y:0,z:ashenWarlordSpecies.movement.walk},yawVelocity:0,airborne:false,ability:{id:'fireball-barrage',stage:'ACTIVE',progress:(i%20)/20,elapsed:1.3+(i%20)/20,active:1,warning:.9,windup:.4,recovery:.8}});assert.equal(animation.locomotion.clip,model.clips.run.name);visual.root.position.set(root.x,root.y,root.z);visual.setTitanPose({animation,velocity:{x:0,y:0,z:ashenWarlordSpecies.movement.walk},locomotion:'walk',feet,limbs,ability:null});visual.update(0,2000,0);visual.root.updateMatrixWorld(true);for(const key of['head','foot-left','foot-right']){const p=visual.root.getObjectByName(model.bones[key]).getWorldPosition(new THREE.Vector3());error=Math.max(error,p.distanceTo(new THREE.Vector3(limbs[key].x,limbs[key].y,limbs[key].z)));}}
    visual.dispose();assert(error<.02,'shared layering/head tracking mismatch '+error);
});

test('accepted pressure produces a committed retreat and re-entry without position snaps or sideways running',async t=>{
    const {TitanEncounter}=await import('./titan/engine.js'),cfg=structuredClone(ashenWarlordSpecies);cfg.id+='-director';cfg.abilities=[];cfg.movement.traversalLeap=false;
    const e=new TitanEncounter('director',new SpeciesRegistry().register(cfg),{x:0,y:0,z:0},{bounds:{minX:-25000,maxX:25000,minZ:-25000,maxZ:25000},ground:()=>0,traversable:()=>true,lineOfSight:()=>true,obstruction:()=>null});
    const target={id:'p',encounterId:'director',authorized:true,alive:true,position:{x:10000,y:2000,z:2000},velocity:{x:100,y:0,z:0},radius:18};let previous=e.snapshot(),retreat=false,reentry=false,turns=0,run=0,retreatStart,maxRetreat=0;
    for(let i=1;i<=700;i++){if(i===70){const p=e.snapshot().limbs.body;for(let seq=1;seq<=6;seq++)e.damage({encounterId:'director',source:'p',sequence:seq,from:{x:p.x+5000,y:p.y,z:p.z},to:p,amount:25,radius:1,delta:0});}const f=e.step(.05,[target],[]);if(f.tactic==='retreat'){retreatStart??={...f.position};maxRetreat=Math.max(maxRetreat,Math.hypot(f.position.x-retreatStart.x,f.position.z-retreatStart.z));}retreat||=f.tactic==='retreat';if(retreat&&f.tactic==='reengage')reentry=true;const distance=Math.hypot(f.position.x-previous.position.x,f.position.z-previous.position.z);assert(distance<=cfg.movement.chargeSpeed*.05+.01);const angle=Math.atan2(Math.sin(f.yaw-previous.yaw),Math.cos(f.yaw-previous.yaw));assert(Math.abs(angle)<=cfg.movement.turnRate*.05+.001);if(Math.hypot(f.velocity.x,f.velocity.z)>10){const side=f.velocity.x*Math.cos(f.yaw)-f.velocity.z*Math.sin(f.yaw);assert(Math.abs(side)<.001,'forward animation cannot strafe');run++;}if(f.tactic!==previous.tactic)turns++;previous=f;}
    t.diagnostic(JSON.stringify({retreat,reentry,tacticChanges:turns,movingFrames:run,maxRetreat}));assert(retreat&&reentry);assert(maxRetreat>3000,'retreat must cover meaningful ground');assert(turns<20);assert(run>100);e.reset();assert.equal(e.snapshot().health,2500);
});

test('a real incoming body projectile is recognized with a reaction delay and without client lock claims',async()=>{
    const {TitanEncounter}=await import('./titan/engine.js'),cfg=structuredClone(ashenWarlordSpecies);cfg.id+='-threat';cfg.abilities=[];cfg.movement.traversalLeap=false;
    const e=new TitanEncounter('threat',new SpeciesRegistry().register(cfg),{x:0,y:0,z:0},{bounds:{minX:-25000,maxX:25000,minZ:-25000,maxZ:25000},ground:()=>0,traversable:()=>true,lineOfSight:()=>true,obstruction:()=>null});
    const target={id:'p',encounterId:'threat',authorized:true,alive:true,position:{x:0,y:2000,z:6000},velocity:{x:0,y:0,z:0},radius:18};let reaction;
    for(let i=1;i<=40;i++){const f=e.snapshot(),body=f.limbs.body,threat={id:'shot',encounterId:'threat',position:{x:body.x,y:body.y,z:body.z+1800},velocity:{x:0,y:0,z:-1600},radius:2};const next=e.step(.05,[target],[threat]);if(next.tactic==='retreat'){reaction=i*.05;break;}}
    assert(reaction>=.35&&reaction<2,'bounded HARD reaction to a genuine incoming trajectory');e.reset();
});


test('M19 uses only retained motions on real Dallas terrain, without airborne traversal',async()=>{
    const {loadMonsterDistrictBuildings}=await import('./monster-arrival.js'),ground=loadDallasTerrain();
    const e=createAshenWarlordEncounter('ground-only','p',0,ground,loadMonsterDistrictBuildings());
    const allowed=new Set(['idle','run','turn','punch','shoot','hit'].map(k=>model.clips[k].name));
    for(let i=1;i<=600;i++){
        stepM19(e,{x:-10000,y:1800,z:-2400},{x:-100,y:0,z:0},18,i*50);
        const f=e.frame;assert(allowed.has(f.animation.clip),f.animation.clip);
        assert(!['jump','walk'].includes(f.locomotion));
        assert(Math.abs(f.position.y-ground(f.position.x,f.position.z))<.01);
        assert(!f.ability||['fireball-barrage','hand-strike','charging-rampage'].includes(f.ability.id));
    }
    disposeM19(e);
});

test('navigation feet use actual skinned standing vertices rather than rigid single-bone approximations',()=>{
    const sampler=new TitanAnimationSampler(asset);sampler.evaluate({clip:model.clips.idle.name,time:0,blend:1,offsetY:0});
    const low=Math.min(...model.support.map(v=>sampler.point(v).y));
    for(const foot of geometry.spheres.filter(v=>v.part.includes('Foot'))){
        assert(foot.y-foot.radii.y>=-1e-6,'navigation must not invent a foot below the planted sole');
        assert(foot.radii.y<.07,'weighted calf vertices must not inflate a rigid foot collider');
    }
    assert(Number.isFinite(low));
});

test('a receding aircraft triggers running pursuit instead of repeated distant firing preparations',async()=>{
    const e=createAshenWarlordEncounter('receding','p',0,()=>135,[]),origin={...e.frame.position};
    let running=0,distantShots=0;
    for(let i=1;i<=160;i++){
        const target={x:origin.x+9000+i*.05*250,y:1800,z:origin.z};
        stepM19(e,target,{x:250,y:0,z:0},18,i*50);
        const f=e.frame,gap=Math.hypot(f.position.x-target.x,f.position.z-target.z);
        if(f.locomotion==='run')running++;
        if(gap>4000&&f.ability?.id==='fireball-barrage')distantShots++;
    }
    assert(running>20,'must use authored running speed while closing a growing gap');
    assert.equal(distantShots,0,'must not park in ranged preparations while the aircraft escapes');
    assert(e.frame.position.x>origin.x+4000,'must move toward the receding aircraft');disposeM19(e);
});



test('M19 victory removes the model without a defeat or roar animation',async()=>{
    const v=new AshenWarlordModel(Promise.resolve(await source));await v.ready;v.finish('defeat');v.update(.1,1000,0);assert.equal(v.root.visible,false);v.dispose();
});
