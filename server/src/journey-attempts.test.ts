import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyGateCrossing, crossesJourneyGate } from '../../shared/journey-mission.mjs';
import { downtownPrecisionGates, lasColinasFlybyGates, addisonClimbGates } from '../../shared/city-challenges.mjs';

test('Claim the Skies requires Mission 3, resets on exit, pauses on contest, and credits first clear once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-territory-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('territory-pilot', 0, 0), ('other-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('territory-pilot', 'trainer', 1_000, journeyDallas04.id), /locked/);
    const fixture = new DatabaseSync(path);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('territory-pilot', journeyDallas03.id, 'qa-prerequisite', 500, 60_000);
    fixture.close();
    const first = store.launch('territory-pilot', 'trainer', 1_000, journeyDallas04.id);
    store.approach('territory-pilot', first.attemptId);
    assert.equal(store.updateTerritoryHold('other-pilot', first.attemptId, 'OWNED', 1_400), undefined);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'CAPTURING', 1_400)?.holdMs, 0);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 1_800)?.status, 'RACING');
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 2_200)?.holdMs, 400);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'CONTESTED', 2_600)?.holdMs, 400);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 10_000)?.holdMs, 400);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'CAPTURING', 10_200)?.status, 'APPROACH');
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 10_300)?.holdMs, 0);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OUTSIDE', 10_400)?.holdMs, 0);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 10_800)?.holdMs, 0);
    let result;
    for (let index = 1; index <= 75; index += 1) result = store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 10_800 + index * 400);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.firstClearCredits, 500);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 41_200), undefined);
    assert.equal(store.progress('territory-pilot', journeyDallas04.id).firstAttemptId, first.attemptId);
    const replay = store.launch('territory-pilot', 'trainer', 50_000, journeyDallas04.id);
    store.approach('territory-pilot', replay.attemptId);
    store.updateTerritoryHold('territory-pilot', replay.attemptId, 'OWNED', 50_400);
    assert.equal(store.updateTerritoryHold('territory-pilot', first.attemptId, 'OWNED', 50_800), undefined);
    for (let index = 1; index <= 75; index += 1) result = store.updateTerritoryHold('territory-pilot', replay.attemptId, 'OWNED', 50_400 + index * 400);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.firstClearCredits, 0);
    assert.equal(new JourneyAttemptStore(path).progress('territory-pilot', journeyDallas04.id).completed, true);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'territory-pilot'").get() as { credits: number }).credits, 500);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-04'").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
import { cityAirports } from '../../shared/city-airports.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

test('Sky Elevator reuses the unchanged Addison climb opening and requires forward crossings', () => {
  assert.equal(journeyDallas07.startAirportId, 'addison');
  assert.equal(journeyDallas07.timeLimitMs, 66_000);
  assert.equal(journeyDallas07.firstClearCredits, 850);
  assert.deepEqual(journeyDallas07.gates, addisonClimbGates);
  assert.deepEqual(journeyDallas07.gates.map(gate => gate.altitude), [310, 680, 1080, 1460]);
  const airport = cityAirports.dallas.find(item => item.id === 'addison')!;
  assert.equal(airport.x, -3700);
  assert.equal(airport.z, -21100);
  for (let index = 0; index < journeyDallas07.gates.length; index += 1) {
    const gate = journeyDallas07.gates[index]!;
    const prior = journeyDallas07.gates[Math.max(0, index - 1)]!;
    const next = journeyDallas07.gates[Math.min(3, index + 1)]!;
    const length = Math.hypot(next.x - prior.x, next.z - prior.z);
    const normalX = (next.x - prior.x) / length;
    const normalZ = (next.z - prior.z) / length;
    const before = { x: gate.x - normalX * 80, y: gate.altitude, z: gate.z - normalZ * 80 };
    const after = { x: gate.x + normalX * 80, y: gate.altitude, z: gate.z + normalZ * 80 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas07), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas07), false);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + gate.radius }, { ...after, y: gate.altitude + gate.radius }, index, 0, journeyDallas07), false);
  }
});

