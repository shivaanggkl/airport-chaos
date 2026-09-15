import assert from 'node:assert/strict';
import test from 'node:test';
import { cargoCreditReward } from '../../shared/reward-economy.mjs';

test('Mammoth earns 40% more Credits only for eligible cargo activity', () => {
  assert.deepEqual(cargoCreditReward(1_000, 'cargo', 'event', 'cargoConvoy'), {
    credits: 1_400, baseCredits: 1_000, bonusCredits: 400, eligible: true, applied: true,
  });
  assert.equal(cargoCreditReward(1_000, 'trainer', 'event', 'cargoConvoy').credits, 1_000);
  assert.equal(cargoCreditReward(1_000, 'cargo', 'event', 'aceIntercept').credits, 1_000);
  assert.equal(cargoCreditReward(1_000, 'cargo', 'mission', 'future-cargo', true).credits, 1_400);
});
