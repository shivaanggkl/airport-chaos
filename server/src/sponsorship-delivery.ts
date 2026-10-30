import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
import { SponsorshipManagementStore, HUB_PLACEMENT_ID, type Advertiser, type Campaign, type Creative } from './sponsorship-management.js';

export type PublicSponsor = {
  advertiserId: string; campaignId: string; creativeId: string;
  name: string; description: string; tagline: string | null; logoUrl: string;
  website: string | null;
};
export type PublicWorldSponsor = { cityId: string; placementId: string; campaignId: string; creativeId: string; assetUrl: string };
export type SponsorCatalog = { revision: string; validUntil: string; maxAgeMs: number; measurementEnabled: boolean; hub: PublicSponsor | null; world: PublicWorldSponsor[]; sponsors: PublicSponsor[] };
export type SponsorDeliveryGates = { qaServing: boolean; globalPause: boolean; hubEnabled: boolean; worldEnabled: boolean; externalLinks: boolean; measurementEnabled?: boolean };
export const disabledSponsorGates: SponsorDeliveryGates = Object.freeze({ qaServing: false, globalPause: true, hubEnabled: false, worldEnabled: false, externalLinks: false });
const p5WorldPlacements = new Set(['dallas-dfw-terminal-sign', 'dallas-love-terminal-sign', 'dallas-dfw-north-arrival']);

export function sponsorDeliveryGates(env: NodeJS.ProcessEnv = process.env): SponsorDeliveryGates {
  // P4 cannot authorize production serving. A local operator must explicitly enable every QA gate.
  const isolatedPath = (path: string | undefined) => Boolean(path && isAbsolute(path) &&
    [resolve(tmpdir()) + sep, '/tmp/', '/private/tmp/'].some(prefix => resolve(path).startsWith(prefix)));
  const localQa = env.NODE_ENV !== 'production' && !env.RENDER_SERVICE_ID && env.AIRPORT_CHAOS_DEV_QA === '1' &&
    env.SPONSORSHIP_QA_SERVING_ENABLED === 'true' && isolatedPath(env.AIRPORT_CHAOS_PROFILE_DB) && isolatedPath(env.AIRPORT_CHAOS_SPONSOR_ASSET_ROOT);
  return {
    qaServing: localQa,
    globalPause: env.SPONSORSHIP_GLOBAL_PAUSE !== 'false',
    hubEnabled: localQa && env.SPONSORSHIP_PAID_HUB_ENABLED === 'true',
    worldEnabled: localQa && env.SPONSORSHIP_PAID_WORLD_ENABLED === 'true',
    externalLinks: localQa && env.SPONSORSHIP_EXTERNAL_LINKS_ENABLED === 'true',
    measurementEnabled: localQa && env.SPONSORSHIP_ESTIMATE_EVENTS_ENABLED === 'true',
  };
}

export class SponsorshipDelivery {
  constructor(private readonly management: SponsorshipManagementStore, private readonly gates: SponsorDeliveryGates = disabledSponsorGates) {}

  catalog(now = new Date(), platform: 'web' | 'ios' | 'android' | 'unknown' = 'web'): SponsorCatalog {
    const empty = (): SponsorCatalog => ({ revision: 'house', validUntil: new Date(now.getTime() + 60_000).toISOString(), maxAgeMs: 60_000, measurementEnabled: false, hub: null, world: [], sponsors: [] });
    if (!this.gates.qaServing || this.gates.globalPause || platform !== 'web') return empty();
    let hub: PublicSponsor | null = null;
    const world: PublicWorldSponsor[] = [];
    const sponsors = new Map<string, PublicSponsor>();
    const revisionParts: string[] = [];
    let expiresAt = now.getTime() + 60_000;
    if (this.gates.hubEnabled) {
      const ids = this.management.hubCampaignIds(now.toISOString());
      if (ids.length > 1) console.error('[sponsorship] conflicting approved Hub campaigns');
      else if (ids.length === 1) {
        const preview = this.management.preview(ids[0], now.toISOString(), 'hash');
        const assignment = preview.assignments.filter(item => item.assignment.placementId === HUB_PLACEMENT_ID);
        const creative = assignment[0]?.creative;
        if (preview.scheduleEligible && preview.campaign.deliveryApproved && assignment.length === 1 && creative &&
          creative.status === 'APPROVED' && creative.advertiserId === preview.advertiser.id) {
          hub = this.publicSponsor(preview.advertiser, preview.campaign, creative);
          if (preview.advertiser.directoryApproved && preview.advertiser.publicDescription) sponsors.set(preview.advertiser.id, hub);
          expiresAt = Math.min(expiresAt, Date.parse(preview.campaign.endsAt));
          revisionParts.push(preview.campaign.updatedAt, preview.advertiser.updatedAt, creative.updatedAt);
        }
      }
    }
    if (this.gates.worldEnabled) {
      const ids = this.management.worldCampaignIds(now.toISOString());
      if (ids.length > 150) console.error('[sponsorship] world campaign limit exceeded');
      else {
        const byPlacement = new Map<string, { item: PublicWorldSponsor; sponsor: PublicSponsor; end: number; revision: string[] }[]>();
        for (const id of ids) {
          const preview = this.management.preview(id, now.toISOString(), 'hash');
          if (!preview.scheduleEligible || !preview.campaign.deliveryApproved) continue;
          for (const { assignment, creative } of preview.assignments) {
            if (assignment.surface !== 'WORLD' || assignment.city !== 'dallas' || !p5WorldPlacements.has(assignment.placementId) ||
              !creative || creative.status !== 'APPROVED' || creative.advertiserId !== preview.advertiser.id || creative.targetPlacementId !== assignment.placementId) continue;
            const sponsor = this.publicSponsor(preview.advertiser, preview.campaign, creative);
            const item: PublicWorldSponsor = { cityId: assignment.city, placementId: assignment.placementId,
              campaignId: preview.campaign.id, creativeId: creative.id, assetUrl: sponsor.logoUrl };
            const entries = byPlacement.get(item.placementId) ?? [];
            entries.push({ item, sponsor, end: Date.parse(preview.campaign.endsAt), revision: [preview.campaign.updatedAt, preview.advertiser.updatedAt, creative.updatedAt] });
            byPlacement.set(item.placementId, entries);
          }
        }
        for (const [placementId, entries] of byPlacement) {
          if (entries.length !== 1) { console.error(`[sponsorship] conflicting approved world placement ${placementId}`); continue; }
          const { item, sponsor, end, revision } = entries[0];
          world.push(item);
          const advertiser = this.management.getAdvertiser(sponsor.advertiserId);
          if (advertiser?.directoryApproved && advertiser.publicDescription && !sponsors.has(advertiser.id)) sponsors.set(advertiser.id, sponsor);
          expiresAt = Math.min(expiresAt, end);
          revisionParts.push(...revision);
        }
      }
    }
    world.sort((a, b) => a.placementId.localeCompare(b.placementId));
    const listed = [...sponsors.values()].sort((a, b) => a.name.localeCompare(b.name) || a.advertiserId.localeCompare(b.advertiserId));
    if (!hub && !world.length && !listed.length) return empty();
    const maxAgeMs = Math.max(0, expiresAt - now.getTime());
    const revision = createHash('sha256').update(JSON.stringify([hub, world, listed, revisionParts, this.gates])).digest('hex').slice(0, 24);
    return { revision, validUntil: new Date(expiresAt).toISOString(), maxAgeMs, measurementEnabled: this.gates.measurementEnabled === true, hub, world, sponsors: listed };
  }

