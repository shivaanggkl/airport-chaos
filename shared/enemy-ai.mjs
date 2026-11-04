const tactics = (prediction, awareness, memory, commitment, hysteresis, expert = false) => Object.freeze({ prediction, awareness, memory, commitment, hysteresis, expert });
// Intelligence only. Aircraft envelopes and encounter hull/reward rules stay separate.
// Easy is the learning baseline; the middle tiers step toward the approved Legendary profile.
export const enemyAiLevels = Object.freeze({
  EASY: Object.freeze({ reactionMs: 900, trackingMs: 1400, shotIntervalMs: 900, aimError: .014, dodgeCooldownMs: 9000, tactics: tactics(2.5, .3, .15, 3500, .28) }),
  MEDIUM: Object.freeze({ reactionMs: 450, trackingMs: 750, shotIntervalMs: 600, aimError: .0065, dodgeCooldownMs: 5500, tactics: tactics(4, .5, .4, 2800, .23) }),
  HARD: Object.freeze({ reactionMs: 250, trackingMs: 400, shotIntervalMs: 400, aimError: .003, dodgeCooldownMs: 3300, tactics: tactics(6, .7, .65, 2300, .19) }),
  VERY_HARD: Object.freeze({ reactionMs: 120, trackingMs: 200, shotIntervalMs: 250, aimError: .0014, dodgeCooldownMs: 2000, tactics: tactics(8, .85, .85, 2000, .16) }),
  LEGENDARY: Object.freeze({ reactionMs: 45, trackingMs: 100, shotIntervalMs: 165, aimError: .000625, dodgeCooldownMs: 1200, tactics: tactics(10, 1, 1, 1200, .13, true) }),
});
export function enemyAiProfile(level) {
  if (!Object.hasOwn(enemyAiLevels, level)) throw new Error(`Invalid enemy AI level: ${String(level)}`);
  return enemyAiLevels[level];
}
// Displayed slots, deliberately separate from historical internal mission IDs.
export const skyHuntersDifficulty = Object.freeze({ 7: 'EASY', 8: 'MEDIUM', 9: 'MEDIUM', 10: 'HARD', 11: 'VERY_HARD', 12: 'LEGENDARY' });
