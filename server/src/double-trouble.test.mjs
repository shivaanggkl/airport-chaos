import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas22, journeyDallas23 } from '../../shared/journey-mission.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-double-trouble-'));
  const path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999950,0),('other',0,0)");
  db.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}

function finish(store, pilot, now, suffix) {
  const attempt = store.launch(pilot, 'trainer', now, journeyDallas23.id);
  assert.equal(attempt.doublePhase, 'TAKEOFF');
  assert.equal(attempt.targetId, null);
  assert.equal(store.approach(pilot, attempt.attemptId)?.status, 'APPROACH');
  assert.equal(store.assignDoubleHunter(pilot, attempt.attemptId, `${suffix}-h2`, 2, now + 1), undefined);
  assert.equal(store.assignDoubleHunter(pilot, attempt.attemptId, `${suffix}-h1`, 1, now + 1)?.doublePhase, 'FIRST_FIGHT');
  assert.equal(store.assignDoubleHunter(pilot, attempt.attemptId, 'duplicate', 1), undefined);
  assert.equal(store.defeatDoubleFirst('other', attempt.attemptId, `${suffix}-h1`, {x:0,y:700,z:0}), undefined);
  assert.equal(store.defeatDoubleFirst(pilot, attempt.attemptId, 'wrong', {x:0,y:700,z:0}), undefined);
  assert.equal(store.collectDoubleHeart(pilot, attempt.attemptId, journeyDallas23.heartId), undefined);
  assert.equal(store.defeatDoubleFirst(pilot, attempt.attemptId, `${suffix}-h1`, {x:-5500,y:700,z:-12000})?.doublePhase, 'REPAIR');
  assert.equal(store.defeatDoubleFirst(pilot, attempt.attemptId, `${suffix}-h1`, {x:0,y:700,z:0}), undefined);
  assert.equal(store.assignDoubleHunter(pilot, attempt.attemptId, `${suffix}-h2`, 2), undefined);
  assert.equal(store.collectDoubleHeart(pilot, attempt.attemptId, 'wrong-heart'), undefined);
  assert.equal(store.collectDoubleHeart('other', attempt.attemptId, journeyDallas23.heartId), undefined);
  assert.equal(store.collectDoubleHeart(pilot, attempt.attemptId, journeyDallas23.heartId, now + 3)?.doublePhase, 'FINAL_FIGHT');
  assert.equal(store.collectDoubleHeart(pilot, attempt.attemptId, journeyDallas23.heartId), undefined);
  assert.equal(store.assignDoubleHunter(pilot, attempt.attemptId, `${suffix}-h2`, 2, now + 4)?.secondaryTargetId, `${suffix}-h2`);
  assert.equal(store.assignDoubleHunter(pilot, attempt.attemptId, 'duplicate', 2), undefined);
  assert.equal(store.defeatDoubleSecond(pilot, attempt.attemptId, `${suffix}-h1`), undefined);
  assert.equal(store.defeatDoubleSecond('other', attempt.attemptId, `${suffix}-h2`), undefined);
  return { attempt, completed: store.defeatDoubleSecond(pilot, attempt.attemptId, `${suffix}-h2`, now + 5) };
}

test('Mission 23 requires Mission 22 and enforces Hunter 1, mandatory Heart, then Hunter 2', () => {
  const { directory, path, store } = fixture();
  try {
    assert.equal(journeyDallas23.hunterHealth, 200);
    assert.equal(journeyDallas23.hunterHealth / 25, 8);
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas23.id), /locked/);
    const db = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
      .run(pilot, journeyDallas22.id, `m22-${pilot}`, 500);
    const first = finish(store, 'pilot', 2_000, 'first');
    assert.equal(first.completed?.status, 'COMPLETED');
    assert.equal(first.completed?.firstClearCredits, 3_150);
    assert.equal(store.defeatDoubleSecond('pilot', first.attempt.attemptId, 'first-h2'), undefined);
    assert.equal(store.progress('pilot', journeyDallas23.id).firstAttemptId, first.attempt.attemptId);
    assert.equal(finish(store, 'pilot', 3_000, 'replay').completed?.firstClearCredits, 0);
    assert.equal(finish(store, 'capped', 4_000, 'cap').completed?.firstClearCredits, 50);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 3_150);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get().credits, 1_000_000);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id='journey-dallas-23'").get().count, 2);
    db.close();
  } finally { rmSync(directory, {recursive:true,force:true}); }
});

test('Mission 23 failed and abandoned attempts cannot progress; Focus Mode isolates ambient AI', () => {
  const { directory, path, store } = fixture();
  try {
    const db = new DatabaseSync(path);
    db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
      .run('pilot', journeyDallas22.id, 'm22', 500);
    db.close();
    const attempt = store.launch('pilot', 'trainer', 2_000, journeyDallas23.id);
    store.approach('pilot', attempt.attemptId);
    assert.equal(store.fail('pilot', attempt.attemptId, 'CRASHED')?.status, 'FAILED');
    assert.equal(store.assignDoubleHunter('pilot', attempt.attemptId, 'stale', 1), undefined);
    const retry = store.launch('pilot', 'trainer', 3_000, journeyDallas23.id);
    store.approach('pilot', retry.attemptId);
    assert.equal(store.defeatDoubleFirst('pilot', attempt.attemptId, 'stale', {x:0,y:700,z:0}), undefined);
    assert.equal(store.abandon('pilot', retry.attemptId)?.status, 'ABANDONED');
    assert.equal(store.assignDoubleHunter('pilot', retry.attemptId, 'stale', 1), undefined);
    assert.equal(missionFocusForAttempt({missionId:journeyDallas23.id,status:'RACING'})?.showAmbientAIAircraft, false);
  } finally { rmSync(directory, {recursive:true,force:true}); }
});

test('Mission 23 hit, repair, and kill credit hooks use existing authoritative server paths', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(source, /victim\.health = Math\.max\(0, victim\.health - projectileDamage\)/);
  assert.match(source, /victim\.bot\.journeyDoubleOrdinal === 1[\s\S]*?active\.doublePhase !== 'FIRST_FIGHT'/);
  assert.match(source, /journeyStore\.defeatDoubleFirst[\s\S]*?journeyStore\.defeatDoubleSecond/);
  assert.match(source, /active\.secondaryTargetId === victimId && active\.doublePhase === 'FINAL_FIGHT'\) sendJourneyState/);
  assert.match(source, /if \(!swept \|\| recoveryAttempt\.doublePhase !== 'REPAIR'/);
  assert.match(source, /const killReward = campaignTargetDefeat \? \{ \.\.\.baseKillReward, credits: 0 \}/);
  assert.match(source, /bot\.journeyAce \|\| bot\.journeyDoubleOrdinal \? journeyAceCruiseFactor/);
});
