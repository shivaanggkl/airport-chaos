import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const FIREHAWK_TRIAL_NETWORK_WINDOW_MS = 24 * 60 * 60 * 1_000;
const maximumRecords = 100_000;
const pruneIntervalMs = 60 * 60 * 1_000;

type NetworkTrialRow = { expires_at: number };
type TrialStatus = 'available' | 'pending' | 'active' | 'consumed';
export type TrialNetworkDecision = { allowed: boolean; claimed: boolean; reason?: 'unavailable' | 'used'; retryAfterMs: number };

/** Durable, privacy-preserving limit for one new Firehawk trial per network/day. */
export class TrialNetworkGuard {
  private readonly database: DatabaseSync;
  private nextPruneAt = 0;

  constructor(filePath: string, private readonly secret: string | undefined) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS firehawk_trial_network_usage (
        hashed_network_id TEXT PRIMARY KEY,
        trial_started_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS firehawk_trial_network_expiry
        ON firehawk_trial_network_usage (expires_at);
    `);
    this.prune();
  }

  get enabled(): boolean { return typeof this.secret === 'string' && this.secret.length >= 32; }

  identify(normalizedIp: string): string | undefined {
    if (!this.enabled || normalizedIp === 'unknown') return undefined;
    return createHmac('sha256', this.secret!)
      .update(`airport-chaos:firehawk-trial:v1:${normalizedIp}`)
      .digest('hex');
  }

  authorizeNewTrial(status: TrialStatus, permanentlyOwned: boolean, hashedNetworkId: string | undefined, now = Date.now()): TrialNetworkDecision {
    // Existing trials and permanent owners continue through the profile-owned
    // flow without consuming or consulting a network allowance.
    if (permanentlyOwned || status !== 'available') return { allowed: true, claimed: false, retryAfterMs: 0 };
    if (!hashedNetworkId) return { allowed: false, claimed: false, reason: 'unavailable', retryAfterMs: 0 };
    const claim = this.claim(hashedNetworkId, now);
    return claim.allowed
      ? { allowed: true, claimed: true, retryAfterMs: 0 }
      : { allowed: false, claimed: false, reason: 'used', retryAfterMs: claim.retryAfterMs };
  }

  claim(hashedNetworkId: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    if (!/^[a-f0-9]{64}$/.test(hashedNetworkId)) return { allowed: false, retryAfterMs: 0 };
    if (now >= this.nextPruneAt) this.prune(now);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.database.prepare('SELECT expires_at FROM firehawk_trial_network_usage WHERE hashed_network_id = ?')
        .get(hashedNetworkId) as NetworkTrialRow | undefined;
      if (existing && existing.expires_at > now) {
        this.database.exec('COMMIT');
        return { allowed: false, retryAfterMs: existing.expires_at - now };
      }
      const expiresAt = now + FIREHAWK_TRIAL_NETWORK_WINDOW_MS;
      this.database.prepare(`INSERT INTO firehawk_trial_network_usage (hashed_network_id, trial_started_at, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(hashed_network_id) DO UPDATE SET
          trial_started_at = excluded.trial_started_at,
          expires_at = excluded.expires_at`).run(hashedNetworkId, now, expiresAt);
      this.database.exec('COMMIT');
      return { allowed: true, retryAfterMs: 0 };
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* transaction already closed */ }
      throw error;
    }
  }

  prune(now = Date.now()): number {
    const expired = Number(this.database.prepare('DELETE FROM firehawk_trial_network_usage WHERE expires_at <= ?').run(now).changes);
    const excess = Number(this.database.prepare(`DELETE FROM firehawk_trial_network_usage WHERE hashed_network_id IN (
      SELECT hashed_network_id FROM firehawk_trial_network_usage
      ORDER BY expires_at DESC LIMIT -1 OFFSET ?
    )`).run(maximumRecords).changes);
    this.nextPruneAt = now + pruneIntervalMs;
    return expired + excess;
  }
}
