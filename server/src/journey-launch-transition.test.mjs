import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { journeyMissionOrder } from '../../shared/journey-mission.mjs';

const source = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('bootstrap.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['playJourneyMission', 'enterCity'].map(name => {
  const node = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return node.getText(tree);
}).join('\n').replace("import('./main')", 'loadMain()');
const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function setup(missionNumber, failLoading = false) {
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  const citySelector = { hidden: true };
  const journey = { selectedMissionNumber: missionNumber, hidden: false, hide() { this.hidden = true; } };
  const header = { hidden: false, hide() { this.hidden = true; } };
  const root = { hidden: true };
  const objective = { textContent: '' };
  let loads = 0, restores = 0, selectorRevealed = false;
  Object.defineProperty(citySelector, 'hidden', {
    get: () => !selectorRevealed,
    set: hidden => { if (!hidden) selectorRevealed = true; },
  });
  const city = { id: 'dallas', status: 'available', loadWorld: async () => {
    assert.equal(journey.hidden, false, 'Journey must cover world loading');
    assert.equal(header.hidden, false);
    assert.equal(root.hidden, true);
    await loading;
    if (failLoading) throw new Error('World unavailable');
  } };
  const context = vm.createContext({
    journeyLaunchPending: false, dallasUnlocked: () => true, cityJourneyMode: 'missions',
    missionJourney: journey, journeyMissionOrder, pendingAircraftSelection: undefined,
    apiUrl: path => path, apiFetch: async () => ({ ok: true, json: async () => ({
      attempt: { attemptId: 'authorized-attempt' }, mission13: { definitionVersion: 1 }, mission14: { definitionVersion: 1 },
    }) }),
    journeyAttemptId: undefined, journeyAttemptMission: '', cities: [city], citySelector,
    missionTimePreset: () => 'evening', refreshJourneyProgress: async () => {},
    missionJourneyElement: { querySelector: () => objective }, console: { error() {} },
    entryState: 'MISSION_JOURNEY', gameRoot: root, appHeader: header,
    resolveCityTimePreset: () => 'evening', authoritativeHomeProfile: undefined,
    setFlightLaunchAircraft() {}, missionJourneyReturnPending: true,
    audioManager: { setMenuMusicDesired() {} }, garage: { close() {}, hideShowcase() {} },
    homeHangar: { hide() {} }, citySelectionError: { hidden: true },
    window: { location: { href: 'http://localhost/' }, history: { replaceState() {} } }, URL,
    CITY_QUERY_PARAM: 'city', LAUNCH_MODE_PARAM: 'mode',
    loadMain: async () => {
      assert.equal(journey.hidden, false, 'Journey must cover game initialization');
      assert.equal(citySelector.hidden, true);
      loads++;
    }, notifySharedMenuPreferences() {},
    showMissionJourney() { restores++; context.entryState = 'MISSION_JOURNEY'; },
  });
  vm.runInContext(code, context);
  return { context, release, journey, header, root, get loads() { return loads; },
    get restores() { return restores; }, get selectorRevealed() { return selectorRevealed; } };
}

test('all 24 Journey launches stay on Journey until the game is ready, without revealing city cards', async () => {
  for (let slot = 1; slot <= 24; slot++) {
    const state = setup(slot);
    const launch = state.context.playJourneyMission();
    // Let authorization complete while world loading remains unresolved.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.journey.hidden, false, `M${slot} Journey hidden during loading`);
    assert.equal(state.root.hidden, true);
    assert.equal(state.selectorRevealed, false);
    await state.context.playJourneyMission(); // A second click cannot launch another attempt.
    state.release();
    await launch;
    assert.equal(state.loads, 1);
    assert.equal(state.root.hidden, false);
    assert.equal(state.journey.hidden, true);
    assert.equal(state.header.hidden, true);
    assert.equal(state.selectorRevealed, false);
    assert.equal(state.context.journeyLaunchPending, false);
  }
});

test('failed world loading keeps Journey visible and restores its navigation for retry', async () => {
  const state = setup(1, true);
  state.release();
  await state.context.playJourneyMission();
  assert.equal(state.restores, 1);
  assert.equal(state.context.entryState, 'MISSION_JOURNEY');
  assert.equal(state.journey.hidden, false);
  assert.equal(state.header.hidden, false);
  assert.equal(state.root.hidden, true);
  assert.equal(state.selectorRevealed, false);
  assert.equal(state.context.journeyLaunchPending, false);
});
