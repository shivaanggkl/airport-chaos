export type MissionFocusConfig = Readonly<{
  showMissionObjectives: boolean;
  showUnrelatedLandmarkLabels: boolean;
  showUnrelatedAirportLabels: boolean;
  showUnrelatedTerritoryLabels: boolean;
  showUnrelatedChallengeMarkers: boolean;
  showAmbientAIAircraft: boolean;
  showAmbientAIMarkers: boolean;
}>;

export function missionFocusForAttempt(attempt: { missionId: string; status: string } | null | undefined): MissionFocusConfig | null;
export function excludesFocusedBotInteraction(firstFocused: boolean, firstIsBot: boolean, secondFocused: boolean, secondIsBot: boolean): boolean;
