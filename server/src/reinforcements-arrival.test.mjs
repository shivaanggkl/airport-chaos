import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { journeyDallas09 } from '../../shared/journey-mission.mjs';
import { TransportArrivalSequence } from '../../client/src/transport-arrival.ts';

test('Mission 9 opening frames its initial escorts and clears their preview at handoff', () => {
  const previousDocument = globalThis.document;
  let alertHtml = '';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ className: '', setAttribute: () => undefined, style: { opacity: '' },
      set innerHTML(value) { alertHtml = value; }, remove: () => undefined }),
    body: { append: () => undefined },
  } });
  try {
    const scene = new THREE.Scene();
    const escorts = [new THREE.Group(), new THREE.Group()];
    const arrival = new TransportArrivalSequence(new THREE.Group(), () => 0, scene, escorts, journeyDallas09.name);
    assert.match(alertHtml, /REINFORCEMENTS/);
    assert.match(alertHtml, /Escorts are optional/);
    arrival.update(2);
    const camera = new THREE.PerspectiveCamera(58, 1280 / 590, 1, 10_000);
    arrival.frame(camera, .016, new THREE.Object3D(), new THREE.Vector3(), new THREE.Vector3());
    const projected = escorts.map(escort => escort.position.clone().project(camera));
    assert.ok(projected[0].x * projected[1].x < 0);
    assert.ok(projected.every(point => Math.abs(point.x) < .85 && Math.abs(point.y) < .5));
    arrival.skip();
    arrival.update(0);
    assert.ok(escorts.every(escort => !escort.visible));
    arrival.dispose();
    assert.ok(escorts.every(escort => !scene.children.includes(escort)));
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
  }
});
