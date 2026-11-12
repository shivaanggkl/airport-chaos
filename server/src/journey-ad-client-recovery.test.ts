import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('client/src/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['journeyAdRecoveryPending', 'continueJourneyWithAd'].map(name =>
  ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(ast)).join('\n');
const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(lostResponses: number) {
  const button = { disabled: false }, notice = { textContent: '' };
  const hidden = new Set<string>();
  const pose = { position: { x: 10, y: 900, z: 20 }, rotation: { x: 0, y: 1, z: 0 }, velocity: { x: 40, y: 0, z: 30 } };
  const requests: string[] = [];
  let applied = 0;
  const context = createContext({
    journeyAttempt: { attemptId: 'mission', finishedAt: 100, status: 'FAILED', canContinueAfterAd: true },
    pendingJourneyAd: { attemptId: 'mission', failureKey: 'mission:100', adAttemptId: 'receipt' },
    journeyAdBusy: false, crashed: true, runStarted: false, onGround: true, localLifeState: 'destroyed',
    heading: 0, pitch: 0, roll: 0, currentSpeed: 0, verticalSpeed: 0,
    rewardedAdProvider: { discard: async () => {}, load: () => { throw Error('must not replay ad'); } },
    journeyResultElement: { querySelector: (selector: string) => selector.includes('notice') ? notice : button,
      querySelectorAll: () => [button], classList: { add: (value: string) => hidden.add(value) } },
    airplane: { visible: false, position: { set() {} }, rotation: { set() {} } },
    velocity: { set() {} }, resetCrashPresentation() {}, cinematicDirector: { resetFlight() {} },
    applyLocalHull(health: number, maxHealth: number) { assert.equal(health, maxHealth); applied++; },
    updateHealthDisplay() {}, setFlightState() {}, setJourneyPaused() {}, updateCamera() {}, sendLocalState() {},
    apiUrl: (path: string) => path,
    apiFetch: async (path: string) => {
      requests.push(path);
      if (path.includes('attempt-status')) return { ok: true, json: async () => ({ attemptStatus: 'REWARDED' }) };
      assert.match(path, /journey-continue$/);
      // The websocket reports RACING before the HTTP response reaches the app.
      context.journeyAttempt = { attemptId: 'mission', finishedAt: null, status: 'RACING', canContinueAfterAd: false };
      if (lostResponses-- > 0) throw Error('Lost response');
      return { ok: true, json: async () => ({ health: 200, maxHealth: 200, resumeFlight: pose }) };
    },
  });
  runInContext(code, context);
  return { context, button, hidden, requests, applied: () => applied };
}

test('a lost continuation response automatically recovers the same redemption without replaying the ad', async () => {
  const f = fixture(1);
  await f.context.continueJourneyWithAd();
  assert.equal(f.requests.filter(path => path.endsWith('journey-continue')).length, 2);
  assert.equal(f.context.crashed, false);
  assert.equal(f.context.airplane.visible, true);
  assert.equal(f.context.pendingJourneyAd, undefined);
  assert.equal(f.hidden.has('hidden'), true);
  assert.equal(f.applied(), 1);
});

test('repeated lost responses leave recovery retryable even after RACING arrives', async () => {
  const f = fixture(2);
  await f.context.continueJourneyWithAd();
  assert.equal(f.context.crashed, true);
  assert.equal(f.context.journeyAttempt.status, 'RACING');
  assert.equal(f.button.disabled, false);
  assert.equal(f.hidden.has('hidden'), false);
  assert.equal(f.context.pendingJourneyAd.adAttemptId, 'receipt');
  await f.context.continueJourneyWithAd();
  assert.equal(f.context.crashed, false);
  assert.equal(f.applied(), 1);
  assert.equal(f.requests.some(path => path.endsWith('journey-attempt')), false);
});

test('a receipt from another mission cannot enable recovery for an active mission', async () => {
  const f = fixture(0);
  f.context.journeyAttempt = { attemptId: 'different', status: 'RACING', canContinueAfterAd: false };
  await f.context.continueJourneyWithAd();
  assert.equal(f.requests.length, 0);
  assert.equal(f.applied(), 0);
});
