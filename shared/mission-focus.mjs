import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05 } from './journey-mission.mjs';

const activeStatuses = new Set(['APPROACH', 'RACING']);

const journeyFocus = Object.freeze({
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
  return (attempt?.missionId === journeyDallas01.id || attempt?.missionId === journeyDallas02.id ||
    attempt?.missionId === journeyDallas03.id || attempt?.missionId === journeyDallas04.id ||
    attempt?.missionId === journeyDallas05.id) && activeStatuses.has(attempt.status)
    ? journeyFocus : null;
}

/** Only a server-owned assigned Hunter can interact with its focused Mission 2 pilot. */
export function excludesFocusedBotInteraction(firstFocused, firstIsBot, secondFocused, secondIsBot,
  firstAllowsSecondBot = false, secondAllowsFirstBot = false) {
  return (firstFocused && secondIsBot && !firstAllowsSecondBot) ||
    (secondFocused && firstIsBot && !secondAllowsFirstBot);
}
