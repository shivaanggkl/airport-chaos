export const rewardedAdCredits: readonly [50, 75, 100, 150];
export const REWARDED_AD_MAX_REWARDS: number;
export const REWARDED_AD_WINDOW_MS: number;
export const REWARDED_AD_ATTEMPT_LIFETIME_MS: number;
export const rewardedAdAttemptStatuses: readonly ['CREATED', 'AD_STARTED', 'PENDING_VERIFICATION', 'REWARDED', 'CLOSED_WITHOUT_REWARD', 'FAILED', 'EXPIRED'];
export type RewardedAdAttemptStatus = typeof rewardedAdAttemptStatuses[number];
