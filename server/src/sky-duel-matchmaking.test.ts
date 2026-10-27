import assert from 'node:assert/strict';
import test from 'node:test';
import { closestDuelOpponent, duelMatchable, duelSearchRange, duelWinProbability, type DuelQueueEntry } from './sky-duel-matchmaking.js';

const entry = (pilotId: string, rating: number, queuedAt = 0, completed = 10): DuelQueueEntry =>
  ({ pilotId, playerId: pilotId, rating: { rating, completed }, queuedAt, recentOpponents: new Set() });

test('match search widens at 15 and 30 seconds without accepting extreme odds', () => {
  assert.deepEqual([duelSearchRange(14_999), duelSearchRange(15_000), duelSearchRange(29_999), duelSearchRange(30_000)], [100, 200, 200, 300]);
  assert.equal(duelMatchable(entry('a', 1000), entry('b', 1150), 14_999), false);
  assert.equal(duelMatchable(entry('a', 1000), entry('b', 1150), 15_000), false);
  assert.equal(duelMatchable(entry('a', 1000), entry('b', 1100), 15_000), true);
  assert.equal(duelMatchable(entry('a', 1000), entry('b', 1250), 30_000), false);
  assert.ok(duelWinProbability(1000, 1250) < 0.35);
});

test('provisional pilots prefer comparable provisional opponents, regardless of experience level', () => {
  const novice = entry('novice', 1000, 0, 0);
  assert.equal(closestDuelOpponent(novice, [entry('established', 1010), entry('other-novice', 1040, 0, 0)], 100)?.pilotId, 'other-novice');
});

test('recent opponent and same account are excluded', () => {
  const a = { ...entry('a', 1000), recentOpponents: new Set(['b']) };
  assert.equal(duelMatchable(a, entry('b', 1000), 50_000), false);
  assert.equal(duelMatchable(a, entry('a', 1000), 50_000), false);
});
