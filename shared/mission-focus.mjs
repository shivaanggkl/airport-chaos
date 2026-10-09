import { journeyDallas01 } from './journey-mission.mjs';

const activeStatuses = new Set(['APPROACH', 'RACING']);

const dfwSkyRushFocus = Object.freeze({
  showMissionObjectives: true,
  showUnrelatedLandmarkLabels: false,
  showUnrelatedAirportLabels: false,
  showUnrelatedTerritoryLabels: false,
  showUnrelatedChallengeMarkers: false,
  showAmbientAIAircraft: false,
  showAmbientAIMarkers: false,
});

/** Only a server-confirmed active Journey attempt enables focus. */
export function missionFocusForAttempt(attempt) {
  return attempt?.missionId === journeyDallas01.id && activeStatuses.has(attempt.status)
    ? dfwSkyRushFocus : null;
}

/** Shared bots cannot interact with a focused pilot in either direction. */
export function excludesFocusedBotInteraction(firstFocused, firstIsBot, secondFocused, secondIsBot) {
  return (firstFocused && secondIsBot) || (secondFocused && firstIsBot);
}
