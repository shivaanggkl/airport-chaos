// Only these server-verified sources may increase Credits. Debits and historical ledger rows are unchanged.
const approvedCreditReasons = new Set([
  'MISSION_REWARD', 'CHALLENGE_REWARD', 'SKY_DUEL_PAYOUT', 'SKY_DUEL_REFUND',
  'DAILY_REWARD', 'REWARDED_AD', 'SEASON_REWARD', 'WEEKLY_REWARD',
  'REFERRAL_INVITER', 'REFERRAL_NEW_PLAYER', 'ADMIN_ADJUSTMENT', 'MIGRATION',
]);
export function approvedCreditReason(reason) { return approvedCreditReasons.has(reason); }

export function challengeCreditReward(score) {
  return Math.max(75, Math.min(250, Math.round(score * 0.7)));
}
