import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { combatThreatDirection } from '../../shared/combat-warning.mjs';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('threat direction follows the player-relative radar bearing', () => {
  assert.equal(combatThreatDirection(0, 1), '↑');
  assert.equal(combatThreatDirection(1, 1), '↗');
  assert.equal(combatThreatDirection(1, 0), '→');
  assert.equal(combatThreatDirection(1, -1), '↘');
  assert.equal(combatThreatDirection(0, -1), '↓');
  assert.equal(combatThreatDirection(-1, -1), '↙');
  assert.equal(combatThreatDirection(-1, 0), '←');
  assert.equal(combatThreatDirection(-1, 1), '↖');
  assert.equal(combatThreatDirection(Number.NaN, 0), '↑');
});

test('server warning events reuse authoritative human and bot combat state', () => {
  assert.match(server, /sendToPlayer\(previousTargetId, \{ type: 'combatThreat', attackerId: playerId, locked: false \}\)/);
  assert.match(server, /sendToPlayer\(targetId, \{ type: 'combatThreat', attackerId: playerId, locked: true \}\)/);
  assert.match(server, /if \(targetId\) sendToPlayer\(targetId, \{ type: 'combatThreat', attackerId: playerId, locked: true \}\)/);
  assert.match(server, /const botLockTargetId = combatTarget && combatSolution && !combatSolution\.reason/);
  assert.match(server, /setServerLock\(botId, player, botLockTargetId\)/);
  assert.match(server, /player\.lastFireAt = now;\s*sendIncomingFire\(targetId, playerId\);\s*const muzzle/);
  assert.match(server, /if \(player\.lockedTargetId === targetId\) sendIncomingFire\(targetId, botId\)/);
  assert.doesNotMatch(server, /combatThreat[\s\S]{0,120}(?:hunterDetectionRange|radarRange)/);
});

test('one shared warning drives HUD, radar, audio, and stale-threat cleanup', () => {
  assert.match(html, /id="combat-threat-warning"[^>]*role="alert"/);
  assert.match(client, /const lockingThreatIds = new Set<string>\(\)/);
  assert.match(client, /const primary = incoming && remoteIdentityVisible\(incoming\) \? incoming : nearest/);
  assert.match(client, /lockingThreatIds\.has\(human\.playerId\)/);
  assert.match(client, /lockingThreatIds\.has\(remote\.playerId\)/);
  assert.match(client, /if \(!remote \|\| !remoteIdentityVisible\(remote\) \|\| now - \(lockingThreatSeenAt\.get\(attackerId\)/);
  assert.match(client, /> 1_000\)/);
  assert.match(client, /if \(!lockingThreatIds\.has\(attackerId\)\) return/);
  assert.match(client, /playLockWarningSound\(\)/);
  assert.match(client, /playIncomingWarningSound\(\)/);
  assert.match(css, /\.combat-threat-warning\.incoming/);
  assert.match(css, /\.combat-threat-warning\.hidden\s*\{[^}]*opacity:\s*0/);
});
