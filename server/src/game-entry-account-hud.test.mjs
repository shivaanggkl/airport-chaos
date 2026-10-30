import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const html = read('client/index.html');
const main = read('client/src/main.ts');
const menu = read('client/src/pilot-menu.ts');
const css = read('client/src/style.css');

test('city entry account refresh never opens Pilot Menu automatically', () => {
  const refresh = main.match(/async function refreshAccountStatus[\s\S]*?\n}\nlet activeMissionAttemptId/)?.[0] ?? '';
  assert.match(refresh, /updateAuthHudControl\(\)/);
  assert.doesNotMatch(refresh, /renderPilotMenu\(true/);
  assert.match(menu, /open\(data: PilotMenuData, section: PilotMenuSection = 'MISSIONS'\)/);
});

test('Missions remain directly reachable without the retired reminder popup', () => {
  assert.doesNotMatch(html, /id="mission-reminder"/);
  assert.match(main, /function openActiveMissionFromHud\(\)[\s\S]*openPilotMenu\('MISSIONS'\)/);
  assert.match(main, /cityGuide: openCityGuide/);
});

test('flight menus keep profile out of single-player and multiplayer HUDs', () => {
  assert.match(html, /id="flight-account-button"[\s\S]*id="flight-account-avatar"[\s\S]*id="flight-account-label"[\s\S]*avatar-fallback/);
  assert.match(main, /clientAccount\.state === 'account'/);
  assert.match(main, /flightAccountButtonElement\.hidden = Boolean\(flightMenuMode\)/);
  assert.match(main, /if \(!flightMenuMode\) openPilotMenu\('PROFILE'\)/);
  assert.match(main, /flightAccountAvatarElement\.addEventListener\('error'/);
  assert.match(css, /\.flight-account-button\.is-account[\s\S]*border-radius: 50%/);
  assert.match(css, /@media\s*\(max-width:\s*700px\) and \(orientation:\s*landscape\)[\s\S]*\.unified-flight-hud/);
});
