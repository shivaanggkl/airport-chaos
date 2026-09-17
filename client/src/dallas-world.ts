import { addDowntownDistrict } from './dallas-skyline';
import { inDallasCore } from '../../shared/dallas-skyline.mjs';
import * as THREE from 'three';
import dallasElevationJson from './data/dallas-elevation.json';
import dallasSourceJson from './data/dallas-source.json';
import { addSceneryAsset } from './assets';
import { resolveAdPlacement, type AdPlacement, type AdPlacementSpec } from './ad-placement';
import type { AmbientTrafficConfig } from './ambient-traffic';
import type { SkyChallengeDefinition } from './sky-challenges';
import type { StuntZone } from './stunt-combo';
import type { DiscoveryDefinition } from './discoveries';
import { DallasChunkStreamer } from './dallas-streamer';
import type { ImportedObstacle, ImportedRoadSegment, ImportedWater } from './osm-city';
import type { WorldMapLayer } from './world-map';
import type { NavigationDestination } from './navigation-beacons';
import { dallasDisplayNames as place } from '../../shared/dallas-display-names.mjs';
import { dfwSpeedGates } from '../../shared/city-challenges.mjs';
import { CityVisualLayer, type CityVisualConfig, type CityVisualQuality, type CityTimeOfDay } from './city-visuals';

export const WORLD_METERS_PER_UNIT = 1;
export const WORLD_SIZE = 50_000;
export const DALLAS_GEO_BOUNDS = dallasSourceJson.bounds;

export type AirportId = string;
export type AirportDefinition = {
  id: AirportId;
  name: string;
  x: number;
  z: number;
  heading: number;
  runwayWidth: number;
  runwayLength: number;
  spawnOffset: number;
  accentColor: number;
};
export type RegionName = string;
export type ObstacleBounds = ImportedObstacle;
export type MountainBounds = { x: number; z: number; radius: number; height: number; baseY?: number };
export type WaterBounds = ImportedWater;

let dallasStreamer: DallasChunkStreamer | undefined;
let cityVisualLayer: CityVisualLayer | undefined;
let visualQuality: CityVisualQuality = 'high';
let timeOfDay: CityTimeOfDay = 'day';
let horizonMaterial: THREE.MeshStandardMaterial | undefined;
export function configureWorldVisuals(options: { quality: CityVisualQuality; timeOfDay: CityTimeOfDay }): void {
  visualQuality = options.quality;
  timeOfDay = options.timeOfDay;
}
export function setTimeOfDay(preset: CityTimeOfDay): void {
  timeOfDay = preset;
  const dusk = preset === 'dusk';
  airportMaterials.glass.emissive.setHex(dusk ? 0x9c6135 : 0x000000);
  airportMaterials.glass.emissiveIntensity = dusk ? 0.38 : 0;
  for (const glass of [landmarkMaterials.glassDark, landmarkMaterials.glassBlue, landmarkMaterials.glassGreen]) {
    glass.emissive.setHex(dusk ? 0x315063 : 0x000000);
    glass.emissiveIntensity = dusk ? 0.2 : 0;
  }
  landmarkMaterials.river.color.setHex(dusk ? 0x173c6a : 0x075e96);
  horizonMaterial?.color.setHex(dusk ? 0x3d5147 : 0x4c7847);
  cityVisualLayer?.setDusk(dusk);
}
type CompactElevationData = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  width: number;
  height: number;
  baseElevation: number;
  scale: number;
  elevations: string;
};
const dallasElevation = dallasElevationJson as CompactElevationData;
const elevationBytes = Uint8Array.from(atob(dallasElevation.elevations), (character) => character.charCodeAt(0));
const elevationSamples = new Uint16Array(elevationBytes.buffer, elevationBytes.byteOffset, elevationBytes.byteLength / 2);
const airportSafetyWidth: Record<string, number> = { dfw: 1500, love: 700, addison: 600, executive: 560 };

export const airports: ReadonlyArray<AirportDefinition> = [
  { id: 'dfw', name: place.dfw, x: -22_800, z: -13_600, heading: 0, runwayWidth: 60, runwayLength: 4100, spawnOffset: 1300, accentColor: 0x31566b },
  { id: 'love', name: place.love, x: -5_140, z: -7_780, heading: 0, runwayWidth: 46, runwayLength: 2700, spawnOffset: 820, accentColor: 0x5a6f86 },
  { id: 'addison', name: place.addison, x: -3_700, z: -21_100, heading: 0, runwayWidth: 38, runwayLength: 2200, spawnOffset: 670, accentColor: 0x617a87 },
  { id: 'executive', name: place.executive, x: -6_700, z: 10_600, heading: 0, runwayWidth: 38, runwayLength: 1800, spawnOffset: 540, accentColor: 0x718064 },
];
export const centralAirport = airports[0];
// This is the Dallas-only source of truth for every local activity that needs
// a geographic anchor.  Airport anchors intentionally derive from the active
// runway configuration so a later airport adjustment cannot leave gameplay
// rewards behind at an old coordinate.
function airportLocation(id: AirportId): { x: number; z: number } {
  const airport = airports.find((candidate) => candidate.id === id);
  if (!airport) throw new Error(`Missing Dallas airport activity anchor: ${id}`);
  return { x: airport.x, z: airport.z };
}

