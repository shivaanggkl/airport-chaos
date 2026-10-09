/** A Mission 4 defender exemption must match the linked attempt and live server territory assignment. */
export function isFocusedTerritoryDefender(
  focusedAttemptId: string | undefined, linkedAttemptId: string | undefined,
  pilotId: string, botId: string, territoryId: string,
  territory: { defenderBotId?: string } | undefined,
  defender: { lifeState: string; bot?: { defenseTerritoryId?: string; defenseTargetId?: string } } | undefined,
): boolean {
  return focusedAttemptId !== undefined && focusedAttemptId === linkedAttemptId &&
    territory?.defenderBotId === botId &&
    defender?.lifeState === 'alive' && defender.bot?.defenseTerritoryId === territoryId &&
    defender.bot.defenseTargetId === pilotId;
}

export function focusedTerritoryParticipantAllowed(focused: boolean, focusedAttemptId: string | undefined,
  linkedAttemptId: string | undefined): boolean {
  return !focused || focusedAttemptId !== undefined && focusedAttemptId === linkedAttemptId;
}

export function focusedTerritoryCaptureId(territoryId: string | undefined, focusedAttemptId: string | undefined,
  missionTerritoryId: string): string | undefined {
  return focusedAttemptId && territoryId !== missionTerritoryId ? undefined : territoryId;
}
