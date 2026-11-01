import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { ballisticShotSpeed, COMBAT_RANGE, insideDynamicLock, projectileDamageForAircraft } from '../../shared/protocol.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function code(name: string, root = ast): string {
  const node = root.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  return ts.transpileModule(node.getText(root), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
function fixture(airAssaultMode = false) {
  const mesh = new THREE.Group();
  const predicted = { mesh, predictedOrigin: new THREE.Vector3(), direction: new THREE.Vector3(), visualAircraftType: 'trainer', visualStartedAt: 1000, bank: .6, pendingAge: 0, predictedTargetId: undefined as string | undefined };
  const target = new THREE.Group(); target.position.set(0, 0, -1500);
  const muzzle = new THREE.Vector3(40, 20, -60);
  const context = {
    THREE, airAssaultMode, aircraftType: 'trainer', cameraShakeTime: 0,
    localPlayerId: 'self', airplane: { rotation: { z: .6 } }, velocity: new THREE.Vector3(0, 0, -300),
    projectileOrigin: new THREE.Vector3(), projectileDirection: new THREE.Vector3(), projectileForward: new THREE.Vector3(0,0,1),
    localShotAircraftTypes: new Map<string,string>(), predictedProjectiles: new Map<string,typeof predicted>(),
    remotePlayers: new Map([['enemy', { plane: target, velocity: new THREE.Vector3() }]]),
    projectilePool: [predicted], createProjectileVisual: () => predicted,
    scene: new THREE.Scene(), performance: { now: () => 1200 }, ballisticShotSpeed, COMBAT_RANGE, insideDynamicLock, projectileDamageForAircraft,
    styleMissionProjectile() {}, spawnFlash() {}, muzzleFlashes: [], muzzleFlashPool: [],
    recentAssistedShotIds: new Map(), assistedShotVisuals: [] as Array<{origin: THREE.Vector3; mesh: THREE.Group; bank: number}>, maxAssistedShotVisuals: 24,
    assistedShotPool: [], createAssistedShotMesh: () => new THREE.Group(), releaseAssistedShot() {},
    clearLocalPredictedShot(id: string): void { context.predictedProjectiles.delete(id); },
    shooterAircraftType: () => 'trainer', visibleCombatTargetPosition: () => target.position,
    getCurrentMuzzleTransform(origin: THREE.Vector3) { origin.copy(muzzle); },
    assistedShotDirection: new THREE.Vector3(), showAimQaRay() {},
    origin: new THREE.Vector3(), direction: new THREE.Vector3(0,0,-1),
    message: { shotId: 'confirmed', clientShotId: 'shot', ownerId: 'self', targetId: 'enemy', origin: { x: 0, y: 0, z: 0 }, targetPosition: { x: 0, y: 0, z: -1500 } },
  };
  return {context, predicted, muzzle};
}

test('Air Assault uses the restored server-confirmed assisted feedback for locked shots', () => {
  const {context:c,predicted:p} = fixture(true);
  c.origin.set(10,5,-20);
  runInNewContext(`${code('spawnMuzzleFeedback')}; spawnMuzzleFeedback(origin,direction,'shot','enemy');`, c);
  assert.deepEqual(p.mesh.position.toArray(), [10,5,-20]);
  assert.equal(p.mesh.visible,false,'locked hits wait for server acceptance in every mode');
  assert.equal(p.predictedTargetId,'enemy');
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`,c);
  assert.deepEqual(c.assistedShotVisuals[0].origin.toArray(),[40,20,-60]);
});

test('Restored assisted feedback still waits for server acceptance, then starts at the current banked aircraft muzzle', () => {
  const {context:c,predicted:p,muzzle} = fixture();
  runInNewContext(`${code('spawnMuzzleFeedback')}; spawnMuzzleFeedback(origin,direction,'shot','enemy');`, c);
  assert.equal(p.mesh.visible,false);
  assert.equal(p.predictedTargetId,'enemy');
  // A delayed acknowledgment arrives after the aircraft has moved and turned.
  p.bank=-.4;
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`, c);
  const shot=c.assistedShotVisuals[0];
  assert.deepEqual(shot.origin.toArray(),muzzle.toArray());
  assert.deepEqual(shot.mesh.position.toArray(),muzzle.toArray());
  assert.equal(shot.bank,.6);
  muzzle.set(90,30,-100);
  assert.deepEqual(shot.origin.toArray(),[40,20,-60],'the emitted shot remains independent after launch');
});

test('Remote confirmed tracers keep the remote server muzzle instead of using the local aircraft', () => {
  const {context:c} = fixture(); c.message.ownerId='enemy';
  c.message.origin={x:700,y:300,z:-900};
  runInNewContext(`${code('addAssistedShot')}; addAssistedShot(message);`,c);
  assert.deepEqual(c.assistedShotVisuals[0].origin.toArray(),[700,300,-900]);
});


test('Classic Air Assault locked shots validate the circle, apply one weapon hit and remain private', () => {
  const server = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url),'utf8'), ts.ScriptTarget.Latest,true);
  const clock={now:1000}, hits:number[]=[];
  const sent:Array<{recipient:string;message:{type:string;targetId:string}}> = [];
  const owner={airAssaultId:'encounter',airAssaultOwnerId:'self',aircraftType:'trainer',cityId:'dallas',lastFireAt:0};
  const context={
    owner, aim:{x:0,y:0}, Date:{now:()=>clock.now},
    currentLockedTarget:()=>({position:{x:0,y:600,z:-800}}),
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
