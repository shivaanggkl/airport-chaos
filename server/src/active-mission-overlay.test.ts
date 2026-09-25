import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('active mission overlay is a single display-only view above transient notices', () => {
  assert.equal(html.match(/id="active-mission-overlay"/g)?.length, 1);
  assert.match(html, /id="mission-status-layer"[\s\S]*id="active-mission-overlay"[\s\S]*id="active-mission-title"[\s\S]*id="active-mission-objective"[\s\S]*id="active-mission-progress"[\s\S]*id="flight-notifications"/);
  const overlayMarkup = html.match(/<aside id="active-mission-overlay"[\s\S]*?<\/aside>/)?.[0] ?? '';
  assert.doesNotMatch(overlayMarkup, /<button|Open Missions/);
  assert.doesNotMatch(`${html}\n${main}\n${css}`, /id="next-actions"|NextActionSystem|FLY: Take Off/);
});

test('overlay reuses authoritative mission metadata and progress update path', () => {
  assert.match(main, /function updateMissionHud\(\): void \{[\s\S]*serverProfile\.missions\[cityId\]\?\.active[\s\S]*missionForCity\(cityId, active\.missionId\)[\s\S]*missionProgress\(definition, active\)/);
  assert.match(main, /activeMissionTitleElement\.textContent = `MISSION: \$\{definition\.displayName\}`/);
  assert.match(main, /activeMissionObjectiveElement\.textContent = definition\.description/);
  assert.match(main, /activeMissionProgressElement\.textContent = missionOverlayProgress\(definition, mobileProgress\)/);
  assert.match(main, /activeMissionOverlayElement\.hidden = false/);
  assert.match(main, /activeMissionOverlayElement\.hidden = true/);
});

test('mission overlay is compact, responsive, and leaves notices and rewards independently anchored', () => {
  assert.match(css, /\.mission-status-layer\s*\{[^}]*position:\s*fixed;[^}]*display:\s*grid;[^}]*gap:\s*8px;/);
  assert.match(css, /\.active-mission-overlay\s*\{[^}]*display:\s*grid;[^}]*padding:\s*6px 8px;[^}]*background:\s*rgb\(4 18 28 \/ 52%\);/);
  assert.match(css, /@media\(max-width:700px\) and \(orientation:landscape\)[\s\S]*\.mission-status-layer\s*\{[^}]*top:\s*56px;[^}]*width:\s*clamp\(200px, 34vw, 300px\);/);
  assert.match(css, /@media\(min-width:701px\) and \(max-width:950px\) and \(orientation:landscape\)[\s\S]*\.mission-status-layer\s*\{[^}]*width:\s*clamp\(238px, 34vw, 300px\);/);
  assert.match(css, /\.reward-feedback\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 8px\);/);
});
