import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { JourneyAttemptStore } from './journey-attempts.js';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotProfileSummaryStore } from './pilot-profile-summary.js';
import { PlayerWallet } from './player-wallet.js';

test('public profile counts only authoritative earnings and completions, with stable migration baseline', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-profile-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const profiles = new PlayerProfileStore(path);
    profiles.getOrCreate('pilot-a', 'Pilot Ace');
    new JourneyAttemptStore(path);
    const db = new DatabaseSync(path);
    db.prepare('UPDATE player_profiles SET credits=500,score=1800,owned_aircraft=? WHERE pilot_id=?')
      .run('["trainer","cargo"]', 'pilot-a');
    const wallet = new PlayerWallet(db);
    wallet.credit({ pilotId: 'pilot-a', currency: 'CREDITS', amount: 100, reason: 'MISSION_REWARD', idempotencyKey: 'mission-1' });
    const summaries = new PilotProfileSummaryStore(path);
    const before = summaries.summary('pilot-a');
    assert.match(before.publicPilotId, /^AC-[A-F0-9]{16}$/);
    assert.equal(before.lifetimeCreditsEarned, 600);
    wallet.credit({ pilotId: 'pilot-a', currency: 'CREDITS', amount: 200, reason: 'DAILY_REWARD', idempotencyKey: 'daily-1' });
    wallet.credit({ pilotId: 'pilot-a', currency: 'CREDITS', amount: 200, reason: 'DAILY_REWARD', idempotencyKey: 'daily-1' });
    wallet.debit({ pilotId: 'pilot-a', currency: 'CREDITS', amount: 50, reason: 'AIRCRAFT_PURCHASE' });
    wallet.credit({ pilotId: 'pilot-a', currency: 'CREDITS', amount: 25, reason: 'ADMIN_ADJUSTMENT' });
    assert.equal(summaries.summary('pilot-a').lifetimeCreditsEarned, 800);
    assert.equal(summaries.summary('pilot-a').publicPilotId, before.publicPilotId);
    assert.equal(summaries.summary('pilot-a').singlePlayer.aircraftOwned, 2);
    assert.equal(summaries.summary('pilot-a').singlePlayer.totalScore, 1800);
    const now = Date.UTC(2026, 9, 14, 12);
    for (let mission = 1; mission <= 6; mission += 1) {
      db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
        .run('pilot-a', `journey-dallas-${String(mission).padStart(2, '0')}`, `attempt-${mission}`, now - (7 - mission) * 60_000, 90_000);
    }
    const after = summaries.summary('pilot-a', now);
    assert.deepEqual([after.singlePlayer.missionsCompleted, after.singlePlayer.missionsTotal,
      after.singlePlayer.chaptersCompleted, after.singlePlayer.chaptersTotal,
      after.singlePlayer.citiesCompleted, after.singlePlayer.citiesTotal], [6, 24, 1, 4, 0, 1]);
    assert.equal(after.singlePlayer.overallProgress, 25);
    assert.equal(after.latestAchievements.some(item => item.key === 'first_mission'), true);
    assert.equal(after.latestAchievements.some(item => item.key === 'chapter:dallas:1'), true);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM pilot_achievements WHERE pilot_id=?').get('pilot-a') as { count: number }).count, 2);
    summaries.summary('pilot-a', now);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM pilot_achievements WHERE pilot_id=?').get('pilot-a') as { count: number }).count, 2);
    db.close();
    assert.equal(new PilotProfileSummaryStore(path).summary('pilot-a').publicPilotId, before.publicPilotId);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('unverified completion dates do not create historical achievements; scored landing grant is idempotent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-profile-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const profiles = new PlayerProfileStore(path);
    profiles.getOrCreate('pilot-b', 'Pilot Blue');
    new JourneyAttemptStore(path);
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('pilot-b', 'journey-dallas-01', 'old', 0, 90_000);
    const summaries = new PilotProfileSummaryStore(path);
    assert.equal(summaries.summary('pilot-b').latestAchievements.length, 0);
    const now = Date.UTC(2026, 9, 14, 12);
    summaries.recordSmoothLanding('pilot-b', 779, now);
    summaries.recordSmoothLanding('pilot-b', 780, now);
    summaries.recordSmoothLanding('pilot-b', 900, now + 1_000);
    const achievements = summaries.summary('pilot-b', now + 1_000).latestAchievements;
    assert.deepEqual(achievements.map(item => item.key), ['smooth_landing']);
    assert.equal(achievements[0]?.earnedAt, now);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
