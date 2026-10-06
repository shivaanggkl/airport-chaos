import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DAILY_REWARD_COOLDOWN_MS, dailyRewardCredits } from '../../shared/daily-rewards.mjs';
import { PlayerProfileStore } from './player-profiles.js';

function databasePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'airport-daily-reward-')), 'profiles.sqlite');
}

test('new account starts on immediately available Day 1 and follows the exact seven-claim schedule', () => {
  const path = databasePath();
  const profiles = new PlayerProfileStore(path);
  const start = Date.UTC(2026, 0, 1);
  const initial = profiles.getOrCreate('daily-schedule', 'Daily Pilot');
  assert.deepEqual(initial.dailyReward.schedule, dailyRewardCredits);
  assert.equal(profiles.dailyRewardState('daily-schedule', start)?.claimable, true);

  let expectedCredits = initial.credits;
  for (let index = 0; index < dailyRewardCredits.length; index += 1) {
    const claimed = profiles.claimDailyReward('daily-schedule', start + index * DAILY_REWARD_COOLDOWN_MS)!;
    expectedCredits += dailyRewardCredits[index]!;
    assert.deepEqual({ claimed: claimed.claimed, day: claimed.day, credits: claimed.credits },
      { claimed: true, day: index + 1, credits: dailyRewardCredits[index] });
    assert.equal(claimed.profile.credits, expectedCredits);
    assert.equal(claimed.profile.skyTokens, 0);
  }
  assert.equal(profiles.dailyRewardState('daily-schedule', start + 7 * DAILY_REWARD_COOLDOWN_MS)?.nextDay, 1);

  const raw = new DatabaseSync(path);
  const ledger = raw.prepare("SELECT amount,reason FROM wallet_transactions WHERE pilot_id=? AND reason='DAILY_REWARD' ORDER BY created_at")
    .all('daily-schedule') as Array<{ amount: number; reason: string }>;
  assert.deepEqual(ledger.map(({ amount }) => amount), dailyRewardCredits);
  assert.equal(ledger.every(({ reason }) => reason === 'DAILY_REWARD'), true);
  raw.close();
});

test('cooldown rejects early claims and missed time never resets reward progress', () => {
  const profiles = new PlayerProfileStore(databasePath());
  const start = Date.UTC(2026, 2, 1);
  profiles.getOrCreate('daily-cooldown', 'Cooldown Pilot');
  assert.equal(profiles.claimDailyReward('daily-cooldown', start)?.day, 1);
  assert.equal(profiles.claimDailyReward('daily-cooldown', start + DAILY_REWARD_COOLDOWN_MS - 1)?.claimed, false);
  assert.equal(profiles.claimDailyReward('daily-cooldown', start + DAILY_REWARD_COOLDOWN_MS)?.day, 2);
  assert.equal(profiles.claimDailyReward('daily-cooldown', start + 8 * 86_400_000)?.day, 3);
});

test('claims are shared across sessions and serialized so the same reward pays once', () => {
  const path = databasePath();
  const firstSession = new PlayerProfileStore(path);
  const secondSession = new PlayerProfileStore(path);
  const now = Date.UTC(2026, 4, 1);
  firstSession.getOrCreate('daily-shared', 'Shared Pilot');

  const first = firstSession.claimDailyReward('daily-shared', now)!;
  const second = secondSession.claimDailyReward('daily-shared', now)!;
  assert.equal(Number(first.claimed) + Number(second.claimed), 1);
  assert.equal(secondSession.getOrCreate('daily-shared', 'Shared Pilot').credits, 250);
  assert.equal(secondSession.dailyRewardState('daily-shared', now)?.nextDay, 2);

  const raw = new DatabaseSync(path);
  assert.equal((raw.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id=? AND reason='DAILY_REWARD'").get('daily-shared') as { count: number }).count, 1);
  raw.close();
});

test('wallet and reward progression roll back together when claim history cannot commit', () => {
  const path = databasePath();
  const profiles = new PlayerProfileStore(path);
  profiles.getOrCreate('daily-rollback', 'Rollback Pilot');
  const raw = new DatabaseSync(path);
  raw.exec("CREATE TRIGGER reject_daily_claim BEFORE INSERT ON pilot_daily_reward_claims BEGIN SELECT RAISE(ABORT, 'forced claim failure'); END;");

  assert.throws(() => profiles.claimDailyReward('daily-rollback', Date.UTC(2026, 5, 1)), /forced claim failure/);
  const profile = profiles.getOrCreate('daily-rollback', 'Rollback Pilot');
  assert.equal(profile.credits, 0);
  assert.equal(profile.dailyReward.nextDay, 1);
  assert.equal(profile.dailyReward.claimCount, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id=? AND reason='DAILY_REWARD'").get('daily-rollback') as { count: number }).count, 0);
  raw.close();
});

test('legacy daily progress migrates forward without resetting the next reward', () => {
  const path = databasePath();
  const profiles = new PlayerProfileStore(path);
  profiles.getOrCreate('daily-legacy', 'Legacy Pilot');
  const raw = new DatabaseSync(path);
  raw.prepare('DELETE FROM pilot_daily_rewards WHERE pilot_id=?').run('daily-legacy');
  raw.prepare('UPDATE pilot_progression SET cycle_day=3,last_claim_day=? WHERE pilot_id=?').run('2025-01-01', 'daily-legacy');
  raw.close();
  const migrated = profiles.dailyRewardState('daily-legacy', Date.UTC(2026, 0, 1))!;
  assert.equal(migrated.nextDay, 4);
  assert.equal(migrated.nextAmount, 500);
  assert.equal(migrated.claimable, true);
});

test('unknown player cannot be used to forge a Daily Reward claim', () => {
  const profiles = new PlayerProfileStore(databasePath());
  assert.equal(profiles.claimDailyReward('forged-player'), undefined);
});

test('Hub exposes the compact Rewards flow while active-flight navigation does not', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../../client/src/app-shell.ts', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /data-home-rewards/);
  assert.match(shell, /app-shell-rewards[\s\S]*dataset\.rewardsIndicator = ''/);
  assert.match(bootstrap, /sections: \['PROFILE', 'REWARDS'/);
  assert.match(bootstrap, /method: 'POST'[\s\S]*body: '\{\}'/);
  assert.match(menu, /pilot-rewards-grid[\s\S]*CLAIM[\s\S]*CREDITS/);
  assert.match(menu, /options\.sections \?\? \['PROFILE', 'MISSIONS', 'MAP', 'PLAYERS', 'TERRITORIES', 'PROGRESS', 'GARAGE', 'CONTROLS', 'AUDIO', 'HELP'\]/);
});
