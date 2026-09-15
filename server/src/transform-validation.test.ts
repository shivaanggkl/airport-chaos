import assert from 'node:assert/strict';
import test from 'node:test';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { validateClientTransform } from './transform-validation.js';

const origin = { x: 0, y: 1_000, z: 0 };

test('accepts normal, boosted, skipped-packet, and bounded stunt movement', () => {
  assert.equal(validateClientTransform(origin, { x: 0, y: 1_001, z: -38 }, 100, aircraftFlightEnvelope.trainer).accepted, true);
  assert.equal(validateClientTransform(origin, { x: 0, y: 1_030, z: -165 }, 100, aircraftFlightEnvelope.fighter).accepted, true);
  assert.equal(validateClientTransform(origin, { x: 25, y: 1_004, z: -190 }, 350, aircraftFlightEnvelope.trainer).accepted, true);
  assert.equal(validateClientTransform(origin, { x: 70, y: 1_006, z: -25 }, 100, aircraftFlightEnvelope.trainer, 45).accepted, true);
});

test('rejects instant horizontal and vertical teleports', () => {
  assert.equal(validateClientTransform(origin, { x: 1_000, y: 1_000, z: 0 }, 100, aircraftFlightEnvelope.fighter).accepted, false);
  assert.equal(validateClientTransform(origin, { x: 5_000, y: 1_000, z: 0 }, 100, aircraftFlightEnvelope.fighter).accepted, false);
  const vertical = validateClientTransform(origin, { x: 0, y: 2_000, z: 0 }, 100, aircraftFlightEnvelope.fighter);
  assert.equal(vertical.accepted, false);
  if (!vertical.accepted) assert.equal(vertical.reason, 'VERTICAL_JUMP');
});

test('rejects malformed and out-of-world positions', () => {
  assert.equal(validateClientTransform(origin, { x: Number.NaN, y: 0, z: 0 }, 100, aircraftFlightEnvelope.trainer).accepted, false);
  const bounds = { minX: -100, maxX: 100, minY: -10, maxY: 10_000, minZ: -100, maxZ: 100 };
  const result = validateClientTransform(origin, { x: 101, y: 1_000, z: 0 }, 100, aircraftFlightEnvelope.trainer, 0, bounds);
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.reason, 'WORLD_BOUNDS');
});
