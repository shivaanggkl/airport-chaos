import assert from 'node:assert/strict';
import test from 'node:test';
import { duelTimeoutWinner,duelScoreWinner } from './sky-duel-rules.js';
import {competitiveModes} from '../../shared/competitive-modes.mjs';

test('Sky Duel has a real four-minute deadline and resolves terminal scores after the step',()=>{
  assert.equal(competitiveModes.skyDuel.durationMs,240000);
  assert.equal(competitiveModes.skyDuel.protectionMs,8000);
  assert.equal(competitiveModes.skyDuel.respawnMs,3000);
  assert.equal(duelScoreWinner(2,2),undefined);
  assert.equal(duelScoreWinner(3,2),'WIN_A');
  assert.equal(duelScoreWinner(2,3),'WIN_B');
  assert.equal(duelScoreWinner(3,3),'DRAW');
});

test('the timer awards the leading pilot or declares a tie at any score', () => {
  assert.equal(duelTimeoutWinner(2, 1), 'WIN_A');
  assert.equal(duelTimeoutWinner(0, 1), 'WIN_B');
  assert.equal(duelTimeoutWinner(3, 0), 'WIN_A');
  assert.equal(duelTimeoutWinner(2, 2), 'DRAW');
  assert.equal(duelTimeoutWinner(0, 0), 'DRAW');
});
