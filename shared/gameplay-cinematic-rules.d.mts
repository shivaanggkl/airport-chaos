export type GameplayCinematicKind = 'TAKEOFF' | 'REGION_ENTRY' | 'MISSION_COMPLETE' | 'PERFECT_LANDING';
export type RegionCinematicPresentation = Readonly<{ title: string; subtitle: string }>;

export const GAMEPLAY_CINEMATIC_PRIORITY: Readonly<Record<GameplayCinematicKind, number>>;
export const TAKEOFF_CINEMATIC_DURATION_MS: number;
export const REGION_ENTRY_DURATION_MS: number;
export const MISSION_COMPLETE_DURATION_MS: number;
export const PERFECT_LANDING_DURATION_MS: number;
export const CINEMATIC_EVENT_DEBOUNCE_MS: number;
export const REGION_CINEMATIC_CONFIG: Readonly<Record<'dallas' | 'milwaukee', Readonly<Record<string, RegionCinematicPresentation>>>>;
export function cinematicEase(progress: number): number;
export function cinematicPulse(progress: number): number;
export function cinematicProgress(elapsedMs: number, durationMs: number): number;
export function regionCinematicPresentation(cityId: string, regionName: string): RegionCinematicPresentation | undefined;
export function isPerfectLandingGrade(grade: string): boolean;
