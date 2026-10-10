import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas14, journeyDallas15 } from '../../shared/journey-mission.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { aceDamageAuthorized } from './journey-ace.js';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-ace-test-'));
  const path = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0), ('capped', 999950, 0), ('other', 0, 0)");
  database.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}

test('Mission 15 requires Mission 14, assigns one target, and credits first clear once', () => {
  const { directory, path, store } = fixture();
  try {
    assert.equal(journeyDallas15.bossHealth, 300);
    assert.equal(journeyDallas15.firstClearCredits, 1_950);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas15.id), /locked/);
    const database = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) database.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
      .run(pilot, journeyDallas14.id, `${pilot}-m14`, 500);
    const first = store.launch('pilot', 'trainer', 2_000, journeyDallas15.id);
    assert.equal(store.approach('pilot', first.attemptId)?.status, 'APPROACH');
    assert.equal(store.completeHunter('pilot', first.attemptId, 'ace', 2_100), undefined);
    assert.equal(store.assignHunter('pilot', first.attemptId, 'ace', null, 2_200)?.targetId, 'ace');
    assert.equal(store.assignHunter('pilot', first.attemptId, 'other-ace', null, 2_300), undefined);
    assert.equal(store.completeHunter('other', first.attemptId, 'ace', 2_400), undefined);
    assert.equal(store.completeHunter('pilot', first.attemptId, 'wrong-ace', 2_400), undefined);
    const result = store.completeHunter('pilot', first.attemptId, 'ace', 2_500);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result.firstClearCredits, 1_950);
    assert.equal(store.completeHunter('pilot', first.attemptId, 'ace', 2_600), undefined);
    assert.equal(store.progress('pilot', journeyDallas15.id).firstAttemptId, first.attemptId);
    const replay = store.launch('pilot', 'trainer', 3_000, journeyDallas15.id);
    store.approach('pilot', replay.attemptId);
    store.assignHunter('pilot', replay.attemptId, 'replay-ace', null, 3_100);
    assert.equal(store.completeHunter('pilot', replay.attemptId, 'ace', 3_200), undefined);
    assert.equal(store.completeHunter('pilot', replay.attemptId, 'replay-ace', 3_200)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 4_000, journeyDallas15.id);
    store.approach('capped', capped.attemptId);
    store.assignHunter('capped', capped.attemptId, 'capped-ace', null, 4_100);
    assert.equal(store.completeHunter('capped', capped.attemptId, 'capped-ace', 4_200)?.firstClearCredits, 50);
    assert.equal(database.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot'").get().credits, 1_950);
    assert.equal(database.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'capped'").get().credits, 1_000_000);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-15'").get().count, 2);
    database.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('boss damage requires the assigned active flight and cannot be forged by another pilot or attempt', () => {
  const valid = { shooterId: 'pilot', assignedPilotId: 'pilot', activeAttemptId: 'attempt', bossAttemptId: 'attempt',
    activeTargetId: 'ace', bossId: 'ace', attemptStatus: 'RACING', tookOffFromLove: true, runwayPreparation: false };
  assert.equal(aceDamageAuthorized(valid), true);
  for (const change of [
    { shooterId: 'other' }, { activeAttemptId: 'stale' }, { activeTargetId: 'wrong-bot' },
    { attemptStatus: 'COMPLETED' }, { tookOffFromLove: false }, { runwayPreparation: true },
  ]) assert.equal(aceDamageAuthorized({ ...valid, ...change }), false);
  assert.equal(missionFocusForAttempt({ missionId: journeyDallas15.id, status: 'RACING' })?.showAmbientAIAircraft, false);
});

test('Ace uses normal 25-damage projectiles and suppresses ordinary kill Credits', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(source, /const projectileDamage = 25;/);
  assert.equal(journeyDallas15.bossHealth / 25, 12);
  assert.match(source, /victim\.health = Math\.max\(0, victim\.health - projectileDamage\)/);
  assert.match(source, /victim\.bot\?\.journeyAce[\s\S]*?aceDamageAuthorized/);
  assert.match(source, /linkedAttempt\.missionId === journeyDallas15\.id[\s\S]*?journeyStore\.completeHunter/);
  assert.match(source, /const killReward = campaignTargetDefeat \? \{ \.\.\.baseKillReward, credits: 0 \}/);
  assert.match(source, /if \(victim\.bot\?\.journeyAttemptId\) removeBot\(victimId\)/);
});
