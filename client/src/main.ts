import { applyAircraftCosmetics as applyEquippedLivery } from './aircraft-cosmetics';
import * as THREE from 'three';
import { keyboardActionBindings, menuBindings, type FlightAction } from './flight-input';
import { shouldToggleDesktopControlsHelp } from './controls-help';
import { visualLanguage, identityText, targetBracketPath, playerFacingText, territoryOwnershipColors, type TerritoryAppearance } from './visual-language';
import { flightTutorial } from './tutorial';
import './style.css';
import { AdPlacementManager, attachAircraftLivery, createRingSponsor, eventSponsorFor, getAircraftLivery, resolveAdPlacement, sponsorCreative } from './ad-placement';
import { aircraftDefinitions, aircraftDisplayName, aircraftEffectAnchors, aircraftMuzzleSockets, type AircraftDefinition, type AircraftType } from './aircraft';
import { AircraftGarage } from './garage';
import { AmbientTrafficSystem } from './ambient-traffic';
import { attachAircraftAsset, preloadAircraftAssets } from './assets';
import { CITY_QUERY_PARAM, activeCityFromUrl, type CityId } from './cities';
import { entityCapabilities, type EntityType } from './entity-types';
import { updateOsmCityChunks } from './osm-city';
import { SkyChallengeSystem } from './sky-challenges';
import { StuntComboSystem, stuntGuide, type LandingQuality, type StuntFrame } from './stunt-combo';
import { DiscoverySystem } from './discoveries';
import { ContextualHintSystem, contextualHintDefinitions, type ContextualHintId } from './contextual-hints';
import { GameplayFeedbackSystem } from './gameplay-feedback';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { PilotMenu, type PilotMenuAction, type PilotMenuData } from './pilot-menu';
import { routesFromCity, routeDefinition } from '../../shared/city-registry.mjs';
import { MobileInputControls, mobileIdleBrakeRequested, pinchZoomFactor, preferredGraphicsQuality, resolvedGraphicsQuality, type GraphicsQualityMode, type MobileControlId, type MobileControlPlacement, type TouchControlsMode } from './mobile-input';
import {TUTORIAL_VERSION,tutorialSteps,nextTutorialStep,tutorialObjective}from'../../shared/tutorial-flight-rules.mjs';
import { PlayersPanel, CityTerritoriesPanel, type CityTerritoryEntry, type HumanRosterEntry } from './players-panel';
import { WorldMap, type WorldMapLayer } from './world-map';
import { NavigationBeaconSystem, type NavigationDestination } from './navigation-beacons';
import { LOCK_ANGLE, AIM_ENVELOPE, AIM_SWITCH_MARGIN, COMBAT_RANGE, aimTargetScore, stepAim, interpolateAim, insideDynamicLock, ballisticShotSpeed, PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase } from './firehawk-checkout';
import { territoriesForCity, type CityTerritory } from '../../shared/city-territories.mjs';
import { missionForCity, missionsForCity, type CityMission } from '../../shared/city-missions.mjs';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';
import { remoteProxyPixelWidth } from '../../shared/remote-aircraft-visual-rules.mjs';
import { formatRewardFeedback } from '../../shared/reward-feedback.mjs';
import { KNOTS_PER_METER_PER_SECOND } from '../../shared/aircraft-flight-envelope.mjs';
import { aircraftDisplayOrder, firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { repairsForCity } from '../../shared/city-repairs.mjs';
import { cargoCreditReward, challengeCreditReward, economyRewards } from '../../shared/reward-economy.mjs';
import { pilotXpForLevel } from '../../shared/pilot-progression.mjs';
import { weatherZoneAt, weatherZonesForCity, type WeatherZone } from '../../shared/weather-zones.mjs';
import type {
  AirportDefinition,
  AirportId,
  RegionName,
} from './world';

// Local production-build QA uses the same diagnostics as Vite DEV without
// exposing transform presets or telemetry on a deployed beta hostname.
const localQaEnabled = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const flightTestMode = localQaEnabled && new URLSearchParams(window.location.search).get('flighttest') === '1';
const chaosQaMode = localQaEnabled && new URLSearchParams(window.location.search).get('chaosqa') === '1';
const stabilityQaMode = localQaEnabled && new URLSearchParams(window.location.search).get('stabilityqa') === '1';
let stabilityQaFrames = 0;
const combatQaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('combatqa') === '1';
const activeCity = activeCityFromUrl();
if (!activeCity || activeCity.status !== 'available') throw new Error('A playable city is required before starting the game.');
const cityId = activeCity.id;
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
const PLANE_GROUND_Y = 1.2;
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
  const gate = new THREE.Mesh(new THREE.TorusGeometry(78, 4.5, 8, 30), chaosGateMaterial);
  gate.add(createRingSponsor({ type: 'RING_SPONSOR', campaignId: 'airport-chaos' }, 78));
  gate.visible = false;
  scene.add(gate);
  return gate;
});
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

const PLAYER_STORAGE_KEY = 'airport-chaos-player-v1';

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

function createAirplane(type: AircraftType, remote = false): THREE.Group {
  const definition = aircraftDefinitions[type];
  const plane = new THREE.Group();
  const fallback = new THREE.Group();
  fallback.name = `aircraft-fallback-${type}`;
  plane.add(fallback);
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
    plane.add(fighterExhaustSocket);
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

  const addExhaustEffect = (x: number, y: number, z: number, radius: number): void => {
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
      plane.add(exhaust);
      visuals.exhausts.push(exhaust);
    }
    // A second, normally transparent tapered plume is enabled only for boost.
    // It shares the existing exhaust geometry and stays model-local for GLB and
    // primitive aircraft alike.
    const boostTrail = new THREE.Mesh(aircraftExhaustGeometry, boostMaterial);
    const boostLength = baseLength * (type === 'fighter' ? 2.4 : 1.9);
    boostTrail.rotation.x = Math.PI / 2;
    boostTrail.scale.set(radius * 0.52, boostLength, radius * 0.52);
    boostTrail.position.set(x, y, z + boostLength * 0.46);
    boostTrail.userData.baseLength = boostLength;
    boostTrail.visible = false;
    plane.add(boostTrail);
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
    // The Trainer gets a restrained prop-wash stream, not a jet flame.
    const boostTrail = new THREE.Mesh(aircraftExhaustGeometry, boostMaterial);
    const boostLength = 3.2;
    boostTrail.rotation.x = Math.PI / 2;
    boostTrail.scale.set(definition.bodyRadius * 0.44, boostLength, definition.bodyRadius * 0.44);
    boostTrail.position.set(0, 0.06, definition.bodyLength / 2 + boostLength * 0.46);
    boostTrail.userData.baseLength = boostLength;
    boostTrail.visible = false;
    plane.add(boostTrail);
    visuals.boostTrails.push(boostTrail);
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

  for (const anchor of aircraftEffectAnchors[type]) addExhaustEffect(anchor.x, anchor.y, anchor.z, anchor.radius);

  plane.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      part.castShadow = false;
      part.receiveShadow = false;
    }
  });
  plane.userData.aircraftType = type;
  plane.userData.entityType = 'player';
  plane.userData.visuals = visuals;
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
  });
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

const scoreElement = document.querySelector<HTMLSpanElement>('#score')!;
const finalScoreElement = document.querySelector<HTMLSpanElement>('#final-score')!;
const crashOverlay = document.querySelector<HTMLDivElement>('#crash-overlay')!;
const endTitleElement = document.querySelector<HTMLDivElement>('#end-title')!;
const tutorialCrashActions=document.querySelector<HTMLElement>('#tutorial-crash-actions')!;
document.querySelector<HTMLButtonElement>('[data-tutorial-retry]')!.addEventListener('click',()=>{tutorialEvent('tutorial_retried',TUTORIAL_VERSION);setGuidedTutorial(true);});
document.querySelector<HTMLButtonElement>('[data-tutorial-free]')!.addEventListener('click',()=>{exitGuidedTutorial('skipped');restartGame();});
const nearMissMessageElement = document.querySelector<HTMLDivElement>('#near-miss-message')!;
const checkpointMessageElement = document.querySelector<HTMLDivElement>('#checkpoint-message')!;
const skyChallengeElement = document.querySelector<HTMLDivElement>('#sky-challenge')!;
const dynamicEventElement = document.querySelector<HTMLElement>('#dynamic-event')!;
const dynamicEventNameElement = document.querySelector<HTMLElement>('#dynamic-event-name')!;
const dynamicEventObjectiveElement = document.querySelector<HTMLElement>('#dynamic-event-objective')!;
const dynamicEventSponsorElement = document.querySelector<HTMLElement>('#dynamic-event-sponsor')!;
const dynamicEventJoinElement = document.querySelector<HTMLButtonElement>('#dynamic-event-join')!;
const dynamicEventSkipElement = document.querySelector<HTMLButtonElement>('#dynamic-event-skip')!;
const formationStatusElement = document.querySelector<HTMLElement>('#formation-status')!;
const citySelectorElement = document.querySelector<HTMLElement>('#city-selector')!;
const garageOverlayElement = document.querySelector<HTMLElement>('#garage-overlay')!;
const pilotMenuOverlayElement = document.querySelector<HTMLElement>('#pilot-menu-overlay')!;
const flightMenuButtonElement = document.querySelector<HTMLButtonElement>('#flight-menu-button')!;
const flightGarageButtonElement = document.querySelector<HTMLButtonElement>('#flight-garage-button')!;
const flightWorldButtonElement = document.querySelector<HTMLButtonElement>('#flight-world-button')!;
const flightMapButtonElement = document.querySelector<HTMLButtonElement>('#flight-map-button')!;
const desktopControlsHelpElement = document.querySelector<HTMLElement>('#desktop-controls-help')!;
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
const territoryDefenseAlertElement = document.querySelector<HTMLDivElement>('#territory-defense-alert')!;
const territoryDefenseTextElement = document.querySelector<HTMLSpanElement>('#territory-defense-text')!;
const territoryDefenseWaypointElement = document.querySelector<HTMLButtonElement>('#territory-defense-waypoint')!;
let territoryDefenseAlertId: string | null = null;
territoryDefenseWaypointElement.addEventListener('click', () => {
  const territory = territoryDefenseAlertId ? territoryDefinition(territoryDefenseAlertId) : undefined;
  if (territory) setActivityWaypoint(territory.center.x, territory.center.z, territory.displayName);
});
const rewardFeedbackElement = document.querySelector<HTMLDivElement>('#reward-feedback')!;
const combatMessageElement = document.querySelector<HTMLDivElement>('#combat-message')!;
const hitMarkerElement = document.querySelector<HTMLDivElement>('#hit-marker')!;
const damageFlashElement = document.querySelector<HTMLDivElement>('#damage-flash')!;
const healthElement = document.querySelector<HTMLSpanElement>('#health')!;
const healthRowElement = document.querySelector<HTMLElement>('.flight-hud-health')!;
const repairFeedbackElement = document.querySelector<HTMLSpanElement>('#repair-feedback')!;
let repairFeedbackTimer = 0;
const heatRowElement = document.querySelector<HTMLElement>('#heat-row')!;
heatRowElement.style.color = visualLanguage.heat.color;
const heatLevelElement = document.querySelector<HTMLSpanElement>('#heat-level')!;
document.getElementById('radar-legend')!.innerHTML = (['airport', 'ai', 'player'] as const)
  .map(kind => `<span style="color:${visualLanguage[kind].color}">${identityText(kind)}</span>`).join('');
document.getElementById('map-legend')!.innerHTML = (['you', 'player', 'ai', 'mission', 'airport', 'territory', 'event', 'waypoint'] as const)
  .map(kind => `<span style="color:${visualLanguage[kind].color}">${identityText(kind)}</span>`).join('');
const acquisitionCircleElement = document.querySelector<HTMLDivElement>('#acquisition-circle')!;
const missionProgressElement = document.querySelector<HTMLElement>('#mission-progress')!;
const targetFeedbackElement = document.querySelector<HTMLDivElement>('#target-feedback')!;
const targetNameDistanceElement = document.querySelector<HTMLSpanElement>('#target-name-distance')!;
const targetRangeElement = document.querySelector<HTMLElement>('#target-range')!;
const activeContractElement = document.querySelector<HTMLDivElement>('#active-contract')!;
const contractPanelElement = document.querySelector<HTMLElement>('#contract-panel')!;
const territoryCaptureElement = document.querySelector<HTMLElement>('#territory-capture')!;
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
const rewardBatchCredits = new Map<string, number>();
let rewardBatchScore = 0;
const displayedRewardCredits = new Map<string, number>();
let displayedRewardScore = 0;
let lastRewardFlushAt = 0;
let combatMessageTimer: number | undefined;
let healthFlashTimer: number | undefined;
let hitMarkerTimer: number | undefined;
let damageFlashTimer: number | undefined;

let audioContext: AudioContext | null = null;
let audioMaster: GainNode | null = null;
let audioLimiter: DynamicsCompressorNode | null = null;
let engineBus: GainNode | null = null;
let combatBus: GainNode | null = null;
let uiBus: GainNode | null = null;
let engineOscillator: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let audioMuted = persistedPlayer.muted;
type AudioCategory = 'engine' | 'combat' | 'ui';
type AudioLevels = { master: number; engine: number; combat: number; ui: number };
const audioLevelsKey = 'airport-chaos-audio-levels-v1';
const defaultAudioLevels: AudioLevels = { master: 100, engine: 95, combat: 100, ui: 80 };
function readAudioLevels(): AudioLevels {
  try {
    const value = JSON.parse(localStorage.getItem(audioLevelsKey) ?? '{}') as Partial<AudioLevels>;
    return {
      master: Number.isFinite(value.master) ? THREE.MathUtils.clamp(value.master!, 0, 100) : defaultAudioLevels.master,
      engine: Number.isFinite(value.engine) ? THREE.MathUtils.clamp(value.engine!, 0, 100) : defaultAudioLevels.engine,
      combat: Number.isFinite(value.combat) ? THREE.MathUtils.clamp(value.combat!, 0, 100) : defaultAudioLevels.combat,
      ui: Number.isFinite(value.ui) ? THREE.MathUtils.clamp(value.ui!, 0, 100) : defaultAudioLevels.ui,
    };
  } catch { return { ...defaultAudioLevels }; }
}
const audioLevels = readAudioLevels();
function applyAudioLevels(): void {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  audioMaster?.gain.setTargetAtTime(audioMuted ? 0 : audioLevels.master / 100 * 1.25, now, 0.02);
  engineBus?.gain.setTargetAtTime(audioLevels.engine / 100, now, 0.02);
  combatBus?.gain.setTargetAtTime(audioLevels.combat / 100 * 1.05, now, 0.02);
  uiBus?.gain.setTargetAtTime(audioLevels.ui / 100, now, 0.02);
}
function setAudioLevel(category: keyof AudioLevels, value: number): void {
  audioLevels[category] = THREE.MathUtils.clamp(Math.round(value), 0, 100);
  try { localStorage.setItem(audioLevelsKey, JSON.stringify(audioLevels)); } catch { /* Optional local preference. */ }
  applyAudioLevels();
}
let progressSaveTimer: number | undefined;

