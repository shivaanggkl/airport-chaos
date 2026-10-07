import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldIgnoreGameplayKeyboardEvent } from '../../shared/editable-keyboard.mjs';

const controlsSource = readFileSync(new URL('../../client/src/controls-help.ts', import.meta.url), 'utf8');
const editableSource = readFileSync(new URL('../../shared/editable-keyboard.mjs', import.meta.url), 'utf8');
const inputSource = readFileSync(new URL('../../client/src/flight-input.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
const pilotMenuSource = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');

test('H toggles help only on non-touch gameplay layouts', () => {
  assert.match(controlsSource, /code === 'KeyH' && !touchLayout && !isEditableControl\(target\)/);
});

test('H is not captured from editable controls', () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.match(editableSource, new RegExp(`tagName === '${tag}'`));
  assert.match(editableSource, /isContentEditable/);
  for (const role of ['textbox', 'searchbox', 'combobox']) assert.match(editableSource, new RegExp(`role="${role}"`));
});

test('all text-editing keys bypass gameplay while Escape remains available to shared back navigation', () => {
  const input = { tagName: 'INPUT', isContentEditable: false, closest: () => null } as unknown as EventTarget;
  for (const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    assert.equal(shouldIgnoreGameplayKeyboardEvent({ code: `Key${key}`, key, target: input }, input), true);
  }
  for (const [code, key] of [['Backspace', 'Backspace'], ['Space', ' ']]) {
    assert.equal(shouldIgnoreGameplayKeyboardEvent({ code, key, target: input }, input), true);
  }
  assert.equal(shouldIgnoreGameplayKeyboardEvent({ code: 'Escape', key: 'Escape', target: input }, input), false);
});

test('flight keyboard listeners share the editable-focus guard and clear held state on focus entry', () => {
  assert.ok((mainSource.match(/if \(shouldIgnoreGameplayKeyboardEvent\(event\)\) return;/g) ?? []).length >= 3);
  assert.match(mainSource, /focusin[\s\S]*isEditableControl\(event\.target\)[\s\S]*clearHeldActions\(\)/);
  assert.match(pilotMenuSource, /nameInput\.dataset\.pilotNameEditor = ''/);
});

test('desktop reference is sourced from current supported flight bindings', () => {
  assert.match(inputSource, /KeyW:\s*'throttleUp'/);
  assert.match(inputSource, /KeyS:\s*'throttleDown'/);
  assert.match(inputSource, /KeyA:\s*'yawLeft'/);
  assert.match(inputSource, /KeyD:\s*'yawRight'/);
  assert.match(inputSource, /ArrowLeft:\s*'yawLeft'/);
  assert.match(inputSource, /ArrowRight:\s*'yawRight'/);
  assert.match(inputSource, /ArrowUp:\s*'pitchUp'/);
  assert.match(inputSource, /ArrowDown:\s*'pitchDown'/);
  assert.match(inputSource, /Space:\s*'fire'/);
  assert.match(inputSource, /ShiftLeft:\s*'boost'/);
  assert.doesNotMatch(inputSource, /Key[PX]:/);
  assert.doesNotMatch(inputSource, /label:\s*'[^']*(?:photo|barrel|dodge)/i);
});

test('desktop controls bar presents A/D and arrows as one turn control', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  assert.match(html, /<kbd>W\/S<\/kbd> Speed/);
  assert.match(html, /<kbd>A\/D or ←\/→<\/kbd> Turn/);
  assert.match(html, /<kbd>↑\/↓<\/kbd> Pitch/);
  assert.doesNotMatch(html, /A\/D<\/kbd> Roll|Barrel Roll through A\/D/i);
});

test('desktop controls state is persistent and has no auto-hide path', () => {
  assert.match(mainSource, /airport-chaos-desktop-controls-help-v1/);
  assert.match(mainSource, /=== 'collapsed'/);
  assert.match(mainSource, /collapsed \? 'collapsed' : 'expanded'/);
  assert.match(mainSource, /desktopControlsHelpToggleElement\.addEventListener\('click', toggleDesktopControlsHelp\)/);
  assert.doesNotMatch(mainSource, /controlsHelp(?:AutoHide|Conceal)Timer|showDesktopControlsHelp|hideDesktopControlsHelp/);
  assert.doesNotMatch(styleSource, /desktop-controls-help\.is-visible/);
});

test('flight screen uses one ordered HUD and no legacy utility panels', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  for (const id of ['credits', 'speed', 'altitude', 'health', 'heat-level']) {
    assert.equal(html.match(new RegExp(`id="${id}"`, 'g'))?.length, 1);
  }
  const orderedIds = ['flight-menu-button', 'flight-exit-button', 'credits', 'health', 'heat-level', 'speed', 'altitude', 'flight-map-button', 'flight-garage-button', 'flight-account-button'];
  assert.deepEqual([...orderedIds].sort((left, right) => html.indexOf(`id="${left}"`) - html.indexOf(`id="${right}"`)), orderedIds);
  assert.match(html, /class="flight-hud-panel flight-hud-rewards"[\s\S]*id="credits"/);
  assert.doesNotMatch(html, /id="score"/);
  assert.match(html, /class="flight-hud-panel flight-hud-vitals"[\s\S]*id="health"[\s\S]*id="heat-level"/);
  assert.match(html, /class="flight-hud-panel flight-hud-motion"[\s\S]*id="speed"[\s\S]*id="altitude"/);
  assert.doesNotMatch(html, /id="(?:hud-sky-tokens|sky-tokens)"/);
  assert.match(styleSource, /\.flight-hud-panel > :not\(:first-child\)\s*\{[^}]*border-left:/);
  assert.match(styleSource, /\.unified-flight-hud \.flight-hud-utilities\s*\{[^}]*gap: 8px;[^}]*padding: 0;[^}]*background: transparent;[^}]*border: 0;/);
  assert.doesNotMatch(html, /id="flight-(?:world|settings)-button"|id="flight-condition-status"/);
  assert.doesNotMatch(html, /id="mission-progress"|class="flight-hud-stat flight-hud-mission"/);
  assert.match(mainSource, /flightExitButtonElement\.addEventListener\('click', \(\) => requestFlightExit\(\)\)/);
  assert.match(mainSource, /flightAccountButtonElement\.addEventListener\('click', \(\) => openPilotMenu\('PROFILE'\)\)/);
  assert.match(mainSource, /showFlightDialog\('Exit flight\?'[\s\S]*'Return to the Pilot Hub\?'[\s\S]*label: 'EXIT TO HUB'/);
  assert.doesNotMatch(html, /id="mobile-(?:score|speed|altitude|mission)"/);
  assert.doesNotMatch(html, /id="(?:flight-status|progression-readout|aircraft-select|hud)"/);
  assert.match(html, /id="desktop-controls-help"[^>]*hidden/);
  assert.match(html, /id="desktop-controls-help-toggle"[^>]*aria-expanded="true"/);
  assert.match(html, /id="desktop-controls-help-items"/);
  assert.doesNotMatch(html, /Photo Mode|Barrel Roll|Dodge/i);
});
