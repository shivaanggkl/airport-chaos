import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JourneyAttemptStore, JOURNEY_PAUSE_LIMIT_MS } from './journey-attempts.ts';
import { journeyDallas01, journeyDallas07 } from '../../shared/journey-mission.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'journey-cache-'));
  const path = join(dir, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0)");
  db.close();
  const store = new JourneyAttemptStore(path, true);
  t.after(() => { store.database.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, path };
}

test('active reads reuse immutable snapshots, keep ownership isolated, and bound idle entries', t => {
  const { store } = fixture(t), now = Date.now();
  const ready = store.launch('pilot', 'trainer', now, journeyDallas01.id);
  const snapshot = store.activeSnapshot('pilot', ready.attemptId);
  assert.ok(Object.isFrozen(snapshot));
  assert.notEqual(snapshot, ready);
  assert.throws(() => { snapshot.gateIndex = 9; }, TypeError);
  const original = store.database.prepare.bind(store.database);
  let selects = 0;
  store.database.prepare = sql => { if (sql.startsWith('SELECT * FROM journey_attempts')) selects++; return original(sql); };
  for (let i = 0; i < 1000; i++) assert.equal(store.activeSnapshot('pilot', ready.attemptId), snapshot);
  assert.equal(selects, 0);
  assert.equal(store.activeSnapshot('intruder', ready.attemptId), undefined);
  assert.equal(store.activeSnapshot('pilot', 'wrong-attempt'), undefined);
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).status, 'READY');
  for (let i = 0; i < 520; i++) {
    original('INSERT INTO player_profiles VALUES (?,0,0)').run(`pilot-${i}`);
    const attempt = store.launch(`pilot-${i}`, 'trainer', now, journeyDallas01.id);
    store.activeSnapshot(`pilot-${i}`, attempt.attemptId);
  }
  assert.equal(store.activeSnapshots.size, 512);
  store.expirePaused(Date.now() + 60_001);
  assert.equal(store.activeSnapshots.size, 0);
});

test('pause, resume, expiry, abandon and restart use durable state', t => {
  const { store, path } = fixture(t), now = Date.now();
  const ready = store.launch('pilot', 'trainer', now, journeyDallas01.id);
  store.approach('pilot', ready.attemptId, now + 100);
  const racing = store.startRookieRush('pilot', ready.attemptId, now + 200);
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).deadlineAt, racing.deadlineAt);
  store.pause('pilot', ready.attemptId, now + 300);
  assert.equal(store.activeSnapshots.size, 0);
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).pausedAt, now + 300);
  const resumed = store.resume('pilot', ready.attemptId, now + 1300);
  assert.equal(resumed.attempt.deadlineAt, racing.deadlineAt + 1000);
  const reopened = new JourneyAttemptStore(path, true);
  try { assert.deepEqual(reopened.activeSnapshot('pilot', ready.attemptId), store.activeSnapshot('pilot', ready.attemptId)); }
  finally { reopened.database.close(); }
  store.pause('pilot', ready.attemptId, now + 1400);
  store.expirePaused(now + 1400 + JOURNEY_PAUSE_LIMIT_MS);
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).status, 'FAILED');
  assert.equal(store.activeSnapshots.size, 0);
  const retry = store.launch('pilot', 'trainer', now + 1500, journeyDallas01.id);
  store.abandon('pilot', retry.attemptId, now + 1600);
  assert.equal(store.activeSnapshot('pilot', retry.attemptId).status, 'ABANDONED');
  assert.equal(store.activeSnapshots.size, 0);
});

test('combat damage refreshes cached health and persists across restart', t => {
  const { store, path } = fixture(t), now = Date.now();
  const ready = store.launch('pilot', 'fighter', now, journeyDallas07.id);
  store.approach('pilot', ready.attemptId, now + 100);
  store.startGiantIncoming('pilot', ready.attemptId, now + 200);
  const before = store.activeSnapshot('pilot', ready.attemptId);
  const hit = store.hitTransport('pilot', ready.attemptId, now + 300, 25);
  const after = store.activeSnapshot('pilot', ready.attemptId);
  assert.equal(after.monsterHealth, before.monsterHealth - 25);
  assert.equal(after.monsterHealth, hit.monsterHealth);
  assert.notEqual(after, before);
  assert.equal(store.hitTransport('pilot', ready.attemptId, now + 400, -1), undefined);
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).monsterHealth, after.monsterHealth);
  const reopened = new JourneyAttemptStore(path, true);
  try { assert.deepEqual(reopened.activeSnapshot('pilot', ready.attemptId), after); }
  finally { reopened.database.close(); }
});

test('gate transactions invalidate snapshots on commit and rollback; rewards remain exactly once', t => {
  const { store, path } = fixture(t), now = Date.now();
  const ready = store.launch('pilot', 'trainer', now, journeyDallas01.id);
  store.approach('pilot', ready.attemptId, now + 100);
  store.startRookieRush('pilot', ready.attemptId, now + 200);
  store.database.exec("CREATE TRIGGER abort_gate BEFORE UPDATE OF rookie_gate_index ON journey_attempts BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  assert.throws(() => store.acceptGate('pilot', ready.attemptId, 0, now + 1000), /test rollback/);
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).gateIndex, 0);
  store.database.exec('DROP TRIGGER abort_gate');
  for (let gate = 0; gate < 10; gate++) {
    const current = store.acceptGate('pilot', ready.attemptId, gate, now + 2000 + gate * 500);
    assert.equal(store.activeSnapshot('pilot', ready.attemptId).gateIndex, gate + 1);
    assert.equal(current.gateIndex, gate + 1);
  }
  assert.equal(store.activeSnapshot('pilot', ready.attemptId).status, 'COMPLETED');
  assert.equal(store.activeSnapshots.size, 0);
  assert.equal(store.acceptGate('pilot', ready.attemptId, 9, now + 10000), undefined);
  const reopened = new JourneyAttemptStore(path, true);
  try {
    assert.equal(reopened.get('pilot', ready.attemptId).firstClearCredits, 250);
    assert.equal(reopened.database.prepare('SELECT credits FROM player_profiles WHERE pilot_id=?').get('pilot').credits, 250);
  } finally { reopened.database.close(); }
});
