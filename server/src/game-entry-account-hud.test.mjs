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

test('mission reminder is bounded, airborne-only, and opens Missions directly', () => {
  assert.match(html, /id="mission-reminder"[\s\S]*No mission active[\s\S]*data-mission-reminder-open>MISSIONS/);
  assert.match(main, /missionReminderFirstDelaySeconds = 60/);
  assert.match(main, /missionReminderRepeatDelayMs = 10 \* 60_000/);
  assert.match(main, /missionReminderMaxPerSession = 2/);
  assert.match(main, /localLifeState === 'alive'[\s\S]*!onGround[\s\S]*!crashed/);
  assert.match(main, /window\.setTimeout\(\(\) => hideMissionReminder\(\), 8_000\)/);
  assert.match(main, /openPilotMenu\('MISSIONS'\)/);
  assert.match(main, /Practice Mode gives no permanent rewards/);
});

test('top HUD exposes responsive server-session login and avatar control', () => {
  assert.match(html, /id="flight-account-button"[\s\S]*id="flight-account-avatar"[\s\S]*>LOGIN</);
  assert.match(main, /clientAccount\.state === 'account'/);
  assert.match(main, /flightAccountButtonElement\.addEventListener\('click', \(\) => openPilotMenu\('PROFILE'\)\)/);
  assert.match(main, /flightAccountAvatarElement\.addEventListener\('error'/);
  assert.match(css, /\.flight-account-button\.is-account[\s\S]*border-radius: 50%/);
  assert.match(css, /@media\(max-width:700px\) and \(orientation:landscape\)[\s\S]*\.flight-account-button\.is-account/);
});
