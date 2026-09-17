export const PILOT_LEVEL_CAP = 50;

export function pilotXpForLevel(level) {
  const step = Math.max(0, Math.min(PILOT_LEVEL_CAP, Math.floor(level)) - 1);
  return step * 100 + step * step * 25;
}

export function pilotLevelForXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < PILOT_LEVEL_CAP && safeXp >= pilotXpForLevel(level + 1)) level += 1;
  return level;
}

export function pilotTitleForLevel(level) {
  if (level >= 50) return 'LEGEND';
  if (level >= 35) return 'SKY COMMANDER';
  if (level >= 25) return 'ELITE';
  if (level >= 15) return 'ACE';
  if (level >= 10) return 'AVIATOR';
  if (level >= 5) return 'PATHFINDER';
  return 'ROOKIE';
}

export const dailyPilotRewards = Object.freeze([50, 75, 100, 125, 150, 200, 300]);

export function utcDayId(now = Date.now()) { return new Date(now).toISOString().slice(0, 10); }

export function utcDayDistance(fromDay, toDay) {
  const from = Date.parse(`${fromDay}T00:00:00.000Z`);
  const to = Date.parse(`${toDay}T00:00:00.000Z`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 86_400_000) : Number.NaN;
}

export const pilotXpRewards = Object.freeze({
  distance5km: 5, landing: 25, discovery: 15, aiKill: 15, humanKill: 40,
  territoryCapture: 50, event: 50, pvpVictory: 40,
  mission: Object.freeze({ EASY: 40, MEDIUM: 70, HARD: 110, 'VERY HARD': 160, EXTREME: 250 }),
});

export const weeklyPlacementRewards = Object.freeze([
  { maxRank: 1, credits: 1000, badge: 'WEEKLY ACE' },
  { maxRank: 3, credits: 600, badge: 'WEEKLY ELITE' },
  { maxRank: 10, credits: 300, badge: 'WEEKLY TOP 10' },
]);

export function weeklyRewardForRank(rank) {
  return weeklyPlacementRewards.find((entry) => rank > 0 && rank <= entry.maxRank);
}
