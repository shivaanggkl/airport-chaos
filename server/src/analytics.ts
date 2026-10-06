import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import type { PurchaseMetrics, PurchaseMetricsByMode, StripeMode } from './firehawk-payments.js';
import { clientIntentProperties, legacyEventNames, serverMilestoneEvents, type ClientIntentEvent } from './analytics-catalog.js';
import { businessReport, type BusinessReport } from './analytics-report.js';

export type AnalyticsEnvironment = 'production' | 'development';
export type AnalyticsEventName =
  | ClientIntentEvent | typeof serverMilestoneEvents[number]
  | 'session_started' | 'game_started' | 'takeoff' | 'successful_landing' | 'crash'
  | 'aircraft_unlocked' | 'credits_earned' | 'mission_completed' | 'territory_captured' | 'session_ended'
  | 'fighter_modal_viewed' | 'fighter_trial_started' | 'fighter_trial_completed' | 'fighter_purchase_clicked'
  | 'fighter_checkout_created' | 'fighter_purchase_completed' | 'fighter_checkout_cancelled'
  | 'fighter_purchase_refunded'
  | 'purchase_recovery_created' | 'purchase_recovery_succeeded'
  | 'daily_streak_claimed' | 'pilot_level_up' | 'personal_record_broken' | 'weekly_reward_awarded'
  | 'pvp_challenge_sent' | 'pvp_challenge_accepted' | 'pvp_challenge_completed'
  | 'referral_attached' | 'referral_signup_attributed' | 'referral_qualified' | 'referral_inviter_rewarded' | 'referral_new_player_rewarded' | 'referral_cap_reached'
  | 'chaos_moment_started' | 'chaos_moment_completed' | 'secret_discovered'
  | 'photo_mode_opened' | 'cosmetic_unlocked' | 'cosmetic_equipped' | 'flight_recap_shown' | 'fly_again_clicked'
  | 'daily_flight_plan_viewed' | 'daily_flight_plan_task_completed' | 'daily_flight_plan_completed' | 'daily_flight_plan_reward_claimed'
  | 'landing_scored' | 'perfect_landing_earned'
  | 'season_points_earned' | 'season_level_reached' | 'weekly_event_viewed' | 'weekly_event_progressed' | 'weekly_event_completed' | 'weekly_event_reward_claimed'
  | 'city_entered' | 'city_exited' | 'intercity_route_started' | 'intercity_route_completed' | 'intercity_route_failed' | 'city_discovery_found' | 'city_airport_landed'
  | 'chaos_event_offered' | 'chaos_event_accepted' | 'chaos_event_skipped' | 'chaos_event_completed' | 'chaos_event_failed'
  | 'chaos_weather_zone_entered' | 'chaos_weather_zone_exited' | 'chaos_event_reward_claimed'
  | 'input_mode_detected' | 'touch_controls_enabled' | 'graphics_quality_changed' | 'mobile_layout_used' | 'photo_mode_touch_opened'
  | 'rewarded_ad_requested' | 'rewarded_ad_started' | 'rewarded_ad_dismissed' | 'rewarded_ad_failed' | 'rewarded_ad_pending' | 'rewarded_ad_granted' | 'rewarded_ad_limit_reached'
  | 'tutorial_started' | 'tutorial_step_completed' | 'tutorial_step_skipped' | 'tutorial_completed' | 'tutorial_skipped' | 'tutorial_retried' | 'tutorial_crashed';

export type AnalyticsContext = {
  pilotId: string;
  sessionId?: string;
  journeyId?: string;
  environment: AnalyticsEnvironment;
  host: string;
  cityId?: string;
  aircraftType?: string;
  platform?: 'desktop_web' | 'mobile_web' | 'ios' | 'android' | 'unknown';
};

