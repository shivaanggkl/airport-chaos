import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import { territoriesForCity, territoryContains } from '../../shared/city-territories.mjs';
import { dallasDisplayNames } from '../../shared/dallas-display-names.mjs';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.ts';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const declaration = name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const hud = declaration('updateJourneyHud');
const layout = hud.getText(ast).slice(hud.getText(ast).indexOf('  const survivalMission'), hud.getText(ast).indexOf("  skyChallengeElement.classList.add('journey-hud')"));
const branch = hud.body.statements.find(node => ts.isIfStatement(node) && node.expression.getText(ast) === 'captureThree');
const code = ts.transpileModule(['territoryDisplayName', 'updateTerritoryPanel', 'updateCaptureHud'].map(name => declaration(name).getText(ast)).join('\n') +
  `\nfunction layout(){${layout}}\nfunction render(){${branch.thenStatement.getText(ast)}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function element() {
  const classes = new Set();
  return { hidden: false, textContent: '', classList: {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: name => classes.has(name),
    toggle(name, force) { const active = force ?? !classes.has(name); if (active) classes.add(name); else classes.delete(name); return active; },
  } };
}
function fixture() {
  const rows = [], bars = [], hosts = [], modes = [];
  const territoryDefinitions = territoriesForCity('dallas');
  const mission = missions.journeyDallasCaptureThree01;
  const context = vm.createContext({ ...missions, missionJourneyDetails, dallasAirportNames: dallasDisplayNames,
    captureMissionTerritoryName: 'LAS COLINAS', journeyMode: true,
    journeyAttempt: { missionId: mission.id, status: 'RACING', captureStage: 0, captureMs: 7500 },
    territoryDefinitions, territoryContains, localPlayerId: 'pilot', neutralTerritoryColor: '#ffffff',
    airplane: { position: { ...territoryDefinitions.find(t => t.id === 'las-colinas').center, y: 1000 } },
    getTerrainHeight: () => 0, connectionReady: () => true, onGround: false, crashed: false, journeyPaused: false,
    cityTerritoriesPanel: { update(items) { rows.splice(0, rows.length, ...items); } },
    missionCaptureBar: { show(...args) { bars.push(args); }, hide() { bars.push('hidden'); } },
    gameplayInfoCard: { setTerritoryPanelHost(host) { hosts.push(host); }, setMode(mode) { modes.push(mode); } },
    flightGameRoot: element(), skyChallengeElement: element(), missionTerritoryCard: element(),
    journeyHudObjective: element(), journeyHudProgress: element(), journeyHudTarget: element(), journeyHudSegmentRow: element(),
    journeyHudTimer: element(), journeyHudHint: element(), journeyHudEnemy: element(), monsterBossHud: element(), escortHealthHud: element(),
    journeyHudSegments: Array.from({ length: 4 }, element), setMissionInstructions(el, text) { el.textContent = text; },
  });
  vm.runInContext(code, context);
  return { context, rows, bars, hosts, modes };
}

test('M21 uses the same separate territory host and clean mission box as M5', () => {
  const { context: c, rows, hosts, modes } = fixture();
  c.layout(); c.render();
  assert.equal(hosts.at(-1), c.missionTerritoryCard);
  assert.equal(modes.at(-1), 'mission-territories');
  assert.equal(c.missionTerritoryCard.hidden, false);
  assert.equal(c.journeyHudObjective.textContent, '• Capture 3 TERRITORIES');
  for (const key of ['journeyHudProgress', 'journeyHudTarget', 'journeyHudSegmentRow']) assert.equal(c[key].hidden, true);
  assert.deepEqual(rows.map(row => row.name), ['LAS COLINAS', 'LOVE FIELD AIRPORT', 'CENTRAL DISTRICT']);
  assert.deepEqual(rows.map(row => row.statusLabel), ['CAPTURING 50%', 'LOCKED', 'LOCKED']);
  c.missionTerritoryCard.classList.add('is-collapsed'); c.layout();
  assert.equal(c.missionTerritoryCard.classList.contains('is-collapsed'), true, 'HUD refresh must preserve the collapse choice');
});

test('M21 shared capture bar and owned rows follow each authoritative stage', () => {
  const { context: c, rows, bars } = fixture();
  for (let stage = 0; stage < 3; stage++) {
    const target = c.territoryDefinitions.find(t => t.id === c.journeyDallasCaptureThree01.territoryIds[stage]);
    c.airplane.position = { ...target.center, y: 1000 };
    c.journeyAttempt.captureStage = stage; c.journeyAttempt.captureMs = 7500;
    c.render();
    assert.deepEqual(bars.at(-1), [rows[stage].name, 50, false]);
    assert.equal(rows[stage].statusLabel, 'CAPTURING 50%');
    assert.ok(rows.slice(0, stage).every(row => row.captured && row.statusLabel === 'OWNED'));
    assert.ok(rows.slice(stage + 1).every(row => !row.captured && row.statusLabel === 'LOCKED'));
  }
  c.journeyAttempt.captureStage = 3; c.journeyAttempt.status = 'COMPLETED'; c.journeyAttempt.captureMs = 0;
  c.render();
  assert.ok(rows.every(row => row.captured && row.statusLabel === 'OWNED'));
  assert.deepEqual(bars.at(-1), ['CENTRAL DISTRICT', 0, true], 'shared bar renders confirmed capture as 100%');
});

test('pause, leaving the boundary and a reset hold cannot show false M21 capture progress', () => {
  const { context: c, rows, bars } = fixture();
  c.journeyPaused = true; c.render(); assert.equal(bars.at(-1), 'hidden');
  c.journeyPaused = false; c.journeyAttempt.captureMs = 0; c.airplane.position = { x: 70000, y: 1000, z: 70000 };
  c.render(); assert.equal(bars.at(-1), 'hidden'); assert.equal(rows[0].statusLabel, 'NOT CAPTURED');
  c.journeyAttempt.captureStage = 1; c.render(); assert.equal(rows[0].statusLabel, 'OWNED');
  assert.equal(rows[0].controllerId, 'pilot'); assert.equal(rows[1].captured, false);
});
