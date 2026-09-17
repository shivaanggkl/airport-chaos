import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyPilotRewards, pilotLevelForXp, pilotTitleForLevel, pilotXpForLevel, utcDayDistance, weeklyRewardForRank } from '../../shared/pilot-progression.mjs';

test('pilot curve, cap, and titles follow the approved progression', () => {
  assert.equal(pilotXpForLevel(1), 0);
  assert.equal(pilotXpForLevel(15), 6_300);
  assert.equal(pilotLevelForXp(6_299), 14);
  assert.equal(pilotLevelForXp(6_300), 15);
  assert.equal(pilotLevelForXp(Number.MAX_SAFE_INTEGER), 50);
  assert.equal(pilotTitleForLevel(1), 'ROOKIE');
  assert.equal(pilotTitleForLevel(35), 'SKY COMMANDER');
  assert.equal(pilotTitleForLevel(50), 'LEGEND');
});

test('daily cycle and weekly placement rewards are bounded', () => {
  assert.equal(dailyPilotRewards.reduce((sum, value) => sum + value, 0), 1_000);
  assert.equal(utcDayDistance('2026-09-16', '2026-09-17'), 1);
  assert.deepEqual(weeklyRewardForRank(1), { maxRank: 1, credits: 1000, badge: 'WEEKLY ACE' });
  assert.equal(weeklyRewardForRank(11), undefined);
});
