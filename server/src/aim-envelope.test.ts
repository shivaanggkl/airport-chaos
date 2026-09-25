import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AIM_ENVELOPE,
  AIM_MANUAL_OFFSET,
  AIM_MAX_OFFSET,
  COMBAT_RANGE,
  aimGoal,
  biasAim,
  insideDynamicLock,
  stepAim,
} from '../../shared/protocol.mjs';

const EPSILON = 1e-10;

test('shared angular aim limits are exactly twice their previous values', () => {
  assert.equal(AIM_ENVELOPE, 0.40);
  assert.equal(AIM_MAX_OFFSET, 0.23);
  assert.equal(AIM_MANUAL_OFFSET, 0.20);
  assert.equal(COMBAT_RANGE, 3_000);
});

test('horizontal, vertical, and diagonal manual aim use the expanded envelope', () => {
  const horizontal = { x: 0, y: 0 };
  const vertical = { x: 0, y: 0 };
  const diagonal = { x: 0, y: 0 };
  biasAim(horizontal, 1, 0);
  biasAim(vertical, 0, -1);
  biasAim(diagonal, 1, -1);

  assert.ok(Math.abs(Math.atan(horizontal.x) - AIM_MANUAL_OFFSET) < EPSILON);
  assert.ok(Math.abs(Math.atan(-vertical.y) - AIM_MANUAL_OFFSET) < EPSILON);
  assert.ok(diagonal.x > 0 && diagonal.y < 0);
  assert.ok(Math.atan(Math.hypot(diagonal.x, diagonal.y)) < AIM_ENVELOPE);
});

test('targets beyond the previous envelope are acquired and validated against the same aim', () => {
  const targetAngle = 0.30;
  const depth = 1_000;
  const targetX = Math.tan(targetAngle) * depth;
  const goal = { x: 0, y: 0 };

  assert.equal(aimGoal(targetX, 0, -depth, goal), true);
  assert.ok(Math.abs(Math.atan(goal.x) - AIM_MAX_OFFSET) < EPSILON);
  assert.equal(insideDynamicLock(targetX, 0, -depth, { x: Math.tan(targetAngle), y: 0 }), true);
});

test('center, former limits, expanded horizontal/vertical limits, and diagonals validate', () => {
  const depth = 1_000;
  const cases = [
    { angle: 0, azimuth: 0 },
    { angle: 0.10, azimuth: 0 },
    { angle: 0.20, azimuth: 0 },
    { angle: 0.30, azimuth: 0 },
    { angle: 0.399, azimuth: 0 },
    { angle: 0.20, azimuth: Math.PI / 2 },
    { angle: 0.399, azimuth: Math.PI / 4 },
  ];

  for (const { angle, azimuth } of cases) {
    const lateral = Math.tan(angle) * depth;
    const x = Math.cos(azimuth) * lateral;
    const y = Math.sin(azimuth) * lateral;
    const acquiredAim = { x: 0, y: 0 };
    assert.equal(aimGoal(x, y, -depth, acquiredAim), true, `acquire ${angle} rad at ${azimuth} rad`);
    assert.equal(
      insideDynamicLock(x, y, -depth, { x: x / depth, y: y / depth }),
      true,
      `validate ${angle} rad at ${azimuth} rad`,
    );
  }

  const outside = Math.tan(AIM_ENVELOPE + 0.001) * depth;
  assert.equal(aimGoal(outside, 0, -depth, { x: 0, y: 0 }), false);
});

test('expanded travel retains the existing per-frame aim speed', () => {
  const oldRangeStep = { x: 0, y: 0 };
  const newRangeStep = { x: 0, y: 0 };
  const delta = 1 / 60;
  stepAim(oldRangeStep, { x: Math.tan(0.10), y: 0 }, delta, AIM_ENVELOPE);
  stepAim(newRangeStep, { x: Math.tan(AIM_MANUAL_OFFSET), y: 0 }, delta, AIM_ENVELOPE);
  assert.ok(Math.abs(oldRangeStep.x - newRangeStep.x) < EPSILON);
});

test('client prediction and server projectiles both derive direction from the shared aim sample', () => {
  const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(client, /projectileDirection\.set\(visualAim\.x, visualAim\.y, -1\)\.normalize\(\)/);
  assert.match(client, /aimSample: \{ from: previousAimId, to: serverAimId, blend: visualAimBlend \}/);
  assert.match(server, /const shotAim = validatedShotAim\(player, message\.aimSample, now\)/);
  assert.match(server, /rotateLocalYxz\(\{ x: aim\.x, y: aim\.y, z: -1 \}, transform\.rotation\)/);
});