test('Sky Elevator unlock, deadline, retry, completion, ledger and replay are authoritative', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-elevator-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('elevator', 0, 0), ('other', 0, 0), ('capped', 999950, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('elevator', 'trainer', 1_000, journeyDallas07.id), /locked/);
    const fixture = new DatabaseSync(path);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('elevator', journeyDallas06.id, 'championship-clear', 500, 90_000);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('capped', journeyDallas06.id, 'capped-championship-clear', 500, 90_000);
    fixture.close();
    const expired = store.launch('elevator', 'trainer', 1_000, journeyDallas07.id);
    assert.equal(store.approach('elevator', expired.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('other', expired.attemptId, 0, 1_500), undefined);
    assert.equal(store.acceptGate('elevator', expired.attemptId, 1, 1_500), undefined);
    assert.equal(store.acceptGate('elevator', expired.attemptId, 0, 2_000)?.deadlineAt, 68_000);
    assert.equal(store.acceptGate('elevator', expired.attemptId, 1, 68_001), undefined);
    assert.equal(store.fail('elevator', expired.attemptId, 'TIME_UP', 68_001)?.status, 'FAILED');
    assert.equal(store.progress('elevator', journeyDallas07.id).completed, false);
    const first = store.launch('elevator', 'trainer', 70_000, journeyDallas07.id);
    store.approach('elevator', first.attemptId);
    assert.equal(store.acceptGate('elevator', first.attemptId, 0, 71_000)?.gateIndex, 1);
    assert.equal(store.acceptGate('elevator', first.attemptId, 2, 80_000), undefined);
    assert.equal(store.acceptGate('elevator', first.attemptId, 1, 90_000)?.gateIndex, 2);
    assert.equal(store.acceptGate('elevator', first.attemptId, 2, 110_000)?.gateIndex, 3);
    const result = store.acceptGate('elevator', first.attemptId, 3, 130_000);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.finishTimeMs, 59_000);
    assert.equal(result?.firstClearCredits, 850);
    assert.equal(store.acceptGate('elevator', first.attemptId, 3, 130_100), undefined);
    assert.equal(store.progress('elevator', journeyDallas07.id).completed, true);
    const replay = store.launch('elevator', 'trainer', 200_000, journeyDallas07.id);
    store.approach('elevator', replay.attemptId);
    for (let index = 0; index < 4; index += 1)
      assert.equal(store.acceptGate('elevator', replay.attemptId, index, 201_000 + index * 10_000)?.gateIndex, index + 1);
    assert.equal(store.get('elevator', replay.attemptId)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 300_000, journeyDallas07.id);
    store.approach('capped', capped.attemptId);
    for (let index = 0; index < 4; index += 1)
      assert.equal(store.acceptGate('capped', capped.attemptId, index, 301_000 + index * 10_000)?.gateIndex, index + 1);
    assert.equal(store.get('capped', capped.attemptId)?.firstClearCredits, 50);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'elevator'").get() as { credits: number }).credits, 850);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id = 'elevator' AND reference_id = 'journey-dallas-07'").get() as { count: number }).count, 1);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'capped'").get() as { credits: number }).credits, 1_000_000);
    assert.equal((check.prepare("SELECT amount FROM wallet_transactions WHERE pilot_id = 'capped' AND reference_id = 'journey-dallas-07'").get() as { amount: number }).amount, 50);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

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

test('White Rock accepts either ring face but keeps its altitude and opening limits', () => {
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
    assert.equal(journeyGateCrossing(lowTo, lowFrom, index, 0, journeyDallas03), 'VALID');
    assert.equal(journeyGateCrossing(highFrom, highTo, index, 0, journeyDallas03), 'TOO_HIGH');
    assert.equal(journeyGateCrossing(highTo, highFrom, index, 0, journeyDallas03), 'TOO_HIGH');
    const outside = { x: -normalZ * gate.radius * 2, z: normalX * gate.radius * 2 };
    assert.equal(journeyGateCrossing(
      { x: lowTo.x + outside.x, y: lowTo.y, z: lowTo.z + outside.z },
      { x: lowFrom.x + outside.x, y: lowFrom.y, z: lowFrom.z + outside.z },
      index, 0, journeyDallas03,
    ), false);
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

test('Downtown Needle shares the existing narrow course and accepts only the real forward opening', () => {
  assert.equal(journeyDallas05.startAirportId, 'love');
  assert.equal(journeyDallas05.timeLimitMs, 72_000);
  assert.deepEqual(journeyDallas05.gates, downtownPrecisionGates);
  assert.deepEqual(journeyDallas05.gates.map(gate => gate.radius), [42, 38, 38, 42]);
  for (let index = 0; index < 4; index += 1) {
    const gate = journeyDallas05.gates[index]!;
    const previous = journeyDallas05.gates[Math.max(0, index - 1)]!;
    const next = journeyDallas05.gates[Math.min(3, index + 1)]!;
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    const nx = (next.x - previous.x) / length;
    const nz = (next.z - previous.z) / length;
    const before = { x: gate.x - nx * 50, y: gate.altitude, z: gate.z - nz * 50 };
    const after = { x: gate.x + nx * 50, y: gate.altitude, z: gate.z + nz * 50 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas05), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas05), false);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + gate.radius }, { ...after, y: gate.altitude + gate.radius }, index, 0, journeyDallas05), false);
    const offset = gate.radius;
    assert.equal(journeyGateCrossing(
      { ...before, x: before.x - nz * offset, z: before.z + nx * offset },
      { ...after, x: after.x - nz * offset, z: after.z + nx * offset }, index, 0, journeyDallas05,
    ), false);
  }
});

