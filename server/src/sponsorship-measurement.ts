import { DatabaseSync } from 'node:sqlite';
import { HUB_PLACEMENT_ID, SponsorshipManagementStore } from './sponsorship-management.js';
import { SponsorshipDelivery, type SponsorCatalog, type SponsorDeliveryGates } from './sponsorship-delivery.js';

export const sponsorEventTypes = ['HUB_ESTIMATED_EXPOSURE', 'WORLD_ESTIMATED_EXPOSURE', 'SPONSOR_DETAILS_OPEN', 'SPONSOR_WEBSITE_ACTION'] as const;
export type SponsorEventType = typeof sponsorEventTypes[number];
export type SponsorEvent = {
  eventId: string; type: SponsorEventType; campaignId: string; creativeId: string;
  placementId: string; cityId: string; source?: 'HUB' | 'DIRECTORY';
};
export const DIRECTORY_PLACEMENT_ID = 'global-sponsors-directory';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const worldIds = new Set(['dallas-dfw-terminal-sign', 'dallas-love-terminal-sign', 'dallas-dfw-north-arrival']);

export function sponsorMeasurementEnabled(env: NodeJS.ProcessEnv, gates: SponsorDeliveryGates): boolean {
  return gates.qaServing && !gates.globalPause && env.NODE_ENV !== 'production' && !env.RENDER_SERVICE_ID &&
    env.SPONSORSHIP_ESTIMATE_EVENTS_ENABLED === 'true';
}

export function validSponsorEvent(value: unknown): value is SponsorEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['eventId','type','campaignId','creativeId','placementId','cityId','source'].includes(key)) ||
    !uuid.test(String(item.eventId ?? '')) || !sponsorEventTypes.includes(item.type as SponsorEventType) ||
    !uuid.test(String(item.campaignId ?? '')) || !uuid.test(String(item.creativeId ?? '')) ||
    typeof item.placementId !== 'string' || item.placementId.length > 100 ||
    typeof item.cityId !== 'string' || item.cityId.length > 50) return false;
  if (item.type === 'HUB_ESTIMATED_EXPOSURE') return item.placementId === HUB_PLACEMENT_ID && item.cityId === 'global' && item.source === undefined;
  if (item.type === 'WORLD_ESTIMATED_EXPOSURE') return worldIds.has(item.placementId) && item.cityId === 'dallas' && item.source === undefined;
  return (item.source === 'HUB' && item.placementId === HUB_PLACEMENT_ID && item.cityId === 'global') ||
    (item.source === 'DIRECTORY' && item.placementId === DIRECTORY_PLACEMENT_ID && item.cityId === 'global');
}

export function eligibleSponsorEvent(event: SponsorEvent, catalog: SponsorCatalog): boolean {
  if (event.type === 'HUB_ESTIMATED_EXPOSURE') return catalog.hub?.campaignId === event.campaignId && catalog.hub.creativeId === event.creativeId;
  if (event.type === 'WORLD_ESTIMATED_EXPOSURE') return catalog.world.some(item => item.cityId === event.cityId &&
    item.placementId === event.placementId && item.campaignId === event.campaignId && item.creativeId === event.creativeId);
  const sponsor = event.source === 'HUB' ? catalog.hub : catalog.sponsors.find(item => item.campaignId === event.campaignId && item.creativeId === event.creativeId);
  return sponsor?.campaignId === event.campaignId && sponsor.creativeId === event.creativeId &&
    (event.type !== 'SPONSOR_WEBSITE_ACTION' || sponsor.website !== null);
}

