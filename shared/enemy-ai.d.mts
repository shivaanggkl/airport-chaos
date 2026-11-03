export type EnemyAiLevel = 'EASY' | 'MEDIUM' | 'HARD' | 'VERY_HARD' | 'LEGENDARY';
export type EnemyAiProfile = Readonly<{ reactionMs: number; trackingMs: number; shotIntervalMs: number; aimError: number; dodgeCooldownMs: number; tactics: Readonly<{prediction:number; awareness:number; memory:number; commitment:number; hysteresis:number}> }>;
export const enemyAiLevels: Readonly<Record<EnemyAiLevel, EnemyAiProfile>>;
export function enemyAiProfile(level: EnemyAiLevel): EnemyAiProfile;
export const skyHuntersDifficulty: Readonly<Record<7|8|9|10|11|12, EnemyAiLevel>>;
