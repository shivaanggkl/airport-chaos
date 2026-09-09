import * as THREE from 'three';
import './style.css';
import { AdPlacementManager, attachAircraftLivery, getAircraftLivery } from './ad-placement';
import { aircraftDefinitions, aircraftMuzzleSockets, type AircraftDefinition, type AircraftType } from './aircraft';
import { AircraftGarage } from './garage';
import { AmbientTrafficSystem } from './ambient-traffic';
import { attachAircraftAsset, preloadAircraftAssets } from './assets';
import { CITY_QUERY_PARAM, activeCityFromUrl, type CityId } from './cities';
import { entityCapabilities, type EntityType } from './entity-types';
import { updateOsmCityChunks } from './osm-city';
import { SkyChallengeSystem } from './sky-challenges';
import { StuntComboSystem, stuntGuide, type LandingQuality } from './stunt-combo';
import { DiscoverySystem } from './discoveries';
import { ContextualHintSystem, contextualHintDefinitions, type ContextualHintId } from './contextual-hints';
import { NextActionSystem, type NextActionCandidate } from './next-action';
import { PilotMenu, type PilotMenuAction, type PilotMenuData } from './pilot-menu';
import { WorldMap, type WorldMapLayer } from './world-map';
import { LOCK_ANGLE, PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import { territoriesForCity, type CityTerritory } from '../../shared/city-territories.mjs';
import type {
  AirportDefinition,
  AirportId,
  RegionName,
} from './world';

const flightTestMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('flighttest') === '1';
const chaosQaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('chaosqa') === '1';
const stabilityQaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('stabilityqa') === '1';
const combatQaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('combatqa') === '1';
const activeCity = activeCityFromUrl();
if (!activeCity || activeCity.status !== 'available') throw new Error('A playable city is required before starting the game.');
const cityId = activeCity.id;
const cityWorld = await activeCity.loadWorld!();
const { airports, centralAirport, createWorld, getTerrainHeight, regionBounds, WORLD_METERS_PER_UNIT, WORLD_SIZE } = cityWorld;
const adPlacements = cityWorld.adPlacements ?? [];
const visualQaMode = import.meta.env.DEV && cityId === 'dallas' && new URLSearchParams(window.location.search).get('visualqa') === '1' && Boolean(cityWorld.visualQaPresets?.length);
const adDebugMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('addebug') === '1';
const PLANE_GROUND_Y = 1.2;
const METERS_TO_FEET = 3.28084 * WORLD_METERS_PER_UNIT;
const METERS_PER_SECOND_TO_KNOTS = 1.94384 * WORLD_METERS_PER_UNIT;
const MIN_REWARDED_FLIGHT_DISTANCE = 40;
const SKY_COLOR = 0x76c9ed;
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
renderer.toneMappingExposure = 1.16;
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

scene.add(new THREE.HemisphereLight(0xd9f3ff, 0x5d764a, 2.55));
const sun = new THREE.DirectionalLight(0xffe2ae, 3.45);
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
      horizonColor: { value: new THREE.Color(0xc4e8f4) },
      zenithColor: { value: new THREE.Color(0x2d9dd4) },
    },
    vertexShader: 'varying float vHeight; void main() { vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 horizonColor; uniform vec3 zenithColor; varying float vHeight; void main() { float t = smoothstep(-0.18, 0.82, vHeight); gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0); }',
  }),
);
skyDome.renderOrder = -10;
scene.add(skyDome);

const depthOffsetDirection = renderer.capabilities.reversedDepthBuffer ? 1 : -1;
const { obstacleBounds, mountainBounds, waterBounds } = createWorld(scene, depthOffsetDirection);
const adPlacementManager = new AdPlacementManager(scene, cityId, adPlacements, adDebugMode, getTerrainHeight);
const ambientTraffic = cityWorld.ambientTrafficConfig
  ? new AmbientTrafficSystem(scene, cityWorld.ambientTrafficConfig, getTerrainHeight)
  : undefined;
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

const legacyAircraftDefinitions: Record<AircraftType, AircraftDefinition> = {
  trainer: {
    name: 'TRAINER',
    creditsRequired: 0,
    maxSpeed: 52,
    groundMaxSpeed: 40,
    acceleration: 8.2,
    drag: 5.5,
    groundAcceleration: 14.5,
    groundDrag: 12,
    idleThrottle: 0.02,
    throttleResponse: 0.42,
    throttleDecay: 0.1,
    lift: 1.28,
    stallSpeed: 15,
    pitchRate: 1,
    maxClimbPitch: 0.25,
    pitchReturnRate: 1.35,
    climbLiftBoost: 1.16,
    rollRate: 1.05,
    rollInputResponse: 4.5,
    yawRate: 1.3,
    groundSteering: 1.3,
    stability: 0.48,
    inertia: 0.88,
    bankTurn: 0.95,
    alignmentRate: 1.12,
    cameraDamping: 4.7,
    cameraFrameScale: 0.94,
    cameraHeight: 3.7,
    takeoffSpeed: 24,
    safeLandingSpeed: 48,
    safeDescentRate: 8.5,
    landingTilt: 0.62,
    bodyColor: 0xf2f4f7,
    accentColor: 0x145da0,
    bodyLength: 5.2,
    bodyRadius: 0.68,
    noseLength: 1.4,
    wingSpan: 8.4,
    wingDepth: 1.45,
    tailSpan: 3.4,
    enginePods: 0,
  },
  privateJet: {
    name: 'PRIVATE JET',
    creditsRequired: 500,
    maxSpeed: 94,
    groundMaxSpeed: 66,
    acceleration: 12,
    drag: 2.35,
    groundAcceleration: 10.5,
    groundDrag: 6.2,
    idleThrottle: 0.025,
    throttleResponse: 0.38,
    throttleDecay: 0.075,
    lift: 1.13,
    stallSpeed: 25.5,
    pitchRate: 0.7,
    maxClimbPitch: 0.23,
    pitchReturnRate: 1.05,
    climbLiftBoost: 1.08,
    rollRate: 1.8,
    rollInputResponse: 5.2,
    yawRate: 0.86,
    groundSteering: 0.92,
    stability: 0.58,
    inertia: 1.45,
    bankTurn: 0.74,
    alignmentRate: 0.76,
    cameraDamping: 3.7,
    cameraFrameScale: 1.03,
    cameraHeight: 4.0,
    takeoffSpeed: 38,
    safeLandingSpeed: 62,
    safeDescentRate: 7.2,
    landingTilt: 0.46,
    bodyColor: 0xf4f1ea,
    accentColor: 0x7b4fc9,
    bodyLength: 7,
    bodyRadius: 0.72,
    noseLength: 2,
    wingSpan: 7.2,
    wingDepth: 1.15,
    tailSpan: 3.2,
    enginePods: 2,
  },
  cargo: {
    name: 'CARGO PLANE',
    creditsRequired: 1000,
    maxSpeed: 68,
    groundMaxSpeed: 56,
    acceleration: 5.4,
    drag: 2.15,
    groundAcceleration: 8.2,
    groundDrag: 4.6,
    idleThrottle: 0.04,
    throttleResponse: 0.3,
    throttleDecay: 0.055,
    lift: 1.24,
    stallSpeed: 29,
    pitchRate: 0.56,
    maxClimbPitch: 0.21,
    pitchReturnRate: 0.9,
    climbLiftBoost: 1.13,
    rollRate: 1.15,
    rollInputResponse: 2.5,
    yawRate: 0.78,
    groundSteering: 0.82,
    stability: 0.68,
    inertia: 1.9,
    bankTurn: 0.54,
    alignmentRate: 0.52,
    cameraDamping: 3.15,
    cameraFrameScale: 1.08,
    cameraHeight: 4.6,
    takeoffSpeed: 44,
    safeLandingSpeed: 70,
    safeDescentRate: 8.2,
    landingTilt: 0.5,
    bodyColor: 0xc8d0d6,
    accentColor: 0x355d3f,
    bodyLength: 7.2,
    bodyRadius: 1,
    noseLength: 1.7,
    wingSpan: 11.5,
    wingDepth: 1.8,
    tailSpan: 4.5,
    enginePods: 4,
  },
  fighter: {
    name: 'FIGHTER-STYLE JET',
    creditsRequired: 2000,
    maxSpeed: 145,
    groundMaxSpeed: 82,
    acceleration: 27,
    drag: 5.7,
    groundAcceleration: 27,
    groundDrag: 8.5,
    idleThrottle: 0.01,
    throttleResponse: 0.72,
    throttleDecay: 0.16,
    lift: 1.4,
    stallSpeed: 34,
    pitchRate: 1.3,
    maxClimbPitch: 0.3,
    pitchReturnRate: 1.6,
    climbLiftBoost: 1.08,
    rollRate: 3.1,
    rollInputResponse: 7,
    yawRate: 1.5,
    groundSteering: 1.04,
    stability: 0.22,
    inertia: 0.62,
    bankTurn: 1.62,
    alignmentRate: 1.65,
    cameraDamping: 5.8,
    cameraFrameScale: 0.91,
    cameraHeight: 3.5,
    takeoffSpeed: 37,
    safeLandingSpeed: 54,
    safeDescentRate: 5,
    landingTilt: 0.32,
    bodyColor: 0x727d86,
    accentColor: 0xb52a2a,
    bodyLength: 6,
    bodyRadius: 0.58,
    noseLength: 2.5,
    wingSpan: 6.8,
    wingDepth: 2.2,
    tailSpan: 2.8,
    enginePods: 2,
  },
};

const aircraftBodyGeometry = new THREE.CylinderGeometry(0.82, 1, 1, 14);
const aircraftNoseGeometry = new THREE.ConeGeometry(1, 1, 14);
const aircraftCockpitGeometry = new THREE.SphereGeometry(1, 14, 8);
const aircraftBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const aircraftEngineGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
// Wide end at the engine nozzle, point trailing aft after the X rotation.
// This reads as a faint heat plume rather than a projectile-shaped blob.
const aircraftExhaustGeometry = new THREE.ConeGeometry(1, 1, 8);
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
};