export const dallasLocations = {
  dfw: airportLocation('dfw'),
  loveField: airportLocation('love'),
  addison: airportLocation('addison'),
  dallasExecutive: airportLocation('executive'),
  downtown: { x: -600, z: -450 },
  reunionTower: { x: -1120, z: 130 },
  downtownPlaza: { x: -330, z: -360 },
  fountainDistrict: { x: -780, z: -230 },
  whiteRock: { x: 5200, z: -8500 },
  trinity: { x: -2380, z: 720 },
  trinityNorth: { x: -4100, z: 2300 },
  i35eCrossing: { x: -9100, z: -7000 },
  lasColinas: { x: -13_500, z: -9350 },
  metroArena: { x: -7_800, z: 2_800 },
} as const;
export const navigationDestinations: readonly NavigationDestination[] = [
  { id: 'dfw', label: place.dfw, ...dallasLocations.dfw, kind: 'airport' },
  { id: 'love', label: place.love, ...dallasLocations.loveField, kind: 'airport' },
  { id: 'addison', label: place.addison, ...dallasLocations.addison, kind: 'airport' },
  { id: 'executive', label: place.executive, ...dallasLocations.dallasExecutive, kind: 'airport' },
  { id: 'downtown', label: place.downtown, ...dallasLocations.downtown, kind: 'district' },
  { id: 'reunion', label: place.reunion, ...dallasLocations.reunionTower, kind: 'landmark' },
  { id: 'metro-arena', label: 'METRO ARENA', ...dallasLocations.metroArena, kind: 'landmark' },
];
export const stuntZones: ReadonlyArray<StuntZone> = [
  { id: 'trinity-crossing', kind: 'bridge', ...dallasLocations.trinity, radius: 165, minAltitude: 16, maxAltitude: 92 },
  { id: 'downtown-dallas', kind: 'landmark', ...dallasLocations.downtown, radius: 900, minAltitude: 0, maxAltitude: 360 },
  { id: 'las-colinas', kind: 'landmark', ...dallasLocations.lasColinas, radius: 760, minAltitude: 0, maxAltitude: 300 },
];
export const discoveries: ReadonlyArray<DiscoveryDefinition> = [
  // Airport radii deliberately remain inside the associated spawn offset:
  // taking off cannot instantly discover the airport the player spawned at.
  { id: 'dfw-international', name: place.dfw, type: 'airport', ...dallasLocations.dfw, radius: 700, minAltitude: 0, maxAltitude: 280, credits: 75, setId: 'airport-tour', setBonus: 300 },
  { id: 'love-field', name: place.love, type: 'airport', ...dallasLocations.loveField, radius: 460, minAltitude: 0, maxAltitude: 240, credits: 100, setId: 'airport-tour', setBonus: 300 },
  { id: 'addison-airport', name: place.addison, type: 'airport', ...dallasLocations.addison, radius: 380, minAltitude: 0, maxAltitude: 220, credits: 100, setId: 'airport-tour', setBonus: 300 },
  { id: 'dallas-executive', name: place.executive, type: 'airstrip', ...dallasLocations.dallasExecutive, radius: 320, minAltitude: 0, maxAltitude: 210, credits: 125, setId: 'airport-tour', setBonus: 300 },
  { id: 'reunion-tower', name: place.reunion, type: 'downtown', ...dallasLocations.reunionTower, radius: 120, minAltitude: 110, maxAltitude: 300, credits: 125, setId: 'downtown-icons', setBonus: 275 },
  { id: 'downtown-plaza', name: 'Central Plaza', type: 'landmark', ...dallasLocations.downtownPlaza, radius: 130, minAltitude: 130, maxAltitude: 400, credits: 100, setId: 'downtown-icons', setBonus: 275 },
  { id: 'fountain-district', name: 'Fountain District', type: 'rooftop', ...dallasLocations.fountainDistrict, radius: 120, minAltitude: 110, maxAltitude: 340, credits: 125, setId: 'downtown-icons', setBonus: 275 },
  { id: 'las-colinas', name: place.lasColinas, type: 'landmark', ...dallasLocations.lasColinas, radius: 340, minAltitude: 80, maxAltitude: 360, credits: 100 },
  { id: 'white-rock-lake', name: 'White Rock Lake', type: 'water', ...dallasLocations.whiteRock, radius: 560, minAltitude: 20, maxAltitude: 350, credits: 100 },
  { id: 'trinity-corridor', name: 'Trinity River Corridor', type: 'water', ...dallasLocations.trinityNorth, radius: 320, minAltitude: 20, maxAltitude: 260, credits: 100 },
  { id: 'trinity-crossing', name: 'Trinity Crossing', type: 'bridge', ...dallasLocations.trinity, radius: 130, minAltitude: 18, maxAltitude: 105, credits: 150 },
  { id: 'i35e-overlook', name: 'I-35E Overlook', type: 'bridge', ...dallasLocations.i35eCrossing, radius: 220, minAltitude: 35, maxAltitude: 210, credits: 125 },
  { id: 'secret-ghost-strip', name: 'GHOST STRIP', type: 'secret', x: -18_900, z: 7_800, radius: 180, minAltitude: 0, maxAltitude: 120, credits: 100, setId: 'dallas-secrets', setBonus: 300, mapVisible: false },
  { id: 'secret-skyline-gap', name: 'SKYLINE GAP', type: 'secret', x: -520, z: -485, radius: 75, minAltitude: 105, maxAltitude: 245, credits: 100, setId: 'dallas-secrets', setBonus: 300, mapVisible: false },
  { id: 'secret-under-bridge', name: 'UNDER THE BRIDGE', type: 'secret', ...dallasLocations.trinity, radius: 85, minAltitude: 8, maxAltitude: 55, credits: 100, setId: 'dallas-secrets', setBonus: 300, mapVisible: false },
  { id: 'secret-hangar-9', name: 'HANGAR 9', type: 'secret', x: -6_180, z: 10_560, radius: 110, minAltitude: 0, maxAltitude: 100, credits: 100, setId: 'dallas-secrets', setBonus: 300, mapVisible: false },
  { id: 'secret-midnight-signal', name: 'MIDNIGHT SIGNAL', type: 'secret', x: 3_900, z: -13_200, radius: 120, minAltitude: 60, maxAltitude: 260, credits: 100, setId: 'dallas-secrets', setBonus: 300, mapVisible: false, timePreset: 'dusk' },
];
// Ambient-only routes stay deliberately clear of runway surfaces. They use the
// same city coordinates as the flight world and can later be promoted into
// scripted traffic events without entering player/network combat state.
export const ambientTrafficConfig: AmbientTrafficConfig = {
  routes: [
    {
      id: 'civilian-dfw-love', kind: 'civilian', aircraftType: 'trainer', speed: 58,
      points: [
        { x: -22_800, z: -10_650, altitude: 170 },
        { x: -16_500, z: -9_900, altitude: 540 },
        { x: -9_600, z: -8_600, altitude: 430 },
        { x: -5_140, z: -5_950, altitude: 155 },
        { x: -8_900, z: -7_500, altitude: 370 },
        { x: -18_400, z: -11_800, altitude: 470 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-white-rock-loop', kind: 'civilian', aircraftType: 'trainer', speed: 64,
      points: [
        { x: 2_600, z: -6_500, altitude: 470 },
        { x: 5_600, z: -7_350, altitude: 420 },
        { x: 7_200, z: -9_200, altitude: 450 },
        { x: 4_500, z: -10_300, altitude: 470 },
        { x: 2_200, z: -8_400, altitude: 430 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-dfw-las-colinas', kind: 'civilian', aircraftType: 'trainer', speed: 62, phase: 0.04,
      points: [
        { x: -22_800, z: -10_500, altitude: 175 }, { x: -19_200, z: -10_400, altitude: 420 },
        { x: -15_200, z: -9_800, altitude: 480 }, { x: -12_000, z: -8_100, altitude: 330 },
        { x: -15_800, z: -9_700, altitude: 440 }, { x: -21_100, z: -12_300, altitude: 310 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-dfw-addison', kind: 'civilian', aircraftType: 'trainer', speed: 60, phase: 0.09,
      points: [
        { x: -22_800, z: -10_750, altitude: 165 }, { x: -16_500, z: -12_900, altitude: 580 },
        { x: -9_200, z: -17_600, altitude: 540 }, { x: -3_700, z: -19_900, altitude: 150 },
        { x: -7_100, z: -17_100, altitude: 480 }, { x: -17_900, z: -13_400, altitude: 610 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-love-downtown', kind: 'civilian', aircraftType: 'trainer', speed: 57,
      points: [
        { x: -5_140, z: -5_950, altitude: 150 }, { x: -3_000, z: -4_500, altitude: 370 },
        { x: -600, z: -1_600, altitude: 410 }, { x: 1_200, z: 250, altitude: 390 },
        { x: -1_800, z: -2_000, altitude: 420 }, { x: -5_140, z: -6_300, altitude: 190 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-love-white-rock', kind: 'civilian', aircraftType: 'trainer', speed: 64,
      points: [
        { x: -5_140, z: -5_900, altitude: 180 }, { x: -1_000, z: -6_200, altitude: 460 },
        { x: 3_100, z: -7_200, altitude: 510 }, { x: 6_500, z: -9_000, altitude: 430 },
        { x: 2_300, z: -8_800, altitude: 490 }, { x: -3_500, z: -7_200, altitude: 370 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-addison-las-colinas', kind: 'civilian', aircraftType: 'trainer', speed: 61,
      points: [
        { x: -3_700, z: -19_900, altitude: 160 }, { x: -7_500, z: -17_400, altitude: 480 },
        { x: -12_400, z: -12_000, altitude: 520 }, { x: -14_800, z: -9_300, altitude: 310 },
        { x: -10_300, z: -12_800, altitude: 500 }, { x: -4_000, z: -19_200, altitude: 210 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-executive-trinity', kind: 'civilian', aircraftType: 'trainer', speed: 59,
      points: [
        { x: -6_700, z: 9_550, altitude: 145 }, { x: -5_500, z: 5_600, altitude: 370 },
        { x: -2_400, z: 900, altitude: 430 }, { x: -700, z: -1_000, altitude: 410 },
        { x: -3_900, z: 3_000, altitude: 380 }, { x: -6_700, z: 9_900, altitude: 175 },
      ],
      eventEligible: true,
    },
    {
      id: 'private-love-addison', kind: 'privateJet', aircraftType: 'privateJet', speed: 142,
      points: [
        { x: -5_140, z: -5_900, altitude: 180 },
        { x: -3_400, z: -10_200, altitude: 760 },
        { x: -3_700, z: -18_900, altitude: 540 },
        { x: -3_700, z: -19_850, altitude: 170 },
        { x: -5_200, z: -14_000, altitude: 710 },
        { x: -6_700, z: -9_100, altitude: 500 },
      ],
      eventEligible: true,
    },
    {
      id: 'private-dfw-love', kind: 'privateJet', aircraftType: 'privateJet', speed: 154, phase: 0.13,
      points: [
        { x: -22_800, z: -10_700, altitude: 190 }, { x: -18_000, z: -9_600, altitude: 850 },
        { x: -11_000, z: -8_400, altitude: 780 }, { x: -5_140, z: -5_850, altitude: 185 },
        { x: -9_500, z: -7_700, altitude: 690 }, { x: -19_000, z: -12_100, altitude: 840 },
      ],
      eventEligible: true,
    },
    {
      id: 'private-addison-executive', kind: 'privateJet', aircraftType: 'privateJet', speed: 150,
      points: [
        { x: -3_700, z: -19_850, altitude: 170 }, { x: -5_500, z: -12_000, altitude: 950 },
        { x: -6_400, z: -2_000, altitude: 1_050 }, { x: -6_700, z: 9_500, altitude: 190 },
        { x: -7_800, z: 2_000, altitude: 1_020 }, { x: -4_000, z: -16_000, altitude: 900 },
      ],
      eventEligible: true,
    },
    {
      id: 'private-dfw-downtown', kind: 'privateJet', aircraftType: 'privateJet', speed: 158, phase: 0.18,
      points: [
        { x: -22_800, z: -10_700, altitude: 200 }, { x: -16_000, z: -8_000, altitude: 1_100 },
        { x: -7_800, z: -3_800, altitude: 1_180 }, { x: -600, z: -1_200, altitude: 880 },
        { x: -8_200, z: -4_400, altitude: 1_170 }, { x: -20_000, z: -11_800, altitude: 780 },
      ],
      eventEligible: true,
    },
    {
      id: 'private-las-colinas-love', kind: 'privateJet', aircraftType: 'privateJet', speed: 146,
      points: [
        { x: -14_000, z: -9_600, altitude: 500 }, { x: -10_000, z: -8_400, altitude: 770 },
        { x: -5_140, z: -5_900, altitude: 175 }, { x: -8_400, z: -7_200, altitude: 690 },
        { x: -13_800, z: -9_000, altitude: 420 },
      ],
      eventEligible: true,
    },
    {
      id: 'cargo-dfw-executive', kind: 'cargo', aircraftType: 'cargo', speed: 112,
      points: [
        { x: -22_800, z: -10_900, altitude: 220 },
        { x: -16_700, z: -7_800, altitude: 1_050 },
        { x: -10_200, z: 2_700, altitude: 930 },
        { x: -6_700, z: 9_550, altitude: 190 },
        { x: -8_100, z: 5_600, altitude: 820 },
        { x: -16_500, z: -6_900, altitude: 1_030 },
      ],
      eventEligible: true,
    },
    {
      id: 'cargo-dfw-addison', kind: 'cargo', aircraftType: 'cargo', speed: 108, phase: 0.06,
      points: [
        { x: -22_800, z: -10_850, altitude: 230 }, { x: -17_400, z: -13_800, altitude: 1_100 },
        { x: -9_000, z: -18_200, altitude: 1_180 }, { x: -3_700, z: -19_900, altitude: 190 },
        { x: -8_500, z: -17_600, altitude: 1_130 }, { x: -18_300, z: -13_300, altitude: 1_060 },
      ],
      eventEligible: true,
    },
    {
      id: 'cargo-dfw-east-logistics', kind: 'cargo', aircraftType: 'cargo', speed: 115, phase: 0.11,
      points: [
        { x: -22_800, z: -10_900, altitude: 240 }, { x: -16_000, z: -8_800, altitude: 1_200 },
        { x: -7_000, z: -2_000, altitude: 1_360 }, { x: 4_600, z: -5_400, altitude: 1_300 },
        { x: 2_400, z: 1_800, altitude: 1_420 }, { x: -10_400, z: -3_700, altitude: 1_300 },
        { x: -20_000, z: -11_900, altitude: 950 },
      ],
      eventEligible: true,
    },
    {
      id: 'cargo-executive-dfw', kind: 'cargo', aircraftType: 'cargo', speed: 110,
      points: [
        { x: -6_700, z: 9_500, altitude: 210 }, { x: -9_300, z: 4_200, altitude: 1_080 },
        { x: -14_500, z: -4_800, altitude: 1_200 }, { x: -22_800, z: -10_850, altitude: 220 },
        { x: -17_800, z: -8_000, altitude: 1_120 }, { x: -9_000, z: 5_500, altitude: 1_100 },
      ],
      eventEligible: true,
    },
    {
      id: 'civilian-dfw-west-arrival', kind: 'civilian', aircraftType: 'trainer', speed: 66, phase: 0.16,
      points: [
        { x: -25_000, z: -12_800, altitude: 780 }, { x: -23_600, z: -11_500, altitude: 470 },
        { x: -22_800, z: -10_650, altitude: 175 }, { x: -19_800, z: -9_650, altitude: 410 },
        { x: -21_400, z: -12_600, altitude: 650 }, { x: -24_300, z: -14_100, altitude: 800 },
      ],
    },
    {
      id: 'civilian-dfw-east-departure', kind: 'civilian', aircraftType: 'trainer', speed: 68, phase: 0.43,
      points: [
        { x: -22_900, z: -10_700, altitude: 180 }, { x: -20_300, z: -9_450, altitude: 520 },
        { x: -16_800, z: -10_100, altitude: 760 }, { x: -18_900, z: -13_100, altitude: 640 },
        { x: -22_500, z: -13_400, altitude: 360 }, { x: -24_400, z: -11_900, altitude: 720 },
      ],
    },
    {
      id: 'private-dfw-las-colinas-loop', kind: 'privateJet', aircraftType: 'privateJet', speed: 150, phase: 0.31,
      points: [
        { x: -22_800, z: -10_750, altitude: 220 }, { x: -18_400, z: -9_500, altitude: 880 },
        { x: -14_100, z: -9_350, altitude: 980 }, { x: -12_000, z: -8_250, altitude: 740 },
        { x: -16_100, z: -10_800, altitude: 900 }, { x: -21_200, z: -12_800, altitude: 610 },
      ],
    },
    {
      id: 'civilian-downtown-trinity-loop', kind: 'civilian', aircraftType: 'trainer', speed: 63, phase: 0.58,
      points: [
        { x: -3_400, z: 1_600, altitude: 430 }, { x: -1_100, z: -1_450, altitude: 510 },
        { x: 1_600, z: -900, altitude: 540 }, { x: 1_100, z: 1_900, altitude: 470 },
        { x: -2_300, z: 2_600, altitude: 450 },
      ],
    },
    {
      id: 'civilian-executive-white-rock', kind: 'civilian', aircraftType: 'trainer', speed: 67, phase: 0.72,
      points: [
        { x: -6_700, z: 9_600, altitude: 180 }, { x: -3_900, z: 4_600, altitude: 520 },
        { x: 1_400, z: -2_800, altitude: 650 }, { x: 5_500, z: -8_300, altitude: 530 },
        { x: 2_400, z: -5_900, altitude: 610 }, { x: -4_600, z: 6_300, altitude: 540 },
      ],
    },
    {
      id: 'helicopter-downtown', kind: 'helicopter', speed: 42,
      points: [
        { x: -1_900, z: -1_250, altitude: 360 },
        { x: 650, z: -1_100, altitude: 520 },
        { x: 1_100, z: 620, altitude: 450 },
        { x: -1_400, z: 1_300, altitude: 390 },
      ],
      eventEligible: true,
    },
    {
      id: 'helicopter-las-colinas', kind: 'helicopter', speed: 38,
      points: [
        { x: -15_500, z: -10_400, altitude: 220 },
        { x: -12_100, z: -10_300, altitude: 250 },
        { x: -11_700, z: -8_250, altitude: 225 },
        { x: -14_900, z: -7_900, altitude: 245 },
      ],
      eventEligible: true,
    },
    {
      id: 'helicopter-love-field', kind: 'helicopter', speed: 40,
      points: [
        { x: -6_700, z: -7_200, altitude: 230 }, { x: -4_000, z: -6_100, altitude: 270 },
        { x: -2_300, z: -7_900, altitude: 240 }, { x: -4_800, z: -9_300, altitude: 255 },
      ],
      eventEligible: true,
    },
    {
      id: 'helicopter-downtown-east', kind: 'helicopter', speed: 44,
      points: [
        { x: -300, z: -2_100, altitude: 410 }, { x: 1_900, z: -1_300, altitude: 560 },
        { x: 1_400, z: 880, altitude: 440 }, { x: -900, z: 1_000, altitude: 500 },
      ],
      eventEligible: true,
    },
    {
      id: 'high-altitude-west-east', kind: 'highAltitude', aircraftType: 'privateJet', speed: 220,
      points: [
        { x: -24_000, z: -2_000, altitude: 3_600 },
        { x: 23_000, z: -3_600, altitude: 3_850 },
        { x: 25_000, z: 2_800, altitude: 3_700 },
        { x: -23_500, z: 4_800, altitude: 3_600 },
      ],
    },
    {
      id: 'high-altitude-north-south', kind: 'highAltitude', aircraftType: 'cargo', speed: 168,
      points: [
        { x: -9_000, z: -24_000, altitude: 3_150 },
        { x: -6_200, z: 23_000, altitude: 3_350 },
        { x: 3_200, z: 24_000, altitude: 3_250 },
        { x: 1_500, z: -23_000, altitude: 3_100 },
      ],
    },
    {
      id: 'high-altitude-dfw-east', kind: 'highAltitude', aircraftType: 'privateJet', speed: 235, phase: 0.2,
      points: [
        { x: -25_000, z: -14_000, altitude: 3_900 }, { x: 24_000, z: -12_000, altitude: 4_100 },
        { x: 24_000, z: -7_000, altitude: 3_950 }, { x: -25_000, z: -8_000, altitude: 3_850 },
      ],
    },
    {
      id: 'high-altitude-downtown-diagonal', kind: 'highAltitude', aircraftType: 'privateJet', speed: 210, phase: 0.44,
      points: [
        { x: -24_000, z: 20_000, altitude: 3_450 }, { x: 23_000, z: -22_000, altitude: 3_750 },
        { x: 24_000, z: -16_000, altitude: 3_650 }, { x: -22_000, z: 23_000, altitude: 3_500 },
      ],
    },
    {
      id: 'high-altitude-east-west-north', kind: 'highAltitude', aircraftType: 'cargo', speed: 182, phase: 0.63,
      points: [
        { x: -24_000, z: 12_000, altitude: 3_800 }, { x: 23_000, z: 14_000, altitude: 4_000 },
        { x: 23_000, z: 19_000, altitude: 3_900 }, { x: -24_000, z: 17_000, altitude: 3_720 },
      ],
    },
    {
      id: 'high-altitude-southbound', kind: 'highAltitude', aircraftType: 'privateJet', speed: 228, phase: 0.79,
      points: [
        { x: 12_000, z: 24_000, altitude: 3_680 }, { x: 10_000, z: -24_000, altitude: 3_900 },
        { x: 4_000, z: -24_000, altitude: 3_760 }, { x: 7_000, z: 24_000, altitude: 3_600 },
      ],
    },
  ],
  clouds: [
    { x: -19_000, z: -5_000, altitude: 2_250, width: 1_500, depth: 850 },
    { x: -13_000, z: -2_500, altitude: 2_700, width: 1_900, depth: 980 },
    { x: -8_000, z: -13_000, altitude: 2_480, width: 1_350, depth: 760 },
    { x: -2_000, z: -3_000, altitude: 2_120, width: 1_750, depth: 920 },
    { x: 5_000, z: -7_000, altitude: 2_620, width: 1_500, depth: 820 },
    { x: 11_500, z: 2_500, altitude: 3_100, width: 2_100, depth: 1_100 },
    { x: 17_000, z: -9_500, altitude: 2_540, width: 1_450, depth: 800 },
    { x: -18_000, z: 10_000, altitude: 2_680, width: 1_700, depth: 920 },
    { x: 2_000, z: 9_500, altitude: 2_300, width: 1_650, depth: 880 },
    { x: -8_500, z: 14_000, altitude: 2_750, width: 2_000, depth: 1_040 },
    { x: 14_000, z: 12_000, altitude: 2_380, width: 1_550, depth: 820 },
    { x: -23_000, z: -15_000, altitude: 2_600, width: 1_800, depth: 960 },
    { x: -23_500, z: 4_800, altitude: 2_460, width: 2_150, depth: 1_040 },
    { x: -16_200, z: 17_300, altitude: 2_460, width: 1_420, depth: 740 },
    { x: -4_500, z: 18_600, altitude: 2_520, width: 1_920, depth: 980 },
    { x: 6_800, z: 16_100, altitude: 2_340, width: 1_480, depth: 790 },
    { x: 17_800, z: 7_400, altitude: 2_860, width: 2_240, depth: 1_120 },
    { x: 21_000, z: -5_200, altitude: 2_420, width: 1_560, depth: 830 },
    { x: 9_300, z: -16_800, altitude: 2_380, width: 1_860, depth: 930 },
    { x: -8_400, z: -20_400, altitude: 2_360, width: 1_460, depth: 770 },
  ],
  atmosphereZones: [
    { id: 'white-rock-storm', type: 'storm', x: 6_400, z: -8_900, radius: 1_050, altitude: 2_200, strength: 0.42, active: false },
    { id: 'trinity-thermal', type: 'thermal', x: -2_400, z: 1_100, radius: 720, altitude: 0, strength: 0.18, active: true },
    { id: 'dfw-west-wind', type: 'wind', x: -20_400, z: -12_300, radius: 1_600, altitude: 0, strength: 0.12, active: true },
  ],
};

// Optional, local-only flight activities. Every point is in the same Dallas
// meter-space as airports, landmarks, radar, and the world map.
export const skyChallenges: ReadonlyArray<SkyChallengeDefinition> = [
  {
    id: 'dfw-speed', name: `${place.dfw} OPEN CORRIDOR`, type: 'speed', reward: 180, timeLimit: 62, sponsor: { type: 'RING_SPONSOR', campaignId: 'available-premium' },
    gates: dfwSpeedGates,
  },
  {
    id: 'downtown-precision', name: `${place.downtown} PRECISION`, type: 'precision', reward: 280, timeLimit: 72, sponsor: { type: 'RING_SPONSOR', campaignId: 'airport-chaos' },
    gates: [
      { x: -2_400, z: -1_700, altitude: 390, radius: 42 },
      { x: -980, z: -720, altitude: 470, radius: 38 },
      { x: 640, z: -1_160, altitude: 420, radius: 38 },
      { x: 1_100, z: 480, altitude: 500, radius: 42 },
    ],
  },
  {
    id: 'trinity-inverted', name: 'TRINITY INVERTED', type: 'inverted', reward: 340, timeLimit: 54,
    gates: [
      { x: -4_100, z: 2_300, altitude: 460, radius: 56, inverted: true },
      { x: -2_250, z: 1_050, altitude: 510, radius: 52, inverted: true },
      { x: -420, z: 1_600, altitude: 470, radius: 56, inverted: true },
    ],
  },
  {
    id: 'white-rock-low', name: 'WHITE ROCK LOW RUN', type: 'lowAltitude', reward: 240, timeLimit: 64,
    gates: [
      { x: 2_900, z: -7_100, altitude: 145, radius: 68, maxAltitude: 290 },
      { x: 4_550, z: -8_080, altitude: 135, radius: 64, maxAltitude: 275 },
      { x: 6_450, z: -9_050, altitude: 150, radius: 64, maxAltitude: 290 },
      { x: 7_950, z: -8_000, altitude: 165, radius: 68, maxAltitude: 310 },
    ],
  },
  {
    id: 'trinity-dive', name: 'TRINITY DIVE RECOVERY', type: 'dive', reward: 310, timeLimit: 58,
    gates: [
      { x: -5_000, z: 2_900, altitude: 1_050, radius: 78, minDescentRate: -3 },
      { x: dallasLocations.trinityNorth.x, z: dallasLocations.trinityNorth.z, altitude: 690, radius: 72, minDescentRate: -3 },
      { x: dallasLocations.trinity.x, z: dallasLocations.trinity.z, altitude: 360, radius: 76, minDescentRate: -2 },
    ],
  },
  {
    id: 'addison-climb', name: `${place.addison} DEPARTURE CLIMB`, type: 'climb', reward: 280, timeLimit: 66,
    gates: [
      { x: dallasLocations.addison.x - 180, z: dallasLocations.addison.z + 1_550, altitude: 310, radius: 76 },
      { x: dallasLocations.addison.x - 80, z: dallasLocations.addison.z + 3_100, altitude: 680, radius: 72 },
      { x: dallasLocations.addison.x + 120, z: dallasLocations.addison.z + 4_600, altitude: 1_080, radius: 70 },
      { x: dallasLocations.addison.x + 260, z: dallasLocations.addison.z + 6_100, altitude: 1_460, radius: 72 },
    ],
  },
  {
    id: 'downtown-corkscrew', name: 'SKYLINE CORKSCREW', type: 'corkscrew', reward: 360, timeLimit: 70,
    gates: [
      { x: -1_850, z: -1_500, altitude: 430, radius: 52 },
      { x: -420, z: -1_900, altitude: 620, radius: 48 },
      { x: 740, z: -650, altitude: 790, radius: 46 },
      { x: -310, z: 810, altitude: 960, radius: 48 },
      { x: -1_700, z: 140, altitude: 1_110, radius: 52 },
    ],
  },
  {
    id: 'las-colinas-flyby', name: `${place.lasColinas} FLYBY`, type: 'flyby', reward: 230, timeLimit: 64,
    gates: [
      { x: -15_400, z: -10_200, altitude: 330, radius: 70 },
      { x: -13_700, z: -9_400, altitude: 360, radius: 68 },
      { x: -12_100, z: -8_500, altitude: 340, radius: 70 },
    ],
  },
];
export const mapLayer: WorldMapLayer = {
  bounds: { minX: -25_000, maxX: 25_000, minZ: -25_000, maxZ: 25_000 },
  staticUrl: '/data/dallas/map.json',
  landmarks: [
    { id: 'downtown', label: place.downtown, ...dallasLocations.downtown },
    { id: 'las-colinas', label: place.lasColinas, ...dallasLocations.lasColinas },
    { id: 'white-rock', label: 'WHITE ROCK LAKE', ...dallasLocations.whiteRock },
    { id: 'trinity', label: 'TRINITY CORRIDOR', ...dallasLocations.trinity },
    { id: 'metro-arena', label: 'METRO ARENA', ...dallasLocations.metroArena },
  ],
};
function qaFlightLeg(id: string, label: string, from: { x: number; z: number }, to: { x: number; z: number }, speed: number) {
  return { id, label, x: from.x, z: from.z, altitude: 1_150, heading: Math.atan2(from.x - to.x, from.z - to.z), speed };
}

export const visualQaPresets = [
  // Localhost-only production soak launch points. The aircraft then moves
  // under normal flight physics and streamer updates between each waypoint.
  qaFlightLeg('SOAK_DFW_CANAL', 'SOAK DFW → CANAL', centralAirport, dallasLocations.lasColinas, 1_035),
  qaFlightLeg('SOAK_CANAL_CENTRAL', 'SOAK CANAL → CENTRAL', dallasLocations.lasColinas, dallasLocations.downtown, 1_420),
  qaFlightLeg('SOAK_CENTRAL_LOVE', 'SOAK CENTRAL → LOVE', dallasLocations.downtown, airports[1], 1_035),
  qaFlightLeg('SOAK_LOVE_ADDISON', 'SOAK LOVE → ADDISON', airports[1], airports[2], 1_420),
  qaFlightLeg('SOAK_ADDISON_EXECUTIVE', 'SOAK ADDISON → EXECUTIVE', airports[2], airports[3], 1_035),
  qaFlightLeg('SOAK_EXECUTIVE_DFW', 'SOAK EXECUTIVE → DFW', airports[3], centralAirport, 1_420),
  { id: 'DFW_RUNWAY', label: `${place.dfw} RUNWAY`, x: centralAirport.x, z: centralAirport.z + centralAirport.spawnOffset, altitude: 0, heading: centralAirport.heading, onGround: true },
  { id: 'DFW_500M', label: `${place.dfw} 500M`, x: centralAirport.x - 260, z: centralAirport.z, altitude: 500, heading: -Math.PI / 2 },
  { id: 'DOWNTOWN_300M', label: `${place.downtown} 300M`, x: dallasLocations.downtown.x + 520, z: dallasLocations.downtown.z + 420, altitude: 300, heading: 0.89 },
  { id: 'DOWNTOWN_800M', label: `${place.downtown} 800M`, x: dallasLocations.downtown.x + 700, z: dallasLocations.downtown.z + 560, altitude: 800, heading: 0.89 },
  { id: 'DOWNTOWN_CACHE_STATIC', label: 'CENTRAL CACHE STATIC', x: dallasLocations.downtown.x + 700, z: dallasLocations.downtown.z + 560, altitude: 800, heading: 0.89, speed: 0 },
  { id: 'CENTRAL_SILHOUETTE', label: 'CENTRAL SILHOUETTE', x: -3_100, z: -3_750, altitude: 160, heading: -2.48 },
  { id: 'REDSPEAR_BOOST_STREAM', label: 'REDSPEAR BOOST STREAM', x: -18_000, z: -10_500, altitude: 900, heading: -2.08, speed: 1_420 },
  { id: 'DALLAS_1500M', label: 'DALLAS 1500M', x: dallasLocations.lasColinas.x + 1800, z: dallasLocations.lasColinas.z + 1200, altitude: 1500, heading: 0.98 },
  { id: 'WHITE_ROCK_500M', label: 'WHITE ROCK 500M', x: dallasLocations.whiteRock.x - 350, z: dallasLocations.whiteRock.z + 300, altitude: 500, heading: -0.86 },
  { id: 'TRINITY_500M', label: 'TRINITY 500M', x: dallasLocations.trinity.x - 350, z: dallasLocations.trinity.z + 480, altitude: 500, heading: -0.63 },
  { id: 'LAS_COLINAS_500M', label: `${place.lasColinas} 500M`, x: dallasLocations.lasColinas.x + 360, z: dallasLocations.lasColinas.z + 420, altitude: 500, heading: 0.71 },
  { id: 'METRO_ARENA_300M', label: 'METRO ARENA 300M', x: dallasLocations.metroArena.x + 650, z: dallasLocations.metroArena.z + 520, altitude: 300, heading: 0.92, pitch: -0.12 },
  { id: 'ADS_DFW_RING', label: 'ADS DFW RING', x: -21_400, z: -10_420, altitude: 380, heading: -1.88 },
  { id: 'ADS_I35E_SIGN', label: 'ADS I-35E SIGN', x: -9_145, z: -6_560, altitude: 100, heading: 0 },
  { id: 'ADS_DFW_TERMINAL', label: 'ADS DFW TERMINAL', x: -22_650, z: -13_600, altitude: 20, heading: -Math.PI / 2 },
  { id: 'QA_LOGO_DFW_TERMINAL', label: 'QA LOGO DFW TERMINAL', x: -22_520, z: -14_095, altitude: 27, heading: -Math.PI / 2, speed: 0 },
  { id: 'ADS_LOVE_TERMINAL', label: 'ADS LOVE TERMINAL', x: -5_400, z: -7_780, altitude: 50, heading: -Math.PI / 2 },
  { id: 'ADS_ADDISON_TERMINAL', label: 'ADS ADDISON TERMINAL', x: -3_950, z: -21_100, altitude: 45, heading: -Math.PI / 2 },
  { id: 'ADS_EXECUTIVE_TERMINAL', label: 'ADS EXECUTIVE TERMINAL', x: -6_950, z: 10_600, altitude: 45, heading: -Math.PI / 2 },
  { id: 'ADS_LAS_WRAP', label: 'ADS LAS WRAP', x: -13_353, z: -9_200, altitude: 120, heading: 0 },
  { id: 'ADS_DOWNTOWN_ROOF', label: 'ADS DOWNTOWN ROOF', x: -650, z: -150, altitude: 145, heading: -0.64 },
  { id: 'QA_LOGO_ROOFTOP', label: 'QA LOGO ROOFTOP', x: -420, z: 360, altitude: 330, heading: 0, speed: 0 },
  { id: 'ADS_HERO_CORNER', label: 'ADS HERO CORNER', x: -610, z: -655, altitude: 250, heading: -2.32 },
  { id: 'ADS_LAS_GROUND', label: 'ADS LAS GROUND', x: -13_255, z: -9_950, altitude: 360, heading: 0, pitch: -0.16 },
  { id: 'ADS_DFW_GROUND', label: 'ADS DFW GROUND', x: -23_320, z: -12_350, altitude: 330, heading: 0, pitch: -0.14 },
  { id: 'ADS_EXEC_GROUND', label: 'ADS EXEC GROUND', x: -6_845, z: 11_250, altitude: 310, heading: 0, pitch: -0.14 },
  { id: 'ADS_I35_ROOF', label: 'ADS I-35 ROOF', x: -9_480, z: -6_560, altitude: 240, heading: -0.35 },
  { id: 'ADS_DFW_RING_ENTRY', label: 'ADS DFW RING ENTRY', x: -20_600, z: -10_160, altitude: 380, heading: -1.88 },
  { id: 'ADS_SKYBOARD_DFW_LAS', label: 'ADS SKYBOARD DFW-LAS', x: -19_750, z: -11_750, altitude: 780, heading: -1.88 },
  { id: 'QA_LOGO_SKYBOARD', label: 'QA LOGO SKYBOARD', x: -24_150, z: -10_000, altitude: 850, heading: 1.08, speed: 0 },
  { id: 'ADS_SKYGATE_DFW_LAS', label: 'ADS SKYGATE DFW-LAS', x: -17_550, z: -9_900, altitude: 650, heading: -2.12 },
  { id: 'ADS_SKYBOARD_DOWNTOWN', label: 'ADS SKYBOARD DOWNTOWN', x: -4_600, z: -3_300, altitude: 1_200, heading: -2.19 },
  { id: 'ADS_BLIMP_LAS', label: 'ADS BLIMP LAS', x: -7_500, z: -8_100, altitude: 1_180, heading: Math.PI },
  { id: 'ADS_SKYBOARD_EXEC', label: 'ADS SKYBOARD EXEC', x: -9_100, z: 6_300, altitude: 780, heading: -2.14 },
] as const;
export const regionBounds: ReadonlyArray<{ name: RegionName; minX: number; maxX: number; minZ: number; maxZ: number }> = [
  // These areas drive exploration credits and sightseeing contracts.  They
  // intentionally exclude DFW's spawn corridor; an airport takeoff is not a
  // discovery of an unrelated fictional biome.
  { name: place.downtown, minX: -3_500, maxX: 1_800, minZ: -3_100, maxZ: 2_500 },
  { name: place.lasColinas, minX: -17_000, maxX: -10_000, minZ: -12_000, maxZ: -5_000 },
  { name: 'WHITE ROCK LAKE', minX: 3_000, maxX: 8_500, minZ: -11_500, maxZ: -5_000 },
  { name: 'TRINITY CORRIDOR', minX: -6_000, maxX: 1_500, minZ: 0, maxZ: 4_500 },
  { name: place.executive, minX: -9_500, maxX: -4_000, minZ: 7_000, maxZ: 13_500 },
];

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rawHeight(x: number, z: number): number {
  const normalizedX = THREE.MathUtils.clamp((x - dallasElevation.bounds.minX) / (dallasElevation.bounds.maxX - dallasElevation.bounds.minX), 0, 1) * (dallasElevation.width - 1);
  const normalizedZ = THREE.MathUtils.clamp((z - dallasElevation.bounds.minZ) / (dallasElevation.bounds.maxZ - dallasElevation.bounds.minZ), 0, 1) * (dallasElevation.height - 1);
  const x0 = Math.floor(normalizedX);
  const z0 = Math.floor(normalizedZ);
  const x1 = Math.min(dallasElevation.width - 1, x0 + 1);
  const z1 = Math.min(dallasElevation.height - 1, z0 + 1);
  const blendX = normalizedX - x0;
  const blendZ = normalizedZ - z0;
  const sample = (sampleX: number, sampleZ: number): number => dallasElevation.baseElevation + elevationSamples[sampleZ * dallasElevation.width + sampleX] * dallasElevation.scale;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(sample(x0, z0), sample(x1, z0), blendX),
    THREE.MathUtils.lerp(sample(x0, z1), sample(x1, z1), blendX),
    blendZ,
  );
}

const airportRunwayElevations = new Map(airports.map((airport) => [airport.id, rawHeight(airport.x, airport.z)]));

function airportFlattening(x: number, z: number, airport: AirportDefinition): number {
  const dx = x - airport.x;
  const dz = z - airport.z;
  const c = Math.cos(airport.heading);
  const s = Math.sin(airport.heading);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  const beyondX = Math.max(0, Math.abs(localX) - airportSafetyWidth[airport.id]);
  const beyondZ = Math.max(0, Math.abs(localZ) - airport.runwayLength / 2 - 300);
  return 1 - smoothstep(0, 500, Math.hypot(beyondX, beyondZ));
}

export function getTerrainHeight(x: number, z: number): number {
  const raw = rawHeight(x, z);
  let flatten = 0;
  for (const airport of airports) flatten = Math.max(flatten, airportFlattening(x, z, airport));
  const nearestAirportElevation = airports.reduce((elevation, airport) => {
    const influence = airportFlattening(x, z, airport);
    return influence > flatten - 0.0001 ? airportRunwayElevations.get(airport.id)! : elevation;
  }, raw);
  return raw * (1 - flatten) + nearestAirportElevation * flatten;
}

const adPosition = (x: number, z: number, height: number): { x: number; y: number; z: number } => ({
  x,
  y: getTerrainHeight(x, z) + height,
  z,
});
const adRotation = (y: number): { x: number; y: number; z: number } => ({ x: 0, y, z: 0 });
const terminalWallSign = (airportId: AirportId, lateral: number, height: number, longitudinal = 0): { x: number; y: number; z: number } => {
  const airport = airports.find((candidate) => candidate.id === airportId)!;
  const wall = localPosition(airport, lateral, longitudinal);
  return { x: wall.x - 0.16, y: wall.y + height, z: wall.z };
};
const airportRoofSign = (airportId: AirportId, lateral: number, longitudinal: number, roofHeight: number, signHeight: number) => {
  const airport = airports.find((candidate) => candidate.id === airportId)!;
  const roof = localPosition(airport, lateral, longitudinal);
  const supportBaseY = roof.y + roofHeight;
  return { position: { x: roof.x, y: supportBaseY + signHeight * 0.5 + 3, z: roof.z }, supportBaseY };
};
const approachSign = (airportId: AirportId, lateral: number, longitudinal: number, height: number) => {
  const airport = airports.find((candidate) => candidate.id === airportId)!;
  const location = localPosition(airport, lateral, longitudinal);
  return adPosition(location.x, location.z, height);
};
const airportGroundAd = (airportId: AirportId, lateral: number, longitudinal: number) => {
  const airport = airports.find((candidate) => candidate.id === airportId)!;
  const location = localPosition(airport, lateral, longitudinal);
  return adPosition(location.x, location.z, 0);
};
const groundAdRotation = { x: -Math.PI / 2, y: 0, z: 0 };
const highwayAdSize = { x: 68, y: 21, z: 1 };
const skyboardSize = { x: 380, y: 115, z: 0.4 };
const skyGateSize = { x: 230, y: 150, z: 1 };
const sponsorBlimpSize = { x: 310, y: 88, z: 82 };
// Endpoints are measured OSM wall edges, not bounding-box approximations.
// The normal is chosen away from the footprint center so the impression
// facing test and the visible creative agree on angled buildings.
function heroWall(
  center: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
  baseY: number,
  height: number,
  widthCoverage = 0.82,
  heightCoverage = 0.76,
) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  const midpointX = (start[0] + end[0]) * 0.5;
  const midpointZ = (start[1] + end[1]) * 0.5;
  let normalX = -dz / length;
  let normalZ = dx / length;
  if ((midpointX - center[0]) * normalX + (midpointZ - center[1]) * normalZ < 0) {
    normalX = -normalX;
    normalZ = -normalZ;
  }
  return {
    position: { x: midpointX + normalX * 0.18, y: baseY + height * 0.5, z: midpointZ + normalZ * 0.18 },
    rotation: adRotation(Math.atan2(normalX, normalZ)),
    size: { x: length * widthCoverage, y: height * heightCoverage, z: 0.4 },
  };
}

// Dallas OSM near-chunk building footprints and the authored airport boxes were
// checked against these mounts. Facade/screen Y values are absolute world Y,
// not terrain-relative "height above ground" (which floated the old screens).
export const adPlacements: ReadonlyArray<AdPlacement> = ([
  { id: 'dallas-dfw-north-arrival', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-20_950, -11_130, 31), rotation: adRotation(Math.PI), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-dfw-west-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-24_830, -13_160, 31), rotation: adRotation(Math.PI / 2), size: highwayAdSize, campaignId: 'airport-chaos' },
  // DFW's separate glass strip sits in front of the terminal box; mount on
  // that outward face or the upper creative is hidden behind the glass mesh.
  { id: 'dallas-dfw-terminal-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: terminalWallSign('dfw', 664, 23, 105), rotation: adRotation(-Math.PI / 2), size: { x: 130, y: 16, z: 0.5 }, campaignId: 'available-premium' },
  { id: 'dallas-dfw-airport-chaos-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: terminalWallSign('dfw', 664, 23, -495), rotation: adRotation(-Math.PI / 2), size: { x: 155, y: 19, z: 0.5 }, campaignId: 'airport-chaos' },
  { id: 'dallas-love-terminal-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: terminalWallSign('love', 132, 12), rotation: adRotation(-Math.PI / 2), size: { x: 78, y: 16, z: 0.5 }, campaignId: 'available-premium' },
  { id: 'dallas-addison-terminal-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: terminalWallSign('addison', 130, 8.5), rotation: adRotation(-Math.PI / 2), size: { x: 58, y: 12, z: 0.5 }, campaignId: 'vaden-software' },
  { id: 'dallas-executive-terminal-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: terminalWallSign('executive', 130, 8.5), rotation: adRotation(-Math.PI / 2), size: { x: 58, y: 12, z: 0.5 }, campaignId: 'airport-chaos' },
  { id: 'dallas-dfw-approach-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: approachSign('dfw', -1_720, 1_000, 29), rotation: adRotation(0), size: { x: 64, y: 20, z: 1 }, freestanding: true, campaignId: 'vaden-software' },
  { id: 'dallas-love-approach-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: approachSign('love', -285, 710, 26), rotation: adRotation(0), size: { x: 54, y: 17, z: 1 }, freestanding: true, campaignId: 'airport-chaos' },
  { id: 'dallas-addison-approach-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: approachSign('addison', -230, 520, 24), rotation: adRotation(0), size: { x: 48, y: 15, z: 1 }, freestanding: true, campaignId: 'available-premium' },
  { id: 'dallas-executive-approach-sign', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: approachSign('executive', -230, 390, 24), rotation: adRotation(0), size: { x: 48, y: 15, z: 1 }, freestanding: true, campaignId: 'available-premium' },
  { id: 'dallas-i35e-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-9_085, -6_980, 31), rotation: adRotation(0.6), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-us75-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(1_530, -6_420, 31), rotation: adRotation(-0.35), size: highwayAdSize, campaignId: 'vaden-software' },
  // Each hero campaign covers two adjoining measured OSM wall edges. The
  // previous axis-aligned bounding-box planes floated off angled facades.
  { id: 'dallas-downtown-plaza-wrap-south', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-454, -414], [-498, -424], [-419, -444], 130.6, 136, 0.84, 0.76), streamedMount: true, campaignId: 'airport-chaos' },
  { id: 'dallas-downtown-plaza-wrap-west', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-454, -414], [-487, -384], [-498, -424], 130.6, 136, 0.82, 0.76), streamedMount: true, campaignId: 'vaden-software' },
  { id: 'dallas-downtown-tower-wrap-south', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-452, -508], [-487, -529], [-432, -543], 132.1, 270, 0.84, 0.78), streamedMount: true, campaignId: 'available-premium' },
  { id: 'dallas-downtown-tower-wrap-west', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-452, -508], [-473, -474], [-487, -529], 132.1, 270, 0.84, 0.78), streamedMount: true, campaignId: 'available-premium' },
  { id: 'dallas-downtown-rooftop', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -454, y: 283, z: -414 }, rotation: adRotation(0.5), size: { x: 72, y: 22, z: 0.4 }, supportBaseY: 266.6, streamedMount: true, campaignId: 'available-standard' },
  { id: 'dallas-airport-chaos-rooftop', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: adPosition(-420, 20, 344), rotation: adRotation(0.4), size: { x: 80, y: 22, z: 0.4 }, supportBaseY: getTerrainHeight(-420, 20) + 330, campaignId: 'airport-chaos' },
  { id: 'dallas-metro-arena-facade', cityId: 'dallas', type: 'AIRPORT_SPONSOR', position: adPosition(dallasLocations.metroArena.x + 221, dallasLocations.metroArena.z, 36), rotation: adRotation(Math.PI / 2), size: { x: 100, y: 25, z: 0.5 }, campaignId: 'available-premium' },
  { id: 'dallas-las-colinas-wrap-north', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-13_353, -9_491], [-13_380, -9_475], [-13_330, -9_470], 130.9, 58.8, 0.84, 0.76), streamedMount: true, campaignId: 'available-premium' },
  { id: 'dallas-las-colinas-wrap-east', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-13_353, -9_491], [-13_322, -9_477], [-13_320, -9_502], 130.9, 58.8, 0.82, 0.76), streamedMount: true, campaignId: 'available-premium' },
  { id: 'dallas-las-colinas-rooftop', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -14_243, y: 161.6, z: -9_844 }, rotation: adRotation(-0.75), size: { x: 44, y: 15, z: 0.4 }, supportBaseY: 147.8, streamedMount: true, campaignId: 'airport-chaos' },
  { id: 'dallas-dfw-hangar-rooftop', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', ...airportRoofSign('dfw', 1_250, 1_120, 25.08, 23), rotation: adRotation(0), size: { x: 78, y: 23, z: 0.4 }, campaignId: 'vaden-software' },
  { id: 'dallas-love-hangar-rooftop', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', ...airportRoofSign('love', 46 * 5.4, 245, 22.06, 18), rotation: adRotation(0), size: { x: 60, y: 18, z: 0.4 }, campaignId: 'airport-chaos' },
  { id: 'dallas-addison-hangar-rooftop', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', ...airportRoofSign('addison', 38 * 5.4, 150, 18.06, 14), rotation: adRotation(0), size: { x: 46, y: 14, z: 0.4 }, campaignId: 'vaden-software' },
  { id: 'dallas-i35e-commercial-roof', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -9_358, y: 159, z: -6_889 }, rotation: adRotation(0), size: { x: 90, y: 24, z: 0.4 }, supportBaseY: 144, streamedMount: true, campaignId: 'available-standard' },
  { id: 'dallas-addison-commercial-roof', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -6_451, y: 194.2, z: -19_231 }, rotation: adRotation(0), size: { x: 58, y: 17, z: 0.4 }, supportBaseY: 182.7, streamedMount: true, campaignId: 'airport-chaos' },
  { id: 'dallas-trinity-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-3_080, 1_610, 31), rotation: adRotation(-0.6), size: highwayAdSize, campaignId: 'vaden-software' },
  { id: 'dallas-las-interchange', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-11_200, -8_210, 31), rotation: adRotation(0.3), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-addison-commercial-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-7_000, -19_430, 31), rotation: adRotation(0), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-east-i30-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(2_460, 1_660, 31), rotation: adRotation(Math.PI), size: highwayAdSize, campaignId: 'airport-chaos' },
  // Four authored airport grass corridors are outside runway, taxiway and
  // apron widths. The three park sites were checked against OSM park polygons,
  // water, buildings and road geometry; terrain is sampled by the renderer.
  { id: 'dallas-dfw-grass-brand', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('dfw', -520, 500), rotation: groundAdRotation, size: { x: 250, y: 400, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-love-grass-brand', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('love', -180, 250), rotation: groundAdRotation, size: { x: 220, y: 300, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-addison-grass-brand', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('addison', -155, 100), rotation: groundAdRotation, size: { x: 190, y: 260, z: 0 }, campaignId: 'vaden-software' },
  { id: 'dallas-executive-grass-brand', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('executive', -145, -80), rotation: groundAdRotation, size: { x: 185, y: 240, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-las-park-brand', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-13_245, -10_695, 0), rotation: groundAdRotation, size: { x: 120, y: 90, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-las-open-green-brand', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-11_760, -9_640, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-executive-open-green-brand', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-5_372, 10_187, 0), rotation: groundAdRotation, size: { x: 140, y: 100, z: 0 }, campaignId: 'airport-chaos' },
  // Second airport grass strips stay on the non-terminal side, outside each
  // authored runway/taxi box. Their longitudinal offsets separate campaigns.
  { id: 'dallas-dfw-west-grass', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('dfw', -1_250, -500), rotation: groundAdRotation, size: { x: 230, y: 320, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-love-west-grass', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('love', -410, -400), rotation: groundAdRotation, size: { x: 210, y: 260, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-addison-west-grass', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('addison', -330, -400), rotation: groundAdRotation, size: { x: 180, y: 230, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-executive-west-grass', cityId: 'dallas', type: 'AIRPORT_GROUND_SPONSOR', position: airportGroundAd('executive', -320, 350), rotation: groundAdRotation, size: { x: 175, y: 210, z: 0 }, campaignId: 'available-premium' },
  // Open-space footprints were checked against Dallas park polygons, nearby
  // building footprints, water and road segments before placing these panels.
  { id: 'dallas-las-south-park', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-12_440, -10_480, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-downtown-south-green', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-1_560, -2_560, 0), rotation: groundAdRotation, size: { x: 160, y: 110, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-trinity-open-green', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-2_160, 480, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-i35e-open-green', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-8_520, -6_600, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-love-south-green', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-4_760, -9_200, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'available-premium' },
  { id: 'dallas-executive-south-green', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-5_340, 8_100, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'vaden-software' },
  { id: 'dallas-las-east-open-green', cityId: 'dallas', type: 'GROUND_SPONSOR', position: adPosition(-11_880, -10_080, 0), rotation: groundAdRotation, size: { x: 220, y: 160, z: 0 }, campaignId: 'airport-chaos' },
  // Compact commercial facades use actual OSM wall segments and roof bases.
  { id: 'dallas-i35e-commercial-wall', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-9_358, -6_889], [-9_416, -6_932], [-9_416, -6_846], 126, 18, 0.78, 0.74), streamedMount: true, campaignId: 'available-premium' },
  { id: 'dallas-addison-commercial-wall', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-6_451, -19_231], [-6_488, -19_252], [-6_488, -19_212], 168.7, 14, 0.78, 0.74), streamedMount: true, campaignId: 'available-premium' },
  { id: 'dallas-downtown-edge-wall', cityId: 'dallas', type: 'PREMIUM_BUILDING_WRAP', ...heroWall([-941.5, -457.5], [-976, -465], [-915, -480], 130.7, 25.9, 0.78, 0.74), streamedMount: true, campaignId: 'vaden-software' },
  // Flight-corridor sign sites are offset from major mapped roads and checked
  // against building and water footprints; no posts intersect the carriageway.
  { id: 'dallas-dfw-las-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-17_984, -11_282, 31), rotation: adRotation(-2.19), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-las-downtown-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-7_212, -4_848, 31), rotation: adRotation(-0.39), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-downtown-love-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-3_578, -3_184, 31), rotation: adRotation(-0.53), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-love-addison-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-4_138, -16_170, 31), rotation: adRotation(-2.72), size: highwayAdSize, campaignId: 'available-standard' },
  { id: 'dallas-addison-east-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-2_215, -17_643, 31), rotation: adRotation(-1.57), size: highwayAdSize, campaignId: 'airport-chaos' },
  { id: 'dallas-executive-north-corridor', cityId: 'dallas', type: 'HIGHWAY_BILLBOARD', position: adPosition(-6_655, 9_556, 31), rotation: adRotation(Math.PI), size: highwayAdSize, campaignId: 'vaden-software' },
  // These four roof levels and footprints come from the same OSM near chunks
  // used by the streamer. Supports terminate at each measured roof level.
  { id: 'dallas-love-commercial-roof', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -4_895, y: 183.2, z: -7_285.5 }, rotation: adRotation(0), size: { x: 90, y: 22, z: 0.4 }, supportBaseY: 169.2, streamedMount: true, campaignId: 'available-standard' },
  { id: 'dallas-executive-commercial-roof', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -6_200, y: 211.8, z: 10_607.5 }, rotation: adRotation(0), size: { x: 75, y: 20, z: 0.4 }, supportBaseY: 198.8, streamedMount: true, campaignId: 'available-standard' },
  { id: 'dallas-us75-commercial-roof', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: 1_793.5, y: 218.7, z: -6_462.5 }, rotation: adRotation(0), size: { x: 100, y: 24, z: 0.4 }, supportBaseY: 203.7, streamedMount: true, campaignId: 'airport-chaos' },
  { id: 'dallas-trinity-commercial-roof', cityId: 'dallas', type: 'ROOFTOP_BILLBOARD', position: { x: -2_333, y: 160.6, z: 912.5 }, rotation: adRotation(0), size: { x: 75, y: 20, z: 0.4 }, supportBaseY: 147.6, streamedMount: true, campaignId: 'vaden-software' },
  // The air routes and territory approaches below use the same Dallas anchors
  // as player activities. Sky panels sit to one side of runway centerlines;
  // no sky ad is added to the collision or network entity collections.
  { id: 'dallas-skyboard-dfw-west', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-24_650, -10_300, 850), rotation: adRotation(1.12), size: skyboardSize, campaignId: 'airport-chaos' },
  { id: 'dallas-skyboard-dfw-las', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-18_350, -11_300, 820), rotation: adRotation(1.15), size: skyboardSize, campaignId: 'airport-chaos' },
  { id: 'dallas-skyboard-las-north', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-14_100, -7_050, 980), rotation: adRotation(1.2), size: skyboardSize, campaignId: 'available-standard' },
  { id: 'dallas-skyboard-las-downtown', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-9_500, -6_850, 1_100), rotation: adRotation(1.0), size: skyboardSize, campaignId: 'vaden-software' },
  { id: 'dallas-skyboard-downtown-west', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-3_550, -2_550, 1_250), rotation: adRotation(0.95), size: skyboardSize, campaignId: 'available-premium' },
  { id: 'dallas-skyboard-downtown-love', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-2_800, -4_700, 860), rotation: adRotation(-2.45), size: skyboardSize, campaignId: 'airport-chaos' },
  { id: 'dallas-skyboard-love-north', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-6_200, -4_300, 760), rotation: adRotation(0.12), size: skyboardSize, campaignId: 'available-standard' },
  { id: 'dallas-skyboard-love-addison', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-3_950, -14_500, 1_040), rotation: adRotation(Math.PI), size: skyboardSize, campaignId: 'vaden-software' },
  { id: 'dallas-skyboard-addison-west', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-6_100, -18_100, 920), rotation: adRotation(-2.75), size: skyboardSize, campaignId: 'available-premium' },
  { id: 'dallas-skyboard-executive-north', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-8_000, 7_000, 800), rotation: adRotation(2.9), size: skyboardSize, campaignId: 'airport-chaos' },
  { id: 'dallas-skyboard-executive-trinity', cityId: 'dallas', type: 'SKYBOARD', position: adPosition(-4_700, 3_800, 1_060), rotation: adRotation(-0.58), size: skyboardSize, campaignId: 'available-premium' },
  { id: 'dallas-skygate-dfw-las', cityId: 'dallas', type: 'SKY_GATE', position: adPosition(-16_650, -9_350, 670), rotation: adRotation(1.18), size: skyGateSize, campaignId: 'available-premium' },
  { id: 'dallas-skygate-las-east', cityId: 'dallas', type: 'SKY_GATE', position: adPosition(-11_250, -10_200, 720), rotation: adRotation(1.05), size: skyGateSize, campaignId: 'vaden-software' },
  { id: 'dallas-skygate-downtown-west', cityId: 'dallas', type: 'SKY_GATE', position: adPosition(-2_450, -1_800, 720), rotation: adRotation(0.86), size: skyGateSize, campaignId: 'available-standard' },
  { id: 'dallas-skygate-love-side', cityId: 'dallas', type: 'SKY_GATE', position: adPosition(-3_350, -6_700, 640), rotation: adRotation(-2.5), size: skyGateSize, campaignId: 'airport-chaos' },
  { id: 'dallas-skygate-addison-west', cityId: 'dallas', type: 'SKY_GATE', position: adPosition(-5_650, -19_300, 740), rotation: adRotation(2.85), size: skyGateSize, campaignId: 'available-premium' },
  { id: 'dallas-skygate-executive-north', cityId: 'dallas', type: 'SKY_GATE', position: adPosition(-7_350, 8_300, 650), rotation: adRotation(-0.52), size: skyGateSize, campaignId: 'vaden-software' },
  // Two slow deterministic orbits: same UTC-derived position for every client,
  // no AI, transform stream, combat presence, or blimp-vs-aircraft collision.
  { id: 'dallas-blimp-las-downtown', cityId: 'dallas', type: 'SPONSOR_BLIMP', position: adPosition(-7_500, -5_850, 1_250), rotation: adRotation(0), size: sponsorBlimpSize, blimpOrbit: { radiusX: 850, radiusZ: 430, periodSeconds: 900 }, campaignId: 'available-premium' },
  { id: 'dallas-blimp-love-addison', cityId: 'dallas', type: 'SPONSOR_BLIMP', position: adPosition(-4_700, -15_600, 1_180), rotation: adRotation(0), size: sponsorBlimpSize, blimpOrbit: { radiusX: 470, radiusZ: 1_050, periodSeconds: 1_050, phase: 0.31 }, campaignId: 'airport-chaos' },
  { id: 'dallas-trainer-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 2.2, y: 0.58, z: 0.1 }, campaignId: 'airport-chaos', targetAircraftType: 'trainer' },
  { id: 'dallas-private-jet-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 2.2, y: 0.58, z: 0.1 }, campaignId: 'vaden-software', targetAircraftType: 'privateJet' },
  { id: 'dallas-cargo-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 2.2, y: 0.58, z: 0.1 }, campaignId: 'airport-chaos', targetAircraftType: 'cargo' },
  { id: 'dallas-fighter-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 2.2, y: 0.58, z: 0.1 }, campaignId: 'vaden-software', targetAircraftType: 'fighter' },
] satisfies AdPlacementSpec[]).map(resolveAdPlacement);

function makeTerrain(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, dallasElevation.width - 1, dallasElevation.height - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const terrainColor = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, getTerrainHeight(x, z));
    const variation = Math.sin(x * 0.0017 + z * 0.0009) * 0.024 + Math.cos(z * 0.0023) * 0.015;
    // Land-use polygons from the offline OSM dataset add the actual developed, airport,
    // park, industrial, and farm surfaces. This is only an unobtrusive base for gaps.
    terrainColor.setRGB(0.34 + variation, 0.5 + variation, 0.27 + variation * 0.75);
    colors.push(terrainColor.r, terrainColor.g, terrainColor.b);
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

const airportMaterials = {
  airportGround: new THREE.MeshStandardMaterial({ color: 0x718650, roughness: 1 }),
  runway: new THREE.MeshStandardMaterial({ color: 0x18252b, roughness: 0.92 }),
  taxiway: new THREE.MeshStandardMaterial({ color: 0x34454c, roughness: 0.94 }),
  apron: new THREE.MeshStandardMaterial({ color: 0x45565e, roughness: 0.9 }),
  terminal: new THREE.MeshStandardMaterial({ color: 0xb8b9ad, roughness: 0.5, metalness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x26758d, roughness: 0.17, metalness: 0.38 }),
  hangar: new THREE.MeshStandardMaterial({ color: 0x718186, roughness: 0.68, metalness: 0.18 }),
  marking: new THREE.MeshBasicMaterial({ color: 0xffffe2, depthWrite: false, toneMapped: false }),
  taxiLine: new THREE.MeshBasicMaterial({ color: 0xffc94d, depthWrite: false, toneMapped: false }),
};

function localPosition(airport: AirportDefinition, lateral: number, longitudinal: number): THREE.Vector3 {
  const cosine = Math.cos(airport.heading);
  const sine = Math.sin(airport.heading);
  return new THREE.Vector3(
    airport.x + lateral * cosine + longitudinal * sine,
    getTerrainHeight(airport.x, airport.z),
    airport.z - lateral * sine + longitudinal * cosine,
  );
}

function addAirportBox(
  scene: THREE.Scene,
  airport: AirportDefinition,
  lateral: number,
  longitudinal: number,
  width: number,
  height: number,
  length: number,
  material: THREE.Material,
  yOffset: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material);
  const position = localPosition(airport, lateral, longitudinal);
  mesh.position.set(position.x, position.y + yOffset + height * 0.5, position.z);
  mesh.rotation.y = airport.heading;
  scene.add(mesh);
  return mesh;
}

function addRunway(scene: THREE.Scene, airport: AirportDefinition, lateral: number, length = airport.runwayLength, width = airport.runwayWidth): void {
  addAirportBox(scene, airport, lateral, 0, width, 0.18, length, airportMaterials.runway, 0.03);
  for (let longitudinal = -length * 0.34; longitudinal <= length * 0.34; longitudinal += 120) {
    addAirportBox(scene, airport, lateral, longitudinal, 0.95, 0.025, 48, airportMaterials.marking, 0.215);
  }
  for (const edge of [-1, 1]) {
    addAirportBox(scene, airport, lateral + edge * (width / 2 - 1.25), 0, 0.4, 0.025, length * 0.94, airportMaterials.marking, 0.215);
  }
  const thresholdOffset = length * 0.42;
  for (const side of [-1, 1]) {
    addAirportBox(scene, airport, lateral, side * thresholdOffset, width * 0.78, 0.025, 2.8, airportMaterials.marking, 0.217);
    for (let stripe = -4; stripe <= 4; stripe += 1) {
      addAirportBox(scene, airport, lateral + stripe * (width * 0.07), side * (thresholdOffset - 22), width * 0.036, 0.025, 28, airportMaterials.marking, 0.217);
    }
  }
  // The matching edge/approach lights are batched by CityVisualLayer.
}

function addObstacle(obstacles: ObstacleBounds[], mesh: THREE.Mesh, baseY: number): void {
  const geometry = mesh.geometry as THREE.BoxGeometry;
  const parameters = geometry.parameters;
  obstacles.push({
    x: mesh.position.x,
    z: mesh.position.z,
    halfX: parameters.width / 2,
    halfZ: parameters.depth / 2,
    height: parameters.height,
    baseY,
    polygon: [],
  });
}

function addDfwCampus(scene: THREE.Scene, airport: AirportDefinition, obstacles: ObstacleBounds[]): void {
  const groundY = getTerrainHeight(airport.x, airport.z);
  addAirportBox(scene, airport, 0, 0, 3350, 0.02, 4900, airportMaterials.airportGround, 0.005);
  // The visual layout follows DFW's multiple parallel north/south runway corridors while the central runway remains the landing surface.
  for (const [index, lateral] of [-1040, -690, 0, 690, 1040].entries()) {
    addRunway(scene, airport, lateral, index === 2 ? airport.runwayLength : 3850, index === 2 ? airport.runwayWidth : 54);
  }
  for (const lateral of [-860, -350, 350, 860]) addAirportBox(scene, airport, lateral, 0, 25, 0.09, 4050, airportMaterials.taxiway, 0.025);
  const apron = addAirportBox(scene, airport, 420, 0, 560, 0.12, 2700, airportMaterials.apron, 0.02);
  const terminal = addAirportBox(scene, airport, 760, 0, 155, 30, 1650, airportMaterials.terminal, 0.06);
  addAirportBox(scene, airport, 670, 0, 12, 18, 1520, airportMaterials.glass, 14);
  for (const longitudinal of [-570, -190, 190, 570]) {
    addAirportBox(scene, airport, 510, longitudinal, 410, 0.11, 72, airportMaterials.taxiway, 0.09);
    addAirportBox(scene, airport, 495, longitudinal, 270, 15, 54, airportMaterials.glass, 0.1);
  }
  for (const longitudinal of [-1120, 1120]) {
    const hangar = addAirportBox(scene, airport, 1250, longitudinal, 220, 25, 150, airportMaterials.hangar, 0.08);
    addObstacle(obstacles, hangar, groundY);
  }
  const tower = addAirportBox(scene, airport, 1120, 180, 32, 58, 32, airportMaterials.glass, 0.08);
  for (const longitudinal of [-1260, -840, -420, 420, 840, 1260]) {
    addAirportBox(scene, airport, 1020, longitudinal, 160, 0.08, 36, airportMaterials.apron, 0.09);
  }
  for (const lateral of [-1450, 1450]) {
    addAirportBox(scene, airport, lateral, 0, 16, 0.07, 4500, airportMaterials.taxiway, 0.04);
  }
  for (const longitudinal of [-570, -190, 190, 570]) {
    const position = localPosition(airport, 495, longitudinal);
    addSceneryAsset(scene, 'airportTerminal', {
      position: { x: position.x, y: groundY + 0.1, z: position.z },
      rotationY: airport.heading,
      size: { x: 250, y: 32, z: 62 },
      maxDistance: 9000,
    });
  }
  for (const longitudinal of [-1120, 1120]) {
    const position = localPosition(airport, 1250, longitudinal);
    addSceneryAsset(scene, 'airportHangar', {
      position: { x: position.x, y: groundY + 0.1, z: position.z },
      rotationY: airport.heading,
      size: { x: 220, y: 25, z: 150 },
      maxDistance: 7000,
    });
  }
  const towerPosition = localPosition(airport, 1120, 180);
  addSceneryAsset(scene, 'airportTower', {
    position: { x: towerPosition.x, y: groundY + 0.1, z: towerPosition.z },
    rotationY: airport.heading,
    size: { x: 32, y: 58, z: 32 },
    maxDistance: 9000,
  });
  addObstacle(obstacles, terminal, groundY);
  addObstacle(obstacles, tower, groundY);
  void apron;
}

function addRegionalAirport(scene: THREE.Scene, airport: AirportDefinition, obstacles: ObstacleBounds[]): void {
  const groundY = getTerrainHeight(airport.x, airport.z);
  addRunway(scene, airport, 0);
  addAirportBox(scene, airport, airport.runwayWidth * 1.15, 0, 18, 0.09, airport.runwayLength * 0.7, airportMaterials.taxiway, 0.025);
  const apron = addAirportBox(scene, airport, airport.runwayWidth * 3.2, 0, airport.id === 'love' ? 230 : 130, 0.12, airport.id === 'love' ? 430 : 240, airportMaterials.taxiway, 0.02);
  const terminal = addAirportBox(scene, airport, airport.runwayWidth * 4.5, 0, airport.id === 'love' ? 150 : 82, airport.id === 'love' ? 23 : 16, airport.id === 'love' ? 270 : 130, airportMaterials.terminal, 0.06);
  addAirportBox(scene, airport, airport.runwayWidth * 4.1, 0, 10, airport.id === 'love' ? 14 : 10, airport.id === 'love' ? 245 : 108, airportMaterials.glass, 0.1);
  const hangar = addAirportBox(scene, airport, airport.runwayWidth * 5.4, airport.id === 'love' ? 245 : 150, airport.id === 'love' ? 135 : 82, airport.id === 'love' ? 22 : 18, airport.id === 'love' ? 110 : 78, airportMaterials.hangar, 0.06);
  const tower = addAirportBox(scene, airport, airport.runwayWidth * 4.0, airport.id === 'love' ? -250 : -155, 18, airport.id === 'love' ? 42 : 28, 18, airportMaterials.glass, 0.06);
  addObstacle(obstacles, terminal, groundY);
  addObstacle(obstacles, hangar, groundY);
  addObstacle(obstacles, tower, groundY);
  void apron;
}

function addAirport(scene: THREE.Scene, airport: AirportDefinition, obstacles: ObstacleBounds[]): void {
  if (airport.id === 'dfw') addDfwCampus(scene, airport, obstacles);
  else addRegionalAirport(scene, airport, obstacles);
}

const landmarkMaterials = {
  glassDark: new THREE.MeshStandardMaterial({ color: 0x174d63, roughness: 0.17, metalness: 0.46 }),
  glassBlue: new THREE.MeshStandardMaterial({ color: 0x3396b5, roughness: 0.15, metalness: 0.38 }),
  glassGreen: new THREE.MeshStandardMaterial({ color: 0x327e77, roughness: 0.2, metalness: 0.36 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xc0b7a9, roughness: 0.68, metalness: 0.06 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x778589, roughness: 0.4, metalness: 0.38 }),
  reunion: new THREE.MeshStandardMaterial({ color: 0xa7dae0, roughness: 0.24, metalness: 0.44 }),
  river: new THREE.MeshStandardMaterial({ color: 0x075e96, emissive: 0x032b48, emissiveIntensity: 0.24, roughness: 0.22, metalness: 0.22, transparent: true, opacity: 0.96 }),
  windows: new THREE.MeshBasicMaterial({ color: 0xb7d9d5, toneMapped: false }),
};
const waterTimeUniform = { value: 0 };
function enhanceWaterMaterial(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.visualWaterTime = waterTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVisualWaterWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVisualWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVisualWaterWorld;\nuniform float visualWaterTime;')
      .replace('#include <output_fragment>', 'float visualFresnel = pow(1.0 - abs(dot(normalize(vViewPosition), normalize(normal))), 2.0);\nfloat visualRipple = sin(vVisualWaterWorld.x * 0.018 + vVisualWaterWorld.z * 0.014 + visualWaterTime * 0.72) * 0.012;\noutgoingLight = outgoingLight * (1.0 + visualRipple) + vec3(0.045, 0.105, 0.16) * visualFresnel;\n#include <output_fragment>');
  };
  material.customProgramCacheKey = () => 'airport-chaos-water-v1';
  return material;
}

