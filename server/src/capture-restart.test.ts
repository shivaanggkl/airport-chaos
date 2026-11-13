import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function retryJourneyMission(');
const code = source.slice(start, source.indexOf("window.addEventListener('airport-chaos-city-exit'", start));

test('all playable missions restart and retry their own mission, reset progress, and replay intro/countdown', async () => {
 for (const stage of missions.journeyCatalog.filter(item => item.implementation === 'playable')) {
  for (const status of ['RACING', 'FAILED']) {
  const requests: string[] = [], button = { disabled: false }, errors: string[] = [];
  let reset = 0, reconnected = 0;
  const noop = () => {};
  const context = createContext({ ...missions, journeyMode: true,
    journeyAttempt: { missionId: stage.id, status, captureMs: 12000 },
    journeyResultElement: { querySelector: () => button, classList: { add: noop } },
    apiUrl: (url: string) => url,
    apiFetch: async (url: string, options: { method: string }) => {
      requests.push(url); assert.equal(options.method, 'POST');
      return { ok: true, json: async () => ({ attempt: { attemptId: 'fresh-capture' } }) };
    },
    clearFlightLaunchPresentation: noop, resetCrashPresentation: noop, journeyAttemptId: '', championshipLandingIntentPending: undefined,
    URL, window: { location: { href: 'http://localhost:5173/?journeyAttempt=old' }, history: { state: {}, replaceState: noop } },
    journeyGates: { setProgress: (index: number) => { assert.equal(index, 0); } },
    missionObjective: {}, missionObjectiveGuidance: { setObjective: noop }, journeyGateClearedUntil: 100,
    elevatorDepartureTurnSide: null, elevatorDepartureAttemptId: null,
    monsterView: undefined, transportView: undefined, transportViewAttemptId: '',
    missionIntroSkip: { hidden: false }, monsterBossHud: { classList: { add: noop } },
    applyMissionFocus: noop, cancelMissionStartCountdown: noop, missionStartCountdownPending: false,
    flightLaunchWelcomeHandled: true, flightLaunchState: 'complete', airborneIntroAwaiting: false,
    flightGameRoot: { classList: { add: noop } }, document: { body: { classList: { add: noop } } },
    restartGame: () => { reset++; }, runStarted: true,
    replaceRealtimeSocket: async () => { reconnected++; }, updateJourneyHud: noop,
    showProgressMessage: (message: string) => errors.push(message),
  });
  runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await runInContext('retryJourneyMission()', context);
  assert.deepEqual(requests, [`/api/journey/dallas/${stage.id.replace('journey-dallas-', 'mission-')}/launch`], `${stage.number} ${status}`);
  assert.equal(context.journeyAttemptId, 'fresh-capture'); assert.equal(context.journeyAttempt, null);
  assert.equal(context.flightLaunchState, 'pending'); assert.equal(context.airborneIntroAwaiting, true);
  assert.equal(context.missionStartCountdownPending, true); assert.equal(context.runStarted, false);
  assert.equal(reset, 1); assert.equal(reconnected, 1); assert.equal(button.disabled, false); assert.deepEqual(errors, []);
  }
 }
});

test('every mission action route maps back to the same server mission; placeholders have no launch', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const launchRoute = source.match(/apiUrl\(`\/api\/journey\/dallas\/\$\{([^\n]+)\}\/launch`\)/)![1];
  const exitRoute = source.match(/apiUrl\(`\/api\/journey\/dallas\/\$\{([^\n]+)\}\/abandon`\)/)![1];
  const serverLaunch = server.match(/const missionId = (journeyAction\[1\][^\n]+);/)![1];
  const serverExit = server.match(/const requestedMissionId = (journeyAction\?\.\[1\][^\n]+);/)![1];
  for (const stage of missions.journeyCatalog.filter(item => item.implementation === 'playable')) {
    const context = createContext({ ...missions, journeyAttempt: { missionId: stage.id }, journeyAction: ['', ''] });
    const route = runInContext(launchRoute, context);
    assert.equal(runInContext(exitRoute, context), route);
    context.journeyAction[1] = route;
    assert.equal(runInContext(serverLaunch, context), stage.id, `M${stage.number} launch`);
    assert.equal(runInContext(serverExit, context), stage.id, `M${stage.number} exit`);
  }
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  assert.match(bootstrap, /if \(stage\?\.implementation !== 'playable'\) return;/);
});
