const tactics = (prediction, awareness, memory, commitment, hysteresis) => Object.freeze({ prediction, awareness, memory, commitment, hysteresis });
// Intelligence only. Aircraft envelopes and encounter hull/reward rules stay separate.
export const enemyAiLevels = Object.freeze({
  EASY: Object.freeze({ reactionMs: 900, trackingMs: 1400, shotIntervalMs: 900, aimError: .014, dodgeCooldownMs: 9000, tactics: tactics(2.5, .3, .15, 3500, .28) }),
  MEDIUM: Object.freeze({ reactionMs: 600, trackingMs: 1050, shotIntervalMs: 650, aimError: .009, dodgeCooldownMs: 6500, tactics: tactics(4, .5, .4, 2800, .23) }),
  HARD: Object.freeze({ reactionMs: 400, trackingMs: 750, shotIntervalMs: 450, aimError: .006, dodgeCooldownMs: 4500, tactics: tactics(6, .7, .65, 2300, .19) }),
  VERY_HARD: Object.freeze({ reactionMs: 280, trackingMs: 550, shotIntervalMs: 325, aimError: .004, dodgeCooldownMs: 3300, tactics: tactics(8, .85, .85, 2000, .16) }),
  LEGENDARY: Object.freeze({ reactionMs: 180, trackingMs: 400, shotIntervalMs: 220, aimError: .0025, dodgeCooldownMs: 2400, tactics: tactics(10, 1, 1, 1800, .13) }),
});
export function enemyAiProfile(level) {
  if (!Object.hasOwn(enemyAiLevels, level)) throw new Error(`Invalid enemy AI level: ${String(level)}`);
  return enemyAiLevels[level];
}
// Displayed slots, deliberately separate from historical internal mission IDs.
export const skyHuntersDifficulty = Object.freeze({ 7: 'EASY', 8: 'MEDIUM', 9: 'MEDIUM', 10: 'HARD', 11: 'VERY_HARD', 12: 'LEGENDARY' });
