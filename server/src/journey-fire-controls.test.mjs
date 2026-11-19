import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { journeyMissionOrder } from '../../shared/journey-mission.mjs';
import { fireIntervalMs } from '../../shared/protocol.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['localFireBlockReason', 'fireWeaponOnce'].map(name =>
  ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join('\n');
const compiled = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(missionId) {
  const sent = [], blocked = [];
  const context = vm.createContext({
    journeyMode: true, journeyAttempt: { missionId, status: 'RACING', pausedAt: null },
    portalInTransit: false, cinematic: false, launchCinematicBlocksInput: () => context.cinematic,
    flightTutorial: { isOpen: () => false }, crashed: false, runStarted: true,
    localPlayerId: 'pilot', localLifeState: 'alive', skyDuelMode: false,
    connectionReady: () => true, fireCooldown: 0, aircraftType: 'trainer', fireIntervalMs,
    sendFireIntent: () => { sent.push('fire'); return true; }, reportFireBlocked: reason => blocked.push(reason),
  });
  vm.runInContext(compiled, context);
  return { context, sent, blocked };
}

test('every playable mission permits ordinary firing without changing aircraft cadence', () => {
  for (const id of journeyMissionOrder) {
    const { context, sent, blocked } = fixture(id);
    assert.equal(context.fireWeaponOnce(), true, id);
    assert.deepEqual(sent, ['fire'], id);
    assert.equal(context.fireCooldown, fireIntervalMs('trainer') / 1000);
    assert.equal(context.fireWeaponOnce(), false, `${id}: cooldown still applies`);
    assert.deepEqual(blocked, ['cooldown']);
  }
});

test('mission firing still respects cinematics, lifecycle and connection failures', () => {
  for (const [changes, expected] of [
    [{ cinematic: true }, 'cinematic'], [{ crashed: true }, 'invalid_state'],
    [{ localLifeState: 'respawning' }, 'protection'], [{ connectionReady: () => false }, 'socket'],
  ]) {
    const { context, sent, blocked } = fixture('journey-dallas-01');
    Object.assign(context, changes);
    assert.equal(context.fireWeaponOnce(), false);
    assert.deepEqual(sent, []);
    assert.deepEqual(blocked, [expected]);
  }
});
