import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { journeyCatalog } from '../../shared/journey-mission.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { JourneyAttemptStore } from './journey-attempts.js';

const stages = journeyCatalog.filter(item => item.implementation === 'playable');

test('all playable missions preserve identity, progress and time through pause/resume, and abandon only the chosen attempt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'journey-actions-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const profiles = new PlayerProfileStore(path); const before = profiles.getOrCreate('pilot', 'Pilot').credits;
    const store = new JourneyAttemptStore(path, true), db = new DatabaseSync(path);
    try {
      for (const stage of stages) {
        const launched = store.launch('pilot', 'trainer', 1000, stage.id);
        store.approach('pilot', launched.attemptId, 1100);
        // Represent an accepted in-flight checkpoint without simulating unrelated combat.
        db.prepare("UPDATE journey_attempts SET status='RACING',started_at=2000,deadline_at=182000,capture_ms=8000 WHERE attempt_id=?").run(launched.attemptId);
        const original = store.get('pilot', launched.attemptId)!;
        assert.equal(store.pause('other', launched.attemptId, 3000), undefined);
        assert.equal(store.pause('pilot', launched.attemptId, 3000)!.pausedAt, 3000);
        assert.equal(store.pause('pilot', launched.attemptId, 4000)!.pausedAt, 3000, 'repeat pause cannot reset its expiry');
        assert.equal(store.resume('other', launched.attemptId, 8000), undefined);
        const resumed = store.resume('pilot', launched.attemptId, 8000)!.attempt;
        assert.equal(resumed.missionId, stage.id); assert.equal(resumed.status, 'RACING');
        assert.equal(resumed.deadlineAt, original.deadlineAt! + 5000); assert.equal(resumed.captureMs, original.captureMs);
        assert.equal(resumed.gateIndex, original.gateIndex); assert.equal(resumed.targetHealth, original.targetHealth);
        assert.equal(store.resume('pilot', launched.attemptId, 8001), undefined);
        assert.equal(store.abandon('other', launched.attemptId, 9000), undefined);
        assert.equal(store.get('pilot', launched.attemptId)!.status, 'RACING');
        assert.equal(store.abandon('pilot', launched.attemptId, 9000)!.status, 'ABANDONED');
        assert.equal(store.resume('pilot', launched.attemptId, 9001), undefined);
      }
      assert.equal(profiles.getOrCreate('pilot', 'Pilot').credits, before, 'menu actions never award credits');
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('pause and resume buttons send the current attempt ID for every playable mission and reject disconnected input', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
  const code = ts.transpileModule(tree.statements.filter(node => ts.isFunctionDeclaration(node) &&
    ['pauseJourney', 'resumeJourney'].includes(node.name?.text ?? '')).map(node => node.getText(tree)).join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const stage of stages) {
    const messages: { type: string; attemptId: string }[] = [];
    const attemptId = `attempt-${stage.number}`;
    const context = createContext({ journeyMode: true, journeyPauseSupported: true, journeyPaused: false,
      flightExitPending: false, journeyAttempt: { missionId: stage.id, status: 'RACING' }, journeyAttemptId: attemptId,
      journeyPauseRequestPendingUntil: 0, journeyResumePending: false, journeyPauseDeadlineAt: Date.now() + 60000,
      connectionReady: () => true, sendLocalState() {}, updateJourneyPauseCountdown() {},
      socket: { send: (text: string) => messages.push(JSON.parse(text)) },
      setJourneyPaused: (paused: boolean) => { context.journeyPaused = paused; }, window: { setTimeout() {} },
    });
    runInContext(code, context); runInContext('pauseJourney(); pauseJourney(); resumeJourney(); resumeJourney()', context);
    assert.deepEqual(messages, [{ type: 'journeyPause', attemptId }, { type: 'journeyResume', attemptId }]);
    messages.length = 0; context.journeyPaused = false; context.journeyResumePending = false;
    context.connectionReady = () => false;
    runInContext('pauseJourney()', context); context.journeyPaused = true; runInContext('resumeJourney()', context);
    assert.deepEqual(messages, []);
  }
});

test('all mission result buttons choose retry, completion return, and Journey exit correctly', async () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const start = main.indexOf("journeyResultElement.querySelector<HTMLButtonElement>('[data-journey-primary]')!.addEventListener");
  const code = ts.transpileModule(main.slice(start, main.indexOf('registerUiBackLayer(', start)),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const stage of stages) {
    const handlers = new Map<string, () => void>(), actions: string[] = [];
    const context = createContext({ trainingResultActive: false, flightEndResultActive: false,
      journeyAttempt: { missionId: stage.id, status: 'COMPLETED' },
      journeyResultElement: { querySelector: (selector: string) => ({ addEventListener: (_event: string, callback: () => void) => handlers.set(selector, callback) }) },
      exitFlightToHub: async (garage: boolean, journey: boolean) => { actions.push(`exit:${garage}:${journey}`); },
      retryJourneyMission: async () => { actions.push('retry'); },
    });
    runInContext(code, context);
    handlers.get('[data-journey-primary]')!();
    assert.deepEqual(actions, ['exit:false:true'], `M${stage.number} success Continue`);
    actions.length = 0; context.journeyAttempt.status = 'FAILED'; handlers.get('[data-journey-primary]')!();
    assert.deepEqual(actions, ['retry'], `M${stage.number} failure Retry`);
    actions.length = 0; handlers.get('[data-journey-exit]')!();
    assert.deepEqual(actions, ['exit:false:true'], `M${stage.number} Exit to Journey`);
  }
});
