// Intelligence only. Aircraft envelopes and encounter hull/reward rules stay separate.
export const enemyAiLevels = Object.freeze({
  EASY: Object.freeze({ reactionMs: 900, trackingMs: 1400, shotIntervalMs: 900, aimError: .014, dodgeCooldownMs: 9000 }),
  MEDIUM: Object.freeze({ reactionMs: 600, trackingMs: 1050, shotIntervalMs: 650, aimError: .009, dodgeCooldownMs: 6500 }),
  HARD: Object.freeze({ reactionMs: 400, trackingMs: 750, shotIntervalMs: 450, aimError: .006, dodgeCooldownMs: 4500 }),
  VERY_HARD: Object.freeze({ reactionMs: 280, trackingMs: 550, shotIntervalMs: 325, aimError: .004, dodgeCooldownMs: 3300 }),
  LEGENDARY: Object.freeze({ reactionMs: 180, trackingMs: 400, shotIntervalMs: 220, aimError: .0025, dodgeCooldownMs: 2400 }),
});
export function enemyAiProfile(level) {
  if (!Object.hasOwn(enemyAiLevels, level)) throw new Error(`Invalid enemy AI level: ${String(level)}`);
  return enemyAiLevels[level];
}
// Displayed slots, deliberately separate from historical internal mission IDs.
export const skyHuntersDifficulty = Object.freeze({ 7: 'EASY', 8: 'MEDIUM', 9: 'MEDIUM', 10: 'HARD', 11: 'VERY_HARD', 12: 'LEGENDARY' });