function addCityBox(
  scene: THREE.Scene,
  obstacles: ObstacleBounds[],
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  rotation = 0,
  collides = true,
  verticalOffset = 0,
): THREE.Mesh {
  const baseY = getTerrainHeight(x, z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, baseY + verticalOffset + height * 0.5, z);
  mesh.rotation.y = rotation;
  scene.add(mesh);
  if (collides) addObstacle(obstacles, mesh, baseY + verticalOffset);
  return mesh;
}

function addSteppedTower(scene: THREE.Scene, obstacles: ObstacleBounds[], x: number, z: number, width: number, depth: number, height: number, material: THREE.Material, rotation = 0): void {
  const podiumHeight = Math.min(28, height * 0.14);
  const shaftHeight = (height - podiumHeight) * 0.8;
  const crownHeight = height - podiumHeight - shaftHeight;
  addCityBox(scene, obstacles, x, z, width * 1.2, podiumHeight, depth * 1.2, landmarkMaterials.concrete, rotation);
  addCityBox(scene, obstacles, x, z, width, shaftHeight, depth, material, rotation, true, podiumHeight);
  addCityBox(scene, obstacles, x, z, width * 0.72, crownHeight, depth * 0.72, material, rotation, true, podiumHeight + shaftHeight);
}

const signaturePrism = new THREE.CylinderGeometry(1, 1, 1, 6);
const signatureTaper = new THREE.CylinderGeometry(0.58, 1, 1, 5);
const signatureNeedle = new THREE.CylinderGeometry(0.25, 0.45, 1, 6);
function addSignatureTower(scene: THREE.Scene, obstacles: ObstacleBounds[], x: number, z: number, width: number, depth: number, height: number, style: number): void {
  const material = [landmarkMaterials.glassDark, landmarkMaterials.glassBlue, landmarkMaterials.glassGreen, landmarkMaterials.steel][style % 4];
  const baseY = getTerrainHeight(x, z);
  const plinth = addCityBox(scene, obstacles, x, z, width * 1.08, 15, depth * 1.08, landmarkMaterials.concrete, style * 0.09);
  if (style % 4 === 0) {
    const shaft = new THREE.Mesh(signaturePrism, material);
    shaft.scale.set(width * 0.48, height - 30, depth * 0.48);
    shaft.position.set(x, baseY + 15 + (height - 30) * 0.5, z);
    shaft.rotation.y = Math.PI / 6;
    scene.add(shaft);
    addCityBox(scene, obstacles, x, z, width * 0.5, 15, depth * 0.5, landmarkMaterials.steel, 0, true, height - 15);
  } else if (style % 4 === 1) {
    addCityBox(scene, obstacles, x - width * 0.18, z, width * 0.47, height - 24, depth * 0.82, material, 0.07, true, 15);
    addCityBox(scene, obstacles, x + width * 0.19, z, width * 0.42, height - 45, depth * 0.78, material, -0.07, true, 15);
    addCityBox(scene, obstacles, x, z, width * 0.88, 9, depth * 0.72, landmarkMaterials.steel, 0, false, height - 60);
  } else if (style % 4 === 2) {
    addCityBox(scene, obstacles, x, z, width * 0.88, height * 0.72, depth * 0.88, material, style * 0.06, true, 15);
    const crown = new THREE.Mesh(signatureTaper, material);
    crown.scale.set(width * 0.43, height * 0.28, depth * 0.43);
    crown.position.set(x, baseY + height * 0.86, z);
    crown.rotation.y = Math.PI / 5;
    scene.add(crown);
  } else {
    addCityBox(scene, obstacles, x, z, width * 0.94, height * 0.57, depth * 0.92, material, style * 0.05, true, 15);
    addCityBox(scene, obstacles, x + width * 0.14, z - depth * 0.08, width * 0.58, height * 0.3, depth * 0.68, material, style * 0.05, true, height * 0.57 + 15);
    const needle = new THREE.Mesh(signatureNeedle, landmarkMaterials.steel);
    needle.scale.set(2.3, 27, 2.3);
    needle.position.set(x + width * 0.14, baseY + height + 16, z - depth * 0.08);
    scene.add(needle);
  }
  // One simple collision envelope covers faceted/tapered shapes without tiny
  // collider fragments. The plinth already retains a ground obstruction.
  obstacles.push({ x, z, halfX: width * 0.5, halfZ: depth * 0.5, height, baseY, polygon: [] });
  void plinth;
}

