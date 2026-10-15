import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { JourneyGateSystem } from '../../client/src/journey-gates.ts';
import { MissionGateIntro } from '../../client/src/mission-gate-intro.ts';
import { journeyDallas04, journeyDallas05 } from '../../shared/journey-mission.mjs';

for (const mission of [journeyDallas04, journeyDallas05]) test(`${mission.name} preview visits all ten gates and restores the chase view`, () => {
  const classes = new Set();
  const root = { classList: { add: name => classes.add(name), remove: name => classes.delete(name) }, append(element) { element.parentElement = root; } };
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ className: '', textContent: '', parentElement: null, setAttribute() {},
      append() {}, remove() { this.parentElement = null; } }),
  };
  try {
    const shown = [];
    const start = performance.now();
    const intro = new MissionGateIntro(root, mission.gates,
      mission.airborneSpawn, () => 0, index => shown.push(index), mission.name);
    const camera = new THREE.PerspectiveCamera(70, 2, .1, 30_000);
    const chasePosition = new THREE.Vector3(0, 900, 0);
    const chaseTarget = new THREE.Vector3(0, 850, -100);
    for (let index = 0; index < mission.gates.length; index += 1) {
      assert.equal(intro.apply(camera, chasePosition, chaseTarget, 70, start + index * 600 + 200), true);
      assert.ok(camera.position.toArray().every(Number.isFinite));
    }
    assert.deepEqual(shown, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(intro.apply(camera, chasePosition, chaseTarget, 70, start + intro.durationMs + 10), false);
    assert.equal(intro.active, false);
    assert.equal(classes.has('mission-gate-intro-active'), false);
    assert.equal(shown.at(-1), null);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('Downtown Slalom shows every golden gate during preview and restores the active gate afterward', () => {
  const scene = new THREE.Scene();
  const gates = new JourneyGateSystem(scene, () => 0, journeyDallas04);
  gates.setProgress(0, true);
  assert.equal(scene.children.filter(gate => gate.visible).length, 1);
  gates.setPreview(0);
  assert.equal(scene.children.filter(gate => gate.visible).length, journeyDallas04.gates.length);
  gates.setPreview(null);
  assert.equal(scene.children.filter(gate => gate.visible).length, 1);
  gates.dispose();
});
