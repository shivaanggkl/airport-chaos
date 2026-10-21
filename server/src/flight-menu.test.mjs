import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const main = read('client/src/main.ts');
const menu = read('client/src/pilot-menu.ts');
const css = read('client/src/style.css');
const html = read('client/index.html');
const server = read('server/src/index.ts');

test('one flight menu shell exposes only mode-appropriate tabs and actions', () => {
  assert.match(main, /const flightMenuMode = journeyMode \? 'single' : trainingRequested \? 'training' : 'multiplayer'/);
  assert.match(main, /const pilotMenu = new PilotMenu[\s\S]*flightMode: flightMenuMode[\s\S]*sections: flightMenuMode === 'single' \? \['MISSION', 'CONTROLS', 'AUDIO', 'HELP'\] : \['CONTROLS', 'AUDIO', 'HELP'\]/);
  assert.match(menu, /flightMode\?: 'single' \| 'training' \| 'multiplayer'/);
  assert.match(menu, /const settingsLayout = this\.options\.appShell === true \|\| this\.options\.flightMode !== undefined/);
  assert.match(menu, /this\.options\.flightMode === 'single' \? 'MISSION PAUSED' : this\.options\.flightMode === 'training' \? 'TRAINING MENU' : 'FLIGHT MENU'/);
  assert.match(menu, /this\.options\.appShell \|\| this\.options\.flightMode\) \{ this\.close\(\); return; \}/);
  assert.match(menu, /label: this\.options\.flightMode === 'single' \? 'RESUME MISSION' : this\.options\.flightMode === 'training' \? 'RETURN TO TRAINING' : 'RETURN TO FLIGHT'/);
  assert.match(menu, /label: this\.options\.flightMode === 'single' \? 'EXIT TO JOURNEY' : this\.options\.flightMode === 'training' \? 'EXIT TRAINING' : 'LEAVE SESSION'/);
});

test('single-player menu uses authoritative pause and live mission data; multiplayer stays live', () => {
  assert.match(main, /if \(flightMenuMode === 'single' && journeyAttempt[\s\S]*pauseJourney\(\);[\s\S]*renderPilotMenu\(true, section\)/);
  assert.match(main, /beforeClose: \(\) => \{[\s\S]*if \(flightMenuMode !== 'single' \|\| !journeyPaused\) return true;[\s\S]*resumeJourney\(\);[\s\S]*return false;/);
  assert.match(menu, /if \(notify && this\.openState && this\.options\.beforeClose\?\.\(\) === false\) return;/);
  assert.match(main, /socket\.send\(JSON\.stringify\(\{ type: 'journeyPause', attemptId: journeyAttemptId \}\)\)/);
  assert.match(main, /socket\.send\(JSON\.stringify\(\{ type: 'journeyResume', attemptId: journeyAttemptId \}\)\)/);
  assert.match(main, /flightMission: journeyMode && journeyAttempt \? \{[\s\S]*journeyHudObjective\?\.textContent[\s\S]*journeyAttempt\.gateIndex[\s\S]*journeyHudTimer\?\.textContent/);
  assert.match(menu, /this\.options\.flightMode === 'multiplayer' \|\| this\.options\.flightMode === 'training'/);
  assert.match(menu, /'⚠ TRAINING CONTINUES WHILE THIS MENU IS OPEN' : '⚠ FLIGHT CONTINUES WHILE THIS MENU IS OPEN'/);
  assert.doesNotMatch(html, /id="journey-pause-overlay"/);
  assert.doesNotMatch(css, /\.journey-pause-overlay/);
});

test('background pause uses the flight menu and preserves a valid resume pose', () => {
  assert.match(main, /sendLocalState\(\);\s*socket\.send\(JSON\.stringify\(\{ type: 'journeyPause'/);
  assert.match(main, /if \(!document\.hidden && journeyAttempt && !pilotMenu\.isOpen\(\)\) renderPilotMenu\(true, 'MISSION'\)/);
  assert.match(main, /setJourneyPaused\(message\.paused, pauseDeadlineFromServer\(message\.pausedAt, message\.serverNow\), !message\.paused\)/);
  assert.match(menu, /data-journey-pause-countdown|dataset\.journeyPauseCountdown/);
  assert.match(server, /position: initialAcceptedPosition,\s*rotation:/);
});

test('restart and leave are confirmed, while normal close resumes without resetting', () => {
  assert.match(menu, /const closeAction = this\.options\.flightMode \? \(\) => this\.close\(\) : closeTopUiLayer/);
  assert.match(menu, /createContextBackButton\(closeLabel, closeAction\)/);
  assert.match(main, /restartFlight: \(\) => \{[\s\S]*showFlightDialog\('Restart mission\?'[\s\S]*pilotMenu\.close\(false\); void retryJourneyMission\(\)/);
  assert.match(main, /function requestFlightExit[\s\S]*showFlightDialog\('Exit mission\?'[\s\S]*showFlightDialog\('Exit flight\?'/);
  assert.match(main, /if \(pilotMenu\.isOpen\(\)\) pilotMenu\.close\(false\);\s*realtimeStopped = true/);
  assert.match(main, /journeyPauseRequestPendingUntil = Date\.now\(\) \+ 2_000/);
  assert.match(main, /if \(wasPaused && flightMenuMode === 'single' && pilotMenu\.isOpen\(\)\) pilotMenu\.close\(false\)/);
});

test('flight tabs reuse persisted Settings controls, audio and compact landscape layout', () => {
  assert.match(menu, /this\.activeSection === 'CONTROLS' && \(this\.options\.appShell \|\| flightMenu\)/);
  assert.match(menu, /this\.activeSection === 'AUDIO'[\s\S]*this\.options\.appShell \|\| flightMenu/);
  assert.match(menu, /data\.preferences\.setMobileControl\(control, \{ \[property\]: next \}\)/);
  assert.match(menu, /data\.audio\.setLevel\(category, level\)/);
  assert.match(main, /setMobileControl:\(control:MobileControlId,placement:Partial<MobileControlPlacement>\)=>mobileInput\.setPlacement\(control,placement\)/);
  assert.match(main, /audio: \{ muted: audioManager\.isMuted\(\), toggle: toggleAudio, levels: audioManager\.getLevels\(\), setLevel: setAudioLevel \}/);
  assert.match(css, /\.pilot-menu-card\.is-flight-menu > \.pilot-menu-content \{[\s\S]*overflow: hidden/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 450px\)/);
});
