import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyGateCrossing, crossesJourneyGate } from '../../shared/journey-mission.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
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

test('Hunter Showdown airspace is centered on its DFW start', () => {
  const dfw = cityAirports.dallas.find(airport => airport.id === 'dfw')!;
  assert.deepEqual(journeyDallas02.arenaCenter, { x: dfw.x, z: dfw.z });
  assert.ok(Math.abs(dfw.x - journeyDallas02.arenaCenter.x) < journeyDallas02.arenaRadius - 5_000);
  assert.ok(Math.abs(dfw.z - journeyDallas02.arenaCenter.z) < journeyDallas02.arenaRadius - 5_000);
});

test('Hunter Showdown stays locked until Mission 1, binds one target, and pays only its first clear', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-hunter-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('hunter-pilot', 0, 0), ('other-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('hunter-pilot', 'trainer', 1_000, journeyDallas02.id), /locked/);
    const gateMission = store.launch('hunter-pilot', 'trainer', 1_000);
    store.approach('hunter-pilot', gateMission.attemptId);
    for (let gate = 0; gate < 4; gate += 1) store.acceptGate('hunter-pilot', gateMission.attemptId, gate, 2_000 + gate * 1_000);
    const first = store.launch('hunter-pilot', 'trainer', 10_000, journeyDallas02.id);
    assert.equal(first.status, 'READY');
    assert.equal(store.assignHunter('hunter-pilot', first.attemptId, 'bot:one'), undefined);
    store.approach('hunter-pilot', first.attemptId);
    assert.equal(store.assignHunter('hunter-pilot', first.attemptId, 'bot:one', null, 11_000)?.targetId, 'bot:one');
    assert.equal(store.assignHunter('hunter-pilot', first.attemptId, 'bot:two', null), undefined);
    assert.equal(store.completeHunter('other-pilot', first.attemptId, 'bot:one'), undefined);
    assert.equal(store.completeHunter('hunter-pilot', first.attemptId, 'bot:two'), undefined);
    assert.equal(store.assignHunter('hunter-pilot', first.attemptId, 'bot:two', 'bot:one', 12_000)?.targetId, 'bot:two');
    assert.equal(store.completeHunter('hunter-pilot', first.attemptId, 'bot:one'), undefined);
    assert.equal(store.completeHunter('hunter-pilot', first.attemptId, 'bot:two', 20_000)?.firstClearCredits, 350);
    assert.equal(store.completeHunter('hunter-pilot', first.attemptId, 'bot:two'), undefined);
    assert.equal(store.progress('hunter-pilot', journeyDallas02.id).firstAttemptId, first.attemptId);
    const replay = store.launch('hunter-pilot', 'trainer', 30_000, journeyDallas02.id);
    store.approach('hunter-pilot', replay.attemptId);
    store.assignHunter('hunter-pilot', replay.attemptId, 'bot:three');
    assert.equal(store.completeHunter('hunter-pilot', replay.attemptId, 'bot:three')?.firstClearCredits, 0);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'hunter-pilot'").get() as { credits: number }).credits, 600);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason = 'MISSION_REWARD'").get() as { count: number }).count, 2);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('White Rock uses the existing low course and rejects a high swept crossing without failing the attempt', () => {
  assert.equal(journeyDallas03.startAirportId, 'love');
  assert.equal(journeyDallas03.timeLimitMs, 64_000);
  assert.deepEqual(journeyDallas03.gates.map(gate => gate.maxAltitude), [290, 275, 290, 310]);
  for (let index = 0; index < 4; index += 1) {
    const gate = journeyDallas03.gates[index]!;
    const before = journeyDallas03.gates[Math.max(0, index - 1)]!;
    const after = journeyDallas03.gates[Math.min(3, index + 1)]!;
    const length = Math.hypot(after.x - before.x, after.z - before.z);
    const normalX = (after.x - before.x) / length;
    const normalZ = (after.z - before.z) / length;
    const segment = (altitude: number) => [
      { x: gate.x - normalX * 100, y: altitude, z: gate.z - normalZ * 100 },
      { x: gate.x + normalX * 100, y: altitude, z: gate.z + normalZ * 100 },
    ] as const;
    const [lowFrom, lowTo] = segment(gate.altitude);
    const [highFrom, highTo] = segment(gate.maxAltitude + 5);
    assert.equal(journeyGateCrossing(lowFrom, lowTo, index, 0, journeyDallas03), 'VALID');
    assert.equal(journeyGateCrossing(highFrom, highTo, index, 0, journeyDallas03), 'TOO_HIGH');
    assert.equal(journeyGateCrossing(lowTo, lowFrom, index, 0, journeyDallas03), false);
  }
});

