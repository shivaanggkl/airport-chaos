// Data only: the mission engine is city-neutral. Saved IDs use stable city,
// airport, territory, challenge and event identifiers, never display names.
import { dallasDisplayNames as name } from './dallas-display-names.mjs';
import { cityRegistry } from './city-registry.mjs';
import { territoriesForCity } from './city-territories.mjs';

const dallasTerritories = territoriesForCity('dallas');
const dallasTerritoryStep = (id, label) => {
  const territory = dallasTerritories.find((item) => item.id === id);
  if (!territory) throw new Error(`Missing Dallas Grand Tour territory: ${id}`);
  return Object.freeze({ id, kind: 'area', label, x: territory.center.x, z: territory.center.z, bounds: territory.bounds });
};
const dallasHalfWorld = cityRegistry.dallas.worldSize / 2;
const dallasEdge = dallasHalfWorld - 2_000;
const dallasGrandTourSteps = Object.freeze([
  dallasTerritoryStep('downtown', 'DOWNTOWN DALLAS'),
  dallasTerritoryStep('love-field', `${name.love} AREA`),
  dallasTerritoryStep('las-colinas', name.lasColinas),
  dallasTerritoryStep('dallas-executive', `${name.executive} AREA`),
  Object.freeze({ id: 'northwest-edge', kind: 'checkpoint', label: 'NORTHWEST EDGE', x: -dallasEdge, z: -dallasEdge, radius: 1_800 }),
  Object.freeze({ id: 'northeast-edge', kind: 'checkpoint', label: 'NORTHEAST EDGE', x: dallasEdge, z: -dallasEdge, radius: 1_800 }),
  Object.freeze({ id: 'southeast-edge', kind: 'checkpoint', label: 'SOUTHEAST EDGE', x: dallasEdge, z: dallasEdge, radius: 1_800 }),
  Object.freeze({ id: 'southwest-edge', kind: 'checkpoint', label: 'SOUTHWEST EDGE', x: -dallasEdge, z: dallasEdge, radius: 1_800 }),
  Object.freeze({ id: 'high-altitude', kind: 'altitude', label: 'HIGH ALTITUDE', minimumAltitudeMeters: 18_288 }),
  Object.freeze({ id: 'low-flight', kind: 'lowDistance', label: 'LOW FLIGHT', maximumAltitudeMeters: 304.8, meters: 6_000 }),
  Object.freeze({ id: 'downtown-low-pass', kind: 'areaHold', label: 'DOWNTOWN LOW PASS', x: -600, z: -450,
    bounds: dallasTerritories.find((item) => item.id === 'downtown').bounds, maximumAltitudeMeters: 152.4, durationSeconds: 6 }),
]);

const mission = (number, id, type, displayName, description, difficulty, credits, score, requirements, cooldownMinutes, retired = false) => Object.freeze({
  id, cityId: 'dallas', number, type, displayName, description, difficulty,
  creditReward: credits, scoreReward: score, requirements: Object.freeze(requirements),
  replayCooldownMs: cooldownMinutes * 60_000, retired,
});

const cityMission = (cityId, number, id, type, displayName, description, difficulty, credits, score, requirements, cooldownMinutes, retired = false) => Object.freeze({
  id, cityId, number, type, displayName, description, difficulty,
  creditReward: credits, scoreReward: score, requirements: Object.freeze(requirements),
  replayCooldownMs: cooldownMinutes * 60_000, retired,
});