function createPilotId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `pilot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadPlayerProgress(): PersistedPlayer {
  const fallbackCredits = 0;
  const fallbackName = `Pilot-${Math.floor(100 + Math.random() * 900)}`;
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
  };

  try {
    const stored = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!stored) return fallback;
    const value = JSON.parse(stored) as Partial<PersistedPlayer>;
    if (value.version !== 1) return fallback;
    const storedCredits = typeof value.credits === 'number' && Number.isFinite(value.credits) && value.credits >= 0
      ? Math.floor(value.credits)
      : fallbackCredits;
    const storedAircraft = isAircraftType(value.selectedAircraft) &&
      (flightTestMode || aircraftDefinitions[value.selectedAircraft].creditsRequired <= storedCredits)
      ? value.selectedAircraft
      : 'trainer';
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
    };
  } catch {
    return fallback;
  }
}

const persistedPlayer = loadPlayerProgress();

function createAirplane(type: AircraftType, remote = false): THREE.Group {
  const definition = aircraftDefinitions[type];
  const plane = new THREE.Group();
  const fallback = new THREE.Group();
  fallback.name = `aircraft-fallback-${type}`;
  plane.add(fallback);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: remote ? 0xe05252 : definition.bodyColor, roughness: 0.55 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: remote ? 0x9e1f2b : definition.accentColor, roughness: 0.5 });
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
  const visuals: AircraftVisuals = { propeller: null, exhaustMaterial, exhausts: [] };

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
    if (!exhaustMaterial) return;
    const exhaust = new THREE.Mesh(aircraftExhaustGeometry, exhaustMaterial);
    exhaust.rotation.x = Math.PI / 2;
    const baseLength = type === 'fighter' ? 2.1 : 1.45;
    exhaust.scale.set(radius * 0.34, baseLength, radius * 0.34);
    exhaust.position.set(x, y, z + length / 2 + baseLength * 0.46);
    exhaust.userData.baseLength = baseLength;
    plane.add(exhaust);
    visuals.exhausts.push(exhaust);
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
    addEngine(-0.58, -0.25, 1.55, 2.45, 0.34);
    addEngine(0.58, -0.25, 1.55, 2.45, 0.34);
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
  // The fallback and normalized GLB share a nose-facing local -Z axis. This
  // render-frame anchor is the client counterpart to the server spawn point.
  const muzzle = aircraftMuzzleSockets[type];
  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.name = 'aircraft-muzzle-anchor';
  muzzleAnchor.position.set(muzzle.position.x, muzzle.position.y, muzzle.position.z);
  plane.add(muzzleAnchor);
  plane.userData.muzzleAnchor = muzzleAnchor;
  attachAircraftAsset(plane, fallback, type, definition.bodyLength + definition.noseLength, definition.wingSpan);
  attachAircraftLivery(plane, getAircraftLivery(cityId, adPlacements, type), definition);

  return plane;
}

function disposeAirplaneMaterials(plane: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  plane.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    if (part.userData.sharedAsset) return;
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
let health = 100;
let remainingTime = 12;
let speedBonus = 0;
let currentSpeed = 0;
let verticalSpeed = 0;
type FlightState = 'TAXI' | 'TAKEOFF' | 'FLYING' | 'LANDED' | 'CRASHED';
let flightState: FlightState = 'TAXI';
let onGround = true;
let landedFeedbackTime = 0;
let credits = persistedPlayer.credits;
let distanceFlown = 0;
let totalDistance = persistedPlayer.totalDistance;
let distanceCreditProgress = 0;
let flightDistanceSinceTakeoff = 0;
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
let cameraShakeTime = 0;
let checkpointPulseTime = 0;
let checkpointFlashIndex = -1;
let checkpointFlashTime = 0;
let displayName = persistedPlayer.displayName;

const scoreElement = document.querySelector<HTMLSpanElement>('#score')!;
const bestScoreElement = document.querySelector<HTMLSpanElement>('#best-score')!;
const multiplierElement = document.querySelector<HTMLSpanElement>('#multiplier')!;
const finalScoreElement = document.querySelector<HTMLSpanElement>('#final-score')!;
const crashOverlay = document.querySelector<HTMLDivElement>('#crash-overlay')!;
const endTitleElement = document.querySelector<HTMLDivElement>('#end-title')!;
const timerElement = document.querySelector<HTMLSpanElement>('#timer')!;
const nearMissMessageElement = document.querySelector<HTMLDivElement>('#near-miss-message')!;
const checkpointMessageElement = document.querySelector<HTMLDivElement>('#checkpoint-message')!;
const skyChallengeElement = document.querySelector<HTMLDivElement>('#sky-challenge')!;
const dynamicEventElement = document.querySelector<HTMLElement>('#dynamic-event')!;
const dynamicEventNameElement = document.querySelector<HTMLElement>('#dynamic-event-name')!;
const dynamicEventObjectiveElement = document.querySelector<HTMLElement>('#dynamic-event-objective')!;
const dynamicEventJoinElement = document.querySelector<HTMLButtonElement>('#dynamic-event-join')!;
const formationStatusElement = document.querySelector<HTMLElement>('#formation-status')!;
const playerNameElement = document.querySelector<HTMLSpanElement>('#player-name')!;
const audioToggleElement = document.querySelector<HTMLButtonElement>('#audio-toggle')!;
const citiesButtonElement = document.querySelector<HTMLButtonElement>('#cities-button')!;
const garageButtonElement = document.querySelector<HTMLButtonElement>('#garage-button')!;
const garageOverlayElement = document.querySelector<HTMLElement>('#garage-overlay')!;
const pilotMenuButtonElement = document.querySelector<HTMLButtonElement>('#pilot-menu-button')!;
const pilotMenuOverlayElement = document.querySelector<HTMLElement>('#pilot-menu-overlay')!;
const contextualHintElement = document.querySelector<HTMLElement>('#contextual-hint')!;
const contextualHintTitleElement = document.querySelector<HTMLElement>('#contextual-hint-title')!;
const contextualHintBodyElement = document.querySelector<HTMLElement>('#contextual-hint-body')!;
const contextualHintDismissElement = document.querySelector<HTMLButtonElement>('#contextual-hint-dismiss')!;
const altitudeElement = document.querySelector<HTMLSpanElement>('#altitude')!;
const verticalSpeedElement = document.querySelector<HTMLSpanElement>('#vertical-speed')!;
const verticalSpeedIndicator = document.querySelector<HTMLSpanElement>('#vsi-indicator')!;
const flightStateElement = document.querySelector<HTMLSpanElement>('#flight-state')!;
const aircraftSelectElement = document.querySelector<HTMLSelectElement>('#aircraft-select')!;
const flightTestIndicator = document.querySelector<HTMLDivElement>('#flight-test-mode')!;
const creditsElement = document.querySelector<HTMLSpanElement>('#credits')!;
const distanceFlownElement = document.querySelector<HTMLSpanElement>('#distance-flown')!;
const successfulLandingsElement = document.querySelector<HTMLSpanElement>('#successful-landings')!;
const regionsDiscoveredElement = document.querySelector<HTMLSpanElement>('#regions-discovered')!;
const discoveryProgressElement = document.querySelector<HTMLSpanElement>('#discovery-progress')!;
const nearestAirportElement = document.querySelector<HTMLSpanElement>('#nearest-airport')!;
const airportDistanceElement = document.querySelector<HTMLSpanElement>('#airport-distance')!;
const waypointNavigationElement = document.querySelector<HTMLDivElement>('#waypoint-navigation')!;
const waypointBearingElement = document.querySelector<HTMLSpanElement>('#waypoint-bearing')!;
const waypointDistanceElement = document.querySelector<HTMLSpanElement>('#waypoint-distance')!;
const headingElement = document.querySelector<HTMLSpanElement>('#heading')!;
const worldStatusElement = document.querySelector<HTMLDivElement>('#world-status')!;
const radarCanvas = document.querySelector<HTMLCanvasElement>('#radar')!;
const radarContext = radarCanvas.getContext('2d')!;
const nextActionsElement = document.querySelector<HTMLElement>('#next-actions')!;
const worldMapOverlayElement = document.querySelector<HTMLElement>('#world-map-overlay')!;
const worldMapCanvas = document.querySelector<HTMLCanvasElement>('#world-map-canvas')!;
const worldMapRecenterElement = document.querySelector<HTMLButtonElement>('#world-map-recenter')!;
const progressMessageElement = document.querySelector<HTMLDivElement>('#progress-message')!;
const combatMessageElement = document.querySelector<HTMLDivElement>('#combat-message')!;
const hitMarkerElement = document.querySelector<HTMLDivElement>('#hit-marker')!;
const damageFlashElement = document.querySelector<HTMLDivElement>('#damage-flash')!;
const healthElement = document.querySelector<HTMLSpanElement>('#health')!;
const healthRowElement = document.querySelector<HTMLDivElement>('.health-row')!;
const heatRowElement = document.querySelector<HTMLDivElement>('#heat-row')!;
const heatLevelElement = document.querySelector<HTMLSpanElement>('#heat-level')!;
const heatMultiplierElement = document.querySelector<HTMLSpanElement>('#heat-multiplier')!;
const acquisitionCircleElement = document.querySelector<HTMLDivElement>('#acquisition-circle')!;
const targetFeedbackElement = document.querySelector<HTMLDivElement>('#target-feedback')!;
const targetDistanceElement = document.querySelector<HTMLSpanElement>('#target-distance')!;
const targetRangeElement = document.querySelector<HTMLElement>('#target-range')!;
const activeContractElement = document.querySelector<HTMLDivElement>('#active-contract')!;
const contractPanelElement = document.querySelector<HTMLElement>('#contract-panel')!;
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
let combatMessageTimer: number | undefined;
let healthFlashTimer: number | undefined;
let hitMarkerTimer: number | undefined;
let damageFlashTimer: number | undefined;
playerNameElement.textContent = displayName;
if (flightTestMode) flightTestIndicator.classList.remove('hidden');

let audioContext: AudioContext | null = null;
let audioMaster: GainNode | null = null;
let engineOscillator: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let audioMuted = persistedPlayer.muted;
let progressSaveTimer: number | undefined;
audioToggleElement.textContent = audioMuted ? 'Unmute' : 'Mute';
audioToggleElement.setAttribute('aria-pressed', String(audioMuted));

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
// Flight begins with a single unobtrusive control reminder rather than the
// former blocking guide. The registry ensures it appears only once per pilot.
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
    audioMaster.gain.value = audioMuted ? 0 : 1;
    audioMaster.connect(audioContext.destination);

    engineOscillator = audioContext.createOscillator();
    engineOscillator.type = 'sawtooth';
    const engineFilter = audioContext.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 180;
    engineGain = audioContext.createGain();
    engineGain.gain.value = 0.0001;
    engineOscillator.connect(engineFilter).connect(engineGain).connect(audioMaster);
    engineOscillator.start();
    audioToggleElement.dataset.active = 'true';
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
  oscillator.connect(gain).connect(audioMaster);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playCheckpointSound(): void {
  playTone(520, 0.12, 'square', 0.055, 700);
  playTone(760, 0.14, 'square', 0.045, 980, 0.1);
}

function playNearMissSound(): void {
  playTone(260, 0.24, 'sawtooth', 0.06, 820);
}

function playFireSound(): void {
  playTone(150, 0.075, 'sawtooth', 0.06, 68);
  playTone(360, 0.045, 'square', 0.028, 145);
}

function playHitSound(): void {
  playTone(1100, 0.09, 'square', 0.065, 640);
  playTone(240, 0.08, 'sawtooth', 0.035, 110);
}

function playDestructionSound(): void {
  playTone(145, 0.34, 'sawtooth', 0.075, 42);
  playTone(72, 0.5, 'triangle', 0.055, 35, 0.06);
}

type EndReason = 'CRASHED' | 'TIME UP' | 'MID-AIR COLLISION' | 'DESTROYED';

function playEndSound(message: EndReason): void {
  if (message === 'TIME UP') {
    playTone(420, 0.2, 'square', 0.055, 260);
    playTone(280, 0.24, 'square', 0.05, 150, 0.18);
    return;
  }
  if (message === 'DESTROYED') {
    playDestructionSound();
    return;
  }
  playTone(message === 'MID-AIR COLLISION' ? 150 : 120, 0.42, 'sawtooth', 0.075, 48);
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
  const engineAmount = Math.max(speedAmount, throttle * 0.72);
  engineOscillator.frequency.setTargetAtTime(55 + engineAmount * 75, now, 0.08);
  engineGain.gain.setTargetAtTime(crashed ? 0.0001 : 0.006 + engineAmount * 0.02, now, 0.1);
}

window.addEventListener('pointerdown', activateAudio);
window.addEventListener('keydown', activateAudio);
audioToggleElement.addEventListener('click', () => {
  activateAudio();
  audioMuted = !audioMuted;
  if (audioContext && audioMaster) {
    audioMaster.gain.setTargetAtTime(audioMuted ? 0 : 1, audioContext.currentTime, 0.02);
  }
  audioToggleElement.textContent = audioMuted ? 'Unmute' : 'Mute';
  audioToggleElement.setAttribute('aria-pressed', String(audioMuted));
  savePlayerProgress(true);
});

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
  scoreElement.textContent = score.toString();
  bestScoreElement.textContent = bestScore.toString();
  multiplierElement.textContent = `x${multiplier}`;
}

function updateTimerDisplay(): void {
  timerElement.textContent = remainingTime.toFixed(1);
  timerElement.classList.toggle('urgent', remainingTime <= 3 && !crashed);
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
  recordBestScore(score);
  checkpointsPassed += 1;
  multiplier = Math.min(5, 1 + Math.floor(checkpointsPassed / 3));
  speedBonus = Math.min(10, Math.floor(checkpointsPassed / 2) * 2);
  remainingTime = Math.min(14, Math.max(10, remainingTime) + 2);
  activeCheckpoint = (passedCheckpoint + 1) % checkpointRings.length;
  updateScoreDisplay();
  updateTimerDisplay();
  showActiveCheckpoint();
  checkpointFlashIndex = passedCheckpoint;
  checkpointFlashTime = 0.45;
  const passedRing = checkpointRings[passedCheckpoint];
  passedRing.material.color.setHex(0x74e89a);
  passedRing.material.emissive.setHex(0x2c8b4d);
  passedRing.material.emissiveIntensity = 1.8;
  passedRing.material.opacity = 1;
  passedRing.scale.setScalar(1.3);
  checkpointMessageElement.textContent = `+${points} CHECKPOINT`;
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
  flightState = state;
  flightStateElement.textContent = state;
}

function updateFlightHud(): void {
  speedElement.textContent = Math.round(currentSpeed * METERS_PER_SECOND_TO_KNOTS).toString();
  throttleElement.textContent = Math.round(throttle * 100).toString();
  altitudeElement.textContent = Math.round(altitudeAboveTerrain() * METERS_TO_FEET).toString();
  const feetPerMinute = Math.round(verticalSpeed * METERS_TO_FEET * 60);
  verticalSpeedElement.textContent = `${feetPerMinute >= 0 ? '+' : ''}${feetPerMinute}`;
  verticalSpeedIndicator.style.setProperty('--vsi-offset', `${THREE.MathUtils.clamp(-feetPerMinute / 2400, -1, 1) * 23}px`);
  verticalSpeedIndicator.classList.toggle('descending', feetPerMinute < -40);
}

function updateAirportNavigation(): void {
  let nearestAirport = centralAirport;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const airport of airports) {
    const distance = Math.hypot(airplane.position.x - airport.x, airplane.position.z - airport.z);
    if (distance < nearestDistance) {
      nearestAirport = airport;
      nearestDistance = distance;
    }
  }
  nearestAirportElement.textContent = nearestAirport.name;
  airportDistanceElement.textContent = Math.round(nearestDistance).toString();
}

const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
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

function updateHeadingDisplay(direction: THREE.Vector3): void {
  const degrees = (THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z)) + 360) % 360;
  const compass = compassPoints[Math.round(degrees / 45) % compassPoints.length];
  headingElement.textContent = `${compass} ${Math.round(degrees).toString().padStart(3, '0')}°`;
}

function drawRadarMarker(
  direction: THREE.Vector3,
  targetX: number,
  targetZ: number,
  kind: 'airport' | 'player' | 'ambient' | 'event' | 'challenge' | 'waypoint',
  label = '',
  king = false,
  hot = false,
): void {
  const center = radarCanvas.width / 2;
  const radarRadius = center - 13;
  const offsetX = targetX - airplane.position.x;
  const offsetZ = targetZ - airplane.position.z;
  const distance = Math.hypot(offsetX, offsetZ);
  if ((kind === 'player' || kind === 'ambient' || kind === 'challenge') && distance > (kind === 'player' && hot ? radarRange * 2 : radarRange)) return;

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
    radarContext.fillStyle = '#ff6868';
    radarContext.beginPath();
    radarContext.arc(x, y, 3.5, 0, Math.PI * 2);
    radarContext.fill();
    if (hot) {
      radarContext.strokeStyle = '#ffbd5c';
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

  if (kind === 'event') {
    radarContext.strokeStyle = '#ffb34f';
    radarContext.lineWidth = 2;
    radarContext.beginPath();
    radarContext.arc(x, y, 4, 0, Math.PI * 2);
    radarContext.stroke();
    radarContext.fillStyle = '#ffcf76';
    radarContext.font = '8px ui-monospace, monospace';
    radarContext.fillText('EVENT', x, Math.max(9, y - 7));
    return;
  }

  if (kind === 'challenge') {
    radarContext.strokeStyle = '#5ae2ff';
    radarContext.lineWidth = 2;
    radarContext.beginPath();
    radarContext.moveTo(x, y - 5); radarContext.lineTo(x + 4.5, y + 4);
    radarContext.lineTo(x - 4.5, y + 4); radarContext.closePath();
    radarContext.stroke();
    return;
  }

  if (kind === 'waypoint') {
    radarContext.strokeStyle = '#ffd865';
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
  radarContext.fillStyle = pinned ? '#ffd34d' : '#73d8ed';
  radarContext.fillRect(-3.5, -3.5, 7, 7);
  radarContext.restore();
  radarContext.fillStyle = pinned ? '#ffd34d' : '#bceefa';
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
  for (const remote of remotePlayers.values()) {
    drawRadarMarker(direction, remote.plane.position.x, remote.plane.position.z, entityCapabilities(remote.entityType).radarMarker, '', remote.playerId === kingPlayerId, remote.heatLevel >= 4);
  }
  for (const ambient of ambientTraffic?.getRadarEntities(airplane.position, radarRange) ?? []) {
    drawRadarMarker(direction, ambient.x, ambient.z, entityCapabilities(ambient.entityType, ambient.eventCombatMode).radarMarker);
  }
  const challengeMarker = skyChallenges?.getRadarMarker(airplane.position);
  if (challengeMarker) drawRadarMarker(direction, challengeMarker.x, challengeMarker.z, 'challenge');
  const eventObjective = cityEvent ? eventObjectiveForLocal(cityEvent) : undefined;
  if (cityEvent && eventObjective && (cityEvent.lifecycle === 'available' || cityEvent.lifecycle === 'active')) {
    drawRadarMarker(direction, eventObjective.x, eventObjective.z, 'event');
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
  const direction = getNavigationForward();
  updateHeadingDisplay(direction);
  updateAirportNavigation();
  updateRadar(direction);
  if (waypoint) {
    const dx = waypoint.x - airplane.position.x;
    const dz = waypoint.z - airplane.position.z;
    const bearing = (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360;
    waypointBearingElement.textContent = `${Math.round(bearing).toString().padStart(3, '0')}°`;
    waypointDistanceElement.textContent = Math.round(Math.hypot(dx, dz)).toString();
  }
  waypointNavigationElement.classList.toggle('hidden', waypoint === null);
  updateWorldMap(direction);
  updateSocialHud();
  const outsideCity =
    Math.abs(airplane.position.x) > WORLD_SIZE / 2 || Math.abs(airplane.position.z) > WORLD_SIZE / 2;
  worldStatusElement.classList.toggle('hidden', !outsideCity);
  updateContextualHints();
  updateNextActions();
  refreshPilotMenu();
}

function updateContextualHints(): void {
  contextualHints.update();
  if (runStarted && onGround && !crashed) contextualHints.trigger('runwayControls');
  if (!runStarted || onGround || crashed) return;
  const altitude = altitudeAboveTerrain();
  const nearbyStunt = (cityWorld.stuntZones ?? []).some((zone) => {
    const distance = Math.hypot(airplane.position.x - zone.x, airplane.position.z - zone.z);
    return distance <= Math.max(700, zone.radius * 1.35) && altitude <= zone.maxAltitude + 120;
  });
  if (nearbyStunt) contextualHints.trigger('stunt');
}

function updateProgressHud(): void {
  creditsElement.textContent = credits.toString();
  distanceFlownElement.textContent = Math.floor(distanceFlown).toString();
  successfulLandingsElement.textContent = successfulLandings.toString();
  regionsDiscoveredElement.textContent = regionsDiscovered.toString();
  const discoveryProgress = discoverySystem?.getProgress() ?? { discovered: 0, total: 0, percent: 0 };
  discoveryProgressElement.textContent = `${cityId === 'dallas' ? 'Dallas' : 'Milwaukee'} Discovery: ${discoveryProgress.discovered} / ${discoveryProgress.total} — ${discoveryProgress.percent}%`;
}

function showProgressMessage(message: string): void {
  progressMessageElement.textContent = message;
  progressMessageElement.classList.remove('hidden');
  window.clearTimeout(progressMessageTimer);
  progressMessageTimer = window.setTimeout(() => progressMessageElement.classList.add('hidden'), 1400);
}

let skyChallenges: SkyChallengeSystem | undefined;
let stuntCombo: StuntComboSystem | undefined;
let discoverySystem: DiscoverySystem | undefined;
let cityEvent: NetworkCityEvent | null = null;
let joinedEventId: string | null = null;
let kingPlayerId: string | undefined;
const formationMembers = new Set<string>();
const territoryDefinitions = territoriesForCity(cityId);
const territoryState = new Map<string, NetworkTerritoryState>();

function applyTerritoryState(states: readonly NetworkTerritoryState[]): void {
  territoryState.clear();
  for (const state of states) territoryState.set(state.id, state);
  refreshPilotMenu();
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
    if (!wanted || wanted.entityType !== 'player' || wanted.lifeState !== 'alive' || !wanted.plane.visible || wanted.plane.parent !== scene) return undefined;
    return { x: wanted.plane.position.x, y: wanted.plane.position.y, z: wanted.plane.position.z };
  }
  if (event.eventType !== 'skyRush') return event.objective;
  const gateIndex = Math.floor(event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress ?? 0);
  return event.route[Math.min(gateIndex, event.route.length - 1)] ?? event.objective;
}

function updateDynamicEventHud(): void {
  const event = cityEvent;
  const objective = event ? eventObjectiveForLocal(event) : undefined;
  const visible = event !== null && (event.lifecycle === 'available' || event.lifecycle === 'active') && objective !== undefined;
  dynamicEventElement.classList.toggle('hidden', !visible);
  if (!event || !objective || !visible) return;
  const remaining = Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000));
  const objectiveDistance = Math.round(Math.hypot(airplane.position.x - objective.x, airplane.position.z - objective.z));
  dynamicEventNameElement.textContent = event.name;
  const progress = event.rankings.find((entry) => entry.playerId === localPlayerId)?.progress;
  const mode = event.eventType === 'riskZone' && event.riskMode ? ` · ${event.riskMode.replace(/([A-Z])/g, ' $1').toUpperCase()}` : '';
  dynamicEventObjectiveElement.textContent = `${event.lifecycle === 'available' ? 'NEXT' : 'ACTIVE'}${mode} · ${objectiveDistance}M · ${remaining}s${progress ? ` · ${progress.toFixed(1)}s` : ''}`;
  const joined = joinedEventId === event.id;
  dynamicEventJoinElement.disabled = joined || !localPlayerId;
  dynamicEventJoinElement.textContent = joined ? 'JOINED' : 'JOIN';
}

function updateEventVisual(): void {
  const event = cityEvent;
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.075;
  for (const gate of chaosGates) gate.visible = false;
  if (event?.lifecycle === 'active' && event.eventType === 'skyRush') {
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
  cityEvent = event ?? null;
  if (!event || event.lifecycle === 'completed' || event.lifecycle === 'failed' || event.lifecycle === 'cooldown') {
    joinedEventId = null;
  }
  ambientTraffic?.syncEventRoutes(event?.lifecycle === 'active' ? event.eventAircraft : []);
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

if (cityWorld.skyChallenges?.length) {
  skyChallenges = new SkyChallengeSystem(scene, cityWorld.skyChallenges, getTerrainHeight, {
    onScore: (points) => {
      score += points;
      recordBestScore(score);
      updateScoreDisplay();
      sendPlayerUpdate();
    },
    onCredits: (reward) => { addCredits(reward); },
    onMessage: showProgressMessage,
    onStateChange: updateSkyChallengeHud,
  });
}

stuntCombo = new StuntComboSystem(cityWorld.stuntZones ?? [], {
  onScore: (points) => {
    score += points;
    recordBestScore(score);
    updateScoreDisplay();
    sendPlayerUpdate();
  },
  onCredits: (creditsReward) => { addCredits(creditsReward); },
  onMessage: showProgressMessage,
  onStunt: (type) => {
    if (!localPlayerId || !connectionReady()) return;
    socket.send(JSON.stringify({ type: 'chaosAction', action: type === 'nearMiss' ? 'nearMiss' : 'stunt' }));
  },
});

if (cityWorld.discoveries?.length) {
  discoverySystem = new DiscoverySystem(cityWorld.discoveries, discoveredLocationIds, {
    onDiscover: (definition) => {
      discoveredLocationsByCity[cityId] = [...discoveredLocationIds];
      savePlayerProgress();
      addCredits(definition.credits);
      queueProfileProgress();
      showProgressMessage(`DISCOVERED: ${definition.name} +${definition.credits}`);
      updateProgressHud();
      contextualHints.trigger('discovery');
    },
    onSetComplete: (setId, bonus) => {
      if (bonus <= 0) return;
      discoveredLocationsByCity[cityId] = [...discoveredLocationIds];
      savePlayerProgress();
      addCredits(bonus);
      queueProfileProgress();
      showProgressMessage(`${setId.replaceAll('-', ' ').toUpperCase()} COMPLETE +${bonus}`);
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
  passenger: 250,
  cargo: 350,
  sightseeing: 300,
  intercept: 400,
};

function airportById(id: AirportId): AirportDefinition {
  return airports.find((airport) => airport.id === id) ?? centralAirport;
}

function contractTitle(type: ContractType): string {
  return type.toUpperCase();
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
  const requiredCredits = aircraftDefinitions[availableContract.aircraftType].creditsRequired;
  const creditsNeeded = Math.max(0, requiredCredits - credits);
  contractTypeElement.textContent = contractTitle(availableContract.type);
  contractDetailElement.textContent = contractDetail(availableContract);
  contractAircraftElement.textContent = creditsNeeded > 0
    ? `${aircraftDefinitions[availableContract.aircraftType].name} · LOCKED`
    : aircraftDefinitions[availableContract.aircraftType].name;
  contractRewardElement.textContent = `+${availableContract.reward} credits`;
  contractAcceptElement.disabled = creditsNeeded > 0;
  contractAcceptElement.textContent = creditsNeeded > 0 ? `Need ${creditsNeeded}` : 'Accept';
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
  const requiredCredits = aircraftDefinitions[availableContract.aircraftType].creditsRequired;
  if (credits < requiredCredits) {
    showProgressMessage(`Need ${requiredCredits - credits} more credits`);
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
  addCredits(reward);
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
  healthElement.textContent = health.toString();
  healthRowElement.classList.toggle('damaged', damaged);
  window.clearTimeout(healthFlashTimer);
  if (damaged) {
    healthFlashTimer = window.setTimeout(() => healthRowElement.classList.remove('damaged'), 350);
  }
}

function applyHeatState(state: NetworkHeatState): void {
  const level = THREE.MathUtils.clamp(Math.round(state.level), 0, 5);
  if (state.playerId === localPlayerId) {
    const levelRaised = level > localHeat;
    localHeat = level;
    localHeatMultiplier = state.multiplier;
    heatLevelElement.textContent = level.toString();
    heatMultiplierElement.textContent = `×${state.multiplier.toFixed(2)}`;
    heatRowElement.dataset.level = level.toString();
    if (state.levelChanged && levelRaised) showProgressMessage(`HEAT ${level} — ${level >= 4 ? 'BOUNTY RISING' : 'RISK RISING'}`);
    return;
  }
  const remote = remotePlayers.get(state.playerId);
  if (remote) remote.heatLevel = level;
}

function updateAircraftOptions(): void {
  for (const option of aircraftSelectElement.options) {
    if (!isAircraftType(option.value)) continue;
    const definition = aircraftDefinitions[option.value];
    const owned = flightTestMode || (profileHydrated && serverProfile.unlockedAircraft.includes(option.value));
    option.disabled = !owned;
    option.textContent = flightTestMode && definition.creditsRequired > 0
      ? `${definition.name} — Flight test`
      :
      definition.creditsRequired === 0
        ? `${definition.name} — Free`
        : `${definition.name} — ${owned ? 'Owned' : `${definition.creditsRequired.toLocaleString()} credits`}`;
  }
}

function addCredits(amount: number): boolean {
  if (flightTestMode) return false;
  const previousCredits = credits;
  credits += amount;
  queueProfileReward(amount);
  savePlayerProgress();
  let unlockedName = '';
  for (const definition of Object.values(aircraftDefinitions)) {
    if (
      definition.creditsRequired > 0 &&
      previousCredits < definition.creditsRequired &&
      credits >= definition.creditsRequired
    ) {
      unlockedName = definition.name;
    }
  }
  if (!unlockedName) return false;
  updateAircraftOptions();
  updateContractPanel();
  showProgressMessage(`${unlockedName} UNLOCKED`);
  return true;
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
    const unlocked = addCredits(50);
    if (!unlocked) showProgressMessage(`+50 ${region.name} DISCOVERED`);
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
  const earnedCredits = Math.floor(distanceCreditProgress);
  if (earnedCredits > 0) {
    distanceCreditProgress -= earnedCredits;
    addCredits(earnedCredits);
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

function rewardLanding(airport: AirportDefinition, landingQuality?: LandingQuality): void {
  setRestartAirport(airport);
  if (visualQaMode) return;
  if (flightDistanceSinceTakeoff < MIN_REWARDED_FLIGHT_DISTANCE) return;
  successfulLandings += 1;
  totalSuccessfulLandings += 1;
  queueProfileProgress();
  resetRegionsOnNextTakeoff = true;
  const destinationBonus = !landedAirportIds.has(airport.id);
  landedAirportIds.add(airport.id);
  const reward = 100 + (destinationBonus ? 100 : 0);
  const unlocked = addCredits(reward);
  if (!unlocked) {
    showProgressMessage(destinationBonus ? `+200 ${airport.name.toUpperCase()}` : `+100 ${airport.name.toUpperCase()}`);
  }
  if (landingQuality) stuntCombo?.notifyLanding(landingQuality);
  contextualHints.trigger('garage');
}

function endRun(message: EndReason, title: string = message): void {
  if (crashed) return;
  crashed = true;
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
  cameraShakeTime = 0.35;
  currentSpeed = 0;
  verticalSpeed = 0;
  velocity.set(0, 0, 0);
  setFlightState('CRASHED');
  playEndSound(message);
  updateScoreDisplay();
  updateTimerDisplay();
}

function restartGame(): void {
  keys.clear();
  runStarted = true;
  airplane.position.copy(spawnPosition);
  airplane.rotation.set(0, spawnHeading, 0, 'YXZ');
  heading = spawnHeading;
  pitch = 0;
  roll = 0;
  rollControlStrength = 0;
  pitchControlStrength = 0;
  throttle = 0;
  score = 0;
  multiplier = 1;
  checkpointsPassed = 0;
  remainingTime = 12;
  speedBonus = 0;
  currentSpeed = 0;
  verticalSpeed = 0;
  velocity.set(0, 0, 0);
  onGround = true;
  landedFeedbackTime = 0;
  cameraShakeTime = 0;
  checkpointFlashIndex = -1;
  checkpointFlashTime = 0;
  activeCheckpoint = 0;
  skyChallenges?.cancel();
  stuntCombo?.reset();
  crashed = false;
  health = 100;
  localLifeState = 'respawning';
  setFlightState('TAXI');
  networkTimer = 0;
  for (const remote of remotePlayers.values()) remote.nearMissActive = false;
  window.clearTimeout(nearMissMessageTimer);
  window.clearTimeout(checkpointMessageTimer);
  nearMissMessageElement.classList.add('hidden');
  checkpointMessageElement.classList.add('hidden');
  combatMessageElement.classList.add('hidden');
  hitMarkerElement.classList.remove('visible');
  damageFlashElement.classList.remove('visible');
  crashOverlay.classList.add('hidden');
  updateHealthDisplay();
  updateFlightHud();
  updateScoreDisplay();
  updateTimerDisplay();
  showActiveCheckpoint();
  updateCamera(1);
  sendRespawn();
  sendLocalState();
  sendPlayerUpdate();
}

function applyServerSelectedAircraft(nextType: AircraftType): void {
  if (nextType === aircraftType) return;
  scene.remove(airplane);
  disposeAirplaneMaterials(airplane);
  aircraftType = nextType;
  currentAircraft = aircraftDefinitions[aircraftType];
  airplane = createAirplane(aircraftType);
  scene.add(airplane);
  restartGame();
}

function selectAircraft(nextType: AircraftType): void {
  if (nextType === aircraftType) return;
  if (flightTestMode) {
    applyServerSelectedAircraft(nextType);
    return;
  }
  if (!profileHydrated || !serverProfile.unlockedAircraft.includes(nextType)) {
    aircraftSelectElement.value = aircraftType;
    const needed = Math.max(0, aircraftDefinitions[nextType].creditsRequired - credits);
    showProgressMessage(needed > 0 ? `Need ${needed} more credits` : 'WAITING FOR SERVER PROFILE');
    return;
  }
  if (!connectionReady()) {
    aircraftSelectElement.value = aircraftType;
    showProgressMessage('SERVER REQUIRED TO EQUIP AIRCRAFT');
    return;
  }
  // The local model changes only after the server returns its accepted profile.
  aircraftSelectElement.value = aircraftType;
  socket.send(JSON.stringify({ type: 'equipAircraft', aircraftType: nextType }));
}

aircraftSelectElement.addEventListener('change', () => {
  if (isAircraftType(aircraftSelectElement.value)) selectAircraft(aircraftSelectElement.value);
});

const aircraftGarage = new AircraftGarage(garageOverlayElement, (nextType) => {
  selectAircraft(nextType);
  aircraftGarage.close();
}, (plane, type) => attachAircraftLivery(plane, getAircraftLivery(cityId, adPlacements, type), aircraftDefinitions[type]));
function openGarage(): boolean {
  if (!onGround || crashed) {
    showProgressMessage('GARAGE AVAILABLE WHEN SAFELY ON GROUND');
    return false;
  }
  // The Garage owns the whole screen while open. Clear held flight input and
  // close the two other full-screen surfaces before its preview takes focus.
  keys.clear();
  if (worldMap.isOpen()) worldMap.setOpen(false);
  if (pilotMenu.isOpen()) pilotMenu.close();
  aircraftGarage.open({
    credits,
    selectedAircraft: aircraftType,
    unlockedAircraft: flightTestMode ? (Object.keys(aircraftDefinitions) as AircraftType[]) : serverProfile.unlockedAircraft,
  });
  return true;
}
garageButtonElement.addEventListener('click', openGarage);

const keys = new Set<string>();
let runStarted = false;
const flightControlCodes = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);
const howToPlayElement = document.querySelector<HTMLDivElement>('#how-to-play')!;
window.addEventListener('keydown', (event) => {
  if (aircraftGarage.isOpen()) {
    if (event.code === 'Escape') {
      event.preventDefault();
      aircraftGarage.close();
    } else if (flightControlCodes.has(event.code) || event.code === 'KeyM' || event.code === 'KeyR' || event.code === 'Tab') {
      event.preventDefault();
    }
    return;
  }
  if (event.code === 'Tab') {
    event.preventDefault();
    togglePilotMenu();
    return;
  }
  if (pilotMenu.isOpen()) {
    if (flightControlCodes.has(event.code)) event.preventDefault();
    if (event.code === 'Escape') {
      event.preventDefault();
      pilotMenu.close();
    }
    return;
  }
  if (flightControlCodes.has(event.code)) {
    event.preventDefault();
    runStarted = true;
    howToPlayElement.classList.add('hidden');
  }
  if (!event.repeat && event.code === 'KeyA') {
    heading += currentAircraft.yawRate * 0.055;
  }
  if (!event.repeat && event.code === 'KeyD') {
    heading -= currentAircraft.yawRate * 0.055;
  }
  if (!event.repeat && event.code === 'Space') fireWeaponOnce();
  if (event.code === 'KeyR' && crashed) {
    restartGame();
    return;
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  if (flightControlCodes.has(event.code) || (aircraftGarage.isOpen() && (event.code === 'KeyM' || event.code === 'KeyR' || event.code === 'Tab'))) event.preventDefault();
  keys.delete(event.code);
});

let throttle = 0;
let heading = 0;
let pitch = 0;
let roll = 0;
let rollControlStrength = 0;
let pitchControlStrength = 0;
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const velocity = new THREE.Vector3();
const liftDirection = new THREE.Vector3();
const sideSlip = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const cameraOrbitOffset = new THREE.Vector3();
const cameraOrbitYawQuaternion = new THREE.Quaternion();
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
const throttleElement = document.querySelector<HTMLSpanElement>('#throttle')!;

type NetworkTransform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  aircraftType: AircraftType;
  cityId: CityId;
  displayName?: string;
  lifeState?: PlayerLifeState;
};

type NetworkPlayer = NetworkTransform & { playerId: string };
type PlayerLifeState = 'alive' | 'destroyed' | 'respawning';

type LeaderboardPlayer = {
  playerId: string;
  displayName: string;
  score: number;
};

type NetworkVector = { x: number; y: number; z: number };
type ProjectileMode = 'ballistic';
type NetworkHeatState = { playerId: string; value: number; level: number; multiplier: number; levelChanged?: boolean };
type DynamicEventType = 'skyRush' | 'supplyDrop' | 'emergencyEscort' | 'cargoConvoy' | 'riskZone' | 'mostWanted';
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
  eventAircraft: Array<{ routeId: string; position: NetworkVector; direction: NetworkVector }>;
  wantedPlayerId?: string;
  riskMode?: 'storm' | 'lowAltitude' | 'highAltitude' | 'downtownDanger';
  riskRadius: number;
  goldenDrop?: boolean;
  rewardCredits?: number;
};
type NetworkSocialState = { kingPlayerId?: string };
type NetworkTerritoryState = {
  id: string;
  controllerId?: string;
  controllerName?: string;
  capturingPlayerId?: string;
  captureProgress: number;
  contested: boolean;
};
type NetworkProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
  selectedAircraft: AircraftType;
  unlockedAircraft: AircraftType[];
  totalDistance: number;
  successfulLandings: number;
  kills: number;
  deaths: number;
  discoveries: Partial<Record<CityId, string[]>>;
  challengeCompletions: number;
  eventCompletions: number;
  legacyImportPending: boolean;
};

type ServerMessage =
  | {
      type: 'welcome';
      protocolVersion: number;
      playerId: string;
      pilotId: string;
      cityId: CityId;
      spawnPosition: { x: number; y: number; z: number };
      health: number;
      lifeState?: PlayerLifeState;
      players: NetworkPlayer[];
      event?: NetworkCityEvent;
      social?: NetworkSocialState;
      heatStates?: NetworkHeatState[];
      territories?: NetworkTerritoryState[];
      profile: NetworkProfile;
    }
  | { type: 'protocolMismatch'; expectedProtocolVersion: number }
  | ({ type: 'state' } & NetworkPlayer)
  | { type: 'remove'; playerId: string }
  | { type: 'leaderboard'; players: LeaderboardPlayer[] }
  | {
      type: 'projectileSpawn';
      projectileId: string;
      ownerId: string;
      position: NetworkVector;
      direction: NetworkVector;
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
  | { type: 'lockState'; targetId?: string }
  | ({ type: 'heatState' } & NetworkHeatState)
  | { type: 'territoryState'; cityId: CityId; territories: NetworkTerritoryState[] }
  | { type: 'territoryNotice'; territoryId: string; kind: 'enter' | 'captured' }
  | { type: 'territoryReward'; territoryId: string; score: number; credits: number; kind: 'capture' | 'control' }
  | { type: 'projectileRemove'; projectileId: string }
  | { type: 'damage'; playerId: string; shooterId: string; health: number; damage: number }
  | {
      type: 'destroyed';
      playerId: string;
      killerId: string;
      killerDisplayName: string;
      killerScore: number;
      killerReward?: number;
    }
  | { type: 'respawn'; playerId: string; health: number; lifeState?: PlayerLifeState }
  | ({ type: 'playerState'; health: number; lifeState: PlayerLifeState } & NetworkPlayer)
  | { type: 'eventState'; event: NetworkCityEvent }
  | { type: 'eventClear' }
  | { type: 'eventAnnouncement'; eventId: string; name?: string; reward?: number; expiresAt: number }
  | { type: 'eventReward'; eventId: string; score: number; credits: number; reason: string }
  | { type: 'socialState'; kingPlayerId?: string }
  | { type: 'formationState'; memberIds: string[]; active: boolean }
  | { type: 'socialReward'; score: number; credits: number; reason: string }
  | { type: 'chaosState'; multiplier: number; action: string; score: number; pendingCredits: number }
  | { type: 'chaosReward'; credits: number; reason: string }
  | { type: 'profile'; profile: NetworkProfile; rewardId?: string };

function createSafeNetworkProfile(): NetworkProfile {
  return {
    pilotId: persistedPlayer.pilotId,
    pilotName: persistedPlayer.displayName,
    credits: persistedPlayer.credits,
    selectedAircraft: 'trainer',
    unlockedAircraft: ['trainer'],
    totalDistance: persistedPlayer.totalDistance,
    successfulLandings: persistedPlayer.successfulLandings,
    kills: 0,
    deaths: 0,
    discoveries: persistedPlayer.discoveries,
    challengeCompletions: 0,
    eventCompletions: 0,
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
    isAircraftType(profile.selectedAircraft) &&
    Array.isArray(profile.unlockedAircraft) && profile.unlockedAircraft.every(isAircraftType) &&
    typeof profile.totalDistance === 'number' && Number.isFinite(profile.totalDistance) && profile.totalDistance >= 0 &&
    typeof profile.successfulLandings === 'number' && Number.isFinite(profile.successfulLandings) && profile.successfulLandings >= 0 &&
    typeof profile.kills === 'number' && Number.isFinite(profile.kills) && profile.kills >= 0 &&
    typeof profile.deaths === 'number' && Number.isFinite(profile.deaths) && profile.deaths >= 0 &&
    !!profile.discoveries && typeof profile.discoveries === 'object' &&
    typeof profile.challengeCompletions === 'number' && Number.isFinite(profile.challengeCompletions) && profile.challengeCompletions >= 0 &&
    typeof profile.eventCompletions === 'number' && Number.isFinite(profile.eventCompletions) && profile.eventCompletions >= 0 &&
    typeof profile.legacyImportPending === 'boolean';
}

let serverProfile: NetworkProfile = createSafeNetworkProfile();
let profileHydrated = false;
let legacyImportSent = false;

type RemotePlayer = {
  playerId: string;
  cityId: CityId;
  entityType: EntityType;
  displayName: string;
  identityTag: THREE.Sprite;
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
};

type ClientProjectile = {
  mesh: THREE.Group;
  direction: THREE.Vector3;
  authoritativePosition: THREE.Vector3;
  pendingAge: number;
};

type AssistedShotVisual = {
  shotId: string;
  mesh: THREE.Group;
  origin: THREE.Vector3;
  targetPosition: THREE.Vector3;
  targetId: string;
  elapsed: number;
  duration: number;
};

function createPlayerIdentityTag(name: string, type: AircraftType, king = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffb0b0';
  context.font = '700 17px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${king ? '♛' : '◆'} ${name.slice(0, 14)} · ${aircraftDefinitions[type].name}`, 128, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const label = new THREE.Sprite(material);
  label.scale.set(11, 1.15, 1);
  label.renderOrder = 4;
  return label;
}

