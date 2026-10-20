export const DAILY_REWARD_COOLDOWN_MS = 60 * 60 * 1000;
// Keep the persisted seven-position claim cycle compatible with existing profiles.
export const dailyRewardCredits = Object.freeze([25, 25, 25, 25, 25, 25, 25]);

export function dailyRewardForDay(day) {
  return Number.isInteger(day) && day >= 1 && day <= dailyRewardCredits.length
    ? dailyRewardCredits[day - 1]
    : undefined;
}
