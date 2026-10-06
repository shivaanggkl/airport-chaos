import assert from 'node:assert/strict';
import test from 'node:test';
import { ReferralFlightTracker } from './referral-flight.js';

test('referral flight time needs 60 accepted airborne seconds in one flight', () => {
  const tracker = new ReferralFlightTracker();
  tracker.begin('pilot');
  for (let second = 0; second < 59; second += 1) assert.equal(tracker.advance('pilot', 1_000), false);
  assert.equal(tracker.advance('pilot', 1_000), true);
  assert.equal(tracker.advance('pilot', 1_000), true, 'qualification may retry after a transient payout failure');
  tracker.reset('pilot');
  tracker.begin('pilot');
  assert.equal(tracker.advance('pilot', 20_000), false);
  tracker.reset('pilot');
  tracker.begin('pilot');
  for (let second = 0; second < 59; second += 1) assert.equal(tracker.advance('pilot', 1_000), false);
  assert.equal(tracker.advance('pilot', 1_000), true);
});
