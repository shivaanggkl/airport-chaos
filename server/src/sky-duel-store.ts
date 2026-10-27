import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PlayerWallet } from './player-wallet.js';
import { PilotXpLedger } from './pilot-xp-ledger.js';

export const SKY_DUEL_ENTRY = 500;
export const SKY_DUEL_POOL = 1_000;
const CREDIT_CAP = 1_000_000;
export type DuelOutcome = 'WIN_A' | 'WIN_B' | 'DRAW' | 'CANCELLED';
export type DuelRecord = {
  id: string; pilotA: string; pilotB: string; status: 'RESERVED' | 'STARTED' | 'SETTLED';
  outcome: DuelOutcome | null; createdAt: number; startedAt: number | null; endedAt: number | null;
  scoreA: number; scoreB: number;
};
export type DuelRating = { rating: number; completed: number };
export type DuelReceipt = { match: DuelRecord; balanceA: number; balanceB: number; ratingA: DuelRating; ratingB: DuelRating };
type AccountRow = { pilot_id: string; credits: number };

export function duelElo(a: DuelRating, b: DuelRating, outcome: Exclude<DuelOutcome, 'CANCELLED'>): [DuelRating, DuelRating] {
  const expectedA = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
  const resultA = outcome === 'DRAW' ? 0.5 : outcome === 'WIN_A' ? 1 : 0;
  const updatedA = Math.max(100, Math.min(3_000, Math.round(a.rating + (a.completed < 10 ? 40 : 24) * (resultA - expectedA))));
  const updatedB = Math.max(100, Math.min(3_000, Math.round(b.rating + (b.completed < 10 ? 40 : 24) * ((1 - resultA) - (1 - expectedA)))));
  return [{ rating: updatedA, completed: a.completed + 1 }, { rating: updatedB, completed: b.completed + 1 }];
}

