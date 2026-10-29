import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { JourneyAttemptStore } from './journey-attempts.js';
import { PlayerProfileStore } from './player-profiles.js';
import { localJourneyQaUnlockEnabled, stagingJourneyQaPilotUnlockEnabled, stagingJourneyQaUnlockEnabled } from './staging-journey-qa.js';

test('local QA unlock requires a disposable database and cannot activate in production or Render', () => {
  const local = {
    AIRPORT_CHAOS_LOCAL_QA_UNLOCK_ALL: 'true', AIRPORT_CHAOS_DEV_QA: '1',
    AIRPORT_CHAOS_PROFILE_DB: '/private/tmp/airport-chaos-monster-qa.sqlite',
  };
  assert.equal(localJourneyQaUnlockEnabled(local), true);
  assert.equal(localJourneyQaUnlockEnabled({ ...local, NODE_ENV: 'production' }), false);
  assert.equal(localJourneyQaUnlockEnabled({ ...local, RENDER_SERVICE_ID: 'srv-production' }), false);
  assert.equal(localJourneyQaUnlockEnabled({ ...local, AIRPORT_CHAOS_PROFILE_DB: '/srv/profiles.sqlite' }), false);
  assert.equal(localJourneyQaUnlockEnabled({ ...local, AIRPORT_CHAOS_DEV_QA: '0' }), false);
});

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
  assert.equal(stagingJourneyQaPilotUnlockEnabled({ ...staging, JOURNEY_STAGING_UNLOCK_ALL: 'false' }), true);
  assert.equal(stagingJourneyQaPilotUnlockEnabled({ ...staging, RENDER_SERVICE_ID: 'production-service' }), false);
  assert.equal(stagingJourneyQaPilotUnlockEnabled({ ...staging, RENDER_GIT_BRANCH: 'main' }), false);
});

test('staging per-pilot QA access unlocks missions only for the granted pilot without false clears or rewards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-journey-pilot-qa-'));
  const path = join(directory, 'profiles.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('qa-pilot', 100, 50), ('other-pilot', 100, 50)");
  setup.close();
  try {
    const normal = new JourneyAttemptStore(path);
    const database = new DatabaseSync(path);
    database.prepare('INSERT INTO journey_qa_unlocked_pilots (pilot_id, granted_at) VALUES (?, ?)').run('qa-pilot', 1_000);
    database.close();
    assert.equal(normal.qaMissionAccess('qa-pilot'), false);
    assert.throws(() => normal.launch('qa-pilot', 'trainer', 1_000, 'journey-dallas-24'), /locked/);

    const staging = new JourneyAttemptStore(path, false, true);
    assert.equal(staging.qaMissionAccess('qa-pilot'), true);
    assert.equal(staging.qaMissionAccess('other-pilot'), false);
    assert.equal(staging.launch('qa-pilot', 'trainer', 1_000, 'journey-dallas-24').missionId, 'journey-dallas-24');
    assert.throws(() => staging.launch('other-pilot', 'trainer', 1_000, 'journey-dallas-24'), /locked/);
    assert.equal(staging.progress('qa-pilot', 'journey-dallas-24').completed, false);
    const verify = new DatabaseSync(path);
    assert.equal((verify.prepare('SELECT COUNT(*) AS count FROM journey_completions').get() as { count: number }).count, 0);
    assert.deepEqual(verify.prepare('SELECT pilot_id, credits, sky_tokens FROM player_profiles ORDER BY pilot_id').all().map(row => ({ ...row })), [
      { pilot_id: 'other-pilot', credits: 100, sky_tokens: 50 },
      { pilot_id: 'qa-pilot', credits: 100, sky_tokens: 50 },
    ]);
    verify.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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

test('local QA grants every aircraft with a usable appearance without changing balances', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-aircraft-qa-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const regular = new PlayerProfileStore(path);
    const existing = regular.getOrCreate('existing-pilot', 'Pilot');
    const startingCredits = existing.credits;
    assert.deepEqual(existing.unlockedAircraft, ['trainer']);

    const qa = new PlayerProfileStore(path, true, true);
    for (const pilotId of ['existing-pilot', 'new-pilot']) {
      const profile = qa.getOrCreate(pilotId, 'Pilot');
      assert.deepEqual(profile.unlockedAircraft, ['trainer', 'cargo', 'privateJet', 'fighter']);
      assert.equal(profile.tutorial.dallasUnlocked, true);
      assert.equal(profile.cosmetics.equipped['livery:cargo'], 'mammoth-sand');
      assert.equal(profile.cosmetics.equipped['livery:privateJet'], 'nightowl-sky-blue');
      for (const id of ['nightowl-sky-blue', 'nightowl-sunset-red', 'nightowl-forest-green', 'nightowl-premium-gold']) {
        assert.ok(profile.cosmetics.ownedIds.includes(id));
      }
      assert.equal(profile.cosmetics.equipped['livery:fighter'], 'firehawk-inferno');
      assert.equal(profile.credits, startingCredits);
      assert.equal(profile.skyTokens, 0);
    }
    const reopened = new PlayerProfileStore(path);
    assert.deepEqual(reopened.getOrCreate('existing-pilot', 'Pilot').unlockedAircraft, ['trainer', 'cargo', 'privateJet', 'fighter']);
    assert.equal(reopened.getOrCreate('existing-pilot', 'Pilot').tutorial.dallasUnlocked, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
