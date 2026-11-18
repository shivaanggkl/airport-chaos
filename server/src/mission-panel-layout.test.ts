import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { missionPanelHeight } from '../../client/src/mission-panel-layout.ts';
import { ObjectiveGuidance } from '../../client/src/objective-guidance.ts';

for (const [height, top, stickTop] of [[393, 70, 251], [589, 94, 375], [768, 84, 500]]) {
  test(`shared stack reserves direction and steering space at ${height}px`, () => {
    const panel = { top, left: 50, right: 330 };
    const limit = missionPanelHeight(height, panel, { top: stickTop, left: 60, right: 240 });
    assert.equal(top + limit + 62, stickTop);
    assert.ok(limit > 0);
    // A tall mission, or mission + territory combination, shares this same cap.
    assert.ok(limit < 450);
  });
}
test('custom joystick placement, desktop and constrained viewports have safe limits', () => {
  const panel = { top: 70, left: 12, right: 292 };
  assert.equal(missionPanelHeight(393, panel, { top: 220, left: 20, right: 180 }), 88);
  assert.equal(missionPanelHeight(393, panel, { top: 220, left: 600, right: 780 }), 174);
  assert.equal(missionPanelHeight(393, panel), 174);
  assert.equal(missionPanelHeight(150, panel, { top: 100, left: 20, right: 180 }), 0);
});
test('docked directions stay outside scrollable cards; ordinary guidance keeps its host', () => {
  const root = { append(arrow: any) { arrow.parentElement = this; } };
  const make = () => Object.assign(Object.create(ObjectiveGuidance.prototype), {
    hint: { reset() {} }, layer: root,
    arrow: { parentElement: null, classList: { toggle() {} } }, hide() {},
  });
  const stack = { append(arrow: any) { arrow.parentElement = this; } };
  const dock = { closest: () => stack };
  const guidance = make();
  guidance.setObjective({ id: 'giant', dock });
  assert.equal(guidance.arrow.parentElement, stack);
  guidance.setObjective({ id: 'normal' });
  assert.equal(guidance.arrow.parentElement, root);
  const cinematicDock = { closest: () => null, append(arrow: any) { arrow.parentElement = this; } };
  guidance.setObjective({ id: 'cinematic', dock: cinematicDock });
  assert.equal(guidance.arrow.parentElement, cinematicDock);
});
test('both common panels scroll, collapsed controls keep their size, and native touch scrolling is allowed', () => {
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  const rules = css.slice(css.indexOf('/* Share the available space'));
  assert.match(css, /:not\(\.mission-intro-skip\):not\(\.mission-status-layer\),/);
  assert.match(rules, /max-height: var\(--mission-panels-max-height/);
  assert.match(rules, /\.sky-challenge\.journey-hud, \.mission-territory-card\)[^{]*\{[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*touch-action: pan-y;[^}]*pointer-events: auto;/);
  assert.match(rules, /\.is-collapsed \{[^}]*flex-shrink: 0;[^}]*min-height: 34px;/);
  assert.match(rules, /mission-objective-docked \{[^}]*top: calc\(100% \+ 7px\)/);
});
