import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('the active mission is rendered once and excluded from available mission cards', () => {
  assert.match(menu, /const current = data\.missions\.entries\.find\(\(entry\) => entry\.id === data\.missions\.activeId\)/);
  assert.match(menu, /pilot-menu-mission-active-section/);
  assert.match(menu, /const availableMissions = data\.missions\.entries\.filter\(\(item\) => item\.id !== data\.missions\.activeId\)/);
  assert.match(menu, /for \(const item of availableMissions\)/);
  assert.doesNotMatch(menu, /for \(const item of data\.missions\.entries\)/);
});

test('mission profile changes rebuild the active and available sections after accept, abandon, or completion', () => {
  assert.match(menu, /case 'MISSIONS': return JSON\.stringify\(\[this\.activeSection, data\.missions\.activeId/);
  assert.match(main, /activeMissionAttemptId = profileActiveMissionAttempt\(profile\)\?\.attemptId/);
  assert.match(main, /message\.type === 'missionCompleted'[\s\S]*activeMissionAttemptId = undefined/);
  assert.match(server, /message\.type === 'missionAbandon'[\s\S]*profileStore\.abandonMission[\s\S]*sendProfile/);
});

test('mission accept controls are compact, right-aligned, and touch sized', () => {
  assert.match(menu, /pilot-menu-mission-card', 'pilot-menu-mission-option/);
  assert.match(css, /\.pilot-menu-mission-option\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.pilot-menu-mission-option \.pilot-menu-actions\s*\{[^}]*grid-column:\s*2;[^}]*margin-top:\s*0;/);
  assert.match(css, /\.pilot-menu-mission-card \.pilot-menu-actions\s*\{[^}]*justify-content:\s*flex-end;/);
  assert.match(css, /\.pilot-menu-mission-card \.pilot-menu-actions button\s*\{[^}]*width:\s*clamp\(120px, 18vw, 160px\);[^}]*min-height:\s*44px;/);
});

test('mission authority, rewards, and cooldowns remain server-owned', () => {
  assert.match(server, /profileStore\.acceptMission/);
  assert.match(server, /profileStore\.abandonMission/);
  assert.match(server, /profileStore\.completeMission/);
  assert.match(menu, /cooldownUntil > now/);
  assert.doesNotMatch(menu, /creditReward\s*[+\-=]|scoreReward\s*[+\-=]/);
});
