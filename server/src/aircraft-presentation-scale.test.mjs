import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aircraftDefinitions } from '../../client/src/aircraft.js';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { aircraftPresentationMuzzleSockets, aircraftPresentationScale } from '../../shared/aircraft-presentation-scale.mjs';
import { aircraftHitRadii } from '../../shared/remote-aircraft-visual-rules.mjs';

test('rendered aircraft keep distinct sizes and fit the narrowest runway', () => {
  const names = { trainer: 'trainer', privateJet: 'private-jet', cargo: 'cargo', fighter: 'fighter' };
  const spans = Object.fromEntries(Object.entries(names).map(([type, name]) => {
    const glb = readFileSync(new URL(`../../client/public/assets/models/aircraft/${name}.glb`, import.meta.url));
    const model = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
    const positions = model.meshes.flatMap(mesh => mesh.primitives.map(primitive => model.accessors[primitive.attributes.POSITION]));
    const sourceSpan = Math.max(...positions.map(accessor => accessor.max[0])) - Math.min(...positions.map(accessor => accessor.min[0]));
    const sourceLength = Math.max(...positions.map(accessor => accessor.max[2])) - Math.min(...positions.map(accessor => accessor.min[2]));
    const definition = aircraftDefinitions[type];
    const scale = Math.min(definition.wingSpan / sourceSpan,
      (definition.bodyLength + definition.noseLength) / sourceLength) * aircraftPresentationScale[type];
    return [type, sourceSpan * scale];
  }));
  assert.ok(spans.fighter < spans.trainer && spans.trainer < spans.privateJet && spans.privateJet < spans.cargo);
  assert.ok(spans.privateJet >= 17.9 && spans.cargo >= 20.9);
  assert.ok(Math.max(...Object.values(spans)) < 28);
});

test('authoritative hit and muzzle positions follow the visible aircraft scale', () => {
  for (const type of Object.keys(aircraftPresentationScale)) {
    const scale = aircraftPresentationScale[type];
    const base = aircraftMuzzleSockets[type].position;
    const muzzle = aircraftPresentationMuzzleSockets[type].position;
    for (const axis of ['x', 'y', 'z']) assert.equal(muzzle[axis], base[axis] * scale);
  }
  assert.equal(aircraftHitRadii.privateJet, 3.4 * aircraftPresentationScale.privateJet);
  assert.equal(aircraftHitRadii.cargo, 3.6 * aircraftPresentationScale.cargo);
  assert.equal(aircraftHitRadii.fighter, 2.4 * aircraftPresentationScale.fighter);
});
