import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('cold entry shows the real-progress brand loader before the Pilot Hub', () => {
  const html = read('client/index.html');
  const bootstrap = read('client/src/bootstrap.ts');
  const loading = read('client/src/startup-loading.ts');
  assert.ok(html.indexOf('id="brand-loading"') < html.indexOf('id="home-hangar"'));
  assert.match(html, /id="brand-loading"[\s\S]*LOADING FLIGHT SYSTEMS\.\.\.[\s\S]*data-startup-progress/);
  assert.match(html, /id="home-hangar" class="home-hangar"[^>]*hidden/);
  assert.match(bootstrap, /const profileTask = loadGarageProfile\(\)/);
  assert.match(bootstrap, /await Promise\.all\(\[brandTask, profileTask\]\)/);
  assert.match(bootstrap, /await showHome\(\);[\s\S]*startupLoading\.update\(1\);[\s\S]*await startupLoading\.finish\(\)/);
  assert.match(loading, /minimumVisibleMs = 2_000/);
  assert.match(loading, /remainingMinimum = BrandLoadingScreen\.minimumVisibleMs - \(performance\.now\(\) - this\.shownAt\)/);
  assert.match(loading, /if \(remainingMinimum > 0\) await new Promise<void>\(resolve => window\.setTimeout\(resolve, remainingMinimum\)\)/);
  assert.match(loading, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(loading, /classList\.add\('is-leaving'\)/);
});

test('Pilot Hub routes Missions and Free Fly through separate city selection modes', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const main = read('client/src/main.ts');
  assert.match(bootstrap, /missions: \(\) => [^\n]*requestHubFly\('missions'\)/);
  assert.match(bootstrap, /freeFly: \(\) => [^\n]*requestHubFly\('free-fly'\)/);
  assert.match(bootstrap, /async function requestHubFly\(mode: CityJourneyMode = cityJourneyMode\)[\s\S]*refreshHubPilotData\(\)[\s\S]*showSelector\('', \{ mode,[\s\S]*rememberPendingHubFly\(mode\)/);
  assert.match(bootstrap, /if \(options\.mode\) cityJourneyMode = options\.mode/);
  assert.match(bootstrap, /if \(city\.id === 'dallas'\) \{\s*showMissionJourney\(\)/);
  assert.match(bootstrap, /url\.searchParams\.set\(LAUNCH_MODE_PARAM, cityJourneyMode\)/);
  assert.match(main, /launchMode === 'missions' && cityId === 'dallas'/);
  assert.match(bootstrap, /function resumePendingHubFly\(\)[\s\S]*hubAccount\.state !== 'account'[\s\S]*clearPendingHubFly\(\)[\s\S]*showSelector/);
  assert.match(bootstrap, /function continueHubAsGuest\(\)[\s\S]*hasPendingHubFly\(\)[\s\S]*clearPendingHubFly\(\)[\s\S]*showSelector/);
  assert.match(bootstrap, /hubFlyGateActive \|\| \(hasPendingHubFly\(\) && hubPilotMenu\.isOpen\(\)\)/);
  assert.match(bootstrap, /authResult === 'success' && resumePendingHubFly\(\)/);
  assert.match(bootstrap, /authResult === 'failed' \|\| authResult === 'collision'[\s\S]*openHubPilotMenu\('PROFILE', false\)/);
  assert.match(bootstrap, /function showSelector[\s\S]*entryState = 'CITY_SELECTION';[\s\S]*citySelector\.hidden = false/);
  assert.match(bootstrap, /cityBack\.addEventListener\('click', returnFromCitySelection\)/);
  assert.match(bootstrap, /id: 'city-selection'[\s\S]*close: returnFromCitySelection/);
  assert.match(bootstrap, /function chooseCity[\s\S]*void enterCity\(city, preset\)/);
  assert.match(bootstrap, /await city\.loadWorld\(\);\s*await import\('\.\/main'\);/);
  assert.doesNotMatch(bootstrap, /maybeBriefCityBeforeEntry|showFlightDialog/);
  assert.doesNotMatch(main, /maybeOpenFirstCityGuide/);
  assert.match(main, /cityGuide: openCityGuide/);
});

test('account UI offers Google, Apple, or device-bound guest play without password accounts', () => {
  const menu = read('client/src/pilot-menu.ts');
  const bootstrap = read('client/src/bootstrap.ts');
  const css = read('client/src/style.css');
  assert.doesNotMatch(menu, /You are signed in\. Log out first to use another account\./);
  assert.match(menu, /section\('PROFILE'\)[\s\S]*Your pilot identity and account\./);
  assert.match(menu, /pilotXpForLevel\(pilot\.level\)[\s\S]*pilot-profile-identity[\s\S]*LEVEL \$\{pilot\.level\} · \$\{pilot\.title\}/);
  assert.match(menu, /\['CREDITS', account\.credits\], \['SCORE', account\.score\], \['AIRCRAFT', account\.ownedAircraft\], \['BADGES', account\.badges\]/);
  assert.match(menu, /profileNameEditing[\s\S]*CANCEL[\s\S]*SAVE[\s\S]*EDIT NAME/);
  assert.match(menu, /data\.nativeWebPromotion && account\.state === 'account'/);
  assert.match(menu, /this\.options\.closeLabel[\s\S]*BACK TO GAME/);
  assert.doesNotMatch(menu, /LINKED ACCOUNTS|LINK \$\{method\.label\}/);
  assert.match(menu, /CHOOSE HOW TO PLAY/);
  assert.match(menu, /Continue with \$\{provider === 'google' \? 'Google' : 'Apple'\}/);
  assert.match(menu, /pilot-auth-divider[\s\S]*PLAY AS GUEST[\s\S]*Guest progress stays on this device[\s\S]*legalConfig\.policyRoutes\.terms[\s\S]*legalConfig\.policyRoutes\.privacy/);
  assert.doesNotMatch(menu, /pilot-account-auth-form|authMode|Password|CREATE ACCOUNT/);
  assert.match(menu, /if \(actionPending\) return;[\s\S]*querySelectorAll<HTMLButtonElement \| HTMLInputElement>\('button, input'\)[\s\S]*aria-busy/);
  assert.match(css, /\.pilot-menu-card \.pilot-provider-google[\s\S]*background: #fff/);
  assert.match(css, /\.pilot-menu-card \.pilot-provider-apple[\s\S]*background: #000/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.pilot-menu-card\.is-authentication/);
  assert.match(bootstrap, /credential\.cancelled[\s\S]*clearPendingHubFly\(\)[\s\S]*showHome\(\)/);
  assert.match(bootstrap, /continueAsGuest: continueHubAsGuest/);
  assert.match(bootstrap, /path === 'logout'[\s\S]*clearPendingHubFly\(\)[\s\S]*clearNativeProviderState\(\)/);
  assert.match(menu, /refresh\(data: PilotMenuData, force = false\)[\s\S]*!force && \(this\.pointerActive \|\| this\.isActivelyScrolling\(\)\)/);
  assert.match(bootstrap, /hubPilotMenu\.refresh\(hubPilotMenuData\(\), true\)/);
});

test('Pilot Hub reuses the Garage renderer, selected-aircraft loader, and cached model path', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const garage = read('client/src/garage.ts');
  const home = read('client/src/home-hangar.ts');
  assert.doesNotMatch(home, /three|WebGLRenderer|attachAircraftAsset/);
  assert.equal((garage.match(/new THREE\.WebGLRenderer/g) ?? []).length, 1);
  assert.match(garage, /showcase\(host: HTMLElement, profile: GarageProfile\): Promise<void>[\s\S]*host\.prepend\(this\.renderer\.domElement\)/);
  assert.match(garage, /this\.selected = this\.profile\.selectedAircraft;[\s\S]*this\.loadPreview\(\)/);
  assert.match(garage, /attachAircraftAsset\(plane, fallback, this\.selected/);
  assert.match(bootstrap, /return garage\.showcase\(appHeader\.aircraftPreviewHost, garageProfile\)/);
  assert.match(bootstrap, /aircraftName: aircraftDisplayName\(garageProfile\.selectedAircraft\)/);
});

test('Pilot Hub leaves space for launch cards and keeps legal links in the Pilot Menu', () => {
  const html = read('client/index.html');
  const bootstrap = read('client/src/bootstrap.ts');
  const menu = read('client/src/pilot-menu.ts');
  assert.doesNotMatch(html, /id="home-brand-signature"/);
  assert.doesNotMatch(bootstrap, /mountCompactBrandFooter/);
  assert.match(menu, /this\.activeSection === 'LEGAL \/ SUPPORT'[\s\S]*Terms of Use[\s\S]*Privacy Policy[\s\S]*Refund Policy[\s\S]*Support/);
});

test('flight entry keeps the city visible until gameplay is ready and the launch wait is visible', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const css = read('client/src/style.css');
  const game = read('client/src/main.ts');
  assert.match(bootstrap, /await city\.loadWorld\(\);\s*await import\('\.\/main'\);\s*notifySharedMenuPreferences\(\);\s*gameRoot\.hidden = false;\s*citySelector\.hidden = true;/);
  assert.doesNotMatch(css, /#game-root\.launch-cinematic-pending > canvas \{ opacity: 0;/);
  assert.match(css, /#game-root\.launch-cinematic-active > :not\(canvas\)/);
  assert.match(game, /skyTokens\?: number;[\s\S]*profile\.skyTokens === undefined \|\| \(Number\.isSafeInteger\(profile\.skyTokens\)/);
  assert.match(game, /skyTokens = profile\.skyTokens \?\? 0;/);
});

test('Pilot Hub keeps the center empty and reuses one selected-aircraft header renderer', () => {
  const garage = read('client/src/garage.ts');
  const bootstrap = read('client/src/bootstrap.ts');
  const css = read('client/src/style.css');
  assert.doesNotMatch(garage, /this\.buildShowcaseSet\(\)/);
  assert.equal((garage.match(/new THREE\.WebGLRenderer/g) ?? []).length, 1);
  assert.match(bootstrap, /garage\.showcase\(appHeader\.aircraftPreviewHost, garageProfile\)/);
  assert.match(css, /\.home-hangar-stage, \.home-hangar-aircraft-name \{ display: none/);
  assert.match(garage, /this\.selected = this\.profile\.selectedAircraft/);
  assert.match(garage, /reducedMotion\.matches/);
});

test('Garage equip and close return to the Hub with current authoritative profile state', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(bootstrap, /const profile = await response\.json\(\) as RemoteGarageProfile;[\s\S]*applyAuthoritativeHomeProfile\(profile\)/);
  assert.match(bootstrap, /if \(entryState === 'AIRCRAFT'\)[\s\S]*garageReturnState === 'CITY_SELECTION'[\s\S]*void showHome\(\)/);
  assert.match(bootstrap, /function showHome[\s\S]*homeHangar\.show\(homeHangarData\(\)\);[\s\S]*garage\.showcase\(appHeader\.aircraftPreviewHost, garageProfile\)/);
  assert.match(bootstrap, /authoritativeHomeProfile = profile/);
});

test('Pilot Hub routes to canonical Garage and profile screens without duplicate panels', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const home = read('client/src/home-hangar.ts');
  const html = read('client/index.html');
  const css = read('client/src/style.css');
  const menu = read('client/src/pilot-menu.ts');
  const server = read('server/src/index.ts');
  assert.match(bootstrap, /garage: \(\) => \{ hapticsManager\.emit\('selection'\); void openStartGarage\([\s\S]*?'HANGAR'\); \}/);
  assert.doesNotMatch(bootstrap, /aircraft: \(\) => \{ void openStartGarage\('HANGAR'\); \}/);
  assert.match(bootstrap, /rewards: \(\) => \{ hapticsManager\.emit\('selection'\); void openHubRewards\(\); \}/);
  assert.match(bootstrap, /profile: \(\) => \{ hapticsManager\.emit\('selection'\); void openHubPilotMenu\('PROFILE', true, !missionJourneyReturnPending\); \}/);
  assert.doesNotMatch(bootstrap, /settings: \(\) => \{ void openHubPilotMenu\('SETTINGS'\); \}/);
  assert.match(bootstrap, /const hubPilotMenu = new PilotMenu\(pilotMenuOverlay/);
  assert.match(bootstrap, /sections: \['PROFILE', 'REWARDS', 'PROGRESS', 'GARAGE', 'CONTROLS', 'AUDIO', 'HELP', 'WORLD \/ CITIES', 'LEGAL \/ SUPPORT', 'DATA LICENSES'\]/);
  assert.match(bootstrap, /const hubSection = section === 'MISSIONS' \? 'PROFILE' : section/);
  assert.match(bootstrap, /closeLabel: \(\) => hubPilotMenuReturnState === 'CITY_SELECTION' \? 'BACK TO CITY SELECTION' : hubPilotMenuReturnState === 'MISSION_JOURNEY' \? 'BACK TO MISSIONS' : hubPilotMenuReturnState === 'STORE' \? 'BACK TO STORE' : 'BACK TO PILOT HUB'/);
  assert.match(bootstrap, /onClose: \(\) => \{[\s\S]*hubPilotMenuReturnState === 'CITY_SELECTION'[\s\S]*showSelector\(\)[\s\S]*void showHome\(\)/);
  assert.match(menu, /options\.sections \?\? \['PROFILE', 'MISSIONS', 'MAP', 'PLAYERS', 'TERRITORIES', 'PROGRESS', 'GARAGE', 'CONTROLS', 'AUDIO', 'HELP'\]/);
  assert.match(menu, /if \(this\.sections\.includes\('MISSIONS'\)\) missionCard\.append/);
  assert.doesNotMatch(menu, /\| 'SETTINGS'/);
  assert.match(menu, /this\.activeSection === 'AUDIO'/);
  assert.match(menu, /this\.activeSection === 'HELP'[\s\S]*OPEN CONTROLS[\s\S]*Hints On/);
  assert.match(menu, /this\.activeSection === 'WORLD \/ CITIES'/);
  assert.match(menu, /this\.activeSection === 'LEGAL \/ SUPPORT'[\s\S]*Terms of Use[\s\S]*Privacy Policy[\s\S]*Refund Policy[\s\S]*Support/);
  assert.doesNotMatch(menu, /label: 'CITY GUIDE'|label: 'EXIT FLIGHT'|label: 'WORLD \/ CITIES'/);
  assert.match(menu, /label: 'RESTART \/ RESPAWN'[\s\S]*intent: 'danger'/);
  assert.doesNotMatch(home, /openPanel|renderPanel|ACTIVE MISSION|DAILY FLIGHT PLAN|PILOT PROFILE/);
  assert.doesNotMatch(html, /data-home-panel|home-hangar-panel-body/);
  assert.doesNotMatch(css, /home-hangar-(?:panel|mission-card|objective|profile-card|message-card)/);
  assert.match(server, /payload\?\.abandonMission[\s\S]*profileStore\.abandonMission\(identity\.pilotId/);
});

test('Hub and gameplay menu settings use shared persistence and live synchronization', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const main = read('client/src/main.ts');
  const mobile = read('client/src/mobile-input.ts');
  assert.match(bootstrap, /syncHubMenuPreferences\(\)[\s\S]*audioManager\.getLevels\(\)[\s\S]*preferredPitchInverted\(\)[\s\S]*preferredMobileControlLayout\(\)/);
  assert.match(bootstrap, /notifySharedMenuPreferences\(\)[\s\S]*airport-chaos-menu-preferences-changed/);
  assert.match(mobile, /syncPreferences\(\)[\s\S]*preferredTouchMode\(\)[\s\S]*preferredPitchInverted\(\)[\s\S]*preferredMobileControlLayout\(\)/);
  assert.match(main, /addEventListener\('airport-chaos-menu-preferences-changed'[\s\S]*contextualHints\.setEnabled[\s\S]*navigationBeacons\.setEnabled[\s\S]*mobileInput\.syncPreferences\(\)/);
  assert.match(main, /pilotMenu\.refresh\(data, force\)/);
});

test('Tutorial is an active optional training route', () => {
  const html = read('client/index.html');
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(html, /id="app-shell-header"/);
  assert.match(bootstrap, /if \(state\.training\) void startTrainingFromHub\(\)/);
  assert.match(bootstrap, /async function startTrainingFromHub\(\)/);
});

test('Hub renderer and ambient motion pause offscreen or in the background', () => {
  const garage = read('client/src/garage.ts');
  const home = read('client/src/home-hangar.ts');
  const css = read('client/src/style.css');
  assert.match(garage, /document\.addEventListener\('visibilitychange'/);
  assert.match(garage, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) pause\(\); else resume\(\); \}\)/);
  assert.match(garage, /window\.addEventListener\('blur'[^\n]*this\.windowBlurred = true; pause\(\)/);
  assert.match(garage, /window\.addEventListener\('focus'[^\n]*this\.windowBlurred = false; resume\(\)/);
  assert.match(garage, /this\.idleOrbitAnchor = this\.orbitYaw;[\s\S]*this\.targetOrbitYaw = this\.orbitYaw;[\s\S]*this\.idleOrbitStartedAt = performance\.now\(\)/);
  assert.match(garage, /if \(!this\.isPreviewActive\(\) \|\| document\.hidden \|\| this\.windowBlurred\)/);
  assert.match(garage, /this\.idleOrbitAnchor \+ \(performance\.now\(\) - this\.idleOrbitStartedAt\) \* 0\.00022/);
  assert.match(garage, /else this\.targetOrbitYaw \+= 0\.002/);
  assert.match(home, /classList\.toggle\('is-backgrounded', document\.hidden\)/);
  assert.match(css, /\.home-hangar\.is-backgrounded \* \{ animation-play-state: paused !important; \}/);
});

test('Pilot Hub presents live Missions and Free Fly cards with integrated navigation', () => {
  const html = read('client/index.html');
  const css = read('client/src/style.css');
  const shell = read('client/src/app-shell.ts');
  const journey = read('client/src/mission-journey.ts');
  assert.equal((html.match(/id="app-shell-header"/g) ?? []).length, 1);
  assert.match(html, /data-home-missions[\s\S]*Save cities\. Complete missions\.[\s\S]*SINGLE PLAYER/);
  assert.match(html, /data-home-free-fly[\s\S]*Explore cities\. Fly with other players\.[\s\S]*MULTIPLAYER/);
  assert.doesNotMatch(html, /data-home-fly/);
  assert.doesNotMatch(journey, /data-mission-free|mission-journey-free-dock/);
  assert.match(shell, /utilities\.append\(this\.store, this\.garage, this\.rewards, this\.avatar\)/);
  assert.match(shell, /replaceChildren\(brand, this\.advertise, this\.friends, wallet, utilities\)/);
  assert.match(shell, /this\.garage\.prepend\(this\.aircraftPreviewHost\)/);
  assert.match(shell, /this\.rewardsIndicator\.textContent = ''/);
  assert.match(shell, /this\.store\.classList\.toggle\('has-offers', data\.storeHasOffers\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.25fr\) repeat\(8, minmax\(0, 1fr\)\)/);
  assert.match(css, /backdrop-filter: blur\(7px\)/);
  assert.match(css, /app-shell-header\.is-hub :is\(\.app-shell-action:not\(\.app-shell-avatar\), \.app-shell-wallet \.flight-header-credits\)/);
  assert.match(shell, /this\.advertise\.addEventListener\('click'/);
  assert.match(shell, /this\.friends\.addEventListener\('click'/);
  assert.match(shell, /this\.advertise\.hidden = !data\.advertiseVisible/);
  assert.match(css, /\.app-shell-currency-icon img \{[^}]*width: 100%; height: 100%/);
  assert.match(shell, /brand\.addEventListener\('click', handlers\.home\)/);
  assert.match(shell, /this\.garage\.addEventListener\('click', handlers\.garage\)/);
  assert.match(shell, /this\.rewards\.addEventListener\('click', handlers\.rewards\)/);
  assert.match(shell, /this\.avatar\.addEventListener\('click', handlers\.profile\)/);
  assert.match(css, /\.home-hangar-contextual[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.home-hangar-missions \{ --mode-accent: #ffd66a/);
  assert.match(css, /\.home-hangar-free-fly \{ --mode-accent: #49eaff/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\)/);
  assert.match(css, /var\(--safe-area-left\)/);
  assert.match(css, /var\(--safe-area-right\)/);
  assert.match(css, /var\(--safe-area-bottom\)/);
});
