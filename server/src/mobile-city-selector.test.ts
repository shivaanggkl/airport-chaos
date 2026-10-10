import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');

test('City Journey replaces the city grid while reusing the existing time and launch flow', () => {
  assert.match(html, /id="app-shell-header" class="app-shell-header"/);
  assert.doesNotMatch(html, /id="launch-background"|<video/);
  assert.doesNotMatch(bootstrap, /setupLaunchBackground|launchBackground/);
  assert.match(css, /\.city-selector\s*\{[^}]*hangar\.jpg[^}]*var\(--ac-bg-deep\)/);
  assert.match(html, /id="city-options" class="city-journey"[\s\S]*data-city-journey-track[\s\S]*data-city-journey-dots[\s\S]*SWIPE TO EXPLORE/);
  assert.match(html, /id="city-back"[^>]*>BACK TO PILOT HUB<\/button>/);
  assert.doesNotMatch(html, /id="start-brand-signature"/);
  assert.doesNotMatch(html, /id="city-home"|id="city-close"|id="garage-entry"/);
  assert.match(bootstrap, /cityJourneyEntries[\s\S]*MILWAUKEE[\s\S]*TRAINING CITY[\s\S]*DALLAS[\s\S]*CITY 01[\s\S]*CALIFORNIA[\s\S]*COMING SOON[\s\S]*NEW YORK/);
  assert.match(bootstrap, /id: 'milwaukee'[\s\S]*artImage: milwaukeeJourneyImage[\s\S]*id: 'dallas'[\s\S]*city-journey\/dallas\.jpg[\s\S]*id: 'california'[\s\S]*california-coming-soon\.svg[\s\S]*id: 'new-york'[\s\S]*new-york-coming-soon\.svg/);
  assert.match(bootstrap, /--journey-art-image'[\s\S]*entry\.artImage[\s\S]*--journey-art-position', entry\.artPosition/);
  assert.match(bootstrap, /authoritativeHomeProfile\?\.tutorial\?\.status === 'completed'/);
  assert.match(bootstrap, /city\.status === 'available' && Boolean\(city\.loadWorld\)/);
  assert.match(bootstrap, /completed \? 'PRACTICE AGAIN' : 'START TRAINING'/);
  assert.match(bootstrap, /status: '✓ UNLOCKED', cta: 'FLY NOW'/);
  assert.match(bootstrap, /if \(state\.training\) void startTrainingFromHub\(\);[\s\S]*else chooseCity\(state\.city\)/);
  assert.match(bootstrap, /citySelector\.dataset\.view = 'cities'/);
  assert.match(bootstrap, /citySelector\.dataset\.view = 'time'/);
  assert.match(bootstrap, /Bright daytime flying/);
  assert.match(bootstrap, /Evening city atmosphere/);
  assert.match(bootstrap, /city-time-art/);
  assert.match(css, /\.city-time-day \.city-time-art[^}]*day\.jpg/);
  assert.match(css, /\.city-time-dusk \.city-time-art[^}]*dusk\.jpg/);
  assert.match(bootstrap, /localStorage\.setItem\(`airport-chaos-time-\$\{city\.id\}`/);
  assert.match(bootstrap, /void enterCity\(city, preset\)/);
  assert.match(bootstrap, /button\.className = 'entry-button entry-button-primary city-journey-cta'/);
  assert.match(bootstrap, /button\.className = 'entry-button entry-button-primary'/);
  assert.doesNotMatch(bootstrap, /cityId: 'california'|cityId: 'new-york'/);
});

