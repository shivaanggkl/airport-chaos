import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { ballisticShotSpeed, COMBAT_RANGE, insideDynamicLock, localFiringDirection, projectileDamageForAircraft } from '../../shared/protocol.mjs';

import { combatShotAimSample } from '../../shared/combat-aim.mjs';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftPresentationScale } from '../../shared/aircraft-presentation-scale.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function code(name: string, root = ast): string {
  const node = root.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  return ts.transpileModule(node.getText(root), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
function fixture(airAssaultMode = false) {
  const mesh = new THREE.Group();
  const predicted = { mesh, firingOrigin: new THREE.Vector3(), direction: new THREE.Vector3(), visualAircraftType: 'trainer', visualStartedAt: 1000, bank: .6, pendingAge: 0, predictedTargetId: undefined as string | undefined };
  const target = new THREE.Group(); target.position.set(0, 0, -1500);
  const context = {
    THREE, airAssaultMode, aircraftType: 'trainer', cameraShakeTime: 0,
    localPlayerId: 'self', airplane: { rotation: { z: .6 } }, velocity: new THREE.Vector3(0, 0, -300),
    projectileOrigin: new THREE.Vector3(), projectileDirection: new THREE.Vector3(), projectileForward: new THREE.Vector3(0,0,-1),
    projectileZeroVelocity: new THREE.Vector3(), retiredPredictedShots: new Set(), journeyAttempt: undefined,
    localShotAircraftTypes: new Map<string,string>(), predictedProjectiles: new Map<string,typeof predicted>(),
    remotePlayers: new Map([['enemy', { plane: target, velocity: new THREE.Vector3() }]]),
    projectilePool: [predicted], createProjectileVisual: () => predicted,
    scene: new THREE.Scene(), performance: { now: () => 1200 }, ballisticShotSpeed, COMBAT_RANGE, insideDynamicLock, projectileDamageForAircraft,
    fitProjectileTrail() {}, tracerWorldPerPixel: () => 0.5, spawnFlash() {}, muzzleFlashes: [], muzzleFlashPool: [],
    recentAssistedShotIds: new Map(), assistedShotVisuals: [] as Array<{origin: THREE.Vector3; mesh: THREE.Group; bank: number}>, maxAssistedShotVisuals: 24,
    assistedShotPool: [], createAssistedShotMesh: () => new THREE.Group(), releaseAssistedShot() {},
    clearLocalPredictedShot(id: string): void { context.predictedProjectiles.delete(id); },
    assistedShotDirection: new THREE.Vector3(), showAimQaRay() {},
    rememberProjectileId: (ids: Set<string>, id: string) => ids.add(id),
    origin: new THREE.Vector3(), direction: new THREE.Vector3(0,0,-1),
    message: { shotId: 'confirmed', clientShotId: 'shot', ownerId: 'self', targetId: 'enemy', origin: { x: 0, y: 0, z: 0 }, targetPosition: { x: 0, y: 0, z: -1500 } },
  };
  return {context, predicted};
}

test('Air Assault shows the firing ray immediately while a locked hit awaits confirmation', () => {
  const {context:c,predicted:p} = fixture(true);
  c.origin.set(10,5,-20);
  runInNewContext(`${code('spawnMuzzleFeedback')}; spawnMuzzleFeedback(origin,direction,'shot','enemy');`, c);
  assert.deepEqual(p.firingOrigin.toArray(), [10,5,-20]);
  assert.deepEqual(p.mesh.position.toArray(), [10,5,-26]);
  assert.equal(p.mesh.visible,true);
  assert.equal(p.predictedTargetId,'enemy');
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`,c);
  assert.deepEqual(c.assistedShotVisuals[0].origin.toArray(),[10,5,-20]);
});

test('a lock confirmation keeps the firing muzzle and bank after the aircraft turns', () => {
  const {context:c,predicted:p} = fixture();
  c.origin.set(40, 20, -60);
  runInNewContext(`${code('spawnMuzzleFeedback')}; spawnMuzzleFeedback(origin,direction,'shot','enemy');`, c);
  assert.equal(p.mesh.visible,true);
  assert.equal(p.predictedTargetId,'enemy');
  // A delayed acknowledgment arrives after the aircraft has moved and turned.
  c.airplane.rotation.z = -.4;
  c.origin.set(90, 30, -100);
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`, c);
  const shot=c.assistedShotVisuals[0];
  assert.deepEqual(shot.origin.toArray(),[40, 20, -60]);
  assert.deepEqual(shot.mesh.position.toArray(),[40, 20, -66], 'confirmation does not restart the tracer');
  assert.equal(shot.bank,.6);
  assert.ok(shot.mesh.quaternion.angleTo(new THREE.Quaternion().setFromUnitVectors(c.projectileForward, p.direction).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .6))) < 1e-7);
});

