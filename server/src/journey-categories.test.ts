import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { categoryMissionAccess, journeyCategories, journeyCategorySlots, journeyPursuitSlots, journeyMainMissionIds, journeyPlayableMainIds } from '../../shared/journey-categories.mjs';
import { journeyMissionOrder, journeyDallas01 } from '../../shared/journey-mission.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture(run: (store: JourneyAttemptStore, db: DatabaseSync, path: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'journey-categories-'));
  const path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',700,0),('other',0,0)");
  try { run(new JourneyAttemptStore(path), db, path); }
  finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
}
function clear(db: DatabaseSync, id: string, pilot = 'pilot'): void {
  db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)')
    .run(pilot, id, `receipt-${id}`, 1000, 1234);
}

test('40 display slots and two pursuits preserve every playable identity without displaying Survival', () => {
  assert.equal(journeyCategorySlots.length, 40);
  assert.equal(journeyPursuitSlots.length, 2);
  assert.equal(journeyMainMissionIds.length, 36);
  assert.equal(journeyPlayableMainIds.length, 23);
  assert.deepEqual(journeyCategories.map(group => group.missionIds.length), Array(6).fill(6));
  const all = [...journeyCategorySlots, ...journeyPursuitSlots];
  assert.equal(new Set(all.map(slot => slot.id)).size, 42);
  assert.deepEqual(all.filter(slot => slot.implementation === 'playable').map(slot => slot.id).sort(), [...journeyMissionOrder].sort());
  assert.ok(!all.some(slot => slot.id.includes('survival')));
  assert.equal(journeyCategorySlots[24]!.id, 'journey-dallas-coin-hunt-01');
  assert.equal(journeyCategorySlots[37]!.id, 'placeholder-dallas-bonus-2');
  assert.deepEqual(journeyCategorySlots.slice(-2).map(slot => slot.id), ['journey-dallas-23', 'journey-dallas-19']);
});

test('each category progresses independently on the server, including across restarts', () => fixture((store, db, path) => {
  for (const group of journeyCategories) {
    assert.equal(store.canAccessMission('pilot', group.missionIds[0]!), true);
    assert.equal(store.canAccessMission('pilot', group.missionIds[1]!), false);
  }
  clear(db, 'journey-dallas-13'); // Old sequential successor was Golden Rings 3.
  assert.equal(store.canAccessMission('pilot', 'journey-dallas-14'), true);
  assert.equal(store.canAccessMission('pilot', 'journey-dallas-03'), false);
  assert.equal(store.canAccessMission('other', 'journey-dallas-14'), false);
  const reopened = new JourneyAttemptStore(path);
  assert.equal(reopened.canAccessMission('pilot', 'journey-dallas-03'), false);
  for (const group of journeyCategories) {
    for (const id of group.missionIds) {
      const slot = journeyCategorySlots.find(slot => slot.id === id)!;
      if (slot.implementation !== 'playable') continue;
      assert.equal(reopened.canAccessMission('pilot', id), true, id);
      assert.equal(reopened.launch('pilot', 'trainer', 2000, id).missionId, id);
      if (!reopened.progress('pilot', id).completed) clear(db, id);
    }
  }
}));

test('bonuses count unique main clears; pursuits and bosses have their explicit prerequisites', () => {
  const completed = new Set<string>();
  const access = (id: string) => categoryMissionAccess(id, completed);
  completed.add('journey-dallas-15'); // Extra and bonus clears never count toward six.
  completed.add('journey-dallas-coin-hunt-01');
  assert.equal(access('journey-dallas-23'), false);
  completed.delete('journey-dallas-coin-hunt-01');
  for (const id of journeyPlayableMainIds.slice(0, 5)) completed.add(id);
  assert.equal(access('journey-dallas-coin-hunt-01'), false);
  completed.add(journeyPlayableMainIds[5]!);
  assert.equal(access('journey-dallas-coin-hunt-01'), true);
  assert.equal(categoryMissionAccess('journey-dallas-15', new Set()), false);
  assert.equal(categoryMissionAccess('journey-dallas-15', new Set(['journey-dallas-twin-hunters-01'])), true);
  assert.equal(categoryMissionAccess('journey-dallas-ace-intercept-01', new Set(['journey-dallas-15'])), true);
  assert.equal(categoryMissionAccess('journey-dallas-ace-intercept-01', new Set(['journey-dallas-twin-hunters-01'])), false);
  for (const id of journeyPlayableMainIds) completed.add(id);
  assert.equal(access('journey-dallas-23'), true);
  assert.equal(access('journey-dallas-19'), false);
  completed.add('journey-dallas-23');
  assert.equal(access('journey-dallas-19'), true);
  assert.equal(access('placeholder-dallas-bonus-2'), false);
});

