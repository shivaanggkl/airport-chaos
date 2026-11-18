import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { CombatMissionIntroPath } from '../../client/src/mission-combat-intro.ts';

const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = main.indexOf('    const hiddenBot = remote.isBot && (');
const end = main.indexOf('\n    if (hiddenBot)', start);
assert.ok(start >= 0 && end > start);
const update = main.slice(start, end);
function visible(number, assigned, active = true) {
 const plane = {}, other = {};
 const remote = { isBot: true, lifeState: 'alive', playerId: 'bot', plane };
 const context = vm.createContext({ remote, missionCombatIntroPath: { missionNumber: number, opponent: assigned ? plane : other },
  flightLaunchState: active ? 'active' : 'idle', transportEscortInactive: () => false,
  missionFocus: { showAmbientAIAircraft: true }, unrelatedFocusedBot: () => false });
 vm.runInContext(update, context);
 return remote.plane.visible;
}
test('M20 assigned live opponent stays visible; unrelated bots retain intro hiding', () => {
 assert.equal(visible(20, true), true);
 assert.equal(visible(20, false), false);
 assert.equal(visible(20, false, false), true);
 assert.equal(visible(15, true), true);
 assert.equal(visible(7, false), false);
});
test('M20 streams the same aircraft that each reveal shot frames, without moving gameplay actors', () => {
 const enemy = new THREE.Group(), player = new THREE.Group();
 enemy.add(new THREE.Mesh(new THREE.BoxGeometry(24, 6, 30), new THREE.MeshBasicMaterial()));
 player.add(new THREE.Mesh(new THREE.BoxGeometry(30, 8, 36), new THREE.MeshBasicMaterial()));
 enemy.position.set(-17000, 1200, -18500); player.position.set(-49000, 5, -41000);
 const originalEnemy = enemy.position.clone(), originalPlayer = player.position.clone();
 const path = new CombatMissionIntroPath(enemy, player, 20);
 const position = new THREE.Vector3(), target = new THREE.Vector3();
 const chase = player.position.clone().add(new THREE.Vector3(0, 8, 35));
 for (const elapsed of [0, 1000, 2999, 3000, 4999, 5000, 7999, 8000, 10000]) {
  path.sample(elapsed, position, target, chase, player.position);
  const actor = elapsed < 3000 || elapsed >= 5000 && elapsed < 8000 ? enemy : player;
  assert.equal(path.streamingPosition(elapsed), actor.position);
  if (elapsed < 8000) assert.ok(target.distanceTo(actor.position) < 1e-6);
  assert.ok(position.distanceTo(target) > 1);
 }
 assert.deepEqual(enemy.position, originalEnemy);
 assert.deepEqual(player.position, originalPlayer);
 assert.ok(position.distanceTo(chase) < 1e-6, 'intro ends at the existing chase camera');
});