function addReunionTower(scene: THREE.Scene, obstacles: ObstacleBounds[]): void {
  // Reunion Tower's real downtown location, represented with original primitive geometry.
  const x = -1120;
  const z = 130;
  const baseY = getTerrainHeight(x, z);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 134, 10), landmarkMaterials.steel);
  shaft.position.set(x, baseY + 67, z);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(25, 18, 12), landmarkMaterials.reunion);
  globe.position.set(x, baseY + 145, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(25.5, 1.3, 6, 24), landmarkMaterials.steel);
  ring.position.copy(globe.position);
  ring.rotation.x = Math.PI / 2;
  scene.add(shaft, globe, ring);
  obstacles.push({ x, z, halfX: 28, halfZ: 28, height: 171, baseY, polygon: [] });
}

function addDallasSkyline(scene: THREE.Scene, obstacles: ObstacleBounds[]): void {
  addReunionTower(scene, obstacles);
  // Tallest and faceted landmark masses sit at their real downtown coordinates, using non-trademarked proportions.
  addSteppedTower(scene, obstacles, -330, -360, 58, 72, 282, landmarkMaterials.glassDark, 0.05);
  const facetedBaseY = getTerrainHeight(-780, -230);
  const faceted = new THREE.Mesh(new THREE.CylinderGeometry(32, 47, 224, 4), landmarkMaterials.glassBlue);
  faceted.position.set(-780, facetedBaseY + 112, -230);
  faceted.rotation.y = Math.PI / 4;
  scene.add(faceted);
  obstacles.push({ x: -780, z: -230, halfX: 50, halfZ: 50, height: 224, baseY: facetedBaseY, polygon: [] });
  addSteppedTower(scene, obstacles, -600, -610, 54, 52, 205, landmarkMaterials.glassBlue, -0.15);
  addSteppedTower(scene, obstacles, -170, -700, 48, 58, 186, landmarkMaterials.glassDark, 0.18);
  addSteppedTower(scene, obstacles, -1050, -580, 52, 48, 164, landmarkMaterials.steel, -0.1);
  addSteppedTower(scene, obstacles, -1230, -370, 44, 50, 150, landmarkMaterials.glassBlue, 0.22);
  // Eight different crown/shaft combinations replace the old repetitive box
  // cores at the same city anchors. They are original silhouettes, not copies.
  const signatures: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [-420, 20, 48, 66, 330], [-650, 50, 40, 45, 275], [-900, 120, 45, 48, 300],
    [-250, 150, 38, 42, 235], [-1340, 10, 42, 46, 260], [-940, -790, 44, 50, 310],
    [-420, -980, 52, 48, 285], [-1280, -760, 46, 44, 245],
  ];
  signatures.forEach(([x, z, width, depth, height], index) => addSignatureTower(scene, obstacles, x, z, width, depth, height, index));

  // Las Colinas/Irving's lower but visible business cluster anchors the DFW-to-downtown route.
  const lasColinas: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [dallasLocations.lasColinas.x, dallasLocations.lasColinas.z, 68, 62, 138], [-13270, -9180, 55, 48, 112], [-13740, -8990, 52, 48, 94],
    [-13080, -9570, 46, 48, 82], [-14000, -9560, 48, 44, 78],
  ];
  lasColinas.forEach(([x, z, width, depth, height], index) => addSteppedTower(scene, obstacles, x, z, width, depth, height, index % 2 ? landmarkMaterials.glassGreen : landmarkMaterials.glassBlue, 0.12));
}

