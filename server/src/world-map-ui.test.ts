import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const map=readFileSync(new URL('../../client/src/world-map.ts',import.meta.url),'utf8');
const menu=readFileSync(new URL('../../client/src/pilot-menu.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');

test('gameplay Map has a compact bottom icon key without the old information panels',()=>{
 assert.match(html,/id="world-map-close"[\s\S]*id="world-map-canvas"[\s\S]*class="map-symbol-key"/);
 assert.match(html,/data-map-zoom="in"[\s\S]*data-map-zoom="out"/);
 assert.doesNotMatch(html,/map-legend|map-intelligence|map-mission-summary|map-player-list|map-territory-list/);
 assert.doesNotMatch(main,/map-legend|map-intelligence|map-territory-list/);
 assert.doesNotMatch(map,/renderIntelligence|map-mission-summary|map-player-list|map-territory-list/);
 assert.doesNotMatch(map,/setInterval|fetch\([^)]*(?:mission|player|territor)/i);
});

test('Map keeps the existing header, controls and OpenStreetMap attribution',()=>{
 assert.match(html,/id="world-map-close"[^>]*>← GAME<\/button>[\s\S]*id="world-map-title"[\s\S]*id="world-map-recenter"[^>]*>RECENTER<\/button>/);
 assert.match(html,/class="world-map-view">[\s\S]*id="osm-attribution"[^>]*href="https:\/\/www\.openstreetmap\.org\/copyright"/);
 assert.equal(html.match(/id="osm-attribution"/g)?.length,1);
 assert.match(css,/#osm-attribution\s*\{[^}]*position:\s*absolute;/);
});

test('Map fills the remaining card space and stays bounded on short mobile landscape screens',()=>{
 assert.match(css,/\.world-map-view\s*\{[^}]*position:\s*relative;[^}]*flex:\s*1;[^}]*min-height:\s*0;/);
 assert.match(css,/@media \(max-width: 950px\) and \(orientation: landscape\),[\s\S]*?\.world-map-card\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*height:\s*100%;/);
 assert.match(css,/\.world-map-view,[\s\S]*#world-map-canvas\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/);
 assert.doesNotMatch(css,/map-legend|map-intelligence|map-mission-summary|map-player-list|map-territory-list/);
});

test('Pilot Menu Map mounts the existing WorldMap directly without a second launcher', () => {
  assert.match(menu, /map: \{ mount: \(host: HTMLElement\) => void; unmount: \(\) => void \}/);
  assert.match(menu, /host\.className = 'pilot-menu-map-host';[\s\S]*data\.map\.mount\(host\)/);
  assert.match(menu, /this\.lastData\?\.map\.unmount\(\);[\s\S]*this\.element\.hidden = true/);
  assert.doesNotMatch(menu, /OPEN MAP|Find places and set a waypoint|createTerritoryLegend\(data\).*content\.append\(map\)/);
  assert.match(main, /map: \{[\s\S]*worldMap\.mountEmbedded\(host\)[\s\S]*worldMap\.unmountEmbedded\(\)/);
  assert.match(map, /mountEmbedded\(host: HTMLElement\)[\s\S]*host\.append\(this\.card\)/);
  assert.match(map, /unmountEmbedded\(\)[\s\S]*this\.standaloneParent\.append\(this\.card\)/);
  assert.match(css, /\.pilot-menu-map-host > \.world-map-card-embedded\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/);
});
