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

test('mobile landscape selector is centered, bounded, compact, and scrolls only inside its card', () => {
  assert.match(css, /@media \(max-width: 950px\) and \(orientation: landscape\) \{[\s\S]*\.city-select-card\s*\{[^}]*width:\s*min\(78vw, 760px\);[^}]*max-height:\s*74dvh;[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.city-selector\[data-view="time"\] \.city-select-kicker,[\s\S]*#start-brand-signature\s*\{\s*display:\s*none;/);
  assert.match(css, /\.city-selector\[data-view="time"\] \.city-select-card\s*\{[^}]*width:\s*min\(78vw, 720px\);[^}]*max-height:\s*72dvh;/);
  assert.match(css, /#city-close::after\s*\{\s*content:\s*'×';/);
  assert.match(css, /\.city-option button\s*\{[^}]*min-height:\s*40px;/);
});
