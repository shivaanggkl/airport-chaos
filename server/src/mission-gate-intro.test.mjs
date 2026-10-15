import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MissionGateIntro } from '../../client/src/mission-gate-intro.ts';
import { journeyDallas05 } from '../../shared/journey-mission.mjs';

test('Needle Rush preview visits all ten gates and restores the chase view', () => {
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
    const intro = new MissionGateIntro(root, journeyDallas05.gates,
      journeyDallas05.airborneSpawn, () => 0, index => shown.push(index));
    const camera = new THREE.PerspectiveCamera(70, 2, .1, 30_000);
    const chasePosition = new THREE.Vector3(0, 900, 0);
    const chaseTarget = new THREE.Vector3(0, 850, -100);
    for (let index = 0; index < journeyDallas05.gates.length; index += 1) {
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
