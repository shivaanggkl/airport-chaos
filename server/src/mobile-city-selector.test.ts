import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('city and time selector keeps existing actions with the shared entry header and primary CTA', () => {
  assert.match(html, /entry-shell-header city-select-header[\s\S]*data-city-profile-entry[\s\S]*data-city-credits[\s\S]*data-city-settings/);
  assert.match(html, /id="city-back"[\s\S]*id="city-close"[^>]*aria-label="Back to Pilot Hub"[\s\S]*id="garage-entry"/);
  assert.match(bootstrap, /citySelector\.dataset\.view = 'cities'/);
  assert.match(bootstrap, /citySelector\.dataset\.view = 'time'/);
  assert.match(bootstrap, /Bright daytime flying/);
  assert.match(bootstrap, /Evening city atmosphere/);
  assert.match(bootstrap, /localStorage\.setItem\(`airport-chaos-time-\$\{city\.id\}`/);
  assert.match(bootstrap, /void enterCity\(city, preset\)/);
  assert.equal((bootstrap.match(/button\.className = 'entry-button entry-button-primary'/g) ?? []).length, 2);
});

test('short touch landscape selector stays full scale inside the safe viewport', () => {
  assert.match(css, /@media \(max-width: 950px\) and \(orientation: landscape\),\s*\(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*\.city-select-card\s*\{[^}]*top:\s*max\(52px,[^}]*bottom:\s*auto;[^}]*width:\s*min\(var\(--entry-content-width\),[^}]*padding:\s*10px 12px;/);
  assert.match(css, /\.city-select-card\s*\{[^}]*grid-template-rows:\s*repeat\(5, auto\);[^}]*gap:\s*clamp\(10px, 1\.3vw, 16px\)/);
  assert.match(css, /\.city-options\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.city-option button\s*\{[^}]*min-width:\s*112px;[^}]*min-height:\s*54px;/);
  assert.match(css, /\.city-select-actions \.entry-button\s*\{[^}]*min-height:\s*48px;/);
  assert.match(css, /\.city-select-actions\s*\{[^}]*margin-top:\s*-6px;/);
  assert.match(css, /\.intro-brand-footer\s*\{[^}]*padding:\s*7px 42px 0 0;[^}]*font:\s*500 11px\/1\.2[^}]*opacity:\s*\.72/);
  assert.match(css, /body:has\(\.city-selector:not\(\[hidden\]\)\) \.tutorial-help\s*\{[^}]*right:\s*max\(24px, var\(--safe-area-right\)\);[^}]*bottom:\s*max\(24px, var\(--safe-area-bottom\)\);[^}]*left:\s*auto/);
  assert.doesNotMatch(css, /\.garage-entry|brand-logo-home|city-select-kicker/);
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
