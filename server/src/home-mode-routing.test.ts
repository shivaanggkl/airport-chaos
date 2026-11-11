import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync('client/src/bootstrap.ts', 'utf8');
const ast = ts.createSourceFile('bootstrap.ts', source, ts.ScriptTarget.Latest, true);
const choose = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'chooseCity')!;
const code = ts.transpileModule(choose.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('Sky Duel bypasses city selection and always resolves Dallas', () => {
  const selector = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'showSelector')!;
  const selectorCode = ts.transpileModule(selector.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dallas = { id: 'dallas', status: 'available' };
  const chosen: unknown[] = [];
  runInNewContext(`${selectorCode}; showSelector('', {mode:'multiplayer'});`, {
    cityJourneyMode: 'missions', selectedHomeMultiplayerMode: 'sky',
    abandonPendingJourneyLaunch() {}, sessionStorage: { setItem() {} }, CITY_JOURNEY_MODE_KEY: 'mode',
    getCity(id: string) { assert.equal(id, 'dallas'); return dallas; },
    chooseCity(city: unknown) { chosen.push(city); },
  });
  assert.deepEqual(chosen, [dallas]);
});

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

test('Air Assault retains its direct route while unavailable Hub cards remain locked and last', () => {
  const calls:unknown[][]=[];
  runInNewContext(`${code}; chooseCity({id:'dallas',status:'available'});`,{cityJourneyMode:'multiplayer',selectedHomeMultiplayerMode:'assault',cityJourneyLaunching:true,recordProductIntent(){},enterCity:(...args:unknown[])=>{calls.push(args);return Promise.resolve();},console});
  assert.deepEqual(calls[0]?.slice(1),['day',false,'air-assault']);
  const home=readFileSync('client/src/home-hangar.ts','utf8');
  const modeOrder = ['sky', 'assault', 'squad', 'fleet', 'city'];
  for (let i = 0; i < modeOrder.length; i++) {
    const mode = modeOrder[i];
    assert.match(home, new RegExp(`id: '${mode}'.*playable: ${mode === 'sky'}`));
    if (i > 0) assert.ok(home.indexOf(`id: '${modeOrder[i - 1]}'`) < home.indexOf(`id: '${mode}'`));
  }
  assert.match(home,/if \(!locked\) run\(\)/);
  assert.match(home,/card\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(home,/mode.id !== 'assault'/);
});

test('Solo Free Fly uses Dallas day exploration without missions, matchmaking or time selection',()=>{
 const calls:unknown[][]=[];let abandoned=0;
 const context={cityJourneyMode:'solo-free-fly',recordProductIntent(){},abandonPendingJourneyLaunch(){abandoned++;},enterCity:(...args:unknown[])=>{calls.push(args);return Promise.resolve();},showSelector(){throw new Error('unexpected error');}};
 runInNewContext(`${code}; chooseCity({id:'milwaukee',status:'available'}); chooseCity({id:'dallas',status:'available'});`,context);
 assert.equal(calls.length,1);assert.equal(abandoned,1);assert.deepEqual(calls[0]?.slice(1),['day',false,'solo-free-fly']);
 const home=readFileSync('client/src/home-hangar.ts','utf8');
 assert.match(home,/free-fly-card.jpg', handlers.explore/);
 assert.ok(existsSync('client/public/media/hub/free-fly-card.jpg'));
 const client=readFileSync('client/src/main.ts','utf8');
 assert.match(client,/!airAssaultMode && !soloExploreMode && cityWorld.ambientTrafficConfig/);
 assert.match(client,/skyDuelMode \|\| soloExploreMode \? \[\] : territoriesForCity/);
 assert.match(client,/soloExploreMode&&message.soloExploreSupported!==true/);
 assert.match(client,/if \(soloExploreMode\) \{[\s\S]*?spawnMuzzleFeedback[\s\S]*?return true;/);
});


test('solo exploration omits territory-only geometry and the server gates territory and battle packets',()=>{
 const client=readFileSync('client/src/main.ts','utf8'),server=readFileSync('server/src/index.ts','utf8');
 assert.match(client,/const siegeDefenseBoundary = cityId === 'dallas' && !skyDuelMode && !soloExploreMode/);
 assert.match(server,/function updateTerritories\(now: number\)[\s\S]*?player\.airAssaultId \|\| player\.soloExploreMode \|\| player\.portalTransit\) continue/);
 assert.match(server,/player\.soloExploreMode\)\{[\s\S]*?!soloExploreMessages\.has\(message.type\)/);
 const allowed=server.match(/const soloExploreMessages=new Set\(\[([^\]]+)\]\)/)![1];
 for(const action of ['fire','lock','missionAccept','eventJoin','skyDuelQueue','intercityRouteStart'])assert.ok(!allowed.includes(`'${action}'`));
});
