import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const cookieName = 'airport_chaos_session';
const sessionLifetimeMs = 365 * 24 * 60 * 60 * 1_000;
const pilotIdPattern = /^[a-zA-Z0-9-]{16,80}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieValue(cookieHeader: string | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export class PilotSessionStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS pilot_sessions (
        token_hash TEXT PRIMARY KEY,
        pilot_id TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pilot_session_migrations (
        pilot_id TEXT PRIMARY KEY,
        migrated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pilot_sessions_expiry ON pilot_sessions(expires_at);
    `);
  }

  resolve(cookieHeader: string | undefined, now = Date.now()): string | undefined {
    const token = cookieValue(cookieHeader);
    if (!token || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return undefined;
    const row = this.database.prepare('SELECT pilot_id,expires_at FROM pilot_sessions WHERE token_hash=?').get(hashToken(token)) as { pilot_id: string; expires_at: number } | undefined;
    if (!row || row.expires_at <= now) return undefined;
    this.database.prepare('UPDATE pilot_sessions SET last_seen_at=? WHERE token_hash=?').run(now, hashToken(token));
    return row.pilot_id;
  }

  issue(preferredPilotId: string | undefined, existingProfile: boolean, now = Date.now()): { pilotId: string; cookie: string; migrated: boolean } {
    let pilotId: string = randomUUID();
    let migrated = false;
    if (preferredPilotId && pilotIdPattern.test(preferredPilotId) && existingProfile) {
      const claim = this.database.prepare('INSERT OR IGNORE INTO pilot_session_migrations(pilot_id,migrated_at) VALUES(?,?)').run(preferredPilotId, now);
      if (claim.changes > 0) { pilotId = preferredPilotId; migrated = true; }
    }
    // Every server-issued identity is claimed immediately. Losing its cookie
    // must never make the client-visible pilotId usable as a credential later.
    this.database.prepare('INSERT OR IGNORE INTO pilot_session_migrations(pilot_id,migrated_at) VALUES(?,?)').run(pilotId, now);
    const token = randomBytes(32).toString('base64url');
    this.database.prepare('INSERT INTO pilot_sessions(token_hash,pilot_id,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?)')
      .run(hashToken(token), pilotId, now, now, now + sessionLifetimeMs);
    return { pilotId, cookie: token, migrated };
  }

  cookie(token: string, secure: boolean): string {
    return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure ? '; Secure' : ''}`;
  }

  prune(now = Date.now()): void {
    this.database.prepare('DELETE FROM pilot_sessions WHERE expires_at <= ?').run(now);
  }
}
