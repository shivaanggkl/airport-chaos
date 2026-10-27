import assert from 'node:assert/strict';
import test from 'node:test';
import { duelTakedownWinner, duelTimeoutWinner } from './sky-duel-rules.js';

test('three takedowns wins; lower scores continue until the normal deadline', () => {
  assert.equal(duelTakedownWinner(2, 1, false), undefined);
  assert.equal(duelTakedownWinner(3, 0, false), 'WIN_A');
  assert.equal(duelTakedownWinner(1, 3, false), 'WIN_B');
  assert.equal(duelTimeoutWinner(2, 1), 'WIN_A');
  assert.equal(duelTimeoutWinner(0, 1), 'WIN_B');
  assert.equal(duelTimeoutWinner(2, 2), undefined);
  assert.equal(duelTimeoutWinner(0, 0), undefined);
});

test('first verified overtime takedown wins and an unresolved tie remains a draw', () => {
  assert.equal(duelTakedownWinner(3, 2, true), 'WIN_A');
  assert.equal(duelTakedownWinner(0, 1, true), 'WIN_B');
  assert.equal(duelTimeoutWinner(0, 0), undefined);
});