test('White Rock unlocks after Hunter, starts its 64-second timer at Gate 1, and awards 450 Credits once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-white-rock-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('white-rock-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('white-rock-pilot', 'trainer', 1_000, journeyDallas03.id), /locked/);
    const first = store.launch('white-rock-pilot', 'trainer', 1_000);
    store.approach('white-rock-pilot', first.attemptId);
    for (let gate = 0; gate < 4; gate += 1) store.acceptGate('white-rock-pilot', first.attemptId, gate, 2_000 + gate * 1_000);
    assert.throws(() => store.launch('white-rock-pilot', 'trainer', 7_000, journeyDallas03.id), /locked/);
    const hunter = store.launch('white-rock-pilot', 'trainer', 8_000, journeyDallas02.id);
    store.approach('white-rock-pilot', hunter.attemptId);
    store.assignHunter('white-rock-pilot', hunter.attemptId, 'hunter:assigned');
    store.completeHunter('white-rock-pilot', hunter.attemptId, 'hunter:assigned', 9_000);

    const expired = store.launch('white-rock-pilot', 'trainer', 10_000, journeyDallas03.id);
    store.approach('white-rock-pilot', expired.attemptId);
    store.acceptGate('white-rock-pilot', expired.attemptId, 0, 11_000);
    assert.equal(store.acceptGate('white-rock-pilot', expired.attemptId, 1, 75_001), undefined);
    assert.equal(store.fail('white-rock-pilot', expired.attemptId, 'TIME_UP', 75_001)?.status, 'FAILED');
    assert.equal(store.progress('white-rock-pilot', journeyDallas03.id).completed, false);

    const attempt = store.launch('white-rock-pilot', 'trainer', 80_000, journeyDallas03.id);
    assert.equal(attempt.status, 'READY');
    assert.notEqual(attempt.attemptId, expired.attemptId);
    assert.equal(attempt.deadlineAt, null);
    assert.equal(store.approach('white-rock-pilot', attempt.attemptId)?.status, 'APPROACH');
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 1, 81_000), undefined);
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 0, 82_000)?.deadlineAt, 146_000);
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 0, 82_100), undefined);
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 3, 90_000), undefined);
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 1, 100_000)?.gateIndex, 2);
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 2, 118_000)?.gateIndex, 3);
    const result = store.acceptGate('white-rock-pilot', attempt.attemptId, 3, 130_000);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result.finishTimeMs, 48_000);
    assert.equal(result.firstClearCredits, 450);
    assert.equal(store.acceptGate('white-rock-pilot', attempt.attemptId, 3, 130_100), undefined);
    assert.equal(store.progress('white-rock-pilot', journeyDallas03.id).firstAttemptId, attempt.attemptId);
    assert.equal(new JourneyAttemptStore(path).progress('white-rock-pilot', journeyDallas03.id).completed, true);

    const replay = store.launch('white-rock-pilot', 'trainer', 150_000, journeyDallas03.id);
    store.approach('white-rock-pilot', replay.attemptId);
    for (let gate = 0; gate < 4; gate += 1) {
      const receipt = store.acceptGate('white-rock-pilot', replay.attemptId, gate, 151_000 + gate * 1_000);
      if (gate === 3) assert.equal(receipt?.firstClearCredits, 0);
    }
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'white-rock-pilot'").get() as { credits: number }).credits, 1050);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason = 'MISSION_REWARD'").get() as { count: number }).count, 3);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
