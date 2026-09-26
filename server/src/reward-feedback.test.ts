import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatRewardFeedback } from '../../shared/reward-feedback.mjs';

test('reward feedback formats credit, score, and combined rewards on one line', () => {
  assert.equal(formatRewardFeedback(5, 0), '+5 Credits');
  assert.equal(formatRewardFeedback(0, 100), '+100 Score');
  assert.equal(formatRewardFeedback(5, 100), '+5 Credits • +100 Score');
  assert.equal(formatRewardFeedback(0, 0), '');
  assert.doesNotMatch(formatRewardFeedback(5, 100), /\n|^[•\s]|[•\s]$/);
});

test('reward feedback is anchored once inside the shared Credits and Score HUD group', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  assert.equal(html.match(/id="reward-feedback"/g)?.length, 1);
  assert.match(html, /class="flight-hud-reward-anchor"[\s\S]*id="credits"[\s\S]*id="score"[\s\S]*id="reward-feedback"/);
  assert.doesNotMatch(html, /id="flight-notifications"[^>]*>[\s\S]*id="reward-feedback"/);
});

test('mission and status notices share a stable ordered HUD layer', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.match(html, /id="mission-status-layer"[\s\S]*id="flight-notifications"[\s\S]*id="world-status"[\s\S]*id="progress-message"/);
  assert.doesNotMatch(html, /id="mission-card"/);
  assert.match(html, /class="flight-hud-stat flight-hud-mission"[\s\S]*id="mission-progress"/);
  assert.match(css, /\.mission-status-layer\s*\{[^}]*position:\s*fixed;[^}]*top:\s*74px;[^}]*display:\s*grid;[^}]*gap:\s*8px;/);
});

test('transient flight notices size to their content instead of the mission column', () => {
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.flight-notifications\s*\{[^}]*justify-items:\s*start;[^}]*width:\s*fit-content;/);
  assert.match(css, /\.flight-notifications \.world-status\s*\{[^}]*padding:\s*4px 8px;[^}]*white-space:\s*nowrap;/);
});

test('Moment of Flight share and screenshot UI is removed', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(`${html}\n${main}\n${css}`, /data-moment|MOMENT OF THE FLIGHT|COPY SHARE TEXT|SAVE SCREENSHOT|copyMomentShareText|saveMomentScreenshot/);
});

test('Radar, Players, and Territories share the responsive top-right stack', () => {
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  const panels = readFileSync(new URL('../../client/src/players-panel.ts', import.meta.url), 'utf8');
  assert.match(html, /id="right-flight-stack"[\s\S]*id="radar-panel"[\s\S]*id="right-hud-stack"[\s\S]*id="real-players"[\s\S]*id="city-territories"/);
  assert.match(css, /#right-flight-stack\s*\{[^}]*position:\s*fixed;[^}]*top:\s*max\(56px/);
  assert.match(css, /#radar-panel\s*\{[^}]*background:\s*rgb\(24 52 74 \/ 32%\);/);
  assert.match(panels, /matchMedia\('\(pointer: coarse\)'\)\.matches \|\| innerWidth <= 900/);
});
