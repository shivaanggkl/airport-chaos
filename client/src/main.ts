import { applyAircraftCosmetics as applyEquippedLivery } from './aircraft-cosmetics';
import { PLAYER_STORAGE_KEY } from './player-storage';
import * as THREE from 'three';
import { actionKeyLabel, cameraControlLabels, keyboardActionBindings, menuBindings, type FlightAction } from './flight-input';
import { isEditableControl, shouldIgnoreGameplayKeyboardEvent, shouldToggleDesktopControlsHelp } from './controls-help';
import { visualLanguage, identityText, targetBracketPath, playerFacingText, territoryOwnershipColors, type TerritoryAppearance } from './visual-language';
import { flightTutorial } from './tutorial';
import './style.css';
import { AdPlacementManager, attachAircraftLivery, createRingSponsor, eventSponsorFor, getAircraftLivery, resolveAdPlacement, sponsorCreative } from './ad-placement';
import { aircraftDefinitions, aircraftDisplayName, aircraftEffectAnchors, aircraftGroundContacts, aircraftMuzzleSockets, type AircraftDefinition, type AircraftType } from './aircraft';
import { AircraftGarage } from './garage';
import { AmbientTrafficSystem } from './ambient-traffic';
import { attachAircraftAsset, preloadAircraftAssets } from './assets';
import { CITY_QUERY_PARAM, activeCityFromUrl, type CityId } from './cities';
import { entityCapabilities, type EntityType } from './entity-types';
import { updateOsmCityChunks } from './osm-city';
import { SkyChallengeSystem } from './sky-challenges';
import { JourneyGateSystem } from './journey-gates';
import { ObjectiveGuidance, confirmedGateObjective, confirmedHunterObjective, formatObjectiveDistance, lowAltitudeGateInstruction, climbGateInstruction, climbDepartureTurnSide, precisionGateBearing, precisionGateGuidance, territoryGuidance, type MissionObjective, type PrecisionTurnSide } from './objective-guidance';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07 } from '../../shared/journey-mission.mjs';
import { missionFocusForAttempt, type MissionFocusConfig } from '../../shared/mission-focus.mjs';
import { StuntComboSystem, stuntGuide, type LandingQuality, type StuntFrame } from './stunt-combo';
import { DiscoverySystem } from './discoveries';
import { ContextualHintSystem, contextualHintDefinitions, type ContextualHintId } from './contextual-hints';
import { GameplayFeedbackSystem } from './gameplay-feedback';
import { PilotMenu, type PilotMenuAction, type PilotMenuData, type PilotMenuSection } from './pilot-menu';
import { productAnalyticsSessionId } from './product-analytics';
import { cityCapabilities, cityDefinition, routesFromCity, routeDefinition } from '../../shared/city-registry.mjs';
import { MobileInputControls, mobileIdleBrakeRequested, pinchZoomFactor, preferredGraphicsQuality, resolvedGraphicsQuality, type GraphicsQualityMode, type MobileControlId, type MobileControlPlacement, type TouchControlsMode } from './mobile-input';
import {TUTORIAL_VERSION,tutorialSteps,nextTutorialStep,tutorialInstruction,tutorialLockPreviewInstruction,tutorialDetectedInstruction,tutorialLandingCoachStage,tutorialLandingCoachInstruction,tutorialTakeoffRecoveryInstruction,tutorialTurnProgress,type TutorialBindings,type TutorialLandingCoachStage,type TutorialLessonStep,type TutorialStepStatus}from'../../shared/tutorial-flight-rules.mjs';
import { PlayersPanel, CityTerritoriesPanel, type CityTerritoryEntry, type HumanRosterEntry } from './players-panel';
import { WorldMap, type WorldMapLayer } from './world-map';
import { NavigationBeaconSystem, type NavigationDestination } from './navigation-beacons';
import { LOCK_ANGLE, AIM_ENVELOPE, AIM_SWITCH_MARGIN, COMBAT_RANGE, BASE_PROJECTILE_SPEED, aimTargetScore, stepAim, interpolateAim, insideDynamicLock, ballisticShotSpeed, PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase } from './firehawk-checkout';
import { TERRITORY_WALL_HEIGHT_METERS, territoriesForCity, territoryContains, type CityTerritory } from '../../shared/city-territories.mjs';
import { missionForCity, missionsForCity, type CityMission } from '../../shared/city-missions.mjs';
import { missionHudObjective, missionHudProgress } from '../../shared/mission-hud.mjs';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';
import { remoteInterpolationDuration, remoteProxyPixelWidth } from '../../shared/remote-aircraft-visual-rules.mjs';
import { formatRewardFeedback } from '../../shared/reward-feedback.mjs';
import { reconcileCreditSnapshot, type CreditReceipt } from '../../shared/credit-receipts.mjs';
import { KNOTS_PER_METER_PER_SECOND } from '../../shared/aircraft-flight-envelope.mjs';
import { aircraftGroundOffset } from '../../shared/city-airports.mjs';
import { COORDINATED_BANK_CAP, desktopTurnIntent, normalizedPitchCommand, smoothMobileSteering, stepCoordinatedBank, throttleTargetDeceleration } from '../../shared/flight-control-rules.mjs';
import { aircraftDisplayOrder, firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { repairsForCity } from '../../shared/city-repairs.mjs';
import { cargoCreditReward, challengeCreditReward, economyRewards } from '../../shared/reward-economy.mjs';
import { pilotXpForLevel } from '../../shared/pilot-progression.mjs';
import { weatherZoneAt, weatherZonesForCity, type WeatherZone } from '../../shared/weather-zones.mjs';
import { combatThreatDirection } from '../../shared/combat-warning.mjs';
import { killNotice } from '../../shared/kill-notice.mjs';
import { DESTRUCTION_EFFECT_DURATION_SECONDS, DESTRUCTION_FRAGMENT_COUNT, MAX_DESTRUCTION_EFFECTS, groundContactVisualOffset } from '../../shared/aircraft-visual-rules.mjs';
import { apiFetch, apiUrl, realtimeUrl } from './transport';
import { monitorConnectivity } from './connectivity';
import { reconnectDelay } from '../../shared/native-transport.mjs';
import { acquireNativeCredential, availableNativeProviders, clearNativeProviderState, nativeAuthPlatform, type NativeAuthChallenge } from './native-auth';
import { loadNativeFirehawkOffer, nativePurchaseProvider, purchaseNativeFirehawk, restoreNativeFirehawk } from './native-purchases';
import type {
  AirportDefinition,
  AirportId,
  RegionName,
} from './world';
import { closeTopUiLayer, registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { audioManager, type AudioLevels } from './audio-manager';
import { emitConfirmedJourneyFeedback, emitConfirmedProfileRewardFeedback, hapticsManager } from './haptics-manager';
import {
  FLIGHT_LAUNCH_MIN_SKIP_MS,
  FLIGHT_LAUNCH_SKIP_BLEND_MS,
  flightLaunchProgress,
  smoothstep01,
} from '../../shared/flight-launch-rules.mjs';
import { CinematicDirector } from './cinematic-director';
import { isPerfectLandingGrade, regionCinematicPresentation } from '../../shared/gameplay-cinematic-rules.mjs';
import { formatPilotAltitude, formatRelativeAltitude } from '../../shared/multiplayer-altitude.mjs';
import { TutorialStepReconciler } from '../../shared/tutorial-step-reconciler.mjs';
import { closeFlightDialog, flightDialogOpen, showFlightDialog as showSharedFlightDialog, type FlightDialogAction } from './flight-dialog';

audioManager.install();
audioManager.setMenuMusicDesired(false);

// Local production-build QA uses the same diagnostics as Vite DEV without
// exposing transform presets or telemetry on a deployed beta hostname.
const localQaEnabled = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const flightTestMode = localQaEnabled && new URLSearchParams(window.location.search).get('flighttest') === '1';
const chaosQaMode = localQaEnabled && new URLSearchParams(window.location.search).get('chaosqa') === '1';
const stabilityQaMode = localQaEnabled && new URLSearchParams(window.location.search).get('stabilityqa') === '1';
let territoryWallsQaDisabled = localQaEnabled && new URLSearchParams(window.location.search).get('territorywalls') === 'off';
let stabilityQaFrames = 0;
const stabilityQaTiming = stabilityQaMode ? {
  lastFrameStartedAt: 0,
  samples: 0,
  frameTotalMs: 0,
  frameMaxMs: 0,
  updateTotalMs: 0,
  updateMaxMs: 0,
  renderTotalMs: 0,
  renderMaxMs: 0,
  over50Ms: 0,
  over100Ms: 0,
  over250Ms: 0,
} : undefined;
let stabilityQaSocketsCreated = 0;
let stabilityQaSocketOpens = 0;
let stabilityQaSocketCloses = 0;
let stabilityQaReconnectsScheduled = 0;
let stabilityQaSocketState: number = WebSocket.CONNECTING;
const combatQaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('combatqa') === '1';
const activeCity = activeCityFromUrl();
if (!activeCity || activeCity.status !== 'available') throw new Error('A playable city is required before starting the game.');
const cityId = activeCity.id;
const cityRules = cityCapabilities(cityId)!;
const trainingRequested = new URLSearchParams(window.location.search).get('training') === '1';
let journeyAttemptId = new URLSearchParams(window.location.search).get('journeyAttempt') ?? '';
const journeyMode = cityId === 'dallas' && /^[0-9a-f-]{36}$/i.test(journeyAttemptId);
type JourneyAttemptState = {
  attemptId: string; missionId: string; targetId: string | null; targetHealth: number; targetEngaged?: boolean;
  aiIsolated?: boolean;
  status: 'READY' | 'APPROACH' | 'RACING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
  phase?: 'PREPARING' | 'APPROACH_GATES' | 'RACING' | 'LANDING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
  landingGrade?: 'ROUGH' | 'SAFE' | 'SMOOTH' | 'PERFECT' | 'LEGENDARY' | null;
  gateIndex: number; deadlineAt: number | null; finishTimeMs: number | null;
  holdMs: number;
  firstClearCredits: number; failureReason: string | null;
};
let journeyAttempt: JourneyAttemptState | null = null;
let missionFocus: MissionFocusConfig | null = null;
let botIsolationActive = false;
let focusedHunterId: string | null = null;
let territoryControlSeenAttemptId: string | null = null;
const focusedBotsAreSafe = () => botIsolationActive;
const unrelatedFocusedBot = (id: string) => focusedBotsAreSafe() &&
  (journeyAttempt?.missionId !== journeyDallas02.id || journeyAttempt.targetId !== id) &&
  (journeyAttempt?.missionId !== journeyDallas04.id || territoryState.get(journeyDallas04.territoryId)?.defenderBotId !== id);
let journeyServerTimeOffset = 0;
type FlightLaunchState = 'disabled' | 'pending' | 'active' | 'complete';
const flightGameRoot = document.querySelector<HTMLElement>('#game-root')!;
const flightLaunchTitle = document.createElement('div');
flightLaunchTitle.className = 'flight-launch-title';
flightLaunchTitle.setAttribute('aria-hidden', 'true');
flightLaunchTitle.textContent = activeCity.displayName.toUpperCase();
flightGameRoot.append(flightLaunchTitle);
let flightLaunchState: FlightLaunchState = trainingRequested ? 'disabled' : 'pending';
let flightLaunchStartedAt = 0;
let flightLaunchSkipStartedAt: number | undefined;
let flightLaunchWelcomeHandled = false;
let cinematicDirector: CinematicDirector;
const launchCinematicBlocksInput = (): boolean => flightLaunchState === 'pending' || flightLaunchState === 'active' || flightDialogOpen();
flightGameRoot.classList.toggle('launch-cinematic-pending', flightLaunchState === 'pending');
document.body.classList.toggle('launch-cinematic-pending', flightLaunchState === 'pending');
document.body.classList.toggle('practice-mode', cityRules.practiceMode);
const cityWorld = await activeCity.loadWorld!();
const { airports, centralAirport, createWorld, getTerrainHeight, regionBounds, WORLD_METERS_PER_UNIT, WORLD_SIZE } = cityWorld;
const spawnBrand = activeCity.spawnBrandPlacement;
const spawnAirport = airports.find((airport) => airport.id === activeCity.spawn.airportId) ?? centralAirport;
const brandX = spawnBrand ? spawnAirport.x + Math.sin(spawnAirport.heading) * (spawnAirport.spawnOffset - spawnBrand.forwardDistance) : 0;
const brandZ = spawnBrand ? spawnAirport.z + Math.cos(spawnAirport.heading) * (spawnAirport.spawnOffset - spawnBrand.forwardDistance) : 0;
const adPlacements = spawnBrand ? [...(cityWorld.adPlacements ?? []), resolveAdPlacement({
  id: `${cityId}-spawn-brand`, cityId, type: 'SKYBOARD',
  position: { x: brandX, y: getTerrainHeight(brandX, brandZ) + spawnBrand.clearanceAgl + spawnBrand.height * 0.5, z: brandZ },
  rotation: { x: 0, y: spawnAirport.heading, z: 0 },
  size: { x: spawnBrand.width, y: spawnBrand.height, z: 0.5 },
  campaignId: spawnBrand.campaignId,
})] : cityWorld.adPlacements ?? [];
const visualQaMode = localQaEnabled && cityId === 'dallas' && new URLSearchParams(window.location.search).get('visualqa') === '1' && Boolean(cityWorld.visualQaPresets?.length);
const adDebugMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('addebug') === '1';
const PLANE_GROUND_Y = aircraftGroundOffset;
const METERS_TO_FEET = 3.28084 * WORLD_METERS_PER_UNIT;
const METERS_PER_SECOND_TO_KNOTS = KNOTS_PER_METER_PER_SECOND * WORLD_METERS_PER_UNIT;
const MIN_REWARDED_FLIGHT_DISTANCE = 40;
const isDallas = cityId === 'dallas';
let worldTimeOfDay: 'day' | 'dusk' = isDallas && new URLSearchParams(window.location.search).get('time') === 'dusk' ? 'dusk' : 'day';
let graphicsQualityMode:GraphicsQualityMode=preferredGraphicsQuality();
const resolvedQuality=resolvedGraphicsQuality(graphicsQualityMode,matchMedia('(pointer: coarse)').matches,innerWidth<=900);
const worldVisualQuality = new URLSearchParams(window.location.search).get('visualquality') === 'low'||resolvedQuality!=='high' ? 'low' : 'high';
cityWorld.configureWorldVisuals?.({ quality: worldVisualQuality, timeOfDay: worldTimeOfDay });
let SKY_COLOR = worldTimeOfDay === 'dusk' ? 0x33405e : isDallas ? 0x5aaee0 : 0x76c9ed;
const CAMERA_NEAR = 2;
const CAMERA_BASE_FAR = WORLD_SIZE > 20_000 ? 30_000 : 22_000;
const CAMERA_HIGH_FAR = WORLD_SIZE > 20_000 ? 44_000 : 32_000;
const CAMERA_CHASE_FOV = 58;
const CAMERA_TARGET_WIDTH_FRACTION = 0.255;
const SKY_DOME_RADIUS = 18_000;

function groundPlaneY(x: number, z: number): number {
  return getTerrainHeight(x, z) + PLANE_GROUND_Y;
}

function altitudeAboveTerrain(): number {
  return Math.max(0, airplane.position.y - groundPlaneY(airplane.position.x, airplane.position.z));
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, WORLD_SIZE > 20_000 ? 7000 : 4500, WORLD_SIZE > 20_000 ? 28_000 : 15_000);

const camera = new THREE.PerspectiveCamera(
  CAMERA_CHASE_FOV,
  window.innerWidth / window.innerHeight,
  CAMERA_NEAR,
  CAMERA_BASE_FAR,
);
const renderer = new THREE.WebGLRenderer({ antialias: true, reversedDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = isDallas ? 1.23 : 1.16;
renderer.setClearColor(SKY_COLOR, 1);
document.querySelector<HTMLElement>('#game-root')!.prepend(renderer.domElement);
preloadAircraftAssets();

function resizeRenderer(): void {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

resizeRenderer();

const skyAmbient = new THREE.HemisphereLight(worldTimeOfDay === 'dusk' ? 0xb8c8e8 : isDallas ? 0xd4efff : 0xd9f3ff, worldTimeOfDay === 'dusk' ? 0x53604e : isDallas ? 0x587443 : 0x5d764a, worldTimeOfDay === 'dusk' ? 1.4 : isDallas ? 2.78 : 2.55);
scene.add(skyAmbient);
const sun = new THREE.DirectionalLight(worldTimeOfDay === 'dusk' ? 0xffae78 : isDallas ? 0xffd39a : 0xffe2ae, worldTimeOfDay === 'dusk' ? 1.68 : isDallas ? 3.72 : 3.45);
sun.position.set(-2400, 4200, 1800);
sun.castShadow = false;
scene.add(sun);

const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(SKY_DOME_RADIUS, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      horizonColor: { value: new THREE.Color(worldTimeOfDay === 'dusk' ? 0xaa644a : isDallas ? 0xaedcf0 : 0xc4e8f4) },
      middleColor: { value: new THREE.Color(worldTimeOfDay === 'dusk' ? 0x51476f : isDallas ? 0xaedcf0 : 0xc4e8f4) },
      zenithColor: { value: new THREE.Color(worldTimeOfDay === 'dusk' ? 0x1b2d58 : isDallas ? 0x217fbe : 0x2d9dd4) },
      gradientLow: { value: worldTimeOfDay === 'dusk' ? -0.10 : -0.18 },
      gradientHigh: { value: worldTimeOfDay === 'dusk' ? 0.34 : 0.82 },
      duskAmount: { value: worldTimeOfDay === 'dusk' ? 1 : 0 },
    },
    vertexShader: 'varying float vHeight; void main() { vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 horizonColor; uniform vec3 middleColor; uniform vec3 zenithColor; uniform float gradientLow; uniform float gradientHigh; uniform float duskAmount; varying float vHeight; void main() { float dayT = smoothstep(gradientLow, gradientHigh, vHeight); vec3 dayColor = mix(horizonColor, zenithColor, dayT); float duskUpperT = smoothstep(0.08, 0.40, vHeight); vec3 duskBase = mix(middleColor * 0.48, mix(middleColor, zenithColor, duskUpperT), smoothstep(-0.30, 0.025, vHeight)); float warmBand = smoothstep(-0.015, 0.002, vHeight) * (1.0 - smoothstep(0.025, 0.065, vHeight)); vec3 duskColor = mix(duskBase, horizonColor, warmBand * 0.62); gl_FragColor = vec4(mix(dayColor, duskColor, duskAmount), 1.0); }',
  }),
);
skyDome.renderOrder = -10;
scene.add(skyDome);
const duskSky = new THREE.Group();
duskSky.visible = worldTimeOfDay === 'dusk';
skyDome.add(duskSky);
{
  // One camera-following sky group: no per-star meshes, lights or updates.
  const starPositions = new Float32Array(150 * 3);
  const starColors = new Float32Array(150 * 3);
  for (let index = 0; index < 150; index += 1) {
    const azimuth = index * 2.3999632297;
    const elevation = 0.15 + ((index * 73) % 101) / 101 * 0.78;
    const radius = SKY_DOME_RADIUS * 0.95;
    starPositions[index * 3] = Math.cos(azimuth) * Math.cos(elevation) * radius;
    starPositions[index * 3 + 1] = Math.sin(elevation) * radius;
    starPositions[index * 3 + 2] = Math.sin(azimuth) * Math.cos(elevation) * radius;
    const brightness = 0.68 + ((index * 47) % 31) / 100;
    starColors[index * 3] = brightness * 0.92;
    starColors[index * 3 + 1] = brightness * 0.96;
    starColors[index * 3 + 2] = brightness;
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ vertexColors: true, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.88, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  stars.renderOrder = -9;
  duskSky.add(stars);
  const moonDirection = new THREE.Vector3(0.42, 0.13, -0.90).normalize();
  const moonPosition = moonDirection.multiplyScalar(SKY_DOME_RADIUS * 0.9);
  const moonHalo = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main() { float radius = length(vUv - 0.5) * 2.0; float alpha = (1.0 - smoothstep(0.08, 1.0, radius)) * 0.14; gl_FragColor = vec4(0.86, 0.91, 1.0, alpha); }',
  }));
  moonHalo.position.copy(moonPosition);
  moonHalo.scale.setScalar(1_000);
  moonHalo.lookAt(0, 0, 0);
  moonHalo.renderOrder = -8;
  const moon = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xfff2d4, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  moon.position.copy(moonPosition).multiplyScalar(0.999);
  moon.scale.setScalar(680);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -7;
  duskSky.add(moonHalo, moon);
}

function setLocalTimePreset(preset: 'day' | 'dusk'): void {
  if (!isDallas || preset === worldTimeOfDay) return;
  worldTimeOfDay = preset;
  const dusk = preset === 'dusk';
  SKY_COLOR = dusk ? 0x33405e : 0x5aaee0;
  (scene.background as THREE.Color).setHex(SKY_COLOR);
  skyAmbient.color.setHex(dusk ? 0xb8c8e8 : 0xd4efff);
  skyAmbient.groundColor.setHex(dusk ? 0x53604e : 0x587443);
  skyAmbient.intensity = dusk ? 1.4 : 2.78;
  sun.color.setHex(dusk ? 0xffae78 : 0xffd39a);
  sun.intensity = dusk ? 1.68 : 3.72;
  const uniforms = (skyDome.material as THREE.ShaderMaterial).uniforms;
  (uniforms.horizonColor.value as THREE.Color).setHex(dusk ? 0xaa644a : 0xaedcf0);
  (uniforms.middleColor.value as THREE.Color).setHex(dusk ? 0x51476f : 0xaedcf0);
  (uniforms.zenithColor.value as THREE.Color).setHex(dusk ? 0x1b2d58 : 0x217fbe);
  uniforms.gradientLow.value = dusk ? -0.10 : -0.18;
  uniforms.gradientHigh.value = dusk ? 0.34 : 0.82;
  uniforms.duskAmount.value = dusk ? 1 : 0;
  duskSky.visible = dusk;
  ambientTraffic?.setTimeOfDay(preset);
  cityWorld.configureWorldVisuals?.({ quality: worldVisualQuality, timeOfDay: preset });
  cityWorld.setTimeOfDay?.(preset);
}
window.addEventListener('airport-chaos-time-change', (event) => setLocalTimePreset((event as CustomEvent<'day' | 'dusk'>).detail));

const depthOffsetDirection = renderer.capabilities.reversedDepthBuffer ? 1 : -1;
const { obstacleBounds, mountainBounds, waterBounds } = createWorld(scene, depthOffsetDirection);
// City gameplay configuration owns repair placement; these are intentionally
// tiny shared meshes, not streamed world detail or collectables.
const repairBeaconGroup = new THREE.Group();
const repairBeaconGeometry = new THREE.TorusGeometry(22, 1.8, 8, 28);
const repairBeaconMaterial = new THREE.MeshBasicMaterial({ color: visualLanguage.repair.color, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false });
const repairHeartCanvas = document.createElement('canvas');
repairHeartCanvas.width = repairHeartCanvas.height = 256;
const repairHeartContext = repairHeartCanvas.getContext('2d')!;
repairHeartContext.shadowColor = '#ff5c77';
repairHeartContext.shadowBlur = 25;
repairHeartContext.fillStyle = visualLanguage.repairHeart.color;
repairHeartContext.font = 'bold 200px sans-serif';
repairHeartContext.textAlign = 'center';
repairHeartContext.textBaseline = 'middle';
repairHeartContext.strokeStyle = '#fff0f5';
repairHeartContext.lineWidth = 6;
repairHeartContext.strokeText('♥', 128, 134);
repairHeartContext.fillText('♥', 128, 134);
const repairHeartMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(repairHeartCanvas), transparent: true, depthWrite: false, toneMapped: false });
const repairHeartSprites = new Map<string, THREE.Sprite>();
const repairHeartTimers = new Map<string, number>();
const repairMapMarkers = repairsForCity(cityId).map((beacon) => ({ ...beacon, cooldownUntil: 0 }));
const repairMapMarkerById = new Map(repairMapMarkers.map((beacon) => [beacon.id, beacon]));
function setHeartCooldown(id: string, remainingMs: number): void {
  const heart = repairHeartSprites.get(id);
  const marker = repairMapMarkerById.get(id);
  if (!heart || !marker) return;
  const oldTimer = repairHeartTimers.get(id);
  if (oldTimer !== undefined) window.clearTimeout(oldTimer);
  marker.cooldownUntil = Date.now() + remainingMs;
  heart.visible = remainingMs <= 0;
  if (remainingMs > 0) repairHeartTimers.set(id, window.setTimeout(() => {
    heart.visible = true;
    marker.cooldownUntil = 0;
    repairHeartTimers.delete(id);
  }, remainingMs));
  else repairHeartTimers.delete(id);
}
for (const beacon of repairsForCity(cityId)) {
  if (beacon.kind === 'heart') {
    const heart = new THREE.Sprite(repairHeartMaterial);
    heart.position.set(beacon.x, groundPlaneY(beacon.x, beacon.z) + beacon.altitudeAgl, beacon.z);
    heart.scale.set(128, 128, 1);
    repairBeaconGroup.add(heart);
    repairHeartSprites.set(beacon.id, heart);
    continue;
  }
  const ring = new THREE.Mesh(repairBeaconGeometry, repairBeaconMaterial);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.set(beacon.x, groundPlaneY(beacon.x, beacon.z) + 2.5, beacon.z);
  repairBeaconGroup.add(ring);
}
scene.add(repairBeaconGroup);
const adPlacementManager = new AdPlacementManager(scene, cityId, adPlacements, adDebugMode, getTerrainHeight, cityWorld.hasWorldBuildingDetailAt, worldVisualQuality);
const ambientTraffic = cityWorld.ambientTrafficConfig
  ? new AmbientTrafficSystem(scene, cityWorld.ambientTrafficConfig, getTerrainHeight, worldVisualQuality === 'high')
  : undefined;
ambientTraffic?.setTimeOfDay(worldTimeOfDay);
const configuredWeatherZones = weatherZonesForCity(cityId);
let activeWeatherZone: WeatherZone | undefined;
let weatherZoneCheckAt = 0;
let weatherToastAt = 0;

function enabledWeatherZoneIds(): Set<string> {
  const enabled = new Set<string>();
  for (const zone of configuredWeatherZones) {
    if (zone.type === 'dusk_signal') { if (worldTimeOfDay === 'dusk') enabled.add(zone.id); continue; }
    if (zone.type === 'storm') {
      if (cityEvent?.lifecycle === 'active' && (cityEvent.riskMode === 'storm' || cityEvent.eventType === 'stormLanding') && (!zone.eventId || zone.eventId === cityEvent.eventType)) enabled.add(zone.id);
      continue;
    }
    if (zone.type === 'fog') { if (cityEvent?.lifecycle === 'active' && cityEvent.eventType === 'fogApproach') enabled.add(zone.id); continue; }
    enabled.add(zone.id);
  }
  return enabled;
}

function updateLocalWeather(now: number): void {
  if (now < weatherZoneCheckAt) return;
  weatherZoneCheckAt = now + 250;
  const next = guidedTutorialActive ? undefined : weatherZoneAt(configuredWeatherZones, airplane.position, enabledWeatherZoneIds());
  if (next?.id === activeWeatherZone?.id) return;
  const previous = activeWeatherZone;
  activeWeatherZone = next;
  document.body.dataset.weather = next?.type ?? 'clear';
  if (next && now - weatherToastAt > 2_000) {
    weatherToastAt = now;
    const copy: Partial<Record<WeatherZone['type'], string>> = { windy:'CROSSWIND AHEAD', storm:'ENTERING STORM ZONE', fog:'FOG APPROACH', dusk_signal:'SIGNAL INTERFERENCE DETECTED', turbulence:'TURBULENCE AHEAD' };
    showProgressMessage(copy[next.type] ?? `ENTERING ${next.name}`);
    queueAtcCallout(`weather-${next.id}`, next.type === 'fog' ? 'TOWER: LOW VISIBILITY' : next.type === 'storm' || next.type === 'windy' ? 'TOWER: CROSSWIND REPORTED' : 'TOWER: CAUTION WEATHER');
    if (connectionReady()) socket.send(JSON.stringify({ type:'analyticsEvent', event:'chaos_weather_zone_entered', source:next.type }));
  } else if (previous && connectionReady()) {
    socket.send(JSON.stringify({ type:'analyticsEvent', event:'chaos_weather_zone_exited', source:previous.type }));
  }
}
const eventCrate = new THREE.Mesh(
  new THREE.BoxGeometry(18, 14, 18),
  new THREE.MeshStandardMaterial({ color: 0xffa52c, emissive: 0x4c2300, emissiveIntensity: 0.7, roughness: 0.55 }),
);
eventCrate.visible = false;
eventCrate.castShadow = false;
scene.add(eventCrate);
const chaosGateMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa42, transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false });
const chaosGates = Array.from({ length: 6 }, () => {
  const gate = new THREE.Mesh(new THREE.TorusGeometry(78, 4.5, 8, 30), chaosGateMaterial.clone());
  gate.add(createRingSponsor({ type: 'RING_SPONSOR', campaignId: 'airport-chaos' }, 78));
  gate.visible = false;
  scene.add(gate);
  return gate;
});
function createMissionEventMarker(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  marker.userData.canvas = canvas;
  marker.scale.set(32, 6.4, 1);
  marker.renderOrder = 8;
  marker.visible = false;
  return marker;
}
function paintMissionEventMarker(marker: THREE.Sprite, label: string, health?: number, maximum?: number): void {
  const signature = `${label}|${health ?? ''}|${maximum ?? ''}`;
  if (marker.userData.signature === signature) return;
  marker.userData.signature = signature;
  const canvas = marker.userData.canvas as HTMLCanvasElement;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(5, 17, 27, 0.84)';
  context.fillRect(4, 4, 312, 56);
  context.strokeStyle = visualLanguage.mission.color;
  context.lineWidth = 4;
  context.strokeRect(5, 5, 310, 54);
  context.fillStyle = '#ffffff';
  context.font = '800 25px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${visualLanguage.mission.icon} ${label}${health === undefined ? '' : ` · ${Math.max(0, health)}/${maximum ?? health} HP`}`, 160, 32, 300);
  (marker.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}
const missionEventMarker = createMissionEventMarker();
scene.add(missionEventMarker);
const missionLocationMarker = new THREE.Group();
const missionLocationRing = new THREE.Mesh(
  new THREE.TorusGeometry(220, 10, 6, 32),
  new THREE.MeshBasicMaterial({ color: visualLanguage.mission.color, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }),
);
missionLocationRing.rotation.x = Math.PI / 2;
missionLocationRing.position.y = 20;
const missionLocationBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(7, 22, 620, 8, 1, true),
  new THREE.MeshBasicMaterial({ color: visualLanguage.mission.color, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
);
missionLocationBeam.position.y = 310;
const missionLocationLabel = createMissionEventMarker();
missionLocationLabel.scale.set(280, 56, 1);
missionLocationLabel.position.y = 670;
missionLocationLabel.visible = true;
missionLocationMarker.add(missionLocationRing, missionLocationBeam, missionLocationLabel);
missionLocationMarker.visible = false;
scene.add(missionLocationMarker);
const COLLISION_CELL_SIZE = 600;
const COLLISION_PADDING = 3.5;

function collisionCellKey(cellX: number, cellZ: number): number {
  return cellX * 65_536 + cellZ;
}

function buildCollisionGrid<T>(
  entries: ReadonlyArray<T>,
  centerX: (entry: T) => number,
  centerZ: (entry: T) => number,
  radiusX: (entry: T) => number,
  radiusZ: (entry: T) => number,
): Map<number, T[]> {
  const grid = new Map<number, T[]>();
  for (const entry of entries) {
    const x = centerX(entry);
    const z = centerZ(entry);
    const minCellX = Math.floor((x - radiusX(entry) - COLLISION_PADDING) / COLLISION_CELL_SIZE);
    const maxCellX = Math.floor((x + radiusX(entry) + COLLISION_PADDING) / COLLISION_CELL_SIZE);
    const minCellZ = Math.floor((z - radiusZ(entry) - COLLISION_PADDING) / COLLISION_CELL_SIZE);
    const maxCellZ = Math.floor((z + radiusZ(entry) + COLLISION_PADDING) / COLLISION_CELL_SIZE);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = collisionCellKey(cellX, cellZ);
        const cell = grid.get(key);
        if (cell) cell.push(entry);
        else grid.set(key, [entry]);
      }
    }
  }
  return grid;
}

const obstacleGrid = buildCollisionGrid(
  obstacleBounds,
  (obstacle) => obstacle.x,
  (obstacle) => obstacle.z,
  (obstacle) => obstacle.halfX,
  (obstacle) => obstacle.halfZ,
);
const mountainGrid = buildCollisionGrid(
  mountainBounds,
  (mountain) => mountain.x,
  (mountain) => mountain.z,
  (mountain) => mountain.radius,
  (mountain) => mountain.radius,
);
const noNearbyObstacles: typeof obstacleBounds = [];
const noNearbyMountains: typeof mountainBounds = [];

type ContractType = 'passenger' | 'cargo' | 'sightseeing' | 'intercept';

type ContractDefinition = {
  id: number;
  type: ContractType;
  aircraftType: AircraftType;
  reward: number;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  regionNames: RegionName[];
};

type ActiveContract = {
  definition: ContractDefinition;
  departed: boolean;
  visitedRegions: Set<RegionName>;
  killCompleted: boolean;
};

const aircraftBodyGeometry = new THREE.CylinderGeometry(0.82, 1, 1, 14);
const aircraftNoseGeometry = new THREE.ConeGeometry(1, 1, 14);
const aircraftCockpitGeometry = new THREE.SphereGeometry(1, 14, 8);
const aircraftBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const aircraftEngineGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
// Wide end at the engine nozzle, point trailing aft after the X rotation.
// This reads as a faint heat plume rather than a projectile-shaped blob.
const aircraftExhaustGeometry = new THREE.ConeGeometry(1, 1, 8);
// Fighter plume geometry has its wide/base end at local zero, so changing its
// length never pulls the source away from the authored rear-nozzle socket.
const fighterExhaustGeometry = new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0);
const aircraftHubGeometry = new THREE.SphereGeometry(1, 10, 6);
const fighterWingGeometry = new THREE.BufferGeometry();
fighterWingGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    [0, 0, -2.15, -3.4, 0, 1.15, 0, 0, 0.35, 0, 0, -2.15, 0, 0, 0.35, 3.4, 0, 1.15],
    3,
  ),
);
fighterWingGeometry.setIndex([0, 1, 2, 3, 4, 5]);
fighterWingGeometry.computeVertexNormals();

type AircraftVisuals = {
  propeller: THREE.Group | null;
  exhaustMaterial: THREE.MeshBasicMaterial | null;
  exhausts: THREE.Mesh[];
  boostMaterial: THREE.MeshBasicMaterial;
  boostTrails: THREE.Mesh[];
  fighterBoostCoreMaterial: THREE.MeshBasicMaterial | null;
  fighterBoostCore: THREE.Mesh | null;
  fighterBoostEnvelope: number;
};

function isAircraftType(value: unknown): value is AircraftType {
  return typeof value === 'string' && value in aircraftDefinitions;
}

type PersistedPlayer = {
  version: 1;
  pilotId: string;
  credits: number;
  selectedAircraft: AircraftType;
  displayName: string;
  muted: boolean;
  bestScore: number;
  discoveries: Partial<Record<CityId, string[]>>;
  totalDistance: number;
  successfulLandings: number;
  hintsEnabled: boolean;
  dismissedHints: readonly ContextualHintId[];
  navigationMarkersEnabled: boolean;
  onboardingSeen: boolean;
};

function createPilotId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pilot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadPlayerProgress(): PersistedPlayer {
  const fallbackCredits = 0;
  const fallbackName = 'Pilot';
  const fallback: PersistedPlayer = {
    version: 1,
    pilotId: createPilotId(),
    credits: fallbackCredits,
    selectedAircraft: 'trainer',
    displayName: fallbackName,
    muted: false,
    bestScore: 0,
    discoveries: {},
    totalDistance: 0,
    successfulLandings: 0,
    hintsEnabled: true,
    dismissedHints: [],
    navigationMarkersEnabled: true,
    onboardingSeen: false,
  };

  try {
    const stored = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!stored) return fallback;
    const value = JSON.parse(stored) as Partial<PersistedPlayer>;
    if (value.version !== 1) return fallback;
    const storedCredits = typeof value.credits === 'number' && Number.isFinite(value.credits) && value.credits >= 0
      ? Math.floor(value.credits)
      : fallbackCredits;
    // Local storage is a cache, never aircraft entitlement authority.
    const storedAircraft = flightTestMode && isAircraftType(value.selectedAircraft) ? value.selectedAircraft : 'trainer';
    const discoveries: Partial<Record<CityId, string[]>> = {};
    if (value.discoveries && typeof value.discoveries === 'object') {
      for (const city of ['milwaukee', 'dallas'] as const) {
        const ids = (value.discoveries as Partial<Record<CityId, unknown>>)[city];
        if (!Array.isArray(ids)) continue;
        discoveries[city] = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 96))].slice(0, 256);
      }
    }
    return {
      version: 1,
      pilotId: typeof value.pilotId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value.pilotId) ? value.pilotId : createPilotId(),
      credits: storedCredits,
      selectedAircraft: storedAircraft,
      displayName: typeof value.displayName === 'string' && value.displayName.trim().length > 0 && value.displayName.length <= 32
        ? value.displayName
        : fallbackName,
      muted: typeof value.muted === 'boolean' ? value.muted : false,
      bestScore: typeof value.bestScore === 'number' && Number.isFinite(value.bestScore) && value.bestScore >= 0
        ? Math.floor(value.bestScore)
        : 0,
      discoveries,
      totalDistance: typeof value.totalDistance === 'number' && Number.isFinite(value.totalDistance) && value.totalDistance >= 0 ? value.totalDistance : 0,
      successfulLandings: typeof value.successfulLandings === 'number' && Number.isFinite(value.successfulLandings) && value.successfulLandings >= 0 ? Math.floor(value.successfulLandings) : 0,
      hintsEnabled: typeof value.hintsEnabled === 'boolean' ? value.hintsEnabled : true,
      dismissedHints: Array.isArray(value.dismissedHints)
        ? [...new Set(value.dismissedHints.filter((id): id is ContextualHintId => typeof id === 'string' && id in contextualHintDefinitions))].slice(0, 16)
        : [],
      navigationMarkersEnabled: typeof value.navigationMarkersEnabled === 'boolean' ? value.navigationMarkersEnabled : true,
      onboardingSeen: typeof value.onboardingSeen === 'boolean' ? value.onboardingSeen : false,
    };
  } catch {
    return fallback;
  }
}

const persistedPlayer = loadPlayerProgress();
let navigationMarkersEnabled = persistedPlayer.navigationMarkersEnabled;
const fallbackNavigationDestinations: readonly NavigationDestination[] = airports.map((airport) => ({
  id: airport.id,
  label: airport.name.toUpperCase(),
  x: airport.x,
  z: airport.z,
  kind: 'airport',
}));
const navigationBeacons = new NavigationBeaconSystem(
  scene,
  cityWorld.navigationDestinations ?? fallbackNavigationDestinations,
  getTerrainHeight,
);
navigationBeacons.setEnabled(navigationMarkersEnabled);

function applyMissionFocus(attempt: JourneyAttemptState | null): void {
  const next = missionFocusForAttempt(attempt);
  const nextBotIsolation = next !== null && attempt?.aiIsolated === true;
  const nextHunterId = next && attempt?.missionId === journeyDallas02.id ? attempt.targetId : null;
  if (missionFocus === next && botIsolationActive === nextBotIsolation && focusedHunterId === nextHunterId) return;
  missionFocus = next;
  botIsolationActive = nextBotIsolation;
  focusedHunterId = nextHunterId;
  flightGameRoot.classList.toggle('mission-focus-active', next !== null);
  navigationBeacons.setEnabled(navigationMarkersEnabled && (next?.showUnrelatedAirportLabels ?? true) && (next?.showUnrelatedLandmarkLabels ?? true));
  ambientTraffic?.setMissionFocus(next !== null && !next.showAmbientAIAircraft);
  territoryBorderRefreshAt = 0;
  if (next) for (const entry of territoryBorders) { entry.wall.visible = false; entry.label.hidden = true; }
  if (selectedCombatTarget?.remote.isBot && unrelatedFocusedBot(selectedCombatTarget.remote.playerId)) clearCombatTarget();
  if (focusedBotsAreSafe()) for (const [id, projectile] of clientProjectiles) {
    if (projectile.ownerIsBot && unrelatedFocusedBot(projectile.ownerId)) removeClientProjectile(id);
  }
  updateDynamicEventHud();
  updateContractPanel();
  updateCaptureHud();
  updateTerritoryLabels();
}

function createAirplane(type: AircraftType, remote = false): THREE.Group {
  const definition = aircraftDefinitions[type];
  const plane = new THREE.Group();
  const airframeRoot = new THREE.Group();
  airframeRoot.name = 'aircraft-visual-root';
  plane.add(airframeRoot);
  const fallback = new THREE.Group();
  fallback.name = `aircraft-fallback-${type}`;
  airframeRoot.add(fallback);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: remote ? 0xe05252 : definition.bodyColor, roughness: 0.55 });
  bodyMaterial.name = 'AC_LIVERY_BASE';
  const accentMaterial = new THREE.MeshStandardMaterial({ color: remote ? 0x9e1f2b : definition.accentColor, roughness: 0.5 });
  accentMaterial.name = 'AC_LIVERY_PRIMARY';
  const dark = new THREE.MeshStandardMaterial({ color: 0x18323f, roughness: 0.35 });
  const exhaustMaterial = type === 'trainer'
    ? null
    : new THREE.MeshBasicMaterial({
      color: type === 'fighter' ? 0xff7a32 : 0x7adfff,
      transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
  const boostMaterial = new THREE.MeshBasicMaterial({
    color: type === 'fighter' ? 0xff4d1f : type === 'trainer' ? 0xd8f4ff : 0x9eeaff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const visuals: AircraftVisuals = {
    propeller: null,
    exhaustMaterial,
    exhausts: [],
    boostMaterial,
    boostTrails: [],
    fighterBoostCoreMaterial: null,
    fighterBoostCore: null,
    fighterBoostEnvelope: 0,
  };
  const fighterExhaustSocket = type === 'fighter' ? new THREE.Group() : null;
  if (fighterExhaustSocket) {
    fighterExhaustSocket.name = 'fighter-exhaust-effects';
    airframeRoot.add(fighterExhaustSocket);
  }

  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotationY = 0,
    rotationZ = 0,
  ): THREE.Mesh => {
    const part = new THREE.Mesh(aircraftBoxGeometry, material);
    part.scale.set(width, height, depth);
    part.position.set(x, y, z);
    part.rotation.set(0, rotationY, rotationZ);
    fallback.add(part);
    return part;
  };

  const addEngine = (x: number, y: number, z: number, length: number, radius: number): void => {
    const pod = new THREE.Mesh(aircraftEngineGeometry, dark);
    pod.rotation.x = Math.PI / 2;
    pod.scale.set(radius, length, radius);
    pod.position.set(x, y, z);
    fallback.add(pod);
  };

  const addExhaustEffect = (x: number, y: number, z: number, radius: number, configuredBoostLength?: number): void => {
    const baseLength = type === 'fighter' ? 1.25 : 1.45;
    if (fighterExhaustSocket) {
      fighterExhaustSocket.position.set(x, y, z);
      const exhaust = new THREE.Mesh(fighterExhaustGeometry, exhaustMaterial!);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.scale.set(radius * 0.58, baseLength, radius * 0.58);
      exhaust.userData.baseLength = baseLength;
      fighterExhaustSocket.add(exhaust);
      visuals.exhausts.push(exhaust);

      const boostLength = baseLength * 4;
      const outer = new THREE.Mesh(fighterExhaustGeometry, boostMaterial);
      outer.rotation.x = Math.PI / 2;
      outer.scale.set(radius * 1.05, boostLength, radius * 1.05);
      outer.userData.baseLength = boostLength;
      outer.visible = false;
      fighterExhaustSocket.add(outer);
      visuals.boostTrails.push(outer);

      const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffe49a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const core = new THREE.Mesh(fighterExhaustGeometry, coreMaterial);
      core.rotation.x = Math.PI / 2;
      core.scale.set(radius * 0.5, boostLength * 0.74, radius * 0.5);
      core.userData.baseLength = boostLength * 0.74;
      core.visible = false;
      fighterExhaustSocket.add(core);
      visuals.fighterBoostCoreMaterial = coreMaterial;
      visuals.fighterBoostCore = core;
      return;
    }
    if (exhaustMaterial) {
      const exhaust = new THREE.Mesh(aircraftExhaustGeometry, exhaustMaterial);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.scale.set(radius * 0.34, baseLength, radius * 0.34);
      exhaust.position.set(x, y, z + baseLength * 0.46);
      exhaust.userData.baseLength = baseLength;
      airframeRoot.add(exhaust);
      visuals.exhausts.push(exhaust);
    }
    // A second, normally transparent tapered plume is enabled only for boost.
    // It shares the existing exhaust geometry and stays model-local for GLB and
    // primitive aircraft alike.
    const boostTrail = new THREE.Mesh(aircraftExhaustGeometry, boostMaterial);
    const boostLength = configuredBoostLength ?? baseLength * (type === 'fighter' ? 2.4 : 1.9);
    boostTrail.rotation.x = Math.PI / 2;
    boostTrail.scale.set(radius * 0.52, boostLength, radius * 0.52);
    boostTrail.position.set(x, y, z + boostLength * 0.46);
    boostTrail.userData.baseLength = boostLength;
    boostTrail.visible = false;
    airframeRoot.add(boostTrail);
    visuals.boostTrails.push(boostTrail);
  };

  const body = new THREE.Mesh(aircraftBodyGeometry, bodyMaterial);
  body.rotation.x = Math.PI / 2;
  body.scale.set(definition.bodyRadius, definition.bodyLength, definition.bodyRadius);
  fallback.add(body);

  const nose = new THREE.Mesh(aircraftNoseGeometry, accentMaterial);
  nose.rotation.x = -Math.PI / 2;
  nose.scale.set(definition.bodyRadius * 0.9, definition.noseLength, definition.bodyRadius * 0.9);
  nose.position.z = -(definition.bodyLength + definition.noseLength) / 2;
  fallback.add(nose);

  const cockpit = new THREE.Mesh(aircraftCockpitGeometry, dark);
  cockpit.scale.set(
    definition.bodyRadius * (type === 'fighter' ? 0.72 : 0.78),
    definition.bodyRadius * 0.42,
    definition.bodyRadius * (type === 'fighter' ? 1.75 : 1.25),
  );
  cockpit.position.set(0, definition.bodyRadius * 0.8, -definition.bodyLength * (type === 'fighter' ? 0.3 : 0.24));
  fallback.add(cockpit);

  if (type === 'trainer') {
    addBox(definition.wingSpan, 0.16, definition.wingDepth, 0, 0.05, -0.15, accentMaterial);
    addBox(definition.tailSpan, 0.13, 0.72, 0, 0.35, definition.bodyLength * 0.42, accentMaterial);
    addBox(0.13, 1.55, 1.05, 0, 0.78, definition.bodyLength * 0.41, accentMaterial);
    const propeller = new THREE.Group();
    propeller.position.z = -definition.bodyLength / 2 - definition.noseLength - 0.08;
    const hub = new THREE.Mesh(aircraftHubGeometry, dark);
    hub.scale.setScalar(0.28);
    propeller.add(hub);
    const bladeA = new THREE.Mesh(aircraftBoxGeometry, accentMaterial);
    bladeA.scale.set(0.13, 3.2, 0.08);
    propeller.add(bladeA);
    const bladeB = new THREE.Mesh(aircraftBoxGeometry, accentMaterial);
    bladeB.scale.set(3.2, 0.13, 0.08);
    propeller.add(bladeB);
    // The primitive propeller is part of the fallback model only. When the
    // GLB succeeds, its authored local propeller replaces this visual.
    fallback.add(propeller);
    visuals.propeller = propeller;
  } else if (type === 'privateJet') {
    for (const side of [-1, 1]) {
      addBox(definition.wingSpan * 0.55, 0.12, definition.wingDepth, side * definition.wingSpan * 0.23, 0, -0.05, accentMaterial, side * 0.3);
      addEngine(side * definition.wingSpan * 0.31, -0.38, 0.65, 1.75, 0.31);
    }
    addBox(definition.tailSpan, 0.12, 0.68, 0, 1.15, definition.bodyLength * 0.41, accentMaterial);
    addBox(0.14, 2.25, 1.05, 0, 1.08, definition.bodyLength * 0.4, accentMaterial);
  } else if (type === 'cargo') {
    addBox(definition.wingSpan, 0.28, definition.wingDepth, 0, 0.35, -0.05, accentMaterial);
    addBox(definition.tailSpan, 0.2, 0.9, 0, 0.75, definition.bodyLength * 0.41, accentMaterial);
    addBox(0.22, 2.75, 1.45, 0, 1.32, definition.bodyLength * 0.39, accentMaterial);
    for (const side of [-1, 1]) {
      addEngine(side * definition.wingSpan * 0.23, -0.42, 0.05, 1.65, 0.38);
      addEngine(side * definition.wingSpan * 0.39, -0.38, 0.32, 1.45, 0.32);
    }
  } else {
    const deltaWings = new THREE.Mesh(fighterWingGeometry, accentMaterial);
    deltaWings.scale.set(definition.wingSpan / 6.8, 1, definition.wingDepth / 2.2);
    deltaWings.position.z = -0.05;
    fallback.add(deltaWings);
    addBox(1.35, 0.13, 2.5, -0.78, 0.02, -1.25, accentMaterial, -0.24);
    addBox(1.35, 0.13, 2.5, 0.78, 0.02, -1.25, accentMaterial, 0.24);
    addBox(0.14, 1.5, 0.9, -0.62, 0.72, 1.75, accentMaterial, 0, -0.18);
    addBox(0.14, 1.5, 0.9, 0.62, 0.72, 1.75, accentMaterial, 0, 0.18);
    addEngine(0, -0.18, 1.55, 2.7, 0.46);
  }

  for (const anchor of aircraftEffectAnchors[type]) {
    const baseLength = type === 'fighter' ? 1.25 : 1.45;
    addExhaustEffect(anchor.x, anchor.y, anchor.z, anchor.radius, anchor.boostLength ?? baseLength * (type === 'fighter' ? 2.4 : 1.9));
  }

  plane.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      part.castShadow = false;
      part.receiveShadow = false;
    }
  });
  plane.userData.aircraftType = type;
  plane.userData.entityType = 'player';
  plane.userData.visuals = visuals;
  plane.userData.airframeRoot = airframeRoot;
  // The fallback and normalized GLB share a nose-facing local -Z axis. This
  // render-frame anchor is the client counterpart to the server spawn point.
  const muzzle = aircraftMuzzleSockets[type];
  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.name = 'aircraft-muzzle-anchor';
  muzzleAnchor.position.set(muzzle.position.x, muzzle.position.y, muzzle.position.z);
  plane.add(muzzleAnchor);
  plane.userData.muzzleAnchor = muzzleAnchor;
  attachAircraftAsset(plane, fallback, type, definition.bodyLength + definition.noseLength, definition.wingSpan, (model) => {
    if (!fighterExhaustSocket) return;
    const nozzle = model.getObjectByName('ExhaustSocket_Main');
    if (!nozzle) {
      if (import.meta.env.DEV) console.warn('Redspear GLB missing ExhaustSocket_Main; using fallback exhaust origin');
      return;
    }
    nozzle.add(fighterExhaustSocket);
    fighterExhaustSocket.position.set(0, 0, 0);
  }, airframeRoot);
  if (adDebugMode && !remote) attachAircraftLivery(plane, getAircraftLivery(cityId, adPlacements, type), definition);

  return plane;
}

function disposeAirplaneMaterials(plane: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  plane.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    if (part.userData.sharedAsset && !part.userData.cosmeticMaterialsCloned) return;
    if (Array.isArray(part.material)) {
      for (const material of part.material) materials.add(material);
    } else {
      materials.add(part.material);
    }
  });
  for (const material of materials) material.dispose();
}

let aircraftType: AircraftType = flightTestMode ? persistedPlayer.selectedAircraft : 'trainer';
let currentAircraft = aircraftDefinitions[aircraftType];
let airplane = createAirplane(aircraftType);
airplane.position.set(centralAirport.x, groundPlaneY(centralAirport.x, centralAirport.z + centralAirport.spawnOffset), centralAirport.z + centralAirport.spawnOffset);
scene.add(airplane);
const spawnPosition = airplane.position.clone();
let spawnHeading = centralAirport.heading;

const challengeModeEnabled = false;

const checkpointPositions = [
  new THREE.Vector3(0, 22, -20),
  new THREE.Vector3(0, 22, -85),
  new THREE.Vector3(0, 22, -150),
  new THREE.Vector3(45, 30, -215),
  new THREE.Vector3(100, 38, -205),
  new THREE.Vector3(125, 45, -130),
  new THREE.Vector3(95, 38, -45),
  new THREE.Vector3(45, 30, 15),
  new THREE.Vector3(-20, 25, 40),
  new THREE.Vector3(-75, 35, -10),
];

const checkpointRings = checkpointPositions.map((position, index) => {
  const material = new THREE.MeshStandardMaterial({
    color: 0x78c9dc,
    emissive: 0x163a45,
    transparent: true,
    opacity: 0.42,
    roughness: 0.4,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 0.7, 16, 48), material);
  ring.position.copy(position);
  ring.lookAt(index === 0 ? airplane.position : checkpointPositions[index - 1]);
  ring.castShadow = true;
  ring.visible = challengeModeEnabled;
  scene.add(ring);
  return ring;
});

let activeCheckpoint = 0;
let score = 0;
let bestScore = persistedPlayer.bestScore;
let multiplier = 1;
let checkpointsPassed = 0;
let crashed = false;
let maxHealth = maxHealthForAircraft(aircraftType);
let health = maxHealth;
let remainingTime = 12;
let speedBonus = 0;
let currentSpeed = 0;
let verticalSpeed = 0;
type FlightState = 'TAXI' | 'TAKEOFF' | 'FLYING' | 'LANDED' | 'CRASHED';
let flightState: FlightState = 'TAXI';
let onGround = true;
let takeoffRollMeters = 0;
let landedFeedbackTime = 0;
let credits = persistedPlayer.credits;
let skyTokens = 0;
let distanceFlown = 0;
let totalDistance = persistedPlayer.totalDistance;
let distanceCreditProgress = 0;
let flightDistanceSinceTakeoff = 0;
const flightRecapElement = document.querySelector<HTMLElement>('#flight-recap')!;
let flightRecap = { startedAt: 0, topSpeed: 0, maxAltitude: 0, kills: 0, discoveries: 0, territories: 0, eventResults: [] as string[], creditsAtStart: 0, xpAtStart: 0, seasonPointsAtStart: 0, recordsAtStart: {} as Record<string, number> };
let visibleRecap: { title: string; landing?: string } | undefined;
function beginFlightRecap(): void {
  flightRecap = { startedAt: Date.now(), topSpeed: 0, maxAltitude: 0, kills: 0, discoveries: 0, territories: 0, eventResults: [], creditsAtStart: serverProfile.credits, xpAtStart: serverProfile.pilotProgress.xp, seasonPointsAtStart: serverProfile.season?.points ?? 0, recordsAtStart: Object.fromEntries(Object.entries(serverProfile.personalRecords).map(([key, record]) => [key, record.value])) };
  visibleRecap = undefined; flightRecapElement.hidden = true;
}
function showFlightRecap(title: string, landing?: string, announce = true): void {
  const duration = Math.max(0, Date.now() - flightRecap.startedAt); if (!flightRecap.startedAt || (duration < 15_000 && flightDistanceSinceTakeoff < 500)) return;
  const lines = [`${(flightDistanceSinceTakeoff / 1000).toFixed(1)} KM · ${Math.floor(duration / 60000)}:${String(Math.floor(duration / 1000) % 60).padStart(2,'0')}`, `TOP SPEED ${Math.round(flightRecap.topSpeed * 1.943844).toLocaleString()} KT · MAX ALT ${Math.round(flightRecap.maxAltitude * 3.28084).toLocaleString()} FT`];
  if (landing) lines.push(landing); if (flightRecap.kills) lines.push(`${flightRecap.kills} KILLS`); if (flightRecap.discoveries) lines.push(`${flightRecap.discoveries} DISCOVERIES`); if (flightRecap.territories) lines.push(`${flightRecap.territories} TERRITORIES`);
  lines.push(...flightRecap.eventResults.slice(-2));
  const improvedRecords = Object.entries(serverProfile.personalRecords).filter(([key, record]) => record.value > (flightRecap.recordsAtStart[key] ?? -Infinity)).length;
  if (improvedRecords) lines.push(`${improvedRecords} RECORD${improvedRecords === 1 ? '' : 'S'} IMPROVED`);
  lines.push(`+${Math.max(0,serverProfile.credits-flightRecap.creditsAtStart)} CREDITS · +${Math.max(0,serverProfile.pilotProgress.xp-flightRecap.xpAtStart)} XP`);
  const seasonPoints=Math.max(0,(serverProfile.season?.points??0)-flightRecap.seasonPointsAtStart);if(seasonPoints)lines.push(`+${seasonPoints} SEASON POINTS`);
  flightRecapElement.querySelector<HTMLElement>('[data-recap-title]')!.textContent=title; flightRecapElement.querySelector<HTMLElement>('[data-recap-stats]')!.textContent=lines.join('\n'); flightRecapElement.hidden=false;
  visibleRecap = { title, landing };
  if (announce && connectionReady()) socket.send(JSON.stringify({type:'analyticsEvent',event:'flight_recap_shown'}));
}
let successfulLandings = 0;
let totalSuccessfulLandings = persistedPlayer.successfulLandings;
let regionsDiscovered = 0;
const discoveredLocationsByCity = persistedPlayer.discoveries;
const discoveredLocationIds = new Set(discoveredLocationsByCity[cityId] ?? []);
let resetRegionsOnNextTakeoff = false;
const visitedRegionsThisFlight = new Set<RegionName>();
const landedAirportIds = new Set<AirportId>();
let lastSuccessfulAirportId: AirportId = centralAirport.id;
let contractSequence = 0;
let availableContract: ContractDefinition | null = null;
let activeContract: ActiveContract | null = null;
type Waypoint = { x: number; z: number; label?: string };
let waypoint: Waypoint | null = null;
let activePvpChallenge: { id: string; mode: 'dogfight' | 'airportSprint'; status: string; expiresAt: number } | null = null;
let cameraShakeTime = 0;
let checkpointPulseTime = 0;
let checkpointFlashIndex = -1;
let checkpointFlashTime = 0;
let displayName = persistedPlayer.displayName;

const finalScoreElement = document.querySelector<HTMLSpanElement>('#final-score')!;
const crashOverlay = document.querySelector<HTMLDivElement>('#crash-overlay')!;
const endTitleElement = document.querySelector<HTMLDivElement>('#end-title')!;
const crashActions=document.querySelector<HTMLElement>('.crash-actions')!;
document.querySelector<HTMLButtonElement>('[data-crash-restart]')!.addEventListener('click',()=>{ if (journeyMode) void retryJourneyMission(); else restartGame(); });
const nearMissMessageElement = document.querySelector<HTMLDivElement>('#near-miss-message')!;
const checkpointMessageElement = document.querySelector<HTMLDivElement>('#checkpoint-message')!;
const skyChallengeElement = document.querySelector<HTMLDivElement>('#sky-challenge')!;
if (journeyMode) skyChallengeElement.innerHTML = '<strong data-journey-heading>MISSION 01 · DFW SKY RUSH</strong><span data-journey-objective></span><span data-journey-progress></span><span data-journey-target hidden></span><span data-journey-timer hidden></span><span data-journey-hint hidden></span><div class="journey-hud-segments"><i></i><i></i><i></i><i></i></div><div class="journey-hud-enemy" hidden><i></i></div>';
const journeyHudHeading = skyChallengeElement.querySelector<HTMLElement>('[data-journey-heading]');
const journeyHudObjective = skyChallengeElement.querySelector<HTMLElement>('[data-journey-objective]');
const journeyHudProgress = skyChallengeElement.querySelector<HTMLElement>('[data-journey-progress]');
const journeyHudTarget = skyChallengeElement.querySelector<HTMLElement>('[data-journey-target]');
const journeyHudTimer = skyChallengeElement.querySelector<HTMLElement>('[data-journey-timer]');
const journeyHudHint = skyChallengeElement.querySelector<HTMLElement>('[data-journey-hint]');
const journeyHudSegmentRow = skyChallengeElement.querySelector<HTMLElement>('.journey-hud-segments');
const journeyHudSegments = [...skyChallengeElement.querySelectorAll<HTMLElement>('.journey-hud-segments i')];
if (journeyHudSegmentRow) {
  for (let index = 4; index < journeyDallas06.gates.length; index += 1) journeyHudSegmentRow.append(document.createElement('i'));
  journeyHudSegments.push(...[...journeyHudSegmentRow.querySelectorAll<HTMLElement>('i')].slice(4));
}
const journeyHudEnemy = skyChallengeElement.querySelector<HTMLElement>('.journey-hud-enemy');
const missionObjectiveGuidance = journeyMode ? new ObjectiveGuidance(flightGameRoot) : undefined;
let missionObjective: MissionObjective | null = null;
let journeyGateClearedUntil = 0;
let championshipLandingNoticeUntil = 0;
let precisionSharpTurnUntil = 0;
let precisionTurnSide: PrecisionTurnSide = null;
let elevatorDepartureTurnSide: PrecisionTurnSide = null;
let elevatorDepartureAttemptId: string | null = null;
const journeyResultElement = document.createElement('div');
journeyResultElement.className = 'journey-result hidden';
journeyResultElement.innerHTML = '<div class="journey-result-card"><p data-journey-result-heading>MISSION 01 · ROOKIE LEAGUE</p><h2 data-journey-result-title></h2><strong data-journey-result-name>DFW SKY RUSH</strong><div data-journey-result-detail></div><div data-journey-result-reward></div><div class="journey-result-actions"><button type="button" data-journey-primary></button><button type="button" data-journey-exit>EXIT TO JOURNEY</button></div></div>';
flightGameRoot.append(journeyResultElement);
journeyResultElement.querySelector<HTMLButtonElement>('[data-journey-primary]')!.addEventListener('click', () => {
  if (journeyAttempt?.status === 'COMPLETED') void exitFlightToHub(false, true);
  else void retryJourneyMission();
});
journeyResultElement.querySelector<HTMLButtonElement>('[data-journey-exit]')!.addEventListener('click', () => void exitFlightToHub(false, true));
registerUiBackLayer({
  id: 'journey-result',
  priority: uiBackPriority.blockingModal + 30,
  isActive: () => !journeyResultElement.classList.contains('hidden'),
  close: () => { void exitFlightToHub(false, true); },
  containsTarget: (target) => target instanceof Node && journeyResultElement.contains(target),
});
const dynamicEventElement = document.querySelector<HTMLElement>('#dynamic-event')!;
const dynamicEventNameElement = document.querySelector<HTMLElement>('#dynamic-event-name')!;
const dynamicEventObjectiveElement = document.querySelector<HTMLElement>('#dynamic-event-objective')!;
const dynamicEventSponsorElement = document.querySelector<HTMLElement>('#dynamic-event-sponsor')!;
const dynamicEventJoinElement = document.querySelector<HTMLButtonElement>('#dynamic-event-join')!;
const dynamicEventSkipElement = document.querySelector<HTMLButtonElement>('#dynamic-event-skip')!;
const formationStatusElement = document.querySelector<HTMLElement>('#formation-status')!;
formationStatusElement.closest<HTMLElement>('#social-panel')!.hidden = !cityRules.competitiveEnabled;
const citySelectorElement = document.querySelector<HTMLElement>('#city-selector')!;
const garageOverlayElement = document.querySelector<HTMLElement>('#garage-overlay')!;
const pilotMenuOverlayElement = document.querySelector<HTMLElement>('#pilot-menu-overlay')!;
const flightMenuButtonElement = document.querySelector<HTMLButtonElement>('#flight-menu-button')!;
const flightExitButtonElement = document.querySelector<HTMLButtonElement>('#flight-exit-button')!;
if (journeyMode) document.querySelector<HTMLElement>('#flight-exit-label')!.textContent = 'EXIT TO JOURNEY';
const flightGarageButtonElement = document.querySelector<HTMLButtonElement>('#flight-garage-button')!;
const flightMapButtonElement = document.querySelector<HTMLButtonElement>('#flight-map-button')!;
const flightAccountButtonElement = document.querySelector<HTMLButtonElement>('#flight-account-button')!;
const flightAccountAvatarElement = document.querySelector<HTMLImageElement>('#flight-account-avatar')!;
const flightAccountLabelElement = document.querySelector<HTMLElement>('#flight-account-label')!;
const desktopControlsHelpElement = document.querySelector<HTMLElement>('#desktop-controls-help')!;
const desktopControlsHelpToggleElement = document.querySelector<HTMLButtonElement>('#desktop-controls-help-toggle')!;
const desktopControlsHelpItemsElement = document.querySelector<HTMLElement>('#desktop-controls-help-items')!;
const contextualHintElement = document.querySelector<HTMLElement>('#contextual-hint')!;
const contextualHintTitleElement = document.querySelector<HTMLElement>('#contextual-hint-title')!;
const contextualHintBodyElement = document.querySelector<HTMLElement>('#contextual-hint-body')!;
const contextualHintDismissElement = document.querySelector<HTMLButtonElement>('#contextual-hint-dismiss')!;
const altitudeElement = document.querySelector<HTMLSpanElement>('#altitude')!;
function canSwitchAircraft(): boolean {
  return onGround && !crashed && currentSpeed <= 8 && Boolean(getAirportAtPosition(airplane.position));
}
let equipSequence = 0;
let pendingEquip: { id: number; aircraftType: AircraftType; sentAt: number } | undefined;
let purchaseSequence = 0;
const creditsElement = document.querySelector<HTMLSpanElement>('#credits')!;
const activeMissionOverlayElement = document.querySelector<HTMLElement>('#active-mission-overlay')!;
const activeMissionTitleElement = document.querySelector<HTMLElement>('#active-mission-title')!;
const activeMissionObjectiveElement = document.querySelector<HTMLElement>('#active-mission-objective')!;
const activeMissionProgressElement = document.querySelector<HTMLElement>('#active-mission-progress')!;
const activeMissionBarElement = document.querySelector<HTMLProgressElement>('#active-mission-bar')!;
const worldStatusElement = document.querySelector<HTMLDivElement>('#world-status')!;
const radarPanelElement = document.querySelector<HTMLElement>('#radar-panel')!;
const radarCanvas = document.querySelector<HTMLCanvasElement>('#radar')!;
const radarContext = radarCanvas.getContext('2d')!;
const worldMapOverlayElement = document.querySelector<HTMLElement>('#world-map-overlay')!;
const worldMapCanvas = document.querySelector<HTMLCanvasElement>('#world-map-canvas')!;
const worldMapCloseElement = document.querySelector<HTMLButtonElement>('#world-map-close')!;
const worldMapRecenterElement = document.querySelector<HTMLButtonElement>('#world-map-recenter')!;
document.querySelector<HTMLElement>('#world-map-title')!.textContent = `${activeCity.displayName.toUpperCase()} MAP`;
const progressMessageElement = document.querySelector<HTMLDivElement>('#progress-message')!;
const connectionStatusElement = document.querySelector<HTMLDivElement>('#connection-status')!;
const territoryDefenseAlertElement = document.querySelector<HTMLDivElement>('#territory-defense-alert')!;
const territoryDefenseTextElement = document.querySelector<HTMLSpanElement>('#territory-defense-text')!;
const territoryDefenseWaypointElement = document.querySelector<HTMLButtonElement>('#territory-defense-waypoint')!;
let territoryDefenseAlertId: string | null = null;
territoryDefenseWaypointElement.addEventListener('click', () => {
  const territory = territoryDefenseAlertId ? territoryDefinition(territoryDefenseAlertId) : undefined;
  if (territory) setActivityWaypoint(territory.center.x, territory.center.z, territory.displayName);
});
const rewardFeedbackElement = document.querySelector<HTMLDivElement>('#reward-feedback')!;
const dallasPracticeSuggestionElement = document.querySelector<HTMLElement>('#dallas-practice-suggestion')!;
const missionReminderElement = document.querySelector<HTMLElement>('#mission-reminder')!;
const missionReminderCopyElement = document.querySelector<HTMLElement>('#mission-reminder-copy')!;
const missionReminderOpenElement = missionReminderElement.querySelector<HTMLButtonElement>('[data-mission-reminder-open]')!;
const missionReminderDismissElement = missionReminderElement.querySelector<HTMLButtonElement>('[data-mission-reminder-dismiss]')!;
const dallasPracticeSuggestionKey = `airport-chaos-dallas-practice-suggestion-v1:${persistedPlayer.pilotId}`;
let dallasPracticeSuggestionDismissed = false;
function dismissDallasPracticeSuggestion(): void {
  dallasPracticeSuggestionDismissed = true;
  dallasPracticeSuggestionElement.hidden = true;
  try { localStorage.setItem(dallasPracticeSuggestionKey, 'dismissed'); } catch { /* session dismissal still applies */ }
}
function offerDallasPracticeSuggestion(profile: NetworkProfile): void {
  if (journeyMode || cityId !== 'dallas' || profile.tutorial.status !== 'new' || profile.totalDistance > 500 || profile.successfulLandings > 0 || profile.kills > 0 || profile.deaths > 0 || dallasPracticeSuggestionDismissed) return;
  try { if (localStorage.getItem(dallasPracticeSuggestionKey) === 'dismissed') return; } catch { /* show once this session */ }
  dallasPracticeSuggestionElement.hidden = false;
}
dallasPracticeSuggestionElement.querySelector<HTMLButtonElement>('[data-continue-dallas]')!.addEventListener('click', closeTopUiLayer);
dallasPracticeSuggestionElement.querySelector<HTMLButtonElement>('[data-practice-city]')!.addEventListener('click', () => {
  dismissDallasPracticeSuggestion();
  window.dispatchEvent(new CustomEvent('airport-chaos-city-exit', { detail: { cityId: 'milwaukee', timePreset: 'day', practiceSuggestion: true } }));
});
const combatMessageElement = document.querySelector<HTMLDivElement>('#combat-message')!;
const hitMarkerElement = document.querySelector<HTMLDivElement>('#hit-marker')!;
const damageFlashElement = document.querySelector<HTMLDivElement>('#damage-flash')!;
const healthElement = document.querySelector<HTMLSpanElement>('#health')!;
const healthRowElement = document.querySelector<HTMLElement>('.flight-hud-health')!;
const repairFeedbackElement = document.querySelector<HTMLSpanElement>('#repair-feedback')!;
let repairFeedbackTimer = 0;
const heatRowElement = document.querySelector<HTMLElement>('#heat-row')!;
heatRowElement.style.color = visualLanguage.heat.color;
heatRowElement.hidden = !cityRules.competitiveEnabled;
const heatLevelElement = document.querySelector<HTMLSpanElement>('#heat-level')!;
document.getElementById('radar-legend')!.innerHTML = (['airport', 'ai', 'player'] as const)
  .map(kind => `<span style="color:${visualLanguage[kind].color}">${identityText(kind)}</span>`).join('');
document.getElementById('map-legend')!.innerHTML = (['you', 'player', 'ai', 'mission', 'airport', 'territory', 'event', 'waypoint'] as const)
  .map(kind => `<span style="color:${visualLanguage[kind].color}">${identityText(kind)}</span>`).join('');
const acquisitionCircleElement = document.querySelector<HTMLDivElement>('#acquisition-circle')!;
const targetFeedbackElement = document.querySelector<HTMLDivElement>('#target-feedback')!;
const targetNameDistanceElement = document.querySelector<HTMLSpanElement>('#target-name-distance')!;
const targetRangeElement = document.querySelector<HTMLElement>('#target-range')!;
const combatThreatWarningElement = document.querySelector<HTMLDivElement>('#combat-threat-warning')!;
const combatThreatDirectionElement = document.querySelector<HTMLSpanElement>('#combat-threat-direction')!;
const combatThreatLabelElement = document.querySelector<HTMLElement>('#combat-threat-label')!;
const activeContractElement = document.querySelector<HTMLDivElement>('#active-contract')!;
const contractPanelElement = document.querySelector<HTMLElement>('#contract-panel')!;
const territoryCaptureElement = document.querySelector<HTMLElement>('#territory-capture')!;
territoryCaptureElement.hidden = !cityRules.territoriesEnabled;
territoryDefenseAlertElement.hidden = !cityRules.territoriesEnabled;
document.querySelector<HTMLElement>('#practice-mode-label')!.hidden = !cityRules.practiceMode;
document.querySelector<HTMLElement>('#tutorial-help')!.hidden = !cityRules.tutorialEnabled;
document.querySelector<HTMLElement>('#map-territory-list')?.closest<HTMLElement>('.map-intelligence-panel')?.toggleAttribute('hidden', !cityRules.territoriesEnabled);
contractPanelElement.classList.add('hidden');
const contractTypeElement = document.querySelector<HTMLElement>('#contract-type')!;
const contractDetailElement = document.querySelector<HTMLDivElement>('#contract-detail')!;
const contractAircraftElement = document.querySelector<HTMLSpanElement>('#contract-aircraft')!;
const contractRewardElement = document.querySelector<HTMLSpanElement>('#contract-reward')!;
const contractAcceptElement = document.querySelector<HTMLButtonElement>('#contract-accept')!;
const contractSkipElement = document.querySelector<HTMLButtonElement>('#contract-skip')!;
const visualQaPanelElement = document.querySelector<HTMLElement>('#visual-qa-panel')!;
const visualQaPresetsElement = document.querySelector<HTMLDivElement>('#visual-qa-presets')!;
let nearMissMessageTimer: number | undefined;
let checkpointMessageTimer: number | undefined;
let progressMessageTimer: number | undefined;
let rewardBatchTimer: number | undefined;
let rewardHideTimer: number | undefined;
let rewardRemoveTimer: number | undefined;
let rewardBatchScore = 0;
const seenCreditRewardIds = new Set<string>();
let combatMessageTimer: number | undefined;
let healthFlashTimer: number | undefined;
let hitMarkerTimer: number | undefined;
let damageFlashTimer: number | undefined;

type AudioCategory = 'engine' | 'combat' | 'impacts' | 'ui';
const audioLevels: AudioLevels = audioManager.getLevels();
audioManager.setMuted(persistedPlayer.muted);
function setAudioLevel(category: keyof AudioLevels, value: number): void {
  audioLevels[category] = THREE.MathUtils.clamp(Math.round(value), 0, 100);
  audioManager.setLevel(category, audioLevels[category]);
}
let progressSaveTimer: number | undefined;
let identityTransitionInProgress = false;

function writePlayerProgress(): void {
  if (flightTestMode || identityTransitionInProgress) return;
  const value: PersistedPlayer = {
    version: 1,
    pilotId: persistedPlayer.pilotId,
    credits,
    // Retain a cached selection only until the authoritative profile arrives;
    // never overwrite migration data with the temporary Trainer state.
    selectedAircraft: profileHydrated ? aircraftType : persistedPlayer.selectedAircraft,
    displayName,
    muted: audioManager.isMuted(),
    bestScore,
    discoveries: discoveredLocationsByCity,
    totalDistance,
    successfulLandings: totalSuccessfulLandings,
    hintsEnabled: contextualHints.isEnabled(),
    dismissedHints: contextualHintDismissed,
    navigationMarkersEnabled,
    onboardingSeen: persistedPlayer.onboardingSeen,
  };
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable; gameplay remains session-only.
  }
}

function savePlayerProgress(immediate = false): void {
  if (immediate) {
    window.clearTimeout(progressSaveTimer);
    progressSaveTimer = undefined;
    writePlayerProgress();
    return;
  }
  if (progressSaveTimer !== undefined) return;
  progressSaveTimer = window.setTimeout(() => {
    progressSaveTimer = undefined;
    writePlayerProgress();
  }, 500);
}

window.addEventListener('pagehide', () => savePlayerProgress(true));

let contextualHintDismissed: readonly ContextualHintId[] = persistedPlayer.dismissedHints;
function renderContextualHint(id: ContextualHintId | null): void {
  if (journeyMode) id = null;
  contextualHintElement.classList.toggle('hidden', id === null);
  if (!id) return;
  const definition = contextualHintDefinitions[id];
  contextualHintTitleElement.textContent = definition.title;
  contextualHintBodyElement.textContent = definition.body;
}
const contextualHints = new ContextualHintSystem(
  persistedPlayer.dismissedHints,
  persistedPlayer.hintsEnabled,
  renderContextualHint,
  (dismissed, enabled) => {
    contextualHintDismissed = dismissed;
    if (enabled !== persistedPlayer.hintsEnabled || dismissed.length) savePlayerProgress();
  },
);
contextualHintDismissElement.addEventListener('click', closeTopUiLayer);
// Returning pilots receive the compact runway reminder; first-time pilots see
// the visual guide first, then enter the same contextual hint sequence.
if (!journeyMode) {
  contextualHints.trigger('missionBoard');
  contextualHints.trigger('runwayControls');
}

function recordBestScore(candidate: number): void {
  if (candidate <= bestScore) return;
  bestScore = candidate;
  savePlayerProgress(true);
}

function activateAudio(): void {
  void audioManager.unlock();
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  endFrequency = frequency,
  delay = 0,
  category: AudioCategory = 'ui',
): void {
  audioManager.playTone(frequency, duration, type, volume, endFrequency, delay,
    category === 'combat' ? 'weapons' : category);
}

function playCheckpointSound(): void {
  playTone(520, 0.12, 'square', 0.055, 700);
  playTone(760, 0.14, 'square', 0.045, 980, 0.1);
}

function playNearMissSound(): void {
  playTone(260, 0.24, 'sawtooth', 0.06, 820, 0, 'combat');
}

let lastProjectileWhooshAt = -Infinity;
function playFireSound(): void {
  playTone(150, 0.075, 'sawtooth', 0.06, 68, 0, 'combat');
  playTone(360, 0.045, 'square', 0.028, 145, 0, 'combat');
  const now = performance.now();
  if (now - lastProjectileWhooshAt >= 450) {
    lastProjectileWhooshAt = now;
    playTone(1_350, 0.19, 'triangle', 0.019, 420, 0.015, 'combat');
  }
}

let lastLockWarningSoundAt = -Infinity;
let lastIncomingWarningSoundAt = -Infinity;
function playLockWarningSound(): void {
  const now = performance.now();
  if (now - lastLockWarningSoundAt < 600) return;
  lastLockWarningSoundAt = now;
  playTone(620, 0.11, 'triangle', 0.038, 520, 0, 'combat');
  playTone(520, 0.11, 'triangle', 0.032, 440, 0.12, 'combat');
}

function playIncomingWarningSound(): void {
  const now = performance.now();
  if (now - lastIncomingWarningSoundAt < 450) return;
  lastIncomingWarningSoundAt = now;
  playTone(880, 0.08, 'square', 0.05, 620, 0, 'combat');
  playTone(760, 0.08, 'square', 0.045, 520, 0.1, 'combat');
}

function playDestructionSound(): void {
  playTone(145, 0.27, 'sawtooth', 0.092, 42, 0, 'impacts');
  playTone(72, 0.44, 'triangle', 0.068, 35, 0.04, 'impacts');
}

type EndReason = 'CRASHED' | 'TIME UP' | 'MID-AIR COLLISION' | 'DESTROYED';

function playEndSound(message: EndReason): void {
  if (message === 'TIME UP') {
    playTone(420, 0.2, 'square', 0.055, 260);
    playTone(280, 0.24, 'square', 0.05, 150, 0.18);
    return;
  }
  if (message === 'DESTROYED' || message === 'MID-AIR COLLISION') {
    playDestructionSound();
    return;
  }
  playTone(120, 0.42, 'sawtooth', 0.075, 48, 0, 'impacts');
}

function playLeaderSound(): void {
  playTone(520, 0.12, 'triangle', 0.05, 620);
  playTone(660, 0.12, 'triangle', 0.05, 780, 0.1);
  playTone(880, 0.18, 'triangle', 0.055, 1040, 0.2);
}

function updateEngineAudio(): void {
  const speedAmount = THREE.MathUtils.clamp(currentSpeed / currentAircraft.maxSpeed, 0, 1);
  // The launch lift is audio-only. It never changes throttle, velocity, or the
  // authoritative grounded aircraft state.
  const engineAmount = Math.max(speedAmount, throttle * 0.72, flightLaunchEngineLift + cinematicDirector.engineLift()) + boostVisualStrength * 0.12;
  const profile = aircraftType === 'cargo' ? { base: 42, range: 58, weight: 1.22 }
    : aircraftType === 'privateJet' ? { base: 62, range: 72, weight: 0.92 }
    : aircraftType === 'fighter' ? { base: 72, range: 96, weight: 1.08 }
    : { base: 55, range: 70, weight: 0.94 };
  audioManager.updateEngine(
    profile.base + engineAmount * profile.range,
    crashed ? 0.0001 : (0.006 + engineAmount * 0.02) * profile.weight * (boostVisualStrength > 0.1 ? 1 + boostVisualStrength * 0.35 : 1),
    0.08,
    0.1,
  );
}

function toggleAudio(): void {
  activateAudio();
  audioManager.toggleMuted();
  savePlayerProgress(true);
}

function showActiveCheckpoint(): void {
  checkpointRings.forEach((ring, index) => {
    const routeOffset = (index - activeCheckpoint + checkpointRings.length) % checkpointRings.length;
    const active = routeOffset === 0;
    const validAhead = routeOffset === 1 || routeOffset === 2;
    ring.material.color.setHex(active ? 0xffd34d : validAhead ? 0x78dceb : 0x78c9dc);
    ring.material.emissive.setHex(active ? 0x9b5d00 : validAhead ? 0x23535e : 0x0d252c);
    ring.material.emissiveIntensity = active ? 1.4 : validAhead ? 1 : 0.55;
    ring.material.opacity = active ? 1 : routeOffset === 1 ? 0.72 : routeOffset === 2 ? 0.56 : 0.22;
    ring.scale.setScalar(active ? 1.15 : routeOffset === 1 ? 1.06 : routeOffset === 2 ? 1.03 : 1);
  });
}

function checkCheckpoint(): void {
  let checkpointOffset = -1;
  for (let offset = 0; offset <= 2; offset += 1) {
    const checkpointIndex = (activeCheckpoint + offset) % checkpointPositions.length;
    if (airplane.position.distanceTo(checkpointPositions[checkpointIndex]) <= 10) {
      checkpointOffset = offset;
      break;
    }
  }
  if (checkpointOffset < 0) return;

  const passedCheckpoint = (activeCheckpoint + checkpointOffset) % checkpointRings.length;
  const points = 100 * multiplier * (checkpointOffset === 0 ? 1 : checkpointOffset === 1 ? 0.5 : 0.25);
  if (cityRules.progressionEnabled) {
    score += points;
    queueRewardFeedback(0, points);
    recordBestScore(score);
  }
  checkpointsPassed += 1;
  multiplier = Math.min(5, 1 + Math.floor(checkpointsPassed / 3));
  speedBonus = Math.min(10, Math.floor(checkpointsPassed / 2) * 2);
  remainingTime = Math.min(14, Math.max(10, remainingTime) + 2);
  activeCheckpoint = (passedCheckpoint + 1) % checkpointRings.length;
  showActiveCheckpoint();
  checkpointFlashIndex = passedCheckpoint;
  checkpointFlashTime = 0.45;
  const passedRing = checkpointRings[passedCheckpoint];
  passedRing.material.color.setHex(0x74e89a);
  passedRing.material.emissive.setHex(0x2c8b4d);
  passedRing.material.emissiveIntensity = 1.8;
  passedRing.material.opacity = 1;
  passedRing.scale.setScalar(1.3);
  checkpointMessageElement.textContent = 'CHECKPOINT';
  checkpointMessageElement.classList.remove('hidden');
  window.clearTimeout(checkpointMessageTimer);
  checkpointMessageTimer = window.setTimeout(() => checkpointMessageElement.classList.add('hidden'), 900);
  playCheckpointSound();
  sendPlayerUpdate();
}

function updateCheckpointFeedback(delta: number): void {
  checkpointPulseTime += delta;
  const activeRing = checkpointRings[activeCheckpoint];
  const pulse = Math.sin(checkpointPulseTime * 6);
  activeRing.scale.setScalar(1.16 + pulse * 0.06);
  activeRing.material.emissiveIntensity = 1.45 + pulse * 0.3;

  if (checkpointFlashIndex < 0) return;
  checkpointFlashTime -= delta;
  if (checkpointFlashTime > 0) return;

  checkpointFlashIndex = -1;
  showActiveCheckpoint();
}

function setFlightState(state: FlightState): void {
  if (flightState === state) return;
  const previous = flightState;
  flightState = state;
  updatePendingAircraftEquip();
  if (state === 'TAKEOFF' && previous === 'TAXI') queueAtcCallout('takeoff-roll', 'TOWER: CLEARED FOR TAKEOFF');
  else if (state === 'FLYING' && previous === 'TAKEOFF') queueAtcCallout('airborne', 'TOWER: GOOD DEPARTURE');
}

function updateFlightHud(): void {
  const speedKnots = Math.round(currentSpeed * METERS_PER_SECOND_TO_KNOTS).toLocaleString();
  speedElement.textContent = speedKnots;
  const altitudeFeet = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toLocaleString();
  altitudeElement.textContent = altitudeFeet;
  // Guidance must remain visible when the pilot is misaligned and assist is
  // unavailable. It observes the same touchdown predicate, not a new envelope.
  const approachAirport = !onGround && !crashed && flightState !== 'TAKEOFF' &&
    altitudeAboveTerrain() <= 160 && verticalSpeed <= 2
    ? getLandingAssistAirport(airplane.position, false) : null;
  let speedRisk = false;
  let descentRisk = false;
  let warning = '';
  if (approachAirport) {
    queueAtcCallout(`approach-${approachAirport.id}`, 'TOWER: MAINTAIN APPROACH', approachAirport.name.toUpperCase());
    evaluateLanding(approachAirport, landingStatus);
    speedRisk = !landingStatus.speedSafe;
    descentRisk = !landingStatus.descentSafe;
    const dx = airplane.position.x - approachAirport.x;
    const dz = airplane.position.z - approachAirport.z;
    const centered = Math.abs(dx * Math.cos(approachAirport.heading) - dz * Math.sin(approachAirport.heading)) <= approachAirport.runwayWidth / 2;
    warning = speedRisk ? 'TOO FAST — HOLD S' : descentRisk ? 'COMING DOWN TOO FAST' :
      !landingStatus.bankSafe ? 'LEVEL WINGS' : !landingStatus.pitchSafe ? 'CRASH RISK — ADJUST NOSE' :
      !landingStatus.alignmentSafe || !centered ? 'LINE UP WITH RUNWAY' : '';
  }
  if(guidedTutorialActive&&guidedTutorialStep==='landing')warning='';
  if (landingSpeedCueElement.textContent !== warning) landingSpeedCueElement.textContent = warning;
  landingSpeedCueElement.classList.toggle('hidden', !warning);
  speedElement.classList.toggle('landing-risk', speedRisk);
  altitudeElement.classList.toggle('landing-risk', descentRisk);
  const trial = serverProfile.fighterTrial;
  const trialActive = aircraftType === 'fighter' && trial.status === 'active' && typeof trial.expiresAt === 'number' &&
    !serverProfile.aircraftEntitlements.includes(firehawkProduct.entitlement);
  if (trialActive) {
    const remaining = Math.max(0, trial.expiresAt! - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    fighterTrialIndicator.textContent = remaining > 0
      ? `FIREHAWK TRIAL — ${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
      : `FIREHAWK TRIAL COMPLETE · UNLOCK FOREVER — ${firehawkProduct.displayPrice}`;
    if (remaining === 0 && !trial.completedReportedAt && connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'fighter_trial_completed' }));
  }
  fighterTrialIndicator.classList.toggle('hidden', !trialActive);
}

const radarAirportLabels: Record<AirportId, string> = {
  central: 'CEN',
  coast: 'CST',
  mountain: 'MTN',
  countryside: 'CTR',
};
const navigationForward = new THREE.Vector3(0, 0, -1);
const radarRange = 3000;
const radarRings = [26, 52, 78] as const;

function getNavigationForward(): THREE.Vector3 {
  navigationForward.set(0, 0, -1).applyQuaternion(airplane.quaternion);
  navigationForward.y = 0;
  if (navigationForward.lengthSq() < 0.0001) navigationForward.set(0, 0, -1);
  return navigationForward.normalize();
}

function drawRadarThreatPulse(x: number, y: number): void {
  const pulse = 0.5 + Math.sin(performance.now() * 0.01) * 0.5;
  radarContext.save();
  radarContext.strokeStyle = `rgba(255, 92, 58, ${0.58 + pulse * 0.36})`;
  radarContext.lineWidth = 2.2;
  radarContext.shadowColor = 'rgba(255, 72, 40, 0.8)';
  radarContext.shadowBlur = 5 + pulse * 4;
  radarContext.beginPath();
  radarContext.arc(x, y, 10 + pulse * 3, 0, Math.PI * 2);
  radarContext.stroke();
  radarContext.restore();
}

function drawRadarMarker(
  direction: THREE.Vector3,
  targetX: number,
  targetZ: number,
  kind: 'airport' | 'player' | 'ai' | 'ambient' | 'event' | 'wanted' | 'challenge' | 'waypoint' | 'repair' | 'repairHeart' | 'mission',
  label = '',
  king = false,
  hot = false,
  targeted = false,
  locked = false,
  ownershipAccent?: string,
  threatened = false,
  relativeAltitude = '',
): void {
  const center = radarCanvas.width / 2;
  const radarRadius = center - 13;
  const offsetX = targetX - airplane.position.x;
  const offsetZ = targetZ - airplane.position.z;
  const distance = Math.hypot(offsetX, offsetZ);
  // Connected humans remain trackable at any distance and pin to the radar
  // edge. Other world entities keep their existing local-range filtering.
  if ((kind === 'ai' || kind === 'ambient' || kind === 'challenge' || kind === 'repair' || kind === 'repairHeart') && distance > (kind === 'ai' && hot ? radarRange * 2 : radarRange)) return;

  const rightX = -direction.z;
  const rightZ = direction.x;
  let radarX = (offsetX * rightX + offsetZ * rightZ) / radarRange * radarRadius;
  let radarY = -(offsetX * direction.x + offsetZ * direction.z) / radarRange * radarRadius;
  const markerDistance = Math.hypot(radarX, radarY);
  const pinned = distance > radarRange;
  if (markerDistance > radarRadius) {
    radarX = radarX / markerDistance * radarRadius;
    radarY = radarY / markerDistance * radarRadius;
  }

  const x = center + radarX;
  const y = center + radarY;
  if (kind === 'player') {
    radarContext.fillStyle = visualLanguage.player.color;
    radarContext.beginPath();
    radarContext.arc(x, y, 5, 0, Math.PI * 2);
    radarContext.fill();
    radarContext.strokeStyle = '#101d27'; radarContext.lineWidth = 1.5; radarContext.stroke();
    if (ownershipAccent) {
      radarContext.strokeStyle = '#081722'; radarContext.lineWidth = 5;
      radarContext.beginPath(); radarContext.arc(x, y, 9.5, 0, Math.PI * 2); radarContext.stroke();
      radarContext.strokeStyle = ownershipAccent; radarContext.lineWidth = 3;
      radarContext.stroke();
    }
    if (targeted) {
      radarContext.strokeStyle = locked ? '#ffffff' : visualLanguage.player.color;
      radarContext.lineWidth = locked ? 2 : 1.5;
      radarContext.beginPath(); radarContext.arc(x, y, locked ? 12 : 11, 0, Math.PI * 2); radarContext.stroke();
    }
    if (hot) {
      radarContext.strokeStyle = visualLanguage.heat.color;
      radarContext.lineWidth = 1.5;
      radarContext.beginPath();
      radarContext.arc(x, y, 6, 0, Math.PI * 2);
      radarContext.stroke();
    }
    if (king) {
      radarContext.fillStyle = '#ffd96d';
      radarContext.font = '10px ui-monospace, monospace';
      radarContext.textAlign = 'center';
      radarContext.fillText('♛', x, y - 6);
    }
    if (relativeAltitude) {
      radarContext.fillStyle = '#eaf8ff';
      radarContext.font = '700 8px ui-monospace, monospace';
      radarContext.textAlign = 'center';
      radarContext.fillText(relativeAltitude, x, Math.min(radarCanvas.height - 5, y + 15));
    }
    if (threatened) drawRadarThreatPulse(x, y);
    return;
  }

  if (kind === 'ambient') {
    radarContext.fillStyle = '#d5e0e2';
    radarContext.beginPath();
    radarContext.arc(x, y, 2.2, 0, Math.PI * 2);
    radarContext.fill();
    return;
  }

  if (kind === 'repairHeart') {
    radarContext.fillStyle = visualLanguage.repairHeart.color;
    radarContext.font = 'bold 16px sans-serif';
    radarContext.textAlign = 'center';
    radarContext.fillText('♥', x, y + 5);
    return;
  }
  if (kind === 'repair' || kind === 'ai') {
    radarContext.save();
    radarContext.translate(x, y);
    radarContext.rotate(Math.PI / 4);
    radarContext.fillStyle = visualLanguage[kind].color;
    radarContext.fillRect(-4.5, -4.5, 9, 9);
    if (kind === 'ai') {
      radarContext.strokeStyle = '#10222b'; radarContext.lineWidth = 1.5;
      radarContext.strokeRect(-4.5, -4.5, 9, 9);
      if (ownershipAccent) {
        radarContext.strokeStyle = '#081722'; radarContext.lineWidth = 5;
        radarContext.beginPath(); radarContext.arc(0, 0, 10, 0, Math.PI * 2); radarContext.stroke();
        radarContext.strokeStyle = ownershipAccent; radarContext.lineWidth = 3; radarContext.stroke();
      }
      if (targeted) {
        radarContext.strokeStyle = locked ? '#ffffff' : visualLanguage.ai.color;
        radarContext.lineWidth = locked ? 2 : 1.5;
        radarContext.strokeRect(-7, -7, 14, 14);
      }
    }
    radarContext.restore();
    if (kind === 'ai' && threatened) drawRadarThreatPulse(x, y);
    return;
  }

  if (kind === 'event' || kind === 'wanted') {
    radarContext.strokeStyle = visualLanguage[kind].color;
    radarContext.lineWidth = 2;
    radarContext.beginPath();
    radarContext.arc(x, y, 4, 0, Math.PI * 2);
    radarContext.stroke();
    radarContext.fillStyle = visualLanguage[kind].color;
    radarContext.font = '8px ui-monospace, monospace';
    radarContext.fillText(kind === 'wanted' ? identityText('wanted') : 'EVENT', x, Math.max(9, y - 7));
    return;
  }

  if (kind === 'mission') {
    radarContext.strokeStyle = visualLanguage.mission.color;
    radarContext.fillStyle = 'rgba(8, 20, 30, 0.82)';
    radarContext.lineWidth = 2.5;
    radarContext.beginPath();
    radarContext.arc(x, y, 7, 0, Math.PI * 2);
    radarContext.fill();
    radarContext.stroke();
    radarContext.fillStyle = visualLanguage.mission.color;
    radarContext.font = '700 8px ui-monospace, monospace';
    radarContext.textAlign = 'center';
    radarContext.fillText(label || 'MISSION', x, Math.max(9, y - 10));
    return;
  }

  if (kind === 'challenge') {
    radarContext.strokeStyle = visualLanguage.challenge.color;
    radarContext.lineWidth = 2;
    radarContext.beginPath();
    radarContext.moveTo(x, y - 5); radarContext.lineTo(x + 4.5, y + 4);
    radarContext.lineTo(x - 4.5, y + 4); radarContext.closePath();
    radarContext.stroke();
    return;
  }

  if (kind === 'waypoint') {
    radarContext.strokeStyle = visualLanguage.waypoint.color;
    radarContext.lineWidth = 2;
    radarContext.beginPath();
    radarContext.moveTo(x - 4, y); radarContext.lineTo(x + 4, y);
    radarContext.moveTo(x, y - 4); radarContext.lineTo(x, y + 4);
    radarContext.stroke();
    return;
  }

  radarContext.save();
  radarContext.translate(x, y);
  radarContext.rotate(Math.PI / 4);
  radarContext.fillStyle = visualLanguage.airport.color;
  radarContext.fillRect(-3.5, -3.5, 7, 7);
  radarContext.restore();
  radarContext.fillStyle = visualLanguage.airport.color;
  radarContext.font = '8px ui-monospace, monospace';
  radarContext.textAlign = 'center';
  radarContext.fillText(label, x, Math.max(9, y - 7));
}

function drawRadarTerritories(direction: THREE.Vector3, onlyId?: string): void {
  if (!territoryDefinitions.length) return;
  const center = radarCanvas.width / 2;
  const radarRadius = center - 13;
  const rightX = -direction.z;
  const rightZ = direction.x;
  const project = (x: number, z: number) => {
    const offsetX = x - airplane.position.x;
    const offsetZ = z - airplane.position.z;
    return {
      x: center + (offsetX * rightX + offsetZ * rightZ) / radarRange * radarRadius,
      y: center - (offsetX * direction.x + offsetZ * direction.z) / radarRange * radarRadius,
    };
  };
  radarContext.save();
  radarContext.beginPath();
  radarContext.arc(center, center, radarRadius, 0, Math.PI * 2);
  radarContext.clip();
  for (const definition of territoryDefinitions) {
    if (onlyId && definition.id !== onlyId) continue;
    const { minX, maxX, minZ, maxZ } = definition.bounds;
    const corners = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]] as const;
    const state = territoryState.get(definition.id);
    radarContext.beginPath();
    corners.forEach(([x, z], index) => {
      const point = project(x, z);
      if (index === 0) radarContext.moveTo(point.x, point.y);
      else radarContext.lineTo(point.x, point.y);
    });
    radarContext.closePath();
    const journeyTarget = journeyAttempt?.missionId === journeyDallas04.id && definition.id === journeyDallas04.territoryId;
    radarContext.strokeStyle = state?.controllerId || journeyTarget ? definition.fixedColor : neutralTerritoryColor;
    radarContext.globalAlpha = journeyTarget ? 0.9 : state?.contested ? 0.58 : 0.28;
    radarContext.lineWidth = journeyTarget ? 2.5 : state?.contested ? 2 : 1;
    radarContext.stroke();
  }
  radarContext.restore();
}

function updateRadar(direction: THREE.Vector3): void {
  const width = radarCanvas.width;
  const height = radarCanvas.height;
  const center = width / 2;
  radarContext.clearRect(0, 0, width, height);
  radarContext.strokeStyle = 'rgba(115, 216, 237, 0.25)';
  radarContext.lineWidth = 1;
  for (const radius of radarRings) {
    radarContext.beginPath();
    radarContext.arc(center, center, radius, 0, Math.PI * 2);
    radarContext.stroke();
  }
  radarContext.beginPath();
  radarContext.moveTo(center, 8);
  radarContext.lineTo(center, height - 8);
  radarContext.moveTo(8, center);
  radarContext.lineTo(width - 8, center);
  radarContext.stroke();
  if (!missionFocus || missionFocus.showUnrelatedTerritoryLabels) drawRadarTerritories(direction);
  else if (journeyAttempt?.missionId === journeyDallas04.id) drawRadarTerritories(direction, journeyDallas04.territoryId);
  const activeMission = serverProfile.missions[cityId]?.active;
  const activeMissionDefinition = activeMission && missionForCity(cityId, activeMission.missionId);

  if (missionFocus?.showUnrelatedAirportLabels !== false) for (const airport of airports) {
    drawRadarMarker(direction, airport.x, airport.z, 'airport', radarAirportLabels[airport.id]);
  }
  for (const beacon of repairsForCity(cityId)) {
    drawRadarMarker(direction, beacon.x, beacon.z, beacon.kind === 'heart' ? 'repairHeart' : 'repair');
  }
  // Human radar presence comes from the authoritative same-city roster, not
  // the optional 3D remote-aircraft lifecycle. Last-known positions remain
  // stable through brief transform throttling, but never outlive an active
  // aircraft lifecycle (destroyed/respawning pilots stay in PLAYERS only).
  for (const human of cityHumanRoster.values()) {
    if (human.playerId === localPlayerId || !humanHasActiveAircraft(human)) continue;
    const track = humanRadarTracks.get(human.playerId);
    if (!track) continue;
    const remote = remotePlayers.get(human.playerId);
    drawRadarMarker(direction, track.x, track.z, 'player', '', human.playerId === kingPlayerId, (remote?.heatLevel ?? 0) >= 4,
      selectedCombatTarget?.remote.playerId === human.playerId, selectedCombatTarget?.remote.playerId === human.playerId && selectedCombatTarget.locked,
      primaryTerritoryColorForPlayer(human.playerId), lockingThreatIds.has(human.playerId),
      formatRelativeAltitude(track.altitudeMeters - altitudeAboveTerrain()));
  }
  const markedDefenderId = whiteRockGuidance()?.target === 'defender' ? focusedWhiteRockDefenderId() : null;
  for (const remote of remotePlayers.values()) {
    if (!remote.isBot || (missionFocus?.showAmbientAIMarkers === false && unrelatedFocusedBot(remote.playerId)) || !remoteIdentityVisible(remote)) continue;
    drawRadarMarker(direction, remote.plane.position.x, remote.plane.position.z, 'ai', '', false, remote.heatLevel >= 4,
      selectedCombatTarget?.remote === remote, selectedCombatTarget?.remote === remote && selectedCombatTarget.locked,
      remote.playerId === markedDefenderId
        ? visualLanguage.mission.color : primaryTerritoryColorForPlayer(remote.playerId), lockingThreatIds.has(remote.playerId),
      remote.altitudeMeters === undefined ? '' : formatRelativeAltitude(remote.altitudeMeters - altitudeAboveTerrain()));
  }
  if (activeMissionDefinition?.type === 'assignedHunter' && activeMission?.targetId) {
    const hunter = remotePlayers.get(activeMission.targetId);
    if (hunter?.lifeState === 'alive') drawRadarMarker(direction, hunter.plane.position.x, hunter.plane.position.z, 'mission', 'HUNTER');
  }
  if (journeyAttempt?.missionId === 'journey-dallas-02' && journeyAttempt.targetId) {
    const hunter = remotePlayers.get(journeyAttempt.targetId);
    if (hunter?.lifeState === 'alive') drawRadarMarker(direction, hunter.plane.position.x, hunter.plane.position.z, 'mission', 'HUNTER');
  }
  const missionLocation = activeMissionDefinition && activeMission ? missionLocationTarget(activeMissionDefinition, activeMission) : undefined;
  if (missionLocation && !missionFocus) drawRadarMarker(direction, missionLocation.x, missionLocation.z, 'mission', 'NEXT');
  if (!missionFocus) for (const ambient of ambientTraffic?.getRadarEntities(airplane.position, radarRange) ?? []) {
    drawRadarMarker(direction, ambient.x, ambient.z, entityCapabilities(ambient.entityType, ambient.eventCombatMode).radarMarker);
  }
  const challengeMarker = skyChallenges?.getRadarMarker(airplane.position);
  if (challengeMarker && !missionFocus) drawRadarMarker(direction, challengeMarker.x, challengeMarker.z, 'challenge');
  const journeyTarget = journeyGates?.target();
  if (journeyTarget) drawRadarMarker(direction, journeyTarget.x, journeyTarget.z, 'mission', `GATE ${journeyTarget.index + 1}`);
  if (journeyAttempt?.missionId === journeyDallas04.id && journeyAttempt.status !== 'COMPLETED' && whiteRockGuidance()?.target === 'territory') {
    const whiteRock = territoryDefinition(journeyDallas04.territoryId);
    if (whiteRock) drawRadarMarker(direction, whiteRock.center.x, whiteRock.center.z, 'mission', 'WHITE ROCK');
  }
  const eventObjective = cityEvent ? eventObjectiveForLocal(cityEvent) : undefined;
  if (!missionFocus && cityEvent && eventObjective && (cityEvent.lifecycle === 'available' || cityEvent.lifecycle === 'active')) {
    const missionEvent = activeMissionDefinition?.type === 'event' && activeMissionDefinition.requirements.eventType === cityEvent.eventType;
    const label = cityEvent.eventType === 'aceIntercept' ? 'ACE' : cityEvent.eventType === 'vipEscort' ? 'VIP' : cityEvent.eventType === 'goldenSkyRun' ? 'GATE' : 'MISSION';
    drawRadarMarker(direction, eventObjective.x, eventObjective.z, missionEvent ? 'mission' : cityEvent.eventType === 'mostWanted' ? 'wanted' : 'event', missionEvent ? label : '');
  }
  if (waypoint && !missionFocus) drawRadarMarker(direction, waypoint.x, waypoint.z, 'waypoint');

  radarContext.fillStyle = '#f8fbff';
  radarContext.beginPath();
  radarContext.moveTo(center, center - 6);
  radarContext.lineTo(center - 5, center + 5);
  radarContext.lineTo(center + 5, center + 5);
  radarContext.closePath();
  radarContext.fill();
  if (kingPlayerId === localPlayerId) {
    radarContext.fillStyle = '#ffd96d';
    radarContext.font = '10px ui-monospace, monospace';
    radarContext.textAlign = 'center';
    radarContext.fillText('♛', center, center - 9);
  }
}

function updateNavigationHud(): void {
  refreshPlayersPanelAltitude();
  updateMarkerQa();
  const direction = getNavigationForward();
  updateRadar(direction);
  updateWorldMap(direction);
  navigationBeacons.update(airplane.position, camera, waypoint, getTerrainHeight, {
    x: lockCircleCenterX,
    y: lockCircleCenterY,
    radius: lockCircleRadius,
    active: selectedCombatTarget !== null,
  });
  updateTerritoryLabels();
  updateCaptureHud();
  updateSocialHud();
  const outsideCity =
    Math.abs(airplane.position.x) > WORLD_SIZE / 2 || Math.abs(airplane.position.z) > WORLD_SIZE / 2;
  worldStatusElement.classList.toggle('hidden', !outsideCity);
  updateContextualHints();
  refreshPilotMenu();
}

function updateContextualHints(): void {
  if (flightTutorial.isOpen() || missionFocus) return;
  contextualHints.update();
  if (!crashed && health < maxHealthForAircraft(aircraftType) * 0.65) contextualHints.trigger('repair');
  if (!journeyMode && runStarted && onGround && !crashed) contextualHints.trigger('runwayControls');
  if (!runStarted || onGround || crashed) return;
  const altitude = altitudeAboveTerrain();
  if (altitude >= 80 && currentSpeed >= currentAircraft.takeoffSpeed * 1.2 && boostMeter > 8) contextualHints.trigger('boost');
}

function updateProgressHud(): void {
  creditsElement.textContent = credits.toLocaleString();
  creditsElement.title = `${credits.toLocaleString()} Credits`;
}

function showProgressMessage(message: string): void {
  progressMessageElement.textContent = playerFacingText(message);
  progressMessageElement.classList.remove('hidden');
  window.clearTimeout(progressMessageTimer);
  progressMessageTimer = window.setTimeout(() => progressMessageElement.classList.add('hidden'), 1400);
}

const gameplayFeedback = new GameplayFeedbackSystem(document.querySelector<HTMLElement>('#gameplay-feedback')!);
let lastAtcCalloutAt = -20_000;
const atcCalloutKeys = new Map<string, number>();
function queueAtcCallout(key: string, primaryText: string, secondaryText?: string): void {
  if(guidedTutorialActive || missionFocus)return;
  const now = performance.now();
  if (now - lastAtcCalloutAt < 6_000 || now - (atcCalloutKeys.get(key) ?? -30_000) < 20_000) return;
  lastAtcCalloutAt = now;
  atcCalloutKeys.set(key, now);
  if (atcCalloutKeys.size > 12) {
    const oldest = [...atcCalloutKeys.entries()].sort((left, right) => left[1] - right[1])[0];
    if (oldest) atcCalloutKeys.delete(oldest[0]);
  }
  gameplayFeedback.push({ type: 'atc', primaryText, secondaryText, intensity: 'small' });
}
function showRewardFeedback(creditDelta: number, scoreDelta: number): void {
  if (!cityRules.progressionEnabled) return;
  if (creditDelta <= 0 && scoreDelta <= 0) return;
  rewardFeedbackElement.textContent = formatRewardFeedback(creditDelta, scoreDelta);
  audioManager.playReward();
  const wasHidden = rewardFeedbackElement.classList.contains('hidden');
  window.clearTimeout(rewardHideTimer);
  window.clearTimeout(rewardRemoveTimer);
  rewardFeedbackElement.classList.remove('hidden');
  if (wasHidden) {
    rewardFeedbackElement.classList.remove('show');
    void rewardFeedbackElement.offsetWidth;
  }
  rewardFeedbackElement.classList.add('show');
  rewardHideTimer = window.setTimeout(() => {
    rewardFeedbackElement.classList.remove('show');
    rewardRemoveTimer = window.setTimeout(() => {
      rewardFeedbackElement.classList.add('hidden');
    }, 220);
  }, 1400);
}
function queueRewardFeedback(creditDelta = 0, scoreDelta = 0): void {
  if (creditDelta > 0) {
    showRewardFeedback(Math.round(creditDelta), Math.max(0, Math.round(scoreDelta)));
    return;
  }
  rewardBatchScore += Math.max(0, Math.round(scoreDelta));
  if (!rewardBatchScore || rewardBatchTimer !== undefined) return;
  rewardBatchTimer = window.setTimeout(() => {
    rewardBatchTimer = undefined;
    const score = rewardBatchScore;
    rewardBatchScore = 0;
    showRewardFeedback(0, score);
  }, 180);
}

let skyChallenges: SkyChallengeSystem | undefined;
let journeyGates: JourneyGateSystem | undefined;
let journeyGateMissionId = '';
let journeyTooHighUntil = 0;
let journeyTooHighGate = -1;
let stuntCombo: StuntComboSystem | undefined;
const stuntFrame: StuntFrame = {
  delta: 0, airborne: false, position: airplane.position, altitude: 0, speed: 0,
  maxSpeed: 0, stallSpeed: 0, verticalSpeed: 0, roll: 0, aircraftType,
};
let discoverySystem: DiscoverySystem | undefined;
let cityEvent: NetworkCityEvent | null = null;
let joinedEventId: string | null = null;
let skippedEventId: string | null = null;
let kingPlayerId: string | undefined;
const formationMembers = new Set<string>();
const territoryDefinitions = territoriesForCity(cityId);
const territoryState = new Map<string, NetworkTerritoryState>();
const neutralTerritoryColor: string = territoryOwnershipColors.neutral;
function ownedTerritoriesForPlayer(playerId: string): Array<{ name: string; color: string }> {
  const owned: Array<{ name: string; color: string }> = [];
  for (const definition of territoryDefinitions) {
    if (territoryState.get(definition.id)?.controllerId !== playerId) continue;
    owned.push({ name: definition.displayName, color: definition.fixedColor });
  }
  return owned;
}
function primaryTerritoryColorForPlayer(playerId: string): string | undefined {
  // One deterministic accent per human prevents multi-territory rainbow clutter.
  for (const definition of territoryDefinitions) if (territoryState.get(definition.id)?.controllerId === playerId) return definition.fixedColor;
  return undefined;
}
let weeklyLeaderboards: NetworkWeeklyLeaderboard[] = [];

const territoryCurtainHeight = TERRITORY_WALL_HEIGHT_METERS;
const territoryWallFadeStart = 5_500;
const territoryWallCullDistance = 10_000;
const territoryWallVertexShader = `
  attribute float layer;
  attribute float verticalFade;
  attribute float emphasis;
  varying vec3 vColor;
  varying float vLayer;
  varying float vVerticalFade;
  varying float vEmphasis;
  varying float vDistance;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vColor = color;
    vLayer = layer;
    vVerticalFade = verticalFade;
    vEmphasis = emphasis;
    vDistance = distance(worldPosition.xz, cameraPosition.xz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;
const territoryWallFragmentShader = `
  uniform float curtainAlpha;
  uniform float haloAlpha;
  uniform float coreAlpha;
  uniform float fadeStart;
  uniform float fadeEnd;
  uniform float globalOpacity;
  varying vec3 vColor;
  varying float vLayer;
  varying float vVerticalFade;
  varying float vEmphasis;
  varying float vDistance;
  void main() {
    float distanceAlpha = 1.0 - smoothstep(fadeStart, fadeEnd, vDistance);
    float alpha = vLayer < 0.5 ? curtainAlpha * vVerticalFade : (vLayer < 1.5 ? haloAlpha : coreAlpha);
    alpha *= distanceAlpha * vEmphasis * globalOpacity;
    if (alpha < 0.003) discard;
    float brightness = vLayer < 0.5 ? 0.95 : (vLayer < 1.5 ? 1.15 : 1.35);
    gl_FragColor = vec4(vColor * brightness, alpha);
  }
`;
function createTerritoryWallMaterial(pulse = false): THREE.ShaderMaterial {
  const dusk = worldTimeOfDay === 'dusk';
  return new THREE.ShaderMaterial({
    uniforms: {
      curtainAlpha: { value: pulse ? 0.18 : dusk ? 0.38 : 0.3 },
      haloAlpha: { value: pulse ? 0.5 : dusk ? 0.42 : 0.34 },
      coreAlpha: { value: pulse ? 0.7 : 0.9 },
      fadeStart: { value: territoryWallFadeStart },
      fadeEnd: { value: territoryWallCullDistance },
      globalOpacity: { value: pulse ? 0 : 1 },
    },
    vertexShader: territoryWallVertexShader,
    fragmentShader: territoryWallFragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
const territoryWallMaterial = createTerritoryWallMaterial();
const territoryPulseMaterial = createTerritoryWallMaterial(true);
const territoryLabelLayer = document.createElement('div');
territoryLabelLayer.className = 'territory-world-labels';
document.querySelector('#game-root')!.append(territoryLabelLayer);
const territoryLabelProjection = new THREE.Vector3();

function createTerritoryWallGeometry(definition: CityTerritory): THREE.BufferGeometry {
  const positions: number[] = [];
  const layers: number[] = [];
  const verticalFades: number[] = [];
  const emphases: number[] = [];
  const colors: number[] = [];
  const initialColor = new THREE.Color(neutralTerritoryColor);
  const pushVertex = (x: number, y: number, z: number, layer: number, verticalFade = 1): void => {
    positions.push(x, y, z);
    layers.push(layer);
    verticalFades.push(verticalFade);
    emphases.push(1);
    colors.push(initialColor.r, initialColor.g, initialColor.b);
  };
  const { minX, maxX, minZ, maxZ } = definition.bounds;
  const corners: Array<[number, number]> = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ]];
  for (const [width, layer] of [[72, 1], [14, 2]] as const) {
    for (let edge = 0; edge < 4; edge += 1) {
      const [x0, z0] = corners[edge], [x1, z1] = corners[edge + 1];
      const length = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.max(1, Math.ceil(length / 90));
      const nx = -(z1 - z0) / length * width * 0.5;
      const nz = (x1 - x0) / length * width * 0.5;
      for (let step = 0; step < steps; step += 1) {
        const a = step / steps, b = (step + 1) / steps;
        const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a;
        const bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
        const lift = layer === 2 ? 1.7 : 1.5;
        pushVertex(ax + nx, groundPlaneY(ax + nx, az + nz) + lift, az + nz, layer);
        pushVertex(ax - nx, groundPlaneY(ax - nx, az - nz) + lift, az - nz, layer);
        pushVertex(bx + nx, groundPlaneY(bx + nx, bz + nz) + lift, bz + nz, layer);
        pushVertex(ax - nx, groundPlaneY(ax - nx, az - nz) + lift, az - nz, layer);
        pushVertex(bx - nx, groundPlaneY(bx - nx, bz - nz) + lift, bz - nz, layer);
        pushVertex(bx + nx, groundPlaneY(bx + nx, bz + nz) + lift, bz + nz, layer);
      }
    }
  }
  const height = TERRITORY_WALL_HEIGHT_METERS;
  for (let edge = 0; edge < 4; edge += 1) {
    const [x0, z0] = corners[edge], [x1, z1] = corners[edge + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 180));
    for (let step = 0; step < steps; step += 1) {
      const a = step / steps, b = (step + 1) / steps;
      const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a;
      const bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      const ay = groundPlaneY(ax, az) + 1.4, by = groundPlaneY(bx, bz) + 1.4;
      pushVertex(ax, ay, az, 0, 1); pushVertex(ax, ay + height, az, 0, 0); pushVertex(bx, by, bz, 0, 1);
      pushVertex(ax, ay + height, az, 0, 0); pushVertex(bx, by + height, bz, 0, 0); pushVertex(bx, by, bz, 0, 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('layer', new THREE.Float32BufferAttribute(layers, 1));
  geometry.setAttribute('verticalFade', new THREE.Float32BufferAttribute(verticalFades, 1));
  geometry.setAttribute('emphasis', new THREE.Float32BufferAttribute(emphases, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const territoryBorders = territoryDefinitions.map((definition) => {
  const wall = new THREE.Mesh(createTerritoryWallGeometry(definition), territoryWallMaterial);
  wall.name = `territory-wall-${definition.id}`;
  wall.renderOrder = 9;
  const label = document.createElement('div');
  const title = document.createElement('strong');
  const owner = document.createElement('span');
  label.className = 'territory-world-label';
  label.hidden = true;
  title.textContent = definition.displayName.toUpperCase();
  label.append(title, owner);
  territoryLabelLayer.append(label);
  scene.add(wall);
  return { definition, wall, label, owner, displayColor: neutralTerritoryColor, appearance: 'neutral' as TerritoryAppearance, missionTarget: false, pulseUntil: 0, styleSignature: '' };
});
const territoryPulseMesh = new THREE.Mesh(new THREE.BufferGeometry(), territoryPulseMaterial);
territoryPulseMesh.name = 'territory-wall-pulse';
territoryPulseMesh.renderOrder = 10;
territoryPulseMesh.visible = false;
scene.add(territoryPulseMesh);
let pulsingTerritory: (typeof territoryBorders)[number] | undefined;
let territoryBorderRefreshAt = 0;
function applyTerritoryBorderStyle(entry: (typeof territoryBorders)[number]): void {
  const signature = `${entry.displayColor}:${entry.appearance}:${entry.missionTarget}`;
  if (signature === entry.styleSignature) return;
  entry.styleSignature = signature;
  const colorAttribute = entry.wall.geometry.getAttribute('color') as THREE.BufferAttribute;
  const layerAttribute = entry.wall.geometry.getAttribute('layer') as THREE.BufferAttribute;
  const emphasisAttribute = entry.wall.geometry.getAttribute('emphasis') as THREE.BufferAttribute;
  const baseColor = new THREE.Color(entry.displayColor);
  const contestedColor = new THREE.Color(territoryOwnershipColors.contested);
  for (let index = 0; index < colorAttribute.count; index += 1) {
    const color = entry.appearance === 'contested' && layerAttribute.getX(index) >= 0.5 ? contestedColor : baseColor;
    colorAttribute.setXYZ(index, color.r, color.g, color.b);
    emphasisAttribute.setX(index, entry.missionTarget ? 1.3 : 1);
  }
  colorAttribute.needsUpdate = true;
  emphasisAttribute.needsUpdate = true;
}
function pulseTerritoryBoundary(territoryId: string): void {
  const entry = territoryBorders.find(({ definition }) => definition.id === territoryId);
  if (!entry) return;
  entry.pulseUntil = performance.now() + 1_400;
  pulsingTerritory = entry;
  territoryPulseMesh.geometry = entry.wall.geometry;
  territoryPulseMesh.visible = entry.wall.visible;
}
function refreshTerritoryBorders(): void {
  const active = serverProfile.missions[cityId]?.active;
  const mission = active && missionForCity(cityId, active.missionId);
  const missionTerritories = mission ? missionRequirements(mission, active) : [];
  for (const entry of territoryBorders) {
    const { definition } = entry;
    const state = territoryState.get(definition.id);
    const appearance: TerritoryAppearance = state?.contested ? 'contested' : !state?.controllerId ? 'neutral' : state.controllerId === localPlayerId ? 'own' : 'enemy';
    entry.appearance = appearance;
    entry.missionTarget = missionTerritories.includes(definition.id) || journeyAttempt?.missionId === journeyDallas04.id &&
      journeyAttempt.status !== 'COMPLETED' && definition.id === journeyDallas04.territoryId;
    entry.displayColor = state?.controllerId || entry.missionTarget ? definition.fixedColor : neutralTerritoryColor;
    applyTerritoryBorderStyle(entry);
    entry.owner.textContent = state?.contested ? 'CONTESTED' : state?.controllerId ? `Owned by ${state.controllerName ?? 'another pilot'}` : 'NEUTRAL';
    entry.label.style.setProperty('--territory-accent', entry.displayColor);
    entry.label.classList.toggle('mission', entry.missionTarget);
    entry.label.classList.toggle('journey-target', journeyAttempt?.missionId === journeyDallas04.id && definition.id === journeyDallas04.territoryId);
    entry.label.classList.toggle('contested', appearance === 'contested');
  }
}
function updateTerritoryBorderVisibility(now: number): void {
  if (now < territoryBorderRefreshAt) return;
  const activeBoundaryPulse = Boolean(pulsingTerritory && pulsingTerritory.pulseUntil > now);
  territoryBorderRefreshAt = now + (activeBoundaryPulse ? 80 : 500);
  for (const entry of territoryBorders) {
    const { definition, wall } = entry;
    const dx = Math.max(definition.bounds.minX - airplane.position.x, 0, airplane.position.x - definition.bounds.maxX);
    const dz = Math.max(definition.bounds.minZ - airplane.position.z, 0, airplane.position.z - definition.bounds.maxZ);
    const distanceSquared = dx * dx + dz * dz;
    const focusedWhiteRock = Boolean(missionFocus && journeyAttempt?.missionId === journeyDallas04.id && definition.id === journeyDallas04.territoryId);
    wall.visible = !territoryWallsQaDisabled && !guidedTutorialActive && (!missionFocus || focusedWhiteRock) &&
      distanceSquared < territoryWallCullDistance * territoryWallCullDistance;
  }
  if (pulsingTerritory && pulsingTerritory.pulseUntil > now) {
    const remaining = (pulsingTerritory.pulseUntil - now) / 1_400;
    territoryPulseMaterial.uniforms.globalOpacity.value = Math.max(0, remaining) * (0.72 + Math.sin(now * 0.018) * 0.22);
    territoryPulseMesh.visible = pulsingTerritory.wall.visible;
  } else {
    territoryPulseMesh.visible = false;
    pulsingTerritory = undefined;
  }
}

function updateTerritoryLabels(): void {
  if (missionFocus?.showUnrelatedTerritoryLabels === false) {
    for (const entry of territoryBorders) entry.label.hidden = true;
    return;
  }
  let first = -1, second = -1, firstPriority = Infinity, secondPriority = Infinity;
  for (let index = 0; index < territoryBorders.length; index += 1) {
    const entry = territoryBorders[index];
    const dx = entry.definition.center.x - airplane.position.x;
    const dz = entry.definition.center.z - airplane.position.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared > 7_000 * 7_000 || !entry.wall.visible) continue;
    const priority = entry.missionTarget ? distanceSquared * 0.25 : distanceSquared;
    if (priority < firstPriority) { second = first; secondPriority = firstPriority; first = index; firstPriority = priority; }
    else if (priority < secondPriority) { second = index; secondPriority = priority; }
  }
  for (let index = 0; index < territoryBorders.length; index += 1) {
    const entry = territoryBorders[index];
    if (index !== first && index !== second) { entry.label.hidden = true; continue; }
    territoryLabelProjection.set(entry.definition.center.x,
      groundPlaneY(entry.definition.center.x, entry.definition.center.z) + Math.min(900, Math.max(450, (entry.definition.boundaryHeight ?? territoryCurtainHeight) * 0.22)),
      entry.definition.center.z).project(camera);
    const x = (territoryLabelProjection.x + 1) * window.innerWidth * 0.5;
    const y = (1 - territoryLabelProjection.y) * window.innerHeight * 0.5;
    const nearReticle = Math.hypot(x - lockCircleCenterX, y - lockCircleCenterY) < lockCircleRadius + 95;
    entry.label.hidden = territoryLabelProjection.z < -1 || territoryLabelProjection.z > 1 ||
      Math.abs(territoryLabelProjection.x) > 0.92 || Math.abs(territoryLabelProjection.y) > 0.88 || nearReticle || navigationBeacons.isHudArea(x, y) ||
      (selectedCombatTarget !== null && Math.hypot(x - window.innerWidth * 0.5, y - window.innerHeight * 0.5) < 260);
    if (!entry.label.hidden) entry.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}

function applyTerritoryState(states: readonly NetworkTerritoryState[]): void {
  territoryState.clear();
  for (const state of states) territoryState.set(state.id, state);
  if (journeyAttempt?.missionId === journeyDallas04.id) {
    syncTerritoryObjective();
    if (selectedCombatTarget?.remote.isBot && unrelatedFocusedBot(selectedCombatTarget.remote.playerId)) clearCombatTarget();
  }
  if (territoryDefenseAlertId) {
    const attacked = territoryState.get(territoryDefenseAlertId);
    if (!attacked || attacked.controllerId !== localPlayerId || (!attacked.contested && !attacked.capturingPlayerId)) {
      territoryDefenseAlertId = null;
      territoryDefenseAlertElement.classList.add('hidden');
    }
  }
  refreshTerritoryBorders();
  for (const remote of remotePlayers.values()) {
    if (remote.ownershipSignature !== ownedTerritoriesForPlayer(remote.playerId).map(({ color }) => color).join('|')) refreshPlayerIdentityTag(remote);
  }
  playersPanel.update([...cityHumanRoster.values()], localPlayerId, ownedTerritoriesForPlayer);
  cityTerritoriesPanel.update(cityTerritoryEntries(), localPlayerId);
  updateCaptureHud();
  updateMissionHud();
  refreshPilotMenu();
}

function updateCaptureHud(): void {
  const capturing = localPlayerId ? territoryDefinitions.find((definition) => {
    const state = territoryState.get(definition.id);
    return state?.capturingPlayerId === localPlayerId &&
      territoryContains(definition, airplane.position);
  }) : undefined;
  territoryCaptureElement.classList.toggle('hidden', !capturing || Boolean(missionFocus) || journeyAttempt?.missionId === journeyDallas04.id);
  if (capturing) {
    const state = territoryState.get(capturing.id);
    const text = `${capturing.displayName.toUpperCase()} · CAPTURING ${Math.min(100, Math.max(0, state?.captureProgress ?? 0))}%${state?.defenderBotId ? '\n⚠ DEFENDER INBOUND' : ''}`;
    if (territoryCaptureElement.textContent !== text) territoryCaptureElement.textContent = text;
  }
}

function cityTerritoryEntries(): CityTerritoryEntry[] {
  return territoryDefinitions.map((definition) => {
    const state = territoryState.get(definition.id);
    return {
      name: definition.displayName, color: definition.fixedColor,
      controllerId: state?.controllerId, controllerName: state?.controllerName,
      contested: state?.contested ?? false,
    };
  });
}

function territoryDefinition(id: string): CityTerritory | undefined {
  return territoryDefinitions.find((territory) => territory.id === id);
}

function focusedWhiteRockDefenderId(): string | null {
  if (!journeyAttempt || journeyAttempt.missionId !== journeyDallas04.id ||
    (journeyAttempt.status !== 'APPROACH' && journeyAttempt.status !== 'RACING')) return null;
  const state = territoryState.get(journeyDallas04.territoryId);
  return state?.defenderBotId ?? null;
}

function whiteRockGuidance() {
  if (!journeyAttempt || journeyAttempt.missionId !== journeyDallas04.id ||
    (journeyAttempt.status !== 'APPROACH' && journeyAttempt.status !== 'RACING')) return null;
  const definition = territoryDefinition(journeyDallas04.territoryId);
  if (!definition) return null;
  const state = territoryState.get(definition.id);
  const inside = territoryContains(definition, airplane.position);
  const owned = Boolean(localPlayerId && state?.controllerId === localPlayerId);
  if (inside && owned) territoryControlSeenAttemptId = journeyAttempt.attemptId;
  const capture = state?.capturingPlayerId === localPlayerId ? state.captureProgress : 0;
  const defenderId = focusedWhiteRockDefenderId();
  const defender = defenderId ? remotePlayers.get(defenderId) : undefined;
  const defenderVisible = Boolean(defender?.isBot && defender.lifeState === 'alive' && defender.timeSinceUpdate <= remoteStateStaleSeconds);
  return {
    definition, state, capture, defender,
    ...territoryGuidance(onGround, inside, owned, state?.captureContested === true, capture,
      defenderId ?? undefined, defenderVisible, territoryControlSeenAttemptId === journeyAttempt.attemptId),
  };
}

function updateSocialHud(): void {
  const inFormation = localPlayerId !== null && formationMembers.has(localPlayerId);
  formationStatusElement.textContent = inFormation ? 'FORMATION' : kingPlayerId === localPlayerId ? '♛ KING OF THE SKY' : 'SOCIAL SKY';
}

function applySocialState(state: NetworkSocialState | undefined): void {
  kingPlayerId = state?.kingPlayerId;
  refreshAllPlayerIdentityTags();
  updateSocialHud();
}

function updateSkyChallengeHud(): void {
  if (journeyMode) { updateJourneyHud(); return; }
  const challenge = skyChallenges?.getHud() ?? null;
  skyChallengeElement.classList.toggle('hidden', challenge === null);
  if (!challenge) return;
  skyChallengeElement.textContent = `${challenge.name} · GATE ${challenge.gate}/${challenge.total} · COMBO x${challenge.combo} · ${Math.ceil(challenge.timeRemaining)}s`;
}

function updateJourneyHud(): void {
  skyChallengeElement.classList.add('journey-hud');
  skyChallengeElement.classList.toggle('hidden', journeyAttempt?.status === 'COMPLETED' || journeyAttempt?.status === 'FAILED' || journeyAttempt?.status === 'ABANDONED');
  const dfwMission = journeyAttempt?.missionId === journeyDallas01.id;
  const whiteRockMission = journeyAttempt?.missionId === journeyDallas03.id;
  const precisionMission = journeyAttempt?.missionId === journeyDallas05.id;
  const championshipMission = journeyAttempt?.missionId === journeyDallas06.id;
  const elevatorMission = journeyAttempt?.missionId === journeyDallas07.id;
  skyChallengeElement.classList.toggle('journey-championship', championshipMission);
  for (const item of [journeyHudTarget, journeyHudTimer]) if (item) item.hidden = !dfwMission && !whiteRockMission && !precisionMission && !championshipMission && !elevatorMission;
  if (journeyHudHint) journeyHudHint.hidden = !dfwMission;
  if (!journeyAttempt) {
    if (journeyHudHeading) journeyHudHeading.textContent = 'MISSION · CONNECTING';
    if (journeyHudObjective) journeyHudObjective.textContent = 'CONNECTING TO MISSION';
    if (journeyHudProgress) journeyHudProgress.textContent = '';
    const segments = skyChallengeElement.querySelector<HTMLElement>('.journey-hud-segments');
    if (segments) segments.hidden = true;
    if (journeyHudEnemy) journeyHudEnemy.hidden = true;
    return;
  }
  const hunterMission = journeyAttempt?.missionId === 'journey-dallas-02';
  const territoryMission = journeyAttempt.missionId === journeyDallas04.id;
  if (journeyHudHeading) journeyHudHeading.textContent = elevatorMission ? 'MISSION 07 · SKY ELEVATOR' : championshipMission ? 'MISSION 06 · ROOKIE CHAMPIONSHIP' : precisionMission ? 'MISSION 05 · DOWNTOWN NEEDLE' : territoryMission ? 'MISSION 04 · CLAIM THE SKIES' : hunterMission ? 'MISSION 02 · HUNTER SHOWDOWN'
    : whiteRockMission ? 'MISSION 03 · WHITE ROCK SKIMMER' : 'MISSION 01 · DFW SKY RUSH';
  const segments = skyChallengeElement.querySelector<HTMLElement>('.journey-hud-segments');
  if (segments) segments.hidden = hunterMission || territoryMission;
  if (journeyHudEnemy) journeyHudEnemy.hidden = !hunterMission && !territoryMission;
  if (territoryMission) {
    const guidance = whiteRockGuidance();
    if (!guidance) return;
    const hold = Math.min(30, Math.floor((journeyAttempt.holdMs ?? 0) / 1_000));
    if (journeyHudObjective) journeyHudObjective.textContent = guidance.instruction;
    if (journeyHudProgress) journeyHudProgress.textContent = guidance.target === 'territory'
      ? `TARGET: WHITE ROCK · ${formatObjectiveDistance(Math.hypot(airplane.position.x - guidance.definition.center.x, airplane.position.z - guidance.definition.center.z) * WORLD_METERS_PER_UNIT)}`
      : guidance.phase === 'BLOCKED' ? `CAPTURE: ${Math.round(guidance.capture)}% · BLOCKED`
        : guidance.phase === 'CONTESTED' ? guidance.state?.controllerId === localPlayerId
          ? `HOLD: ${hold}/30 SEC · PAUSED` : `CAPTURE: ${Math.round(guidance.capture)}% · PAUSED`
          : guidance.phase === 'DEFENDING' ? `HOLD: ${hold}/30 SEC` : `CAPTURE: ${Math.round(guidance.capture)}%`;
    if (journeyHudTarget) {
      journeyHudTarget.hidden = guidance.phase !== 'BLOCKED';
      journeyHudTarget.textContent = guidance.phase === 'BLOCKED' ? `TARGET: DEFENDER · ${guidance.defender && guidance.target === 'defender'
        ? formatObjectiveDistance(airplane.position.distanceTo(guidance.defender.plane.position) * WORLD_METERS_PER_UNIT) : 'LOCATING'}` : '';
    }
    if (journeyHudEnemy) journeyHudEnemy.style.setProperty('--enemy-health', `${guidance.phase === 'DEFENDING' ||
      guidance.phase === 'CONTESTED' && guidance.state?.controllerId === localPlayerId
      ? journeyAttempt.holdMs / journeyDallas04.holdMs * 100 : guidance.capture}%`);
    return;
  }
  if (hunterMission) {
    const target = journeyAttempt?.targetId ? remotePlayers.get(journeyAttempt.targetId) : undefined;
    const distance = target?.lifeState === 'alive' ? Math.round(target.plane.position.distanceTo(airplane.position)) : null;
    let direction = '';
    if (target?.lifeState === 'alive') {
      const dx = target.plane.position.x - airplane.position.x;
      const dz = target.plane.position.z - airplane.position.z;
      const forward = -dx * Math.sin(airplane.rotation.y) - dz * Math.cos(airplane.rotation.y);
      const right = dx * Math.cos(airplane.rotation.y) - dz * Math.sin(airplane.rotation.y);
      direction = forward > Math.abs(right) ? 'AHEAD' : forward < -Math.abs(right) ? 'BEHIND' : right > 0 ? 'RIGHT' : 'LEFT';
    }
    const hp = Math.max(0, Math.min(200, journeyAttempt?.targetHealth ?? 200));
    const engaged = journeyAttempt.targetEngaged === true;
    const outsideDallas = Math.abs(airplane.position.x - journeyDallas02.arenaCenter.x) > journeyDallas02.arenaRadius ||
      Math.abs(airplane.position.z - journeyDallas02.arenaCenter.z) > journeyDallas02.arenaRadius;
    const nearDallasEdge = Math.abs(airplane.position.x - journeyDallas02.arenaCenter.x) > journeyDallas02.arenaRadius - 5_000 ||
      Math.abs(airplane.position.z - journeyDallas02.arenaCenter.z) > journeyDallas02.arenaRadius - 5_000;
    if (journeyHudObjective) journeyHudObjective.textContent = outsideDallas ? 'RETURN TO DALLAS TO REJOIN THE FIGHT'
      : journeyAttempt.status === 'APPROACH' ? onGround ? 'TAKE OFF TO BEGIN' : 'CLIMB CLEAR OF THE RUNWAY'
      : nearDallasEdge ? 'TURN BACK TOWARD DALLAS'
      : engaged ? 'DESTROY THE MARKED HUNTER' : distance !== null && distance > 5_000
        ? 'FOLLOW THE GOLD ARROW TO THE HUNTER' : 'LOCK OR HIT THE MARKED HUNTER';
    if (journeyHudProgress) journeyHudProgress.textContent = journeyAttempt?.status === 'APPROACH' && !outsideDallas
      ? 'TARGET: HUNTER · ENEMY HP: 200/200 · STATUS: PREPARING'
      : `TARGET: HUNTER · ENEMY HP: ${hp}/200 · ${distance === null ? 'DISTANCE: LOCATING' : `${distance.toLocaleString()}m ${direction}`} · STATUS: ${outsideDallas ? 'RETURN TO DALLAS' : engaged ? 'ENGAGED' : 'LOCATING'}`;
    if (journeyHudEnemy) journeyHudEnemy.style.setProperty('--enemy-health', `${hp / 2}%`);
    return;
  }
  const gateIndex = journeyAttempt?.gateIndex ?? 0;
  const racing = journeyAttempt?.status === 'RACING';
  const timeLeft = racing && journeyAttempt?.deadlineAt
    ? Math.max(0, Math.ceil((journeyAttempt.deadlineAt - Date.now() - journeyServerTimeOffset) / 1000)) : null;
  const target = journeyGates?.target();
  const distance = target ? Math.round(Math.hypot(airplane.position.x - target.x, airplane.position.y - target.y, airplane.position.z - target.z)) : 0;
  if (elevatorMission && target) {
    const gate = journeyDallas07.gates[gateIndex];
    const heightDifference = target.y - airplane.position.y;
    const distanceMeters = distance * WORLD_METERS_PER_UNIT;
    const cleared = gateIndex > 0 && performance.now() < journeyGateClearedUntil;
    const clearOfRunway = altitudeAboveTerrain() >= 80 && currentSpeed >= currentAircraft.takeoffSpeed * 1.2;
    if (elevatorDepartureAttemptId !== journeyAttempt.attemptId) {
      elevatorDepartureAttemptId = journeyAttempt.attemptId;
      elevatorDepartureTurnSide = null;
    }
    const bearing = precisionGateBearing(airplane.position.x, airplane.position.z, airplane.rotation.y, target.x, target.z);
    elevatorDepartureTurnSide = clearOfRunway
      ? climbDepartureTurnSide(gateIndex + 1, onGround, bearing.angle, elevatorDepartureTurnSide) : null;
    if (journeyHudObjective) journeyHudObjective.textContent = climbGateInstruction(gateIndex + 1, onGround,
      distanceMeters, heightDifference, gate.radius, currentSpeed, currentAircraft.takeoffSpeed, cleared, elevatorDepartureTurnSide, clearOfRunway);
    if (journeyHudProgress) journeyHudProgress.textContent = `GATES: ${gateIndex}/4`;
    if (journeyHudTarget) journeyHudTarget.textContent = `NEXT: GATE ${gateIndex + 1} · ${formatObjectiveDistance(distanceMeters)} · ${heightDifference > 0 ? '↑' : '↓'} ${Math.round(Math.abs(heightDifference) * METERS_TO_FEET).toLocaleString()} FT`;
    if (journeyHudTimer) journeyHudTimer.textContent = timeLeft === null ? 'TIMER: NOT STARTED'
      : `TIME LEFT: ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    journeyHudSegments.forEach((segment, index) => segment.classList.toggle('is-cleared', index < gateIndex));
    return;
  }
  if (championshipMission) {
    if (journeyAttempt.phase === 'LANDING') {
      const airport = airports.find(item => item.id === journeyDallas06.finishAirportId);
      if (!airport) return;
      const dx = airplane.position.x - airport.x;
      const dz = airplane.position.z - airport.z;
      const lateral = Math.abs(dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading));
      const headingDifference = Math.atan2(Math.sin(airplane.rotation.y - airport.heading), Math.cos(airplane.rotation.y - airport.heading));
      const headingError = Math.min(Math.abs(headingDifference), Math.PI - Math.abs(headingDifference));
      const runwayDistance = Math.hypot(dx, dz) * WORLD_METERS_PER_UNIT;
      const approachAligned = lateral < Math.max(airport.runwayWidth * 4, 180) && headingError < 0.5;
      if (journeyHudObjective) journeyHudObjective.textContent = performance.now() < championshipLandingNoticeUntil
        ? 'GATES COMPLETE — HEAD TO DFW' : runwayDistance < 1_300 && approachAligned
          ? 'LAND SMOOTHLY TO WIN' : runwayDistance < 3_000 ? 'LINE UP WITH THE RUNWAY' : 'FOLLOW THE GOLD ARROW TO DFW';
      if (journeyHudProgress) journeyHudProgress.textContent = 'GATES: 6/6 COMPLETE · LANDING REQUIRED';
      if (journeyHudTarget) journeyHudTarget.textContent = `DFW RUNWAY · ${formatObjectiveDistance(runwayDistance)}`;
      if (journeyHudTimer) journeyHudTimer.textContent = 'RACE: FINISHED · LANDING UNTIMED';
    } else {
      const gate = journeyDallas06.gates[gateIndex];
      const distanceMeters = distance * WORLD_METERS_PER_UNIT;
      const heightError = target ? target.y - airplane.position.y : 0;
      const nearGate = distanceMeters < Math.max(210, (gate?.radius ?? 70) * 3);
      const cleared = gateIndex > 0 && performance.now() < journeyGateClearedUntil;
      if (journeyHudObjective) journeyHudObjective.textContent = cleared ? `GATE ${gateIndex} CLEARED!`
        : onGround ? 'TAKE OFF — FOLLOW THE GOLD ARROW'
          : nearGate && heightError > (gate?.radius ?? 70) * .6 ? `GATE ${gateIndex + 1} ABOVE — CLIMB`
            : nearGate && heightError < -(gate?.radius ?? 70) * .6 ? `GATE ${gateIndex + 1} BELOW — DESCEND`
              : nearGate ? `FLY THROUGH GATE ${gateIndex + 1}` : `FOLLOW THE GOLD ARROW TO GATE ${gateIndex + 1}`;
      if (journeyHudProgress) journeyHudProgress.textContent = `GATES: ${gateIndex}/6`;
      if (journeyHudTarget) journeyHudTarget.textContent = `NEXT: GATE ${gateIndex + 1} · ${formatObjectiveDistance(distanceMeters)}`;
      if (journeyHudTimer) journeyHudTimer.textContent = timeLeft === null ? 'TIMER: NOT STARTED'
        : `TIME LEFT: ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    }
    journeyHudSegments.forEach((segment, index) => segment.classList.toggle('is-cleared', index < gateIndex));
    return;
  }
  if (dfwMission) {
    const distanceMeters = target ? distance * WORLD_METERS_PER_UNIT : 0;
    const cleared = gateIndex > 0 && performance.now() < journeyGateClearedUntil;
    if (journeyHudObjective) journeyHudObjective.textContent = cleared ? `GATE ${gateIndex} CLEARED!`
      : onGround ? 'TAKE OFF AND FOLLOW THE GOLD ARROW'
        : distanceMeters <= 200 ? `FLY THROUGH THE GLOWING GATE ${gateIndex + 1}`
          : gateIndex === 0 ? 'FOLLOW THE GOLD ARROW TO GATE 1' : `FOLLOW THE ARROW TO GATE ${gateIndex + 1}`;
    if (journeyHudProgress) journeyHudProgress.textContent = cleared ? `${gateIndex}/4 COMPLETE` : `GATES: ${gateIndex}/4`;
    if (journeyHudTarget) journeyHudTarget.textContent = `GATE ${gateIndex + 1} · ${formatObjectiveDistance(distanceMeters)}`;
    if (journeyHudTimer) journeyHudTimer.textContent = timeLeft === null ? 'TIMER STARTS AT GATE 1'
      : `TIME LEFT: ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    if (journeyHudHint) {
      journeyHudHint.hidden = !contextualHints.isEnabled() || !missionObjectiveGuidance?.hintVisible;
      journeyHudHint.textContent = journeyHudHint.hidden ? '' : `FOLLOW THE GOLD ARROW TO FIND GATE ${gateIndex + 1}`;
    }
    journeyHudSegments.forEach((segment, index) => segment.classList.toggle('is-cleared', index < gateIndex));
    return;
  }
  if (whiteRockMission) {
    const gate = journeyDallas03.gates[gateIndex];
    if (!gate || !target) return;
    const distanceMeters = distance * WORLD_METERS_PER_UNIT;
    const altitudeAgl = airplane.position.y - (target.y - gate.altitude);
    const timeLabel = timeLeft === null ? 'NOT STARTED' : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    const cleared = gateIndex > 0 && performance.now() < journeyGateClearedUntil;
    const rejectedTooHigh = journeyTooHighGate === gateIndex && Date.now() < journeyTooHighUntil;
    if (journeyHudObjective) journeyHudObjective.textContent = lowAltitudeGateInstruction(
      gateIndex + 1, onGround, distanceMeters, altitudeAgl, gate.maxAltitude, rejectedTooHigh, cleared);
    if (journeyHudProgress) journeyHudProgress.textContent = `GATES: ${gateIndex}/4 · TIME: ${timeLabel}`;
    if (journeyHudTarget) journeyHudTarget.textContent = `NEXT: GATE ${gateIndex + 1} · ${formatObjectiveDistance(distanceMeters)}`;
    if (journeyHudTimer) journeyHudTimer.textContent = `MAX ALT: ${Math.round(gate.maxAltitude * METERS_TO_FEET).toLocaleString()} FT AGL`;
    journeyHudSegments.forEach((segment, index) => segment.classList.toggle('is-cleared', index < gateIndex));
    return;
  }
  if (precisionMission && target) {
    const bearing = precisionGateBearing(airplane.position.x, airplane.position.z, airplane.rotation.y, target.x, target.z);
    const now = performance.now();
    const guidance = precisionGateGuidance(gateIndex + 1, onGround, distance * WORLD_METERS_PER_UNIT,
      bearing.horizontalDistance, target.y - airplane.position.y, journeyDallas05.gates[gateIndex].radius,
      bearing.angle, precisionTurnSide, gateIndex > 0 && now < journeyGateClearedUntil,
      gateIndex === 3 && now < precisionSharpTurnUntil);
    precisionTurnSide = guidance.turnSide;
    if (journeyHudObjective) journeyHudObjective.textContent = guidance.instruction;
    if (journeyHudProgress) journeyHudProgress.textContent = `GATES: ${gateIndex}/4`;
    if (journeyHudTarget) journeyHudTarget.textContent = `NEXT: GATE ${gateIndex + 1} · ${formatObjectiveDistance(distance * WORLD_METERS_PER_UNIT)}`;
    if (journeyHudTimer) journeyHudTimer.textContent = timeLeft === null ? 'TIMER: NOT STARTED'
      : `TIME LEFT: ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
    journeyHudSegments.forEach((segment, index) => segment.classList.toggle('is-cleared', index < gateIndex));
    return;
  }
  if (journeyHudObjective) journeyHudObjective.textContent = racing ? 'PASS THROUGH THE NEXT GLOWING GATE' : 'TAKE OFF AND REACH GATE 1';
  const timeLabel = timeLeft === null ? 'NOT STARTED' : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
  if (journeyHudProgress) journeyHudProgress.textContent = `GATES ${gateIndex}/4 · TIME ${timeLabel} · NEXT ${gateIndex < 4 ? `GATE ${gateIndex + 1} · ${distance.toLocaleString()}m` : 'FINISH'}`;
  journeyHudSegments.forEach((segment, index) => segment.classList.toggle('is-cleared', index < gateIndex));
}

function showJourneyResult(attempt: JourneyAttemptState): void {
  if (attempt.status !== 'COMPLETED' && attempt.status !== 'FAILED' && attempt.status !== 'ABANDONED') return;
  const success = attempt.status === 'COMPLETED';
  const hunterMission = attempt.missionId === 'journey-dallas-02';
  const whiteRockMission = attempt.missionId === journeyDallas03.id;
  const territoryMission = attempt.missionId === journeyDallas04.id;
  const precisionMission = attempt.missionId === journeyDallas05.id;
  const championshipMission = attempt.missionId === journeyDallas06.id;
  const elevatorMission = attempt.missionId === journeyDallas07.id;
  clearHeldActions();
  boostActive = false;
  journeyGates?.setProgress(attempt.gateIndex, false);
  crashOverlay.classList.add('hidden');
  flightRecapElement.hidden = true;
  journeyResultElement.classList.remove('hidden');
  journeyResultElement.classList.toggle('is-success', success);
  journeyResultElement.querySelector<HTMLElement>('[data-journey-result-heading]')!.textContent = elevatorMission ? 'MISSION 07 · CHAPTER 2' : championshipMission ? 'MISSION 06 · CHAPTER 1 FINALE' : `MISSION ${precisionMission ? '05' : territoryMission ? '04' : whiteRockMission ? '03' : hunterMission ? '02' : '01'} · ROOKIE LEAGUE`;
  journeyResultElement.querySelector<HTMLElement>('[data-journey-result-name]')!.textContent = elevatorMission ? 'SKY ELEVATOR' : championshipMission ? 'ROOKIE CHAMPIONSHIP' : precisionMission ? 'DOWNTOWN NEEDLE' : territoryMission ? 'CLAIM THE SKIES' : whiteRockMission ? 'WHITE ROCK SKIMMER' : hunterMission ? 'HUNTER SHOWDOWN' : 'DFW SKY RUSH';
  journeyResultElement.querySelector<HTMLElement>('[data-journey-result-title]')!.textContent = success
    ? championshipMission ? 'CHAPTER 1 COMPLETE!' : attempt.firstClearCredits > 0 ? 'MISSION COMPLETE!' : 'MISSION COMPLETED'
    : championshipMission && attempt.failureReason === 'LANDING_TOO_ROUGH' ? 'LANDING TOO ROUGH' : 'MISSION FAILED';
  const finishSeconds = Math.max(0, (attempt.finishTimeMs ?? 0) / 1000);
  journeyResultElement.querySelector<HTMLElement>('[data-journey-result-detail]')!.textContent = success
    ? championshipMission ? `6/6 GATES CLEARED · LANDING: ${attempt.landingGrade ?? 'VERIFIED'} · RACE TIME: ${Math.floor(finishSeconds / 60)}:${String(Math.floor(finishSeconds % 60)).padStart(2, '0')}.${Math.floor(finishSeconds % 1 * 10)}`
      : territoryMission ? 'WHITE ROCK CONTROLLED · 30 SECONDS DEFENDED'
      : hunterMission ? 'AI HUNTER DESTROYED · 200 HP DEFEATED'
      : `4/4 GATES CLEARED · FINISH TIME: ${Math.floor(finishSeconds / 60)}:${String(Math.floor(finishSeconds % 60)).padStart(2, '0')}.${Math.floor(finishSeconds % 1 * 10)}`
    : attempt.failureReason === 'LANDING_TOO_ROUGH' ? 'SMOOTH LANDING REQUIRED'
      : attempt.failureReason === 'WRONG_AIRPORT' ? 'LAND AT DFW TO WIN'
      : attempt.failureReason === 'TIME_UP' ? "TIME'S UP" : attempt.failureReason === 'CRASHED' ? 'AIRCRAFT CRASHED'
      : hunterMission && attempt.failureReason === 'INVALID' ? 'LEFT DALLAS AIRSPACE' : 'FLIGHT INTERRUPTED';
  journeyResultElement.querySelector<HTMLElement>('[data-journey-result-reward]')!.textContent = success
    ? attempt.firstClearCredits > 0 ? elevatorMission || championshipMission ? `+${attempt.firstClearCredits} CREDITS · FIRST COMPLETION ONLY`
      : `+${attempt.firstClearCredits} CREDITS · STAGE ${precisionMission ? '6' : territoryMission ? '5' : whiteRockMission ? '4' : hunterMission ? '3' : '2'} PREVIEW READY` : 'NO ADDITIONAL JOURNEY CREDITS'
    : 'NO CREDITS LOST';
  journeyResultElement.querySelector<HTMLButtonElement>('[data-journey-primary]')!.textContent = success ? 'CONTINUE' : 'RETRY MISSION';
  journeyResultElement.querySelector<HTMLButtonElement>('[data-journey-exit]')!.hidden = success;
  if (success) audioManager.playReward();
}

function eventObjectiveForLocal(event: NetworkCityEvent): NetworkVector | undefined {
  if (event.eventType === 'mostWanted') {
    const wantedPlayerId = event.wantedPlayerId;
    if (!wantedPlayerId) return undefined;
    if (wantedPlayerId === localPlayerId) {
      return localLifeState === 'alive'
        ? { x: airplane.position.x, y: airplane.position.y, z: airplane.position.z }
        : undefined;
    }
    const wanted = remotePlayers.get(wantedPlayerId);
    // A Most Wanted marker is never a surrogate aircraft. Only anchor it to
    // the actual, scene-attached fallback/GLB remote that the player can see.
    if (!wanted || !remoteIdentityVisible(wanted)) return undefined;
    return { x: wanted.plane.position.x, y: wanted.plane.position.y, z: wanted.plane.position.z };
  }
  if (event.eventType !== 'skyRush' && event.eventType !== 'goldenSkyRun') return event.objective;
  const gateIndex = Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0);
  return event.route[Math.min(gateIndex, event.route.length - 1)] ?? event.objective;
}

function updateDynamicEventHud(): void {
  const event = cityEvent;
  const objective = event ? eventObjectiveForLocal(event) : undefined;
  const visible = !missionFocus && event !== null && event.id !== skippedEventId && (event.lifecycle === 'available' || event.lifecycle === 'active') && objective !== undefined;
  dynamicEventElement.classList.toggle('hidden', !visible);
  if (!event || !objective || !visible) return;
  const remaining = Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000));
  const objectiveDistance = Math.round(Math.hypot(airplane.position.x - objective.x, airplane.position.z - objective.z));
  dynamicEventNameElement.textContent = `${visualLanguage[event.eventType === 'mostWanted' ? 'wanted' : 'event'].icon} ${event.name}`;
  const progress = event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress;
  const mode = (event.eventType === 'riskZone' || event.eventType === 'cityEmergency') && event.riskMode ? ` · ${event.riskMode.replace(/([A-Z])/g, ' $1').toUpperCase()}` : '';
  const boss = event.eventType === 'aceIntercept' && event.bossHealth !== undefined ? ` · ACE ${event.bossHealth}/${event.bossMaxHealth}` : '';
  dynamicEventObjectiveElement.textContent = `${event.lifecycle === 'available' ? 'NEXT' : 'ACTIVE'}${mode}${boss} · ${objectiveDistance}M · ${remaining}s${progress ? ` · ${progress.toFixed(1)}s` : ''}`;
  const sponsor = eventSponsorFor(event.eventType);
  dynamicEventSponsorElement.textContent = sponsor ? `PRESENTED BY ${sponsorCreative(sponsor.campaignId).headline.toUpperCase()}` : '';
  const joined = joinedEventId === event.id;
  dynamicEventJoinElement.disabled = joined || !localPlayerId;
  dynamicEventJoinElement.textContent = joined ? 'JOINED' : 'JOIN';
  dynamicEventSkipElement.hidden = joined;
}

function updateEventVisual(): void {
  if (missionFocus?.showUnrelatedChallengeMarkers === false) {
    for (const gate of chaosGates) gate.visible = false;
    missionEventMarker.visible = false;
    eventCrate.visible = false;
    return;
  }
  const event = cityEvent;
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.075;
  for (const gate of chaosGates) gate.visible = false;
  const activeMission = serverProfile.missions[cityId]?.active;
  const activeMissionDefinition = activeMission && missionForCity(cityId, activeMission.missionId);
  missionLocationMarker.visible = false;
  const locationTarget = activeMissionDefinition && activeMission ? missionLocationTarget(activeMissionDefinition, activeMission) : undefined;
  if (locationTarget) {
    missionLocationMarker.visible = true;
    missionLocationMarker.position.set(locationTarget.x, groundPlaneY(locationTarget.x, locationTarget.z) + 5, locationTarget.z);
    missionLocationRing.scale.setScalar(pulse);
    paintMissionEventMarker(missionLocationLabel, `NEXT: ${locationTarget.label}`);
  }
  const missionEventActive = Boolean(event?.lifecycle === 'active' && activeMissionDefinition?.type === 'event' &&
    activeMissionDefinition.requirements.eventType === event.eventType);
  missionEventMarker.visible = false;
  if (event && missionEventActive && (event.eventType === 'aceIntercept' || event.eventType === 'vipEscort')) {
    missionEventMarker.visible = true;
    missionEventMarker.position.set(event.objective.x, event.objective.y + 42, event.objective.z);
    paintMissionEventMarker(missionEventMarker, event.eventType === 'aceIntercept' ? 'ACE TARGET' : 'VIP', event.bossHealth, event.bossMaxHealth);
  }
  if (event?.lifecycle === 'active' && (event.eventType === 'skyRush' || event.eventType === 'goldenSkyRun')) {
    const localGateIndex = Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0);
    for (let index = 0; index < event.route.length && index < chaosGates.length; index += 1) {
      const point = event.route[index];
      const gate = chaosGates[index];
      gate.visible = true;
      gate.position.set(point.x, point.y, point.z);
      const material = gate.material as THREE.MeshBasicMaterial;
      const missionGoldenRun = missionEventActive && event.eventType === 'goldenSkyRun';
      material.opacity = missionGoldenRun ? index < localGateIndex ? 0.18 : index === localGateIndex ? 0.98 : 0.38 : 0.88;
      material.color.setHex(missionGoldenRun && index === localGateIndex ? 0xffdf70 : 0xffaa42);
      gate.scale.setScalar((missionGoldenRun ? index < localGateIndex ? 0.66 : index === localGateIndex ? 1.18 : 0.80 : index === localGateIndex ? 1.12 : 0.78) * pulse);
    }
  }
  if (event?.lifecycle === 'active' && missionEventActive && event.eventType === 'vipEscort') {
    const passed = Math.min(event.route.length, Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0));
    for (let index = 0; index < event.route.length && index < chaosGates.length; index += 1) {
      const point = event.route[index];
      const gate = chaosGates[index];
      gate.visible = true;
      gate.position.set(point.x, point.y, point.z);
      const material = gate.material as THREE.MeshBasicMaterial;
      material.color.setHex(index === passed ? 0xff65db : 0xa85aa1);
      material.opacity = index < passed ? 0.14 : index === passed ? 0.92 : 0.28;
      gate.scale.setScalar((index < passed ? 0.62 : index === passed ? 1.12 : 0.76) * pulse);
    }
  }
  if (!event || event.lifecycle !== 'active' || event.eventType !== 'supplyDrop') {
    eventCrate.visible = false;
    return;
  }
  const fallProgress = THREE.MathUtils.clamp((Date.now() - event.activeAt) / 8_000, 0, 1);
  eventCrate.visible = true;
  eventCrate.position.set(event.objective.x, event.objective.y + (1 - fallProgress) * 1_500 + Math.sin(performance.now() * 0.004) * 1.5, event.objective.z);
  eventCrate.rotation.y += 0.012;
  eventCrate.scale.setScalar(1 + Math.sin(performance.now() * 0.007) * 0.045);
}

function applyCityEvent(event: NetworkCityEvent | undefined): void {
  if(guidedTutorialActive){cityEvent=null;ambientTraffic?.syncEventRoutes([]);ambientTraffic?.setStormEvent(false);updateDynamicEventHud();return;}
  if (event?.id !== cityEvent?.id) skippedEventId = null;
  cityEvent = event ?? null;
  if (event && localPlayerId && event.rankings.some((entry) => entry.playerId === localPlayerId)) joinedEventId = event.id;
  if (!event || event.lifecycle === 'completed' || event.lifecycle === 'failed' || event.lifecycle === 'cooldown') {
    joinedEventId = null;
  }
  ambientTraffic?.syncEventRoutes(event?.lifecycle === 'active' ? event.eventAircraft : []);
  ambientTraffic?.setStormEvent(Boolean(
    event?.lifecycle === 'active' &&
    (event.eventType === 'riskZone' || event.eventType === 'cityEmergency' || event.eventType === 'stormLanding') &&
    event.riskMode === 'storm',
  ));
  updateDynamicEventHud();
  updateMissionHud();
  refreshPilotMenu();
  if (!missionFocus && event && (event.lifecycle === 'available' || event.lifecycle === 'active')) {
    contextualHints.trigger('liveEvent');
    if (event.eventType === 'mostWanted') contextualHints.trigger('mostWanted');
  }
}

dynamicEventJoinElement.addEventListener('click', () => {
  if (!cityEvent || !localPlayerId || !connectionReady()) return;
  socket.send(JSON.stringify({ type: 'eventJoin', eventId: cityEvent.id }));
  joinedEventId = cityEvent.id;
  updateDynamicEventHud();
});

dynamicEventSkipElement.addEventListener('click', () => {
  if (!cityEvent || joinedEventId === cityEvent.id) return;
  skippedEventId = cityEvent.id;
  if (connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'chaos_event_skipped', source: cityEvent.eventType }));
  updateDynamicEventHud();
});

if (cityWorld.skyChallenges?.length && !journeyMode) {
  skyChallenges = new SkyChallengeSystem(scene, cityWorld.skyChallenges, getTerrainHeight, {
    onScore: (points) => {
      if (!cityRules.progressionEnabled) return;
      score += points;
      queueRewardFeedback(0, points);
      recordBestScore(score);
      sendPlayerUpdate();
    },
    onCredits: () => { /* completion credits arrive through the server profile */ },
    onMessage: showProgressMessage,
    onStateChange: updateSkyChallengeHud,
    onStarted: (challengeId) => { if (connectionReady()) socket.send(JSON.stringify({ type: 'challengeStart', challengeId })); },
    onGate: (challengeId, gateIndex) => { if (connectionReady()) socket.send(JSON.stringify({ type: 'challengeGate', challengeId, gateIndex })); },
    onComplete: () => { /* server awards the authoritative completion reward */ },
  });
}

stuntCombo = new StuntComboSystem(cityWorld.stuntZones ?? [], {
  onScore: (points) => {
    if (!cityRules.progressionEnabled) return;
    score += points;
    queueRewardFeedback(0, points);
    recordBestScore(score);
    sendPlayerUpdate();
  },
  onCredits: () => { /* stunt Credits are banked by the server Chaos path */ },
  onMessage: showProgressMessage,
  onStunt: (type) => {
    if (type === 'nearMiss') gameplayFeedback.push({ type:'near-miss', primaryText:'CLOSE CALL', secondaryText:'NEAR MISS', intensity:'small' });
    if (!localPlayerId || !connectionReady()) return;
    socket.send(JSON.stringify({ type: 'chaosAction', action: type === 'nearMiss' ? 'nearMiss' : 'stunt' }));
  },
});

if (cityWorld.discoveries?.length) {
  discoverySystem = new DiscoverySystem(cityWorld.discoveries, discoveredLocationIds, {
    onDiscover: (definition) => {
      if (cityRules.progressionEnabled) {
        discoveredLocationsByCity[cityId] = [...discoveredLocationIds];
        savePlayerProgress();
        queueProfileProgress();
      }
      if (!missionFocus) {
        showProgressMessage(cityRules.practiceMode ? `PRACTICE DISCOVERY: ${definition.name}` : `DISCOVERED: ${definition.name}`);
        gameplayFeedback.push({ type: 'secret', primaryText: definition.type === 'secret' ? 'SECRET DISCOVERED' : 'PLACE DISCOVERED', secondaryText: cityRules.practiceMode ? `${definition.name.toUpperCase()} · PRACTICE — NO REWARDS` : definition.name.toUpperCase(), intensity: definition.type === 'secret' ? 'major' : 'medium' });
      }
      flightRecap.discoveries += 1;
      if (definition.type === 'secret' && connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'secret_discovered' }));
      updateProgressHud();
      if (!missionFocus) contextualHints.trigger('discovery');
    },
    onSetComplete: (setId, bonus) => {
      if (bonus <= 0) return;
      if (cityRules.progressionEnabled) {
        discoveredLocationsByCity[cityId] = [...discoveredLocationIds];
        savePlayerProgress();
        queueProfileProgress();
      }
      if (!missionFocus) showProgressMessage(`${setId.replaceAll('-', ' ').toUpperCase()} COMPLETE${cityRules.practiceMode ? ' · PRACTICE — NO REWARDS' : ''}`);
    },
  });
}

const contractTypes: ReadonlyArray<ContractType> = ['sightseeing', 'passenger', 'cargo', 'intercept'];
const contractAircraft: Record<ContractType, AircraftType> = {
  passenger: 'privateJet',
  cargo: 'cargo',
  sightseeing: 'trainer',
  intercept: 'fighter',
};
const contractRewards: Record<ContractType, number> = {
  ...economyRewards.contractCredits,
};

function airportById(id: AirportId): AirportDefinition {
  return airports.find((airport) => airport.id === id) ?? centralAirport;
}

function contractTitle(type: ContractType): string {
  return type.toUpperCase();
}

function ownsAircraft(type: AircraftType): boolean {
  return flightTestMode || (profileHydrated && serverProfile.unlockedAircraft.includes(type));
}

function aircraftAccessReason(type: AircraftType): string | undefined {
  if (ownsAircraft(type)) return undefined;
  const definition = aircraftDefinitions[type];
  if (definition.access === 'premium') return `${definition.name} requires Premium access.`;
  const needed = Math.max(0, definition.creditsRequired - credits);
  return `Requires ${definition.name} — need ${needed.toLocaleString()} more Credits.`;
}

function generateContract(): void {
  if (activeContract) return;
  const id = contractSequence;
  const type = contractTypes[id % contractTypes.length];
  contractSequence += 1;
  const originIndex = Math.max(0, airports.findIndex((airport) => airport.id === lastSuccessfulAirportId));
  const destinationIndex = (originIndex + 1 + (Math.floor(id / contractTypes.length) % (airports.length - 1))) % airports.length;
  const regionStart = Math.floor(id / contractTypes.length) % regionBounds.length;
  const regionNames = Array.from(
    { length: 3 },
    (_, index) => regionBounds[(regionStart + index) % regionBounds.length].name,
  );
  availableContract = {
    id,
    type,
    aircraftType: contractAircraft[type],
    reward: contractRewards[type],
    originAirportId: airports[originIndex].id,
    destinationAirportId: airports[destinationIndex].id,
    regionNames,
  };
  updateContractPanel();
}

function contractDetail(contract: ContractDefinition): string {
  const origin = airportById(contract.originAirportId).name;
  const destination = airportById(contract.destinationAirportId).name;
  if (contract.type === 'sightseeing') {
    return `Visit ${contract.regionNames.join(', ')}, then land at ${destination}.`;
  }
  if (contract.type === 'intercept') {
    return `Destroy one multiplayer aircraft, then land at ${destination}.`;
  }
  return `${origin} → ${destination}. Land safely to complete.`;
}

function updateContractPanel(): void {
  contractPanelElement.classList.toggle('hidden', availableContract === null || Boolean(missionFocus));
  if (!availableContract) return;
  const accessReason = aircraftAccessReason(availableContract.aircraftType);
  contractTypeElement.textContent = contractTitle(availableContract.type);
  contractDetailElement.textContent = contractDetail(availableContract);
  contractAircraftElement.textContent = accessReason
    ? `${aircraftDefinitions[availableContract.aircraftType].name} · LOCKED`
    : aircraftDefinitions[availableContract.aircraftType].name;
  contractRewardElement.textContent = `+${availableContract.reward} credits`;
  contractAcceptElement.disabled = Boolean(accessReason);
  contractAcceptElement.textContent = accessReason ? 'Aircraft Locked' : 'Accept';
}

function updateActiveContractHud(): void {
  activeContractElement.classList.toggle('hidden', activeContract === null);
  if (!activeContract) return;
  const contract = activeContract.definition;
  const aircraftName = aircraftDefinitions[contract.aircraftType].name;
  const origin = airportById(contract.originAirportId).name;
  const destination = airportById(contract.destinationAirportId).name;
  const header = document.createElement('div');
  header.className = 'active-contract-header';
  header.textContent = `ACTIVE CONTRACT · ${contractTitle(contract.type)}`;
  const meta = document.createElement('div');
  meta.className = 'active-contract-meta';
  meta.textContent = `${aircraftName} · Reward: ${contract.reward} credits`;
  const route = document.createElement('div');
  route.className = 'active-contract-route';

  const addTask = (complete: boolean, label: string): void => {
    const task = document.createElement('div');
    task.className = `active-contract-task${complete ? ' complete' : ''}`;
    task.textContent = `${complete ? '✓' : '○'} ${label}`;
    activeContractElement.append(task);
  };

  activeContractElement.replaceChildren(header, meta);
  if (contract.type === 'passenger' || contract.type === 'cargo') {
    route.textContent = `${origin} → ${destination}`;
    activeContractElement.append(route);
    addTask(activeContract.departed, `Depart ${origin}`);
    addTask(false, `Land safely at ${destination}`);
  } else if (contract.type === 'sightseeing') {
    route.textContent = `Final landing: ${destination}`;
    activeContractElement.append(route);
    for (const region of contract.regionNames) addTask(activeContract.visitedRegions.has(region), region);
    addTask(false, `Land at ${destination}`);
  } else {
    route.textContent = `Final landing: ${destination}`;
    activeContractElement.append(route);
    addTask(activeContract.killCompleted, 'Destroy another aircraft');
    addTask(false, `Land safely at ${destination}`);
  }
}

function acceptAvailableContract(): void {
  if (!availableContract) return;
  const accessReason = aircraftAccessReason(availableContract.aircraftType);
  if (accessReason) {
    showProgressMessage(accessReason);
    return;
  }
  activeContract = {
    definition: availableContract,
    departed: false,
    visitedRegions: new Set<RegionName>(),
    killCompleted: false,
  };
  availableContract = null;
  updateContractPanel();
  updateActiveContractHud();
}

function completeContract(): void {
  if (!activeContract) return;
  const { reward, type } = activeContract.definition;
  activeContract = null;
  updateActiveContractHud();
  addCredits(reward, type);
  showProgressMessage(`${contractTitle(type)} COMPLETE`);
  generateContract();
}

function failActiveContract(): void {
  if (!activeContract || activeContract.definition.type === 'intercept') return;
  const title = contractTitle(activeContract.definition.type);
  activeContract = null;
  updateActiveContractHud();
  showProgressMessage(`${title} CONTRACT FAILED`);
  generateContract();
}

function handleContractTakeoff(airport: AirportDefinition | null): void {
  if (!activeContract || aircraftType !== activeContract.definition.aircraftType) return;
  const contract = activeContract.definition;
  if (
    (contract.type === 'passenger' || contract.type === 'cargo') &&
    airport?.id === contract.originAirportId
  ) {
    activeContract.departed = true;
    updateActiveContractHud();
  }
}

function handleContractRegion(regionName: RegionName): void {
  if (
    !activeContract ||
    activeContract.definition.type !== 'sightseeing' ||
    aircraftType !== activeContract.definition.aircraftType ||
    !activeContract.definition.regionNames.includes(regionName) ||
    activeContract.visitedRegions.has(regionName)
  ) {
    return;
  }
  activeContract.visitedRegions.add(regionName);
  showProgressMessage(`${regionName} SIGHTSEEN`);
  updateActiveContractHud();
}

function handleContractKill(): void {
  if (
    !activeContract ||
    activeContract.definition.type !== 'intercept' ||
    aircraftType !== activeContract.definition.aircraftType ||
    activeContract.killCompleted
  ) {
    return;
  }
  activeContract.killCompleted = true;
  updateActiveContractHud();
}

function handleContractLanding(airport: AirportDefinition): void {
  if (!activeContract || aircraftType !== activeContract.definition.aircraftType) return;
  const contract = activeContract.definition;
  if (airport.id !== contract.destinationAirportId) return;
  if ((contract.type === 'passenger' || contract.type === 'cargo') && activeContract.departed) {
    completeContract();
  } else if (
    contract.type === 'sightseeing' &&
    contract.regionNames.every((region) => activeContract?.visitedRegions.has(region))
  ) {
    completeContract();
  } else if (contract.type === 'intercept' && activeContract.killCompleted) {
    completeContract();
  }
}

contractAcceptElement.addEventListener('click', acceptAvailableContract);
contractSkipElement.addEventListener('click', generateContract);

function showCombatMessage(message: string, hitConfirmed = false): void {
  combatMessageElement.textContent = message;
  combatMessageElement.classList.toggle('hit-confirmed', hitConfirmed);
  combatMessageElement.classList.remove('hidden');
  window.clearTimeout(combatMessageTimer);
  combatMessageTimer = window.setTimeout(() => combatMessageElement.classList.add('hidden'), 1000);
}

function showHitMarker(): void {
  hitMarkerElement.classList.remove('visible');
  void hitMarkerElement.offsetWidth;
  hitMarkerElement.classList.add('visible');
  window.clearTimeout(hitMarkerTimer);
  hitMarkerTimer = window.setTimeout(() => hitMarkerElement.classList.remove('visible'), 220);
}

function showDamageFeedback(): void {
  damageFlashElement.classList.remove('visible');
  void damageFlashElement.offsetWidth;
  damageFlashElement.classList.add('visible');
  cameraShakeTime = Math.max(cameraShakeTime, 0.22);
  window.clearTimeout(damageFlashTimer);
  damageFlashTimer = window.setTimeout(() => damageFlashElement.classList.remove('visible'), 190);
}

function updateHealthDisplay(damaged = false): void {
  // A stale server packet during a rolling deploy must never turn the local
  // HUD into `100/undefined`; aircraft config is the safe authoritative
  // fallback for the active aircraft.
  const safeMaximum = Number.isFinite(maxHealth) && maxHealth > 0
    ? Math.round(maxHealth)
    : maxHealthForAircraft(aircraftType);
  const safeCurrent = Number.isFinite(health)
    ? THREE.MathUtils.clamp(Math.round(health), 0, safeMaximum)
    : safeMaximum;
  maxHealth = safeMaximum;
  health = safeCurrent;
  const ratio = safeCurrent / safeMaximum;
  healthElement.textContent = safeCurrent.toString();
  healthElement.title = `Health ${safeCurrent} / ${safeMaximum}`;
  healthRowElement.classList.toggle('warning', ratio <= 0.5 && ratio > 0.25);
  healthRowElement.classList.toggle('critical', ratio <= 0.25);
  healthRowElement.classList.toggle('damaged', damaged);
  window.clearTimeout(healthFlashTimer);
  if (damaged) {
    healthFlashTimer = window.setTimeout(() => healthRowElement.classList.remove('damaged'), 350);
  }
}

function applyLocalHull(current: unknown, reportedMaximum: unknown, type: AircraftType = aircraftType): void {
  const configuredMaximum = maxHealthForAircraft(type);
  maxHealth = typeof reportedMaximum === 'number' && Number.isFinite(reportedMaximum) && reportedMaximum > 0
    ? Math.round(reportedMaximum)
    : configuredMaximum;
  health = typeof current === 'number' && Number.isFinite(current)
    ? THREE.MathUtils.clamp(Math.round(current), 0, maxHealth)
    : maxHealth;
}

function applyHeatState(state: NetworkHeatState): void {
  const level = THREE.MathUtils.clamp(Math.round(state.level), 0, 5);
  if (state.playerId === localPlayerId) {
    const levelRaised = level > localHeat;
    localHeat = level;
    localHeatMultiplier = state.multiplier;
    heatLevelElement.textContent = level.toString();
    heatRowElement.dataset.level = level.toString();
    if (state.levelChanged && levelRaised) showProgressMessage(`${visualLanguage.heat.icon} DANGER ${level} — More danger. Better rewards.`);
    return;
  }
  const remote = remotePlayers.get(state.playerId);
  if (remote) remote.heatLevel = level;
}

function updatePendingAircraftEquip(): void {
  if (pendingEquip && performance.now() - pendingEquip.sentAt > 8000) {
    pendingEquip = undefined;
    showProgressMessage('AIRCRAFT SWITCH NOT CONFIRMED — TRY AGAIN');
  }
}

function addCredits(amount: number, source: ContractType): boolean {
  if (flightTestMode) return false;
  queueProfileReward(source);
  return false;
}

function checkRegionDiscovery(): void {
  for (const region of regionBounds) {
    const insideRegion =
      airplane.position.x >= region.minX &&
      airplane.position.x <= region.maxX &&
      airplane.position.z >= region.minZ &&
      airplane.position.z <= region.maxZ;
    if (!insideRegion) continue;
    handleContractRegion(region.name);
    if (visitedRegionsThisFlight.has(region.name)) continue;
    visitedRegionsThisFlight.add(region.name);
    regionsDiscovered += 1;
    const presentation = regionCinematicPresentation(cityId, region.name);
    if (presentation) cinematicDirector.requestRegion(`${cityId}:${region.name}`, presentation.title, presentation.subtitle);
    else showProgressMessage(`${region.name.toUpperCase()} FOUND`);
  }
}

function updateAirborneProgress(delta: number): void {
  if (visualQaMode) return;
  const traveled = currentSpeed * delta;
  if (traveled <= 0) return;
  distanceFlown += traveled;
  flightDistanceSinceTakeoff += traveled;
  if (cityRules.progressionEnabled) {
    totalDistance += traveled;
    distanceCreditProgress += traveled;
    if (distanceCreditProgress >= 250) {
      distanceCreditProgress %= 250;
      queueProfileProgress();
    }
  }
  checkRegionDiscovery();
}

function setRestartAirport(airport: AirportDefinition): void {
  lastSuccessfulAirportId = airport.id;
  spawnPosition.set(
    airport.x + Math.sin(airport.heading) * airport.spawnOffset,
    groundPlaneY(airport.x, airport.z),
    airport.z + Math.cos(airport.heading) * airport.spawnOffset,
  );
  spawnHeading = airport.heading;
}

function sendLandingIntent(airport:AirportDefinition,landingQuality:LandingQuality):boolean{
  if(!localPlayerId||!connectionReady())return false;
  socket.send(JSON.stringify({type:'landingIntent',airportId:airport.id,telemetry:{
    speed:landingQuality.speed,descentRate:landingQuality.descentRate,bankAngle:landingQuality.bankAngle,
    pitch:landingQuality.pitch,headingError:landingQuality.headingError,
  }}));
  return true;
}

function rewardLanding(airport: AirportDefinition, landingQuality?: LandingQuality, rough = false): void {
  if (journeyMode && journeyAttempt?.missionId === journeyDallas06.id) {
    if (landingQuality && journeyAttempt.phase === 'LANDING' && flightDistanceSinceTakeoff >= MIN_REWARDED_FLIGHT_DISTANCE) {
      championshipLandingIntentPending = { attemptId: journeyAttempt.attemptId, airport, quality: landingQuality, attempts: 0, lastSentAt: 0 };
    }
    return;
  }
  setRestartAirport(airport);
  if (visualQaMode) return;
  if (flightDistanceSinceTakeoff < MIN_REWARDED_FLIGHT_DISTANCE) return;
  successfulLandings += 1;
  if (cityRules.progressionEnabled) {
    totalSuccessfulLandings += 1;
    if (totalSuccessfulLandings % 3 === 0) gameplayFeedback.push({ type:'landing-streak', primaryText:`${totalSuccessfulLandings} LANDINGS`, secondaryText:'LANDING STREAK', intensity:'medium' });
    queueProfileProgress();
  }
  resetRegionsOnNextTakeoff = true;
  const destinationBonus = !landedAirportIds.has(airport.id);
  landedAirportIds.add(airport.id);
  showProgressMessage(rough ? 'ROUGH LANDING' : destinationBonus ? `${airport.name.toUpperCase()} DISCOVERED` : 'LANDING VERIFIED');
  if (landingQuality) {
    showFlightRecap('GREAT FLIGHT');
  }
  if(landingQuality&&!(guidedTutorialActive&&guidedTutorialStep==='landing'))sendLandingIntent(airport,landingQuality);
  if (landingQuality) stuntCombo?.notifyLanding(landingQuality);
  contextualHints.trigger('garage');
}

function endRun(message: EndReason, title: string = message): void {
  if (crashed) return;
  cinematicDirector.clearPresentation();
  if (journeyMode && connectionReady()) socket.send(JSON.stringify({ type: 'journeyCrash' }));
  if (message === 'CRASHED' && connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'crash' }));
  crashed = true;
  landingSpeedCueElement.classList.add('hidden');
  speedElement.classList.remove('landing-risk');
  altitudeElement.classList.remove('landing-risk');
  boostActive = false;
  boostVisualStrength = 0;
  resetRegionsOnNextTakeoff = true;
  failActiveContract();
  skyChallenges?.fail(message);
  stuntCombo?.reset();
  if (message === 'CRASHED') airplane.position.y = Math.max(groundPlaneY(airplane.position.x, airplane.position.z), airplane.position.y);
  recordBestScore(score);
  speedElement.textContent = '0';
  altitudeElement.textContent = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toLocaleString();
  endTitleElement.textContent = title;
  finalScoreElement.textContent = score.toString();
  crashOverlay.classList.toggle('hidden', journeyMode);
  const guidedTrainingCrash=cityRules.tutorialEnabled&&guidedTutorialActive&&guidedTutorialStep!=='freePractice'&&message!=='TIME UP';
  crashActions.hidden=guidedTrainingCrash;
  if(guidedTrainingCrash){
    tutorialEvent('tutorial_crashed',guidedTutorialStep);
    window.clearTimeout(tutorialCrashResetTimer);
    tutorialCrashResetTimer=window.setTimeout(()=>requestTutorialRunReset('crash'),350);
  }
  if (!journeyMode) showFlightRecap('FLIGHT COMPLETE');
  cameraShakeTime = 0.35;
  currentSpeed = 0;
  verticalSpeed = 0;
  velocity.set(0, 0, 0);
  setFlightState('CRASHED');
  playEndSound(message);
}

function restartGame(notifyServer = true): void {
  cinematicDirector.resetFlight();
  clearHeldActions();
  fireCooldown = 0;
  runStarted = true;
  airplane.position.copy(spawnPosition);
  airplane.rotation.set(0, spawnHeading, 0, 'YXZ');
  heading = spawnHeading;
  pitch = 0;
  roll = 0;
  pitchControlStrength = 0;
  yawControlStrength = 0;
  smoothedTouchSteering = { x: 0, y: 0 };
  throttle = 0;
  mobileInput.setThrottleState(0);
  boostMeter = 100;
  boostActive = false;
  boostVisualStrength = 0;
  speedBrakeStrength = 0;
  landingAssistActive = false;
  score = 0;
  multiplier = 1;
  checkpointsPassed = 0;
  remainingTime = 12;
  speedBonus = 0;
  currentSpeed = 0;
  verticalSpeed = 0;
  velocity.set(0, 0, 0);
  onGround = true;
  takeoffRollMeters = 0;
  landedFeedbackTime = 0;
  cameraShakeTime = 0;
  checkpointFlashIndex = -1;
  checkpointFlashTime = 0;
  activeCheckpoint = 0;
  skyChallenges?.cancel();
  stuntCombo?.reset();
  crashed = false;
  health = maxHealth;
  localLifeState = 'respawning';
  setFlightState('TAXI');
  for (const remote of remotePlayers.values()) remote.nearMissActive = false;
  window.clearTimeout(nearMissMessageTimer);
  window.clearTimeout(checkpointMessageTimer);
  nearMissMessageElement.classList.add('hidden');
  checkpointMessageElement.classList.add('hidden');
  combatMessageElement.classList.add('hidden');
  hitMarkerElement.classList.remove('visible');
  damageFlashElement.classList.remove('visible');
  crashOverlay.classList.add('hidden');
  crashActions.hidden=false;
  flightRecapElement.hidden = true;
  updateHealthDisplay();
  updateFlightHud();
  showActiveCheckpoint();
  updateCamera(1);
  if (notifyServer) sendRespawn();
  sendLocalState();
  sendPlayerUpdate();
}
flightRecapElement.querySelector('[data-recap-fly]')!.addEventListener('click', () => { if(connectionReady()) socket.send(JSON.stringify({type:'analyticsEvent',event:'fly_again_clicked'})); restartGame(); });
flightRecapElement.querySelector('[data-recap-close]')!.addEventListener('click', closeTopUiLayer);

function applyServerSelectedAircraft(nextType: AircraftType, resetFlight = true, notifyServer = true): void {
  if (nextType === aircraftType) return;
  scene.remove(airplane);
  disposeAirplaneMaterials(airplane);
  aircraftType = nextType;
  currentAircraft = aircraftDefinitions[aircraftType];
  maxHealth = maxHealthForAircraft(aircraftType);
  health = Math.min(health, maxHealth);
  airplane = createAirplane(aircraftType);
  applyEquippedLivery(airplane, aircraftType, serverProfile.cosmetics.equipped);
  scene.add(airplane);
  if (resetFlight) restartGame(notifyServer);
}

function selectAircraft(nextType: AircraftType): void {
  if (pendingEquip) { updatePendingAircraftEquip(); return; }
  if (nextType === aircraftType) return;
  if (!canSwitchAircraft()) {
    showProgressMessage('LAND AND STOP AT AN AIRPORT TO CHANGE AIRCRAFT');
    return;
  }
  if (flightTestMode) {
    applyServerSelectedAircraft(nextType);
    return;
  }
  if (!profileHydrated || !serverProfile.unlockedAircraft.includes(nextType)) {
    showProgressMessage(!profileHydrated ? 'WAITING FOR SERVER PROFILE' : (aircraftAccessReason(nextType) ?? 'AIRCRAFT NOT OWNED'));
    return;
  }
  if (!connectionReady()) {
    showProgressMessage('SERVER REQUIRED TO EQUIP AIRCRAFT');
    return;
  }
  // The local model changes only after the server returns its accepted profile.
  pendingEquip = { id: ++equipSequence, aircraftType: nextType, sentAt: performance.now() };
  updatePendingAircraftEquip();
  showProgressMessage('SWITCHING AIRCRAFT…');
  sendLocalState();
  socket.send(JSON.stringify({ type: 'equipAircraft', aircraftType: nextType, equipRequestId: pendingEquip.id }));
}

const aircraftGarage = new AircraftGarage(garageOverlayElement, (nextType) => {
  selectAircraft(nextType);
  aircraftGarage.close();
}, undefined, undefined, (nextType) => {
  if (!connectionReady() || !profileHydrated) { aircraftGarage.showActionResult('SERVER REQUIRED TO BUY AIRCRAFT'); return; }
  try { socket.send(JSON.stringify({ type: 'purchaseAircraft', aircraftType: nextType, purchaseRequestId: ++purchaseSequence })); }
  catch { aircraftGarage.showActionResult('SERVER UNAVAILABLE — PURCHASE NOT CHANGED'); }
}, (code) => {
  if (!connectionReady() || !profileHydrated) { aircraftGarage.showActionResult('SERVER REQUIRED FOR TESTER CODE'); return; }
  try { socket.send(JSON.stringify({ type: 'redeemTesterCode', testerCode: code })); }
  catch { aircraftGarage.showActionResult('SERVER UNAVAILABLE — CODE NOT REDEEMED'); }
}, () => {
  if (!connectionReady() || !profileHydrated) { aircraftGarage.showActionResult('SERVER REQUIRED FOR TEST FLIGHT'); return; }
  try { socket.send(JSON.stringify({ type: 'startFighterTrial' })); }
  catch { aircraftGarage.showActionResult('SERVER UNAVAILABLE — TEST FLIGHT NOT STARTED'); }
}, async () => {
  if (connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'fighter_purchase_clicked' }));
  if (nativePurchaseProvider) {
    try {
      const result = await purchaseNativeFirehawk();
      if (result.state === 'cancelled') { aircraftGarage.showActionResult('PURCHASE CANCELLED'); return; }
      if (result.state === 'pending') { aircraftGarage.showActionResult('PURCHASE PENDING'); return; }
      if (result.profile) applyServerProfile(result.profile);
      aircraftGarage.showActionResult('FIREHAWK UNLOCKED · PURCHASE CONFIRMED');
      audioManager.playPurchaseSuccess();
      hapticsManager.emit('rewardSuccess', 'aircraft:fighter');
    } catch (error) { aircraftGarage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'UNABLE TO VERIFY PURCHASE. TRY AGAIN.'); }
    return;
  }
  void beginFirehawkCheckout({ pilotId: serverProfile.pilotId, pilotName: serverProfile.pilotName })
    .catch((error: unknown) => aircraftGarage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'CHECKOUT UNAVAILABLE'));
}, () => {
  if (connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'fighter_modal_viewed' }));
}, async (code) => {
  try {
    if (nativePurchaseProvider) {
      const result = await restoreNativeFirehawk();
      if (result.state === 'notFound') { aircraftGarage.showActionResult('NO FIREHAWK PURCHASE FOUND'); return; }
      if (result.profile) applyServerProfile(result.profile);
      aircraftGarage.showActionResult('FIREHAWK RESTORED'); audioManager.playReward(); return;
    }
    if (!code) { aircraftGarage.showActionResult('PURCHASE RESTORE FAILED'); return; }
    const result = await restoreFirehawkPurchase(code);
    if (result.profile) applyServerProfile(result.profile);
    aircraftGarage.showActionResult(`FIREHAWK RESTORED · NEW RECOVERY CODE: ${result.recoveryCode ?? 'CONTACT SUPPORT'}`);
  } catch (error) { aircraftGarage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'PURCHASE RESTORE FAILED'); }
}, (id, currency) => sendCosmeticAction('purchaseCosmetic', id, currency),
  (id) => sendCosmeticAction('equipCosmetic', id));
if (nativePurchaseProvider) {
  aircraftGarage.setNativeStorePrice();
  void loadNativeFirehawkOffer().then(offer => aircraftGarage.setNativeStorePrice(offer?.localizedPrice)).catch(() => undefined);
}
function sendCosmeticAction(type: 'purchaseCosmetic' | 'equipCosmetic', cosmeticId: string, currency: 'CREDITS' | 'SKY_TOKENS' = 'CREDITS'): void {
  if (!connectionReady() || !profileHydrated) { aircraftGarage.showActionResult('SERVER UNAVAILABLE — COSMETIC NOT CHANGED'); return; }
  try { socket.send(JSON.stringify({ type, cosmeticId, ...(type === 'purchaseCosmetic' ? { currency } : {}) })); } catch { aircraftGarage.showActionResult('SERVER UNAVAILABLE — COSMETIC NOT CHANGED'); }
}
function openGarage(): boolean {
  if (!onGround || crashed) {
    showProgressMessage('AIRCRAFTS AVAILABLE WHEN SAFELY ON GROUND');
    return false;
  }
  // The Garage owns the whole screen while open. Clear held flight input and
  // close the two other full-screen surfaces before its preview takes focus.
  clearHeldActions();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  if (pilotMenu.isOpen()) pilotMenu.close();
  if (connectionReady() && serverProfile.fighterTrial.status === 'active' && (serverProfile.fighterTrial.expiresAt ?? Infinity) <= Date.now()) {
    socket.send(JSON.stringify({ type: 'fighterTrialBoundary' }));
  }
  aircraftGarage.open({
    credits,
    skyTokens,
    selectedAircraft: aircraftType,
    unlockedAircraft: flightTestMode ? (Object.keys(aircraftDefinitions) as AircraftType[]) : serverProfile.unlockedAircraft,
    economyVersion: serverProfile.economyVersion,
    aircraftEntitlements: serverProfile.aircraftEntitlements,
    testerCodeEnabled: serverProfile.testerCodeEnabled,
    fighterTrial: serverProfile.fighterTrial,
    cosmetics: serverProfile.cosmetics,
  });
  return true;
}
flightGarageButtonElement.addEventListener('click', openGarage);

const heldActions = new Set<FlightAction>();
const heldKeyboardCodes = new Set<string>();
function clearHeldActions(): void {
  heldActions.clear();
  heldKeyboardCodes.clear();
}
document.addEventListener('focusin', (event) => {
  if (isEditableControl(event.target)) clearHeldActions();
}, true);
let touchInputReported=false;
const reportTouchInput=()=>{if(!touchInputReported&&connectionReady()){touchInputReported=true;socket.send(JSON.stringify({type:'analyticsEvent',event:'input_mode_detected',mode:'touch'}));}};
const mobileInput=new MobileInputControls(document.querySelector<HTMLElement>('#touch-controls')!, acquisitionCircleElement, (action,active)=>{
  if (launchCinematicBlocksInput()) {
    if (!active) heldActions.delete(action);
    return;
  }
  if(active)reportTouchInput();
  if(active){heldActions.add(action);runStarted=true;noteTutorialActionInput(action);if(action==='fire')fireWeaponOnce();}
  else heldActions.delete(action);
},(value)=>{if(launchCinematicBlocksInput())return;reportTouchInput();runStarted=true;noteTutorialThrottleInput(value);});
window.addEventListener('airport-chaos-menu-preferences-changed',()=>{
  const latest=loadPlayerProgress();
  persistedPlayer.muted=audioManager.isMuted();
  persistedPlayer.hintsEnabled=latest.hintsEnabled;
  persistedPlayer.navigationMarkersEnabled=latest.navigationMarkersEnabled;
  contextualHints.setEnabled(latest.hintsEnabled);
  navigationMarkersEnabled=latest.navigationMarkersEnabled;
  navigationBeacons.setEnabled(navigationMarkersEnabled && (missionFocus?.showUnrelatedAirportLabels ?? true) && (missionFocus?.showUnrelatedLandmarkLabels ?? true));
  graphicsQualityMode=preferredGraphicsQuality();
  Object.assign(audioLevels,audioManager.getLevels());
  mobileInput.syncPreferences();
  renderDesktopControlsHelp();
  if(pilotMenu.isOpen())renderPilotMenu();
});
const desktopControlsHelpPreferenceKey = 'airport-chaos-desktop-controls-help-v1';
let desktopControlsHelpCollapsed = false;
try { desktopControlsHelpCollapsed = localStorage.getItem(desktopControlsHelpPreferenceKey) === 'collapsed'; } catch { /* default expanded */ }
function renderDesktopControlsHelp(): void {
  const touchLayout = mobileInput.isTouchLayout();
  desktopControlsHelpElement.hidden = touchLayout;
  desktopControlsHelpElement.setAttribute('aria-hidden', touchLayout ? 'true' : 'false');
  desktopControlsHelpElement.classList.toggle('is-collapsed', desktopControlsHelpCollapsed);
  desktopControlsHelpItemsElement.hidden = desktopControlsHelpCollapsed;
  desktopControlsHelpToggleElement.textContent = desktopControlsHelpCollapsed ? '▶ CONTROLS' : '◀';
  desktopControlsHelpToggleElement.setAttribute('aria-expanded', desktopControlsHelpCollapsed ? 'false' : 'true');
  desktopControlsHelpToggleElement.title = desktopControlsHelpCollapsed ? 'Expand controls reference' : 'Collapse controls reference';
}
function setDesktopControlsHelpCollapsed(collapsed: boolean): void {
  desktopControlsHelpCollapsed = collapsed;
  try { localStorage.setItem(desktopControlsHelpPreferenceKey, collapsed ? 'collapsed' : 'expanded'); } catch { /* Optional local preference. */ }
  renderDesktopControlsHelp();
}
function toggleDesktopControlsHelp(): void {
  setDesktopControlsHelpCollapsed(!desktopControlsHelpCollapsed);
}
function syncDesktopControlsHelp(): void {
  renderDesktopControlsHelp();
}
window.addEventListener('resize', syncDesktopControlsHelp);
window.addEventListener('orientationchange', syncDesktopControlsHelp);
desktopControlsHelpToggleElement.addEventListener('click', toggleDesktopControlsHelp);
renderDesktopControlsHelp();
let runStarted = false;
type GuidedTutorialStep=(typeof tutorialSteps)[number]|'freePractice';
let guidedTutorialActive=false;
let guidedTutorialStep:GuidedTutorialStep='throttle';
let guidedTutorialSteps=Object.fromEntries(tutorialSteps.map(step=>[step,'pending'])) as Record<TutorialLessonStep,TutorialStepStatus>;
// Client presentation between the existing camera zoom and approach lessons.
type TutorialNavigationCoach='radar'|'map'|'players'|'territories';
let tutorialNavigationCoach:TutorialNavigationCoach|undefined;
let tutorialNavigationCoachSeen=false;
let tutorialPlayersExpandedBefore:boolean|undefined;
let tutorialTerritoriesExpandedBefore:boolean|undefined;
let guidedTutorialTargetAirport:AirportDefinition|undefined;
let tutorialIntroPending=false;
let tutorialIntroShown=false;
let tutorialCompletionPending=false;
let tutorialStepCompleting=false;
let tutorialStepRequestPending=false;
let tutorialStepRequestStep:TutorialLessonStep|undefined;
let tutorialCompletionPresentationStep:TutorialLessonStep|undefined;
const tutorialStepReconciler=new TutorialStepReconciler();
let tutorialInputFeedback='';
let tutorialVisibleStep:GuidedTutorialStep='throttle';
let tutorialLandingStage:TutorialLandingCoachStage='steady';
let tutorialLandingStageChangedAt=Number.NEGATIVE_INFINITY;
let tutorialLandingCandidateStage:TutorialLandingCoachStage|undefined;
let tutorialLandingCandidateSince=0;
let tutorialLandingIntentPending:{airport:AirportDefinition;quality:LandingQuality;attempts:number;lastSentAt:number}|undefined;
let championshipLandingIntentPending:{attemptId:string;airport:AirportDefinition;quality:LandingQuality;attempts:number;lastSentAt:number}|undefined;
let tutorialAdvanceTimer:number|undefined;
let tutorialLockPreviewTimer:number|undefined;
let tutorialLockPreview=false;
let tutorialTakeoffRecovery=false;
let tutorialLandingNeedsTakeoff=false;
let tutorialTurnLast=0;
let tutorialMovementAmount=0;
let tutorialAltitudeOrigin=0;
let tutorialTargetRequested=false;
let tutorialTargetRequestedAt=Number.NEGATIVE_INFINITY;
let tutorialTargetId:string|undefined;
let tutorialCameraTravel=0;
let tutorialZoomTravel=0;
let tutorialExitPending=false;
let tutorialRunResetPending=false;
let tutorialCrashResetTimer:number|undefined;
const flightControlCodes = new Set(Object.keys(keyboardActionBindings));
function showFirstRunGuide(): void {
  if (!cityRules.tutorialEnabled) return;
  if (pilotMenu.isOpen()) pilotMenu.close();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  if (aircraftGarage.isOpen()) aircraftGarage.close();
  flightTutorial.open();
}
flightTutorial.setVisibilityHandler(() => {
  clearHeldActions();
  boostActive = false;
  if (cameraOrbitPointerId !== null && renderer.domElement.hasPointerCapture(cameraOrbitPointerId)) {
    renderer.domElement.releasePointerCapture(cameraOrbitPointerId);
  }
});
flightTutorial.setHelpAction(showFirstRunGuide);
window.addEventListener('keydown', (event) => {
  if (shouldIgnoreGameplayKeyboardEvent(event)) return;
  if (guidedTutorialActive && (tutorialIntroPending || tutorialCompletionPending || tutorialExitPending)) {
    if (flightControlCodes.has(event.code)) event.preventDefault();
    return;
  }
  if (launchCinematicBlocksInput()) {
    if (flightControlCodes.has(event.code)) event.preventDefault();
    return;
  }
  if (!citySelectorElement.hidden) {
    if (flightControlCodes.has(event.code)) event.preventDefault();
    return;
  }
  if (aircraftGarage.isOpen()) {
    if (flightControlCodes.has(event.code) || event.code === menuBindings.map || event.code === menuBindings.restart || event.code === menuBindings.menu) {
      event.preventDefault();
      if (event.code === 'Space') reportFireBlocked('menu');
    }
    return;
  }
  if (event.code === menuBindings.menu) {
    event.preventDefault();
    togglePilotMenu();
    return;
  }
  if (pilotMenu.isOpen()) {
    if (flightControlCodes.has(event.code)) event.preventDefault();
    if (event.code === 'Space') reportFireBlocked('menu');
    return;
  }
  if (!worldMap.isOpen() && shouldToggleDesktopControlsHelp(event.code, mobileInput.isTouchLayout(), event.target)) {
    event.preventDefault();
    toggleDesktopControlsHelp();
    return;
  }
  if (flightControlCodes.has(event.code)) {
    event.preventDefault();
    if (!['aimLeft', 'aimRight', 'aimUp', 'aimDown'].includes(keyboardActionBindings[event.code])) runStarted = true;
  }
  const action = keyboardActionBindings[event.code];
  if (!event.repeat && action === 'fire') fireWeaponOnce();
  if (event.code === menuBindings.restart && crashed) {
    restartGame();
    return;
  }
  if (action) {
    heldKeyboardCodes.add(event.code);
    heldActions.add(action);
    noteTutorialActionInput(action);
  }
});
window.addEventListener('keyup', (event) => {
  if (shouldIgnoreGameplayKeyboardEvent(event)) return;
  if (launchCinematicBlocksInput()) {
    heldKeyboardCodes.delete(event.code);
    return;
  }
  if (flightControlCodes.has(event.code) || (aircraftGarage.isOpen() && (event.code === menuBindings.map || event.code === menuBindings.restart || event.code === menuBindings.menu))) event.preventDefault();
  const action = keyboardActionBindings[event.code];
  heldKeyboardCodes.delete(event.code);
  if (action && ![...heldKeyboardCodes].some((code) => keyboardActionBindings[code] === action)) heldActions.delete(action);
});
window.addEventListener('blur', () => {
  // Browser focus loss must not leave any flight input latched.
  clearHeldActions();
  mobileInput.reset();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearHeldActions();mobileInput.reset();}});

let throttle = 0;
let boostMeter = 100;
let boostActive = false;
// The reserve switches physics on/off immediately, while this short visual
// envelope gives the boost response a deliberate, readable surge and fade.
let boostVisualStrength = 0;
let speedBrakeStrength = 0;
let landingAssistActive = false;
let heading = 0;
let pitch = 0;
let roll = 0;
let pitchControlStrength = 0;
let yawControlStrength = 0;
let smoothedTouchSteering = { x: 0, y: 0 };
const pitchBeforeQuaternion = new THREE.Quaternion();
const pitchDeltaQuaternion = new THREE.Quaternion();
let lastPitchAxisLeakAt = -Infinity;
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const velocity = new THREE.Vector3();
const liftDirection = new THREE.Vector3();
const sideSlip = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const cameraOrbitOffset = new THREE.Vector3();
const cameraOrbitYawQuaternion = new THREE.Quaternion();
const cameraChaseQuaternion = new THREE.Quaternion();
const cameraOrbitInverseYawQuaternion = new THREE.Quaternion();
const cameraAircraftForward = new THREE.Vector3();
const cameraWorldUp = new THREE.Vector3(0, 1, 0);
const cameraFrameLocalBounds = new THREE.Box3();
const cameraFrameMeshBounds = new THREE.Box3();
const cameraFrameSize = new THREE.Vector3();
const cameraFrameRootInverse = new THREE.Matrix4();
const cameraFrameRelativeMatrix = new THREE.Matrix4();
const chaseCameraPosition = new THREE.Vector3();
const chaseLookTarget = new THREE.Vector3();
const orbitCameraPosition = new THREE.Vector3();
const orbitLookTarget = new THREE.Vector3();
const targetCameraRelativeOffset = new THREE.Vector3();
const smoothedCameraRelativeOffset = new THREE.Vector3();
const cameraOrbitFocusLocal = new THREE.Vector3();
let cameraOrbitYaw = 0;
let cameraOrbitPitch = 0;
let cameraOrbitRadius = 0;
let cameraOrbitRadiusTarget = 0;
let cameraOrbitBlend = 0;
let cameraOrbitDragging = false;
let cameraOrbitPointerId: number | null = null;
let cameraOrbitPointerX = 0;
let cameraOrbitPointerY = 0;
const cameraTouchPointers = new Map<number, { x: number; y: number }>();
let cameraPinchDistance = 0;
let cameraOrbitRecenterAt: number | null = null;
let cameraDistanceMultiplier = 1;
let defaultChaseDistance = 10;
let defaultChaseHeight = currentAircraft.cameraHeight;
let cameraFocusAhead = 1.5;
let smoothedChaseDistance = defaultChaseDistance;
let cameraFramingKey = '';
let cameraRelativeOffsetInitialized = false;
const lastValidCameraPosition = camera.position.clone();
const lastValidCameraQuaternion = camera.quaternion.clone();
let lastValidCameraFov = camera.fov;
let lastValidCameraFar = camera.far;
const flightLaunchOrbitPosition = new THREE.Vector3();
const flightLaunchOrbitTarget = new THREE.Vector3();
const flightLaunchCurrentTarget = new THREE.Vector3();
const flightLaunchSkipPosition = new THREE.Vector3();
const flightLaunchSkipTarget = new THREE.Vector3();
let flightLaunchSkipFov = CAMERA_CHASE_FOV;
let flightLaunchEngineLift = 0;

function setFlightLaunchChrome(opacity: number): void {
  const revealing = opacity > 0;
  flightGameRoot.style.setProperty('--launch-hud-opacity', revealing ? '1' : '0');
  document.body.style.setProperty('--launch-hud-opacity', revealing ? '1' : '0');
  flightGameRoot.classList.toggle('launch-cinematic-handoff', revealing);
}

function resetFlightLaunchInput(): void {
  clearHeldActions();
  mobileInput.reset();
  fireCooldown = 0;
  boostActive = false;
  boostVisualStrength = 0;
}

function beginFlightLaunchCinematic(): void {
  if (flightLaunchState !== 'pending' || trainingRequested || guidedTutorialActive) return;
  cinematicDirector.clearPresentation();
  flightLaunchState = 'active';
  flightLaunchStartedAt = performance.now();
  flightLaunchSkipStartedAt = undefined;
  flightLaunchEngineLift = 0;
  runStarted = false;
  resetFlightLaunchInput();
  resetCameraPointers();
  cameraOrbitBlend = 0;
  cameraOrbitRecenterAt = null;
  cameraRelativeOffsetInitialized = false;
  flightGameRoot.classList.remove('launch-cinematic-pending');
  flightGameRoot.classList.add('launch-cinematic-active');
  flightGameRoot.style.setProperty('--launch-hud-fade-duration', '500ms');
  document.body.style.setProperty('--launch-hud-fade-duration', '500ms');
  document.body.classList.remove('launch-cinematic-pending');
  document.body.classList.add('launch-cinematic-active');
  flightLaunchTitle.classList.add('is-visible');
  setFlightLaunchChrome(0);
}

function completeFlightLaunchCinematic(): void {
  if (flightLaunchState !== 'active') return;
  flightLaunchState = 'complete';
  flightLaunchEngineLift = 0;
  resetFlightLaunchInput();
  runStarted = true;
  cameraOrbitBlend = 0;
  cameraOrbitRecenterAt = null;
  cameraRelativeOffsetInitialized = false;
  flightLaunchTitle.classList.remove('is-visible');
  flightGameRoot.classList.remove('launch-cinematic-pending', 'launch-cinematic-active', 'launch-cinematic-handoff');
  flightGameRoot.style.removeProperty('--launch-hud-opacity');
  flightGameRoot.style.removeProperty('--launch-hud-fade-duration');
  document.body.style.removeProperty('--launch-hud-opacity');
  document.body.style.removeProperty('--launch-hud-fade-duration');
  document.body.classList.remove('launch-cinematic-pending', 'launch-cinematic-active');
  offerDallasPracticeSuggestion(serverProfile);
}

function cancelPendingFlightLaunch(): void {
  if (flightLaunchState !== 'pending') return;
  flightLaunchState = 'disabled';
  flightGameRoot.classList.remove('launch-cinematic-pending');
  document.body.classList.remove('launch-cinematic-pending');
}

function requestFlightLaunchSkip(): void {
  if (flightLaunchState !== 'active' || flightLaunchSkipStartedAt !== undefined) return;
  const now = performance.now();
  if (now - flightLaunchStartedAt < FLIGHT_LAUNCH_MIN_SKIP_MS) return;
  flightLaunchSkipStartedAt = now;
  flightLaunchSkipPosition.copy(camera.position);
  flightLaunchSkipTarget.copy(flightLaunchCurrentTarget);
  flightLaunchSkipFov = camera.fov;
  flightLaunchTitle.classList.remove('is-visible');
  flightGameRoot.style.setProperty('--launch-hud-fade-duration', `${FLIGHT_LAUNCH_SKIP_BLEND_MS}ms`);
  document.body.style.setProperty('--launch-hud-fade-duration', `${FLIGHT_LAUNCH_SKIP_BLEND_MS}ms`);
  setFlightLaunchChrome(1);
}

function applyFlightLaunchCamera(chasePosition: THREE.Vector3, chaseTarget: THREE.Vector3, chaseFov: number): boolean {
  if (flightLaunchState !== 'active') return false;
  const now = performance.now();
  if (flightLaunchSkipStartedAt !== undefined) {
    const skipProgress = smoothstep01((now - flightLaunchSkipStartedAt) / FLIGHT_LAUNCH_SKIP_BLEND_MS);
    camera.position.lerpVectors(flightLaunchSkipPosition, chasePosition, skipProgress);
    flightLaunchCurrentTarget.lerpVectors(flightLaunchSkipTarget, chaseTarget, skipProgress);
    camera.lookAt(flightLaunchCurrentTarget);
    const skipFov = THREE.MathUtils.lerp(flightLaunchSkipFov, chaseFov, skipProgress);
    if (Math.abs(camera.fov - skipFov) >= 0.01) {
      camera.fov = skipFov;
      camera.updateProjectionMatrix();
    }
    setFlightLaunchChrome(skipProgress);
    flightLaunchEngineLift = (1 - skipProgress) * 0.42;
    if (skipProgress >= 1) completeFlightLaunchCinematic();
    return true;
  }

  const elapsed = now - flightLaunchStartedAt;
  const progress = flightLaunchProgress(elapsed);
  const cinematicFov = 50;
  const horizontalHalfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(cinematicFov) * 0.5) * camera.aspect);
  const visualSpan = Math.max(cameraFrameSize.x, cameraFrameSize.z * 0.9, 4);
  const radius = Math.max(defaultChaseDistance * 0.86, visualSpan / (2 * 0.44 * Math.tan(horizontalHalfFov)));
  const orbitAngle = THREE.MathUtils.lerp(2.34, 0.32, progress.sweep);
  flightLaunchOrbitPosition.set(
    Math.sin(orbitAngle) * radius,
    Math.max(2.1, cameraFrameSize.y * 0.38),
    Math.cos(orbitAngle) * radius,
  ).applyQuaternion(airplane.quaternion).add(airplane.position);
  flightLaunchOrbitPosition.y = Math.max(
    flightLaunchOrbitPosition.y,
    groundPlaneY(flightLaunchOrbitPosition.x, flightLaunchOrbitPosition.z) + 1.7,
  );
  flightLaunchOrbitTarget.set(0, Math.max(1.25, cameraFrameSize.y * 0.32), 0)
    .applyQuaternion(airplane.quaternion).add(airplane.position);
  camera.position.lerpVectors(flightLaunchOrbitPosition, chasePosition, progress.handoff);
  flightLaunchCurrentTarget.lerpVectors(flightLaunchOrbitTarget, chaseTarget, progress.handoff);
  camera.lookAt(flightLaunchCurrentTarget);
  const launchFov = THREE.MathUtils.lerp(cinematicFov, chaseFov, progress.handoff);
  if (Math.abs(camera.fov - launchFov) >= 0.01) {
    camera.fov = launchFov;
    camera.updateProjectionMatrix();
  }
  setFlightLaunchChrome(progress.hudOpacity);
  flightLaunchTitle.classList.toggle('is-visible', elapsed < 1_050);
  flightLaunchEngineLift = THREE.MathUtils.lerp(0.08, 0.46, smoothstep01(elapsed / 1_500)) * (1 - progress.handoff * 0.2);
  if (progress.complete) completeFlightLaunchCinematic();
  return true;
}
const speedElement = document.querySelector<HTMLSpanElement>('#speed')!;
const fighterTrialIndicator = document.querySelector<HTMLDivElement>('#fighter-trial-indicator')!;
const landingSpeedCueElement = document.querySelector<HTMLDivElement>('#landing-speed-cue')!;
const landingStatus = { speedSafe: true, descentSafe: true, bankSafe: true, pitchSafe: true, alignmentSafe: true, bankAngle: 0, headingError: 0, reason: '', rough: false };
let lastLandingResult: { airportId: string; quality: number; grade: string; at: number } | undefined;

type NetworkTransform = {
  position: { x: number; y: number; z: number };
  altitudeMeters?: number;
  rotation: { x: number; y: number; z: number };
  aircraftType: AircraftType;
  cityId: CityId;
  displayName?: string;
  lifeState?: PlayerLifeState;
  isBot?: boolean;
  botPersonality?: 'explorer' | 'racer' | 'hunter' | 'casual';
  boostActive?: boolean;
  health?: number;
  maxHealth?: number;
  equippedCosmetics?: Record<string, string>;
};

type NetworkPlayer = NetworkTransform & { playerId: string };
type PlayerLifeState = 'alive' | 'destroyed' | 'respawning';

type LeaderboardPlayer = HumanRosterEntry & {
  cityId: CityId;
  entityType: EntityType;
  isBot: boolean;
  aircraftType: AircraftType;
  lifeState: PlayerLifeState;
  position: NetworkVector;
};

function updateHumanRosterStatus(playerId: string, status: HumanRosterEntry['status']): void {
  const player = cityHumanRoster.get(playerId);
  if (!player || player.status === status) return;
  player.status = status;
  playersPanel.update([...cityHumanRoster.values()], localPlayerId, ownedTerritoriesForPlayer);
}

function humanHasActiveAircraft(player: HumanRosterEntry): boolean {
  return player.status === 'flying' || player.status === 'onGround' || player.status === 'spawnSafe';
}

type NetworkVector = { x: number; y: number; z: number };
type ProjectileMode = 'ballistic';
type NetworkHeatState = { playerId: string; value: number; level: number; multiplier: number; levelChanged?: boolean };
type DynamicEventType = 'skyRush' | 'supplyDrop' | 'emergencyEscort' | 'cargoConvoy' | 'riskZone' | 'mostWanted' | 'aceIntercept' | 'vipEscort' | 'goldenSkyRun' | 'cityEmergency' | 'stormLanding' | 'fogApproach' | 'cargoRush' | 'soloAirportSprint';
type DynamicEventLifecycle = 'available' | 'active' | 'completed' | 'failed' | 'cooldown';
type NetworkCityEvent = {
  id: string;
  cityId: CityId;
  eventType: DynamicEventType;
  lifecycle: DynamicEventLifecycle;
  name: string;
  objective: NetworkVector;
  route: NetworkVector[];
  activeAt: number;
  expiresAt: number;
  participantCount: number;
  rankings: Array<{ playerId: string; progress: number }>;
  eventAircraft: Array<{ routeId: string; position: NetworkVector; direction: NetworkVector; aircraftType?: AircraftType; eventCombatMode?: 'noncombat' | 'attackable' }>;
  wantedPlayerId?: string;
  riskMode?: 'storm' | 'lowAltitude' | 'highAltitude' | 'downtownDanger';
  riskRadius: number;
  goldenDrop?: boolean;
  rare?: boolean;
  bossHealth?: number;
  bossMaxHealth?: number;
  rewardCredits?: number;
};
type NetworkSocialState = { kingPlayerId?: string };
type NetworkObjectiveItem = { id: string; label: string; activity: string; target: number; progress: number; reward: number; completed: boolean; rewarded: boolean };
type NetworkObjectiveCycle = { dailyId: string; weeklyId: string; daily: NetworkObjectiveItem[]; weekly: NetworkObjectiveItem[]; dailyBonusAwarded: boolean; weeklyBonusAwarded: boolean };
type NetworkMastery = { xp: number; level: number; unlockedRewards: string[] };
type NetworkMissionAttempt = { missionId: string; attemptId: string; startedAt: number; updatedAt: number; progress: number; holdStartedAt?: number; flightStartedAt?: number; heading?: number; distanceMeters?: number; completedIds: string[]; ownedTerritoryIds?: string[]; targetId?: string; eventId?: string; sequenceIndex?: number };
type NetworkMissionCityState = { active?: NetworkMissionAttempt; completions: Record<string, { count: number; lastCompletedAt: number }> };
type NetworkWeeklyLeaderboard = { category: string; weekId: string; top: Array<{ pilotId: string; pilotName: string; value: number }>; localRank?: number };
type NetworkTerritoryState = {
  id: string;
  controllerId?: string;
  controllerName?: string;
  capturingPlayerId?: string;
  defenderBotId?: string;
  captureProgress: number;
  contested: boolean;
  captureContested?: boolean;
};
type NetworkProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
  skyTokens?: number;
  creditRevision: number;
  score: number;
  economyVersion: number;
  aircraftEntitlements: string[];
  testerCodeEnabled: boolean;
  fighterTrial: { status: 'available' | 'pending' | 'active' | 'consumed'; startedAt?: number; expiresAt?: number; completedReportedAt?: number };
  selectedAircraft: AircraftType;
  unlockedAircraft: AircraftType[];
  totalDistance: number;
  successfulLandings: number;
  kills: number;
  deaths: number;
  discoveries: Partial<Record<CityId, string[]>>;
  challengeCompletions: number;
  eventCompletions: number;
  objectives: Partial<Record<CityId, NetworkObjectiveCycle>>;
  mastery: Partial<Record<CityId, NetworkMastery>>;
  missions: Partial<Record<CityId, NetworkMissionCityState>>;
  legacyImportPending: boolean;
  pilotProgress: { xp: number; level: number; title: string; nextLevelXp: number };
  dailyStreak: { current: number; longest: number; cycleDay: number; lastClaimDay?: string; nextReward: number };
  personalRecords: Record<string, { value: number; cityId?: CityId; achievedAt: number }>;
  weeklyReward?: { weekId: string; rank: number; category: string; credits: number; badge: string; badgeExpiresAt: number };
  referral: { code: string; status: 'none' | 'pending' | 'qualified' | 'rewarded'; rewardedCount: number };
  cosmetics: { ownedIds: string[]; equipped: Record<string, string> };
  intercityRoute?: {routeId:string;fromCityId:CityId;toCityId:CityId;startedAt:number};
  tutorial:{version:'tutorial_v1';status:'new'|'started'|'completed'|'skipped';completedAt?:number};
  season?: { seasonId:string;name:string;theme:string;startsAt:number;endsAt:number;points:number;
    rewards:Array<{id:string;points:number;label:string;state:'locked'|'claimable'|'claimed'}>;
    missions:Array<{id:string;label:string;progress:number;target:number;completed:boolean}>;
    weeklyEvent?:{weeklyEventId:string;title:string;description:string;progress:number;target:number;completed:boolean;rewarded:boolean;weekEnd:number} };
};

type ServerMessage =
  | {
      type: 'welcome';
      protocolVersion: number;
      selectionRevision: number;
      playerId: string;
      pilotId: string;
      cityId: CityId;
      spawnPosition: { x: number; y: number; z: number };
      spawnAirportId?: string;
      health: number;
      maxHealth: number;
      tutorialMode: boolean;
      tutorialSteps: Record<TutorialLessonStep,TutorialStepStatus>;
      activeAircraftType: AircraftType;
      lifeState?: PlayerLifeState;
      players: NetworkPlayer[];
      event?: NetworkCityEvent;
      social?: NetworkSocialState;
      heatStates?: NetworkHeatState[];
      territories?: NetworkTerritoryState[];
      weeklyLeaderboards?: NetworkWeeklyLeaderboard[];
      repairCooldowns?: Array<{ id: string; remainingMs: number }>;
      profile: NetworkProfile;
    }
  | { type: 'protocolMismatch'; expectedProtocolVersion: number }
  | { type: 'equipRejected'; reason: string; equipRequestId: number }
  | { type: 'aircraftPurchaseResult'; purchaseRequestId: number; aircraftType?: unknown; ok: boolean; reason?: string }
  | { type: 'testerCodeResult'; ok: boolean; reason: string }
  | { type: 'fighterTrialResult'; ok: boolean; reason?: string }
  | { type: 'missionState'; cityId: CityId; state: NetworkMissionCityState }
  | { type: 'missionResult'; missionId: string; ok: boolean; reason?: string; confirmationRequired?: boolean; attemptId?: string }
  | { type: 'missionCompleted'; missionId: string; credits: number; score: number }
  | { type: 'missionFailed'; missionId: string; reason: string }
  | { type: 'journeyAttempt'; attempt: JourneyAttemptState; serverNow: number }
  | { type: 'journeyGateTooHigh'; gateIndex: number }
  | { type: 'journeyUnavailable'; reason: string }
  | { type: 'firehawkPromotionReady'; missionId: string }
  | { type: 'firehawkPromotionOffer'; missionId: string; trialEligible: boolean; displayPrice: string }
  | { type: 'weeklyLeaderboards'; weeklyLeaderboards: NetworkWeeklyLeaderboard[] }
  | { type: 'weeklyRewardClaimed'; reward: { rank: number; category: string; credits: number; badge: string } }
  | { type: 'takeoffConfirmed'; airportId?: string; confirmedAt: number }
  | { type: 'tutorialSignal'; signal: 'airborne' | 'targetInRange' | 'targetLocked' | 'targetHit' | 'completed' }
  | { type:'tutorialStepResult';ok:boolean;step:TutorialLessonStep;status:Exclude<TutorialStepStatus,'pending'>;nextStep?:TutorialLessonStep;steps:Record<TutorialLessonStep,TutorialStepStatus>;reason?:string }
  | { type:'tutorialRunReset';reason:'crash'|'replay';nextStep:TutorialLessonStep;steps:Record<TutorialLessonStep,TutorialStepStatus> }
  | { type:'tutorialLandingApproach';airportId:string;position:{x:number;y:number;z:number};heading:number;speed:number }
  | { type: 'tutorialTarget'; targetId: string }
  | { type: 'pilotLevelUp'; level: number; title?: string }
  | { type: 'landingScored'; airportId: string; quality: number; score: number; credits: number; grade: 'ROUGH' | 'SAFE' | 'SMOOTH' | 'PERFECT' | 'LEGENDARY' }
  | { type: 'cosmeticResult'; action: 'purchase' | 'equip'; cosmeticId: string; ok: boolean; reason?: string }
  | { type: 'cosmeticChanged'; playerId: string; equipped: Record<string, string> }
  | { type:'intercityRouteResult';ok:boolean;reason?:string;routeId?:string;toCityId?:CityId }
  | { type: 'pvpChallengeInvite'; challenge: { id: string; mode: 'dogfight' | 'airportSprint'; challengerId: string; opponentId: string; expiresAt: number } }
  | { type: 'pvpChallengeState'; challenge: { id: string; mode: 'dogfight' | 'airportSprint'; status: string; expiresAt: number; startsAt?: number } }
  | { type: 'pvpChallengeCancelled'; challengeId: string }
  | { type: 'pvpChallengeResult'; challengeId: string; winnerId: string; rewarded: boolean }
  | ({ type: 'state' } & NetworkPlayer)
  | { type: 'remove'; playerId: string }
  | { type: 'leaderboard'; cityId: CityId; players: LeaderboardPlayer[] }
  | {
      type: 'projectileSpawn';
      projectileId: string;
      ownerId: string;
      position: NetworkVector;
      direction: NetworkVector;
      speed: number;
      mode: ProjectileMode;
      clientShotId?: string;
    }
  | {
      type: 'projectileStates';
      projectiles: Array<{
        projectileId: string;
        position: NetworkVector;
        direction: NetworkVector;
        mode: ProjectileMode;
      }>;
    }
  | {
      type: 'assistedShot';
      shotId: string;
      ownerId: string;
      targetId: string;
      origin: NetworkVector;
      targetPosition: NetworkVector;
      clientShotId?: string;
    }
  | { type: 'lockState'; targetId?: string; candidateId?: string; aimX: number; aimY: number; aimId: number }
  | { type: 'combatThreat'; attackerId: string; locked: boolean }
  | { type: 'incomingFire'; attackerId: string }
  | ({ type: 'heatState' } & NetworkHeatState)
  | { type: 'territoryState'; cityId: CityId; territories: NetworkTerritoryState[] }
  | { type: 'territoryNotice'; territoryId: string; kind: 'enter' | 'exit' | 'captured' | 'underAttack' | 'defenderInbound'; attackerName?: string }
  | { type: 'territoryReward'; territoryId: string; score: number; credits: number; kind: 'capture' | 'control' }
  | { type: 'objectiveComplete'; objectiveId: string; label: string; credits: number }
  | { type: 'objectiveProgress'; label: string; progress: number; target: number }
  | { type: 'masteryLevel'; cityId: CityId; level: number; rewards: string[] }
  | { type: 'challengeComplete'; challengeId: string; score: number; credits: number }
  | { type: 'projectileRemove'; projectileId: string }
  | { type: 'damage'; playerId: string; shooterId: string; health: number; maxHealth: number; damage: number }
  | { type: 'repair'; playerId: string; sourceId: string; full: boolean; health: number; maxHealth: number; cooldownMs?: number }
  | {
      type: 'destroyed';
      playerId: string;
      position?: NetworkVector;
      aircraftType?: AircraftType;
      killerId: string;
      killerDisplayName: string;
      victimDisplayName: string;
      killerScore: number;
      killerReward?: number;
      cause?: 'combat' | 'collision';
    }
  | { type: 'respawn'; playerId: string; health: number; maxHealth: number; lifeState?: PlayerLifeState; spawnPosition?: NetworkVector; spawnHeading?: number }
  | ({ type: 'playerState'; health: number; maxHealth: number; lifeState: PlayerLifeState } & NetworkPlayer)
  | { type: 'eventState'; event: NetworkCityEvent }
  | { type: 'eventClear' }
  | { type: 'eventAnnouncement'; eventId: string; name?: string; reward?: number; expiresAt: number }
  | { type: 'eventReward'; eventId: string; score: number; credits: number; reason: string }
  | { type: 'eventProgress'; eventId: string; message: string; progress: number; target?: { x:number; z:number } }
  | { type: 'socialState'; kingPlayerId?: string }
  | { type: 'formationState'; memberIds: string[]; active: boolean }
  | { type: 'socialReward'; score: number; credits: number; reason: string }
  | { type: 'chaosState'; multiplier: number; action: string; score: number; pendingCredits: number }
  | { type: 'chaosReward'; credits: number; reason: string }
  | { type: 'profile'; profile: NetworkProfile; rewardId?: string; creditReceipt?: CreditReceipt; selectionRevision: number; equipRequestId?: number; creditReason?: string; preserveActiveAircraft?: boolean; serverReset?: boolean };

function createSafeNetworkProfile(): NetworkProfile {
  return {
    pilotId: persistedPlayer.pilotId,
    pilotName: persistedPlayer.displayName,
    credits: persistedPlayer.credits,
    skyTokens: 0,
    creditRevision: 0,
    score: persistedPlayer.bestScore,
    economyVersion: 0,
    aircraftEntitlements: [],
    testerCodeEnabled: false,
    fighterTrial: { status: 'available' },
    selectedAircraft: 'trainer',
    unlockedAircraft: ['trainer'],
    totalDistance: persistedPlayer.totalDistance,
    successfulLandings: persistedPlayer.successfulLandings,
    kills: 0,
    deaths: 0,
    discoveries: persistedPlayer.discoveries,
    challengeCompletions: 0,
    eventCompletions: 0,
    objectives: {},
    mastery: {},
    missions: {},
    pilotProgress: { xp: 0, level: 1, title: 'ROOKIE', nextLevelXp: 125 },
    dailyStreak: { current: 0, longest: 0, cycleDay: 0, nextReward: 50 },
    personalRecords: {},
    referral: { code: '---- ----', status: 'none', rewardedCount: 0 },
    cosmetics: { ownedIds: [], equipped: {} },
    tutorial:{version:'tutorial_v1',status:'new'},
    // This local placeholder is never awarded from. It keeps the profile
    // session structurally safe until a version-validated server welcome.
    legacyImportPending: true,
  };
}

function isNetworkProfile(value: unknown): value is NetworkProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<NetworkProfile>;
  return typeof profile.pilotId === 'string' &&
    typeof profile.pilotName === 'string' &&
    typeof profile.credits === 'number' && Number.isFinite(profile.credits) && profile.credits >= 0 &&
    (profile.skyTokens === undefined || (Number.isSafeInteger(profile.skyTokens) && profile.skyTokens >= 0)) &&
    typeof profile.creditRevision === 'number' && Number.isSafeInteger(profile.creditRevision) && profile.creditRevision >= 0 &&
    typeof profile.score === 'number' && Number.isFinite(profile.score) && profile.score >= 0 &&
    typeof profile.economyVersion === 'number' && Number.isSafeInteger(profile.economyVersion) && profile.economyVersion >= 0 &&
    Array.isArray(profile.aircraftEntitlements) && profile.aircraftEntitlements.every((entry) => typeof entry === 'string') &&
    typeof profile.testerCodeEnabled === 'boolean' &&
    !!profile.fighterTrial && ['available', 'pending', 'active', 'consumed'].includes(profile.fighterTrial.status) &&
    isAircraftType(profile.selectedAircraft) &&
    Array.isArray(profile.unlockedAircraft) && profile.unlockedAircraft.every(isAircraftType) &&
    typeof profile.totalDistance === 'number' && Number.isFinite(profile.totalDistance) && profile.totalDistance >= 0 &&
    typeof profile.successfulLandings === 'number' && Number.isFinite(profile.successfulLandings) && profile.successfulLandings >= 0 &&
    typeof profile.kills === 'number' && Number.isFinite(profile.kills) && profile.kills >= 0 &&
    typeof profile.deaths === 'number' && Number.isFinite(profile.deaths) && profile.deaths >= 0 &&
    !!profile.discoveries && typeof profile.discoveries === 'object' &&
    typeof profile.challengeCompletions === 'number' && Number.isFinite(profile.challengeCompletions) && profile.challengeCompletions >= 0 &&
    typeof profile.eventCompletions === 'number' && Number.isFinite(profile.eventCompletions) && profile.eventCompletions >= 0 &&
    !!profile.objectives && typeof profile.objectives === 'object' &&
    !!profile.mastery && typeof profile.mastery === 'object' &&
    !!profile.missions && typeof profile.missions === 'object' &&
    typeof profile.legacyImportPending === 'boolean';
}

let serverProfile: NetworkProfile = createSafeNetworkProfile();
type ClientAccountState = { state: 'guest' | 'account'; email?: string; avatarUrl?: string; providers?: { password: boolean; google: boolean; apple: boolean } };
let clientAccount: ClientAccountState = { state: 'guest', providers: { password: false, google: false, apple: false } };

function updateAuthHudControl(): void {
  const authenticated = clientAccount.state === 'account';
  flightAccountButtonElement.classList.add('is-account');
  flightAccountButtonElement.setAttribute('aria-label', 'Open profile');
  flightAccountButtonElement.title = 'Profile';
  flightAccountAvatarElement.hidden = true;
  flightAccountAvatarElement.removeAttribute('src');
  flightAccountLabelElement.hidden = false;
  flightAccountLabelElement.classList.add('avatar-fallback');
  if (!authenticated || !clientAccount.avatarUrl) return;
  flightAccountAvatarElement.src = clientAccount.avatarUrl;
  flightAccountAvatarElement.hidden = false;
  flightAccountLabelElement.hidden = true;
}

flightAccountAvatarElement.addEventListener('load', () => {
  if (clientAccount.state === 'account' && flightAccountAvatarElement.currentSrc) flightAccountLabelElement.hidden = true;
});
flightAccountAvatarElement.addEventListener('error', () => {
  flightAccountAvatarElement.hidden = true;
  flightAccountAvatarElement.removeAttribute('src');
  flightAccountLabelElement.hidden = false;
});
updateAuthHudControl();

function cacheIdentityTransitionProfile(profile: NetworkProfile): void {
  identityTransitionInProgress = true;
  window.clearTimeout(progressSaveTimer);
  progressSaveTimer = undefined;
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({
      version: 1,
      pilotId: profile.pilotId,
      credits: profile.credits,
      selectedAircraft: profile.selectedAircraft,
      displayName: profile.pilotName,
      muted: audioManager.isMuted(),
      bestScore: profile.score,
      discoveries: profile.discoveries,
      totalDistance: profile.totalDistance,
      successfulLandings: profile.successfulLandings,
      hintsEnabled: contextualHints.isEnabled(),
      dismissedHints: contextualHintDismissed,
      navigationMarkersEnabled,
      onboardingSeen: persistedPlayer.onboardingSeen,
    } satisfies PersistedPlayer));
  } catch { /* the secure session still controls the next profile load */ }
}

async function accountRequest(path: 'logout' | 'pilot-name', payload: Record<string, string> = {}): Promise<{ ok: boolean; message: string }> {
  const rotatesIdentity = path !== 'pilot-name';
  if (rotatesIdentity) identityTransitionInProgress = true;
  try {
    const response = await apiFetch(apiUrl(`/api/auth/${path}`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json() as { error?: string; message?: string; account?: ClientAccountState; profile?: unknown; guestPreserved?: boolean };
    if (!response.ok) {
      if (rotatesIdentity) identityTransitionInProgress = false;
      return { ok: false, message: result.error ?? 'ACCOUNT REQUEST FAILED' };
    }
    if (result.account) clientAccount = result.account;
    if (path === 'logout') await clearNativeProviderState();
    if (path === 'pilot-name' && result.profile) applyServerProfile(result.profile);
    else if (result.profile && isNetworkProfile(result.profile)) cacheIdentityTransitionProfile(result.profile);
    updateAuthHudControl();
    if (pilotMenu.isOpen()) renderPilotMenu();
    if (rotatesIdentity) reconnectRealtimeSession();
    showProgressMessage(result.message ?? 'ACCOUNT UPDATED');
    return { ok: true, message: result.message ?? 'ACCOUNT UPDATED' };
  } catch {
    if (rotatesIdentity) identityTransitionInProgress = false;
    return { ok: false, message: 'ACCOUNT SERVICE UNAVAILABLE' };
  }
}

async function providerAccountRequest(provider: 'google' | 'apple', action: 'login'): Promise<{ ok: boolean; message: string }> {
  if (clientAccount.state === 'account') {
    return { ok: false, message: "You're already signed in. Log out first to use another account." };
  }
  try {
    if (nativeAuthPlatform) {
      if (!availableNativeProviders.includes(provider)) return { ok: false, message: 'THIS PROVIDER IS NOT AVAILABLE ON THIS DEVICE' };
      const startResponse = await apiFetch(apiUrl('/api/auth/native/start'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action }),
      });
      const challenge = await startResponse.json() as Partial<NativeAuthChallenge> & { error?: string };
      if (!startResponse.ok || challenge.provider !== provider || challenge.platform !== nativeAuthPlatform ||
        typeof challenge.state !== 'string' || typeof challenge.nonce !== 'string') {
        return { ok: false, message: challenge.error ?? 'PROVIDER SIGN-IN UNAVAILABLE' };
      }
      const credential = await acquireNativeCredential(challenge as NativeAuthChallenge);
      if (credential.cancelled) return { ok: true, message: 'SIGN-IN CANCELLED' };
      const completionBody = JSON.stringify({
        provider,
        state: challenge.state,
        idToken: credential.idToken,
        ...(credential.displayName ? { displayName: credential.displayName } : {}),
      });
      credential.idToken = '';
      const completeResponse = await apiFetch(apiUrl('/api/auth/native/complete'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: completionBody,
      });
      const result = await completeResponse.json() as { error?: string; message?: string; account?: ClientAccountState; profile?: unknown };
      if (!completeResponse.ok || !result.account || !result.profile || !isNetworkProfile(result.profile)) {
        return { ok: false, message: result.error ?? 'PROVIDER SIGN-IN FAILED' };
      }
      identityTransitionInProgress = true;
      clientAccount = result.account;
      cacheIdentityTransitionProfile(result.profile);
      updateAuthHudControl();
      if (pilotMenu.isOpen()) renderPilotMenu();
      reconnectRealtimeSession();
      showProgressMessage(result.message ?? 'ACCOUNT LOADED');
      return { ok: true, message: result.message ?? 'ACCOUNT LOADED' };
    }
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.delete('auth'); returnUrl.searchParams.delete('provider'); returnUrl.searchParams.delete('linked');
    const response = await apiFetch(apiUrl('/api/auth/oauth/start'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, action, returnTo: returnUrl.toString() }),
    });
    const result = await response.json() as { authorizationUrl?: string; error?: string };
    if (!response.ok || !result.authorizationUrl) return { ok: false, message: result.error ?? 'PROVIDER SIGN-IN UNAVAILABLE' };
    window.location.assign(result.authorizationUrl);
    return { ok: true, message: `OPENING ${provider.toUpperCase()}…` };
  } catch { return { ok: false, message: 'ACCOUNT SERVICE UNAVAILABLE' }; }
}

async function refreshAccountStatus(reconnectOnIdentityChange = false): Promise<void> {
  try {
    const response = await apiFetch(apiUrl('/api/auth/status'), { cache: 'no-store' });
    const result = await response.json() as { account?: ClientAccountState; profile?: unknown };
    if (!response.ok || !result.account) return;
    const previousState = clientAccount.state;
    clientAccount = result.account;
    updateAuthHudControl();
    if (pilotMenu.isOpen()) renderPilotMenu();
    if ((profileHydrated || reconnectOnIdentityChange) && result.profile && isNetworkProfile(result.profile) &&
      (result.profile.pilotId !== serverProfile.pilotId || previousState !== result.account.state)) {
      identityTransitionInProgress = true;
      cacheIdentityTransitionProfile(result.profile);
      reconnectRealtimeSession();
    }
  } catch { /* gameplay remains available as a guest */ }
}
let activeMissionAttemptId: string | undefined;
const profileActiveMissionCity = (profile: NetworkProfile): CityId | undefined =>
  profile.missions[cityId]?.active ? cityId : (['dallas', 'milwaukee'] as const).find((id) => profile.missions[id]?.active);
const profileActiveMissionAttempt = (profile: NetworkProfile): NetworkMissionAttempt | undefined =>
  profile.missions[profileActiveMissionCity(profile) ?? cityId]?.active;
let profileHydrated = false;
let selectionRevision = 0;
let authoritativeSelectionApplied = false;
let legacyImportSent = false;

type RemotePlayer = {
  playerId: string;
  cityId: CityId;
  entityType: EntityType;
  isBot: boolean;
  botPersonality?: NetworkTransform['botPersonality'];
  displayName: string;
  altitudeMeters?: number;
  ownershipAccent?: string;
  ownershipSignature?: string;
  identityTag: THREE.Sprite;
  hullTag: THREE.Sprite;
  targetBrackets: THREE.Sprite;
  playerProxy: THREE.Sprite;
  plane: THREE.Group;
  previousPosition: THREE.Vector3;
  previousQuaternion: THREE.Quaternion;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  interpolationElapsed: number;
  interpolationDuration: number;
  timeSinceUpdate: number;
  nearMissActive: boolean;
  aircraftType: AircraftType;
  lifeState: PlayerLifeState;
  heatLevel: number;
  boostActive: boolean;
  health: number;
  maxHealth: number;
  lastHitAt: number;
};

type ClientProjectile = {
  mesh: THREE.Group;
  direction: THREE.Vector3;
  authoritativePosition: THREE.Vector3;
  pendingAge: number;
  speed: number;
  local: boolean;
  ownerIsBot: boolean;
  ownerId: string;
  spawnedAt: number;
  lastAuthoritativeAt: number;
};

type AssistedShotVisual = {
  shotId: string;
  mesh: THREE.Group;
  origin: THREE.Vector3;
  targetPosition: THREE.Vector3;
  targetId: string;
  ownerId: string;
  elapsed: number;
  duration: number;
};

function paintPlayerIdentityTag(label: THREE.Sprite, name: string, type: AircraftType, king: boolean, isBot: boolean,
  ownershipColors: readonly string[], distance = 0, targeted = false, locked = false, missionTarget = false,
  altitudeMeters?: number, missionTargetName = 'HUNTER'): void {
  const canvas = label.userData.canvas as HTMLCanvasElement;
  const band = distance <= 900 ? 'close' : distance <= 3_000 ? 'mid' : 'far';
  const distanceText = distance < 1_000 ? `${Math.round(distance / 10) * 10}m` : `${(distance / 1_000).toFixed(1)} km`;
  const altitudeText = typeof altitudeMeters === 'number' && Number.isFinite(altitudeMeters)
    ? `${formatPilotAltitude(altitudeMeters)} FT` : '';
  const signature = `${name}|${type}|${king}|${isBot}|${ownershipColors.join(',')}|${band}|${distanceText}|${targeted}|${locked}|${missionTarget}|${missionTargetName}|${altitudeText}`;
  if (label.userData.signature === signature) return;
  label.userData.signature = signature;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const identityColor = visualLanguage[isBot ? 'ai' : 'player'].color;
  context.fillStyle = 'rgba(6, 20, 30, 0.84)';
  context.fillRect(2, 2, 316, 76);
  context.strokeStyle = missionTarget ? visualLanguage.mission.color : identityColor;
  context.lineWidth = locked ? 5 : targeted || missionTarget ? 4 : 3;
  context.strokeRect(3, 3, 314, 74);
  for (let index = 0; index < Math.min(3, ownershipColors.length); index += 1) {
    context.beginPath(); context.arc(23 + index * 20, 29, 7, 0, Math.PI * 2);
    context.fillStyle = ownershipColors[index]; context.fill();
    context.strokeStyle = '#06141e'; context.lineWidth = 2; context.stroke();
  }
  context.fillStyle = '#f3fbff';
  context.font = '800 27px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const prefix = missionTarget ? '🎯 ' : king && !isBot ? '♛ ' : '';
  const title = band === 'close' ? `${prefix}${name}` : `${prefix}${name} · ${distanceText}`;
  context.fillText(title, ownershipColors.length ? 191 : 160, 29, ownershipColors.length ? 238 : 292);
  context.fillStyle = missionTarget ? visualLanguage.mission.color : identityColor;
  context.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  const detail = missionTarget ? `MISSION TARGET · ${missionTargetName}` : band === 'close'
    ? `${isBot ? 'AI · ' : ''}${aircraftDefinitions[type].callsign} · ${distanceText}`
    : isBot ? 'AI PILOT' : locked ? 'LOCKED' : targeted ? 'TARGET' : 'REAL PLAYER';
  context.fillText(altitudeText ? `${detail} · ${altitudeText}` : detail, 160, 59, 292);
  (label.material as THREE.SpriteMaterial).map!.needsUpdate = true;
}

function createPlayerIdentityTag(name: string, type: AircraftType, king = false, isBot = false, ownershipColors: readonly string[] = []): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const label = new THREE.Sprite(material);
  label.userData.canvas = canvas;
  label.userData.ownershipColors = ownershipColors;
  label.scale.set(12, 3, 1);
  label.renderOrder = 7;
  paintPlayerIdentityTag(label, name, type, king, isBot, ownershipColors);
  return label;
}

function disposePlayerIdentityTag(label: THREE.Sprite): void {
  const material = label.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}

function createRemoteHullTag(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 190;
  canvas.height = 22;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  label.scale.set(9.5, 1.1, 1);
  label.renderOrder = 5;
  label.userData.canvas = canvas;
  return label;
}

function paintRemoteHullTag(label: THREE.Sprite, value: number, maximum: number): void {
  const canvas = label.userData.canvas as HTMLCanvasElement;
  const context = canvas.getContext('2d')!;
  const ratio = THREE.MathUtils.clamp(value / Math.max(1, maximum), 0, 1);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(6, 15, 18, 0.70)';
  context.fillRect(0, 3, canvas.width, 16);
  context.fillStyle = ratio <= 0.25 ? '#fa6d65' : ratio <= 0.5 ? '#f7c864' : '#79d99c';
  context.fillRect(4, 7, 66 * ratio, 8);
  context.strokeStyle = 'rgba(220, 245, 250, 0.55)';
  context.strokeRect(4, 7, 66, 8);
  context.fillStyle = '#e8f6f8';
  context.font = '700 11px ui-monospace, monospace';
  context.textBaseline = 'middle';
  context.fillText(`PLANE LIFE ${Math.round(value)}/${maximum}`, 77, 11);
  const texture = (label.material as THREE.SpriteMaterial).map;
  if (texture) texture.needsUpdate = true;
}

function disposeRemoteHullTag(label: THREE.Sprite): void {
  const material = label.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}

function refreshPlayerIdentityTag(remote: RemotePlayer): void {
  scene.remove(remote.identityTag);
  disposePlayerIdentityTag(remote.identityTag);
  const ownershipColors = ownedTerritoriesForPlayer(remote.playerId).map(({ color }) => color);
  remote.ownershipAccent = ownershipColors[0];
  remote.ownershipSignature = ownershipColors.join('|');
  remote.identityTag = createPlayerIdentityTag(remote.displayName, remote.aircraftType, remote.playerId === kingPlayerId, remote.isBot, ownershipColors);
  remote.identityTag.visible = false;
  remote.identityTag.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, 5.2);
  scene.add(remote.identityTag);
}

function refreshAllPlayerIdentityTags(): void {
  for (const remote of remotePlayers.values()) refreshPlayerIdentityTag(remote);
}

function createTargetBrackets(isBot: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = visualLanguage[isBot ? 'ai' : 'player'].color;
  context.lineWidth = 5;
  context.stroke(new Path2D(targetBracketPath));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const brackets = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  brackets.scale.set(14, 14, 1);
  brackets.position.set(0, 3, 0);
  brackets.visible = false;
  brackets.renderOrder = 5;
  return brackets;
}

function disposeTargetBrackets(brackets: THREE.Sprite): void {
  const material = brackets.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}

// Restore the existing colored aircraft contact icon. It is a billboard HUD
// marker above the true-scale model, not a substitute for the model itself.
function createRemotePlayerProxy(isBot: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(48, 3);
  context.lineTo(59, 25);
  context.lineTo(91, 37);
  context.lineTo(58, 42);
  context.lineTo(51, 61);
  context.lineTo(45, 61);
  context.lineTo(38, 42);
  context.lineTo(5, 37);
  context.lineTo(37, 25);
  context.closePath();
  context.shadowBlur = 0;
  context.strokeStyle = '#10202b';
  context.lineWidth = 8;
  context.stroke();
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: visualLanguage[isBot ? 'ai' : 'player'].color,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity: 0,
  });
  const proxy = new THREE.Sprite(material);
  proxy.renderOrder = 6;
  proxy.visible = false;
  return proxy;
}

function disposeRemotePlayerProxy(proxy: THREE.Sprite): void {
  const material = proxy.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}

type FlashEffect = {
  mesh: THREE.Group;
  coreMaterial: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
};

type DestructionEffect = {
  group: THREE.Group;
  flash: THREE.Mesh;
  flashMaterial: THREE.MeshBasicMaterial;
  fire: THREE.Mesh;
  fireMaterial: THREE.MeshBasicMaterial;
  smoke: THREE.Mesh;
  smokeMaterial: THREE.MeshBasicMaterial;
  debrisMaterial: THREE.MeshBasicMaterial;
  debris: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3 }>;
  elapsed: number;
  scale: number;
};

const remotePlayers = new Map<string, RemotePlayer>();
const remoteStateStaleSeconds = 3;
const lockingThreatIds = new Set<string>();
const lockingThreatSeenAt = new Map<string, number>();
const threatOffset = new THREE.Vector3();
const threatForward = new THREE.Vector3();
let incomingFireAttackerId: string | null = null;
let incomingFireUntil = -Infinity;

function clearCombatThreats(): void {
  lockingThreatIds.clear();
  lockingThreatSeenAt.clear();
  incomingFireAttackerId = null;
  incomingFireUntil = -Infinity;
  combatThreatWarningElement.classList.add('hidden');
  combatThreatWarningElement.classList.remove('incoming');
}

function applyCombatThreat(attackerId: string, locked: boolean): void {
  if (!attackerId || attackerId === localPlayerId) return;
  if (!locked) {
    lockingThreatIds.delete(attackerId);
    lockingThreatSeenAt.delete(attackerId);
    if (incomingFireAttackerId === attackerId) {
      incomingFireAttackerId = null;
      incomingFireUntil = -Infinity;
    }
    return;
  }
  lockingThreatSeenAt.set(attackerId, performance.now());
  if (lockingThreatIds.has(attackerId)) return;
  lockingThreatIds.add(attackerId);
  playLockWarningSound();
}

function applyIncomingFire(attackerId: string): void {
  // WebSocket ordering guarantees the authoritative lock transition arrives
  // first. Reject stale or unrelated fire events on the client as well.
  if (!lockingThreatIds.has(attackerId)) return;
  incomingFireAttackerId = attackerId;
  incomingFireUntil = performance.now() + 1_200;
  playIncomingWarningSound();
}

function threatDirection(attacker: RemotePlayer): string {
  threatOffset.copy(attacker.plane.position).sub(airplane.position);
  threatForward.set(0, 0, -1).applyQuaternion(airplane.quaternion);
  threatForward.y = 0;
  if (threatForward.lengthSq() < 0.0001) threatForward.set(0, 0, -1);
  else threatForward.normalize();
  const right = threatOffset.x * -threatForward.z + threatOffset.z * threatForward.x;
  const ahead = threatOffset.x * threatForward.x + threatOffset.z * threatForward.z;
  return combatThreatDirection(right, ahead);
}

function updateCombatThreatWarning(): void {
  if (crashed || localLifeState !== 'alive') {
    clearCombatThreats();
    return;
  }
  let nearest: RemotePlayer | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const now = performance.now();
  for (const attackerId of lockingThreatIds) {
    const remote = remotePlayers.get(attackerId);
    if (!remote || !remoteIdentityVisible(remote) || now - (lockingThreatSeenAt.get(attackerId) ?? -Infinity) > 1_000) {
      lockingThreatIds.delete(attackerId);
      lockingThreatSeenAt.delete(attackerId);
      if (incomingFireAttackerId === attackerId) incomingFireAttackerId = null;
      continue;
    }
    const distance = remote.plane.position.distanceToSquared(airplane.position);
    if (distance < nearestDistance) { nearest = remote; nearestDistance = distance; }
  }
  const incoming = incomingFireAttackerId && now < incomingFireUntil
    ? remotePlayers.get(incomingFireAttackerId)
    : undefined;
  const primary = incoming && remoteIdentityVisible(incoming) ? incoming : nearest;
  if (!primary) {
    combatThreatWarningElement.classList.add('hidden');
    combatThreatWarningElement.classList.remove('incoming');
    return;
  }
  const incomingActive = primary === incoming;
  const direction = threatDirection(primary);
  const label = incomingActive ? 'INCOMING FIRE' : 'LOCKED';
  const directionLabel = `⚠ ${direction}`;
  if (combatThreatDirectionElement.textContent !== directionLabel) combatThreatDirectionElement.textContent = directionLabel;
  if (combatThreatLabelElement.textContent !== label) combatThreatLabelElement.textContent = label;
  combatThreatWarningElement.classList.toggle('incoming', incomingActive);
  combatThreatWarningElement.classList.remove('hidden');
}

function remoteIdentityVisible(remote: RemotePlayer): boolean {
  return remote.cityId === cityId && remote.entityType === 'player' && remote.lifeState === 'alive' &&
    remote.timeSinceUpdate <= remoteStateStaleSeconds && remote.plane.visible && remote.plane.parent === scene;
}
const markerQa = import.meta.env.DEV && new URLSearchParams(location.search).get('markerqa') === '1'
  ? document.body.appendChild(document.createElement('pre')) : undefined;
let markerQaAt = 0;
if (markerQa) { markerQa.className = 'stability-qa-panel'; markerQa.id = 'marker-qa'; }
function updateMarkerQa(): void {
  if (!markerQa || performance.now() - markerQaAt < 1000) return;
  markerQaAt = performance.now();
  markerQa.textContent = JSON.stringify([...remotePlayers.values()].map(remote => ({
    markerType: remote.isBot ? 'AI Pilot proxy' : 'Real Player proxy', entityId: remote.playerId,
    sourceState: remote.lifeState, position: remote.plane.position.toArray(), age: remote.timeSinceUpdate.toFixed(2),
    visible: remote.playerProxy.visible, active: remoteIdentityVisible(remote), color: remote.playerProxy.material.color.getStyle(),
  })), null, 1);
}

// A welcome packet is a complete same-city snapshot.  Removing objects absent
// from it prevents a missed remove during a reconnect/backpressure window from
// leaving a red remote proxy or fallback aircraft at an old airport position.
function removeRemotePlayer(playerId: string): void {
  const remote = remotePlayers.get(playerId);
  if (!remote) return;
  remote.plane.remove(remote.targetBrackets);
  disposeTargetBrackets(remote.targetBrackets);
  scene.remove(remote.plane);
  disposeAirplaneMaterials(remote.plane);
  scene.remove(remote.identityTag);
  disposePlayerIdentityTag(remote.identityTag);
  scene.remove(remote.hullTag);
  disposeRemoteHullTag(remote.hullTag);
  scene.remove(remote.playerProxy);
  disposeRemotePlayerProxy(remote.playerProxy);
  remotePlayers.delete(playerId);
  lockingThreatIds.delete(playerId);
  lockingThreatSeenAt.delete(playerId);
  if (incomingFireAttackerId === playerId) {
    incomingFireAttackerId = null;
    incomingFireUntil = -Infinity;
  }
  if (selectedCombatTarget?.remote === remote) clearCombatTarget();
}

function reconcileRemotePlayers(snapshot: readonly NetworkPlayer[]): void {
  const currentIds = new Set(snapshot.map((player) => player.playerId));
  for (const playerId of [...remotePlayers.keys()]) {
    if (!currentIds.has(playerId)) removeRemotePlayer(playerId);
  }
}

const combatForward = new THREE.Vector3();
const combatOffset = new THREE.Vector3();
const combatAimForward = new THREE.Vector3();
const combatInverseQuaternion = new THREE.Quaternion();
const visualAim = { x: 0, y: 0 };
const serverAim = { x: 0, y: 0 };
const previousServerAim = { x: 0, y: 0 };
let previousAimId = 0;
let serverAimId = 0;
let visualAimBlend = 1;
const neutralAim = { x: 0, y: 0 };
let serverAimTargetId: string | null = null;
let serverAimReceivedAt = -Infinity;
const lockBoresightPoint = new THREE.Vector3();
const lockCircleEdgePoint = new THREE.Vector3();
const lockCameraRight = new THREE.Vector3();
const lockProjectedCenter = new THREE.Vector3();
const lockProjectedEdge = new THREE.Vector3();
const lockTargetProjected = new THREE.Vector3();
const outOfRangeLocalOffset = new THREE.Vector3();
let lockCircleCenterX = window.innerWidth * 0.5;
let lockCircleCenterY = window.innerHeight * 0.5;
let lockCircleRadius = 90;
type CombatLockState = 'SEARCHING' | 'LOCKED';
let selectedCombatTarget: { remote: RemotePlayer; distance: number; locked: boolean } | null = null;
let rangeFeedbackTargetId: string | null = null;
let rangeFeedbackWasInRange = false;
let rangeFeedbackTransition: 'in' | 'out' | null = null;
let rangeFeedbackTransitionUntil = 0;
let rangeFeedbackRenderedAt = -Infinity;
let lockedTargetId: string | null = null;
let serverLockedTargetId: string | null = null;
let localHeat = 0;
let localHeatMultiplier = 1;
let combatLockState: CombatLockState = 'SEARCHING';
let requestedLockTargetId: string | null = null;
let requestedManualAimX = 0;
let requestedManualAimY = 0;
let lockValidationElapsed = Number.POSITIVE_INFINITY;
let combatQaElement: HTMLPreElement | undefined;
let combatQaDetail = 'awaiting target';

if (combatQaMode) {
  combatQaElement = document.createElement('pre');
  combatQaElement.className = 'stability-qa-panel';
  combatQaElement.style.top = 'auto';
  combatQaElement.style.bottom = '12px';
  combatQaElement.textContent = 'COMBAT QA\nawaiting target';
  document.body.append(combatQaElement);
}

function networkLifeState(lifeState: PlayerLifeState | undefined): PlayerLifeState {
  // An existing dev server can briefly be older than the hot-reloaded client.
  // Its player transforms are live/targetable, so absent lifecycle metadata
  // must retain the legacy visible/alive behavior instead of hiding the mesh.
  return lifeState ?? 'alive';
}
const fallbackMapLayer: WorldMapLayer = {
  bounds: { minX: -WORLD_SIZE / 2, maxX: WORLD_SIZE / 2, minZ: -WORLD_SIZE / 2, maxZ: WORLD_SIZE / 2 },
};
const worldMap = new WorldMap(
  worldMapOverlayElement,
  worldMapCanvas,
  worldMapRecenterElement,
  cityWorld.mapLayer ?? fallbackMapLayer,
  airports,
  (nextWaypoint) => {
    waypoint = nextWaypoint;
    updateNavigationHud();
  },
  (challengeId) => {
    if (skyChallenges?.activate(challengeId)) updateSkyChallengeHud();
  },
);

function contractMapTarget(): Waypoint | null {
  if (!activeContract) return null;
  const airport = airportById(activeContract.definition.destinationAirportId);
  return { x: airport.x, z: airport.z, label: airport.name };
}

function updateWorldMap(direction: THREE.Vector3): void {
  const eventObjective = cityEvent ? eventObjectiveForLocal(cityEvent) : undefined;
  const activeMission = serverProfile.missions[cityId]?.active;
  const activeMissionDefinition = activeMission && missionForCity(cityId, activeMission.missionId);
  const activeMissionProgress = activeMissionDefinition && activeMission ? missionProgress(activeMissionDefinition, activeMission) : undefined;
  const missionTerritories = activeMissionDefinition ? missionRequirements(activeMissionDefinition, activeMission) : [];
  const markedDefenderId = whiteRockGuidance()?.target === 'defender' ? focusedWhiteRockDefenderId() : null;
  const mapPlayers: Array<{ id: string; x: number; z: number; king: boolean; heatLevel: number; isBot: boolean; ownershipAccent?: string; missionTarget?: boolean }> = [];
  for (const human of cityHumanRoster.values()) {
    if (human.playerId === localPlayerId || !humanHasActiveAircraft(human)) continue;
    const track = humanRadarTracks.get(human.playerId);
    if (!track) continue;
    mapPlayers.push({
      id: human.playerId,
      x: track.x,
      z: track.z,
      king: human.playerId === kingPlayerId,
      heatLevel: remotePlayers.get(human.playerId)?.heatLevel ?? 0,
      isBot: false,
      ownershipAccent: primaryTerritoryColorForPlayer(human.playerId),
      missionTarget: activeMission?.targetId === human.playerId,
    });
  }
  for (const [id, remote] of remotePlayers) {
    if (!remote.isBot || (missionFocus?.showAmbientAIMarkers === false && unrelatedFocusedBot(remote.playerId)) || !remoteIdentityVisible(remote)) continue;
    mapPlayers.push({
      id,
      x: remote.plane.position.x,
      z: remote.plane.position.z,
      king: false,
      heatLevel: remote.heatLevel,
      isBot: true,
      ownershipAccent: primaryTerritoryColorForPlayer(id),
      missionTarget: activeMission?.targetId === id || id === markedDefenderId,
    });
  }
  worldMap.update({
    position: airplane.position,
    forward: { x: direction.x, z: direction.z },
    king: kingPlayerId === localPlayerId,
    players: mapPlayers,
    roster: [...cityHumanRoster.values()].sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName)).map((player) => ({
      id: player.playerId,
      name: player.displayName,
      status: player.status === 'flying' ? 'Flying' : player.status === 'onGround' ? 'Ground' : player.status === 'spawnSafe' ? 'Spawn Safe' : player.status === 'respawning' ? 'Respawning' : 'Destroyed',
      isLocal: player.playerId === localPlayerId,
    })),
    mission: activeMissionDefinition && activeMissionProgress ? {
      name: activeMissionDefinition.displayName,
      objective: activeMissionDefinition.description,
      progress: activeMissionProgress.text,
      compactProgress: missionHudProgress(activeMissionDefinition, activeMissionProgress).text,
      credits: activeMissionDefinition.creditReward,
      score: activeMissionDefinition.scoreReward,
    } : undefined,
    waypoint,
    contractTarget: contractMapTarget(),
    challenges: skyChallenges?.getMapMarkers(),
    events: [
      ...(cityEvent && eventObjective ? [{
        id: cityEvent.id, x: eventObjective.x, z: eventObjective.z,
        label: activeMissionDefinition?.type === 'event' && activeMissionDefinition.requirements.eventType === cityEvent.eventType
          ? cityEvent.eventType === 'aceIntercept' ? 'ACE TARGET' : cityEvent.eventType === 'vipEscort' ? 'VIP' : 'NEXT GOLD GATE'
          : cityEvent.name,
        lifecycle: cityEvent.lifecycle, mostWanted: cityEvent.eventType === 'mostWanted',
        missionTarget: activeMissionDefinition?.type === 'event' && activeMissionDefinition.requirements.eventType === cityEvent.eventType,
      }] : []),
      ...(activeMissionDefinition && activeMission ? (() => {
        const target = missionLocationTarget(activeMissionDefinition, activeMission);
        return target ? [{
          id: `mission-${activeMission.attemptId}-${activeMission.sequenceIndex ?? 0}`,
          x: target.x, z: target.z, label: target.label, lifecycle: 'active' as const, missionTarget: true,
        }] : [];
      })() : []),
    ],
    discoveries: discoverySystem?.getMapMarkers(),
    discoveryProgress: (() => {
      const progress = discoverySystem?.getProgress();
      return progress ? { cityName: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', ...progress } : undefined;
    })(),
    territories: territoryDefinitions.map((definition) => {
      const state = territoryState.get(definition.id);
      return {
        id: definition.id,
        label: definition.displayName,
        bounds: definition.bounds,
        color: state?.controllerId || journeyAttempt?.missionId === journeyDallas04.id && definition.id === journeyDallas04.territoryId ? definition.fixedColor : neutralTerritoryColor,
        missionTarget: missionTerritories.includes(definition.id) || journeyAttempt?.missionId === journeyDallas04.id && definition.id === journeyDallas04.territoryId,
        controllerName: state?.controllerName,
        status: state?.contested ? 'Contested' : state?.controllerId === localPlayerId ? 'Owned by you' : state?.controllerName ? `Owned by ${state.controllerName}` : 'Neutral',
        captureProgress: state?.captureProgress ?? 0,
        contested: state?.contested ?? false,
      };
    }),
    repairs: repairMapMarkers,
  });
}

const pilotMenu = new PilotMenu(pilotMenuOverlayElement, (section) => {
  if (section === 'PROGRESS' && connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'daily_flight_plan_viewed' }));
});

function showFlightDialog(title: string, body: string, actions: readonly FlightDialogAction[], onDismiss?: () => void): void {
  clearHeldActions();
  mobileInput.reset();
  resetCameraPointers();
  showSharedFlightDialog(title, body, actions, onDismiss);
}
function cityGuidePreferenceKey(): string { return `airport-chaos-city-guide-v1:${serverProfile.pilotId}:${cityId}`; }
let cityGuideSeenThisSession = false;
function cityGuideSeen(): boolean {
  if (cityGuideSeenThisSession) return true;
  try { return localStorage.getItem(cityGuidePreferenceKey()) === 'seen'; } catch { return false; }
}
function markCityGuideSeen(): void {
  cityGuideSeenThisSession = true;
  try { localStorage.setItem(cityGuidePreferenceKey(), 'seen'); } catch { /* optional preference */ }
}
function openCityGuide(): void {
  if (guidedTutorialActive || trainingRequested) return;
  pilotMenu.close();
  const briefing = cityDefinition(cityId)?.briefing;
  if (!briefing) return;
  const firstVisit = !cityGuideSeen();
  const dismiss = (): void => { markCityGuideSeen(); if (firstVisit) offerDallasPracticeSuggestion(serverProfile); };
  showFlightDialog(briefing.title, briefing.summary, [
    { label: 'START FLYING', run: dismiss },
    { label: 'CITY MISSIONS', secondary: true, run: () => { markCityGuideSeen(); openPilotMenu('MISSIONS'); } },
  ], dismiss);
}
let pendingFirehawkPromotionMission: string | undefined;
let firehawkPromotionSessionShown = false;
let firehawkPromotionRequestSent = false;
let firehawkPromotionRetryTimer: number | undefined;
function requestFirehawkPromotionWhenSafe(): void {
  if (!pendingFirehawkPromotionMission || firehawkPromotionSessionShown || firehawkPromotionRequestSent) return;
  window.clearTimeout(firehawkPromotionRetryTimer);
  if (document.hidden || crashed || guidedTutorialActive || flightDialogOpen() || pilotMenu.isOpen() ||
      lockingThreatIds.size > 0 || performance.now() < incomingFireUntil || !connectionReady()) {
    firehawkPromotionRetryTimer = window.setTimeout(requestFirehawkPromotionWhenSafe, 1_000);
    return;
  }
  firehawkPromotionRequestSent = true;
  socket.send(JSON.stringify({ type: 'firehawkPromotionRequest', missionId: pendingFirehawkPromotionMission }));
}
async function showFirehawkPromotion(offer: Extract<ServerMessage, { type: 'firehawkPromotionOffer' }>): Promise<void> {
  if (firehawkPromotionSessionShown || serverProfile.aircraftEntitlements.includes(firehawkProduct.entitlement)) return;
  firehawkPromotionSessionShown = true;
  pendingFirehawkPromotionMission = undefined;
  window.clearTimeout(firehawkPromotionRetryTimer);
  let price = offer.displayPrice;
  if (nativePurchaseProvider) {
    try { price = (await loadNativeFirehawkOffer())?.localizedPrice ?? 'STORE PRICE'; }
    catch { price = 'STORE PRICE'; }
  }
  const openOffer = (): void => {
    if (onGround && !crashed && openGarage()) { aircraftGarage.focusAircraft('fighter'); return; }
    requestFlightExit(true);
  };
  showFlightDialog('NEED MORE SPEED & AGILITY?', 'Firehawk is our fastest and most agile combat aircraft currently available.', [
    { label: offer.trialEligible ? 'TRY FIREHAWK — 5 MIN FREE' : `VIEW FIREHAWK — ${price}`, run: openOffer },
    { label: 'NOT NOW', secondary: true, run: () => undefined },
  ]);
}

function pilotChallengeSuitability(type: string): string {
  if (type === 'precision' || type === 'lowAltitude') return 'Skyrift Scout friendly';
  if (type === 'inverted' || type === 'corkscrew' || type === 'dive') return 'Redspear Fighter friendly';
  if (type === 'speed' || type === 'climb') return 'Wayfarer Jet or Redspear Fighter';
  return 'Any aircraft';
}

function playerFacingEventDetail(event: NetworkCityEvent): string {
  switch (event.eventType) {
    case 'mostWanted': return 'The marked pilot survives for the reward; destroy them first to claim the bounty.';
    case 'supplyDrop': return /golden/i.test(event.name) ? 'Reach the rare Golden Drop first and hold the pickup zone.' : 'Reach the drop first and hold the pickup zone.';
    case 'skyRush': return 'Fly the temporary gate route fastest for the top reward.';
    case 'riskZone': return 'Build a bonus inside the zone, then leave safely to bank it.';
    case 'emergencyEscort': return 'Fly near the event aircraft until it reaches its destination.';
    case 'cargoConvoy': return 'Escort the Dallas cargo convoy to build shared progress. MAMMOTH CARGO BONUS: +40% Credits.';
    case 'aceIntercept': return 'Track and destroy the elite event aircraft; rewards scale with your contribution.';
    case 'vipEscort': return 'Stay near the VIP aircraft until it reaches the city center for a shared reward.';
    case 'goldenSkyRun': return 'Race the rare high-value gate route before time expires.';
    case 'cityEmergency': return 'Survive the temporary emergency corridor, then leave safely to collect your reward.';
    case 'stormLanding': return 'Land safely at Metro Central before the storm clears.';
    case 'fogApproach': return 'Land safely at North Metro through the fog.';
    case 'cargoRush': return 'Collect the cargo, then land at South Metro.';
    case 'soloAirportSprint': return 'Land at the marked airport before time runs out.';
  }
}

function formatActionDistance(distance: number | undefined): string {
  if (distance === undefined) return '';
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
}

function setActivityWaypoint(x: number, z: number, label: string): void {
  waypoint = { x, z, label };
  updateNavigationHud();
}

const tutorialPanel = document.createElement('section');
tutorialPanel.className = 'guided-tutorial-panel'; tutorialPanel.hidden = true;
tutorialPanel.innerHTML = `
  <header><small>FLIGHT INSTRUCTOR</small><span data-tutorial-progress></span></header>
  <h2 data-tutorial-title tabindex="-1" aria-live="polite">THROTTLE</h2>
  <p data-tutorial-explanation></p>
  <ul class="tutorial-navigation-details" data-tutorial-navigation hidden>
  <li>You are in the center.</li>
  <li>Radar shows aircraft, airports, and goals near you.</li>
  </ul>
  <div class="tutorial-control-instruction" data-tutorial-control-instruction aria-live="polite"></div>
  <button type="button" class="tutorial-navigation-next" data-tutorial-navigation-next hidden>CONTINUE</button>
  <div class="tutorial-power" data-tutorial-power hidden>
    <span>POWER <b data-tutorial-power-value>0%</b></span>
    <i><b data-tutorial-power-bar></b></i>
  </div>
  <div class="guided-tutorial-actions">
    <button type="button" data-guided-skip>SKIP TRAINING</button>
    <button type="button" data-guided-exit>EXIT TRAINING</button>
  </div>
  <div class="tutorial-completion-actions" data-tutorial-completion-actions hidden>
    <button type="button" data-training-play>CONTINUE</button>
    <button type="button" data-training-replay>Replay Training</button>
    <button type="button" data-training-practice>Free Practice</button>
  </div>`;
document.body.append(tutorialPanel);
const tutorialActions=tutorialPanel.querySelector<HTMLElement>('.guided-tutorial-actions')!;
const tutorialCompletionActions=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-completion-actions]')!;
const tutorialMapCoach=document.createElement('aside');
tutorialMapCoach.className='tutorial-map-coach';tutorialMapCoach.hidden=true;
tutorialMapCoach.tabIndex=-1;tutorialMapCoach.setAttribute('role','region');tutorialMapCoach.setAttribute('aria-label','City map training');
tutorialMapCoach.innerHTML=`<small>NAVIGATION 2 / 4</small><strong>CITY MAP</strong><ul>
  <li>MISSION shows your goal.</li>
  <li>PLAYERS shows other pilots.</li>
  <li>TERRITORIES shows controlled areas in cities such as Dallas.</li>
  <li>Markers show where to fly.</li>
  </ul><button type="button" data-navigation-continue>CONTINUE</button>`;
worldMapOverlayElement.querySelector('.world-map-card')!.append(tutorialMapCoach);
function syncTutorialNavigationMap():void{
  const visible=guidedTutorialActive&&tutorialNavigationCoach==='map'&&worldMap.isOpen();
  tutorialMapCoach.hidden=!visible;
  worldMapOverlayElement.classList.toggle('tutorial-navigation-map',visible);
  const mapTerritoryList=document.querySelector<HTMLElement>('#map-territory-list');
  const mapTerritoryPanel=mapTerritoryList?.closest<HTMLElement>('.map-intelligence-panel');
  mapTerritoryPanel?.toggleAttribute('hidden',!cityRules.territoriesEnabled&&!visible);
  if(mapTerritoryList)mapTerritoryList.dataset.empty=visible&&!cityRules.territoriesEnabled?'Territories are available in Dallas.':'';
  const panelStage=tutorialNavigationCoach==='players'||tutorialNavigationCoach==='territories';
  if(panelStage){
    if(tutorialPlayersExpandedBefore===undefined)tutorialPlayersExpandedBefore=playersPanel.isExpanded();
    if(tutorialTerritoriesExpandedBefore===undefined)tutorialTerritoriesExpandedBefore=cityTerritoriesPanel.isExpanded();
    playersPanel.setExpanded(tutorialNavigationCoach==='players');
    cityTerritoriesPanel.setExpanded(tutorialNavigationCoach==='territories');
  }else if(tutorialPlayersExpandedBefore!==undefined){
    playersPanel.setExpanded(tutorialPlayersExpandedBefore);
    cityTerritoriesPanel.setExpanded(tutorialTerritoriesExpandedBefore??false);
    tutorialPlayersExpandedBefore=undefined;tutorialTerritoriesExpandedBefore=undefined;
  }
  cityTerritoriesPanel.setEmptyMessage(guidedTutorialActive&&!cityRules.territoriesEnabled?'AVAILABLE IN DALLAS':'');
  document.querySelector<HTMLElement>('#city-territories')!.hidden=!cityRules.territoriesEnabled&&!guidedTutorialActive;
}
function setTutorialNavigationCoach(stage:TutorialNavigationCoach):void{
  tutorialNavigationCoach=stage;syncTutorialNavigationMap();renderTutorialPanel();
  tutorialPanel.querySelector<HTMLElement>('[data-tutorial-title]')!.focus();
}
function finishTutorialNavigationCoach():void{
  if(!tutorialNavigationCoach)return;
  tutorialNavigationCoach=undefined;tutorialNavigationCoachSeen=true;
  syncTutorialNavigationMap();
  resetTutorialLessonMetrics();renderTutorialPanel();
  tutorialPanel.querySelector<HTMLElement>('[data-tutorial-title]')!.focus();
}
function advanceTutorialNavigationCoach():void{
  if(tutorialNavigationCoach==='players')setTutorialNavigationCoach('territories');
  else if(tutorialNavigationCoach==='territories')finishTutorialNavigationCoach();
}
tutorialPanel.querySelector<HTMLButtonElement>('[data-tutorial-navigation-next]')!.addEventListener('click',advanceTutorialNavigationCoach);
tutorialMapCoach.querySelector<HTMLButtonElement>('[data-navigation-continue]')!.addEventListener('click',()=>worldMap.setOpen(false));
new MutationObserver(()=>{if(tutorialNavigationCoach==='map'&&!worldMap.isOpen())setTutorialNavigationCoach('players');})
  .observe(worldMapOverlayElement,{attributes:true,attributeFilter:['class']});
const tutorialDimmer=document.createElement('div');
tutorialDimmer.className='tutorial-focus-dimmer';tutorialDimmer.hidden=true;tutorialDimmer.setAttribute('aria-hidden','true');
document.body.append(tutorialDimmer);
const tutorialIntroPanel=document.createElement('section');
tutorialIntroPanel.className='training-intro';tutorialIntroPanel.hidden=true;
tutorialIntroPanel.setAttribute('role','dialog');tutorialIntroPanel.setAttribute('aria-labelledby','training-intro-title');
tutorialIntroPanel.innerHTML='<div class="app-shell-panel"><h1 id="training-intro-title">WELCOME TO FLIGHT TRAINING</h1><p>Learn to fly in a few minutes.</p><div class="training-orientation" data-training-orientation role="group" aria-label="Flight pitch direction"><button type="button" data-pitch-normal aria-pressed="true"><i class="training-stick-demo"><b>↑</b></i>NORMAL<small data-pitch-normal-copy></small></button><button type="button" data-pitch-inverted aria-pressed="false"><i class="training-stick-demo inverted"><b>↓</b></i>INVERTED<small data-pitch-inverted-copy></small></button></div><div class="training-dialog-actions"><button type="button" data-training-start>START TRAINING</button><button type="button" data-training-skip>Skip</button></div></div>';
document.body.append(tutorialIntroPanel);
const trainingModeLabel=document.createElement('div');
trainingModeLabel.className='training-mode-label';trainingModeLabel.hidden=true;
trainingModeLabel.innerHTML='<strong>TRAINING MODE · NO REWARDS</strong><div><button type="button" data-training-real>PLAY FOR REAL</button><button type="button" data-training-restart>RESTART TRAINING</button><button type="button" data-training-leave>EXIT</button></div>';
document.body.append(trainingModeLabel);
function setTrainingOrientation(inverted: boolean): void {
  mobileInput.setPitchInverted(inverted);
  tutorialIntroPanel.querySelector('[data-pitch-normal]')!.setAttribute('aria-pressed', String(!inverted));
  tutorialIntroPanel.querySelector('[data-pitch-inverted]')!.setAttribute('aria-pressed', String(inverted));
  const touch=tutorialInputMode()==='touch';
  tutorialIntroPanel.querySelector<HTMLElement>('[data-pitch-normal-copy]')!.textContent=touch
    ? 'Joystick UP = + ALT (climb) · DOWN = − ALT (descend)'
    : `${tutorialBindings.pitchUp} = + ALT (climb) · ${tutorialBindings.pitchDown} = − ALT (descend)`;
  tutorialIntroPanel.querySelector<HTMLElement>('[data-pitch-inverted-copy]')!.textContent=touch
    ? 'Joystick DOWN = + ALT (climb) · UP = − ALT (descend)'
    : `${tutorialBindings.pitchDown} = + ALT (climb) · ${tutorialBindings.pitchUp} = − ALT (descend)`;
}
tutorialIntroPanel.querySelector('[data-pitch-normal]')!.addEventListener('click', () => setTrainingOrientation(false));
tutorialIntroPanel.querySelector('[data-pitch-inverted]')!.addEventListener('click', () => setTrainingOrientation(true));
tutorialActions.querySelector('[data-guided-skip]')!.addEventListener('click', () => {void endTrainingAndNavigate('city');});
tutorialActions.querySelector('[data-guided-exit]')!.addEventListener('click', () => {void endTrainingAndNavigate('hub');});
tutorialIntroPanel.querySelector('[data-training-start]')!.addEventListener('click',()=>{clearHeldActions();mobileInput.reset();tutorialIntroPending=false;tutorialIntroPanel.hidden=true;tutorialPanel.hidden=false;tutorialDimmer.hidden=false;resetTutorialLessonMetrics();renderTutorialPanel();tutorialPanel.querySelector<HTMLElement>('[data-tutorial-title]')!.focus();});
tutorialIntroPanel.querySelector('[data-training-skip]')!.addEventListener('click',()=>{void endTrainingAndNavigate('city');});
tutorialCompletionActions.querySelector('[data-training-play]')!.addEventListener('click',()=>{void endTrainingAndNavigate('city');});
tutorialCompletionActions.querySelector('[data-training-replay]')!.addEventListener('click',restartGuidedTutorial);
tutorialCompletionActions.querySelector('[data-training-practice]')!.addEventListener('click',enterFreePractice);
trainingModeLabel.querySelector('[data-training-real]')!.addEventListener('click',()=>{void endTrainingAndNavigate('city');});
trainingModeLabel.querySelector('[data-training-restart]')!.addEventListener('click',restartGuidedTutorial);
trainingModeLabel.querySelector('[data-training-leave]')!.addEventListener('click',()=>{void endTrainingAndNavigate('hub');});
registerUiBackLayer({
  id: 'flight-recap',
  priority: uiBackPriority.modal,
  isActive: () => !flightRecapElement.hidden,
  close: () => { flightRecapElement.hidden = true; },
  containsTarget: (target) => target instanceof Node && flightRecapElement.contains(target),
});
registerUiBackLayer({
  id: 'practice-city-suggestion',
  priority: uiBackPriority.modal + 10,
  isActive: () => !dallasPracticeSuggestionElement.hidden,
  close: dismissDallasPracticeSuggestion,
  containsTarget: (target) => target instanceof Node && dallasPracticeSuggestionElement.contains(target),
});
registerUiBackLayer({
  id: 'training-intro',
  priority: uiBackPriority.modal + 20,
  isActive: () => !tutorialIntroPanel.hidden,
  close: () => {void endTrainingAndNavigate('hub');},
  containsTarget: (target) => target instanceof Node && Boolean(tutorialIntroPanel.firstElementChild?.contains(target)),
});
registerUiBackLayer({
  id: 'training-session',
  // Let temporary tutorial surfaces such as the World Map close first.
  priority: uiBackPriority.surface - 1,
  isActive: () => guidedTutorialActive,
  close: () => {void endTrainingAndNavigate('hub');},
});
registerUiBackLayer({
  id: 'flight-launch-cinematic',
  priority: uiBackPriority.blockingModal + 10,
  isActive: () => flightLaunchState === 'active',
  close: requestFlightLaunchSkip,
});
registerUiBackLayer({
  id: 'gameplay-perfect-landing-cinematic',
  priority: uiBackPriority.blockingModal + 5,
  isActive: () => cinematicDirector?.isSkippable() ?? false,
  close: () => { cinematicDirector?.skip(); },
});
registerUiBackLayer({
  id: 'contextual-hint',
  priority: uiBackPriority.transient,
  isActive: () => !contextualHintElement.classList.contains('hidden'),
  close: () => contextualHints.dismiss(),
  containsTarget: (target) => target instanceof Node && contextualHintElement.contains(target),
});
const tutorialRing = new THREE.Mesh(new THREE.TorusGeometry(120, 8, 6, 48), new THREE.MeshBasicMaterial({color:0x5ffff0, toneMapped:false}));
tutorialRing.visible = false; scene.add(tutorialRing);
const tutorialBindings:TutorialBindings={
  throttleUp:actionKeyLabel('throttleUp'),throttleDown:actionKeyLabel('throttleDown'),
  pitchUp:actionKeyLabel('pitchUp'),pitchDown:actionKeyLabel('pitchDown'),
  turnLeft:actionKeyLabel('yawLeft'),turnRight:actionKeyLabel('yawRight'),
  aimLeft:actionKeyLabel('aimLeft'),aimRight:actionKeyLabel('aimRight'),
  aimUp:actionKeyLabel('aimUp'),aimDown:actionKeyLabel('aimDown'),fire:actionKeyLabel('fire'),
  cameraLook:cameraControlLabels.look,cameraZoom:cameraControlLabels.zoom,
};
function tutorialInputMode():'keyboard'|'touch'{return mobileInput.isTouchLayout()&&(matchMedia('(pointer: coarse)').matches||mobileInput.getMode()==='on')?'touch':'keyboard';}
function acknowledgeTutorialInput():void{
  if(!guidedTutorialActive||tutorialIntroPending||tutorialCompletionPending||tutorialStepCompleting||guidedTutorialStep==='freePractice'||guidedTutorialStep==='landing'||tutorialLockPreview)return;
  const feedback=tutorialDetectedInstruction(tutorialTakeoffRecovery?'takeoff':tutorialVisibleStep,tutorialInputMode(),mobileInput.getPitchInverted(),tutorialBindings);
  if(feedback===tutorialInputFeedback)return;
  tutorialInputFeedback=feedback;
  renderTutorialPanel();
}
function noteTutorialActionInput(action:FlightAction):void{
  const step=tutorialVisibleStep;
  const climbAction:FlightAction=mobileInput.getPitchInverted()?'pitchDown':'pitchUp';
  const descendAction:FlightAction=mobileInput.getPitchInverted()?'pitchUp':'pitchDown';
  const matches=tutorialTakeoffRecovery?action===climbAction
    :step==='throttle'?action==='throttleUp'
    :step==='takeoff'||step==='climb'?action===climbAction
    :step==='descend'?action===descendAction
    :step==='turnLeft'?action==='yawLeft'
    :step==='turnRight'?action==='yawRight'
    :step==='approach'?['yawLeft','yawRight','pitchUp','pitchDown'].includes(action)
    :step==='targetLock'?['aimLeft','aimRight','aimUp','aimDown'].includes(action)
    :step==='fire'?action==='fire'
    :false;
  if(matches)acknowledgeTutorialInput();
}
function noteTutorialThrottleInput(_value:number):void{
  if(tutorialVisibleStep==='throttle')acknowledgeTutorialInput();
}
function updateTutorialImmediateFeedback():void{
  if(!guidedTutorialActive||tutorialInputFeedback||tutorialStepCompleting||tutorialLockPreview)return;
  const steering=mobileInput.getSteeringInput();
  const step=tutorialVisibleStep;
  const inverted=mobileInput.getPitchInverted();
  const climbAction:FlightAction=inverted?'pitchDown':'pitchUp';
  const descendAction:FlightAction=inverted?'pitchUp':'pitchDown';
  const touchClimb=inverted?steering.y>.12:steering.y<-.12;
  const touchDescend=inverted?steering.y<-.12:steering.y>.12;
  const detected=tutorialTakeoffRecovery?heldActions.has(climbAction)||touchClimb
    :step==='takeoff'||step==='climb'?heldActions.has(climbAction)||touchClimb
    :step==='descend'?heldActions.has(descendAction)||touchDescend
    :step==='turnLeft'?heldActions.has('yawLeft')||steering.x<-.12
    :step==='turnRight'?heldActions.has('yawRight')||steering.x>.12
    :step==='approach'?heldActions.has('yawLeft')||heldActions.has('yawRight')||heldActions.has('pitchUp')||heldActions.has('pitchDown')||Math.abs(steering.x)>.12||Math.abs(steering.y)>.12
    :step==='cameraLook'?tutorialCameraTravel>0
    :step==='cameraZoom'?tutorialZoomTravel>0
    :step==='targetLock'?heldActions.has('aimLeft')||heldActions.has('aimRight')||heldActions.has('aimUp')||heldActions.has('aimDown')
    :step==='fire'?heldActions.has('fire')
    :step==='throttle'?heldActions.has('throttleUp')
    :false;
  if(detected)acknowledgeTutorialInput();
}
function tutorialMenuOpen(): boolean {
  return pilotMenu.isOpen()||aircraftGarage.isOpen()||worldMap.isOpen()||flightTutorial.isOpen();
}
function renderTutorialPanel(): void {
  const completion=tutorialCompletionPending&&guidedTutorialStep==='freePractice';
  const panelHidden=!guidedTutorialActive||tutorialIntroPending||tutorialExitPending||(!completion&&guidedTutorialStep==='freePractice')||tutorialMenuOpen();
  tutorialPanel.hidden=panelHidden;tutorialDimmer.hidden=panelHidden;
  tutorialActions.hidden=completion;tutorialCompletionActions.hidden=!completion;
  const mode=tutorialInputMode();
  const inverted=mobileInput.getPitchInverted();
  let guidance=tutorialInstruction(completion?'freePractice':guidedTutorialStep,mode,inverted,tutorialBindings);
  let resumeTakeoff=false;
  if(!completion&&guidedTutorialStep!=='freePractice'){
    if(guidedTutorialStep==='landing'&&!onGround)tutorialLandingNeedsTakeoff=false;
    resumeTakeoff=tutorialSteps.indexOf(guidedTutorialStep)>1&&onGround&&(guidedTutorialStep!=='landing'||tutorialLandingNeedsTakeoff);
    if(tutorialVisibleStep!==guidedTutorialStep||tutorialTakeoffRecovery!==resumeTakeoff){tutorialVisibleStep=guidedTutorialStep;tutorialTakeoffRecovery=resumeTakeoff;tutorialInputFeedback='';}
    guidance=resumeTakeoff?tutorialTakeoffRecoveryInstruction(guidedTutorialStep,mode,inverted,tutorialBindings):tutorialInstruction(guidedTutorialStep,mode,inverted,tutorialBindings);
  }
  if(!completion&&guidedTutorialStep==='targetLock'&&tutorialLockPreview&&!resumeTakeoff)guidance=tutorialLockPreviewInstruction();
  if(!completion&&guidedTutorialStep==='landing'&&!resumeTakeoff){
    if(!guidedTutorialTargetAirport){guidedTutorialTargetAirport=centralAirport;setActivityWaypoint(centralAirport.x,centralAirport.z,centralAirport.name);}
    const airport=guidedTutorialTargetAirport;
    const landingStage=tutorialLandingCoachStage({airport,position:airplane.position,heading,speed:currentSpeed,
      verticalSpeed,altitude:altitudeAboveTerrain(),throttle,stallSpeed:currentAircraft.stallSpeed,takeoffSpeed:currentAircraft.takeoffSpeed,
      safeLandingSpeed:currentAircraft.safeLandingSpeed,safeDescentRate:currentAircraft.safeDescentRate,
      landingTilt:currentAircraft.landingTilt,roll,pitch,landingAssistActive});
    const now=performance.now();
    if(tutorialLandingStage===landingStage)tutorialLandingCandidateStage=undefined;
    else{
      if(tutorialLandingCandidateStage!==landingStage){tutorialLandingCandidateStage=landingStage;tutorialLandingCandidateSince=now;}
      if(tutorialLandingStageChangedAt===Number.NEGATIVE_INFINITY||
        (now-tutorialLandingCandidateSince>=350&&now-tutorialLandingStageChangedAt>=600)){
        tutorialLandingStage=landingStage;tutorialLandingStageChangedAt=now;tutorialLandingCandidateStage=undefined;
      }
    }
    guidance=tutorialLandingCoachInstruction(tutorialLandingStage,mode,inverted,tutorialBindings);
  }
  const titleElement=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-title]')!;
  const progressElement=tutorialPanel.querySelector('[data-tutorial-progress]')!;
  const explanation=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-explanation]')!;
  const navigationDetails=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-navigation]')!;
  const controlInstruction=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-control-instruction]')!;
  const power=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-power]')!;
  const powerValue=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-power-value]')!;
  const powerBar=tutorialPanel.querySelector<HTMLElement>('[data-tutorial-power-bar]')!;
  const navigationNext=tutorialPanel.querySelector<HTMLButtonElement>('[data-tutorial-navigation-next]')!;
  const navigationStage=tutorialNavigationCoach;
  const navigationRadar=navigationStage==='radar';
  const navigationCopy:Partial<Record<TutorialNavigationCoach,{title:string;explanation:string;instruction:string;progress:string}>>={
    radar:{title:'NAVIGATION RADAR',explanation:'You are in the center. Radar shows aircraft, airports, and goals near you.',instruction:mode==='touch'?'TAP RADAR TO OPEN THE MAP.':'CLICK RADAR TO OPEN THE MAP.',progress:'NAVIGATION 1 / 4'},
    players:{title:'PLAYERS',explanation:'See the real pilots flying in this city.',instruction:'This list shows who is flying.',progress:'NAVIGATION 3 / 4'},
    territories:{title:'TERRITORIES',explanation:'See who controls city areas. Territories are active in cities such as Dallas.',instruction:'Milwaukee training has no territory data.',progress:'NAVIGATION 4 / 4'},
  };
  const coached=navigationStage?navigationCopy[navigationStage]:undefined;
  const title=coached?.title??guidance.title;
  if(titleElement.textContent!==title)titleElement.textContent=title;
  tutorialPanel.dataset.lesson=guidedTutorialStep;
  progressElement.textContent=completion?'':coached?.progress??`STEP ${guidance.lesson} / ${tutorialSteps.length}`;
  const explanationText=coached?.explanation??(completion||guidedTutorialStep==='landing'?guidance.explanation:'');
  explanation.hidden=!explanationText;
  explanation.textContent=explanationText;
  navigationDetails.hidden=!navigationRadar;
  controlInstruction.hidden=completion;
  const instructionText=completion?'':coached?.instruction??(tutorialStepCompleting?'✓ COMPLETED':guidedTutorialStep==='landing'&&onGround&&!tutorialLandingNeedsTakeoff?'WAITING FOR LANDING CONFIRMATION':tutorialInputFeedback||guidance.controlInstruction);
  if(controlInstruction.textContent!==instructionText)controlInstruction.textContent=instructionText;
  navigationNext.hidden=navigationStage!=='players'&&navigationStage!=='territories';
  power.hidden=completion||Boolean(navigationStage)||guidedTutorialStep!=='throttle'||tutorialStepCompleting;
  if(!power.hidden){const percent=Math.round(throttle*100);powerValue.textContent=`${percent}%`;powerBar.style.width=`${percent}%`;}
  tutorialPanel.classList.toggle('is-complete',completion);
  tutorialPanel.classList.toggle('is-verified',tutorialStepCompleting);
  tutorialPanel.classList.toggle('has-input-feedback',Boolean(tutorialInputFeedback)&&!tutorialStepCompleting);
  let activeControl=navigationStage??guidance.control;
  if(panelHidden||completion||tutorialStepCompleting||guidedTutorialStep==='landing'&&onGround&&!tutorialLandingNeedsTakeoff)activeControl='';
  document.body.dataset.tutorialControl=activeControl;
}

function tutorialEvent(event:string,mode?:string):void{if(connectionReady())socket.send(JSON.stringify({type:'analyticsEvent',event,mode}));}
function validTutorialStepStates(value:unknown):value is Record<TutorialLessonStep,TutorialStepStatus>{
  if(!value||typeof value!=='object')return false;
  return tutorialSteps.every(step=>['pending','completed','skipped'].includes((value as Record<string,unknown>)[step] as string));
}
function applyTutorialStepStates(states:unknown):void{if(validTutorialStepStates(states))guidedTutorialSteps={...states};}
function nextPendingTutorialLesson():GuidedTutorialStep{return tutorialSteps.find(step=>guidedTutorialSteps[step]==='pending')??'freePractice';}
function restartGuidedTutorial():void{
  requestTutorialRunReset('replay');
}
function requestTutorialRunReset(reason:'crash'|'replay'):void{
  if(!cityRules.tutorialEnabled||!guidedTutorialActive||tutorialRunResetPending||!connectionReady())return;
  tutorialRunResetPending=true;clearHeldActions();mobileInput.reset();
  socket.send(JSON.stringify({type:'tutorialRunReset',tutorialResetReason:reason}));
}
function setGuidedTutorial(active:boolean):void{
  if(!cityRules.tutorialEnabled)return;
  if(active) cinematicDirector.clearPresentation();
  ambientTraffic?.setTutorialMode(active);
  window.clearTimeout(tutorialAdvanceTimer);window.clearTimeout(tutorialLockPreviewTimer);tutorialStepCompleting=false;tutorialStepRequestPending=false;tutorialStepRequestStep=undefined;tutorialCompletionPresentationStep=undefined;tutorialStepReconciler.reset();
  const resumeNavigationMap=tutorialNavigationCoach==='map'&&worldMap.isOpen();
  guidedTutorialActive=active;guidedTutorialTargetAirport=undefined;tutorialCompletionPending=false;
  tutorialLandingIntentPending=undefined;
  tutorialTargetRequested=false;tutorialTargetRequestedAt=Number.NEGATIVE_INFINITY;tutorialTargetId=undefined;
  if(guidedTutorialSteps.cameraZoom!=='completed')tutorialNavigationCoachSeen=false;
  guidedTutorialStep=nextPendingTutorialLesson();
  tutorialNavigationCoach=active&&guidedTutorialStep==='approach'&&guidedTutorialSteps.cameraZoom==='completed'&&!tutorialNavigationCoachSeen?(resumeNavigationMap?'map':'radar'):undefined;
  syncTutorialNavigationMap();
  resetTutorialLessonMetrics();
  tutorialIntroPending=active&&!tutorialIntroShown&&guidedTutorialStep!=='landing';
  if(tutorialIntroPending)tutorialIntroShown=true;
  tutorialIntroPanel.hidden=!tutorialIntroPending;
  tutorialIntroPanel.querySelector<HTMLElement>('[data-training-orientation]')!.hidden=false;
  if(tutorialIntroPending)tutorialIntroPanel.querySelector<HTMLButtonElement>('[data-training-start]')!.focus();
  setTrainingOrientation(mobileInput.getPitchInverted());
  tutorialPanel.hidden=!active||tutorialIntroPending;
  tutorialCompletionActions.hidden=true;
  tutorialDimmer.hidden=!active||tutorialIntroPending;
  trainingModeLabel.hidden=true;
  document.body.classList.toggle('tutorial-flight-active',active);
  if(active){
    clearHeldActions(); waypoint=null; setLocalTimePreset('day'); cityEvent=null; activeWeatherZone = undefined; document.body.dataset.weather='clear';
    ambientTraffic?.syncEventRoutes([]); ambientTraffic?.setStormEvent(false);
    skyChallenges?.cancel();
    applyServerSelectedAircraft('trainer', false);
    updateDynamicEventHud();
  }
  if(active&&guidedTutorialStep==='freePractice'){enterFreePractice();return;}
  renderTutorialPanel();
}
function resetTutorialLessonMetrics():void{
  tutorialTurnLast=heading;tutorialMovementAmount=0;
  tutorialAltitudeOrigin=altitudeAboveTerrain();
  tutorialCameraTravel=0;tutorialZoomTravel=0;
  tutorialVisibleStep=guidedTutorialStep;tutorialTakeoffRecovery=false;tutorialLandingNeedsTakeoff=guidedTutorialStep==='landing'&&onGround;tutorialInputFeedback='';tutorialLandingStage='steady';tutorialLandingStageChangedAt=Number.NEGATIVE_INFINITY;tutorialLandingCandidateStage=undefined;
  window.clearTimeout(tutorialLockPreviewTimer);tutorialLockPreview=guidedTutorialStep==='targetLock';
  if(tutorialLockPreview)tutorialLockPreviewTimer=window.setTimeout(()=>{tutorialLockPreview=false;renderTutorialPanel();},1600);
}
async function endTrainingAndNavigate(destination:'city'|'hub'):Promise<void>{
  if(!guidedTutorialActive||tutorialExitPending)return;
  tutorialExitPending=true;
  clearHeldActions();
  const status=guidedTutorialStep==='freePractice'||tutorialCompletionPending?'completed':'skipped';
  const profileUrl=apiUrl('/api/profile');profileUrl.searchParams.set('pilotId',persistedPlayer.pilotId);profileUrl.searchParams.set('pilotName',displayName);
  try{const response=await apiFetch(profileUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tutorialState:{version:TUTORIAL_VERSION,status}})});if(!response.ok)throw new Error('Training session did not close');}catch{tutorialExitPending=false;showProgressMessage('SERVER REQUIRED TO EXIT TRAINING');return;}
  window.clearTimeout(tutorialAdvanceTimer);window.clearTimeout(tutorialLockPreviewTimer);tutorialPanel.hidden=true;tutorialIntroPanel.hidden=true;tutorialDimmer.hidden=true;trainingModeLabel.hidden=true;document.body.dataset.tutorialControl='';
  if(connectionReady())socket.send(JSON.stringify({type:'tutorialState',tutorialStatus:status}));
  const url=new URL(window.location.href);url.searchParams.delete(CITY_QUERY_PARAM);url.searchParams.delete('time');url.searchParams.delete('training');
  if(destination==='city')url.searchParams.set('entry','city');else url.searchParams.delete('entry');
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}
function enterFreePractice():void{
  window.clearTimeout(tutorialLockPreviewTimer);
  tutorialCompletionPending=false;guidedTutorialStep='freePractice';waypoint=null;tutorialRing.visible=false;
  tutorialCompletionActions.hidden=true;tutorialPanel.hidden=true;tutorialDimmer.hidden=true;trainingModeLabel.hidden=false;
  document.body.dataset.tutorialControl='';
  gameplayFeedback.push({type:'mission',primaryText:'TRAINING COMPLETE',secondaryText:'FREE PRACTICE · NO REWARDS',intensity:'major'});
}
function showTutorialCompletion():void{
  clearHeldActions();mobileInput.reset();
  guidedTutorialStep='freePractice';tutorialCompletionPending=true;waypoint=null;tutorialRing.visible=false;
  tutorialDimmer.hidden=false;trainingModeLabel.hidden=true;
  document.body.dataset.tutorialControl='';
  renderTutorialPanel();
  tutorialCompletionActions.querySelector<HTMLButtonElement>('[data-training-play]')!.focus();
}
function advanceGuidedTutorial(signal:string):void{
  if(!guidedTutorialActive||tutorialNavigationCoach||guidedTutorialStep==='freePractice'||tutorialStepCompleting||tutorialStepRequestPending)return;
  if(nextTutorialStep(guidedTutorialStep,signal)===guidedTutorialStep)return;
  requestTutorialStepStatus('completed');
}
function requestTutorialStepStatus(status:Exclude<TutorialStepStatus,'pending'>):void{
  if(!guidedTutorialActive||tutorialNavigationCoach||guidedTutorialStep==='freePractice'||tutorialStepCompleting||tutorialStepRequestPending)return;
  if(!connectionReady()){showProgressMessage('SERVER REQUIRED TO UPDATE TRAINING');return;}
  tutorialStepRequestPending=true;tutorialStepRequestStep=guidedTutorialStep;renderTutorialPanel();
  socket.send(JSON.stringify({type:'tutorialStepStatus',tutorialStep:guidedTutorialStep,tutorialStepStatus:status}));
}
function transitionToNextPendingTutorialStep():void{
  const next=nextPendingTutorialLesson();
  guidedTutorialStep=next;resetTutorialLessonMetrics();
  tutorialNavigationCoach=next==='approach'&&guidedTutorialSteps.cameraZoom==='completed'&&!tutorialNavigationCoachSeen?'radar':undefined;
  syncTutorialNavigationMap();
  if(next==='landing'){guidedTutorialTargetAirport=centralAirport;setActivityWaypoint(centralAirport.x,centralAirport.z,centralAirport.name);}
  if(next==='approach'){tutorialTargetRequested=false;tutorialTargetRequestedAt=Number.NEGATIVE_INFINITY;tutorialTargetId=undefined;}
  if(next==='freePractice'){showTutorialCompletion();return;}
  renderTutorialPanel();
}
function applyTutorialLandingApproach(message:Extract<ServerMessage,{type:'tutorialLandingApproach'}>):void{
  if(!guidedTutorialActive||message.airportId!==centralAirport.id||nextPendingTutorialLesson()!=='landing'||
    ![message.position.x,message.position.y,message.position.z,message.heading,message.speed].every(Number.isFinite))return;
  cinematicDirector.resetFlight();clearHeldActions();mobileInput.reset();
  tutorialLandingIntentPending=undefined;
  throttle=.08;mobileInput.setThrottleState(throttle);
  heading=message.heading;pitch=0;roll=0;pitchControlStrength=0;yawControlStrength=0;smoothedTouchSteering={x:0,y:0};
  airplane.position.set(message.position.x,message.position.y,message.position.z);
  airplane.rotation.set(0,heading,0,'YXZ');
  forward.set(0,0,-1).applyQuaternion(airplane.quaternion).normalize();
  currentSpeed=message.speed;verticalSpeed=0;velocity.copy(forward).multiplyScalar(currentSpeed);
  boostActive=false;boostVisualStrength=0;speedBrakeStrength=0;landingAssistActive=false;
  onGround=false;takeoffRollMeters=0;landedFeedbackTime=0;crashed=false;runStarted=true;localLifeState='alive';
  crashOverlay.classList.add('hidden');flightRecapElement.hidden=true;setFlightState('FLYING');
  guidedTutorialTargetAirport=centralAirport;setActivityWaypoint(centralAirport.x,centralAirport.z,centralAirport.name);
  if(cityWorld.updateWorldStreaming)cityWorld.updateWorldStreaming(airplane.position,velocity);
  else updateOsmCityChunks(airplane.position);
  updateFlightHud();updateCamera(1);sendLocalState();renderTutorialPanel();
}
function presentNextAuthoritativeTutorialCompletion():boolean{
  if(tutorialStepCompleting)return false;
  const step=tutorialStepReconciler.takeReady(guidedTutorialSteps);
  if(!step)return false;
  window.clearTimeout(tutorialAdvanceTimer);
  if(step==='landing'){tutorialLandingIntentPending=undefined;transitionToNextPendingTutorialStep();return true;}
  guidedTutorialStep=step;tutorialVisibleStep=step;tutorialInputFeedback='';tutorialStepCompleting=true;tutorialCompletionPresentationStep=step;
  audioManager.playUiClick();renderTutorialPanel();
  tutorialAdvanceTimer=window.setTimeout(()=>{
    if(tutorialCompletionPresentationStep!==step)return;
    tutorialStepCompleting=false;tutorialCompletionPresentationStep=undefined;
    if(!presentNextAuthoritativeTutorialCompletion())transitionToNextPendingTutorialStep();
  },600);
  return true;
}
function applyTutorialStepResult(message:Extract<ServerMessage,{type:'tutorialStepResult'}>):void{
  applyTutorialStepStates(message.steps);
  if(message.step==='landing'&&message.ok&&message.status==='completed')tutorialLandingIntentPending=undefined;
  if(tutorialStepRequestStep===message.step){tutorialStepRequestPending=false;tutorialStepRequestStep=undefined;}
  if(!message.ok){
    showProgressMessage(message.reason??'TRAINING STEP COULD NOT UPDATE');
    if(!tutorialStepCompleting)transitionToNextPendingTutorialStep();
    return;
  }
  if(message.status==='completed'){
    tutorialStepReconciler.ingest(message.step,message.status,guidedTutorialSteps);
    if(!tutorialStepCompleting&&!presentNextAuthoritativeTutorialCompletion())renderTutorialPanel();
    return;
  }
  if(!tutorialStepCompleting&&!presentNextAuthoritativeTutorialCompletion())transitionToNextPendingTutorialStep();
}
function updateGuidedTutorial():void{
  if(!guidedTutorialActive||crashed||tutorialIntroPending||tutorialCompletionPending||guidedTutorialStep==='freePractice'){tutorialRing.visible=false;return;}
  renderTutorialPanel();
  if(tutorialNavigationCoach){tutorialRing.visible=false;return;}
  if(tutorialMenuOpen()){tutorialRing.visible=false;return;}
  updateTutorialImmediateFeedback();
  tutorialRing.visible=guidedTutorialStep==='landing'&&Boolean(waypoint);
  if(tutorialRing.visible&&waypoint){tutorialRing.position.set(waypoint.x,getTerrainHeight(waypoint.x,waypoint.z)+18,waypoint.z);tutorialRing.lookAt(airplane.position);}
  if(tutorialStepCompleting)return;
  if(guidedTutorialStep==='throttle'){
    const threshold=THREE.MathUtils.clamp(currentAircraft.takeoffSpeed/currentAircraft.groundMaxSpeed,.65,.9);
    tutorialPanel.style.setProperty('--tutorial-power-target',`${Math.round(threshold*100)}%`);
    if(throttle>=threshold&&(heldActions.has('throttleUp')||mobileInput.getThrottleTarget()!==undefined))advanceGuidedTutorial('takeoffPowerReached');
  }else if((guidedTutorialStep==='turnLeft'||guidedTutorialStep==='turnRight')&&!onGround){
    const delta=THREE.MathUtils.euclideanModulo(heading-tutorialTurnLast+Math.PI,Math.PI*2)-Math.PI;tutorialTurnLast=heading;
    tutorialMovementAmount+=tutorialTurnProgress(guidedTutorialStep,delta);
    if(tutorialMovementAmount>=.3)advanceGuidedTutorial(guidedTutorialStep==='turnLeft'?'leftTurnComplete':'rightTurnComplete');
  }else if(guidedTutorialStep==='climb'&&!onGround){
    const altitude=altitudeAboveTerrain();
    if(altitude>=tutorialAltitudeOrigin+25&&verticalSpeed>0)advanceGuidedTutorial('climbComplete');
  }else if(guidedTutorialStep==='descend'&&!onGround){
    const altitude=altitudeAboveTerrain();
    if(tutorialAltitudeOrigin-altitude>=20&&altitude>8&&verticalSpeed<0)advanceGuidedTutorial('descentComplete');
  }else if((guidedTutorialStep==='approach'||guidedTutorialStep==='targetLock'||guidedTutorialStep==='fire')&&!onGround&&connectionReady()&&
    (!tutorialTargetId||!remotePlayers.has(tutorialTargetId))&&(!tutorialTargetRequested||performance.now()-tutorialTargetRequestedAt>=1_500)){
    tutorialTargetRequested=true;tutorialTargetRequestedAt=performance.now();socket.send(JSON.stringify({type:'tutorialTargetRequest'}));
  }
}

function setNearestAirportWaypoint(): void {
  const airport = airports
    .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - airplane.position.x, candidate.z - airplane.position.z) }))
    .sort((left, right) => left.distance - right.distance)[0]?.candidate ?? centralAirport;
  setActivityWaypoint(airport.x, airport.z, airport.name);
  showProgressMessage(`AIRPORT WAYPOINT: ${airport.name.toUpperCase()}`);
}

function remotePilotLifecycle(remote: RemotePlayer): string {
  if (remote.lifeState === 'destroyed') return 'Destroyed';
  if (remote.lifeState === 'respawning') return 'Respawning';
  return remote.plane.position.y - groundPlaneY(remote.plane.position.x, remote.plane.position.z) <= 3.5 ? 'Taxi' : 'Flying';
}

function localPilotLifecycle(): string {
  if (localLifeState === 'destroyed' || crashed) return 'Destroyed';
  if (localLifeState === 'respawning') return 'Respawning';
  return onGround ? 'Taxi' : 'Flying';
}

function currentGrandTourStep(definition: CityMission, attempt?: NetworkMissionAttempt) {
  if (definition.type !== 'sequentialTour' || !attempt) return undefined;
  return definition.requirements.steps?.[attempt.sequenceIndex ?? 0];
}

function missionLocationTarget(definition: CityMission, attempt?: NetworkMissionAttempt): { x: number; z: number; label: string } | undefined {
  const step = currentGrandTourStep(definition, attempt);
  return step && (step.kind === 'area' || step.kind === 'checkpoint') && step.x !== undefined && step.z !== undefined
    ? { x: step.x, z: step.z, label: step.label }
    : undefined;
}

function missionRequirements(definition: CityMission, attempt?: NetworkMissionAttempt): readonly string[] {
  const tourStep = currentGrandTourStep(definition, attempt);
  if (tourStep?.kind === 'area') return [tourStep.id];
  return definition.requirements.allCityTerritories
    ? territoryDefinitions.map((item) => item.id)
    : definition.requirements.requiredTerritoryIds ?? definition.requirements.territoryIds ?? [];
}

function missionProgress(definition: CityMission, attempt: NetworkMissionAttempt): { text: string; value: number; target: number } {
  const requirements = definition.requirements;
  const territoryIds = missionRequirements(definition, attempt);
  const ownedIds = attempt.ownedTerritoryIds ?? territoryIds.filter((id) => territoryState.get(id)?.controllerId === localPlayerId);
  if (definition.type === 'territoryHold') {
    const places = territoryIds.map((id) => `${territoryState.get(id)?.controllerId === localPlayerId ? '✓' : '○'} ${territoryDefinitions.find((item) => item.id === id)?.displayName ?? id}`);
    const duration = requirements.holdDurationSeconds ?? requirements.durationSeconds ?? 0;
    return { text: `${places.join(' · ')}\nOWNED ${ownedIds.length} / ${territoryIds.length}\nHOLD ${Math.floor(attempt.progress / 60)}:${String(attempt.progress % 60).padStart(2, '0')} / ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`, value: attempt.progress, target: duration || 1 };
  }
  if (definition.type === 'airborneHold') return {
    text: `${onGround ? 'NEXT: GET AIRBORNE' : 'STAY AIRBORNE'} · ${Math.floor(attempt.progress)} / ${requirements.durationSeconds ?? 60} seconds`,
    value: attempt.progress, target: requirements.durationSeconds ?? 60,
  };
  if (definition.type === 'destinationLanding') return {
    text: `NEXT: LAND SAFELY AT ${airports.find((airport) => airport.id === requirements.airportId)?.name.toUpperCase() ?? 'THE MARKED AIRPORT'}`,
    value: attempt.progress, target: 1,
  };
  if (definition.type === 'straightDistance') return {
    text: `HOLD YOUR HEADING · ${((attempt.distanceMeters ?? 0) / 1000).toFixed(1)} / ${((requirements.meters ?? 0) / 1000).toFixed(0)} km`,
    value: attempt.progress, target: requirements.meters ?? 1,
  };
  if (definition.type === 'sequentialTour') {
    const steps = requirements.steps ?? [];
    const stepIndex = Math.min(steps.length, attempt.sequenceIndex ?? 0);
    const step = steps[stepIndex];
    const prefix = `DALLAS GRAND TOUR — STEP ${Math.min(steps.length, stepIndex + 1)}/${steps.length}`;
    if (!step) return { text: prefix, value: attempt.progress, target: steps.length || 1 };
    if (step.kind === 'altitude') {
      const currentFeet = Math.max(0, Math.round(altitudeAboveTerrain() * METERS_TO_FEET));
      const targetFeet = Math.round((step.minimumAltitudeMeters ?? 0) * METERS_TO_FEET);
      return { text: `${prefix} · HIGH ALTITUDE: ${currentFeet.toLocaleString()} / ${targetFeet.toLocaleString()} FT`, value: attempt.progress, target: steps.length };
    }
    if (step.kind === 'lowDistance') {
      return { text: `${prefix} · LOW FLIGHT: ${((attempt.distanceMeters ?? 0) / 1000).toFixed(1)} / ${((step.meters ?? 0) / 1000).toFixed(1)} KM · STAY BELOW 1,000 FT`, value: attempt.progress, target: steps.length };
    }
    if (step.kind === 'areaHold') {
      const heldSeconds = attempt.holdStartedAt ? Math.min(step.durationSeconds ?? 0, Math.max(0, (Date.now() - attempt.holdStartedAt) / 1000)) : 0;
      return { text: `${prefix} · DOWNTOWN LOW PASS: ${heldSeconds.toFixed(1)} / ${(step.durationSeconds ?? 0).toFixed(1)}S · BELOW 500 FT`, value: attempt.progress, target: steps.length };
    }
    const target = missionLocationTarget(definition, attempt);
    const distance = target ? Math.hypot(airplane.position.x - target.x, airplane.position.z - target.z) : 0;
    return { text: `${prefix} · NEXT: ${step.label} · ${(distance / 1000).toFixed(1)} KM`, value: attempt.progress, target: steps.length };
  }
  if (definition.type === 'airportLandings' || definition.type === 'airportEmpire') {
    const names = (requirements.airportIds ?? []).map((id) => `${attempt.completedIds.includes(id) ? '✓' : '○'} ${airports.find((airport) => airport.id === id)?.name ?? id}`);
    const ownership = definition.type === 'airportEmpire' ? `OWNED ${ownedIds.length} / ${territoryIds.length}\n${territoryIds.map((id) => `${territoryState.get(id)?.controllerId === localPlayerId ? '✓' : '○'} ${territoryDefinitions.find((item) => item.id === id)?.displayName ?? id}`).join(' · ')}\n` : '';
    return { text: `${ownership}Land: ${names.join(' · ')}`, value: attempt.progress, target: requirements.airportIds?.length ?? 1 };
  }
  if (definition.type === 'territoryOwn' || definition.type === 'territorySequence') {
    const checklist = territoryIds.map((id) => `${(definition.type === 'territorySequence' ? attempt.completedIds.includes(id) : territoryState.get(id)?.controllerId === localPlayerId) ? '✓' : '○'} ${territoryDefinitions.find((item) => item.id === id)?.displayName ?? id}`);
    return { text: `OWNED ${ownedIds.length} / ${territoryIds.length}\n${checklist.join(' · ')}`, value: attempt.progress, target: territoryIds.length || 1 };
  }
  if (definition.type === 'stuntPair') return { text: 'This retired mission is no longer available. Abandon it and choose another mission.', value: 0, target: 1 };
  if (definition.type === 'event') {
    const event = cityEvent?.eventType === requirements.eventType ? cityEvent : null;
    if (!event || event.lifecycle === 'completed' || event.lifecycle === 'failed' || event.lifecycle === 'cooldown') {
      return { text: `WAIT FOR ${definition.displayName} · then join the marked event`, value: 0, target: 1 };
    }
    const seconds = Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000));
    if (event.eventType === 'aceIntercept') {
      return { text: `ACE TARGET · ${event.bossHealth ?? event.bossMaxHealth ?? 0}/${event.bossMaxHealth ?? 300} HP · LAND THE FINAL HIT · ${seconds}s LEFT`, value: 0, target: 1 };
    }
    if (event.eventType === 'vipEscort') {
      const passed = Math.min(event.route.length, Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0));
      const next = event.route[Math.min(event.route.length - 1, passed)];
      const distance = next ? Math.hypot(airplane.position.x - next.x, airplane.position.z - next.z) : 0;
      return { text: `VIP · ${event.bossHealth ?? 0}/${event.bossMaxHealth ?? 0} HP · CHECKPOINT ${Math.min(event.route.length, passed + 1)}/${event.route.length} · STAY WITHIN 480M · NEXT ${(distance / 1000).toFixed(1)} KM · ${seconds}s LEFT`, value: passed, target: event.route.length || 1 };
    }
    const gates = event.route.length;
    const passed = Math.min(gates, Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0));
    return { text: `GOLD GATES ${passed}/${gates} · ${seconds}s left`, value: passed, target: gates || 1 };
  }
  if (definition.type === 'territoryUniqueKills') return { text: `CENTRAL CONTROLLED: ${ownedIds.length === territoryIds.length ? 'YES' : 'NO'}\nKILLS: ${attempt.completedIds.length}/${requirements.uniqueKills ?? 3}`, value: attempt.progress, target: requirements.uniqueKills ?? 3 };
  if (definition.type === 'precisionLanding') {
    const targetAirport = airports.find((item) => item.id === requirements.airportId)?.name ?? 'the marked airport';
    const guidance = landingAssistActive
      ? ` · SPEED ${landingStatus.speedSafe ? 'GOOD' : 'TOO FAST'} · DESCENT ${landingStatus.descentSafe ? 'GOOD' : 'TOO HARD'} · WINGS ${landingStatus.bankSafe ? 'LEVEL' : 'ADJUST'} · NOSE ${landingStatus.pitchSafe ? 'LEVEL' : 'ADJUST'} · ALIGNMENT ${landingStatus.alignmentSafe ? 'GOOD' : 'ADJUST'}`
      : '';
    const landingResult = lastLandingResult;
    const result = landingResult && landingResult.airportId === requirements.airportId && landingResult.at >= attempt.startedAt
      ? ` · LAST ${landingResult.quality}/1000 (${landingResult.grade})`
      : '';
    return { text: `TARGET 780+ · LAND AT ${targetAirport.toUpperCase()}${guidance}${result}`, value: attempt.progress, target: requirements.minimumScore ?? 1 };
  }
  if (definition.type === 'assignedHunter') {
    const hunter = attempt.targetId ? remotePlayers.get(attempt.targetId) : undefined;
    const distance = hunter ? Math.hypot(hunter.plane.position.x - airplane.position.x, hunter.plane.position.z - airplane.position.z) : undefined;
    return { text: `TARGET: HUNTER${hunter ? ` · ${hunter.displayName}` : ''}${distance === undefined ? '' : ` · ${(distance / 1000).toFixed(1)} KM`}`, value: attempt.progress, target: 1 };
  }
  if (definition.type === 'humanKill') return { text: 'NEXT: DESTROY ONE REAL HUMAN PILOT IN THIS CITY', value: attempt.progress, target: 1 };
  if (definition.type === 'wantedSurvival') {
    const seconds = cityEvent?.eventType === 'mostWanted' && cityEvent.lifecycle === 'active'
      ? Math.max(0, Math.ceil((cityEvent.expiresAt - Date.now()) / 1000)) : undefined;
    return attempt.eventId
      ? { text: `MOST WANTED · SURVIVE${seconds === undefined ? '' : ` ${seconds}s`}`, value: attempt.progress, target: 1 }
      : { text: `DANGER ${localHeat} / 5 · BUILD IT WITH HUMAN TAKEDOWNS, STUNTS, NEAR MISSES, EVENT WINS, RISK BANKS, CONTESTED TERRITORY, OR FAST LOW FLIGHT`, value: localHeat, target: 5 };
  }
  if (definition.type === 'liveScoreRank') {
    const humans = [...cityHumanRoster.values()].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
    const rank = humans.findIndex((entry) => entry.playerId === localPlayerId) + 1;
    const duration = requirements.durationSeconds ?? 300;
    const elapsed = Math.min(duration, Math.max(0, Math.floor(attempt.progress)));
    const timer = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} / ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
    const requirement = requirements.minimumHumanPlayers ?? 2;
    return { text: `LIVE RANK: #${rank || '—'} OF ${humans.length} · ${humans.length < requirement ? `NEED ${requirement} TOTAL CONNECTED HUMAN PILOTS` : `#1 HOLD: ${timer}`}`, value: elapsed, target: duration };
  }
  return { text: definition.description, value: attempt.progress, target: 1 };
}

function missionUnavailableReason(definition: CityMission): string | undefined {
  if (definition.retired) return 'This mission is retired.';
  if (definition.type === 'assignedHunter' && ![...remotePlayers.values()].some((remote) =>
    remote.cityId === cityId && remote.isBot && remote.botPersonality === 'hunter' && remote.lifeState === 'alive')) {
    return 'No AI Hunter is currently available in this city.';
  }
  if (definition.type === 'humanKill' && ![...cityHumanRoster.values()].some((player) =>
    player.playerId !== localPlayerId && player.cityId === cityId)) {
    return 'Requires another human pilot in this city.';
  }
  if (definition.type === 'event') {
    const event = cityEvent;
    const eventReady = Boolean(event && event.eventType === definition.requirements.eventType &&
      (event.lifecycle === 'available' || event.lifecycle === 'active'));
    if (!eventReady) {
      if (definition.requirements.eventType === 'aceIntercept') return 'Ace event is not currently available.';
      if (definition.requirements.eventType === 'vipEscort') return 'VIP event is not currently available.';
      if (definition.requirements.eventType === 'goldenSkyRun') return 'Golden Sky Run is not currently available.';
      return 'Matching event is not currently available.';
    }
  }
  return undefined;
}

function missionWaypoint(definition: CityMission, attempt?: NetworkMissionAttempt): { x: number; z: number; label: string } | undefined {
  const tourTarget = missionLocationTarget(definition, attempt);
  if (tourTarget) return tourTarget;
  const airportId = definition.requirements.airportId ?? definition.requirements.airportIds?.find((id) => !attempt?.completedIds.includes(id));
  const airport = airports.find((item) => item.id === airportId);
  if (airport) return { x: airport.x, z: airport.z, label: airport.name };
  const territoryId = missionRequirements(definition, attempt).find((id) => territoryState.get(id)?.controllerId !== localPlayerId) ?? missionRequirements(definition, attempt)[0];
  const territory = territoryDefinitions.find((item) => item.id === territoryId);
  if (territory) return { x: territory.center.x, z: territory.center.z, label: territory.displayName };
  if (attempt?.targetId) {
    const target = remotePlayers.get(attempt.targetId);
    if (target) return { x: target.plane.position.x, z: target.plane.position.z, label: 'Marked Hunter' };
  }
  if (cityEvent && cityEvent.eventType === definition.requirements.eventType) {
    const point = eventObjectiveForLocal(cityEvent);
    if (point) return { x: point.x, z: point.z, label: cityEvent.name };
  }
  return undefined;
}

let completedMissionUntil = 0;

function updateMissionHud(): void {
  const active = serverProfile.missions[cityId]?.active;
  const definition = active && missionForCity(cityId, active.missionId);
  if (definition && active) {
    const mobileProgress = missionProgress(definition, active);
    const hudProgress = missionHudProgress(definition, mobileProgress);
    activeMissionTitleElement.textContent = definition.displayName;
    activeMissionObjectiveElement.textContent = missionHudObjective(definition);
    activeMissionProgressElement.textContent = hudProgress.text;
    activeMissionBarElement.hidden = hudProgress.barValue === undefined || hudProgress.barMax === undefined;
    if (!activeMissionBarElement.hidden) {
      activeMissionBarElement.max = hudProgress.barMax!;
      activeMissionBarElement.value = hudProgress.barValue!;
    }
    activeMissionOverlayElement.hidden = false;
  } else {
    activeMissionOverlayElement.hidden = true;
    activeMissionTitleElement.textContent = '';
    activeMissionObjectiveElement.textContent = '';
    activeMissionProgressElement.textContent = '';
    activeMissionBarElement.hidden = true;
    activeMissionBarElement.value = 0;
  }
}

function pilotMenuData(): PilotMenuData {
  let nearestAirport = centralAirport;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const airport of airports) {
    const distance = Math.hypot(airplane.position.x - airport.x, airplane.position.z - airport.z);
    if (distance < nearestDistance) {
      nearestAirport = airport;
      nearestDistance = distance;
    }
  }
  const setWaypoint = (x: number, z: number, label: string): void => {
    waypoint = { x, z, label };
    updateNavigationHud();
  };
  const activities = [] as Array<{
    name: string;
    detail: string;
    meta: string;
    actions?: Array<PilotMenuAction>;
  }>;
  for (const challenge of cityWorld.skyChallenges ?? []) {
    const gate = challenge.gates[0];
    const required = challenge.requiredAircraftType;
    const accessReason = required ? aircraftAccessReason(required) : undefined;
    const unavailableReason = accessReason
      ? accessReason
      : required && aircraftType !== required
        ? `Requires ${aircraftDefinitions[required].name} — equip it in Aircrafts.`
        : undefined;
    activities.push({
      name: challenge.name,
      detail: unavailableReason ?? `${challenge.type.replace(/([A-Z])/g, ' $1')} skill route. Fly its gates before time expires.`,
      meta: `+${challengeCreditReward(challenge.reward)} credits · ${Math.round(Math.hypot(airplane.position.x - gate.x, airplane.position.z - gate.z))}m · ${pilotChallengeSuitability(challenge.type)}`,
      actions: [
        { label: 'Set Waypoint', run: () => setWaypoint(gate.x, gate.z, challenge.name) },
        { label: 'Start', disabled: Boolean(unavailableReason), title: unavailableReason, run: () => { if (skyChallenges?.activate(challenge.id)) updateSkyChallengeHud(); } },
      ],
    });
  }
  const event = cityEvent && (cityEvent.lifecycle === 'available' || cityEvent.lifecycle === 'active') ? cityEvent : undefined;
  const eventObjective = event ? eventObjectiveForLocal(event) : undefined;
  const liveEvent = event && eventObjective ? {
    name: `${visualLanguage[event.eventType === 'mostWanted' ? 'wanted' : 'event'].icon} ` + event.name.replace(/\s*·\s*.*/, ''),
    detail: playerFacingEventDetail(event),
    meta: (() => { const cargoReward = cargoCreditReward(event.rewardCredits ?? 0, aircraftType, 'event', event.eventType); return `${event.lifecycle === 'active' ? 'ACTIVE' : 'NEXT'} · +${cargoReward.credits} Credits${cargoReward.applied ? ' · MAMMOTH CARGO BONUS +40%' : ''} · ${Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000))}s · ${Math.round(Math.hypot(airplane.position.x - eventObjective.x, airplane.position.z - eventObjective.z))}m`; })(),
    actions: [
      { label: 'Set Waypoint', run: () => setWaypoint(eventObjective.x, eventObjective.z, event.name) },
      ...(localPlayerId && connectionReady() ? [{ label: joinedEventId === event.id ? 'Joined' : 'Join Event', run: () => {
        if (!joinedEventId && connectionReady()) socket.send(JSON.stringify({ type: 'eventJoin', eventId: event.id }));
        joinedEventId = event.id;
        updateDynamicEventHud();
      } }] : []),
    ],
  } : undefined;
  const wantedPlayerId = cityEvent?.eventType === 'mostWanted' ? cityEvent.wantedPlayerId : undefined;
  const players = [
    {
      id: localPlayerId ?? undefined,
      name: displayName,
      aircraft: aircraftDisplayName(aircraftType),
      distance: 0,
      lifecycle: localPilotLifecycle(),
      score: cityHumanRoster.get(localPlayerId ?? '')?.score ?? score,
      altitudeMeters: altitudeAboveTerrain(),
      kills: profileHydrated ? serverProfile.kills : undefined,
      isLocal: true,
      ownedTerritories: localPlayerId ? ownedTerritoriesForPlayer(localPlayerId) : [],
      mostWanted: wantedPlayerId === localPlayerId,
      king: kingPlayerId === localPlayerId,
    },
    ...[...remotePlayers.values()]
      .filter((remote) => remote.entityType === 'player' && remote.cityId === cityId)
      .map((remote) => ({
        id: remote.playerId,
        name: remote.displayName,
        aircraft: aircraftDisplayName(remote.aircraftType),
        distance: remote.plane.position.distanceTo(airplane.position),
        lifecycle: remotePilotLifecycle(remote),
        score: cityHumanRoster.get(remote.playerId)?.score ?? 0,
        altitudeMeters: humanRadarTracks.get(remote.playerId)?.altitudeMeters,
        isLocal: false,
        isBot: remote.isBot,
        ownedTerritories: ownedTerritoriesForPlayer(remote.playerId),
        mostWanted: wantedPlayerId === remote.playerId,
        king: kingPlayerId === remote.playerId,
        setWaypoint: remote.lifeState === 'alive' ? () => setWaypoint(
          remote.plane.position.x,
          remote.plane.position.z,
          `${remote.displayName} · last reported position`,
        ) : undefined,
        challenge: cityRules.competitiveEnabled && !remote.isBot && remote.lifeState === 'alive' ? () => socket.send(JSON.stringify({ type: 'pvpChallengeInvite', opponentId: remote.playerId, mode: 'dogfight' })) : undefined,
        sprint: cityRules.competitiveEnabled && !remote.isBot && remote.lifeState === 'alive' ? () => {
          const destination = airports.filter((airport) => airport.id !== lastSuccessfulAirportId)
            .sort((left, right) => Math.hypot(left.x - airplane.position.x, left.z - airplane.position.z) - Math.hypot(right.x - airplane.position.x, right.z - airplane.position.z))[0];
          if (destination) socket.send(JSON.stringify({ type: 'pvpChallengeInvite', opponentId: remote.playerId, mode: 'airportSprint', destinationAirportId: destination.id }));
        } : undefined,
      })),
    // Online presence is not render visibility: background browsers may stop
    // transforms while their socket/profile remains connected.
    ...[...cityHumanRoster.values()].filter(player => player.playerId !== localPlayerId && !remotePlayers.has(player.playerId)).map(player => ({
      id: player.playerId,
      name: player.displayName, aircraft: aircraftDisplayName(player.aircraftType),
      distance: undefined, lifecycle: player.lifeState === 'alive' ? 'Online' : player.lifeState === 'respawning' ? 'Respawning' : 'Destroyed',
      score: player.score, isLocal: false, isBot: false,
      altitudeMeters: player.altitudeMeters,
      ownedTerritories: ownedTerritoriesForPlayer(player.playerId),
      mostWanted: wantedPlayerId === player.playerId, king: kingPlayerId === player.playerId,
      challenge: cityRules.competitiveEnabled && player.lifeState === 'alive' ? () => socket.send(JSON.stringify({ type: 'pvpChallengeInvite', opponentId: player.playerId, mode: 'dogfight' })) : undefined,
      sprint: cityRules.competitiveEnabled && player.lifeState === 'alive' ? () => {
        const destination = airports.filter((airport) => airport.id !== lastSuccessfulAirportId)
          .sort((left, right) => Math.hypot(left.x - airplane.position.x, left.z - airplane.position.z) - Math.hypot(right.x - airplane.position.x, right.z - airplane.position.z))[0];
        if (destination) socket.send(JSON.stringify({ type: 'pvpChallengeInvite', opponentId: player.playerId, mode: 'airportSprint', destinationAirportId: destination.id }));
      } : undefined,
    })),
  ].sort((left, right) => {
    if (left.mostWanted !== right.mostWanted) return left.mostWanted ? -1 : 1;
    return (left.distance ?? Infinity) - (right.distance ?? Infinity);
  });
  const territories = territoryDefinitions.map((definition) => {
    const state = territoryState.get(definition.id);
    return {
      id: definition.id,
      name: definition.displayName,
      controller: state?.controllerName ? `Owned by ${state.controllerName}` : 'NEUTRAL',
      contested: state?.contested ?? false,
      color: state?.controllerId ? definition.fixedColor : neutralTerritoryColor,
      fixedColor: definition.fixedColor,
      progress: state?.captureProgress ?? 0,
      distance: Math.hypot(airplane.position.x - definition.center.x, airplane.position.z - definition.center.z),
      ownedByYou: Boolean(localPlayerId && state?.controllerId === localPlayerId),
      setWaypoint: () => setWaypoint(definition.center.x, definition.center.z, definition.displayName),
    };
  }).sort((left, right) => left.distance - right.distance);
  const objectiveCycle = serverProfile.objectives[cityId];
  const mastery = serverProfile.mastery[cityId] ?? { xp: 0, level: 1, unlockedRewards: [] };
  const masteryThreshold = (level: number): number => { const step = Math.max(0, Math.min(25, level) - 1); return step * 100 + step * step * 25; };
  const objectiveItems = (items: readonly NetworkObjectiveItem[] | undefined) => (items ?? []).map((item) => ({
    label: item.label,
    progress: item.progress,
    target: item.target,
    reward: item.reward,
    completed: item.completed,
  }));

  return {
    nativeWebPromotion: nativePurchaseProvider !== undefined,
    account: {
      state: clientAccount.state, email: clientAccount.email, pilotName: serverProfile.pilotName,
      providers: clientAccount.providers ?? { password: clientAccount.state === 'account' && Boolean(clientAccount.email), google: false, apple: false },
      availableProviders: availableNativeProviders,
      level: serverProfile.pilotProgress.level, xp: serverProfile.pilotProgress.xp,
      credits: serverProfile.credits, score: serverProfile.score,
      ownedAircraft: serverProfile.unlockedAircraft.length,
      badges: new Set([
        ...Object.values(serverProfile.mastery).flatMap((entry) => entry?.unlockedRewards ?? []).filter((reward) => /badge/i.test(reward)),
        ...(serverProfile.weeklyReward?.badge && serverProfile.weeklyReward.badgeExpiresAt > Date.now() ? [serverProfile.weeklyReward.badge] : []),
      ]).size,
      continueAsGuest: () => pilotMenu.close(),
      logOut: () => accountRequest('logout'),
      changeName: (pilotName) => accountRequest('pilot-name', { pilotName }),
      providerAuth: providerAccountRequest,
    },
    city: { name: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', timePreset: worldTimeOfDay.toUpperCase(), changeCity: openWorldSelector },
    intercity:{routes:routesFromCity(cityId).map(route=>({routeId:route.routeId,destination:route.toCityId==='dallas'?'Dallas':'Milwaukee',distanceLabel:route.distanceLabel,recommendedAircraft:route.recommendedAircraft.toUpperCase(),estimatedFlightTime:route.estimatedFlightTime,available:onGround&&!crashed&&!profileActiveMissionAttempt(serverProfile),reason:!onGround?'Land and stop first.':profileActiveMissionAttempt(serverProfile)?'Finish or leave your active mission.':undefined,start:()=>socket.send(JSON.stringify({type:'intercityRouteStart',routeId:route.routeId}))}))},
    missions: {
      practice: cityRules.practiceMode,
      activeId: profileActiveMissionAttempt(serverProfile)?.missionId,
      activeCity: profileActiveMissionCity(serverProfile),
      entries: missionsForCity(cityId).map((definition) => {
        const active = serverProfile.missions[cityId]?.active?.missionId === definition.id ? serverProfile.missions[cityId]?.active : undefined;
        const completion = serverProfile.missions[cityId]?.completions[definition.id];
        const target = missionWaypoint(definition, active);
        const progress = active ? missionProgress(definition, active) : undefined;
        return {
          id: definition.id, name: definition.displayName, detail: definition.retired ? 'This retired mission is no longer available. Choose another mission.' : definition.description, difficulty: definition.difficulty, retired: definition.retired,
          unavailableReason: journeyMode ? 'Finish or leave your Journey mission first.' : missionUnavailableReason(definition),
          territoryIds: missionRequirements(definition, active),
          credits: definition.creditReward, score: definition.scoreReward,
          completions: completion?.count ?? 0, cooldownUntil: (completion?.lastCompletedAt ?? 0) + definition.replayCooldownMs,
          progressText: progress?.text, progress: progress?.value, target: progress?.target,
          setWaypoint: target ? () => setWaypoint(target.x, target.z, target.label) : undefined,
        };
      }),
      accept: (missionId, replace) => {
        if (journeyMode) return;
        socket.send(JSON.stringify({ type: 'missionAccept', missionId, replaceMission: replace,
          expectedAttemptId: replace ? activeMissionAttemptId : undefined }));
      },
      abandon: () => socket.send(JSON.stringify({ type: 'missionAbandon', missionCityId: profileActiveMissionCity(serverProfile), expectedAttemptId: activeMissionAttemptId })),
    },
    progression: {
      enabled: cityRules.progressionEnabled, credits, score, pilotProgress: serverProfile.pilotProgress, dailyStreak: serverProfile.dailyStreak,
      personalRecords: serverProfile.personalRecords, weeklyReward: serverProfile.weeklyReward, referral: serverProfile.referral,
      pvpChallenge: activePvpChallenge,
      season: serverProfile.season,
      claimSeasonReward: (rewardId:string) => socket.send(JSON.stringify({type:'seasonRewardClaim',rewardId})),
      claimWeeklyEventReward: (weeklyEventId:string) => socket.send(JSON.stringify({type:'weeklyEventRewardClaim',weeklyEventId})),
      aircraft: aircraftDisplayOrder.map((type) => ({
        name: aircraftDefinitions[type].callsign,
        owned: flightTestMode || serverProfile.unlockedAircraft.includes(type),
        premium: aircraftDefinitions[type].access === 'premium',
        price: aircraftDefinitions[type].creditsRequired,
        neededCredits: Math.max(0, aircraftDefinitions[type].creditsRequired - credits),
      })),
    },
    players: { city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', entries: players },
    territories: { enabled: cityRules.territoriesEnabled, city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', entries: territories,
      legend: territoryDefinitions.map(({ displayName, fixedColor, colorName }) => ({ name: displayName, color: fixedColor, colorName })),
      neutralColor: neutralTerritoryColor },
    objectives: { daily: objectiveItems(objectiveCycle?.daily), weekly: objectiveItems(objectiveCycle?.weekly), dailyId: objectiveCycle?.dailyId, weeklyId: objectiveCycle?.weeklyId },
    mastery: { city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', level: mastery.level, xp: mastery.xp,
      levelStartXp: masteryThreshold(mastery.level), nextXp: masteryThreshold(Math.min(25, mastery.level + 1)), rewards: mastery.unlockedRewards },
    leaderboards: weeklyLeaderboards.map((board) => ({ category: board.category, weekId: board.weekId, localRank: board.localRank, entries: board.top.map((entry) => ({ name: entry.pilotName, value: entry.value, you: entry.pilotId === localPlayerId })) })),
    activities,
    liveEvent,
    stunts: stuntGuide,
    map: {
      mount: (host) => {
        worldMap.mountEmbedded(host);
        contextualHints.trigger('firstDestination');
      },
      unmount: () => worldMap.unmountEmbedded(),
    },
    garage: {
      available: onGround && !crashed,
      reason: crashed ? 'Restart on a runway first.' : 'LAND AT AN AIRPORT TO CHANGE AIRCRAFT.',
      open: () => { if (openGarage()) pilotMenu.close(); },
      setAirportWaypoint: setNearestAirportWaypoint,
    },
    hints: {
      enabled: contextualHints.isEnabled(),
      toggle: () => {
        contextualHints.setEnabled(!contextualHints.isEnabled());
        renderPilotMenu(true);
      },
    },
    navigation: {
      enabled: navigationMarkersEnabled,
      toggle: () => {
        navigationMarkersEnabled = !navigationMarkersEnabled;
        persistedPlayer.navigationMarkersEnabled = navigationMarkersEnabled;
  navigationBeacons.setEnabled(navigationMarkersEnabled && (missionFocus?.showUnrelatedAirportLabels ?? true) && (missionFocus?.showUnrelatedLandmarkLabels ?? true));
        savePlayerProgress();
        renderPilotMenu(true);
      },
    },
    preferences:{touchMode:mobileInput.getMode(),touchLayout:mobileInput.supportsTouchControls(),setTouchMode:(mode:TouchControlsMode)=>{mobileInput.setMode(mode);syncDesktopControlsHelp();if(connectionReady())socket.send(JSON.stringify({type:'analyticsEvent',event:'touch_controls_enabled',mode}));renderPilotMenu();},graphicsQuality:graphicsQualityMode,setGraphicsQuality:(mode:GraphicsQualityMode)=>{graphicsQualityMode=mode;try{localStorage.setItem('airport-chaos-graphics-quality-v1',mode);}catch{/* optional */}if(connectionReady())socket.send(JSON.stringify({type:'analyticsEvent',event:'graphics_quality_changed',mode}));renderPilotMenu(true);},mobileLayout:mobileInput.getLayout(),setMobileControl:(control:MobileControlId,placement:Partial<MobileControlPlacement>)=>mobileInput.setPlacement(control,placement),resetMobileLayout:()=>mobileInput.resetLayout()},
    restart:()=>{if(window.confirm('Restart and respawn at the airport?')){pilotMenu.close();restartGame();}},
    exitFlight: requestFlightExit,
    cityGuide: openCityGuide,
    audio: { muted: audioManager.isMuted(), toggle: toggleAudio, levels: audioManager.getLevels(), setLevel: setAudioLevel },
    haptics: { available: hapticsManager.isAvailable(), enabled: hapticsManager.isEnabled(), toggle: () => {
      hapticsManager.setEnabled(!hapticsManager.isEnabled());
      if (hapticsManager.isEnabled()) hapticsManager.emit('selection');
      renderPilotMenu(true);
    } },
    flightPitch: { inverted: mobileInput.getPitchInverted(), touch: mobileInput.isTouchLayout(), setInverted: (inverted:boolean) => { mobileInput.setPitchInverted(inverted);renderPilotMenu(true); } },
    guide: { enabled: guidedTutorialActive, open: () => { pilotMenu.close(); showFirstRunGuide(); },replay:()=>{pilotMenu.close();restartGuidedTutorial();} },
  };
}

function renderPilotMenu(force = false, section: PilotMenuSection = 'MISSIONS'): void {
  const data = pilotMenuData();
  if (pilotMenu.isOpen()) pilotMenu.refresh(data, force);
  else if (force) pilotMenu.open(data, section);
}

let nextPilotMenuRefreshAt = 0;
function refreshPilotMenu(): void {
  if (!pilotMenu.isOpen() || aircraftGarage.isOpen() || worldMap.isOpen()) return;
  const now = performance.now();
  if (now < nextPilotMenuRefreshAt) return;
  nextPilotMenuRefreshAt = now + 1_000;
  renderPilotMenu();
}

function openPilotMenu(section: PilotMenuSection = 'MISSIONS'): void {
  if (aircraftGarage.isOpen()) return;
  if (worldMap.isOpen()) worldMap.setOpen(false);
  clearHeldActions();
  renderPilotMenu(true, section);
}

function openActiveMissionFromHud(): void {
  const missionId = profileActiveMissionAttempt(serverProfile)?.missionId;
  openPilotMenu('MISSIONS');
  pilotMenu.focusMission(missionId);
}

function togglePilotMenu(): void {
  if (pilotMenu.isOpen()) {
    pilotMenu.close();
    return;
  }
  openPilotMenu();
}

flightMenuButtonElement.addEventListener('click', togglePilotMenu);
flightExitButtonElement.addEventListener('click', () => requestFlightExit());
flightAccountButtonElement.addEventListener('click', () => openPilotMenu('PROFILE'));
activeMissionOverlayElement.tabIndex = 0;
activeMissionOverlayElement.setAttribute('role', 'button');
activeMissionOverlayElement.setAttribute('aria-label', 'Open active mission in Pilot Menu');
activeMissionOverlayElement.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
});
activeMissionOverlayElement.addEventListener('click', openActiveMissionFromHud);
activeMissionOverlayElement.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openActiveMissionFromHud();
});
const toggleWorldMapFromHud = () => {
  if (pilotMenu.isOpen()) pilotMenu.close();
  contextualHints.dismiss();
  worldMap.toggle();
  if (worldMap.isOpen()) contextualHints.trigger('firstDestination');
};
const openTutorialMapFromRadar=()=>{
  toggleWorldMapFromHud();
  if(tutorialNavigationCoach==='radar'&&worldMap.isOpen()){
    tutorialNavigationCoach='map';syncTutorialNavigationMap();renderTutorialPanel();tutorialMapCoach.focus();
  }
};
flightMapButtonElement.addEventListener('click', toggleWorldMapFromHud);
worldMapCloseElement.addEventListener('click', closeTopUiLayer);
radarPanelElement.addEventListener('click', openTutorialMapFromRadar);
radarPanelElement.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openTutorialMapFromRadar();
});

const missionReminderFirstDelaySeconds = 60;
const missionReminderRepeatDelayMs = 10 * 60_000;
const missionReminderMaxPerSession = 2;
let missionReminderFlightSeconds = 0;
let missionReminderCount = 0;
let missionReminderLastEndedAt = -Infinity;
let missionReminderHideTimer: number | undefined;
let missionAvailabilityCheckedAt = -Infinity;
let missionAvailable = false;

function hideMissionReminder(startCooldown = true): void {
  if (missionReminderElement.hidden) return;
  missionReminderElement.hidden = true;
  window.clearTimeout(missionReminderHideTimer);
  missionReminderHideTimer = undefined;
  missionReminderFlightSeconds = 0;
  if (startCooldown) missionReminderLastEndedAt = performance.now();
}

function cityHasAvailableMission(): boolean {
  if (journeyMode) return false;
  const now = performance.now();
  if (now - missionAvailabilityCheckedAt < 1_000) return missionAvailable;
  missionAvailabilityCheckedAt = now;
  missionAvailable = missionsForCity(cityId).some((definition) => !definition.retired && !missionUnavailableReason(definition));
  return missionAvailable;
}

function updateMissionReminder(deltaSeconds: number): void {
  const noMission = !profileActiveMissionAttempt(serverProfile);
  const actuallyFlying = profileHydrated && protocolReady && localLifeState === 'alive' && runStarted && !onGround && !crashed;
  const gameplayVisible = citySelectorElement.hidden && pilotMenuOverlayElement.hidden && !worldMap.isOpen() && !aircraftGarage.isOpen() &&
    !flightTutorial.isOpen() && dallasPracticeSuggestionElement.hidden && !identityTransitionInProgress;
  const eligible = noMission && actuallyFlying && gameplayVisible && cityHasAvailableMission();
  if (!eligible) {
    if (!missionReminderElement.hidden) hideMissionReminder();
    return;
  }
  if (!missionReminderElement.hidden || missionReminderCount >= missionReminderMaxPerSession) return;
  missionReminderFlightSeconds += deltaSeconds;
  if (missionReminderFlightSeconds < missionReminderFirstDelaySeconds || performance.now() - missionReminderLastEndedAt < missionReminderRepeatDelayMs) return;
  missionReminderCopyElement.textContent = cityRules.practiceMode
    ? 'Start a practice mission to build flight skills. Practice Mode gives no permanent rewards.'
    : 'Start a mission to earn rewards and progress.';
  missionReminderElement.hidden = false;
  missionReminderCount += 1;
  window.clearTimeout(missionReminderHideTimer);
  missionReminderHideTimer = window.setTimeout(() => hideMissionReminder(), 8_000);
}

missionReminderDismissElement.addEventListener('click', closeTopUiLayer);
missionReminderOpenElement.addEventListener('click', () => {
  hideMissionReminder();
  openPilotMenu('MISSIONS');
});
registerUiBackLayer({
  id: 'mission-reminder',
  priority: uiBackPriority.transient,
  isActive: () => !missionReminderElement.hidden,
  close: () => hideMissionReminder(),
  containsTarget: (target) => target instanceof Node && missionReminderElement.contains(target),
});

window.addEventListener('keydown', (event) => {
  if (shouldIgnoreGameplayKeyboardEvent(event)) return;
  if (launchCinematicBlocksInput()) return;
  if (pilotMenu.isOpen() || aircraftGarage.isOpen()) return;
  if (event.code === menuBindings.map) {
    event.preventDefault();
    contextualHints.dismiss();
    worldMap.toggle();
    if (worldMap.isOpen()) contextualHints.trigger('firstDestination');
  }
});

const applyCameraZoom = (zoomFactor: number): void => {
  const previousDistance=cameraDistanceMultiplier;
  cameraDistanceMultiplier = THREE.MathUtils.clamp(cameraDistanceMultiplier * zoomFactor, 0.62, 1.8);
  if(guidedTutorialActive&&!tutorialIntroPending&&guidedTutorialStep==='cameraZoom'){
    tutorialZoomTravel+=Math.abs(cameraDistanceMultiplier-previousDistance);
    if(tutorialZoomTravel>=.12)advanceGuidedTutorial('cameraZoomed');
  }
  if (cameraOrbitBlend > 0) {
    const minimumRadius = defaultChaseDistance * 0.62;
    const maximumRadius = defaultChaseDistance * 1.8 + defaultChaseHeight;
    cameraOrbitRadiusTarget = THREE.MathUtils.clamp(cameraOrbitRadiusTarget * zoomFactor, minimumRadius, maximumRadius);
  }
};

const beginCameraOrbit = (event: PointerEvent): void => {
  // Convert the rendered camera frame to orbit coordinates before changing
  // ownership, so pointer-down itself cannot alter distance or framing.
  cameraAircraftForward.set(0, 0, -1).applyQuaternion(airplane.quaternion);
  cameraAircraftForward.y = 0;
  if (cameraAircraftForward.lengthSq() < 0.0001) cameraAircraftForward.set(0, 0, -1);
  else cameraAircraftForward.normalize();
  const aircraftYaw = Math.atan2(-cameraAircraftForward.x, -cameraAircraftForward.z);
  cameraOrbitInverseYawQuaternion.setFromAxisAngle(cameraWorldUp, -aircraftYaw);
  cameraOrbitOffset.copy(camera.position).sub(airplane.position).applyQuaternion(cameraOrbitInverseYawQuaternion);
  cameraOrbitRadius = Math.max(0.01, cameraOrbitOffset.length());
  cameraOrbitRadiusTarget = cameraOrbitRadius;
  cameraOrbitYaw = Math.atan2(cameraOrbitOffset.x, cameraOrbitOffset.z);
  cameraOrbitPitch = Math.asin(THREE.MathUtils.clamp(cameraOrbitOffset.y / cameraOrbitRadius, -1, 1));
  cameraOrbitFocusLocal.copy(lookTarget).sub(airplane.position).applyQuaternion(cameraOrbitInverseYawQuaternion);
  cameraOrbitBlend = 1;
  cameraOrbitDragging = true;
  cameraOrbitRecenterAt = null;
  cameraOrbitPointerId = event.pointerId;
  cameraOrbitPointerX = event.clientX;
  cameraOrbitPointerY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
};

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (flightLaunchState === 'active') {
    event.preventDefault();
    requestFlightLaunchSkip();
    return;
  }
  if (flightLaunchState === 'pending') {
    event.preventDefault();
    return;
  }
  // Controls and HUD elements own their own pointers because they are layered
  // above the canvas. Only unused gameplay canvas space reaches this handler.
  const touch = event.pointerType === 'touch';
  if ((!touch && (event.pointerType !== 'mouse' || event.button !== 0)) || worldMap.isOpen() || pilotMenu.isOpen() || aircraftGarage.isOpen() || flightDialogOpen()) return;
  event.preventDefault();
  if (touch) {
    cameraTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    renderer.domElement.setPointerCapture(event.pointerId);
    if (cameraTouchPointers.size > 1) {
      cameraOrbitDragging = false;
      cameraOrbitPointerId = null;
      const [first, second] = [...cameraTouchPointers.values()];
      cameraPinchDistance = Math.hypot(second.x - first.x, second.y - first.y);
      return;
    }
  }
  beginCameraOrbit(event);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' && cameraTouchPointers.has(event.pointerId)) {
    cameraTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cameraTouchPointers.size > 1) {
      event.preventDefault();
      const [first, second] = [...cameraTouchPointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      applyCameraZoom(pinchZoomFactor(cameraPinchDistance, distance));
      cameraPinchDistance = distance;
      return;
    }
  }
  if (!cameraOrbitDragging || event.pointerId !== cameraOrbitPointerId) return;
  event.preventDefault();
  const deltaX = event.clientX - cameraOrbitPointerX;
  const deltaY = event.clientY - cameraOrbitPointerY;
  if(guidedTutorialActive&&!tutorialIntroPending&&guidedTutorialStep==='cameraLook'){
    tutorialCameraTravel+=Math.hypot(deltaX,deltaY);
    if(tutorialCameraTravel>=60)advanceGuidedTutorial('cameraMoved');
  }
  cameraOrbitPointerX = event.clientX;
  cameraOrbitPointerY = event.clientY;
  // This is the single continuous manual yaw accumulator. It is deliberately
  // never clamped or wrapped while the pointer is held.
  cameraOrbitYaw -= deltaX * 0.008;
  cameraOrbitPitch = THREE.MathUtils.clamp(cameraOrbitPitch - deltaY * 0.006, -1.25, 1.25);
});

const stopCameraOrbit = (event: PointerEvent): void => {
  const wasTouch = event.pointerType === 'touch' && cameraTouchPointers.delete(event.pointerId);
  const wasPinching = cameraPinchDistance > 0;
  if (wasTouch && cameraTouchPointers.size < 2) cameraPinchDistance = 0;
  if (wasPinching) {
    cameraOrbitDragging = false;
    cameraOrbitPointerId = null;
    cameraOrbitRecenterAt = performance.now() + 2_000;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    return;
  }
  if (!cameraOrbitDragging || event.pointerId !== cameraOrbitPointerId) return;
  if (event.cancelable) event.preventDefault();
  const pointerId = event.pointerId;
  cameraOrbitDragging = false;
  cameraOrbitPointerId = null;
  // Normalize only after release, preserving the identical viewing direction
  // while keeping the later chase blend numerically short.
  cameraOrbitYaw = THREE.MathUtils.euclideanModulo(cameraOrbitYaw + Math.PI, Math.PI * 2) - Math.PI;
  // Only a completed/cancelled drag arms the chase return.
  cameraOrbitRecenterAt = performance.now() + 2_000;
  if (renderer.domElement.hasPointerCapture(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
};
renderer.domElement.addEventListener('pointerup', stopCameraOrbit);
renderer.domElement.addEventListener('pointercancel', stopCameraOrbit);
renderer.domElement.addEventListener('lostpointercapture', stopCameraOrbit);
const resetCameraPointers = (): void => {
  for (const pointerId of cameraTouchPointers.keys()) {
    if (renderer.domElement.hasPointerCapture(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
  }
  cameraTouchPointers.clear();
  cameraPinchDistance = 0;
  cameraOrbitDragging = false;
  cameraOrbitPointerId = null;
  cameraOrbitRecenterAt = performance.now() + 2_000;
};
const gameplayCinematicStartPosition = new THREE.Vector3();
const gameplayCinematicStartTarget = new THREE.Vector3();
const gameplayCinematicOrbitPosition = new THREE.Vector3();
const gameplayCinematicOrbitTarget = new THREE.Vector3();
const gameplayCinematicPullback = new THREE.Vector3();
let gameplayCinematicStartFov = CAMERA_CHASE_FOV;

cinematicDirector = new CinematicDirector({
  root: flightGameRoot,
  canStartCamera: (kind) => {
    const combatDanger = lockingThreatIds.size > 0 || performance.now() < incomingFireUntil;
    if (document.hidden || crashed || localLifeState !== 'alive' || guidedTutorialActive || combatDanger) return false;
    if (flightLaunchState === 'pending' || flightLaunchState === 'active') return false;
    if (pilotMenu.isOpen() || aircraftGarage.isOpen() || worldMap.isOpen()) return false;
    // landingScored is authoritative and may arrive after the brief local
    // LANDED label has naturally settled back to TAXI on a real network.
    return kind === 'PERFECT_LANDING' ? onGround && (flightState === 'LANDED' || flightState === 'TAXI') : !onGround;
  },
  onCameraStart: (kind) => {
    if (kind !== 'PERFECT_LANDING') return;
    // The normal landing recap otherwise sits above the canvas and makes the
    // authoritative perfect-landing camera move effectively invisible.
    flightRecapElement.hidden = true;
    gameplayCinematicStartPosition.copy(camera.position);
    gameplayCinematicStartTarget.copy(lookTarget);
    gameplayCinematicStartFov = camera.fov;
    clearHeldActions();
    mobileInput.reset();
    resetCameraPointers();
    cameraOrbitBlend = 0;
    cameraOrbitRecenterAt = null;
    cameraRelativeOffsetInitialized = false;
  },
  onCameraEnd: (kind) => {
    if (kind !== 'PERFECT_LANDING') return;
    resetCameraPointers();
    cameraOrbitBlend = 0;
    cameraOrbitRecenterAt = null;
    cameraRelativeOffsetInitialized = false;
    if (visibleRecap) showFlightRecap(visibleRecap.title, visibleRecap.landing, false);
  },
  onBannerShown: (kind) => {
    if (kind === 'MISSION_COMPLETE' || kind === 'PERFECT_LANDING') audioManager.playReward();
  },
});
document.addEventListener('pointerdown', (event) => {
  if (!cinematicDirector.isSkippable()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  cinematicDirector.skip();
}, true);
window.addEventListener('blur', resetCameraPointers);
window.addEventListener('pagehide', resetCameraPointers);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  resetCameraPointers();
  cinematicDirector.clearPresentation();
});
renderer.domElement.addEventListener('dragstart', (event) => event.preventDefault());
renderer.domElement.addEventListener('wheel', (event) => {
  if (launchCinematicBlocksInput()) {
    event.preventDefault();
    return;
  }
  // The map owns its own canvas wheel input. The flight canvas only handles
  // chase/orbit zoom while the map is closed.
  if (worldMap.isOpen() || pilotMenu.isOpen() || aircraftGarage.isOpen()) return;
  event.preventDefault();
  const zoomFactor = Math.exp(event.deltaY * 0.0012);
  applyCameraZoom(zoomFactor);
}, { passive: false });
// Tail starts at the muzzle/projectile position; no half-streak behind the gun.
const projectileGeometry = new THREE.BoxGeometry(0.3, 0.3, 9).translate(0, 0, -4.5);
const projectileGlowGeometry = new THREE.BoxGeometry(0.78, 0.78, 11.5).translate(0, 0, -5.75);
const projectileMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff5be,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const projectileGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff8c38,
  transparent: true,
  opacity: 0.25,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const projectileForward = new THREE.Vector3(0, 0, -1);
const clientProjectiles = new Map<string, ClientProjectile>();
const projectilePool: ClientProjectile[] = [];
const predictedProjectiles = new Map<string, ClientProjectile>();
const maxClientProjectiles = 256;
const pendingTracerLifetime = 0.35;
const maxAuthoritativeProjectileAgeMs = (COMBAT_RANGE / BASE_PROJECTILE_SPEED + 1) * 1_000;
const assistedShotVisuals: AssistedShotVisual[] = [];
const assistedShotPool: THREE.Group[] = [];
const recentAssistedShotIds = new Map<string, number>();
const maxAssistedShotVisuals = 24;
const assistedShotDirection = new THREE.Vector3();
const assistedShotPoint = new THREE.Vector3();
const muzzleFlashGeometry = new THREE.SphereGeometry(1, 8, 6);
const impactFlashGeometry = new THREE.SphereGeometry(1, 9, 7);
const muzzleFlashes: FlashEffect[] = [];
const muzzleFlashPool: FlashEffect[] = [];
const impactFlashes: FlashEffect[] = [];
const impactFlashPool: FlashEffect[] = [];
const maxFlashEffects = 12;
const destructionFlashGeometry = new THREE.SphereGeometry(1, 10, 7);
const destructionDebrisGeometry = new THREE.BoxGeometry(1, 1, 1);
const destructionEffects: DestructionEffect[] = [];
const destructionEffectPool: DestructionEffect[] = [];
const recentDestructionIds = new Map<string, number>();
const destructionPosition = new THREE.Vector3();
const remoteEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const projectileDirection = new THREE.Vector3();
const projectileOrigin = new THREE.Vector3();
const muzzleQuaternion = new THREE.Quaternion();
// One reusable line, only in the existing opt-in development combat view.
const aimQaRay = import.meta.env.DEV && combatQaElement
  ? new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0x63e8ff, depthTest: false })) : undefined;
let aimQaRayUntil = 0;
if (aimQaRay) { aimQaRay.visible = false; aimQaRay.frustumCulled = false; scene.add(aimQaRay); }
function showAimQaRay(origin: THREE.Vector3Like, direction: THREE.Vector3Like): void {
  if (!aimQaRay) return;
  const points = aimQaRay.geometry.getAttribute('position') as THREE.BufferAttribute;
  points.setXYZ(0, origin.x, origin.y, origin.z);
  points.setXYZ(1, origin.x + direction.x * COMBAT_RANGE, origin.y + direction.y * COMBAT_RANGE, origin.z + direction.z * COMBAT_RANGE);
  points.needsUpdate = true;
  aimQaRay.visible = true;
  aimQaRayUntil = performance.now() + 250;
}
let localPlayerId: string | null = null;
let localLifeState: PlayerLifeState = 'respawning';
let navigationTimer = 0;
let progressionHudTimer = 0;
let fireCooldown = 0;
let clientShotSequence = 0;
type FireBlockedReason = 'menu' | 'cinematic' | 'protection' | 'lifecycle' | 'cooldown' | 'socket' | 'invalid_state';
let lastFireBlockedReason: FireBlockedReason | undefined;
let lastFireBlockedAt = 0;

function reportFireBlocked(reason: FireBlockedReason): void {
  if (!import.meta.env.DEV) return;
  const now = performance.now();
  if (reason === lastFireBlockedReason && now - lastFireBlockedAt < 1_000) return;
  lastFireBlockedReason = reason;
  lastFireBlockedAt = now;
  console.debug(`FIRE_BLOCKED ${reason}`);
  if (combatQaElement) combatQaDetail = `FIRE_BLOCKED ${reason}`;
}

function localFireBlockReason(): FireBlockedReason | undefined {
  if (launchCinematicBlocksInput()) return 'cinematic';
  if (flightTutorial.isOpen()) return 'menu';
  if (crashed || !runStarted || !localPlayerId) return 'invalid_state';
  if (localLifeState !== 'alive') return localLifeState === 'respawning' ? 'protection' : 'lifecycle';
  if (!connectionReady()) return 'socket';
  if (fireCooldown > 0) return 'cooldown';
  return undefined;
}
let wasFirstPlace = false;
let leaderMessageTimer: number | undefined;
const playersPanel = new PlayersPanel(document.querySelector<HTMLElement>('#real-players')!);
const cityTerritoriesPanel = new CityTerritoriesPanel(document.querySelector<HTMLElement>('#city-territories')!);
document.querySelector<HTMLElement>('#city-territories')!.hidden = !cityRules.territoriesEnabled;
cityTerritoriesPanel.update(cityTerritoryEntries(), null, false);
const leaderMessageElement = document.querySelector<HTMLDivElement>('#leader-message')!;
const cityHumanRoster = new Map<string, LeaderboardPlayer>();
type HumanRadarTrack = { x: number; z: number; altitudeMeters: number };
const humanRadarTracks = new Map<string, HumanRadarTrack>();
let nextPlayersAltitudeRefreshAt = 0;
function refreshPlayersPanelAltitude(now = performance.now()): void {
  if (now < nextPlayersAltitudeRefreshAt) return;
  nextPlayersAltitudeRefreshAt = now + 500;
  for (const player of cityHumanRoster.values()) {
    if (player.playerId === localPlayerId) player.altitudeMeters = altitudeAboveTerrain();
    else {
      const track = humanRadarTracks.get(player.playerId);
      if (track) player.altitudeMeters = track.altitudeMeters;
    }
  }
  playersPanel.update([...cityHumanRoster.values()], localPlayerId, ownedTerritoriesForPlayer);
}
const collisionRadius = 2.5;
const nearMissRadius = 12;
const collisionRadiusSquared = collisionRadius * collisionRadius;
const nearMissRadiusSquared = nearMissRadius * nearMissRadius;
const previousInteractionPosition = new THREE.Vector3();
const interactionSweepStart = new THREE.Vector3();
let interactionSweepReady = false;
let lastCollisionIntentAt = 0;

function interactionSegmentDistanceSquared(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
  const projection = lengthSquared <= 0.000001 ? 0 : THREE.MathUtils.clamp(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY + (point.z - start.z) * segmentZ) / lengthSquared,
    0,
    1,
  );
  const dx = point.x - (start.x + segmentX * projection);
  const dy = point.y - (start.y + segmentY * projection);
  const dz = point.z - (start.z + segmentZ * projection);
  return dx * dx + dy * dy + dz * dz;
}

function applyVisualQaPreset(preset: NonNullable<typeof cityWorld.visualQaPresets>[number]): void {
  clearHeldActions();
  crashed = false;
  health = maxHealth;
  throttle = preset.onGround || preset.speed === 0 ? 0 : 0.62;
  mobileInput.setThrottleState(throttle);
  currentSpeed = preset.onGround || preset.speed === 0 ? 0 : preset.speed && aircraftType === 'fighter' && flightTestMode ? preset.speed : Math.min(currentAircraft.maxSpeed * 0.62, 58);
  verticalSpeed = 0;
  heading = preset.heading;
  pitch = preset.pitch ?? 0;
  roll = 0;
  pitchControlStrength = 0;
  yawControlStrength = 0;
  smoothedTouchSteering = { x: 0, y: 0 };
  airplane.position.set(preset.x, groundPlaneY(preset.x, preset.z) + preset.altitude, preset.z);
  airplane.rotation.set(pitch, heading, roll, 'YXZ');
  forward.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  velocity.copy(forward).multiplyScalar(currentSpeed);
  onGround = Boolean(preset.onGround);
  takeoffRollMeters = 0;
  landedFeedbackTime = 0;
  cameraShakeTime = 0;
  runStarted = true;
  crashOverlay.classList.add('hidden');
  setFlightState(onGround ? 'TAXI' : 'FLYING');
  updateHealthDisplay();
  updateFlightHud();
  updateNavigationHud();
  if (cityWorld.updateWorldStreaming) cityWorld.updateWorldStreaming(airplane.position, velocity);
  else updateOsmCityChunks(airplane.position);
  updateCamera(1);
  sendLocalState();
}

if (visualQaMode && cityWorld.visualQaPresets) {
  visualQaPanelElement.hidden = false;
  for (const preset of cityWorld.visualQaPresets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = preset.label;
    button.addEventListener('click', () => applyVisualQaPreset(preset));
    visualQaPresetsElement.append(button);
  }
  for (const airport of airports.filter(airport => airport.id !== centralAirport.id)) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = `${airport.name} RUNWAY`;
    button.onclick = () => applyVisualQaPreset({ ...cityWorld.visualQaPresets![0], x: airport.x, z: airport.z, heading: airport.heading, altitude: 0, onGround: true });
    visualQaPresetsElement.append(button);
  }
}

function createProjectileVisual(): ClientProjectile {
  const mesh = new THREE.Group();
  const glow = new THREE.Mesh(projectileGlowGeometry, projectileGlowMaterial);
  const core = new THREE.Mesh(projectileGeometry, projectileMaterial);
  glow.renderOrder = 2;
  core.renderOrder = 3;
  mesh.add(glow, core);
  return {
    mesh,
    direction: new THREE.Vector3(),
    authoritativePosition: new THREE.Vector3(),
    pendingAge: 0,
    speed: 520,
    local: false,
    ownerIsBot: false,
    ownerId: '',
    spawnedAt: 0,
    lastAuthoritativeAt: 0,
  };
}

function releaseProjectile(projectile: ClientProjectile): void {
  scene.remove(projectile.mesh);
  projectile.mesh.visible = false;
  if (projectilePool.length < maxClientProjectiles) projectilePool.push(projectile);
}

function createFlashEffect(color: number): FlashEffect {
  const mesh = new THREE.Group();
  const coreMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(impactFlashGeometry, glowMaterial);
  const core = new THREE.Mesh(muzzleFlashGeometry, coreMaterial);
  mesh.add(glow, core);
  return { mesh, coreMaterial, glowMaterial, elapsed: 0, duration: 0.2 };
}

function spawnFlash(
  effects: FlashEffect[],
  pool: FlashEffect[],
  position: THREE.Vector3,
  duration: number,
  startScale: number,
): void {
  if (effects.length >= maxFlashEffects) {
    const oldest = effects.shift();
    if (oldest) {
      scene.remove(oldest.mesh);
      pool.push(oldest);
    }
  }
  const flash = pool.pop() ?? createFlashEffect(0xffa33c);
  flash.elapsed = 0;
  flash.duration = duration;
  flash.mesh.position.copy(position);
  flash.mesh.scale.setScalar(startScale);
  flash.coreMaterial.opacity = 1;
  flash.glowMaterial.opacity = 0.44;
  flash.mesh.visible = true;
  scene.add(flash.mesh);
  effects.push(flash);
}

function updateFlashEffects(effects: FlashEffect[], pool: FlashEffect[], delta: number): void {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const flash = effects[index];
    flash.mesh.visible = true;
    // The muzzle flash is attached light, not a world-space puff left behind
    // for 110 ms (120 m at Fighter Boost speed).
    if (effects === muzzleFlashes) getCurrentMuzzleTransform(flash.mesh.position, projectileDirection);
    flash.elapsed += delta;
    const progress = flash.elapsed / flash.duration;
    flash.mesh.scale.multiplyScalar(1 + delta * 13);
    flash.coreMaterial.opacity = Math.max(0, 1 - progress);
    flash.glowMaterial.opacity = Math.max(0, 0.44 * (1 - progress));
    if (flash.elapsed < flash.duration) continue;
    scene.remove(flash.mesh);
    flash.mesh.visible = false;
    effects.splice(index, 1);
    if (pool.length < maxFlashEffects) pool.push(flash);
  }
}

function getCurrentMuzzleTransform(origin: THREE.Vector3, direction: THREE.Vector3): void {
  airplane.updateWorldMatrix(true, true);
  const socket = aircraftMuzzleSockets[aircraftType];
  const anchor = airplane.userData.muzzleAnchor as THREE.Object3D | undefined;
  if (anchor) {
    anchor.getWorldPosition(origin);
    anchor.getWorldQuaternion(muzzleQuaternion);
    direction.set(socket.forward.x, socket.forward.y, socket.forward.z).applyQuaternion(muzzleQuaternion).normalize();
    return;
  }
  airplane.getWorldQuaternion(muzzleQuaternion);
  direction.set(socket.forward.x, socket.forward.y, socket.forward.z).applyQuaternion(muzzleQuaternion).normalize();
  origin.set(socket.position.x, socket.position.y, socket.position.z).applyMatrix4(airplane.matrixWorld);
}

function spawnMuzzleFeedback(origin: THREE.Vector3, direction: THREE.Vector3, clientShotId: string, targetId?: string): void {
  projectileOrigin.copy(origin);
  projectileDirection.copy(direction);
  spawnFlash(muzzleFlashes, muzzleFlashPool, projectileOrigin, 0.11, 0.45);
  cameraShakeTime = Math.max(cameraShakeTime, 0.08);
  // A LOCKED trigger is rendered only after the server confirms its exact
  // assisted hit. Keeping it out of the ballistic prediction map guarantees
  // one visible tracer rather than a straight-plus-assisted duplicate.
  if (targetId) return;

  const predicted = projectilePool.pop() ?? createProjectileVisual();
  predicted.direction.copy(projectileDirection);
  predicted.speed = ballisticShotSpeed(velocity, predicted.direction);
  predicted.local = true;
  predicted.ownerId = localPlayerId ?? '';
  predicted.pendingAge = 0;
  predicted.mesh.position.copy(projectileOrigin);
  predicted.mesh.quaternion.setFromUnitVectors(projectileForward, predicted.direction);
  predicted.mesh.visible = true;
  scene.add(predicted.mesh);
  if (predictedProjectiles.size >= 8) {
    const oldestShotId = predictedProjectiles.keys().next().value as string | undefined;
    const oldest = oldestShotId ? predictedProjectiles.get(oldestShotId) : undefined;
    if (oldestShotId) predictedProjectiles.delete(oldestShotId);
    if (oldest) releaseProjectile(oldest);
  }
  predictedProjectiles.set(clientShotId, predicted);
}

function createAssistedShotMesh(): THREE.Group {
  const mesh = new THREE.Group();
  const glow = new THREE.Mesh(projectileGlowGeometry, projectileGlowMaterial);
  const core = new THREE.Mesh(projectileGeometry, projectileMaterial);
  glow.renderOrder = 2;
  core.renderOrder = 3;
  mesh.add(glow, core);
  return mesh;
}

function addAssistedShot(message: Extract<ServerMessage, { type: 'assistedShot' }>): void {
  if (recentAssistedShotIds.has(message.shotId)) return;
  const now = performance.now();
  recentAssistedShotIds.set(message.shotId, now);
  if (recentAssistedShotIds.size > 128) {
    for (const [shotId, timestamp] of recentAssistedShotIds) {
      if (now - timestamp > 2_000 || recentAssistedShotIds.size > 96) recentAssistedShotIds.delete(shotId);
    }
  }
  if (assistedShotVisuals.length >= maxAssistedShotVisuals) {
    const oldest = assistedShotVisuals.shift();
    if (oldest) {
      scene.remove(oldest.mesh);
      assistedShotPool.push(oldest.mesh);
    }
  }
  const mesh = assistedShotPool.pop() ?? createAssistedShotMesh();
  const origin = new THREE.Vector3(message.origin.x, message.origin.y, message.origin.z);
  // Remote origin is authoritative; local presentation starts at the current
  // rendered gun, not the aircraft's position one network round-trip ago.
  if (message.ownerId === localPlayerId) getCurrentMuzzleTransform(origin, assistedShotDirection);
  const targetPosition = new THREE.Vector3(message.targetPosition.x, message.targetPosition.y, message.targetPosition.z);
  const renderedTarget = message.targetId === localPlayerId ? airplane : remotePlayers.get(message.targetId)?.plane;
  if (renderedTarget?.visible) targetPosition.copy(renderedTarget.position);
  if (message.ownerId === localPlayerId) {
    assistedShotDirection.subVectors(targetPosition, origin).normalize();
    showAimQaRay(origin, assistedShotDirection);
  }
  mesh.position.copy(origin);
  assistedShotDirection.subVectors(targetPosition, origin).normalize();
  mesh.quaternion.setFromUnitVectors(projectileForward, assistedShotDirection);
  mesh.scale.set(1, 1, Math.min(1, origin.distanceTo(targetPosition) / 11.5));
  mesh.visible = true;
  scene.add(mesh);
  const distance = origin.distanceTo(targetPosition);
  const ownerVelocity = message.ownerId === localPlayerId ? velocity : remotePlayers.get(message.ownerId)?.velocity;
  // Finish a close-range visual before the firing aircraft overtakes its hit.
  const visualSpeed = ownerVelocity ? ballisticShotSpeed(ownerVelocity, assistedShotDirection) : 520;
  assistedShotVisuals.push({
    shotId: message.shotId,
    mesh,
    origin,
    targetPosition,
    targetId: message.targetId,
    ownerId: message.ownerId,
    elapsed: 0,
    duration: Math.max(0.001, Math.min(0.08 + THREE.MathUtils.clamp(distance / COMBAT_RANGE, 0, 1) * 0.07, distance / visualSpeed)),
  });
}

function spawnImpactFeedback(playerId: string): void {
  const target = playerId === localPlayerId ? airplane.position : remotePlayers.get(playerId)?.plane.position;
  if (!target) return;
  spawnFlash(impactFlashes, impactFlashPool, target, 0.28, 0.7);
}

function addProjectile(message: Extract<ServerMessage, { type: 'projectileSpawn' }>): void {
  if (clientProjectiles.has(message.projectileId)) return;
  const ownerIsBot = remotePlayers.get(message.ownerId)?.isBot === true;
  if (ownerIsBot && unrelatedFocusedBot(message.ownerId)) return;
  if (clientProjectiles.size >= maxClientProjectiles) {
    const oldestProjectileId = clientProjectiles.keys().next().value as string | undefined;
    if (oldestProjectileId) removeClientProjectile(oldestProjectileId);
  }
  const predicted = message.ownerId === localPlayerId && message.clientShotId
    ? predictedProjectiles.get(message.clientShotId)
    : undefined;
  if (message.clientShotId) predictedProjectiles.delete(message.clientShotId);
  const projectile = predicted ?? projectilePool.pop() ?? createProjectileVisual();
  projectile.direction.set(message.direction.x, message.direction.y, message.direction.z).normalize();
  projectile.speed = message.speed;
  projectile.local = message.ownerId === localPlayerId;
  projectile.ownerIsBot = ownerIsBot;
  projectile.ownerId = message.ownerId;
  projectile.authoritativePosition.set(message.position.x, message.position.y, message.position.z);
  projectile.pendingAge = 0;
  projectile.spawnedAt = performance.now();
  projectile.lastAuthoritativeAt = projectile.spawnedAt;
  // Keep the render-frame muzzle visible when the server adopts a local shot.
  // A late authoritative origin is allowed to advance this tracer, never pull
  // it backwards through a fast-moving Fighter.
  if (predicted) {
    projectileOrigin.subVectors(projectile.authoritativePosition, projectile.mesh.position);
    if (projectileOrigin.dot(projectile.direction) < 0) projectile.authoritativePosition.copy(projectile.mesh.position);
  } else {
    projectile.mesh.position.copy(projectile.authoritativePosition);
    if (projectile.local) {
      getCurrentMuzzleTransform(projectile.mesh.position, projectileDirection);
      projectile.authoritativePosition.copy(projectile.mesh.position);
    }
  }
  projectile.mesh.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
  if (projectile.local) showAimQaRay(projectile.mesh.position, projectile.direction);
  projectile.mesh.visible = true;
  scene.add(projectile.mesh);
  clientProjectiles.set(message.projectileId, projectile);
}

function updateClientProjectiles(message: Extract<ServerMessage, { type: 'projectileStates' }>): void {
  const now = performance.now();
  for (const state of message.projectiles) {
    const projectile = clientProjectiles.get(state.projectileId);
    if (!projectile) continue;
    projectile.authoritativePosition.set(state.position.x, state.position.y, state.position.z);
    projectile.direction.set(state.direction.x, state.direction.y, state.direction.z).normalize();
    projectile.lastAuthoritativeAt = now;
  }
}

function removeClientProjectile(projectileId: string): void {
  const projectile = clientProjectiles.get(projectileId);
  if (!projectile) return;
  releaseProjectile(projectile);
  clientProjectiles.delete(projectileId);
}

function updateProjectiles(delta: number): void {
  const now = performance.now();
  if (aimQaRay && now >= aimQaRayUntil) aimQaRay.visible = false;
  for (const [projectileId, projectile] of clientProjectiles) {
    projectile.mesh.visible = true;
    // Projectile removals are normally explicit.  This bounded fallback is
    // necessary when a slow socket drops an obsolete remove/state frame: the
    // Bound an unconfirmed visual without expiring a minimum-speed round
    // before it can traverse the shared authoritative combat range.
    if (now - projectile.spawnedAt > maxAuthoritativeProjectileAgeMs || now - projectile.lastAuthoritativeAt > 1_200) {
      removeClientProjectile(projectileId);
      continue;
    }
    const positionBlend = 1 - Math.exp(-delta * 34);
    // Extrapolate the same straight authoritative trajectory between packets.
    // Previously lerping only toward the last packet froze rounds behind a
    // moving aircraft. Never rewind an adopted local tracer along its path.
    projectile.mesh.position.addScaledVector(projectile.direction, projectile.speed * delta);
    projectile.authoritativePosition.addScaledVector(projectile.direction, projectile.speed * delta);
    if (projectile.local) {
      projectileOrigin.subVectors(projectile.authoritativePosition, projectile.mesh.position);
      const backward = projectileOrigin.dot(projectile.direction);
      if (backward < 0) projectile.authoritativePosition.addScaledVector(projectile.direction, -backward);
    }
    projectile.mesh.position.lerp(projectile.authoritativePosition, positionBlend);
    projectile.mesh.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
  }
  for (const [clientShotId, projectile] of predictedProjectiles) {
    projectile.pendingAge += delta;
    projectile.mesh.position.addScaledVector(projectile.direction, delta * projectile.speed);
    if (projectile.pendingAge < pendingTracerLifetime) continue;
    predictedProjectiles.delete(clientShotId);
    releaseProjectile(projectile);
  }
  for (let index = assistedShotVisuals.length - 1; index >= 0; index -= 1) {
    const shot = assistedShotVisuals[index];
    shot.mesh.visible = true;
    // Assisted shots are short visual-only links to a confirmed target. Their
    // source follows the rendered gun while the endpoint follows that target.
    if (shot.ownerId === localPlayerId) getCurrentMuzzleTransform(shot.origin, assistedShotDirection);
    else {
      const owner = remotePlayers.get(shot.ownerId);
      const anchor = owner?.plane.userData.muzzleAnchor as THREE.Object3D | undefined;
      if (owner?.plane.visible && anchor) {
        owner.plane.updateWorldMatrix(true, true);
        anchor.getWorldPosition(shot.origin);
      }
    }
    shot.elapsed += delta;
    const target = shot.targetId === localPlayerId ? airplane : remotePlayers.get(shot.targetId)?.plane;
    if (target?.visible) shot.targetPosition.copy(target.position);
    const progress = THREE.MathUtils.clamp(shot.elapsed / shot.duration, 0, 1);
    assistedShotPoint.lerpVectors(shot.origin, shot.targetPosition, progress);
    assistedShotDirection.subVectors(shot.targetPosition, shot.origin).normalize();
    shot.mesh.position.copy(assistedShotPoint);
    shot.mesh.quaternion.setFromUnitVectors(projectileForward, assistedShotDirection);
    shot.mesh.scale.z = Math.min(1, assistedShotPoint.distanceTo(shot.targetPosition) / 11.5);
    if (progress < 1) continue;
    scene.remove(shot.mesh);
    shot.mesh.visible = false;
    assistedShotVisuals.splice(index, 1);
    if (assistedShotPool.length < maxAssistedShotVisuals) assistedShotPool.push(shot.mesh);
  }
}

function createDestructionEffect(position: THREE.Vector3, type: AircraftType): void {
  if (destructionEffects.length >= MAX_DESTRUCTION_EFFECTS) {
    const oldest = destructionEffects.shift();
    if (oldest) recycleDestructionEffect(oldest);
  }
  let effect = destructionEffectPool.pop();
  if (effect) {
    effect.group.position.copy(position);
    effect.group.visible = true;
    effect.elapsed = 0;
    effect.scale = type === 'cargo' ? 1.6 : type === 'fighter' ? 1.12 : type === 'privateJet' ? 1.3 : 0.9;
    effect.flashMaterial.opacity = 0.98;
    effect.fireMaterial.opacity = 0.8;
    effect.fireMaterial.color.setHex(type === 'fighter' ? 0xff4b19 : 0xff7925);
    effect.smokeMaterial.opacity = 0.42;
    effect.debrisMaterial.opacity = 0.9;
    effect.flash.scale.setScalar(1.4 * effect.scale);
    effect.fire.scale.setScalar(2.4 * effect.scale);
    effect.smoke.scale.setScalar(2 * effect.scale);
    for (let index = 0; index < effect.debris.length; index += 1) {
      const piece = effect.debris[index];
      const angle = index / effect.debris.length * Math.PI * 2;
      piece.mesh.position.set(0, 0, 0);
      piece.mesh.rotation.set(0, 0, 0);
      piece.velocity.set(Math.cos(angle) * (5 + index % 3), 2.5 + index % 4, Math.sin(angle) * (5 + index % 3));
    }
    scene.add(effect.group);
    destructionEffects.push(effect);
    return;
  }
  const group = new THREE.Group();
  group.position.copy(position);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd066,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const debrisMaterial = new THREE.MeshBasicMaterial({ color: 0xff6338, transparent: true, opacity: 0.92 });
  const fireMaterial = new THREE.MeshBasicMaterial({ color: type === 'fighter' ? 0xff4b19 : 0xff7925, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x242932, transparent: true, opacity: 0.42, depthWrite: false });
  const flash = new THREE.Mesh(destructionFlashGeometry, flashMaterial);
  const fire = new THREE.Mesh(destructionFlashGeometry, fireMaterial);
  const smoke = new THREE.Mesh(destructionFlashGeometry, smokeMaterial);
  const scale = type === 'cargo' ? 1.6 : type === 'fighter' ? 1.12 : type === 'privateJet' ? 1.3 : 0.9;
  flash.scale.setScalar(1.4 * scale);
  fire.scale.setScalar(2.4 * scale);
  smoke.scale.setScalar(2 * scale);
  group.add(flash);
  group.add(fire, smoke);
  const debris: DestructionEffect['debris'] = [];
  for (let index = 0; index < DESTRUCTION_FRAGMENT_COUNT; index += 1) {
    const angle = index / DESTRUCTION_FRAGMENT_COUNT * Math.PI * 2;
    const mesh = new THREE.Mesh(destructionDebrisGeometry, debrisMaterial);
    mesh.scale.set(0.38 + (index % 3) * 0.16, 0.24, 0.65 + (index % 2) * 0.22);
    group.add(mesh);
    debris.push({
      mesh,
      velocity: new THREE.Vector3(Math.cos(angle) * (5 + index % 3), 2.5 + (index % 4), Math.sin(angle) * (5 + index % 3)),
    });
  }
  scene.add(group);
  destructionEffects.push({ group, flash, flashMaterial, fire, fireMaterial, smoke, smokeMaterial, debrisMaterial, debris, elapsed: 0, scale });
}

function recycleDestructionEffect(effect: DestructionEffect): void {
  scene.remove(effect.group);
  destructionEffectPool.push(effect);
}

function updateDestructionEffects(delta: number): void {
  for (let effectIndex = destructionEffects.length - 1; effectIndex >= 0; effectIndex -= 1) {
    const effect = destructionEffects[effectIndex];
    effect.group.visible = true;
    effect.elapsed += delta;
    const progress = effect.elapsed / DESTRUCTION_EFFECT_DURATION_SECONDS;
    effect.flash.scale.setScalar(effect.scale * (1.4 + progress * 8));
    effect.fire.scale.setScalar(effect.scale * (2.4 + progress * 13));
    effect.smoke.scale.setScalar(effect.scale * (2 + progress * 17));
    effect.flashMaterial.opacity = Math.max(0, 0.98 * (1 - progress * 3));
    effect.fireMaterial.opacity = Math.max(0, 0.8 * (1 - progress * 1.5));
    effect.smokeMaterial.opacity = Math.max(0, 0.42 * Math.sin(Math.PI * progress));
    effect.debrisMaterial.opacity = Math.max(0, 0.9 * (1 - progress));
    for (const piece of effect.debris) {
      piece.mesh.position.addScaledVector(piece.velocity, delta);
      piece.velocity.y -= delta * 7;
      piece.mesh.rotation.x += delta * 4;
      piece.mesh.rotation.z += delta * 5;
    }
    if (effect.elapsed < DESTRUCTION_EFFECT_DURATION_SECONDS) continue;
    recycleDestructionEffect(effect);
    destructionEffects.splice(effectIndex, 1);
  }
}

function updateLeaderboard(players: LeaderboardPlayer[]): void {
  cityHumanRoster.clear();
  for (const player of players) {
    if (player.cityId !== cityId || player.entityType !== 'player' || player.isBot !== false) continue;
    cityHumanRoster.set(player.playerId, player);
    if ([player.position?.x, player.position?.z].every(Number.isFinite)) {
      const track = humanRadarTracks.get(player.playerId);
      if (track) {
        track.x = player.position.x;
        track.z = player.position.z;
        if (Number.isFinite(player.altitudeMeters)) track.altitudeMeters = player.altitudeMeters!;
      } else {
        humanRadarTracks.set(player.playerId, { x: player.position.x, z: player.position.z, altitudeMeters: Number.isFinite(player.altitudeMeters) ? player.altitudeMeters! : 0 });
      }
    }
  }
  for (const playerId of humanRadarTracks.keys()) {
    if (!cityHumanRoster.has(playerId)) humanRadarTracks.delete(playerId);
  }
  playersPanel.update([...cityHumanRoster.values()], localPlayerId, ownedTerritoriesForPlayer);
  for (const remote of remotePlayers.values()) {
    if (!remote.isBot && !cityHumanRoster.has(remote.playerId)) removeRemotePlayer(remote.playerId);
  }

  const isFirstPlace = players[0]?.playerId === localPlayerId;
  if (isFirstPlace && !wasFirstPlace) {
    leaderMessageElement.classList.remove('hidden');
    window.clearTimeout(leaderMessageTimer);
    leaderMessageTimer = window.setTimeout(() => leaderMessageElement.classList.add('hidden'), 1800);
    playLeaderSound();
  }
  wasFirstPlace = isFirstPlace;
}

function updateRemotePlayer(player: NetworkPlayer): void {
  if (player.playerId === localPlayerId) return;
  if (player.cityId !== cityId || ![player.position.x, player.position.y, player.position.z, player.rotation.x, player.rotation.y, player.rotation.z].every(Number.isFinite)) {
    removeRemotePlayer(player.playerId);
    return;
  }

  if (player.isBot !== true) {
    const track = humanRadarTracks.get(player.playerId);
    if (track) {
      track.x = player.position.x;
      track.z = player.position.z;
      if (Number.isFinite(player.altitudeMeters)) track.altitudeMeters = player.altitudeMeters!;
    } else {
      humanRadarTracks.set(player.playerId, { x: player.position.x, z: player.position.z, altitudeMeters: Number.isFinite(player.altitudeMeters) ? player.altitudeMeters! : 0 });
    }
  }

  const lifeState = networkLifeState(player.lifeState);
  remoteEuler.set(player.rotation.x, player.rotation.y, player.rotation.z, 'YXZ');
  let remote = remotePlayers.get(player.playerId);

  if (!remote) {
    const targetPosition = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
    const targetQuaternion = new THREE.Quaternion().setFromEuler(remoteEuler);
    const plane = createAirplane(player.aircraftType, true);
    if (player.equippedCosmetics) applyEquippedLivery(plane, player.aircraftType, player.equippedCosmetics);
    const ownershipColors = ownedTerritoriesForPlayer(player.playerId).map(({ color }) => color);
    const ownershipAccent = ownershipColors[0];
    const identityTag = createPlayerIdentityTag(player.displayName ?? 'PLAYER', player.aircraftType, player.playerId === kingPlayerId, Boolean(player.isBot), ownershipColors);
    const hullTag = createRemoteHullTag();
    const targetBrackets = createTargetBrackets(Boolean(player.isBot));
    const playerProxy = createRemotePlayerProxy(Boolean(player.isBot));
    plane.position.copy(targetPosition);
    plane.quaternion.copy(targetQuaternion);
    plane.add(targetBrackets);
    identityTag.position.copy(targetPosition).add(new THREE.Vector3(0, 5.2, 0));
    hullTag.position.copy(targetPosition).add(new THREE.Vector3(0, 6.8, 0));
    paintRemoteHullTag(hullTag, player.health ?? maxHealthForAircraft(player.aircraftType), player.maxHealth ?? maxHealthForAircraft(player.aircraftType));
    playerProxy.position.copy(targetPosition);
    scene.add(plane, identityTag, hullTag, playerProxy);
    remote = {
      playerId: player.playerId,
      cityId: player.cityId,
      entityType: 'player',
      isBot: Boolean(player.isBot),
      botPersonality: player.botPersonality,
      displayName: player.displayName ?? 'PLAYER',
      altitudeMeters: Number.isFinite(player.altitudeMeters) && player.altitudeMeters! >= 0 ? player.altitudeMeters : undefined,
      ownershipAccent,
      ownershipSignature: ownershipColors.join('|'),
      identityTag,
      hullTag,
      targetBrackets,
      playerProxy,
      plane,
      previousPosition: targetPosition.clone(),
      previousQuaternion: targetQuaternion.clone(),
      targetPosition,
      targetQuaternion,
      velocity: new THREE.Vector3(),
      interpolationElapsed: player.isBot ? 0.24 : 0.1,
      interpolationDuration: player.isBot ? 0.24 : 0.1,
      timeSinceUpdate: 0,
      nearMissActive: false,
      aircraftType: player.aircraftType,
      lifeState,
      heatLevel: 0,
      boostActive: Boolean(player.boostActive),
      health: player.health ?? maxHealthForAircraft(player.aircraftType),
      maxHealth: player.maxHealth ?? maxHealthForAircraft(player.aircraftType),
      lastHitAt: 0,
    };
    plane.visible = lifeState === 'alive';
    identityTag.visible = false;
    playerProxy.visible = false;
    hullTag.visible = false;
    remotePlayers.set(player.playerId, remote);
    return;
  }

  if (remote.aircraftType !== player.aircraftType) {
    remote.plane.remove(remote.targetBrackets);
    disposeTargetBrackets(remote.targetBrackets);
    scene.remove(remote.plane);
    disposeAirplaneMaterials(remote.plane);
    const replacement = createAirplane(player.aircraftType, true);
    replacement.position.copy(remote.plane.position);
    replacement.quaternion.copy(remote.plane.quaternion);
    remote.targetBrackets = createTargetBrackets(remote.isBot);
    replacement.add(remote.targetBrackets);
    scene.add(replacement);
    remote.plane = replacement;
    remote.aircraftType = player.aircraftType;
    applyEquippedLivery(replacement, player.aircraftType, player.equippedCosmetics ?? remote.plane.userData.equippedCosmetics ?? {});
    refreshPlayerIdentityTag(remote);
  }

  if (player.equippedCosmetics && JSON.stringify(remote.plane.userData.equippedCosmetics) !== JSON.stringify(player.equippedCosmetics)) applyEquippedLivery(remote.plane, player.aircraftType, player.equippedCosmetics);

  if (player.displayName && player.displayName !== remote.displayName) {
    remote.displayName = player.displayName;
    refreshPlayerIdentityTag(remote);
  }
  if (Number.isFinite(player.altitudeMeters) && player.altitudeMeters! >= 0) remote.altitudeMeters = player.altitudeMeters;

  remote.previousPosition.copy(remote.plane.position);
  remote.previousQuaternion.copy(remote.plane.quaternion);
  const stateInterval = THREE.MathUtils.clamp(remote.timeSinceUpdate, 0.08, 0.25);
  combatOffset.set(player.position.x, player.position.y, player.position.z).sub(remote.targetPosition).multiplyScalar(1 / stateInterval);
  remote.velocity.lerp(combatOffset, 0.55);
  remote.targetPosition.set(player.position.x, player.position.y, player.position.z);
  remote.targetQuaternion.setFromEuler(remoteEuler);
  // Bots update at 5 Hz. Leave room for packet jitter so they do not stop
  // between snapshots; humans retain their existing 10 Hz blend.
  remote.interpolationDuration = remoteInterpolationDuration(remote.interpolationDuration, remote.timeSinceUpdate, remote.isBot);
  remote.interpolationElapsed = 0;
  remote.timeSinceUpdate = 0;
  const lifeStateChanged = remote.lifeState !== lifeState;
  remote.lifeState = lifeState;
  if (lifeStateChanged && lifeState === 'alive') {
    // The aircraft was hidden while destroyed/respawning. Reveal it at its
    // authoritative spawn, not along a false cross-city interpolation path.
    remote.plane.position.copy(remote.targetPosition);
    remote.plane.quaternion.copy(remote.targetQuaternion);
    remote.previousPosition.copy(remote.targetPosition);
    remote.previousQuaternion.copy(remote.targetQuaternion);
    remote.interpolationElapsed = remote.interpolationDuration;
  }
  remote.cityId = player.cityId;
  remote.boostActive = Boolean(player.boostActive);
  if (typeof player.maxHealth === 'number') remote.maxHealth = player.maxHealth;
  if (typeof player.health === 'number') remote.health = player.health;
  paintRemoteHullTag(remote.hullTag, remote.health, remote.maxHealth);
  if (typeof player.isBot === 'boolean' && remote.isBot !== player.isBot) {
    remote.isBot = Boolean(player.isBot);
    refreshPlayerIdentityTag(remote);
    (remote.playerProxy.material as THREE.SpriteMaterial).color.set(visualLanguage[remote.isBot ? 'ai' : 'player'].color);
    remote.plane.remove(remote.targetBrackets);
    disposeTargetBrackets(remote.targetBrackets);
    remote.targetBrackets = createTargetBrackets(remote.isBot);
    remote.plane.add(remote.targetBrackets);
  }
  if (player.botPersonality) remote.botPersonality = player.botPersonality;
  if (lifeStateChanged) remote.nearMissActive = false;
  remote.plane.visible = lifeState === 'alive';
  remote.playerProxy.visible = false;
  if (lifeState !== 'alive') remote.identityTag.visible = remote.hullTag.visible = remote.targetBrackets.visible = false;
}

const identityLabelProjection = new THREE.Vector3();
function championshipLandingObjective(attempt: JourneyAttemptState): MissionObjective | null {
  if (attempt.missionId !== journeyDallas06.id || attempt.phase !== 'LANDING') return null;
  const airport = airports.find(item => item.id === journeyDallas06.finishAirportId);
  if (!airport) return null;
  // The near runway threshold is a real runway-relative approach point. The
  // airport geometry and heading remain the single source of its position.
  const along = airport.runwayLength * .5 - 180;
  const x = airport.x + Math.sin(airport.heading) * along;
  const z = airport.z + Math.cos(airport.heading) * along;
  return { id: `${attempt.attemptId}:dfw-approach`, label: 'DFW RUNWAY',
    position: new THREE.Vector3(x, getTerrainHeight(x, z) + 80, z), radius: airport.runwayWidth * .5 };
}
function syncHunterObjective(): void {
  if (!missionFocus || journeyAttempt?.missionId !== journeyDallas02.id) return;
  const hunter = journeyAttempt.targetId ? remotePlayers.get(journeyAttempt.targetId) : undefined;
  const next = confirmedHunterObjective(journeyAttempt, hunter && hunter.timeSinceUpdate <= remoteStateStaleSeconds
    ? { id: hunter.playerId, position: hunter.plane.position, isBot: hunter.isBot, lifeState: hunter.lifeState } : undefined);
  if (missionObjective?.id === next?.id && missionObjective?.position === next?.position) return;
  missionObjective = next;
  missionObjectiveGuidance?.setObjective(next);
}
function syncTerritoryObjective(): void {
  if (!missionFocus || journeyAttempt?.missionId !== journeyDallas04.id) return;
  const guidance = whiteRockGuidance();
  let next: MissionObjective | null = null;
  if (guidance?.target === 'territory') {
    const id = `${journeyAttempt.attemptId}:${journeyDallas04.territoryId}`;
    next = missionObjective?.id === id ? missionObjective : {
      id, label: 'WHITE ROCK',
      position: new THREE.Vector3(guidance.definition.center.x,
        getTerrainHeight(guidance.definition.center.x, guidance.definition.center.z) + 240,
        guidance.definition.center.z),
      radius: 90,
    };
  } else if (guidance?.target === 'defender' && guidance.defender) {
    const defender = guidance.defender;
    const id = `${journeyAttempt.attemptId}:defender:${defender.playerId}`;
    next = missionObjective?.id === id && missionObjective.position === defender.plane.position ? missionObjective : {
      id, label: 'DEFENDER', position: defender.plane.position, radius: 9,
    };
  }
  if (missionObjective?.id === next?.id && missionObjective?.position === next?.position) return;
  missionObjective = next;
  missionObjectiveGuidance?.setObjective(next);
}
function updateRemotePlayers(delta: number): void {
  const markedDefenderId = whiteRockGuidance()?.target === 'defender' ? focusedWhiteRockDefenderId() : null;
  for (const remote of remotePlayers.values()) {
    remote.timeSinceUpdate += delta;
    // A remove packet can be intentionally dropped for a slow socket.  State
    // packets arrive at the normal multiplayer cadence, so an object without
    // a fresh transform is no longer a real aircraft and must not leave its
    // red proxy/fallback behind at an airport.
    if (remote.timeSinceUpdate > remoteStateStaleSeconds) {
      removeRemotePlayer(remote.playerId);
      continue;
    }
    remote.interpolationElapsed = Math.min(remote.interpolationDuration, remote.interpolationElapsed + delta);
    const interpolation = remote.interpolationElapsed / remote.interpolationDuration;
    remote.plane.position.lerpVectors(remote.previousPosition, remote.targetPosition, interpolation);
    remote.plane.quaternion.slerpQuaternions(remote.previousQuaternion, remote.targetQuaternion, interpolation);
    const hiddenBot = remote.isBot && missionFocus?.showAmbientAIAircraft === false && unrelatedFocusedBot(remote.playerId);
    remote.plane.visible = remote.lifeState === 'alive' && !hiddenBot;
    if (hiddenBot) {
      remote.identityTag.visible = false;
      remote.hullTag.visible = false;
      remote.playerProxy.visible = false;
      remote.targetBrackets.visible = false;
      continue;
    }
    const identityVisible = remoteIdentityVisible(remote);
    const distance = remote.plane.position.distanceTo(airplane.position);
    const targeted = selectedCombatTarget?.remote === remote;
    const defenderTarget = remote.playerId === markedDefenderId;
    const missionTarget = serverProfile.missions[cityId]?.active?.targetId === remote.playerId ||
      journeyAttempt?.missionId === 'journey-dallas-02' && journeyAttempt.targetId === remote.playerId || defenderTarget;
    const worldPerPixel = distance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(1, window.innerHeight);
    identityLabelProjection.copy(remote.plane.position).project(camera);
    const nearReticle = Math.abs(identityLabelProjection.x) < 0.18 && Math.abs(identityLabelProjection.y) < 0.24;
    remote.identityTag.visible = identityVisible && distance > 35 && distance <= 7_000 &&
      identityLabelProjection.z > -1 && identityLabelProjection.z < 1 && (targeted || missionTarget || !nearReticle);
    if (remote.identityTag.visible) {
      const locked = Boolean(targeted && selectedCombatTarget?.locked);
      const now = performance.now();
      const missionTargetChanged = remote.identityTag.userData.missionTarget !== missionTarget;
      if (missionTargetChanged || now >= (remote.identityTag.userData.nextPaintAt as number ?? 0)) {
        paintPlayerIdentityTag(remote.identityTag, remote.displayName, remote.aircraftType,
          remote.playerId === kingPlayerId, remote.isBot,
          remote.identityTag.userData.ownershipColors as readonly string[] ?? [], distance,
          targeted, locked, missionTarget,
          remote.altitudeMeters ?? humanRadarTracks.get(remote.playerId)?.altitudeMeters,
          defenderTarget ? 'DEFENDER' : 'HUNTER');
        remote.identityTag.userData.missionTarget = missionTarget;
        remote.identityTag.userData.nextPaintAt = now + 500;
      }
      const widthPixels = locked ? 188 : targeted ? 176 : missionTarget ? 168 : distance <= 900 ? 155 : 140;
      remote.identityTag.scale.set(worldPerPixel * widthPixels, worldPerPixel * widthPixels * 0.25, 1);
      const contactHeight = Math.max(5.5, worldPerPixel * 32);
      remote.identityTag.position.copy(remote.plane.position).addScaledVector(cameraWorldUp,
        contactHeight + worldPerPixel * (targeted ? 70 : 50));
      identityLabelProjection.copy(remote.identityTag.position).project(camera);
      const labelX = (identityLabelProjection.x + 1) * window.innerWidth * 0.5;
      const labelY = (1 - identityLabelProjection.y) * window.innerHeight * 0.5;
      const halfLabelHeight = widthPixels * 0.125;
      remote.identityTag.visible = identityLabelProjection.z > -1 && identityLabelProjection.z < 1 &&
        labelX >= widthPixels * 0.5 + 4 && labelX <= window.innerWidth - widthPixels * 0.5 - 4 &&
        labelY >= 50 + halfLabelHeight && labelY <= window.innerHeight - halfLabelHeight - 4;
      (remote.identityTag.material as THREE.SpriteMaterial).opacity = targeted || missionTarget ? 1 : distance > 3_000 ? 0.82 : 0.94;
    }
    remote.hullTag.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, 6.8);
    remote.hullTag.visible = identityVisible && (
      distance <= 320 || selectedCombatTarget?.remote === remote || performance.now() - remote.lastHitAt <= 2_000
    );
    const proxyMaterial = remote.playerProxy.material as THREE.SpriteMaterial;
    remote.playerProxy.visible = identityVisible && distance <= 12_000;
    if (remote.playerProxy.visible) {
      const targeted = selectedCombatTarget?.remote === remote;
      const targetPixels = remoteProxyPixelWidth(distance) + (targeted ? selectedCombatTarget?.locked ? 4 : 2 : 0);
      const width = worldPerPixel * targetPixels;
      remote.playerProxy.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, Math.max(5.5, worldPerPixel * 32));
      remote.playerProxy.scale.set(width, width * (2 / 3), 1);
      proxyMaterial.opacity = targeted ? 1 : distance <= COMBAT_RANGE ? 0.96 : 0.82;
    }
  }
}

function updateLockCircle(): void {
  // Projection must use this frame's chase/orbit transform, not the matrix
  // cached by the previous renderer.render call.
  camera.updateMatrixWorld(true);
  // Project aircraft-relative assisted aim, not viewport centre. The server
  // owns its bounded offset; camera orbit never changes weapon authority.
  combatAimForward.set(visualAim.x, visualAim.y, -1).normalize().applyQuaternion(airplane.quaternion);
  // Project at target depth so close-range parallax does not leave the
  // displayed reticle pointing beside the rendered aircraft.
  const depth = selectedCombatTarget?.distance ?? COMBAT_RANGE;
  lockBoresightPoint.copy(airplane.position).addScaledVector(combatAimForward, depth);
  lockProjectedCenter.copy(lockBoresightPoint).project(camera);
  lockCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  lockCameraRight.addScaledVector(combatAimForward, -lockCameraRight.dot(combatAimForward));
  if (lockCameraRight.lengthSq() < 0.000001) lockCameraRight.set(0, 1, 0).applyQuaternion(airplane.quaternion);
  lockCameraRight.normalize();
  lockCircleEdgePoint.copy(combatAimForward).multiplyScalar(Math.cos(LOCK_ANGLE))
    .addScaledVector(lockCameraRight, Math.sin(LOCK_ANGLE)).normalize()
    .multiplyScalar(depth).add(airplane.position);
  lockProjectedEdge.copy(lockCircleEdgePoint).project(camera);
  const projectedCenterX = (lockProjectedCenter.x * 0.5 + 0.5) * window.innerWidth;
  const projectedCenterY = (-lockProjectedCenter.y * 0.5 + 0.5) * window.innerHeight;
  const derivedRadius = Math.hypot(
    (lockProjectedEdge.x - lockProjectedCenter.x) * window.innerWidth * 0.5,
    (lockProjectedEdge.y - lockProjectedCenter.y) * window.innerHeight * 0.5,
  );
  const edgeMargin = window.innerWidth <= 900 ? 8 : 12;
  const radius = THREE.MathUtils.clamp(
    derivedRadius,
    0.5,
    Math.max(0.5, (Math.min(window.innerWidth, window.innerHeight) - edgeMargin * 2) * 0.5),
  );
  const centerX = THREE.MathUtils.clamp(projectedCenterX, edgeMargin + radius, window.innerWidth - edgeMargin - radius);
  const centerY = THREE.MathUtils.clamp(projectedCenterY, edgeMargin + radius, window.innerHeight - edgeMargin - radius);
  const diameter = radius * 2;
  // Keep angular validation on the true projected aim. Only the presentation
  // is edge-clamped when the expanded envelope reaches a small viewport.
  lockCircleCenterX = projectedCenterX;
  lockCircleCenterY = projectedCenterY;
  lockCircleRadius = derivedRadius;
  acquisitionCircleElement.style.setProperty('--acquisition-size', `${Math.round(diameter)}px`);
  acquisitionCircleElement.style.left = `${Math.round(centerX)}px`;
  acquisitionCircleElement.style.top = `${Math.round(centerY)}px`;
  acquisitionCircleElement.style.visibility = lockProjectedCenter.z >= -1 && lockProjectedCenter.z <= 1 ? '' : 'hidden';
  const feedbackBelow = centerY + radius + 28;
  const feedbackAbove = feedbackBelow + 42 > window.innerHeight;
  targetFeedbackElement.classList.toggle('above', feedbackAbove);
  targetFeedbackElement.style.left = `${Math.round(THREE.MathUtils.clamp(centerX, 82, Math.max(82, window.innerWidth - 82)))}px`;
  targetFeedbackElement.style.top = `${Math.round(feedbackAbove ? centerY - radius - 28 : feedbackBelow)}px`;
  targetFeedbackElement.style.visibility = lockProjectedCenter.z >= -1 && lockProjectedCenter.z <= 1 ? '' : 'hidden';
}

function clearCombatTarget(): void {
  selectedCombatTarget = null;
  lockedTargetId = null;
  serverLockedTargetId = null;
  serverAimTargetId = null;
  serverAim.x = serverAim.y = 0;
  previousServerAim.x = previousServerAim.y = visualAim.x = visualAim.y = 0;
  previousAimId = serverAimId = 0;
  serverAimReceivedAt = -Infinity;
  combatLockState = 'SEARCHING';
  requestedLockTargetId = null;
  lockValidationElapsed = Number.POSITIVE_INFINITY;
  targetFeedbackElement.classList.add('hidden');
  targetFeedbackElement.classList.remove('locked', 'out-of-range', 'in-range');
  rangeFeedbackTargetId = null;
  rangeFeedbackTransition = null;
  for (const remote of remotePlayers.values()) remote.targetBrackets.visible = false;
}

function showTargetRangeFeedback(remote: RemotePlayer | null, distance: number, inRange: boolean, locked: boolean): void {
  if (!remote) {
    rangeFeedbackTargetId = null;
    rangeFeedbackTransition = null;
    targetFeedbackElement.classList.add('hidden');
    targetFeedbackElement.classList.remove('locked', 'out-of-range', 'in-range');
    return;
  }
  const now = performance.now();
  if (remote.playerId === rangeFeedbackTargetId && inRange !== rangeFeedbackWasInRange) {
    rangeFeedbackTransition = inRange ? 'in' : 'out';
    rangeFeedbackTransitionUntil = now + 850;
    rangeFeedbackRenderedAt = -Infinity;
  } else if (remote.playerId !== rangeFeedbackTargetId) {
    rangeFeedbackTransition = null;
    rangeFeedbackRenderedAt = -Infinity;
  }
  rangeFeedbackTargetId = remote.playerId;
  rangeFeedbackWasInRange = inRange;
  const transition = rangeFeedbackTransition && now < rangeFeedbackTransitionUntil ? rangeFeedbackTransition : null;
  if (now - rangeFeedbackRenderedAt < 100) return;
  rangeFeedbackRenderedAt = now;
  const label = remote.isBot ? 'AI PILOT' : remote.displayName;
  const distanceText = distance < 1_000 ? `${Math.round(distance / 10) * 10} M` : `${(distance / 1_000).toFixed(1)} KM`;
  const status = !inRange ? transition === 'out' ? 'OUT OF RANGE' : 'GET CLOSER'
    : transition === 'in' ? 'IN RANGE' : locked ? 'LOCKED' : '';
  if (targetNameDistanceElement.textContent !== `${distanceText} · ${label}`) targetNameDistanceElement.textContent = `${distanceText} · ${label}`;
  if (targetRangeElement.textContent !== status) targetRangeElement.textContent = status;
  targetFeedbackElement.classList.remove('hidden');
  targetFeedbackElement.classList.toggle('locked', locked && !transition);
  targetFeedbackElement.classList.toggle('out-of-range', !inRange);
  targetFeedbackElement.classList.toggle('in-range', transition === 'in');
}

function validateServerLock(targetId: string | null, delta: number): void {
  const manualAimX = Number(heldActions.has('aimRight')) - Number(heldActions.has('aimLeft'));
  const manualAimY = Number(heldActions.has('aimUp')) - Number(heldActions.has('aimDown'));
  if (targetId !== requestedLockTargetId || manualAimX !== requestedManualAimX || manualAimY !== requestedManualAimY) {
    if (targetId !== requestedLockTargetId) serverLockedTargetId = null;
    requestedLockTargetId = targetId;
    requestedManualAimX = manualAimX;
    requestedManualAimY = manualAimY;
    lockValidationElapsed = Number.POSITIVE_INFINITY;
    if (localPlayerId && connectionReady()) {
      socket.send(JSON.stringify({ type: 'lock', targetId, aimHorizontal: manualAimX, aimVertical: manualAimY }));
      lockValidationElapsed = 0;
    }
    return;
  }
  if (!targetId && !serverAimTargetId && manualAimX === 0 && manualAimY === 0 && Math.hypot(visualAim.x, visualAim.y) < 0.0001) return;
  lockValidationElapsed += delta;
  if (lockValidationElapsed < 0.1 || !localPlayerId || !connectionReady()) return;
  lockValidationElapsed = 0;
  socket.send(JSON.stringify({ type: 'lock', targetId, aimHorizontal: manualAimX, aimVertical: manualAimY }));
}

function updateCombatTarget(delta = 0): void {
  if (crashed || localLifeState !== 'alive') {
    clearCombatTarget();
    stepAim(visualAim, neutralAim, delta, AIM_ENVELOPE);
    updateLockCircle();
    return;
  }
  const minimumForwardDot = Math.cos(AIM_ENVELOPE);
  // This is the same physics-root forward vector and origin used by the
  // server lock predicate. Muzzle sockets are only for projectile visuals.
  combatForward.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  combatInverseQuaternion.copy(airplane.quaternion).invert();

  let candidate: RemotePlayer | null = null;
  let candidateDistance = Number.POSITIVE_INFINITY;
  let candidateAngle = Number.POSITIVE_INFINITY;
  let candidateScore = Number.POSITIVE_INFINITY;
  let serverCandidate: RemotePlayer | null = null;
  let outOfRangeCandidate: RemotePlayer | null = null;
  let outOfRangeDistance = Number.POSITIVE_INFINITY;
  let outOfRangeScore = Number.POSITIVE_INFINITY;
  for (const remote of remotePlayers.values()) {
    if (remote.cityId !== cityId || remote.entityType !== 'player' || remote.timeSinceUpdate > 0.5 || remote.lifeState !== 'alive' || !remote.plane.visible || !entityCapabilities(remote.entityType).targetable) continue;
    if (!remote.isBot && cityHumanRoster.get(remote.playerId)?.status === 'spawnSafe') continue;
    combatOffset.copy(remote.plane.position).sub(airplane.position);
    const distance = combatOffset.length();
    if (distance < 0.000001) continue;
    if (distance > COMBAT_RANGE) {
      if (distance > COMBAT_RANGE * 2) continue;
      outOfRangeLocalOffset.copy(combatOffset).applyQuaternion(combatInverseQuaternion);
      if (!insideDynamicLock(outOfRangeLocalOffset.x, outOfRangeLocalOffset.y, outOfRangeLocalOffset.z, visualAim)) continue;
      const aimCosine = THREE.MathUtils.clamp((outOfRangeLocalOffset.x * visualAim.x + outOfRangeLocalOffset.y * visualAim.y - outOfRangeLocalOffset.z) /
        (distance * Math.hypot(visualAim.x, visualAim.y, 1)), -1, 1);
      const score = aimTargetScore(Math.acos(aimCosine), distance) - (remote.playerId === rangeFeedbackTargetId ? AIM_SWITCH_MARGIN : 0);
      if (score < outOfRangeScore) { outOfRangeCandidate = remote; outOfRangeDistance = distance; outOfRangeScore = score; }
      continue;
    }
    combatOffset.multiplyScalar(1 / distance);
    const forwardDot = THREE.MathUtils.clamp(combatForward.dot(combatOffset), -1, 1);
    if (forwardDot < minimumForwardDot) continue;
    const angle = Math.acos(forwardDot);
    const score = aimTargetScore(angle, distance) - (remote.playerId === lockedTargetId ? AIM_SWITCH_MARGIN : 0);
    if (remote.playerId === serverAimTargetId) serverCandidate = remote;
    if (score < candidateScore) {
      candidate = remote;
      candidateDistance = distance;
      candidateAngle = angle;
      candidateScore = score;
    }
  }

  // Server selection wins (including protection and hysteresis). Local search
  // only wakes the existing 10 Hz lock request path; it grants no authority.
  const freshAim = performance.now() - serverAimReceivedAt <= 500;
  if (serverCandidate && freshAim) {
    candidate = serverCandidate;
    combatOffset.copy(candidate.plane.position).sub(airplane.position);
    candidateDistance = combatOffset.length();
    candidateAngle = Math.acos(THREE.MathUtils.clamp(combatForward.dot(combatOffset) / candidateDistance, -1, 1));
  }
  const targetId = candidate?.playerId ?? null;
  if (targetId !== lockedTargetId) lockedTargetId = targetId;
  validateServerLock(targetId, delta);
  const assisted = Boolean(serverCandidate && freshAim);
  visualAimBlend = Math.min(1, Math.max(0, (performance.now() - serverAimReceivedAt) / 100));
  if (freshAim) interpolateAim(previousServerAim, serverAim, visualAimBlend, visualAim);
  else visualAim.x = visualAim.y = 0;

  if (!candidate || !assisted) {
    selectedCombatTarget = null;
    updateLockCircle();
    combatLockState = 'SEARCHING';
    acquisitionCircleElement.classList.remove('target-near', 'locked');
    showTargetRangeFeedback(candidate ? null : outOfRangeCandidate, outOfRangeDistance, false, false);
    for (const remote of remotePlayers.values()) remote.targetBrackets.visible = false;
    if (combatQaElement) combatQaElement.textContent = `COMBAT QA\ntarget: none\nlock: ${serverLockedTargetId ?? 'none'}\n${combatQaDetail}`;
    return;
  }

  contextualHints.trigger('combat');

  combatOffset.copy(candidate.plane.position).sub(airplane.position).applyQuaternion(combatInverseQuaternion);
  const nearReticle = insideDynamicLock(combatOffset.x, combatOffset.y, combatOffset.z, visualAim);
  const locked = assisted && serverLockedTargetId === targetId && nearReticle;
  if (selectedCombatTarget) {
    selectedCombatTarget.remote = candidate;
    selectedCombatTarget.distance = candidateDistance;
    selectedCombatTarget.locked = locked;
  } else selectedCombatTarget = { remote: candidate, distance: candidateDistance, locked };
  updateLockCircle();
  combatLockState = locked ? 'LOCKED' : 'SEARCHING';
  acquisitionCircleElement.classList.toggle('target-near', assisted);
  acquisitionCircleElement.classList.toggle('locked', locked);
  showTargetRangeFeedback(nearReticle ? candidate : null, candidateDistance, true, locked);
  for (const remote of remotePlayers.values()) {
    remote.targetBrackets.visible = remote === candidate && remote.plane.visible;
    if (remote.targetBrackets.visible) (remote.targetBrackets.material as THREE.SpriteMaterial).opacity = locked ? 1 : 0.58;
  }
  if (combatQaElement) {
    lockTargetProjected.copy(candidate.plane.position).project(camera);
    const targetScreenX = (lockTargetProjected.x * 0.5 + 0.5) * window.innerWidth;
    const targetScreenY = (-lockTargetProjected.y * 0.5 + 0.5) * window.innerHeight;
    const screenInside = Math.hypot(targetScreenX - lockCircleCenterX, targetScreenY - lockCircleCenterY) <= lockCircleRadius;
    combatQaElement.textContent = [
      'COMBAT QA',
      `target: ${candidate.playerId.slice(0, 8)}`,
      `circle: ${screenInside ? 'inside' : 'edge/outside'} · boresight: ${THREE.MathUtils.radToDeg(candidateAngle).toFixed(2)}° / envelope ${THREE.MathUtils.radToDeg(AIM_ENVELOPE).toFixed(2)}°`,
      `aim offset: ${THREE.MathUtils.radToDeg(Math.atan(Math.hypot(visualAim.x, visualAim.y))).toFixed(2)}° · lock radius ${THREE.MathUtils.radToDeg(LOCK_ANGLE).toFixed(2)}°`,
      `server lock: ${serverLockedTargetId === candidate.playerId ? 'LOCKED' : 'SEARCHING'}`,
      combatQaDetail,
    ].join('\n');
  }
}

function updatePlaneVisuals(plane: THREE.Group, power: number, boostStrength: number, delta: number): void {
  const visuals = plane.userData.visuals as AircraftVisuals | undefined;
  if (!visuals) return;
  const type = plane.userData.aircraftType as AircraftType;
  const airframeRoot = plane.userData.airframeRoot as THREE.Group | undefined;
  if (airframeRoot) {
    const heightAboveGroundRoot = plane.position.y - groundPlaneY(plane.position.x, plane.position.z);
    const groundBlend = THREE.MathUtils.clamp(1 - Math.max(0, heightAboveGroundRoot) / 2, 0, 1);
    airframeRoot.position.y = groundContactVisualOffset(
      aircraftGroundContacts[type],
      plane.quaternion,
      PLANE_GROUND_Y,
    ) * groundBlend;
  }
  const assetPropellers = plane.userData.assetPropellers as THREE.Object3D[] | undefined;
  const propellers = assetPropellers?.length ? assetPropellers : visuals.propeller ? [visuals.propeller] : [];
  for (const propeller of propellers) propeller.rotation.z += delta * (7 + power * 34);
  const isFighter = type === 'fighter';
  if (visuals.exhaustMaterial) {
    visuals.exhaustMaterial.opacity = 0.012 + power * (isFighter ? 0.055 : 0.085);
    for (const exhaust of visuals.exhausts) {
      exhaust.scale.y = (exhaust.userData.baseLength as number) * (0.72 + power * (isFighter ? 0.35 : 0.42));
    }
  }
  const requestedBoost = THREE.MathUtils.clamp(boostStrength, 0, 1);
  // Remote transforms carry only Boost's boolean. Give the same short visual
  // envelope to local and remote Redspears without extra network traffic.
  if (isFighter) visuals.fighterBoostEnvelope += (requestedBoost - visuals.fighterBoostEnvelope) * (1 - Math.exp(-(requestedBoost > visuals.fighterBoostEnvelope ? 15 : 10) * delta));
  const boost = isFighter ? visuals.fighterBoostEnvelope : requestedBoost;
  visuals.boostMaterial.opacity = boost * (isFighter ? 0.78 : type === 'trainer' ? 0.16 : 0.42);
  for (const trail of visuals.boostTrails) {
    trail.visible = boost > 0.015;
    trail.scale.y = (trail.userData.baseLength as number) * (0.62 + boost * 0.92);
  }
  if (visuals.fighterBoostCore && visuals.fighterBoostCoreMaterial) {
    visuals.fighterBoostCore.visible = boost > 0.015;
    visuals.fighterBoostCoreMaterial.opacity = boost * 0.9;
    visuals.fighterBoostCore.scale.y = (visuals.fighterBoostCore.userData.baseLength as number) * (0.62 + boost * 0.92);
  }
}

function updateAircraftVisuals(delta: number): void {
  const localPower = crashed ? 0 : Math.min(1.45, Math.max(throttle, currentSpeed / currentAircraft.maxSpeed * 0.72) + boostVisualStrength * 0.42);
  updatePlaneVisuals(airplane, localPower, boostVisualStrength, delta);
  for (const remote of remotePlayers.values()) {
    updatePlaneVisuals(remote.plane, remote.boostActive ? 0.92 : 0.55, remote.boostActive ? 1 : 0, delta);
  }
}

function awardNearMiss(): void {
  stuntCombo?.notifyNearMiss(aircraftType);
  nearMissMessageElement.textContent = 'NEAR MISS';
  nearMissMessageElement.classList.remove('hidden');
  window.clearTimeout(nearMissMessageTimer);
  nearMissMessageTimer = window.setTimeout(() => nearMissMessageElement.classList.add('hidden'), 1000);
  playNearMissSound();
}

function updatePlayerInteractions(): void {
  if (guidedTutorialActive || localLifeState !== 'alive') return;
  const maximumFrameTravel = Math.max(12, currentSpeed * 0.06 + 8);
  if (!interactionSweepReady || previousInteractionPosition.distanceToSquared(airplane.position) > maximumFrameTravel * maximumFrameTravel) {
    previousInteractionPosition.copy(airplane.position);
    interactionSweepReady = true;
  }
  interactionSweepStart.copy(previousInteractionPosition);
  previousInteractionPosition.copy(airplane.position);
  for (const remote of remotePlayers.values()) {
    if (remote.lifeState !== 'alive' || (remote.isBot && missionFocus?.showAmbientAIAircraft === false && unrelatedFocusedBot(remote.playerId)) || !entityCapabilities(remote.entityType).collidable) {
      remote.nearMissActive = false;
      continue;
    }
    const distanceSquared = airplane.position.distanceToSquared(remote.plane.position);
    const sweptDistanceSquared = interactionSegmentDistanceSquared(remote.plane.position, interactionSweepStart, airplane.position);
    if (Math.min(distanceSquared, sweptDistanceSquared) <= collisionRadiusSquared) {
      // Ordered state + collision intent lets the server validate one shared
      // pair and authoritatively destroy each pilot exactly once.
      const now = performance.now();
      if (connectionReady() && now - lastCollisionIntentAt >= 250) {
        lastCollisionIntentAt = now;
        sendLocalState();
        socket.send(JSON.stringify({ type: 'collision', targetId: remote.playerId }));
      }
      return;
    }

    if (Math.min(distanceSquared, sweptDistanceSquared) <= nearMissRadiusSquared) {
      if (!remote.nearMissActive) {
        remote.nearMissActive = true;
        awardNearMiss();
      }
    } else {
      remote.nearMissActive = false;
    }
  }
}

function moveToward(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function getAirportAtPosition(position: THREE.Vector3): AirportDefinition | null {
  for (const airport of airports) {
    const offsetX = position.x - airport.x;
    const offsetZ = position.z - airport.z;
    const cosine = Math.cos(airport.heading);
    const sine = Math.sin(airport.heading);
    const lateral = offsetX * cosine - offsetZ * sine;
    const longitudinal = offsetX * sine + offsetZ * cosine;
    if (
      Math.abs(lateral) <= airport.runwayWidth / 2 &&
      Math.abs(longitudinal) <= airport.runwayLength / 2
    ) {
      return airport;
    }
  }
  return null;
}

function runwayHeadingError(airport: AirportDefinition): number {
  const direct = Math.abs(THREE.MathUtils.euclideanModulo(heading - airport.heading + Math.PI, Math.PI * 2) - Math.PI);
  const reciprocal = Math.abs(THREE.MathUtils.euclideanModulo(heading - airport.heading, Math.PI * 2) - Math.PI);
  return Math.min(direct, reciprocal);
}

function getLandingAssistAirport(position: THREE.Vector3, requireAlignment = true): AirportDefinition | null {
  for (const airport of airports) {
    const offsetX = position.x - airport.x;
    const offsetZ = position.z - airport.z;
    const cosine = Math.cos(airport.heading);
    const sine = Math.sin(airport.heading);
    const lateral = offsetX * cosine - offsetZ * sine;
    const longitudinal = offsetX * sine + offsetZ * cosine;
    if (
      Math.abs(lateral) <= airport.runwayWidth * 2 + 44 &&
      Math.abs(longitudinal) <= airport.runwayLength / 2 + 420 &&
      (!requireAlignment || runwayHeadingError(airport) <= 0.72)
    ) return airport;
  }
  return null;
}

// One touchdown assessment for the HUD and the actual contact decision.
// Preserve the existing assist multipliers and wrapped-bank interpretation.
function evaluateLanding(airport: AirportDefinition | null, result: typeof landingStatus): void {
  result.bankAngle = Math.abs(THREE.MathUtils.euclideanModulo(roll + Math.PI, Math.PI * 2) - Math.PI);
  result.headingError = airport ? runwayHeadingError(airport) : Math.PI;
  result.speedSafe = currentSpeed <= currentAircraft.safeLandingSpeed * (landingAssistActive ? 1.18 : 1);
  result.descentSafe = verticalSpeed >= -currentAircraft.safeDescentRate * (landingAssistActive ? 1.35 : 1);
  result.pitchSafe = Math.abs(pitch) <= currentAircraft.landingTilt + (landingAssistActive ? 0.10 : 0);
  result.bankSafe = result.bankAngle <= currentAircraft.landingTilt + (landingAssistActive ? 0.12 : 0);
  result.alignmentSafe = result.headingError <= (landingAssistActive ? 0.62 : 0.52);
  result.reason = !airport ? 'OFF RUNWAY' : !result.speedSafe ? 'TOO FAST' : !result.descentSafe ? 'CAME DOWN TOO HARD' :
    !result.bankSafe ? 'WINGS NOT LEVEL' : !result.pitchSafe ? 'NOSE NOT LEVEL' : !result.alignmentSafe ? 'NOT LINED UP' : '';
  result.rough = !result.reason && (currentSpeed > currentAircraft.safeLandingSpeed * 0.98 ||
    verticalSpeed < -currentAircraft.safeDescentRate * 0.85 || result.bankAngle > currentAircraft.landingTilt * 0.72 ||
    result.headingError > 0.38);
}

function pointInWorldPolygon(x: number, z: number, polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [x1, z1] = polygon[index];
    const [x2, z2] = polygon[previous];
    if ((z1 > z) !== (z2 > z) && x < (x2 - x1) * (z - z1) / (z2 - z1) + x1) inside = !inside;
  }
  return inside;
}

function hitsWorldObstacle(): boolean {
  const planeBottom = airplane.position.y - 0.8;
  const cellKey = collisionCellKey(
    Math.floor(airplane.position.x / COLLISION_CELL_SIZE),
    Math.floor(airplane.position.z / COLLISION_CELL_SIZE),
  );
  for (const obstacle of obstacleGrid.get(cellKey) ?? noNearbyObstacles) {
    if (
      planeBottom <= (obstacle.baseY ?? 0) + obstacle.height &&
      Math.abs(airplane.position.x - obstacle.x) <= obstacle.halfX + COLLISION_PADDING &&
      Math.abs(airplane.position.z - obstacle.z) <= obstacle.halfZ + COLLISION_PADDING &&
      (!obstacle.polygon || pointInWorldPolygon(airplane.position.x, airplane.position.z, obstacle.polygon))
    ) {
      return true;
    }
  }

  for (const mountain of mountainGrid.get(cellKey) ?? noNearbyMountains) {
    const mountainBase = mountain.baseY ?? 0;
    if (planeBottom > mountainBase + mountain.height) continue;
    const heightRatio = THREE.MathUtils.clamp((planeBottom - mountainBase) / mountain.height, 0, 1);
    const collisionRadius = mountain.radius * (1 - heightRatio) + COLLISION_PADDING;
    const offsetX = airplane.position.x - mountain.x;
    const offsetZ = airplane.position.z - mountain.z;
    if (offsetX * offsetX + offsetZ * offsetZ <= collisionRadius * collisionRadius) return true;
  }

  for (const water of waterBounds) {
    if (
      planeBottom <= water.surfaceY + 0.25 &&
      airplane.position.x >= water.minX &&
      airplane.position.x <= water.maxX &&
      airplane.position.z >= water.minZ &&
      airplane.position.z <= water.maxZ &&
      (!water.polygon || pointInWorldPolygon(airplane.position.x, airplane.position.z, water.polygon))
    ) {
      return true;
    }
  }
  return false;
}

function updateFlight(delta: number): void {
  updateLocalWeather(performance.now());
  const throttleUp = heldActions.has('throttleUp');
  const throttleDown = heldActions.has('throttleDown');
  const mobileThrottleTarget = !throttleUp && !throttleDown ? mobileInput.getThrottleTarget() : undefined;
  if (mobileThrottleTarget !== undefined) {
    const response = mobileThrottleTarget > throttle
      ? currentAircraft.throttleResponse
      : currentAircraft.throttleResponse * 2.1;
    throttle = moveToward(throttle, mobileThrottleTarget, delta * response);
  } else if (!onGround) {
    if (throttleUp) throttle += delta * currentAircraft.throttleResponse;
    else if (throttleDown) throttle -= delta * currentAircraft.throttleResponse * 2.1;
    else throttle = moveToward(throttle, currentAircraft.idleThrottle, delta * currentAircraft.throttleDecay);
  } else if (throttleDown || (throttleUp && currentSpeed < 0)) {
    // Braking and reverse use signed ground speed; throttle remains a
    // forward-only air/engine value so aircraft can never reverse in flight.
    throttle = 0;
  } else if (throttleUp) {
    throttle += delta * currentAircraft.throttleResponse;
  } else {
    throttle = moveToward(throttle, onGround ? 0 : currentAircraft.idleThrottle, delta * currentAircraft.throttleDecay);
  }
  throttle = THREE.MathUtils.clamp(throttle, 0, 1);

  const landingAssistAirport = onGround ? null : getLandingAssistAirport(airplane.position);
  const approachHeight = airplane.position.y - groundPlaneY(airplane.position.x, airplane.position.z);
  const approachEmergency = cityEvent?.lifecycle === 'active' && cityEvent.eventType === 'cityEmergency';
  landingAssistActive = landingAssistAirport !== null &&
    approachHeight <= 160 &&
    velocity.y <= 2 &&
    combatLockState !== 'LOCKED' &&
    !approachEmergency;

  // S first closes the throttle, then deploys a smooth aerodynamic brake.
  // It never supplies reverse thrust while airborne.
  const speedBrakeRequested = !onGround && (throttleDown || mobileIdleBrakeRequested(mobileThrottleTarget)) && throttle <= 0.08;
  const speedBrakeResponse = currentAircraft.airbrakeResponse ?? 4;
  speedBrakeStrength = THREE.MathUtils.lerp(
    speedBrakeStrength,
    speedBrakeRequested ? 1 : 0,
    1 - Math.exp(-speedBrakeResponse * (speedBrakeRequested ? 1 : 1.45) * delta),
  );

  // Boost is a held airborne reserve: it cannot recharge during a burst and
  // stays entirely inside the existing client flight state/transform stream.
  const boostRequested = !onGround && !crashed && heldActions.has('boost') && !throttleDown && !landingAssistActive;
  boostActive = boostRequested && boostMeter > 0.05;
  const boostVisualTarget = boostActive ? 1 : 0;
  // Braking and approach assist kill both the thrust and visual immediately;
  // ordinary release fades the trail in a few frames instead of popping.
  if (!boostActive && (throttleDown || landingAssistActive || onGround)) {
    boostVisualStrength = 0;
  } else {
    const response = boostVisualTarget > boostVisualStrength ? 12 : 16;
    boostVisualStrength = THREE.MathUtils.lerp(
      boostVisualStrength,
      boostVisualTarget,
      1 - Math.exp(-response * delta),
    );
  }
  if (boostActive) {
    boostMeter = Math.max(0, boostMeter - delta * (currentAircraft.boostDrain ?? 20));
  } else if (!boostRequested) {
    boostMeter = Math.min(100, boostMeter + delta * (currentAircraft.boostRegen ?? 12));
  }

  const touchSteeringTarget = mobileInput.getSteeringInput();
  smoothedTouchSteering = smoothMobileSteering(smoothedTouchSteering, touchSteeringTarget, delta);
  const touchSteering = smoothedTouchSteering;
  const keyboardTurnInput = desktopTurnIntent(heldActions.has('yawLeft'), heldActions.has('yawRight'));
  const touchTurnInput = -touchSteering.x;
  const turnInput = keyboardTurnInput || touchTurnInput;
  const yawInput = keyboardTurnInput ? Math.sign(keyboardTurnInput) : touchTurnInput * 0.62;
  // Turn is an abstract control command, not an instant heading change.  Its
  // response is derived from the existing yaw/inertia envelope, so Cargo
  // settles deliberately while the Fighter remains crisp without keeping a
  // hidden turn command alive after release.
  const yawResponse = 1.55 + currentAircraft.yawRate / currentAircraft.inertia * 1.8;
  yawControlStrength = THREE.MathUtils.lerp(
    yawControlStrength,
    yawInput,
    1 - Math.exp(-yawResponse * delta),
  );
  const keyboardPitchInput = Number(heldActions.has('pitchUp')) - Number(heldActions.has('pitchDown'));
  const rawPitchInput = keyboardPitchInput || -touchSteering.y;
  const pitchInput = normalizedPitchCommand(rawPitchInput,mobileInput.getPitchInverted());
  // The abstract pitch action is filtered before it reaches attitude/lift.
  // Exponential damping is stable across frame rates and gives release a
  // deliberate neutral glide rather than an immediate level command.
  const pitchInputResponse = pitchInput === 0
    ? (currentAircraft.pitchInputRelease ?? 2)
    : (currentAircraft.pitchInputRise ?? 6);
  pitchControlStrength = THREE.MathUtils.lerp(
    pitchControlStrength,
    pitchInput,
    1 - Math.exp(-pitchInputResponse * delta),
  );

  if (!onGround && activeWeatherZone && activeWeatherZone.gameplayProfile !== 'none' && activeWeatherZone.gameplayProfile !== 'visibility-only') {
    const strength = activeWeatherZone.intensity;
    const phase = performance.now() * 0.001;
    const drift = activeWeatherZone.type === 'storm' ? 3.2 : activeWeatherZone.type === 'turbulence' ? 1.7 : 1.15;
    velocity.x += Math.sin(phase * 0.83) * strength * drift * delta;
    velocity.z += Math.cos(phase * 0.67) * strength * drift * delta;
  }

  if (onGround) {
    const reverseSpeed = Math.min(10, currentAircraft.groundMaxSpeed * 0.17);
    const brakeRate = currentAircraft.groundDrag * 2.6;
    let groundTargetSpeed = throttle * currentAircraft.groundMaxSpeed;
    let groundSpeedChange = groundTargetSpeed > currentSpeed
      ? currentAircraft.groundAcceleration
      : currentAircraft.groundDrag;
    if (throttleDown) {
      // S is a strong brake while moving forward, then engages a deliberately
      // slow reverse taxi only after the aircraft has fully stopped.
      groundTargetSpeed = currentSpeed > 0 ? 0 : -reverseSpeed;
      groundSpeedChange = currentSpeed > 0 ? brakeRate : currentAircraft.groundAcceleration * 0.7;
    } else if (throttleUp && currentSpeed < 0) {
      // Holding W out of reverse brakes to a halt first, then builds forward power.
      groundTargetSpeed = 0;
      groundSpeedChange = brakeRate;
    }
    currentSpeed = moveToward(currentSpeed, groundTargetSpeed, delta * groundSpeedChange);
    if (currentSpeed >= currentAircraft.takeoffSpeed * 0.45 && throttle >= 0.6) {
      cameraShakeTime = Math.max(cameraShakeTime, aircraftType === 'cargo' ? 0.045 : aircraftType === 'fighter' ? 0.032 : 0.025);
    }
    if (Math.abs(currentSpeed) < 0.04 && groundTargetSpeed === 0) currentSpeed = 0;
    if (currentSpeed <= 2 || throttleDown) takeoffRollMeters = 0;
    else if (currentSpeed >= currentAircraft.takeoffSpeed * 0.35 && throttle >= 0.5) {
      takeoffRollMeters += currentSpeed * delta;
    }
    const groundSteering = (0.12 + Math.min(1, currentSpeed / 20) * 0.72) * currentAircraft.groundSteering;
    heading += yawControlStrength * delta * groundSteering;
    roll = THREE.MathUtils.lerp(roll, 0, Math.min(1, delta * currentAircraft.rollRate));
    pitch = THREE.MathUtils.clamp(
      pitch + pitchControlStrength * delta * currentAircraft.pitchRate * 0.72,
      -0.08,
      0.2,
    );
    if (Math.abs(pitchControlStrength) < 0.01) {
      pitch = THREE.MathUtils.lerp(pitch, 0, Math.min(1, delta * currentAircraft.stability * 5));
    }

    airplane.rotation.set(pitch, heading, roll, 'YXZ');
    forward.set(-Math.sin(heading), 0, -Math.cos(heading));
    airplane.position.addScaledVector(forward, currentSpeed * delta);
    airplane.position.y = groundPlaneY(airplane.position.x, airplane.position.z);
    velocity.copy(forward).multiplyScalar(currentSpeed);

    if (!getAirportAtPosition(airplane.position)) {
      endRun('CRASHED');
      return;
    }

    if (landedFeedbackTime > 0) {
      landedFeedbackTime = Math.max(0, landedFeedbackTime - delta);
      if (landedFeedbackTime === 0) {
        setFlightState(currentSpeed >= currentAircraft.takeoffSpeed * 0.6 ? 'TAKEOFF' : 'TAXI');
      }
    } else {
      setFlightState(currentSpeed >= currentAircraft.takeoffSpeed * 0.6 ? 'TAKEOFF' : 'TAXI');
    }

    if (currentSpeed >= currentAircraft.takeoffSpeed && takeoffRollMeters >= currentAircraft.minimumTakeoffRoll && pitch >= 0.07) {
      if (resetRegionsOnNextTakeoff) {
        visitedRegionsThisFlight.clear();
        resetRegionsOnNextTakeoff = false;
      }
      flightDistanceSinceTakeoff = 0;
      beginFlightRecap();
      handleContractTakeoff(getAirportAtPosition(airplane.position));
      onGround = false;
      contextualHints.trigger('worldMap');
      velocity.y = 0.8 + (currentSpeed - currentAircraft.takeoffSpeed) * 0.05 * currentAircraft.lift;
      verticalSpeed = velocity.y;
      airplane.position.y = groundPlaneY(airplane.position.x, airplane.position.z) + 0.02;
      setFlightState('TAKEOFF');
    }

    return;
  }

  const speedRatio = THREE.MathUtils.clamp(currentSpeed / currentAircraft.maxSpeed, 0, 1);
  const steeringAuthority =
    (0.64 + speedRatio * 0.36) * currentAircraft.yawRate / currentAircraft.inertia;
  // Keyboard and touch both express turn intent. The shared target-bank
  // controller preserves each aircraft's response rate without accumulating
  // roll, so holding a turn keeps changing heading but cannot barrel-roll.
  roll = stepCoordinatedBank(roll, turnInput, delta, currentAircraft);
  // The eased control command sets a bounded attitude target. Pitch only rotates the
  // aircraft; lift and gravity below remain the sole source of vertical movement.
  const pitchStageRoll = roll;
  const pitchStageHeading = heading;
  const targetPitch = pitchControlStrength >= 0
    ? currentAircraft.maxClimbPitch * pitchControlStrength
    : (currentAircraft.maxDivePitch ?? currentAircraft.maxClimbPitch) * pitchControlStrength;
  const pitchResponse = Math.max(
    currentAircraft.pitchReturnRate * 0.34,
    currentAircraft.pitchRate * (0.35 + Math.abs(pitchControlStrength) * 0.75),
  );
  // A YXZ Euler X edit pitches about the unbanked axis. Apply the pitch
  // command about the actual body X axis instead, including inverted flight.
  // Project existing attitude onto that control axis for release stability.
  const localPitch = pitch * Math.cos(roll);
  let nextLocalPitch = moveToward(localPitch, targetPitch, delta * pitchResponse);
  if (landingAssistActive) {
    nextLocalPitch = THREE.MathUtils.lerp(nextLocalPitch, THREE.MathUtils.clamp(nextLocalPitch, -0.14, 0.18), 1 - Math.exp(-delta * 1.35));
    // Coordinated bank is already bounded before pitch is applied.
  }
  const pitchRollLeak = roll - pitchStageRoll;
  const pitchYawLeak = heading - pitchStageHeading;
  heading += yawControlStrength * delta * steeringAuthority;
  heading += Math.sin(roll) * speedRatio * currentAircraft.bankTurn * delta;

  airplane.rotation.set(pitch, heading, roll, 'YXZ');
  if (import.meta.env.DEV) pitchBeforeQuaternion.copy(airplane.quaternion);
  airplane.rotateX(nextLocalPitch - localPitch);
  if (import.meta.env.DEV && pitchInput !== 0 && turnInput === 0 && yawInput === 0) {
    pitchDeltaQuaternion.copy(pitchBeforeQuaternion).invert().multiply(airplane.quaternion);
    if ((Math.abs(pitchRollLeak) > 0.000001 || Math.abs(pitchYawLeak) > 0.000001 ||
         Math.abs(pitchDeltaQuaternion.y) > 0.000001 || Math.abs(pitchDeltaQuaternion.z) > 0.000001) &&
        performance.now() - lastPitchAxisLeakAt > 1000) {
      lastPitchAxisLeakAt = performance.now();
      console.warn(`PITCH_AXIS_LEAK roll=${pitchRollLeak + 2 * pitchDeltaQuaternion.z} yaw=${pitchYawLeak + 2 * pitchDeltaQuaternion.y} state=${flightState}`);
    }
  }
  pitch = airplane.rotation.x;
  heading += Math.atan2(Math.sin(airplane.rotation.y - heading), Math.cos(airplane.rotation.y - heading));
  roll += Math.atan2(Math.sin(airplane.rotation.z - roll), Math.cos(airplane.rotation.z - roll));
  roll = THREE.MathUtils.clamp(roll, -COORDINATED_BANK_CAP, COORDINATED_BANK_CAP);
  airplane.rotation.set(pitch, heading, roll, 'YXZ');
  forward.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  liftDirection.set(0, 1, 0).applyQuaternion(airplane.quaternion).normalize();

  const forwardSpeed = Math.max(0, velocity.dot(forward));
  const airspeed = velocity.length();
  const flightPathAngle = airspeed > 0.01 ? Math.asin(THREE.MathUtils.clamp(velocity.y / airspeed, -1, 1)) : 0;
  const angleOfAttack = THREE.MathUtils.clamp(pitch - flightPathAngle, -0.28, 0.32);
  const stallFactor = THREE.MathUtils.clamp(
    (forwardSpeed - currentAircraft.stallSpeed * 0.48) / (currentAircraft.stallSpeed * 0.52),
    0.18,
    1,
  );
  const liftFactor = THREE.MathUtils.clamp(
    0.74 + angleOfAttack * 1.75,
    0.34,
    1.28,
  ) * Math.min(1.28, (forwardSpeed / currentAircraft.takeoffSpeed) ** 2) * stallFactor * currentAircraft.lift * (1 + throttle * currentAircraft.climbLiftBoost * 0.08);
  const boostThrust = boostActive
    ? currentAircraft.acceleration * ((currentAircraft.boostThrust ?? 1.35) - 1)
    : 0;
  const thrust = (throttle * currentAircraft.acceleration + boostThrust) / currentAircraft.inertia;
  const baseDrag = currentAircraft.drag * (airspeed / currentAircraft.maxSpeed) ** 2;
  const inducedDrag = Math.max(0, angleOfAttack) * currentAircraft.drag * 0.07;
  const airbrakeDrag = Math.max(baseDrag * (currentAircraft.airbrakeDrag ?? 2), airspeed * currentAircraft.inertia * 0.85) * speedBrakeStrength;
  const approachDrag = landingAssistActive ? baseDrag * 0.75 : 0;
  const normalDrag = (baseDrag + inducedDrag + airbrakeDrag + approachDrag) / currentAircraft.inertia;
  const normalSpeedLimit = currentAircraft.maxSpeed + speedBonus;
  const overspeed = Math.max(0, airspeed - normalSpeedLimit);
  // Boost thrust stops at release, but the speed it already earned is momentum.
  // Above normal max, aerodynamic drag first cancels any remaining engine
  // surplus, then bleeds excess speed over the aircraft's coasting time.
  // Airbrake/approach drag remains additive and intentionally slows it faster.
  const coastDrag = !boostActive && overspeed > 0
    ? Math.max(0, thrust - normalDrag) + overspeed / currentAircraft.overspeedDecaySeconds
    : 0;
  const speedRequestThrottle = mobileThrottleTarget ?? throttle;
  const requestedDeceleration = !boostActive
    ? throttleTargetDeceleration(airspeed, speedRequestThrottle, currentAircraft)
    : 0;
  // The lever requests a continuous performance target. Above that target,
  // first cancel residual engine surplus and then shed the excess speed at an
  // aircraft-specific rate. Large lever reductions therefore bite at once,
  // while small corrections remain smooth and heavy aircraft retain inertia.
  const throttleTargetDrag = requestedDeceleration > 0
    ? Math.max(0, thrust - normalDrag) + requestedDeceleration
    : 0;
  const drag = normalDrag + Math.max(coastDrag, throttleTargetDrag);

  velocity.addScaledVector(forward, thrust * delta);
  velocity.addScaledVector(liftDirection, 9.81 * liftFactor * delta);
  velocity.y -= 9.81 * delta;
  if (landingAssistActive && approachHeight < 14 && velocity.y < 0) {
    const groundEffect = 1 - THREE.MathUtils.clamp(approachHeight / 14, 0, 1);
    velocity.y += groundEffect * 2.8 * delta;
    const softenedDescent = -currentAircraft.safeDescentRate * 0.9;
    if (velocity.y < softenedDescent) velocity.y = THREE.MathUtils.lerp(velocity.y, softenedDescent, Math.min(1, delta * 2.4));
  }
  if (forwardSpeed < currentAircraft.stallSpeed) {
    // A gentle aerodynamic nose drop keeps stalls recoverable with the existing
    // nose-down + throttle controls instead of allowing an implausible hover.
    pitch = Math.max(-0.3, pitch - delta * (1 - stallFactor) * 0.24);
  }
  if (airspeed > 0.01) velocity.addScaledVector(velocity, -Math.min(0.85, drag * delta / airspeed));

  // Gentle aerodynamic alignment preserves momentum while allowing banked turns to curve the flight path.
  sideSlip.copy(forward).multiplyScalar(velocity.dot(forward)).sub(velocity);
  sideSlip.y *= 0.25;
  velocity.addScaledVector(sideSlip, Math.min(1, delta * currentAircraft.alignmentRate * (0.42 + speedRatio * 0.58)));
  // A normal acceleration still obeys the base cap. An aircraft already above
  // it after Boost release retains the Boost ceiling while drag winds it down.
  const maxAirSpeed = guidedTutorialActive ? Math.max(currentAircraft.takeoffSpeed * 2.5, 180) : boostActive || overspeed > 0
    ? currentAircraft.maxSpeed * (currentAircraft.boostMaxSpeed ?? 1.15) + speedBonus
    : normalSpeedLimit;
  if (velocity.lengthSq() > maxAirSpeed * maxAirSpeed) velocity.setLength(maxAirSpeed);
  airplane.position.addScaledVector(velocity, delta);
  currentSpeed = velocity.length();
  verticalSpeed = velocity.y;
  updateAirborneProgress(delta);

  if (hitsWorldObstacle()) {
    endRun('CRASHED');
    return;
  }

  if (flightState === 'TAKEOFF' && airplane.position.y >= groundPlaneY(airplane.position.x, airplane.position.z) + 3) setFlightState('FLYING');

  const terrainY = groundPlaneY(airplane.position.x, airplane.position.z);
  if (airplane.position.y <= terrainY) {
    const landingAirport = getAirportAtPosition(airplane.position);
    evaluateLanding(landingAirport, landingStatus);
    if (!landingAirport || landingStatus.reason) {
      endRun('CRASHED', `CRASH — ${landingStatus.reason}`);
      return;
    }

    const landingQuality: LandingQuality = {
      speed: currentSpeed,
      safeSpeed: currentAircraft.safeLandingSpeed,
      descentRate: verticalSpeed,
      safeDescentRate: currentAircraft.safeDescentRate,
      bankAngle: landingStatus.bankAngle,
      pitch,
      headingError: runwayHeadingError(landingAirport),
      aircraftType,
    };

    airplane.position.y = terrainY;
    verticalSpeed = 0;
    velocity.set(-Math.sin(heading) * currentSpeed, 0, -Math.cos(heading) * currentSpeed);
    pitch = 0;
    roll = 0;
    airplane.rotation.set(0, heading, 0, 'YXZ');
    onGround = true;
    cameraShakeTime = Math.max(cameraShakeTime, landingStatus.rough ? 0.2 : 0.065);
    takeoffRollMeters = 0;
    landedFeedbackTime = 1.5;
    setFlightState('LANDED');
    if(guidedTutorialActive&&guidedTutorialStep==='landing'){
      tutorialLandingIntentPending={airport:landingAirport,quality:landingQuality,attempts:0,lastSentAt:0};
      if(sendLandingIntent(landingAirport,landingQuality)){
        tutorialLandingIntentPending.attempts=1;tutorialLandingIntentPending.lastSentAt=performance.now();
      }
    }
    rewardLanding(landingAirport, landingQuality, landingStatus.rough);
    handleContractLanding(landingAirport);
  }

}

function updateRunTimer(delta: number): void {
  remainingTime = Math.max(0, remainingTime - delta);
  if (remainingTime === 0) endRun('TIME UP');
}

function refreshCameraFraming(): void {
  const assetStatus = String(airplane.userData.assetStatus ?? 'fallback');
  const framingKey = `${airplane.uuid}:${assetStatus}:${camera.aspect.toFixed(3)}`;
  if (framingKey === cameraFramingKey) return;

  airplane.updateWorldMatrix(true, true);
  cameraFrameRootInverse.copy(airplane.matrixWorld).invert();
  cameraFrameLocalBounds.makeEmpty();
  airplane.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    let ancestor: THREE.Object3D | null = object.parent;
    while (ancestor && ancestor !== airplane) {
      if (!ancestor.visible) return;
      ancestor = ancestor.parent;
    }
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    cameraFrameMeshBounds.copy(geometry.boundingBox);
    cameraFrameRelativeMatrix.multiplyMatrices(cameraFrameRootInverse, object.matrixWorld);
    cameraFrameMeshBounds.applyMatrix4(cameraFrameRelativeMatrix);
    cameraFrameLocalBounds.union(cameraFrameMeshBounds);
  });
  if (cameraFrameLocalBounds.isEmpty()) return;

  cameraFrameLocalBounds.getSize(cameraFrameSize);
  const visualSpan = Math.max(cameraFrameSize.x, cameraFrameSize.z * 0.9);
  const horizontalHalfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA_CHASE_FOV) * 0.5) * camera.aspect);
  const viewRange = visualSpan / (2 * CAMERA_TARGET_WIDTH_FRACTION * Math.tan(horizontalHalfFov));
  cameraFocusAhead = THREE.MathUtils.clamp(cameraFrameSize.z * 0.22, 1, 2.7);
  defaultChaseDistance = Math.max(cameraFrameSize.z * 0.75, viewRange - cameraFocusAhead) * currentAircraft.cameraFrameScale;
  defaultChaseHeight = Math.max(currentAircraft.cameraHeight * 0.74, cameraFrameSize.y * 0.65);
  if (!cameraFramingKey) smoothedChaseDistance = defaultChaseDistance * cameraDistanceMultiplier;
  cameraFramingKey = framingKey;
}

function updateCamera(delta: number): void {
  const airplaneTransformValid =
    Number.isFinite(airplane.position.x) &&
    Number.isFinite(airplane.position.y) &&
    Number.isFinite(airplane.position.z) &&
    Number.isFinite(airplane.quaternion.x) &&
    Number.isFinite(airplane.quaternion.y) &&
    Number.isFinite(airplane.quaternion.z) &&
    Number.isFinite(airplane.quaternion.w);
  if (!airplaneTransformValid) {
    camera.position.copy(lastValidCameraPosition);
    camera.quaternion.copy(lastValidCameraQuaternion);
    camera.fov = lastValidCameraFov;
    camera.far = lastValidCameraFar;
    camera.updateProjectionMatrix();
    return;
  }

  refreshCameraFraming();
  const cameraSpeedRatio = THREE.MathUtils.clamp(
    currentSpeed / (currentAircraft.maxSpeed * (boostActive ? (currentAircraft.boostMaxSpeed ?? 1.15) : 1)),
    0,
    1,
  );
  const cameraSpeedOffset = cameraSpeedRatio * 7.2 + boostVisualStrength * 2.35;
  const cameraFollow = currentAircraft.cameraDamping;
  const targetChaseDistance = defaultChaseDistance * cameraDistanceMultiplier * (1 - cameraSpeedRatio * 0.055);
  smoothedChaseDistance = THREE.MathUtils.lerp(
    smoothedChaseDistance,
    targetChaseDistance,
    Math.min(1, delta * 6),
  );
  if (cameraOrbitRadiusTarget > 0) {
    cameraOrbitRadius = THREE.MathUtils.lerp(cameraOrbitRadius, cameraOrbitRadiusTarget, Math.min(1, delta * 8));
  }
  const recentering = !cameraOrbitDragging && cameraOrbitRecenterAt !== null && performance.now() >= cameraOrbitRecenterAt;
  if (recentering) {
    cameraOrbitBlend = Math.max(0, cameraOrbitBlend - delta * 0.7);
    if (cameraOrbitBlend === 0) cameraOrbitRecenterAt = null;
  }
  cameraAircraftForward.set(0, 0, -1).applyQuaternion(airplane.quaternion);
  cameraAircraftForward.y = 0;
  if (cameraAircraftForward.lengthSq() < 0.0001) cameraAircraftForward.set(0, 0, -1);
  else cameraAircraftForward.normalize();
  const aircraftYaw = Math.atan2(-cameraAircraftForward.x, -cameraAircraftForward.z);
  cameraOrbitYawQuaternion.setFromAxisAngle(cameraWorldUp, aircraftYaw);
  cameraChaseQuaternion.copy(airplane.quaternion);
  chaseCameraPosition.copy(cameraOrbitOffset
    .set(
      0,
      defaultChaseHeight * (0.82 + cameraDistanceMultiplier * 0.18) + cameraSpeedOffset * 0.05,
      smoothedChaseDistance,
    )
    .applyQuaternion(cameraChaseQuaternion))
    .add(airplane.position);
  chaseCameraPosition.y = Math.max(
    chaseCameraPosition.y,
    groundPlaneY(chaseCameraPosition.x, chaseCameraPosition.z) + 2.2,
  );
  chaseLookTarget
    .set(0, 0.7 + cameraSpeedOffset * 0.03, -cameraFocusAhead)
    .applyQuaternion(cameraChaseQuaternion)
    .add(airplane.position);

  if (cameraOrbitBlend > 0) {
    const horizontalRadius = cameraOrbitRadius * Math.cos(cameraOrbitPitch);
    orbitCameraPosition.set(
      Math.sin(cameraOrbitYaw) * horizontalRadius,
      Math.sin(cameraOrbitPitch) * cameraOrbitRadius,
      Math.cos(cameraOrbitYaw) * horizontalRadius,
    ).applyQuaternion(cameraOrbitYawQuaternion).add(airplane.position);
    orbitCameraPosition.y = Math.max(
      orbitCameraPosition.y,
      groundPlaneY(orbitCameraPosition.x, orbitCameraPosition.z) + 2.2,
    );
    orbitLookTarget.copy(cameraOrbitFocusLocal).applyQuaternion(cameraOrbitYawQuaternion).add(airplane.position);
    targetCameraPosition.lerpVectors(chaseCameraPosition, orbitCameraPosition, cameraOrbitBlend);
    lookTarget.lerpVectors(chaseLookTarget, orbitLookTarget, cameraOrbitBlend);
  } else {
    targetCameraPosition.copy(chaseCameraPosition);
    lookTarget.copy(chaseLookTarget);
  }

  // Use absolute airspeed, not each aircraft's percentage of its own cap.
  // The previous curve saturated at 122 m/s, giving every cruising aircraft
  // identical peripheral speed feedback despite their 260–780 m/s envelopes.
  // Retain the existing FOV ceiling, Boost contribution and chase framing.
  const peripheralSpeed = THREE.MathUtils.clamp(
    (currentSpeed - 42) / (aircraftDefinitions.fighter.maxSpeed - 42), 0, 1,
  );
  let targetFov = CAMERA_CHASE_FOV
    + peripheralSpeed * 7.5
    + boostVisualStrength * 4.0
    // A little extra peripheral expansion near the ground makes roads and
    // buildings slide past more convincingly without moving the chase camera.
    + peripheralSpeed * (1 - THREE.MathUtils.clamp(altitudeAboveTerrain() / 900, 0, 1)) * 1.15;
  const cinematicFrame = cinematicDirector.cameraFrame();
  if (cinematicFrame?.kind === 'TAKEOFF') {
    gameplayCinematicPullback.copy(targetCameraPosition).sub(lookTarget);
    if (gameplayCinematicPullback.lengthSq() > 0.0001) {
      gameplayCinematicPullback.normalize().multiplyScalar(defaultChaseDistance * 0.1 * cinematicFrame.pulse);
      targetCameraPosition.add(gameplayCinematicPullback);
    }
    targetFov += 3 * cinematicFrame.pulse;
  }
  const launchCameraApplied = applyFlightLaunchCamera(chaseCameraPosition, chaseLookTarget, targetFov);
  let gameplayCameraApplied = false;
  if (!launchCameraApplied && cinematicFrame?.kind === 'PERFECT_LANDING') {
    // A deliberate 32-degree front-right showroom sweep. Both endpoints stay
    // forward of the wing so the motion reads clearly without circling behind.
    const orbitAngle = THREE.MathUtils.lerp(2.35, 1.79, cinematicFrame.eased);
    const orbitRadius = Math.max(defaultChaseDistance * 0.78, Math.max(cameraFrameSize.x, cameraFrameSize.z) * 0.64);
    gameplayCinematicOrbitPosition.set(
      Math.sin(orbitAngle) * orbitRadius,
      Math.max(1.35, cameraFrameSize.y * 0.25),
      Math.cos(orbitAngle) * orbitRadius,
    ).applyQuaternion(airplane.quaternion).add(airplane.position);
    gameplayCinematicOrbitPosition.y = Math.max(
      gameplayCinematicOrbitPosition.y,
      groundPlaneY(gameplayCinematicOrbitPosition.x, gameplayCinematicOrbitPosition.z) + 1.45,
    );
    gameplayCinematicOrbitTarget.set(0, Math.max(0.85, cameraFrameSize.y * 0.27), 0)
      .applyQuaternion(airplane.quaternion).add(airplane.position);
    const entryBlend = smoothstep01(cinematicFrame.progress / 0.18);
    const handoffBlend = smoothstep01((cinematicFrame.progress - 0.82) / 0.18);
    camera.position.lerpVectors(gameplayCinematicStartPosition, gameplayCinematicOrbitPosition, entryBlend);
    lookTarget.lerpVectors(gameplayCinematicStartTarget, gameplayCinematicOrbitTarget, entryBlend);
    camera.position.lerp(chaseCameraPosition, handoffBlend);
    lookTarget.lerp(chaseLookTarget, handoffBlend);
    camera.lookAt(lookTarget);
    camera.fov = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(gameplayCinematicStartFov, 52, entryBlend),
      targetFov,
      handoffBlend,
    );
    camera.updateProjectionMatrix();
    gameplayCameraApplied = true;
  }

  if (launchCameraApplied || gameplayCameraApplied) {
    cameraRelativeOffsetInitialized = false;
  } else if (cameraOrbitDragging) {
    // Manual orbit owns the final position and aim for this frame. Chase
    // smoothing, aircraft pitch/roll, and recentering cannot overwrite it.
    camera.position.copy(targetCameraPosition);
    camera.lookAt(lookTarget);
    cameraRelativeOffsetInitialized = false;
  } else {
    // Keep smoothing in the aircraft's moving frame. A world-space camera
    // lerp trails farther behind as speed rises, shrinking the aircraft even
    // when its configured chase distance never changes.
    targetCameraRelativeOffset.copy(targetCameraPosition).sub(airplane.position);
    if (!cameraRelativeOffsetInitialized) {
      smoothedCameraRelativeOffset.copy(targetCameraRelativeOffset);
      cameraRelativeOffsetInitialized = true;
    } else {
      smoothedCameraRelativeOffset.lerp(targetCameraRelativeOffset, Math.min(1, delta * cameraFollow));
    }
    camera.position.copy(airplane.position).add(smoothedCameraRelativeOffset);
    camera.position.y = Math.max(
      camera.position.y,
      groundPlaneY(camera.position.x, camera.position.z) + 2.2,
    );
    camera.lookAt(lookTarget);
  }

  const nextFov = launchCameraApplied || gameplayCameraApplied
    ? camera.fov
    : THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(0.15, delta * 2.5));
  skyDome.position.copy(camera.position);
  const altitudeFactor = THREE.MathUtils.clamp(altitudeAboveTerrain() / 6000, 0, 1);
  const targetFar = THREE.MathUtils.lerp(CAMERA_BASE_FAR, CAMERA_HIGH_FAR, altitudeFactor);
  if (scene.fog instanceof THREE.Fog) {
    const targetFogNear = WORLD_SIZE > 20_000
      ? THREE.MathUtils.lerp(7000, 11_000, altitudeFactor)
      : THREE.MathUtils.lerp(4500, 9000, altitudeFactor);
    const targetFogFar = WORLD_SIZE > 20_000
      ? THREE.MathUtils.lerp(28_000, 38_000, altitudeFactor)
      : THREE.MathUtils.lerp(15_000, 30_000, altitudeFactor);
    if (Math.abs(scene.fog.near - targetFogNear) >= 10) scene.fog.near = targetFogNear;
    if (Math.abs(scene.fog.far - targetFogFar) >= 10) scene.fog.far = targetFogFar;
    if (worldTimeOfDay === 'dusk') scene.fog.color.setRGB(0.18 + altitudeFactor * 0.055, 0.21 + altitudeFactor * 0.06, 0.32 + altitudeFactor * 0.075);
    else if (isDallas) scene.fog.color.setRGB(0.5 + altitudeFactor * 0.14, 0.71 + altitudeFactor * 0.11, 0.8 + altitudeFactor * 0.1);
    else scene.fog.color.setRGB(0.57 + altitudeFactor * 0.13, 0.76 + altitudeFactor * 0.1, 0.84 + altitudeFactor * 0.09);
  }
  const fovChanged = Number.isFinite(nextFov) && Math.abs(camera.fov - nextFov) >= 0.01;
  const farChanged = Number.isFinite(targetFar) && Math.abs(camera.far - targetFar) >= 25;
  if (fovChanged || farChanged) {
    if (fovChanged) camera.fov = nextFov;
    if (farChanged) camera.far = targetFar;
    camera.updateProjectionMatrix();
  }

  if (cameraShakeTime > 0 && !launchCameraApplied && !gameplayCameraApplied) {
    if (!cameraOrbitDragging) {
      const shakeStrength = (cameraShakeTime / 0.35) * 0.38;
      camera.position.x += Math.sin(cameraShakeTime * 95) * shakeStrength;
      camera.position.y += Math.cos(cameraShakeTime * 110) * shakeStrength * 0.65;
    }
    cameraShakeTime = Math.max(0, cameraShakeTime - delta);
  }

  const cameraTransformValid =
    Number.isFinite(camera.position.x) &&
    Number.isFinite(camera.position.y) &&
    Number.isFinite(camera.position.z) &&
    Number.isFinite(camera.quaternion.x) &&
    Number.isFinite(camera.quaternion.y) &&
    Number.isFinite(camera.quaternion.z) &&
    Number.isFinite(camera.quaternion.w) &&
    Number.isFinite(camera.fov) &&
    Number.isFinite(camera.far) &&
    camera.far > camera.near;
  if (cameraTransformValid) {
    lastValidCameraPosition.copy(camera.position);
    lastValidCameraQuaternion.copy(camera.quaternion);
    lastValidCameraFov = camera.fov;
    lastValidCameraFar = camera.far;
  } else {
    camera.position.copy(lastValidCameraPosition);
    camera.quaternion.copy(lastValidCameraQuaternion);
    camera.fov = lastValidCameraFov;
    camera.far = lastValidCameraFar;
    camera.updateProjectionMatrix();
  }
}

function updateWeapons(delta: number): void {
  fireCooldown = Math.max(0, fireCooldown - delta);
  if (crashed || !heldActions.has('fire') || fireCooldown > 0) return;
  fireWeaponOnce();
}

function fireWeaponOnce(): boolean {
  const blocked = localFireBlockReason();
  if (blocked) {
    reportFireBlocked(blocked);
    return false;
  }
  if (!sendFireIntent()) {
    reportFireBlocked('socket');
    return false;
  }
  // Never consume the local cadence for an intent that was not emitted. This
  // prevents a transient lifecycle/socket gate from looking like a stuck gun.
  fireCooldown = 0.25;
  return true;
}

function animate(): void {
  requestAnimationFrame(animate);
  const qaFrameStartedAt = stabilityQaTiming ? performance.now() : 0;
  if (stabilityQaTiming) {
    if (stabilityQaTiming.lastFrameStartedAt > 0) {
      const frameMs = qaFrameStartedAt - stabilityQaTiming.lastFrameStartedAt;
      stabilityQaTiming.samples += 1;
      stabilityQaTiming.frameTotalMs += frameMs;
      stabilityQaTiming.frameMaxMs = Math.max(stabilityQaTiming.frameMaxMs, frameMs);
      if (frameMs > 50) stabilityQaTiming.over50Ms += 1;
      if (frameMs > 100) stabilityQaTiming.over100Ms += 1;
      if (frameMs > 250) stabilityQaTiming.over250Ms += 1;
    }
    stabilityQaTiming.lastFrameStartedAt = qaFrameStartedAt;
  }
  if (stabilityQaMode) stabilityQaFrames += 1;
  const realDelta = clock.getDelta();
  const delta = Math.min(realDelta, 0.05);
  mobileInput.syncFlightState(throttle, boostMeter, boostActive);
  if (!crashed && runStarted) {
    // Keep high-speed travel between the existing terrain/obstacle checks no
    // larger than 8m, including a thrust allowance. No extra render/network ticks.
    const travelSpeed = velocity.length() + currentAircraft.acceleration * (currentAircraft.boostThrust ?? 1) / currentAircraft.inertia * delta;
    const flightSteps = Math.min(32, Math.max(1, Math.ceil(travelSpeed * delta / 8)));
    for (let step = 0; step < flightSteps && !crashed; step += 1) updateFlight(delta / flightSteps);
    if (!guidedTutorialActive && !crashed && challengeModeEnabled) {
      checkCheckpoint();
      updateRunTimer(delta);
    }
  }
  updateRemotePlayers(realDelta);
  updateCombatThreatWarning();
  updateGuidedTutorial();
  updateCombatTarget(delta);
  updateAircraftVisuals(delta);
  updateProjectiles(delta);
  updateFlashEffects(muzzleFlashes, muzzleFlashPool, delta);
  updateFlashEffects(impactFlashes, impactFlashPool, delta);
  updateDestructionEffects(delta);
  if (cityWorld.updateWorldStreaming) cityWorld.updateWorldStreaming(airplane.position, velocity);
  else updateOsmCityChunks(airplane.position);
  cityWorld.updateWorldVisuals?.(delta, airplane.position);
  journeyGates?.update(delta);
  updateTerritoryBorderVisibility(performance.now());
  ambientTraffic?.update(delta, airplane.position, camera);
  if (!guidedTutorialActive && !crashed && runStarted) skyChallenges?.update(delta, airplane.position, roll, altitudeAboveTerrain(), verticalSpeed);
  if (!crashed && runStarted) {
    stuntFrame.delta = delta;
    stuntFrame.airborne = !onGround;
    stuntFrame.position = airplane.position;
    stuntFrame.altitude = altitudeAboveTerrain();
    stuntFrame.speed = currentSpeed;
    stuntFrame.maxSpeed = currentAircraft.maxSpeed;
    stuntFrame.stallSpeed = currentAircraft.stallSpeed;
    stuntFrame.verticalSpeed = verticalSpeed;
    stuntFrame.roll = roll;
    stuntFrame.aircraftType = aircraftType;
    stuntCombo?.update(stuntFrame);
    discoverySystem?.update(delta, airplane.position, altitudeAboveTerrain(), worldTimeOfDay);
    flightRecap.topSpeed = Math.max(flightRecap.topSpeed, currentSpeed);
    flightRecap.maxAltitude = Math.max(flightRecap.maxAltitude, altitudeAboveTerrain());
  }
  updateWeapons(delta);
  updateMissionReminder(delta);
  if (!crashed && runStarted) updatePlayerInteractions();
  if (challengeModeEnabled) updateCheckpointFeedback(delta);
  updateEventVisual();
  cinematicDirector.update(performance.now());
  updateCamera(delta);
  updateLockCircle();
  syncHunterObjective();
  syncTerritoryObjective();
  if (crashed) missionObjectiveGuidance?.hide();
  else if (missionObjective) missionObjectiveGuidance?.update(camera, airplane.position, WORLD_METERS_PER_UNIT,
    !onGround && runStarted, contextualHints.isEnabled());
  adPlacementManager.update(camera, delta, airplane, selectedCombatTarget !== null, lockCircleCenterX, lockCircleCenterY, lockCircleRadius);
  navigationTimer += delta;
  progressionHudTimer += delta;
  if (progressionHudTimer >= 1) {
    progressionHudTimer %= 1;
    updateProgressHud();
    updateMissionHud();
  }
  if (navigationTimer >= 0.1) {
    navigationTimer %= 0.1;
    updateFlightHud();
    updatePendingAircraftEquip();
    updateSkyChallengeHud();
    updateDynamicEventHud();
    updateNavigationHud();
    updateEngineAudio();
  }
  const qaRenderStartedAt = stabilityQaTiming ? performance.now() : 0;
  if (stabilityQaTiming) {
    const updateMs = qaRenderStartedAt - qaFrameStartedAt;
    stabilityQaTiming.updateTotalMs += updateMs;
    stabilityQaTiming.updateMaxMs = Math.max(stabilityQaTiming.updateMaxMs, updateMs);
  }
  renderer.render(scene, camera);
  if (stabilityQaTiming) {
    const renderMs = performance.now() - qaRenderStartedAt;
    stabilityQaTiming.renderTotalMs += renderMs;
    stabilityQaTiming.renderMaxMs = Math.max(stabilityQaTiming.renderMaxMs, renderMs);
  }
}

if (stabilityQaMode) {
  const panel = document.createElement('pre');
  panel.className = 'stability-qa-panel';
  document.body.append(panel);
  const wallToggle = document.createElement('button');
  wallToggle.className = 'territory-wall-qa-toggle';
  wallToggle.style.cssText = 'position:fixed;z-index:10000;right:8px;bottom:8px;padding:6px 10px';
  const updateWallToggle = (): void => { wallToggle.textContent = `WALLS ${territoryWallsQaDisabled ? 'OFF' : 'ON'}`; };
  wallToggle.addEventListener('click', () => { territoryWallsQaDisabled = !territoryWallsQaDisabled; territoryBorderRefreshAt = 0; updateWallToggle(); });
  updateWallToggle();
  document.body.append(wallToggle);
  let contextEvents = 0;
  let airborneSince: number | undefined;
  let takeoffSampleIndex = 0;
  let lastVisibilityFailureAt = -Infinity;
  let lastSampleAt = performance.now();
  let lastMaterialSampleAt = -Infinity;
  let materialCount = 0;
  let objectCount = 0;
  let meshCount = 0;
  const takeoffSampleSeconds = [0, 2, 5, 10, 20] as const;
  const report = (): void => {
    const sampleAt = performance.now();
    const fps = Math.round(stabilityQaFrames * 1000 / Math.max(1, sampleAt - lastSampleAt));
    stabilityQaFrames = 0;
    lastSampleAt = sampleAt;
    if (sampleAt - lastMaterialSampleAt >= 5_000) {
      lastMaterialSampleAt = sampleAt;
      const materials = new Set<number>();
      objectCount = 0;
      meshCount = 0;
      scene.traverse((object) => {
        objectCount += 1;
        if (!(object instanceof THREE.Mesh)) return;
        meshCount += 1;
        const used = object.material;
        if (Array.isArray(used)) for (const material of used) materials.add(material.id);
        else materials.add(used.id);
      });
      materialCount = materials.size;
    }
    const stream = cityWorld.getWorldStreamingStats?.();
    const visualCells = cityWorld.getWorldStreamingVisualDebug?.(airplane.position, camera) ?? [];
    const visibleCells = visualCells.filter((cell) => cell.attached && cell.groupVisible && cell.meshVisible > 0);
    const visibleBuildings = visibleCells.reduce((total, cell) => total + cell.buildingMeshes, 0);
    const visibleRoads = visibleCells.reduce((total, cell) => total + cell.roadMeshes, 0);
    const featureRichCells = visualCells.filter((cell) => (cell.source?.buildings ?? 0) + (cell.source?.roads ?? 0) > 0);
    const ambient = ambientTraffic?.getStats() ?? { actors: 0, ambientActors: 0, routeCount: 0, ambientEnabled: false, nearestRoute: Infinity, clouds: 0, storms: 0 };
    const challenges = skyChallenges?.getStats() ?? { gates: 0, active: false };
    const ads = adPlacementManager.getStats();
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    const timingSamples = Math.max(1, stabilityQaTiming?.samples ?? 0);
    const timing = stabilityQaTiming ? {
      frameMs: { average: stabilityQaTiming.frameTotalMs / timingSamples, max: stabilityQaTiming.frameMaxMs },
      updateMs: { average: stabilityQaTiming.updateTotalMs / timingSamples, max: stabilityQaTiming.updateMaxMs },
      renderMs: { average: stabilityQaTiming.renderTotalMs / timingSamples, max: stabilityQaTiming.renderMaxMs },
      spikes: { over50Ms: stabilityQaTiming.over50Ms, over100Ms: stabilityQaTiming.over100Ms, over250Ms: stabilityQaTiming.over250Ms },
    } : undefined;
    const paintOf = (root: THREE.Object3D) => { const colors: Record<string,string> = {}; root.traverse(object => { if(object instanceof THREE.Mesh) for(const material of Array.isArray(object.material)?object.material:[object.material]) if(material.name.startsWith('AC_LIVERY') && 'color' in material) colors[material.name] = (material.color as THREE.Color).getHexString(); }); return colors; };
    const visibleTerritoryMeshes = territoryBorders.flatMap(({ wall }) => wall.visible ? [wall] : []);
    const territoryTriangles = visibleTerritoryMeshes.reduce((total, mesh) => total + (mesh.geometry.index
      ? mesh.geometry.index.count / 3
      : (mesh.geometry.getAttribute('position')?.count ?? 0) / 3), 0);
    const snapshot = {
      tutorial: {active:guidedTutorialActive,step:guidedTutorialStep,crashed},
      cosmetics: {local:paintOf(airplane),remote:[...remotePlayers.values()].filter(player=>!player.isBot).map(player=>({id:player.playerId,paint:paintOf(player.plane)}))},
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps,
      materials: materialCount,
      objects: objectCount,
      meshes: meshCount,
      timing,
      chunks: stream?.loaded ?? { near: 0, mid: 0, far: 0 },
      visibleLods: stream?.visible ?? { near: 0, mid: 0, far: 0 },
      desired: stream?.desired ?? { near: 0, mid: 0, far: 0 },
      requested: stream?.requested ?? { near: 0, mid: 0, far: 0 },
      geometryCacheMiB: stream ? `${(stream.loadedBytes / 1048576).toFixed(1)}/${(stream.cacheLimitBytes / 1048576).toFixed(0)}` : 'n/a',
      cacheBytesByLod: stream?.bytesByLod,
      cacheProtectedBytes: stream?.protectedBytes,
      cacheEvictionCandidates: stream?.evictionCandidates,
      cacheDuplicateLodBytes: stream?.duplicateLodBytes ?? 0,
      queuedBuildBytes: stream?.queuedBuildBytes ?? 0,
      queued: stream?.queued ?? 0,
      pending: stream?.pending ?? 0,
      activeFetches: stream?.activeFetches ?? 0,
      queuedBuilds: stream?.queuedBuilds ?? 0,
      abortedFetches: stream?.abortedFetches ?? 0,
      protectedCells: stream?.protectedCells ?? { visible: 0, ahead: 0, immediateFallback: 0 },
      loaded: stream?.loadedChunks ?? 0,
      evicted: stream?.evictedChunks ?? 0,
      discarded: stream?.discardedLoads ?? 0,
      failed: stream?.failedFetches ?? 0,
      missingImmediate: stream?.missingImmediateCells ?? 0,
      fetchMs: stream ? `${stream.averageFetchMs.toFixed(1)}/${stream.maxFetchMs.toFixed(1)}` : 'n/a',
      parseMs: stream ? `${stream.averageParseMs.toFixed(1)}/${stream.maxParseMs.toFixed(1)}` : 'n/a',
      buildMs: stream ? `${stream.averageBuildMs.toFixed(1)}/${stream.maxBuildMs.toFixed(1)} ${stream.maxBuildFilename}` : 'n/a',
      streamSpeed: stream?.speed ?? 0,
      preloadDistance: stream?.preloadDistance ?? 0,
      flight: {
        state: flightState,
        altitude: altitudeAboveTerrain(),
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
        cameraFar: camera.far,
        fogNear: scene.fog instanceof THREE.Fog ? scene.fog.near : undefined,
        fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : undefined,
      },
      visualCells: { nearby: visualCells.length, visible: visibleCells.length, buildingMeshes: visibleBuildings, roadMeshes: visibleRoads, nearest: visualCells[0] },
      projectiles: clientProjectiles.size + predictedProjectiles.size,
      flashes: muzzleFlashes.length + impactFlashes.length,
      debris: destructionEffects.length,
      ambient,
      challengeGates: challenges.gates,
      challengeActive: challenges.active,
      eventObjects: chaosGates.filter((gate) => gate.visible).length + Number(eventCrate.visible),
      ads,
      remoteMeshes: remotePlayers.size,
      realtime: {
        state: stabilityQaSocketState,
        created: stabilityQaSocketsCreated,
        opens: stabilityQaSocketOpens,
        closes: stabilityQaSocketCloses,
        reconnectsScheduled: stabilityQaReconnectsScheduled,
      },
      heapMiB: heap ? `${(heap.usedJSHeapSize / 1048576).toFixed(1)}/${(heap.totalJSHeapSize / 1048576).toFixed(1)}` : 'unavailable',
      contextEvents,
      territoryWalls: {
        enabled: !territoryWallsQaDisabled,
        groups: territoryBorders.length,
        visibleGroups: territoryBorders.filter(({ wall }) => wall.visible).length,
        meshes: territoryBorders.length + 1,
        drawCalls: visibleTerritoryMeshes.length + Number(territoryPulseMesh.visible),
        triangles: territoryTriangles,
      },
    };
    if (stabilityQaTiming) {
      stabilityQaTiming.samples = 0;
      stabilityQaTiming.frameTotalMs = 0;
      stabilityQaTiming.frameMaxMs = 0;
      stabilityQaTiming.updateTotalMs = 0;
      stabilityQaTiming.updateMaxMs = 0;
      stabilityQaTiming.renderTotalMs = 0;
      stabilityQaTiming.renderMaxMs = 0;
      stabilityQaTiming.over50Ms = 0;
      stabilityQaTiming.over100Ms = 0;
      stabilityQaTiming.over250Ms = 0;
    }
    panel.textContent = [
      'STABILITY QA · LOCAL ONLY',
      `GPU geo ${snapshot.geometries} · tex ${snapshot.textures} · materials ${snapshot.materials} · calls ${snapshot.calls} · tris ${snapshot.triangles} · FPS ${snapshot.fps}`,
      `frame ms avg/max ${snapshot.timing?.frameMs.average.toFixed(1) ?? 'n/a'}/${snapshot.timing?.frameMs.max.toFixed(1) ?? 'n/a'} · update ${snapshot.timing?.updateMs.average.toFixed(1) ?? 'n/a'}/${snapshot.timing?.updateMs.max.toFixed(1) ?? 'n/a'} · render ${snapshot.timing?.renderMs.average.toFixed(1) ?? 'n/a'}/${snapshot.timing?.renderMs.max.toFixed(1) ?? 'n/a'} · spikes 50/100/250 ${snapshot.timing?.spikes.over50Ms ?? 0}/${snapshot.timing?.spikes.over100Ms ?? 0}/${snapshot.timing?.spikes.over250Ms ?? 0}`,
      `scene objects ${snapshot.objects} · meshes ${snapshot.meshes} · realtime state ${snapshot.realtime.state} · sockets created/open/close/reconnect ${snapshot.realtime.created}/${snapshot.realtime.opens}/${snapshot.realtime.closes}/${snapshot.realtime.reconnectsScheduled}`,
      `player ${Math.round(airplane.position.x)},${Math.round(airplane.position.z)} · speed ${Math.round(snapshot.streamSpeed)} · lookahead ${Math.round(snapshot.preloadDistance)}m · desired N/M/F ${snapshot.desired.near}/${snapshot.desired.mid}/${snapshot.desired.far} · requested ${snapshot.requested.near}/${snapshot.requested.mid}/${snapshot.requested.far}`,
      `state ${snapshot.flight.state} · alt ${Math.round(snapshot.flight.altitude)}m · velocity ${Math.round(snapshot.flight.velocity.x)},${Math.round(snapshot.flight.velocity.y)},${Math.round(snapshot.flight.velocity.z)} · camera/fog ${Math.round(snapshot.flight.cameraFar)}/${Math.round(snapshot.flight.fogNear ?? 0)}-${Math.round(snapshot.flight.fogFar ?? 0)}`,
      `Dallas attached N/M/F ${snapshot.chunks.near}/${snapshot.chunks.mid}/${snapshot.chunks.far} · visible ${snapshot.visibleLods.near}/${snapshot.visibleLods.mid}/${snapshot.visibleLods.far} · geometry cache ${snapshot.geometryCacheMiB} MiB`,
      snapshot.cacheBytesByLod && snapshot.cacheProtectedBytes && snapshot.cacheEvictionCandidates
        ? `cache N/M/F ${snapshot.cacheBytesByLod.near >> 20}/${snapshot.cacheBytesByLod.mid >> 20}/${snapshot.cacheBytesByLod.far >> 20} MiB · protected current/visible/ahead/fallback/handoff/overlap ${Object.values(snapshot.cacheProtectedBytes).map(bytes => (bytes / 1048576).toFixed(1)).join('/')} MiB · candidates ${snapshot.cacheEvictionCandidates.cells}/${(snapshot.cacheEvictionCandidates.bytes / 1048576).toFixed(1)} MiB · duplicate ${(snapshot.cacheDuplicateLodBytes / 1048576).toFixed(1)} MiB · builds ${(snapshot.queuedBuildBytes / 1048576).toFixed(1)} MiB`
        : '',
      `queue ${snapshot.queued} · fetch ${snapshot.activeFetches} · build ${snapshot.queuedBuilds} · pending ${snapshot.pending} · aborted ${snapshot.abortedFetches} · protect V/A/F ${snapshot.protectedCells.visible}/${snapshot.protectedCells.ahead}/${snapshot.protectedCells.immediateFallback} · missing near ${snapshot.missingImmediate}`,
      `loaded ${snapshot.loaded} · evicted ${snapshot.evicted} · stale ${snapshot.discarded} · failed ${snapshot.failed} · fetch ms avg/max ${snapshot.fetchMs} · parse ${snapshot.parseMs} · build ${snapshot.buildMs}`,
      `visible cells ${snapshot.visualCells.visible}/${snapshot.visualCells.nearby} · nearby building meshes ${snapshot.visualCells.buildingMeshes} · roads ${snapshot.visualCells.roadMeshes}${snapshot.visualCells.nearest ? ` · nearest ${snapshot.visualCells.nearest.id}/${snapshot.visualCells.nearest.lod} ${snapshot.visualCells.nearest.lifecycle} visible=${snapshot.visualCells.nearest.groupVisible}/${snapshot.visualCells.nearest.meshVisible} frustum=${snapshot.visualCells.nearest.frustumIntersects}` : ''}`,
      `projectiles ${snapshot.projectiles} · flashes ${snapshot.flashes} · debris ${snapshot.debris} · remotes ${snapshot.remoteMeshes}`,
      `clouds ${snapshot.ambient.clouds} · ambient ${snapshot.ambient.ambientActors}/${snapshot.ambient.routeCount} (${snapshot.ambient.actors} total, ${snapshot.ambient.ambientEnabled ? 'on' : 'off'}, near ${Math.round(snapshot.ambient.nearestRoute)}m) · gates ${snapshot.challengeGates}${snapshot.challengeActive ? ' active' : ''} · event ${snapshot.eventObjects}`,
      `ads ${snapshot.ads.meshes} meshes/${snapshot.ads.materials} materials · heap ${snapshot.heapMiB} MiB · context ${snapshot.contextEvents}`,
      `territory walls ${snapshot.territoryWalls.enabled ? 'ON' : 'OFF'} · groups ${snapshot.territoryWalls.visibleGroups}/${snapshot.territoryWalls.groups} · meshes ${snapshot.territoryWalls.meshes} · calls ${snapshot.territoryWalls.drawCalls} · tris ${snapshot.territoryWalls.triangles}`,
    ].join('\n');
    console.debug('[stabilityqa]', snapshot);
    const now = performance.now();
    if (onGround) {
      airborneSince = undefined;
      takeoffSampleIndex = 0;
    } else {
      airborneSince ??= now;
      const airborneSeconds = (now - airborneSince) / 1000;
      while (takeoffSampleIndex < takeoffSampleSeconds.length && airborneSeconds >= takeoffSampleSeconds[takeoffSampleIndex]) {
        console.info('[DALLAS_TAKEOFF_SAMPLE]', { seconds: takeoffSampleSeconds[takeoffSampleIndex], ...snapshot });
        takeoffSampleIndex += 1;
      }
      if (snapshot.flight.altitude <= 1_524 && featureRichCells.length > 0 && visibleBuildings + visibleRoads === 0 && now - lastVisibilityFailureAt > 5_000) {
        lastVisibilityFailureAt = now;
        console.warn('[DALLAS_VISIBILITY_FAILURE]', {
          state: flightState,
          altitude: snapshot.flight.altitude,
          nearby: featureRichCells.map((cell) => ({ id: cell.id, lod: cell.lod, desiredLod: cell.desiredLod, source: cell.source, attached: cell.attached, visible: cell.groupVisible, meshes: cell.meshVisible })),
        });
      }
    }
  };
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    contextEvents += 1;
    event.preventDefault();
    console.warn('[stabilityqa] WebGL context lost');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextEvents += 1;
    console.info('[stabilityqa] WebGL context restored');
  });
  window.setInterval(report, 1000);
  report();
}

window.addEventListener('resize', () => {
  resizeRenderer();
  worldMap.resize();
});

async function realtimeSocketUrl(): Promise<URL> {
  const url = await realtimeUrl();
  url.searchParams.set(CITY_QUERY_PARAM, cityId);
  url.searchParams.set('pilotId', persistedPlayer.pilotId);
  url.searchParams.set('pilotName', displayName);
  url.searchParams.set('protocol', String(PROTOCOL_VERSION));
  url.searchParams.set('analyticsSession', productAnalyticsSessionId());
  if (journeyMode) url.searchParams.set('journeyAttempt', journeyAttemptId);
  if (chaosQaMode) url.searchParams.set('chaosqa', '1');
  return url;
}
// Rendering and input must not depend on the first network round trip. On
// iOS the authoritative session/ticket request uses the native transport; a
// transient failure there is recovered by the normal reconnect path instead
// of rejecting this module and leaving the game root hidden.
let socket!: WebSocket;
let protocolReady = false;
let protocolBlocked = false;
let reconnectAttempt = 0;
let reconnectTimer: number | undefined;
let networkOnline = navigator.onLine;
let realtimePaused = document.hidden;
let realtimeStopped = false;
let realtimeConnectInFlight = false;
let stopConnectivityMonitor: () => void = () => undefined;
let resumeRefreshInFlight = false;
const REALTIME_WELCOME_TIMEOUT_MS = 10_000;

function setConnectionWarning(visible: boolean): void {
  connectionStatusElement.classList.toggle('hidden', !visible);
}

function clearReconnectTimer(): void {
  window.clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
}

function closeRealtimeSocket(reason: string): void {
  const current = socket;
  if (!current || (current.readyState !== WebSocket.OPEN && current.readyState !== WebSocket.CONNECTING)) return;
  try { current.close(1000, reason); } catch { /* a connecting socket will close asynchronously */ }
}

async function replaceRealtimeSocket(reason: string): Promise<void> {
  if (realtimeStopped || realtimePaused || !networkOnline || protocolBlocked || realtimeConnectInFlight) return;
  clearReconnectTimer();
  realtimeConnectInFlight = true;
  let failed = false;
  try {
    const nextUrl = await realtimeSocketUrl();
    if (realtimeStopped || realtimePaused || !networkOnline || protocolBlocked) return;
    const previous = socket;
    const replacement = new WebSocket(nextUrl);
    if (stabilityQaMode) {
      stabilityQaSocketsCreated += 1;
      stabilityQaSocketState = replacement.readyState;
    }
    socket = replacement;
    protocolReady = false;
    profileHydrated = false;
    bindSocketEvents(replacement);
    if (previous && (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING)) {
      try { previous.close(1000, reason); } catch { /* replacement remains authoritative */ }
    }
  } catch {
    failed = true;
    setConnectionWarning(true);
  } finally {
    realtimeConnectInFlight = false;
    if (failed) scheduleRealtimeReconnect();
  }
}

function scheduleRealtimeReconnect(immediate = false): void {
  if (realtimeStopped || realtimePaused || !networkOnline || protocolBlocked || realtimeConnectInFlight || reconnectTimer !== undefined) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const delay = immediate ? 0 : reconnectDelay(reconnectAttempt++);
  if (stabilityQaMode) stabilityQaReconnectsScheduled += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    void replaceRealtimeSocket('Reconnecting');
  }, delay);
}

function refreshSessionAndReconnect(): void {
  if (resumeRefreshInFlight || realtimeStopped || realtimePaused || !networkOnline) return;
  resumeRefreshInFlight = true;
  void refreshAccountStatus().finally(() => {
    resumeRefreshInFlight = false;
    if (connectionReady()) setConnectionWarning(false);
    else {
      setConnectionWarning(true);
      scheduleRealtimeReconnect(true);
    }
  });
}
const oauthResult = new URLSearchParams(window.location.search);
if (oauthResult.has('auth')) {
  const provider = (oauthResult.get('provider') ?? 'provider').toUpperCase();
  const outcome = oauthResult.get('auth');
  const notice = outcome === 'success'
    ? `${provider} ${oauthResult.get('linked') === '1' ? 'LINKED' : 'ACCOUNT LOADED'}`
    : outcome === 'collision' ? 'SIGN IN TO YOUR EXISTING ACCOUNT, THEN LINK THIS PROVIDER' : `${provider} SIGN-IN FAILED`;
  try { sessionStorage.setItem('airport-chaos-account-notice', notice); } catch { /* transient notice is optional */ }
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('auth'); cleanUrl.searchParams.delete('provider'); cleanUrl.searchParams.delete('linked');
  window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}
void refreshAccountStatus();
try {
  const accountNotice = sessionStorage.getItem('airport-chaos-account-notice');
  if (accountNotice) { sessionStorage.removeItem('airport-chaos-account-notice'); window.setTimeout(() => showProgressMessage(accountNotice), 400); }
} catch { /* transient notice is optional */ }

function connectionReady(): boolean {
  return protocolReady && !protocolBlocked && socket?.readyState === WebSocket.OPEN;
}

function reconnectRealtimeSession(): void {
  protocolReady = false;
  protocolBlocked = false;
  profileHydrated = false;
  localPlayerId = null;
  pendingEquip = undefined;
  clearCombatThreats();
  cityHumanRoster.clear();
  humanRadarTracks.clear();
  playersPanel.update([], null);
  for (const playerId of [...remotePlayers.keys()]) removeRemotePlayer(playerId);
  reconnectAttempt = 0;
  void replaceRealtimeSocket('Session changed');
}

function blockProtocolConnection(message: string): void {
  if (protocolBlocked) return;
  protocolBlocked = true;
  protocolReady = false;
  showProgressMessage(message);
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close(4002, 'Protocol mismatch');
}

if (chaosQaMode) {
  const panel = document.createElement('aside');
  panel.className = 'chaos-qa-panel';
  panel.innerHTML = `
    <strong>LIVE EVENTS QA</strong>
    <select aria-label="Forced chaos event">
      <option value="mostWanted">MOST WANTED</option>
      <option value="supplyDrop">SUPPLY DROP</option>
      <option value="goldenDrop">GOLDEN DROP</option>
      <option value="skyRush">SKY RUSH</option>
      <option value="stormRisk">STORM RISK ZONE</option>
      <option value="lowAltitudeRisk">LOW-ALTITUDE RISK ZONE</option>
      <option value="highAltitudeRisk">HIGH-ALTITUDE RISK ZONE</option>
      <option value="downtownRisk">DOWNTOWN DANGER ZONE</option>
      <option value="aceIntercept">ACE INTERCEPT</option>
      <option value="vipEscort">VIP ESCORT</option>
      <option value="goldenSkyRun">GOLDEN SKY RUN</option>
      <option value="cityEmergency">CITY EMERGENCY</option>
      <option value="stormLanding">STORM LANDING</option>
      <option value="fogApproach">FOG APPROACH</option>
      <option value="cargoRush">CARGO RUSH</option>
      <option value="soloAirportSprint">SOLO AIRPORT SPRINT</option>
    </select>
    <div><button type="button" data-chaos-qa="start">START</button><button type="button" data-chaos-qa="end">FAIL</button><button type="button" data-chaos-qa="reset">RESET</button></div>`;
  const select = panel.querySelector<HTMLSelectElement>('select')!;
  panel.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-chaos-qa]');
    if (!button || !connectionReady()) return;
    socket.send(JSON.stringify({ type: 'chaosQa', action: button.dataset.chaosQa, qaEvent: select.value }));
  });
  document.body.append(panel);
}
const pendingProfileRewards = new Map<string, ContractType>();
let inFlightProfileReward: { id: string; sentAt: number } | undefined;
let profileProgressTimer: number | undefined;
let profileSyncUnavailableNotified = false;

function flushProfileRewards(): void {
  if (!localPlayerId || !connectionReady()) return;
  // One receipt at a time: resending the entire pending map on each new
  // reward amplified delayed acknowledgements into a WS/HTTP starvation loop.
  if (inFlightProfileReward && performance.now() - inFlightProfileReward.sentAt < 5000) return;
  const next = pendingProfileRewards.entries().next();
  if (next.done) return;
  const [rewardId, rewardSource] = next.value;
  socket.send(JSON.stringify({ type: 'profileReward', rewardId, rewardSource }));
  inFlightProfileReward = { id: rewardId, sentAt: performance.now() };
}

function queueProfileReward(source: ContractType): void {
  if (flightTestMode) return;
  // The timestamp makes a reward receipt self-expiring: after the server's
  // retention window it cannot be replayed even though its row was pruned.
  const nonce = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 18);
  const rewardId = `reward-${Date.now().toString(36)}-${nonce}`;
  pendingProfileRewards.set(rewardId, source);
  if (!localPlayerId || !connectionReady()) {
    if (!profileSyncUnavailableNotified) {
      profileSyncUnavailableNotified = true;
      showProgressMessage('PROGRESS WAITING FOR SERVER');
    }
    return;
  }
  flushProfileRewards();
}

function queueProfileProgress(): void {
  if (flightTestMode || !cityRules.progressionEnabled || profileProgressTimer !== undefined) return;
  profileProgressTimer = window.setTimeout(() => {
    profileProgressTimer = undefined;
    if (!localPlayerId || !connectionReady()) return;
    socket.send(JSON.stringify({
      type: 'profileProgress',
      progress: {
        totalDistance,
        successfulLandings: totalSuccessfulLandings,
        discoveries: discoveredLocationsByCity,
      },
    }));
  }, 1000);
}

function applyServerProfile(profile: unknown, rewardId?: string, revision = selectionRevision, equipRequestId?: number, _creditReason?: string, preserveActiveAircraft = false, serverReset = false, receipt?: CreditReceipt): boolean {
  if (!isNetworkProfile(profile)) return false;
  if (!Number.isSafeInteger(revision) || revision < 0) return false;
  const previousRevision = selectionRevision;
  if (rewardId) {
    pendingProfileRewards.delete(rewardId);
    if (inFlightProfileReward?.id === rewardId) inFlightProfileReward = undefined;
  }
  // A delayed pre-equip profile may acknowledge a reward, but must never
  // restore the previous aircraft (or its older progression snapshot).
  if (revision < selectionRevision) return true;
  const creditUpdate = profileHydrated && profile.pilotId === serverProfile.pilotId
    ? reconcileCreditSnapshot(serverProfile.credits, serverProfile.creditRevision, profile.credits, profile.creditRevision, receipt, seenCreditRewardIds)
    : { accepted: true, toastDelta: 0 };
  if (!creditUpdate.accepted) return true;
  const equipConfirmed = pendingEquip && profile.selectedAircraft === pendingEquip.aircraftType &&
    (equipRequestId === pendingEquip.id || revision > selectionRevision);
  const selectionChanged = profile.selectedAircraft !== aircraftType;
  const selectionChangeAuthorized = !authoritativeSelectionApplied || revision > previousRevision || Boolean(equipConfirmed);
  // Routine rewards/progress share the current selection revision. They may
  // update progression, but can never authorize an aircraft replacement and
  // runway restart. Explicit equips and controlled boundaries increment the
  // revision server-side before sending their profile.
  if (!preserveActiveAircraft && selectionChanged && !selectionChangeAuthorized) {
    if (import.meta.env.DEV) console.warn('[profile-selection-rejected]', {
      previousAircraft: aircraftType, incomingAircraft: profile.selectedAircraft,
      previousRevision, incomingRevision: revision, equipRequestId,
      trialStatus: profile.fighterTrial.status,
      trialRemainingMs: profile.fighterTrial.status === 'active' ? (profile.fighterTrial.expiresAt ?? 0) - Date.now() : undefined,
    });
    return true;
  }
  if (equipConfirmed) {
    pendingEquip = undefined;
    hapticsManager.emit('confirmation');
  }
  if (profileHydrated && profile.pilotId === serverProfile.pilotId) {
    emitConfirmedProfileRewardFeedback(hapticsManager, serverProfile, profile, _creditReason);
  }
  selectionRevision = revision;
  authoritativeSelectionApplied = true;
  serverProfile = profile;
  applyEquippedLivery(airplane, aircraftType, profile.cosmetics.equipped);
  activeMissionAttemptId = profileActiveMissionAttempt(profile)?.attemptId;
  refreshTerritoryBorders();
  updateMissionHud();
  profileHydrated = true;
  profileSyncUnavailableNotified = false;
  persistedPlayer.pilotId = profile.pilotId;
  persistedPlayer.selectedAircraft = profile.selectedAircraft;
  credits = profile.credits;
  skyTokens = profile.skyTokens ?? 0;
  updateProgressHud();
  if (creditUpdate.toastDelta > 0 && creditUpdate.rewardId) {
    seenCreditRewardIds.add(creditUpdate.rewardId);
    if (seenCreditRewardIds.size > 256) seenCreditRewardIds.delete(seenCreditRewardIds.values().next().value!);
    queueRewardFeedback(creditUpdate.toastDelta);
    document.querySelector('#hud-credits')!.classList.remove('earned');
    void creditsElement.offsetWidth;
    document.querySelector('#hud-credits')!.classList.add('earned');
  }
  totalDistance = profile.totalDistance;
  totalSuccessfulLandings = profile.successfulLandings;
  displayName = profile.pilotName;
  identityTransitionInProgress = false;
  updateAuthHudControl();
  // Discovery progress is monotonic. A reward response can precede the
  // debounced progress upload; do not erase locally completed discoveries.
  for (const city of ['milwaukee', 'dallas'] as const) {
    discoveredLocationsByCity[city] = [...new Set([...(discoveredLocationsByCity[city] ?? []), ...(profile.discoveries[city] ?? [])])];
  }
  discoveredLocationIds.clear();
  for (const id of discoveredLocationsByCity[cityId] ?? []) discoveredLocationIds.add(id);
  discoverySystem?.hydrate(discoveredLocationIds);
  if (!flightTestMode && !preserveActiveAircraft && profile.selectedAircraft !== aircraftType) applyServerSelectedAircraft(profile.selectedAircraft, true, !serverReset);
  updatePendingAircraftEquip();
  if (aircraftGarage.isOpen()) aircraftGarage.updateProfile({
    credits: profile.credits,
    skyTokens: profile.skyTokens,
    selectedAircraft: profile.selectedAircraft,
    unlockedAircraft: profile.unlockedAircraft,
    economyVersion: profile.economyVersion,
    aircraftEntitlements: profile.aircraftEntitlements,
    testerCodeEnabled: profile.testerCodeEnabled,
    fighterTrial: profile.fighterTrial,
    cosmetics: profile.cosmetics,
  });
  if (visibleRecap && !flightRecapElement.hidden) showFlightRecap(visibleRecap.title, visibleRecap.landing, false);
  savePlayerProgress();
  if (equipConfirmed) showProgressMessage(`${aircraftDefinitions[profile.selectedAircraft].name} EQUIPPED`);
  return true;
}

function openWorldSelector(): void {
  pilotMenu.close();
  clearHeldActions();
  boostActive = false;
  window.dispatchEvent(new Event('airport-chaos-open-city-selector'));
}
let flightExitPending = false;
function requestFlightExit(openFirehawkGarage = false): void {
  if (flightExitPending) return;
  if (journeyMode) {
    showFlightDialog('Exit mission?', 'Return to Mission Journey?', [
      { label: 'STAY', secondary: true, run: () => undefined },
      { label: 'EXIT TO JOURNEY', run: () => { void exitFlightToHub(false, true); } },
    ]);
    return;
  }
  if (guidedTutorialActive) {
    showFlightDialog('Exit training?', 'Return to the Pilot Hub?', [
      { label: 'STAY', secondary: true, run: () => undefined },
      { label: 'EXIT TO HUB', run: () => { void endTrainingAndNavigate('hub'); } },
    ]);
    return;
  }
  const activeMission = profileActiveMissionAttempt(serverProfile);
  const hasActiveProgress = Boolean(activeMission || activeContract);
  showFlightDialog('Exit flight?', hasActiveProgress ? 'Current mission progress will be abandoned.' : 'Return to the Pilot Hub?', [
    { label: 'STAY', secondary: true, run: () => undefined },
    { label: 'EXIT TO HUB', run: () => { void exitFlightToHub(openFirehawkGarage); } },
  ]);
}
async function exitFlightToHub(openFirehawkGarage = false, returnToJourney = false): Promise<void> {
  if (flightExitPending) return;
  flightExitPending = true;
  championshipLandingIntentPending = undefined;
  const completedJourneyExit = returnToJourney && journeyMode && journeyAttempt?.status === 'COMPLETED';
  closeFlightDialog();
  if (returnToJourney && journeyMode && journeyAttempt && ['READY', 'APPROACH', 'RACING'].includes(journeyAttempt.status)) {
    try {
      await apiFetch(apiUrl(`/api/journey/dallas/${journeyAttempt.missionId === journeyDallas07.id ? 'mission-07' : journeyAttempt.missionId === journeyDallas06.id ? 'mission-06' : journeyAttempt.missionId === journeyDallas05.id ? 'mission-05' : journeyAttempt.missionId === journeyDallas04.id ? 'mission-04' : journeyAttempt.missionId === journeyDallas03.id ? 'mission-03' : journeyAttempt.missionId === 'journey-dallas-02' ? 'mission-02' : 'mission-01'}/abandon`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId: journeyAttemptId }),
      });
    } catch { /* Closing the socket also interrupts an unfinished attempt. */ }
  }
  const activeMission = profileActiveMissionAttempt(serverProfile);
  if (activeMission && !flightTestMode) {
    const missionCityId = profileActiveMissionCity(serverProfile);
    try {
      const url = apiUrl('/api/profile');
      url.searchParams.set('pilotId', serverProfile.pilotId);
      const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abandonMission: { cityId: missionCityId, expectedAttemptId: activeMission.attemptId } }) });
      if (!response.ok) {
        // The server may have finished/abandoned this attempt between the menu
        // check and the POST. Only leave if the same authenticated profile now
        // confirms that no mission remains active; never assume a failed POST
        // succeeded or accept a replacement guest profile after a session loss.
        const latestResponse = await apiFetch(url, { cache: 'no-store' });
        const latest = latestResponse.ok ? await latestResponse.json() : undefined;
        if (!isNetworkProfile(latest) || latest.pilotId !== serverProfile.pilotId || profileActiveMissionAttempt(latest)) {
          throw new Error('Mission could not be left');
        }
      }
    } catch {
      flightExitPending = false;
      showProgressMessage('SERVER REQUIRED TO EXIT ACTIVE MISSION');
      return;
    }
  }
  clearHeldActions();
  mobileInput.reset();
  resetCameraPointers();
  boostActive = false;
  activeContract = null;
  cinematicDirector.dispose();
  if (pilotMenu.isOpen()) pilotMenu.close();
  realtimeStopped = true;
  clearReconnectTimer();
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closingSocket = socket;
    const closed = completedJourneyExit ? undefined : new Promise<boolean>((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 3_000);
      closingSocket.addEventListener('close', () => { window.clearTimeout(timeout); resolve(true); }, { once: true });
    });
    try { closingSocket.close(1000, 'Exit flight'); } catch { /* close result is checked below */ }
    // The server has already committed a completed Journey result. A suspended
    // iOS WebSocket may never deliver its close event after backgrounding.
    if (closed && !await closed) {
      realtimeStopped = false;
      flightExitPending = false;
      showProgressMessage('COULD NOT END FLIGHT SESSION · TRY AGAIN');
      return;
    }
  }
  savePlayerProgress(true);
  if (openFirehawkGarage) {
    try { sessionStorage.setItem('airport-chaos-open-firehawk-garage', '1'); } catch { /* navigation still succeeds */ }
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(CITY_QUERY_PARAM);
  url.searchParams.delete('time');
  url.searchParams.delete('training');
  url.searchParams.delete('journeyAttempt');
  if (returnToJourney) {
    url.searchParams.set('entry', 'journey');
    if (journeyAttempt?.status === 'COMPLETED') url.searchParams.set('journeyReceipt', journeyAttemptId);
  }
  missionObjectiveGuidance?.dispose();
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

async function retryJourneyMission(): Promise<void> {
  if (!journeyMode || !journeyAttempt || journeyAttempt.status === 'COMPLETED') return;
  const retryButton = journeyResultElement.querySelector<HTMLButtonElement>('[data-journey-primary]')!;
  retryButton.disabled = true;
  try {
    const response = await apiFetch(apiUrl(`/api/journey/dallas/${journeyAttempt.missionId === journeyDallas07.id ? 'mission-07' : journeyAttempt.missionId === journeyDallas06.id ? 'mission-06' : journeyAttempt.missionId === journeyDallas05.id ? 'mission-05' : journeyAttempt.missionId === journeyDallas04.id ? 'mission-04' : journeyAttempt.missionId === journeyDallas03.id ? 'mission-03' : journeyAttempt.missionId === 'journey-dallas-02' ? 'mission-02' : 'mission-01'}/launch`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) throw new Error('Retry was not authorized');
    const result = await response.json() as { attempt?: { attemptId?: string } };
    if (!result.attempt?.attemptId) throw new Error('Retry attempt was missing');
    journeyAttemptId = result.attempt.attemptId;
    championshipLandingIntentPending = undefined;
    const url = new URL(window.location.href);
    url.searchParams.set('journeyAttempt', journeyAttemptId);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    journeyGates?.setProgress(0, journeyAttempt.missionId === journeyDallas01.id || journeyAttempt.missionId === journeyDallas03.id || journeyAttempt.missionId === journeyDallas05.id || journeyAttempt.missionId === journeyDallas06.id || journeyAttempt.missionId === journeyDallas07.id);
    missionObjective = null;
    missionObjectiveGuidance?.setObjective(null);
    journeyGateClearedUntil = 0;
    championshipLandingNoticeUntil = 0;
    precisionSharpTurnUntil = 0;
    precisionTurnSide = null;
    elevatorDepartureTurnSide = null;
    elevatorDepartureAttemptId = null;
    journeyTooHighUntil = 0;
    journeyAttempt = null;
    applyMissionFocus(null);
    journeyResultElement.classList.add('hidden');
    restartGame(false);
    await replaceRealtimeSocket('Journey retry');
    updateJourneyHud();
  } catch {
    showProgressMessage('MISSION RETRY UNAVAILABLE · CHECK CONNECTION');
  } finally {
    retryButton.disabled = false;
  }
}
window.addEventListener('airport-chaos-city-exit', (event) => {
  const destination = (event as CustomEvent<{ cityId: CityId; timePreset: 'day' | 'dusk';intercity?:boolean;practiceSuggestion?:boolean }>).detail;
  const activeMission = profileActiveMissionAttempt(serverProfile);
  const confirmationRequired = !destination.intercity && (Boolean(activeMission) || !destination.practiceSuggestion);
  if (confirmationRequired&&!window.confirm(activeMission ? 'Change city? Your active mission will end.' : 'Leave this flight and change city?')) return;
  if (activeMission && connectionReady()) socket.send(JSON.stringify({
    type: 'missionAbandon', missionCityId: profileActiveMissionCity(serverProfile), expectedAttemptId: activeMission.attemptId,
  }));
  // Cities is an explicit route transition, never a Garage action. Close any
  // independent overlay first because the Garage is shared with the start UI.
  aircraftGarage.close();
  pilotMenu.close();
  cinematicDirector.dispose();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  skyChallenges?.dispose();
  ambientTraffic?.dispose();
  navigationBeacons.dispose(scene);
  adPlacementManager.dispose(scene);
  cityWorld.disposeWorldStreaming?.();
  socket?.close();
  const url = new URL(window.location.href);
  url.searchParams.set(CITY_QUERY_PARAM, destination.cityId);
  url.searchParams.set('time', destination.timePreset);
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
});

function sendLocalState(): void {
  if (!localPlayerId || !connectionReady()) return;
  flushProfileRewards();
  socket.send(
    JSON.stringify({
      type: 'state',
      position: { x: airplane.position.x, y: airplane.position.y, z: airplane.position.z },
      rotation: { x: airplane.rotation.x, y: airplane.rotation.y, z: airplane.rotation.z },
      aircraftType,
      cityId,
      boostActive,
    }),
  );
  const pending=tutorialLandingIntentPending;
  const now=performance.now();
  if(pending&&guidedTutorialActive&&guidedTutorialStep==='landing'&&onGround&&!crashed&&
    pending.attempts<4&&now-pending.lastSentAt>=150&&sendLandingIntent(pending.airport,pending.quality)){
    pending.attempts+=1;pending.lastSentAt=now;
  }
  const championshipPending = championshipLandingIntentPending;
  if (championshipPending && journeyAttempt?.attemptId === championshipPending.attemptId &&
    journeyAttempt.phase === 'LANDING' && onGround && !crashed && championshipPending.attempts < 6 &&
    now - championshipPending.lastSentAt >= 150 && sendLandingIntent(championshipPending.airport, championshipPending.quality)) {
    championshipPending.attempts += 1;
    championshipPending.lastSentAt = now;
  }
}

function sendPlayerUpdate(): void {
  if (!localPlayerId || !connectionReady()) return;
  socket.send(JSON.stringify({ type: 'player', displayName }));
}

function createClientShotId(): string {
  clientShotSequence += 1;
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${localPlayerId ?? 'local'}-${performance.now().toFixed(2)}-${clientShotSequence}`;
}

function sendFireIntent(): boolean {
  if (!localPlayerId || localLifeState !== 'alive' || !connectionReady()) return false;
  updateCombatTarget(0);
  getCurrentMuzzleTransform(projectileOrigin, projectileDirection);
  projectileDirection.set(visualAim.x, visualAim.y, -1).normalize().applyQuaternion(muzzleQuaternion);
  const targetId = selectedCombatTarget?.locked ? selectedCombatTarget.remote.playerId : undefined;
  const clientShotId = createClientShotId();
  if (combatQaElement) combatQaDetail = `shot: ${targetId ? `assisted → ${targetId.slice(0, 8)}` : 'ballistic'}`;
  try {
    socket.send(JSON.stringify({
      type: 'fire', targetId, clientShotId,
      aimSample: { from: previousAimId, to: serverAimId, blend: visualAimBlend },
      transform: {
        position: { x: airplane.position.x, y: airplane.position.y, z: airplane.position.z },
        rotation: { x: airplane.rotation.x, y: airplane.rotation.y, z: airplane.rotation.z },
        aircraftType,
      },
    }));
  } catch {
    return false;
  }
  spawnMuzzleFeedback(projectileOrigin, projectileDirection, clientShotId, targetId);
  playFireSound();
  return true;
}

function sendRespawn(): void {
  if (!localPlayerId || !connectionReady()) return;
  socket.send(JSON.stringify({ type: 'respawn' }));
}

function bindSocketEvents(boundSocket: WebSocket): void {
const welcomeTimeout = window.setTimeout(() => {
  if (boundSocket !== socket || protocolBlocked || realtimeStopped || realtimePaused || !networkOnline) return;
  protocolReady = false;
  profileHydrated = false;
  setConnectionWarning(true);
  void replaceRealtimeSocket('Realtime handshake timed out');
}, REALTIME_WELCOME_TIMEOUT_MS);

boundSocket.addEventListener('open', () => {
  if (stabilityQaMode) {
    stabilityQaSocketOpens += 1;
    if (boundSocket === socket) stabilityQaSocketState = boundSocket.readyState;
  }
  /* Welcome packet completes protocol verification. */
});

boundSocket.addEventListener('message', (event) => {
  if (boundSocket !== socket) return;
  let message: ServerMessage;
  try {
    message = JSON.parse(event.data) as ServerMessage;
  } catch {
    blockProtocolConnection('Server sent invalid data — restart server and reload');
    return;
  }
  if (message.type === 'protocolMismatch') {
    blockProtocolConnection(`Version mismatch (server v${message.expectedProtocolVersion}) — reload/restart server`);
    return;
  }
  if (message.type === 'journeyUnavailable') {
    applyMissionFocus(null);
    journeyGates?.setProgress(0, false);
    missionObjective = null;
    missionObjectiveGuidance?.setObjective(null);
    showProgressMessage(message.reason);
    return;
  }
  if (message.type === 'journeyGateTooHigh') {
    if (journeyAttempt?.missionId !== journeyDallas03.id || message.gateIndex !== journeyAttempt.gateIndex) return;
    journeyTooHighGate = message.gateIndex;
    journeyTooHighUntil = Date.now() + 2_500;
    updateJourneyHud();
    return;
  }
  if (message.type === 'journeyAttempt') {
    if (!journeyMode || message.attempt.attemptId !== journeyAttemptId) return;
    const previousAttempt = journeyAttempt;
    const previousGate = journeyAttempt?.gateIndex ?? 0;
    const previousTargetId = journeyAttempt?.targetId;
    const previousHealth = journeyAttempt?.targetHealth;
    journeyAttempt = message.attempt;
    if (message.attempt.status === 'COMPLETED' || message.attempt.status === 'FAILED' || message.attempt.status === 'ABANDONED' ||
      championshipLandingIntentPending?.attemptId !== message.attempt.attemptId) championshipLandingIntentPending = undefined;
    applyMissionFocus(journeyAttempt);
    if (message.attempt.missionId === journeyDallas04.id && previousAttempt?.status === 'APPROACH' && message.attempt.status === 'RACING') {
      hapticsManager.emit('confirmation', `${message.attempt.attemptId}:captured`);
      showProgressMessage('WHITE ROCK CAPTURED · HOLD FOR 30 SECONDS');
    }
    if (message.attempt.missionId === journeyDallas01.id || message.attempt.missionId === journeyDallas03.id || message.attempt.missionId === journeyDallas05.id || message.attempt.missionId === journeyDallas06.id || message.attempt.missionId === journeyDallas07.id) {
      if (journeyGateMissionId !== message.attempt.missionId) {
        journeyGates?.dispose();
        journeyGates = new JourneyGateSystem(scene, getTerrainHeight,
          message.attempt.missionId === journeyDallas07.id ? journeyDallas07 : message.attempt.missionId === journeyDallas06.id ? journeyDallas06 : message.attempt.missionId === journeyDallas05.id ? journeyDallas05 : message.attempt.missionId === journeyDallas03.id ? journeyDallas03 : journeyDallas01);
        journeyGateMissionId = message.attempt.missionId;
      }
    } else if (journeyGates) {
      journeyGates.dispose();
      journeyGates = undefined;
      journeyGateMissionId = '';
    }
    emitConfirmedJourneyFeedback(hapticsManager, previousAttempt, message.attempt);
    journeyServerTimeOffset = message.serverNow - Date.now();
    journeyGates?.setProgress(message.attempt.gateIndex, (message.attempt.missionId === journeyDallas01.id || message.attempt.missionId === journeyDallas03.id || message.attempt.missionId === journeyDallas05.id || message.attempt.missionId === journeyDallas06.id || message.attempt.missionId === journeyDallas07.id) &&
      (message.attempt.status === 'APPROACH' || message.attempt.status === 'RACING') && message.attempt.phase !== 'LANDING');
    missionObjective = message.attempt.missionId === journeyDallas01.id
      ? confirmedGateObjective(message.attempt, journeyDallas01.gates, getTerrainHeight)
      : message.attempt.missionId === journeyDallas03.id
        ? confirmedGateObjective(message.attempt, journeyDallas03.gates, getTerrainHeight)
        : message.attempt.missionId === journeyDallas05.id
          ? confirmedGateObjective(message.attempt, journeyDallas05.gates, getTerrainHeight)
          : message.attempt.missionId === journeyDallas06.id
            ? championshipLandingObjective(message.attempt) ?? confirmedGateObjective(message.attempt, journeyDallas06.gates, getTerrainHeight)
            : message.attempt.missionId === journeyDallas07.id
              ? confirmedGateObjective(message.attempt, journeyDallas07.gates, getTerrainHeight) : null;
    missionObjectiveGuidance?.setObjective(missionObjective);
    if (message.attempt.missionId === journeyDallas04.id) syncTerritoryObjective();
    if ((message.attempt.missionId === journeyDallas01.id || message.attempt.missionId === journeyDallas03.id || message.attempt.missionId === journeyDallas05.id || message.attempt.missionId === journeyDallas06.id || message.attempt.missionId === journeyDallas07.id) &&
      previousAttempt?.attemptId === message.attempt.attemptId &&
      message.attempt.gateIndex > previousGate && message.attempt.gateIndex < (message.attempt.missionId === journeyDallas06.id ? 6 : 4)) journeyGateClearedUntil = performance.now() + 1_400;
    if (message.attempt.missionId === journeyDallas05.id && previousAttempt?.attemptId === message.attempt.attemptId &&
      previousGate < 3 && message.attempt.gateIndex === 3) precisionSharpTurnUntil = performance.now() + 2_400;
    if (previousAttempt?.attemptId !== message.attempt.attemptId || message.attempt.gateIndex !== 3) precisionTurnSide = null;
    if (message.attempt.gateIndex !== previousGate) journeyTooHighUntil = 0;
    if (message.attempt.missionId === 'journey-dallas-02' && message.attempt.targetId !== previousTargetId && message.attempt.targetId)
      showProgressMessage(previousTargetId ? 'NEW HUNTER TARGET ACQUIRED' : 'HUNTER TARGET ACQUIRED');
    if (message.attempt.missionId === 'journey-dallas-02' && journeyAttempt.status === 'RACING' &&
      previousTargetId === message.attempt.targetId && previousHealth !== undefined &&
      message.attempt.targetHealth > 0 && message.attempt.targetHealth < previousHealth) {
      showProgressMessage(`HUNTER HIT · ${message.attempt.targetHealth}/200 HP`);
    }
    if (message.attempt.gateIndex > previousGate) {
      playCheckpointSound();
      if (message.attempt.missionId === journeyDallas06.id && message.attempt.gateIndex === 6)
        championshipLandingNoticeUntil = performance.now() + 2_400;
      else showProgressMessage(`GATE ${message.attempt.gateIndex}/${message.attempt.missionId === journeyDallas06.id ? 6 : 4} CLEARED`);
    }
    updateJourneyHud();
    if (message.attempt.missionId === journeyDallas04.id) refreshTerritoryBorders();
    if (message.attempt.status === 'COMPLETED' || message.attempt.status === 'FAILED' || message.attempt.status === 'ABANDONED') {
      missionObjectiveGuidance?.hide();
      showJourneyResult(message.attempt);
    }
    return;
  }
  if (message.type === 'welcome') {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      blockProtocolConnection('Version mismatch — reload page and restart server');
      return;
    }
    if (!isNetworkProfile(message.profile) || !Number.isSafeInteger(message.selectionRevision) || message.selectionRevision < 0) {
      blockProtocolConnection('Server profile is incompatible — restart server and reload');
      return;
    }
    const shouldBeginFlightLaunch = !flightLaunchWelcomeHandled && !trainingRequested && !message.tutorialMode;
    flightLaunchWelcomeHandled = true;
    window.clearTimeout(welcomeTimeout);
    protocolReady = true;
    reconnectAttempt = 0;
    clearReconnectTimer();
    setConnectionWarning(false);
    pendingEquip = undefined;
    selectionRevision = message.selectionRevision;
    localPlayerId = message.playerId;
    for (const id of repairHeartSprites.keys()) setHeartCooldown(id, 0);
    for (const cooldown of message.repairCooldowns ?? []) setHeartCooldown(cooldown.id, cooldown.remainingMs);
    fireCooldown = 0;
    applyLocalHull(message.health, message.maxHealth, message.activeAircraftType);
    localLifeState = networkLifeState(message.lifeState);
    updateHealthDisplay();
    if (cityId === 'milwaukee') {
      spawnPosition.set(message.spawnPosition.x, message.spawnPosition.y, message.spawnPosition.z);
    } else {
      const airport = journeyMode && message.spawnAirportId
        ? airports.find((candidate) => candidate.id === message.spawnAirportId) ?? spawnAirport : spawnAirport;
      const slotOffset = airport.spawnOffset + message.spawnPosition.z - 45;
      spawnPosition.set(
        airport.x + Math.sin(airport.heading) * slotOffset,
        message.spawnPosition.y,
        airport.z + Math.cos(airport.heading) * slotOffset,
      );
      spawnHeading = airport.heading;
    }
    spawnPosition.y = groundPlaneY(spawnPosition.x, spawnPosition.z);
    airplane.position.copy(spawnPosition);
    altitudeElement.textContent = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toLocaleString();
    if (matchMedia('(pointer: coarse)').matches || innerWidth <= 900) socket.send(JSON.stringify({ type:'analyticsEvent', event:'mobile_layout_used', mode:innerWidth <= 600 ? 'narrow' : 'wide' }));
    serverProfile = message.profile;
    applyTutorialStepStates(message.tutorialSteps);

    activeMissionAttemptId = profileActiveMissionAttempt(message.profile)?.attemptId;
    refreshTerritoryBorders();
    updateMissionHud();
    profileHydrated = true;
    if (message.profile.legacyImportPending && !legacyImportSent) {
      legacyImportSent = true;
      socket.send(JSON.stringify({
        type: 'profileImport',
        legacy: {
          credits: persistedPlayer.credits,
          score: persistedPlayer.bestScore,
          selectedAircraft: persistedPlayer.selectedAircraft,
          pilotName: persistedPlayer.displayName,
          totalDistance: persistedPlayer.totalDistance,
          successfulLandings: persistedPlayer.successfulLandings,
          discoveries: persistedPlayer.discoveries,
        },
      }));
    } else {
      applyServerProfile(message.profile);
    }
    if(message.tutorialMode&&cityRules.tutorialEnabled){cancelPendingFlightLaunch();applyServerSelectedAircraft(message.activeAircraftType,false,false);setGuidedTutorial(true);}
    applySocialState(message.social);
    reconcileRemotePlayers(message.players);
    for (const player of message.players) updateRemotePlayer(player);
    for (const heat of message.heatStates ?? []) applyHeatState(heat);
    applyTerritoryState(message.territories ?? []);
    weeklyLeaderboards = message.weeklyLeaderboards ?? [];
    applyCityEvent(message.event);
    flushProfileRewards();
    if (shouldBeginFlightLaunch) beginFlightLaunchCinematic();
    else { cancelPendingFlightLaunch(); offerDallasPracticeSuggestion(serverProfile); }
    sendLocalState();
    sendPlayerUpdate();
  } else if (!protocolReady || !profileHydrated) {
    // A profile/state message from an earlier connection generation must not
    // hydrate partial client state before a versioned welcome arrives.
    return;
  } else if (message.type === 'takeoffConfirmed') {
    if(!guidedTutorialActive&&!trainingRequested) {
      cinematicDirector.requestTakeoff(`${message.airportId ?? 'runway'}:${message.confirmedAt}`);
    }
  } else if(message.type==='tutorialStepResult'){
    if(guidedTutorialActive)applyTutorialStepResult(message);
  } else if(message.type==='tutorialLandingApproach'){
    applyTutorialLandingApproach(message);
  } else if(message.type==='tutorialRunReset'){
    tutorialRunResetPending=false;window.clearTimeout(tutorialCrashResetTimer);applyTutorialStepStates(message.steps);
    tutorialNavigationCoach=undefined;tutorialNavigationCoachSeen=false;syncTutorialNavigationMap();
    guidedTutorialStep=message.nextStep;tutorialCompletionPending=false;tutorialIntroPending=false;tutorialIntroShown=true;tutorialStepCompleting=false;tutorialStepRequestPending=false;tutorialStepRequestStep=undefined;tutorialCompletionPresentationStep=undefined;tutorialStepReconciler.reset();
    tutorialIntroPanel.hidden=true;tutorialCompletionActions.hidden=true;trainingModeLabel.hidden=true;tutorialTargetRequested=false;tutorialTargetRequestedAt=Number.NEGATIVE_INFINITY;tutorialTargetId=undefined;resetTutorialLessonMetrics();restartGame(false);
    gameplayFeedback.push({type:'mission',primaryText:'TRAINING RESTARTED',secondaryText:'Let’s try that again.',intensity:'medium'});renderTutorialPanel();
  } else if(message.type==='tutorialTarget'){
    tutorialTargetId=message.targetId;tutorialTargetRequested=true;
  } else if (message.type === 'state') {
    updateRemotePlayer(message);
  } else if (message.type === 'remove') {
    if(message.playerId===tutorialTargetId){tutorialTargetId=undefined;tutorialTargetRequested=false;tutorialTargetRequestedAt=Number.NEGATIVE_INFINITY;}
    removeRemotePlayer(message.playerId);
    cityHumanRoster.delete(message.playerId);
    humanRadarTracks.delete(message.playerId);
    playersPanel.update([...cityHumanRoster.values()], localPlayerId, ownedTerritoriesForPlayer);
  } else if (message.type === 'leaderboard') {
    if (message.cityId === cityId) updateLeaderboard(message.players);
  } else if (message.type === 'weeklyLeaderboards') {
    weeklyLeaderboards = message.weeklyLeaderboards;
  } else if (message.type === 'missionState') {
    if (message.cityId === cityId) {
      const previous = serverProfile.missions[cityId]?.active;
      const next = message.state.active;
      const required = previous ? missionForCity(cityId, previous.missionId) : undefined;
      if (previous && previous.attemptId === next?.attemptId && previous.holdStartedAt && previous.progress > 0 && next.progress === 0 && !next.holdStartedAt &&
        required && (next.ownedTerritoryIds?.length ?? 0) < missionRequirements(required, next).length) {
        showProgressMessage('TERRITORY LOST · HOLD RESET TO 00:00');
      }
      serverProfile.missions[cityId] = message.state;
      activeMissionAttemptId = profileActiveMissionAttempt(serverProfile)?.attemptId;
      refreshTerritoryBorders();
      updateMissionHud();
    }
  } else if (message.type === 'missionResult') {
    if (message.ok && message.attemptId) {
      activeMissionAttemptId = message.attemptId;
      completedMissionUntil = 0;
      if (message.missionId === 'precision-landing') lastLandingResult = undefined;
    }
    showProgressMessage(message.ok ? 'MISSION ACCEPTED' : (message.reason ?? 'MISSION UNAVAILABLE'));
    if (message.ok && pilotMenu.isOpen()) pilotMenu.close();
    else if (pilotMenu.isOpen()) renderPilotMenu();
  } else if (message.type === 'missionCompleted') {
    if (activeMissionAttemptId) hapticsManager.emit('missionSuccess', activeMissionAttemptId);
    activeMissionAttemptId = undefined;
    completedMissionUntil = Date.now() + 12_000;
    score += message.score;
    recordBestScore(score);
    const missionName = missionForCity(cityId, message.missionId)?.displayName ?? 'MISSION';
    cinematicDirector.requestMissionComplete(
      `${message.missionId}:${completedMissionUntil}`,
      cityRules.practiceMode ? 'PRACTICE COMPLETE' : 'MISSION COMPLETE',
      cityRules.practiceMode ? `${missionName.toUpperCase()} · NO REWARDS` : `${missionName.toUpperCase()} · ${message.score.toLocaleString()} SCORE`,
    );
    updateMissionHud();
    sendPlayerUpdate();
  } else if (message.type === 'missionFailed') {
    if (activeMissionAttemptId) hapticsManager.emit('failure', activeMissionAttemptId);
    activeMissionAttemptId = undefined;
    completedMissionUntil = 0;
    showProgressMessage(`MISSION FAILED · ${missionForCity(cityId, message.missionId)?.displayName ?? 'MISSION'} · ${message.reason}`);
    updateMissionHud();
  } else if (message.type === 'firehawkPromotionReady') {
    if (!firehawkPromotionSessionShown && missionForCity(cityId, message.missionId)) {
      pendingFirehawkPromotionMission = message.missionId;
      requestFirehawkPromotionWhenSafe();
    }
  } else if (message.type === 'firehawkPromotionOffer') {
    if (missionForCity(cityId, message.missionId)) void showFirehawkPromotion(message);
  } else if (message.type === 'eventState') {
    applyCityEvent(message.event);
  } else if (message.type === 'eventClear') {
    applyCityEvent(undefined);
  } else if (message.type === 'eventAnnouncement') {
    if (!missionFocus) {
      showProgressMessage(cityRules.practiceMode ? `${message.name ?? 'SKY EVENT'} · PRACTICE — NO REWARDS` : `${message.name ?? 'SKY EVENT'}`);
      gameplayFeedback.push({ type: 'chaos-moment', primaryText: 'CHAOS MOMENT', secondaryText: message.name ?? 'SKY EVENT', intensity: 'major' });
    }
  } else if (message.type === 'eventReward') {
    score += message.score;
    queueRewardFeedback(0, message.score);
    recordBestScore(score);
    showProgressMessage(message.reason);
    flightRecap.eventResults.push(message.reason);
    sendPlayerUpdate();
  } else if (message.type === 'eventProgress') {
    if (!missionFocus) showProgressMessage(message.message);
    if (message.target) setActivityWaypoint(message.target.x, message.target.z, 'CARGO DELIVERY');
  } else if (message.type === 'socialState') {
    applySocialState(message);
  } else if (message.type === 'formationState') {
    if (localPlayerId && message.memberIds.includes(localPlayerId)) {
      formationMembers.clear();
      if (message.active) for (const playerId of message.memberIds) formationMembers.add(playerId);
    }
    updateSocialHud();
    if (message.active && localPlayerId && message.memberIds.includes(localPlayerId)) contextualHints.trigger('formation');
  } else if (message.type === 'socialReward') {
    score += message.score;
    queueRewardFeedback(0, message.score);
    recordBestScore(score);
    showProgressMessage(message.reason);
    sendPlayerUpdate();
  } else if (message.type === 'chaosState') {
    score += message.score;
    queueRewardFeedback(0, message.score);
    recordBestScore(score);
    showProgressMessage(`${message.action.toUpperCase()} · CHAOS x${message.multiplier}`);
  } else if (message.type === 'chaosReward') {
    showProgressMessage(message.reason);
  } else if (message.type === 'pvpChallengeInvite') {
    if(guidedTutorialActive){socket.send(JSON.stringify({type:'pvpChallengeResponse',challengeId:message.challenge.id,accept:false}));return;}
    const accepted = window.confirm(`${message.challenge.mode === 'dogfight' ? 'DOGFIGHT' : 'AIRPORT SPRINT'} CHALLENGE\nAccept?`);
    socket.send(JSON.stringify({ type: 'pvpChallengeResponse', challengeId: message.challenge.id, accept: accepted }));
  } else if (message.type === 'pvpChallengeState') {
    activePvpChallenge = message.challenge;
    showProgressMessage(`${message.challenge.mode === 'dogfight' ? 'DOGFIGHT' : 'AIRPORT SPRINT'} · ${message.challenge.status.toUpperCase()}`);
  } else if (message.type === 'pvpChallengeCancelled') {
    activePvpChallenge = null;
    showProgressMessage('CHALLENGE CANCELLED');
  } else if (message.type === 'pvpChallengeResult') {
    activePvpChallenge = null;
    showProgressMessage(message.winnerId === localPlayerId ? `CHALLENGE WON${message.rewarded ? '' : ' · PRACTICE'}` : 'CHALLENGE COMPLETE');
  } else if (message.type === 'profile') {
    if (!applyServerProfile(message.profile, message.rewardId, message.selectionRevision, message.equipRequestId, message.creditReason, message.preserveActiveAircraft === true, message.serverReset === true, message.creditReceipt)) {
      blockProtocolConnection('Server profile is incompatible — restart server and reload');
    }
  } else if (message.type === 'equipRejected') {
    if (pendingEquip?.id === message.equipRequestId) {
      pendingEquip = undefined;
      updatePendingAircraftEquip();
      showProgressMessage(message.reason);
    }
  } else if (message.type === 'aircraftPurchaseResult') {
    aircraftGarage.showActionResult(message.ok ? 'AIRCRAFT PURCHASED — NOW OWNED' : (message.reason ?? 'PURCHASE FAILED'));
    if (message.ok) { audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `aircraft:${message.aircraftType ?? message.purchaseRequestId}`); }
  } else if (message.type === 'testerCodeResult') {
    aircraftGarage.showActionResult(message.reason);
    if (message.ok) audioManager.playReward();
  } else if (message.type === 'fighterTrialResult') {
    aircraftGarage.showActionResult(message.reason ?? (message.ok ? 'FIREHAWK TEST FLIGHT STARTED' : 'TEST FLIGHT UNAVAILABLE'));
    if (message.ok) aircraftGarage.close();
  } else if (message.type === 'projectileSpawn') {
    addProjectile(message);
  } else if (message.type === 'projectileStates') {
    updateClientProjectiles(message);
  } else if (message.type === 'assistedShot') {
    addAssistedShot(message);
    if (combatQaElement && message.ownerId === localPlayerId) combatQaDetail = `shot: assisted → ${message.targetId.slice(0, 8)} · HIT`;
  } else if (message.type === 'lockState') {
    if (!Number.isFinite(message.aimX) || !Number.isFinite(message.aimY) || !Number.isSafeInteger(message.aimId)) return;
    previousServerAim.x = serverAim.x;
    previousServerAim.y = serverAim.y;
    previousAimId = serverAimId || message.aimId;
    if (!serverAimId) { previousServerAim.x = message.aimX; previousServerAim.y = message.aimY; }
    serverAimId = message.aimId;
    serverAim.x = message.aimX;
    serverAim.y = message.aimY;
    serverAimTargetId = message.candidateId ?? null;
    serverAimReceivedAt = performance.now();
    serverLockedTargetId = message.targetId ?? null;
  } else if (message.type === 'combatThreat') {
    applyCombatThreat(message.attackerId, message.locked === true);
  } else if (message.type === 'incomingFire') {
    applyIncomingFire(message.attackerId);
  } else if (message.type === 'heatState') {
    applyHeatState(message);
  } else if (message.type === 'territoryState') {
    if (message.cityId === cityId) applyTerritoryState(message.territories);
    updateMissionHud();
  } else if (message.type === 'territoryNotice') {
    if (missionFocus) return;
    const territory = territoryDefinition(message.territoryId);
    if (territory && (message.kind === 'enter' || message.kind === 'exit')) pulseTerritoryBoundary(territory.id);
    if (message.kind === 'enter' && territory?.id === journeyDallas04.territoryId && journeyAttempt?.missionId === journeyDallas04.id &&
      (journeyAttempt.status === 'APPROACH' || journeyAttempt.status === 'RACING'))
      hapticsManager.emit('selection', `${journeyAttempt.attemptId}:white-rock-entry`);
    if (territory && message.kind === 'underAttack') {
      gameplayFeedback.push({ type:'territory-contest', primaryText:'TERRITORY CONTESTED', secondaryText:territory.displayName.toUpperCase(), intensity:'medium' });
      territoryDefenseAlertId = territory.id;
      territoryDefenseTextElement.textContent = `⚠ ${territory.displayName.toUpperCase()} UNDER ATTACK${message.attackerName ? ` · ${message.attackerName}` : ''}`;
      territoryDefenseAlertElement.classList.remove('hidden');
    } else if (territory) {
      if (message.kind === 'captured') gameplayFeedback.push({ type: 'territory', primaryText: 'TERRITORY CAPTURED', secondaryText: territory.displayName.toUpperCase(), intensity: 'medium' });
      if (message.kind === 'captured') flightRecap.territories += 1;
      showProgressMessage(message.kind === 'captured'
      ? `${territory.displayName.toUpperCase()} CAPTURED`
      : message.kind === 'defenderInbound' ? `${territory.displayName.toUpperCase()} · DEFENDER INBOUND`
      : message.kind === 'exit' ? `LEFT ${territory.displayName.toUpperCase()}`
      : `ENTERED ${territory.displayName.toUpperCase()}`);
    }
  } else if (message.type === 'territoryReward') {
    const territory = territoryDefinition(message.territoryId);
    if (!missionFocus) showProgressMessage(`${territory?.displayName.toUpperCase() ?? 'TERRITORY'} ${message.kind === 'capture' ? 'CAPTURED' : 'HELD'}`);
  } else if (message.type === 'objectiveComplete') {
    if (!missionFocus) showProgressMessage(`OBJECTIVE COMPLETE: ${message.label.toUpperCase()}`);
  } else if (message.type === 'objectiveProgress') {
    if (!missionFocus) showProgressMessage(`DAILY: ${message.label.toUpperCase()} ${message.progress}/${message.target}`);
  } else if (message.type === 'masteryLevel') {
    if (message.cityId === cityId) showProgressMessage(`${cityId.toUpperCase()} CITY LEVEL ${message.level}`);
  } else if (message.type === 'landingScored') {
    if (journeyAttempt?.missionId === journeyDallas06.id) championshipLandingIntentPending = undefined;
    lastLandingResult = { airportId: message.airportId, quality: message.quality, grade: message.grade, at: Date.now() };
    if (journeyAttempt?.missionId === journeyDallas06.id) return;
    if (visibleRecap) visibleRecap.landing = `${message.grade} LANDING`;
    updateMissionHud();
    // Tutorial completion arrives separately after the server verifies its full evidence chain.
    const grade = `${message.grade} LANDING`;
    const perfectLanding = isPerfectLandingGrade(message.grade);
    if (!perfectLanding || guidedTutorialActive) {
      gameplayFeedback.push({ type: 'landing', primaryText: grade, secondaryText: `${message.quality} / 1,000`, intensity: perfectLanding ? 'major' : 'medium' });
    } else {
      const rewardText = message.credits > 0
        ? `${message.score.toLocaleString()} / 1,000 · REWARD APPLIED`
        : `${message.score.toLocaleString()} / 1,000 · NO REWARDS`;
      cinematicDirector.requestPerfectLanding(`${message.airportId}:${message.quality}:${lastLandingResult.at}`, rewardText);
    }
    queueAtcCallout(`landing-${message.grade}`, message.grade === 'ROUGH' ? 'TOWER: ROUGH LANDING' : 'TOWER: LANDING CONFIRMED', message.grade === 'PERFECT' || message.grade === 'LEGENDARY' ? 'SMOOTH TOUCHDOWN' : undefined);
    if (visibleRecap && (!perfectLanding || guidedTutorialActive)) showFlightRecap(visibleRecap.title, grade, false);
  } else if (message.type === 'pilotLevelUp') {
    gameplayFeedback.push({ type: 'pilot-level', primaryText: `PILOT LEVEL ${message.level}`, secondaryText: message.title ? `TITLE UNLOCKED — ${message.title}` : undefined, intensity: 'major' });
    audioManager.playReward();
  } else if (message.type === 'weeklyRewardClaimed') {
    gameplayFeedback.push({ type: 'weekly', primaryText: 'WEEKLY REWARD', secondaryText: `#${message.reward.rank} · REWARD APPLIED · ${message.reward.badge}`, intensity: 'major' });
    audioManager.playReward();
    hapticsManager.emit('rewardSuccess', `weekly:${message.reward.category}:${message.reward.badge}`);
  } else if (message.type === 'cosmeticResult') {
    aircraftGarage.showActionResult(message.ok ? `${message.action.toUpperCase()} COMPLETE` : (message.reason ?? 'COSMETIC UNAVAILABLE'));
    if (message.ok && message.action === 'purchase') { audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `cosmetic:${message.cosmeticId}`); }
    else if (message.ok && message.action === 'equip') hapticsManager.emit('confirmation');
  } else if (message.type === 'cosmeticChanged') {
    const remote = remotePlayers.get(message.playerId);
    if (remote) applyEquippedLivery(remote.plane, remote.aircraftType, message.equipped);
  } else if(message.type==='intercityRouteResult'){
    if(!message.ok||!message.routeId||!message.toCityId){showProgressMessage(message.reason??'INTERCITY ROUTE UNAVAILABLE');}
    else{const route=routeDefinition(message.routeId);showProgressMessage(`DEPARTING ${cityId==='dallas'?'DALLAS':'MILWAUKEE'} · ARRIVING ${message.toCityId==='dallas'?'DALLAS':'MILWAUKEE'}`);window.setTimeout(()=>window.dispatchEvent(new CustomEvent('airport-chaos-city-exit',{detail:{cityId:message.toCityId,timePreset:'day',intercity:true}})),900);if(route)flightRecap.eventResults.push(`INTERCITY · ${route.distanceLabel}`);}
  } else if (message.type === 'challengeComplete') {
    score += message.score;
    queueRewardFeedback(0, message.score);
    recordBestScore(score);
    showProgressMessage('SKY CHALLENGE COMPLETE');
  } else if (message.type === 'projectileRemove') {
    removeClientProjectile(message.projectileId);
  } else if (message.type === 'damage') {
    spawnImpactFeedback(message.playerId);
    if (message.shooterId === localPlayerId && message.playerId !== localPlayerId) {
      if (combatQaElement) combatQaDetail = `shot: ${message.shooterId === localPlayerId ? 'assisted/ballistic' : 'remote'} · HIT`;
      showCombatMessage(`HIT +${message.damage}`, true);
      showHitMarker();
      audioManager.playHitConfirm();
    }
    if (message.playerId === localPlayerId) {
      applyLocalHull(message.health, message.maxHealth);
      if (message.health > 0) hapticsManager.emit('damage');
      updateHealthDisplay(true);
      showCombatMessage(`-${message.damage} DAMAGE`);
      showDamageFeedback();
      playTone(150, 0.13, 'sawtooth', 0.05, 80, 0, 'impacts');
    } else {
      const remote = remotePlayers.get(message.playerId);
      if (remote) {
        remote.maxHealth = message.maxHealth;
        remote.health = message.health;
        remote.lastHitAt = performance.now();
        paintRemoteHullTag(remote.hullTag, remote.health, remote.maxHealth);
      }
    }
  } else if (message.type === 'repair') {
    if (message.playerId === localPlayerId) {
      const isHeart = repairHeartSprites.has(message.sourceId);
      if (isHeart) healthRowElement.classList.add('repaired');
      applyLocalHull(message.health, message.maxHealth);
      updateHealthDisplay();
      if (isHeart) {
        setHeartCooldown(message.sourceId, message.cooldownMs ?? 60_000);
        repairFeedbackElement.classList.add('visible');
        window.clearTimeout(repairFeedbackTimer);
        repairFeedbackTimer = window.setTimeout(() => {
          repairFeedbackElement.classList.remove('visible');
          healthRowElement.classList.remove('repaired');
        }, 2_000);
      } else {
        showProgressMessage(message.full ? 'AIRPORT REPAIR COMPLETE' : 'REPAIR BEACON · PLANE LIFE RESTORED');
      }
    } else {
      const remote = remotePlayers.get(message.playerId);
      if (remote) {
        remote.maxHealth = message.maxHealth;
        remote.health = message.health;
        paintRemoteHullTag(remote.hullTag, remote.health, remote.maxHealth);
      }
    }
  } else if (message.type === 'destroyed') {
    const lastDestructionAt = recentDestructionIds.get(message.playerId) ?? -Infinity;
    if (performance.now() - lastDestructionAt < 1_500) return;
    recentDestructionIds.set(message.playerId, performance.now());
    if (recentDestructionIds.size > 32) recentDestructionIds.delete(recentDestructionIds.keys().next().value!);
    updateHumanRosterStatus(message.playerId, 'destroyed');
    const destroyedPlane = message.playerId === localPlayerId
      ? airplane
      : remotePlayers.get(message.playerId)?.plane;
    const destroyedType = message.aircraftType ?? (message.playerId === localPlayerId ? aircraftType : remotePlayers.get(message.playerId)?.aircraftType);
    if (destroyedType) {
      const sourcePosition = message.position && [message.position.x, message.position.y, message.position.z].every(Number.isFinite)
        ? message.position
        : destroyedPlane?.position;
      if (sourcePosition) {
        destructionPosition.set(sourcePosition.x, sourcePosition.y, sourcePosition.z);
        createDestructionEffect(destructionPosition, destroyedType);
        if (message.playerId !== localPlayerId && destructionPosition.distanceTo(airplane.position) < 2_500) playDestructionSound();
      }
    }
    if (message.playerId === localPlayerId) {
      if (!journeyMode) hapticsManager.emit('failure', `crash:${message.playerId}:${lastDestructionAt}`);
      localLifeState = 'destroyed';
      health = 0;
      updateHealthDisplay(true);
      endRun(message.cause === 'collision' ? 'MID-AIR COLLISION' : 'DESTROYED',
        message.cause === 'collision' ? 'MID-AIR COLLISION' : killNotice(message, localPlayerId));
    } else {
      const remote = remotePlayers.get(message.playerId);
      if (remote) {
        remote.lifeState = 'destroyed';
        remote.nearMissActive = false;
        remote.plane.visible = false;
        remote.identityTag.visible = false;
        remote.hullTag.visible = false;
        remote.targetBrackets.visible = false;
        remote.playerProxy.visible = false;
        if (selectedCombatTarget?.remote === remote) clearCombatTarget();
      }
    }
    if (message.killerId === localPlayerId && message.cause !== 'collision') {
      // This reward cue is driven only by the server-confirmed destruction
      // event, after duplicate destruction messages have been rejected.
      if (!(journeyMode && journeyAttempt?.status === 'COMPLETED' && journeyAttempt.targetId === message.playerId)) {
        hapticsManager.emit('destruction', message.playerId);
      }
      audioManager.playDestroyConfirm();
      flightRecap.kills += 1;
      gameplayFeedback.push({ type: 'combat', primaryText: killNotice(message, localPlayerId), intensity: 'medium' });
      score = Math.max(score, message.killerScore);
      recordBestScore(score);
      handleContractKill();
      showCombatMessage(killNotice(message, localPlayerId), true);
    }
  } else if (message.type === 'respawn') {
    const lifeState = networkLifeState(message.lifeState);
    updateHumanRosterStatus(message.playerId, 'respawning');
    if (message.playerId === localPlayerId) {
      cinematicDirector.resetFlight();
      if (message.spawnPosition && [message.spawnPosition.x, message.spawnPosition.y, message.spawnPosition.z, message.spawnHeading].every(Number.isFinite)) {
        spawnPosition.set(message.spawnPosition.x, message.spawnPosition.y, message.spawnPosition.z);
        spawnPosition.y = groundPlaneY(spawnPosition.x, spawnPosition.z);
        spawnHeading = message.spawnHeading!;
        airplane.position.copy(spawnPosition);
        airplane.rotation.set(0, spawnHeading, 0, 'YXZ');
        heading = spawnHeading;
        sendLocalState();
      }
      localLifeState = lifeState;
      fireCooldown = 0;
      applyLocalHull(message.health, message.maxHealth);
      updateHealthDisplay();
    } else {
      const remote = remotePlayers.get(message.playerId);
      if (remote) {
        remote.lifeState = lifeState;
        remote.nearMissActive = false;
        remote.plane.visible = lifeState === 'alive';
        remote.identityTag.visible = lifeState === 'alive';
        remote.hullTag.visible = false;
        remote.targetBrackets.visible = false;
        remote.playerProxy.visible = lifeState === 'alive';
      }
    }
  } else if (message.type === 'playerState') {
    if (message.playerId === localPlayerId) {
      localLifeState = networkLifeState(message.lifeState);
      if (localLifeState !== 'alive') fireCooldown = 0;
      applyLocalHull(message.health, message.maxHealth);
      updateHealthDisplay();
    } else {
      // Completion carries a full authoritative transform so an absent or
      // hidden remote is recreated before it becomes targetable server-side.
      updateRemotePlayer(message);
    }
  }
});

boundSocket.addEventListener('close', (event) => {
  if (stabilityQaMode) {
    stabilityQaSocketCloses += 1;
    if (boundSocket === socket) stabilityQaSocketState = boundSocket.readyState;
  }
  window.clearTimeout(welcomeTimeout);
  if (boundSocket !== socket) return;
  if (missionFocus) {
    missionObjective = null;
    missionObjectiveGuidance?.hide();
  }
  clearCombatThreats();
  cityHumanRoster.clear();
  applyMissionFocus(null);
  humanRadarTracks.clear();
  playersPanel.update([], null);
  cityTerritoriesPanel.update(cityTerritoryEntries(), null, false);
  for (const playerId of [...remotePlayers.keys()]) removeRemotePlayer(playerId);
  pendingEquip = undefined;
  if (protocolBlocked) return;
  protocolReady = false;
  profileHydrated = false;
  if (realtimeStopped || realtimePaused) return;
  setConnectionWarning(true);
  if (event.code === 4003) {
    if (!identityTransitionInProgress) {
      clientAccount = { state: 'guest', providers: { password: false, google: false, apple: false } };
      updateAuthHudControl();
    }
    void refreshAccountStatus(true).finally(() => scheduleRealtimeReconnect(true));
    showProgressMessage(identityTransitionInProgress ? 'SWITCHING ACCOUNT…' : 'SESSION CHANGED — RECONNECTING');
    return;
  }
  if (event.code === 4001) {
    setConnectionWarning(false);
    showProgressMessage('OPENED IN ANOTHER TAB — RELOAD TO PLAY HERE');
    return;
  }
  scheduleRealtimeReconnect();
});

boundSocket.addEventListener('error', () => {
  if (boundSocket !== socket) return;
  if (protocolBlocked) return;
  if (!realtimePaused) setConnectionWarning(true);
});
}
setConnectionWarning(true);
void replaceRealtimeSocket('Initial connection');

// Same 10Hz transform stream, but not tied to requestAnimationFrame: Safari
// can suspend rendering when Chrome is foreground. Timer throttling still
// allows a current stationary transform without pretending the socket left.
const stateSendTimer = window.setInterval(sendLocalState, 100);
const accountStatusTimer = window.setInterval(() => void refreshAccountStatus(), 60_000);
void monitorConnectivity((connected) => {
  networkOnline = connected;
  if (!connected) {
    clearReconnectTimer();
    if (!document.hidden) setConnectionWarning(true);
    closeRealtimeSocket('Offline');
    return;
  }
  if (!realtimePaused) {
    refreshSessionAndReconnect();
  }
}, async () => {
  try {
    return (await apiFetch(apiUrl('/api/auth/status'), { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}).then((stop) => { stopConnectivityMonitor = stop; });
window.addEventListener('pagehide', () => {
  realtimeStopped = true;
  clearReconnectTimer();
  stopConnectivityMonitor();
  window.clearInterval(stateSendTimer);
  window.clearInterval(accountStatusTimer);
  closeRealtimeSocket('Page hidden');
});
document.addEventListener('visibilitychange', () => {
  realtimePaused = document.hidden;
  if (document.hidden) {
    clearReconnectTimer();
    closeRealtimeSocket('Backgrounded');
    return;
  }
  sendLocalState();
  if (networkOnline) {
    refreshSessionAndReconnect();
  }
});

updateCamera(1);
showActiveCheckpoint();
updateProgressHud();
updateHealthDisplay();
updatePendingAircraftEquip();
updateNavigationHud();
// The legacy Contracts UI is retired; Missions are profile-owned on the server.
savePlayerProgress(true);
animate();