function writePlayerProgress(): void {
  if (flightTestMode) return;
  const value: PersistedPlayer = {
    version: 1,
    pilotId: persistedPlayer.pilotId,
    credits,
    // Retain a cached selection only until the authoritative profile arrives;
    // never overwrite migration data with the temporary Trainer state.
    selectedAircraft: profileHydrated ? aircraftType : persistedPlayer.selectedAircraft,
    displayName,
    muted: audioMuted,
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
contextualHintDismissElement.addEventListener('click', () => contextualHints.dismiss());
// Returning pilots receive the compact runway reminder; first-time pilots see
// the visual guide first, then enter the same contextual hint sequence.
contextualHints.trigger('missionBoard');
contextualHints.trigger('runwayControls');

function recordBestScore(candidate: number): void {
  if (candidate <= bestScore) return;
  bestScore = candidate;
  savePlayerProgress(true);
}

function activateAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    audioMaster = audioContext.createGain();
    audioLimiter = audioContext.createDynamicsCompressor();
    audioLimiter.threshold.value = -12;
    audioLimiter.knee.value = 8;
    audioLimiter.ratio.value = 12;
    audioLimiter.attack.value = 0.003;
    audioLimiter.release.value = 0.16;
    audioMaster.connect(audioLimiter).connect(audioContext.destination);
    engineBus = audioContext.createGain();
    combatBus = audioContext.createGain();
    uiBus = audioContext.createGain();
    engineBus.connect(audioMaster);
    combatBus.connect(audioMaster);
    uiBus.connect(audioMaster);
    applyAudioLevels();

    engineOscillator = audioContext.createOscillator();
    engineOscillator.type = 'sawtooth';
    const engineFilter = audioContext.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 180;
    engineGain = audioContext.createGain();
    engineGain.gain.value = 0.0001;
    engineOscillator.connect(engineFilter).connect(engineGain).connect(engineBus);
    engineOscillator.start();
  }

  if (audioContext.state === 'suspended') void audioContext.resume();
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
  if (!audioContext || !audioMaster || audioMuted || audioContext.state !== 'running') return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(category === 'combat' ? combatBus! : category === 'engine' ? engineBus! : uiBus!);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  oscillator.addEventListener('ended', () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
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

function playHitSound(): void {
  playTone(1100, 0.09, 'square', 0.065, 640, 0, 'combat');
  playTone(240, 0.08, 'sawtooth', 0.035, 110, 0, 'combat');
}

function playDestructionSound(): void {
  playTone(145, 0.27, 'sawtooth', 0.092, 42, 0, 'combat');
  playTone(72, 0.44, 'triangle', 0.068, 35, 0.04, 'combat');
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
  playTone(120, 0.42, 'sawtooth', 0.075, 48, 0, 'combat');
}

function playLeaderSound(): void {
  playTone(520, 0.12, 'triangle', 0.05, 620);
  playTone(660, 0.12, 'triangle', 0.05, 780, 0.1);
  playTone(880, 0.18, 'triangle', 0.055, 1040, 0.2);
}

function updateEngineAudio(): void {
  if (!audioContext || !engineOscillator || !engineGain) return;
  const now = audioContext.currentTime;
  const speedAmount = THREE.MathUtils.clamp(currentSpeed / currentAircraft.maxSpeed, 0, 1);
  const engineAmount = Math.max(speedAmount, throttle * 0.72) + boostVisualStrength * 0.12;
  const profile = aircraftType === 'cargo' ? { base: 42, range: 58, weight: 1.22 }
    : aircraftType === 'privateJet' ? { base: 62, range: 72, weight: 0.92 }
    : aircraftType === 'fighter' ? { base: 72, range: 96, weight: 1.08 }
    : { base: 55, range: 70, weight: 0.94 };
  engineOscillator.frequency.setTargetAtTime(profile.base + engineAmount * profile.range, now, 0.08);
  engineGain.gain.setTargetAtTime(crashed ? 0.0001 : (0.006 + engineAmount * 0.02) * profile.weight * (boostVisualStrength > 0.1 ? 1 + boostVisualStrength * 0.35 : 1), now, 0.1);
}

window.addEventListener('pointerdown', activateAudio);
window.addEventListener('keydown', activateAudio);
function toggleAudio(): void {
  activateAudio();
  audioMuted = !audioMuted;
  applyAudioLevels();
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

function updateScoreDisplay(): void {
  scoreElement.textContent = score.toLocaleString();
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
  score += points;
  queueRewardFeedback(0, points);
  recordBestScore(score);
  checkpointsPassed += 1;
  multiplier = Math.min(5, 1 + Math.floor(checkpointsPassed / 3));
  speedBonus = Math.min(10, Math.floor(checkpointsPassed / 2) * 2);
  remainingTime = Math.min(14, Math.max(10, remainingTime) + 2);
  activeCheckpoint = (passedCheckpoint + 1) % checkpointRings.length;
  updateScoreDisplay();
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
  const speedKnots = Math.round(currentSpeed * METERS_PER_SECOND_TO_KNOTS).toString();
  speedElement.textContent = speedKnots;
  const altitudeFeet = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toString();
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
      : 'FIREHAWK TRIAL COMPLETE · UNLOCK FOREVER — $9.99';
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

function drawRadarMarker(
  direction: THREE.Vector3,
  targetX: number,
  targetZ: number,
  kind: 'airport' | 'player' | 'ai' | 'ambient' | 'event' | 'wanted' | 'challenge' | 'waypoint' | 'repair' | 'repairHeart',
  label = '',
  king = false,
  hot = false,
  targeted = false,
  locked = false,
  ownershipAccent?: string,
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

  for (const airport of airports) {
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
      primaryTerritoryColorForPlayer(human.playerId));
  }
  for (const remote of remotePlayers.values()) {
    if (!remote.isBot || !remoteIdentityVisible(remote)) continue;
    drawRadarMarker(direction, remote.plane.position.x, remote.plane.position.z, 'ai', '', false, remote.heatLevel >= 4,
      selectedCombatTarget?.remote === remote, selectedCombatTarget?.remote === remote && selectedCombatTarget.locked,
      primaryTerritoryColorForPlayer(remote.playerId));
  }
  for (const ambient of ambientTraffic?.getRadarEntities(airplane.position, radarRange) ?? []) {
    drawRadarMarker(direction, ambient.x, ambient.z, entityCapabilities(ambient.entityType, ambient.eventCombatMode).radarMarker);
  }
  const challengeMarker = skyChallenges?.getRadarMarker(airplane.position);
  if (challengeMarker) drawRadarMarker(direction, challengeMarker.x, challengeMarker.z, 'challenge');
  const eventObjective = cityEvent ? eventObjectiveForLocal(cityEvent) : undefined;
  if (cityEvent && eventObjective && (cityEvent.lifecycle === 'available' || cityEvent.lifecycle === 'active')) {
    drawRadarMarker(direction, eventObjective.x, eventObjective.z, cityEvent.eventType === 'mostWanted' ? 'wanted' : 'event');
  }
  if (waypoint) drawRadarMarker(direction, waypoint.x, waypoint.z, 'waypoint');

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
  if (flightTutorial.isOpen()) return;
  contextualHints.update();
  if (!crashed && health < maxHealthForAircraft(aircraftType) * 0.65) contextualHints.trigger('repair');
  if (runStarted && onGround && !crashed) contextualHints.trigger('runwayControls');
  if (!runStarted || onGround || crashed) return;
  const altitude = altitudeAboveTerrain();
  if (altitude >= 80 && currentSpeed >= currentAircraft.takeoffSpeed * 1.2 && boostMeter > 8) contextualHints.trigger('boost');
}

function updateProgressHud(): void {
  const compact = document.documentElement.classList.contains('touch-controls-active') && window.innerWidth <= 700;
  creditsElement.textContent = compact && credits >= 1_000
    ? `${(credits / 1_000).toFixed(credits >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`
    : credits.toLocaleString();
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
  if(guidedTutorialActive)return;
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
function queueRewardFeedback(creditDelta = 0, scoreDelta = 0, creditReason = 'Gameplay Reward'): void {
  if (creditDelta > 0) rewardBatchCredits.set(creditReason, (rewardBatchCredits.get(creditReason) ?? 0) + Math.round(creditDelta));
  rewardBatchScore += Math.max(0, Math.round(scoreDelta));
  if (rewardBatchCredits.size === 0 && rewardBatchScore === 0) return;
  if (rewardBatchTimer !== undefined) return;
  rewardBatchTimer = window.setTimeout(() => {
    rewardBatchTimer = undefined;
    const now = performance.now();
    if (now - lastRewardFlushAt > 900) {
      displayedRewardCredits.clear();
      displayedRewardScore = 0;
    }
    for (const [reason, amount] of rewardBatchCredits) displayedRewardCredits.set(reason, (displayedRewardCredits.get(reason) ?? 0) + amount);
    displayedRewardScore += rewardBatchScore;
    rewardBatchCredits.clear();
    rewardBatchScore = 0;
    lastRewardFlushAt = now;
    const displayedCredits = [...displayedRewardCredits.values()].reduce((total, amount) => total + amount, 0);
    rewardFeedbackElement.textContent = formatRewardFeedback(displayedCredits, displayedRewardScore);
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
        displayedRewardCredits.clear();
        displayedRewardScore = 0;
      }, 220);
    }, 1400);
  }, 180);
}

let skyChallenges: SkyChallengeSystem | undefined;
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