test('Downtown Needle needs Mission 4 and credits exactly 600 once across retry and replay', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-downtown-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('downtown-pilot', 0, 0), ('other-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('downtown-pilot', 'trainer', 1_000, journeyDallas05.id), /locked/);
    const fixture = new DatabaseSync(path);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('downtown-pilot', journeyDallas04.id, 'qa-prerequisite', 500, 30_000);
    fixture.close();
    const expired = store.launch('downtown-pilot', 'trainer', 2_000, journeyDallas05.id);
    assert.equal(expired.status, 'READY');
    store.approach('downtown-pilot', expired.attemptId);
    assert.equal(store.get('downtown-pilot', expired.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('other-pilot', expired.attemptId, 0, 3_000), undefined);
    assert.equal(store.acceptGate('downtown-pilot', expired.attemptId, 1, 3_000), undefined);
    assert.equal(store.acceptGate('downtown-pilot', expired.attemptId, 0, 3_000)?.deadlineAt, 75_000);
    assert.equal(store.acceptGate('downtown-pilot', expired.attemptId, 3, 4_000), undefined);
    assert.equal(store.acceptGate('downtown-pilot', expired.attemptId, 0, 4_000), undefined);
    assert.equal(store.acceptGate('downtown-pilot', expired.attemptId, 1, 75_001), undefined);
    assert.equal(store.fail('downtown-pilot', expired.attemptId, 'TIME_UP', 75_001)?.status, 'FAILED');
    const attempt = store.launch('downtown-pilot', 'trainer', 80_000, journeyDallas05.id);
    assert.equal(attempt.gateIndex, 0);
    assert.equal(attempt.deadlineAt, null);
    store.approach('downtown-pilot', attempt.attemptId);
    for (let gate = 0; gate < 4; gate += 1) {
      const result = store.acceptGate('downtown-pilot', attempt.attemptId, gate, 81_000 + gate * 10_000);
      assert.equal(result?.gateIndex, gate + 1);
      if (gate === 3) {
        assert.equal(result?.status, 'COMPLETED');
        assert.equal(result?.finishTimeMs, 30_000);
        assert.equal(result?.firstClearCredits, 600);
      }
    }
    assert.equal(store.acceptGate('downtown-pilot', attempt.attemptId, 3, 111_100), undefined);
    assert.equal(new JourneyAttemptStore(path).progress('downtown-pilot', journeyDallas05.id).firstAttemptId, attempt.attemptId);
    const replay = store.launch('downtown-pilot', 'trainer', 120_000, journeyDallas05.id);
    store.approach('downtown-pilot', replay.attemptId);
    assert.equal(store.acceptGate('downtown-pilot', attempt.attemptId, 0, 121_000), undefined);
    for (let gate = 0; gate < 4; gate += 1) {
      const result = store.acceptGate('downtown-pilot', replay.attemptId, gate, 121_000 + gate * 10_000);
      if (gate === 3) assert.equal(result?.firstClearCredits, 0);
    }
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'downtown-pilot'").get() as { credits: number }).credits, 600);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-05'").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Rookie Championship uses six ordered real openings and leaves landing after Gate 6', () => {
  assert.equal(journeyDallas06.gates.length, 6);
  assert.deepEqual(journeyDallas06.gates.slice(0, 3), lasColinasFlybyGates.slice().reverse());
  assert.equal(journeyDallas06.startAirportId, 'love');
  assert.equal(journeyDallas06.finishAirportId, 'dfw');
  assert.equal(journeyDallas06.timeLimitMs, 120_000);
  for (let index = 0; index < journeyDallas06.gates.length; index += 1) {
    const gate = journeyDallas06.gates[index]!;
    const previous = journeyDallas06.gates[Math.max(0, index - 1)]!;
    const next = journeyDallas06.gates[Math.min(5, index + 1)]!;
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    const nx = (next.x - previous.x) / length;
    const nz = (next.z - previous.z) / length;
    const before = { x: gate.x - nx * 80, y: gate.altitude, z: gate.z - nz * 80 };
    const after = { x: gate.x + nx * 80, y: gate.altitude, z: gate.z + nz * 80 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas06), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas06), false);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + gate.radius }, { ...after, y: gate.altitude + gate.radius }, index, 0, journeyDallas06), false);
  }
});

