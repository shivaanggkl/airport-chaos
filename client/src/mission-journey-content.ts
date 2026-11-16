import { journeyDallasMostWantedSurvival01, journeyDallasCaptureThree01, journeyTerritoryCaptureMission, journeyCaptureTerritoryId, journeyDallasAceIntercept01, journeyDallasTerritoryDefense01, journeyDallasTwinHunters01, journeyCatalog } from '../../shared/journey-mission.mjs';
import { journeyDallasCoinHunt01, journeyDallasSharpshooter01, journeyDallasAirportHop01, journeyDallasCapture01, journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas25, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';

export const captureMissionInstructions = [
  'Fly inside the marked TERRITORY.',
  'Stay inside TERRITORY to capture it until: LAS COLINAS CAPTURING 100%.',
] as const;

const missions = [journeyDallasMostWantedSurvival01,journeyDallasCaptureThree01, journeyDallasAceIntercept01, journeyDallasTerritoryDefense01, journeyDallasTwinHunters01, journeyDallasCoinHunt01, journeyDallasSharpshooter01, journeyDallasAirportHop01, journeyDallasCapture01, journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06,
  journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18,
  journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12,
  journeyDallas25, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas19] as const;

// Copy follows the active win conditions in shared/journey-mission.mjs and the
// authoritative Journey attempt handlers. Mission titles, rewards, and clocks
// always come from the live definitions above.
const descriptions: Readonly<Record<(typeof missions)[number]['id'], string>> = {
  'journey-dallas-most-wanted-survival-01':journeyDallasMostWantedSurvival01.objective,
  'journey-dallas-capture-three-01': journeyDallasCaptureThree01.objective,
  'journey-dallas-ace-intercept-01': journeyDallasAceIntercept01.objective,
  'journey-dallas-territory-defense-01':journeyDallasTerritoryDefense01.objective,
  'journey-dallas-twin-hunters-01': journeyDallasTwinHunters01.objective,
  'journey-dallas-coin-hunt-01': journeyDallasCoinHunt01.objective,
  'journey-dallas-sharpshooter-01': journeyDallasSharpshooter01.objective,
  'journey-dallas-airport-hop-01': journeyDallasAirportHop01.objective,
  'journey-dallas-capture-01': captureMissionInstructions.join('\n'),
  'journey-dallas-01': 'Fly through 10 RINGS before time ends',
  'journey-dallas-02': 'Fly through 10 RINGS before time ends',
  'journey-dallas-03': journeyDallas03.objective,
  'journey-dallas-04': journeyDallas04.objective,
  'journey-dallas-05': journeyDallas05.objective,
  'journey-dallas-06': journeyDallas06.objective,
  'journey-dallas-07': 'Find And Shoot Down The GIANT PLANE Before Time Runs Out.',
  'journey-dallas-08': 'Shoot Down the GIANT PLANE And Both ESCORT Planes Before Time Runs Out.',
  'journey-dallas-09': 'Shoot Down the GIANT PLANE And All Three ESCORT Planes Before Time Runs Out.',
  'journey-dallas-10': 'Shoot Down the GIANT PLANE And All Four ESCORT Planes Before Time Runs Out.',
  'journey-dallas-11': 'Destroy the GIANT PLANE’s Two WINGS And Its ENGINE Before Time Runs Out.',
  'journey-dallas-12': 'Shoot Down Both ESCORT Planes And Destroy the GIANT PLANE’s Two WINGS And ENGINE Before Time Runs Out.',
  'journey-dallas-13': 'Find And Shoot Down NIGHTOWL Plane Before Time Runs Out.',
  'journey-dallas-14': 'Find And Shoot Down BLUEJAY Plane Before Time Runs Out.',
  'journey-dallas-15': 'Find And Shoot Down MAMMOTH Plane Before Time Runs Out.',
  'journey-dallas-16': 'SHOOT down both enemy planes before TIME runs out',
  'journey-dallas-17': 'Find And Shoot Down MAMMOTH, NIGHTOWL And BLUEJAY Planes Before Time Runs Out.',
  'journey-dallas-18': 'Find And Shoot Down Both FIREHAWKS, NIGHTOWL And BLUEJAY Before Time Runs Out.',
  'journey-dallas-25': 'Destroy The MONSTER Before Time Runs Out.',
  'journey-dallas-19': 'DEFEAT THE MONSTER',
  'journey-dallas-20': 'DEFEAT THE MONSTER',
  'journey-dallas-21': 'DEFEAT THE MONSTER',
  'journey-dallas-22': 'DEFEAT THE MONSTER',
  'journey-dallas-23': 'DEFEAT THE MONSTER',
};

const formatTimeLimit = (milliseconds: number | undefined): string => milliseconds === undefined
  ? 'NO LIMIT' : `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1_000) % 60).padStart(2, '0')}`;

export const missionJourneyDetails = journeyCatalog.filter(slot => slot.implementation === 'playable').map(slot => {
  const mission = missions.find(mission => mission.id === slot.id)!;
  return {
    id: mission.id,
    title: mission.id === journeyDallas01.id || mission.id === journeyDallas02.id ? '10 RINGS' : slot.title,
    description: descriptions[mission.id],
    rewardCredits: mission.firstClearCredits,
    timeLimit: formatTimeLimit('timeLimitMs' in mission ? mission.timeLimitMs : undefined),
  };
});
