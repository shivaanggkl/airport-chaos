import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DESTRUCTION_EFFECT_DURATION_SECONDS,
  DESTRUCTION_FRAGMENT_COUNT,
  MAX_DESTRUCTION_EFFECTS,
  aircraftVisualConfig,
  groundContactVisualOffset,
} from '../../shared/aircraft-visual-rules.mjs';

const runwayRootClearance = 1.2;

function pitchQuaternion(pitch: number) {
  return { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) };
}

function rotatedWorldY(contact: Readonly<{ x: number; y: number; z: number }>, pitch: number, offset: number): number {
  return (contact.y + offset) * Math.cos(pitch) - contact.z * Math.sin(pitch);
}

test('destruction blast stays compact and bounded for pooled mobile rendering', () => {
  assert.equal(DESTRUCTION_EFFECT_DURATION_SECONDS, 0.9);
  assert.equal(DESTRUCTION_FRAGMENT_COUNT, 6);
  assert.equal(MAX_DESTRUCTION_EFFECTS, 6);
});

test('Bluejay boost uses the normalized aft-fuselage center instead of the old belly offset', () => {
  assert.deepEqual(aircraftVisualConfig.trainer.effectAnchors, [
    { x: 0, y: -0.35, z: 3.25, radius: 0.575, boostLength: 3.2 },
  ]);
  assert.equal(aircraftVisualConfig.privateJet.effectAnchors.length, 2);
  assert.equal(aircraftVisualConfig.cargo.effectAnchors.length, 4);
  assert.equal(aircraftVisualConfig.fighter.effectAnchors.length, 1);
});

test('per-aircraft wheel contacts remain at or above runway height through ground pitch limits', () => {
  for (const [type, config] of Object.entries(aircraftVisualConfig)) {
    for (const pitch of [-0.08, 0, 0.07, 0.2]) {
      const offset = groundContactVisualOffset(config.groundContacts, pitchQuaternion(pitch), runwayRootClearance);
      const lowest = Math.min(...config.groundContacts.map((contact) =>
        runwayRootClearance + rotatedWorldY(contact, pitch, offset)));
      assert.ok(lowest >= -1e-9, `${type} clips by ${-lowest}m at pitch ${pitch}`);
    }
  }
});

test('authoritative destroyed position is carried to the pooled client blast', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(server, /type: 'destroyed', cause: 'combat',[^\n]*position: victim\.position/);
  assert.match(server, /type: 'destroyed', cause: 'collision',[^\n]*position: first\.position/);
  assert.match(client, /sourcePosition = message\.position[^;]+\? message\.position\s+: destroyedPlane\?\.position/s);
  assert.match(client, /destructionPosition\.set\(sourcePosition\.x, sourcePosition\.y, sourcePosition\.z\)/);
  assert.match(client, /createDestructionEffect\(destructionPosition, destroyedType\)/);
});
