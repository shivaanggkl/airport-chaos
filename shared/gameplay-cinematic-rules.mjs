export const GAMEPLAY_CINEMATIC_PRIORITY = Object.freeze({
  TAKEOFF: 1,
  REGION_ENTRY: 2,
  MISSION_COMPLETE: 3,
  PERFECT_LANDING: 4,
});

export const TAKEOFF_CINEMATIC_DURATION_MS = 700;
export const REGION_ENTRY_DURATION_MS = 1_350;
export const MISSION_COMPLETE_DURATION_MS = 2_200;
export const PERFECT_LANDING_DURATION_MS = 1_200;
export const CINEMATIC_EVENT_DEBOUNCE_MS = 750;

export const REGION_CINEMATIC_CONFIG = Object.freeze({
  dallas: Object.freeze({
    Metroplex: Object.freeze({ title: 'DOWNTOWN DALLAS', subtitle: 'URBAN FLIGHT ZONE' }),
    'Central District': Object.freeze({ title: 'CENTRAL DISTRICT', subtitle: 'DALLAS AIRSPACE' }),
    'Canal District': Object.freeze({ title: 'CANAL DISTRICT', subtitle: 'WATERFRONT FLIGHT ZONE' }),
    'North Metro': Object.freeze({ title: 'NORTH METRO', subtitle: 'DALLAS AIRSPACE' }),
    'South Metro': Object.freeze({ title: 'SOUTH METRO', subtitle: 'DALLAS AIRSPACE' }),
  }),
  milwaukee: Object.freeze({
    Central: Object.freeze({ title: 'CENTRAL MILWAUKEE', subtitle: 'URBAN FLIGHT ZONE' }),
    'Lake Coast': Object.freeze({ title: 'LAKE COAST', subtitle: 'COASTAL FLIGHT ZONE' }),
    'Mountain Ridge': Object.freeze({ title: 'MOUNTAIN RIDGE', subtitle: 'HIGH TERRAIN ZONE' }),
    Countryside: Object.freeze({ title: 'COUNTRYSIDE', subtitle: 'OPEN FLIGHT ZONE' }),
  }),
});

export function cinematicEase(progress) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return clamped * clamped * (3 - 2 * clamped);
}

export function cinematicPulse(progress) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return Math.sin(Math.PI * clamped);
}

export function cinematicProgress(elapsedMs, durationMs) {
  const duration = Math.max(1, durationMs);
  return Math.max(0, Math.min(1, elapsedMs / duration));
}

export function regionCinematicPresentation(cityId, regionName) {
  return REGION_CINEMATIC_CONFIG[cityId]?.[regionName];
}

export function isPerfectLandingGrade(grade) {
  return grade === 'PERFECT' || grade === 'LEGENDARY';
}
