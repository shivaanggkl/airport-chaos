import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { advanceProjectile, ballisticIntercept, COMBAT_RANGE, fireIntervalMs, localFiringDirection, projectileLaunchVelocity } from '../../shared/protocol.mjs';

import { combatShotAimSample } from '../../shared/combat-aim.mjs';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftPresentationScale } from '../../shared/aircraft-presentation-scale.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function code(name: string, root = ast): string {
  const node = root.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  return ts.transpileModule(node.getText(root), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
test('moving launch preserves all three inherited velocity components and earliest lead', () => {
  const origin = { x: 35, y: 900, z: -180 };
  const velocity = { x: 180, y: 75, z: -620 };
  const target = { x: 400, y: 1100, z: -1400 };
  const targetVelocity = { x: 90, y: -32, z: -390 };
  const solution = ballisticIntercept(origin, velocity, target, targetVelocity);
  assert.ok(solution);
  const launch = projectileLaunchVelocity(velocity, solution.direction, new THREE.Vector3());
  assert.ok(launch.clone().sub(velocity).addScaledVector(new THREE.Vector3().copy(solution.direction), -520).length() < 1e-9);
  assert.ok(new THREE.Vector3().copy(origin).addScaledVector(launch, solution.seconds)
    .distanceTo(new THREE.Vector3().copy(target).addScaledVector(new THREE.Vector3().copy(targetVelocity), solution.seconds)) < 1e-8);
  assert.equal(ballisticIntercept(origin, { x: 0, y: 0, z: 0 }, { x: 35, y: 900, z: -1500 },
    { x: 0, y: 0, z: -900 }), null);
});

function projectileFixture() {
  const context = {
    THREE, COMBAT_RANGE, advanceProjectile, soloExploreMode: false, localPlayerId: 'pilot',
    remotePlayers: new Map(), unrelatedFocusedBot: () => false, scene: new THREE.Scene(),
    projectileForward: new THREE.Vector3(0, 0, -1), projectileCorrection: new THREE.Vector3(),
    activeProjectiles: new Set(), predictedProjectiles: new Map(), clientProjectiles: new Map(),
    projectilePool: [] as unknown[], maxClientProjectiles: 256, retiredPredictedShots: new Set(), retiredServerProjectiles: new Set(),
    muzzleFlashes: [], muzzleFlashPool: [], spawnFlash() {}, showAimQaRay() {}, fitProjectileTrail() {},
    tracerWorldPerPixel: () => 0.5, origin: new THREE.Vector3(40, 20, -60),
    launch: new THREE.Vector3(110, 35, -820),
  };
  runInNewContext([
    'function createProjectileMesh() { return new THREE.Group(); }',
    ...['createProjectileVisual', 'rememberProjectileId', 'releaseProjectile', 'acquireProjectile',
      'setProjectileVelocity', 'spawnMuzzleFeedback', 'addProjectile', 'updateClientProjectiles', 'updateProjectiles'].map(name => code(name)),
  ].join('\n'), context);
  return context;
}

test('delayed acknowledgement adopts one round and converges on the authoritative ray', () => {
  for (const [fps, delay] of [[30, .08], [60, .16], [120, .28]]) {
    const context = projectileFixture();
    runInNewContext(`
      spawnMuzzleFeedback(origin,launch,'local');
      const shot=predictedProjectiles.get('local');
      for(let i=0;i<${Math.round(fps! * delay!)};i++) updateProjectiles(1/${fps});
      const visibleBefore=shot.mesh.position.clone(), elapsedBefore=shot.elapsed;
      const message={ownerId:'pilot',clientShotId:'local',projectileId:'server',position:origin.clone().add(new THREE.Vector3(0,1,0)),
        velocity:new THREE.Vector3(95,30,-810),serverNow:1000,firedAt:1000};
      addProjectile(message); addProjectile(message);
      if(clientProjectiles.get('server')!==shot || activeProjectiles.size!==1 || predictedProjectiles.size!==0) throw Error('duplicate');
      if(!shot.mesh.position.equals(visibleBefore) || shot.elapsed!==elapsedBefore) throw Error('ack jumped or reset shot');
      for(let i=0;i<${fps};i++){
        const previous=shot.mesh.position.clone();
        updateProjectiles(1/${fps});
        if(shot.mesh.position.clone().sub(previous).dot(shot.direction)<=0) throw Error('backward shot');
      }
      if(shot.mesh.position.distanceTo(shot.position)>1e-8) throw Error('never adopted accepted trajectory');
      if(shot.position.clone().sub(message.position).cross(shot.direction).length()>1e-6) throw Error('off accepted ray');
      releaseProjectile(shot); addProjectile(message);
      if(activeProjectiles.size!==0 || projectilePool.length!==1) throw Error('stale acknowledgement resurrected a shot');
    `, context);
  }
});

test('Free Fly rounds travel to range and pooled rejections leave no shot or hit callback', () => {
  const context = projectileFixture();
  runInNewContext(`
    soloExploreMode=true;
    spawnMuzzleFeedback(origin,launch,'free');
    const shot=[...activeProjectiles][0];
    updateProjectiles(1.25);
    if(activeProjectiles.size!==1 || predictedProjectiles.size!==0) throw Error('cosmetic round waited for ack');
    updateProjectiles(10);
    if(activeProjectiles.size!==0 || shot.traveled!==COMBAT_RANGE || projectilePool.length!==1) throw Error('range/pool');
    soloExploreMode=false;
    spawnMuzzleFeedback(origin,launch,'rejected');
    if(predictedProjectiles.get('rejected')!==shot || shot.traveled>7) throw Error('pool reused stale state');
    releaseProjectile(shot);
    if(activeProjectiles.size!==0 || predictedProjectiles.size!==0) throw Error('rejection leaked');
  `, context);
});

test('holding fire keeps the approved aircraft cadences at 30, 60 and 120 FPS', () => {
  for (const [aircraftType, rate] of [['trainer', 3], ['cargo', 4.2], ['privateJet', 4.8], ['fighter', 6.6]] as const) {
    for (const fps of [30, 60, 120]) {
      const context = {
        rate, fps, interval: fireIntervalMs(aircraftType) / 1000, fireCooldown: 0,
        heldActions: new Set(['fire']), pendingFirePress: false, crashed: false, trainingSlides: { beginAction() {} },
      };
      const shots = runInNewContext(`
        let count = 0;
        function fireWeaponOnce() { fireCooldown = interval; count++; return true; }
        ${code('updateWeapons')}
        for (let frame = 0; frame < 10 * fps; frame++) updateWeapons(1 / fps);
        count;
      `, context);
      assert.equal(shots, rate * 10, `${aircraftType} at ${fps} FPS`);
    }
  }
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
    localFiringDirection, projectileLaunchVelocity, combatShotAimSample, velocity: new THREE.Vector3(85, 35, -520), clientStateSequence: 42, combatLockState: 'SEARCHING', neutralAim: { x: 0, y: 0 },
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
      'transportReticleOrigin', 'combatShotVelocity', 'combatAimForward', 'lockBoresightPoint',
      'lockProjectedCenter', 'lockCameraRight', 'lockCircleEdgePoint', 'lockProjectedEdge',
      'projectileOrigin', 'projectileDirection',
    ].map(name => [name, new THREE.Vector3()])),
    spawnMuzzleFeedback(origin: THREE.Vector3, direction: THREE.Vector3) {
      assert.ok(origin.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())) < 1e-9);
      const point = origin.clone().addScaledVector(direction.clone().normalize(), COMBAT_RANGE).project(camera);
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
