import { journeyDallasMostWantedSurvival01, journeyDallasCaptureThree01, journeyDallasTerritoryHold01, journeyTerritoryCaptureMission, journeyCaptureTerritoryId, journeyDallasAceIntercept01, journeyDallasTerritoryDefense01, journeyDallasTwinHunters01, journeyCatalog } from '../../shared/journey-mission.mjs';
import { journeyDallasCoinHunt01, journeyDallasSharpshooter01, journeyDallasSharpshooter02, journeyDallasSharpshooter03, journeyDallasSharpshooter04, journeyDallasSharpshooter05, journeyDallasCapture01, journeyDallas01, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas25, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';

export const captureMissionTerritoryName = 'LAS COLINAS';

export const territoryDefenseInstructions = [
  'Capture 1 TERRITORY',
  'Hold TERRITORY for 1 minute after capturing',
] as const;

export const territoryHoldInstructions = ['Defeat the territory owners', 'Capture all 3 TERRITORIES', 'Hold all 3 together for 30 seconds'] as const;

export const captureThreeInstructions = ['Capture 3 TERRITORIES'] as const;

export const captureMissionInstructions = [
  'Capture 1 TERRITORY before time ends',
] as const;

const missions = [journeyDallasMostWantedSurvival01,journeyDallasCaptureThree01, journeyDallasTerritoryHold01, journeyDallasAceIntercept01, journeyDallasTerritoryDefense01, journeyDallasTwinHunters01, journeyDallasCoinHunt01, journeyDallasSharpshooter01, journeyDallasSharpshooter02, journeyDallasSharpshooter03, journeyDallasSharpshooter04, journeyDallasSharpshooter05, journeyDallasCapture01, journeyDallas01, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06,
  journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18,
  journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12,
  journeyDallas25, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas19] as const;

// Copy follows the active win conditions in shared/journey-mission.mjs and the
// authoritative Journey attempt handlers. Mission titles, rewards, and clocks
// always come from the live definitions above.
const descriptions: Readonly<Record<(typeof missions)[number]['id'], string>> = {
  'journey-dallas-most-wanted-survival-01':'Stay alive for 2 minutes to win',
  'journey-dallas-territory-hold-01': territoryHoldInstructions.join('\n'),
  'journey-dallas-capture-three-01': captureThreeInstructions.join('\n'),
  'journey-dallas-ace-intercept-01': 'Take off from airport\nSHOOT down 1 PLANE before time ends',
  'journey-dallas-territory-defense-01': territoryDefenseInstructions.join('\n'),
  'journey-dallas-twin-hunters-01': 'Take off from airport\nSHOOT down 2 PLANES before time ends',
  'journey-dallas-coin-hunt-01': 'Collect as many COINS as possible before time ends',
  'journey-dallas-sharpshooter-05': journeyDallasSharpshooter05.objective,
  'journey-dallas-sharpshooter-04': journeyDallasSharpshooter04.objective,
  'journey-dallas-sharpshooter-03': journeyDallasSharpshooter03.objective,
  'journey-dallas-sharpshooter-02': journeyDallasSharpshooter02.objective,
  'journey-dallas-sharpshooter-01': journeyDallasSharpshooter01.objective,
  'journey-dallas-capture-01': captureMissionInstructions.join('\n'),
  'journey-dallas-01': 'Fly through 10 RINGS before time ends',
  'journey-dallas-03': 'Fly through 10 RINGS before time ends',
  'journey-dallas-04': 'Fly through 10 RINGS before time ends',
  'journey-dallas-05': 'Fly through 10 RINGS before time ends',
  'journey-dallas-06': 'Fly through 10 RINGS before time ends',
  'journey-dallas-07': 'Take off from airport\nSHOOT down 1 GIANT before time ends',
  'journey-dallas-08': 'Take off from airport\nSHOOT down 1 GIANT and 2 PLANES before time ends',
  'journey-dallas-09': 'Take off from airport\nSHOOT down 1 GIANT and 3 PLANES before time ends',
  'journey-dallas-10': 'Take off from airport\nSHOOT down 1 GIANT and 4 PLANES before time ends',
  'journey-dallas-11': 'Take off from airport\nDestroy 2 wings and 1 engine of GIANT before time ends',
  'journey-dallas-12': 'Take off from airport\nDestroy 2 wings and 1 engine of GIANT\nDestroy 2 PLANES before time ends',
  'journey-dallas-13': 'Take off from airport\nSHOOT down 1 PLANE before time ends',
  'journey-dallas-14': 'Take off from airport\nSHOOT down 1 PLANE before time ends',
  'journey-dallas-15': 'Take off from airport\nSHOOT down 1 PLANE before time ends',
  'journey-dallas-16': 'Take off from airport\nSHOOT down 2 PLANES before time ends',
  'journey-dallas-17': 'Take off from airport\nSHOOT down 3 PLANE before time ends',
  'journey-dallas-18': 'Take off from airport\nSHOOT down 4 PLANES before time ends',
  'journey-dallas-25': 'Destroy The MONSTER Before Time Runs Out.',
  'journey-dallas-19': 'Dr. BOSS is more powerful now\nTake off from airport\nDestroy Dr. BOSS before he destroy city',
  'journey-dallas-20': 'DEFEAT THE MONSTER',
  'journey-dallas-21': 'DEFEAT THE MONSTER',
  'journey-dallas-22': 'DEFEAT THE MONSTER',
  'journey-dallas-23': 'Take off from airport\nDestroy Dr. BOSS before he destroy city',
};

const formatTimeLimit = (milliseconds: number | undefined): string => milliseconds === undefined
  ? 'NO LIMIT' : `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1_000) % 60).padStart(2, '0')}`;

export const missionJourneyDetails = [...journeyCatalog.filter(slot => slot.implementation === 'playable' || slot.id === journeyDallasMostWantedSurvival01.id).map(slot => {
  const mission = missions.find(mission => mission.id === slot.id)!;
  return {
    id: mission.id,
    title: mission.id === journeyDallas19.id || mission.id === journeyDallas23.id ? 'MONSTER - Dr. BOSS' : mission.id === journeyDallas12.id ? 'BATTLE - 1 GIANT (2 wings, 1 engine), 2 PLANES' : mission.id === journeyDallasMostWantedSurvival01.id ? 'SURVIVAL' : mission.id === journeyDallas18.id ? 'BATTLE - 4 PLANES' : mission.id === journeyDallas11.id ? 'BATTLE - 1 GIANT (2 WINGS, 1 ENGINE)' : mission.id === journeyDallas17.id ? 'BATTLE - 3 PLANES' : mission.id === journeyDallas10.id ? 'BATTLE - 1 GIANT, 4 PLANES' : mission.id === journeyDallasTerritoryHold01.id ? 'CAPTURE & HOLD 3 TERRITORIES' : mission.id === journeyDallasCaptureThree01.id ? 'TERRITORY - 3 TERRITORIES' : mission.id === journeyDallasAceIntercept01.id ? 'BATTLE - 1 PLANE' : mission.id === journeyDallas09.id ? 'BATTLE - 1 GIANT, 3 PLANES' : mission.id === journeyDallasTwinHunters01.id || mission.id === journeyDallas16.id ? 'BATTLE - 2 PLANES' : mission.id === journeyDallas08.id ? 'BATTLE - 1 GIANT, 2 PLANES' : mission.id === journeyDallasCoinHunt01.id ? 'COLLECT COINS' : mission.id === journeyDallas07.id ? 'BATTLE - 1 GIANT' : mission.id === journeyDallasSharpshooter05.id ? 'TARGET MASTER' : mission.id === journeyDallasSharpshooter04.id ? 'PRECISION FIRE' : mission.id === journeyDallasSharpshooter03.id ? 'DOUBLE TROUBLE' : mission.id === journeyDallasSharpshooter02.id ? 'MOVING TARGETS' : mission.id === journeyDallasSharpshooter01.id ? 'TARGETS' : mission.id === journeyDallas01.id || mission.id === journeyDallas03.id || mission.id === journeyDallas04.id || mission.id === journeyDallas05.id || mission.id === journeyDallas06.id ? '10 RINGS' : (mission.id === journeyDallas13.id || mission.id === journeyDallas14.id || mission.id === journeyDallas15.id) ? 'BATTLE - 1 PLANE' : mission.id === journeyDallasCapture01.id || mission.id === journeyDallasTerritoryDefense01.id ? 'TERRITORY' : slot.title,
    description: descriptions[mission.id],
    rewardCredits: mission.firstClearCredits,
    timeLimit: formatTimeLimit('timeLimitMs' in mission ? mission.timeLimitMs : undefined),
  };
}), {
  id: 'placeholder-dallas-27',
  title: 'TERRITORY - 6 minutes total',
  description: 'Capture 3 TERRITORIES\nHold them together for 1 minute',
  rewardCredits: 0,
  timeLimit: '6:00',
}];