  private publicSponsor(advertiser: Advertiser, campaign: Campaign, creative: Creative): PublicSponsor {
    return {
      advertiserId: advertiser.id, campaignId: campaign.id, creativeId: creative.id,
      name: advertiser.companyName, description: advertiser.publicDescription ?? '', tagline: creative.tagline,
      logoUrl: `/api/sponsorship/creative/${creative.id}?v=${creative.sha256}`,
      website: this.gates.externalLinks ? advertiser.website : null,
    };
  }
}

export const sponsorReportReasons = ['INAPPROPRIATE','MISLEADING','OFFENSIVE','SUSPICIOUS_WEBSITE','OTHER'] as const;
export type SponsorReportReason = typeof sponsorReportReasons[number];
export type SponsorReport = { id: string; advertiserId: string; campaignId: string; creativeId: string; reason: SponsorReportReason; description: string | null; status: 'NEW' | 'REVIEWED' | 'RESOLVED'; createdAt: string; updatedAt: string };

export class SponsorshipReportStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS sponsor_reports (
        id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL REFERENCES sponsor_advertisers(id),
        campaign_id TEXT NOT NULL REFERENCES sponsor_campaigns(id), creative_id TEXT NOT NULL REFERENCES sponsor_creatives(id),
        reason TEXT NOT NULL CHECK(reason IN ('INAPPROPRIATE','MISLEADING','OFFENSIVE','SUSPICIOUS_WEBSITE','OTHER')),
        description TEXT, status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','REVIEWED','RESOLVED')),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sponsor_reports_recent ON sponsor_reports(created_at DESC,id);
      CREATE INDEX IF NOT EXISTS sponsor_reports_campaign ON sponsor_reports(campaign_id,status);`);
  }
  close(): void { this.db.close(); }
  create(sponsor: PublicSponsor, reason: SponsorReportReason, description: string | null): string {
    if (!sponsorReportReasons.includes(reason) || (description !== null && (description.length > 300 || /[\u0000-\u001f\u007f]/.test(description)))) throw new Error('Invalid report');
    const id = randomUUID(), now = new Date().toISOString();
    this.db.prepare(`INSERT INTO sponsor_reports (id,advertiser_id,campaign_id,creative_id,reason,description,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'NEW',?,?)`).run(id, sponsor.advertiserId, sponsor.campaignId, sponsor.creativeId, reason, description, now, now);
    return id;
  }
  list(limit = 25, offset = 0): SponsorReport[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) throw new Error('Invalid page');
    return this.db.prepare(`SELECT id,advertiser_id AS advertiserId,campaign_id AS campaignId,creative_id AS creativeId,reason,description,status,created_at AS createdAt,updated_at AS updatedAt
      FROM sponsor_reports ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(limit, offset) as SponsorReport[];
  }
  listOpen(limit = 25): SponsorReport[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page');
    return this.db.prepare(`SELECT id,advertiser_id AS advertiserId,campaign_id AS campaignId,creative_id AS creativeId,reason,description,status,created_at AS createdAt,updated_at AS updatedAt
      FROM sponsor_reports WHERE status = 'NEW' ORDER BY created_at DESC,id LIMIT ?`).all(limit) as SponsorReport[];
  }
  get(id: string): SponsorReport | undefined {
    return this.db.prepare(`SELECT id,advertiser_id AS advertiserId,campaign_id AS campaignId,creative_id AS creativeId,reason,description,status,created_at AS createdAt,updated_at AS updatedAt
      FROM sponsor_reports WHERE id = ?`).get(id) as SponsorReport | undefined;
  }
  setStatus(id: string, status: 'REVIEWED' | 'RESOLVED'): SponsorReport {
    if (!['REVIEWED','RESOLVED'].includes(status)) throw new Error('Invalid status');
    const current = this.get(id);
    if (!current) throw new Error('Report not found');
    this.db.prepare('UPDATE sponsor_reports SET status = ?,updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
    return this.get(id)!;
  }
}
