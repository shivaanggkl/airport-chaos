import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerProfileStore } from './player-profiles.js';

function store() { return new PlayerProfileStore(join(mkdtempSync(join(tmpdir(), 'airport-retention-')), 'profiles.sqlite')); }

test('daily streak is idempotent, advances, resets, and cycles after day seven', () => {
  const db = store(); db.getOrCreate('pilot-a', 'Pilot A');
  const day = Date.UTC(2026, 0, 1);
  assert.equal(db.claimDailyStreak('pilot-a', day)?.credits, 50);
  assert.equal(db.claimDailyStreak('pilot-a', day)?.credits, 0);
  for (let index = 1; index < 7; index += 1) db.claimDailyStreak('pilot-a', day + index * 86_400_000);
  assert.equal(db.claimDailyStreak('pilot-a', day + 7 * 86_400_000)?.credits, 50);
  const reset = db.claimDailyStreak('pilot-a', day + 10 * 86_400_000);
  assert.equal(reset?.profile.dailyStreak.current, 1);
});

test('pilot XP migration is once-only and records only improve', () => {
  const db = store(); const first = db.getOrCreate('pilot-b', 'Pilot B');
  const xp = db.awardPilotXp('pilot-b', 6_300)!;
  assert.equal(xp.levelUp, 15); assert.equal(xp.title, 'ACE');
  assert.equal(db.updatePersonalRecord('pilot-b', 'top_speed', 500, 'dallas'), true);
  assert.equal(db.updatePersonalRecord('pilot-b', 'top_speed', 400, 'dallas'), false);
  assert.equal(db.getOrCreate('pilot-b', 'Pilot B').pilotProgress.xp, first.pilotProgress.xp + 6_300);
});

test('PvP reward is idempotent, pair-cooled, and practice remains playable', () => {
  const db = store(); db.getOrCreate('winner', 'Winner'); db.getOrCreate('loser', 'Loser');
  const now = Date.UTC(2026, 0, 1);
  assert.equal(db.awardPvpWin('00000000-0000-4000-8000-000000000001', 'winner', 'loser', 200, now).rewarded, true);
  assert.equal(db.awardPvpWin('00000000-0000-4000-8000-000000000001', 'winner', 'loser', 200, now).rewarded, false);
  assert.equal(db.awardPvpWin('00000000-0000-4000-8000-000000000002', 'winner', 'loser', 200, now + 1_000).rewarded, false);
});

test('referral attaches only to a new different profile and rewards once after qualification', () => {
  const db = store(); db.getOrCreate('inviter', 'Inviter'); db.getOrCreate('new-pilot', 'New Pilot');
  const code = db.referralCode('inviter');
  assert.equal(db.attachReferral('new-pilot', code, 'network-b'), true);
  assert.equal(db.attachReferral('new-pilot', code, 'network-b'), false);
  assert.equal(db.advanceReferral('new-pilot', 1_199_999, true).rewarded, false);
  assert.equal(db.advanceReferral('new-pilot', 1, false).rewarded, true);
  assert.equal(db.advanceReferral('new-pilot', 1, true).rewarded, false);
});

test('weekly payout chooses one best placement and is idempotent', () => {
  const db = store(); db.getOrCreate('weekly-pilot', 'Weekly Pilot');
  db.recordWeeklyLeaderboard('weekly-pilot', 'dallas', 'kills', 10);
  db.recordWeeklyLeaderboard('weekly-pilot', 'dallas', 'territories', 4);
  const nextWeek = Date.now() + 7 * 86_400_000;
  const reward = db.finalizePreviousWeeklyReward('weekly-pilot', nextWeek);
  assert.equal(reward?.rank, 1); assert.equal(reward?.credits, 1_000);
  assert.deepEqual(db.finalizePreviousWeeklyReward('weekly-pilot', nextWeek), reward);
});