function addTrinityRiver(scene: THREE.Scene, waterBounds: WaterBounds[]): void {
  // Simplified ribbon follows the Trinity corridor from Irving through downtown toward southeast Dallas.
  const points: ReadonlyArray<readonly [number, number]> = [
    [-7800, -3100], [-6200, -2050], [-4700, -940], [-3300, -210], [-2380, 720], [-1640, 1660], [-620, 2600], [640, 3650], [1900, 4980], [3600, 6800],
  ];
  const positions: number[] = [];
  const shore: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, z1] = points[index];
    const [x2, z2] = points[index + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const width = 62 + index * 4;
    const offsetX = -dz / length * width * 0.5;
    const offsetZ = dx / length * width * 0.5;
    const y1 = getTerrainHeight(x1, z1) + 0.17;
    const y2 = getTerrainHeight(x2, z2) + 0.17;
    positions.push(
      x1 + offsetX, y1, z1 + offsetZ, x2 + offsetX, y2, z2 + offsetZ, x1 - offsetX, y1, z1 - offsetZ,
      x1 - offsetX, y1, z1 - offsetZ, x2 + offsetX, y2, z2 + offsetZ, x2 - offsetX, y2, z2 - offsetZ,
    );
    for (const sign of [-1, 1]) {
      const innerX1 = x1 + offsetX * sign;
      const innerZ1 = z1 + offsetZ * sign;
      const innerX2 = x2 + offsetX * sign;
      const innerZ2 = z2 + offsetZ * sign;
      const outerScale = 1.085;
      shore.push(
        innerX1, y1 + 0.04, innerZ1, innerX2, y2 + 0.04, innerZ2, x1 + offsetX * sign * outerScale, y1 + 0.06, z1 + offsetZ * sign * outerScale,
        x1 + offsetX * sign * outerScale, y1 + 0.06, z1 + offsetZ * sign * outerScale, innerX2, y2 + 0.04, innerZ2, x2 + offsetX * sign * outerScale, y2 + 0.06, z2 + offsetZ * sign * outerScale,
      );
    }
    waterBounds.push({
      minX: Math.min(x1, x2) - width * 0.5,
      maxX: Math.max(x1, x2) + width * 0.5,
      minZ: Math.min(z1, z2) - width * 0.5,
      maxZ: Math.max(z1, z2) + width * 0.5,
      surfaceY: (y1 + y2) * 0.5,
      polygon: [[x1 + offsetX, z1 + offsetZ], [x2 + offsetX, z2 + offsetZ], [x2 - offsetX, z2 - offsetZ], [x1 - offsetX, z1 - offsetZ]],
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const shoreGeometry = new THREE.BufferGeometry();
  shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shore, 3));
  shoreGeometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, landmarkMaterials.river));
  scene.add(new THREE.Mesh(shoreGeometry, new THREE.MeshBasicMaterial({ color: 0x6da1a2, transparent: true, opacity: 0.54, depthWrite: false, side: THREE.DoubleSide })));
}

