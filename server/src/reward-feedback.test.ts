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
  const notificationStack = html.match(/id="flight-notifications"[\s\S]*?<\/div>\s*<div id="right-hud-stack"/)?.[0] ?? '';
  assert.doesNotMatch(notificationStack, /id="reward-feedback"/);
});
