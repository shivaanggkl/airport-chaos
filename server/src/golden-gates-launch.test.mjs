import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as missions from '../../shared/journey-mission.mjs';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { dallasElevationAt } from './dallas-elevation.js';
import { JourneyAttemptStore } from './journey-attempts.js';

function parse(file) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
}
function find(ast, predicate) {
  let found;
  function visit(node) { if (predicate(node)) { found ??= node; } else ts.forEachChild(node, visit); }
  visit(ast); assert(found, 'expected launch code exists'); return found;
}
function evaluate(node, ast, context) {
  return vm.runInNewContext(ts.transpileModule(`(${node.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
const server = parse('./index.ts'), client = parse('../../client/src/main.ts');
const airborne = find(server, n => ts.isVariableDeclaration(n) && n.name.getText(server) === 'airborneSpawn').initializer;
const initial = find(server, n => ts.isVariableDeclaration(n) && n.name.getText(server) === 'initialAcceptedPosition').initializer;
const welcome = find(server, n => ts.isSpreadAssignment(n) && n.expression.getText(server).includes('!restoringPausedJourney && airborneSpawn ? { airborneSpawn } : {}')).expression;
const spawnBlock = find(client, n => ts.isIfStatement(n) && n.expression.getText(client) === 'journeyMode && message.airborneSpawn' && n.thenStatement.getText(client).includes('spawnPosition.set')).thenStatement;
const flyingBlock = find(client, n => ts.isIfStatement(n) && n.expression.getText(client) === 'journeyMode && message.airborneSpawn' && n.thenStatement.getText(client).includes('onGround = false')).thenStatement;
const races = [1,2,3,4,5,6].map(n => missions[`journeyDallas0${n}`]);
function serverContext(attempt) {
  return { ...missions, authorizedJourneyAirborneSpawn, journeyAttempt: attempt, dallasTerrain: { elevationAt: dallasElevationAt } };
}

test('actual server launch/welcome and client welcome start every Golden Gates race airborne, including retry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'golden-launch-')), path = join(dir, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
  try {
    const store = new JourneyAttemptStore(path, true);
    for (const mission of races) for (let retry = 0; retry < 2; retry++) {
      const launched = store.launch('pilot', 'trainer', 1000, mission.id);
      const attempt = store.approach('pilot', launched.attemptId, 1100);
      const context = serverContext(attempt), spawn = evaluate(airborne, server, context);
      assert(spawn, `${mission.name}: server must select its airborne spawn`);
      assert.equal(spawn.position.x, mission.airborneSpawn.x);
      assert.equal(spawn.position.z, mission.airborneSpawn.z);
      assert.equal(spawn.position.y, dallasElevationAt(spawn.position.x, spawn.position.z) + mission.airborneSpawn.altitude);
      assert.equal(spawn.heading, mission.airborneSpawn.heading); assert.equal(spawn.speed, 650);
      const accepted = evaluate(initial, server, { ...context, airborneSpawn: spawn,
        expectedInitialTransform() { assert.fail('Golden Gates launch fell back to a runway'); } });
      assert.equal(accepted, spawn.position);
      assert.equal(evaluate(welcome, server, { airborneSpawn: spawn, restoringPausedJourney: false }).airborneSpawn, spawn);
      assert.equal(evaluate(welcome, server, { airborneSpawn: spawn, restoringPausedJourney: true }).airborneSpawn, undefined);
      let flightState;
      const local = vm.createContext({ ...missions, message: { airborneSpawn: spawn }, journeyAttempt: attempt,
        spawnPosition: new THREE.Vector3(), airplane: new THREE.Group(), velocity: new THREE.Vector3(),
        missionStartCountdownPending: true, airborneIntroAwaiting: true, onGround: true, crashed: true,
        mobileInput: { setThrottleState() {} }, setFlightState: state => { flightState = state; }, updateCamera() {} });
      for (const block of [spawnBlock, flyingBlock])
        vm.runInContext(ts.transpileModule(block.getText(client), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, local);
      assert.deepEqual(local.airplane.position.toArray(), [spawn.position.x, spawn.position.y, spawn.position.z]);
      assert.equal(local.onGround, false); assert.equal(local.currentSpeed, 650); assert.equal(flightState, 'FLYING');
      assert(Math.abs(local.velocity.length() - 650) < 1e-8);
      assert.equal(local.runStarted, false, 'airborne start still waits for the intro/countdown');
      assert.equal(store.abandon('pilot', attempt.attemptId, 1200).status, 'ABANDONED');
    }
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the real launch selector cannot create an airborne Golden Gates spawn without an authorized APPROACH attempt', () => {
  for (const mission of races) for (const status of ['READY', 'RACING', 'FAILED', 'COMPLETED', 'ABANDONED'])
    assert.equal(evaluate(airborne, server, serverContext({ missionId: mission.id, status })), undefined);
  for (const attempt of [undefined, { missionId: 'unknown', status: 'APPROACH' }, { missionId: missions.journeyDallas13.id, status: 'APPROACH' }])
    assert.equal(evaluate(airborne, server, serverContext(attempt)), undefined);
});
