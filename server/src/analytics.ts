import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import type { PurchaseMetrics, PurchaseMetricsByMode, StripeMode } from './firehawk-payments.js';

export type AnalyticsEnvironment = 'production' | 'development';
export type AnalyticsEventName =
  | 'session_started' | 'game_started' | 'takeoff' | 'successful_landing' | 'crash'
  | 'aircraft_unlocked' | 'credits_earned' | 'mission_completed' | 'territory_captured' | 'session_ended'
  | 'fighter_modal_viewed' | 'fighter_trial_started' | 'fighter_trial_completed' | 'fighter_purchase_clicked'
  | 'fighter_checkout_created' | 'fighter_purchase_completed' | 'fighter_checkout_cancelled'
  | 'fighter_purchase_refunded'
  | 'purchase_recovery_created' | 'purchase_recovery_succeeded'
  | 'daily_streak_claimed' | 'pilot_level_up' | 'personal_record_broken' | 'weekly_reward_awarded'
  | 'pvp_challenge_sent' | 'pvp_challenge_accepted' | 'pvp_challenge_completed'
  | 'referral_attached' | 'referral_qualified';

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
  'fighter_modal_viewed', 'fighter_trial_started', 'fighter_trial_completed', 'fighter_purchase_clicked',
  'fighter_checkout_created', 'fighter_purchase_completed', 'fighter_checkout_cancelled',
  'fighter_purchase_refunded',
  'purchase_recovery_created', 'purchase_recovery_succeeded',
  'daily_streak_claimed', 'pilot_level_up', 'personal_record_broken', 'weekly_reward_awarded',
  'pvp_challenge_sent', 'pvp_challenge_accepted', 'pvp_challenge_completed', 'referral_attached', 'referral_qualified',
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
    // Stripe was sandbox-only before event mode metadata existed.
    this.database.prepare(`UPDATE analytics_events SET metadata=json_set(COALESCE(metadata,'{}'),'$.stripeMode','test')
      WHERE event_name IN ('fighter_checkout_created','fighter_purchase_completed')
      AND json_extract(COALESCE(metadata,'{}'),'$.stripeMode') IS NULL`).run();
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

  testerEntitlementPilots(): string[] {
    return (this.database.prepare(`SELECT DISTINCT pilot_id FROM analytics_events WHERE event_name='aircraft_unlocked' AND source='tester_code'`).all() as Array<{ pilot_id: string }>)
      .map(row => row.pilot_id);
  }

  dashboardHtml(productionOnly = true, now = Date.now(), purchases?: PurchaseMetricsByMode, stripeMode: StripeMode = 'test'): string {
    const environment = productionOnly ? 'production' : undefined;
    const windows = [['TODAY', 24 * 60 * 60_000], ['LAST 7 DAYS', 7 * 24 * 60 * 60_000], ['LAST 30 DAYS', 30 * 24 * 60 * 60_000]] as const;
    const cards = windows.map(([label, duration]) => this.summary(label, now - duration, environment, now)).join('');
    const filter = environment ? 'AND environment = ?' : '';
    const args = environment ? [now - 30 * 24 * 60 * 60_000, environment] : [now - 30 * 24 * 60 * 60_000];
    const unlocks = this.database.prepare(`SELECT COALESCE(aircraft_type,'Unknown') aircraft, COUNT(*) count FROM analytics_events WHERE event_name='aircraft_unlocked' AND created_at >= ? ${filter} GROUP BY aircraft_type ORDER BY count DESC`).all(...args) as Array<{ aircraft: string; count: number }>;
    const unlockRows = unlocks.length ? unlocks.map(row => `<tr><td>${escapeHtml(row.aircraft)}</td><td>${row.count}</td></tr>`).join('') : '<tr><td colspan="2">No unlocks yet</td></tr>';
    const purchaseCard = (mode: StripeMode, metrics: PurchaseMetrics | undefined) => {
      const rows = metrics?.rows.length ? metrics.rows.map(row => `<tr><td>${escapeHtml(row.reference)}</td><td>${escapeHtml(row.pilotId.slice(0, 8))}</td><td>${formatFirehawkAmount(row.amount)}</td><td>${formatFirehawkAmount(row.refundedAmount)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.email ?? '—')}</td></tr>`).join('') : '<tr><td colspan="6">No purchases yet</td></tr>';
      const completedEvents = metrics?.purchases ?? 0;
      const activeFunnel = mode === stripeMode
        ? metricHtml('Trial starts', this.eventCount('fighter_trial_started', environment)) + metricHtml('Trial completions', this.eventCount('fighter_trial_completed', environment)) + metricHtml('Trial → purchase', `${conversion(completedEvents, this.eventCount('fighter_trial_started', environment))}%`)
        : '';
      return `<div class="card" style="margin-top:16px"><h2>${mode.toUpperCase()} · Firehawk purchases</h2><div class="metrics">${metricHtml('Active paid purchases', metrics?.purchases ?? 0)}${metricHtml(mode === 'live' ? 'Gross sales' : 'Sandbox gross', formatFirehawkAmount(metrics?.grossRevenue ?? 0))}${metricHtml('Refunded purchases', metrics?.refundedPurchases ?? 0)}${metricHtml('Refunds', formatFirehawkAmount(metrics?.refundedAmount ?? 0))}${metricHtml(mode === 'live' ? 'Net revenue' : 'Sandbox net', formatFirehawkAmount(metrics?.netRevenue ?? 0))}${metricHtml('Checkout starts', this.stripeEventCount('fighter_checkout_created', mode, environment))}${mode === stripeMode ? metricHtml('Configured Stripe mode', mode.toUpperCase()) + activeFunnel : ''}</div><table><tr><td>Reference</td><td>Pilot</td><td>Amount</td><td>Refunded</td><td>Status</td><td>Support email</td></tr>${rows}</table></div>`;
    };
    const purchaseCards = purchaseCard('live', purchases?.live) + purchaseCard('test', purchases?.test);
    const modeLabel = stripeMode === 'test' ? 'STRIPE TEST MODE / SANDBOX' : 'STRIPE LIVE MODE';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Airport Chaos Analytics</title><style>body{margin:0;background:#07111f;color:#e8f4ff;font:14px system-ui;padding:28px}h1{margin:0 0 6px;color:#65cfff}.sub{color:#8da6ba;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#0d2032;border:1px solid #274b63;border-radius:12px;padding:18px}.metrics{display:grid;grid-template-columns:1fr auto;gap:8px 18px}.metrics b{color:#fff}.metrics span{color:#9eb5c7}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #20394b}a{color:#65cfff}</style></head><body><h1>Airport Chaos Analytics</h1><div class="sub">${modeLabel} · ${productionOnly ? 'Production only · fly.vadensoftware.com' : 'All environments'} · analytics begins at deployment</div><div class="grid">${cards}</div><div class="card" style="margin-top:16px"><h2>Aircraft unlocks · 30 days</h2><table>${unlockRows}</table></div>${purchaseCards}</body></html>`;
  }

  private eventCount(name: AnalyticsEventName, environment?: string): number {
    const row = this.database.prepare(`SELECT COUNT(*) count FROM analytics_events WHERE event_name=? ${environment ? 'AND environment=?' : ''}`).get(...(environment ? [name, environment] : [name])) as { count: number };
    return row.count;
  }

  private stripeEventCount(name: 'fighter_checkout_created' | 'fighter_purchase_completed', mode: StripeMode, environment?: string): number {
    const row = this.database.prepare(`SELECT COUNT(*) count FROM analytics_events WHERE event_name=? AND json_extract(COALESCE(metadata,'{}'),'$.stripeMode')=? ${environment ? 'AND environment=?' : ''}`)
      .get(...(environment ? [name, mode, environment] : [name, mode])) as { count: number };
    return row.count;
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
function formatFirehawkAmount(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: firehawkProduct.currency.toUpperCase() }).format(cents / 100);
}
function formatDuration(milliseconds: number): string { const seconds = Math.max(0, Math.round(milliseconds / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function metricHtml(name: string, value: string | number): string { return `<span>${escapeHtml(name)}</span><b>${escapeHtml(String(value))}</b>`; }
function conversion(purchases: number, trials: number): string { return (trials ? purchases / trials * 100 : 0).toFixed(1); }
