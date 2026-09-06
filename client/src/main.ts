import * as THREE from 'three';
import './style.css';
import { attachAircraftAsset, preloadAircraftAssets } from './assets';
import { CITY_QUERY_PARAM, activeCityFromUrl, type CityId } from './cities';
import { updateOsmCityChunks } from './osm-city';
import { WorldMap, type WorldMapLayer } from './world-map';
import type {
  AirportDefinition,
  AirportId,
  RegionName,
} from './world';

const flightTestMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('flighttest') === '1';
const activeCity = activeCityFromUrl();
if (!activeCity || activeCity.status !== 'available') throw new Error('A playable city is required before starting the game.');
const cityId = activeCity.id;
const cityWorld = await activeCity.loadWorld!();
const { airports, centralAirport, createWorld, getTerrainHeight, regionBounds, WORLD_METERS_PER_UNIT, WORLD_SIZE } = cityWorld;
const visualQaMode = import.meta.env.DEV && cityId === 'dallas' && new URLSearchParams(window.location.search).get('visualqa') === '1' && Boolean(cityWorld.visualQaPresets?.length);
const PLANE_GROUND_Y = 1.2;
const METERS_TO_FEET = 3.28084 * WORLD_METERS_PER_UNIT;
const METERS_PER_SECOND_TO_KNOTS = 1.94384 * WORLD_METERS_PER_UNIT;
const MIN_REWARDED_FLIGHT_DISTANCE = 40;
const SKY_COLOR = 0x78bfe3;
const CAMERA_NEAR = 2;
const CAMERA_BASE_FAR = WORLD_SIZE > 20_000 ? 30_000 : 22_000;
const CAMERA_HIGH_FAR = WORLD_SIZE > 20_000 ? 44_000 : 32_000;
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
  65,
  window.innerWidth / window.innerHeight,
  CAMERA_NEAR,
  CAMERA_BASE_FAR,
);
const renderer = new THREE.WebGLRenderer({ antialias: true, reversedDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(SKY_COLOR, 1);
document.body.appendChild(renderer.domElement);
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

scene.add(new THREE.HemisphereLight(0xe6f7ff, 0x596a3f, 2.35));
const sun = new THREE.DirectionalLight(0xfff0d2, 3.1);
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
      horizonColor: { value: new THREE.Color(0xb7d7e5) },
      zenithColor: { value: new THREE.Color(0x4d9ed0) },
    },
    vertexShader: 'varying float vHeight; void main() { vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 horizonColor; uniform vec3 zenithColor; varying float vHeight; void main() { float t = smoothstep(-0.18, 0.82, vHeight); gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0); }',
  }),
);
skyDome.renderOrder = -10;
scene.add(skyDome);

const depthOffsetDirection = renderer.capabilities.reversedDepthBuffer ? 1 : -1;
const { obstacleBounds, mountainBounds, waterBounds } = createWorld(scene, depthOffsetDirection);
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

type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';

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

type AircraftDefinition = {
  name: string;
  creditsRequired: number;
  maxSpeed: number;
  groundMaxSpeed: number;
  acceleration: number;
  drag: number;
  groundAcceleration: number;
  groundDrag: number;
  idleThrottle: number;
  throttleResponse: number;
  throttleDecay: number;
  lift: number;
  stallSpeed: number;
  pitchRate: number;
  maxClimbPitch: number;
  pitchReturnRate: number;
  climbLiftBoost: number;
  rollRate: number;
  yawRate: number;
  groundSteering: number;
  stability: number;
  inertia: number;
  bankTurn: number;
  alignmentRate: number;
  cameraDamping: number;
  takeoffSpeed: number;
  safeLandingSpeed: number;
  safeDescentRate: number;
  landingTilt: number;
  bodyColor: number;
  accentColor: number;
  bodyLength: number;
  bodyRadius: number;
  noseLength: number;
  wingSpan: number;
  wingDepth: number;
  tailSpan: number;
  enginePods: number;
};

