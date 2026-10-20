import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { journeyDallas18, journeyDallas19 } from '../../shared/journey-mission.mjs';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { createMonsterEncounter, loadMonsterDistrictBuildings, monsterAttack, monsterImpact, sweptMonsterHit, segmentBlockedByBuildings, turnMonster, monsterAttackEligible, monsterShotSolution, stepMonsterEncounter, recordMonsterFiringPosition, monsterProjectileHits, monsterMouth, monsterSpheres, monsterAttackRange, monsterMotionClear, monsterJumpClear, monsterRoamRoute, monsterHandPositions, monsterHandContact } from './monster-arrival.js';
import { setMappedMonsterDamage } from '../../client/src/osm-city.ts';
import { addOsmCityData, disposeOsmGroups } from '../../client/src/osm-city.ts';
import { MonsterArrivalView } from '../../client/src/monster-arrival.ts';
import { monsterGeometry } from '../../shared/monster-arrival-geometry.mjs';
import { MonsterArrivalModel } from '../../client/src/monster-arrival-model.ts';

const monsterBuffer = readFileSync(new URL('../../client/public/assets/models/monsters/monster-arrival.glb', import.meta.url));
const monsterSource = new GLTFLoader().parseAsync(monsterBuffer.buffer.slice(
  monsterBuffer.byteOffset, monsterBuffer.byteOffset + monsterBuffer.byteLength), '');

