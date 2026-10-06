export const DAILY_REWARD_COOLDOWN_MS = 20 * 60 * 60 * 1000;
export const dailyRewardCredits = Object.freeze([250, 300, 400, 500, 600, 750, 1200]);

export function dailyRewardForDay(day) {
  return Number.isInteger(day) && day >= 1 && day <= dailyRewardCredits.length
    ? dailyRewardCredits[day - 1]
    : undefined;
}
