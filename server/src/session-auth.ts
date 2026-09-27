import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const cookieName = 'airport_chaos_session';
const guestSessionLifetimeMs = 365 * 24 * 60 * 60 * 1_000;
const accountSessionLifetimeMs = 30 * 24 * 60 * 60 * 1_000;
const pilotIdPattern = /^[a-zA-Z0-9-]{16,80}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const scryptKeyLength = 64;
const scryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 } as const;
const genericCredentialsError = 'Email or password is incorrect.';

function derivePassword(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived)));
}

export type SessionIdentity = { pilotId: string; accountId?: string; tokenHash: string };
export type AccountStatus = { state: 'guest' } | {
  state: 'account'; email?: string; avatarUrl?: string;
  providers: { password: boolean; google: boolean; apple: boolean };
};
export type AuthResult = {
  ok: boolean; error?: string; identity?: SessionIdentity; cookie?: string;
  expiresAt?: number; guestPreserved?: boolean;
};
export type ProviderName = 'google' | 'apple';
export type OAuthAction = 'login' | 'link';
export type OAuthFlow = {
  provider: ProviderName; action: OAuthAction; session: SessionIdentity; nonce: string;
  codeVerifier?: string; redirectUri: string; returnTo: string;
};
export type ProviderAuthResult = AuthResult & { collision?: boolean };

type SessionRow = {
  token_hash: string; pilot_id: string; account_id: string | null;
  expires_at: number; revoked_at: number | null;
};

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function cookieValue(cookieHeader: string | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function normalizeAccountEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.normalize('NFKC').trim().toLowerCase();
  return email.length >= 5 && email.length <= 254 && emailPattern.test(email) && !/[\u0000-\u001f\u007f]/.test(email) ? email : undefined;
}

export function validAccountPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}

