import { journeyMissionOrder } from '../../shared/journey-mission.mjs';
import type { CityTimeOfDay } from './city-visuals';

const dayMissions = new Set([1, 4, 7, 12, 16, 22]);
const nightMissions = new Set([5, 9, 14, 20]);

export function missionTimePreset(missionNumber: number): CityTimeOfDay {
  const identityNumber = Number(journeyMissionOrder[missionNumber - 1]?.slice(-2));
  if (dayMissions.has(identityNumber)) return 'day';
  // The existing Night artwork and lighting use the internal name "dusk".
  if (nightMissions.has(identityNumber)) return 'dusk';
  return 'evening';
}