test('one additive migration preserves old sequential access, attempts, checkpoints, rewards and balances', () => fixture((store, db, path) => {
  const attempt = store.launch('pilot', 'trainer', 1000, 'journey-dallas-01');
  store.approach('pilot', attempt.attemptId, 1100);
  store.startRookieRush('pilot', attempt.attemptId, 1200);
  store.acceptGate('pilot', attempt.attemptId, 0, 1300);
  clear(db, 'journey-dallas-13');
  db.prepare('INSERT INTO journey_access_grants VALUES(?,?)').run('pilot', 'journey-dallas-ace-intercept-01');
  db.prepare('DELETE FROM journey_catalog_versions WHERE version=?').run('dallas-category-journey-40-v1');
  const snapshot = () => ({
    attempts: db.prepare('SELECT * FROM journey_attempts').all(),
    clears: db.prepare('SELECT * FROM journey_completions').all(),
    credits: db.prepare('SELECT * FROM player_profiles').all(),
  });
  const before = snapshot();
  const upgraded = new JourneyAttemptStore(path);
  assert.deepEqual(snapshot(), before);
  assert.equal(upgraded.canAccessMission('pilot', 'journey-dallas-03'), true, 'historical next mission remains accessible');
  assert.equal(upgraded.canAccessMission('pilot', 'journey-dallas-ace-intercept-01'), true);
  assert.equal(upgraded.get('pilot', attempt.attemptId)?.gateIndex, 1);
  assert.equal(upgraded.progress('pilot', 'journey-dallas-13').firstAttemptId, 'receipt-journey-dallas-13');
  clear(db, 'journey-dallas-13', 'other');
  assert.equal(new JourneyAttemptStore(path).canAccessMission('other', 'journey-dallas-03'), false, 'migration must not repeat for later clears');
}));

test('placeholders cannot create attempts or wallet activity, including under local QA overrides', () => fixture((store, db, path) => {
  const qa = new JourneyAttemptStore(path, true);
  const before = db.prepare('SELECT COUNT(*) AS count FROM journey_attempts').get();
  for (const slot of journeyCategorySlots.filter(slot => slot.implementation === 'placeholder')) {
    assert.equal(store.canAccessMission('pilot', slot.id), false);
    assert.equal(qa.canAccessMission('pilot', slot.id), false);
    assert.throws(() => qa.launch('pilot', 'trainer', 1000, slot.id), /Unknown Journey mission/);
  }
  assert.deepEqual(db.prepare('SELECT COUNT(*) AS count FROM journey_attempts').get(), before);
  assert.equal(db.prepare('SELECT credits FROM player_profiles WHERE pilot_id=?').get('pilot')!.credits, 700);
}));

test('final required clear durably earns Boss access and replay never duplicates Credits', () => fixture((store, db, path) => {
  for (const id of journeyPlayableMainIds.filter(id => id !== journeyDallas01.id)) clear(db, id);
  assert.equal(store.canAccessMission('pilot', 'journey-dallas-23'), false);
  const finish = (now: number) => {
    const attempt = store.launch('pilot', 'trainer', now, journeyDallas01.id);
    store.approach('pilot', attempt.attemptId, now + 10);
    store.startRookieRush('pilot', attempt.attemptId, now + 20);
    for (let gate = 0; gate < 10; gate++) store.acceptGate('pilot', attempt.attemptId, gate, now + 1000 + gate * 1000);
    assert.equal(store.get('pilot', attempt.attemptId)?.status, 'COMPLETED');
    return attempt;
  };
  const first = finish(2000);
  assert.ok(db.prepare('SELECT 1 FROM journey_access_grants WHERE pilot_id=? AND mission_id=?').get('pilot', 'journey-dallas-23'));
  assert.equal(store.get('pilot', first.attemptId)?.firstClearCredits, journeyDallas01.firstClearCredits);
  const replay = finish(200000);
  assert.equal(store.get('pilot', replay.attemptId)?.firstClearCredits, 0);
  assert.equal(db.prepare('SELECT credits FROM player_profiles WHERE pilot_id=?').get('pilot')!.credits, 700 + journeyDallas01.firstClearCredits);
  assert.equal(new JourneyAttemptStore(path).canAccessMission('pilot', 'journey-dallas-23'), true);
  // A future prerequisite change cannot revoke the durable grant.
  db.prepare('DELETE FROM journey_completions WHERE pilot_id=?').run('pilot');
  assert.equal(new JourneyAttemptStore(path).canAccessMission('pilot', 'journey-dallas-23'), true);
}));
