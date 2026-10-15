import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyGateCrossing, crossesJourneyGate } from '../../shared/journey-mission.mjs';
import { addisonClimbGates } from '../../shared/city-challenges.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';

test('Downtown Slalom requires Mission 3 and rewards ten ordered race gates once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-slalom-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('slalom-pilot', 0, 0), ('other-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('slalom-pilot', 'trainer', 1_000, journeyDallas04.id), /locked/);
    const fixture = new DatabaseSync(path);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('slalom-pilot', journeyDallas03.id, 'qa-prerequisite', 500, 60_000);
    fixture.close();
    const first = store.launch('slalom-pilot', 'trainer', 1_000, journeyDallas04.id);
    assert.equal(first.gateIndex, 0);
    assert.equal(first.slalomGateIndex, 0);
    store.approach('slalom-pilot', first.attemptId, 1_100);
    assert.equal(store.acceptGate('slalom-pilot', first.attemptId, 0, 1_200), undefined);
    assert.equal(store.startRookieRush('other-pilot', first.attemptId, 1_300), undefined);
    assert.equal(store.startRookieRush('slalom-pilot', first.attemptId, 1_300)?.deadlineAt, 161_300);
    assert.equal(store.acceptGate('slalom-pilot', first.attemptId, 1, 2_000), undefined);
    assert.equal(store.acceptGate('other-pilot', first.attemptId, 0, 2_000), undefined);
    assert.equal(store.acceptGate('slalom-pilot', first.attemptId, 0, 2_000)?.gateIndex, 1);
    assert.equal(store.acceptGate('slalom-pilot', first.attemptId, 0, 2_400), undefined);
    let result = store.get('slalom-pilot', first.attemptId);
    for (let index = 1; index < 10; index += 1) result = store.acceptGate('slalom-pilot', first.attemptId, index, 2_000 + index * 9_000);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.gateIndex, 10);
    assert.equal(result?.firstClearCredits, 500);
    assert.equal(store.acceptGate('slalom-pilot', first.attemptId, 9, 100_000), undefined);
    assert.equal(store.progress('slalom-pilot', journeyDallas04.id).firstAttemptId, first.attemptId);
    const replay = store.launch('slalom-pilot', 'trainer', 100_000, journeyDallas04.id);
    store.approach('slalom-pilot', replay.attemptId, 100_100);
    store.startRookieRush('slalom-pilot', replay.attemptId, 100_200);
    for (let index = 0; index < 10; index += 1) result = store.acceptGate('slalom-pilot', replay.attemptId, index, 101_000 + index * 9_000);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.firstClearCredits, 0);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'slalom-pilot'").get() as { credits: number }).credits, 500);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-04'").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Giant Incoming owns its deadline, damage, first-clear ledger and historical unlocks', () => {
  assert.equal(journeyDallas07.name,'GIANT INCOMING');assert.ok(journeyDallas07.timeLimitMs>150000);assert.equal(journeyDallas07.startAirportId,'dfw');assert.equal(journeyDallas07.firstClearCredits,850);assert.equal(journeyDallas07.gates.length,0);
  const directory=mkdtempSync(join(tmpdir(),'giant-journey-')),path=join(directory,'profiles.sqlite');
  const db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0),('other',0,0)");db.close();
  try{const store=new JourneyAttemptStore(path);assert.throws(()=>store.launch('pilot','trainer',1000,journeyDallas07.id),/locked/);
    const fixture=new DatabaseSync(path);fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run('pilot',journeyDallas06.id,'prior',0,90000);fixture.close();
    const a=store.launch('pilot','trainer',1000,journeyDallas07.id);store.approach('pilot',a.attemptId,1100);assert.equal(store.get('pilot',a.attemptId)?.monsterHealth,2000);
    assert.equal(store.hitTransport('pilot',a.attemptId,1200),undefined);assert.equal(store.startGiantIncoming('other',a.attemptId,1200),undefined);
    assert.equal(store.acceptGate('pilot',a.attemptId,0,1200),undefined);
    assert.equal(store.startGiantIncoming('pilot',a.attemptId,2000)?.deadlineAt,2000+journeyDallas07.timeLimitMs);assert.equal(store.startGiantIncoming('pilot',a.attemptId,2001),undefined);
    assert.equal(store.hitMonster('pilot',a.attemptId,2200),undefined);assert.equal(store.hitTransport('other',a.attemptId,2200),undefined);assert.equal(store.hitTransport('pilot',a.attemptId,2000+journeyDallas07.timeLimitMs),undefined);
    for(let i=0;i<80;i++)store.hitTransport('pilot',a.attemptId,3000+i*1000);
    const result=store.get('pilot',a.attemptId)!;assert.equal(result.status,'COMPLETED');assert.equal(result.firstClearCredits,850);assert.equal(result.finishTimeMs,80000);assert.equal(store.hitTransport('pilot',a.attemptId,90000),undefined);
    assert.equal(store.launch('pilot','trainer',100000,'journey-dallas-08').missionId,'journey-dallas-08');
    const replay=store.launch('pilot','trainer',110000,journeyDallas07.id);store.approach('pilot',replay.attemptId,110100);store.startGiantIncoming('pilot',replay.attemptId,111000);for(let i=0;i<80;i++)store.hitTransport('pilot',replay.attemptId,112000+i*1000);assert.equal(store.get('pilot',replay.attemptId)?.firstClearCredits,0);
    const expired=store.launch('pilot','trainer',300000,journeyDallas07.id);store.approach('pilot',expired.attemptId,300100);store.startGiantIncoming('pilot',expired.attemptId,301000);assert.equal(store.fail('pilot',expired.attemptId,'TIME_UP',451000)?.status,'FAILED');assert.equal(store.hitTransport('pilot',expired.attemptId,451001),undefined);
    const check=new DatabaseSync(path);assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get() as {credits:number}).credits,850);assert.equal((check.prepare("SELECT count(*) n FROM wallet_transactions WHERE reference_id='journey-dallas-07'").get() as {n:number}).n,1);check.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Giant Incoming preserves historical clears and wallet caps',()=>{
  const directory=mkdtempSync(join(tmpdir(),'giant-legacy-')),path=join(directory,'profiles.sqlite');const db=new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('legacy',850,0),('capped',999950,0)");db.close();
  try{const store=new JourneyAttemptStore(path);const fixture=new DatabaseSync(path);for(const id of ['legacy','capped'])fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run(id,journeyDallas06.id,'prior-six',500,90000);fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run('legacy',journeyDallas07.id,'historical-elevator',500,52000);fixture.close();
    for(const id of ['legacy','capped']){const a=store.launch(id,'trainer',1000,journeyDallas07.id);store.approach(id,a.attemptId,1100);store.startGiantIncoming(id,a.attemptId,2000);for(let i=0;i<80;i++)store.hitTransport(id,a.attemptId,3000+i*1000);assert.equal(store.get(id,a.attemptId)?.firstClearCredits,id==='legacy'?0:50);}
    assert.equal(store.launch('legacy','trainer',100000,'journey-dallas-08').missionId,'journey-dallas-08');
    const check=new DatabaseSync(path);const history=check.prepare("SELECT first_attempt_id,best_time_ms FROM journey_completions WHERE pilot_id='legacy' AND mission_id='journey-dallas-07'").get() as {first_attempt_id:string;best_time_ms:number};assert.equal(history.first_attempt_id,'historical-elevator');assert.equal(history.best_time_ms,52000);assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get() as {credits:number}).credits,1000000);check.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('Rookie Rush crossing requires ordered forward travel through the actual opening', () => {
  const gate = journeyDallas01.gates[0]!;
  const before = { x: gate.x - 100, y: gate.altitude, z: gate.z };
  const after = { x: gate.x + 100, y: gate.altitude, z: gate.z };
  assert.equal(crossesJourneyGate(before, after, 0, 0), true);
  assert.equal(crossesJourneyGate(after, before, 0, 0), false);
  assert.equal(crossesJourneyGate({ ...before, y: gate.altitude + gate.radius }, { ...after, y: gate.altitude + gate.radius }, 0, 0), false);
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
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 0, 2_000), undefined);
    assert.equal(store.startRookieRush('pilot-one', first.attemptId, 2_000)?.deadlineAt, 152_000);
    assert.equal(store.startRookieRush('pilot-one', first.attemptId, 2_001), undefined);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 0, 3_000)?.deadlineAt, 152_000);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 0, 2_500), undefined);
    for (let gate = 1; gate < journeyDallas01.gates.length - 1; gate += 1)
      assert.equal(store.acceptGate('pilot-one', first.attemptId, gate, 3_000 + gate * 12_000)?.gateIndex, gate + 1);
    const result = store.acceptGate('pilot-one', first.attemptId, 9, 120_000);
    assert.equal(result?.status, 'COMPLETED');
    assert.equal(result?.finishTimeMs, 118_000);
    assert.equal(result?.firstClearCredits, 250);
    assert.equal(store.acceptGate('pilot-one', first.attemptId, 9, 120_100), undefined);
    assert.equal(store.progress('pilot-one').completed, true);
    assert.equal(store.progress('pilot-one').firstAttemptId, first.attemptId);
    assert.equal(store.rookieRushBestTime('pilot-one'), 118_000);
    const replay = store.launch('pilot-one', 'trainer', 200_000);
    store.approach('pilot-one', replay.attemptId);
    store.startRookieRush('pilot-one', replay.attemptId, 201_000);
    for (let gate = 0; gate < journeyDallas01.gates.length; gate += 1)
      assert.equal(store.acceptGate('pilot-one', replay.attemptId, gate, 202_000 + gate * 1_000)?.gateIndex, gate + 1);
    assert.equal(store.get('pilot-one', replay.attemptId)?.firstClearCredits, 0);
    assert.equal(store.rookieRushBestTime('pilot-one'), 10_000);
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
    assert.equal(store.startRookieRush('another-pilot', first.attemptId, 2_000), undefined);
    store.startRookieRush('pilot-two', first.attemptId, 2_000);
    store.acceptGate('pilot-two', first.attemptId, 0, 2_000);
    for (let gate = 1; gate < 9; gate += 1)
      assert.equal(store.acceptGate('pilot-two', first.attemptId, gate, 2_000 + gate * 10_000)?.gateIndex, gate + 1);
    assert.equal(store.acceptGate('pilot-two', first.attemptId, 9, 152_000), undefined);
    assert.equal(store.acceptGate('pilot-two', first.attemptId, 1, 152_000), undefined);
    assert.equal(store.fail('pilot-two', first.attemptId, 'TIME_UP', 152_000)?.status, 'FAILED');
    assert.equal(store.progress('pilot-two').completed, false);
    const retry = store.launch('pilot-two', 'trainer', 153_000);
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
    store.startRookieRush('pilot-cap', current.attemptId, 1_500);
    for (let gate = 0; gate < journeyDallas01.gates.length; gate += 1) {
      const receipt = store.acceptGate('pilot-cap', current.attemptId, gate, 2_000 + gate * 1_000);
      if (gate === 9) assert.equal(receipt?.firstClearCredits, 100);
    }
    assert.equal(store.progress('pilot-cap').completed, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Lake Racer is a distinct ten-gate race with protected historical rewards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-lake-racer-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('lake-pilot', 0, 0), ('other-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('lake-pilot', 'trainer', 1_000, journeyDallas02.id), /locked/);
    const rookie = store.launch('lake-pilot', 'trainer', 1_000);
    store.approach('lake-pilot', rookie.attemptId);
    store.startRookieRush('lake-pilot', rookie.attemptId, 1_500);
    for (let gate = 0; gate < journeyDallas01.gates.length; gate += 1)
      store.acceptGate('lake-pilot', rookie.attemptId, gate, 2_000 + gate * 1_000);
    const race = store.launch('lake-pilot', 'trainer', 20_000, journeyDallas02.id);
    assert.equal(race.status, 'READY');
    assert.equal(race.lakeGateIndex, 0);
    assert.equal(store.assignHunter('lake-pilot', race.attemptId, 'bot:one'), undefined);
    store.approach('lake-pilot', race.attemptId);
    assert.equal(store.acceptGate('lake-pilot', race.attemptId, 0, 20_100), undefined);
    const started = store.startRookieRush('lake-pilot', race.attemptId, 20_200);
    assert.equal(started?.deadlineAt, 170_200);
    assert.equal(store.startRookieRush('lake-pilot', race.attemptId, 21_000), undefined);
    assert.equal(store.acceptGate('other-pilot', race.attemptId, 0, 21_000), undefined);
    assert.equal(store.acceptGate('lake-pilot', race.attemptId, 1, 21_000), undefined);
    assert.equal(store.completeHunter('lake-pilot', race.attemptId, 'bot:one'), undefined);
    for (let gate = 0; gate < journeyDallas02.gates.length; gate += 1) {
      const result = store.acceptGate('lake-pilot', race.attemptId, gate, 21_000 + gate * 1_000);
      assert.equal(result?.gateIndex, gate + 1);
    }
    assert.equal(store.get('lake-pilot', race.attemptId)?.firstClearCredits, 350);
    assert.equal(store.lakeRacerBestTime('lake-pilot'), 9_800);
    assert.equal(store.progress('lake-pilot', journeyDallas02.id).firstAttemptId, race.attemptId);
    const replay = store.launch('lake-pilot', 'trainer', 40_000, journeyDallas02.id);
    store.approach('lake-pilot', replay.attemptId);
    store.startRookieRush('lake-pilot', replay.attemptId, 40_200);
    for (let gate = 0; gate < journeyDallas02.gates.length; gate += 1)
      store.acceptGate('lake-pilot', replay.attemptId, gate, 41_000 + gate * 1_000);
    assert.equal(store.get('lake-pilot', replay.attemptId)?.firstClearCredits, 0);
    const expired = store.launch('lake-pilot', 'trainer', 60_000, journeyDallas02.id);
    store.approach('lake-pilot', expired.attemptId);
    store.startRookieRush('lake-pilot', expired.attemptId, 60_100);
    assert.equal(store.acceptGate('lake-pilot', expired.attemptId, 0, 210_100), undefined);
    assert.equal(store.fail('lake-pilot', expired.attemptId, 'TIME_UP', 210_100)?.status, 'FAILED');
    assert.equal(store.acceptGate('lake-pilot', expired.attemptId, 0, 210_101), undefined);
    const retry = store.launch('lake-pilot', 'trainer', 211_000, journeyDallas02.id);
    assert.equal(retry.lakeGateIndex, 0);
    assert.equal(retry.deadlineAt, null);
    assert.equal(store.get('lake-pilot', expired.attemptId)?.status, 'FAILED');
    store.approach('lake-pilot', retry.attemptId);
    store.startRookieRush('lake-pilot', retry.attemptId, 211_100);
    assert.equal(store.fail('lake-pilot', retry.attemptId, 'CRASHED', 212_000)?.status, 'FAILED');
    const afterCrash = store.launch('lake-pilot', 'trainer', 213_000, journeyDallas02.id);
    assert.equal(afterCrash.gateIndex, 0);
    assert.equal(afterCrash.deadlineAt, null);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'lake-pilot'").get() as { credits: number }).credits, 600);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason = 'MISSION_REWARD'").get() as { count: number }).count, 2);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('historical Hunter Showdown clears retain unlocks but never pay Lake Racer again', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-lake-history-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec(`CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL);
    INSERT INTO player_profiles VALUES ('veteran', 600, 0);
    CREATE TABLE journey_attempts (
      attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL,
      city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL, status TEXT NOT NULL,
      gate_index INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      started_at INTEGER, deadline_at INTEGER, last_gate_at INTEGER, finished_at INTEGER,
      finish_time_ms INTEGER, first_clear_credits INTEGER NOT NULL DEFAULT 0, failure_reason TEXT
    );
    INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at,finished_at)
      VALUES ('old-hunter','veteran','journey-dallas-02','dallas','trainer','COMPLETED',1000,2000);`);
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const history = new DatabaseSync(path);
    history.prepare(`INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms)
      VALUES (?,?,?,?,?)`).run('veteran', journeyDallas01.id, 'old-rookie', 1_000, 100_000);
    history.prepare(`INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms)
      VALUES (?,?,?,?,?)`).run('veteran', journeyDallas02.id, 'old-hunter', 2_000, 0);
    history.close();
    assert.equal(store.get('veteran', 'old-hunter')?.lakeGateIndex, -1);
    assert.equal(store.progress('veteran', journeyDallas02.id).completed, true);
    assert.equal(store.progress('veteran', journeyDallas02.id).bestTimeMs, undefined);
    assert.equal(store.lakeRacerBestTime('veteran'), undefined);
    const race = store.launch('veteran', 'trainer', 10_000, journeyDallas02.id);
    store.approach('veteran', race.attemptId);
    store.startRookieRush('veteran', race.attemptId, 10_100);
    for (let gate = 0; gate < journeyDallas02.gates.length; gate += 1)
      store.acceptGate('veteran', race.attemptId, gate, 11_000 + gate * 1_000);
    assert.equal(store.get('veteran', race.attemptId)?.firstClearCredits, 0);
    assert.equal(store.lakeRacerBestTime('veteran'), 9_900);
    assert.equal(store.progress('veteran', journeyDallas02.id).bestTimeMs, 9_900);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'veteran'").get() as { credits: number }).credits, 600);
    assert.equal((check.prepare("SELECT first_attempt_id FROM journey_completions WHERE pilot_id = 'veteran' AND mission_id = ?").get(journeyDallas02.id) as { first_attempt_id: string }).first_attempt_id, 'old-hunter');
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Golden Ascent is a ten-gate rising forward course with valid swept openings', () => {
  assert.equal(journeyDallas03.timeLimitMs, 160_000);
  assert.equal(journeyDallas03.firstClearCredits, 450);
  assert.equal(journeyDallas03.gates.length, 10);
  assert.ok(journeyDallas03.gates.at(-1)!.altitude - journeyDallas03.airborneSpawn.altitude > 2_000);
  const route = [journeyDallas03.airborneSpawn, ...journeyDallas03.gates];
  let distance = 0;
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1]!, next = route[index]!;
    const leg = Math.hypot(next.x - previous.x, next.z - previous.z);
    assert.ok(leg <= 13_000, `gate ${index} remains within readable spacing`);
    assert.ok(Math.abs(next.x) <= 23_000 && Math.abs(next.z) <= 23_000, `gate ${index} stays inside playable Dallas`);
    distance += leg;
  }
  assert.ok(distance >= 100_000 && distance <= 110_000);
  for (let index = 0; index < journeyDallas03.gates.length; index += 1) {
    const gate = journeyDallas03.gates[index]!;
    const before = journeyDallas03.gates[Math.max(0, index - 1)]!;
    const after: typeof gate = journeyDallas03.gates[Math.min(journeyDallas03.gates.length - 1, index + 1)]!;
    const length = Math.hypot(after.x - before.x, after.z - before.z);
    const nx = (after.x - before.x) / length, nz = (after.z - before.z) / length;
    const from = { x: gate.x - nx * 100, y: 180 + gate.altitude, z: gate.z - nz * 100 };
    const to = { x: gate.x + nx * 100, y: 180 + gate.altitude, z: gate.z + nz * 100 };
    assert.equal(journeyGateCrossing(from, to, index, 180, journeyDallas03), 'VALID');
    assert.equal(journeyGateCrossing(to, from, index, 180, journeyDallas03), false);
    const miss = { x: from.x - nz * gate.radius * 2, y: from.y, z: from.z + nx * gate.radius * 2 };
    const missTo = { x: to.x - nz * gate.radius * 2, y: to.y, z: to.z + nx * gate.radius * 2 };
    assert.equal(journeyGateCrossing(miss, missTo, index, 180, journeyDallas03), false);
    if (index > 0) assert.ok(gate.altitude > journeyDallas03.gates[index - 1]!.altitude);
  }
});

