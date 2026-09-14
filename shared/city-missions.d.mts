export type MissionType = 'airborneHold' | 'destinationLanding' | 'straightDistance' | 'stuntPair' | 'airportLandings' | 'challenge' | 'assignedHunter' | 'humanKill' | 'territoryHold' | 'territoryOwn' | 'event' | 'wantedSurvival' | 'precisionLanding' | 'territorySequence' | 'territoryUniqueKills' | 'airportEmpire' | 'liveScoreRank';
export type CityMission = {
  id: string; cityId: 'dallas' | 'milwaukee'; number: number; type: MissionType;
  displayName: string; description: string; difficulty: string;
  creditReward: number; scoreReward: number; replayCooldownMs: number;
  requirements: {
    airportId?: string; airportIds?: readonly string[]; territoryIds?: readonly string[];
    challengeId?: string; gateCount?: number; eventType?: string; result?: string; personality?: string;
    durationSeconds?: number; meters?: number; maxHeadingErrorRadians?: number;
    maneuvers?: readonly string[]; kills?: number; uniqueKills?: number;
    heatLevel?: number; minimumScore?: number; allCityTerritories?: boolean; rank?: number;
  };
};
export const cityMissionCatalog: Readonly<Record<'dallas' | 'milwaukee', readonly CityMission[]>>;
export function missionsForCity(cityId: string): readonly CityMission[];
export function missionForCity(cityId: string, missionId: string): CityMission | undefined;