const aircraftDefinitions: Record<AircraftType, AircraftDefinition> = {
  trainer: {
    name: 'TRAINER',
    creditsRequired: 0,
    maxSpeed: 52,
    groundMaxSpeed: 40,
    acceleration: 7.2,
    drag: 5.8,
    groundAcceleration: 13.5,
    groundDrag: 12,
    idleThrottle: 0.02,
    throttleResponse: 0.42,
    throttleDecay: 0.1,
    lift: 1.2,
    stallSpeed: 16.5,
    pitchRate: 0.92,
    maxClimbPitch: 0.27,
    pitchReturnRate: 1.5,
    climbLiftBoost: 1.1,
    rollRate: 6.1,
    yawRate: 1.24,
    groundSteering: 1.3,
    stability: 0.48,
    inertia: 0.76,
    bankTurn: 0.9,
    alignmentRate: 1.25,
    cameraDamping: 4.7,
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
    maxSpeed: 90,
    groundMaxSpeed: 66,
    acceleration: 10.5,
    drag: 2.5,
    groundAcceleration: 9.5,
    groundDrag: 6.2,
    idleThrottle: 0.025,
    throttleResponse: 0.38,
    throttleDecay: 0.075,
    lift: 1.02,
    stallSpeed: 27,
    pitchRate: 0.62,
    maxClimbPitch: 0.22,
    pitchReturnRate: 1.2,
    climbLiftBoost: 1.03,
    rollRate: 3.9,
    yawRate: 0.78,
    groundSteering: 0.86,
    stability: 0.54,
    inertia: 1.65,
    bankTurn: 0.68,
    alignmentRate: 0.68,
    cameraDamping: 3.7,
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
    maxSpeed: 64,
    groundMaxSpeed: 54,
    acceleration: 3.5,
    drag: 1.9,
    groundAcceleration: 6.2,
    groundDrag: 3.6,
    idleThrottle: 0.04,
    throttleResponse: 0.24,
    throttleDecay: 0.055,
    lift: 1.1,
    stallSpeed: 31,
    pitchRate: 0.42,
    maxClimbPitch: 0.18,
    pitchReturnRate: 1.05,
    climbLiftBoost: 1.05,
    rollRate: 2.65,
    yawRate: 0.62,
    groundSteering: 0.72,
    stability: 0.64,
    inertia: 2.5,
    bankTurn: 0.42,
    alignmentRate: 0.34,
    cameraDamping: 2.9,
    takeoffSpeed: 46,
    safeLandingSpeed: 66,
    safeDescentRate: 7,
    landingTilt: 0.44,
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
    maxSpeed: 140,
    groundMaxSpeed: 82,
    acceleration: 23,
    drag: 6.3,
    groundAcceleration: 25,
    groundDrag: 8.5,
    idleThrottle: 0.01,
    throttleResponse: 0.72,
    throttleDecay: 0.16,
    lift: 1.35,
    stallSpeed: 36,
    pitchRate: 1.3,
    maxClimbPitch: 0.32,
    pitchReturnRate: 1.6,
    climbLiftBoost: 1,
    rollRate: 9.2,
    yawRate: 1.5,
    groundSteering: 1.04,
    stability: 0.22,
    inertia: 0.56,
    bankTurn: 1.55,
    alignmentRate: 1.55,
    cameraDamping: 5.8,
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
const aircraftExhaustGeometry = new THREE.ConeGeometry(1, 1, 10);
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
  credits: number;
  selectedAircraft: AircraftType;
  displayName: string;
  muted: boolean;
  bestScore: number;
};

function loadPlayerProgress(): PersistedPlayer {
  const fallbackCredits = 0;
  const fallbackName = `Pilot-${Math.floor(100 + Math.random() * 900)}`;
  const fallback: PersistedPlayer = {
    version: 1,
    credits: fallbackCredits,
    selectedAircraft: 'trainer',
    displayName: fallbackName,
    muted: false,
    bestScore: 0,
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
    return {
      version: 1,
      credits: storedCredits,
      selectedAircraft: storedAircraft,
      displayName: typeof value.displayName === 'string' && value.displayName.trim().length > 0 && value.displayName.length <= 32
        ? value.displayName
        : fallbackName,
      muted: typeof value.muted === 'boolean' ? value.muted : false,
      bestScore: typeof value.bestScore === 'number' && Number.isFinite(value.bestScore) && value.bestScore >= 0
        ? Math.floor(value.bestScore)
        : 0,
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
        opacity: remote ? 0.26 : 0.18,
        depthWrite: false,
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
    exhaust.scale.set(radius * 0.78, 0.9, radius * 0.78);
    exhaust.position.set(x, y, z + length / 2 + 0.45);
    exhaust.userData.baseLength = 0.9;
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
    plane.add(propeller);
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
  plane.userData.visuals = visuals;
  attachAircraftAsset(plane, fallback, type, definition.bodyLength + definition.noseLength, definition.wingSpan);

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

let aircraftType: AircraftType = persistedPlayer.selectedAircraft;
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
let distanceCreditProgress = 0;
let flightDistanceSinceTakeoff = 0;
let successfulLandings = 0;
let regionsDiscovered = 0;
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
const displayName = persistedPlayer.displayName;

const scoreElement = document.querySelector<HTMLSpanElement>('#score')!;
const bestScoreElement = document.querySelector<HTMLSpanElement>('#best-score')!;
const multiplierElement = document.querySelector<HTMLSpanElement>('#multiplier')!;
const finalScoreElement = document.querySelector<HTMLSpanElement>('#final-score')!;
const crashOverlay = document.querySelector<HTMLDivElement>('#crash-overlay')!;
const endTitleElement = document.querySelector<HTMLDivElement>('#end-title')!;
const timerElement = document.querySelector<HTMLSpanElement>('#timer')!;
const nearMissMessageElement = document.querySelector<HTMLDivElement>('#near-miss-message')!;
const checkpointMessageElement = document.querySelector<HTMLDivElement>('#checkpoint-message')!;
const playerNameElement = document.querySelector<HTMLSpanElement>('#player-name')!;
const audioToggleElement = document.querySelector<HTMLButtonElement>('#audio-toggle')!;
const citiesButtonElement = document.querySelector<HTMLButtonElement>('#cities-button')!;
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
const nearestAirportElement = document.querySelector<HTMLSpanElement>('#nearest-airport')!;
const airportDistanceElement = document.querySelector<HTMLSpanElement>('#airport-distance')!;
const waypointNavigationElement = document.querySelector<HTMLDivElement>('#waypoint-navigation')!;
const waypointBearingElement = document.querySelector<HTMLSpanElement>('#waypoint-bearing')!;
const waypointDistanceElement = document.querySelector<HTMLSpanElement>('#waypoint-distance')!;
const headingElement = document.querySelector<HTMLSpanElement>('#heading')!;
const worldStatusElement = document.querySelector<HTMLDivElement>('#world-status')!;
const radarCanvas = document.querySelector<HTMLCanvasElement>('#radar')!;
const radarContext = radarCanvas.getContext('2d')!;
const worldMapOverlayElement = document.querySelector<HTMLElement>('#world-map-overlay')!;
const worldMapCanvas = document.querySelector<HTMLCanvasElement>('#world-map-canvas')!;
const worldMapRecenterElement = document.querySelector<HTMLButtonElement>('#world-map-recenter')!;
const progressMessageElement = document.querySelector<HTMLDivElement>('#progress-message')!;
const combatMessageElement = document.querySelector<HTMLDivElement>('#combat-message')!;
const hitMarkerElement = document.querySelector<HTMLDivElement>('#hit-marker')!;
const damageFlashElement = document.querySelector<HTMLDivElement>('#damage-flash')!;
const healthElement = document.querySelector<HTMLSpanElement>('#health')!;
const healthRowElement = document.querySelector<HTMLDivElement>('.health-row')!;
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
    credits,
    selectedAircraft: aircraftType,
    displayName,
    muted: audioMuted,
    bestScore,
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
  kind: 'airport' | 'player' | 'waypoint',
  label = '',
): void {
  const center = radarCanvas.width / 2;
  const radarRadius = center - 13;
  const offsetX = targetX - airplane.position.x;
  const offsetZ = targetZ - airplane.position.z;
  const distance = Math.hypot(offsetX, offsetZ);
  if (kind === 'player' && distance > radarRange) return;

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
    drawRadarMarker(direction, remote.plane.position.x, remote.plane.position.z, 'player');
  }
  if (waypoint) drawRadarMarker(direction, waypoint.x, waypoint.z, 'waypoint');

  radarContext.fillStyle = '#f8fbff';
  radarContext.beginPath();
  radarContext.moveTo(center, center - 6);
  radarContext.lineTo(center - 5, center + 5);
  radarContext.lineTo(center + 5, center + 5);
  radarContext.closePath();
  radarContext.fill();
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
  const outsideCity =
    Math.abs(airplane.position.x) > WORLD_SIZE / 2 || Math.abs(airplane.position.z) > WORLD_SIZE / 2;
  worldStatusElement.classList.toggle('hidden', !outsideCity);
}

function updateProgressHud(): void {
  creditsElement.textContent = credits.toString();
  distanceFlownElement.textContent = Math.floor(distanceFlown).toString();
  successfulLandingsElement.textContent = successfulLandings.toString();
  regionsDiscoveredElement.textContent = regionsDiscovered.toString();
}

function showProgressMessage(message: string): void {
  progressMessageElement.textContent = message;
  progressMessageElement.classList.remove('hidden');
  window.clearTimeout(progressMessageTimer);
  progressMessageTimer = window.setTimeout(() => progressMessageElement.classList.add('hidden'), 1400);
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
  const destination = airportById(contract.destinationAirportId).name;
  let objective = '';
  if (contract.type === 'sightseeing') {
    const visited = contract.regionNames.filter((region) => activeContract?.visitedRegions.has(region)).length;
    objective = visited < contract.regionNames.length
      ? `Visit regions ${visited}/${contract.regionNames.length}`
      : `Land at ${destination}`;
  } else if (contract.type === 'intercept') {
    objective = activeContract.killCompleted ? `Land at ${destination}` : 'Destroy another player';
  } else if (!activeContract.departed) {
    objective = `Depart ${airportById(contract.originAirportId).name}`;
  } else {
    objective = `Land at ${destination}`;
  }
  activeContractElement.textContent = `${contractTitle(contract.type)} · ${aircraftDefinitions[contract.aircraftType].name} · ${objective} · +${contract.reward}`;
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

function updateAircraftOptions(): void {
  for (const option of aircraftSelectElement.options) {
    if (!isAircraftType(option.value)) continue;
    const definition = aircraftDefinitions[option.value];
    option.textContent = flightTestMode && definition.creditsRequired > 0
      ? `${definition.name} — Flight test`
      :
      definition.creditsRequired === 0
        ? `${definition.name} — Free`
        : `${definition.name} — ${credits >= definition.creditsRequired ? 'Unlocked' : `${definition.creditsRequired.toLocaleString()} credits`}`;
  }
}

function addCredits(amount: number): boolean {
  if (flightTestMode) return false;
  const previousCredits = credits;
  credits += amount;
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
  flightDistanceSinceTakeoff += traveled;
  distanceCreditProgress += traveled;
  const earnedCredits = Math.floor(distanceCreditProgress);
  if (earnedCredits > 0) {
    distanceCreditProgress -= earnedCredits;
    addCredits(earnedCredits);
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

function rewardLanding(airport: AirportDefinition): void {
  setRestartAirport(airport);
  if (visualQaMode) return;
  if (flightDistanceSinceTakeoff < MIN_REWARDED_FLIGHT_DISTANCE) return;
  successfulLandings += 1;
  resetRegionsOnNextTakeoff = true;
  const destinationBonus = !landedAirportIds.has(airport.id);
  landedAirportIds.add(airport.id);
  const reward = 100 + (destinationBonus ? 100 : 0);
  const unlocked = addCredits(reward);
  if (!unlocked) {
    showProgressMessage(destinationBonus ? `+200 ${airport.name.toUpperCase()}` : `+100 ${airport.name.toUpperCase()}`);
  }
}

function endRun(message: EndReason, title: string = message): void {
  if (crashed) return;
  crashed = true;
  resetRegionsOnNextTakeoff = true;
  failActiveContract();
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
  crashed = false;
  health = 100;
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

function selectAircraft(nextType: AircraftType): void {
  if (nextType === aircraftType) return;
  const requiredCredits = aircraftDefinitions[nextType].creditsRequired;
  if (!flightTestMode && credits < requiredCredits) {
    aircraftSelectElement.value = aircraftType;
    showProgressMessage(`Need ${requiredCredits - credits} more credits`);
    return;
  }
  scene.remove(airplane);
  disposeAirplaneMaterials(airplane);
  aircraftType = nextType;
  currentAircraft = aircraftDefinitions[aircraftType];
  airplane = createAirplane(aircraftType);
  scene.add(airplane);
  savePlayerProgress();
  restartGame();
}

aircraftSelectElement.addEventListener('change', () => {
  if (isAircraftType(aircraftSelectElement.value)) selectAircraft(aircraftSelectElement.value);
});

const keys = new Set<string>();
let runStarted = false;
const flightControlCodes = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);
const howToPlayElement = document.querySelector<HTMLDivElement>('#how-to-play')!;
window.addEventListener('keydown', (event) => {
  if (flightControlCodes.has(event.code)) {
    event.preventDefault();
    runStarted = true;
    howToPlayElement.classList.add('hidden');
  }
  if (!event.repeat && (event.code === 'KeyQ' || event.code === 'ArrowLeft')) {
    heading += currentAircraft.yawRate * 0.055;
  }
  if (!event.repeat && (event.code === 'KeyE' || event.code === 'ArrowRight')) {
    heading -= currentAircraft.yawRate * 0.055;
  }
  if (!event.repeat && event.code === 'Space' && !crashed) {
    sendFireIntent();
    fireCooldown = 0.25;
  }
  if (event.code === 'KeyR' && crashed) {
    restartGame();
    return;
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  if (flightControlCodes.has(event.code)) event.preventDefault();
  keys.delete(event.code);
});

let throttle = 0;
let heading = 0;
let pitch = 0;
let roll = 0;
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const velocity = new THREE.Vector3();
const liftDirection = new THREE.Vector3();
const sideSlip = new THREE.Vector3();
const targetCameraPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
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
};

type NetworkPlayer = NetworkTransform & { playerId: string };

type LeaderboardPlayer = {
  playerId: string;
  displayName: string;
  score: number;
};

type NetworkVector = { x: number; y: number; z: number };

type ServerMessage =
  | {
      type: 'welcome';
      playerId: string;
      cityId: CityId;
      spawnPosition: { x: number; y: number; z: number };
      health: number;
      players: NetworkPlayer[];
    }
  | ({ type: 'state' } & NetworkPlayer)
  | { type: 'remove'; playerId: string }
  | { type: 'leaderboard'; players: LeaderboardPlayer[] }
  | {
      type: 'projectileSpawn';
      projectileId: string;
      ownerId: string;
      position: NetworkVector;
      direction: NetworkVector;
    }
  | { type: 'projectileRemove'; projectileId: string }
  | { type: 'damage'; playerId: string; shooterId: string; health: number; damage: number }
  | {
      type: 'destroyed';
      playerId: string;
      killerId: string;
      killerDisplayName: string;
      killerScore: number;
    }
  | { type: 'respawn'; playerId: string; health: number };

type RemotePlayer = {
  plane: THREE.Group;
  previousPosition: THREE.Vector3;
  previousQuaternion: THREE.Quaternion;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
  interpolationElapsed: number;
  interpolationDuration: number;
  timeSinceUpdate: number;
  nearMissActive: boolean;
  aircraftType: AircraftType;
};

type ClientProjectile = {
  mesh: THREE.Group;
  direction: THREE.Vector3;
  remainingDistance: number;
};

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
);

function contractMapTarget(): Waypoint | null {
  if (!activeContract) return null;
  const airport = airportById(activeContract.definition.destinationAirportId);
  return { x: airport.x, z: airport.z, label: airport.name };
}

function updateWorldMap(direction: THREE.Vector3): void {
  const mapPlayers = [...remotePlayers.entries()].map(([id, remote]) => ({
    id,
    x: remote.plane.position.x,
    z: remote.plane.position.z,
  }));
  worldMap.update({
    position: airplane.position,
    forward: { x: direction.x, z: direction.z },
    players: mapPlayers,
    waypoint,
    contractTarget: contractMapTarget(),
  });
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') {
    event.preventDefault();
    worldMap.toggle();
  } else if (event.code === 'Escape' && worldMap.isOpen()) {
    event.preventDefault();
    worldMap.setOpen(false);
  }
});
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
const predictedProjectiles: ClientProjectile[] = [];
const maxClientProjectiles = 256;
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
const projectileSpeed = 420;
const projectileRange = 1000;
const predictedTracerDistance = 96;
const remoteEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const projectileDirection = new THREE.Vector3();
const projectileOrigin = new THREE.Vector3();
let localPlayerId: string | null = null;
let networkTimer = 0;
let navigationTimer = 0;
let fireCooldown = 0;
let wasFirstPlace = false;
let leaderMessageTimer: number | undefined;
const leaderboardElement = document.querySelector<HTMLOListElement>('#leaderboard-list')!;
const leaderMessageElement = document.querySelector<HTMLDivElement>('#leader-message')!;
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
  cityWorld.updateWorldStreaming?.(airplane.position);
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
  return { mesh, direction: new THREE.Vector3(), remainingDistance: projectileRange };
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

function spawnMuzzleFeedback(): void {
  projectileDirection.set(0, 0, -1).applyQuaternion(airplane.quaternion).normalize();
  projectileOrigin.copy(airplane.position).addScaledVector(projectileDirection, 3.7);
  spawnFlash(muzzleFlashes, muzzleFlashPool, projectileOrigin, 0.11, 0.45);
  cameraShakeTime = Math.max(cameraShakeTime, 0.08);

  const predicted = projectilePool.pop() ?? createProjectileVisual();
  predicted.direction.copy(projectileDirection);
  predicted.remainingDistance = predictedTracerDistance;
  predicted.mesh.position.copy(projectileOrigin);
  predicted.mesh.quaternion.setFromUnitVectors(projectileForward, predicted.direction);
  predicted.mesh.visible = true;
  scene.add(predicted.mesh);
  if (predictedProjectiles.length >= 8) {
    const oldest = predictedProjectiles.shift();
    if (oldest) releaseProjectile(oldest);
  }
  predictedProjectiles.push(predicted);
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
  if (message.ownerId === localPlayerId) {
    const predicted = predictedProjectiles.shift();
    if (predicted) releaseProjectile(predicted);
  }
  const projectile = projectilePool.pop() ?? createProjectileVisual();
  projectile.direction.set(message.direction.x, message.direction.y, message.direction.z).normalize();
  projectile.remainingDistance = projectileRange;
  projectile.mesh.position.set(message.position.x, message.position.y, message.position.z);
  projectile.mesh.quaternion.setFromUnitVectors(projectileForward, projectile.direction);
  projectile.mesh.visible = true;
  scene.add(projectile.mesh);
  clientProjectiles.set(message.projectileId, projectile);
}

function removeClientProjectile(projectileId: string): void {
  const projectile = clientProjectiles.get(projectileId);
  if (!projectile) return;
  releaseProjectile(projectile);
  clientProjectiles.delete(projectileId);
}

function updateProjectiles(delta: number): void {
  const distance = projectileSpeed * delta;
  for (const [projectileId, projectile] of clientProjectiles) {
    const traveled = Math.min(distance, projectile.remainingDistance);
    projectile.mesh.position.addScaledVector(projectile.direction, traveled);
    projectile.remainingDistance -= traveled;
    if (projectile.remainingDistance <= 0) removeClientProjectile(projectileId);
  }
  for (let index = predictedProjectiles.length - 1; index >= 0; index -= 1) {
    const projectile = predictedProjectiles[index];
    const traveled = Math.min(distance, projectile.remainingDistance);
    projectile.mesh.position.addScaledVector(projectile.direction, traveled);
    projectile.remainingDistance -= traveled;
    if (projectile.remainingDistance > 0) continue;
    predictedProjectiles.splice(index, 1);
    releaseProjectile(projectile);
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

  remoteEuler.set(player.rotation.x, player.rotation.y, player.rotation.z, 'YXZ');
  let remote = remotePlayers.get(player.playerId);

  if (!remote) {
    const targetPosition = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
    const targetQuaternion = new THREE.Quaternion().setFromEuler(remoteEuler);
    const plane = createAirplane(player.aircraftType, true);
    plane.position.copy(targetPosition);
    plane.quaternion.copy(targetQuaternion);
    scene.add(plane);
    remote = {
      plane,
      previousPosition: targetPosition.clone(),
      previousQuaternion: targetQuaternion.clone(),
      targetPosition,
      targetQuaternion,
      interpolationElapsed: 0.1,
      interpolationDuration: 0.1,
      timeSinceUpdate: 0,
      nearMissActive: false,
      aircraftType: player.aircraftType,
    };
    remotePlayers.set(player.playerId, remote);
    return;
  }

  if (remote.aircraftType !== player.aircraftType) {
    scene.remove(remote.plane);
    disposeAirplaneMaterials(remote.plane);
    const replacement = createAirplane(player.aircraftType, true);
    replacement.position.copy(remote.plane.position);
    replacement.quaternion.copy(remote.plane.quaternion);
    scene.add(replacement);
    remote.plane = replacement;
    remote.aircraftType = player.aircraftType;
  }

  remote.previousPosition.copy(remote.plane.position);
  remote.previousQuaternion.copy(remote.plane.quaternion);
  remote.targetPosition.set(player.position.x, player.position.y, player.position.z);
  remote.targetQuaternion.setFromEuler(remoteEuler);
  remote.interpolationDuration = THREE.MathUtils.clamp(remote.timeSinceUpdate, 0.08, 0.18);
  remote.interpolationElapsed = 0;
  remote.timeSinceUpdate = 0;
}

function updateRemotePlayers(delta: number): void {
  for (const remote of remotePlayers.values()) {
    remote.timeSinceUpdate += delta;
    remote.interpolationElapsed = Math.min(remote.interpolationDuration, remote.interpolationElapsed + delta);
    const interpolation = remote.interpolationElapsed / remote.interpolationDuration;
    remote.plane.position.lerpVectors(remote.previousPosition, remote.targetPosition, interpolation);
    remote.plane.quaternion.slerpQuaternions(remote.previousQuaternion, remote.targetQuaternion, interpolation);
  }
}

function updatePlaneVisuals(plane: THREE.Group, power: number, delta: number): void {
  const visuals = plane.userData.visuals as AircraftVisuals | undefined;
  if (!visuals) return;
  if (visuals.propeller) visuals.propeller.rotation.z += delta * (7 + power * 34);
  if (!visuals.exhaustMaterial) return;
  const isFighter = plane.userData.aircraftType === 'fighter';
  visuals.exhaustMaterial.opacity = (isFighter ? 0.08 : 0.1) + power * (isFighter ? 0.52 : 0.26);
  for (const exhaust of visuals.exhausts) {
    exhaust.scale.y = (exhaust.userData.baseLength as number) * (0.65 + power * (isFighter ? 1.2 : 0.7));
  }
}

function updateAircraftVisuals(delta: number): void {
  const localPower = crashed ? 0 : Math.max(throttle, currentSpeed / currentAircraft.maxSpeed * 0.72);
  updatePlaneVisuals(airplane, localPower, delta);
  for (const remote of remotePlayers.values()) updatePlaneVisuals(remote.plane, 0.55, delta);
}

function awardNearMiss(): void {
  score += 250;
  recordBestScore(score);
  updateScoreDisplay();
  sendPlayerUpdate();
  nearMissMessageElement.classList.remove('hidden');
  window.clearTimeout(nearMissMessageTimer);
  nearMissMessageTimer = window.setTimeout(() => nearMissMessageElement.classList.add('hidden'), 1000);
  playNearMissSound();
}

function updatePlayerInteractions(): void {
  for (const remote of remotePlayers.values()) {
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
  if (keys.has('KeyW')) throttle += delta * currentAircraft.throttleResponse;
  else if (keys.has('KeyS')) throttle -= delta * currentAircraft.throttleResponse * 2.1;
  else throttle = moveToward(throttle, currentAircraft.idleThrottle, delta * currentAircraft.throttleDecay);
  throttle = THREE.MathUtils.clamp(throttle, 0, 1);

  const rollInput = Number(keys.has('KeyA')) - Number(keys.has('KeyD'));
  const yawInput =
    Number(keys.has('KeyQ') || keys.has('ArrowLeft')) -
    Number(keys.has('KeyE') || keys.has('ArrowRight'));
  const pitchInput = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));

  if (onGround) {
    const groundTargetSpeed = throttle * currentAircraft.groundMaxSpeed;
    const groundSpeedChange = groundTargetSpeed > currentSpeed ? currentAircraft.groundAcceleration : currentAircraft.groundDrag;
    currentSpeed = moveToward(currentSpeed, groundTargetSpeed, delta * groundSpeedChange);
    const groundSteering = (0.12 + Math.min(1, currentSpeed / 20) * 0.72) * currentAircraft.groundSteering;
    heading += yawInput * delta * groundSteering;
    roll = THREE.MathUtils.lerp(roll, 0, Math.min(1, delta * currentAircraft.rollRate));
    pitch = THREE.MathUtils.clamp(pitch + pitchInput * delta * currentAircraft.pitchRate * 0.72, -0.08, 0.2);
    if (pitchInput === 0) pitch = THREE.MathUtils.lerp(pitch, 0, Math.min(1, delta * currentAircraft.stability * 5));

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
      velocity.y = 0.8 + (currentSpeed - currentAircraft.takeoffSpeed) * 0.05 * currentAircraft.lift;
      verticalSpeed = velocity.y;
      airplane.position.y = groundPlaneY(airplane.position.x, airplane.position.z) + 0.02;
      setFlightState('TAKEOFF');
    }

    return;
  }

  const targetRoll = rollInput * 0.82;
  const speedRatio = THREE.MathUtils.clamp(currentSpeed / currentAircraft.maxSpeed, 0, 1);
  const steeringAuthority =
    (0.42 + speedRatio * 0.5) * currentAircraft.yawRate / currentAircraft.inertia;
  roll = THREE.MathUtils.lerp(roll, targetRoll, Math.min(1, delta * currentAircraft.rollRate));
  // Pitch input commands an aircraft-specific attitude target. It must not wind the nose
  // continuously toward a stall angle while a player holds the climb key.
  const targetPitch = pitchInput > 0 ? currentAircraft.maxClimbPitch : pitchInput < 0 ? -0.38 : 0;
  const pitchResponse = pitchInput === 0 ? currentAircraft.pitchReturnRate : currentAircraft.pitchRate * 1.15;
  pitch = moveToward(pitch, targetPitch, delta * pitchResponse);
  const landingAssistAirport = getLandingAssistAirport(airplane.position);
  const approachHeight = airplane.position.y - groundPlaneY(airplane.position.x, airplane.position.z);
  const landingAssistActive = landingAssistAirport !== null && approachHeight <= 52 && velocity.y <= 2;
  if (landingAssistActive) {
    roll = THREE.MathUtils.lerp(roll, 0, Math.min(1, delta * 1.55));
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
    const safeLanding =
      landingAirport !== null &&
      currentSpeed <= currentAircraft.safeLandingSpeed * (landingAssistActive ? 1.18 : 1) &&
      verticalSpeed >= -currentAircraft.safeDescentRate * (landingAssistActive ? 1.4 : 1) &&
      Math.abs(pitch) <= currentAircraft.landingTilt + (landingAssistActive ? 0.12 : 0) &&
      Math.abs(roll) <= currentAircraft.landingTilt + (landingAssistActive ? 0.14 : 0) &&
      runwayHeadingError(landingAirport) <= (landingAssistActive ? 0.72 : 0.52);
    if (!safeLanding) {
      endRun('CRASHED');
      return;
    }

    airplane.position.y = terrainY;
    verticalSpeed = 0;
    velocity.set(-Math.sin(heading) * currentSpeed, 0, -Math.cos(heading) * currentSpeed);
    pitch = 0;
    roll = 0;
    airplane.rotation.set(0, heading, 0, 'YXZ');
    onGround = true;
    landedFeedbackTime = 1.5;
    setFlightState('LANDED');
    rewardLanding(landingAirport);
    handleContractLanding(landingAirport);
  }

}

function updateRunTimer(delta: number): void {
  remainingTime = Math.max(0, remainingTime - delta);
  updateTimerDisplay();
  if (remainingTime === 0) endRun('TIME UP');
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

  const cameraSpeedOffset = THREE.MathUtils.clamp(currentSpeed / currentAircraft.maxSpeed, 0, 1) * 4;
  const cameraFollow = currentAircraft.cameraDamping;
  targetCameraPosition
    .set(0, 5.5 + cameraSpeedOffset * 0.18, 14 + cameraSpeedOffset)
    .applyQuaternion(airplane.quaternion)
    .add(airplane.position);
  camera.position.lerp(targetCameraPosition, Math.min(1, delta * cameraFollow));

  lookTarget
    .set(0, 1 + cameraSpeedOffset * 0.08, -8 - cameraSpeedOffset * 0.4)
    .applyQuaternion(airplane.quaternion)
    .add(airplane.position);
  camera.lookAt(lookTarget);

  const targetFov = 65 + THREE.MathUtils.clamp((currentSpeed - 35) * 0.25, 0, 10);
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
    scene.fog.color.setRGB(0.62 + altitudeFactor * 0.12, 0.76 + altitudeFactor * 0.09, 0.81 + altitudeFactor * 0.1);
  }
  const fovChanged = Number.isFinite(nextFov) && Math.abs(camera.fov - nextFov) >= 0.01;
  const farChanged = Number.isFinite(targetFar) && Math.abs(camera.far - targetFar) >= 25;
  if (fovChanged || farChanged) {
    if (fovChanged) camera.fov = nextFov;
    if (farChanged) camera.far = targetFar;
    camera.updateProjectionMatrix();
  }

  if (cameraShakeTime > 0) {
    const shakeStrength = (cameraShakeTime / 0.35) * 0.38;
    camera.position.x += Math.sin(cameraShakeTime * 95) * shakeStrength;
    camera.position.y += Math.cos(cameraShakeTime * 110) * shakeStrength * 0.65;
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
  updateAircraftVisuals(delta);
  updateProjectiles(delta);
  updateFlashEffects(muzzleFlashes, muzzleFlashPool, delta);
  updateFlashEffects(impactFlashes, impactFlashPool, delta);
  updateDestructionEffects(delta);
  updateOsmCityChunks(airplane.position);
  cityWorld.updateWorldStreaming?.(airplane.position);
  updateWeapons(delta);
  if (!crashed && runStarted) updatePlayerInteractions();
  if (challengeModeEnabled) updateCheckpointFeedback(delta);
  updateCamera(delta);
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
    updateNavigationHud();
    updateEngineAudio();
  }
  renderer.render(scene, camera);
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
const socket = new WebSocket(socketUrl);

citiesButtonElement.addEventListener('click', () => {
  cityWorld.disposeWorldStreaming?.();
  socket.close();
  const url = new URL(window.location.href);
  url.searchParams.delete(CITY_QUERY_PARAM);
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
});

function sendLocalState(): void {
  if (!localPlayerId || socket.readyState !== WebSocket.OPEN) return;
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
  if (!localPlayerId || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'player', displayName, score }));
}

