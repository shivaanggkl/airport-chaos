import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { JourneyAttemptStore } from './journey-attempts.js';
import { stagingJourneyQaUnlockEnabled } from './staging-journey-qa.js';

test('QA unlock requires the explicit switch on the exact staging service and branch', () => {
  const staging = {
    JOURNEY_STAGING_UNLOCK_ALL: 'true',
    RENDER_SERVICE_ID: 'srv-db246fflot8c73dp2p40',
    RENDER_GIT_BRANCH: 'staging',
  };
  assert.equal(stagingJourneyQaUnlockEnabled(staging), true);
  assert.equal(stagingJourneyQaUnlockEnabled({ ...staging, JOURNEY_STAGING_UNLOCK_ALL: 'false' }), false);
  assert.equal(stagingJourneyQaUnlockEnabled({ ...staging, RENDER_SERVICE_ID: 'production-service' }), false);
  assert.equal(stagingJourneyQaUnlockEnabled({ ...staging, RENDER_GIT_BRANCH: 'main' }), false);
});

test('QA unlock allows every Dallas mission without recording false completion or credits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-qa-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('qa-pilot', 0, 0)");
  setup.close();
  try {
    const normal = new JourneyAttemptStore(path);
    assert.throws(() => normal.launch('qa-pilot', 'trainer', 1_000, 'journey-dallas-24'), /locked/);
    const qa = new JourneyAttemptStore(path, true);
    for (let number = 1; number <= 24; number += 1) {
      const missionId = `journey-dallas-${String(number).padStart(2, '0')}`;
      assert.equal(qa.launch('qa-pilot', 'trainer', 1_000 + number, missionId).missionId, missionId);
      assert.equal(qa.progress('qa-pilot', missionId).completed, false);
    }
    assert.throws(() => qa.launch('qa-pilot', 'trainer', 2_000, 'journey-dallas-25'), /Unknown/);
    const verify = new DatabaseSync(path);
    assert.equal((verify.prepare('SELECT COUNT(*) AS count FROM journey_completions').get() as { count: number }).count, 0);
    assert.equal((verify.prepare("SELECT credits FROM player_profiles WHERE pilot_id = 'qa-pilot'").get() as { credits: number }).credits, 0);
    verify.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
