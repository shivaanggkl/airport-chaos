export type NextActionKind = 'takeoff' | 'map' | 'event' | 'contract' | 'challenge' | 'discovery' | 'stunt' | 'combat' | 'landing' | 'garage';
export type NextActionAction = { label: string; run: () => void; disabled?: boolean; title?: string };

export type NextActionCandidate = {
  id: string;
  kind: NextActionKind;
  title: string;
  detail: string;
  distance?: number;
  urgency?: number;
  relevance?: number;
  lockedReason?: string;
  actions?: readonly NextActionAction[];
};

export type NextActionContext = {
  onGround: boolean;
  runStarted: boolean;
  lowProgress: boolean;
};

const basePriority: Record<NextActionKind, number> = {
  takeoff: 105,
  map: 64,
  event: 96,
  contract: 72,
  challenge: 68,
  discovery: 74,
  stunt: 58,
  combat: 66,
  landing: 60,
  garage: 56,
};

/**
 * A lightweight, read-only activity orchestrator. Candidates carry existing
 * game actions; this class only ranks and rotates them for the compact HUD.
 */
export class NextActionSystem {
  private readonly lastShownAt = new Map<string, number>();
  private readonly actionedAt = new Map<string, number>();

  recommend(context: NextActionContext, candidates: readonly NextActionCandidate[], now = performance.now()): NextActionCandidate[] {
    const ranked = candidates.map((candidate) => ({
      candidate,
      score: this.score(context, candidate, now),
    })).sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
    const selected: NextActionCandidate[] = [];
    const addCandidates = (allowRecentAction: boolean): void => {
      for (const { candidate } of ranked) {
        const actionedAt = this.actionedAt.get(candidate.id);
        if (!allowRecentAction && actionedAt !== undefined && now - actionedAt < 45_000) continue;
        if (selected.length >= 1) continue;
        selected.push(candidate);
        this.lastShownAt.set(candidate.id, now);
      }
    };
    // A selected action should make room for something fresh. Fall back only
    // when there is no alternative to keep the HUD useful.
    addCandidates(false);
    if (selected.length < 3) {
      addCandidates(true);
    }
    return selected;
  }

  recordAction(id: string, now = performance.now()): void {
    this.actionedAt.set(id, now);
  }

  private score(context: NextActionContext, candidate: NextActionCandidate, now: number): number {
    let score = basePriority[candidate.kind] + (candidate.relevance ?? 0) + (candidate.urgency ?? 0) * 45;
    if (candidate.distance !== undefined) score -= Math.min(32, candidate.distance / 700);
    if (candidate.lockedReason) score -= 46;
    if (context.onGround && candidate.kind === 'takeoff') score += 42;
    if (!context.onGround && candidate.kind === 'takeoff') score -= 120;
    if (context.lowProgress) {
      if (!context.runStarted && candidate.kind === 'takeoff') score += 32;
      if (context.runStarted && (candidate.kind === 'map' || candidate.kind === 'discovery')) score += 16;
    }
    const shownAt = this.lastShownAt.get(candidate.id);
    if (shownAt !== undefined && now - shownAt < 12_000) score -= 18;
    const actionedAt = this.actionedAt.get(candidate.id);
    if (actionedAt !== undefined && now - actionedAt < 45_000) score -= 44;
    return score;
  }
}