type DailyRow = { date: string; advertiserId: string; campaignId: string; creativeId: string; placementId: string; cityId: string; platform: string; type: SponsorEventType; count: number };
export class SponsorshipMeasurementStore {
  private readonly db: DatabaseSync;
  private lastPrune = 0;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS sponsor_event_dedupe (
        event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sponsor_event_dedupe_expiry ON sponsor_event_dedupe(expires_at);
      CREATE TABLE IF NOT EXISTS sponsor_daily_measurement (
        date TEXT NOT NULL, advertiser_id TEXT NOT NULL REFERENCES sponsor_advertisers(id),
        campaign_id TEXT NOT NULL REFERENCES sponsor_campaigns(id), creative_id TEXT NOT NULL REFERENCES sponsor_creatives(id),
        placement_id TEXT NOT NULL, city_id TEXT NOT NULL, platform TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('HUB_ESTIMATED_EXPOSURE','WORLD_ESTIMATED_EXPOSURE','SPONSOR_DETAILS_OPEN','SPONSOR_WEBSITE_ACTION')),
        count INTEGER NOT NULL CHECK(count >= 0),
        PRIMARY KEY(date,campaign_id,creative_id,placement_id,city_id,platform,type));
      CREATE INDEX IF NOT EXISTS sponsor_daily_campaign ON sponsor_daily_measurement(campaign_id,date);`);
  }
  close(): void { this.db.close(); }
  ingest(events: readonly SponsorEvent[], delivery: SponsorshipDelivery, management: SponsorshipManagementStore,
    platform: 'web' | 'ios' | 'android' | 'unknown', now = new Date()): { accepted: number; duplicate: number } {
    if (events.length < 1 || events.length > 20 || platform !== 'web' || events.some(event => !validSponsorEvent(event))) throw new Error('Invalid measurement');
    if (now.getTime() - this.lastPrune > 3_600_000) { this.pruneDedupe(now); this.lastPrune = now.getTime(); }
    const at = now.toISOString(), expiry = new Date(now.getTime() + 48 * 60 * 60_000).toISOString();
    const insert = this.db.prepare('INSERT OR IGNORE INTO sponsor_event_dedupe(event_id,received_at,expires_at) VALUES (?,?,?)');
    const count = this.db.prepare(`INSERT INTO sponsor_daily_measurement
      (date,advertiser_id,campaign_id,creative_id,placement_id,city_id,platform,type,count) VALUES (?,?,?,?,?,?,?,?,1)
      ON CONFLICT(date,campaign_id,creative_id,placement_id,city_id,platform,type) DO UPDATE SET count = count + 1`);
    let accepted = 0, duplicate = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Hold the write reservation while resolving eligibility so a concurrent
      // operator pause cannot land between approval checks and aggregate writes.
      const catalog = delivery.catalog(now, platform);
      if (events.some(event => !eligibleSponsorEvent(event, catalog))) throw new Error('Ineligible measurement');
      for (const event of events) {
        if (insert.run(event.eventId, at, expiry).changes === 0) { duplicate++; continue; }
        const campaign = management.getCampaign(event.campaignId);
        if (!campaign) throw new Error('Campaign unavailable');
        count.run(at.slice(0, 10), campaign.advertiserId, event.campaignId, event.creativeId,
          event.placementId, event.cityId, platform, event.type);
        accepted++;
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { accepted, duplicate };
  }
  pruneDedupe(now = new Date()): number {
    return Number(this.db.prepare('DELETE FROM sponsor_event_dedupe WHERE expires_at <= ?').run(now.toISOString()).changes);
  }
  daily(campaignId: string, from: string, to: string): DailyRow[] {
    const fromAt = Date.parse(`${from}T00:00:00Z`), toAt = Date.parse(`${to}T00:00:00Z`);
    if (!uuid.test(campaignId) || !/^\d{4}-\d\d-\d\d$/.test(from) || !/^\d{4}-\d\d-\d\d$/.test(to) ||
      !Number.isFinite(fromAt) || !Number.isFinite(toAt) || from > to || toAt - fromAt > 366 * 86_400_000)
      throw new Error('Invalid report range');
    return this.db.prepare(`SELECT date,advertiser_id AS advertiserId,campaign_id AS campaignId,creative_id AS creativeId,
      placement_id AS placementId,city_id AS cityId,platform,type,count FROM sponsor_daily_measurement
      WHERE campaign_id = ? AND date BETWEEN ? AND ? ORDER BY date,placement_id,type LIMIT 10000`).all(campaignId, from, to) as DailyRow[];
  }
  reportCounts(campaignId: string): { total: number; open: number; reasons: Record<string, number> } {
    const rows = this.db.prepare('SELECT reason,status,COUNT(*) AS count FROM sponsor_reports WHERE campaign_id = ? GROUP BY reason,status').all(campaignId) as { reason: string; status: string; count: number }[];
    const reasons: Record<string, number> = {}; let total = 0, open = 0;
    for (const row of rows) { reasons[row.reason] = (reasons[row.reason] ?? 0) + row.count; total += row.count; if (row.status === 'NEW') open += row.count; }
    return { total, open, reasons };
  }
}

export const sponsorMeasurementCaveat = 'Exposure totals are internal estimates based on eligible in-game presentation and are not independently audited advertising impressions.';
