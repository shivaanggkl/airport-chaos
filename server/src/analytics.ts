import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type AnalyticsEnvironment = 'production' | 'development';
export type AnalyticsEventName =
  | 'session_started' | 'game_started' | 'takeoff' | 'successful_landing' | 'crash'
  | 'aircraft_unlocked' | 'credits_earned' | 'mission_completed' | 'territory_captured' | 'session_ended';

export type AnalyticsContext = {
  pilotId: string;
  sessionId?: string;
  environment: AnalyticsEnvironment;
  host: string;
  cityId?: string;
  aircraftType?: string;
};

const retentionMs = 180 * 24 * 60 * 60 * 1_000;
const validEventNames = new Set<AnalyticsEventName>([
  'session_started', 'game_started', 'takeoff', 'successful_landing', 'crash', 'aircraft_unlocked',
  'credits_earned', 'mission_completed', 'territory_captured', 'session_ended',
]);

function compactText(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

export function analyticsHost(rawHost: string | undefined): { host: string; environment: AnalyticsEnvironment } {
  const host = (rawHost ?? 'unknown').split(':')[0]!.toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 120) || 'unknown';
  return { host, environment: host === 'fly.vadensoftware.com' ? 'production' : 'development' };
}

export function validAdminPassword(authorization: string | undefined, expectedHash: string | undefined): boolean {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash) || !authorization?.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const password = decoded.slice(decoded.indexOf(':') + 1);
    const supplied = createHash('sha256').update(password).digest();
    const expected = Buffer.from(expectedHash, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch { return false; }
}

export class AnalyticsStore {
  private readonly database: DatabaseSync;

