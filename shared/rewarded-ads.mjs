export const rewardedAdCredits = Object.freeze([50, 75, 100, 150]);
export const REWARDED_AD_MAX_REWARDS = rewardedAdCredits.length;
export const REWARDED_AD_WINDOW_MS = 60 * 60 * 1000;
export const REWARDED_AD_ATTEMPT_LIFETIME_MS = 30 * 60 * 1000;

export const rewardedAdAttemptStatuses = Object.freeze([
  'CREATED',
  'AD_STARTED',
  'PENDING_VERIFICATION',
  'REWARDED',
  'CLOSED_WITHOUT_REWARD',
  'FAILED',
  'EXPIRED',
]);
