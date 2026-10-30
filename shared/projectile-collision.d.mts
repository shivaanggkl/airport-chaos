import type { CombatVector } from './combat-aim.mjs';
export function projectileImpactFraction(start: CombatVector, end: CombatVector, target: CombatVector, velocity: CombatVector, delta: number, radius: number): number | null;