function disposePlayerIdentityTag(label: THREE.Sprite): void {
  const material = label.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
}

function refreshPlayerIdentityTag(remote: RemotePlayer): void {
  scene.remove(remote.identityTag);
  disposePlayerIdentityTag(remote.identityTag);
  remote.identityTag = createPlayerIdentityTag(remote.displayName, remote.aircraftType, remote.playerId === kingPlayerId);
  remote.identityTag.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, 5.2);
  scene.add(remote.identityTag);
}

function refreshAllPlayerIdentityTags(): void {
  for (const remote of remotePlayers.values()) refreshPlayerIdentityTag(remote);
}

function createTargetBrackets(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = '#ff6257';
  context.lineWidth = 5;
  const inset = 13;
  const length = 27;
  context.beginPath();
  context.moveTo(inset + length, inset); context.lineTo(inset, inset); context.lineTo(inset, inset + length);
  context.moveTo(128 - inset - length, inset); context.lineTo(128 - inset, inset); context.lineTo(128 - inset, inset + length);
  context.moveTo(inset, 128 - inset - length); context.lineTo(inset, 128 - inset); context.lineTo(inset + length, 128 - inset);
  context.moveTo(128 - inset - length, 128 - inset); context.lineTo(128 - inset, 128 - inset); context.lineTo(128 - inset, 128 - inset - length);
  context.stroke();
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
function createRemotePlayerProxy(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ff574d';
  context.shadowColor = 'rgba(255, 54, 45, 0.7)';
  context.shadowBlur = 7;
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
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = '#ffe2df';
  context.lineWidth = 2;
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
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
  debrisMaterial: THREE.MeshBasicMaterial;
  debris: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3 }>;
  elapsed: number;
};

