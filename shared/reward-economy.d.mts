export const economyRewards: Readonly<{
  landing: number;
  discovery: number;
  distanceBatchMeters: number;
  distanceBatchCredits: number;
  contractCredits: Readonly<Record<'sightseeing' | 'passenger' | 'cargo' | 'intercept', number>>;
  contractClaimCooldownMs: number;
}>;
export const MAMMOTH_CARGO_CREDIT_BONUS: 0.4;
export function cargoCreditReward(
  baseCredits: number,
  aircraftType: string,
  activityType: 'mission' | 'event',
  activityId: string,
  cargoEligible?: boolean,
): Readonly<{ credits: number; baseCredits: number; bonusCredits: number; eligible: boolean; applied: boolean }>;
export function challengeCreditReward(score: number): number;