function sendFireIntent(): void {
  if (!localPlayerId || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'fire' }));
  spawnMuzzleFeedback();
  playFireSound();
}

function sendRespawn(): void {
  if (!localPlayerId || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'respawn' }));
}

socket.addEventListener('open', () => {
  connectionElement.textContent = 'Server: connected';
  connectionElement.className = 'online';
});

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data) as ServerMessage;
  if (message.type === 'welcome') {
    localPlayerId = message.playerId;
    health = message.health;
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
    for (const player of message.players) updateRemotePlayer(player);
    sendLocalState();
    sendPlayerUpdate();
  } else if (message.type === 'state') {
    updateRemotePlayer(message);
  } else if (message.type === 'remove') {
    const remote = remotePlayers.get(message.playerId);
    if (remote) {
      scene.remove(remote.plane);
      disposeAirplaneMaterials(remote.plane);
    }
    remotePlayers.delete(message.playerId);
  } else if (message.type === 'leaderboard') {
    updateLeaderboard(message.players);
  } else if (message.type === 'projectileSpawn') {
    addProjectile(message);
  } else if (message.type === 'projectileRemove') {
    removeClientProjectile(message.projectileId);
  } else if (message.type === 'damage') {
    spawnImpactFeedback(message.playerId);
    if (message.shooterId === localPlayerId && message.playerId !== localPlayerId) {
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
      health = 0;
      updateHealthDisplay(true);
      endRun('DESTROYED', `DESTROYED BY ${message.killerDisplayName}`);
    }
    if (message.killerId === localPlayerId) {
      score = Math.max(score, message.killerScore);
      recordBestScore(score);
      addCredits(200);
      handleContractKill();
      updateScoreDisplay();
      showCombatMessage('DESTROYED +500', true);
      playDestructionSound();
    }
  } else if (message.type === 'respawn' && message.playerId === localPlayerId) {
    health = message.health;
    updateHealthDisplay();
  }
});

socket.addEventListener('close', () => {
  connectionElement.textContent = 'Server: disconnected';
  connectionElement.className = 'offline';
});

socket.addEventListener('error', () => {
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
