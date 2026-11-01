import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync('client/src/bootstrap.ts', 'utf8');
const ast = ts.createSourceFile('bootstrap.ts', source, ts.ScriptTarget.Latest, true);
const choose = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'chooseCity')!;
const code = ts.transpileModule(choose.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('Sky Duel continues from city selection even when its existing launch guard is set', () => {
  const calls: unknown[][] = [];
  const context = { cityJourneyMode: 'multiplayer', selectedHomeMultiplayerMode: 'sky', cityJourneyLaunching: true,
    recordProductIntent() {}, enterCity: (...args: unknown[]) => { calls.push(args); return Promise.resolve(); }, console };
  runInNewContext(`${code}; chooseCity({id:'dallas',status:'available'});`, context);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.slice(1), ['evening', false, 'sky-duel']);
});

test('Coming-soon modes and unsupported cities cannot start a different game mode', () => {
  for (const mode of ['squad', 'fleet', 'city', 'sky']) {
    let calls = 0;
    const context = { cityJourneyMode: 'multiplayer', selectedHomeMultiplayerMode: mode,
      cityJourneyLaunching: true, recordProductIntent() {}, enterCity() { calls++; return Promise.resolve(); }, console };
    runInNewContext(`${code}; chooseCity({id:'${mode === 'sky' ? 'milwaukee' : 'dallas'}',status:'available'});`, context);
    assert.equal(calls, 0);
  }
});

test('Single Player retains the mission journey and homepage reuses all existing mode artwork', () => {
  let missions = 0;
  runInNewContext(`${code}; chooseCity({id:'dallas',status:'available'});`, {
    cityJourneyMode: 'missions', recordProductIntent() {}, showMissionJourney() { missions++; },
  });
  assert.equal(missions, 1);
  const home = readFileSync('client/src/home-hangar.ts', 'utf8');
  assert.match(home, /addMode\('Single Player'/);
  for (const mode of ['sky-duel', 'squad-battle', 'fleet-war', 'city-control']) {
    assert.ok(home.includes(`artwork: '${mode}'`));
    assert.ok(existsSync(`client/public/media/multiplayer/${mode}-card.png`));
  }
  assert.doesNotMatch(source, /function showDallasMultiplayerCards/);
});
