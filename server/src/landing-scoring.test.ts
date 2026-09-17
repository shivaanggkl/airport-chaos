import test from 'node:test';
import assert from 'node:assert/strict';
import { landingGradeForScore, landingPrecisionScore } from '../../shared/landing-scoring.mjs';

test('landing score and grade boundaries stay deterministic', () => {
  assert.equal(landingGradeForScore(419), 'ROUGH');
  assert.equal(landingGradeForScore(420), 'SAFE');
  assert.equal(landingGradeForScore(650), 'SMOOTH');
  assert.equal(landingGradeForScore(820), 'PERFECT');
  assert.equal(landingGradeForScore(940), 'LEGENDARY');
  assert.ok(landingPrecisionScore({ speed: 72, descentRate: 0, bankAngle: 0, pitch: 0, headingError: 0 }, { speed: 100, descent: 8, tilt: .3 }) >= 940);
});