// Shared ownership colors match the world map. Every strip vertex follows the
// terrain, including the outer edge, so wide glow cannot vanish under slopes.
const territoryMaterialColors = [...new Set([...territoryDefinitions.map(({ fixedColor }) => fixedColor), neutralTerritoryColor])];
const borderMaterials = Object.fromEntries(territoryMaterialColors.map((fixedColor) => [fixedColor, {
  core: new THREE.MeshBasicMaterial({ color: fixedColor, transparent: true, opacity: worldTimeOfDay === 'dusk' ? 1 : 0.96, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  halo: new THREE.MeshBasicMaterial({ color: fixedColor, transparent: true, opacity: worldTimeOfDay === 'dusk' ? 0.52 : 0.39, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  missionHalo: new THREE.MeshBasicMaterial({ color: fixedColor, transparent: true, opacity: worldTimeOfDay === 'dusk' ? 0.72 : 0.56, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
}])) as Record<string, { core: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial; missionHalo: THREE.MeshBasicMaterial }>;
const contestedBorderHalo = new THREE.MeshBasicMaterial({ color: territoryOwnershipColors.contested, transparent: true, opacity: worldTimeOfDay === 'dusk' ? 0.65 : 0.5, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const borderUnderlayMaterial = new THREE.MeshBasicMaterial({ color: 0x102330, transparent: true, opacity: worldTimeOfDay === 'dusk' ? 0.82 : 0.78, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const territoryCurtainHeight = 220;
const curtainVisuals = {
  day: { full: 0.34, far: 0.11, missionFull: 0.44, missionFar: 0.17 },
  dusk: { full: 0.43, far: 0.15, missionFull: 0.54, missionFar: 0.22 },
  night: { full: 0.48, far: 0.18, missionFull: 0.6, missionFar: 0.26 },
} as const;
type CurtainLod = keyof typeof curtainVisuals.day;
const curtainLods: readonly CurtainLod[] = ['full', 'far', 'missionFull', 'missionFar'];
const curtainStrength = curtainVisuals[worldTimeOfDay];
const curtainMaterials = Object.fromEntries(territoryMaterialColors.map((fixedColor) => [fixedColor,
  Object.fromEntries(curtainLods.map((lod) => [lod, new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(fixedColor) },
      strength: { value: curtainStrength[lod] },
    },
    vertexShader: 'attribute float fade; varying float vFade; void main() { vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 tint; uniform float strength; varying float vFade; void main() { gl_FragColor = vec4(tint, strength * vFade); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  })])) as Record<CurtainLod, THREE.ShaderMaterial>,
])) as Record<string, Record<CurtainLod, THREE.ShaderMaterial>>;
const territoryLabelLayer = document.createElement('div');
territoryLabelLayer.className = 'territory-world-labels';
document.querySelector('#game-root')!.append(territoryLabelLayer);
const territoryLabelProjection = new THREE.Vector3();
const territoryBorders = territoryDefinitions.map((definition) => {
  const { minX, maxX, minZ, maxZ } = definition.bounds;
  const corners: Array<[number, number]> = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ]];
  const border = new THREE.Group();
  for (const [width, layer] of [[34, 'underlay'], [80, 'halo'], [16, 'core']] as const) {
    const vertices: number[] = [];
    for (let edge = 0; edge < 4; edge += 1) {
      const [x0, z0] = corners[edge], [x1, z1] = corners[edge + 1];
      const length = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.max(1, Math.ceil(length / 60));
      const nx = -(z1 - z0) / length * width * 0.5;
      const nz = (x1 - x0) / length * width * 0.5;
      for (let step = 0; step < steps; step += 1) {
        const a = step / steps, b = (step + 1) / steps;
        const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a;
        const bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
        const lift = layer === 'core' ? 1.7 : layer === 'halo' ? 1.5 : 1.35;
        vertices.push(ax + nx, groundPlaneY(ax + nx, az + nz) + lift, az + nz,
          ax - nx, groundPlaneY(ax - nx, az - nz) + lift, az - nz,
          bx + nx, groundPlaneY(bx + nx, bz + nz) + lift, bz + nz,
          ax - nx, groundPlaneY(ax - nx, az - nz) + lift, az - nz,
          bx - nx, groundPlaneY(bx - nx, bz - nz) + lift, bz - nz,
          bx + nx, groundPlaneY(bx + nx, bz + nz) + lift, bz + nz);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, layer === 'underlay' ? borderUnderlayMaterial : borderMaterials[neutralTerritoryColor][layer]);
    mesh.renderOrder = layer === 'core' ? 12 : layer === 'halo' ? 11 : 10;
    border.add(mesh);
  }
  const curtainVertices: number[] = [];
  const curtainFade: number[] = [];
  const height = THREE.MathUtils.clamp(definition.boundaryHeight ?? territoryCurtainHeight, 150, 300);
  for (let edge = 0; edge < 4; edge += 1) {
    const [x0, z0] = corners[edge], [x1, z1] = corners[edge + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 120));
    for (let step = 0; step < steps; step += 1) {
      const a = step / steps, b = (step + 1) / steps;
      const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a;
      const bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      const ay = groundPlaneY(ax, az) + 1.4, by = groundPlaneY(bx, bz) + 1.4;
      curtainVertices.push(ax, ay, az, ax, ay + height, az, bx, by, bz,
        ax, ay + height, az, bx, by + height, bz, bx, by, bz);
      curtainFade.push(1, 0, 1, 0, 0, 1);
    }
  }
  const curtainGeometry = new THREE.BufferGeometry();
  curtainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curtainVertices, 3));
  curtainGeometry.setAttribute('fade', new THREE.Float32BufferAttribute(curtainFade, 1));
  curtainGeometry.computeBoundingSphere();
  const curtain = new THREE.Mesh(curtainGeometry, curtainMaterials[neutralTerritoryColor].full);
  curtain.name = `territory-curtain-${definition.id}`;
  curtain.renderOrder = 9;
  border.add(curtain);
  const label = document.createElement('div');
  const title = document.createElement('strong');
  const owner = document.createElement('span');
  label.className = 'territory-world-label';
  label.hidden = true;
  title.textContent = definition.displayName.toUpperCase();
  label.append(title, owner);
  territoryLabelLayer.append(label);
  scene.add(border);
  return { definition, border, curtain, label, owner, displayColor: neutralTerritoryColor, appearance: 'neutral' as TerritoryAppearance, missionTarget: false, farCurtain: false };
});
let territoryBorderRefreshAt = 0;
function refreshTerritoryBorders(): void {
  const active = serverProfile.missions[cityId]?.active;
  const mission = active && missionForCity(cityId, active.missionId);
  const missionTerritories = mission ? missionRequirements(mission) : [];
  for (const entry of territoryBorders) {
    const { definition, border } = entry;
    const state = territoryState.get(definition.id);
    const appearance: TerritoryAppearance = state?.contested ? 'contested' : !state?.controllerId ? 'neutral' : state.controllerId === localPlayerId ? 'own' : 'enemy';
    entry.appearance = appearance;
    entry.displayColor = state?.controllerId ? definition.fixedColor : neutralTerritoryColor;
    entry.missionTarget = missionTerritories.includes(definition.id);
    const materials = borderMaterials[entry.displayColor];
    (border.children[1] as THREE.Mesh).material = appearance === 'contested' ? contestedBorderHalo : entry.missionTarget ? materials.missionHalo : materials.halo;
    (border.children[2] as THREE.Mesh).material = materials.core;
    entry.curtain.material = curtainMaterials[entry.displayColor][entry.missionTarget ? entry.farCurtain ? 'missionFar' : 'missionFull' : entry.farCurtain ? 'far' : 'full'];
    entry.owner.textContent = state?.contested ? 'CONTESTED' : state?.controllerId ? `Owned by ${state.controllerName ?? 'another pilot'}` : 'NEUTRAL';
    entry.label.style.setProperty('--territory-accent', entry.displayColor);
    entry.label.classList.toggle('mission', entry.missionTarget);
    entry.label.classList.toggle('contested', appearance === 'contested');
  }
}
function updateTerritoryBorderVisibility(now: number): void {
  if (now < territoryBorderRefreshAt) return;
  territoryBorderRefreshAt = now + 500;
  let contestedVisible = false;
  for (const entry of territoryBorders) {
    const { definition, border } = entry;
    const dx = Math.max(definition.bounds.minX - airplane.position.x, 0, airplane.position.x - definition.bounds.maxX);
    const dz = Math.max(definition.bounds.minZ - airplane.position.z, 0, airplane.position.z - definition.bounds.maxZ);
    const distanceSquared = dx * dx + dz * dz;
    border.visible = !guidedTutorialActive && distanceSquared < 12_000 * 12_000;
    const far = distanceSquared > 7_000 * 7_000;
    if (entry.farCurtain !== far) {
      entry.farCurtain = far;
      entry.curtain.material = curtainMaterials[entry.displayColor][entry.missionTarget ? far ? 'missionFar' : 'missionFull' : far ? 'far' : 'full'];
    }
    if (border.visible && territoryState.get(definition.id)?.contested) contestedVisible = true;
  }
  if (contestedVisible) {
    const pulse = Math.sin(now * 0.0022) * 0.08;
    contestedBorderHalo.opacity = (worldTimeOfDay === 'dusk' ? 0.65 : 0.5) + pulse;
  }
}

function updateTerritoryLabels(): void {
  let first = -1, second = -1, firstPriority = Infinity, secondPriority = Infinity;
  for (let index = 0; index < territoryBorders.length; index += 1) {
    const entry = territoryBorders[index];
    const dx = entry.definition.center.x - airplane.position.x;
    const dz = entry.definition.center.z - airplane.position.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared > 7_000 * 7_000 || !entry.border.visible) continue;
    const priority = entry.missionTarget ? distanceSquared * 0.25 : distanceSquared;
    if (priority < firstPriority) { second = first; secondPriority = firstPriority; first = index; firstPriority = priority; }
    else if (priority < secondPriority) { second = index; secondPriority = priority; }
  }
  for (let index = 0; index < territoryBorders.length; index += 1) {
    const entry = territoryBorders[index];
    if (index !== first && index !== second) { entry.label.hidden = true; continue; }
    territoryLabelProjection.set(entry.definition.center.x,
      groundPlaneY(entry.definition.center.x, entry.definition.center.z) + Math.max(450, (entry.definition.boundaryHeight ?? territoryCurtainHeight) + 220),
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
      airplane.position.x >= definition.bounds.minX && airplane.position.x <= definition.bounds.maxX &&
      airplane.position.z >= definition.bounds.minZ && airplane.position.z <= definition.bounds.maxZ;
  }) : undefined;
  territoryCaptureElement.classList.toggle('hidden', !capturing);
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
  const challenge = skyChallenges?.getHud() ?? null;
  skyChallengeElement.classList.toggle('hidden', challenge === null);
  if (!challenge) return;
  skyChallengeElement.textContent = `${challenge.name} · GATE ${challenge.gate}/${challenge.total} · COMBO x${challenge.combo} · ${Math.ceil(challenge.timeRemaining)}s`;
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
  const visible = event !== null && event.id !== skippedEventId && (event.lifecycle === 'available' || event.lifecycle === 'active') && objective !== undefined;
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
  const event = cityEvent;
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.075;
  for (const gate of chaosGates) gate.visible = false;
  if (event?.lifecycle === 'active' && (event.eventType === 'skyRush' || event.eventType === 'goldenSkyRun')) {
    const localGateIndex = Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0);
    for (let index = 0; index < event.route.length && index < chaosGates.length; index += 1) {
      const point = event.route[index];
      const gate = chaosGates[index];
      gate.visible = true;
      gate.position.set(point.x, point.y, point.z);
      gate.scale.setScalar((index === localGateIndex ? 1.12 : 0.78) * pulse);
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
  if (event && (event.lifecycle === 'available' || event.lifecycle === 'active')) {
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

if (cityWorld.skyChallenges?.length) {
  skyChallenges = new SkyChallengeSystem(scene, cityWorld.skyChallenges, getTerrainHeight, {
    onScore: (points) => {
      score += points;
      queueRewardFeedback(0, points);
      recordBestScore(score);
      updateScoreDisplay();
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
    score += points;
    queueRewardFeedback(0, points);
    recordBestScore(score);
    updateScoreDisplay();
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
      discoveredLocationsByCity[cityId] = [...discoveredLocationIds];
      savePlayerProgress();
      queueProfileProgress();
      showProgressMessage(`DISCOVERED: ${definition.name}`);
      gameplayFeedback.push({ type: 'secret', primaryText: definition.type === 'secret' ? 'SECRET DISCOVERED' : 'PLACE DISCOVERED', secondaryText: `${definition.name.toUpperCase()} · +${definition.credits} CREDITS`, intensity: definition.type === 'secret' ? 'major' : 'medium' });
      flightRecap.discoveries += 1;
      if (definition.type === 'secret' && connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'secret_discovered' }));
      updateProgressHud();
      contextualHints.trigger('discovery');
    },
    onSetComplete: (setId, bonus) => {
      if (bonus <= 0) return;
      discoveredLocationsByCity[cityId] = [...discoveredLocationIds];
      savePlayerProgress();
      queueProfileProgress();
      showProgressMessage(`${setId.replaceAll('-', ' ').toUpperCase()} COMPLETE`);
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
  contractPanelElement.classList.toggle('hidden', availableContract === null);
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
  showProgressMessage(`${contractTitle(type)} COMPLETE +${reward}`);
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
    showProgressMessage(`${region.name.toUpperCase()} FOUND`);
  }
}

function updateAirborneProgress(delta: number): void {
  if (visualQaMode) return;
  const traveled = currentSpeed * delta;
  if (traveled <= 0) return;
  distanceFlown += traveled;
  totalDistance += traveled;
  flightDistanceSinceTakeoff += traveled;
  distanceCreditProgress += traveled;
  if (distanceCreditProgress >= 250) {
    distanceCreditProgress %= 250;
    queueProfileProgress();
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

function rewardLanding(airport: AirportDefinition, landingQuality?: LandingQuality, rough = false): void {
  setRestartAirport(airport);
  if (visualQaMode) return;
  if (flightDistanceSinceTakeoff < MIN_REWARDED_FLIGHT_DISTANCE) return;
  successfulLandings += 1;
  totalSuccessfulLandings += 1;
  if (totalSuccessfulLandings % 3 === 0) gameplayFeedback.push({ type:'landing-streak', primaryText:`${totalSuccessfulLandings} LANDINGS`, secondaryText:'LANDING STREAK', intensity:'medium' });
  queueProfileProgress();
  resetRegionsOnNextTakeoff = true;
  const destinationBonus = !landedAirportIds.has(airport.id);
  landedAirportIds.add(airport.id);
  showProgressMessage(rough ? 'ROUGH LANDING' : destinationBonus ? `${airport.name.toUpperCase()} DISCOVERED` : 'LANDING VERIFIED');
  if (landingQuality) {
    showFlightRecap('GREAT FLIGHT');
  }
  if (localPlayerId && connectionReady() && landingQuality) {
    socket.send(JSON.stringify({ type: 'landingIntent', airportId: airport.id, telemetry: {
      speed: landingQuality.speed,
      descentRate: landingQuality.descentRate,
      bankAngle: landingQuality.bankAngle,
      pitch: landingQuality.pitch,
      headingError: landingQuality.headingError,
    } }));
  }
  if (landingQuality) stuntCombo?.notifyLanding(landingQuality);
  contextualHints.trigger('garage');
}

function endRun(message: EndReason, title: string = message): void {
  if (crashed) return;
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
  altitudeElement.textContent = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toString();
  endTitleElement.textContent = title;
  finalScoreElement.textContent = score.toString();
  crashOverlay.classList.remove('hidden');
  tutorialCrashActions.hidden=!guidedTutorialActive;if(guidedTutorialActive)tutorialEvent('tutorial_crashed',guidedTutorialStep);
  showFlightRecap('FLIGHT COMPLETE');
  cameraShakeTime = 0.35;
  currentSpeed = 0;
  verticalSpeed = 0;
  velocity.set(0, 0, 0);
  setFlightState('CRASHED');
  playEndSound(message);
  updateScoreDisplay();
}

function restartGame(notifyServer = true): void {
  heldActions.clear();
  fireCooldown = 0;
  runStarted = true;
  airplane.position.copy(spawnPosition);
  airplane.rotation.set(0, spawnHeading, 0, 'YXZ');
  heading = spawnHeading;
  pitch = 0;
  roll = 0;
  rollControlStrength = 0;
  pitchControlStrength = 0;
  yawControlStrength = 0;
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
  tutorialCrashActions.hidden=true;
  flightRecapElement.hidden = true;
  updateHealthDisplay();
  updateFlightHud();
  updateScoreDisplay();
  showActiveCheckpoint();
  updateCamera(1);
  if (notifyServer) sendRespawn();
  sendLocalState();
  sendPlayerUpdate();
}
flightRecapElement.querySelector('[data-recap-fly]')!.addEventListener('click', () => { if(connectionReady()) socket.send(JSON.stringify({type:'analyticsEvent',event:'fly_again_clicked'})); restartGame(); });
flightRecapElement.querySelector('[data-recap-close]')!.addEventListener('click', () => { flightRecapElement.hidden=true; });

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
}, () => {
  if (connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'fighter_purchase_clicked' }));
  void beginFirehawkCheckout({ pilotId: serverProfile.pilotId, pilotName: serverProfile.pilotName })
    .catch((error: unknown) => aircraftGarage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'CHECKOUT UNAVAILABLE'));
}, () => {
  if (connectionReady()) socket.send(JSON.stringify({ type: 'analyticsEvent', event: 'fighter_modal_viewed' }));
}, async (code) => {
  try {
    const result = await restoreFirehawkPurchase(code);
    if (result.profile) applyServerProfile(result.profile);
    aircraftGarage.showActionResult(`FIREHAWK RESTORED · NEW RECOVERY CODE: ${result.recoveryCode ?? 'CONTACT SUPPORT'}`);
  } catch (error) { aircraftGarage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'PURCHASE RESTORE FAILED'); }
}, (id) => sendCosmeticAction('purchaseCosmetic', id),
  (id) => sendCosmeticAction('equipCosmetic', id));
function sendCosmeticAction(type: 'purchaseCosmetic' | 'equipCosmetic', cosmeticId: string): void {
  if (!connectionReady() || !profileHydrated) { aircraftGarage.showActionResult('SERVER UNAVAILABLE — COSMETIC NOT CHANGED'); return; }
  try { socket.send(JSON.stringify({ type, cosmeticId })); } catch { aircraftGarage.showActionResult('SERVER UNAVAILABLE — COSMETIC NOT CHANGED'); }
}
function openGarage(): boolean {
  if (!onGround || crashed) {
    showProgressMessage('GARAGE AVAILABLE WHEN SAFELY ON GROUND');
    return false;
  }
  // The Garage owns the whole screen while open. Clear held flight input and
  // close the two other full-screen surfaces before its preview takes focus.
  heldActions.clear();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  if (pilotMenu.isOpen()) pilotMenu.close();
  if (connectionReady() && serverProfile.fighterTrial.status === 'active' && (serverProfile.fighterTrial.expiresAt ?? Infinity) <= Date.now()) {
    socket.send(JSON.stringify({ type: 'fighterTrialBoundary' }));
  }
  aircraftGarage.open({
    credits,
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
let touchInputReported=false;
const reportTouchInput=()=>{if(!touchInputReported&&connectionReady()){touchInputReported=true;socket.send(JSON.stringify({type:'analyticsEvent',event:'input_mode_detected',mode:'touch'}));}};
const mobileInput=new MobileInputControls(document.querySelector<HTMLElement>('#touch-controls')!, acquisitionCircleElement, (action,active)=>{
  if(active)reportTouchInput();
  if(active){heldActions.add(action);runStarted=true;if(action==='fire')fireWeaponOnce();}
  else heldActions.delete(action);
},()=>{reportTouchInput();runStarted=true;});
let controlsHelpAutoHideTimer: number | undefined;
let controlsHelpConcealTimer: number | undefined;
let lastTouchLayout = mobileInput.isTouchLayout();
function hideDesktopControlsHelp(immediate = false): void {
  window.clearTimeout(controlsHelpAutoHideTimer);
  window.clearTimeout(controlsHelpConcealTimer);
  desktopControlsHelpElement.classList.remove('is-visible');
  desktopControlsHelpElement.setAttribute('aria-hidden', 'true');
  if (immediate) desktopControlsHelpElement.hidden = true;
  else controlsHelpConcealTimer = window.setTimeout(() => { desktopControlsHelpElement.hidden = true; }, 260);
}
function showDesktopControlsHelp(duration = 9_000): void {
  if (mobileInput.isTouchLayout()) { hideDesktopControlsHelp(true); return; }
  window.clearTimeout(controlsHelpAutoHideTimer);
  window.clearTimeout(controlsHelpConcealTimer);
  desktopControlsHelpElement.hidden = false;
  desktopControlsHelpElement.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => desktopControlsHelpElement.classList.add('is-visible'));
  controlsHelpAutoHideTimer = window.setTimeout(() => hideDesktopControlsHelp(), duration);
}
function syncDesktopControlsHelp(): void {
  const touchLayout = mobileInput.isTouchLayout();
  if (touchLayout) hideDesktopControlsHelp(true);
  else if (lastTouchLayout) showDesktopControlsHelp(12_000);
  lastTouchLayout = touchLayout;
}
window.addEventListener('resize', syncDesktopControlsHelp);
window.addEventListener('orientationchange', syncDesktopControlsHelp);
if (!lastTouchLayout) showDesktopControlsHelp();
let runStarted = false;
const guidedTutorialKey=`airport-chaos-guided-tutorial-v1:${persistedPlayer.pilotId}`;
let guidedTutorialActive=false;let guidedTutorialStep='throttle';let guidedTutorialStepAt=performance.now();let guidedTutorialTargetAirport:AirportDefinition|undefined;
try{guidedTutorialActive=localStorage.getItem(guidedTutorialKey)==='active';}catch{/* server profile restores after welcome */}
const flightControlCodes = new Set(Object.keys(keyboardActionBindings));
function showFirstRunGuide(): void {
  if (pilotMenu.isOpen()) pilotMenu.close();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  if (aircraftGarage.isOpen()) aircraftGarage.close();
  flightTutorial.open();
}
flightTutorial.setVisibilityHandler(() => {
  heldActions.clear();
  boostActive = false;
  if (cameraOrbitPointerId !== null && renderer.domElement.hasPointerCapture(cameraOrbitPointerId)) {
    renderer.domElement.releasePointerCapture(cameraOrbitPointerId);
  }
});
flightTutorial.setHelpAction(showFirstRunGuide);
window.addEventListener('keydown', (event) => {
  if (!citySelectorElement.hidden) {
    if (flightControlCodes.has(event.code)) event.preventDefault();
    return;
  }
  if (aircraftGarage.isOpen()) {
    if (event.code === 'Escape') {
      event.preventDefault();
      aircraftGarage.close();
    } else if (flightControlCodes.has(event.code) || event.code === menuBindings.map || event.code === menuBindings.restart || event.code === menuBindings.menu) {
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
    if (event.code === 'Escape') {
      event.preventDefault();
      pilotMenu.close();
    }
    return;
  }
  if (!worldMap.isOpen() && shouldToggleDesktopControlsHelp(event.code, mobileInput.isTouchLayout(), event.target)) {
    event.preventDefault();
    if (desktopControlsHelpElement.classList.contains('is-visible')) hideDesktopControlsHelp();
    else showDesktopControlsHelp(12_000);
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
    heldActions.add(action);
  }
});
window.addEventListener('keyup', (event) => {
  if (flightControlCodes.has(event.code) || (aircraftGarage.isOpen() && (event.code === menuBindings.map || event.code === menuBindings.restart || event.code === menuBindings.menu))) event.preventDefault();
  const action = keyboardActionBindings[event.code];
  if (action) heldActions.delete(action);
});
window.addEventListener('blur', () => {
  // Browser focus loss must not leave any flight input latched.
  heldActions.clear();
  mobileInput.reset();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){heldActions.clear();mobileInput.reset();}});

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
let rollControlStrength = 0;
let pitchControlStrength = 0;
let yawControlStrength = 0;
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
const speedElement = document.querySelector<HTMLSpanElement>('#speed')!;
const fighterTrialIndicator = document.querySelector<HTMLDivElement>('#fighter-trial-indicator')!;
const landingSpeedCueElement = document.querySelector<HTMLDivElement>('#landing-speed-cue')!;
const landingStatus = { speedSafe: true, descentSafe: true, bankSafe: true, pitchSafe: true, alignmentSafe: true, bankAngle: 0, headingError: 0, reason: '', rough: false };

type NetworkTransform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  aircraftType: AircraftType;
  cityId: CityId;
  displayName?: string;
  lifeState?: PlayerLifeState;
  isBot?: boolean;
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
type NetworkMissionAttempt = { missionId: string; attemptId: string; startedAt: number; updatedAt: number; progress: number; holdStartedAt?: number; flightStartedAt?: number; heading?: number; distanceMeters?: number; completedIds: string[]; ownedTerritoryIds?: string[]; targetId?: string; eventId?: string; sequenceIndex?: number; challengeEndsAt?: number };
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
};
type NetworkProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
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
      health: number;
      maxHealth: number;
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
  | { type: 'weeklyLeaderboards'; weeklyLeaderboards: NetworkWeeklyLeaderboard[] }
  | { type: 'dailyStreakClaimed'; day: number; streak: number; credits: number }
  | { type: 'weeklyRewardClaimed'; reward: { rank: number; category: string; credits: number; badge: string } }
  | { type: 'pilotLevelUp'; level: number; title?: string }
  | { type: 'landingScored'; airportId: string; quality: number; grade: 'ROUGH' | 'SAFE' | 'SMOOTH' | 'PERFECT' | 'LEGENDARY' }
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
  | ({ type: 'heatState' } & NetworkHeatState)
  | { type: 'territoryState'; cityId: CityId; territories: NetworkTerritoryState[] }
  | { type: 'territoryNotice'; territoryId: string; kind: 'enter' | 'captured' | 'underAttack' | 'defenderInbound'; attackerName?: string }
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
      killerId: string;
      killerDisplayName: string;
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
  | { type: 'profile'; profile: NetworkProfile; rewardId?: string; selectionRevision: number; equipRequestId?: number; creditReason?: string; preserveActiveAircraft?: boolean; serverReset?: boolean };

function createSafeNetworkProfile(): NetworkProfile {
  return {
    pilotId: persistedPlayer.pilotId,
    pilotName: persistedPlayer.displayName,
    credits: persistedPlayer.credits,
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
  displayName: string;
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
  ownershipColors: readonly string[], distance = 0, targeted = false, locked = false, missionTarget = false): void {
  const canvas = label.userData.canvas as HTMLCanvasElement;
  const band = distance <= 900 ? 'close' : distance <= 3_000 ? 'mid' : 'far';
  const distanceText = distance < 1_000 ? `${Math.round(distance / 10) * 10}m` : `${(distance / 1_000).toFixed(1)} km`;
  const signature = `${name}|${type}|${king}|${isBot}|${ownershipColors.join(',')}|${band}|${distanceText}|${targeted}|${locked}|${missionTarget}`;
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
  context.fillStyle = identityColor;
  context.font = '700 18px ui-sans-serif, system-ui, sans-serif';
  context.fillText(band === 'close'
    ? `${isBot ? 'AI · ' : ''}${aircraftDefinitions[type].callsign} · ${distanceText}`
    : isBot ? 'AI PILOT' : locked ? 'LOCKED' : targeted ? 'TARGET' : 'REAL PLAYER', 160, 59, 292);
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

// Real aircraft stay physically true-scale.  This sprite is a player-only
// combat readability proxy: it is screen-sized, non-collidable, and fades out
// before the true GLB is large enough to read on its own.
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
  const missionTerritories = activeMissionDefinition ? missionRequirements(activeMissionDefinition) : [];
  const mapPlayers: Array<{ id: string; x: number; z: number; king: boolean; heatLevel: number; isBot: boolean; ownershipAccent?: string }> = [];
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
    });
  }
  for (const [id, remote] of remotePlayers) {
    if (!remote.isBot || !remoteIdentityVisible(remote)) continue;
    mapPlayers.push({
      id,
      x: remote.plane.position.x,
      z: remote.plane.position.z,
      king: false,
      heatLevel: remote.heatLevel,
      isBot: true,
      ownershipAccent: primaryTerritoryColorForPlayer(id),
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
      compactProgress: missionOverlayProgress(activeMissionDefinition, activeMissionProgress),
      credits: activeMissionDefinition.creditReward,
      score: activeMissionDefinition.scoreReward,
    } : undefined,
    waypoint,
    contractTarget: contractMapTarget(),
    challenges: skyChallenges?.getMapMarkers(),
    events: [
      ...(cityEvent && eventObjective ? [{ id: cityEvent.id, x: eventObjective.x, z: eventObjective.z, label: cityEvent.name, lifecycle: cityEvent.lifecycle, mostWanted: cityEvent.eventType === 'mostWanted' }] : []),
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
        color: state?.controllerId ? definition.fixedColor : neutralTerritoryColor,
        missionTarget: missionTerritories.includes(definition.id),
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
tutorialPanel.innerHTML = '<strong>Tutorial Flight</strong><p data-tutorial-objective aria-live="polite"></p><button data-guided-skip>Skip to Free Flight</button><button data-guided-restart>Restart Tutorial</button>';
document.body.append(tutorialPanel);
tutorialPanel.querySelector('[data-guided-skip]')!.addEventListener('click', () => exitGuidedTutorial('skipped'));
tutorialPanel.querySelector('[data-guided-restart]')!.addEventListener('click', () => setGuidedTutorial(true, true));
const tutorialCompletePanel = document.createElement('section'); tutorialCompletePanel.className = 'guided-tutorial-panel'; tutorialCompletePanel.hidden = true;
tutorialCompletePanel.innerHTML = '<strong>Tutorial Complete</strong><p>You are ready to explore.</p><button>Free Flight</button>';
tutorialCompletePanel.querySelector('button')!.onclick = () => { tutorialCompletePanel.hidden = true; };
document.body.append(tutorialCompletePanel);
const tutorialRing = new THREE.Mesh(new THREE.TorusGeometry(120, 8, 6, 48), new THREE.MeshBasicMaterial({color:0x5ffff0, toneMapped:false}));
tutorialRing.visible = false; scene.add(tutorialRing);
function renderTutorialPanel(): void {
  const step = Math.max(1, tutorialSteps.indexOf(guidedTutorialStep));
  const text = `Step ${step}/${tutorialSteps.length - 1}: ${tutorialObjective(guidedTutorialStep, mobileInput.getMode()==='on'?'touch':'keyboard')}`;
  const objective = tutorialPanel.querySelector('[data-tutorial-objective]')!;
  if(objective.textContent !== text) objective.textContent = text;
}

function tutorialEvent(event:string,mode?:string):void{if(connectionReady())socket.send(JSON.stringify({type:'analyticsEvent',event,mode}));}
function setGuidedTutorial(active:boolean,replay=false):void{
  ambientTraffic?.setTutorialMode(active);
  guidedTutorialActive=active;guidedTutorialStep='throttle';guidedTutorialStepAt=performance.now();guidedTutorialTargetAirport=undefined;
  try{localStorage.setItem(guidedTutorialKey,active?'active':'completed');}catch{/* server is durable */}
  if(connectionReady())socket.send(JSON.stringify({type:'tutorialState',tutorialStatus:active?'started':'completed'}));
  if(replay)tutorialEvent('tutorial_retried',TUTORIAL_VERSION);
  document.body.classList.toggle('tutorial-flight-active',active);
  if(active){
    heldActions.clear(); waypoint=null; setLocalTimePreset('day'); cityEvent=null; activeWeatherZone = undefined; document.body.dataset.weather='clear';
    ambientTraffic?.syncEventRoutes([]); ambientTraffic?.setStormEvent(false);
    skyChallenges?.cancel();
    applyServerSelectedAircraft('trainer', false);
    restartGame(false); updateDynamicEventHud();
  }
  tutorialPanel.hidden = !active; tutorialCompletePanel.hidden = true;
  renderTutorialPanel();
}
function exitGuidedTutorial(status:'completed'|'skipped'):void{
  ambientTraffic?.setTutorialMode(false);
  guidedTutorialActive=false;tutorialPanel.hidden=true;tutorialRing.visible=false;tutorialCompletePanel.hidden=status!=='completed';document.body.classList.remove('tutorial-flight-active');waypoint=null;try{localStorage.setItem(guidedTutorialKey,status);}catch{/* server is durable */}
  if(connectionReady())socket.send(JSON.stringify({type:'tutorialState',tutorialStatus:status}));updateNavigationHud();
}
function advanceGuidedTutorial(signal:string):void{
  if(!guidedTutorialActive)return;const next=nextTutorialStep(guidedTutorialStep,signal);if(next===guidedTutorialStep)return;
  tutorialEvent('tutorial_step_completed',guidedTutorialStep);guidedTutorialStep=next;guidedTutorialStepAt=performance.now();
  if(next==='waypoint')setActivityWaypoint(airplane.position.x-Math.sin(heading)*1800,airplane.position.z-Math.cos(heading)*1800,'Tutorial Marker');
  if(next==='turn')setActivityWaypoint(airplane.position.x-Math.sin(heading+.55)*1800,airplane.position.z-Math.cos(heading+.55)*1800,'Turn Marker');
  if(next==='landingSetup'){guidedTutorialTargetAirport=airports.filter(item=>item.id!==spawnAirport.id).map(item=>({item,d:Math.hypot(item.x-airplane.position.x,item.z-airplane.position.z)})).sort((a,b)=>a.d-b.d)[0]?.item??centralAirport;setActivityWaypoint(guidedTutorialTargetAirport.x,guidedTutorialTargetAirport.z,guidedTutorialTargetAirport.name);}
  showProgressMessage(`TUTORIAL · ${tutorialObjective(next,mobileInput.getMode()==='on'?'touch':'keyboard').toUpperCase()}`);
}
function updateGuidedTutorial():void{
  if(!guidedTutorialActive||crashed){tutorialRing.visible=false;return;}
  renderTutorialPanel();
  tutorialRing.visible=Boolean(waypoint);
  if(waypoint){tutorialRing.position.set(waypoint.x, guidedTutorialStep==='land'||guidedTutorialStep==='landingSetup' ? getTerrainHeight(waypoint.x,waypoint.z)+18 : getTerrainHeight(waypoint.x,waypoint.z)+180,waypoint.z);tutorialRing.lookAt(airplane.position);}
  const touchSteering = mobileInput.getSteeringInput();
  if(guidedTutorialStep==='controls'&&(['pitchUp','pitchDown','yawLeft','yawRight','rollLeft','rollRight'].some(action=>heldActions.has(action as FlightAction))||Math.abs(touchSteering.x)>.05||Math.abs(touchSteering.y)>.05))advanceGuidedTutorial('steered');
  else if(guidedTutorialStep==='throttle'&&(heldActions.has('throttleUp')||(mobileInput.getThrottleTarget()??0)>.2))advanceGuidedTutorial('throttle');
  else if(guidedTutorialStep==='takeoffRoll'&&onGround&&currentSpeed>=currentAircraft.takeoffSpeed*.65)advanceGuidedTutorial('takeoffSpeed');
  else if(guidedTutorialStep==='liftOff'&&!onGround&&altitudeAboveTerrain()>=30)advanceGuidedTutorial('airborne');
  else if((guidedTutorialStep==='waypoint'||guidedTutorialStep==='turn')&&waypoint&&Math.hypot(airplane.position.x-waypoint.x,airplane.position.z-waypoint.z)<260)advanceGuidedTutorial(guidedTutorialStep==='waypoint'?'waypointReached':'turned');
  else if(guidedTutorialStep==='landingSetup'&&guidedTutorialTargetAirport&&Math.hypot(airplane.position.x-guidedTutorialTargetAirport.x,airplane.position.z-guidedTutorialTargetAirport.z)<1400)advanceGuidedTutorial('landingSetup');
  else if(guidedTutorialStep==='reward'&&performance.now()-guidedTutorialStepAt>3500)advanceGuidedTutorial('continue');
  else if(guidedTutorialStep==='next'&&performance.now()-guidedTutorialStepAt>4500){exitGuidedTutorial('completed');gameplayFeedback.push({type:'mission',primaryText:'TUTORIAL COMPLETE',secondaryText:'CHOOSE A MISSION OR KEEP FLYING',intensity:'major'});}
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

function missionRequirements(definition: CityMission): readonly string[] {
  return definition.requirements.allCityTerritories
    ? territoryDefinitions.map((item) => item.id)
    : definition.requirements.requiredTerritoryIds ?? definition.requirements.territoryIds ?? [];
}

function missionProgress(definition: CityMission, attempt: NetworkMissionAttempt): { text: string; value: number; target: number } {
  const requirements = definition.requirements;
  const territoryIds = missionRequirements(definition);
  const ownedIds = attempt.ownedTerritoryIds ?? territoryIds.filter((id) => territoryState.get(id)?.controllerId === localPlayerId);
  if (definition.type === 'territoryHold') {
    const places = territoryIds.map((id) => `${territoryState.get(id)?.controllerId === localPlayerId ? '✓' : '○'} ${territoryDefinitions.find((item) => item.id === id)?.displayName ?? id}`);
    const duration = requirements.holdDurationSeconds ?? requirements.durationSeconds ?? 0;
    return { text: `${places.join(' · ')}\nOWNED ${ownedIds.length} / ${territoryIds.length}\nHOLD ${Math.floor(attempt.progress / 60)}:${String(attempt.progress % 60).padStart(2, '0')} / ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`, value: attempt.progress, target: duration || 1 };
  }
  if (definition.type === 'airborneHold') return { text: `Airborne ${Math.floor(attempt.progress)} / ${requirements.durationSeconds ?? 60} seconds`, value: attempt.progress, target: requirements.durationSeconds ?? 60 };
  if (definition.type === 'straightDistance') return { text: `${((attempt.distanceMeters ?? 0) / 1000).toFixed(1)} / ${((requirements.meters ?? 0) / 1000).toFixed(0)} km straight`, value: attempt.progress, target: requirements.meters ?? 1 };
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
  if (definition.type === 'challenge') {
    const challenge = cityWorld.skyChallenges?.find((item) => item.id === requirements.challengeId);
    const gateCount = challenge?.gates.length ?? 4;
    const gateNumber = Math.min(gateCount, Math.floor(attempt.progress) + 1);
    const nextGate = challenge?.gates[Math.min(gateCount - 1, Math.floor(attempt.progress))];
    const nextDistance = nextGate
      ? `${(Math.hypot(airplane.position.x - nextGate.x, airplane.position.z - nextGate.z) / 1000).toFixed(1)} KM`
      : '—';
    const remaining = attempt.challengeEndsAt ? ` · ${Math.max(0, Math.ceil((attempt.challengeEndsAt - Date.now()) / 1000))}s left` : ' · fly to the first gate';
    return { text: `SPEED COURSE — GATE ${gateNumber}/${gateCount}\nNEXT GATE — ${nextDistance}${remaining}`, value: attempt.progress, target: gateCount };
  }
  if (definition.type === 'event') {
    const event = cityEvent?.eventType === requirements.eventType ? cityEvent : null;
    if (!event || event.lifecycle === 'completed' || event.lifecycle === 'failed' || event.lifecycle === 'cooldown') {
      return { text: `WAIT FOR ${definition.displayName} · then join the marked event`, value: 0, target: 1 };
    }
    const seconds = Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000));
    if (event.eventType === 'aceIntercept') {
      return { text: `DESTROY THE ACE · ${event.bossHealth ?? event.bossMaxHealth ?? 0}/${event.bossMaxHealth ?? 0} HULL · ${seconds}s left`, value: 0, target: 1 };
    }
    if (event.eventType === 'vipEscort') {
      const destinationPoint = event.route.at(-1);
      const destination = destinationPoint && airports.reduce((best, airport) =>
        Math.hypot(airport.x - destinationPoint.x, airport.z - destinationPoint.z) < Math.hypot(best.x - destinationPoint.x, best.z - destinationPoint.z) ? airport : best, airports[0]);
      const distance = destinationPoint ? Math.hypot(event.objective.x - destinationPoint.x, event.objective.z - destinationPoint.z) : 0;
      return { text: `PROTECT THE VIP PLANE · HULL ${event.bossHealth ?? 0}/${event.bossMaxHealth ?? 0} · ${destination?.name ?? 'destination'} · ${(distance / 1000).toFixed(1)} km · ${seconds}s left`, value: 0, target: 1 };
    }
    const gates = event.route.length;
    const passed = Math.min(gates, Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0));
    return { text: `GOLD GATES ${passed}/${gates} · ${seconds}s left`, value: passed, target: gates || 1 };
  }
  if (definition.type === 'territoryUniqueKills') return { text: `OWNED ${ownedIds.length} / ${territoryIds.length}\n${attempt.completedIds.length} / ${requirements.uniqueKills ?? 3} different pilots while controlling ${territoryDefinitions.find((item) => item.id === territoryIds[0])?.displayName ?? 'the area'}`, value: attempt.progress, target: requirements.uniqueKills ?? 3 };
  if (definition.type === 'precisionLanding') {
    const guidance = landingAssistActive ? ` · SPEED ${landingStatus.speedSafe ? 'GOOD' : 'TOO FAST'} · DESCENT ${landingStatus.descentSafe ? 'GOOD' : 'TOO HARD'} · LEVEL ${landingStatus.bankSafe ? 'GOOD' : 'WINGS'}` : '';
    return { text: `Land smoothly at ${airports.find((item) => item.id === requirements.airportId)?.name ?? 'the marked airport'}${guidance}`, value: attempt.progress, target: requirements.minimumScore ?? 1 };
  }
  if (definition.type === 'assignedHunter') {
    const hunter = attempt.targetId ? remotePlayers.get(attempt.targetId) : undefined;
    return { text: `Destroy ${hunter?.displayName ?? 'your marked Hunter'}`, value: attempt.progress, target: 1 };
  }
  if (definition.type === 'wantedSurvival') return { text: attempt.eventId ? 'MOST WANTED · survive until the timer ends' : `DANGER ${localHeat}/5 · cause trouble, then survive Most Wanted`, value: attempt.progress, target: 1 };
  if (definition.type === 'liveScoreRank') {
    const humans = [...cityHumanRoster.values()].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
    const rank = humans.findIndex((entry) => entry.playerId === localPlayerId) + 1;
    return { text: humans.length < 2 ? 'Compete with another real pilot to reach #1' : `Live Dallas Score rank #${rank || '—'} of ${humans.length} · reach #1`, value: attempt.progress, target: 1 };
  }
  return { text: definition.description, value: attempt.progress, target: 1 };
}

function missionWaypoint(definition: CityMission, attempt?: NetworkMissionAttempt): { x: number; z: number; label: string } | undefined {
  const airportId = definition.requirements.airportId ?? definition.requirements.airportIds?.find((id) => !attempt?.completedIds.includes(id));
  const airport = airports.find((item) => item.id === airportId);
  if (airport) return { x: airport.x, z: airport.z, label: airport.name };
  const territoryId = missionRequirements(definition).find((id) => territoryState.get(id)?.controllerId !== localPlayerId) ?? missionRequirements(definition)[0];
  const territory = territoryDefinitions.find((item) => item.id === territoryId);
  if (territory) return { x: territory.center.x, z: territory.center.z, label: territory.displayName };
  const challenge = cityWorld.skyChallenges?.find((item) => item.id === definition.requirements.challengeId);
  const currentGate = challenge?.gates[Math.min(challenge.gates.length - 1, Math.floor(attempt?.progress ?? 0))];
  if (challenge && currentGate) return { x: currentGate.x, z: currentGate.z, label: challenge.name };
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
function missionOverlayProgress(definition: CityMission, progress: ReturnType<typeof missionProgress>): string {
  const lines = progress.text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    return [...lines].reverse().find((line) => /\d+\s*\/\s*\d+|\d+:\d+/.test(line)) ?? lines.at(-1)!;
  }
  if (lines[0] && lines[0] !== definition.description) return lines[0];
  return `Progress: ${Math.min(progress.value, progress.target)}/${progress.target}`;
}

function updateMissionHud(): void {
  const active = serverProfile.missions[cityId]?.active;
  const definition = active && missionForCity(cityId, active.missionId);
  if (definition && active) {
    const mobileProgress = missionProgress(definition, active);
    missionProgressElement.textContent = `${Math.min(mobileProgress.value, mobileProgress.target)}/${mobileProgress.target}`;
    activeMissionTitleElement.textContent = `MISSION: ${definition.displayName}`;
    activeMissionObjectiveElement.textContent = definition.description;
    activeMissionProgressElement.textContent = missionOverlayProgress(definition, mobileProgress);
    activeMissionOverlayElement.hidden = false;
  } else {
    missionProgressElement.textContent = Date.now() < completedMissionUntil ? 'DONE' : profileActiveMissionCity(serverProfile) ? 'AWAY' : '—';
    activeMissionOverlayElement.hidden = true;
    activeMissionTitleElement.textContent = '';
    activeMissionObjectiveElement.textContent = '';
    activeMissionProgressElement.textContent = '';
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
        ? `Requires ${aircraftDefinitions[required].name} — equip it in Garage.`
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
  const discoveryProgress = discoverySystem?.getProgress() ?? { discovered: 0, total: 0, percent: 0 };
  const discovered = discoverySystem?.getMapMarkers().filter((marker) => marker.discovered).map((marker) => marker.label) ?? [];
  const wantedPlayerId = cityEvent?.eventType === 'mostWanted' ? cityEvent.wantedPlayerId : undefined;
  const players = [
    {
      id: localPlayerId ?? undefined,
      name: displayName,
      aircraft: aircraftDisplayName(aircraftType),
      distance: 0,
      lifecycle: localPilotLifecycle(),
      score: cityHumanRoster.get(localPlayerId ?? '')?.score ?? score,
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
        challenge: !remote.isBot && remote.lifeState === 'alive' ? () => socket.send(JSON.stringify({ type: 'pvpChallengeInvite', opponentId: remote.playerId, mode: 'dogfight' })) : undefined,
        sprint: !remote.isBot && remote.lifeState === 'alive' ? () => {
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
      ownedTerritories: ownedTerritoriesForPlayer(player.playerId),
      mostWanted: wantedPlayerId === player.playerId, king: kingPlayerId === player.playerId,
      challenge: player.lifeState === 'alive' ? () => socket.send(JSON.stringify({ type: 'pvpChallengeInvite', opponentId: player.playerId, mode: 'dogfight' })) : undefined,
      sprint: player.lifeState === 'alive' ? () => {
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
    city: { name: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', timePreset: worldTimeOfDay.toUpperCase(), changeCity: openWorldSelector },
    intercity:{routes:routesFromCity(cityId).map(route=>({routeId:route.routeId,destination:route.toCityId==='dallas'?'Dallas':'Milwaukee',distanceLabel:route.distanceLabel,recommendedAircraft:route.recommendedAircraft.toUpperCase(),estimatedFlightTime:route.estimatedFlightTime,available:onGround&&!crashed&&!profileActiveMissionAttempt(serverProfile),reason:!onGround?'Land and stop first.':profileActiveMissionAttempt(serverProfile)?'Finish or leave your active mission.':undefined,start:()=>socket.send(JSON.stringify({type:'intercityRouteStart',routeId:route.routeId}))}))},
    missions: {
      activeId: profileActiveMissionAttempt(serverProfile)?.missionId,
      activeCity: profileActiveMissionCity(serverProfile),
      entries: missionsForCity(cityId).map((definition) => {
        const active = serverProfile.missions[cityId]?.active?.missionId === definition.id ? serverProfile.missions[cityId]?.active : undefined;
        const completion = serverProfile.missions[cityId]?.completions[definition.id];
        const target = missionWaypoint(definition, active);
        const progress = active ? missionProgress(definition, active) : undefined;
        return {
          id: definition.id, name: definition.displayName, detail: definition.type === 'stuntPair' ? 'This retired mission is no longer available. Choose another mission.' : definition.description, difficulty: definition.difficulty, retired: definition.type === 'stuntPair',
          territoryIds: missionRequirements(definition),
          credits: definition.creditReward, score: definition.scoreReward,
          completions: completion?.count ?? 0, cooldownUntil: (completion?.lastCompletedAt ?? 0) + definition.replayCooldownMs,
          progressText: progress?.text, progress: progress?.value, target: progress?.target,
          setWaypoint: target ? () => setWaypoint(target.x, target.z, target.label) : undefined,
        };
      }),
      accept: (missionId, replace) => socket.send(JSON.stringify({ type: 'missionAccept', missionId, replaceMission: replace,
        expectedAttemptId: replace ? activeMissionAttemptId : undefined })),
      abandon: () => socket.send(JSON.stringify({ type: 'missionAbandon', missionCityId: profileActiveMissionCity(serverProfile), expectedAttemptId: activeMissionAttemptId })),
    },
    progression: {
      credits, score, pilotProgress: serverProfile.pilotProgress, dailyStreak: serverProfile.dailyStreak,
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
    territories: { city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', entries: territories,
      legend: territoryDefinitions.map(({ displayName, fixedColor, colorName }) => ({ name: displayName, color: fixedColor, colorName })),
      neutralColor: neutralTerritoryColor },
    objectives: { daily: objectiveItems(objectiveCycle?.daily), weekly: objectiveItems(objectiveCycle?.weekly), dailyId: objectiveCycle?.dailyId, weeklyId: objectiveCycle?.weeklyId },
    mastery: { city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', level: mastery.level, xp: mastery.xp,
      levelStartXp: masteryThreshold(mastery.level), nextXp: masteryThreshold(Math.min(25, mastery.level + 1)), rewards: mastery.unlockedRewards },
    leaderboards: weeklyLeaderboards.map((board) => ({ category: board.category, weekId: board.weekId, localRank: board.localRank, entries: board.top.map((entry) => ({ name: entry.pilotName, value: entry.value, you: entry.pilotId === localPlayerId })) })),
    activities,
    liveEvent,
    stunts: stuntGuide,
    discoveries: {
      city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee',
      discovered,
      remaining: Math.max(0, discoveryProgress.total - discoveryProgress.discovered),
      total: discoveryProgress.total,
      percent: discoveryProgress.percent,
      openMap: () => { pilotMenu.close(); worldMap.setOpen(true); contextualHints.trigger('firstDestination'); },
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
      },
    },
    navigation: {
      enabled: navigationMarkersEnabled,
      toggle: () => {
        navigationMarkersEnabled = !navigationMarkersEnabled;
        persistedPlayer.navigationMarkersEnabled = navigationMarkersEnabled;
        navigationBeacons.setEnabled(navigationMarkersEnabled);
        savePlayerProgress();
      },
    },
    preferences:{touchMode:mobileInput.getMode(),touchLayout:mobileInput.isTouchLayout(),setTouchMode:(mode:TouchControlsMode)=>{mobileInput.setMode(mode);syncDesktopControlsHelp();if(connectionReady())socket.send(JSON.stringify({type:'analyticsEvent',event:'touch_controls_enabled',mode}));},graphicsQuality:graphicsQualityMode,setGraphicsQuality:(mode:GraphicsQualityMode)=>{graphicsQualityMode=mode;try{localStorage.setItem('airport-chaos-graphics-quality-v1',mode);}catch{/* optional */}if(connectionReady())socket.send(JSON.stringify({type:'analyticsEvent',event:'graphics_quality_changed',mode}));renderPilotMenu(true);},mobileLayout:mobileInput.getLayout(),setMobileControl:(control:MobileControlId,placement:Partial<MobileControlPlacement>)=>mobileInput.setPlacement(control,placement),resetMobileLayout:()=>mobileInput.resetLayout()},
    restart:()=>{if(window.confirm('Restart and respawn at the airport?')){pilotMenu.close();restartGame();}},
    audio: { muted: audioMuted, toggle: toggleAudio, levels: audioLevels, setLevel: setAudioLevel },
    guide: { open: () => { pilotMenu.close(); showFirstRunGuide(); },replay:()=>{pilotMenu.close();setGuidedTutorial(true,true);} },
  };
}

function renderPilotMenu(force = false): void {
  const data = pilotMenuData();
  if (pilotMenu.isOpen() && !force) pilotMenu.refresh(data);
  else pilotMenu.open(data);
}

let nextPilotMenuRefreshAt = 0;
function refreshPilotMenu(): void {
  if (!pilotMenu.isOpen() || aircraftGarage.isOpen() || worldMap.isOpen()) return;
  const now = performance.now();
  if (now < nextPilotMenuRefreshAt) return;
  nextPilotMenuRefreshAt = now + 1_000;
  renderPilotMenu();
}

function openPilotMenu(): void {
  if (aircraftGarage.isOpen()) return;
  if (worldMap.isOpen()) worldMap.setOpen(false);
  heldActions.clear();
  renderPilotMenu(true);
}

function togglePilotMenu(): void {
  if (pilotMenu.isOpen()) {
    pilotMenu.close();
    return;
  }
  openPilotMenu();
}

flightMenuButtonElement.addEventListener('click', togglePilotMenu);
flightWorldButtonElement.addEventListener('click', openWorldSelector);
const toggleWorldMapFromHud = () => {
  if (pilotMenu.isOpen()) pilotMenu.close();
  contextualHints.dismiss();
  worldMap.toggle();
  if (worldMap.isOpen()) contextualHints.trigger('firstDestination');
};
flightMapButtonElement.addEventListener('click', toggleWorldMapFromHud);
worldMapCloseElement.addEventListener('click', () => worldMap.setOpen(false));
radarPanelElement.addEventListener('click', toggleWorldMapFromHud);
radarPanelElement.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleWorldMapFromHud();
});

window.addEventListener('keydown', (event) => {
  if (pilotMenu.isOpen() || aircraftGarage.isOpen()) return;
  if (event.code === menuBindings.map) {
    event.preventDefault();
    contextualHints.dismiss();
    worldMap.toggle();
    if (worldMap.isOpen()) contextualHints.trigger('firstDestination');
  } else if (event.code === 'Escape' && worldMap.isOpen()) {
    event.preventDefault();
    worldMap.setOpen(false);
  }
});

const applyCameraZoom = (zoomFactor: number): void => {
  cameraDistanceMultiplier = THREE.MathUtils.clamp(cameraDistanceMultiplier * zoomFactor, 0.62, 1.8);
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
  // Controls and HUD elements own their own pointers because they are layered
  // above the canvas. Only unused gameplay canvas space reaches this handler.
  const touch = event.pointerType === 'touch';
  if ((!touch && (event.pointerType !== 'mouse' || event.button !== 0)) || worldMap.isOpen() || pilotMenu.isOpen() || aircraftGarage.isOpen()) return;
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
renderer.domElement.addEventListener('dragstart', (event) => event.preventDefault());
renderer.domElement.addEventListener('wheel', (event) => {
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
type FireBlockedReason = 'menu' | 'protection' | 'lifecycle' | 'cooldown' | 'socket' | 'invalid_state';
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
cityTerritoriesPanel.update(cityTerritoryEntries(), null, false);
const leaderMessageElement = document.querySelector<HTMLDivElement>('#leader-message')!;
const cityHumanRoster = new Map<string, LeaderboardPlayer>();
type HumanRadarTrack = { x: number; z: number };
const humanRadarTracks = new Map<string, HumanRadarTrack>();
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
  heldActions.clear();
  crashed = false;
  health = maxHealth;
  throttle = preset.onGround || preset.speed === 0 ? 0 : 0.62;
  mobileInput.setThrottleState(throttle);
  currentSpeed = preset.onGround || preset.speed === 0 ? 0 : preset.speed && aircraftType === 'fighter' && flightTestMode ? preset.speed : Math.min(currentAircraft.maxSpeed * 0.62, 58);
  verticalSpeed = 0;
  heading = preset.heading;
  pitch = preset.pitch ?? 0;
  roll = 0;
  rollControlStrength = 0;
  pitchControlStrength = 0;
  yawControlStrength = 0;
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
  updateOsmCityChunks(airplane.position);
  cityWorld.updateWorldStreaming?.(airplane.position, velocity);
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
    flash.mesh.visible = !guidedTutorialActive;
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
    projectile.mesh.visible = !guidedTutorialActive;
    // Projectile removals are normally explicit.  This bounded fallback is
    // necessary when a slow socket drops an obsolete remove/state frame: the
    // server range limits a round to about two seconds, so an unconfirmed
    // visual cannot become a permanent runway line.
    if (now - projectile.spawnedAt > 3_500 || now - projectile.lastAuthoritativeAt > 1_200) {
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
    shot.mesh.visible = !guidedTutorialActive;
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
  if (destructionEffects.length >= 6) {
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
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
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
    effect.group.visible = !guidedTutorialActive;
    effect.elapsed += delta;
    const progress = effect.elapsed / 1.2;
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
    if (effect.elapsed < 1.2) continue;
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
      } else {
        humanRadarTracks.set(player.playerId, { x: player.position.x, z: player.position.z });
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
    } else {
      humanRadarTracks.set(player.playerId, { x: player.position.x, z: player.position.z });
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
      displayName: player.displayName ?? 'PLAYER',
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
      interpolationElapsed: 0.1,
      interpolationDuration: 0.1,
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

  remote.previousPosition.copy(remote.plane.position);
  remote.previousQuaternion.copy(remote.plane.quaternion);
  const stateInterval = THREE.MathUtils.clamp(remote.timeSinceUpdate, 0.08, 0.25);
  combatOffset.set(player.position.x, player.position.y, player.position.z).sub(remote.targetPosition).multiplyScalar(1 / stateInterval);
  remote.velocity.lerp(combatOffset, 0.55);
  remote.targetPosition.set(player.position.x, player.position.y, player.position.z);
  remote.targetQuaternion.setFromEuler(remoteEuler);
  // Smooth packet-interval jitter without increasing the 10Hz network rate.
  const observedBlend = THREE.MathUtils.clamp(remote.timeSinceUpdate * 1.08, 0.09, 0.2);
  remote.interpolationDuration = THREE.MathUtils.lerp(remote.interpolationDuration, observedBlend, 0.35);
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
  if (lifeStateChanged) remote.nearMissActive = false;
  remote.plane.visible = lifeState === 'alive';
  remote.playerProxy.visible = false;
  if (lifeState !== 'alive') remote.identityTag.visible = remote.hullTag.visible = remote.targetBrackets.visible = false;
}

const identityLabelProjection = new THREE.Vector3();
function updateRemotePlayers(delta: number): void {
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
    remote.plane.visible = !guidedTutorialActive && remote.lifeState === 'alive';
    const identityVisible = !guidedTutorialActive && remoteIdentityVisible(remote);
    const distance = remote.plane.position.distanceTo(airplane.position);
    const targeted = selectedCombatTarget?.remote === remote;
    const worldPerPixel = distance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(1, window.innerHeight);
    identityLabelProjection.copy(remote.plane.position).project(camera);
    const nearReticle = Math.abs(identityLabelProjection.x) < 0.18 && Math.abs(identityLabelProjection.y) < 0.24;
    remote.identityTag.visible = identityVisible && distance > 35 && distance <= 7_000 &&
      identityLabelProjection.z > -1 && identityLabelProjection.z < 1 && (targeted || !nearReticle);
    if (remote.identityTag.visible) {
      const locked = Boolean(targeted && selectedCombatTarget?.locked);
      const missionTarget = serverProfile.missions[cityId]?.active?.targetId === remote.playerId;
      const now = performance.now();
      if (now >= (remote.identityTag.userData.nextPaintAt as number ?? 0)) {
        paintPlayerIdentityTag(remote.identityTag, remote.displayName, remote.aircraftType,
          remote.playerId === kingPlayerId, remote.isBot,
          remote.identityTag.userData.ownershipColors as readonly string[] ?? [], distance,
          targeted, locked, missionTarget);
        remote.identityTag.userData.nextPaintAt = now + 500;
      }
      const widthPixels = locked ? 188 : targeted ? 176 : missionTarget ? 168 : distance <= 900 ? 155 : distance <= 3_000 ? 140 : 124;
      remote.identityTag.scale.set(worldPerPixel * widthPixels, worldPerPixel * widthPixels * 0.25, 1);
      remote.identityTag.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, worldPerPixel * (targeted ? 110 : 88));
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
      remote.playerProxy.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, worldPerPixel * (targetPixels * 0.7 + 8));
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
  if (guidedTutorialActive) { heldActions.delete('fire'); clearCombatTarget(); updateLockCircle(); return; }
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
  const assetPropellers = plane.userData.assetPropellers as THREE.Object3D[] | undefined;
  const propellers = assetPropellers?.length ? assetPropellers : visuals.propeller ? [visuals.propeller] : [];
  for (const propeller of propellers) propeller.rotation.z += delta * (7 + power * 34);
  const isFighter = plane.userData.aircraftType === 'fighter';
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
  visuals.boostMaterial.opacity = boost * (isFighter ? 0.78 : plane.userData.aircraftType === 'trainer' ? 0.16 : 0.42);
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
    if (remote.lifeState !== 'alive' || !entityCapabilities(remote.entityType).collidable) {
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

  const touchSteering = mobileInput.getSteeringInput();
  const keyboardRollInput = Number(heldActions.has('rollLeft')) - Number(heldActions.has('rollRight'));
  const keyboardYawInput = Number(heldActions.has('yawLeft')) - Number(heldActions.has('yawRight'));
  const rollInput = keyboardRollInput || -touchSteering.x;
  const yawInput = keyboardYawInput || -touchSteering.x;
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
  const pitchInput = keyboardPitchInput || -touchSteering.y;
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
    rollControlStrength = 0;
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
  // Roll is an abstract, filtered control command. Releasing it damps the
  // command first, then aerodynamics gently level the wings; neither path
  // touches heading, so the aircraft carries on along its earned new course.
  const rollResponse = rollInput === 0
    ? (currentAircraft.rollInputRelease ?? currentAircraft.rollInputResponse * 0.8)
    : currentAircraft.rollInputResponse;
  rollControlStrength = THREE.MathUtils.lerp(
    rollControlStrength,
    rollInput,
    1 - Math.exp(-rollResponse * delta),
  );
  roll += rollControlStrength * delta * currentAircraft.rollRate;
  if (rollInput === 0) {
    // Roll is intentionally unbounded while commanded. Use the shortest
    // equivalent angle when leveling so a completed 360° roll does not cause
    // an artificial extra revolution on release.
    const bankFromLevel = Math.atan2(Math.sin(roll), Math.cos(roll));
    roll -= bankFromLevel * (1 - Math.exp(-(currentAircraft.rollLevelRate ?? currentAircraft.rollRate * 0.75) * delta));
    if (landingAssistActive) {
      // The approach helper only levels the wings; it never changes heading.
      // A second, gentle damping pass makes reasonable runway corrections
      // forgiving without turning the feature into an automatic landing.
      const approachBank = Math.atan2(Math.sin(roll), Math.cos(roll));
      roll -= approachBank * (1 - Math.exp(-(currentAircraft.rollLevelRate ?? 0.7) * 0.55 * delta));
    }
  }
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
    // Never clamp continuous roll here: 2π is level, not excessive bank.
    // The ordinary roll-release path already levels via the wrapped angle.
  }
  const pitchRollLeak = roll - pitchStageRoll;
  const pitchYawLeak = heading - pitchStageHeading;
  heading += yawControlStrength * delta * steeringAuthority;
  heading += Math.sin(roll) * speedRatio * currentAircraft.bankTurn * delta;

  airplane.rotation.set(pitch, heading, roll, 'YXZ');
  if (import.meta.env.DEV) pitchBeforeQuaternion.copy(airplane.quaternion);
  airplane.rotateX(nextLocalPitch - localPitch);
  if (import.meta.env.DEV && pitchInput !== 0 && rollInput === 0 && yawInput === 0) {
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
  const drag = normalDrag + coastDrag;

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

  if (cameraOrbitDragging) {
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

  // Use absolute airspeed, not each aircraft's percentage of its own cap.
  // The previous curve saturated at 122 m/s, giving every cruising aircraft
  // identical peripheral speed feedback despite their 260–780 m/s envelopes.
  // Retain the existing FOV ceiling, Boost contribution and chase framing.
  const peripheralSpeed = THREE.MathUtils.clamp(
    (currentSpeed - 42) / (aircraftDefinitions.fighter.maxSpeed - 42), 0, 1,
  );
  const targetFov = CAMERA_CHASE_FOV
    + peripheralSpeed * 7.5
    + boostVisualStrength * 4.0
    // A little extra peripheral expansion near the ground makes roads and
    // buildings slide past more convincingly without moving the chase camera.
    + peripheralSpeed * (1 - THREE.MathUtils.clamp(altitudeAboveTerrain() / 900, 0, 1)) * 1.15;
  const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(0.15, delta * 2.5));
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

  if (cameraShakeTime > 0) {
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
  if (guidedTutorialActive) return false;
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
  if (stabilityQaMode) stabilityQaFrames += 1;
  const delta = Math.min(clock.getDelta(), 0.05);
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
  updateRemotePlayers(delta);
  updateGuidedTutorial();
  updateCombatTarget(delta);
  updateAircraftVisuals(delta);
  updateProjectiles(delta);
  updateFlashEffects(muzzleFlashes, muzzleFlashPool, delta);
  updateFlashEffects(impactFlashes, impactFlashPool, delta);
  updateDestructionEffects(delta);
  updateOsmCityChunks(airplane.position);
  cityWorld.updateWorldStreaming?.(airplane.position, velocity);
  cityWorld.updateWorldVisuals?.(delta);
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
  if (!crashed && runStarted) updatePlayerInteractions();
  if (challengeModeEnabled) updateCheckpointFeedback(delta);
  updateEventVisual();
  updateCamera(delta);
  updateLockCircle();
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
  renderer.render(scene, camera);
}

if (stabilityQaMode) {
  const panel = document.createElement('pre');
  panel.className = 'stability-qa-panel';
  document.body.append(panel);
  let contextEvents = 0;
  let airborneSince: number | undefined;
  let takeoffSampleIndex = 0;
  let lastVisibilityFailureAt = -Infinity;
  let lastSampleAt = performance.now();
  let lastMaterialSampleAt = -Infinity;
  let materialCount = 0;
  const takeoffSampleSeconds = [0, 2, 5, 10, 20] as const;
  const report = (): void => {
    const sampleAt = performance.now();
    const fps = Math.round(stabilityQaFrames * 1000 / Math.max(1, sampleAt - lastSampleAt));
    stabilityQaFrames = 0;
    lastSampleAt = sampleAt;
    if (sampleAt - lastMaterialSampleAt >= 5_000) {
      lastMaterialSampleAt = sampleAt;
      const materials = new Set<number>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
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
    const paintOf = (root: THREE.Object3D) => { const colors: Record<string,string> = {}; root.traverse(object => { if(object instanceof THREE.Mesh) for(const material of Array.isArray(object.material)?object.material:[object.material]) if(material.name.startsWith('AC_LIVERY') && 'color' in material) colors[material.name] = (material.color as THREE.Color).getHexString(); }); return colors; };
    const snapshot = {
      tutorial: {active:guidedTutorialActive,step:guidedTutorialStep,crashed},
      cosmetics: {local:paintOf(airplane),remote:[...remotePlayers.values()].filter(player=>!player.isBot).map(player=>({id:player.playerId,paint:paintOf(player.plane)}))},
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps,
      materials: materialCount,
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
      heapMiB: heap ? `${(heap.usedJSHeapSize / 1048576).toFixed(1)}/${(heap.totalJSHeapSize / 1048576).toFixed(1)}` : 'unavailable',
      contextEvents,
    };
    panel.textContent = [
      'STABILITY QA · LOCAL ONLY',
      `GPU geo ${snapshot.geometries} · tex ${snapshot.textures} · materials ${snapshot.materials} · calls ${snapshot.calls} · tris ${snapshot.triangles} · FPS ${snapshot.fps}`,
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

const defaultSocketUrl = import.meta.env.DEV
  ? 'ws://localhost:8091'
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
const socketUrl = new URL(import.meta.env.VITE_WS_URL ?? defaultSocketUrl);
socketUrl.searchParams.set(CITY_QUERY_PARAM, cityId);
socketUrl.searchParams.set('pilotId', persistedPlayer.pilotId);
socketUrl.searchParams.set('pilotName', displayName);
socketUrl.searchParams.set('protocol', String(PROTOCOL_VERSION));
if (chaosQaMode) socketUrl.searchParams.set('chaosqa', '1');
const socket = new WebSocket(socketUrl);
let protocolReady = false;
let protocolBlocked = false;

function connectionReady(): boolean {
  return protocolReady && !protocolBlocked && socket.readyState === WebSocket.OPEN;
}

function blockProtocolConnection(message: string): void {
  if (protocolBlocked) return;
  protocolBlocked = true;
  protocolReady = false;
  showProgressMessage(message);
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(4002, 'Protocol mismatch');
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

function pendingProfileCredits(): number {
  return 0;
}

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
  if (flightTestMode || profileProgressTimer !== undefined) return;
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

function applyServerProfile(profile: unknown, rewardId?: string, revision = selectionRevision, equipRequestId?: number, creditReason?: string, preserveActiveAircraft = false, serverReset = false): boolean {
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
  }
  selectionRevision = revision;
  authoritativeSelectionApplied = true;
  const earnedCredits = profileHydrated ? Math.max(0, profile.credits - serverProfile.credits) : 0;
  serverProfile = profile;
  applyEquippedLivery(airplane, aircraftType, profile.cosmetics.equipped);
  activeMissionAttemptId = profileActiveMissionAttempt(profile)?.attemptId;
  refreshTerritoryBorders();
  updateMissionHud();
  profileHydrated = true;
  profileSyncUnavailableNotified = false;
  persistedPlayer.pilotId = profile.pilotId;
  persistedPlayer.selectedAircraft = profile.selectedAircraft;
  credits = profile.credits + pendingProfileCredits();
  if (earnedCredits > 0) {
    if (!creditReason && import.meta.env.DEV) console.warn(`CREDIT_REASON_MISSING amount=${earnedCredits}`);
    queueRewardFeedback(earnedCredits, 0, creditReason ?? 'Profile Sync');
    document.querySelector('#hud-credits')!.classList.remove('earned');
    void creditsElement.offsetWidth;
    document.querySelector('#hud-credits')!.classList.add('earned');
  }
  totalDistance = profile.totalDistance;
  totalSuccessfulLandings = profile.successfulLandings;
  displayName = profile.pilotName;
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
    selectedAircraft: profile.selectedAircraft,
    unlockedAircraft: profile.unlockedAircraft,
    economyVersion: profile.economyVersion,
    aircraftEntitlements: profile.aircraftEntitlements,
    testerCodeEnabled: profile.testerCodeEnabled,
    fighterTrial: profile.fighterTrial,
    cosmetics: profile.cosmetics,
  });
  updateProgressHud();
  if (visibleRecap && !flightRecapElement.hidden) showFlightRecap(visibleRecap.title, visibleRecap.landing, false);
  savePlayerProgress();
  if (equipConfirmed) showProgressMessage(`${aircraftDefinitions[profile.selectedAircraft].name} EQUIPPED`);
  return true;
}

function openWorldSelector(): void {
  pilotMenu.close();
  heldActions.clear();
  boostActive = false;
  window.dispatchEvent(new Event('airport-chaos-open-city-selector'));
}
window.addEventListener('airport-chaos-city-exit', (event) => {
  const destination = (event as CustomEvent<{ cityId: CityId; timePreset: 'day' | 'dusk';intercity?:boolean }>).detail;
  const activeMission = profileActiveMissionAttempt(serverProfile);
  if (!destination.intercity&&!window.confirm(activeMission ? 'Change city? Your active mission will end.' : 'Leave this flight and change city?')) return;
  if (activeMission && connectionReady()) socket.send(JSON.stringify({
    type: 'missionAbandon', missionCityId: profileActiveMissionCity(serverProfile), expectedAttemptId: activeMission.attemptId,
  }));
  // Cities is an explicit route transition, never a Garage action. Close any
  // independent overlay first because the Garage is shared with the start UI.
  aircraftGarage.close();
  pilotMenu.close();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  skyChallenges?.dispose();
  ambientTraffic?.dispose();
  navigationBeacons.dispose(scene);
  adPlacementManager.dispose(scene);
  cityWorld.disposeWorldStreaming?.();
  socket.close();
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

socket.addEventListener('open', () => { /* Welcome packet completes protocol verification. */ });

socket.addEventListener('message', (event) => {
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
  if (message.type === 'welcome') {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      blockProtocolConnection('Version mismatch — reload page and restart server');
      return;
    }
    if (!isNetworkProfile(message.profile) || !Number.isSafeInteger(message.selectionRevision) || message.selectionRevision < 0) {
      blockProtocolConnection('Server profile is incompatible — restart server and reload');
      return;
    }
    protocolReady = true;
    pendingEquip = undefined;
    selectionRevision = message.selectionRevision;
    localPlayerId = message.playerId;
    for (const id of repairHeartSprites.keys()) setHeartCooldown(id, 0);
    for (const cooldown of message.repairCooldowns ?? []) setHeartCooldown(cooldown.id, cooldown.remainingMs);
    fireCooldown = 0;
    applyLocalHull(message.health, message.maxHealth, message.profile.selectedAircraft);
    localLifeState = networkLifeState(message.lifeState);
    updateHealthDisplay();
    if (cityId === 'milwaukee') {
      spawnPosition.set(message.spawnPosition.x, message.spawnPosition.y, message.spawnPosition.z);
    } else {
      const airport = airports.find((candidate) => candidate.id === activeCity.spawn.airportId) ?? centralAirport;
      const slotOffset = airport.spawnOffset + message.spawnPosition.z - 45;
      spawnPosition.set(
        airport.x + Math.sin(airport.heading) * slotOffset,
        message.spawnPosition.y,
        airport.z + Math.cos(airport.heading) * slotOffset,
      );
    }
    spawnPosition.y = groundPlaneY(spawnPosition.x, spawnPosition.z);
    airplane.position.copy(spawnPosition);
    altitudeElement.textContent = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toString();
    if (matchMedia('(pointer: coarse)').matches || innerWidth <= 900) socket.send(JSON.stringify({ type:'analyticsEvent', event:'mobile_layout_used', mode:innerWidth <= 600 ? 'narrow' : 'wide' }));
    serverProfile = message.profile;

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
    if(message.profile.tutorial.status==='started' || guidedTutorialActive)setGuidedTutorial(true);
    applySocialState(message.social);
    reconcileRemotePlayers(message.players);
    for (const player of message.players) updateRemotePlayer(player);
    for (const heat of message.heatStates ?? []) applyHeatState(heat);
    applyTerritoryState(message.territories ?? []);
    weeklyLeaderboards = message.weeklyLeaderboards ?? [];
    applyCityEvent(message.event);
    flushProfileRewards();
    const referralCode = new URLSearchParams(window.location.search).get('ref');
    if (referralCode) socket.send(JSON.stringify({ type: 'referralAttach', code: referralCode }));
    sendLocalState();
    sendPlayerUpdate();
  } else if (!protocolReady || !profileHydrated) {
    // A profile/state message from an earlier connection generation must not
    // hydrate partial client state before a versioned welcome arrives.
    return;
  } else if (message.type === 'state') {
    updateRemotePlayer(message);
  } else if (message.type === 'remove') {
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
        required && (next.ownedTerritoryIds?.length ?? 0) < missionRequirements(required).length) {
        showProgressMessage('TERRITORY LOST · HOLD RESET TO 00:00');
      }
      serverProfile.missions[cityId] = message.state;
      activeMissionAttemptId = profileActiveMissionAttempt(serverProfile)?.attemptId;
      refreshTerritoryBorders();
      updateMissionHud();
    }
  } else if (message.type === 'missionResult') {
    if (message.ok && message.attemptId) { activeMissionAttemptId = message.attemptId; completedMissionUntil = 0; }
    showProgressMessage(message.ok ? 'MISSION ACCEPTED' : (message.reason ?? 'MISSION UNAVAILABLE'));
    if (message.ok && pilotMenu.isOpen()) pilotMenu.close();
    else if (pilotMenu.isOpen()) renderPilotMenu();
  } else if (message.type === 'missionCompleted') {
    activeMissionAttemptId = undefined;
    completedMissionUntil = Date.now() + 12_000;
    score += message.score;
    recordBestScore(score);
    updateScoreDisplay();
    showProgressMessage(`MISSION COMPLETE · ${missionForCity(cityId, message.missionId)?.displayName ?? 'MISSION'} · +${message.credits.toLocaleString()} Credits · +${message.score.toLocaleString()} Score`);
    gameplayFeedback.push({ type: 'mission', primaryText: 'MISSION COMPLETE', secondaryText: `+${message.credits.toLocaleString()} CREDITS · +${message.score.toLocaleString()} SCORE`, intensity: 'major' });
    updateMissionHud();
    sendPlayerUpdate();
  } else if (message.type === 'missionFailed') {
    activeMissionAttemptId = undefined;
    completedMissionUntil = 0;
    showProgressMessage(`MISSION FAILED · ${missionForCity(cityId, message.missionId)?.displayName ?? 'MISSION'} · ${message.reason}`);
    updateMissionHud();
  } else if (message.type === 'eventState') {
    applyCityEvent(message.event);
  } else if (message.type === 'eventClear') {
    applyCityEvent(undefined);
  } else if (message.type === 'eventAnnouncement') {
    showProgressMessage(`${message.name ?? 'SKY EVENT'} · +${message.reward ?? 0} CREDITS`);
    gameplayFeedback.push({ type: 'chaos-moment', primaryText: 'CHAOS MOMENT', secondaryText: message.name ?? 'SKY EVENT', intensity: 'major' });
  } else if (message.type === 'eventReward') {
    score += message.score;
    queueRewardFeedback(0, message.score);
    recordBestScore(score);
    updateScoreDisplay();
    showProgressMessage(message.reason);
    flightRecap.eventResults.push(`${message.reason} · +${message.credits} CREDITS`);
    sendPlayerUpdate();
  } else if (message.type === 'eventProgress') {
    showProgressMessage(message.message);
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
    updateScoreDisplay();
    showProgressMessage(message.reason);
    sendPlayerUpdate();
  } else if (message.type === 'chaosState') {
    score += message.score;
    queueRewardFeedback(0, message.score);
    recordBestScore(score);
    updateScoreDisplay();
    showProgressMessage(`${message.action.toUpperCase()} · CHAOS x${message.multiplier}`);
  } else if (message.type === 'chaosReward') {
    showProgressMessage(message.reason);
  } else if (message.type === 'dailyStreakClaimed') {
    showProgressMessage(`DAY ${message.day} PILOT STREAK · +${message.credits} CREDITS`);
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
    if (!applyServerProfile(message.profile, message.rewardId, message.selectionRevision, message.equipRequestId, message.creditReason, message.preserveActiveAircraft === true, message.serverReset === true)) {
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
  } else if (message.type === 'testerCodeResult') {
    aircraftGarage.showActionResult(message.reason);
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
  } else if (message.type === 'heatState') {
    applyHeatState(message);
  } else if (message.type === 'territoryState') {
    if (message.cityId === cityId) applyTerritoryState(message.territories);
    updateMissionHud();
  } else if (message.type === 'territoryNotice') {
    const territory = territoryDefinition(message.territoryId);
    if (territory && message.kind === 'underAttack') {
      gameplayFeedback.push({ type:'territory-contest', primaryText:'TERRITORY CONTESTED', secondaryText:territory.displayName.toUpperCase(), intensity:'medium' });
      territoryDefenseAlertId = territory.id;
      territoryDefenseTextElement.textContent = `⚠ ${territory.displayName.toUpperCase()} UNDER ATTACK${message.attackerName ? ` · ${message.attackerName}` : ''}`;
      territoryDefenseAlertElement.classList.remove('hidden');
    } else if (territory) {
      if (message.kind === 'captured') gameplayFeedback.push({ type: 'territory', primaryText: 'TERRITORY CAPTURED', secondaryText: territory.displayName.toUpperCase(), intensity: 'medium' });
      if (message.kind === 'captured') flightRecap.territories += 1;
      showProgressMessage(message.kind === 'captured'
      ? `${territory.displayName.toUpperCase()} CAPTURED +250`
      : message.kind === 'defenderInbound' ? `${territory.displayName.toUpperCase()} · DEFENDER INBOUND`
      : `ENTERING ${territory.displayName.toUpperCase()}`);
    }
  } else if (message.type === 'territoryReward') {
    const territory = territoryDefinition(message.territoryId);
    showProgressMessage(`${territory?.displayName.toUpperCase() ?? 'TERRITORY'} ${message.kind === 'capture' ? 'CAPTURED' : 'HELD'}`);
  } else if (message.type === 'objectiveComplete') {
    showProgressMessage(`OBJECTIVE COMPLETE: ${message.label.toUpperCase()}`);
  } else if (message.type === 'objectiveProgress') {
    showProgressMessage(`DAILY: ${message.label.toUpperCase()} ${message.progress}/${message.target}`);
  } else if (message.type === 'masteryLevel') {
    if (message.cityId === cityId) showProgressMessage(`${cityId.toUpperCase()} CITY LEVEL ${message.level}`);
  } else if (message.type === 'landingScored') {
    if(guidedTutorialActive&&guidedTutorialStep==='land')advanceGuidedTutorial('landed');
    const grade = `${message.grade} LANDING`;
    gameplayFeedback.push({ type: 'landing', primaryText: grade, secondaryText: `${message.quality} / 1,000`, intensity: message.grade === 'LEGENDARY' || message.grade === 'PERFECT' ? 'major' : 'medium' });
    queueAtcCallout(`landing-${message.grade}`, message.grade === 'ROUGH' ? 'TOWER: ROUGH LANDING' : 'TOWER: LANDING CONFIRMED', message.grade === 'PERFECT' || message.grade === 'LEGENDARY' ? 'SMOOTH TOUCHDOWN' : undefined);
    if (message.grade === 'PERFECT' || message.grade === 'LEGENDARY') {
      const airportName = airports.find((airport) => airport.id === message.airportId)?.name ?? 'THE AIRPORT';
    }
    if (visibleRecap) showFlightRecap(visibleRecap.title, grade, false);
  } else if (message.type === 'pilotLevelUp') {
    gameplayFeedback.push({ type: 'pilot-level', primaryText: `PILOT LEVEL ${message.level}`, secondaryText: message.title ? `TITLE UNLOCKED — ${message.title}` : undefined, intensity: 'major' });
  } else if (message.type === 'weeklyRewardClaimed') {
    gameplayFeedback.push({ type: 'weekly', primaryText: 'WEEKLY REWARD', secondaryText: `#${message.reward.rank} · +${message.reward.credits.toLocaleString()} CREDITS · ${message.reward.badge}`, intensity: 'major' });
  } else if (message.type === 'cosmeticResult') {
    aircraftGarage.showActionResult(message.ok ? `${message.action.toUpperCase()} COMPLETE` : (message.reason ?? 'COSMETIC UNAVAILABLE'));
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
    updateScoreDisplay();
    showProgressMessage('SKY CHALLENGE COMPLETE');
  } else if (message.type === 'projectileRemove') {
    removeClientProjectile(message.projectileId);
  } else if (message.type === 'damage') {
    spawnImpactFeedback(message.playerId);
    if (message.shooterId === localPlayerId && message.playerId !== localPlayerId) {
      if (combatQaElement) combatQaDetail = `shot: ${message.shooterId === localPlayerId ? 'assisted/ballistic' : 'remote'} · HIT`;
      showCombatMessage(`HIT +${message.damage}`, true);
      showHitMarker();
      playHitSound();
    }
    if (message.playerId === localPlayerId) {
      applyLocalHull(message.health, message.maxHealth);
      updateHealthDisplay(true);
      showCombatMessage(`-${message.damage} DAMAGE`);
      showDamageFeedback();
      playTone(150, 0.13, 'sawtooth', 0.05, 80, 0, 'combat');
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
    const destroyedType = message.playerId === localPlayerId ? aircraftType : remotePlayers.get(message.playerId)?.aircraftType;
    if (destroyedPlane && destroyedType) {
      createDestructionEffect(destroyedPlane.position, destroyedType);
      if (message.playerId !== localPlayerId && destroyedPlane.position.distanceTo(airplane.position) < 2_500) playDestructionSound();
    }
    if (message.playerId === localPlayerId) {
      localLifeState = 'destroyed';
      health = 0;
      updateHealthDisplay(true);
      endRun(message.cause === 'collision' ? 'MID-AIR COLLISION' : 'DESTROYED',
        message.cause === 'collision' ? 'MID-AIR COLLISION' : `DESTROYED BY ${message.killerDisplayName}`);
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
      flightRecap.kills += 1;
      gameplayFeedback.push({ type: 'combat', primaryText: 'DESTROYED', secondaryText: message.killerDisplayName.toUpperCase(), intensity: 'medium' });
      const destroyedHuman = cityHumanRoster.get(message.playerId)?.displayName;
      score = Math.max(score, message.killerScore);
      recordBestScore(score);
      handleContractKill();
      updateScoreDisplay();
      showCombatMessage(destroyedHuman ? `💥 ${destroyedHuman} DESTROYED` :
        message.killerReward ? `DESTROYED +${message.killerReward} Credits` : 'DESTROYED · NO DANGER BONUS', true);
    }
  } else if (message.type === 'respawn') {
    const lifeState = networkLifeState(message.lifeState);
    updateHumanRosterStatus(message.playerId, 'respawning');
    if (message.playerId === localPlayerId) {
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

socket.addEventListener('close', (event) => {
  window.clearInterval(stateSendTimer);
  cityHumanRoster.clear();
  humanRadarTracks.clear();
  playersPanel.update([], null);
  cityTerritoriesPanel.update(cityTerritoryEntries(), null, false);
  for (const playerId of [...remotePlayers.keys()]) removeRemotePlayer(playerId);
  pendingEquip = undefined;
  if (protocolBlocked) return;
  protocolReady = false;
  profileHydrated = false;
  showProgressMessage(event.code === 4001 ? 'OPENED IN ANOTHER TAB — RELOAD TO PLAY HERE' : 'SERVER DISCONNECTED');
});

socket.addEventListener('error', () => {
  if (protocolBlocked) return;
  showProgressMessage('SERVER CONNECTION ERROR');
});

// Same 10Hz transform stream, but not tied to requestAnimationFrame: Safari
// can suspend rendering when Chrome is foreground. Timer throttling still
// allows a current stationary transform without pretending the socket left.
const stateSendTimer = window.setInterval(sendLocalState, 100);
window.addEventListener('pagehide', () => { window.clearInterval(stateSendTimer); socket.close(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sendLocalState(); });

updateCamera(1);
showActiveCheckpoint();
updateScoreDisplay();
updateProgressHud();
updateHealthDisplay();
updatePendingAircraftEquip();
updateNavigationHud();
// The legacy Contracts UI is retired; Missions are profile-owned on the server.
savePlayerProgress(true);
animate();
