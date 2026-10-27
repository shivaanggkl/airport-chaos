import type { DuelRating } from './sky-duel-store.js';

export type DuelQueueEntry = {
  playerId: string; pilotId: string; queuedAt: number; rating: DuelRating;
  recentOpponents: ReadonlySet<string>;
};

export function duelSearchRange(waitMs: number): number {
  return waitMs >= 30_000 ? 300 : waitMs >= 15_000 ? 200 : 100;
}

export function duelWinProbability(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export function duelMatchable(a: DuelQueueEntry, b: DuelQueueEntry, now: number): boolean {
  if (a.pilotId === b.pilotId || a.playerId === b.playerId ||
    a.recentOpponents.has(b.pilotId) || b.recentOpponents.has(a.pilotId)) return false;
  const gap = Math.abs(a.rating.rating - b.rating.rating);
  if (gap > Math.min(duelSearchRange(now - a.queuedAt), duelSearchRange(now - b.queuedAt))) return false;
  const probability = duelWinProbability(a.rating.rating, b.rating.rating);
  const provisional = a.rating.completed < 10 || b.rating.completed < 10;
  return provisional ? probability >= 0.4 && probability <= 0.6 : probability >= 0.35 && probability <= 0.65;
}

export function closestDuelOpponent(entry: DuelQueueEntry, queue: Iterable<DuelQueueEntry>, now: number): DuelQueueEntry | undefined {
  let best: DuelQueueEntry | undefined;
  let bestScore = Infinity;
  for (const other of queue) {
    if (!duelMatchable(entry, other, now)) continue;
    const bothProvisional = entry.rating.completed < 10 && other.rating.completed < 10;
    const score = Math.abs(entry.rating.rating - other.rating.rating) + (entry.rating.completed < 10 && !bothProvisional ? 500 : 0);
    if (score < bestScore || score === bestScore && other.queuedAt < (best?.queuedAt ?? Infinity)) {
      best = other;
      bestScore = score;
    }
  }
  return best;
}
