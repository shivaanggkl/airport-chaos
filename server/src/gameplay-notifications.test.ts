import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('client/src/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function find(predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node): void {
    if (found) return;
    if (predicate(node)) found = node;
    else ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, 'production code exists');
  return found;
}
function branch(type: string): string {
  return (find(node => ts.isIfStatement(node) && node.expression.getText(ast) === `message.type === '${type}'`) as ts.IfStatement).thenStatement.getText(ast);
}
function run(code: string, globals: Record<string, unknown>): ReturnType<typeof createContext> {
  const context = createContext(globals);
  runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

test('ordinary gameplay notifications and tower queue are removed, including their DOM mount', () => {
  assert.doesNotMatch(source, /gameplayFeedback|GameplayFeedbackSystem|queueAtcCallout|CROSSWIND AHEAD/);
  assert.doesNotMatch(readFileSync('client/index.html', 'utf8'), /id="gameplay-feedback"/);
  const duel = readFileSync('client/src/sky-duel-ui.ts', 'utf8');
  assert.match(duel, /this\.notify\(`OPPONENT RECONNECTING/);
  assert.match(duel, /this\.notify\('OPPONENT RECONNECTED'\)/);
});

test('weather still changes appearance and records entry without displaying a notification', () => {
  const code = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'updateLocalWeather').getText(ast);
  const packets: unknown[] = [];
  const context = run(`${code}\nupdateLocalWeather(10000);`, {
    weatherZoneCheckAt: 0, weatherAnalyticsAt: 0, guidedTutorialActive: false,
    activeWeatherZone: undefined, configuredWeatherZones: [], airplane: { position: {} },
    weatherZoneAt: () => ({ id: 'wind', type: 'windy' }), enabledWeatherZoneIds: () => new Set(),
    document: { body: { dataset: {} } }, connectionReady: () => true,
    socket: { send: (value: string) => packets.push(JSON.parse(value)) },
    showProgressMessage: () => assert.fail('gameplay notification must not display'),
  });
  assert.equal(context.activeWeatherZone.type, 'windy');
  assert.equal(context.document.body.dataset.weather, 'windy');
  assert.deepEqual(packets, [{ type: 'analyticsEvent', event: 'chaos_weather_zone_entered', source: 'windy' }]);
});

test('event, social, Chaos and challenge score processing stays intact without popups', () => {
  for (const type of ['eventReward', 'socialReward', 'chaosState', 'challengeComplete']) {
    const feedback: number[][] = [], records: number[] = [];
    let updates = 0;
    const context = run(branch(type), {
      message: { score: 25, reason: 'verified event' }, score: 100,
      queueRewardFeedback: (...values: number[]) => feedback.push(values),
      recordBestScore: (value: number) => records.push(value),
      flightRecap: { eventResults: [] }, sendPlayerUpdate: () => updates++,
      showProgressMessage: () => assert.fail('gameplay notification must not display'),
    });
    assert.equal(context.score, 125);
    assert.deepEqual(feedback, [[0, 25]]); assert.deepEqual(records, [125]);
    if (type === 'eventReward') assert.equal(context.flightRecap.eventResults[0], 'verified event');
    assert.equal(updates, type === 'eventReward' || type === 'socialReward' ? 1 : 0);
  }
});

test('mission acceptance is silent while a rejected action still explains the error', () => {
  for (const ok of [true, false]) {
    const notices: string[] = [];
    const context = run(branch('missionResult'), {
      message: { ok, attemptId: 'attempt', missionId: 'mission', reason: 'SERVER UNAVAILABLE' },
      activeMissionAttemptId: undefined, completedMissionUntil: 1,
      pilotMenu: { isOpen: () => false },
      showProgressMessage: (value: string) => notices.push(value),
    });
    assert.deepEqual(notices, ok ? [] : ['SERVER UNAVAILABLE']);
    assert.equal(context.activeMissionAttemptId, ok ? 'attempt' : undefined);
  }
});
