import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cityCapabilities } from '../../shared/city-registry.mjs';
import { missionsForCity } from '../../shared/city-missions.mjs';
import { PlayerProfileStore } from './player-profiles.js';

const clientMain = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const serverMain = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('Dallas and Milwaukee expose opposite gameplay capabilities', () => {
  assert.deepEqual(cityCapabilities('dallas'), {
    tutorialEnabled: false, practiceMode: false, progressionEnabled: true, territoriesEnabled: true, competitiveEnabled: true,
  });
  assert.deepEqual(cityCapabilities('milwaukee'), {
    tutorialEnabled: true, practiceMode: true, progressionEnabled: false, territoriesEnabled: false, competitiveEnabled: false,
  });
});

test('Milwaukee missions are explicitly practice-only and award nothing', () => {
  const missions = missionsForCity('milwaukee');
  assert.deepEqual(missions.map(({ id }) => id), ['first-flight', 'straight-run']);
  assert.ok(missions.every(({ displayName, description, creditReward, scoreReward }) =>
    displayName.startsWith('PRACTICE —') && /no rewards/i.test(description) && creditReward === 0 && scoreReward === 0));

  const directory = mkdtempSync(join(tmpdir(), 'airport-practice-mission-'));
  try {
    const store = new PlayerProfileStore(join(directory, 'profiles.sqlite'));
    const initial = store.getOrCreate('practice-pilot-00001', 'Practice Pilot');
    const accepted = store.acceptMission(initial.pilotId, 'milwaukee', 'first-flight', false, undefined, 1_000);
    const attempt = accepted.profile!.missions.milwaukee!.active!;
    const completed = store.completeMission(initial.pilotId, 'milwaukee', attempt.attemptId, 62_000)!;
    assert.equal(completed.credits, 0);
    assert.equal(completed.score, 0);
    assert.equal(completed.profile.credits, initial.credits);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('tutorial combat no longer suppresses Fire on either side of the protocol', () => {
  assert.doesNotMatch(clientMain, /function fireWeaponOnce\(\): boolean \{\s*if \(guidedTutorialActive\) return false;/);
  assert.doesNotMatch(clientMain, /function updateCombatTarget\(delta = 0\): void \{\s*if \(guidedTutorialActive\)/);
  assert.doesNotMatch(serverMain, /if \(message\.type === 'fire'\) \{\s*if \(player\.tutorialMode\) return;/);
  assert.match(clientMain, /if\(active\)\{heldActions\.add\(action\);runStarted=true;if\(action==='fire'\)fireWeaponOnce\(\);\}/);
  assert.match(clientMain, /fireCooldown = Math\.max\(0, fireCooldown - delta\)/);
  assert.match(clientMain, /if \(!sendFireIntent\(\)\)[\s\S]*fireCooldown = 0\.25/);
});

test('tutorial entry is city-scoped and practice progression is server-authoritative', () => {
  assert.match(bootstrap, /if \(!cityCapabilities\(city\.id\)\?\.tutorialEnabled\) return;/);
  assert.doesNotMatch(bootstrap, /tutorialChoice === 'started'[\s\S]*city\.id === 'dallas'/);
  assert.match(bootstrap, /tutorialChoice === 'started'\) window\.dispatchEvent\(new Event\('airport-chaos-start-tutorial'\)\)/);
  assert.match(clientMain, /addEventListener\('airport-chaos-start-tutorial',\(\)=>setGuidedTutorial\(true\)\)/);
  assert.match(clientMain, /profile\.tutorial\.status !== 'new'[\s\S]*profile\.totalDistance > 500[\s\S]*dallasPracticeSuggestionElement\.hidden = false/);
  assert.match(clientMain, /practiceSuggestion: true/);
  assert.match(serverMain, /tutorialMode:Boolean\(cityCapabilities\(cityId\)\?\.tutorialEnabled&&profile\.tutorial\.status==='started'\)/);
  assert.match(serverMain, /if \(!progressionEnabled\(player\)\) \{ sendProfile\(playerId, player\.profile\); return; \}/);
  assert.match(serverMain, /const eligibleForReward = isHumanPilot\(killer\) && progressionEnabled\(killer\)/);
});
