import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { MissionOneAircraftPreview } from '../../client/src/mission-one-aircraft-preview.ts';
import { MissionOneIntroPath } from '../../client/src/mission-one-intro.ts';
import { MissionTwoIntroPath } from '../../client/src/mission-two-intro.ts';
import { MissionThreeIntroPath } from '../../client/src/mission-three-intro.ts';
import { MissionFourIntroPath } from '../../client/src/mission-four-intro.ts';
import { MissionFiveIntroPath } from '../../client/src/mission-five-intro.ts';
import { MissionSixIntroPath } from '../../client/src/mission-six-intro.ts';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06 } from '../../shared/journey-mission.mjs';

function screenBounds(aircraft, camera) {
  const result = new THREE.Box2();
  for (const x of [-5, 5]) for (const y of [-1, 1]) for (const z of [-5, 5]) {
    const point = aircraft.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
    assert(point.z > -1 && point.z < 1, 'aircraft stays inside camera depth range');
    result.expandByPoint(new THREE.Vector2(point.x, point.y));
  }
  return result;
}

for (const [mission, IntroPath] of [[journeyDallas01, MissionOneIntroPath], [journeyDallas02, MissionTwoIntroPath], [journeyDallas03, MissionThreeIntroPath], [journeyDallas04, MissionFourIntroPath], [journeyDallas05, MissionFiveIntroPath], [journeyDallas06, MissionSixIntroPath]]) {
test(`${mission.name} keeps the aircraft readable through the full gate tour and restores gameplay transforms each frame`, () => {
  for (const aspect of [1280 / 589, 16 / 9]) {
    const aircraft = new THREE.Group(), s = mission.airborneSpawn;
    aircraft.position.set(s.x, s.altitude + 500, s.z);
    aircraft.rotation.set(0, s.heading, 0, 'YXZ');
    const position = aircraft.position.clone(), rotation = aircraft.quaternion.clone(), scale = aircraft.scale.clone();
    const chasePosition = new THREE.Vector3(0, 5, 26).applyQuaternion(rotation).add(position);
    const chaseTarget = new THREE.Vector3(0, 1, -12).applyQuaternion(rotation).add(position);
    const path = new IntroPath(position, mission.gates, () => 500);
    const camera = new THREE.PerspectiveCamera(60, aspect, .1, 100000);
    const helper = new MissionOneAircraftPreview(), target = new THREE.Vector3();
    camera.position.copy(chasePosition); camera.lookAt(chaseTarget); camera.updateMatrixWorld(true);
    aircraft.updateMatrixWorld(true);
    const baseline = screenBounds(aircraft, camera).getSize(new THREE.Vector2());
    for (const time of [0, 1500, 2500, 3500, 7000, 12000, 18500]) {
      path.sample(time, camera.position, target, chasePosition, chaseTarget);
      camera.fov = path.fov(time, 60); camera.updateProjectionMatrix(); camera.lookAt(target); camera.updateMatrixWorld(true);
      helper.begin(aircraft, camera, chasePosition, chaseTarget, 60);
      try {
        const bounds = screenBounds(aircraft, camera), size = bounds.getSize(new THREE.Vector2());
        assert(Math.abs(size.x / baseline.x - 1) < .05, `readable width at ${time}ms`);
        assert(Math.abs(size.y / baseline.y - 1) < .1, `readable height at ${time}ms`);
        assert(bounds.min.x > -1 && bounds.max.x < 1 && bounds.min.y > -1 && bounds.max.y < 1);
        assert.deepEqual(aircraft.scale, scale, 'model is never resized');
      } finally { helper.end(); }
      assert.deepEqual(aircraft.position, position, 'authoritative start position is restored before simulation/network work');
      assert(aircraft.quaternion.equals(rotation));
    }
    // The same return framing is used after Skip Intro and the natural end wipe.
    camera.position.copy(chasePosition); camera.lookAt(chaseTarget); camera.fov = 60; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    helper.begin(aircraft, camera, chasePosition, chaseTarget, 60); helper.end();
    assert.deepEqual(aircraft.position, position); assert(aircraft.quaternion.equals(rotation));
  }
});

}

test('actual render and lens guards enable aircraft framing for all six Golden Gates intros only', () => {
  const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const expressions = [];
  function visit(node) {
    if (ts.isIfStatement(node) && (node.thenStatement.getText(ast).includes('missionOneAircraftPreview.begin(') ||
      node.thenStatement.getText(ast) === 'missionOnePreviewChaseFov = chaseFov;')) expressions.push(node.expression.getText(ast));
    else ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(expressions.length, 2);
  const names = ['missionOneIntroPath', 'missionTwoIntroPath', 'missionThreeIntroPath', 'missionFourIntroPath', 'missionFiveIntroPath', 'missionSixIntroPath'];
  const context = Object.fromEntries(names.map(name => [name, undefined]));
  for (const name of names) {
    for (const expression of expressions) assert.equal(Boolean(vm.runInNewContext(expression, {
      ...context, [name]: {}, flightLaunchState: 'active',
    })), true, name);
  }
  for (const expression of expressions) assert.equal(Boolean(vm.runInNewContext(expression, {
    ...context, missionCombatIntroPath: {}, flightLaunchState: 'active',
  })), false, 'combat cinematics retain their existing framing');
  const render = expressions.find(e => e.includes('flightLaunchState'));
  for (const name of names) for (const state of ['pending', 'complete', 'disabled'])
    assert.equal(Boolean(vm.runInNewContext(render, { ...context, [name]: {}, flightLaunchState: state })), false);
});
