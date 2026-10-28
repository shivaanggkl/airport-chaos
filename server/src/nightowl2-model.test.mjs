import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aircraftDefinitions } from '../../client/src/aircraft.js';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftVisualConfig } from '../../shared/aircraft-visual-rules.mjs';
import { aircraftHitRadii } from '../../shared/remote-aircraft-visual-rules.mjs';
import { aircraftPresentationScale } from '../../shared/aircraft-presentation-scale.mjs';

function readGlb(path) {
  const binary = readFileSync(new URL(path, import.meta.url));
  const jsonLength = binary.readUInt32LE(12);
  const model = JSON.parse(binary.subarray(20, 20 + jsonLength).toString('utf8'));
  return { binary, model };
}

function renderedDimensions(type, path) {
  const { model } = readGlb(path);
  const positions = model.meshes.flatMap(mesh => mesh.primitives.map(primitive => model.accessors[primitive.attributes.POSITION]));
  const min = [0, 1, 2].map(axis => Math.min(...positions.map(accessor => accessor.min[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...positions.map(accessor => accessor.max[axis])));
  const source = max.map((value, axis) => value - min[axis]);
  const definition = aircraftDefinitions[type];
  const scale = Math.min(definition.wingSpan / source[0], (definition.bodyLength + definition.noseLength) / source[2]);
  return { model, min, max, scale, span: source[0] * scale, height: source[1] * scale, length: source[2] * scale };
}

test('active Nightowl is the compact airliner with authored flight anchors', () => {
  const { binary, model } = readGlb('../../client/public/assets/models/aircraft/private-jet.glb');
  const primitives = model.meshes.flatMap(mesh => mesh.primitives);
  const triangles = primitives.reduce((sum, primitive) => sum +
    model.accessors[primitive.indices].count / 3, 0);
  const bounds = primitives.reduce((result, primitive) => {
    const position = model.accessors[primitive.attributes.POSITION];
    for (let axis = 0; axis < 3; axis += 1) {
      result.min[axis] = Math.min(result.min[axis], position.min[axis]);
      result.max[axis] = Math.max(result.max[axis], position.max[axis]);
    }
    return result;
  }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const span = bounds.max[0] - bounds.min[0];
  const length = bounds.max[2] - bounds.min[2];

  assert.ok(binary.length < 1_000_000);
  assert.ok(triangles >= 15_000 && triangles <= 30_000);
  assert.ok(primitives.length <= 14);
  assert.ok(length / span > 0.98 && length / span < 1.13);
  assert.equal(model.images?.length ?? 0, 0);
  for (const name of [
    'ExhaustSocket_Left', 'ExhaustSocket_Right',
    'GroundContact_Main_Left', 'GroundContact_Main_Right',
    'GroundContact_Nose_Left', 'GroundContact_Nose_Right',
    'NoseReference', 'CameraFrameCenter',
  ]) {
    assert.equal(model.nodes.filter(node => node.name === name).length, 1, `missing ${name}`);
  }
});

test('original aircraft models remain outside the game asset path for future reuse', () => {
  for (const [name, hash] of [
    ['bluejay', 'ea25e35766cef0b974150abc2cace621ad78de7b71cbe538827a720ea8b75bcc'],
    ['nightowl', 'bc625cb08ea963d75050172079e9d809cf228b76593916ac94d6d77463161056'],
    ['firehawk', '18945753bbc8a5b3fe65bdb71a5b6a4497f6eb2da537c4bba995078c1e56cc8b'],
  ]) {
    const { binary } = readGlb(`../../client/qa-assets/${name}-backup1.glb`);
    assert.equal(createHash('sha256').update(binary).digest('hex'), hash, `${name} backup changed`);
  }
});

test('Bluejay, Nightowl and Firehawk keep distinct, consistent game-scale proportions', () => {
  const bluejay = renderedDimensions('trainer', '../../client/public/assets/models/aircraft/trainer.glb');
  const nightowl = renderedDimensions('privateJet', '../../client/public/assets/models/aircraft/private-jet.glb');
  const firehawk = renderedDimensions('fighter', '../../client/public/assets/models/aircraft/fighter.glb');
  const mammoth = renderedDimensions('cargo', '../../client/public/assets/models/aircraft/cargo.glb');
  assert.ok(bluejay.length < firehawk.length && firehawk.length < nightowl.length);
  assert.ok(firehawk.span < bluejay.span && bluejay.span < nightowl.span);
  assert.ok(firehawk.height < nightowl.height);
  assert.ok(nightowl.span < mammoth.span, 'cargo remains the widest aircraft');
  assert.ok(nightowl.length > firehawk.length * 1.3, 'airliner must look clearly larger than fighter');
  assert.equal(aircraftHitRadii.privateJet, 3.4 * aircraftPresentationScale.privateJet);
});

test('resized Nightowl wheels, exhausts and muzzle match authored model anchors', () => {
  const { model, min, max, scale } = renderedDimensions('privateJet', '../../client/public/assets/models/aircraft/private-jet.glb');
  const center = min.map((value, axis) => (value + max[axis]) / 2);
  const at = name => model.nodes.find(node => node.name === name).translation.map((value, axis) => (value - center[axis]) * scale);
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.02, `${actual} misses ${expected}`);
  const exhaust = at('ExhaustSocket_Left');
  const effect = aircraftVisualConfig.privateJet.effectAnchors[0];
  close(effect.x, exhaust[0]); close(effect.y, exhaust[1]); close(effect.z, exhaust[2]);
  const main = at('GroundContact_Main_Left');
  const noseWheel = at('GroundContact_Nose_Left');
  const contacts = aircraftVisualConfig.privateJet.groundContacts;
  close(contacts[0].x, main[0]); close(contacts[0].y, main[1]); close(contacts[0].z, main[2]);
  close(contacts[2].y, noseWheel[1]); close(contacts[2].z, noseWheel[2]);
  const nose = at('NoseReference');
  close(aircraftMuzzleSockets.privateJet.position.y, nose[1]);
  close(aircraftMuzzleSockets.privateJet.position.z, nose[2] - 0.12);
});