  constructor(filePath: string) {
    this.database = new DatabaseSync(filePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS analytics_sessions (
        session_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, environment TEXT NOT NULL, host TEXT NOT NULL,
        city_id TEXT, aircraft_type TEXT, started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, event_name TEXT NOT NULL, pilot_id TEXT NOT NULL, session_id TEXT,
        environment TEXT NOT NULL, host TEXT NOT NULL, city_id TEXT, aircraft_type TEXT,
        amount INTEGER, source TEXT, metadata TEXT, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS analytics_sessions_environment_started ON analytics_sessions(environment, started_at);
      CREATE INDEX IF NOT EXISTS analytics_sessions_pilot_started ON analytics_sessions(pilot_id, started_at);
      CREATE INDEX IF NOT EXISTS analytics_events_environment_created ON analytics_events(environment, created_at);
      CREATE INDEX IF NOT EXISTS analytics_events_name_created ON analytics_events(event_name, created_at);
    `);
  }

  startSession(context: AnalyticsContext, now = Date.now()): void {
    if (!context.sessionId) return;
    const sessionId = context.sessionId;
    this.safe(() => {
      this.database.prepare(`INSERT OR IGNORE INTO analytics_sessions
        (session_id,pilot_id,environment,host,city_id,aircraft_type,started_at,last_seen_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(sessionId, context.pilotId, context.environment, context.host,
          compactText(context.cityId, 40) ?? null, compactText(context.aircraftType, 40) ?? null, now, now);
      this.recordEvent(context, 'session_started', {}, now);
      this.recordEvent(context, 'game_started', {}, now);
    });
  }

  heartbeat(sessionId: string, aircraftType?: string, now = Date.now()): void {
    this.safe(() => this.database.prepare('UPDATE analytics_sessions SET last_seen_at = ?, aircraft_type = COALESCE(?, aircraft_type) WHERE session_id = ? AND ended_at IS NULL')
      .run(now, compactText(aircraftType, 40) ?? null, sessionId));
  }

  endSession(context: AnalyticsContext, now = Date.now()): void {
    if (!context.sessionId) return;
    const sessionId = context.sessionId;
    this.safe(() => {
      this.database.prepare('UPDATE analytics_sessions SET last_seen_at = ?, ended_at = ? WHERE session_id = ? AND ended_at IS NULL').run(now, now, sessionId);
      this.recordEvent(context, 'session_ended', {}, now);
    });
  }

  recordEvent(context: AnalyticsContext, eventName: AnalyticsEventName, details: { amount?: number; source?: string; metadata?: Record<string, string | number | boolean> } = {}, now = Date.now()): void {
    if (!validEventNames.has(eventName)) return;
    this.safe(() => {
      const amount = Number.isSafeInteger(details.amount) ? Math.max(-1_000_000, Math.min(1_000_000, details.amount!)) : null;
      const metadata = details.metadata ? JSON.stringify(Object.fromEntries(Object.entries(details.metadata).slice(0, 8))).slice(0, 512) : null;
      this.database.prepare(`INSERT INTO analytics_events
        (event_name,pilot_id,session_id,environment,host,city_id,aircraft_type,amount,source,metadata,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(eventName, context.pilotId, context.sessionId ?? null, context.environment, context.host,
          compactText(context.cityId, 40) ?? null, compactText(context.aircraftType, 40) ?? null, amount,
          compactText(details.source, 80) ?? null, metadata, now);
    });
  }

  prune(now = Date.now()): void {
    this.safe(() => {
      const cutoff = now - retentionMs;
      this.database.prepare('DELETE FROM analytics_events WHERE created_at < ?').run(cutoff);
      this.database.prepare('DELETE FROM analytics_sessions WHERE COALESCE(ended_at,last_seen_at) < ?').run(cutoff);
    });
  }

  dashboardHtml(productionOnly = true, now = Date.now()): string {
    const environment = productionOnly ? 'production' : undefined;
    const windows = [['TODAY', 24 * 60 * 60_000], ['LAST 7 DAYS', 7 * 24 * 60 * 60_000], ['LAST 30 DAYS', 30 * 24 * 60 * 60_000]] as const;
    const cards = windows.map(([label, duration]) => this.summary(label, now - duration, environment, now)).join('');
    const filter = environment ? 'AND environment = ?' : '';
    const args = environment ? [now - 30 * 24 * 60 * 60_000, environment] : [now - 30 * 24 * 60 * 60_000];
    const unlocks = this.database.prepare(`SELECT COALESCE(aircraft_type,'Unknown') aircraft, COUNT(*) count FROM analytics_events WHERE event_name='aircraft_unlocked' AND created_at >= ? ${filter} GROUP BY aircraft_type ORDER BY count DESC`).all(...args) as Array<{ aircraft: string; count: number }>;
    const unlockRows = unlocks.length ? unlocks.map(row => `<tr><td>${escapeHtml(row.aircraft)}</td><td>${row.count}</td></tr>`).join('') : '<tr><td colspan="2">No unlocks yet</td></tr>';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Airport Chaos Analytics</title><style>body{margin:0;background:#07111f;color:#e8f4ff;font:14px system-ui;padding:28px}h1{margin:0 0 6px;color:#65cfff}.sub{color:#8da6ba;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#0d2032;border:1px solid #274b63;border-radius:12px;padding:18px}.metrics{display:grid;grid-template-columns:1fr auto;gap:8px 18px}.metrics b{color:#fff}.metrics span{color:#9eb5c7}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #20394b}a{color:#65cfff}</style></head><body><h1>Airport Chaos Analytics</h1><div class="sub">${productionOnly ? 'Production only · fly.vadensoftware.com' : 'All environments'} · analytics begins at deployment</div><div class="grid">${cards}</div><div class="card" style="margin-top:16px"><h2>Aircraft unlocks · 30 days</h2><table>${unlockRows}</table></div></body></html>`;
  }

  private summary(label: string, since: number, environment: string | undefined, now: number): string {
    const envSession = environment ? 'AND environment = ?' : '';
    const envEvent = environment ? 'AND environment = ?' : '';
    const sessionArgs = environment ? [since, environment] : [since];
    const eventArgs = environment ? [since, environment] : [since];
    const sessions = this.database.prepare(`SELECT COUNT(*) sessions, COUNT(DISTINCT pilot_id) players, COALESCE(AVG(MAX(0,COALESCE(ended_at,last_seen_at)-started_at)),0) avg_ms FROM analytics_sessions WHERE started_at >= ? ${envSession}`).get(...sessionArgs) as { sessions: number; players: number; avg_ms: number };
    const newPlayers = this.database.prepare(`SELECT COUNT(*) count FROM (SELECT pilot_id, MIN(started_at) first_at FROM analytics_sessions ${environment ? 'WHERE environment = ?' : ''} GROUP BY pilot_id HAVING first_at >= ?)`)
      .get(...(environment ? [environment, since] : [since])) as { count: number };
    const returnPlayers = Math.max(0, sessions.players - newPlayers.count);
    const rows = this.database.prepare(`SELECT event_name, COUNT(*) count, COALESCE(SUM(amount),0) amount FROM analytics_events WHERE created_at >= ? ${envEvent} GROUP BY event_name`).all(...eventArgs) as Array<{ event_name: string; count: number; amount: number }>;
    const values = new Map(rows.map(row => [row.event_name, row]));
    const count = (name: string) => values.get(name)?.count ?? 0;
    const metric = (name: string, value: string | number) => `<span>${name}</span><b>${value}</b>`;
    return `<section class="card"><h2>${label}</h2><div class="metrics">${metric('Unique Players', sessions.players)}${metric('New Players', newPlayers.count)}${metric('Return Players', returnPlayers)}${metric('Sessions', sessions.sessions)}${metric('Game Starts', count('game_started'))}${metric('Avg Session Time', formatDuration(sessions.avg_ms))}${metric('Successful Landings', count('successful_landing'))}${metric('Crashes', count('crash'))}${metric('Credits Earned', (values.get('credits_earned')?.amount ?? 0).toLocaleString())}${metric('Aircraft Unlocks', count('aircraft_unlocked'))}${metric('Missions Completed', count('mission_completed'))}${metric('Territory Captures', count('territory_captured'))}</div></section>`;
  }

  private safe(action: () => void): void { try { action(); } catch (error) { console.error('[analytics] write failed', error instanceof Error ? error.message : 'unknown'); } }
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
function formatDuration(milliseconds: number): string { const seconds = Math.max(0, Math.round(milliseconds / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
