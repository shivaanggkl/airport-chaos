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
  assert.match(html, /id="mission-status-layer"[\s\S]*id="mission-card"[\s\S]*id="flight-notifications"[\s\S]*id="world-status"[\s\S]*id="progress-message"/);
  assert.match(css, /\.mission-status-layer\s*\{[^}]*position:\s*fixed;[^}]*top:\s*74px;[^}]*display:\s*grid;[^}]*gap:\s*8px;/);
  assert.match(css, /\.mission-card\s*\{[^}]*position:\s*static;/);
  assert.doesNotMatch(css, /:has\(#reward-feedback\.show\)\s+\.mission-card/);
});
