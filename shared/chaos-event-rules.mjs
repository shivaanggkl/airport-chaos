export const landingChaosEventTypes = Object.freeze(['stormLanding', 'fogApproach', 'cargoRush', 'soloAirportSprint']);

export function canCompleteLandingChaosEvent(event, airportId) {
  if (!event || event.lifecycle !== 'active' || !landingChaosEventTypes.includes(event.eventType)) return false;
  if (event.targetAirportId !== airportId) return false;
  return event.eventType !== 'cargoRush' || event.progress >= 1;
}

export function advanceCargoRush(event, insidePickup) {
  if (!event || event.eventType !== 'cargoRush' || event.lifecycle !== 'active') return event?.progress ?? 0;
  return insidePickup ? Math.max(1, event.progress ?? 0) : event.progress ?? 0;
}

export function lowAltitudeRunResult({ inside, altitude, minimumAltitude, maximumAltitude, elapsed, targetSeconds }) {
  if (!inside || altitude < minimumAltitude) return 'failed';
  if (altitude > maximumAltitude) return 'reset';
  return elapsed >= targetSeconds ? 'completed' : 'active';
}

export function airspaceControlProgress({ inside, contested, progress, deltaSeconds, targetSeconds }) {
  if (!inside) return { progress: 0, completed: false };
  if (contested) return { progress, completed: false };
  const next = Math.min(targetSeconds, progress + deltaSeconds);
  return { progress: next, completed: next >= targetSeconds };
}
