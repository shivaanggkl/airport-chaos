import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as catalog from '../../shared/journey-mission.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

const missions = Array.from({ length: 24 }, (_, index) => catalog[`journeyDallas${String(index + 1).padStart(2, '0')}`]);

test('one isolated pilot unlocks the 24 stages in order and keeps completion across sessions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-chain-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('qa-pilot',0,0),('other-pilot',0,0)");
    database.close();
    const store = new JourneyAttemptStore(path);
    assert.equal(missions.length, 24);
    assert.equal(new Set(missions.map(mission => mission.id)).size, 24);
    assert.deepEqual(missions.slice(13).map(mission => mission.firstClearCredits),
      [1800, 1950, 2100, 2250, 2400, 2550, 2700, 2850, 3000, 3150, 4000]);
    for (const [index, mission] of missions.entries()) {
      if (index > 0) assert.throws(() => store.launch('qa-pilot', 'trainer', index * 1000, mission.id), /locked/);
      if (index > 0) {
        const predecessor = missions[index - 1];
        const seed = new DatabaseSync(path);
        seed.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
          .run('qa-pilot', predecessor.id, `fixture-${index}`, index * 1000);
        seed.close();
      }
      const attempt = store.launch('qa-pilot', 'trainer', index * 1000 + 1, mission.id);
      assert.equal(attempt.missionId, mission.id);
      assert.equal(store.progress('other-pilot', mission.id).completed, false);
    }
    const seed = new DatabaseSync(path);
    seed.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
      .run('qa-pilot', missions[23].id, 'fixture-24', 25000);
    seed.close();
    const reopened = new JourneyAttemptStore(path);
    assert.equal(missions.filter(mission => reopened.progress('qa-pilot', mission.id).completed).length, 24);
    assert.equal(reopened.progress('qa-pilot', missions[23].id).completed, true);
    assert.throws(() => reopened.launch('qa-pilot', 'trainer', 26000, 'journey-dallas-25'), /Unknown Journey mission/);
    assert.equal(reopened.launch('qa-pilot', 'trainer', 27000, missions[23].id).missionId, missions[23].id);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('staging-era Journey rows and progress survive the additive mission schema upgrade', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-upgrade-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL);
      INSERT INTO player_profiles VALUES ('existing-pilot',700,0);
      CREATE TABLE journey_attempts (
        attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL,
        city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL, target_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('READY','APPROACH','RACING','COMPLETED','FAILED','ABANDONED')),
        gate_index INTEGER NOT NULL DEFAULT 0 CHECK(gate_index BETWEEN 0 AND 4),
        created_at INTEGER NOT NULL, started_at INTEGER, deadline_at INTEGER,
        last_gate_at INTEGER, finished_at INTEGER, finish_time_ms INTEGER,
        first_clear_credits INTEGER NOT NULL DEFAULT 0, failure_reason TEXT,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX journey_one_active_attempt ON journey_attempts(pilot_id)
        WHERE status IN ('READY','APPROACH','RACING');
      CREATE INDEX journey_attempts_pilot_created ON journey_attempts(pilot_id, created_at DESC);
      INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at)
        VALUES ('old-attempt','existing-pilot','journey-dallas-13','dallas','trainer','COMPLETED',100);
      CREATE TABLE journey_completions (
        pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL, first_attempt_id TEXT NOT NULL,
        completed_at INTEGER NOT NULL, best_time_ms INTEGER NOT NULL,
        clear_count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(pilot_id, mission_id),
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      INSERT INTO journey_completions VALUES ('existing-pilot','journey-dallas-13','old-attempt',200,100,1);
    `);
    legacy.close();
    const store = new JourneyAttemptStore(path);
    assert.equal(store.progress('existing-pilot', missions[12].id).completed, true);
    assert.equal(store.get('existing-pilot', 'old-attempt')?.missionId, missions[12].id);
    assert.equal(store.launch('existing-pilot', 'trainer', 300, missions[13].id).missionId, missions[13].id);
    const reopened = new JourneyAttemptStore(path);
    assert.equal(reopened.progress('existing-pilot', missions[12].id).firstAttemptId, 'old-attempt');
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'existing-pilot'").get().credits, 700);
    const columns = new Set(check.prepare('PRAGMA table_info(journey_attempts)').all().map(column => column.name));
    for (const name of ['championship_gate_index', 'capture_ms', 'approach_cycle', 'double_phase', 'legendary_phase', 'heart_x', 'heart_y', 'heart_z'])
      assert.equal(columns.has(name), true, name);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