test('supplied runtime asset has bounded LODs, a rig, and all Mission 19 clips', async () => {
  const gltf = await monsterSource;
  assert.deepEqual(new Set(gltf.animations.map(clip => clip.name)), new Set([
    'Idle', 'Walk', 'Turn', 'AttackWindup', 'AttackRelease', 'Recovery', 'Hit', 'Defeat', 'TimeoutAttack',
  ]));
  const model = new MonsterArrivalModel(monsterSource);
  await model.ready;
  for (const [name, ceiling] of [['MonsterNear', 35000], ['MonsterMid', 15000], ['MonsterFar', 6000]]) {
    const group = model.root.getObjectByName(name);
    let triangles = 0, skinnedMeshes = 0;
    group.traverse(object => {
      if (!object.isSkinnedMesh) return;
      skinnedMeshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    assert.ok(triangles > ceiling * 0.5 && triangles <= ceiling, `${name}: ${triangles} triangles`);
    assert.ok(skinnedMeshes <= 6, `${name}: ${skinnedMeshes} draws`);
  }
  assert.ok(model.root.getObjectByName('Head'));
  model.update(0.016, 20000, 0);
  assert.equal(model.root.getObjectByName('MonsterFar').visible, true);
  model.dispose();
  assert.equal(model.root.children.length, 0);
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-monster-test-'));
  const path = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('other',0,0),('historical',0,0)");
  database.close();
  return { directory, path, store: new JourneyAttemptStore(path, true) };
}

test('monster occupies mapped open terrain, with a safe airborne approach', () => {
  assert.equal(journeyDallas19.name, 'MONSTER ARRIVAL');
  assert.equal(journeyDallas19.bossHealth, 2500);
  assert.equal(journeyDallas19.timeLimitMs, 150000);
  const { x, z } = journeyDallas19.monster;
  const buildings = loadMonsterDistrictBuildings();
  const clearance = buildings.reduce((minimum,b) => Math.min(minimum,Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ))),Infinity);
  assert.ok(clearance > 160, `building clearance ${clearance}`);
  const spawn = authorizedJourneyAirborneSpawn({ missionId: journeyDallas19.id, status: 'APPROACH' }, journeyDallas19, () => 135);
  assert.equal(spawn.position.y, 985);
  assert.ok(Math.hypot(spawn.position.x - x, spawn.position.z - z) > 2200);
  assert.ok(Math.hypot(spawn.position.x - x, spawn.position.z - z) < 2400);
});

test('whole-body swept hits and solid-building blocking reject misses', () => {
  const boss = createMonsterEncounter('attempt', 'player', 1000);
  boss.yaw=0;
  const ground = 135;
  assert.equal(sweptMonsterHit(boss, ground, { x: boss.x, y: ground + 250, z: boss.z + 250 }, { x: boss.x, y: ground + 250, z: boss.z - 250 }), true);
  assert.equal(sweptMonsterHit(boss, ground, { x: boss.x + 1000, y: ground + 250, z: boss.z + 250 }, { x: boss.x + 1000, y: ground + 250, z: boss.z - 250 }), false);
  assert.equal(sweptMonsterHit(boss, ground, { x: boss.x, y: ground + 158, z: boss.z + 1100 }, { x: boss.x, y: ground + 158, z: boss.z + 1000 }), false, 'former long-tail volume cannot credit empty air');
  const impact = monsterImpact(boss, ground, { x: boss.x, y: ground + 250, z: boss.z + 250 }, { x: boss.x, y: ground + 250, z: boss.z - 250 });
  assert.ok(impact && impact.z > boss.z, 'returns the first physical surface, not a post-hit projectile point');
  assert.equal(segmentBlockedByBuildings({ x: 0, y: 50, z: 0 }, { x: 100, y: 50, z: 0 }, [{ minX: 40, maxX: 60, minZ: -10, maxZ: 10, top: 80 }]), true);
  assert.equal(segmentBlockedByBuildings({ x: 0, y: 120, z: 0 }, { x: 100, y: 120, z: 0 }, [{ minX: 40, maxX: 60, minZ: -10, maxZ: 10, top: 80 }]), false);
  assert.equal(monsterAttack.intervalMs, 8000);
});

test('timeout hides only mapped Downtown footprints and restores streamed targets on Retry', () => {
  const scene = new THREE.Scene();
  const chunk = JSON.parse(readFileSync(new URL('../../client/public/data/dallas/near/-2_-1.json', import.meta.url), 'utf8'));
  const material = new THREE.MeshStandardMaterial();
  const result = addOsmCityData(scene, { v: 3, chunkSize: 1000, chunks: [chunk] }, {
    roadMaterial: material, buildingMaterials: Array.from({ length: 5 }, () => material),
    waterMaterial: material, landMaterials: Array.from({ length: 8 }, () => material),
    isExcluded: () => false, heightAt: () => 122, collectCollisionData: false,
    monsterDamageTargets: true,
  });
  const targets = result.groups.flatMap(group => group.children.filter(child => child.name === 'osm-monster-damage-target'));
  assert.ok(targets.length > 0, 'actual Near mapped buildings become reversible target meshes');
  for (let cycle = 0; cycle < 2; cycle++) {
    setMappedMonsterDamage(true);
    assert.ok(targets.every(mesh => !mesh.visible));
    setMappedMonsterDamage(false);
    assert.ok(targets.every(mesh => mesh.visible));
  }
  disposeOsmGroups(result.groups);
  material.dispose();
});

test('monster visuals and transient shots release on repeated Retry and Exit', async () => {
  const scene = new THREE.Scene();
  for (let cycle = 0; cycle < 3; cycle++) {
    const view = new MonsterArrivalView(scene, 135, 135, undefined, monsterSource);
    await view.ready;
    let footfalls = 0;
    view.onFootfall = () => { footfalls++; };
    assert.equal(scene.children.length, 7);
    view.setState({ type: 'monsterState', attemptId: 'local', x: journeyDallas19.monster.x,
      y: 135, z: journeyDallas19.monster.z, yaw: 0, phase: 'walk', hitSequence: 0,
      velocity: {x:14,y:0,z:0}, gaitPhase: 0, shots: [{ id: cycle, x: 0, y: 200, z: 0 }], serverNow: 1_000 });
    view.setState({ type: 'monsterState', attemptId: 'local', x: journeyDallas19.monster.x + 5,
      y: 135, z: journeyDallas19.monster.z, yaw: 0, phase: 'walk', hitSequence: 0,
      velocity: {x:14,y:0,z:0}, gaitPhase: .01, shots: [{ id: cycle, x: 0, y: 200, z: 0 }], serverNow: 1_050 });
    for (let i = 0; i < 240; i++) view.update(0.05);
    assert.ok(footfalls >= 2);
    assert.ok(scene.children.length >= 2);
    view.dispose();
    assert.equal(scene.children.length, 0);
  }
});

test('supplied skinned monster plants its feet and shows windup, damage, and defeat poses', async () => {
  const scene = new THREE.Scene();
  const ground = 135;
  const view = new MonsterArrivalView(scene, ground, ground, undefined, monsterSource);
  await view.ready;
  const creature = scene.children[0];
  assert.ok(creature.getObjectByName('MonsterNear'));
  assert.ok(creature.getObjectByName('LeftFoot'));
  creature.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(creature);
  assert.ok(bounds.min.y >= ground - 5 && bounds.min.y <= ground + 5, `foot height ${bounds.min.y - ground}`);
  const state = { type: 'monsterState', attemptId: 'pose', x: journeyDallas19.monster.x,
    y: ground, z: journeyDallas19.monster.z, yaw: 0, phase: 'windup', hitSequence: 0,
    shots: [], serverNow: 1_000 };
  let footfalls = 0;
  view.onFootfall = () => { footfalls++; };
  view.setState({ ...state, phase: 'walk', x: state.x + 5, velocity:{x:14,y:0,z:0},gaitPhase:0 });
  view.setState({ ...state, phase: 'walk', x: state.x + 10, velocity:{x:14,y:0,z:0},gaitPhase:.01 });
  for (let frame = 0; frame < 100; frame++) view.update(0.05);
  assert.ok(footfalls > 0 && scene.children.length > 1, 'walking produces ground-level footfall dust');
  view.setState(state);
  view.update(0.05);
  assert.equal(scene.getObjectByName('monster-mouth-warning').visible, true);
  view.setState({ ...state, phase: 'walk', hitSequence: 1 });
  view.update(0.05);
  assert.equal(scene.getObjectByName('monster-mouth-warning').visible, false);
  assert.ok(scene.children.length > 1, 'confirmed hit has visible impact particles');
  view.finish('defeat');
  view.update(0.05);
  assert.ok(creature.getObjectByName('monster-arrival-supplied-model'), 'defeat retains supplied asset');
  view.dispose();
  assert.equal(scene.children.length, 0);
});

test('server-owned hits require a live owned attempt and grant a first-clear reward once', () => {
  const { directory, path, store } = fixture();
  try {
    const first = store.launch('pilot', 'trainer', 1000, journeyDallas19.id);
    assert.equal(first.monsterHealth, 2500);
    assert.equal(store.hitMonster('pilot', first.attemptId, 1300), undefined);
    store.approach('pilot', first.attemptId, 1100);
    assert.equal(store.startMonsterArrival('other', first.attemptId, 1200), undefined);
    const started = store.startMonsterArrival('pilot', first.attemptId, 1200);
    assert.equal(started.deadlineAt, 151200);
    assert.equal(store.startMonsterArrival('pilot', first.attemptId, 1300), undefined);
    assert.equal(store.hitMonster('other', first.attemptId, 1400), undefined);
    for (let i = 0; i < 99; i++) assert.equal(store.hitMonster('pilot', first.attemptId, 1500 + i * 250).monsterHealth, 2475 - 25 * i);
    assert.equal(store.get('pilot', first.attemptId).status, 'RACING');
    const won = store.hitMonster('pilot', first.attemptId, 27000);
    assert.equal(won.status, 'COMPLETED');
    assert.equal(won.monsterHealth, 0);
    assert.equal(won.firstClearCredits, 2550);
    assert.equal(store.hitMonster('pilot', first.attemptId, 27001), undefined);
    assert.equal(store.monsterArrivalBestTime('pilot'), 25800);
    const retry = store.launch('pilot', 'trainer', 30000, journeyDallas19.id);
    store.approach('pilot', retry.attemptId, 30100);
    store.startMonsterArrival('pilot', retry.attemptId, 30200);
    for (let i = 0; i < 100; i++) store.hitMonster('pilot', retry.attemptId, 31000 + i * 250);
    assert.equal(store.get('pilot', retry.attemptId).firstClearCredits, 0);
    const other = store.launch('other', 'trainer', 1000, journeyDallas19.id);
    store.approach('other', other.attemptId, 1100);
    store.startMonsterArrival('other', other.attemptId, 1200);
    assert.equal(store.get('other', other.attemptId).monsterHealth, 2500);
    const db = new DatabaseSync(path);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2550);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Monster Arrival uses damage captured on each projectile', () => {
  const { directory, store } = fixture();
  try {
    const launched = store.launch('pilot', 'fighter', 1_000, journeyDallas19.id);
    store.approach('pilot', launched.attemptId, 1_100);
    store.startMonsterArrival('pilot', launched.attemptId, 1_200);
    assert.equal(store.hitMonster('pilot', launched.attemptId, 1_500, 25)?.monsterHealth, 2_475);
    assert.equal(store.hitMonster('pilot', launched.attemptId, 1_750)?.monsterHealth, 2_435);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('deadline is exclusive and historical Wanted Breakout clear preserves eligibility', () => {
  const { directory, path, store } = fixture();
  try {
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('historical', journeyDallas19.id, 'old-escape', 100, 54000);
    const attempt = store.launch('historical', 'trainer', 1000, journeyDallas19.id);
    store.approach('historical', attempt.attemptId, 1100);
    store.startMonsterArrival('historical', attempt.attemptId, 1200);
    for (let i = 0; i < 99; i++) store.hitMonster('historical', attempt.attemptId, 2000 + i * 250);
    assert.equal(store.hitMonster('historical', attempt.attemptId, 151200), undefined);
    assert.equal(store.fail('historical', attempt.attemptId, 'TIME_UP', 151200).status, 'FAILED');
    const retry = store.launch('historical', 'trainer', 160000, journeyDallas19.id);
    store.approach('historical', retry.attemptId, 160100);
    store.startMonsterArrival('historical', retry.attemptId, 160200);
    for (let i = 0; i < 100; i++) store.hitMonster('historical', retry.attemptId, 161000 + i * 250);
    assert.equal(store.get('historical', retry.attemptId).firstClearCredits, 0);
    assert.equal(store.progress('historical', journeyDallas19.id).completed, true);
    assert.equal(store.monsterArrivalBestTime('historical'), 25550);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('repaired asset has a ground origin, 960 m uniform scale and bounded world-space warning', async () => {
  const scene=new THREE.Scene(),view=new MonsterArrivalView(scene,135,135,undefined,monsterSource);
  await view.ready;view.setState({type:'monsterState',attemptId:'a',x:journeyDallas19.monster.x,y:135,z:journeyDallas19.monster.z,yaw:0,phase:'windup',hitSequence:0,shots:[],serverNow:1});
  view.update(.05);scene.updateMatrixWorld(true);
  const model=scene.getObjectByName('monster-arrival-supplied-model');
  assert.deepEqual(model.scale.toArray(),[960,960,960]);
  assert.equal(journeyDallas19.monster.height,960);
  const height=(monsterGeometry.bounds.max[1]-monsterGeometry.bounds.min[1])*960;
  assert.ok(Math.abs(height-960)<.5,`measured bind height ${height}`);
  const warning=scene.getObjectByName('monster-mouth-warning');
  const scale=warning.getWorldScale(new THREE.Vector3());assert.ok(scale.x<25 && scale.y<25 && scale.z<25,scale.toArray().join(','));
  scene.traverse(o=>{if(o.isMesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='Monster skin')assert.equal(m.side,THREE.FrontSide)}});
  assert.ok(monsterGeometry.repairedThroatVertices>10000);
  view.dispose();assert.equal(scene.children.length,0);
});

test('960 m pursuit keeps low anatomy clear of mapped buildings using their actual heights', () => {
  const e=createMonsterEncounter('a','p',0),buildings=loadMonsterDistrictBuildings();
  const data=JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json',import.meta.url),'utf8'));
  const bytes=Buffer.from(data.elevations,'base64'),samples=new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
  const ground=(wx,wz)=>{
    const x=Math.max(0,Math.min(1,(wx-data.bounds.minX)/(data.bounds.maxX-data.bounds.minX)))*(data.width-1);
    const z=Math.max(0,Math.min(1,(wz-data.bounds.minZ)/(data.bounds.maxZ-data.bounds.minZ)))*(data.height-1);
    const x0=Math.floor(x),z0=Math.floor(z),x1=Math.min(data.width-1,x0+1),z1=Math.min(data.height-1,z0+1);
    const at=(a,b)=>data.baseElevation+samples[b*data.width+a]*data.scale;
    return (at(x0,z0)*(1-x+x0)+at(x1,z0)*(x-x0))*(1-z+z0)+(at(x0,z1)*(1-x+x0)+at(x1,z1)*(x-x0))*(z-z0);
  };
  let margin=Infinity;
  for(let i=0;i<300;i++) {
    stepMonsterEncounter(e,{x:e.x+Math.sin(i*.03)*3000,y:1100,z:e.z+Math.cos(i*.03)*3000},{x:0,y:0,z:0},ground,buildings,i*100);
    const c=Math.cos(e.yaw),s=Math.sin(e.yaw),h=journeyDallas19.monster.height,y0=ground(e.x,e.z);
    for(const v of monsterGeometry.spheres){
      const y=y0+v.y*h,ry=v.radii.y*h,x=e.x+h*(c*v.x+s*v.z),z=e.z+h*(-s*v.x+c*v.z);
      for(const b of buildings){
        if(b.top<y-ry)continue;
        // Bound the visible ellipsoid's horizontal slice at this building's top.
        const radius=Math.max(v.radii.x,v.radii.z)*h*Math.sqrt(Math.max(0,1-(Math.max(0,y-b.top)/ry)**2));
        margin=Math.min(margin,Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ))-radius);
      }
    }
  }
  assert.ok(margin>0,`mapped building surface clearance ${margin}`);
});

test('body turn accelerates smoothly, never exceeds 15 degrees per second and exposes its back', () => {
  const e=createMonsterEncounter('a','p',0);e.yaw=0;
  const target={x:e.x,y:600,z:e.z+2500};assert.equal(monsterAttackEligible(e,target,135),false);
  let elapsed=0;
  while(elapsed<15 && Math.abs(Math.PI-Math.abs(e.yaw))>.01) {
    const previous=e.yaw;turnMonster(e,target,.05);const difference=Math.atan2(Math.sin(e.yaw-previous),Math.cos(e.yaw-previous));
    assert.ok(Math.abs(difference)<=monsterAttack.turnRate*.05+1e-8);elapsed+=.05;
    if(elapsed<5)assert.equal(monsterAttackEligible(e,target,135),false);
  }
  assert.ok(elapsed>=12 && elapsed<14,`180 degree turn ${elapsed}s`);
  assert.equal(monsterAttackEligible(e,target,135),true);
});

test('attack solution covers the actual player damage envelope with vertical aim and no homing', () => {
  const e=createMonsterEncounter('a','p',0);e.yaw=0;
  for(const distance of [800,2300,4500]) for(const altitude of [200,1000,2000]) {
    const target={x:e.x,y:altitude,z:e.z-distance},mouth=monsterMouth(e,135);
    assert.equal(monsterAttackEligible(e,target,135),true);
    const shot=monsterShotSolution(e,135,target,{x:0,y:0,z:0});
    const flight=Math.hypot(target.x-mouth.x,target.y-mouth.y,target.z-mouth.z)/shot.speed;
    assert.ok(flight>=1.5 && flight<=2.5);assert.ok(shot.lifeMs/1000>flight+.4);
    assert.equal(Math.sign(shot.direction.y),Math.sign(target.y-mouth.y));
    assert.ok(Math.abs(Math.hypot(shot.direction.x,shot.direction.y,shot.direction.z)-1)<1e-8);
  }
  assert.ok(monsterAttackRange>4500 && monsterAttackRange<6000);
  assert.equal(monsterAttack.radius,22);assert.equal(monsterAttack.damage,25);
});

test('stationary firing enables a warned spaced fan after the moving monster faces the pilot', () => {
  const e=createMonsterEncounter('a','p',1000);e.yaw=0;e.nextAttackAt=10000;
  const target={x:e.x,y:600,z:e.z-2500},zero={x:0,y:0,z:0};let t=1000;
  for(;t<=24000;t+=50){
    if(t%250===0)recordMonsterFiringPosition(e,target,t);
    stepMonsterEncounter(e,target,zero,()=>135,[],t);
    if(e.windupUntil)break;
  }
  assert.ok(e.windupUntil,'gradual turning must still permit retaliation');
  assert.equal(e.attackKind,'fan');assert.equal(e.windupUntil,t+1500);assert.equal(e.shots.length,0);
  const end=t+2200;
  for(t+=50;t<=end;t+=50){if(t%250===0)recordMonsterFiringPosition(e,target,t);stepMonsterEncounter(e,target,zero,()=>135,[],t)}
  assert.equal(e.shots.length,3);assert.ok(e.shots[1].bornAt-e.shots[0].bornAt>=280);assert.ok(e.shots[2].bornAt-e.shots[1].bornAt>=280);
  assert.equal(new Set(e.shots.map(s=>s.direction.x.toFixed(3))).size,3);
  stepMonsterEncounter(e,{...target,x:target.x+200},zero,()=>135,[],t);assert.equal(e.sustainedSince,0);
  recordMonsterFiringPosition(e,target,t+50);
  stepMonsterEncounter(e,target,zero,()=>135,[{minX:e.x-500,maxX:e.x+500,minZ:e.z-1000,maxZ:e.z-900,top:2000}],t+100);
  assert.equal(e.sustainedSince,0);
  e.shots.push({...e.shots[0],id:10});e.nextAttackAt=t+150;e.travelSinceAttack=200;
  stepMonsterEncounter(e,target,zero,()=>135,[],t+150);assert.equal(e.shots.length,4);assert.equal(e.windupUntil,0);
});

test('swept fireballs hit a stationary pilot while a deliberate lateral dodge escapes', () => {
  const e=createMonsterEncounter('a','p',0);e.yaw=0;
  const target={x:e.x,y:600,z:e.z-2500},shot={...monsterShotSolution(e,135,target,{x:0,y:0,z:0}),id:1,bornAt:0};
  const before={x:target.x,y:target.y,z:target.z+60};shot.position={x:target.x,y:target.y,z:target.z-60};
  assert.equal(monsterProjectileHits(shot,before,target,{x:0,y:0,z:0},2.5,.1),true);
  assert.equal(monsterProjectileHits(shot,before,{...target,x:target.x+200},{x:80,y:0,z:0},2.5,.1),false);
  assert.equal(segmentBlockedByBuildings(before,shot.position,[{minX:target.x-40,maxX:target.x+40,minZ:target.z-10,maxZ:target.z+10,top:700}]),true);
});

test('full firing-envelope Near occlusion index matches direct geometry clipping', () => {
  const buildings=loadMonsterDistrictBuildings(),plain=[...buildings];
  assert.ok(buildings.some(b=>b.minX< -9000));assert.ok(buildings.some(b=>b.minZ< -6500));
  for(let i=0;i<48;i++) {
    const a={x:-4500+Math.sin(i*1.73)*4500,y:150+(i%7)*65,z:-2000+Math.cos(i*.91)*4500};
    const b={x:-4500+Math.cos(i*.37)*180,y:450,z:-2000+Math.sin(i)*100};
    assert.equal(segmentBlockedByBuildings(a,b,buildings),segmentBlockedByBuildings(a,b,plain));
  }
});

test('tight anatomical bounds reject empty space above the 960 m mesh', () => {
  const e=createMonsterEncounter('a','p',0);e.yaw=0;
  assert.equal(sweptMonsterHit(e,135,{x:e.x,y:135+1040,z:e.z-800},{x:e.x,y:135+1040,z:e.z+800}),false);
});

test('authoritative muzzle agrees with the exported mouth and limited head aim', async () => {
  const model=new MonsterArrivalModel(monsterSource);await model.ready;
  const e=createMonsterEncounter('a','p',0);e.yaw=.4;e.aimYaw=.12;e.aimPitch=.18;
  model.root.position.set(e.x,135,e.z);model.root.rotation.y=e.yaw;
  model.setMotion(0,0,0,0,e.aimYaw,e.aimPitch);model.update(0,0,0);model.root.updateMatrixWorld(true);
  const actual=new THREE.Vector3();assert.equal(model.mouthPosition(actual),true);
  const expected=monsterMouth(e,135);
  assert.ok(actual.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<2,`exported muzzle ${actual.toArray()} vs ${JSON.stringify(expected)}`);
  model.dispose();
});

test('Mission 19 layers flexible body and arm motion over its authored fight clips', async () => {
  const model = new MonsterArrivalModel(monsterSource);
  await model.ready;
  model.update(0, 0, 0);
  const spine = model.root.getObjectByName('Spine');
  const forearm = model.root.getObjectByName('LeftForearm');
  const hand = model.root.getObjectByName('LeftHand');
  const tail = model.root.getObjectByName('TailTip');
  const idle = new Map([spine, forearm, hand, tail].map(bone => [bone.name, bone.quaternion.clone()]));
  model.setMotion(14, 0, .12, .2, .1, .1);
  for (let frame = 0; frame < 30; frame++) model.update(1 / 60, 0, 0);
  assert.ok(spine.quaternion.angleTo(idle.get('Spine')) > .02, 'the torso carries the walk');
  assert.ok(tail.quaternion.angleTo(idle.get('TailTip')) > .02, 'the tail follows movement');
  model.windup();
  for (let frame = 0; frame < 60; frame++) model.update(1 / 60, 0, 0);
  assert.ok(forearm.quaternion.angleTo(idle.get('LeftForearm')) > .08, 'the forearm bends into the attack');
  model.release();
  for (let frame = 0; frame < 10; frame++) model.update(1 / 60, 0, 0);
  assert.ok(hand.quaternion.angleTo(idle.get('LeftHand')) > .02, 'the hand follows the throw');
  model.root.traverse(bone => assert.ok(bone.quaternion.toArray().every(Number.isFinite)));
  model.dispose();
});

test('nearby aircraft trigger a bounded hand swipe with swept contact and cooldown', () => {
  const e=createMonsterEncounter('swipe','pilot',0);e.yaw=0;
  const hand=monsterHandPositions(e,135,1000).left;
  const target={x:hand.x+80,y:hand.y+30,z:hand.z-80};
  stepMonsterEncounter(e,target,{x:0,y:0,z:0},()=>135,[],1000);
  assert.equal(e.handSwipe?.side,'left');
  const active=e.handSwipe;
  assert.ok(active && Math.hypot(active.target.x-target.x,active.target.y-target.y,active.target.z-target.z)<120);
  const before=monsterHandPositions(e,135,1000).left;
  const peak=monsterHandPositions(e,135,1245).left;
  assert.ok(peak.x>before.x+20 || peak.z<before.z-20,'hand reaches toward aircraft');
  assert.equal(monsterHandContact(before,peak,target,{x:0,y:0,z:0},3,.245),true);
  assert.equal(monsterHandContact(before,peak,{...target,x:target.x+500},{x:0,y:0,z:0},3,.245),false);
  stepMonsterEncounter(e,target,{x:0,y:0,z:0},()=>135,[],1750);
  assert.equal(e.handSwipe,null);
  stepMonsterEncounter(e,target,{x:0,y:0,z:0},()=>135,[],1800);
  assert.equal(e.handSwipe,null,'swipe cannot restart inside cooldown');
});

test('rendered swiping hand reaches the same impact point as server contact', async () => {
  const e=createMonsterEncounter('swipe','pilot',0);e.yaw=0;
  const hand=monsterHandPositions(e,135,1000).left;
  stepMonsterEncounter(e,{x:hand.x+80,y:hand.y+30,z:hand.z-80},{x:0,y:0,z:0},()=>135,[],1000);
  const model=new MonsterArrivalModel(monsterSource);await model.ready;
  model.root.position.set(e.x,135,e.z);model.root.rotation.y=e.yaw;
  model.setHandSwipe({side:'left',target:e.handSwipe.target,progress:.35});
  model.update(0,0,0);model.root.updateMatrixWorld(true);
  const actual=new THREE.Vector3();model.root.getObjectByName('LeftHand').getWorldPosition(actual);
  const expected=monsterHandPositions(e,135,1245).left;
  assert.ok(actual.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<80,
    `animated hand ${actual.toArray()} vs server ${JSON.stringify(expected)}`);
  model.dispose();
});

test('new fireballs leave the animated mouth before catching up to server positions', async () => {
  const scene = new THREE.Scene();
  const view = new MonsterArrivalView(scene, 135, 135, undefined, monsterSource);
  await view.ready;
  const state = { type: 'monsterState', attemptId: 'throw', x: journeyDallas19.monster.x,
    y: 135, z: journeyDallas19.monster.z, yaw: 0, phase: 'windup', hitSequence: 0,
    shots: [], serverNow: 1000 };
  view.setState(state);
  view.update(0);
  const shot = { id: 1, x: state.x + 100, y: 900, z: state.z, dx: 1, dy: 0, dz: 0, speed: 0, bornAt: 1000 };
  view.setState({ ...state, phase: 'walk', shots: [shot], serverNow: 1050 });
  view.update(0);
  const fireball = scene.getObjectByName('monster-flaming-fireball');
  const mouth = new THREE.Vector3();
  scene.getObjectByName('Mouth').getWorldPosition(mouth);
  assert.ok(fireball.position.distanceTo(mouth) < .01, 'the release begins at the moving mouth');
  view.update(.05);
  assert.ok(fireball.position.distanceTo(new THREE.Vector3(shot.x, shot.y, shot.z)) < mouth.distanceTo(new THREE.Vector3(shot.x, shot.y, shot.z)));
  view.dispose();
});


test('authored collapse keeps the repaired exported surface at ground contact',async()=>{
 const view=new MonsterArrivalView(new THREE.Scene(),135,135,undefined,monsterSource);await view.ready;view.finish('defeat');
 for(let i=0;i<100;i++)view.update(.05);const root=view['creature'].root;root.updateMatrixWorld(true);
 let lowest=Infinity;root.getObjectByName('MonsterNear').traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const p=new THREE.Vector3(),positions=mesh.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,p);mesh.localToWorld(p);lowest=Math.min(lowest,p.y-135);}});
 assert.ok(lowest>=-.5 && lowest<2,`collapse ground clearance ${lowest}`);view.dispose();
});

