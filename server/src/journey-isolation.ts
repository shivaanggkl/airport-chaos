type JourneyParticipant = {
  bot?: { journeyAttemptId?: string; journeyTargetPlayerId?: string };
};

/** A Journey pilot can interact only with an AI aircraft assigned to their own attempt. */
export function journeyInteractionExcluded(
  firstId: string,
  first: JourneyParticipant,
  firstAttemptId: string | undefined,
  secondId: string,
  second: JourneyParticipant,
  secondAttemptId: string | undefined,
): boolean {
  if (!firstAttemptId && !secondAttemptId && !first.bot?.journeyAttemptId && !second.bot?.journeyAttemptId) return false;
  return !(
    firstAttemptId && second.bot?.journeyAttemptId === firstAttemptId && second.bot.journeyTargetPlayerId === firstId ||
    secondAttemptId && first.bot?.journeyAttemptId === secondAttemptId && first.bot.journeyTargetPlayerId === secondId
  );
}