export class SkyDuelStore {
  private readonly db: DatabaseSync;
  private readonly wallet: PlayerWallet;
  private readonly xpLedger: PilotXpLedger;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.wallet = new PlayerWallet(this.db);
    this.xpLedger = new PilotXpLedger(this.db);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sky_duel_ratings (
        pilot_id TEXT PRIMARY KEY REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        rating INTEGER NOT NULL DEFAULT 1000 CHECK(rating BETWEEN 100 AND 3000),
        completed INTEGER NOT NULL DEFAULT 0 CHECK(completed >= 0)
      );
      CREATE TABLE IF NOT EXISTS sky_duel_matches (
        id TEXT PRIMARY KEY,
        pilot_a TEXT NOT NULL REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        pilot_b TEXT NOT NULL REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK(status IN ('RESERVED','STARTED','SETTLED')),
        outcome TEXT CHECK(outcome IN ('WIN_A','WIN_B','DRAW','CANCELLED')),
        created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
        score_a INTEGER NOT NULL DEFAULT 0, score_b INTEGER NOT NULL DEFAULT 0,
        xp_eligible_a INTEGER NOT NULL DEFAULT 0, xp_eligible_b INTEGER NOT NULL DEFAULT 0,
        CHECK(pilot_a <> pilot_b)
      );
      CREATE INDEX IF NOT EXISTS sky_duel_matches_participants ON sky_duel_matches(pilot_a, pilot_b, ended_at);
      CREATE UNIQUE INDEX IF NOT EXISTS sky_duel_active_a ON sky_duel_matches(pilot_a) WHERE status <> 'SETTLED';
      CREATE UNIQUE INDEX IF NOT EXISTS sky_duel_active_b ON sky_duel_matches(pilot_b) WHERE status <> 'SETTLED';
      CREATE TABLE IF NOT EXISTS sky_duel_receipts (
        match_id TEXT PRIMARY KEY REFERENCES sky_duel_matches(id) ON DELETE RESTRICT,
        balance_a INTEGER NOT NULL, balance_b INTEGER NOT NULL,
        rating_a INTEGER NOT NULL, rating_b INTEGER NOT NULL,
        completed_a INTEGER NOT NULL, completed_b INTEGER NOT NULL
      );
    `);
    try { this.db.exec('ALTER TABLE sky_duel_matches ADD COLUMN xp_eligible_a INTEGER NOT NULL DEFAULT 0'); } catch { /* existing column */ }
    try { this.db.exec('ALTER TABLE sky_duel_matches ADD COLUMN xp_eligible_b INTEGER NOT NULL DEFAULT 0'); } catch { /* existing column */ }
  }

  close(): void { this.db.close(); }

  rating(pilotId: string): DuelRating {
    const row = this.db.prepare('SELECT rating,completed FROM sky_duel_ratings WHERE pilot_id = ?').get(pilotId) as DuelRating | undefined;
    return row ? { rating: row.rating, completed: row.completed } : { rating: 1_000, completed: 0 };
  }

  balance(pilotId: string): number | undefined { return this.wallet.balances(pilotId)?.credits; }

  activeFor(pilotId: string): DuelRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sky_duel_matches WHERE status <> 'SETTLED' AND (pilot_a = ? OR pilot_b = ?) LIMIT 1")
      .get(pilotId, pilotId);
    return row ? this.record(row) : undefined;
  }

  recentOpponents(pilotId: string, since: number): string[] {
    const rows = this.db.prepare("SELECT pilot_a,pilot_b FROM sky_duel_matches WHERE status = 'SETTLED' AND ended_at >= ? AND (pilot_a = ? OR pilot_b = ?) ORDER BY ended_at DESC LIMIT 12")
      .all(since, pilotId, pilotId) as Array<{ pilot_a: string; pilot_b: string }>;
    return rows.map(row => row.pilot_a === pilotId ? row.pilot_b : row.pilot_a);
  }

  reserve(pilotA: string, pilotB: string, now = Date.now()): { ok: true; match: DuelRecord } | { ok: false; reason: 'SAME_ACCOUNT' | 'BUSY' | 'INSUFFICIENT_CREDITS' | 'WALLET_CAP' | 'PROFILE_NOT_FOUND' } {
    return this.reserveMatch(pilotA, pilotB, now, false);
  }

  reserveAi(pilotA: string, pilotB: string, now = Date.now()): ReturnType<SkyDuelStore['reserve']> {
    if (pilotB !== `sky-duel-ai:${pilotA}`) throw new Error('Invalid Sky Duel AI account');
    return this.reserveMatch(pilotA, pilotB, now, true);
  }

  private reserveMatch(pilotA: string, pilotB: string, now: number, aiOpponent: boolean): ReturnType<SkyDuelStore['reserve']> {
    if (pilotA === pilotB) return { ok: false, reason: 'SAME_ACCOUNT' };
    return this.wallet.transaction(wallet => {
      const accounts = this.db.prepare('SELECT pilot_id,credits FROM player_profiles WHERE pilot_id IN (?,?)').all(pilotA, pilotB) as AccountRow[];
      if (accounts.length !== 2) return { ok: false, reason: 'PROFILE_NOT_FOUND' } as const;
      if (this.activeFor(pilotA) || this.activeFor(pilotB)) return { ok: false, reason: 'BUSY' } as const;
      const humanBalance = accounts.find(row => row.pilot_id === pilotA)!.credits;
      if (humanBalance < SKY_DUEL_ENTRY) return { ok: false, reason: 'INSUFFICIENT_CREDITS' } as const;
      if (humanBalance + SKY_DUEL_ENTRY > CREDIT_CAP) return { ok: false, reason: 'WALLET_CAP' } as const;
      if (aiOpponent) {
        const balance = wallet.balances(pilotB)?.credits;
        if (balance === undefined) throw new Error('Sky Duel AI wallet missing');
        // The server-owned AI wallet supplies a real second stake in the same
        // transaction as the human reservation. Its funds are never client-owned.
        const adjustment = balance < SKY_DUEL_ENTRY
          ? wallet.credit({ pilotId: pilotB, currency: 'CREDITS', amount: SKY_DUEL_ENTRY - balance,
            reason: 'ADMIN_ADJUSTMENT', referenceId: `sky-duel-ai-fund:${randomUUID()}`, createdAt: now })
          : balance + SKY_DUEL_ENTRY > CREDIT_CAP
            ? wallet.debit({ pilotId: pilotB, currency: 'CREDITS', amount: balance - SKY_DUEL_ENTRY,
              reason: 'ADMIN_ADJUSTMENT', referenceId: `sky-duel-ai-trim:${randomUUID()}`, createdAt: now })
            : undefined;
        if (adjustment && (!adjustment.ok || !adjustment.applied)) throw new Error('Sky Duel AI wallet funding failed');
        accounts.find(row => row.pilot_id === pilotB)!.credits = wallet.balances(pilotB)!.credits;
      }
      if (accounts.some(row => row.credits < SKY_DUEL_ENTRY)) return { ok: false, reason: 'INSUFFICIENT_CREDITS' } as const;
      if (accounts.some(row => row.credits + SKY_DUEL_ENTRY > CREDIT_CAP)) return { ok: false, reason: 'WALLET_CAP' } as const;
      const id = randomUUID();
      const first = wallet.debit({ pilotId: pilotA, currency: 'CREDITS', amount: SKY_DUEL_ENTRY, reason: 'SKY_DUEL_ENTRY', referenceId: id, idempotencyKey: `${id}:entry:a`, createdAt: now });
      const second = wallet.debit({ pilotId: pilotB, currency: 'CREDITS', amount: SKY_DUEL_ENTRY, reason: 'SKY_DUEL_ENTRY', referenceId: id, idempotencyKey: `${id}:entry:b`, createdAt: now });
      if (!first.ok || !second.ok || !first.applied || !second.applied) throw new Error('Sky Duel reservation failed inside wallet transaction');
      this.db.prepare("INSERT INTO sky_duel_matches(id,pilot_a,pilot_b,status,created_at) VALUES (?,?,?,'RESERVED',?)").run(id, pilotA, pilotB, now);
      return { ok: true, match: this.get(id)! } as const;
    });
  }

  start(id: string, now = Date.now()): DuelRecord | undefined {
    this.db.prepare("UPDATE sky_duel_matches SET status = 'STARTED',started_at = ? WHERE id = ? AND status = 'RESERVED'").run(now, id);
    return this.get(id);
  }

  get(id: string): DuelRecord | undefined {
    const row = this.db.prepare('SELECT * FROM sky_duel_matches WHERE id = ?').get(id);
    return row ? this.record(row) : undefined;
  }

  settle(id: string, outcome: DuelOutcome, scoreA: number, scoreB: number, now = Date.now(), xpEligible: { a: boolean; b: boolean } = { a: false, b: false }, aiForfeit = false): DuelReceipt | undefined {
    return this.wallet.transaction(wallet => {
      const match = this.get(id);
      if (!match) return undefined;
      if (match.status === 'SETTLED') return this.receipt(match);
      if (outcome !== 'CANCELLED' && match.status !== 'STARTED') throw new Error('Competitive result requires a started match');
      if (aiForfeit && (outcome !== 'WIN_B' || match.pilotB !== `sky-duel-ai:${match.pilotA}`)) throw new Error('Invalid AI forfeit');
      if (!Number.isSafeInteger(scoreA) || !Number.isSafeInteger(scoreB) || scoreA < 0 || scoreB < 0) throw new Error('Invalid Sky Duel score');
      const rankedResult = outcome === 'WIN_A' && scoreA > scoreB || outcome === 'WIN_B' && scoreB > scoreA;
      const activeMs = match.startedAt === null ? 0 : Math.max(0, now - match.startedAt);
      const verifiedXp = {
        a: rankedResult && xpEligible.a && (outcome === 'WIN_A' || activeMs >= 60_000 && scoreA > 0),
        b: rankedResult && xpEligible.b && (outcome === 'WIN_B' || activeMs >= 60_000 && scoreB > 0),
      };
      const amountA = outcome === 'WIN_A' ? SKY_DUEL_POOL : outcome === 'DRAW' || outcome === 'CANCELLED' ? SKY_DUEL_ENTRY : 0;
      const amountB = outcome === 'WIN_B' && !aiForfeit ? SKY_DUEL_POOL : outcome === 'DRAW' || outcome === 'CANCELLED' ? SKY_DUEL_ENTRY : 0;
      const reason = outcome === 'WIN_A' || outcome === 'WIN_B' ? 'SKY_DUEL_PAYOUT' : 'SKY_DUEL_REFUND';
      if (amountA) {
        const result = wallet.credit({ pilotId: match.pilotA, currency: 'CREDITS', amount: amountA, reason, referenceId: id, idempotencyKey: `${id}:settle:a`, createdAt: now });
        if (!result.ok || !result.applied) throw new Error('Sky Duel settlement A failed');
      }
      if (amountB) {
        const result = wallet.credit({ pilotId: match.pilotB, currency: 'CREDITS', amount: amountB, reason, referenceId: id, idempotencyKey: `${id}:settle:b`, createdAt: now });
        if (!result.ok || !result.applied) throw new Error('Sky Duel settlement B failed');
      }
      if (outcome !== 'CANCELLED') {
        const [a, b] = duelElo(this.rating(match.pilotA), this.rating(match.pilotB), outcome);
        const update = this.db.prepare('INSERT INTO sky_duel_ratings(pilot_id,rating,completed) VALUES (?,?,?) ON CONFLICT(pilot_id) DO UPDATE SET rating=excluded.rating,completed=excluded.completed');
        update.run(match.pilotA, a.rating, a.completed);
        update.run(match.pilotB, b.rating, b.completed);
      }
      this.db.prepare("UPDATE sky_duel_matches SET status='SETTLED',outcome=?,ended_at=?,score_a=?,score_b=?,xp_eligible_a=?,xp_eligible_b=? WHERE id=? AND status <> 'SETTLED'")
        .run(outcome, now, scoreA, scoreB, verifiedXp.a ? 1 : 0, verifiedXp.b ? 1 : 0, id);
      this.awardSettledXp(match, outcome, now, verifiedXp);
      const balanceA = wallet.balances(match.pilotA)?.credits;
      const balanceB = wallet.balances(match.pilotB)?.credits;
      if (balanceA === undefined || balanceB === undefined) throw new Error('Sky Duel wallet disappeared during settlement');
      const ratingA = this.rating(match.pilotA), ratingB = this.rating(match.pilotB);
      this.db.prepare('INSERT INTO sky_duel_receipts(match_id,balance_a,balance_b,rating_a,rating_b,completed_a,completed_b) VALUES (?,?,?,?,?,?,?)')
        .run(id, balanceA, balanceB, ratingA.rating, ratingB.rating, ratingA.completed, ratingB.completed);
      return this.receipt(this.get(id)!);
    });
  }

  private awardSettledXp(match: DuelRecord, outcome: DuelOutcome, now: number, eligible: { a: boolean; b: boolean }): void {
    if (outcome !== 'WIN_A' && outcome !== 'WIN_B') return;
    const pairKey = [match.pilotA, match.pilotB].sort().join(':');
    for (const [pilotId, allowed, won] of [[match.pilotA, eligible.a, outcome === 'WIN_A'], [match.pilotB, eligible.b, outcome === 'WIN_B']] as const) {
      if (!allowed) continue;
      this.db.prepare('INSERT OR IGNORE INTO pilot_progression(pilot_id,xp,seeded) VALUES(?,0,1)').run(pilotId);
      this.xpLedger.awardInTransaction({ pilotId, source: won ? 'SKY_DUEL_WIN' : 'SKY_DUEL_LOSS',
        eventId: match.id, matchId: match.id, pairKey, now });
    }
  }

  reconcileXp(): void {
    const rows = this.db.prepare(`SELECT id,outcome,ended_at,xp_eligible_a,xp_eligible_b FROM sky_duel_matches
      WHERE status='SETTLED' AND outcome IN ('WIN_A','WIN_B') AND (xp_eligible_a=1 OR xp_eligible_b=1)`).all() as
      Array<{ id: string; outcome: DuelOutcome; ended_at: number; xp_eligible_a: number; xp_eligible_b: number }>;
    for (const row of rows) {
      const match = this.get(row.id);
      if (!match) continue;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.awardSettledXp(match, row.outcome, row.ended_at, { a: row.xp_eligible_a === 1, b: row.xp_eligible_b === 1 });
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
  }

  refundInterrupted(now = Date.now()): DuelReceipt[] {
    const rows = this.db.prepare("SELECT id FROM sky_duel_matches WHERE status <> 'SETTLED'").all() as Array<{ id: string }>;
    return rows.map(row => this.settle(row.id, 'CANCELLED', 0, 0, now)!);
  }

  private receipt(match: DuelRecord): DuelReceipt {
    const saved = this.db.prepare('SELECT * FROM sky_duel_receipts WHERE match_id = ?').get(match.id) as
      { balance_a: number; balance_b: number; rating_a: number; rating_b: number; completed_a: number; completed_b: number } | undefined;
    if (saved) return { match, balanceA: saved.balance_a, balanceB: saved.balance_b,
      ratingA: { rating: saved.rating_a, completed: saved.completed_a },
      ratingB: { rating: saved.rating_b, completed: saved.completed_b } };
    const balanceA = this.balance(match.pilotA), balanceB = this.balance(match.pilotB);
    if (balanceA === undefined || balanceB === undefined) throw new Error('Sky Duel participant profile missing');
    return { match, balanceA, balanceB, ratingA: this.rating(match.pilotA), ratingB: this.rating(match.pilotB) };
  }

  private record(value: unknown): DuelRecord {
    const row = value as Record<string, string | number | null>;
    return {
      id: String(row.id), pilotA: String(row.pilot_a), pilotB: String(row.pilot_b),
      status: row.status as DuelRecord['status'], outcome: row.outcome as DuelOutcome | null,
      createdAt: Number(row.created_at), startedAt: row.started_at === null ? null : Number(row.started_at),
      endedAt: row.ended_at === null ? null : Number(row.ended_at),
      scoreA: Number(row.score_a), scoreB: Number(row.score_b),
    };
  }
}