test('exported LOD seams retain identical skin weights during shoulder and neck deformation',async()=>{
 const gltf=await monsterSource;
 for(const name of ['MonsterNear','MonsterMid','MonsterFar']){
  gltf.scene.getObjectByName(name).traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const p=mesh.geometry.getAttribute('position'),j=mesh.geometry.getAttribute('skinIndex'),w=mesh.geometry.getAttribute('skinWeight'),seams=new Map();
   for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
    const weights=new Map();for(let n=0;n<4;n++){const joint=j.getComponent(i,n),weight=w.getComponent(i,n);if(weight>1e-5)weights.set(joint,(weights.get(joint)??0)+weight)}
    const prior=seams.get(key);if(prior)for(const joint of new Set([...prior.keys(),...weights.keys()]))assert.ok(Math.abs((prior.get(joint)??0)-(weights.get(joint)??0))<.002,`${name}: exported seam ${key}`);else seams.set(key,weights);
   }
  });
 }
});


test('Retry releases owned GPU bone textures without disposing cached source geometry',async()=>{
 const model=new MonsterArrivalModel(monsterSource);await model.ready;let textures=0,disposed=0;const skeletons=new Set();model.root.traverse(mesh=>{if(mesh.isSkinnedMesh)skeletons.add(mesh.skeleton)});
 for(const skeleton of skeletons){skeleton.computeBoneTexture();textures++;skeleton.boneTexture.addEventListener('dispose',()=>disposed++);}
 model.dispose();assert.equal(disposed,textures);assert.ok(textures>0);
 const again=new MonsterArrivalModel(monsterSource);await again.ready;assert.ok(again.root.getObjectByName('MonsterNear'));again.dispose();
});