export const cityMissionCatalog = Object.freeze({
  dallas: Object.freeze([
    mission(1, 'first-flight', 'airborneHold', 'FIRST FLIGHT — DALLAS', 'Stay alive, connected, and airborne in Dallas for 60 seconds.', 'EASY', 15, 25, { durationSeconds: 60 }, 10),
    mission(2, 'first-landing', 'destinationLanding', 'FIRST LANDING', `Land safely at ${name.love}.`, 'EASY', 40, 50, { airportId: 'love' }, 10),
    mission(3, 'straight-run', 'straightDistance', 'STRAIGHT RUN — DALLAS', 'Fly 24 km without landing and stay roughly on the same heading.', 'EASY', 60, 75, { meters: 24_000, maxHeadingErrorRadians: 0.17 }, 10),
    mission(4, 'stunt-training', 'stuntPair', 'STUNT TRAINING', 'Do one Barrel Roll and one Quick Dodge in the same flight.', 'EASY', 75, 100, { maneuvers: ['barrelRoll', 'quickDodge'] }, 10, true),
    mission(5, 'airport-tour', 'airportLandings', 'AIRPORT TOUR', 'Land at all four Dallas airports, in any order.', 'MEDIUM', 350, 400, { airportIds: ['dfw', 'love', 'addison', 'executive'] }, 15),
    mission(6, 'speed-course', 'challenge', 'SPEED COURSE', 'Fly every cyan Speed Course gate in order before time runs out.', 'MEDIUM', 200, 300, { challengeId: 'dfw-speed', gateCount: 4 }, 15),
    mission(7, 'first-hunter', 'assignedHunter', 'FIRST HUNTER', 'Destroy your marked AI Hunter.', 'MEDIUM', 250, 350, { personality: 'hunter' }, 15),
    mission(8, 'human-rival', 'humanKill', 'HUMAN RIVAL', 'Destroy one real human pilot.', 'MEDIUM', 450, 600, { kills: 1 }, 15),
    mission(9, 'south-metro-capture', 'territoryHold', 'SOUTH METRO CAPTURE', `Capture ${name.executive} and hold it for 5 minutes.`, 'HARD', 400, 500, { territoryIds: ['dallas-executive'], durationSeconds: 300 }, 5),
    mission(10, 'canal-capture', 'territoryHold', 'CANAL DISTRICT CAPTURE', `Capture ${name.lasColinas} and hold it for 10 minutes.`, 'HARD', 700, 850, { territoryIds: ['las-colinas'], durationSeconds: 600 }, 5),
    mission(11, 'metro-central-capture', 'territoryHold', 'METRO CENTRAL CAPTURE', `Capture ${name.love} and hold it for 15 minutes.`, 'HARD', 1_100, 1_300, { territoryIds: ['love-field'], durationSeconds: 900 }, 5),
    mission(12, 'central-stronghold', 'territoryHold', 'CENTRAL DISTRICT STRONGHOLD', `Capture ${name.downtown} and hold it for 30 minutes.`, 'VERY HARD', 2_500, 3_000, { territoryIds: ['downtown'], durationSeconds: 1_800 }, 5),
    mission(13, 'two-zone-control', 'territoryHold', 'TWO-ZONE CONTROL', `Hold ${name.downtown} and ${name.lasColinas} together for 10 minutes.`, 'VERY HARD', 2_000, 2_500, { territoryIds: ['downtown', 'las-colinas'], durationSeconds: 600 }, 5),
    mission(14, 'airport-control', 'territoryOwn', 'AIRPORT CONTROL', 'Control all four airport territories at once.', 'VERY HARD', 2_750, 3_250, { territoryIds: ['dfw', 'love-field', 'addison', 'dallas-executive'] }, 5),
    mission(15, 'ace-intercept', 'event', 'ACE INTERCEPT', 'Destroy the marked 300-HP Ace. Final hit completes the mission.', 'HARD', 900, 1_200, { eventType: 'aceIntercept', result: 'aceDestroyed' }, 5),
    mission(16, 'vip-escort', 'event', 'VIP ESCORT', 'Protect the AI VIP and follow it through all 4 checkpoints.', 'HARD', 1_000, 1_250, { eventType: 'vipEscort', result: 'completed' }, 5),
    mission(17, 'golden-sky-run', 'event', 'GOLDEN SKY RUN', 'Fly through all 6 gold gates in order before time expires.', 'HARD', 750, 1_000, { eventType: 'goldenSkyRun', result: 'completed' }, 5),
    mission(18, 'most-wanted', 'wantedSurvival', 'MOST WANTED', 'Reach Danger 5, become Most Wanted, and survive until the event ends.', 'VERY HARD', 1_750, 2_500, { heatLevel: 5 }, 5),
    mission(19, 'precision-landing', 'precisionLanding', 'PRECISION LANDING', `Land at ${name.love} with 780+ quality: descend gently, align with the runway, keep wings and nose level, and control speed.`, 'HARD', 500, 750, { airportId: 'love', minimumScore: 780 }, 5),
    mission(20, 'three-territory-offensive', 'territoryHold', 'THREE-TERRITORY OFFENSIVE', 'Own South Metro, Canal District, and Central District together for 10 minutes.', 'EXTREME', 3_500, 4_500, { requiredTerritoryIds: ['dallas-executive', 'las-colinas', 'downtown'], holdDurationSeconds: 600 }, 1),
    mission(21, 'central-air-supremacy', 'territoryUniqueKills', 'CENTRAL AIR SUPREMACY', 'Control Central District and destroy 3 different enemy aircraft without losing the territory.', 'EXTREME', 3_000, 4_000, { territoryIds: ['downtown'], uniqueKills: 3 }, 1),
    mission(22, 'core-dallas-takeover', 'territoryHold', 'CORE DALLAS TAKEOVER', 'Hold Metroplex, Metro Central, Canal, and Central together for 15 minutes.', 'EXTREME', 5_000, 6_500, { territoryIds: ['dfw', 'love-field', 'las-colinas', 'downtown'], durationSeconds: 900 }, 1),
    mission(23, 'airport-empire', 'airportEmpire', 'AIRPORT EMPIRE', 'Control all four airports while landing at each one.', 'EXTREME', 6_000, 7_500, { territoryIds: ['dfw', 'love-field', 'addison', 'dallas-executive'], airportIds: ['dfw', 'love', 'addison', 'executive'] }, 1),
    mission(24, 'dallas-conquest', 'territoryOwn', 'DALLAS CONQUEST', 'Control every Dallas territory at once.', 'EXTREME', 10_000, 12_500, { allCityTerritories: true }, 1),
    mission(25, 'number-one-pilot', 'liveScoreRank', '#1 PILOT', 'Hold #1 on the live Dallas Score leaderboard continuously for 5 minutes with at least 2 total connected human pilots in Dallas.', 'EXTREME', 15_000, 20_000, { rank: 1, durationSeconds: 300, minimumHumanPlayers: 2 }, 1),
    mission(26, 'dallas-grand-tour', 'sequentialTour', 'DALLAS GRAND TOUR', 'Complete all 11 Dallas exploration and flight steps in order.', 'VERY HARD', 2_000, 2_500, { steps: dallasGrandTourSteps }, 30),
  ]),
  milwaukee: Object.freeze([
    cityMission('milwaukee', 1, 'first-flight', 'airborneHold', 'PRACTICE — FIRST FLIGHT', 'Stay alive, connected, and airborne in Milwaukee for 60 seconds. Practice task — no rewards.', 'PRACTICE', 0, 0, { durationSeconds: 60 }, 10),
    cityMission('milwaukee', 3, 'straight-run', 'straightDistance', 'PRACTICE — STRAIGHT RUN', 'Fly 24 km without landing and stay roughly on the same heading. Practice task — no rewards.', 'PRACTICE', 0, 0, { meters: 24_000, maxHeadingErrorRadians: 0.17 }, 10),
  ]),
});

export function missionsForCity(cityId) { return cityMissionCatalog[cityId] ?? []; }
export function missionForCity(cityId, missionId) { return missionsForCity(cityId).find((item) => item.id === missionId); }