const remotePlayers = new Map<string, RemotePlayer>();
const combatForward = new THREE.Vector3();
const combatOffset = new THREE.Vector3();
const combatLockRange = 1_000;
const lockBoresightPoint = new THREE.Vector3();
const lockCircleEdgePoint = new THREE.Vector3();
const lockCameraRight = new THREE.Vector3();
const lockProjectedCenter = new THREE.Vector3();
const lockProjectedEdge = new THREE.Vector3();
const lockTargetProjected = new THREE.Vector3();
let lockCircleCenterX = window.innerWidth * 0.5;
let lockCircleCenterY = window.innerHeight * 0.5;
let lockCircleRadius = 90;
type CombatLockState = 'SEARCHING' | 'LOCKED';
let selectedCombatTarget: { remote: RemotePlayer; distance: number; locked: boolean } | null = null;
let lockedTargetId: string | null = null;
let serverLockedTargetId: string | null = null;
let localHeat = 0;
let localHeatMultiplier = 1;
let combatLockState: CombatLockState = 'SEARCHING';
let requestedLockTargetId: string | null = null;
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
  const mapPlayers = [...remotePlayers.entries()].map(([id, remote]) => ({
    id,
    x: remote.plane.position.x,
    z: remote.plane.position.z,
    king: id === kingPlayerId,
    heatLevel: remote.heatLevel,
  }));
  worldMap.update({
    position: airplane.position,
    forward: { x: direction.x, z: direction.z },
    king: kingPlayerId === localPlayerId,
    players: mapPlayers,
    waypoint,
    contractTarget: contractMapTarget(),
    challenges: skyChallenges?.getMapMarkers(),
    events: [
      ...(cityEvent && eventObjective ? [{ id: cityEvent.id, x: eventObjective.x, z: eventObjective.z, label: cityEvent.name, lifecycle: cityEvent.lifecycle }] : []),
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
        color: definition.mapColor,
        controllerName: state?.controllerName,
        captureProgress: state?.captureProgress ?? 0,
        contested: state?.contested ?? false,
      };
    }),
  });
}

const pilotMenu = new PilotMenu(pilotMenuOverlayElement);
const nextActionSystem = new NextActionSystem();
let nextActionRenderAt = 0;
let nextActionSignature = '';

function pilotChallengeSuitability(type: string): string {
  if (type === 'precision' || type === 'lowAltitude') return 'Trainer-friendly';
  if (type === 'inverted' || type === 'corkscrew' || type === 'dive') return 'Fighter-friendly';
  if (type === 'speed' || type === 'climb') return 'Private Jet or Fighter';
  return 'Any aircraft';
}