const retentionMs = 180 * 24 * 60 * 60 * 1_000;
const validEventNames = new Set<AnalyticsEventName>([
  ...(Object.keys(clientIntentProperties) as ClientIntentEvent[]), ...serverMilestoneEvents,
  'session_started', 'game_started', 'takeoff', 'successful_landing', 'crash', 'aircraft_unlocked',
  'credits_earned', 'mission_completed', 'territory_captured', 'session_ended',
  'fighter_modal_viewed', 'fighter_trial_started', 'fighter_trial_completed', 'fighter_purchase_clicked',
  'fighter_checkout_created', 'fighter_purchase_completed', 'fighter_checkout_cancelled',
  'fighter_purchase_refunded',
  'purchase_recovery_created', 'purchase_recovery_succeeded',
  'daily_streak_claimed', 'pilot_level_up', 'personal_record_broken', 'weekly_reward_awarded',
  'pvp_challenge_sent', 'pvp_challenge_accepted', 'pvp_challenge_completed', 'referral_attached', 'referral_signup_attributed',
  'referral_qualified', 'referral_inviter_rewarded', 'referral_new_player_rewarded', 'referral_cap_reached',
  'chaos_moment_started', 'chaos_moment_completed', 'secret_discovered',
  'photo_mode_opened', 'cosmetic_unlocked', 'cosmetic_equipped', 'flight_recap_shown', 'fly_again_clicked',
  'daily_flight_plan_viewed', 'daily_flight_plan_task_completed', 'daily_flight_plan_completed', 'daily_flight_plan_reward_claimed',
  'landing_scored', 'perfect_landing_earned',
  'season_points_earned', 'season_level_reached', 'weekly_event_viewed', 'weekly_event_progressed', 'weekly_event_completed', 'weekly_event_reward_claimed',
  'city_entered', 'city_exited', 'intercity_route_started', 'intercity_route_completed', 'intercity_route_failed', 'city_discovery_found', 'city_airport_landed',
  'chaos_event_offered', 'chaos_event_accepted', 'chaos_event_skipped', 'chaos_event_completed', 'chaos_event_failed',
  'chaos_weather_zone_entered', 'chaos_weather_zone_exited', 'chaos_event_reward_claimed',
  'input_mode_detected', 'touch_controls_enabled', 'graphics_quality_changed', 'mobile_layout_used', 'photo_mode_touch_opened',
  'rewarded_ad_requested', 'rewarded_ad_started', 'rewarded_ad_dismissed', 'rewarded_ad_failed', 'rewarded_ad_pending', 'rewarded_ad_granted', 'rewarded_ad_limit_reached',
  'tutorial_started', 'tutorial_step_completed', 'tutorial_step_skipped', 'tutorial_completed', 'tutorial_skipped', 'tutorial_retried', 'tutorial_crashed',
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
        city_id TEXT, aircraft_type TEXT, platform TEXT, started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, event_name TEXT NOT NULL, pilot_id TEXT NOT NULL, session_id TEXT,
        environment TEXT NOT NULL, host TEXT NOT NULL, city_id TEXT, aircraft_type TEXT, platform TEXT, journey_id TEXT,
        amount INTEGER, source TEXT, metadata TEXT, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS analytics_sessions_environment_started ON analytics_sessions(environment, started_at);
      CREATE INDEX IF NOT EXISTS analytics_sessions_pilot_started ON analytics_sessions(pilot_id, started_at);
      CREATE INDEX IF NOT EXISTS analytics_events_environment_created ON analytics_events(environment, created_at);
      CREATE INDEX IF NOT EXISTS analytics_events_name_created ON analytics_events(event_name, created_at);
      CREATE INDEX IF NOT EXISTS analytics_events_pilot_name_created ON analytics_events(pilot_id,event_name,created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS analytics_activation_once ON analytics_events(pilot_id) WHERE event_name='flight_activated';
      CREATE UNIQUE INDEX IF NOT EXISTS analytics_daily_available_once ON analytics_events(pilot_id,source)
        WHERE event_name='daily_reward_available';
      CREATE UNIQUE INDEX IF NOT EXISTS analytics_firehawk_restore_once ON analytics_events(pilot_id,source)
        WHERE event_name='firehawk_restore_succeeded' AND source IS NOT NULL;
    `);
    for (const table of ['analytics_sessions', 'analytics_events']) {
      try { this.database.exec(`ALTER TABLE ${table} ADD COLUMN platform TEXT`); } catch { /* already migrated */ }
    }
    try { this.database.exec('ALTER TABLE analytics_events ADD COLUMN journey_id TEXT'); } catch { /* already migrated */ }
    this.database.exec('CREATE INDEX IF NOT EXISTS analytics_events_journey_created ON analytics_events(journey_id,created_at)');
    // Stripe was sandbox-only before event mode metadata existed.
    this.database.prepare(`UPDATE analytics_events SET metadata=json_set(COALESCE(metadata,'{}'),'$.stripeMode','test')
      WHERE event_name IN ('fighter_checkout_created','fighter_purchase_completed')
      AND json_extract(COALESCE(metadata,'{}'),'$.stripeMode') IS NULL`).run();
  }

  startSession(context: AnalyticsContext, now = Date.now()): void {
    if (!context.sessionId) return;
    const sessionId = context.sessionId;
    this.safe(() => {
      const inserted = this.database.prepare(`INSERT OR IGNORE INTO analytics_sessions
        (session_id,pilot_id,environment,host,city_id,aircraft_type,platform,started_at,last_seen_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(sessionId, context.pilotId, context.environment, context.host,
          compactText(context.cityId, 40) ?? null, compactText(context.aircraftType, 40) ?? null, context.platform ?? 'unknown', now, now);
      if (inserted.changes) this.recordEvent(context, 'session_started', {}, now);
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
      const ended = this.database.prepare('UPDATE analytics_sessions SET last_seen_at = ?, ended_at = ? WHERE session_id = ? AND ended_at IS NULL').run(now, now, sessionId);
      if (ended.changes) this.recordEvent(context, 'session_ended', {}, now);
    });
  }

  recordEvent(context: AnalyticsContext, eventName: AnalyticsEventName, details: { amount?: number; source?: string; metadata?: Record<string, string | number | boolean> } = {}, now = Date.now()): void {
    if (!validEventNames.has(eventName)) return;
    const storedName = legacyEventNames[eventName as keyof typeof legacyEventNames] ?? eventName;
    this.safe(() => {
      const amount = Number.isSafeInteger(details.amount) ? Math.max(-1_000_000, Math.min(1_000_000, details.amount!)) : null;
      const metadata = details.metadata ? JSON.stringify(Object.fromEntries(Object.entries(details.metadata)
        .filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) &&
          (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
            (typeof value === 'string' && value.length <= 80 && !value.includes('@'))))
        .slice(0, 8))).slice(0, 512) : null;
      this.database.prepare(`INSERT OR IGNORE INTO analytics_events
        (event_name,pilot_id,session_id,environment,host,city_id,aircraft_type,platform,journey_id,amount,source,metadata,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(storedName, context.pilotId, context.sessionId ?? null, context.environment, context.host,
          compactText(context.cityId, 40) ?? null, compactText(context.aircraftType, 40) ?? null, context.platform ?? 'unknown', context.journeyId ?? null, amount,
          compactText(details.source, 80) ?? null, metadata, now);
    });
  }

  /** One durable activation per pilot; retries and concurrent flights cannot inflate it. */
  recordActivation(context: AnalyticsContext, now = Date.now()): boolean {
    try {
      return this.database.prepare(`INSERT OR IGNORE INTO analytics_events
        (event_name,pilot_id,session_id,environment,host,city_id,aircraft_type,platform,journey_id,created_at)
        VALUES ('flight_activated',?,?,?,?,?,?,?,?,?)`).run(
          context.pilotId, context.sessionId ?? null, context.environment, context.host,
          context.cityId ?? null, context.aircraftType ?? null, context.platform ?? 'unknown', context.journeyId ?? null, now,
        ).changes === 1;
    } catch (error) { console.error('[analytics] activation write failed', error); return false; }
  }

  flightCreditsEarned(pilotId: string, startedAt: number, endedAt: number): number {
    try {
      const row = this.database.prepare(`SELECT COALESCE(SUM(amount),0) AS credits FROM wallet_transactions
        WHERE pilot_id=? AND currency='CREDITS' AND direction='CREDIT' AND created_at>=? AND created_at<=?
        AND reason IN ('FLIGHT_REWARD','MISSION_REWARD','LANDING_REWARD','COMBAT_REWARD','CHALLENGE_REWARD',
          'EVENT_REWARD','TERRITORY_REWARD','OBJECTIVE_REWARD','DISCOVERY_REWARD','INTERCITY_REWARD')`)
        .get(pilotId, startedAt, endedAt) as { credits: number };
      return row.credits;
    } catch { return 0; }
  }

  prune(now = Date.now()): void {
    this.safe(() => {
      const cutoff = now - retentionMs;
      // Keep the first verified activation durable for the pilot's lifetime.
      this.database.prepare("DELETE FROM analytics_events WHERE created_at < ? AND event_name <> 'flight_activated'").run(cutoff);
      this.database.prepare('DELETE FROM analytics_sessions WHERE COALESCE(ended_at,last_seen_at) < ?').run(cutoff);
    });
  }

  testerEntitlementPilots(): string[] {
    return (this.database.prepare(`SELECT DISTINCT pilot_id FROM analytics_events WHERE event_name='aircraft_unlocked' AND source='tester_code'`).all() as Array<{ pilot_id: string }>)
      .map(row => row.pilot_id);
  }

  businessReport(now = Date.now(), since = now - 30 * 86_400_000, environment?: AnalyticsEnvironment): BusinessReport {
    return businessReport(this.database, now, since, environment);
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
      const rows = metrics?.rows.length ? metrics.rows.map(row => `<tr><td>${escapeHtml(row.reference)}</td><td>${escapeHtml(row.pilotId.slice(0, 8))}</td><td>${formatFirehawkAmount(row.amount)}</td><td>${formatFirehawkAmount(row.refundedAmount)}</td><td>${escapeHtml(row.status)}</td></tr>`).join('') : '<tr><td colspan="5">No purchases yet</td></tr>';
      const completedEvents = metrics?.purchases ?? 0;
      const activeFunnel = mode === stripeMode
        ? metricHtml('Trial starts', this.eventCount('fighter_trial_started', environment)) + metricHtml('Trial completions', this.eventCount('fighter_trial_completed', environment)) + metricHtml('Trial → purchase', `${conversion(completedEvents, this.eventCount('fighter_trial_started', environment))}%`)
        : '';
      return `<div class="card" style="margin-top:16px"><h2>${mode.toUpperCase()} · Firehawk purchases</h2><div class="metrics">${metricHtml('Active paid purchases', metrics?.purchases ?? 0)}${metricHtml(mode === 'live' ? 'Gross sales' : 'Sandbox gross', formatFirehawkAmount(metrics?.grossRevenue ?? 0))}${metricHtml('Refunded purchases', metrics?.refundedPurchases ?? 0)}${metricHtml('Refunds', formatFirehawkAmount(metrics?.refundedAmount ?? 0))}${metricHtml(mode === 'live' ? 'Net revenue' : 'Sandbox net', formatFirehawkAmount(metrics?.netRevenue ?? 0))}${metricHtml('Checkout starts', this.stripeEventCount('fighter_checkout_created', mode, environment))}${mode === stripeMode ? metricHtml('Configured Stripe mode', mode.toUpperCase()) + activeFunnel : ''}</div><table><tr><td>Reference</td><td>Pilot</td><td>Amount</td><td>Refunded</td><td>Status</td></tr>${rows}</table></div>`;
    };
    const purchaseCards = purchaseCard('live', purchases?.live) + purchaseCard('test', purchases?.test);
    const modeLabel = stripeMode === 'test' ? 'STRIPE TEST MODE / SANDBOX' : 'STRIPE LIVE MODE';
    let businessCards = '';
    try {
      const report = this.businessReport(now, now - 30 * 86_400_000, environment);
      const card = (title: string, values: Array<[string, string | number]>) => `<section class="card"><h2>${escapeHtml(title)}</h2><div class="metrics">${values.map(([name, value]) => metricHtml(name, value)).join('')}</div></section>`;
      const percent = (part: number, whole: number) => `${(whole ? part / whole * 100 : 0).toFixed(1)}%`;
      const credits = (value: number) => value.toLocaleString();
      const reasonRows = (rows: Array<{ reason: string; credits: number }>) => rows.map(row => `<tr><td>${escapeHtml(row.reason)}</td><td>${credits(row.credits)}</td></tr>`).join('') || '<tr><td colspan="2">No transactions yet</td></tr>';
      businessCards = `<div class="grid" style="margin-top:16px">${card('Active players · 30 days', [
        ['New accounts', report.accounts], ['DAU', report.dau], ['Activated', report.activations],
        ['D1 return', `${report.d1}/${report.d1Eligible} (${percent(report.d1, report.d1Eligible)})`],
        ['D7 return', `${report.d7}/${report.d7Eligible} (${percent(report.d7, report.d7Eligible)})`],
        ['Gameplay D1 / D7', `${report.gameplayD1} / ${report.gameplayD7}`], ['Days active', report.daysActive],
        ['Sessions / flights per player', `${report.sessionsPerPlayer.toFixed(1)} / ${report.flightsPerPlayer.toFixed(1)}`],
        ['Active days per player', report.daysActivePerPlayer.toFixed(1)],
        ['Referral / other signups', `${report.referralAccounts} / ${report.organicOrUnknownAccounts}`],
      ])}${card('Gameplay · 30 days', [
        ['Flights', report.flights], ['Active minutes', report.activeMinutes], ['Airborne minutes', report.airborneMinutes],
        ['Landings', report.landings], ['Missions', report.missions],
      ])}${card('Retention · 30 days', [
        ['Daily available / clicks / claims', `${report.dailyAvailable} / ${report.dailyClaimClicks} / ${report.dailyClaims}`],
        ['Repeat daily claimers', report.dailyRepeatClaimers],
        ['Day 1–7 claims', report.dailyByDay.map(row => `${row.day}:${row.claims}`).join(' · ') || '—'],
        ['Ad requests / starts', `${report.adRequests} / ${report.adStarts}`],
        ['Ad verified / granted', `${report.adVerified} / ${report.rewardedAdGrants}`], ['Ad limit reached', report.adLimitReached],
        ['Ad dismiss / no-fill / fail', `${report.adDismissals} / ${report.adNoFill} / ${report.adFailures}`],
        ['Invite views / shares', `${report.inviteViews} / ${report.inviteShares}`],
        ['Referral signups / qualifications', `${report.referralSignups} / ${report.referralQualifications}`],
        ['Share → signup', percent(report.referralSignups, report.inviteShares)],
        ['Signup → qualification', percent(report.referralQualifications, report.referralSignups)],
        ['Referral D1 / D7', `${report.referredD1}/${report.referredD1Eligible} · ${report.referredD7}/${report.referredD7Eligible}`],
        ['Avg days to qualify', report.averageReferralQualificationDays.toFixed(1)],
        ['Referred Credits spent', credits(report.referredCreditsSpent)],
      ])}${card('Credit economy · 30 days', [
        ['Credits created', credits(report.creditsCreated)], ['Credits spent', credits(report.creditsSpent)],
        ['Net change', credits(report.netCredits)], ['Gameplay Earn Share', `${(report.gameplayEarnShare * 100).toFixed(1)}%`],
        ['Average / median balance', `${Math.round(report.averageBalance).toLocaleString()} / ${Math.round(report.medianBalance).toLocaleString()}`],
        ['Can afford MAMMOTH / NIGHTOWL', `${report.mammothAffordablePercent.toFixed(1)}% / ${report.nightowlAffordablePercent.toFixed(1)}%`],
        ['Avg days to Credit aircraft unlock', report.averageUnlockDays.toFixed(1)],
      ])}${card('FIREHAWK funnel · 30 days', [
        ['Views / trials', `${report.firehawkViews} / ${report.firehawkTrials}`],
        ['Trial completions', report.firehawkTrialCompletions],
        ['Purchase starts / successes', `${report.firehawkPurchaseStarts} / ${report.firehawkPurchases}`],
        ['Trial → purchase', percent(report.firehawkTrialPurchaseConversions, report.firehawkTrialPilots)],
        ['Matched trial → purchase', `${report.firehawkTrialPurchaseConversions} pilots`],
        ['Fighter flights after purchase', report.flightsAfterFirehawkPurchase],
        ['Restore successes', report.firehawkRestoreSuccesses],
      ])}${card('Data quality', [
        ['Negative wallets', report.diagnostics.negativeBalances], ['Wallet balance mismatches', report.diagnostics.walletMismatches],
        ['Duplicate referral payouts', report.diagnostics.duplicateReferralPayouts],
        ['Firehawk entitlement without source', report.diagnostics.firehawkEntitlementWithoutSource],
        ['Ad grants exceed verification', report.diagnostics.adGrantsWithoutVerification ? 'YES' : 'NO'],
      ])}</div><div class="grid" style="margin-top:16px"><section class="card"><h2>Credit sources</h2><table>${reasonRows(report.creditSources)}</table></section><section class="card"><h2>Credit sinks</h2><table>${reasonRows(report.creditSinks)}</table></section><section class="card"><h2>Aircraft · views / selections / equips / flights / airborne min / unlocks</h2><table>${report.aircraft.map(row => `<tr><td>${escapeHtml(row.aircraft)}</td><td>${row.views} / ${row.selections} / ${row.equips} / ${row.flights} / ${row.airborneMinutes} / ${row.unlocks}</td></tr>`).join('')}</table></section><section class="card"><h2>Cities · flights / airborne min / landings</h2><table>${report.cities.map(row => `<tr><td>${escapeHtml(row.city)}</td><td>${row.flights} / ${row.airborneMinutes} / ${row.landings}</td></tr>`).join('')}</table></section><section class="card"><h2>Platforms · accounts / activations</h2><table>${report.platforms.map(row => `<tr><td>${escapeHtml(row.platform)}</td><td>${row.accounts} / ${row.activations}</td></tr>`).join('')}</table></section></div>`;
    } catch { /* A purchase-only historical database may lack the wallet/account tables. */ }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Airport Chaos Analytics</title><style>body{margin:0;background:#07111f;color:#e8f4ff;font:14px system-ui;padding:28px}h1{margin:0 0 6px;color:#65cfff}.sub{color:#8da6ba;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{background:#0d2032;border:1px solid #274b63;border-radius:12px;padding:18px}.metrics{display:grid;grid-template-columns:1fr auto;gap:8px 18px}.metrics b{color:#fff}.metrics span{color:#9eb5c7}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #20394b}a{color:#65cfff}</style></head><body><h1>Airport Chaos Analytics</h1><div class="sub">${modeLabel} · ${productionOnly ? 'Production only · fly.vadensoftware.com' : 'All environments'} · analytics begins at deployment</div><div class="grid">${cards}</div>${businessCards}<div class="card" style="margin-top:16px"><h2>Aircraft unlocks · 30 days</h2><table>${unlockRows}</table></div>${purchaseCards}</body></html>`;
  }

  private eventCount(name: AnalyticsEventName, environment?: string): number {
    const alias = legacyEventNames[name as keyof typeof legacyEventNames];
    const names = alias ? [name, alias] : [name];
    const row = this.database.prepare(`SELECT COUNT(*) count FROM analytics_events WHERE event_name IN (${names.map(() => '?').join(',')}) ${environment ? 'AND environment=?' : ''}`)
      .get(...names, ...(environment ? [environment] : [])) as { count: number };
    return row.count;
  }

  private stripeEventCount(name: 'fighter_checkout_created' | 'fighter_purchase_completed', mode: StripeMode, environment?: string): number {
    const row = this.database.prepare(`SELECT COUNT(*) count FROM analytics_events WHERE event_name IN (?,?) AND json_extract(COALESCE(metadata,'{}'),'$.stripeMode')=? ${environment ? 'AND environment=?' : ''}`)
      .get(name, legacyEventNames[name], mode, ...(environment ? [environment] : [])) as { count: number };
    return row.count;
  }

  private summary(label: string, since: number, environment: string | undefined, now: number): string {
    const envSession = environment ? 'AND environment = ?' : '';
    const envEvent = environment ? 'AND environment = ?' : '';
    const sessionArgs = environment ? [since, environment] : [since];
    const eventArgs = environment ? [since, environment] : [since];
    const sessions = this.database.prepare(`SELECT COUNT(*) sessions, COUNT(DISTINCT pilot_id) players, COALESCE(AVG(MAX(0,COALESCE(ended_at,last_seen_at)-started_at)),0) avg_ms FROM analytics_sessions WHERE started_at >= ? ${envSession}`).get(...sessionArgs) as { sessions: number; players: number; avg_ms: number };
    const rows = this.database.prepare(`SELECT event_name, COUNT(*) count, COALESCE(SUM(amount),0) amount FROM analytics_events WHERE created_at >= ? ${envEvent} GROUP BY event_name`).all(...eventArgs) as Array<{ event_name: string; count: number; amount: number }>;
    const values = new Map(rows.map(row => [row.event_name, row]));
    const count = (name: string) => values.get(name)?.count ?? 0;
    const newPlayers = count('account_created');
    const metric = (name: string, value: string | number) => `<span>${name}</span><b>${value}</b>`;
    return `<section class="card"><h2>${label}</h2><div class="metrics">${metric('Unique Players', sessions.players)}${metric('New Accounts', newPlayers)}${metric('Sessions', sessions.sessions)}${metric('Game Starts', count('game_started'))}${metric('Avg Session Time', formatDuration(sessions.avg_ms))}${metric('Successful Landings', count('successful_landing'))}${metric('Crashes', count('crash'))}${metric('Credits Earned', (values.get('credits_earned')?.amount ?? 0).toLocaleString())}${metric('Aircraft Unlocks', count('aircraft_unlocked'))}${metric('Missions Completed', count('mission_completed'))}${metric('Territory Captures', count('territory_captured'))}</div></section>`;
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
