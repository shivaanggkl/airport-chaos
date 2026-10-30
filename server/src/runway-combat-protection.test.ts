import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';
import { FIRE_RATE_PER_SECOND, PROJECTILE_DAMAGE_BY_AIRCRAFT, fireIntervalMs, projectileDamageForAircraft } from '../../shared/protocol.mjs';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');

test('aircraft fire rates use the same cadence on client and server', () => {
  for (const [aircraftType, shotsPerSecond] of [
    ['trainer', 3.0],
    ['cargo', 4.2],
    ['privateJet', 4.8],
    ['fighter', 6.6],
  ] as const) {
    assert.equal(FIRE_RATE_PER_SECOND[aircraftType], shotsPerSecond);
    assert.equal(fireIntervalMs(aircraftType), 1_000 / shotsPerSecond);
  }
  assert.match(client, /fireCooldown = fireIntervalMs\(aircraftType\) \/ 1_000/);
});

test('Sky Duel uses the equipped aircraft flight envelope and resets controls at spawn', () => {
  assert.match(client, /currentAircraft = aircraftDefinitions\[aircraftType\]/);
  assert.match(server, /const envelope = aircraftFlightEnvelope\[player\.aircraftType\]/);
  assert.match(client, /skyDuelUi\?\.handle\(message\);\s*resetCrashPresentation\(\);\s*resetFlightLaunchInput\(\);\s*pitchControlStrength = 0;\s*yawControlStrength = 0;/);
  assert.match(server, /const skyDuelHealth = 100;/);
});

test('aircraft damage produces the approved regular-combat hit counts', () => {
  const lightHealth = maxHealthForAircraft('trainer');
  const heavyHealth = maxHealthForAircraft('fighter');
  for (const [aircraftType, damage, lightHits, heavyHits] of [
    ['trainer', 25, 4, 8],
    ['cargo', 30, 4, 7],
    ['privateJet', 35, 3, 6],
    ['fighter', 40, 3, 5],
  ] as const) {
    assert.equal(PROJECTILE_DAMAGE_BY_AIRCRAFT[aircraftType], damage);
    assert.equal(projectileDamageForAircraft(aircraftType), damage);
    assert.equal(Math.ceil(lightHealth / damage), lightHits);
    assert.equal(Math.ceil(heavyHealth / damage), heavyHits);
  }
  assert.match(server, /damage: damageOverride \?\? projectileDamageForAircraft\(player\.aircraftType\)/);
  assert.match(server, /if \(owner\.skyDuelMatchId\)[\s\S]*const dealt = Math\.min\(victim\.health, damage\)/);
  assert.match(server, /applyCombatHit\(projectile\.ownerId, hitPlayerId, projectile\.cityId, now, projectile\.damage/);
});

test('grounded runway aircraft can fire, be targeted, and take projectile damage', () => {
  assert.doesNotMatch(client, /if \(onGround\) return 'protection'/);
  assert.doesNotMatch(server, /runwayCombatProtected|runwayCombatProtectionActive|runway_protected/);
  assert.match(server, /function fireBlockReason[\s\S]*player\.lifeState !== 'alive'[\s\S]*fireIntervalMs\(player\.aircraftType\)[\s\S]*now - player\.lastFireAt < interval/);
  assert.match(server, /function applyCombatHit[\s\S]*victim\.lifeState !== 'alive' \|\| now < victim\.spawnProtectedUntil/);
  assert.match(server, /function updateProjectiles[\s\S]*now < player\.spawnProtectedUntil[\s\S]*projectileImpactFraction/);
});

test('temporary spawn protection remains independent of runway state', () => {
  assert.match(server, /now < target\.spawnProtectedUntil/);
  assert.match(server, /now < victim\.spawnProtectedUntil/);
  assert.match(server, /now < player\.spawnProtectedUntil/);
  assert.match(server, /player\.spawnProtectedUntil = now \+ spawnProtectionMs/);
});
