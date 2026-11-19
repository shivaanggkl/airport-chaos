import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
const source = readFileSync('client/src/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const functions = names => ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join('\n');
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const definitions = missions.journeyDallasTerritoryHold01.territoryIds.map((id, i) => ({ id, displayName: id, fixedColor: ['#red', '#green', '#blue'][i] }));
  const ctx = vm.createContext({ ...missions, journeyMode: true, localPlayerId: 'pilot', territoryDefinitions: definitions,
    journeyAttempt: { missionId: missions.journeyDallasTerritoryHold01.id, captureTerritories: definitions.map((t, i) => ({ id: t.id, controllerId: `owner-${i}`, ownerColor: `#mission-${i}` })) },
    territoryState: new Map(definitions.map(t => [t.id, { id: t.id, controllerId: 'city-owner' }])),
    territoryDisplayName: t => t.displayName, remotePlayers: new Map(), refreshes: 0 });
  vm.runInContext(compile(functions(['displayedTerritoryState', 'ownedTerritoriesForPlayer', 'primaryTerritoryColorForPlayer', 'refreshTerritoryOwnershipTags'])), ctx);
  vm.runInContext("function refreshPlayerIdentityTag(remote) { refreshes++; remote.ownershipSignature = ownedTerritoriesForPlayer(remote.playerId).map(t => t.color).join('|'); }", ctx);
  return ctx;
}
test('territory owner labels use mission ownership and the same accent as its boundary, with Free Fly fallback', () => {
  const ctx = fixture();
  assert.equal(ctx.ownedTerritoriesForPlayer('owner-0')[0].color, '#mission-0');
  assert.equal(ctx.primaryTerritoryColorForPlayer('owner-0'), '#mission-0');
  assert.equal(ctx.ownedTerritoriesForPlayer('city-owner').length, 0);
  ctx.journeyMode = false;
  assert.equal(ctx.ownedTerritoriesForPlayer('city-owner').length, 3);
  assert.equal(ctx.primaryTerritoryColorForPlayer('city-owner'), '#red');
});
test('ownership dots transfer and disappear immediately, without repainting unchanged owners', () => {
  const ctx = fixture();
  for (const playerId of ['owner-0', 'pilot']) ctx.remotePlayers.set(playerId, { playerId, ownershipSignature: '' });
  ctx.refreshTerritoryOwnershipTags(); assert.equal(ctx.refreshes, 1);
  ctx.refreshTerritoryOwnershipTags(); assert.equal(ctx.refreshes, 1);
  ctx.journeyAttempt.captureTerritories[0].controllerId = 'pilot';
  ctx.refreshTerritoryOwnershipTags(); assert.equal(ctx.refreshes, 3);
  assert.equal(ctx.remotePlayers.get('owner-0').ownershipSignature, '');
  assert.equal(ctx.remotePlayers.get('pilot').ownershipSignature, '#mission-0');
  ctx.journeyAttempt.captureTerritories[0].controllerId = undefined;
  ctx.refreshTerritoryOwnershipTags(); assert.equal(ctx.refreshes, 4);
  assert.equal(ctx.remotePlayers.get('pilot').ownershipSignature, '');
  assert.match(functions(['refreshTerritoryBorders']), /refreshTerritoryOwnershipTags\(\)/);
});
test('the common aircraft name box draws its territory dots for mission targets too', () => {
  const dots = [], paint = { clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, arc(...args) { dots.push({ args }); }, fill() { dots.at(-1).color = this.fillStyle; }, stroke() {}, fillText() {} };
  const ctx = vm.createContext({ airAssaultMode: false, visualLanguage: { ai: { color: '#red' }, mission: { color: '#gold' } }, aircraftDefinitions: { trainer: { callsign: 'BLUEJAY' } } });
  vm.runInContext(compile(functions(['paintPlayerIdentityTag'])), ctx);
  const label = { userData: { canvas: { width: 320, height: 80, getContext: () => paint } }, material: { map: {} } };
  ctx.paintPlayerIdentityTag(label, 'GUARDIAN', 'trainer', false, true, ['#mission-0', '#mission-1'], 1000, false, false, true);
  assert.deepEqual(dots.map(dot => dot.color), ['#mission-0', '#mission-1']);
  assert.equal(label.material.map.needsUpdate, true);
});
