import assert from 'node:assert/strict';
import test from 'node:test';
import { duelTimeoutWinner } from './sky-duel-rules.js';

test('the timer awards the leading pilot or declares a tie at any score', () => {
  assert.equal(duelTimeoutWinner(2, 1), 'WIN_A');
  assert.equal(duelTimeoutWinner(0, 1), 'WIN_B');
  assert.equal(duelTimeoutWinner(3, 0), 'WIN_A');
  assert.equal(duelTimeoutWinner(2, 2), 'DRAW');
  assert.equal(duelTimeoutWinner(0, 0), 'DRAW');
});
