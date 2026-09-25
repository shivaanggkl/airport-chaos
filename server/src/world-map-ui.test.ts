import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const map = readFileSync(new URL('../../client/src/world-map.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('Map is the shared mission, player, and territory intelligence view', () => {
  assert.match(html, /id="world-map-close"[\s\S]*id="world-map-canvas"[\s\S]*id="map-mission-summary"[\s\S]*id="map-player-list"[\s\S]*id="map-territory-list"/);
  assert.match(main, /worldMap\.update\(\{[\s\S]*roster:[\s\S]*mission:[\s\S]*objective:[\s\S]*compactProgress:[\s\S]*territories:/);
  assert.match(map, /renderIntelligence\(\)/);
  assert.doesNotMatch(map, /setInterval|fetch\([^)]*(?:mission|player|territor)/i);
});

test('mobile Map keeps the geographic view dominant with always-visible intelligence', () => {
  assert.match(html, /id="world-map-close"[^>]*>← GAME<\/button>[\s\S]*id="world-map-title"[\s\S]*id="world-map-recenter"[^>]*>RECENTER<\/button>/);
  assert.match(html, /class="map-intelligence-panel"><h2>PLAYERS[\s\S]*class="map-intelligence-panel"><h2>TERRITORIES/);
  assert.doesNotMatch(html, /class="map-intelligence-panel"[^>]*details|<summary>PLAYERS|<summary>TERRITORIES/);
  assert.match(css, /\.world-map-view\s*\{[^}]*position:\s*relative;[^}]*flex:\s*1;[^}]*min-height:\s*0;/);
  assert.match(css, /\.map-intelligence\s*\{[^}]*display:\s*grid;/);
  assert.match(css, /@media\(max-width:1000px\) and \(orientation:landscape\)\{[\s\S]*\.map-intelligence\{[^}]*flex:0 0 clamp\(112px,32dvh,135px\);[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/);
  assert.match(css, /body:has\(#world-map-overlay:not\(\.hidden\)\) :is\([^}]*\.unified-flight-hud[^}]*\.tutorial-help[^}]*\)\{display:none!important\}/);
});

test('mobile Map uses one compact in-map legend and no duplicate territory colors block', () => {
  assert.match(main, /getElementById\('map-legend'\)[\s\S]*\['you', 'player', 'ai', 'mission', 'airport', 'territory', 'event', 'waypoint'\]/);
  assert.doesNotMatch(main, /MAP_TERRITORY_LEGEND_KEY|mapTerritoryLegend|TERRITORY COLORS/);
  assert.doesNotMatch(html, /map-symbol-legend|map-territory-legend/);
  assert.match(css, /\.map-legend\s*\{[^}]*position:\s*absolute;[^}]*white-space:\s*nowrap;[^}]*pointer-events:\s*none;/);
});

test('large player and territory rosters scroll internally without growing the Map page', () => {
  assert.match(map, /this\.playerList\.replaceChildren\(\.\.\.this\.state\.roster\.map/);
  assert.match(map, /this\.territoryList\.replaceChildren\(\.\.\.territories\.map/);
  assert.match(css, /\.map-intelligence-panel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*overflow:\s*hidden;/);
  assert.match(css, /#map-player-list,#map-territory-list\{[^}]*max-height:none;[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain/);
});
