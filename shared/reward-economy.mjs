export const economyRewards = Object.freeze({
  landing: 75,
  discovery: 100,
  distanceBatchMeters: 10_000,
  distanceBatchCredits: 5,
  contractCredits: Object.freeze({ sightseeing: 200, passenger: 225, cargo: 250, intercept: 250 }),
  contractClaimCooldownMs: 90_000,
});

export const MAMMOTH_CARGO_CREDIT_BONUS = 0.4;

export function cargoCreditReward(baseCredits, aircraftType, activityType, activityId, cargoEligible = false) {
  const eligible = cargoEligible || (activityType === 'event' && activityId === 'cargoConvoy');
  const base = Math.max(0, Math.round(baseCredits));
  const bonusCredits = eligible && aircraftType === 'cargo' ? Math.round(base * MAMMOTH_CARGO_CREDIT_BONUS) : 0;
  return Object.freeze({ credits: base + bonusCredits, baseCredits: base, bonusCredits, eligible, applied: bonusCredits > 0 });
}

export function challengeCreditReward(score) {
  return Math.max(75, Math.min(250, Math.round(score * 0.7)));
}
