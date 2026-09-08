import * as THREE from 'three';
import dallasElevationJson from './data/dallas-elevation.json';
import dallasSourceJson from './data/dallas-source.json';
import { addSceneryAsset } from './assets';
import type { AdPlacement } from './ad-placement';
import type { AmbientTrafficConfig } from './ambient-traffic';
import type { SkyChallengeDefinition } from './sky-challenges';
import type { StuntZone } from './stunt-combo';
import type { DiscoveryDefinition } from './discoveries';
import { DallasChunkStreamer } from './dallas-streamer';
import type { ImportedObstacle, ImportedRoadSegment, ImportedWater } from './osm-city';
import type { WorldMapLayer } from './world-map';

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
  { id: 'dfw', name: 'DFW International', x: -22_800, z: -13_600, heading: 0, runwayWidth: 60, runwayLength: 4100, spawnOffset: 1300, accentColor: 0x31566b },
  { id: 'love', name: 'Dallas Love Field', x: -5_140, z: -7_780, heading: 0, runwayWidth: 46, runwayLength: 2700, spawnOffset: 820, accentColor: 0x5a6f86 },
  { id: 'addison', name: 'Addison Airport', x: -3_700, z: -21_100, heading: 0, runwayWidth: 38, runwayLength: 2200, spawnOffset: 670, accentColor: 0x617a87 },
  { id: 'executive', name: 'Dallas Executive', x: -6_700, z: 10_600, heading: 0, runwayWidth: 38, runwayLength: 1800, spawnOffset: 540, accentColor: 0x718064 },
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
} as const;
export const stuntZones: ReadonlyArray<StuntZone> = [
  { id: 'trinity-crossing', kind: 'bridge', ...dallasLocations.trinity, radius: 165, minAltitude: 16, maxAltitude: 92 },
  { id: 'downtown-dallas', kind: 'landmark', ...dallasLocations.downtown, radius: 900, minAltitude: 0, maxAltitude: 360 },
  { id: 'las-colinas', kind: 'landmark', ...dallasLocations.lasColinas, radius: 760, minAltitude: 0, maxAltitude: 300 },
];
export const discoveries: ReadonlyArray<DiscoveryDefinition> = [
  // Airport radii deliberately remain inside the associated spawn offset:
  // taking off cannot instantly discover the airport the player spawned at.
  { id: 'dfw-international', name: 'DFW International', type: 'airport', ...dallasLocations.dfw, radius: 700, minAltitude: 0, maxAltitude: 280, credits: 75, setId: 'airport-tour', setBonus: 300 },
  { id: 'love-field', name: 'Dallas Love Field', type: 'airport', ...dallasLocations.loveField, radius: 460, minAltitude: 0, maxAltitude: 240, credits: 100, setId: 'airport-tour', setBonus: 300 },
  { id: 'addison-airport', name: 'Addison Airport', type: 'airport', ...dallasLocations.addison, radius: 380, minAltitude: 0, maxAltitude: 220, credits: 100, setId: 'airport-tour', setBonus: 300 },
  { id: 'dallas-executive', name: 'Dallas Executive', type: 'airstrip', ...dallasLocations.dallasExecutive, radius: 320, minAltitude: 0, maxAltitude: 210, credits: 125, setId: 'airport-tour', setBonus: 300 },
  { id: 'reunion-tower', name: 'Reunion Tower', type: 'downtown', ...dallasLocations.reunionTower, radius: 120, minAltitude: 110, maxAltitude: 300, credits: 125, setId: 'downtown-icons', setBonus: 275 },
  { id: 'downtown-plaza', name: 'Downtown Plaza', type: 'landmark', ...dallasLocations.downtownPlaza, radius: 130, minAltitude: 130, maxAltitude: 400, credits: 100, setId: 'downtown-icons', setBonus: 275 },
  { id: 'fountain-district', name: 'Fountain District', type: 'rooftop', ...dallasLocations.fountainDistrict, radius: 120, minAltitude: 110, maxAltitude: 340, credits: 125, setId: 'downtown-icons', setBonus: 275 },
  { id: 'las-colinas', name: 'Las Colinas', type: 'landmark', ...dallasLocations.lasColinas, radius: 340, minAltitude: 80, maxAltitude: 360, credits: 100 },
  { id: 'white-rock-lake', name: 'White Rock Lake', type: 'water', ...dallasLocations.whiteRock, radius: 560, minAltitude: 20, maxAltitude: 350, credits: 100 },
  { id: 'trinity-corridor', name: 'Trinity River Corridor', type: 'water', ...dallasLocations.trinityNorth, radius: 320, minAltitude: 20, maxAltitude: 260, credits: 100 },
  { id: 'trinity-crossing', name: 'Trinity Crossing', type: 'bridge', ...dallasLocations.trinity, radius: 130, minAltitude: 18, maxAltitude: 105, credits: 150 },
  { id: 'i35e-overlook', name: 'I-35E Overlook', type: 'bridge', ...dallasLocations.i35eCrossing, radius: 220, minAltitude: 35, maxAltitude: 210, credits: 125 },
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
    { x: -19_000, z: -5_000, altitude: 1_350, width: 1_500, depth: 850 },
    { x: -13_000, z: -2_500, altitude: 2_100, width: 1_900, depth: 980 },
    { x: -8_000, z: -13_000, altitude: 1_820, width: 1_350, depth: 760 },
    { x: -2_000, z: -3_000, altitude: 2_120, width: 1_750, depth: 920 },
    { x: 5_000, z: -7_000, altitude: 1_980, width: 1_500, depth: 820 },
    { x: 11_500, z: 2_500, altitude: 3_100, width: 2_100, depth: 1_100 },
    { x: 17_000, z: -9_500, altitude: 1_900, width: 1_450, depth: 800 },
    { x: -18_000, z: 10_000, altitude: 2_060, width: 1_700, depth: 920 },
    { x: 2_000, z: 9_500, altitude: 1_420, width: 1_650, depth: 880 },
    { x: -8_500, z: 14_000, altitude: 2_750, width: 2_000, depth: 1_040 },
    { x: 14_000, z: 12_000, altitude: 1_650, width: 1_550, depth: 820 },
    { x: -23_000, z: -15_000, altitude: 2_600, width: 1_800, depth: 960 },
  ],
  atmosphereZones: [
    { id: 'white-rock-storm', type: 'storm', x: 6_400, z: -8_900, radius: 1_050, altitude: 2_200, strength: 0.42, active: true },
    { id: 'trinity-thermal', type: 'thermal', x: -2_400, z: 1_100, radius: 720, altitude: 0, strength: 0.18, active: true },
    { id: 'dfw-west-wind', type: 'wind', x: -20_400, z: -12_300, radius: 1_600, altitude: 0, strength: 0.12, active: true },
  ],
};

