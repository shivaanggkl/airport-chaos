import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('city and time selector keeps existing actions while exposing compact time descriptions', () => {
  assert.match(html, /id="city-back"[\s\S]*id="city-close"[^>]*aria-label="Return to flight"[\s\S]*id="garage-entry"/);
  assert.match(bootstrap, /citySelector\.dataset\.view = 'cities'/);
  assert.match(bootstrap, /citySelector\.dataset\.view = 'time'/);
  assert.match(bootstrap, /Bright daytime flying/);
  assert.match(bootstrap, /Evening city atmosphere/);
  assert.match(bootstrap, /localStorage\.setItem\(`airport-chaos-time-\$\{city\.id\}`/);
  assert.match(bootstrap, /void enterCity\(city, preset\)/);
});

test('short touch landscape selector uses the full safe viewport and scrolls only inside its card', () => {
  assert.match(css, /@media \(max-width: 950px\) and \(orientation: landscape\),\s*\(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*\.city-select-card\s*\{[^}]*width:\s*min\(100%, 760px\);[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.city-selector\[data-view="time"\] \.city-select-kicker,[\s\S]*#start-brand-signature\s*\{\s*display:\s*none;/);
  assert.match(css, /\.city-selector\[data-view="time"\] \.city-select-card\s*\{[^}]*width:\s*min\(100%, 720px\);[^}]*max-height:\s*100%;/);
  assert.match(css, /#city-close::after\s*\{\s*content:\s*'×';/);
  assert.match(css, /\.city-option button\s*\{[^}]*min-height:\s*40px;/);
});

test('short touch landscape keeps Pilot Menu header fixed with independent navigation and content scrolling', () => {
  assert.match(css, /\(any-pointer:coarse\) and \(orientation:landscape\) and \(max-height:520px\)\{[\s\S]*\.pilot-menu-card\{[^}]*grid-template:[^}]*108px minmax\(0,1fr\);[^}]*height:100%;[^}]*max-height:100%;/);
  assert.match(css, /\.pilot-menu-navigation\{[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.pilot-menu-content\{[^}]*min-width:0;[^}]*overflow-x:hidden/);
  assert.match(css, /\.pilot-account-summary\{[^}]*padding:8px 10px;[^}]*font-size:14px/);
});

test('WKWebView and short landscape overlays use an explicit compact type scale', () => {
  assert.match(css, /html\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/);
  assert.match(css, /@media \(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*--font-body-size:\s*14px;[\s\S]*--font-meta-size:\s*12px;[\s\S]*\.pilot-progress-card \.pilot-progress-value\s*\{[^}]*font-size:\s*clamp\(18px, 2\.2vw, 22px\);/);
});

test('short landscape restores two-column progress and Garage presentation', () => {
  assert.match(css, /@media \(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*\.pilot-progress-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.garage-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.2fr\) minmax\(220px, \.8fr\);/);
  assert.match(css, /\.garage-preview,[\s\S]*\.garage-preview canvas\s*\{[^}]*height:\s*164px;/);
});
