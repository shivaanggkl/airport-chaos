import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('obsolete flight guidance prompt is absent from the shared desktop and mobile UI', () => {
  assert.doesNotMatch(html, /id="next-actions"|Suggested activities/);
  assert.doesNotMatch(main, /NextActionSystem|updateNextActions|nextActionsElement|FLY: Take Off/);
  assert.doesNotMatch(css, /\.next-actions?\b|#next-actions\b/);
});

test('flight logic, tutorial guidance, and compact status notifications remain wired', () => {
  assert.match(main, /function updateGuidedTutorial\(\):void/);
  assert.match(main, /function setActivityWaypoint\(x: number, z: number, label: string\): void/);
  assert.match(main, /missionProgress/);
  assert.match(html, /id="flight-notifications"[\s\S]*id="world-status"[\s\S]*id="progress-message"/);
});