// Optional, local-only flight activities. Every point is in the same Dallas
// meter-space as airports, landmarks, radar, and the world map.
export const skyChallenges: ReadonlyArray<SkyChallengeDefinition> = [
  {
    id: 'dfw-speed', name: 'DFW OPEN CORRIDOR', type: 'speed', reward: 180, timeLimit: 62,
    gates: [
      { x: -20_400, z: -10_100, altitude: 380, radius: 82 },
      { x: -16_600, z: -8_900, altitude: 510, radius: 82 },
      { x: -12_900, z: -7_400, altitude: 540, radius: 82 },
      { x: -9_400, z: -5_800, altitude: 500, radius: 82 },
    ],
  },
  {
    id: 'downtown-precision', name: 'DOWNTOWN PRECISION', type: 'precision', reward: 280, timeLimit: 72,
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
    id: 'addison-climb', name: 'ADDISON DEPARTURE CLIMB', type: 'climb', reward: 280, timeLimit: 66,
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
    id: 'las-colinas-flyby', name: 'LAS COLINAS FLYBY', type: 'flyby', reward: 230, timeLimit: 64,
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
    { id: 'downtown', label: 'DOWNTOWN', ...dallasLocations.downtown },
    { id: 'las-colinas', label: 'LAS COLINAS', ...dallasLocations.lasColinas },
    { id: 'white-rock', label: 'WHITE ROCK LAKE', ...dallasLocations.whiteRock },
    { id: 'trinity', label: 'TRINITY CORRIDOR', ...dallasLocations.trinity },
  ],
};
export const visualQaPresets = [
  { id: 'DFW_RUNWAY', label: 'DFW RUNWAY', x: centralAirport.x, z: centralAirport.z + centralAirport.spawnOffset, altitude: 0, heading: centralAirport.heading, onGround: true },
  { id: 'DFW_500M', label: 'DFW 500M', x: centralAirport.x - 260, z: centralAirport.z, altitude: 500, heading: -Math.PI / 2 },
  { id: 'DOWNTOWN_300M', label: 'DOWNTOWN 300M', x: dallasLocations.downtown.x + 520, z: dallasLocations.downtown.z + 420, altitude: 300, heading: 0.89 },
  { id: 'DOWNTOWN_800M', label: 'DOWNTOWN 800M', x: dallasLocations.downtown.x + 700, z: dallasLocations.downtown.z + 560, altitude: 800, heading: 0.89 },
  { id: 'DALLAS_1500M', label: 'DALLAS 1500M', x: dallasLocations.lasColinas.x + 1800, z: dallasLocations.lasColinas.z + 1200, altitude: 1500, heading: 0.98 },
  { id: 'WHITE_ROCK_500M', label: 'WHITE ROCK 500M', x: dallasLocations.whiteRock.x - 350, z: dallasLocations.whiteRock.z + 300, altitude: 500, heading: -0.86 },
  { id: 'TRINITY_500M', label: 'TRINITY 500M', x: dallasLocations.trinity.x - 350, z: dallasLocations.trinity.z + 480, altitude: 500, heading: -0.63 },
  { id: 'LAS_COLINAS_500M', label: 'LAS COLINAS 500M', x: dallasLocations.lasColinas.x + 360, z: dallasLocations.lasColinas.z + 420, altitude: 500, heading: 0.71 },
] as const;
export const regionBounds: ReadonlyArray<{ name: RegionName; minX: number; maxX: number; minZ: number; maxZ: number }> = [
  // These areas drive exploration credits and sightseeing contracts.  They
  // intentionally exclude DFW's spawn corridor; an airport takeoff is not a
  // discovery of an unrelated fictional biome.
  { name: 'DOWNTOWN / UPTOWN', minX: -3_500, maxX: 1_800, minZ: -3_100, maxZ: 2_500 },
  { name: 'LAS COLINAS / IRVING', minX: -17_000, maxX: -10_000, minZ: -12_000, maxZ: -5_000 },
  { name: 'WHITE ROCK LAKE', minX: 3_000, maxX: 8_500, minZ: -11_500, maxZ: -5_000 },
  { name: 'TRINITY CORRIDOR', minX: -6_000, maxX: 1_500, minZ: 0, maxZ: 4_500 },
  { name: 'SOUTH DALLAS / EXECUTIVE', minX: -9_500, maxX: -4_000, minZ: 7_000, maxZ: 13_500 },
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
const advertiseHere = { reference: 'builtin:advertise-here', headline: 'ADVERTISE HERE', subline: 'Premium Dallas airspace', background: '#173348' };
const poweredByVaden = { reference: 'builtin:powered-by-vaden', headline: 'POWERED BY', subline: 'Vaden Software', background: '#123a42' };
const activeCampaignWindow = { startAt: '2025-01-01T00:00:00.000Z', endAt: '2035-12-31T23:59:59.000Z', enabled: true };

// Static, city-scoped inventory. Positions are derived from existing airport and landmark
// coordinates, keeping signage outside active runways and clear of landmark footprints.
export const adPlacements: ReadonlyArray<AdPlacement> = [
  { id: 'dallas-dfw-north-arrival', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(-20_950, -11_050, 20), rotation: adRotation(Math.PI), size: { x: 34, y: 12, z: 1 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-dfw-west-corridor', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(-24_750, -13_200, 20), rotation: adRotation(Math.PI / 2), size: { x: 34, y: 12, z: 1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-dfw-terminal-sign', cityId: 'dallas', type: 'AIRPORT_SIGN', position: adPosition(-20_900, -15_800, 13), rotation: adRotation(Math.PI), size: { x: 48, y: 10, z: 0.5 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-i35e-corridor', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(-9_100, -7_000, 19), rotation: adRotation(0.6), size: { x: 32, y: 11, z: 1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-i30-corridor', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(2_300, -1_600, 18), rotation: adRotation(-1.05), size: { x: 32, y: 11, z: 1 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-us75-corridor', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(1_450, -6_300, 19), rotation: adRotation(-0.35), size: { x: 32, y: 11, z: 1 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-downtown-plaza-screen', cityId: 'dallas', type: 'BUILDING_SCREEN', position: adPosition(-330, -318, 136), rotation: adRotation(0.05), size: { x: 74, y: 32, z: 0.4 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-downtown-faceted-screen', cityId: 'dallas', type: 'BUILDING_SCREEN', position: adPosition(-742, -195, 112), rotation: adRotation(Math.PI / 4), size: { x: 62, y: 27, z: 0.4 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-reunion-screen', cityId: 'dallas', type: 'BUILDING_SCREEN', position: adPosition(-1_092, 130, 109), rotation: adRotation(Math.PI / 2), size: { x: 52, y: 23, z: 0.4 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-las-colinas-east', cityId: 'dallas', type: 'BUILDING_SCREEN', position: adPosition(-13_462, -9_315, 72), rotation: adRotation(0.12), size: { x: 54, y: 23, z: 0.4 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-las-colinas-west', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(-14_250, -9_900, 19), rotation: adRotation(-0.75), size: { x: 32, y: 11, z: 1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-white-rock-recreation', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(4_730, -8_000, 18), rotation: adRotation(0.8), size: { x: 30, y: 10, z: 1 }, creative: advertiseHere, sponsorName: 'Available', ...activeCampaignWindow },
  { id: 'dallas-trinity-premium', cityId: 'dallas', type: 'BILLBOARD', position: adPosition(-3_050, 1_500, 19), rotation: adRotation(-0.6), size: { x: 32, y: 11, z: 1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-executive-premium', cityId: 'dallas', type: 'AIRPORT_SIGN', position: adPosition(-6_050, 9_450, 12), rotation: adRotation(Math.PI), size: { x: 42, y: 9, z: 0.5 }, creative: poweredByVaden, sponsorName: 'Vaden Software', ...activeCampaignWindow },
  { id: 'dallas-trainer-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 4.6, y: 0.9, z: 0.1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', targetAircraftType: 'trainer', ...activeCampaignWindow },
  { id: 'dallas-private-jet-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 5.8, y: 0.9, z: 0.1 }, creative: advertiseHere, sponsorName: 'Available', targetAircraftType: 'privateJet', ...activeCampaignWindow },
  { id: 'dallas-cargo-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 6.2, y: 1.2, z: 0.1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', targetAircraftType: 'cargo', ...activeCampaignWindow },
  { id: 'dallas-fighter-livery', cityId: 'dallas', type: 'AIRCRAFT_LIVERY', position: adPosition(centralAirport.x - 1_900, centralAirport.z, 4), rotation: adRotation(0), size: { x: 5, y: 0.8, z: 0.1 }, creative: poweredByVaden, sponsorName: 'Vaden Software', targetAircraftType: 'fighter', ...activeCampaignWindow },
];

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
    terrainColor.setRGB(0.36 + variation, 0.45 + variation, 0.30 + variation);
    colors.push(terrainColor.r, terrainColor.g, terrainColor.b);
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

const airportMaterials = {
  airportGround: new THREE.MeshStandardMaterial({ color: 0x667651, roughness: 1 }),
  runway: new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: 0.92 }),
  taxiway: new THREE.MeshStandardMaterial({ color: 0x3d484d, roughness: 0.94 }),
  apron: new THREE.MeshStandardMaterial({ color: 0x4d585d, roughness: 0.9 }),
  terminal: new THREE.MeshStandardMaterial({ color: 0xaab5b4, roughness: 0.52, metalness: 0.18 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x286378, roughness: 0.18, metalness: 0.34 }),
  hangar: new THREE.MeshStandardMaterial({ color: 0x687476, roughness: 0.7, metalness: 0.16 }),
  marking: new THREE.MeshBasicMaterial({ color: 0xfff4d1, depthWrite: false, toneMapped: false }),
  taxiLine: new THREE.MeshBasicMaterial({ color: 0xf1bd3e, depthWrite: false, toneMapped: false }),
  light: new THREE.MeshBasicMaterial({ color: 0xffd881, depthWrite: false, toneMapped: false }),
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
  // Sparse inset edge lights read at approach altitude without adding a shadowed
  // object field or affecting the already validated runway surface.
  for (let longitudinal = -length * 0.46; longitudinal <= length * 0.46; longitudinal += 180) {
    for (const edge of [-1, 1]) {
      addAirportBox(scene, airport, lateral + edge * (width / 2 + 1.1), longitudinal, 0.7, 0.18, 0.7, airportMaterials.light, 0.24);
    }
  }
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
  glassDark: new THREE.MeshStandardMaterial({ color: 0x173f50, roughness: 0.18, metalness: 0.44 }),
  glassBlue: new THREE.MeshStandardMaterial({ color: 0x3e91aa, roughness: 0.16, metalness: 0.36 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xb0ada4, roughness: 0.7, metalness: 0.06 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x778589, roughness: 0.4, metalness: 0.38 }),
  reunion: new THREE.MeshStandardMaterial({ color: 0xa7dae0, roughness: 0.24, metalness: 0.44 }),
  river: new THREE.MeshStandardMaterial({ color: 0x176f91, emissive: 0x052433, emissiveIntensity: 0.22, roughness: 0.2, metalness: 0.18, transparent: true, opacity: 0.94 }),
};

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
  const core: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [-420, 20, 48, 66, 126, 0.08], [-650, 50, 40, 45, 118, -0.1], [-900, 120, 45, 48, 105, 0.12],
    [-250, 150, 38, 42, 98, 0.2], [-1340, 10, 42, 46, 96, -0.14], [-940, -790, 44, 50, 112, 0.08],
    [-420, -980, 52, 48, 108, -0.18], [-170, -1030, 38, 42, 94, 0.1], [-1280, -760, 46, 44, 102, 0.18],
  ];
  for (const [x, z, width, depth, height, rotation] of core) addSteppedTower(scene, obstacles, x, z, width, depth, height, landmarkMaterials.concrete, rotation);

  // Las Colinas/Irving's lower but visible business cluster anchors the DFW-to-downtown route.
  const lasColinas: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [dallasLocations.lasColinas.x, dallasLocations.lasColinas.z, 68, 62, 138], [-13270, -9180, 55, 48, 112], [-13740, -8990, 52, 48, 94],
    [-13080, -9570, 46, 48, 82], [-14000, -9560, 48, 44, 78],
  ];
  for (const [x, z, width, depth, height] of lasColinas) addSteppedTower(scene, obstacles, x, z, width, depth, height, landmarkMaterials.glassBlue, 0.12);
}

function addTrinityRiver(scene: THREE.Scene, waterBounds: WaterBounds[]): void {
  // Simplified ribbon follows the Trinity corridor from Irving through downtown toward southeast Dallas.
  const points: ReadonlyArray<readonly [number, number]> = [
    [-7800, -3100], [-6200, -2050], [-4700, -940], [-3300, -210], [-2380, 720], [-1640, 1660], [-620, 2600], [640, 3650], [1900, 4980], [3600, 6800],
  ];
  const positions: number[] = [];
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
  scene.add(new THREE.Mesh(geometry, landmarkMaterials.river));
}

export function createWorld(scene: THREE.Scene, depthOffsetDirection = -1): { obstacleBounds: ObstacleBounds[]; mountainBounds: MountainBounds[]; waterBounds: WaterBounds[] } {
  const obstacleBounds: ObstacleBounds[] = [];
  const mountainBounds: MountainBounds[] = [];
  const waterBounds: WaterBounds[] = [];
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(120_000, 120_000), new THREE.MeshStandardMaterial({ color: 0x506c45, roughness: 1, depthWrite: false }));
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = dallasElevation.baseElevation - 8;
  horizon.renderOrder = -3;
  scene.add(horizon, makeTerrain());

  for (const airport of airports) addAirport(scene, airport, obstacleBounds);
  addDallasSkyline(scene, obstacleBounds);
  addTrinityRiver(scene, waterBounds);
  dallasStreamer?.dispose();
  dallasStreamer = new DallasChunkStreamer(scene, {
    roadMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: depthOffsetDirection, polygonOffsetUnits: depthOffsetDirection }),
    buildingMaterials: [
      new THREE.MeshStandardMaterial({ color: 0xc0b5a7, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xa6afb0, roughness: 0.74 }),
      new THREE.MeshStandardMaterial({ color: 0xaab0ad, roughness: 0.62, metalness: 0.06 }),
      new THREE.MeshStandardMaterial({ color: 0x4f8fa4, roughness: 0.24, metalness: 0.26 }),
      new THREE.MeshStandardMaterial({ color: 0x8c918d, roughness: 0.82, metalness: 0.1 }),
    ],
    waterMaterial: new THREE.MeshStandardMaterial({ color: 0x126f98, emissive: 0x05263a, emissiveIntensity: 0.2, roughness: 0.17, metalness: 0.24 }),
    landMaterials: [
      new THREE.MeshStandardMaterial({ color: 0x4d7d4e, roughness: 1 }), // parks/open green
      new THREE.MeshStandardMaterial({ color: 0x2f613e, roughness: 1 }), // woodland
      new THREE.MeshStandardMaterial({ color: 0x536367, roughness: 0.94 }), // industrial
      new THREE.MeshStandardMaterial({ color: 0x737968, roughness: 1 }), // residential
      new THREE.MeshStandardMaterial({ color: 0x746d64, roughness: 0.96 }), // commercial
      new THREE.MeshStandardMaterial({ color: 0x9e8a55, roughness: 1 }), // farmland
      new THREE.MeshStandardMaterial({ color: 0x637452, roughness: 1 }), // airport/open transport
      new THREE.MeshStandardMaterial({ color: 0x48545a, roughness: 0.94 }), // apron
    ],
    aerowayMaterials: [airportMaterials.runway, airportMaterials.taxiway],
    majorHighwayWidth: 38,
    highwayAccentMaterial: new THREE.MeshBasicMaterial({ color: 0xf1e0a4, depthWrite: false, toneMapped: false }),
    heightAt: getTerrainHeight,
    isExcluded: (x, z, padding) => airports.some((airport) => Math.abs(x - airport.x) < airportSafetyWidth[airport.id] + padding && Math.abs(z - airport.z) < airport.runwayLength / 2 + 500 + padding),
  });
  return { obstacleBounds, mountainBounds, waterBounds };
}

export function updateWorldStreaming(position: THREE.Vector3): void { dallasStreamer?.update(position); }
export function getWorldStreamingStats(): import('./dallas-streamer').DallasStreamingStats | undefined { return dallasStreamer?.getStats(); }
export function disposeWorldStreaming(): void { dallasStreamer?.dispose(); dallasStreamer = undefined; }

export type { ImportedRoadSegment };
