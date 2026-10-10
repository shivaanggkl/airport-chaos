import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13 } from './journey-mission.mjs';

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
    attempt?.missionId === journeyDallas05.id || attempt?.missionId === journeyDallas06.id ||
    attempt?.missionId === journeyDallas07.id || attempt?.missionId === journeyDallas08.id ||
    attempt?.missionId === journeyDallas09.id || attempt?.missionId === journeyDallas10.id ||
    attempt?.missionId === journeyDallas11.id || attempt?.missionId === journeyDallas12.id ||
    attempt?.missionId === journeyDallas13.id) && activeStatuses.has(attempt.status)
    ? journeyFocus : null;
}

/** Only a server-owned assigned Hunter can interact with its focused Journey pilot. */
export function excludesFocusedBotInteraction(firstFocused, firstIsBot, secondFocused, secondIsBot,
  firstAllowsSecondBot = false, secondAllowsFirstBot = false) {
  return (firstFocused && secondIsBot && !firstAllowsSecondBot) ||
    (secondFocused && firstIsBot && !secondAllowsFirstBot);
}
