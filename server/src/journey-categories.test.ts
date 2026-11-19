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

test('33 display slots and two pursuits exclude the retired Airport & Cargo chapter', () => {
  assert.equal(journeyCategorySlots.length, 33);
  assert.equal(journeyPursuitSlots.length, 2);
  assert.equal(journeyMainMissionIds.length, 28);
  assert.equal(journeyPlayableMainIds.length, 24);
  assert.deepEqual(journeyCategories.map(group => group.missionIds.length), [6,6,6,6,6]);
  const all = [...journeyCategorySlots, ...journeyPursuitSlots];
  assert.equal(new Set(all.map(slot => slot.id)).size, 35);
  assert.deepEqual([...new Set(all.filter(slot => slot.implementation === 'playable').map(slot => slot.missionId))].sort(), [...journeyMissionOrder].sort());
  assert.ok(!all.some(slot => slot.id.includes('survival')));
  assert.equal(journeyCategorySlots[5]!.id, 'journey-dallas-coin-hunt-01');
  assert.equal(journeyCategorySlots[30]!.id, 'journey-dallas-coin-hunt-02');
  assert.equal(journeyCategorySlots[30]!.missionId, 'journey-dallas-coin-hunt-01');
  assert.equal(journeyCategorySlots[30]!.implementation, 'playable');
  assert.deepEqual(journeyCategorySlots.slice(-2).map(slot => slot.id), ['journey-dallas-23', 'journey-dallas-19']);
});

test('Shooting Targets mission six is a bonus slot and remains unavailable until implemented', () => {
  const bonus = journeyCategorySlots.find(slot => slot.categoryId === 'shooting-targets' && slot.categoryNumber === 6)!;
  assert.equal(bonus.kind, 'bonus');
  assert.equal(bonus.implementation, 'placeholder');
  assert.equal(categoryMissionAccess(bonus.id, new Set(journeyMainMissionIds)), false);
});

test('retired missions cannot launch even with historical clears or QA access', () => fixture((store, db, path) => {
  const removed = ['journey-dallas-02', 'journey-dallas-airport-hop-01', ...Array.from({length:5}, (_, i) => `placeholder-dallas-airport-cargo-${i + 2}`)];
  for (const id of removed) clear(db, id);
  db.prepare('INSERT INTO journey_access_grants(pilot_id,mission_id) VALUES(?,?)').run('pilot', removed[0]!);
  const qaStore = new JourneyAttemptStore(path, true);
  for (const id of removed) {
    assert.equal(categoryMissionAccess(id, new Set(removed)), false);
    assert.equal(store.canAccessMission('pilot', id), false);
    assert.equal(qaStore.canAccessMission('pilot', id), false);
    assert.throws(() => store.launch('pilot', 'trainer', 2000, id));
  }
  assert.ok(!journeyCategories.some(group => group.id === 'airport-cargo'));
}));

test('Golden Rings ends with the existing bonus as mission six and progresses from Rookie Rush to Golden Ascent', () => fixture((store, db) => {
  const group = journeyCategories.find(group => group.id === 'golden-rings')!;
  assert.deepEqual(group.missionIds, ['journey-dallas-01','journey-dallas-03','journey-dallas-04','journey-dallas-05','journey-dallas-06','journey-dallas-coin-hunt-01']);
  assert.deepEqual(journeyCategorySlots.filter(slot => slot.categoryId === group.id).map(slot => slot.categoryNumber), [1,2,3,4,5,6]);
  assert.equal(store.canAccessMission('pilot', 'journey-dallas-03'), false);
  clear(db, 'journey-dallas-01');
  assert.equal(store.canAccessMission('pilot', 'journey-dallas-03'), true);
  assert.equal(store.launch('pilot','trainer',2000,'journey-dallas-03').missionId,'journey-dallas-03');
}));

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
      if (slot.implementation !== 'playable' || slot.kind === 'bonus') continue;
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
  const rings = journeyCategories.find(group => group.id === 'golden-rings')!.missionIds.slice(0, 5);
  for (const id of rings.slice(0, 4)) completed.add(id);
  assert.equal(access('journey-dallas-coin-hunt-01'), false);
  assert.equal(access('journey-dallas-coin-hunt-02'), false);
  completed.add(rings[4]!);
  assert.equal(access('journey-dallas-coin-hunt-01'), true);
  assert.equal(access('journey-dallas-coin-hunt-02'), true);
  assert.equal(categoryMissionAccess('journey-dallas-15', new Set()), false);
  assert.equal(categoryMissionAccess('journey-dallas-15', new Set(['journey-dallas-twin-hunters-01'])), true);
  assert.equal(categoryMissionAccess('journey-dallas-ace-intercept-01', new Set(['journey-dallas-15'])), true);
  assert.equal(categoryMissionAccess('journey-dallas-ace-intercept-01', new Set(['journey-dallas-twin-hunters-01'])), false);
  for (const id of journeyPlayableMainIds) completed.add(id);
  assert.equal(access('journey-dallas-23'), true);
  assert.equal(access('journey-dallas-19'), false);
  completed.add('journey-dallas-23');
  assert.equal(access('journey-dallas-19'), true);
  assert.equal(access('journey-dallas-coin-hunt-02'), true);
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
