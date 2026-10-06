export const REWARDED_AD_CREDITS = 250;
export const REWARDED_AD_MAX_REWARDS = 3;
export const REWARDED_AD_WINDOW_MS = 24 * 60 * 60 * 1000;
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
