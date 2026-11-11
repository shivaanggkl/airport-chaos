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

// Load the client source through tsx without adding it to the server's TypeScript build.
const { createProjectileCore, fitProjectileRound: fitRound, projectileForwardStep, projectileMaterial,
  projectileMaterialForOpponent, projectileRoundDiameter: roundDiameter } = await import(new URL('../../client/src/projectile-visual.ts', import.meta.url).href);
const { GiantIncomingView } = await import(new URL('../../client/src/giant-incoming.ts', import.meta.url).href);

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function code(name: string, root = ast): string {
  const node = root.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  return ts.transpileModule(node.getText(root), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
function fixture(airAssaultMode = false) {
  const mesh = new THREE.Group();
  mesh.add(createProjectileCore());
  const predicted = { mesh, firingOrigin: new THREE.Vector3(), direction: new THREE.Vector3(), visualAircraftType: 'trainer', visualStartedAt: 1000, bank: .6, pendingAge: 0, predictedTargetId: undefined as string | undefined };
  const target = new THREE.Group(); target.position.set(0, 0, -1500);
  const context = {
    THREE, projectileForwardStep, projectileMaterialForOpponent, colorServerProjectile() {}, airAssaultMode, aircraftType: 'trainer', cameraShakeTime: 0,
    localPlayerId: 'self', soloExploreMode: false, airplane: { rotation: { z: .6 }, quaternion: new THREE.Quaternion() }, velocity: new THREE.Vector3(0, 0, -300),
    projectileOrigin: new THREE.Vector3(), projectileDirection: new THREE.Vector3(), projectileForward: new THREE.Vector3(0,0,-1),
    projectileZeroVelocity: new THREE.Vector3(), retiredPredictedShots: new Set(), journeyAttempt: undefined,
    localShotAircraftTypes: new Map<string,string>(), predictedProjectiles: new Map<string,typeof predicted>(),
    remotePlayers: new Map([['enemy', { plane: target, velocity: new THREE.Vector3() }]]),
    projectilePool: [predicted], createProjectileVisual: () => predicted,
    scene: new THREE.Scene(), performance: { now: () => 1200 }, ballisticShotSpeed, COMBAT_RANGE, insideDynamicLock, projectileDamageForAircraft,
    fitProjectileRound() {}, projectileRoundDiameter: () => 0.5, spawnFlash() {}, muzzleFlashes: [], muzzleFlashPool: [],
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
  assert.deepEqual(p.mesh.position.toArray(), [10,5,-20.25]);
  const rearSurface = p.mesh.position.clone().addScaledVector(p.direction, -p.mesh.scale.x * 0.5);
  assert.ok(rearSurface.distanceTo(c.origin) < 1e-9, 'the first visible sphere touches the muzzle');
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
  assert.deepEqual(shot.mesh.position.toArray(),[40, 20, -60.25], 'confirmation does not restart the tracer');
  assert.equal(shot.bank,.6);
  assert.ok(shot.mesh.quaternion.angleTo(new THREE.Quaternion().setFromUnitVectors(c.projectileForward, p.direction).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .6))) < 1e-7);
});