const cityVisualConfig: CityVisualConfig = {
  airports: airports.map((airport) => ({
    x: airport.x, z: airport.z, heading: airport.heading, runwayWidth: airport.runwayWidth,
    runwayLength: airport.runwayLength, apronLateral: airport.id === 'dfw' ? 1020 : airport.runwayWidth * 3.2,
    runwayLaterals: airport.id === 'dfw' ? [-1040, -690, 0, 690, 1040] : [0],
  })),
  // Measured major-road segments from the existing Dallas map; these are
  // visual light tracks only and never become networked traffic entities.
  trafficRoutes: [
    { start: [-21_465, -6_664], end: [-19_994, -6_663] },
    { start: [-19_607, -6_664], end: [-18_440, -6_666] },
    { start: [-18_339, -10_950], end: [-17_691, -11_870] },
    { start: [-8_279, -5_575], end: [-7_517, -4_975] },
    { start: [-1_851, -4_968], end: [-1_729, -6_134] },
    { start: [-6_163, 1_059], end: [-7_145, 1_025] },
  ],
  rooftopSites: [
    { x: -420, z: 20, height: 330, width: 48, depth: 66 },
    { x: -650, z: 50, height: 266, width: 40, depth: 45 },
    { x: -1340, z: 10, height: 260, width: 42, depth: 46 },
    { x: -940, z: -790, height: 301, width: 44, depth: 50 },
    { x: -13_500, z: -9350, height: 138, width: 68, depth: 62 },
    { x: -13_270, z: -9180, height: 112, width: 55, depth: 48 },
  ],
  arena: { ...dallasLocations.metroArena, radiusX: 220, radiusZ: 164 },
  orientationSites: [
    { x: 4_350, z: -11_200, kind: 'waterTower' },
    { x: -10_600, z: -2_450, kind: 'crane' },
    { x: -6_450, z: -19_350, kind: 'antenna' },
  ],
};