function playerFacingEventDetail(event: NetworkCityEvent): string {
  switch (event.eventType) {
    case 'mostWanted': return 'The marked pilot survives for the reward; destroy them first to claim the bounty.';
    case 'supplyDrop': return /golden/i.test(event.name) ? 'Reach the rare Golden Drop first and hold the pickup zone.' : 'Reach the drop first and hold the pickup zone.';
    case 'skyRush': return 'Fly the temporary gate route fastest for the top reward.';
    case 'riskZone': return 'Build a bonus inside the zone, then leave safely to bank it.';
    case 'emergencyEscort': return 'Fly near the event aircraft until it reaches its destination.';
    case 'cargoConvoy': return 'Escort the Dallas cargo convoy to build shared progress.';
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

function updateNextActions(force = false): void {
  const now = performance.now();
  if (!force && now < nextActionRenderAt) return;
  nextActionRenderAt = now + 1000;
  const distanceTo = (x: number, z: number): number => Math.hypot(airplane.position.x - x, airplane.position.z - z);
  const discoveryProgress = discoverySystem?.getProgress() ?? { discovered: 0, total: 0, percent: 0 };
  const candidates: NextActionCandidate[] = [];

  if (onGround && !crashed) {
    candidates.push({
      id: 'takeoff', kind: 'takeoff', title: 'FLY: Take Off',
      detail: 'Build speed on the runway, rotate, then choose an activity in the air.',
      relevance: runStarted ? 0 : 22,
    });
  }
  if (runStarted && discoveryProgress.discovered === 0) {
    candidates.push({
      id: 'map-first-discovery', kind: 'map', title: 'MAP: Find a landmark',
      detail: 'Use the map to spot nearby ? markers and choose an exploration route.',
      actions: [{ label: 'Open Map', run: () => worldMap.setOpen(true) }],
    });
  }

  const activeEvent = cityEvent && (cityEvent.lifecycle === 'available' || cityEvent.lifecycle === 'active') && cityEvent.expiresAt > Date.now()
    ? cityEvent
    : undefined;
  const activeEventObjective = activeEvent ? eventObjectiveForLocal(activeEvent) : undefined;
  if (activeEvent && activeEventObjective) {
    const objective = activeEventObjective;
    const remaining = Math.max(0, Math.ceil((activeEvent.expiresAt - Date.now()) / 1000));
    candidates.push({
      id: `event:${activeEvent.id}`,
      kind: 'event',
      title: `LIVE: ${activeEvent.name.replace(/\s*·\s*.*/, '')}`,
      detail: `${playerFacingEventDetail(activeEvent)} · ${remaining}s`,
      distance: distanceTo(objective.x, objective.z),
      urgency: Math.max(0, 1 - remaining / 90),
      relevance: activeEvent.lifecycle === 'active' ? 14 : 7,
      actions: joinedEventId === activeEvent.id
        ? [{ label: 'Set Waypoint', run: () => setActivityWaypoint(objective.x, objective.z, activeEvent.name) }]
        : [{
          label: 'Join',
          disabled: !localPlayerId || !connectionReady(),
          title: !localPlayerId ? 'Waiting for multiplayer connection.' : undefined,
          run: () => {
            if (!localPlayerId || !connectionReady()) return;
            setActivityWaypoint(objective.x, objective.z, activeEvent.name);
            socket.send(JSON.stringify({ type: 'eventJoin', eventId: activeEvent.id }));
            joinedEventId = activeEvent.id;
            updateDynamicEventHud();
          },
        }],
    });
  }

  const contract = activeContract?.definition ?? availableContract;
  if (contract) {
    const destination = airportById(contract.destinationAirportId);
    const requiredCredits = aircraftDefinitions[contract.aircraftType].creditsRequired;
    const creditsNeeded = Math.max(0, requiredCredits - credits);
    const aircraftRequirement = aircraftType === contract.aircraftType ? '' : ` Requires ${aircraftDefinitions[contract.aircraftType].name}.`;
    candidates.push({
      id: `${activeContract ? 'active' : 'available'}-contract:${contract.id}`,
      kind: 'contract',
      title: `${activeContract ? 'CONTRACT' : 'ACTIVITY'}: ${contractTitle(contract.type)}`,
      detail: creditsNeeded > 0 ? `Requires ${aircraftDefinitions[contract.aircraftType].name} — need ${creditsNeeded} more credits.` : `${contractDetail(contract)}${aircraftRequirement}`,
      distance: distanceTo(destination.x, destination.z),
      relevance: activeContract ? 18 : 0,
      lockedReason: creditsNeeded > 0 ? `Locked aircraft: ${aircraftDefinitions[contract.aircraftType].name}` : undefined,
      actions: [{ label: 'Set Waypoint', run: () => setActivityWaypoint(destination.x, destination.z, destination.name) }],
    });
  }

  const challenges = cityWorld.skyChallenges ?? [];
  const nearestChallenge = challenges
    .map((challenge) => ({ challenge, gate: challenge.gates[0], distance: distanceTo(challenge.gates[0].x, challenge.gates[0].z) }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (nearestChallenge) {
    const required = nearestChallenge.challenge.requiredAircraftType;
    const creditsNeeded = required ? Math.max(0, aircraftDefinitions[required].creditsRequired - credits) : 0;
    const challengeUnavailableReason = creditsNeeded > 0
      ? `Requires ${aircraftDefinitions[required!].name} — need ${creditsNeeded} more credits.`
      : required && aircraftType !== required
        ? `Requires ${aircraftDefinitions[required].name} — equip it in Garage.`
        : undefined;
    const activeChallenge = skyChallenges?.getHud();
    candidates.push({
      id: `challenge:${nearestChallenge.challenge.id}`,
      kind: 'challenge',
      title: `SKILL: ${nearestChallenge.challenge.name}`,
      detail: challengeUnavailableReason ?? `${pilotChallengeSuitability(nearestChallenge.challenge.type)} · +${nearestChallenge.challenge.reward} credits`,
      distance: nearestChallenge.distance,
      lockedReason: challengeUnavailableReason,
      actions: [{
        label: activeChallenge ? 'Set Waypoint' : 'Start',
        disabled: Boolean(!activeChallenge && challengeUnavailableReason),
        title: challengeUnavailableReason,
        run: () => {
          if (!activeChallenge && !skyChallenges?.activate(nearestChallenge.challenge.id)) return;
          setActivityWaypoint(nearestChallenge.gate.x, nearestChallenge.gate.z, nearestChallenge.challenge.name);
          updateSkyChallengeHud();
        },
      }],
    });
  }

  const nearestDiscovery = discoverySystem?.getMapMarkers()
    .filter((marker) => !marker.discovered)
    .map((marker) => ({ marker, distance: distanceTo(marker.x, marker.z) }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (nearestDiscovery) {
    candidates.push({
      id: `discovery:${nearestDiscovery.marker.id}`,
      kind: 'discovery',
      title: 'DISCOVER: Unknown landmark',
      detail: 'Fly into its discovery envelope to reveal and earn the location reward.',
      distance: nearestDiscovery.distance,
      relevance: discoveryProgress.discovered === 0 ? 15 : 0,
      actions: [{ label: 'Set Waypoint', run: () => setActivityWaypoint(nearestDiscovery.marker.x, nearestDiscovery.marker.z, 'Unknown Landmark') }],
    });
  }

  const nearestStuntZone = (cityWorld.stuntZones ?? [])
    .map((zone) => ({ zone, distance: distanceTo(zone.x, zone.z) }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (nearestStuntZone) {
    const guide = stuntGuide.find((entry) => entry.type === (nearestStuntZone.zone.kind === 'bridge' ? 'bridgeRun' : 'highSpeedPass'))!;
    candidates.push({
      id: `stunt:${nearestStuntZone.zone.id}`,
      kind: 'stunt',
      title: `STUNT: ${guide.name}`,
      detail: `${guide.how} +${guide.reward} base score.`,
      distance: nearestStuntZone.distance,
      actions: [{ label: 'Set Waypoint', run: () => setActivityWaypoint(nearestStuntZone.zone.x, nearestStuntZone.zone.z, guide.name) }],
    });
  }

  if (!onGround && selectedCombatTarget) {
    candidates.push({
      id: `combat:${selectedCombatTarget.remote.playerId}`,
      kind: 'combat',
      title: 'COMBAT: Player in sight',
      detail: 'Keep the pilot inside the lock circle, then fire when LOCKED.',
      distance: selectedCombatTarget.distance,
      relevance: selectedCombatTarget.locked ? 15 : 0,
    });
  }

  let nearestAirport = centralAirport;
  let nearestAirportDistance = Number.POSITIVE_INFINITY;
  for (const airport of airports) {
    const distance = distanceTo(airport.x, airport.z);
    if (distance < nearestAirportDistance) {
      nearestAirport = airport;
      nearestAirportDistance = distance;
    }
  }
  if (!onGround && flightDistanceSinceTakeoff >= 5_000 && !activeContract) {
    candidates.push({
      id: `landing:${nearestAirport.id}`,
      kind: 'landing',
      title: `LAND: ${nearestAirport.name}`,
      detail: 'Set up a stable approach, touch down gently, then taxi to a stop.',
      distance: nearestAirportDistance,
      actions: [{ label: 'Set Waypoint', run: () => setActivityWaypoint(nearestAirport.x, nearestAirport.z, nearestAirport.name) }],
    });
  }

  if (onGround && totalSuccessfulLandings > 0) {
    candidates.push({
      id: 'garage', kind: 'garage', title: 'GARAGE: Review your aircraft',
      detail: 'Compare the aircraft you have unlocked and equip one before the next flight.',
      actions: [{ label: 'Open Garage', run: openGarage }],
    });
  }

  const recommendations = nextActionSystem.recommend({
    onGround,
    runStarted,
    lowProgress: discoveryProgress.discovered <= 1 && totalSuccessfulLandings === 0,
  }, candidates, now);
  const signature = recommendations.map((item) => `${item.id}:${Math.round(item.distance ?? -1)}:${item.detail}:${item.actions?.map((action) => `${action.label}:${Boolean(action.disabled)}`).join(',') ?? ''}`).join('|');
  if (!force && signature === nextActionSignature) return;
  nextActionSignature = signature;
  nextActionsElement.replaceChildren();
  if (!recommendations.length) return;
  for (const recommendation of recommendations) {
    const item = document.createElement('div');
    item.className = 'next-action';
    const title = document.createElement('strong'); title.textContent = recommendation.title;
    const meta = document.createElement('span'); meta.className = 'next-action-meta';
    meta.textContent = [formatActionDistance(recommendation.distance), recommendation.lockedReason].filter(Boolean).join(' · ');
    item.append(title);
    // The HUD is a prompt, not a briefing. Extra context appears only when
    // explaining a locked recommendation; full activity detail stays in TAB.
    if (recommendation.lockedReason) {
      const detail = document.createElement('span'); detail.textContent = recommendation.detail;
      item.append(detail);
    }
    if (meta.textContent) item.append(meta);
    if (recommendation.actions?.length) {
      const actions = document.createElement('div'); actions.className = 'next-action-actions';
      for (const action of recommendation.actions) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = action.label; button.disabled = action.disabled ?? false; if (action.title) button.title = action.title;
        button.addEventListener('click', () => { action.run(); nextActionSystem.recordAction(recommendation.id); updateNextActions(true); });
        actions.append(button);
      }
      item.append(actions);
    }
    nextActionsElement.append(item);
  }
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
  const contract = activeContract?.definition ?? availableContract;
  const activities = [] as Array<{
    name: string;
    detail: string;
    meta: string;
    actions?: Array<PilotMenuAction>;
  }>;
  if (contract) {
    const destination = airportById(contract.destinationAirportId);
    activities.push({
      name: `${activeContract ? 'ACTIVE' : 'AVAILABLE'} CONTRACT · ${contractTitle(contract.type)}`,
      detail: contractDetail(contract),
      meta: `${aircraftDefinitions[contract.aircraftType].name} · +${contract.reward} credits · ${Math.round(Math.hypot(airplane.position.x - destination.x, airplane.position.z - destination.z))}m to ${destination.name}`,
      actions: [
        { label: 'Set Waypoint', run: () => setWaypoint(destination.x, destination.z, destination.name) },
        ...(!activeContract ? [{
          label: Math.max(0, aircraftDefinitions[contract.aircraftType].creditsRequired - credits) > 0 ? 'Aircraft Locked' : 'Accept',
          disabled: Math.max(0, aircraftDefinitions[contract.aircraftType].creditsRequired - credits) > 0,
          run: () => { acceptAvailableContract(); openPilotMenu(); },
        }] : []),
      ],
    });
  }
  for (const challenge of cityWorld.skyChallenges ?? []) {
    const gate = challenge.gates[0];
    const required = challenge.requiredAircraftType;
    const creditsNeeded = required ? Math.max(0, aircraftDefinitions[required].creditsRequired - credits) : 0;
    const unavailableReason = creditsNeeded > 0
      ? `Requires ${aircraftDefinitions[required!].name} — need ${creditsNeeded} more credits.`
      : required && aircraftType !== required
        ? `Requires ${aircraftDefinitions[required].name} — equip it in Garage.`
        : undefined;
    activities.push({
      name: challenge.name,
      detail: unavailableReason ?? `${challenge.type.replace(/([A-Z])/g, ' $1')} skill route. Fly its gates before time expires.`,
      meta: `+${challenge.reward} credits · ${Math.round(Math.hypot(airplane.position.x - gate.x, airplane.position.z - gate.z))}m · ${pilotChallengeSuitability(challenge.type)}`,
      actions: [
        { label: 'Set Waypoint', run: () => setWaypoint(gate.x, gate.z, challenge.name) },
        { label: 'Start', disabled: Boolean(unavailableReason), title: unavailableReason, run: () => { if (skyChallenges?.activate(challenge.id)) updateSkyChallengeHud(); } },
      ],
    });
  }
  const event = cityEvent && (cityEvent.lifecycle === 'available' || cityEvent.lifecycle === 'active') ? cityEvent : undefined;
  const eventObjective = event ? eventObjectiveForLocal(event) : undefined;
  const liveEvent = event && eventObjective ? {
    name: event.name.replace(/\s*·\s*.*/, ''),
    detail: playerFacingEventDetail(event),
    meta: `${event.lifecycle === 'active' ? 'ACTIVE' : 'NEXT'} · +${event.rewardCredits ?? 0} credits · ${Math.max(0, Math.ceil((event.expiresAt - Date.now()) / 1000))}s · ${Math.round(Math.hypot(airplane.position.x - eventObjective.x, airplane.position.z - eventObjective.z))}m`,
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
      name: displayName,
      aircraft: currentAircraft.name,
      distance: 0,
      lifecycle: localPilotLifecycle(),
      score: playerScores.get(localPlayerId ?? '') ?? score,
      kills: profileHydrated ? serverProfile.kills : undefined,
      isLocal: true,
      mostWanted: wantedPlayerId === localPlayerId,
      king: kingPlayerId === localPlayerId,
    },
    ...[...remotePlayers.values()]
      .filter((remote) => remote.entityType === 'player' && remote.cityId === cityId)
      .map((remote) => ({
        name: remote.displayName,
        aircraft: aircraftDefinitions[remote.aircraftType].name,
        distance: remote.plane.position.distanceTo(airplane.position),
        lifecycle: remotePilotLifecycle(remote),
        score: playerScores.get(remote.playerId) ?? 0,
        isLocal: false,
        mostWanted: wantedPlayerId === remote.playerId,
        king: kingPlayerId === remote.playerId,
        setWaypoint: remote.lifeState === 'alive' ? () => setWaypoint(
          remote.plane.position.x,
          remote.plane.position.z,
          `${remote.displayName} · last reported position`,
        ) : undefined,
      })),
  ].sort((left, right) => {
    if (left.mostWanted !== right.mostWanted) return left.mostWanted ? -1 : 1;
    return left.distance - right.distance;
  });
  const territories = territoryDefinitions.map((definition) => {
    const state = territoryState.get(definition.id);
    return {
      name: definition.displayName,
      controller: state?.controllerName ? `Controlled by ${state.controllerName}` : 'Uncontrolled',
      contested: state?.contested ?? false,
      progress: state?.captureProgress ?? 0,
      distance: Math.hypot(airplane.position.x - definition.center.x, airplane.position.z - definition.center.z),
      setWaypoint: () => setWaypoint(definition.center.x, definition.center.z, definition.displayName),
    };
  }).sort((left, right) => left.distance - right.distance);

  return {
    status: [
      `STATE · ${flightStateElement.textContent ?? 'TAXI'}`,
      `AIRCRAFT · ${currentAircraft.name}`,
      `CREDITS · ${credits}`,
      `NEAREST · ${nearestAirport.name} · ${Math.round(nearestDistance)}m`,
    ],
    players: { city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', entries: players },
    territories: { city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee', entries: territories },
    activities,
    liveEvent,
    stunts: stuntGuide,
    discoveries: {
      city: cityId === 'dallas' ? 'Dallas' : 'Milwaukee',
      discovered,
      remaining: Math.max(0, discoveryProgress.total - discoveryProgress.discovered),
      total: discoveryProgress.total,
      percent: discoveryProgress.percent,
      openMap: () => { pilotMenu.close(); worldMap.setOpen(true); },
    },
    garage: {
      available: onGround && !crashed,
      reason: crashed ? 'Restart on a runway first.' : 'Land and come to a safe stop first.',
      open: () => { if (openGarage()) pilotMenu.close(); },
    },
    hints: {
      enabled: contextualHints.isEnabled(),
      toggle: () => {
        contextualHints.setEnabled(!contextualHints.isEnabled());
        openPilotMenu();
      },
    },
  };
}

function renderPilotMenu(): void {
  pilotMenu.open(pilotMenuData());
}

function refreshPilotMenu(): void {
  if (pilotMenu.isOpen() && !aircraftGarage.isOpen() && !worldMap.isOpen()) renderPilotMenu();
}

function openPilotMenu(): void {
  if (aircraftGarage.isOpen()) return;
  if (worldMap.isOpen()) worldMap.setOpen(false);
  keys.clear();
  renderPilotMenu();
}

function togglePilotMenu(): void {
  if (pilotMenu.isOpen()) {
    pilotMenu.close();
    return;
  }
  openPilotMenu();
}

pilotMenuButtonElement.addEventListener('click', openPilotMenu);

window.addEventListener('keydown', (event) => {
  if (pilotMenu.isOpen() || aircraftGarage.isOpen()) return;
  if (event.code === 'KeyM') {
    event.preventDefault();
    contextualHints.dismiss();
    worldMap.toggle();
  } else if (event.code === 'Escape' && worldMap.isOpen()) {
    event.preventDefault();
    worldMap.setOpen(false);
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || worldMap.isOpen() || pilotMenu.isOpen() || aircraftGarage.isOpen()) return;
  event.preventDefault();
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
});

renderer.domElement.addEventListener('pointermove', (event) => {
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
  cameraDistanceMultiplier = THREE.MathUtils.clamp(cameraDistanceMultiplier * zoomFactor, 0.62, 1.8);
  if (cameraOrbitBlend > 0) {
    const minimumRadius = defaultChaseDistance * 0.62;
    const maximumRadius = defaultChaseDistance * 1.8 + defaultChaseHeight;
    cameraOrbitRadiusTarget = THREE.MathUtils.clamp(cameraOrbitRadiusTarget * zoomFactor, minimumRadius, maximumRadius);
  }
}, { passive: false });
const projectileGeometry = new THREE.BoxGeometry(0.3, 0.3, 9);
const projectileGlowGeometry = new THREE.BoxGeometry(0.78, 0.78, 11.5);
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
const remoteEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const projectileDirection = new THREE.Vector3();
const projectileOrigin = new THREE.Vector3();
const muzzleQuaternion = new THREE.Quaternion();
let localPlayerId: string | null = null;
let localLifeState: PlayerLifeState = 'respawning';
let networkTimer = 0;
let navigationTimer = 0;
let fireCooldown = 0;
let clientShotSequence = 0;
let wasFirstPlace = false;
let leaderMessageTimer: number | undefined;
const leaderboardElement = document.querySelector<HTMLOListElement>('#leaderboard-list')!;
const leaderMessageElement = document.querySelector<HTMLDivElement>('#leader-message')!;
const playerScores = new Map<string, number>();
const collisionRadius = 2.5;
const nearMissRadius = 12;
const collisionRadiusSquared = collisionRadius * collisionRadius;
const nearMissRadiusSquared = nearMissRadius * nearMissRadius;

function applyVisualQaPreset(preset: NonNullable<typeof cityWorld.visualQaPresets>[number]): void {
  keys.clear();
  crashed = false;
  health = 100;
  throttle = preset.onGround ? 0 : 0.62;
  currentSpeed = preset.onGround ? 0 : Math.min(currentAircraft.maxSpeed * 0.62, 58);
  verticalSpeed = 0;
  heading = preset.heading;
  pitch = preset.pitch ?? 0;
  roll = 0;
  rollControlStrength = 0;
  pitchControlStrength = 0;
  airplane.position.set(preset.x, groundPlaneY(preset.x, preset.z) + preset.altitude, preset.z);
  airplane.rotation.set(pitch, heading, roll, 'YXZ');
  forward.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  velocity.copy(forward).multiplyScalar(currentSpeed);
  onGround = Boolean(preset.onGround);
  landedFeedbackTime = 0;
  cameraShakeTime = 0;
  runStarted = true;
  crashOverlay.classList.add('hidden');
  howToPlayElement.classList.add('hidden');
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
  direction.set(socket.forward.x, socket.forward.y, socket.forward.z).applyQuaternion(airplane.quaternion).normalize();
  origin.set(socket.position.x, socket.position.y, socket.position.z).applyQuaternion(airplane.quaternion).add(airplane.position);
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
  const targetPosition = new THREE.Vector3(message.targetPosition.x, message.targetPosition.y, message.targetPosition.z);
  mesh.position.copy(origin);
  mesh.visible = true;
  scene.add(mesh);
  assistedShotVisuals.push({
    shotId: message.shotId,
    mesh,
    origin,
    targetPosition,
    targetId: message.targetId,
    elapsed: 0,
    duration: 0.08 + THREE.MathUtils.clamp(origin.distanceTo(targetPosition) / 1_000, 0, 1) * 0.07,
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
  projectile.authoritativePosition.set(message.position.x, message.position.y, message.position.z);
  projectile.pendingAge = 0;
  // Keep the render-frame muzzle visible when the server adopts a local shot.
  // A late authoritative origin is allowed to advance this tracer, never pull
  // it backwards through a fast-moving Fighter.
  if (predicted) {
    projectileOrigin.subVectors(projectile.authoritativePosition, projectile.mesh.position);
    if (projectileOrigin.dot(projectile.direction) < 0) projectile.authoritativePosition.copy(projectile.mesh.position);
  } else {
    projectile.mesh.position.copy(projectile.authoritativePosition);
  }
  projectile.mesh.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
  projectile.mesh.visible = true;
  scene.add(projectile.mesh);
  clientProjectiles.set(message.projectileId, projectile);
}

function updateClientProjectiles(message: Extract<ServerMessage, { type: 'projectileStates' }>): void {
  for (const state of message.projectiles) {
    const projectile = clientProjectiles.get(state.projectileId);
    if (!projectile) continue;
    projectile.authoritativePosition.set(state.position.x, state.position.y, state.position.z);
    projectile.direction.set(state.direction.x, state.direction.y, state.direction.z).normalize();
  }
}

function removeClientProjectile(projectileId: string): void {
  const projectile = clientProjectiles.get(projectileId);
  if (!projectile) return;
  releaseProjectile(projectile);
  clientProjectiles.delete(projectileId);
}

function updateProjectiles(delta: number): void {
  for (const [projectileId, projectile] of clientProjectiles) {
    const positionBlend = 1 - Math.exp(-delta * 34);
    projectile.mesh.position.lerp(projectile.authoritativePosition, positionBlend);
    projectile.mesh.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
  }
  for (const [clientShotId, projectile] of predictedProjectiles) {
    projectile.pendingAge += delta;
    projectile.mesh.position.addScaledVector(projectile.direction, delta * 520);
    if (projectile.pendingAge < pendingTracerLifetime) continue;
    predictedProjectiles.delete(clientShotId);
    releaseProjectile(projectile);
  }
  for (let index = assistedShotVisuals.length - 1; index >= 0; index -= 1) {
    const shot = assistedShotVisuals[index];
    shot.elapsed += delta;
    const target = remotePlayers.get(shot.targetId);
    if (target) shot.targetPosition.lerp(target.plane.position, 1 - Math.exp(-delta * 30));
    const progress = THREE.MathUtils.clamp(shot.elapsed / shot.duration, 0, 1);
    assistedShotPoint.lerpVectors(shot.origin, shot.targetPosition, progress);
    assistedShotDirection.subVectors(shot.targetPosition, shot.origin).normalize();
    shot.mesh.position.copy(assistedShotPoint);
    shot.mesh.quaternion.setFromUnitVectors(projectileForward, assistedShotDirection);
    if (progress < 1) continue;
    scene.remove(shot.mesh);
    shot.mesh.visible = false;
    assistedShotVisuals.splice(index, 1);
    if (assistedShotPool.length < maxAssistedShotVisuals) assistedShotPool.push(shot.mesh);
  }
}

function createDestructionEffect(position: THREE.Vector3): void {
  if (destructionEffects.length >= 6) {
    const oldest = destructionEffects.shift();
    if (oldest) disposeDestructionEffect(oldest);
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
  const flash = new THREE.Mesh(destructionFlashGeometry, flashMaterial);
  flash.scale.setScalar(1.3);
  group.add(flash);
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
  destructionEffects.push({ group, flash, flashMaterial, debrisMaterial, debris, elapsed: 0 });
}

function disposeDestructionEffect(effect: DestructionEffect): void {
  scene.remove(effect.group);
  effect.flashMaterial.dispose();
  effect.debrisMaterial.dispose();
}

function updateDestructionEffects(delta: number): void {
  for (let effectIndex = destructionEffects.length - 1; effectIndex >= 0; effectIndex -= 1) {
    const effect = destructionEffects[effectIndex];
    effect.elapsed += delta;
    const progress = effect.elapsed / 1.2;
    effect.flash.scale.setScalar(1.3 + progress * 10);
    effect.flashMaterial.opacity = Math.max(0, 0.9 * (1 - progress));
    effect.debrisMaterial.opacity = Math.max(0, 0.92 * (1 - progress));
    for (const piece of effect.debris) {
      piece.mesh.position.addScaledVector(piece.velocity, delta);
      piece.velocity.y -= delta * 7;
      piece.mesh.rotation.x += delta * 4;
      piece.mesh.rotation.z += delta * 5;
    }
    if (effect.elapsed < 1.2) continue;
    disposeDestructionEffect(effect);
    destructionEffects.splice(effectIndex, 1);
  }
}

function updateLeaderboard(players: LeaderboardPlayer[]): void {
  playerScores.clear();
  for (const player of players) playerScores.set(player.playerId, player.score);
  const rows = players.slice(0, 10).map((player) => {
    const row = document.createElement('li');
    const content = document.createElement('div');
    const name = document.createElement('span');
    const playerScore = document.createElement('strong');
    const isLocal = player.playerId === localPlayerId;

    row.className = isLocal ? 'you' : '';
    content.className = 'leaderboard-entry';
    name.textContent = `${player.displayName}${isLocal ? ' (You)' : ''}`;
    playerScore.textContent = player.score.toString();
    content.append(name, playerScore);
    row.append(content);
    return row;
  });
  leaderboardElement.replaceChildren(...rows);

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

  const lifeState = networkLifeState(player.lifeState);
  remoteEuler.set(player.rotation.x, player.rotation.y, player.rotation.z, 'YXZ');
  let remote = remotePlayers.get(player.playerId);

  if (!remote) {
    const targetPosition = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
    const targetQuaternion = new THREE.Quaternion().setFromEuler(remoteEuler);
    const plane = createAirplane(player.aircraftType, true);
    const identityTag = createPlayerIdentityTag(player.displayName ?? 'PLAYER', player.aircraftType, player.playerId === kingPlayerId);
    const targetBrackets = createTargetBrackets();
    const playerProxy = createRemotePlayerProxy();
    plane.position.copy(targetPosition);
    plane.quaternion.copy(targetQuaternion);
    plane.add(targetBrackets);
    identityTag.position.copy(targetPosition).add(new THREE.Vector3(0, 5.2, 0));
    playerProxy.position.copy(targetPosition);
    scene.add(plane, identityTag, playerProxy);
    remote = {
      playerId: player.playerId,
      cityId: player.cityId,
      entityType: 'player',
      displayName: player.displayName ?? 'PLAYER',
      identityTag,
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
    };
    plane.visible = lifeState === 'alive';
    playerProxy.visible = lifeState === 'alive';
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
    remote.targetBrackets = createTargetBrackets();
    replacement.add(remote.targetBrackets);
    scene.add(replacement);
    remote.plane = replacement;
    remote.aircraftType = player.aircraftType;
    refreshPlayerIdentityTag(remote);
  }

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
  remote.interpolationDuration = THREE.MathUtils.clamp(remote.timeSinceUpdate, 0.08, 0.18);
  remote.interpolationElapsed = 0;
  remote.timeSinceUpdate = 0;
  const lifeStateChanged = remote.lifeState !== lifeState;
  remote.lifeState = lifeState;
  remote.cityId = player.cityId;
  if (lifeStateChanged) remote.nearMissActive = false;
  remote.plane.visible = lifeState === 'alive';
  remote.playerProxy.visible = lifeState === 'alive';
}

function updateRemotePlayers(delta: number): void {
  for (const remote of remotePlayers.values()) {
    remote.timeSinceUpdate += delta;
    remote.interpolationElapsed = Math.min(remote.interpolationDuration, remote.interpolationElapsed + delta);
    const interpolation = remote.interpolationElapsed / remote.interpolationDuration;
    remote.plane.position.lerpVectors(remote.previousPosition, remote.targetPosition, interpolation);
    remote.plane.quaternion.slerpQuaternions(remote.previousQuaternion, remote.targetQuaternion, interpolation);
    remote.identityTag.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, 5.2);
    remote.identityTag.visible = remote.plane.visible && remote.plane.position.distanceToSquared(airplane.position) <= 1_200 * 1_200;
    const distance = remote.plane.position.distanceTo(airplane.position);
    const proxyMaterial = remote.playerProxy.material as THREE.SpriteMaterial;
    const proxyBlend = THREE.MathUtils.smoothstep(distance, 700, 1_500);
    remote.playerProxy.position.copy(remote.plane.position).addScaledVector(cameraWorldUp, 2.8);
    remote.playerProxy.visible = remote.plane.visible && proxyBlend > 0.01;
    proxyMaterial.opacity = proxyBlend;
    if (remote.playerProxy.visible) {
      const targetPixels = distance <= 3_000 ? 14 : distance <= 8_000 ? 12 : 10;
      const worldPerPixel = distance * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(1, window.innerHeight);
      const width = THREE.MathUtils.clamp(worldPerPixel * targetPixels, 8, 220);
      remote.playerProxy.scale.set(width, width * (2 / 3), 1);
    }
  }
}

function updateLockCircle(): void {
  // Project the same physical boresight the server uses, rather than assuming
  // a third-person camera happens to be centred on the aircraft's nose.
  lockBoresightPoint.copy(airplane.position).addScaledVector(combatForward, combatLockRange);
  lockProjectedCenter.copy(lockBoresightPoint).project(camera);
  lockCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  lockCircleEdgePoint.copy(combatForward).multiplyScalar(Math.cos(LOCK_ANGLE))
    .addScaledVector(lockCameraRight, Math.sin(LOCK_ANGLE)).normalize()
    .multiplyScalar(combatLockRange).add(airplane.position);
  lockProjectedEdge.copy(lockCircleEdgePoint).project(camera);
  const centerX = (lockProjectedCenter.x * 0.5 + 0.5) * window.innerWidth;
  const centerY = (-lockProjectedCenter.y * 0.5 + 0.5) * window.innerHeight;
  const derivedRadius = Math.hypot(
    (lockProjectedEdge.x - lockProjectedCenter.x) * window.innerWidth * 0.5,
    (lockProjectedEdge.y - lockProjectedCenter.y) * window.innerHeight * 0.5,
  );
  const diameter = Math.max(1, derivedRadius * 2);
  lockCircleCenterX = centerX;
  lockCircleCenterY = centerY;
  lockCircleRadius = diameter * 0.5;
  acquisitionCircleElement.style.setProperty('--acquisition-size', `${Math.round(diameter)}px`);
  acquisitionCircleElement.style.left = `${Math.round(centerX)}px`;
  acquisitionCircleElement.style.top = `${Math.round(centerY)}px`;
}

function clearCombatTarget(): void {
  selectedCombatTarget = null;
  lockedTargetId = null;
  serverLockedTargetId = null;
  combatLockState = 'SEARCHING';
  requestedLockTargetId = null;
  lockValidationElapsed = Number.POSITIVE_INFINITY;
  targetFeedbackElement.classList.add('hidden');
  targetFeedbackElement.classList.remove('locked');
  for (const remote of remotePlayers.values()) remote.targetBrackets.visible = false;
}

function validateServerLock(targetId: string | null, delta: number): void {
  if (targetId !== requestedLockTargetId) {
    requestedLockTargetId = targetId;
    serverLockedTargetId = null;
    lockValidationElapsed = Number.POSITIVE_INFINITY;
    if (localPlayerId && connectionReady()) {
      socket.send(JSON.stringify(targetId ? { type: 'lock', targetId } : { type: 'lock' }));
      lockValidationElapsed = 0;
    }
    return;
  }
  if (!targetId) return;
  lockValidationElapsed += delta;
  if (lockValidationElapsed < 0.1 || !localPlayerId || !connectionReady()) return;
  lockValidationElapsed = 0;
  socket.send(JSON.stringify({ type: 'lock', targetId }));
}

function updateCombatTarget(delta = 0): void {
  if (crashed || localLifeState !== 'alive') {
    clearCombatTarget();
    return;
  }
  const minimumForwardDot = Math.cos(LOCK_ANGLE);
  // This is the same physics-root forward vector and origin used by the
  // server lock predicate. Muzzle sockets are only for projectile visuals.
  combatForward.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  updateLockCircle();

  let candidate: RemotePlayer | null = null;
  let candidateDistance = Number.POSITIVE_INFINITY;
  let candidateAngle = Number.POSITIVE_INFINITY;
  for (const remote of remotePlayers.values()) {
    if (remote.lifeState !== 'alive' || !remote.plane.visible || !entityCapabilities(remote.entityType).targetable) continue;
    combatOffset.copy(remote.plane.position).sub(airplane.position);
    const distance = combatOffset.length();
    if (distance < 1 || distance > combatLockRange) continue;
    combatOffset.multiplyScalar(1 / distance);
    const forwardDot = THREE.MathUtils.clamp(combatForward.dot(combatOffset), -1, 1);
    if (forwardDot < minimumForwardDot) continue;
    const angle = Math.acos(forwardDot);
    if (angle < candidateAngle || (angle === candidateAngle && distance < candidateDistance)) {
      candidate = remote;
      candidateDistance = distance;
      candidateAngle = angle;
    }
  }

  // The closest actual player to screen center owns the only lock. There is
  // no acquisition timer, prediction cone, or grace state to disagree with it.
  const targetId = candidate?.playerId ?? null;
  if (targetId !== lockedTargetId) lockedTargetId = targetId;
  validateServerLock(targetId, delta);

  if (!candidate) {
    selectedCombatTarget = null;
    combatLockState = 'SEARCHING';
    targetDistanceElement.textContent = '—';
    targetRangeElement.textContent = combatLockState;
    targetFeedbackElement.classList.remove('hidden', 'locked');
    for (const remote of remotePlayers.values()) remote.targetBrackets.visible = false;
    if (combatQaElement) combatQaElement.textContent = `COMBAT QA\ntarget: none\nlock: ${serverLockedTargetId ?? 'none'}\n${combatQaDetail}`;
    return;
  }

  contextualHints.trigger('combat');

  const locked = serverLockedTargetId === targetId;
  selectedCombatTarget = { remote: candidate, distance: candidateDistance, locked };
  combatLockState = locked ? 'LOCKED' : 'SEARCHING';
  targetDistanceElement.textContent = Math.round(candidateDistance).toString();
  targetRangeElement.textContent = combatLockState;
  targetFeedbackElement.classList.remove('hidden');
  targetFeedbackElement.classList.toggle('locked', locked);
  for (const remote of remotePlayers.values()) {
    remote.targetBrackets.visible = locked && remote === candidate && remote.plane.visible;
  }
  if (combatQaElement) {
    lockTargetProjected.copy(candidate.plane.position).project(camera);
    const targetScreenX = (lockTargetProjected.x * 0.5 + 0.5) * window.innerWidth;
    const targetScreenY = (-lockTargetProjected.y * 0.5 + 0.5) * window.innerHeight;
    const screenInside = Math.hypot(targetScreenX - lockCircleCenterX, targetScreenY - lockCircleCenterY) <= lockCircleRadius;
    combatQaElement.textContent = [
      'COMBAT QA',
      `target: ${candidate.playerId.slice(0, 8)}`,
      `circle: ${screenInside ? 'inside' : 'edge/outside'} · angular: ${(THREE.MathUtils.radToDeg(candidateAngle)).toFixed(2)}° / ${(THREE.MathUtils.radToDeg(LOCK_ANGLE)).toFixed(2)}°`,
      `server lock: ${serverLockedTargetId === candidate.playerId ? 'LOCKED' : 'SEARCHING'}`,
      combatQaDetail,
    ].join('\n');
  }
}

function updatePlaneVisuals(plane: THREE.Group, power: number, delta: number): void {
  const visuals = plane.userData.visuals as AircraftVisuals | undefined;
  if (!visuals) return;
  const propeller = (plane.userData.assetPropeller as THREE.Object3D | null | undefined) ?? visuals.propeller;
  if (propeller) propeller.rotation.z += delta * (7 + power * 34);
  if (!visuals.exhaustMaterial) return;
  const isFighter = plane.userData.aircraftType === 'fighter';
  visuals.exhaustMaterial.opacity = (isFighter ? 0.025 : 0.012) + power * (isFighter ? 0.18 : 0.085);
  for (const exhaust of visuals.exhausts) {
    exhaust.scale.y = (exhaust.userData.baseLength as number) * (0.72 + power * (isFighter ? 0.68 : 0.42));
  }
}

function updateAircraftVisuals(delta: number): void {
  const localPower = crashed ? 0 : Math.max(throttle, currentSpeed / currentAircraft.maxSpeed * 0.72);
  updatePlaneVisuals(airplane, localPower, delta);
  for (const remote of remotePlayers.values()) updatePlaneVisuals(remote.plane, 0.55, delta);
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
  if (localLifeState !== 'alive') return;
  for (const remote of remotePlayers.values()) {
    if (remote.lifeState !== 'alive' || !entityCapabilities(remote.entityType).collidable) {
      remote.nearMissActive = false;
      continue;
    }
    const distanceSquared = airplane.position.distanceToSquared(remote.plane.position);
    if (distanceSquared <= collisionRadiusSquared) {
      endRun('MID-AIR COLLISION');
      return;
    }

    if (distanceSquared <= nearMissRadiusSquared) {
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

function getLandingAssistAirport(position: THREE.Vector3): AirportDefinition | null {
  for (const airport of airports) {
    const offsetX = position.x - airport.x;
    const offsetZ = position.z - airport.z;
    const cosine = Math.cos(airport.heading);
    const sine = Math.sin(airport.heading);
    const lateral = offsetX * cosine - offsetZ * sine;
    const longitudinal = offsetX * sine + offsetZ * cosine;
    if (
      Math.abs(lateral) <= airport.runwayWidth * 1.6 + 36 &&
      Math.abs(longitudinal) <= airport.runwayLength / 2 + 180 &&
      runwayHeadingError(airport) <= 0.72
    ) return airport;
  }
  return null;
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
  const throttleUp = keys.has('KeyW');
  const throttleDown = keys.has('KeyS');
  if (!onGround) {
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

  const rollInput = Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'));
  const yawInput =
    Number(keys.has('KeyA')) -
    Number(keys.has('KeyD'));
  const pitchInput = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
  // Pitch inputs ease into an attitude command before the existing lift/gravity
  // model sees that attitude. This keeps short taps precise without changing
  // vertical velocity directly.
  const pitchInputResponse = 1.8 + currentAircraft.pitchRate * 3.2;
  pitchControlStrength = moveToward(
    pitchControlStrength,
    pitchInput,
    delta * pitchInputResponse,
  );

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
    if (Math.abs(currentSpeed) < 0.04 && groundTargetSpeed === 0) currentSpeed = 0;
    const groundSteering = (0.12 + Math.min(1, currentSpeed / 20) * 0.72) * currentAircraft.groundSteering;
    heading += yawInput * delta * groundSteering;
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

    if (currentSpeed >= currentAircraft.takeoffSpeed && pitch >= 0.07) {
      if (resetRegionsOnNextTakeoff) {
        visitedRegionsThisFlight.clear();
        resetRegionsOnNextTakeoff = false;
      }
      flightDistanceSinceTakeoff = 0;
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
    (0.42 + speedRatio * 0.5) * currentAircraft.yawRate / currentAircraft.inertia;
  // Arrow keys ramp into the existing persistent, unbounded roll attitude. Releasing
  // immediately stops rotation at the chosen bank without auto-leveling.
  if (rollInput === 0) rollControlStrength = 0;
  else rollControlStrength = moveToward(
    rollControlStrength,
    rollInput,
    delta * currentAircraft.rollInputResponse,
  );
  roll += rollControlStrength * delta * currentAircraft.rollRate;
  // The eased control command sets a bounded attitude target. Pitch only rotates the
  // aircraft; lift and gravity below remain the sole source of vertical movement.
  const targetPitch = pitchControlStrength >= 0
    ? currentAircraft.maxClimbPitch * pitchControlStrength
    : 0.38 * pitchControlStrength;
  const pitchResponse = Math.max(
    currentAircraft.pitchReturnRate * 0.55,
    currentAircraft.pitchRate * (0.35 + Math.abs(pitchControlStrength) * 0.75),
  );
  pitch = moveToward(pitch, targetPitch, delta * pitchResponse);
  const landingAssistAirport = getLandingAssistAirport(airplane.position);
  const approachHeight = airplane.position.y - groundPlaneY(airplane.position.x, airplane.position.z);
  const landingAssistActive = landingAssistAirport !== null && approachHeight <= 52 && velocity.y <= 2;
  if (landingAssistActive) {
    pitch = THREE.MathUtils.lerp(pitch, THREE.MathUtils.clamp(pitch, -0.12, 0.16), Math.min(1, delta * 1.1));
  }
  heading += yawInput * delta * steeringAuthority;
  heading += Math.sin(roll) * speedRatio * currentAircraft.bankTurn * delta;

  airplane.rotation.set(pitch, heading, roll, 'YXZ');
  forward.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  liftDirection.set(0, 1, 0).applyQuaternion(airplane.quaternion).normalize();

  const forwardSpeed = Math.max(0, velocity.dot(forward));
  const airspeed = velocity.length();
  const flightPathAngle = airspeed > 0.01 ? Math.asin(THREE.MathUtils.clamp(velocity.y / airspeed, -1, 1)) : 0;
  const angleOfAttack = THREE.MathUtils.clamp(pitch - flightPathAngle, -0.28, 0.32);
  const stallFactor = THREE.MathUtils.clamp(
    (forwardSpeed - currentAircraft.stallSpeed * 0.62) / (currentAircraft.stallSpeed * 0.38),
    0.08,
    1,
  );
  const liftFactor = THREE.MathUtils.clamp(
    0.74 + angleOfAttack * 1.75,
    0.2,
    1.28,
  ) * Math.min(1.28, (forwardSpeed / currentAircraft.takeoffSpeed) ** 2) * stallFactor * currentAircraft.lift * (1 + throttle * currentAircraft.climbLiftBoost * 0.08);
  const thrust = throttle * currentAircraft.acceleration / currentAircraft.inertia;
  const inducedDrag = Math.max(0, angleOfAttack) * currentAircraft.drag * 0.13;
  const drag = (currentAircraft.drag * (airspeed / currentAircraft.maxSpeed) ** 2 + inducedDrag) / currentAircraft.inertia;

  velocity.addScaledVector(forward, thrust * delta);
  velocity.addScaledVector(liftDirection, 9.81 * liftFactor * delta);
  velocity.y -= 9.81 * delta;
  if (landingAssistActive && approachHeight < 14 && velocity.y < 0) {
    const groundEffect = 1 - THREE.MathUtils.clamp(approachHeight / 14, 0, 1);
    velocity.y += groundEffect * 2.2 * delta;
    const softenedDescent = -currentAircraft.safeDescentRate * 0.9;
    if (velocity.y < softenedDescent) velocity.y = THREE.MathUtils.lerp(velocity.y, softenedDescent, Math.min(1, delta * 2.4));
  }
  if (forwardSpeed < currentAircraft.stallSpeed) {
    // A gentle aerodynamic nose drop keeps stalls recoverable with the existing
    // nose-down + throttle controls instead of allowing an implausible hover.
    pitch = Math.max(-0.38, pitch - delta * (1 - stallFactor) * 0.42);
  }
  if (airspeed > 0.01) velocity.addScaledVector(velocity, -Math.min(0.85, drag * delta / airspeed));

  // Gentle aerodynamic alignment preserves momentum while allowing banked turns to curve the flight path.
  sideSlip.copy(forward).multiplyScalar(velocity.dot(forward)).sub(velocity);
  sideSlip.y *= 0.25;
  velocity.addScaledVector(sideSlip, Math.min(1, delta * currentAircraft.alignmentRate * (0.42 + speedRatio * 0.58)));
  const maxAirSpeed = currentAircraft.maxSpeed * 1.22 + speedBonus;
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
    const bankAngle = Math.abs(THREE.MathUtils.euclideanModulo(roll + Math.PI, Math.PI * 2) - Math.PI);
    const safeLanding =
      landingAirport !== null &&
      currentSpeed <= currentAircraft.safeLandingSpeed * (landingAssistActive ? 1.18 : 1) &&
      verticalSpeed >= -currentAircraft.safeDescentRate * (landingAssistActive ? 1.4 : 1) &&
      Math.abs(pitch) <= currentAircraft.landingTilt + (landingAssistActive ? 0.12 : 0) &&
      bankAngle <= currentAircraft.landingTilt + (landingAssistActive ? 0.14 : 0) &&
      runwayHeadingError(landingAirport) <= (landingAssistActive ? 0.72 : 0.52);
    if (!safeLanding) {
      endRun('CRASHED');
      return;
    }

    const landingQuality: LandingQuality = {
      speed: currentSpeed,
      safeSpeed: currentAircraft.safeLandingSpeed,
      descentRate: verticalSpeed,
      safeDescentRate: currentAircraft.safeDescentRate,
      bankAngle,
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
    landedFeedbackTime = 1.5;
    setFlightState('LANDED');
    rewardLanding(landingAirport, landingQuality);
    handleContractLanding(landingAirport);
  }

}

function updateRunTimer(delta: number): void {
  remainingTime = Math.max(0, remainingTime - delta);
  updateTimerDisplay();
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
  const cameraSpeedOffset = THREE.MathUtils.clamp(currentSpeed / currentAircraft.maxSpeed, 0, 1) * 4;
  const cameraFollow = currentAircraft.cameraDamping;
  const targetChaseDistance = defaultChaseDistance * cameraDistanceMultiplier;
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
  chaseCameraPosition.copy(cameraOrbitOffset
    .set(
      0,
      defaultChaseHeight * (0.82 + cameraDistanceMultiplier * 0.18) + cameraSpeedOffset * 0.05,
      smoothedChaseDistance,
    )
    .applyQuaternion(airplane.quaternion))
    .add(airplane.position);
  chaseCameraPosition.y = Math.max(
    chaseCameraPosition.y,
    groundPlaneY(chaseCameraPosition.x, chaseCameraPosition.z) + 2.2,
  );
  chaseLookTarget
    .set(0, 0.7 + cameraSpeedOffset * 0.03, -cameraFocusAhead)
    .applyQuaternion(airplane.quaternion)
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

  const targetFov = CAMERA_CHASE_FOV + THREE.MathUtils.clamp((currentSpeed - 35) * 0.08, 0, 2.2);
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
    scene.fog.color.setRGB(0.57 + altitudeFactor * 0.13, 0.76 + altitudeFactor * 0.1, 0.84 + altitudeFactor * 0.09);
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
  if (crashed || !keys.has('Space') || fireCooldown > 0) return;
  fireWeaponOnce();
}

function fireWeaponOnce(): void {
  if (crashed || localLifeState !== 'alive' || fireCooldown > 0) return;
  sendFireIntent();
  fireCooldown = 0.25;
}

function animate(): void {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (!crashed && runStarted) {
    updateFlight(delta);
    if (!crashed && challengeModeEnabled) {
      checkCheckpoint();
      updateRunTimer(delta);
    }
  }
  updateRemotePlayers(delta);
  updateCombatTarget(delta);
  updateAircraftVisuals(delta);
  updateProjectiles(delta);
  updateFlashEffects(muzzleFlashes, muzzleFlashPool, delta);
  updateFlashEffects(impactFlashes, impactFlashPool, delta);
  updateDestructionEffects(delta);
  updateOsmCityChunks(airplane.position);
  cityWorld.updateWorldStreaming?.(airplane.position, velocity);
  ambientTraffic?.update(delta, airplane.position, camera);
  if (!crashed && runStarted) skyChallenges?.update(delta, airplane.position, roll, altitudeAboveTerrain(), verticalSpeed);
  if (!crashed && runStarted) {
    stuntCombo?.update({
      delta,
      airborne: !onGround,
      position: airplane.position,
      altitude: altitudeAboveTerrain(),
      speed: currentSpeed,
      maxSpeed: currentAircraft.maxSpeed,
      stallSpeed: currentAircraft.stallSpeed,
      verticalSpeed,
      roll,
      aircraftType,
    });
    discoverySystem?.update(delta, airplane.position, altitudeAboveTerrain());
  }
  updateWeapons(delta);
  if (!crashed && runStarted) updatePlayerInteractions();
  if (challengeModeEnabled) updateCheckpointFeedback(delta);
  updateEventVisual();
  updateCamera(delta);
  adPlacementManager.update(camera, delta, airplane);
  networkTimer += delta;
  if (networkTimer >= 0.1) {
    networkTimer %= 0.1;
    sendLocalState();
  }
  navigationTimer += delta;
  if (navigationTimer >= 0.1) {
    navigationTimer %= 0.1;
    updateFlightHud();
    updateProgressHud();
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
  const report = (): void => {
    const stream = cityWorld.getWorldStreamingStats?.();
    const ambient = ambientTraffic?.getStats() ?? { actors: 0, clouds: 0, storms: 0 };
    const challenges = skyChallenges?.getStats() ?? { gates: 0, active: false };
    const ads = adPlacementManager.getStats();
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    const snapshot = {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      chunks: stream?.loaded ?? { near: 0, mid: 0, far: 0 },
      geometryCacheMiB: stream ? `${(stream.loadedBytes / 1048576).toFixed(1)}/${(stream.cacheLimitBytes / 1048576).toFixed(0)}` : 'n/a',
      queued: stream?.queued ?? 0,
      pending: stream?.pending ?? 0,
      loaded: stream?.loadedChunks ?? 0,
      evicted: stream?.evictedChunks ?? 0,
      discarded: stream?.discardedLoads ?? 0,
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
      'STABILITY QA · DEV ONLY',
      `GPU geo ${snapshot.geometries} · tex ${snapshot.textures} · calls ${snapshot.calls} · tris ${snapshot.triangles}`,
      `Dallas N/M/F ${snapshot.chunks.near}/${snapshot.chunks.mid}/${snapshot.chunks.far} · geometry cache ${snapshot.geometryCacheMiB} MiB`,
      `queue ${snapshot.queued} · pending ${snapshot.pending} · loaded ${snapshot.loaded} · evicted ${snapshot.evicted} · stale ${snapshot.discarded}`,
      `projectiles ${snapshot.projectiles} · flashes ${snapshot.flashes} · debris ${snapshot.debris} · remotes ${snapshot.remoteMeshes}`,
      `clouds ${snapshot.ambient.clouds} · ambient ${snapshot.ambient.actors} · gates ${snapshot.challengeGates}${snapshot.challengeActive ? ' active' : ''} · event ${snapshot.eventObjects}`,
      `ads ${snapshot.ads.meshes} meshes/${snapshot.ads.materials} materials · heap ${snapshot.heapMiB} MiB · context ${snapshot.contextEvents}`,
    ].join('\n');
    console.debug('[stabilityqa]', snapshot);
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

const connectionElement = document.querySelector<HTMLDivElement>('#connection')!;
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
  connectionElement.textContent = message;
  connectionElement.className = 'offline';
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
const pendingProfileRewards = new Map<string, number>();
let profileProgressTimer: number | undefined;
let profileSyncUnavailableNotified = false;

function pendingProfileCredits(): number {
  let total = 0;
  for (const amount of pendingProfileRewards.values()) total += amount;
  return total;
}

function flushProfileRewards(): void {
  if (!localPlayerId || !connectionReady()) return;
  for (const [rewardId, amount] of pendingProfileRewards) {
    socket.send(JSON.stringify({ type: 'profileReward', rewardId, credits: amount }));
  }
}

function queueProfileReward(amount: number): void {
  if (flightTestMode || amount <= 0 || !Number.isFinite(amount)) return;
  const rewardId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `reward-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  pendingProfileRewards.set(rewardId, Math.min(500, Math.floor(amount)));
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

function applyServerProfile(profile: unknown, rewardId?: string): boolean {
  if (!isNetworkProfile(profile)) return false;
  serverProfile = profile;
  profileHydrated = true;
  if (rewardId) pendingProfileRewards.delete(rewardId);
  profileSyncUnavailableNotified = false;
  persistedPlayer.pilotId = profile.pilotId;
  persistedPlayer.selectedAircraft = profile.selectedAircraft;
  credits = profile.credits + pendingProfileCredits();
  totalDistance = profile.totalDistance;
  totalSuccessfulLandings = profile.successfulLandings;
  displayName = profile.pilotName;
  playerNameElement.textContent = displayName;
  for (const city of ['milwaukee', 'dallas'] as const) discoveredLocationsByCity[city] = [...(profile.discoveries[city] ?? [])];
  discoveredLocationIds.clear();
  for (const id of discoveredLocationsByCity[cityId] ?? []) discoveredLocationIds.add(id);
  discoverySystem?.hydrate(discoveredLocationIds);
  aircraftSelectElement.value = profile.selectedAircraft;
  if (!flightTestMode && profile.selectedAircraft !== aircraftType) applyServerSelectedAircraft(profile.selectedAircraft);
  updateAircraftOptions();
  updateProgressHud();
  savePlayerProgress();
  return true;
}

citiesButtonElement.addEventListener('click', () => {
  skyChallenges?.dispose();
  ambientTraffic?.dispose();
  adPlacementManager.dispose(scene);
  cityWorld.disposeWorldStreaming?.();
  socket.close();
  const url = new URL(window.location.href);
  url.searchParams.delete(CITY_QUERY_PARAM);
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
});

function sendLocalState(): void {
  if (!localPlayerId || !connectionReady()) return;
  socket.send(
    JSON.stringify({
      type: 'state',
      position: { x: airplane.position.x, y: airplane.position.y, z: airplane.position.z },
      rotation: { x: airplane.rotation.x, y: airplane.rotation.y, z: airplane.rotation.z },
      aircraftType,
      cityId,
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

function sendFireIntent(): void {
  if (!localPlayerId || localLifeState !== 'alive' || !connectionReady()) return;
  updateCombatTarget(0);
  getCurrentMuzzleTransform(projectileOrigin, projectileDirection);
  const targetId = selectedCombatTarget?.locked ? selectedCombatTarget.remote.playerId : undefined;
  const clientShotId = createClientShotId();
  if (combatQaElement) combatQaDetail = `shot: ${targetId ? `assisted → ${targetId.slice(0, 8)}` : 'ballistic'}`;
  spawnMuzzleFeedback(projectileOrigin, projectileDirection, clientShotId, targetId);
  socket.send(JSON.stringify({
    type: 'fire', targetId, clientShotId,
    transform: {
      position: { x: airplane.position.x, y: airplane.position.y, z: airplane.position.z },
      rotation: { x: airplane.rotation.x, y: airplane.rotation.y, z: airplane.rotation.z },
      aircraftType,
    },
  }));
  playFireSound();
}

function sendRespawn(): void {
  if (!localPlayerId || !connectionReady()) return;
  socket.send(JSON.stringify({ type: 'respawn' }));
}

socket.addEventListener('open', () => {
  connectionElement.textContent = 'Server: verifying version';
  connectionElement.className = 'online';
});

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
    if (!isNetworkProfile(message.profile)) {
      blockProtocolConnection('Server profile is incompatible — restart server and reload');
      return;
    }
    protocolReady = true;
    localPlayerId = message.playerId;
    health = message.health;
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
    connectionElement.textContent = `Server: connected · ${message.playerId}`;
    serverProfile = message.profile;
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
    applySocialState(message.social);
    for (const player of message.players) updateRemotePlayer(player);
    for (const heat of message.heatStates ?? []) applyHeatState(heat);
    applyTerritoryState(message.territories ?? []);
    applyCityEvent(message.event);
    flushProfileRewards();
    sendLocalState();
    sendPlayerUpdate();
  } else if (!protocolReady || !profileHydrated) {
    // A profile/state message from an earlier connection generation must not
    // hydrate partial client state before a versioned welcome arrives.
    return;
  } else if (message.type === 'state') {
    updateRemotePlayer(message);
  } else if (message.type === 'remove') {
    const remote = remotePlayers.get(message.playerId);
    if (remote) {
      remote.plane.remove(remote.targetBrackets);
      disposeTargetBrackets(remote.targetBrackets);
      scene.remove(remote.plane);
      disposeAirplaneMaterials(remote.plane);
      scene.remove(remote.identityTag);
      disposePlayerIdentityTag(remote.identityTag);
      scene.remove(remote.playerProxy);
      disposeRemotePlayerProxy(remote.playerProxy);
    }
    remotePlayers.delete(message.playerId);
  } else if (message.type === 'leaderboard') {
    updateLeaderboard(message.players);
  } else if (message.type === 'eventState') {
    applyCityEvent(message.event);
  } else if (message.type === 'eventClear') {
    applyCityEvent(undefined);
  } else if (message.type === 'eventAnnouncement') {
    showProgressMessage(`${message.name ?? 'SKY EVENT'} · +${message.reward ?? 0} CREDITS`);
  } else if (message.type === 'eventReward') {
    score += message.score;
    recordBestScore(score);
    updateScoreDisplay();
    showProgressMessage(`${message.reason} +${message.credits} CREDITS`);
    sendPlayerUpdate();
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
    recordBestScore(score);
    updateScoreDisplay();
    showProgressMessage(`${message.reason} +${message.credits} CREDITS`);
    sendPlayerUpdate();
  } else if (message.type === 'chaosState') {
    score += message.score;
    recordBestScore(score);
    updateScoreDisplay();
    showProgressMessage(`${message.action.toUpperCase()} · CHAOS x${message.multiplier}`);
  } else if (message.type === 'chaosReward') {
    showProgressMessage(`${message.reason} +${message.credits} CREDITS`);
  } else if (message.type === 'profile') {
    if (!applyServerProfile(message.profile, message.rewardId)) {
      blockProtocolConnection('Server profile is incompatible — restart server and reload');
    }
  } else if (message.type === 'projectileSpawn') {
    addProjectile(message);
  } else if (message.type === 'projectileStates') {
    updateClientProjectiles(message);
  } else if (message.type === 'assistedShot') {
    addAssistedShot(message);
    if (combatQaElement && message.ownerId === localPlayerId) combatQaDetail = `shot: assisted → ${message.targetId.slice(0, 8)} · HIT`;
  } else if (message.type === 'lockState') {
    serverLockedTargetId = message.targetId && message.targetId === lockedTargetId ? message.targetId : null;
    if (!message.targetId && requestedLockTargetId === lockedTargetId) lockedTargetId = null;
  } else if (message.type === 'heatState') {
    applyHeatState(message);
  } else if (message.type === 'territoryState') {
    if (message.cityId === cityId) applyTerritoryState(message.territories);
  } else if (message.type === 'territoryNotice') {
    const territory = territoryDefinition(message.territoryId);
    if (territory) showProgressMessage(message.kind === 'captured'
      ? `${territory.displayName.toUpperCase()} CAPTURED +250`
      : `ENTERING ${territory.displayName.toUpperCase()}`);
  } else if (message.type === 'territoryReward') {
    const territory = territoryDefinition(message.territoryId);
    showProgressMessage(`${territory?.displayName.toUpperCase() ?? 'TERRITORY'} ${message.kind === 'capture' ? 'CAPTURED' : 'HELD'} +${message.credits} CREDITS`);
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
      health = message.health;
      updateHealthDisplay(true);
      showCombatMessage(`-${message.damage} DAMAGE`);
      showDamageFeedback();
      playTone(150, 0.13, 'sawtooth', 0.05, 80);
    }
  } else if (message.type === 'destroyed') {
    const destroyedPlane = message.playerId === localPlayerId
      ? airplane
      : remotePlayers.get(message.playerId)?.plane;
    if (destroyedPlane) createDestructionEffect(destroyedPlane.position);
    if (message.playerId === localPlayerId) {
      localLifeState = 'destroyed';
      health = 0;
      updateHealthDisplay(true);
      endRun('DESTROYED', `DESTROYED BY ${message.killerDisplayName}`);
    } else {
      const remote = remotePlayers.get(message.playerId);
      if (remote) {
        remote.lifeState = 'destroyed';
        remote.nearMissActive = false;
        remote.plane.visible = false;
        remote.identityTag.visible = false;
        remote.targetBrackets.visible = false;
        remote.playerProxy.visible = false;
      }
    }
    if (message.killerId === localPlayerId) {
      score = Math.max(score, message.killerScore);
      recordBestScore(score);
      handleContractKill();
      updateScoreDisplay();
      showCombatMessage(message.killerReward ? `DESTROYED +${message.killerReward}` : 'DESTROYED · NO HEAT REWARD', true);
      playDestructionSound();
    }
  } else if (message.type === 'respawn') {
    const lifeState = networkLifeState(message.lifeState);
    if (message.playerId === localPlayerId) {
      localLifeState = lifeState;
      health = message.health;
      updateHealthDisplay();
    } else {
      const remote = remotePlayers.get(message.playerId);
      if (remote) {
        remote.lifeState = lifeState;
        remote.nearMissActive = false;
        remote.plane.visible = lifeState === 'alive';
        remote.identityTag.visible = lifeState === 'alive';
        remote.targetBrackets.visible = false;
        remote.playerProxy.visible = lifeState === 'alive';
      }
    }
  } else if (message.type === 'playerState') {
    if (message.playerId === localPlayerId) {
      localLifeState = networkLifeState(message.lifeState);
      health = message.health;
      updateHealthDisplay();
    } else {
      // Completion carries a full authoritative transform so an absent or
      // hidden remote is recreated before it becomes targetable server-side.
      updateRemotePlayer(message);
    }
  }
});

socket.addEventListener('close', () => {
  if (protocolBlocked) return;
  protocolReady = false;
  profileHydrated = false;
  connectionElement.textContent = 'Server: disconnected';
  connectionElement.className = 'offline';
});

socket.addEventListener('error', () => {
  if (protocolBlocked) return;
  connectionElement.textContent = 'Server: connection error';
  connectionElement.className = 'offline';
});

updateCamera(1);
showActiveCheckpoint();
updateScoreDisplay();
updateTimerDisplay();
updateProgressHud();
updateHealthDisplay();
updateAircraftOptions();
aircraftSelectElement.value = aircraftType;
updateNavigationHud();
generateContract();
savePlayerProgress(true);
animate();
