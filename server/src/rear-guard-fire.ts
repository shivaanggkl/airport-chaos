import { journeyDallas08, journeyDallas09, journeyDallas10 } from '../../shared/journey-mission.mjs';

type EscortMission = typeof journeyDallas08 | typeof journeyDallas09 | typeof journeyDallas10;

export type RearGuardFireState = {
  tookOffAt: number | null;
  nextBurstAt: number;
  lastBurstAt: number | null;
  nextOrdinal: number;
  activeOrdinal: number | null;
  shotsRemaining: number;
  nextShotAt: number;
  eligibleAfter: number[];
  waveCombatAt: number | null;
  mission: EscortMission;
};

export function createRearGuardFireState(mission: EscortMission = journeyDallas08): RearGuardFireState {
  return { tookOffAt: null, nextBurstAt: Infinity, nextOrdinal: 1, activeOrdinal: null,
    lastBurstAt: null, shotsRemaining: 0, nextShotAt: 0, eligibleAfter: [], waveCombatAt: null, mission };
}

export function rearGuardTakeoff(state: RearGuardFireState, now: number): void {
  if (state.tookOffAt !== null) return;
  state.tookOffAt = now;
  state.nextBurstAt = now + state.mission.escortFireDelayMs;
}

export function rearGuardReinforcementsJoined(state: RearGuardFireState, now: number): void {
  if (state.mission !== journeyDallas09 || state.waveCombatAt !== null) return;
  state.waveCombatAt = now + journeyDallas09.reinforcementFireDelayMs;
  state.eligibleAfter[2] = state.waveCombatAt;
  state.eligibleAfter[3] = state.waveCombatAt;
}

/** The transport is the only required kill; a terminal hit cannot start a wave. */
export function shouldBeginReinforcements(health: number, status: string, alreadyTriggered: boolean): boolean {
  return status === 'RACING' && health > 0 &&
    health <= journeyDallas09.bossHealth * journeyDallas09.reinforcementThreshold && !alreadyTriggered;
}

/** Returns a single legal shooter slot. The caller still checks the normal aiming rules. */
export function rearGuardShooter(state: RearGuardFireState, now: number, alive: readonly boolean[]): number | null {
  if (state.tookOffAt === null || now < state.tookOffAt + state.mission.escortFireDelayMs) return null;
  if (state.mission === journeyDallas09 && state.waveCombatAt !== null && now >= state.waveCombatAt)
    state.nextBurstAt = Math.min(state.nextBurstAt, state.lastBurstAt === null ? state.waveCombatAt
      : Math.max(state.waveCombatAt, state.lastBurstAt + journeyDallas09.escortBurstIntervalMs));
  if (state.activeOrdinal !== null && now - state.nextShotAt > 750) {
    state.activeOrdinal = null;
    state.shotsRemaining = 0;
  }
  if (state.activeOrdinal === null && now >= state.nextBurstAt) {
    const selected = Array.from({ length: alive.length }, (_, step) =>
      (state.nextOrdinal - 1 + step) % alive.length + 1).find(ordinal =>
      alive[ordinal - 1] && now >= (state.eligibleAfter[ordinal - 1] ?? 0)) ?? null;
    const interval = state.mission === journeyDallas09 && state.waveCombatAt !== null && now >= state.waveCombatAt
      ? journeyDallas09.escortBurstIntervalMs : state.mission === journeyDallas09
        ? journeyDallas09.initialEscortBurstIntervalMs : state.mission.escortBurstIntervalMs;
    state.nextBurstAt = now + interval;
    if (selected === null) return null;
    state.activeOrdinal = selected;
    state.nextOrdinal = selected % alive.length + 1;
    state.lastBurstAt = now;
    state.shotsRemaining = 2;
    state.nextShotAt = now;
  }
  const ordinal = state.activeOrdinal;
  if (ordinal === null || !alive[ordinal - 1]) {
    state.activeOrdinal = null;
    state.shotsRemaining = 0;
    return null;
  }
  return now >= state.nextShotAt ? ordinal : null;
}

export function rearGuardShotResolved(state: RearGuardFireState, now: number): void {
  state.shotsRemaining -= 1;
  state.nextShotAt = now + state.mission.escortShotSpacingMs;
  if (state.shotsRemaining <= 0) state.activeOrdinal = null;
}