test('asymmetric exported hands align with authoritative fitted volumes after the forward-axis conversion',async()=>{
 const model=new MonsterArrivalModel(monsterSource);await model.ready;model.root.updateMatrixWorld(true);
 let mesh;model.root.getObjectByName('MonsterNear').traverse(o=>{if(o.isSkinnedMesh)mesh=o});mesh.skeleton.update();
 const positions=mesh.geometry.getAttribute('position'),joints=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),p=new THREE.Vector3();
 for(const part of ['LeftHand','RightHand']){
  const box=new THREE.Box3();
  for(let i=0;i<positions.count;i++){
   let dominant=0;for(let n=1;n<4;n++)if(weights.getComponent(i,n)>weights.getComponent(i,dominant))dominant=n;
   if(mesh.skeleton.bones[joints.getComponent(i,dominant)].name!==part)continue;
   p.fromBufferAttribute(positions,i);mesh.applyBoneTransform(i,p);mesh.localToWorld(p);box.expandByPoint(p);
  }
  const volume=monsterGeometry.spheres.find(s=>s.part===part+'0'),center=box.getCenter(new THREE.Vector3());
  assert.ok(center.distanceTo(new THREE.Vector3(volume.x*960,volume.y*960,volume.z*960))<.02,`${part}: rendered ${center.toArray()} vs fitted ${JSON.stringify(volume)}`);
 }
 model.dispose();
});

