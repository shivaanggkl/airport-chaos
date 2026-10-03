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

test('Pilot Hub FLY and city back preserve the existing city selection flow', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(bootstrap, /fly: \(\) => showSelector\(\)/);
  assert.match(bootstrap, /function showSelector[\s\S]*entryState = 'CITY_SELECTION';[\s\S]*citySelector\.hidden = false/);
  assert.match(bootstrap, /cityHome\.addEventListener\('click', closeTopUiLayer\)/);
  assert.match(bootstrap, /id: 'city-selection'[\s\S]*close: returnFromCitySelection/);
  assert.match(bootstrap, /function chooseCity[\s\S]*void enterCity\(city, preset\)/);
  assert.match(bootstrap, /await city\.loadWorld\(\);\s*await import\('\.\/main'\);/);
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
  assert.match(bootstrap, /return garage\.showcase\(homeHangar\.stage, garageProfile\)/);
  assert.match(bootstrap, /aircraftName: aircraftDisplayName\(garageProfile\.selectedAircraft\)/);
});

test('Pilot Hub is one connected Three.js garage with aircraft-only presentation controls', () => {
  const html = read('client/index.html');
  const garage = read('client/src/garage.ts');
  const css = read('client/src/style.css');
  const dallasSkyline = read('client/src/dallas-skyline.ts');
  assert.doesNotMatch(html, /home-hangar-environment|tech-garage-/);
  assert.doesNotMatch(css, /home-hangar-environment|tech-garage-/);
  assert.match(garage, /this\.scene\.add\(this\.ambientLight, this\.keyLight, this\.rimLight, this\.showcaseSet, this\.aircraftPresentation\)/);
  assert.match(garage, /this\.aircraftPresentation\.add\(this\.preview, this\.showcaseShadowOuter, this\.showcaseShadowMid, this\.showcaseShadow\)/);
  assert.match(garage, /showcaseShadow = new THREE\.Mesh/);
  assert.match(garage, /showcaseShadowMid = new THREE\.Mesh/);
  assert.match(garage, /showcaseShadowOuter = new THREE\.Mesh/);
  assert.match(garage, /new THREE\.BoxGeometry\(32, 0\.18, 32\)/);
  assert.match(garage, /new THREE\.BoxGeometry\(0\.34, 7\.3, 32\)/);
  assert.match(garage, /new THREE\.BoxGeometry\(32, 7\.3, 0\.34\)/);
  assert.match(garage, /const rightWall = leftWall\.clone\(\); rightWall\.position\.z = 15\.84/);
  assert.match(garage, /new THREE\.BoxGeometry\(32, 0\.34, 32\)/);
  assert.match(garage, /this\.showcaseSet\.add\(floor, backWall, leftWall, rightWall, ceiling\)/);
  assert.match(garage, /new THREE\.CylinderGeometry\(5\.15, 5\.3, 0\.12, 64\)/);
  assert.equal((garage.match(/new THREE\.RingGeometry/g) ?? []).length, 3);
  assert.match(garage, /const floorGuides = new THREE\.InstancedMesh\(panelGeometry, this\.garageGuideMaterial, 8\)/);
  assert.match(garage, /const backPanelFrames = new THREE\.InstancedMesh[\s\S]*const backPanelInsets = new THREE\.InstancedMesh[\s\S]*const backPanelSeams = new THREE\.InstancedMesh/);
  assert.match(garage, /displayCanvas\.width = 384; displayCanvas\.height = 160[\s\S]*const techDisplays = new THREE\.InstancedMesh[\s\S]*,\s*4,\s*\)/);
  assert.match(garage, /showroomAircraftPlacements = \[[\s\S]*x: -2\.0, z: 11\.0[\s\S]*scale: 1\.18[\s\S]*x: -13\.2, z: 8\.8[\s\S]*scale: 0\.96[\s\S]*x: -13\.2, z: -8\.8[\s\S]*scale: 0\.96[\s\S]*x: -2\.0, z: -11\.0[\s\S]*scale: 1\.18/);
  assert.match(garage, /const showroomPads = new THREE\.InstancedMesh[\s\S]*const showroomRings = new THREE\.InstancedMesh/);
  assert.doesNotMatch(garage, /suitPositions|suitBay|suitTorso|suitHelmet|suitLimb|mannequin|armor/i);
  assert.match(garage, /const sideFrames = new THREE\.InstancedMesh[\s\S]*,\s*8,\s*\)/);
  assert.match(garage, /const verticalServiceLights = new THREE\.InstancedMesh[\s\S]*,\s*8,\s*\)/);
  assert.match(garage, /const ceilingRibs = new THREE\.InstancedMesh[\s\S]*const ceilingEdges = new THREE\.InstancedMesh/);
  assert.match(garage, /const ceilingLights = new THREE\.InstancedMesh[\s\S]*,\s*4,\s*\)/);
  assert.equal((garage.match(/new THREE\.TorusGeometry/g) ?? []).length, 3);
  assert.match(garage, /const ceilingRingHousing = new THREE\.Mesh[\s\S]*const ceilingRing = new THREE\.Mesh[\s\S]*const ceilingInnerRing = new THREE\.Mesh/);
  assert.match(garage, /signCanvas\.width = 512; signCanvas\.height = 128[\s\S]*fillText\('AIRPORT CHAOS'/);
  assert.match(garage, /showcaseCameraYaw = Math\.PI \/ 2/);
  assert.match(garage, /showcaseCameraPitch = THREE\.MathUtils\.degToRad\(4\)/);
  assert.match(garage, /showcaseAircraftYawOffset = THREE\.MathUtils\.degToRad\(35\)/);
  assert.match(garage, /this\.targetOrbitYaw = this\.showcaseHost \? this\.showcaseCameraYaw \+ this\.showcaseAircraftYawOffset : 1\.98;[\s\S]*this\.targetOrbitPitch = -0\.01/);
  assert.match(garage, /this\.ambientLight\.color\.setHex\(0xeaf8ff\)[\s\S]*this\.ambientLight\.intensity = 1\.95[\s\S]*this\.keyLight\.color\.setHex\(0xeaf8ff\)[\s\S]*this\.keyLight\.intensity = 2\.55[\s\S]*this\.rimLight\.color\.setHex\(0x38d7f4\)[\s\S]*this\.rimLight\.intensity = 0\.5/);
  assert.match(garage, /this\.backgroundAircraftSet\.children\.length === 4/);
  assert.match(garage, /const backgroundTypes = aircraftDisplayOrder\.filter\(\(type\): type is AircraftType => aircraftDefinitions\[type\] !== undefined\)/);
  assert.match(garage, /plane\.userData\.equippedCosmetics = \{ \[`livery:\$\{type\}`\]: alternative\?\.id \?\? fallbackLiveryIds\[type\] \}/);
  assert.match(garage, /garage-background-aircraft-\$\{type\}[\s\S]*attachAircraftAsset\([\s\S]*definition\.bodyLength \+ definition\.noseLength[\s\S]*definition\.wingSpan/);
  assert.match(garage, /this\.setShowcaseCamera\(\);[\s\S]*return;/);
  assert.match(garage, /this\.aircraftPresentation\.scale\.setScalar\(presentationScale\)[\s\S]*this\.preview\.rotation\.y = this\.showcaseCameraYaw - this\.orbitYaw/);
  assert.doesNotMatch(garage, /if \(this\.showcaseHost\)[\s\S]{0,300}this\.camera\.position\.set/);
  assert.match(css, /\.home-hangar \{[\s\S]*background: #102536/);
  assert.match(css, /\.entry-shell-brand\.has-brand-logo::after \{ content: 'AIRPORT CHAOS'/);
  assert.doesNotMatch(`${html}\n${garage}\n${css}`, /skydeck-|createDallasStaticBackground|dallas-static-background/);
  assert.doesNotMatch(dallasSkyline, /createDallasStaticBackground|dallas-static-background/);
  assert.doesNotMatch(garage, /DallasChunkStreamer|generateDallasSkyline|dallas-world|showcaseGrid|cartPlacements|mechanicalDetails/);
});

test('Garage equip and close return to the Hub with current authoritative profile state', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(bootstrap, /const profile = await response\.json\(\) as RemoteGarageProfile;[\s\S]*applyAuthoritativeHomeProfile\(profile\)/);
  assert.match(bootstrap, /if \(entryState === 'AIRCRAFT'\)[\s\S]*garageReturnState === 'CITY_SELECTION'[\s\S]*void showHome\(\)/);
  assert.match(bootstrap, /function showHome[\s\S]*homeHangar\.show\(homeHangarData\(\)\);[\s\S]*garage\.showcase\(homeHangar\.stage, garageProfile\)/);
  assert.match(bootstrap, /authoritativeHomeProfile = profile/);
});

test('Pilot Hub routes to canonical Garage, Pilot Menu, Profile, and City Selection screens without duplicate panels', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const home = read('client/src/home-hangar.ts');
  const html = read('client/index.html');
  const css = read('client/src/style.css');
  const menu = read('client/src/pilot-menu.ts');
  const server = read('server/src/index.ts');
  assert.match(bootstrap, /aircraft: \(\) => \{ void openStartGarage\('HANGAR'\); \}/);
  assert.match(bootstrap, /missions: \(\) => \{ void openHubPilotMenu\('MISSIONS'\); \}/);
  assert.match(bootstrap, /profile: \(\) => \{ void openHubPilotMenu\('PROFILE'\); \}/);
  assert.match(bootstrap, /const hubPilotMenu = new PilotMenu\(pilotMenuOverlay/);
  assert.match(bootstrap, /sections: \['MISSIONS', 'PROGRESS', 'PROFILE', 'SETTINGS'\]/);
  assert.match(bootstrap, /closeLabel: \(\) => hubPilotMenuReturnState === 'CITY_SELECTION' \? 'BACK TO CITY SELECTION' : 'BACK TO PILOT HUB'/);
  assert.match(menu, /options\.sections \?\? \['PROFILE', 'MISSIONS'/);
  assert.doesNotMatch(home, /openPanel|renderPanel|ACTIVE MISSION|DAILY FLIGHT PLAN|PILOT PROFILE/);
  assert.doesNotMatch(html, /data-home-panel|home-hangar-panel-body/);
  assert.doesNotMatch(css, /home-hangar-(?:panel|mission-card|objective|profile-card|message-card)/);
  assert.match(server, /payload\?\.abandonMission[\s\S]*profileStore\.abandonMission\(identity\.pilotId/);
});

test('Tutorial is an active optional training route', () => {
  const html = read('client/index.html');
  const home = read('client/src/home-hangar.ts');
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(html, /data-home-tutorial>TUTORIAL<\/button>/);
  assert.match(home, /querySelector\('\[data-home-tutorial\]'\)![\s\S]*handlers\.tutorial/);
  assert.match(bootstrap, /tutorial: \(\) => \{ void startTrainingFromHub\(\); \}/);
});

test('Hub renderer and ambient motion pause offscreen or in the background', () => {
  const garage = read('client/src/garage.ts');
  const home = read('client/src/home-hangar.ts');
  const css = read('client/src/style.css');
  assert.match(garage, /document\.addEventListener\('visibilitychange'/);
  assert.match(garage, /if \(document\.hidden\)[\s\S]*cancelAnimationFrame\(this\.raf\)/);
  assert.match(garage, /if \(!this\.isPreviewActive\(\) \|\| document\.hidden\)/);
  assert.match(garage, /this\.idleOrbitAnchor \+ Math\.sin[\s\S]*0\.055/);
  assert.match(garage, /else this\.targetOrbitYaw \+= 0\.002/);
  assert.match(home, /classList\.toggle\('is-backgrounded', document\.hidden\)/);
  assert.match(css, /\.home-hangar\.is-backgrounded \* \{ animation-play-state: paused !important; \}/);
});

test('Hub layout protects desktop and landscape touch targets with safe areas', () => {
  const html = read('client/index.html');
  const css = read('client/src/style.css');
  const bootstrap = read('client/src/bootstrap.ts');
  const nav = html.slice(html.indexOf('<nav class="home-hangar-navigation"'), html.indexOf('</nav>', html.indexOf('<nav class="home-hangar-navigation"')));
  const order = ['data-home-aircraft', 'data-home-missions', 'data-home-fly', 'data-home-tutorial', 'data-home-profile'];
  for (let index = 1; index < order.length; index += 1) assert.ok(nav.indexOf(order[index - 1]) < nav.indexOf(order[index]));
  assert.match(html, /entry-shell-header home-hangar-header/);
  assert.match(html, /entry-shell-header city-select-header/);
  assert.match(css, /--entry-header-top: max\(14px, var\(--safe-area-top\)\)/);
  assert.match(css, /\.entry-shell-header[^}]*top: var\(--entry-header-top\)[^}]*right: var\(--entry-edge-right\)[^}]*left: var\(--entry-edge-x\)/);
  assert.match(css, /\.home-hangar-navigation[^}]*env\(safe-area-inset-right\)[^}]*env\(safe-area-inset-bottom\)[^}]*env\(safe-area-inset-left\)/);
  assert.match(css, /\.home-hangar-navigation button[^}]*min-height: 64px/);
  assert.match(css, /\.home-hangar-navigation \.home-hangar-fly[^}]*min-height: 76px/);
  assert.match(css, /\.entry-button-primary \{[^}]*background: var\(--ui-gradient-primary\)[^}]*border-radius: 4px/);
  assert.match(css, /\.entry-button-secondary \{[^}]*background: var\(--ui-glass-main\)[^}]*border: 1px solid var\(--ui-border-strong\)/);
  assert.match(html, /entry-button entry-button-primary home-hangar-fly/);
  assert.match(bootstrap, /button\.className = 'entry-button entry-button-primary'/);
  assert.doesNotMatch(css, /\.home-hangar-tutorial \{[^}]*opacity: \.58/);
  assert.doesNotMatch(css, /\.home-hangar-navigation \.home-hangar-fly[^}]*linear-gradient\(110deg, #9ce/);
  assert.match(css, /orientation: landscape[^\{]*max-width: 1000px[^\{]*max-height: 520px/);
  assert.match(css, /\.home-hangar-navigation button \{[^}]*min-height: 56px/);
  assert.match(css, /\.home-hangar-navigation \.home-hangar-fly \{[^}]*min-height: 68px/);
  assert.match(read('client/src/garage.ts'), /const showcaseDistanceScale = this\.showcaseHost \? \(wideShowcase \? 0\.6 : 0\.88\) : 1/);
  assert.doesNotMatch(read('client/src/garage.ts'), /wideShowcase \? -0\.03 : -0\.05/);
  assert.match(read('client/src/garage.ts'), /this\.aircraftPresentation\.position\.set\(0, 0, 0\)/);
  assert.match(read('client/src/garage.ts'), /if \(this\.isPreviewActive\(\)\) this\.framePreview\(false\)/);
});
