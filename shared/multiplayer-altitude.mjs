const METERS_TO_FEET = 3.28084;

export function altitudeFeet(meters) {
  if (!Number.isFinite(meters)) return undefined;
  return Math.max(0, Math.round(meters * METERS_TO_FEET));
}

export function formatPilotAltitude(meters) {
  const feet = altitudeFeet(meters);
  if (feet === undefined) return '—';
  if (feet < 10_000) return `${Math.round(feet / 100) * 100}`;
  return `${Math.round(feet / 1_000)}K`;
}

export function formatRelativeAltitude(deltaMeters) {
  const feet = altitudeFeet(Math.abs(deltaMeters));
  if (feet === undefined || feet < 300) return '';
  const magnitude = feet >= 1_000
    ? `${Math.max(1, Math.round(feet / 1_000))}K`
    : `${Math.round(feet / 100) * 100}`;
  return deltaMeters > 0 ? `▲ +${magnitude}` : `▼ -${magnitude}`;
}
