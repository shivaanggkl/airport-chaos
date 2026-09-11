export const economyRewards: Readonly<{
  landing: number;
  discovery: number;
  distanceBatchMeters: number;
  distanceBatchCredits: number;
  contractCredits: Readonly<Record<'sightseeing' | 'passenger' | 'cargo' | 'intercept', number>>;
  contractClaimCooldownMs: number;
}>;
export function challengeCreditReward(score: number): number;