function normalizeProviderAvatarUrl(provider: ProviderName, value: unknown): string | undefined {
  if (provider !== 'google' || typeof value !== 'string' || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      (hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com')) ? url.toString() : undefined;
  } catch { return undefined; }
}

async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, scryptKeyLength, scryptOptions);
  return `scrypt$v1$${scryptOptions.N}$${scryptOptions.r}$${scryptOptions.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [algorithm, version, n, r, p, saltValue, digestValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltValue || !digestValue) return false;
  const digest = Buffer.from(digestValue, 'base64url');
  const salt = Buffer.from(saltValue, 'base64url');
  if (digest.length !== scryptKeyLength || salt.length !== 16) return false;
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: 32 * 1024 * 1024 };
  if (options.N !== scryptOptions.N || options.r !== scryptOptions.r || options.p !== scryptOptions.p) return false;
  const candidate = await derivePassword(password, salt, digest.length, options);
  return timingSafeEqual(candidate, digest);
}

export class PilotSessionStore {
  private readonly database: DatabaseSync;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS accounts (
        account_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_identities (
        identity_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL, normalized_email TEXT, password_hash TEXT, provider_display_name TEXT, provider_avatar_url TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(provider, provider_subject),
        FOREIGN KEY(account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS account_profile_links (
        account_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL UNIQUE, linked_at INTEGER NOT NULL,
        FOREIGN KEY(account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS pilot_session_migrations (
        pilot_id TEXT PRIMARY KEY, migrated_at INTEGER NOT NULL
      );
    `);
    if (this.database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player_profiles'").get()) {
      this.database.exec(`UPDATE player_profiles SET legacy_imported=1
        WHERE pilot_id IN (SELECT pilot_id FROM account_profile_links)`);
    }
    this.migrateAuthIdentities();
    this.migrateSessions();
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS pilot_sessions_expiry ON pilot_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS pilot_sessions_pilot ON pilot_sessions(pilot_id);
      CREATE INDEX IF NOT EXISTS pilot_sessions_account ON pilot_sessions(account_id);
      CREATE INDEX IF NOT EXISTS auth_identities_account ON auth_identities(account_id);
      CREATE UNIQUE INDEX IF NOT EXISTS auth_password_email_unique ON auth_identities(normalized_email) WHERE provider='password';
      CREATE TABLE IF NOT EXISTS oauth_flows (
        state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, action TEXT NOT NULL,
        session_token_hash TEXT NOT NULL, account_id TEXT, nonce TEXT NOT NULL,
        code_verifier TEXT, redirect_uri TEXT NOT NULL, return_to TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS oauth_flows_expiry ON oauth_flows(expires_at);
      CREATE TABLE IF NOT EXISTS provider_token_replays (
        token_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, used_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS provider_token_replays_expiry ON provider_token_replays(expires_at);
    `);
    // Unknown-email attempts do the same expensive password work as valid ones.
    this.dummyPasswordHash = passwordHash(randomBytes(24).toString('base64url'));
  }

  private migrateAuthIdentities(): void {
    const existing = this.database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='auth_identities'").get() as { sql?: string } | undefined;
    if (!existing?.sql) return;
    const columns = this.database.prepare('PRAGMA table_info(auth_identities)').all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    const hasGlobalEmailUnique = /UNIQUE\s*\(\s*normalized_email\s*\)/i.test(existing.sql);
    if (names.has('provider_display_name') && names.has('provider_avatar_url') && !hasGlobalEmailUnique) return;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.exec(`
        CREATE TABLE auth_identities_next (
          identity_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider TEXT NOT NULL,
          provider_subject TEXT NOT NULL, normalized_email TEXT, password_hash TEXT, provider_display_name TEXT, provider_avatar_url TEXT,
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          UNIQUE(provider, provider_subject),
          FOREIGN KEY(account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
        );
        INSERT INTO auth_identities_next(identity_id,account_id,provider,provider_subject,normalized_email,password_hash,provider_display_name,provider_avatar_url,created_at,updated_at)
        SELECT identity_id,account_id,provider,provider_subject,normalized_email,password_hash,${names.has('provider_display_name') ? 'provider_display_name' : 'NULL'},${names.has('provider_avatar_url') ? 'provider_avatar_url' : 'NULL'},created_at,updated_at FROM auth_identities;
        DROP TABLE auth_identities;
        ALTER TABLE auth_identities_next RENAME TO auth_identities;
      `);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  private migrateSessions(): void {
    const existing = this.database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pilot_sessions'").get() as { sql?: string } | undefined;
    if (!existing?.sql) {
      this.database.exec(`CREATE TABLE pilot_sessions (
        token_hash TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, account_id TEXT,
        created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, revoked_at INTEGER
      )`);
      return;
    }
    const columns = this.database.prepare('PRAGMA table_info(pilot_sessions)').all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    const legacyUniquePilot = /pilot_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(existing.sql);
    if (names.has('account_id') && names.has('revoked_at') && !legacyUniquePilot) return;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.exec(`
        CREATE TABLE pilot_sessions_next (
          token_hash TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, account_id TEXT,
          created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL, revoked_at INTEGER
        );
        INSERT INTO pilot_sessions_next(token_hash,pilot_id,account_id,created_at,last_seen_at,expires_at,revoked_at)
        SELECT token_hash,pilot_id,${names.has('account_id') ? 'account_id' : 'NULL'},created_at,last_seen_at,expires_at,${names.has('revoked_at') ? 'revoked_at' : 'NULL'} FROM pilot_sessions;
        DROP TABLE pilot_sessions;
        ALTER TABLE pilot_sessions_next RENAME TO pilot_sessions;
      `);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  resolveSession(cookieHeader: string | undefined, now = Date.now()): SessionIdentity | undefined {
    const token = cookieValue(cookieHeader);
    if (!token || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return undefined;
    const tokenHash = hashToken(token);
    const row = this.database.prepare('SELECT token_hash,pilot_id,account_id,expires_at,revoked_at FROM pilot_sessions WHERE token_hash=?').get(tokenHash) as SessionRow | undefined;
    if (!row || row.revoked_at !== null || row.expires_at <= now) return undefined;
    this.database.prepare('UPDATE pilot_sessions SET last_seen_at=? WHERE token_hash=?').run(now, tokenHash);
    return { pilotId: row.pilot_id, accountId: row.account_id ?? undefined, tokenHash };
  }

  resolve(cookieHeader: string | undefined, now = Date.now()): string | undefined { return this.resolveSession(cookieHeader, now)?.pilotId; }

  resolveTokenHash(tokenHash: string, now = Date.now()): SessionIdentity | undefined {
    const row = this.database.prepare('SELECT token_hash,pilot_id,account_id,expires_at,revoked_at FROM pilot_sessions WHERE token_hash=?').get(tokenHash) as SessionRow | undefined;
    if (!row || row.revoked_at !== null || row.expires_at <= now) return undefined;
    return { pilotId: row.pilot_id, accountId: row.account_id ?? undefined, tokenHash: row.token_hash };
  }

  issue(preferredPilotId: string | undefined, existingProfile: boolean, now = Date.now()): { pilotId: string; cookie: string; migrated: boolean; expiresAt: number; tokenHash: string } {
    let pilotId: string = randomUUID(); let migrated = false;
    if (preferredPilotId && pilotIdPattern.test(preferredPilotId) && existingProfile) {
      const claim = this.database.prepare('INSERT OR IGNORE INTO pilot_session_migrations(pilot_id,migrated_at) VALUES(?,?)').run(preferredPilotId, now);
      if (claim.changes > 0) { pilotId = preferredPilotId; migrated = true; }
    }
    this.database.prepare('INSERT OR IGNORE INTO pilot_session_migrations(pilot_id,migrated_at) VALUES(?,?)').run(pilotId, now);
    const issued = this.insertSession(pilotId, undefined, now, guestSessionLifetimeMs);
    return { pilotId, cookie: issued.cookie, migrated, expiresAt: issued.expiresAt, tokenHash: issued.tokenHash };
  }

  private insertSession(pilotId: string, accountId: string | undefined, now: number, lifetimeMs: number): { cookie: string; expiresAt: number; tokenHash: string } {
    const token = randomBytes(32).toString('base64url'); const tokenHash = hashToken(token); const expiresAt = now + lifetimeMs;
    this.database.prepare('INSERT INTO pilot_sessions(token_hash,pilot_id,account_id,created_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
      .run(tokenHash, pilotId, accountId ?? null, now, now, expiresAt);
    return { cookie: token, expiresAt, tokenHash };
  }

  status(identity: SessionIdentity): AccountStatus {
    if (!identity.accountId) return { state: 'guest' };
    const rows = this.database.prepare('SELECT provider,normalized_email,provider_avatar_url FROM auth_identities WHERE account_id=?').all(identity.accountId) as Array<{ provider: string; normalized_email: string | null; provider_avatar_url: string | null }>;
    const providers = {
      password: rows.some((row) => row.provider === 'password'),
      google: rows.some((row) => row.provider === 'google'),
      apple: rows.some((row) => row.provider === 'apple'),
    };
    const email = rows.find((row) => row.provider === 'password')?.normalized_email ?? rows.find((row) => row.normalized_email)?.normalized_email ?? undefined;
    const avatarUrl = rows.find((row) => row.provider === 'google' && row.provider_avatar_url)?.provider_avatar_url ?? undefined;
    return { state: 'account', email: email ?? undefined, avatarUrl, providers };
  }

  beginOAuthFlow(
    identity: SessionIdentity,
    provider: ProviderName,
    action: OAuthAction,
    redirectUri: string,
    returnTo: string,
    now = Date.now(),
  ): { state: string; nonce: string; codeVerifier?: string } | undefined {
    if (action === 'link' ? !identity.accountId : Boolean(identity.accountId)) return undefined;
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = provider === 'google' ? randomBytes(48).toString('base64url') : undefined;
    this.database.prepare(`INSERT INTO oauth_flows(
      state_hash,provider,action,session_token_hash,account_id,nonce,code_verifier,redirect_uri,return_to,created_at,expires_at,consumed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(
      hashToken(state), provider, action, identity.tokenHash, identity.accountId ?? null, nonce,
      codeVerifier ?? null, redirectUri, returnTo, now, now + 10 * 60_000,
    );
    return { state, nonce, codeVerifier };
  }

  consumeOAuthFlow(state: string, provider: ProviderName, now = Date.now()): OAuthFlow | undefined {
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(state)) return undefined;
    const stateHash = hashToken(state);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const row = this.database.prepare(`SELECT provider,action,session_token_hash,account_id,nonce,code_verifier,redirect_uri,return_to
        FROM oauth_flows WHERE state_hash=? AND provider=? AND consumed_at IS NULL AND expires_at>?`).get(stateHash, provider, now) as {
          provider: ProviderName; action: OAuthAction; session_token_hash: string; account_id: string | null;
          nonce: string; code_verifier: string | null; redirect_uri: string; return_to: string;
        } | undefined;
      if (!row) { this.database.exec('ROLLBACK'); return undefined; }
      const consumed = this.database.prepare('UPDATE oauth_flows SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL').run(now, stateHash);
      const session = this.resolveTokenHash(row.session_token_hash, now);
      if (!consumed.changes || !session || (row.action === 'link' && (!row.account_id || session.accountId !== row.account_id))) {
        this.database.exec('ROLLBACK'); return undefined;
      }
      this.database.exec('COMMIT');
      return { provider: row.provider, action: row.action, session, nonce: row.nonce, codeVerifier: row.code_verifier ?? undefined, redirectUri: row.redirect_uri, returnTo: row.return_to };
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  completeProviderAuth(
    flow: OAuthFlow,
    verified: { provider: ProviderName; subject: string; email?: string; displayName?: string; avatarUrl?: string; tokenHash: string; expiresAt: number },
    now = Date.now(),
  ): ProviderAuthResult {
    if (flow.provider !== verified.provider || verified.expiresAt <= now) return { ok: false, error: 'Provider authentication failed.' };
    const email = normalizeAccountEmail(verified.email);
    const avatarUrl = normalizeProviderAvatarUrl(verified.provider, verified.avatarUrl);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      if (this.database.prepare('SELECT 1 FROM provider_token_replays WHERE token_hash=?').get(verified.tokenHash)) {
        this.database.exec('ROLLBACK'); return { ok: false, error: 'Provider authentication failed.' };
      }
      this.database.prepare('INSERT INTO provider_token_replays(token_hash,provider,used_at,expires_at) VALUES(?,?,?,?)')
        .run(verified.tokenHash, verified.provider, now, verified.expiresAt);
      const existing = this.database.prepare('SELECT account_id FROM auth_identities WHERE provider=? AND provider_subject=?')
        .get(verified.provider, verified.subject) as { account_id: string } | undefined;

      let accountId: string;
      let pilotId: string;
      let guestPreserved = false;
      if (existing) {
        accountId = existing.account_id;
        if (flow.action === 'link' && flow.session.accountId !== accountId) {
          this.database.exec('ROLLBACK'); return { ok: false, error: 'That provider is linked to another account.' };
        }
        if (flow.action === 'login' && flow.session.accountId) {
          this.database.exec('ROLLBACK'); return { ok: false, error: 'Use Link from your signed-in account.' };
        }
        const link = this.database.prepare('SELECT pilot_id FROM account_profile_links WHERE account_id=?').get(accountId) as { pilot_id: string } | undefined;
        if (!link?.pilot_id) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Provider authentication failed.' }; }
        pilotId = link.pilot_id;
        guestPreserved = !flow.session.accountId && flow.session.pilotId !== pilotId;
        this.database.prepare(`UPDATE auth_identities SET
          normalized_email=COALESCE(normalized_email,?), provider_display_name=COALESCE(provider_display_name,?),
          provider_avatar_url=COALESCE(?,provider_avatar_url), updated_at=?
          WHERE provider=? AND provider_subject=?`).run(email ?? null, verified.displayName ?? null, avatarUrl ?? null, now, verified.provider, verified.subject);
      } else {
        const collision = email ? this.database.prepare('SELECT account_id FROM auth_identities WHERE normalized_email=? AND account_id IS NOT ? LIMIT 1')
          .get(email, flow.session.accountId ?? '') as { account_id: string } | undefined : undefined;
        if (collision) {
          this.database.exec('ROLLBACK');
          return { ok: false, collision: true, error: 'Sign in to your existing account first, then link this provider.' };
        }
        if (flow.action === 'link') {
          if (!flow.session.accountId) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Sign in before linking a provider.' }; }
          accountId = flow.session.accountId;
          const link = this.database.prepare('SELECT pilot_id FROM account_profile_links WHERE account_id=?').get(accountId) as { pilot_id: string } | undefined;
          if (!link?.pilot_id) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Provider authentication failed.' }; }
          pilotId = link.pilot_id;
        } else {
          if (flow.session.accountId) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Use Link from your signed-in account.' }; }
          accountId = randomUUID(); pilotId = flow.session.pilotId;
          this.database.prepare('INSERT INTO accounts(account_id,created_at,updated_at) VALUES(?,?,?)').run(accountId, now, now);
          this.database.prepare('INSERT INTO account_profile_links(account_id,pilot_id,linked_at) VALUES(?,?,?)').run(accountId, pilotId, now);
        }
        this.database.prepare(`INSERT INTO auth_identities(
          identity_id,account_id,provider,provider_subject,normalized_email,password_hash,provider_display_name,provider_avatar_url,created_at,updated_at
        ) VALUES(?,?,?,?,?,NULL,?,?,?,?)`).run(randomUUID(), accountId, verified.provider, verified.subject, email ?? null, verified.displayName ?? null, avatarUrl ?? null, now, now);
      }

      const rotated = this.database.prepare('UPDATE pilot_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?')
        .run(now, flow.session.tokenHash, now);
      if (!rotated.changes) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Provider authentication failed.' }; }
      const issued = this.insertSession(pilotId, accountId, now, accountSessionLifetimeMs);
      this.database.prepare('UPDATE player_profiles SET legacy_imported=1 WHERE pilot_id=?').run(pilotId);
      this.database.prepare('UPDATE accounts SET updated_at=? WHERE account_id=?').run(now, accountId);
      this.database.exec('COMMIT');
      return { ok: true, identity: { pilotId, accountId, tokenHash: issued.tokenHash }, cookie: issued.cookie, expiresAt: issued.expiresAt, guestPreserved };
    } catch (error) {
      this.database.exec('ROLLBACK');
      if (String(error).includes('UNIQUE constraint failed')) return { ok: false, error: 'Provider authentication failed.' };
      throw error;
    }
  }

  async signUp(identity: SessionIdentity, emailValue: unknown, passwordValue: unknown, now = Date.now()): Promise<AuthResult> {
    const email = normalizeAccountEmail(emailValue);
    if (!email || !validAccountPassword(passwordValue) || identity.accountId) return { ok: false, error: 'Unable to create account with those details.' };
    const passwordDigest = await passwordHash(passwordValue); const accountId = randomUUID();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      if (this.database.prepare('SELECT 1 FROM auth_identities WHERE normalized_email=?').get(email)) {
        this.database.exec('ROLLBACK'); return { ok: false, error: 'Unable to create account with those details.' };
      }
      this.database.prepare('INSERT INTO accounts(account_id,created_at,updated_at) VALUES(?,?,?)').run(accountId, now, now);
      this.database.prepare('INSERT INTO auth_identities(identity_id,account_id,provider,provider_subject,normalized_email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(randomUUID(), accountId, 'password', email, email, passwordDigest, now, now);
      this.database.prepare('INSERT INTO account_profile_links(account_id,pilot_id,linked_at) VALUES(?,?,?)').run(accountId, identity.pilotId, now);
      const rotated = this.database.prepare('UPDATE pilot_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').run(now, identity.tokenHash, now);
      if (!rotated.changes) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Unable to create account with those details.' }; }
      const issued = this.insertSession(identity.pilotId, accountId, now, accountSessionLifetimeMs);
      this.database.prepare('UPDATE player_profiles SET legacy_imported=1 WHERE pilot_id=?').run(identity.pilotId);
      this.database.exec('COMMIT');
      return { ok: true, identity: { pilotId: identity.pilotId, accountId, tokenHash: issued.tokenHash }, cookie: issued.cookie, expiresAt: issued.expiresAt };
    } catch (error) {
      this.database.exec('ROLLBACK');
      if (String(error).includes('UNIQUE constraint failed')) return { ok: false, error: 'Unable to create account with those details.' };
      throw error;
    }
  }

  async signIn(identity: SessionIdentity, emailValue: unknown, passwordValue: unknown, now = Date.now()): Promise<AuthResult> {
    const email = normalizeAccountEmail(emailValue); const usablePassword = validAccountPassword(passwordValue);
    const row = email ? this.database.prepare("SELECT account_id,password_hash FROM auth_identities WHERE provider='password' AND normalized_email=?").get(email) as { account_id: string; password_hash: string } | undefined : undefined;
    const digest = row?.password_hash ?? await this.dummyPasswordHash;
    const matches = usablePassword ? await passwordMatches(passwordValue, digest) : false;
    if (!row || !matches) return { ok: false, error: genericCredentialsError };
    const link = this.database.prepare('SELECT pilot_id FROM account_profile_links WHERE account_id=?').get(row.account_id) as { pilot_id?: string } | undefined;
    if (!link?.pilot_id) return { ok: false, error: genericCredentialsError };
    const guestPreserved = !identity.accountId && identity.pilotId !== link.pilot_id;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const rotated = this.database.prepare('UPDATE pilot_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').run(now, identity.tokenHash, now);
      if (!rotated.changes) { this.database.exec('ROLLBACK'); return { ok: false, error: genericCredentialsError }; }
      const issued = this.insertSession(link.pilot_id, row.account_id, now, accountSessionLifetimeMs);
      this.database.prepare('UPDATE player_profiles SET legacy_imported=1 WHERE pilot_id=?').run(link.pilot_id);
      this.database.prepare('UPDATE accounts SET updated_at=? WHERE account_id=?').run(now, row.account_id);
      this.database.exec('COMMIT');
      return { ok: true, identity: { pilotId: link.pilot_id, accountId: row.account_id, tokenHash: issued.tokenHash }, cookie: issued.cookie, expiresAt: issued.expiresAt, guestPreserved };
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  signOut(identity: SessionIdentity, now = Date.now()): AuthResult {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const revoked = this.database.prepare('UPDATE pilot_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').run(now, identity.tokenHash, now);
      if (!revoked.changes) { this.database.exec('ROLLBACK'); return { ok: false, error: 'Unable to log out.' }; }
      const pilotId = randomUUID();
      this.database.prepare('INSERT OR IGNORE INTO pilot_session_migrations(pilot_id,migrated_at) VALUES(?,?)').run(pilotId, now);
      const issued = this.insertSession(pilotId, undefined, now, guestSessionLifetimeMs);
      this.database.exec('COMMIT');
      return { ok: true, identity: { pilotId, tokenHash: issued.tokenHash }, cookie: issued.cookie, expiresAt: issued.expiresAt };
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  revoke(tokenHash: string, now = Date.now()): boolean {
    return this.database.prepare('UPDATE pilot_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now, tokenHash).changes > 0;
  }

  cookie(token: string, secure: boolean, expiresAt = Date.now() + guestSessionLifetimeMs, sameSite: 'Lax' | 'None' = 'Lax'): string {
    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1_000));
    if (sameSite === 'None' && !secure) throw new Error('SameSite=None session cookies require Secure.');
    return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  prune(now = Date.now()): void {
    this.database.prepare('DELETE FROM pilot_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)').run(now, now - 7 * 24 * 60 * 60_000);
    this.database.prepare('DELETE FROM oauth_flows WHERE expires_at <= ? OR (consumed_at IS NOT NULL AND consumed_at <= ?)').run(now, now - 24 * 60 * 60_000);
    this.database.prepare('DELETE FROM provider_token_replays WHERE expires_at <= ?').run(now);
  }
}
