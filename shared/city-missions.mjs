// Data only: the mission engine is city-neutral. Saved IDs use stable city,
// airport, territory, challenge and event identifiers, never display names.
import { dallasDisplayNames as name } from './dallas-display-names.mjs';

const mission = (number, id, type, displayName, description, difficulty, credits, score, requirements, cooldownMinutes) => Object.freeze({
  id, cityId: 'dallas', number, type, displayName, description, difficulty,
  creditReward: credits, scoreReward: score, requirements: Object.freeze(requirements),
  replayCooldownMs: cooldownMinutes * 60_000,
});

export const cityMissionCatalog = Object.freeze({
  dallas: Object.freeze([
    mission(1, 'first-flight', 'airborneHold', 'FIRST FLIGHT', `Take off from ${name.dfw} and fly for 1 minute.`, 'EASY', 15, 25, { airportId: 'dfw', durationSeconds: 60 }, 10),
    mission(2, 'first-landing', 'destinationLanding', 'FIRST LANDING', `Take off, then land at ${name.love}.`, 'EASY', 40, 50, { airportId: 'love' }, 10),
    mission(3, 'straight-run', 'straightDistance', 'STRAIGHT RUN', 'Fly 8 km without landing, crashing, or turning sharply.', 'EASY', 60, 75, { meters: 8_000, maxHeadingErrorRadians: 0.17 }, 10),
    mission(4, 'stunt-training', 'stuntPair', 'STUNT TRAINING', 'Do one Barrel Roll and one Quick Dodge in the same flight.', 'EASY', 75, 100, { maneuvers: ['barrelRoll', 'quickDodge'] }, 10),
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
    mission(15, 'ace-intercept', 'event', 'ACE INTERCEPT', 'Destroy the marked Ace before time runs out.', 'HARD', 900, 1_200, { eventType: 'aceIntercept', result: 'aceDestroyed' }, 5),
    mission(16, 'vip-escort', 'event', 'VIP ESCORT', 'Protect the VIP plane until it reaches its destination.', 'HARD', 1_000, 1_250, { eventType: 'vipEscort', result: 'completed' }, 5),
    mission(17, 'golden-sky-run', 'event', 'GOLDEN SKY RUN', 'Fly every gold gate in order before time runs out.', 'HARD', 750, 1_000, { eventType: 'goldenSkyRun', result: 'completed' }, 5),
    mission(18, 'most-wanted', 'wantedSurvival', 'MOST WANTED', 'Reach Danger 5, become Most Wanted, and survive the full timer.', 'VERY HARD', 1_750, 2_500, { heatLevel: 5 }, 5),
    mission(19, 'precision-landing', 'precisionLanding', 'PRECISION LANDING', 'Land smoothly at the marked airport.', 'HARD', 500, 750, { airportId: 'love', minimumScore: 780 }, 5),
    mission(20, 'three-territory-offensive', 'territoryHold', 'THREE-TERRITORY OFFENSIVE', 'Own South Metro, Canal District, and Central District together for 10 minutes.', 'EXTREME', 3_500, 4_500, { requiredTerritoryIds: ['dallas-executive', 'las-colinas', 'downtown'], holdDurationSeconds: 600 }, 1),
    mission(21, 'central-air-supremacy', 'territoryUniqueKills', 'CENTRAL AIR SUPREMACY', 'Control Central District and destroy 3 different hostile pilots.', 'EXTREME', 3_000, 4_000, { territoryIds: ['downtown'], uniqueKills: 3 }, 1),
    mission(22, 'core-dallas-takeover', 'territoryHold', 'CORE DALLAS TAKEOVER', 'Hold Metroplex, Metro Central, Canal, and Central together for 15 minutes.', 'EXTREME', 5_000, 6_500, { territoryIds: ['dfw', 'love-field', 'las-colinas', 'downtown'], durationSeconds: 900 }, 1),
    mission(23, 'airport-empire', 'airportEmpire', 'AIRPORT EMPIRE', 'Control all four airports while landing at each one.', 'EXTREME', 6_000, 7_500, { territoryIds: ['dfw', 'love-field', 'addison', 'dallas-executive'], airportIds: ['dfw', 'love', 'addison', 'executive'] }, 1),
    mission(24, 'dallas-conquest', 'territoryOwn', 'DALLAS CONQUEST', 'Control every Dallas territory at once.', 'EXTREME', 10_000, 12_500, { allCityTerritories: true }, 1),
    mission(25, 'number-one-pilot', 'liveScoreRank', '#1 PILOT', 'Reach #1 on the live Dallas Score leaderboard.', 'EXTREME', 15_000, 20_000, { rank: 1 }, 1),
  ]),
  milwaukee: Object.freeze([]),
});

export function missionsForCity(cityId) { return cityMissionCatalog[cityId] ?? []; }
export function missionForCity(cityId, missionId) { return missionsForCity(cityId).find((item) => item.id === missionId); }
