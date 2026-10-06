import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AnalyticsStore } from './analytics.js';
import { parseClientIntent } from './analytics-catalog.js';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';
import { PlayerWallet } from './player-wallet.js';

test('intent ingestion accepts only bounded non-sensitive dimensions', () => {
  const sessionId = '11840a72-0b7d-4a53-a67a-94a6e8887730';
  assert.deepEqual(parseClientIntent({ event: 'city_selected', sessionId, cityId: 'dallas' }),
    { event: 'city_selected', sessionId, cityId: 'dallas', aircraftType: undefined });
  assert.equal(parseClientIntent({ event: 'firehawk_purchase_succeeded', sessionId }), undefined);
  assert.equal(parseClientIntent({ event: 'city_selected', sessionId, cityId: 'dallas', email: 'secret@example.com' }), undefined);
  assert.equal(parseClientIntent({ event: 'city_selected', sessionId, cityId: 'a'.repeat(100) }), undefined);
  assert.equal(parseClientIntent({ event: 'city_selected', sessionId: 'forged', cityId: 'dallas' }), undefined);
});

test('existing analytics tables gain platform and journey dimensions without losing events', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-analytics-migration-'));
  const path = join(directory, 'analytics.sqlite');
  try {
    const database = new DatabaseSync(path);
    database.exec(`CREATE TABLE analytics_sessions(session_id TEXT PRIMARY KEY,pilot_id TEXT NOT NULL,
      environment TEXT NOT NULL,host TEXT NOT NULL,city_id TEXT,aircraft_type TEXT,
      started_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,ended_at INTEGER);
      CREATE TABLE analytics_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_name TEXT NOT NULL,pilot_id TEXT NOT NULL,
      session_id TEXT,environment TEXT NOT NULL,host TEXT NOT NULL,city_id TEXT,aircraft_type TEXT,
      amount INTEGER,source TEXT,metadata TEXT,created_at INTEGER NOT NULL);`);
    database.prepare(`INSERT INTO analytics_events(event_name,pilot_id,environment,host,created_at)
      VALUES('mission_completed','pilot-one','production','fly.vadensoftware.com',1000)`).run();
    database.close();
    new AnalyticsStore(path);
    const migrated = new DatabaseSync(path);
    const columns = migrated.prepare('PRAGMA table_info(analytics_events)').all() as Array<{ name: string }>;
    assert.equal(columns.some(column => column.name === 'platform'), true);
    assert.equal(columns.some(column => column.name === 'journey_id'), true);
    assert.equal(migrated.prepare('SELECT COUNT(*) count FROM analytics_events').get()!['count'], 1);
    migrated.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('activation deduplicates, historical Firehawk aliases normalize, and wallet report uses committed Credits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'airport-analytics-phase5-'));
  const path = join(directory, 'profiles.sqlite');
  try {
    const profiles = new PlayerProfileStore(path);
    profiles.getOrCreate('pilot-analytics-0001', 'Pilot');
    new PilotSessionStore(path);
    const database = new DatabaseSync(path);
    const now = Date.now();
    database.prepare('INSERT INTO accounts(account_id,created_at,updated_at) VALUES(?,?,?)').run('account-analytics-0001', now - 10 * 86_400_000, now);
    database.prepare('INSERT INTO account_profile_links(account_id,pilot_id,linked_at) VALUES(?,?,?)').run('account-analytics-0001', 'pilot-analytics-0001', now);
    const wallet = new PlayerWallet(database);
    assert.equal(wallet.credit({ pilotId: 'pilot-analytics-0001', currency: 'CREDITS', amount: 300,
      reason: 'FLIGHT_REWARD', createdAt: now - 1_000 }).ok, true);
    assert.equal(wallet.credit({ pilotId: 'pilot-analytics-0001', currency: 'CREDITS', amount: 100,
      reason: 'DAILY_REWARD', createdAt: now - 900 }).ok, true);
    assert.equal(wallet.debit({ pilotId: 'pilot-analytics-0001', currency: 'CREDITS', amount: 50,
      reason: 'COSMETIC_PURCHASE', createdAt: now - 800 }).ok, true);
    const analytics = new AnalyticsStore(path);
    const context = { pilotId: 'pilot-analytics-0001', sessionId: 'flight-001', journeyId: 'journey-001',
      environment: 'production' as const, host: 'fly.vadensoftware.com', cityId: 'dallas', aircraftType: 'trainer', platform: 'ios' as const };
    analytics.startSession(context, now - 60_000);
    analytics.startSession(context, now - 60_000);
    analytics.recordEvent(context, 'flight_started', {}, now - 60_000);
    assert.equal(analytics.recordActivation(context, now), true);
    assert.equal(analytics.recordActivation(context, now + 1), false);
    analytics.recordEvent(context, 'flight_ended', { metadata: { durationSeconds: 60, airborneSeconds: 60 } }, now);
    const signupAt = now - 10 * 86_400_000;
    analytics.recordEvent(context, 'account_created', { source: 'unknown' }, signupAt);
    analytics.recordEvent(context, 'hub_viewed', {}, signupAt + 36 * 3_600_000);
    analytics.recordEvent(context, 'flight_started', {}, signupAt + 7.5 * 86_400_000);
    analytics.recordEvent(context, 'fighter_trial_started', {}, now);
    analytics.recordEvent(context, 'fighter_purchase_completed', {}, now + 1);
    analytics.recordEvent(context, 'daily_reward_available', { source: '0' }, now);
    analytics.recordEvent(context, 'daily_reward_available', { source: '0' }, now + 1);
    const report = analytics.businessReport(now + 2, now - 86_400_000, 'production');
    assert.equal(report.creditsCreated, 400);
    assert.equal(report.creditsSpent, 50);
    assert.equal(report.netCredits, 350);
    assert.equal(report.gameplayEarnShare, 0.75);
    assert.equal(report.flights, 1);
    assert.equal(report.activations, 1);
    assert.equal(report.airborneMinutes, 1);
    assert.equal(report.averageBalance, 350);
    assert.equal(report.medianBalance, 350);
    assert.equal(report.firehawkTrials, 1);
    assert.equal(report.firehawkTrialPilots, 1);
    assert.equal(report.firehawkTrialPurchaseConversions, 1);
    assert.equal(report.diagnostics.walletMismatches, 0);
    const cohort = analytics.businessReport(now + 2, now - 30 * 86_400_000, 'production');
    assert.equal(cohort.accounts, 1);
    assert.equal(cohort.d1, 1);
    assert.equal(cohort.d7, 1);
    assert.equal(cohort.gameplayD1, 0);
    assert.equal(cohort.gameplayD7, 1);
    assert.deepEqual(cohort.platforms, [{ platform: 'ios', accounts: 1, activations: 1 }]);
    const dashboard = analytics.dashboardHtml(true, now + 2);
    assert.match(dashboard, /Gameplay Earn Share/);
    assert.match(dashboard, /D1 return/);
    assert.doesNotMatch(dashboard, /Support email/);
    const events = database.prepare('SELECT event_name,COUNT(*) count FROM analytics_events GROUP BY event_name').all() as Array<{ event_name: string; count: number }>;
    assert.equal(events.find(row => row.event_name === 'session_started')?.count, 1);
    assert.equal(events.find(row => row.event_name === 'flight_activated')?.count, 1);
    assert.equal(events.find(row => row.event_name === 'daily_reward_available')?.count, 1);
    assert.equal(events.find(row => row.event_name === 'firehawk_trial_started')?.count, 1);
    assert.equal(events.find(row => row.event_name === 'firehawk_purchase_succeeded')?.count, 1);
    assert.equal(events.some(row => row.event_name === 'fighter_trial_started'), false);
    analytics.prune(now + 181 * 86_400_000);
    assert.equal(analytics.recordActivation(context, now + 182 * 86_400_000), false);
    database.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