test('head aim remains bounded across unchanged animation samples instead of accumulating each frame', async () => {
 const aimed=new MonsterArrivalModel(monsterSource),neutral=new MonsterArrivalModel(monsterSource);
 await Promise.all([aimed.ready,neutral.ready]);
 aimed.setMotion(0,0,0,0,.2,.2);neutral.setMotion(0,0,0,0,0,0);
 let largest=0;const aimedWorld=new THREE.Quaternion(),neutralWorld=new THREE.Quaternion();
 for(let i=0;i<1800;i++){
  aimed.update(1/60,0,0);neutral.update(1/60,0,0);
  aimed.root.updateMatrixWorld(true);neutral.root.updateMatrixWorld(true);
  largest=Math.max(largest,aimed.headObject().getWorldQuaternion(aimedWorld).angleTo(neutral.headObject().getWorldQuaternion(neutralWorld)));
 }
 aimed.dispose();neutral.dispose();
 assert.ok(largest<.42,`head exceeded the bounded yaw/pitch: ${largest} radians`);
});


test('monster traverses its regional route instead of freezing at a pursuit leash or near the pilot',()=>{
 const e=createMonsterEncounter('live','pilot',1000);e.yaw=Math.PI/2;
 const target={x:-7500,y:900,z:-3555};let distance=0,jumps=0,lastJump=0,peak=0;
 for(let i=1;i<=3000;i++){
  const now=1000+i*50,before={x:e.x,z:e.z};e.shots=e.shots.filter(s=>now-s.bornAt<s.lifeMs);
  stepMonsterEncounter(e,target,{x:0,y:0,z:0},()=>135,[],now);
  distance+=Math.hypot(e.x-before.x,e.z-before.z);
  assert.ok(Math.hypot(e.x-journeyDallas19.monster.x,e.z-journeyDallas19.monster.z)<=monsterAttack.pursuitLeash);
  if(e.jumpStartedAt!==lastJump){jumps++;lastJump=e.jumpStartedAt;}
  peak=Math.max(peak,e.jumpHeight);
  if(e.jumpProgress===null)assert.ok(Math.hypot(e.velocity.x,e.velocity.z)<=monsterAttack.walkSpeed+.001);
 }
 assert.ok(distance>2000,`regional travel: ${distance}`);assert.ok(jumps>=3,`jumps: ${jumps}`);
 assert.ok(peak>monsterAttack.jumpHeight*.98 && peak<=monsterAttack.jumpHeight);
 assert.ok(e.attackSequence>=6,'movement continues to permit regular warned attacks');
 assert.ok(Math.max(...monsterRoamRoute.map(p=>p.x))-Math.min(...monsterRoamRoute.map(p=>p.x))>=2800);
});

