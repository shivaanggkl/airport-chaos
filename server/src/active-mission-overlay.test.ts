import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('active mission overlay is a single display-only view above transient notices', () => {
  assert.equal(html.match(/id="active-mission-overlay"/g)?.length, 1);
  assert.match(html, /id="mission-status-layer"[\s\S]*id="active-mission-overlay"[\s\S]*id="active-mission-title"[\s\S]*id="active-mission-objective"[\s\S]*id="active-mission-progress"[\s\S]*id="active-mission-bar"[\s\S]*id="flight-notifications"/);
  const overlayMarkup = html.match(/<aside id="active-mission-overlay"[\s\S]*?<\/aside>/)?.[0] ?? '';
  assert.doesNotMatch(overlayMarkup, /<button|Open Missions/);
  assert.doesNotMatch(`${html}\n${main}\n${css}`, /id="next-actions"|NextActionSystem|FLY: Take Off/);
});

test('overlay reuses authoritative mission metadata and progress update path', () => {
  assert.match(main, /function updateMissionHud\(\): void \{[\s\S]*serverProfile\.missions\[cityId\]\?\.active[\s\S]*missionForCity\(cityId, active\.missionId\)[\s\S]*missionProgress\(definition, active\)/);
  assert.match(main, /const hudProgress = missionHudProgress\(definition, mobileProgress\)/);
  assert.match(main, /activeMissionTitleElement\.textContent = definition\.displayName/);
  assert.match(main, /activeMissionObjectiveElement\.textContent = missionHudObjective\(definition\)/);
  assert.match(main, /activeMissionProgressElement\.textContent = hudProgress\.text/);
  assert.match(main, /activeMissionBarElement\.hidden = hudProgress\.barValue === undefined \|\| hudProgress\.barMax === undefined/);
  assert.match(main, /activeMissionOverlayElement\.hidden = false/);
  assert.match(main, /activeMissionOverlayElement\.hidden = true/);
});

test('mission overlay is compact, responsive, and leaves notices and rewards independently anchored', () => {
  assert.match(css, /\.mission-status-layer\s*\{[^}]*position:\s*fixed;[^}]*display:\s*grid;[^}]*gap:\s*6px;[^}]*width:\s*min\(260px,/);
  assert.match(css, /\.active-mission-overlay\s*\{[^}]*display:\s*grid;[^}]*padding:\s*5px 7px;[^}]*background:\s*rgb\(24 52 74 \/ 60%\);/);
  assert.match(css, /#active-mission-bar \{[^}]*width:\s*min\(190px, 100%\);[^}]*height:\s*5px;/);
  assert.match(css, /#active-mission-bar::-webkit-progress-value \{[^}]*linear-gradient\(90deg, var\(--ui-cyan\), var\(--ui-gold\)\)/);
  assert.match(css, /@media\(max-width:700px\) and \(orientation:landscape\)[\s\S]*\.mission-status-layer\s*\{[^}]*top:\s*56px;[^}]*width:\s*clamp\(190px, 30vw, 230px\);/);
  assert.match(css, /@media\(min-width:701px\) and \(max-width:950px\) and \(orientation:landscape\)[\s\S]*\.mission-status-layer\s*\{[^}]*width:\s*clamp\(210px, 30vw, 250px\);/);
  assert.match(css, /\.reward-feedback\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 8px\);/);
});
