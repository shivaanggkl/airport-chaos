import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { JourneyAttemptStore } from './journey-attempts.js';
import * as missions from '../../shared/journey-mission.mjs';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.ts';

for (const missionId of missions.journeyMissionOrder.slice(18)) test(`${missionId}: six-minute Journey timer matches the authoritative deadline and retry`, () => {
  const mission = Object.values(missions).find(value => value?.id === missionId);
  assert.equal(mission.timeLimitMs, 360_000);
  assert.equal(missionJourneyDetails[missions.journeyMissionSlot(missionId) - 1].timeLimit, '6:00');
  const directory = mkdtempSync(join(tmpdir(), 'monster-timer-'));
  try {
    const path = join(directory, 'profiles.sqlite'), database = new DatabaseSync(path);
    database.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
    database.close();
    const store = new JourneyAttemptStore(path, true);
    function start(now) {
      const launched = store.launch('pilot', 'trainer', now, missionId);
      store.approach('pilot', launched.attemptId, now + 1);
      const active = store.startMonsterArrival('pilot', launched.attemptId, now + 2);
      assert.equal(active.deadlineAt, now + 2 + 360_000);
      return active;
    }
    const first = start(1000);
    assert.equal(store.hitMonster('pilot', first.attemptId, first.deadlineAt, mission.bossHealth), undefined);
    assert.equal(store.fail('pilot', first.attemptId, 'TIME_UP', first.deadlineAt).status, 'FAILED');
    assert.equal(store.progress('pilot', missionId).completed, false);
    const retry = start(first.deadlineAt + 1000);
    const finished = store.hitMonster('pilot', retry.attemptId, retry.deadlineAt - 1, mission.bossHealth);
    assert.equal(finished.status, 'COMPLETED');
    assert.equal(finished.firstClearCredits, mission.firstClearCredits);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
