export const economyRewards = Object.freeze({
  landing: 75,
  discovery: 100,
  distanceBatchMeters: 10_000,
  distanceBatchCredits: 5,
  contractCredits: Object.freeze({ sightseeing: 200, passenger: 225, cargo: 250, intercept: 250 }),
  contractClaimCooldownMs: 90_000,
});

export function challengeCreditReward(score) {
  return Math.max(75, Math.min(250, Math.round(score * 0.7)));
}
