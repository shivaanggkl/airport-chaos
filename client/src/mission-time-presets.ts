import type { CityTimeOfDay } from './city-visuals';

const dayMissions = new Set([1, 4, 7, 12, 16, 22]);
const nightMissions = new Set([5, 9, 14, 20]);

export function missionTimePreset(missionNumber: number): CityTimeOfDay {
  if (dayMissions.has(missionNumber)) return 'day';
  // The existing Night artwork and lighting use the internal name "dusk".
  if (nightMissions.has(missionNumber)) return 'dusk';
  return 'evening';
}
