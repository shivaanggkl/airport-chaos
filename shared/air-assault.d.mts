import type { EnemyAiLevel, EnemyAiProfile } from './enemy-ai.mjs';
export type AssaultTier = 'medium' | 'hard' | 'legendary';
export type AssaultVector = {
  x: number;
  y: number;
  z: number;
};
export type AssaultEnemy = {
  id: string;
  tier: AssaultTier;
  aircraftType?: 'trainer'|'cargo'|'privateJet'|'fighter';
  equippedCosmetics?: Record<string,string>;
  airportId: string;
  ordinal: number;
  phase: 'queued' | 'takeoff' | 'combat' | 'destroyed' | 'retired';
  position: AssaultVector;
  rotation: AssaultVector;
  velocity: AssaultVector;
  health: number;
  maxHealth: number;
};
export type AssaultSnapshot = {
  type: 'airAssault';
  id: string;
  phase: 'intro' | 'countdown' | 'takeoff' | 'active' | 'finished';
  serverNow: number;
  phaseAt: number;
  startedAt: number | null;
  deadlineAt: number | null;
  destroyed: number;
  destroyedIds: string[];
  health: number;
  maxHealth: number;
  outsideAt: number | null;
  result?: 'full' | 'survival' | 'destroyed' | 'boundary' | 'grounded' | 'disconnected' | 'exit';
  reward: number;
  dailyClaimed: boolean;
  enemies: AssaultEnemy[];
  hearts: Array<{
    id: string;
    cooldownUntil: number;
  }>;
};
export const airAssaultRules: Readonly<{
  cityId: string;
  fullCredits: number;
  survivalCredits: number;
  durationMs: number;
  introMs: number;
  countdownMs: number;
  returnMs: number;
  reconnectMs: number;
  maxActive: number;
  heartCooldownMs: number;
}>;
export const airAssaultTiers: Readonly<Record<AssaultTier, Readonly<{
  health: number;
  level: EnemyAiLevel;
  ai: EnemyAiProfile;
}>>>;
export const airAssaultAirports: Array<{
  id: string;
  x: number;
  z: number;
  heading: number;
  runwayWidth: number;
  runwayLength: number;
}>;
export const airAssaultHearts: Array<{
  id: string;
  kind: 'heart';
  x: number;
  y: number;
  z: number;
  radius: number;
}>;
export function airAssaultManifest(): Array<{
  tier: AssaultTier;
  airportId: string;
  ordinal: number;
}>;
export function airAssaultQueuePosition(airportId: string, ordinal: number, elevation: number): AssaultVector;
export function airAssaultInside(position: AssaultVector): boolean;
