import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controlsSource = readFileSync(new URL('../../client/src/controls-help.ts', import.meta.url), 'utf8');
const inputSource = readFileSync(new URL('../../client/src/flight-input.ts', import.meta.url), 'utf8');

test('H toggles help only on non-touch gameplay layouts', () => {
  assert.match(controlsSource, /code === 'KeyH' && !touchLayout && !isEditableControl\(target\)/);
});

test('H is not captured from editable controls', () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.match(controlsSource, new RegExp(`tagName === '${tag}'`));
  assert.match(controlsSource, /isContentEditable/);
});

test('desktop reference is sourced from current supported flight bindings', () => {
  assert.match(inputSource, /KeyW:\s*'throttleUp'/);
  assert.match(inputSource, /Space:\s*'fire'/);
  assert.match(inputSource, /ShiftLeft:\s*'boost'/);
  assert.doesNotMatch(inputSource, /Key[PX]:/);
  assert.doesNotMatch(inputSource, /label:\s*'[^']*(?:photo|barrel|dodge)/i);
});

test('flight screen uses one ordered HUD and no legacy utility panels', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  for (const id of ['credits', 'score', 'speed', 'altitude', 'health', 'heat-level', 'mission-progress']) {
    assert.equal(html.match(new RegExp(`id="${id}"`, 'g'))?.length, 1);
  }
  const orderedIds = ['flight-menu-button', 'credits', 'score', 'speed', 'altitude', 'health', 'heat-level', 'mission-progress', 'flight-garage-button', 'flight-world-button', 'flight-map-button'];
  assert.deepEqual([...orderedIds].sort((left, right) => html.indexOf(`id="${left}"`) - html.indexOf(`id="${right}"`)), orderedIds);
  assert.doesNotMatch(html, /id="mobile-(?:score|speed|altitude|mission)"/);
  assert.doesNotMatch(html, /id="(?:flight-status|progression-readout|aircraft-select|hud)"/);
  assert.match(html, /id="desktop-controls-help"[^>]*hidden/);
});
