import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const missionJourney = readFileSync(new URL('../../client/src/mission-journey.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('City Journey uses live cards and the existing city registry', () => {
  assert.match(html, /id="city-selector"[\s\S]*data-city-journey-track[\s\S]*data-city-previous[\s\S]*data-city-next[\s\S]*data-city-journey-dots/);
  assert.match(html, /id="city-help"[\s\S]*id="city-help-dialog"/);
  assert.match(css, /\.city-selector\s*\{[^}]*hangar\.jpg/);
  assert.match(bootstrap, /\.\.\.cities\.map\(\(city, index\) =>/);
  assert.match(bootstrap, /missionJourneyStages\.filter\(stage => stage\.implementation === 'playable'\)\.length/);
  assert.match(bootstrap, /detail: 'COMING SOON', status: 'CITY LOCKED', cta: 'LOCKED', disabled: true/);
  assert.match(bootstrap, /view\.cta\.disabled = state\.disabled === true/);
});

test('Missions and Free Fly keep separate launch routes', () => {
  assert.match(html, /data-home-missions>[\s\S]*<strong>MISSIONS<\/strong>[\s\S]*data-home-free-fly>[\s\S]*<strong>FREE FLY<\/strong>/);
  assert.match(bootstrap, /type CityJourneyMode = LaunchMode/);
  assert.match(bootstrap, /requestHubFly\('missions'\)[\s\S]*requestHubFly\('free-fly'\)/);
  assert.match(bootstrap, /if \(cityJourneyMode === 'free-fly'\) \{\s*abandonPendingJourneyLaunch\(\);\s*showTimeSelection\(city\);\s*return;/);
  assert.match(bootstrap, /if \(city\.id === 'dallas'\) \{\s*showMissionJourney\(\)/);
  assert.match(bootstrap, /if \(state\.training\) void startTrainingFromHub\(\)/);
  assert.match(bootstrap, /cityJourneyMode === 'missions' \? 'VIEW MISSIONS' : 'CONTINUE'/);
  assert.doesNotMatch(missionJourney, /data-mission-free|FREE FLY DALLAS/);
});

test('Free Fly advertises only supported city features and keeps time selection', () => {
  assert.match(bootstrap, /capabilities\?\.competitiveEnabled \? 'MULTIPLAYER FREE FLY' : 'PRACTICE FREE FLY'/);
  assert.match(bootstrap, /!capabilities\?\.competitiveEnabled && !capabilities\?\.practiceMode/);
  assert.match(bootstrap, /tutorial\?\.status !== 'started'[\s\S]*START TRAINING IN MISSIONS FIRST/);
  assert.match(bootstrap, /for \(const preset of city\.timePresets\)/);
  assert.match(bootstrap, /void enterCity\(city, preset\)/);
  assert.match(bootstrap, /cityJourneyMode === 'missions' \? 'CITY JOURNEY' : 'FREE FLY'/);
  assert.match(bootstrap, /cityHelpCopy\.textContent = cityJourneyMode === 'missions'/);
});

test('carousel prevents swipe activation and restores selection', () => {
  assert.match(bootstrap, /cityJourneyClickBlockedUntil = performance\.now\(\) \+ 350/);
  assert.match(bootstrap, /cityJourneyLaunching \|\| performance\.now\(\) < cityJourneyClickBlockedUntil/);
  assert.match(bootstrap, /setCityJourneyIndex\(cityJourneyIndex \+ direction\)/);
  assert.match(bootstrap, /localStorage\.getItem\(CITY_JOURNEY_SELECTION_KEY\)/);
  assert.match(bootstrap, /cityJourneyPrevious\.disabled = cityJourneyIndex === 0/);
  assert.match(bootstrap, /cityJourneyNext\.disabled = cityJourneyIndex === cityJourneyEntries\.length - 1/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.city-journey-card \{ transition: none; \}/);
  assert.match(css, /\(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\)/);
});

test('short touch landscape keeps Pilot Menu header fixed with independent navigation and content scrolling', () => {
  assert.match(css, /\(any-pointer:coarse\) and \(orientation:landscape\) and \(max-height:520px\)\{[\s\S]*\.pilot-menu-card\{[^}]*grid-template:[^}]*108px minmax\(0,1fr\);[^}]*height:100%;[^}]*max-height:100%;/);
  assert.match(css, /\.pilot-menu-navigation\{[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.pilot-menu-content\{[^}]*min-width:0;[^}]*overflow-x:hidden/);
  assert.match(css, /\.pilot-profile-identity\{[^}]*padding:10px/);
});

test('WKWebView and short landscape overlays use an explicit compact type scale', () => {
  assert.match(css, /html\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/);
  assert.match(css, /@media \(max-width: 950px\) and \(orientation: landscape\),\s*\(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*--font-body-size:\s*14px;[\s\S]*--font-meta-size:\s*12px;[\s\S]*\.pilot-progress-card \.pilot-progress-value\s*\{[^}]*font-size:\s*clamp\(18px, 2\.2vw, 22px\);/);
});

test('short landscape restores two-column progress and Garage presentation', () => {
  assert.match(css, /@media \(max-width: 950px\) and \(orientation: landscape\),\s*\(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*\.pilot-progress-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.garage-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\.48fr\) minmax\(270px,\.52fr\);/);
  assert.match(css, /\.garage-preview,[\s\S]*\.garage-preview canvas\s*\{[^}]*height:\s*100%;/);
});
