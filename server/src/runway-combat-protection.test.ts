import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runwayCombatProtectionActive } from '../../shared/runway-combat-protection.mjs';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');

test('runway protection requires authoritative alive, grounded, non-airborne state', () => {
  assert.equal(runwayCombatProtectionActive({ lifeState: 'alive', airborne: false, groundedAtRunway: true }), true);
  assert.equal(runwayCombatProtectionActive({ lifeState: 'alive', airborne: true, groundedAtRunway: true }), false);
  assert.equal(runwayCombatProtectionActive({ lifeState: 'alive', airborne: false, groundedAtRunway: false }), false);
  assert.equal(runwayCombatProtectionActive({ lifeState: 'destroyed', airborne: false, groundedAtRunway: true }), false);
});

test('server blocks protected firing and damage on both sides of a hit', () => {
  assert.match(server, /fireBlockReason\(playerId, player, now\)/);
  assert.match(server, /if \(runwayCombatProtected\(playerId, player\)\) return 'runway_protected'/);
  assert.match(server, /runwayCombatProtected\(ownerId, owner\) \|\| runwayCombatProtected\(victimId, victim\)/);
  assert.match(server, /runwayCombatProtected\(projectile\.ownerId, owner\)/);
  assert.match(server, /now < player\.spawnProtectedUntil \|\|\s*runwayCombatProtected\(playerId, player\)/);
  assert.match(server, /runwayCombatProtected\(firstId, first\) \|\| runwayCombatProtected\(secondId, second\)/);
  assert.match(client, /if \(onGround\) return 'protection'/);
});

test('protection is derived from server flight state and runway geometry', () => {
  assert.match(server, /const airborne = player\.isBot \? !botGroundedPhase : landingFlightState\.get\(playerId\)\?\.airborne/);
  assert.match(server, /groundedAtRunway: player\.hasRespawnTransform && Boolean\(runwayOrTaxiSpawnArea\(player\)\)/);
  assert.match(server, /function runwayOrTaxiSpawnArea[\s\S]*Math\.abs\(player\.position\.y - groundY\) > 6/);
  assert.match(server, /player\.position\.y >= flight\.baselineY \+ 8\) flight\.airborne = true/);
  assert.match(server, /landingFlightState\.set\(playerId, \{ baselineY: player\.position\.y, airborne: false \}\)/);
});