test('a pilot outside the walking region cannot pin the monster at its route endpoint',()=>{
 const e=createMonsterEncounter('edge','pilot',1000);e.x=-8350;e.z=-2400;e.roamIndex=0;e.roamDirection=-1;
 e.yaw=-Math.PI/2;e.nextAttackAt=Infinity;e.nextJumpAt=Infinity;
 for(let i=1;i<=800;i++)stepMonsterEncounter(e,{x:-11000,y:900,z:-2400},{x:0,y:0,z:0},()=>135,[],1000+i*50);
 assert.ok(e.x>-7500,`leaves the endpoint instead of being pinned: ${e.x}`);
});

test('jumps validate their full swept footprint, landing ground, and lifted authoritative hit geometry',()=>{
 const e=createMonsterEncounter('jump','pilot',1000);e.yaw=Math.PI/2;const end={x:e.x-240,y:0,z:e.z};
 assert.equal(monsterJumpClear(e,end,()=>135,[]),true);
 assert.equal(monsterJumpClear(e,end,(x)=>x<e.x-200?190:135,[]),false);
 assert.equal(monsterJumpClear(e,end,()=>135,[{minX:e.x-500,maxX:e.x+500,minZ:e.z-500,maxZ:e.z+500,top:1600}]),false);
 const mouth=monsterMouth(e,135),parts=monsterSpheres(e,135);e.jumpHeight=140;
 assert.equal(monsterMouth(e,135).y-mouth.y,140);
 const lifted=monsterSpheres(e,135);for(let i=0;i<parts.length;i++)assert.ok(Math.abs(lifted[i].y-parts[i].y-140)<1e-8);
 const head=lifted.find((_,i)=>monsterGeometry.spheres[i].part.startsWith('Head'));
 assert.ok(sweptMonsterHit(e,135,{x:head.x-1000,y:head.y,z:head.z},{x:head.x+1000,y:head.y,z:head.z}));
 assert.equal(monsterMotionClear(e.x,e.z,e.yaw,()=>135,[{minX:e.x-1000,maxX:e.x+1000,minZ:e.z-1000,maxZ:e.z+1000,top:1600}]),false);
});