export function createWorld(scene: THREE.Scene, depthOffsetDirection = -1): { obstacleBounds: ObstacleBounds[]; mountainBounds: MountainBounds[]; waterBounds: WaterBounds[] } {
  const obstacleBounds: ObstacleBounds[] = [];
  const mountainBounds: MountainBounds[] = [];
  const waterBounds: WaterBounds[] = [];
  const dusk = timeOfDay === 'dusk';
  airportMaterials.glass.emissive.setHex(dusk ? 0x9c6135 : 0x000000);
  airportMaterials.glass.emissiveIntensity = dusk ? 0.38 : 0;
  for (const glass of [landmarkMaterials.glassDark, landmarkMaterials.glassBlue, landmarkMaterials.glassGreen]) {
    glass.emissive.setHex(dusk ? 0x315063 : 0x000000);
    glass.emissiveIntensity = dusk ? 0.2 : 0;
  }
  landmarkMaterials.river.color.setHex(dusk ? 0x173c6a : 0x075e96);
  enhanceWaterMaterial(landmarkMaterials.river);
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(120_000, 120_000), new THREE.MeshStandardMaterial({ color: dusk ? 0x3d5147 : 0x4c7847, roughness: 1, depthWrite: false }));
  horizonMaterial = horizon.material as THREE.MeshStandardMaterial;
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = dallasElevation.baseElevation - 8;
  horizon.renderOrder = -3;
  scene.add(horizon, makeTerrain());

  for (const airport of airports) addAirport(scene, airport, obstacleBounds);
  addDallasSkyline(scene, obstacleBounds);
  addDowntownDistrict(scene, obstacleBounds, airports, getTerrainHeight);
  addTrinityRiver(scene, waterBounds);
  cityVisualLayer?.dispose();
  cityVisualLayer = new CityVisualLayer(scene, cityVisualConfig, getTerrainHeight, visualQuality, timeOfDay === 'dusk');
  const arena = cityVisualConfig.arena!;
  obstacleBounds.push({ x: arena.x, z: arena.z, halfX: arena.radiusX, halfZ: arena.radiusZ, height: 76, baseY: getTerrainHeight(arena.x, arena.z), polygon: [] });
  if (visualQuality === 'high') for (const site of cityVisualConfig.orientationSites ?? []) {
    obstacleBounds.push({ x: site.x, z: site.z, halfX: site.kind === 'crane' ? 70 : 20, halfZ: 20, height: 92, baseY: getTerrainHeight(site.x, site.z), polygon: [] });
  }
  dallasStreamer?.dispose();
  dallasStreamer = new DallasChunkStreamer(scene, {
    // The runtime chunks are already LOD-specific and collision grids are
    // static gameplay data. Avoid building throwaway duplicate arrays while
    // parsing a streamed render chunk.
    collectCollisionData: false,
    isBuildingExcluded: inDallasCore,
    roadMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection }),
    buildingMaterials: [
      new THREE.MeshStandardMaterial({ color: dusk ? 0xa79488 : 0xd0b69a, roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: dusk ? 0x829ba4 : 0xa7bbc0, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: dusk ? 0x8f9394 : 0xb8b6ae, roughness: 0.6, metalness: 0.07 }),
      new THREE.MeshStandardMaterial({ color: dusk ? 0x2e6681 : 0x3589aa, roughness: 0.22, metalness: 0.3, emissive: dusk ? 0x102b3c : 0x000000, emissiveIntensity: dusk ? 0.18 : 0 }),
      new THREE.MeshStandardMaterial({ color: dusk ? 0x7c8178 : 0x8b998c, roughness: 0.8, metalness: 0.1 }),
    ],
    waterMaterial: enhanceWaterMaterial(new THREE.MeshStandardMaterial({ color: dusk ? 0x173e6f : 0x075f99, emissive: dusk ? 0x241f40 : 0x043950, emissiveIntensity: dusk ? 0.2 : 0.24, roughness: 0.2, metalness: 0.24 })),
    landMaterials: [
      new THREE.MeshStandardMaterial({ color: 0x3d8a51, roughness: 1 }), // parks/open green
      new THREE.MeshStandardMaterial({ color: 0x256a48, roughness: 1 }), // woodland
      new THREE.MeshStandardMaterial({ color: 0x4a565a, roughness: 0.94 }), // industrial
      new THREE.MeshStandardMaterial({ color: 0x82916e, roughness: 1 }), // warmer, greener suburbs
      new THREE.MeshStandardMaterial({ color: 0x917760, roughness: 0.94 }), // tan commercial
      new THREE.MeshStandardMaterial({ color: 0xaa8f50, roughness: 1 }), // farmland
      new THREE.MeshStandardMaterial({ color: 0x708653, roughness: 1 }), // airport/open transport
      new THREE.MeshStandardMaterial({ color: 0x3c5059, roughness: 0.94 }), // apron
    ],
    aerowayMaterials: [airportMaterials.runway, airportMaterials.taxiway],
    majorHighwayWidth: 38,
    highwayAccentMaterial: new THREE.MeshBasicMaterial({ color: 0xffe3a0, depthWrite: false, toneMapped: false }),
    heightAt: getTerrainHeight,
    isExcluded: (x, z, padding) => airports.some((airport) => Math.abs(x - airport.x) < airportSafetyWidth[airport.id] + padding && Math.abs(z - airport.z) < airport.runwayLength / 2 + 500 + padding)
      || (Math.abs(x - arena.x) < arena.radiusX + 35 + padding && Math.abs(z - arena.z) < arena.radiusZ + 35 + padding),
  });
  return { obstacleBounds, mountainBounds, waterBounds };
}

export function updateWorldStreaming(position: THREE.Vector3, velocity?: THREE.Vector3): void { dallasStreamer?.update(position, velocity); }
export function updateWorldVisuals(delta: number): void {
  waterTimeUniform.value += delta;
  cityVisualLayer?.update(delta);
}
export function hasWorldBuildingDetailAt(x: number, z: number): boolean { return dallasStreamer?.hasNearDetailAt(x, z) ?? false; }
export function getWorldStreamingStats(): import('./dallas-streamer').DallasStreamingStats | undefined { return dallasStreamer?.getStats(); }
export function getWorldStreamingVisualDebug(position: THREE.Vector3, camera: THREE.Camera): import('./dallas-streamer').DallasChunkVisualDebug[] | undefined {
  return dallasStreamer?.getVisualDebug(position, camera);
}
export function disposeWorldStreaming(): void { dallasStreamer?.dispose(); dallasStreamer = undefined; }

export type { ImportedRoadSegment };