test('City Journey launches a city with one configured time and offers selection for multiple times', () => {
  assert.match(bootstrap, /function chooseCity\(city: CityDefinition\): void \{[\s\S]*city\.timePresets\.length === 1[\s\S]*const preset = city\.timePresets\[0\]![\s\S]*void enterCity\(city, preset\)[\s\S]*return;[\s\S]*citySelector\.dataset\.view = 'time'/);
  assert.match(bootstrap, /for \(const preset of city\.timePresets\)/);
  const chooseCitySource = bootstrap.slice(bootstrap.indexOf('function chooseCity'), bootstrap.indexOf('function showTimeSelection'));
  assert.match(chooseCitySource, /city\.id === 'dallas'[\s\S]*showMissionJourney\(\)/);
  assert.doesNotMatch(chooseCitySource, /city\.id === 'milwaukee'/);
  assert.match(chooseCitySource, /city\.id === 'dallas' && !dallasUnlocked\(\)/);
  assert.match(bootstrap, /entry\.id === 'dallas' && !dallasUnlocked\(\)[\s\S]*cta: 'LOCKED', disabled: true/);
  assert.match(bootstrap, /function preferredCityJourneyIndex\([\s\S]*if \(!dallasUnlocked\(\)\) return Math\.max\(0, cityJourneyEntries\.findIndex\(entry => entry\.id === 'milwaukee'\)\)/);
});

test('City Journey keeps card nodes for smooth side-card, navigation, and drag transitions', () => {
  assert.match(bootstrap, /function createCityJourneyCards\(\): void \{[\s\S]*if \(cityJourneyViews\.length\) return;/);
  assert.match(bootstrap, /Math\.abs\(index - cityJourneyIndex\) !== 1[\s\S]*setCityJourneyIndex\(index\)/);
  assert.match(bootstrap, /event\.key !== 'ArrowLeft' && event\.key !== 'ArrowRight'/);
  assert.match(bootstrap, /event\.deltaX > 0 \? 1 : -1/);
  assert.match(bootstrap, /passedThreshold = wasDragging && Math\.abs\(dx\) >= 42[\s\S]*if \(passedThreshold\) stepCityJourney\(dx < 0 \? 1 : -1\)/);
  assert.match(bootstrap, /cityJourneyPointer\.dragging = true;[\s\S]*setPointerCapture\(event\.pointerId\)/);
  assert.match(bootstrap, /setProperty\('--journey-drag-x',[\s\S]*setProperty\('--journey-side-drag-x'/);
  assert.match(bootstrap, /Math\.abs\(dy\) > 10 && Math\.abs\(dy\) > Math\.abs\(dx\)[\s\S]*cityJourneyPointer = undefined/);
  assert.match(bootstrap, /performance\.now\(\) < cityJourneyClickBlockedUntil/);
  assert.match(css, /\.city-journey-card\.is-selected\s*\{[^}]*z-index:\s*3;[^}]*opacity:\s*1;[^}]*scale\(1\)/);
  assert.match(css, /\.city-journey-card\.is-previous,[\s\S]*\.city-journey-card\.is-next\s*\{[^}]*opacity:\s*\.7;[^}]*brightness\(\.58\)/);
  assert.match(css, /\.city-journey-card\.is-previous\s*\{[^}]*scale\(\.8\)/);
  assert.match(css, /transition:\s*transform 320ms cubic-bezier\(\.2, \.75, \.25, 1\), opacity 280ms ease-out/);
  assert.match(css, /\.city-journey\.is-dragging \.city-journey-card\s*\{[^}]*transition:\s*none/);
  assert.match(css, /\.city-journey-card:not\(\.is-selected\) \.city-journey-cta\s*\{[^}]*visibility:\s*hidden/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*--journey-card-width:\s*84vw;[\s\S]*--journey-side-offset:\s*70vw/);
  assert.match(css, /@media \(max-width: 950px\) and \(orientation: landscape\) and \(max-height: 520px\),\s*\(any-pointer: coarse\) and \(orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*\.city-select-card\s*\{[^}]*top:\s*calc\(var\(--safe-area-top\) \+ 46px\);[^}]*bottom:\s*auto;[^}]*width:\s*min\(var\(--entry-content-width\),[^}]*padding:\s*3px 10px;/);
  assert.match(css, /\.city-select-card\s*\{[^}]*grid-template-rows:\s*repeat\(2, auto\);[^}]*gap:\s*clamp\(8px, 1vw, 12px\)/);
  assert.match(css, /\.city-select-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;[^}]*backdrop-filter:\s*none;/);
  assert.match(css, /--journey-card-height:\s*clamp\(160px,[\s\S]*\.city-journey-card\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.city-context-back\s*\{[^}]*min-height:\s*46px;/);
  assert.match(bootstrap, /cityBack\.textContent = 'BACK TO PILOT HUB'/);
  assert.match(bootstrap, /cityBack\.textContent = returnTo === 'MISSION_JOURNEY' \? 'BACK TO MISSIONS' : 'BACK TO CITIES'/);
  assert.match(css, /body:has\(\.city-selector:not\(\[hidden\]\)\) \.tutorial-help\s*\{[^}]*right:\s*max\(24px, var\(--safe-area-right\)\);[^}]*bottom:\s*max\(24px, var\(--safe-area-bottom\)\);[^}]*left:\s*auto/);
  assert.doesNotMatch(css, /\.garage-entry|brand-logo-home|city-select-kicker/);
});

test('City Journey renders unavailable and future locked CTAs as inert controls', () => {
  assert.match(bootstrap, /const label = entry\.cityId \? 'LOCKED' : 'COMING SOON'/);
  assert.match(bootstrap, /state\.disabled \|\| !state\.city/);
  assert.match(bootstrap, /view\.cta\.disabled = state\.disabled === true/);
  assert.match(bootstrap, /setAttribute\('aria-disabled', state\.disabled === true \? 'true' : 'false'\)/);
  assert.match(css, /\.city-journey-cta:disabled,[\s\S]*cursor:\s*default;[\s\S]*filter:\s*saturate\(\.45\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.city-journey-card \{ transition: none; \}/);
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
