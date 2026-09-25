import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const map = readFileSync(new URL('../../client/src/world-map.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('Map is the shared mission, player, and territory intelligence view', () => {
  assert.match(html, /id="world-map-close"[\s\S]*id="world-map-canvas"[\s\S]*id="map-mission-summary"[\s\S]*id="map-player-list"[\s\S]*id="map-territory-list"/);
  assert.match(main, /worldMap\.update\(\{[\s\S]*roster:[\s\S]*mission:[\s\S]*territories:/);
  assert.match(map, /renderIntelligence\(\)/);
  assert.doesNotMatch(map, /setInterval|fetch\([^)]*(?:mission|player|territor)/i);
});

test('Map intelligence remains compact and responsive below the geographic view', () => {
  assert.match(css, /\.world-map-view\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/);
  assert.match(css, /\.map-intelligence\s*\{[^}]*display:\s*grid;/);
  assert.match(css, /@media\(max-width:1000px\) and \(orientation:landscape\)\{[\s\S]*\.map-intelligence\{grid-template-columns:1\.2fr 1fr 1fr;/);
});