test('jump pose tucks both feet, lands once per foot, and retains bounded rig transforms',async()=>{
 const model=new MonsterArrivalModel(monsterSource);await model.ready;model.groundAt=()=>135;model.root.position.set(-5500,135,-2400);
 let landings=0;model.onLanding=()=>landings++;
 const foot=new THREE.Vector3();let peak=0;
 for(let i=0;i<=168;i++){
  const progress=i/168,flight=Math.max(0,Math.min(1,(progress-.25)/.57));
  model.setJumpProgress(progress);model.root.position.y=135+(progress>.25&&progress<.82?140*4*flight*(1-flight):0);
  model.setMotion(0,0,0,0,.1,.1);model.update(1/60,0,0);model.root.updateMatrixWorld(true);
  model.footPosition('left',foot);peak=Math.max(peak,foot.y);
  model.root.traverse(o=>assert.ok(o.position.toArray().every(Number.isFinite)&&o.quaternion.toArray().every(Number.isFinite)));
 }
 model.setJumpProgress(null);model.update(1/60,0,0);
 assert.equal(landings,2);assert.ok(peak>135+140);
 model.dispose();
});

test('all exported LODs retain visible amber irises and dark pupils after body decimation',async()=>{
 const gltf=await monsterSource;
 for(const name of ['MonsterNear','MonsterMid','MonsterFar']){
  let iris=0,pupil=0;const sockets=[[],[]];
  gltf.scene.getObjectByName(name).traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;const color=mesh.geometry.getAttribute('color');
   for(let i=0;i<color.count;i++){
    if(color.getX(i)>.9&&color.getY(i)>.35&&color.getY(i)<.5&&color.getZ(i)<.05){
      iris++;const point=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),i).applyMatrix4(mesh.matrixWorld);
      sockets[point.x<0?0:1].push(point);
      const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
      let headWeight=0;for(let j=0;j<4;j++)if(mesh.skeleton.bones[indices.getComponent(i,j)]?.name==='Head')headWeight+=weights.getComponent(i,j);
      assert.ok(headWeight>.999,`${name}: eye must follow the head`);
    }
    if(color.getX(i)<.03&&color.getY(i)<.02&&color.getZ(i)<.02)pupil++;
   }
  });
  assert.ok(iris>100,`${name}: amber iris vertices ${iris}`);assert.ok(pupil>100,`${name}: pupil vertices ${pupil}`);
  for(const points of sockets){
   assert.ok(points.length>50,`${name}: both sockets retain an iris`);
   const bounds=new THREE.Box3().setFromPoints(points),size=bounds.getSize(new THREE.Vector3());
   assert.ok(size.x<size.z,`${name}: iris lies against the side socket, not the front snout`);
  }
 }
});