test('Rookie Championship requires Mission 5, a qualifying DFW landing, and awards 750 once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-championship-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('champion', 0, 0), ('other', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('champion', 'trainer', 1_000, journeyDallas06.id), /locked/);
    const fixture = new DatabaseSync(path);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('champion', journeyDallas05.id, 'qa-prerequisite', 500, 60_000);
    fixture.close();
    const expired = store.launch('champion', 'trainer', 600, journeyDallas06.id);
    store.approach('champion', expired.attemptId);
    assert.equal(store.acceptGate('champion', expired.attemptId, 0, 700)?.deadlineAt, 120_700);
    assert.equal(store.acceptGate('champion', expired.attemptId, 1, 120_701), undefined);
    assert.equal(store.fail('champion', expired.attemptId, 'TIME_UP', 120_701)?.status, 'FAILED');
    const first = store.launch('champion', 'trainer', 1_000, journeyDallas06.id);
    assert.equal(first.phase, 'PREPARING');
    assert.equal(first.gateIndex, 0);
    assert.equal(first.deadlineAt, null);
    assert.equal(store.completeChampionshipLanding('champion', first.attemptId, 'dfw', 950, 1_500), undefined);
    assert.equal(store.approach('champion', first.attemptId)?.phase, 'APPROACH_GATES');
    assert.equal(store.acceptGate('other', first.attemptId, 0, 2_000), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 1, 2_000), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 0, 2_000)?.deadlineAt, 122_000);
    assert.equal(store.acceptGate('champion', first.attemptId, 0, 2_100), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 5, 2_500), undefined);
    for (let index = 1; index < 6; index += 1) {
      const result = store.acceptGate('champion', first.attemptId, index, 2_000 + index * 10_000);
      assert.equal(result?.gateIndex, index + 1);
      if (index === 4) assert.equal(store.completeChampionshipLanding('champion', first.attemptId, 'dfw', 950, 50_100), undefined);
    }
    const landingPhase = store.get('champion', first.attemptId)!;
    assert.equal(landingPhase.phase, 'LANDING');
    assert.equal(landingPhase.status, 'RACING');
    assert.equal(landingPhase.deadlineAt, null);
    assert.equal(landingPhase.finishTimeMs, 50_000);
    assert.equal(store.acceptGate('champion', first.attemptId, 5, 53_000), undefined);
    assert.equal(store.progress('champion', journeyDallas06.id).completed, false);
    assert.equal(store.completeChampionshipLanding('other', first.attemptId, 'dfw', 950, 60_000), undefined);
    assert.equal(store.completeChampionshipLanding('champion', first.attemptId, 'dfw', 0, 60_000), undefined);
    assert.equal(store.completeChampionshipLanding('champion', first.attemptId, 'dfw', 649, 60_000)?.failureReason, 'LANDING_TOO_ROUGH');
    assert.equal(store.progress('champion', journeyDallas06.id).completed, false);
    const wrongAirport = store.launch('champion', 'trainer', 60_100, journeyDallas06.id);
    store.approach('champion', wrongAirport.attemptId);
    for (let index = 0; index < 6; index += 1) store.acceptGate('champion', wrongAirport.attemptId, index, 61_000 + index * 1_000);
    assert.equal(store.completeChampionshipLanding('champion', wrongAirport.attemptId, 'love', 950, 68_000)?.failureReason, 'WRONG_AIRPORT');
    assert.equal(store.progress('champion', journeyDallas06.id).completed, false);
    const retry = store.launch('champion', 'trainer', 70_000, journeyDallas06.id);
    store.approach('champion', retry.attemptId);
    assert.equal(store.acceptGate('champion', first.attemptId, 0, 71_000), undefined);
    for (let index = 0; index < 6; index += 1) store.acceptGate('champion', retry.attemptId, index, 71_000 + index * 10_000);
    const complete = store.completeChampionshipLanding('champion', retry.attemptId, 'dfw', 650, 150_000);
    assert.equal(complete?.status, 'COMPLETED');
    assert.equal(complete?.landingGrade, 'SMOOTH');
    assert.equal(complete?.firstClearCredits, 750);
    assert.equal(store.completeChampionshipLanding('champion', retry.attemptId, 'dfw', 950, 151_000), undefined);
    assert.equal(new JourneyAttemptStore(path).progress('champion', journeyDallas06.id).firstAttemptId, retry.attemptId);
    const replay = store.launch('champion', 'trainer', 160_000, journeyDallas06.id);
    store.approach('champion', replay.attemptId);
    for (let index = 0; index < 6; index += 1) store.acceptGate('champion', replay.attemptId, index, 161_000 + index * 10_000);
    assert.equal(store.completeChampionshipLanding('champion', replay.attemptId, 'dfw', 940, 240_000)?.firstClearCredits, 0);
    const crashed = store.launch('champion', 'trainer', 250_000, journeyDallas06.id);
    store.approach('champion', crashed.attemptId);
    store.acceptGate('champion', crashed.attemptId, 0, 251_000);
    assert.equal(store.fail('champion', crashed.attemptId, 'CRASHED', 251_500)?.failureReason, 'CRASHED');
    assert.equal(store.completeChampionshipLanding('champion', crashed.attemptId, 'dfw', 950, 252_000), undefined);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'champion'").get() as { credits: number }).credits, 750);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-06' AND amount = 750").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
