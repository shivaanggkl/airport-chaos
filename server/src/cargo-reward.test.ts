import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedCreditReason } from '../../shared/reward-economy.mjs';

test('cargo events and legacy missions cannot generate renewable cargo Credit bonuses', () => {
  assert.equal(approvedCreditReason('EVENT_REWARD'), false);
  assert.equal(approvedCreditReason('FLIGHT_REWARD'), false);
  assert.equal(approvedCreditReason('TERRITORY_REWARD'), false);
});
