import { journeyDallas08 } from '../../shared/journey-mission.mjs';

export type RearGuardFireState = {
  tookOffAt: number | null;
  nextBurstAt: number;
  nextOrdinal: 1 | 2;
  activeOrdinal: 1 | 2 | null;
  shotsRemaining: number;
  nextShotAt: number;
};

export function createRearGuardFireState(): RearGuardFireState {
  return { tookOffAt: null, nextBurstAt: Infinity, nextOrdinal: 1, activeOrdinal: null,
    shotsRemaining: 0, nextShotAt: 0 };
}

export function rearGuardTakeoff(state: RearGuardFireState, now: number): void {
  if (state.tookOffAt !== null) return;
  state.tookOffAt = now;
  state.nextBurstAt = now + journeyDallas08.escortFireDelayMs;
}

/** Returns a single legal shooter slot. The caller still checks the normal aiming rules. */
export function rearGuardShooter(state: RearGuardFireState, now: number, alive: readonly boolean[]): 1 | 2 | null {
  if (state.tookOffAt === null || now < state.tookOffAt + journeyDallas08.escortFireDelayMs) return null;
  if (state.activeOrdinal !== null && now - state.nextShotAt > 750) {
    state.activeOrdinal = null;
    state.shotsRemaining = 0;
  }
  if (state.activeOrdinal === null && now >= state.nextBurstAt) {
    const selected = alive[state.nextOrdinal - 1] ? state.nextOrdinal : alive[2 - state.nextOrdinal] ? (state.nextOrdinal === 1 ? 2 : 1) : null;
    state.nextBurstAt = now + journeyDallas08.escortBurstIntervalMs;
    if (selected === null) return null;
    state.activeOrdinal = selected;
    state.nextOrdinal = selected === 1 ? 2 : 1;
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
  state.nextShotAt = now + journeyDallas08.escortShotSpacingMs;
  if (state.shotsRemaining <= 0) state.activeOrdinal = null;
}
