import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas25, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';

const missions = [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06,
  journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18,
  journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12,
  journeyDallas25, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas19] as const;

// Copy follows the active win conditions in shared/journey-mission.mjs and the
// authoritative Journey attempt handlers. Mission titles, rewards, and clocks
// always come from the live definitions above.
const descriptions: Readonly<Record<(typeof missions)[number]['id'], string>> = {
  'journey-dallas-01': 'Fly Through 10 Golden Gates Before Time Run Out.',
  'journey-dallas-02': 'Fly Through 10 Golden Gates Before Time Run Out.',
  'journey-dallas-03': 'Fly Through 10 Golden Gates Before Time Run Out.',
  'journey-dallas-04': 'Fly Through 10 Golden Gates Before Time Run Out.',
  'journey-dallas-05': 'Fly Through 10 Golden Gates Before Time Run Out.',
  'journey-dallas-06': 'Fly Through 10 Golden Gates Before Time Run Out.',
  'journey-dallas-07': 'Find And Shoot Down The GIANT PLANE Before Time Runs Out.',
  'journey-dallas-08': 'Shoot Down the GIANT PLANE And Both ESCORT Planes Before Time Runs Out.',
  'journey-dallas-09': 'Shoot Down the GIANT PLANE And All Three ESCORT Planes Before Time Runs Out.',
  'journey-dallas-10': 'Shoot Down the GIANT PLANE And All Four ESCORT Planes Before Time Runs Out.',
  'journey-dallas-11': 'Destroy the GIANT PLANE’s Two WINGS And Its ENGINE Before Time Runs Out.',
  'journey-dallas-12': 'Shoot Down Both ESCORT Planes And Destroy the GIANT PLANE’s Two WINGS And ENGINE Before Time Runs Out.',
  'journey-dallas-13': 'Find And Shoot Down NIGHTOWL Plane Before Time Runs Out.',
  'journey-dallas-14': 'Find And Shoot Down BLUEJAY Plane Before Time Runs Out.',
  'journey-dallas-15': 'Find And Shoot Down MAMMOTH Plane Before Time Runs Out.',
  'journey-dallas-16': 'Find And Shoot Down Both Enemy Planes Before Time Runs Out.',
  'journey-dallas-17': 'Find And Shoot Down ARMORED MAMMOTH Plane Before Time Runs Out.',
  'journey-dallas-18': 'Find And Shoot Down Legendary FIREHAWK Plane Before Time Runs Out.',
  'journey-dallas-25': 'Destroy The MONSTER Before Time Runs Out.',
  'journey-dallas-19': 'DEFEAT THE MONSTER',
  'journey-dallas-20': 'DEFEAT THE MONSTER',
  'journey-dallas-21': 'DEFEAT THE MONSTER',
  'journey-dallas-22': 'DEFEAT THE MONSTER',
  'journey-dallas-23': 'DEFEAT THE MONSTER',
};

const formatTimeLimit = (milliseconds: number | undefined): string => milliseconds === undefined
  ? 'NO LIMIT' : `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1_000) % 60).padStart(2, '0')}`;

export const missionJourneyDetails = missions.map(mission => ({
  id: mission.id,
  title: mission.name,
  description: descriptions[mission.id],
  rewardCredits: mission.firstClearCredits,
  timeLimit: formatTimeLimit(mission.id === journeyDallas21.id ? journeyDallas21.transferMs
    : 'timeLimitMs' in mission ? mission.timeLimitMs : undefined),
}));