test('Remote confirmed tracers keep the remote server muzzle instead of using the local aircraft', () => {
  const {context:c} = fixture(); c.message.ownerId='enemy';
  c.message.origin={x:700,y:300,z:-900};
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`,c);
  assert.deepEqual(c.assistedShotVisuals[0].origin.toArray(),[700,300,-900]);
});

test('assisted tracers use ballistic speed and deliver feedback only on the matching shot arrival', () => {
  const { context: c } = fixture();
  const hits: string[] = [];
  const runtime = {
    ...c, hits, aimQaRay: null, clientProjectiles: new Map(),
  };
  runInNewContext([
    code('addAssistedShot'), code('pendingAssistedHit'), code('updateProjectiles'),
    "addAssistedShot(message); addAssistedShot({...message, shotId:'second', clientShotId:'shot-2'});",
    "const first = pendingAssistedHit('confirmed'); const second = pendingAssistedHit('second');",
    "if (pendingAssistedHit('unlocked')) throw new Error('Unrelated shot was matched');",
    "second.onImpact = () => hits.push('second');",
    'globalThis.travel = first.duration; globalThis.speed = first.speed;',
    'updateProjectiles(first.duration - 0.01); globalThis.before = hits.length;',
    'updateProjectiles(0.02); updateProjectiles(0.02);',
  ].join('\n'), runtime);
  const {travel, speed, before} = runtime as typeof runtime & {travel: number; speed: number; before: number};
  const displacement = c.remotePlayers.get('enemy')!.plane.position.clone().sub(c.message.origin);
  assert.ok(Math.abs(speed - ballisticShotSpeed(c.velocity, displacement.clone().normalize())) < 1e-9);
  assert.ok(Math.abs(travel - displacement.length() / speed) < 1e-9);
  assert.ok(travel > 0.35);
  assert.equal(before, 0);
  assert.deepEqual(hits, ['second']);
  assert.equal(c.assistedShotVisuals.length, 0);
});


test('Classic Air Assault locked shots validate the circle, apply one weapon hit and remain private', () => {
  const server = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url),'utf8'), ts.ScriptTarget.Latest,true);
  const clock={now:1000}, hits:number[]=[];
  const sent:Array<{recipient:string;message:{type:string;targetId:string}}> = [];
  const owner={airAssaultId:'encounter',airAssaultOwnerId:'self',aircraftType:'trainer',cityId:'dallas',lastFireAt:0};
  const context={
    owner, aim:{x:0,y:0}, Date:{now:()=>clock.now},
    currentLockedTarget:()=>({position:{x:0,y:600,z:-800}}),
    assistedTracerSpeed:()=>820,
    canFire:()=>clock.now-owner.lastFireAt>=1000/3,
    targetInAircraftSpace:()=>({x:0,y:0,z:-800}), insideDynamicLock,
    sendIncomingFire(){}, muzzleTransform:()=>({position:{x:0,y:600,z:-2}}),
    randomUUID:()=> 'confirmed', projectileDamageForAircraft,
    sendToPlayer:(recipient:string,message:{type:string;targetId:string})=>sent.push({recipient,message}),
    broadcastToCity(){throw new Error('Private combat must not be broadcast');},
    applyCombatHit:(_owner:string,_target:string,_city:string,_now:number,damage:number)=>{hits.push(damage);return true;},
    createProjectile(){throw new Error('An assisted hit must not create a second ballistic damage path');},
    logLockShotReject(){},
  };
  const fn=code('createAssistedShot',server);
  assert.equal(runInNewContext(`${fn}; createAssistedShot('self',owner,'enemy','shot',undefined,aim);`,context),true);
  assert.deepEqual(hits,[25]);
  assert.equal(sent.length,1);assert.equal(sent[0]!.recipient,'self');
  assert.equal(sent[0]!.message.type,'assistedShot');assert.equal(sent[0]!.message.targetId,'enemy');
  assert.equal(runInNewContext(`${fn}; createAssistedShot('self',owner,'enemy','rapid',undefined,aim);`,context),false);
  clock.now+=400;context.aim.x=2;
  assert.equal(runInNewContext(`${fn}; createAssistedShot('self',owner,'enemy','outside-circle',undefined,aim);`,context),false);
  assert.deepEqual(hits,[25]);assert.equal(sent.length,1);
});

test('pooled aircraft rounds share the original crimson color, size and muzzle clipping', () => {
  const start = source.indexOf('const projectileGeometry =');
  const end = source.indexOf('const projectileForward =', start);
  const setup = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1);
  const context = { THREE, camera, window: { innerHeight: 1080 } };
  const mesh = runInNewContext(`${setup}; ${code('createProjectileMesh')}; globalThis.mesh=createProjectileMesh(); mesh;`, context) as THREE.Group;
  const core = mesh.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  core.geometry.computeBoundingBox();
  assert.ok(Math.abs(core.geometry.boundingBox!.min.z) < 1e-6, 'tip at the projectile position');
  assert.ok(Math.abs(core.geometry.boundingBox!.max.z - 1) < 1e-6, 'tail extends behind the tip');
  assert.ok(core.material instanceof THREE.MeshBasicMaterial);
  assert.equal(core.material.color.getHex(), 0xdc143c);
  assert.equal(core.material.blending, THREE.AdditiveBlending);
  assert.equal(mesh.children.length, 1);
  for (const range of [12, 60, 500, 2500, 4500, 7000]) {
    camera.position.set(0, 0, range);
    runInNewContext('fitProjectileTrail(mesh, 400);', context);
    const worldPerPixel = range / (camera.projectionMatrix.elements[5]! * 540);
    assert.equal(mesh.scale.x, Math.max(1.2, worldPerPixel * 16));
    assert.equal(mesh.scale.z, Math.min(320, worldPerPixel * 64));
  }
  runInNewContext('fitProjectileTrail(mesh, 1);', context);
  assert.equal(mesh.scale.z, 1, 'the trail cannot extend behind the firing point');
});

test('older off-aim rounds fade during a bank and return to full crimson when pooled', () => {
  const start = source.indexOf('const projectileGeometry =');
  const end = source.indexOf('function tracerWorldPerPixel', start);
  const setup = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 5000);
  camera.updateMatrixWorld(true);
  const airplane = { rotation: { z: 0 } };
  const context = {
    THREE, camera, airplane,
    window: { innerWidth: 1600, innerHeight: 900 }, lockCircleCenterX: 800, lockCircleCenterY: 450, lockCircleRadius: 50,
  };
  const mesh = runInNewContext(`${setup}; ${code('createProjectileMesh')}; globalThis.mesh = createProjectileMesh(); mesh;`, context) as THREE.Group;
  const core = mesh.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  const { material, geometry } = core;
  mesh.position.set(40, 0, -100);
  runInNewContext('fadeOffAimRound(mesh, 0.5);', context);
  assert.equal(core.material, material, 'a straight-flying aircraft keeps earlier rounds visible');
  airplane.rotation.z = -0.6;
  runInNewContext('fadeOffAimRound(mesh, 0.05);', context);
  assert.equal(core.material, material, 'fresh rounds keep their full appearance');
  mesh.position.x = 2;
  runInNewContext('fadeOffAimRound(mesh, 0.5);', context);
  assert.equal(core.material, material, 'rounds near the ring stay visible');
  mesh.position.x = 8;
  runInNewContext('fadeOffAimRound(mesh, 0.1);', context);
  const firstOpacity = core.material.opacity;
  assert.ok(firstOpacity > 0 && firstOpacity < 1);
  assert.equal(core.material.color.getHex(), material.color.getHex());
  assert.equal(core.geometry, geometry);
  mesh.position.x = 12;
  runInNewContext('fadeOffAimRound(mesh, 0.11);', context);
  assert.ok(core.material.opacity < firstOpacity);
  // Match the report's large separation, reached within one frame of a turn.
  mesh.position.x = 55;
  const originalPosition = mesh.position.clone();
  runInNewContext('fadeOffAimRound(mesh, 0.12);', context);
  assert.equal(core.visible, false, 'a distant round disappears as soon as it leaves the fade band');
  assert.ok(mesh.position.equals(originalPosition));
  mesh.position.x = 0;
  runInNewContext('fadeOffAimRound(mesh, 0.13);', context);
  assert.equal(core.visible, false, 'the round does not reappear as the aim crosses its path');
  runInNewContext('resetProjectileFade(mesh);', context);
  assert.equal(core.visible, true);
  assert.equal(core.material, material);
});

test('banking aircraft and delayed acknowledgements cannot bend a released local ballistic tracer',()=>{
  const mesh=new THREE.Group(),direction=new THREE.Vector3(.3,.2,-1).normalize();
  const projectile={mesh,firingOrigin:new THREE.Vector3(10,20,-30),direction:direction.clone(),speed:1000,local:true,bank:.6,authoritativePosition:new THREE.Vector3(),spawnedAt:0,lastAuthoritativeAt:1000,pendingAge:0};
  mesh.position.set(10,20,-30);
  const c={THREE,performance:{now:()=>1100},localPlayerId:'self',clientProjectiles:new Map(),predictedProjectiles:new Map([['shot',projectile]]),remotePlayers:new Map(),unrelatedFocusedBot:()=>false,maxClientProjectiles:256,projectilePool:[],fitProjectileTrail(){},scene:new THREE.Scene(),projectileForward:new THREE.Vector3(0,0,-1),projectileOrigin:new THREE.Vector3(),showAimQaRay(){},retiredPredictedShots:new Set(),rememberProjectileId:(ids:Set<string>,id:string)=>ids.add(id),airplane:{rotation:{z:-1.2}},
    message:{projectileId:'server-shot',ownerId:'self',clientShotId:'shot',position:{x:-200,y:400,z:500},direction:{x:-1,y:0,z:0},speed:1200}};
  runInNewContext(`${code('addProjectile')};addProjectile(message);`,c);
  assert(projectile.direction.equals(direction));assert.equal(projectile.speed,1000);
  assert.deepEqual(mesh.position.toArray(),[10,20,-30],'ack cannot restart the bullet from a new muzzle');
  const original=mesh.position.clone();
  Object.assign(c,{aimQaRay:null,aimQaRayUntil:0,maxAuthoritativeProjectileAgeMs:20000,updateMonsterTracerSize(){},assistedShotVisuals:[],pendingTracerLifetime:1});
  runInNewContext(`${code('updateClientProjectiles')};updateClientProjectiles({projectiles:[{projectileId:'server-shot',position:{x:1000,y:-600,z:-1000},direction:{x:0,y:1,z:0}}]});`,c);
  assert(projectile.direction.equals(direction));
  for (let i = 0; i < 20; i++) {
    const before = mesh.position.clone();
    runInNewContext(`${code('updateProjectiles')};updateProjectiles(1/60);`, c);
    assert.ok(Math.abs(mesh.position.distanceTo(before) - 1000 / 60) < 1e-8, 'a late packet cannot change visible launch speed');
  }
  const traveled=mesh.position.clone().sub(original);
  assert(traveled.dot(direction)>0);assert(traveled.clone().cross(direction).length()<1e-6,'all visual corrections stay on the original firing ray');
});

test('a confirmed off-ray hit finishes on the original ray and plays feedback at the server point once', () => {
  const {context:c, predicted:p} = fixture();
  const impacts: THREE.Vector3[] = [];
  const impact = new THREE.Vector3(35, 30, -180);
  const runtime = {
    ...c, clientProjectiles: new Map(), aimQaRay: null, pendingTracerLifetime: 0.35, impacts, impact,
  };
  runInNewContext([
    code('spawnMuzzleFeedback'), code('addAssistedShot'), code('updateProjectiles'),
    "spawnMuzzleFeedback(origin,direction,'shot','enemy');",
    'updateProjectiles(0.25);',
    'const projectile=predictedProjectiles.get("shot"); const before=projectile.mesh.position.clone();',
    'addAssistedShot({...message, targetPosition:impact});',
    'const shot=assistedShotVisuals[0]; shot.onImpact=()=>impacts.push(impact);',
    'updateProjectiles(0.016); updateProjectiles(0.016);',
    'if (!projectile.mesh.position.equals(before)) throw new Error("late confirmation rewound the bullet");',
  ].join('\n'), runtime);
  assert.equal(p.mesh.position.x, 0, 'no sideways snap to the hit point');
  assert.deepEqual(impacts.map(point => point.toArray()), [[35, 30, -180]]);
});

test('a late ballistic spawn without a prediction keeps its historical server muzzle, never the newly turned aircraft',()=>{
  const projectile={mesh:new THREE.Group(),firingOrigin:new THREE.Vector3(),direction:new THREE.Vector3(),speed:0,local:false,bank:0,authoritativePosition:new THREE.Vector3(),spawnedAt:0,lastAuthoritativeAt:0,pendingAge:0};
  const c={THREE,performance:{now:()=>1100},localPlayerId:'self',clientProjectiles:new Map(),predictedProjectiles:new Map(),remotePlayers:new Map(),unrelatedFocusedBot:()=>false,maxClientProjectiles:256,projectilePool:[projectile],fitProjectileTrail(){},scene:new THREE.Scene(),projectileForward:new THREE.Vector3(0,0,-1),showAimQaRay(){},retiredPredictedShots:new Set(),rememberProjectileId:(ids:Set<string>,id:string)=>ids.add(id),airplane:{rotation:{z:1}},message:{projectileId:'late',ownerId:'self',position:{x:15,y:30,z:45},direction:{x:0,y:0,z:-1},speed:900}};
  runInNewContext(`${code('addProjectile')};addProjectile(message);`,c);
  assert.deepEqual(projectile.mesh.position.toArray(),[15,30,45]);
});

test('a rejected lock keeps the original aim ray through the ballistic handoff', () => {
  const {context:c, predicted} = fixture();
  runInNewContext(`${code('spawnMuzzleFeedback')}; spawnMuzzleFeedback(origin,direction,'shot','enemy');`, c);
  assert.equal(predicted.mesh.visible, true);
  const before = predicted.mesh.position.clone();
  const direction = new THREE.Vector3(0.5, 0, -1).normalize();
  const position = {x: 8, y: 2, z: -9};
  const runtime = {
    ...c, projectileForward: new THREE.Vector3(0, 0, -1), clientProjectiles: new Map(),
    maxClientProjectiles: 256, unrelatedFocusedBot: () => false,
    message: {projectileId: 'ballistic', ownerId: 'self', clientShotId: 'shot', position, direction, speed: 820},
  };
  Object.assign(predicted, {authoritativePosition: new THREE.Vector3()});
  runInNewContext(`${code('addProjectile')}; addProjectile(message);`, runtime);
  assert.ok(predicted.direction.distanceTo(c.direction) < 1e-9);
  assert.deepEqual(predicted.mesh.position.toArray(), before.toArray());
  assert.equal(predicted.mesh.visible, true);
  assert.equal(c.predictedProjectiles.size, 0);
});

test('the banked aim circle and a new shot share the displayed firing ray and sample', () => {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 12000);
  camera.position.set(2, 4, 12);
  camera.lookAt(0, 0, -20);
  const airplane = new THREE.Group();
  const muzzleQuaternion = new THREE.Quaternion();
  const airframe = new THREE.Group();
  const muzzle = new THREE.Object3D();
  airplane.add(airframe);
  airframe.add(muzzle);
  airplane.userData.muzzleAnchor = muzzle;
  const shots: { aimSample: { from: number; to: number; blend: number } }[] = [];
  const overlay = {style: {setProperty() {}}, classList: {toggle() {}}};
  const runtime = {
    THREE, camera, airplane, muzzleQuaternion, COMBAT_RANGE, LOCK_ANGLE: 0.06,
    localFiringDirection, combatShotAimSample, combatLockState: 'SEARCHING', neutralAim: { x: 0, y: 0 },
    window: {innerWidth: 1600, innerHeight: 900},
    ...Object.fromEntries([7, 8, 9, 10, 11, 12].map(id => ['journeyDallas' + String(id).padStart(2, '0'), {id}])),
    localPlayerId: 'pilot', localLifeState: 'alive', connectionReady: () => true, soloExploreMode: false,
    airAssaultMode: false, transportView: undefined, journeyAttempt: undefined, selectedCombatTarget: null,
    isMonsterJourneyMission: () => false, visualAim: {x: .08, y: -.03}, visualAimFromId: 20, visualAimToId: 21,
    visualAimBlend: .4, previousAimId: 21, serverAimId: 22, aircraftType: 'trainer',
    pendingFirePress: false, heldActions: new Set(), fireCooldown: 0, crashed: false,
    trainingSlides: {beginAction() {}},
    combatQaElement: undefined, firedSinceWelcome: false, createClientShotId: () => 'banked', playFireSound() {},
    socket: {send: (message: string) => shots.push(JSON.parse(message))},
    acquisitionCircleElement: overlay, targetFeedbackElement: overlay,
    lockCircleCenterX: 0, lockCircleCenterY: 0, lockCircleRadius: 0,
    ...Object.fromEntries([
      'transportReticleOrigin', 'transportReticleDirection', 'combatAimForward', 'lockBoresightPoint',
      'lockProjectedCenter', 'lockCameraRight', 'lockCircleEdgePoint', 'lockProjectedEdge',
      'projectileOrigin', 'projectileDirection',
    ].map(name => [name, new THREE.Vector3()])),
    spawnMuzzleFeedback(origin: THREE.Vector3, direction: THREE.Vector3) {
      assert.ok(origin.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())) < 1e-9);
      const point = origin.clone().addScaledVector(direction, 120).project(camera);
      const fresh = origin.clone().addScaledVector(direction, 70).project(camera);
      const far = origin.clone().addScaledVector(direction, COMBAT_RANGE).project(camera);
      assert.ok(Math.hypot(fresh.x - point.x, fresh.y - point.y) < Math.hypot(fresh.x - far.x, fresh.y - far.y));
      assert.ok(Math.abs((point.x + 1) * 800 - runtime.lockCircleCenterX) < 1e-8);
      assert.ok(Math.abs((1 - point.y) * 450 - runtime.lockCircleCenterY) < 1e-8);
    },
  };
  const banks = [-.25, -.55, -.84, .25, .55, .84];
  const aircraft = ['trainer', 'cargo', 'privateJet', 'fighter'] as const;
  for (const [index, bank] of banks.entries()) {
    const type = aircraft[index % aircraft.length]!;
    muzzle.position.copy(aircraftMuzzleSockets[type].position);
    airframe.scale.setScalar(aircraftPresentationScale[type]);
    airframe.position.y = 0.7;
    runtime.aircraftType = type;
    airplane.rotation.set(bank / 3, bank / 4, bank, 'YXZ');
    camera.position.set(2 + bank * 5, 4, 12);
    camera.lookAt(0, 0, -20);
    camera.fov = 58 + bank * 10;
    camera.updateProjectionMatrix();
    runtime.pendingFirePress = true;
    runInNewContext([
      code('getCurrentMuzzlePosition'), code('getCurrentFiringRay'), code('updateLockCircle'), code('sendFireIntent'), code('updateWeapons'),
      'function fireWeaponOnce() { return sendFireIntent(); }',
      'updateLockCircle(); updateWeapons(1 / 60); updateWeapons(1 / 60);',
    ].join('\n'), runtime);
  }
  assert.deepEqual(shots.map(shot => shot.aimSample), banks.map(() => ({from: 20, to: 21, blend: .4})));
});

test('muzzle feedback stays compact and aligned during sustained fire; impact flashes still expand', () => {
  const muzzleFlashes: unknown[] = [];
  const scene = new THREE.Scene();
  const c = {
    THREE, scene, muzzleFlashes, maxFlashEffects: 12,
    muzzleFlashGeometry: new THREE.SphereGeometry(1,8,6), impactFlashGeometry: new THREE.SphereGeometry(1,9,7),
    projectileForward: new THREE.Vector3(0,0,1), projectileDirection: new THREE.Vector3(),
    getCurrentMuzzlePosition(origin: THREE.Vector3) { origin.set(4,5,6); },
  };
  const context = { ...c, pool: [], origin: new THREE.Vector3() };
  runInNewContext(`${code('createFlashEffect')}\n${code('spawnFlash')}\n${code('updateFlashEffects')}\nspawnFlash(muzzleFlashes,pool,origin,.045,.09,new THREE.Vector3(1,0,0)); updateFlashEffects(muzzleFlashes,pool,.016);`, context);
  const flash = muzzleFlashes[0] as {mesh:THREE.Group;glowMaterial:THREE.MeshBasicMaterial};
  assert.deepEqual(flash.mesh.position.toArray(),[4,5,6]);
  assert.equal(flash.mesh.scale.x,.09); assert.equal(flash.mesh.scale.y,.09);
  assert(Math.abs(flash.mesh.scale.z-.225)<1e-9);
  assert.equal(flash.glowMaterial.opacity,0);
  assert(new THREE.Vector3(0,0,1).applyQuaternion(flash.mesh.quaternion).distanceTo(new THREE.Vector3(1,0,0))<1e-6);
  runInNewContext(`${code('updateFlashEffects')}\nupdateFlashEffects(muzzleFlashes,pool,.03);`,context);
  assert.equal(muzzleFlashes.length,0); assert.equal(scene.children.length,0);
  runInNewContext(`${code('createFlashEffect')}\n${code('spawnFlash')}\n${code('updateFlashEffects')}\nconst impacts=[]; spawnFlash(impacts,pool,origin,.2,.5); updateFlashEffects(impacts,pool,.016);`,context);
  assert(scene.children[0].scale.x>.5,'impact presentation remains unchanged');
  c.muzzleFlashGeometry.dispose(); c.impactFlashGeometry.dispose();
});
