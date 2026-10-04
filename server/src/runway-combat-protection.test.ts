import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');

test('grounded runway aircraft can fire, be targeted, and take projectile damage', () => {
  assert.doesNotMatch(client, /if \(onGround\) return 'protection'/);
  assert.doesNotMatch(server, /runwayCombatProtected|runwayCombatProtectionActive|runway_protected/);
  assert.match(server, /function fireBlockReason[\s\S]*player\.lifeState !== 'alive'[\s\S]*now - player\.lastFireAt < fireCooldownMs/);
  assert.match(server, /function applyCombatHit[\s\S]*victim\.lifeState !== 'alive' \|\| now < victim\.spawnProtectedUntil/);
  assert.match(server, /function updateProjectiles[\s\S]*now < player\.spawnProtectedUntil[\s\S]*sweptProjectileHit/);
});

test('temporary spawn protection remains independent of runway state', () => {
  assert.match(server, /now < target\.spawnProtectedUntil/);
  assert.match(server, /now < victim\.spawnProtectedUntil/);
  assert.match(server, /now < player\.spawnProtectedUntil/);
  assert.match(server, /player\.spawnProtectedUntil = now \+ spawnProtectionMs/);
});
