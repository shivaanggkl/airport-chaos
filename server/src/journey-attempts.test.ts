import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas01, crossesJourneyGate } from '../../shared/journey-mission.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

test('DFW gate crossing requires ordered forward travel through the actual opening', () => {
  const gate = journeyDallas01.gates[0]!;
  const before = { x: gate.x - 100, y: 380, z: gate.z - 100 };
  const after = { x: gate.x + 100, y: 380, z: gate.z + 100 };
  assert.equal(crossesJourneyGate(before, after, 0, 0), true);
  assert.equal(crossesJourneyGate(after, before, 0, 0), false);
  assert.equal(crossesJourneyGate({ ...before, y: 700 }, { ...after, y: 700 }, 0, 0), false);
});

test('Journey begins at Gate 1, pays first clear once, and keeps replay eligibility', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot-one', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const first = store.launch('pilot-one', 'trainer', 1_000);
    assert.equal(first.status, 'READY');
    assert.equal(store.approach('pilot-one', first.attemptId)?.status, 'APPROACH');
    assert.equal(store.get('pilot-one', first.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 1, 2_000), undefined);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 0, 2_000)?.deadlineAt, 64_000);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 0, 2_500), undefined);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 1, 20_000)?.gateIndex, 2);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 2, 40_000)?.gateIndex, 3);
    const result = store.acceptGate('pilot-one', first.attemptId, 3, 50_000);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.finishTimeMs, 48_000);
    assert.equal(result?.firstClearCredits, 250);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 3, 50_100), undefined);
    assert.equal(store.progress('pilot-one').completed, true);
    assert.equal(store.progress('pilot-one').firstAttemptId, first.attemptId);
    const replay = store.launch('pilot-one', 'trainer', 100_000);
    store.approach('pilot-one', replay.attemptId);
    store.acceptGate('pilot-one', replay.attemptId, 0, 101_000);
    store.acceptGate('pilot-one', replay.attemptId, 1, 102_000);
    store.acceptGate('pilot-one', replay.attemptId, 2, 103_000);
    assert.equal(store.acceptGate('pilot-one', replay.attemptId, 3, 104_000)?.firstClearCredits, 0);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'pilot-one'").get() as { credits: number }).credits, 250);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason = 'MISSION_REWARD'").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('timeout and retry never complete or credit a failed attempt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot-two', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const first = store.launch('pilot-two', 'trainer', 1_000);
    store.approach('pilot-two', first.attemptId);
    store.acceptGate('pilot-two', first.attemptId, 0, 2_000);
    assert.equal(store.acceptGate('pilot-two', first.attemptId, 1, 64_001), undefined);
    assert.equal(store.fail('pilot-two', first.attemptId, 'TIME_UP', 64_001)?.status, 'FAILED');
    assert.equal(store.progress('pilot-two').completed, false);
    const retry = store.launch('pilot-two', 'trainer', 65_000);
    assert.equal(retry.gateIndex, 0);
    assert.equal(retry.deadlineAt, null);
    assert.equal(store.get('pilot-two', first.attemptId)?.status, 'FAILED');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('attempts are pilot-bound and a replacement cannot advance the old attempt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot-one', 0, 0), ('pilot-two', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const first = store.launch('pilot-one', 'trainer');
    assert.equal(store.get('pilot-two', first.attemptId), undefined);
    assert.equal(store.approach('pilot-two', first.attemptId), undefined);
    const replacement = store.launch('pilot-one', 'trainer');
    assert.equal(store.get('pilot-one', first.attemptId)?.status, 'ABANDONED');
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 0), undefined);
    assert.equal(store.approach('pilot-one', replacement.attemptId)?.status, 'APPROACH');
    assert.equal(store.progress('pilot-one').completed, false);
    assert.equal(store.progress('pilot-two').completed, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('first-clear receipt reports only Credits actually added at the wallet cap', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot-cap', 999900, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const current = store.launch('pilot-cap', 'trainer', 1_000);
    store.approach('pilot-cap', current.attemptId);
    for (let gate = 0; gate < 4; gate += 1) {
      const receipt = store.acceptGate('pilot-cap', current.attemptId, gate, 2_000 + gate * 1_000);
      if (gate === 3) assert.equal(receipt?.firstClearCredits, 100);
    }
    assert.equal(store.progress('pilot-cap').completed, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