test('Remote confirmed tracers keep the remote server muzzle instead of using the local aircraft', () => {
  const {context:c} = fixture(); c.message.ownerId='enemy';
  c.message.origin={x:700,y:300,z:-900};
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`,c);
  assert.deepEqual(c.assistedShotVisuals[0].origin.toArray(),[700,300,-900]);
});

test('ballistic and assisted rounds color from each viewer, including private Journey ownership and pool reuse', () => {
  const {context: c} = fixture();
  const runtime = {
    ...c, projectileMaterial, createProjectileCore, journeyMode: false, maxClientProjectiles: 256,
    clientProjectiles: new Map(), projectilePool: [], focusedBotsAreSafe: () => true,
    unrelatedFocusedBot: (id: string) => id === 'ambient-bot',
    remotePlayers: new Map([['ambient-bot', { isBot: true }]]),
  };
  const result = runInNewContext([
    ...['createProjectileMesh', 'createProjectileVisual', 'colorServerProjectile', 'addProjectile', 'removeClientProjectile',
      'releaseProjectile', 'createAssistedShotMesh', 'addAssistedShot', 'releaseAssistedShot'].map(name => code(name)),
    'const spawn = { projectileId: "round", ownerId: "enemy", position: origin, direction, speed: 800 };',
    'const core = mesh => mesh.children[0];',
    'addProjectile(spawn);',
    'const pooledMesh = clientProjectiles.get("round").mesh;',
    'const opponent = core(pooledMesh).material;',
    'removeClientProjectile("round");',
    'const reset = core(pooledMesh).material;',
    'localPlayerId = "enemy";',
    'addProjectile(spawn);',
    'const reused = clientProjectiles.get("round").mesh === pooledMesh && core(pooledMesh).material === projectileMaterial;',
    'addAssistedShot({...message, ownerId: "self"});',
    'const assisted = assistedShotVisuals.pop();',
    'const assistedOrange = core(assisted.mesh).material === opponent;',
    'releaseAssistedShot(assisted);',
    'addAssistedShot({...message, shotId: "local", ownerId: "enemy"});',
    'const assistedRed = assistedShotVisuals[0].mesh === assisted.mesh && core(assisted.mesh).material === projectileMaterial;',
    'journeyMode = true;',
    'journeyAttempt = {rearGuardFourthId: "escort-four"};',
    'colorServerProjectile(pooledMesh, "other-city-pilot");',
    'const neutral = core(pooledMesh).material;',
    'colorServerProjectile(pooledMesh, "ambient-bot");',
    'const ambient = core(pooledMesh).material;',
    'colorServerProjectile(pooledMesh, "escort-four");',
    '({opponent, reset, reused, assistedOrange, assistedRed, neutral, ambient, escort: core(pooledMesh).material});',
  ].join('\n'), runtime);
  const orange = projectileMaterialForOpponent(true);
  assert.equal(result.opponent, orange);
  assert.equal(result.escort, orange);
  assert.equal(result.reset, projectileMaterial);
  assert.equal(result.neutral, projectileMaterial);
  assert.equal(result.ambient, projectileMaterial);
  assert.equal(result.reused, true);
  assert.equal(result.assistedOrange, true);
  assert.equal(result.assistedRed, true);
  assert.equal(orange.color.getHex(), 0xff8c00);
  assert.equal(orange.emissive.getHex(), projectileMaterial.emissive.getHex());
  assert.equal(orange.shininess, projectileMaterial.shininess);
  assert.equal(createProjectileCore(true).geometry, createProjectileCore().geometry);
});

test('transport shot snapshots retain the shared orange round and reconcile forward on the turret firing ray', () => {
  const mesh = createProjectileCore(true);
  const tracer = { mesh, traveled: 0 };
  const view = Object.create(GiantIncomingView.prototype);
  view.tracers = [tracer];
  view.levels = [{}];
  view.receivedAt = performance.now();
  const camera = new THREE.PerspectiveCamera(58);
  const muzzle = new THREE.Vector3(120, 80, -1000);
  const direction = new THREE.Vector3(-0.5, 0.2, -1).normalize();
  const snapshot = (id: string, traveled: number) => ({
    id, direction, traveled, speed: 1000, position: muzzle.clone().addScaledVector(direction, traveled),
  });
  view.syncProjectileShots([snapshot('rear-turret', 30)]);
  view.updateProjectileShots(0, camera, 1080);
  assert.ok(mesh.position.distanceTo(muzzle) < 1e-9, 'a fresh snapshot reconstructs the real turret muzzle');
  view.updateProjectileShots(0.016, camera, 1080);
  assert.equal(mesh.material.color.getHex(), 0xff8c00);
  assert.equal(mesh.geometry, createProjectileCore().geometry);
  assert.ok(mesh.visible && mesh.position.clone().sub(muzzle).cross(direction).length() < 1e-9);
  const prior = tracer.traveled;
  view.syncProjectileShots([snapshot('rear-turret', 10)]);
  view.receivedAt = performance.now();
  view.updateProjectileShots(0.016, camera, 1080);
  assert.equal(tracer.traveled, prior, 'a delayed snapshot cannot rewind the round');
  view.syncProjectileShots([snapshot('front-turret', 200)]);
  assert.equal(tracer.traveled, 200, 'a reused slot resumes an older shot at its authoritative progress');
  view.syncProjectileShots([]);
  assert.equal(mesh.visible, false);
});

for (const kind of ['ballistic', 'assisted', 'turret'] as const) {
  test(`an incoming ${kind} round reaches the visible player hull before it is recycled`, () => {
    const { context } = fixture();
    const plane = new THREE.Group();
    const airframe = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8));
    hull.name = 'aircraft-fallback-qa';
    airframe.add(hull);
    plane.add(airframe);
    plane.userData.airframeRoot = airframe;
    plane.position.z = -132;
    context.scene.add(plane);
    const core = createProjectileCore(true);
    const group = new THREE.Group();
    group.add(core);
    group.position.z = -120;
    const camera = new THREE.PerspectiveCamera(58);
    const contacts: THREE.Vector3[] = [];
    const direction = new THREE.Vector3(0, 0, -1);
    const round = { mesh: group, speed: 1000, direction, elapsed: .12, duration: .132,
      onImpact: (point: THREE.Vector3) => contacts.push(point.clone()) };
    const clientProjectiles = new Map(kind === 'ballistic' ? [['shot', round]] : []);
    const runtime = {
      ...context, camera, aimQaRay: null, clientProjectiles, projectileAimPassDistance: 120,
      assistedShotVisuals: kind === 'assisted' ? [round] : [], assistedAircraftMaxApproachTime: .24,
      aircraftImpactRay: new THREE.Raycaster(), aircraftImpactAim: new THREE.Vector3(), aircraftImpactSurfaceHits: [],
      removeClientProjectile: (id: string) => clientProjectiles.delete(id),
    };
    const helpers = runInNewContext([
      code('setAssistedImpact'), code('advanceAssistedImpact'), code('placeAircraftImpactFlash'), code('updateProjectiles'),
      '({ setAssistedImpact, advanceAssistedImpact, updateProjectiles });',
    ].join('\n'), runtime);
    const view = Object.create(GiantIncomingView.prototype);
    if (kind === 'turret') {
      core.removeFromParent();
      core.visible = false;
      view.tracers = [{ mesh: core, traveled: 0 }];
      view.levels = [{}];
      const shot = { id: 'between-snapshots', position: new THREE.Vector3(0, 0, -132), direction, speed: 1000, traveled: 12 };
      assert.equal(view.presentProjectileImpact(shot, (mesh: THREE.Mesh) => {
        const turretRound = { ...round, mesh };
        helpers.setAssistedImpact(turretRound, plane, undefined, undefined, true);
        return (delta: number) => helpers.advanceAssistedImpact(turretRound, delta);
      }), true);
      view.syncProjectileShots([]);
      view.final = 'timeout';
    } else helpers.setAssistedImpact(round, plane, undefined, undefined, true);
    const frame = () => kind === 'turret' ? view.updateProjectileShots(.016, camera, 1080) : helpers.updateProjectiles(.016);
    const mesh = kind === 'turret' ? core : group;
    frame();
    assert.equal(mesh.position.z, -126);
    assert.equal(contacts.length, 0);
    plane.position.z = -135;
    frame();
    assert.equal(contacts.length, 1);
    assert.ok(Math.abs(contacts[0]!.z + 130.975) < .001, 'contact uses the moved hull surface');
    assert.ok(mesh.position.equals(contacts[0]!));
    assert.equal(mesh.visible, true);
    assert.equal(core.material.color.getHex(), 0xff8c00);
    frame();
    assert.equal(contacts.length, 1);
    assert.equal(clientProjectiles.size + runtime.assistedShotVisuals.length + Number(kind === 'turret' && core.visible), 0);
  });
}

test('a confirmed M19 round resumes its short approach, flashes at contact and returns to the pool', () => {
  const { context, predicted } = fixture();
  const core = predicted.mesh.children[0] as THREE.Mesh;
  core.visible = false;
  predicted.direction.set(0, 0, -1);
  const hits: number[][] = [];
  const projectile = Object.assign(predicted, { speed: 1000, onImpact: () => hits.push(predicted.mesh.position.toArray()) });
  const clientProjectiles = new Map([['m19', projectile]]);
  const runtime = {
    ...context, projectileMaterial, projectileImpactPoint: new THREE.Vector3(),
    clientProjectiles, aimQaRay: null, contact: new THREE.Vector3(10, 0, -1500),
    removeClientProjectile: (id: string) => clientProjectiles.delete(id),
  };
  runInNewContext([
    code('finishMonsterProjectileAtImpact'), code('updateProjectiles'),
    "finishMonsterProjectileAtImpact(clientProjectiles.get('m19'), contact); updateProjectiles(0.06);",
  ].join('\n'), runtime);
  assert.deepEqual(predicted.mesh.position.toArray(), [10, 0, -1440]);
  assert.equal(core.visible, true);
  assert.equal(core.material, projectileMaterial);
  assert.equal(hits.length, 0);
  runInNewContext(`${code('updateProjectiles')}\nupdateProjectiles(0.06);`, runtime);
  assert.deepEqual(hits, [[10, 0, -1500]]);
  assert.equal(clientProjectiles.size, 1, 'contact renders for one frame');
  runInNewContext(`${code('updateProjectiles')}\nupdateProjectiles(0.016);`, runtime);
  assert.equal(clientProjectiles.size, 0);
  assert.equal(hits.length, 1);
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

for (const kind of ['aircraft', 'transport component']) {
  test(`a confirmed round clears the aim and strikes a retreating ${kind} on a bounded straight approach`, () => {
    const {context: c} = fixture();
    const contacts: THREE.Vector3[] = [];
    const target = c.remotePlayers.get('enemy')!;
    const airframe = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8));
    hull.name = 'aircraft-asset-trainer';
    airframe.add(hull);
    target.plane.add(airframe);
    target.plane.userData.airframeRoot = airframe;
    const mesh = new THREE.Group();
    const sphere = new THREE.Mesh();
    sphere.position.x = 2;
    mesh.add(sphere);
    mesh.position.set(0, 0, -80);
    const shot = {
      mesh, origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1),
      speed: 800, elapsed: 0.10, duration: COMBAT_RANGE / 800,
      onImpact: (point: THREE.Vector3) => contacts.push(point.clone()),
    };
    const runtime = {
      ...c, shot, target, sphere, localPoint: kind === 'aircraft' ? undefined : new THREE.Vector3(11, 2, 0), projectileAimPassDistance: 120, assistedAircraftMaxApproachTime: 0.24,
      camera: new THREE.PerspectiveCamera(), aircraftImpactRay: new THREE.Raycaster(),
      aircraftImpactAim: new THREE.Vector3(), aircraftImpactSurfaceHits: [],
      fitProjectileRound(round: THREE.Group) { round.scale.setScalar(0.5); },
      aimQaRay: null, clientProjectiles: new Map(), assistedShotVisuals: [shot],
    };
    target.plane.position.set(125, 0, -COMBAT_RANGE);
    runtime.scene.add(target.plane);
    target.velocity.set(300, 0, -1500);
    const { approach, start, intercept, contactPoint, straight, sizeMatches, contactTime, visibleAtContact } = runInNewContext([
      code('placeAircraftImpactFlash'), code('setAssistedImpact'), code('advanceAssistedImpact'), code('updateProjectiles'),
      'setAssistedImpact(shot, target.plane, target.velocity, localPoint);',
      'updateProjectiles(0.05);',
      'const approach = sphere.getWorldPosition(new THREE.Vector3());',
      'const intercept = (localPoint ? target.plane.localToWorld(localPoint.clone()) : target.plane.position.clone()).addScaledVector(target.velocity, 0.24 - 0.04);',
      'let straight = true;',
      'let sizeMatches = true;',
      'let contactTime = 0;',
      'let contactPoint;',
      'let visibleAtContact = false;',
      'for (let frame = 0; frame < 12 && assistedShotVisuals.length; frame++) {',
      '  if (localPoint && frame === 5) target.plane.rotation.y = 0.4;',
      '  updateProjectiles(0.04);',
      '  if (!contacts.length) {',
      '    const expected = approach.clone().lerp(intercept, shot.impact.elapsed / 0.24);',
      '    straight &&= shot.mesh.position.distanceTo(expected) < 1e-8;',
      '  }',
      '  sizeMatches &&= shot.mesh.scale.x === 0.5;',
      '  if (contacts.length && assistedShotVisuals.length) {',
      '    contactTime = (frame + 1) * 0.04;',
      '    if (localPoint) contactPoint = target.plane.localToWorld(localPoint.clone());',
      '    visibleAtContact = shot.mesh.visible && sphere.visible;',
      '  }',
      '  target.plane.position.addScaledVector(target.velocity, 0.04);',
      '}',
      '({ approach, start: shot.impact.start, intercept, contactPoint, straight, sizeMatches, contactTime, visibleAtContact });',
    ].join('\n'), { ...runtime, contacts });
    assert.equal(approach.z, -120, 'preserve launch speed and the straight reticle pass');
    assert.ok(start.distanceTo(approach) < 1e-8);
    assert.equal(straight, true, 'moving the aircraft must not steer the in-flight round');
    assert.equal(sizeMatches, true);
    assert.equal(contactTime, 0.24, 'the aircraft is faster than the normal round and must not extend the approach');
    assert.equal(contacts.length, 1);
    assert.equal(visibleAtContact, true, 'the round must render at the contact point before release');
    assert.ok(mesh.position.equals(contacts[0]!));
    if (contactPoint) assert.ok(contacts[0]!.equals(contactPoint), 'the strike follows the confirmed point on the rotated transport');
    else assert.ok(Math.abs(contacts[0]!.z - (intercept.z + 4)) < 0.03, 'contact must sit on the visible hull surface');
    assert.ok(contacts[0]!.distanceTo(new THREE.Vector3(0, 0, -COMBAT_RANGE)) > 100, 'contact must use the live aircraft');
    assert.equal(runtime.assistedShotVisuals.length, 0);
  });
}

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

test('pooled aircraft rounds are solid crimson spheres with a consistent projected size and muzzle clearance', () => {
  const start = source.indexOf('const projectileFadeDuration =');
  const end = source.indexOf('const projectileForward =', start);
  const setup = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1);
  const context = { THREE, camera, createProjectileCore, projectileMaterial, roundDiameter, fitRound, window: { innerHeight: 1080 } };
  const mesh = runInNewContext(`${setup}; ${code('createProjectileMesh')}; globalThis.mesh=createProjectileMesh(); mesh;`, context) as THREE.Group;
  const core = mesh.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>;
  core.geometry.computeBoundingBox();
  assert.ok(core.geometry instanceof THREE.SphereGeometry);
  assert.deepEqual(core.geometry.boundingBox!.getSize(new THREE.Vector3()).toArray(), [1, 1, 1]);
  assert.ok(core.material instanceof THREE.MeshPhongMaterial);
  assert.equal(core.material.color.getHex(), 0xdc143c);
  assert.equal(core.material.blending, THREE.NormalBlending);
  assert.equal(core.material.opacity, 1);
  assert.equal(core.material.transparent, false);
  assert.equal(core.material.depthWrite, true);
  assert.equal(mesh.children.length, 1);
  for (const range of [12, 60, 120, 500]) {
    camera.position.set(0, 0, range);
    camera.updateMatrixWorld(true);
    runInNewContext('fitProjectileRound(mesh, 400);', context);
    assert.equal(mesh.scale.x, mesh.scale.y);
    assert.equal(mesh.scale.x, mesh.scale.z);
    const halfWidthNdc = new THREE.Vector3(mesh.scale.x * 0.5, 0, 0).project(camera).x;
    assert.ok(Math.abs(halfWidthNdc * 1920 - 12) < 1e-9);
  }
  runInNewContext('fitProjectileRound(mesh, 0.1);', context);
  assert.deepEqual(mesh.scale.toArray(), [0.2, 0.2, 0.2], 'the sphere cannot extend behind the firing point');
  assert.equal(core.material.depthTest, true);
});

test('unlocked local rounds fade after the aim pass and reset when recycled', () => {
  const { context: { fitProjectileRound, projectileRoundDiameter, ...context }, predicted } = fixture();
  const start = source.indexOf('const projectileFadeDuration =');
  const end = source.indexOf('const projectileForward =', start);
  const setup = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1);
  camera.updateMatrixWorld();
  const runtime = {
    ...context, camera, createProjectileCore, projectileMaterial, roundDiameter, fitRound, window: { innerHeight: 1080 }, soloExploreMode: true,
    maxClientProjectiles: 256, aimQaRay: null, pendingTracerLifetime: 0.65,
    clientProjectiles: new Map(), predicted,
  };
  runInNewContext([
    setup,
    ...['createProjectileMesh', 'spawnMuzzleFeedback', 'updateProjectiles', 'updateProjectileAimExit',
      'presentLocalProjectile', 'releaseProjectile'].map(name => code(name)),
    'predicted.mesh = createProjectileMesh();',
    "spawnMuzzleFeedback(origin, direction, 'shot');",
  ].join('\n'), runtime);
  const core = predicted.mesh.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>;
  const solid = core.material;
  const frame = (delta: number) => runInNewContext(
    'updateProjectiles(delta); for (const shot of predictedProjectiles.values()) presentLocalProjectile(shot);',
    Object.assign(runtime, { delta }),
  );
  frame(0.1);
  assert.equal(core.material, solid);
  frame(0.06); // Beyond the aim pass at the fixture's launch speed.
  assert.equal(core.material, solid);
  frame(0.06);
  assert.ok(core.visible && core.material.opacity > 0 && core.material.opacity < 1);
  assert.equal(core.material.color.getHex(), solid.color.getHex());
  frame(0.08);
  assert.equal(core.visible, false);
  assert.ok(predicted.mesh.position.distanceTo(runtime.origin) < COMBAT_RANGE);
  frame(0.4);
  assert.equal(runtime.predictedProjectiles.size, 0);
  assert.equal(core.visible, true);
  assert.equal(core.material, solid);
});

test('fresh rounds stay on the live gun line during banks and pitch transitions, then keep their heading', () => {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3(0, 0, -1);
  const transportReticleOrigin = new THREE.Vector3(0.5, 0.2, -20);
  const combatAimForward = new THREE.Vector3();
  const lockBoresightPoint = new THREE.Vector3();
  const airplane = new THREE.Group();
  const mesh = new THREE.Group();
  const core = new THREE.Mesh();
  mesh.add(core);
  const runtime = {
    THREE, airplane, mesh, origin, direction, transportReticleOrigin, combatAimForward, lockBoresightPoint,
    age: 0.1,
    projectileAimPassDistance: 120, projectileRoundDiameter: () => 1, projectileSharpTurnBank: 0.45,
    projectileAimAttitudeTolerance: 0.000001,
    projectileFadeDuration: 0.12, projectileFadeMaterials: [], projectileMaterial: core.material,
    projectileAimExitPoint: new THREE.Vector3(), projectileAimExitInverse: new THREE.Quaternion(),
    cameraRelativeOffsetInitialized: true, cameraOrbitBlend: 0, smoothedChaseDistance: 40,
    cameraAircraftForward: direction.clone(),
    smoothedCameraRelativeOffset: new THREE.Vector3(0, 5, 40),
    targetCameraRelativeOffset: new THREE.Vector3(0, 5, 40),
  };
  const update = `${code('updateProjectileAimExit')}; updateProjectileAimExit(mesh, origin, direction, age);`;
  const present = [code('chaseCameraHasLateralLag'), code('projectileHasLateralDrift'),
    code('updateProjectileAimExit'), code('presentLocalProjectile'), 'presentLocalProjectile(shot);'].join('\n');
  for (const [pitch, yaw, roll, launchBank = 0] of [
    [0, -0.16, 0.65], [0, 0.16, -0.65], [0.18, 0, 0], [-0.18, 0, 0],
    [0, -0.03, 0.12], [0, 0.03, -0.12], [0, -0.03, 0, 0.12], [0, 0.03, 0, -0.12],
  ]) {
    airplane.rotation.set(0, 0, launchBank, 'YXZ');
    mesh.userData.aimExit = {
      active: true, attitude: airplane.quaternion.clone(), turning: false,
      offset: new THREE.Vector3(), directionDelta: new THREE.Vector3(),
    };
    core.position.set(0, 0, 0);
    combatAimForward.copy(direction);
    lockBoresightPoint.copy(transportReticleOrigin).addScaledVector(combatAimForward, 120);
    mesh.position.set(0, 0, -30);
    runInNewContext(update, runtime);
    assert.ok(core.getWorldPosition(new THREE.Vector3()).equals(mesh.position), 'level flight retains the original shot');

    airplane.rotation.set(pitch!, yaw!, roll!, 'YXZ');
    combatAimForward.copy(direction).applyQuaternion(airplane.quaternion);
    lockBoresightPoint.copy(transportReticleOrigin).addScaledVector(combatAimForward, 120);
    mesh.position.set(0, 0, -85);
    runInNewContext(update, runtime);
    const approach = core.getWorldPosition(new THREE.Vector3()).sub(transportReticleOrigin);
    assert.ok(approach.dot(combatAimForward) > 0);
    assert.ok(approach.cross(combatAimForward).length() < 1e-8);

    const shot = { mesh, firingOrigin: origin, direction, pendingAge: 0.1, bank: launchBank, showFullFlight: false };
    runInNewContext(present, { ...runtime, shot });
    assert.equal(core.visible, true, 'the bullet stays visible on its way to the aim circle');
    mesh.position.z = -150;
    runInNewContext(present, { ...runtime, shot });
    assert.equal(core.visible, false, 'turn entry and recovery end the visible shot at the aim circle');
    core.visible = true; // Inspect the underlying trajectory after the visual cutoff.
    const crossing = core.getWorldPosition(new THREE.Vector3());
    const crossedDirection = combatAimForward.clone();
    assert.ok(crossing.clone().sub(transportReticleOrigin).cross(crossedDirection).length() < 1e-8);

    airplane.quaternion.identity();
    combatAimForward.copy(direction);
    runtime.age = COMBAT_RANGE / 520;
    mesh.position.z = -COMBAT_RANGE;
    runInNewContext(update, runtime);
    const continued = core.getWorldPosition(new THREE.Vector3());
    assert.ok(continued.distanceTo(crossing.addScaledVector(crossedDirection, COMBAT_RANGE - 150)) < 1e-8);
    assert.equal(core.visible, true);
    runtime.age = 0.1;
  }

  mesh.userData.aimExit = {
    active: true, attitude: airplane.quaternion.clone(), turning: false,
    offset: new THREE.Vector3(), directionDelta: new THREE.Vector3(),
  };
  core.position.set(0, 0, 0);
  const shot = { mesh, firingOrigin: origin, direction, pendingAge: 0.15, bank: 0, showFullFlight: false };
  mesh.position.z = -160;
  runInNewContext(present, { ...runtime, shot });
  assert.equal(core.visible, true, 'a steady shot begins its normal fade');
  airplane.rotation.set(0, 0.03, -0.12, 'YXZ');
  shot.pendingAge += 0.02;
  runInNewContext(present, { ...runtime, shot });
  assert.equal(core.visible, false, 'a turn during the fade cuts off the already-passed shot');

  airplane.quaternion.identity();
  combatAimForward.copy(direction);
  for (const cameraOffset of [-2, 2, 0]) {
    runtime.smoothedCameraRelativeOffset.x = cameraOffset;
    mesh.userData.aimExit = {
      active: true, attitude: airplane.quaternion.clone(), turning: false,
      offset: new THREE.Vector3(), directionDelta: new THREE.Vector3(),
    };
    core.visible = true;
    const recoveryShot = { ...shot, fadeStartedAt: undefined };
    mesh.position.z = -85;
    runInNewContext(present, { ...runtime, shot: recoveryShot });
    assert.equal(core.visible, true, 'a settling camera does not hide a round before the reticle');
    mesh.position.z = -160;
    runInNewContext(present, { ...runtime, shot: recoveryShot });
    assert.equal(core.visible, cameraOffset === 0, 'the normal fade resumes once lateral camera lag settles');
  }

  for (const sidewaysMuzzleOffset of [-8, 8]) {
    mesh.userData.aimExit = {
      active: true, attitude: airplane.quaternion.clone(), turning: false,
      offset: new THREE.Vector3(), directionDelta: new THREE.Vector3(),
    };
    core.visible = true;
    core.position.set(0, 0, 0);
    const recoveryShot = { ...shot, fadeStartedAt: undefined };
    transportReticleOrigin.set(sidewaysMuzzleOffset, 0, -20);
    lockBoresightPoint.copy(transportReticleOrigin).addScaledVector(combatAimForward, 120);
    mesh.position.set(0, 0, -85);
    runInNewContext(present, { ...runtime, shot: recoveryShot });
    assert.equal(core.visible, true);
    assert.ok(Math.abs(core.getWorldPosition(new THREE.Vector3()).x - sidewaysMuzzleOffset) < 1e-8,
      'an unlocked round follows the live aim line while the leveled aircraft is still sliding sideways');
    assert.equal(mesh.position.x, 0, 'the ballistic path stays fixed');
    mesh.position.z = -160;
    runInNewContext(present, { ...runtime, shot: recoveryShot });
    assert.equal(core.visible, false, 'the corrected round disappears at the reticle');
  }
});

test('banking aircraft and delayed acknowledgements cannot bend a released local ballistic tracer',()=>{
  const mesh=new THREE.Group(),direction=new THREE.Vector3(.3,.2,-1).normalize();
  const projectile={mesh,firingOrigin:new THREE.Vector3(10,20,-30),direction:direction.clone(),speed:1000,local:true,bank:.6,authoritativePosition:new THREE.Vector3(),spawnedAt:0,lastAuthoritativeAt:1000,pendingAge:0};
  mesh.position.set(10,20,-30);
  const c={THREE,performance:{now:()=>1100},localPlayerId:'self',clientProjectiles:new Map(),predictedProjectiles:new Map([['shot',projectile]]),remotePlayers:new Map(),unrelatedFocusedBot:()=>false,maxClientProjectiles:256,projectilePool:[],fitProjectileRound(){},scene:new THREE.Scene(),projectileForward:new THREE.Vector3(0,0,-1),projectileOrigin:new THREE.Vector3(),showAimQaRay(){},retiredPredictedShots:new Set(),rememberProjectileId:(ids:Set<string>,id:string)=>ids.add(id),airplane:{rotation:{z:-1.2}},
    message:{projectileId:'server-shot',ownerId:'self',clientShotId:'shot',position:{x:-200,y:400,z:500},direction:{x:-1,y:0,z:0},speed:1200}};
  runInNewContext(`${code('addProjectile')};addProjectile(message);`,c);
  assert(projectile.direction.equals(direction));assert.equal(projectile.speed,1000);
  assert.deepEqual(mesh.position.toArray(),[10,20,-30],'ack cannot restart the bullet from a new muzzle');
  const original=mesh.position.clone();
  Object.assign(c,{COMBAT_RANGE,aimQaRay:null,aimQaRayUntil:0,maxAuthoritativeProjectileAgeMs:20000,updateMonsterTracerSize(){},assistedShotVisuals:[],pendingTracerLifetime:1,
    removeClientProjectile(id: string) { c.clientProjectiles.delete(id); mesh.visible = false; },
  });
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
  const c={THREE,performance:{now:()=>1100},localPlayerId:'self',clientProjectiles:new Map(),predictedProjectiles:new Map(),remotePlayers:new Map(),colorServerProjectile(){},unrelatedFocusedBot:()=>false,maxClientProjectiles:256,projectilePool:[projectile],fitProjectileRound(){},scene:new THREE.Scene(),projectileForward:new THREE.Vector3(0,0,-1),showAimQaRay(){},retiredPredictedShots:new Set(),rememberProjectileId:(ids:Set<string>,id:string)=>ids.add(id),airplane:{rotation:{z:1}},message:{projectileId:'late',ownerId:'self',position:{x:15,y:30,z:45},direction:{x:0,y:0,z:-1},speed:900}};
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

test('the aim circle and muzzle ray agree through level flight, bank recovery, climbs and dives', () => {
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
    projectileAimPassDistance: 120,
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
  const attitudes = [[0, 0], [0, -.8], [0, .8], [0, .2], [0, 0], [-.3, 0], [.3, 0]] as const;
  const aircraft = ['trainer', 'cargo', 'privateJet', 'fighter'] as const;
  for (const [index, [pitch, bank]] of attitudes.entries()) {
    const type = aircraft[index % aircraft.length]!;
    muzzle.position.copy(aircraftMuzzleSockets[type].position);
    airframe.scale.setScalar(aircraftPresentationScale[type]);
    airframe.position.y = 0.7;
    runtime.aircraftType = type;
    airplane.rotation.set(pitch, index * 0.1, bank, 'YXZ');
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
  assert.deepEqual(shots.map(shot => shot.aimSample), attitudes.map(() => ({from: 20, to: 21, blend: .4})));
});

test('muzzle and locked aircraft contact flashes keep their size while ordinary impacts expand', () => {
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
  const impactFlashes: Array<{mesh: THREE.Group}> = [];
  const aircraft = new THREE.Group();
  const airframe = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  hull.name = 'aircraft-asset-trainer';
  airframe.add(hull);
  aircraft.add(airframe);
  aircraft.userData.airframeRoot = airframe;
  aircraft.position.copy(context.origin);
  scene.add(aircraft);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(context.origin).add(new THREE.Vector3(0, 0, 10));
  runInNewContext([
    code('createFlashEffect'), code('spawnFlash'), code('updateFlashEffects'),
    code('placeAircraftImpactFlash'), code('playProjectileHit'),
    'playProjectileHit(origin, 25, false, true, aircraft);',
    'aircraft.position.set(12, 2, -20);',
    'updateFlashEffects(impactFlashes, impactFlashPool, 0.08);',
  ].join('\n'), {
    ...context, aircraft, camera, impactFlashes, impactFlashPool: [], projectileImpactPoint: new THREE.Vector3(),
    aircraftImpactRay: new THREE.Raycaster(), aircraftImpactSurfaceHits: [], aircraftImpactAim: new THREE.Vector3(),
    projectileRoundDiameter: () => 0.8,
  });
  assert.deepEqual(impactFlashes[0]!.mesh.scale.toArray(), [0.4, 0.4, 0.4]);
  assert.ok(impactFlashes[0]!.mesh.position.distanceTo(new THREE.Vector3(12, 2, -18.96)) < 1e-8,
    'the flash sits just in front of the hull and follows the moving aircraft');
  c.muzzleFlashGeometry.dispose(); c.impactFlashGeometry.dispose();
});
