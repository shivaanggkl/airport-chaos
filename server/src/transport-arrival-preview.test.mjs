import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TransportArrivalSequence } from '../../client/src/transport-arrival.ts';

test('Mission 8 arrival frames both temporary escorts and removes them on handoff', () => {
  const previousDocument = globalThis.document;
  let alertHtml = '';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ className: '', setAttribute: () => undefined, style: { opacity: '' },
      set innerHTML(value) { alertHtml = value; }, remove: () => undefined }),
    body: { append: () => undefined },
  } });
  try {
    const scene = new THREE.Scene();
    const transport = new THREE.Group();
    const escorts = [new THREE.Group(), new THREE.Group()];
    const arrival = new TransportArrivalSequence(transport, () => 0, scene, escorts, 'REAR GUARD');
    assert.match(alertHtml, /REAR GUARD/);
    assert.match(alertHtml, /Destroy the transport\. Escorts optional\./);
    arrival.update(2);
    const camera = new THREE.PerspectiveCamera(58, 1280 / 590, 1, 10_000);
    arrival.frame(camera, 0.016, new THREE.Object3D(), new THREE.Vector3(), new THREE.Vector3());
    const screenPositions = [];
    for (const escort of escorts) {
      const position = escort.position.clone().project(camera);
      screenPositions.push(position);
      assert.ok(escort.visible && Math.abs(position.x) > .4 && Math.abs(position.x) < .85 && Math.abs(position.y) < .5,
        'each escort is clearly visible beside the transport, away from its body and screen edge');
      assert.ok(scene.children.includes(escort));
    }
    assert.ok(screenPositions[0].x * screenPositions[1].x < 0,
      'the two escorts appear on opposite sides of the transport');
    assert.ok(escorts[0].position.distanceTo(escorts[1].position) > 800);
    arrival.skip();
    arrival.update(0);
    assert.ok(escorts.every(escort => !escort.visible));
    arrival.dispose();
    assert.ok(escorts.every(escort => !scene.children.includes(escort)));
    const briefingWithoutPreview = new TransportArrivalSequence(transport, () => 0, scene, [], 'REAR GUARD');
    assert.match(alertHtml, /REAR GUARD.*Destroy the transport\. Escorts optional\./);
    briefingWithoutPreview.dispose();
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
  }
});
