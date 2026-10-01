import type { CityMission } from './city-missions.mjs';

export type MissionHudProgressInput = Readonly<{ text: string; value: number; target: number }>;
export type MissionHudProgress = Readonly<{ text: string; barValue?: number; barMax?: number }>;

export function missionHudObjective(definition: CityMission): string;
export function missionHudProgress(definition: CityMission, progress: MissionHudProgressInput): MissionHudProgress;