test('Golden Ascent unlocks after Lake Racer, starts its timer with control, and pays 450 Credits once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-golden-ascent-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('ascent-pilot', 0, 0)");
  setup.close();
  try {
    const pilot = 'ascent-pilot';
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch(pilot, 'trainer', 1_000, journeyDallas03.id), /locked/);
    const first = store.launch(pilot, 'trainer', 1_000);
    store.approach(pilot, first.attemptId);
    store.startRookieRush(pilot, first.attemptId, 1_500);
    for (let gate = 0; gate < 10; gate += 1) store.acceptGate(pilot, first.attemptId, gate, 2_000 + gate * 1_000);
    assert.throws(() => store.launch(pilot, 'trainer', 7_000, journeyDallas03.id), /locked/);
    const lake = store.launch(pilot, 'trainer', 8_000, journeyDallas02.id);
    store.approach(pilot, lake.attemptId);
    store.startRookieRush(pilot, lake.attemptId, 8_100);
    for (let gate = 0; gate < 10; gate += 1) store.acceptGate(pilot, lake.attemptId, gate, 8_200 + gate * 1_000);

    const expired = store.launch(pilot, 'trainer', 20_000, journeyDallas03.id);
    store.approach(pilot, expired.attemptId);
    assert.equal(store.acceptGate(pilot, expired.attemptId, 0, 20_100), undefined);
    assert.equal(store.startRookieRush(pilot, expired.attemptId, 21_000)?.deadlineAt, 181_000);
    assert.equal(store.startRookieRush(pilot, expired.attemptId, 22_000), undefined);
    assert.equal(store.acceptGate(pilot, expired.attemptId, 0, 181_000), undefined);
    assert.equal(store.fail(pilot, expired.attemptId, 'TIME_UP', 181_000)?.status, 'FAILED');

    const race = store.launch(pilot, 'trainer', 200_000, journeyDallas03.id);
    assert.equal(race.ascentGateIndex, 0);
    store.approach(pilot, race.attemptId);
    assert.equal(store.acceptGate(pilot, race.attemptId, 1, 200_100), undefined);
    assert.equal(store.startRookieRush(pilot, race.attemptId, 201_000)?.deadlineAt, 361_000);
    assert.equal(store.acceptGate('other-pilot', race.attemptId, 0, 202_000), undefined);
    assert.equal(store.acceptGate(pilot, race.attemptId, 1, 201_200), undefined);
    for (let gate = 0; gate < 10; gate += 1) {
      const receipt = store.acceptGate(pilot, race.attemptId, gate, 204_000 + gate * 10_000);
      assert.equal(receipt?.gateIndex, gate + 1);
      if (gate === 9) { assert.equal(receipt?.status, 'COMPLETED'); assert.equal(receipt?.firstClearCredits, 450); }
    }
    assert.equal(store.acceptGate(pilot, race.attemptId, 9, 295_000), undefined);
    assert.equal(store.goldenAscentBestTime(pilot), 93_000);
    assert.equal(store.progress(pilot, journeyDallas03.id).firstAttemptId, race.attemptId);
    assert.equal(new JourneyAttemptStore(path).progress(pilot, journeyDallas03.id).completed, true);

    const replay = store.launch(pilot, 'trainer', 400_000, journeyDallas03.id);
    store.approach(pilot, replay.attemptId);
    store.startRookieRush(pilot, replay.attemptId, 400_500);
    for (let gate = 0; gate < 10; gate += 1) {
      const receipt = store.acceptGate(pilot, replay.attemptId, gate, 401_000 + gate * 10_000);
      if (gate === 9) assert.equal(receipt?.firstClearCredits, 0);
    }
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'ascent-pilot'").get() as { credits: number }).credits, 1050);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason = 'MISSION_REWARD'").get() as { count: number }).count, 3);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('historical White Rock Skimmer completion keeps rewards and unlocks without becoming an Ascent best time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-ascent-history-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec(`CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL);
    INSERT INTO player_profiles VALUES ('veteran', 900, 0);
    CREATE TABLE journey_attempts (
      attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL,
      city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL, status TEXT NOT NULL,
      gate_index INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      started_at INTEGER, deadline_at INTEGER, last_gate_at INTEGER, finished_at INTEGER,
      finish_time_ms INTEGER, first_clear_credits INTEGER NOT NULL DEFAULT 0, failure_reason TEXT
    );
    INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,gate_index,created_at,finished_at,finish_time_ms)
      VALUES ('old-skimmer','veteran','journey-dallas-03','dallas','trainer','COMPLETED',4,1000,64000,63000);
    INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,gate_index,created_at)
      VALUES ('old-skimmer-active','veteran','journey-dallas-03','dallas','trainer','RACING',2,65000);`);
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const history = new DatabaseSync(path);
    history.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('veteran', journeyDallas03.id, 'old-skimmer', 64_000, 63_000);
    history.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('veteran', journeyDallas02.id, 'old-lake', 30_000, 100_000);
    history.close();
    assert.equal(store.get('veteran', 'old-skimmer')?.ascentGateIndex, -1);
    assert.equal(store.get('veteran', 'old-skimmer-active')?.status, 'ABANDONED');
    assert.equal(store.progress('veteran', journeyDallas03.id).completed, true);
    assert.equal(store.progress('veteran', journeyDallas03.id).bestTimeMs, undefined);
    assert.equal(store.goldenAscentBestTime('veteran'), undefined);
    assert.equal(store.launch('veteran', 'trainer', 100_000, journeyDallas04.id).missionId, journeyDallas04.id);
    const race = store.launch('veteran', 'trainer', 200_000, journeyDallas03.id);
    store.approach('veteran', race.attemptId);
    store.startRookieRush('veteran', race.attemptId, 201_000);
    for (let gate = 0; gate < 10; gate += 1) store.acceptGate('veteran', race.attemptId, gate, 203_000 + gate * 10_000);
    assert.equal(store.get('veteran', race.attemptId)?.firstClearCredits, 0);
    assert.equal(store.goldenAscentBestTime('veteran'), 92_000);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'veteran'").get() as { credits: number }).credits, 900);
    assert.equal((check.prepare("SELECT first_attempt_id FROM journey_completions WHERE pilot_id = 'veteran' AND mission_id = ?").get(journeyDallas03.id) as { first_attempt_id: string }).first_attempt_id, 'old-skimmer');
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Needle Rush has ten progressively smaller golden openings and forward crossings', () => {
  assert.equal(journeyDallas05.name, 'NEEDLE RUSH');
  assert.equal(journeyDallas05.timeLimitMs, 160_000);
  assert.ok(journeyDallas05.airborneSpawn);
  assert.deepEqual(journeyDallas05.gates.map(gate => gate.radius), [320, 310, 300, 270, 260, 260, 255, 225, 225, 340]);
  for (let index = 0; index < 10; index += 1) {
    const gate = journeyDallas05.gates[index]!;
    const previous = journeyDallas05.gates[Math.max(0, index - 1)]!;
    const next = journeyDallas05.gates[Math.min(9, index + 1)]!;
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    const nx = (next.x - previous.x) / length;
    const nz = (next.z - previous.z) / length;
    const before = { x: gate.x - nx * 50, y: gate.altitude, z: gate.z - nz * 50 };
    const after = { x: gate.x + nx * 50, y: gate.altitude, z: gate.z + nz * 50 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas05), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas05), false);
    assert.equal(journeyGateCrossing({ ...before, y: gate.altitude + gate.radius * .93 }, { ...after, y: gate.altitude + gate.radius * .93 }, index, 0, journeyDallas05), false);
    const offset = gate.radius * .93;
    assert.equal(journeyGateCrossing(
      { ...before, x: before.x - nz * offset, z: before.z + nx * offset },
      { ...after, x: after.x - nz * offset, z: after.z + nx * offset }, index, 0, journeyDallas05,
    ), false);
  }
});

test('Needle Rush requires Mission 4, a running timer and all ten gates; reward is once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-needle-journey-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('needle-pilot', 0, 0), ('other-pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    assert.throws(() => store.launch('needle-pilot', 'trainer', 1_000, journeyDallas05.id), /locked/);
    const fixture = new DatabaseSync(path);
    fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('needle-pilot', journeyDallas04.id, 'qa-prerequisite', 500, 30_000);
    fixture.close();
    const expired = store.launch('needle-pilot', 'trainer', 2_000, journeyDallas05.id);
    assert.equal(expired.status, 'READY');
    store.approach('needle-pilot', expired.attemptId);
    assert.equal(store.get('needle-pilot', expired.attemptId)?.deadlineAt, null);
    assert.equal(store.acceptGate('other-pilot', expired.attemptId, 0, 3_000), undefined);
    assert.equal(store.acceptGate('needle-pilot', expired.attemptId, 1, 3_000), undefined);
    assert.equal(store.acceptGate('needle-pilot', expired.attemptId, 0, 3_000), undefined);
    assert.equal(store.startRookieRush('other-pilot', expired.attemptId, 3_000), undefined);
    assert.equal(store.startRookieRush('needle-pilot', expired.attemptId, 3_000)?.deadlineAt, 163_000);
    assert.equal(store.acceptGate('needle-pilot', expired.attemptId, 9, 4_000), undefined);
    assert.equal(store.acceptGate('needle-pilot', expired.attemptId, 0, 163_000), undefined);
    assert.equal(store.fail('needle-pilot', expired.attemptId, 'TIME_UP', 163_000)?.status, 'FAILED');
    const attempt = store.launch('needle-pilot', 'trainer', 170_000, journeyDallas05.id);
    assert.equal(attempt.gateIndex, 0);
    assert.equal(attempt.needleGateIndex, 0);
    assert.equal(attempt.deadlineAt, null);
    const preparing = store.approach('needle-pilot', attempt.attemptId);
    assert.deepEqual(authorizedJourneyAirborneSpawn(preparing, journeyDallas05, () => 120), {
      position: { x: -23_000, y: 970, z: -23_000 }, heading: -3 * Math.PI / 4, speed: 650,
    });
    assert.equal(authorizedJourneyAirborneSpawn(attempt, journeyDallas05, () => 120), undefined);
    store.startRookieRush('needle-pilot', attempt.attemptId, 171_000);
    for (let gate = 0; gate < 10; gate += 1) {
      const result = store.acceptGate('needle-pilot', attempt.attemptId, gate, 172_000 + gate * 12_000);
      assert.equal(result?.gateIndex, gate + 1);
      if (gate === 9) {
        assert.equal(result?.status, 'COMPLETED');
        assert.equal(result?.finishTimeMs, 109_000);
        assert.equal(result?.firstClearCredits, 600);
      }
    }
    assert.equal(store.acceptGate('needle-pilot', attempt.attemptId, 9, 282_000), undefined);
    assert.equal(new JourneyAttemptStore(path).progress('needle-pilot', journeyDallas05.id).firstAttemptId, attempt.attemptId);
    const replay = store.launch('needle-pilot', 'trainer', 300_000, journeyDallas05.id);
    store.approach('needle-pilot', replay.attemptId);
    store.startRookieRush('needle-pilot', replay.attemptId, 301_000);
    assert.equal(store.acceptGate('needle-pilot', attempt.attemptId, 0, 302_000), undefined);
    for (let gate = 0; gate < 10; gate += 1) {
      const result = store.acceptGate('needle-pilot', replay.attemptId, gate, 302_000 + gate * 12_000);
      if (gate === 9) assert.equal(result?.firstClearCredits, 0);
    }
    const crashed = store.launch('needle-pilot', 'trainer', 430_000, journeyDallas05.id);
    store.approach('needle-pilot', crashed.attemptId);
    store.startRookieRush('needle-pilot', crashed.attemptId, 431_000);
    assert.equal(store.acceptGate('needle-pilot', crashed.attemptId, 0, 432_000)?.gateIndex, 1);
    assert.equal(store.fail('needle-pilot', crashed.attemptId, 'CRASHED', 433_000)?.status, 'FAILED');
    assert.equal(store.acceptGate('needle-pilot', crashed.attemptId, 1, 434_000), undefined);
    const exited = store.launch('needle-pilot', 'trainer', 440_000, journeyDallas05.id);
    assert.equal(exited.gateIndex, 0);
    assert.equal(store.abandon('needle-pilot', exited.attemptId, 441_000)?.status, 'ABANDONED');
    assert.equal(store.acceptGate('needle-pilot', exited.attemptId, 0, 442_000), undefined);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'needle-pilot'").get() as { credits: number }).credits, 600);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-05'").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('historical four-gate Mission 5 clears retain progress and Credits without a Needle Rush best time', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-needle-history-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec(`CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL);
    INSERT INTO player_profiles VALUES ('veteran', 1200, 0);
    CREATE TABLE journey_attempts (
      attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL,
      city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL, status TEXT NOT NULL,
      gate_index INTEGER NOT NULL DEFAULT 0 CHECK(gate_index BETWEEN 0 AND 4), created_at INTEGER NOT NULL,
      started_at INTEGER, deadline_at INTEGER, last_gate_at INTEGER, finished_at INTEGER,
      finish_time_ms INTEGER, first_clear_credits INTEGER NOT NULL DEFAULT 0, failure_reason TEXT
    );
    INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,gate_index,created_at,finished_at,finish_time_ms)
      VALUES ('old-needle','veteran','journey-dallas-05','dallas','trainer','COMPLETED',4,1000,64000,63000);
    INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,gate_index,created_at)
      VALUES ('old-needle-active','veteran','journey-dallas-05','dallas','trainer','RACING',2,65000);`);
  setup.close();
  try {
    const store = new JourneyAttemptStore(path);
    const history = new DatabaseSync(path);
    history.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('veteran', journeyDallas05.id, 'old-needle', 64_000, 63_000);
    history.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('veteran', journeyDallas04.id, 'old-slalom', 30_000, 90_000);
    history.close();
    assert.equal(store.get('veteran', 'old-needle')?.needleGateIndex, -1);
    assert.equal(store.get('veteran', 'old-needle-active')?.status, 'ABANDONED');
    assert.equal(store.progress('veteran', journeyDallas05.id).completed, true);
    assert.equal(store.progress('veteran', journeyDallas05.id).bestTimeMs, undefined);
    assert.equal(store.needleRushBestTime('veteran'), undefined);
    assert.equal(store.launch('veteran', 'trainer', 100_000, journeyDallas06.id).missionId, journeyDallas06.id);
    const race = store.launch('veteran', 'trainer', 200_000, journeyDallas05.id);
    store.approach('veteran', race.attemptId);
    store.startRookieRush('veteran', race.attemptId, 201_000);
    for (let gate = 0; gate < 10; gate += 1) store.acceptGate('veteran', race.attemptId, gate, 203_000 + gate * 10_000);
    assert.equal(store.get('veteran', race.attemptId)?.firstClearCredits, 0);
    assert.equal(store.needleRushBestTime('veteran'), 92_000);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'veteran'").get() as { credits: number }).credits, 1200);
    assert.equal((check.prepare("SELECT first_attempt_id FROM journey_completions WHERE pilot_id = 'veteran' AND mission_id = ?").get(journeyDallas05.id) as { first_attempt_id: string }).first_attempt_id, 'old-needle');
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Golden Championship has ten forward-only gates and a safe course entry', () => {
  assert.equal(journeyDallas06.name, 'GOLDEN CHAMPIONSHIP');
  assert.equal(journeyDallas06.gates.length, 10);
  assert.equal(journeyDallas06.timeLimitMs, 160_000);
  assert.equal(journeyDallas06.firstClearCredits, 750);
  assert.ok(journeyDallas06.airborneSpawn.altitude > 700);
  for (let index = 0; index < journeyDallas06.gates.length; index += 1) {
    const gate = journeyDallas06.gates[index]!;
    const previous = index === 0 ? journeyDallas06.airborneSpawn : journeyDallas06.gates[index - 1]!;
    const next = journeyDallas06.gates[Math.min(9, index + 1)]!;
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

test('Golden Championship requires Mission 5, starts its timer with control, and awards Gate 10 once', () => {
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
    assert.equal(store.acceptGate('champion', expired.attemptId, 0, 700), undefined);
    assert.equal(store.startRookieRush('champion', expired.attemptId, 700)?.deadlineAt, 160_700);
    assert.equal(store.acceptGate('champion', expired.attemptId, 0, 160_700), undefined);
    assert.equal(store.fail('champion', expired.attemptId, 'TIME_UP', 160_700)?.status, 'FAILED');
    const first = store.launch('champion', 'trainer', 1_000, journeyDallas06.id);
    assert.equal(first.phase, 'PREPARING');
    assert.equal(first.gateIndex, 0);
    assert.equal(first.deadlineAt, null);
    assert.equal(store.approach('champion', first.attemptId)?.status, 'APPROACH');
    assert.equal(store.acceptGate('other', first.attemptId, 0, 2_000), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 0, 2_000), undefined);
    assert.equal(store.startRookieRush('champion', first.attemptId, 2_000)?.deadlineAt, 162_000);
    assert.equal(store.startRookieRush('champion', first.attemptId, 2_001), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 1, 2_100), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 0, 3_000)?.gateIndex, 1);
    assert.equal(new JourneyAttemptStore(path).get('champion', first.attemptId)?.gateIndex, 1, 'reconnect keeps authoritative progress');
    assert.equal(store.acceptGate('champion', first.attemptId, 0, 3_100), undefined);
    assert.equal(store.acceptGate('champion', first.attemptId, 9, 3_500), undefined);
    for (let index = 1; index < 10; index += 1) {
      const result = store.acceptGate('champion', first.attemptId, index, 3_000 + index * 10_000);
      assert.equal(result?.gateIndex, index + 1);
    }
    assert.equal(store.get('champion', first.attemptId)?.status, 'COMPLETED');
    assert.equal(store.get('champion', first.attemptId)?.firstClearCredits, 750);
    assert.equal(store.get('champion', first.attemptId)?.finishTimeMs, 91_000);
    assert.equal(store.chapterOneComplete('champion'), false, 'a Mission 6 clear alone is not chapter completion');
    assert.equal(store.acceptGate('champion', first.attemptId, 9, 104_000), undefined);
    assert.equal(store.progress('champion', journeyDallas06.id).completed, true);
    assert.equal(store.launch('champion', 'trainer', 110_000, journeyDallas07.id).missionId, journeyDallas07.id);
    const replay = store.launch('champion', 'trainer', 200_000, journeyDallas06.id);
    store.approach('champion', replay.attemptId);
    store.startRookieRush('champion', replay.attemptId, 201_000);
    for (let index = 0; index < 10; index += 1) store.acceptGate('champion', replay.attemptId, index, 203_000 + index * 10_000);
    assert.equal(store.get('champion', replay.attemptId)?.firstClearCredits, 0);
    assert.equal(store.goldenChampionshipBestTime('champion'), 91_000);
    const exited = store.launch('champion', 'trainer', 300_000, journeyDallas06.id);
    store.approach('champion', exited.attemptId);
    store.startRookieRush('champion', exited.attemptId, 301_000);
    store.acceptGate('champion', exited.attemptId, 0, 302_000);
    assert.equal(store.abandon('champion', exited.attemptId, 303_000)?.status, 'ABANDONED');
    assert.equal(store.acceptGate('champion', exited.attemptId, 1, 313_000), undefined);
    const crashed = store.launch('champion', 'trainer', 320_000, journeyDallas06.id);
    store.approach('champion', crashed.attemptId);
    store.startRookieRush('champion', crashed.attemptId, 321_000);
    assert.equal(store.fail('champion', crashed.attemptId, 'CRASHED', 321_500)?.failureReason, 'CRASHED');
    assert.equal(store.acceptGate('champion', crashed.attemptId, 0, 322_000), undefined);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'champion'").get() as { credits: number }).credits, 750);
    assert.equal((check.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id = 'journey-dallas-06' AND amount = 750").get() as { count: number }).count, 1);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('historical championship clears preserve rewards while new race records stay separate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-championship-history-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('veteran', 750, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path, true);
    const fixture = new DatabaseSync(path);
    const historicalClear = fixture.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)');
    for (const mission of [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05])
      historicalClear.run('veteran', mission.id, `old-${mission.id}`, 400, 90_000);
    historicalClear.run('veteran', journeyDallas06.id, 'old-championship', 500, 90_000);
    fixture.close();
    assert.equal(store.progress('veteran', journeyDallas06.id).completed, true);
    assert.equal(store.chapterOneComplete('veteran'), true);
    assert.equal(store.progress('veteran', journeyDallas06.id).bestTimeMs, undefined);
    const race = store.launch('veteran', 'trainer', 1_000, journeyDallas06.id);
    store.approach('veteran', race.attemptId);
    store.startRookieRush('veteran', race.attemptId, 2_000);
    for (let index = 0; index < 10; index += 1) store.acceptGate('veteran', race.attemptId, index, 3_000 + index * 10_000);
    assert.equal(store.get('veteran', race.attemptId)?.firstClearCredits, 0);
    assert.equal(store.goldenChampionshipBestTime('veteran'), 91_000);
    assert.equal(store.progress('veteran', journeyDallas06.id).firstAttemptId, 'old-championship');
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'veteran'").get() as { credits: number }).credits, 750);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Downtown Slalom gates accept sequential forward crossings through the solid ring', () => {
  assert.equal(journeyDallas04.gates.length, 10);
  assert.equal(journeyDallas04.timeLimitMs, 160_000);
  assert.equal(journeyDallas04.firstClearCredits, 500);
  for (let index = 0; index < 10; index += 1) {
    const gate = journeyDallas04.gates[index]!;
    const prior = journeyDallas04.gates[Math.max(0, index - 1)]!;
    const next = journeyDallas04.gates[Math.min(9, index + 1)]!;
    const length = Math.hypot(next.x - prior.x, next.z - prior.z);
    const nx = (next.x - prior.x) / length, nz = (next.z - prior.z) / length;
    const before = { x: gate.x - nx * 90, y: gate.altitude, z: gate.z - nz * 90 };
    const after = { x: gate.x + nx * 90, y: gate.altitude, z: gate.z + nz * 90 };
    assert.equal(journeyGateCrossing(before, after, index, 0, journeyDallas04), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 0, journeyDallas04), false);
    const tangentX = -nz * (gate.radius * 1.12 + 2.6), tangentZ = nx * (gate.radius * 1.12 + 2.6);
    assert.equal(journeyGateCrossing({ ...before, x: before.x + tangentX, z: before.z + tangentZ },
      { ...after, x: after.x + tangentX, z: after.z + tangentZ }, index, 0, journeyDallas04), false);
  }
});

test('historical Mission 4 territory attempts migrate without reviving active territory progress', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-slalom-migration-test-'));
  const path = join(directory, 'profiles.sqlite');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL);
    INSERT INTO player_profiles VALUES ('veteran', 1200, 0);
    CREATE TABLE journey_attempts (
      attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL, city_id TEXT NOT NULL,
      aircraft_type TEXT NOT NULL, status TEXT NOT NULL, gate_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, started_at INTEGER, deadline_at INTEGER, last_gate_at INTEGER,
      finished_at INTEGER, finish_time_ms INTEGER, first_clear_credits INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT);
    INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at)
      VALUES ('old-territory','veteran','journey-dallas-04','dallas','trainer','RACING',1000);`);
  old.close();
  try {
    const store = new JourneyAttemptStore(path);
    const prior = store.get('veteran', 'old-territory');
    assert.equal(prior?.status, 'ABANDONED');
    assert.equal(prior?.failureReason, 'MISSION_UPDATED');
    assert.equal(prior?.slalomGateIndex, -1);
    assert.equal(store.downtownSlalomBestTime('veteran'), undefined);
    const history = new DatabaseSync(path);
    history.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('veteran', journeyDallas03.id, 'old-ascent', 900, 70_000);
    history.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run('veteran', journeyDallas04.id, 'old-territory-win', 950, 50_000);
    history.close();
    assert.equal(store.progress('veteran', journeyDallas04.id).completed, true);
    const race = store.launch('veteran', 'trainer', 2_000, journeyDallas04.id);
    store.approach('veteran', race.attemptId, 2_100);
    store.startRookieRush('veteran', race.attemptId, 2_200);
    for (let gate = 0; gate < 10; gate += 1) store.acceptGate('veteran', race.attemptId, gate, 3_000 + gate * 9_000);
    assert.equal(store.get('veteran', race.attemptId)?.firstClearCredits, 0);
    assert.equal(store.downtownSlalomBestTime('veteran'), 81_800);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'veteran'").get() as { credits: number }).credits, 1200);
    assert.equal((check.prepare("SELECT first_attempt_id FROM journey_completions WHERE pilot_id = 'veteran' AND mission_id = ?").get(journeyDallas04.id) as { first_attempt_id: string }).first_attempt_id, 'old-territory-win');
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Downtown Slalom timeout, crash, exit, and full retry invalidate old gate progress', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-slalom-lifecycle-test-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot', 0, 0)");
  setup.close();
  try {
    const store = new JourneyAttemptStore(path, true);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas04.id);
    store.approach('pilot', first.attemptId, 1_100);
    store.startRookieRush('pilot', first.attemptId, 1_200);
    assert.equal(store.acceptGate('pilot', first.attemptId, 0, 161_200), undefined);
    assert.equal(store.fail('pilot', first.attemptId, 'TIME_UP', 161_200)?.status, 'FAILED');
    const second = store.launch('pilot', 'trainer', 162_000, journeyDallas04.id);
    store.approach('pilot', second.attemptId, 162_100);
    store.startRookieRush('pilot', second.attemptId, 162_200);
    assert.equal(store.acceptGate('pilot', second.attemptId, 0, 163_000)?.gateIndex, 1);
    assert.equal(store.fail('pilot', second.attemptId, 'CRASHED', 163_100)?.status, 'FAILED');
    const third = store.launch('pilot', 'trainer', 164_000, journeyDallas04.id);
    assert.equal(third.gateIndex, 0);
    assert.equal(third.slalomGateIndex, 0);
    assert.equal(store.acceptGate('pilot', second.attemptId, 1, 164_500), undefined);
    assert.equal(store.abandon('pilot', third.attemptId, 164_600)?.status, 'ABANDONED');
    assert.equal(store.progress('pilot', journeyDallas04.id).completed, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
