import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';

test('legacy pilot identity can be bound once and cookie—not query ID—is authority', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-session-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const sessions = new PilotSessionStore(databasePath);
  const legacy = profiles.getOrCreate('legacy-pilot-000001', 'Legacy');
  const first = sessions.issue(legacy.pilotId, profiles.hasProfile(legacy.pilotId), 1_000);
  assert.equal(first.pilotId, legacy.pilotId);
  assert.equal(sessions.resolve(`airport_chaos_session=${first.cookie}`, 2_000), legacy.pilotId);
  const attacker = sessions.issue(legacy.pilotId, profiles.hasProfile(legacy.pilotId), 3_000);
  assert.notEqual(attacker.pilotId, legacy.pilotId);
  profiles.getOrCreate(attacker.pilotId, 'Fresh');
  const lostCookieAttempt = sessions.issue(attacker.pilotId, true, 4_000);
  assert.notEqual(lostCookieAttempt.pilotId, attacker.pilotId);
  assert.match(sessions.cookie(first.cookie, true), /HttpOnly; SameSite=Lax; Path=\/;.*; Secure/);
});