test('obstacle detours yield to the player for regular warned forward attacks',()=>{
 const e=createMonsterEncounter('stance','pilot',1000);e.yaw=0;
 const target={x:e.x,y:900,z:e.z-2500},zero={x:0,y:0,z:0};
 const obstacles=[{minX:e.x-700,maxX:e.x+700,minZ:e.z-700,maxZ:e.z-400,top:400}];
 let releases=0,last=0;
 for(let i=1;i<=480;i++){
  const now=1000+i*50;e.shots=e.shots.filter(s=>now-s.bornAt<s.lifeMs);
  stepMonsterEncounter(e,target,zero,()=>135,obstacles,now);
  if(e.attackSequence>last){releases+=e.attackSequence-last;last=e.attackSequence;assert.equal(monsterAttackEligible(e,target,135),true);}
 }
 assert.ok(releases>=2,`only ${releases} attacks despite an unobstructed mouth-to-player line`);
});


test('defeat during a jump settles to terrain and releases the encounter scene resources',async()=>{
 const scene=new THREE.Scene(),view=new MonsterArrivalView(scene,135,135,undefined,monsterSource,()=>135);
 await view.ready;
 view.setState({type:'monsterState',attemptId:'air-end',x:-5500,y:275,z:-2400,yaw:0,jumpProgress:.5,
  phase:'walk',hitSequence:0,shots:[],serverNow:1000});
 for(let i=0;i<40;i++)view.update(.05);
 const root=scene.getObjectByName('monster-arrival-supplied-model').parent;
 assert.ok(root.position.y>270);
 view.finish('defeat');for(let i=0;i<40;i++)view.update(.05);
 assert.ok(Math.abs(root.position.y-135)<.01,'collapse cannot remain suspended above the terrain');
 view.dispose();assert.equal(scene.children.length,0);
});
