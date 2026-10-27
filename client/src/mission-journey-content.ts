import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';

const missions = [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06,
  journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12,
  journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18,
  journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24] as const;

// Copy follows the active win conditions in shared/journey-mission.mjs and the
// authoritative Journey attempt handlers. Mission titles, rewards, and clocks
// always come from the live definitions above.
const descriptions: Readonly<Record<(typeof missions)[number]['id'], string>> = {
  'journey-dallas-01': 'Fly through all 10 golden gates before time runs out.',
  'journey-dallas-02': 'Race through 10 golden gates above the lake.',
  'journey-dallas-03': 'Climb and fly through 10 golden gates.',
  'journey-dallas-04': 'Weave through 10 golden gates over downtown.',
  'journey-dallas-05': 'Make tight turns through 10 golden gates.',
  'journey-dallas-06': 'Finish the final 10-gate race before time runs out.',
  'journey-dallas-07': 'Destroy the giant transport before it leaves Dallas.',
  'journey-dallas-08': 'Fly close behind the transport for 15 seconds.',
  'journey-dallas-09': 'Destroy the transport as enemy reinforcements arrive.',
  'journey-dallas-10': 'Destroy the gunship while avoiding its guns and escorts.',
  'journey-dallas-11': 'Destroy both turrets, then the exposed core.',
  'journey-dallas-12': 'Destroy both guards, both turrets, then the exposed core.',
  'journey-dallas-13': 'Stay fast and fly through all five speed gates.',
  'journey-dallas-14': 'Stay 450 meters from the Hunter for 10 seconds.',
  'journey-dallas-15': 'Shoot down the powerful Ace fighter.',
  'journey-dallas-16': 'Fly through five gates while escaping two Hunters.',
  'journey-dallas-17': 'Repair your plane, then score 780 or more on landing.',
  'journey-dallas-18': 'Capture the zone, then defend against a Hunter for 40 seconds.',
  'journey-dallas-19': 'Destroy the giant monster before time runs out.',
  'journey-dallas-20': 'Fly through six alternating high and low gates.',
  'journey-dallas-21': 'Capture the first area, then the second within two minutes.',
  'journey-dallas-22': 'Fly through three gates, then land perfectly at DFW.',
  'journey-dallas-23': 'Defeat two Hunters, repairing your plane between fights.',
  'journey-dallas-24': 'Fly through three gates, defeat the Ace, and land perfectly.',
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
