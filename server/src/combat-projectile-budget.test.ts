import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatProjectileBudget } from './combat-projectile-budget.js';
import { COMBAT_RANGE, BASE_PROJECTILE_SPEED, FIRE_RATE_PER_SECOND } from '../../shared/protocol.mjs';
test('100 pilots can sustain their full firing allowance independently', () => {
  const budget = new CombatProjectileBudget();
  const inFlight = Math.ceil(COMBAT_RANGE / BASE_PROJECTILE_SPEED * Math.max(...Object.values(FIRE_RATE_PER_SECOND))) + 2;
  for (let i=0;i<100;i++) for (let n=0;n<inFlight;n++) assert.equal(budget.reserve(`pilot-${i}`,'dallas'),true);
});
test('owner and city bounds release exactly and cities do not consume each other', () => {
  const budget = new CombatProjectileBudget(2,3);
  assert.equal(budget.reserve('a','dallas'),true);assert.equal(budget.reserve('a','dallas'),true);
  assert.equal(budget.reserve('a','dallas'),false);assert.equal(budget.reserve('b','dallas'),true);
  assert.equal(budget.reserve('c','dallas'),false);assert.equal(budget.reserve('c','milwaukee'),true);
  budget.release('a','dallas');assert.equal(budget.reserve('b','dallas'),true);
  budget.release('a','dallas');budget.release('b','dallas');budget.release('b','dallas');
  assert.equal(budget.reserve('a','dallas'),true);
});
