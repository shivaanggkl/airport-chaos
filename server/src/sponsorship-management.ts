import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { validWebsite } from './sponsorship-inquiries.js';

export const commercialEvidenceKeys = ['identity','creativeRights','artwork','agreement','invoice','paymentCondition','inventory','privacyAudiencePolicy','operations','ownerGoLive'] as const;
export type CommercialEvidence = Record<typeof commercialEvidenceKeys[number], string>;

export const HUB_PLACEMENT_ID = 'global-hub-spotlight';
// These are preview defaults, never a public serving switch in P3.
export const SPONSORSHIP_SERVING_DEFAULTS = Object.freeze({ globalPause: true, hubEnabled: false, worldEnabled: false });
type AdvertiserStatus = 'DRAFT' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
type CreativeStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'DISABLED';
type CampaignStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PAUSED' | 'CANCELLED';
type Surface = 'HUB' | 'WORLD';
type Placement = { id: string; city: string; category: string; sourceSize: { x: number; y: number } };
type Qualification = { id: string; status: string };
export type Advertiser = { id: string; companyName: string; website: string | null; inquiryId: string | null; status: AdvertiserStatus; publicDescription: string | null; directoryApproved: boolean; reviewNote: string | null; createdAt: string; updatedAt: string };
export type Creative = { id: string; advertiserId: string; assetRef: string; sha256: string; width: number; height: number; format: string; targetPlacementId: string; displayName: string | null; tagline: string | null; status: CreativeStatus; reviewNote: string | null; createdAt: string; updatedAt: string };
export type Campaign = { id: string; advertiserId: string; title: string; startsAt: string; endsAt: string; status: CampaignStatus; deliveryApproved: boolean; reviewNote: string | null; createdAt: string; updatedAt: string };
export type Assignment = { id: string; campaignId: string; creativeId: string; placementId: string; city: string; surface: Surface; createdAt: string; updatedAt: string };
export type AuditEvent = { id: string; recordType: string; recordId: string; actor: string; action: string; details: string; createdAt: string };

const inventoryPath = fileURLToPath(new URL('../../docs/advertising-p0-inventory.json', import.meta.url));
const qualificationPath = fileURLToPath(new URL('../../docs/advertising-p1-qualification.json', import.meta.url));
const defaultAssetRoot = fileURLToPath(new URL('../../client/public/media/advertise/', import.meta.url));

function fail(message: string): never { throw new Error(message); }
function text(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string') fail(`${name} must be text`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) fail(`Invalid ${name}`);
  return result;
}
function optionalText(value: unknown, name: string, max: number): string | null {
  if (value == null || value === '') return null;
  return text(value, name, 1, max);
}
function utc(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) fail('Timestamp must be UTC ISO 8601');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) fail('Invalid UTC timestamp');
  return date.toISOString();
}
function bounds(startsAt: unknown, endsAt: unknown): { startsAt: string; endsAt: string } {
  const start = utc(startsAt), end = utc(endsAt);
  if (start >= end) fail('Campaign start must precede end');
  return { startsAt: start, endsAt: end };
}
function page(limit: number, offset: number): [number, number] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) fail('Invalid page bounds');
  return [limit, offset];
}
function note(value: unknown): string | null { return optionalText(value, 'review note', 500); }

export class SponsorshipManagementStore {
  private readonly db: DatabaseSync;
  private readonly placements = new Map<string, Placement & { status: string; surface: Surface }>();
  private readonly assetRoot: string;
  private readonly databasePath: string;

  constructor(dbPath: string, options: { assetRoot?: string } = {}) {
    const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as { placements: Placement[] };
    const qualification = JSON.parse(readFileSync(qualificationPath, 'utf8')) as { placements: Qualification[] };
    if (inventory.placements.length !== qualification.placements.length) fail('Placement inventory and qualification differ');
    const statusById = new Map(qualification.placements.map(item => [item.id, item.status]));
    if (statusById.size !== qualification.placements.length) fail('Duplicate qualification ID');
    for (const placement of inventory.placements) {
      const status = statusById.get(placement.id);
      if (!status || this.placements.has(placement.id)) fail('Invalid placement inventory');
      this.placements.set(placement.id, { ...placement, status, surface: 'WORLD' });
    }
    if (this.placements.has(HUB_PLACEMENT_ID)) fail('Hub placement ID conflicts with world inventory');
    this.placements.set(HUB_PLACEMENT_ID, { id: HUB_PLACEMENT_ID, city: 'global', category: 'HUB_BANNER', sourceSize: { x: 480, y: 64 }, status: 'QA_APPROVED', surface: 'HUB' });
    this.assetRoot = resolve(options.assetRoot ?? defaultAssetRoot);
    this.databasePath = resolve(dbPath);
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS sponsor_advertisers (
      id TEXT PRIMARY KEY, company_name TEXT NOT NULL, website TEXT, inquiry_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('DRAFT','APPROVED','SUSPENDED','REJECTED')),
      review_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sponsor_advertisers_recent ON sponsor_advertisers(created_at DESC);
    CREATE TABLE IF NOT EXISTS sponsor_creatives (
      id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL REFERENCES sponsor_advertisers(id),
      asset_ref TEXT NOT NULL, sha256 TEXT NOT NULL, width INTEGER NOT NULL CHECK(width > 0),
      height INTEGER NOT NULL CHECK(height > 0), format TEXT NOT NULL CHECK(format IN ('PNG','JPEG','WEBP')),
      target_placement_id TEXT NOT NULL, display_name TEXT, tagline TEXT,
      status TEXT NOT NULL CHECK(status IN ('DRAFT','APPROVED','REJECTED','DISABLED')),
      review_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sponsor_creatives_advertiser ON sponsor_creatives(advertiser_id,created_at DESC);
    CREATE TRIGGER IF NOT EXISTS sponsor_creatives_approved_immutable BEFORE UPDATE ON sponsor_creatives
      WHEN OLD.status IN ('APPROVED','DISABLED') AND (
        NEW.advertiser_id IS NOT OLD.advertiser_id OR NEW.asset_ref IS NOT OLD.asset_ref OR
        NEW.sha256 IS NOT OLD.sha256 OR NEW.width IS NOT OLD.width OR NEW.height IS NOT OLD.height OR
        NEW.format IS NOT OLD.format OR NEW.target_placement_id IS NOT OLD.target_placement_id OR
        NEW.display_name IS NOT OLD.display_name OR NEW.tagline IS NOT OLD.tagline)
      BEGIN SELECT RAISE(ABORT, 'Approved creative metadata is immutable'); END;
    CREATE TABLE IF NOT EXISTS sponsor_campaigns (
      id TEXT PRIMARY KEY, advertiser_id TEXT NOT NULL REFERENCES sponsor_advertisers(id),
      title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(starts_at < ends_at),
      status TEXT NOT NULL CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','PAUSED','CANCELLED')),
      review_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sponsor_campaigns_recent ON sponsor_campaigns(created_at DESC);
    CREATE INDEX IF NOT EXISTS sponsor_campaigns_schedule ON sponsor_campaigns(status,starts_at,ends_at);
    CREATE TABLE IF NOT EXISTS sponsor_assignments (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES sponsor_campaigns(id),
      creative_id TEXT NOT NULL REFERENCES sponsor_creatives(id), placement_id TEXT NOT NULL,
      city TEXT NOT NULL, surface TEXT NOT NULL CHECK(surface IN ('HUB','WORLD')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(campaign_id,placement_id));
    CREATE INDEX IF NOT EXISTS sponsor_assignments_placement ON sponsor_assignments(placement_id,campaign_id);
    CREATE TABLE IF NOT EXISTS sponsor_audit (
      id TEXT PRIMARY KEY, record_type TEXT NOT NULL, record_id TEXT NOT NULL, actor TEXT NOT NULL,
      action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sponsor_audit_record ON sponsor_audit(record_type,record_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS sponsor_audit_recent ON sponsor_audit(created_at DESC);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS sponsor_commercial_releases (
      campaign_id TEXT PRIMARY KEY REFERENCES sponsor_campaigns(id), fingerprint TEXT NOT NULL,
      evidence TEXT NOT NULL, operator TEXT NOT NULL, approved_at TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform = 'web'), simulated INTEGER NOT NULL CHECK(simulated IN (0,1)));
      CREATE TRIGGER IF NOT EXISTS sponsor_release_campaign_invalidation AFTER UPDATE ON sponsor_campaigns
      WHEN NEW.starts_at IS NOT OLD.starts_at OR NEW.ends_at IS NOT OLD.ends_at OR NEW.status IS NOT OLD.status
      BEGIN DELETE FROM sponsor_commercial_releases WHERE campaign_id = NEW.id; END;
      CREATE TRIGGER IF NOT EXISTS sponsor_release_assignment_update AFTER UPDATE ON sponsor_assignments
      BEGIN DELETE FROM sponsor_commercial_releases WHERE campaign_id = NEW.campaign_id; END;
      CREATE TRIGGER IF NOT EXISTS sponsor_release_assignment_insert AFTER INSERT ON sponsor_assignments
      BEGIN DELETE FROM sponsor_commercial_releases WHERE campaign_id = NEW.campaign_id; END;
      CREATE TRIGGER IF NOT EXISTS sponsor_release_assignment_delete AFTER DELETE ON sponsor_assignments
      BEGIN DELETE FROM sponsor_commercial_releases WHERE campaign_id = OLD.campaign_id; END;`);
    const columns = (table: string) => new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name));
    const advertiserColumns = columns('sponsor_advertisers');
    if (!advertiserColumns.has('public_description')) this.db.exec('ALTER TABLE sponsor_advertisers ADD COLUMN public_description TEXT');
    if (!advertiserColumns.has('directory_approved')) this.db.exec('ALTER TABLE sponsor_advertisers ADD COLUMN directory_approved INTEGER NOT NULL DEFAULT 0 CHECK(directory_approved IN (0,1))');
    if (!columns('sponsor_campaigns').has('delivery_approved')) this.db.exec('ALTER TABLE sponsor_campaigns ADD COLUMN delivery_approved INTEGER NOT NULL DEFAULT 0 CHECK(delivery_approved IN (0,1))');
  }

  close(): void { this.db.close(); }
  private now(): string { return new Date().toISOString(); }
  private actor(value: unknown): string { return text(value, 'operator', 2, 100); }
  private audit(type: string, id: string, actor: string, action: string, details: Record<string, unknown> = {}): void {
    this.db.prepare('INSERT INTO sponsor_audit VALUES (?,?,?,?,?,?,?)').run(randomUUID(), type, id, actor, action, JSON.stringify(details), this.now());
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private required<T>(value: T | undefined, label: string): T { return value ?? fail(`${label} not found`); }

  listAdvertisers(limit = 25, offset = 0): Advertiser[] {
    return this.db.prepare(`SELECT id,company_name AS companyName,website,inquiry_id AS inquiryId,status,public_description AS publicDescription,directory_approved AS directoryApproved,review_note AS reviewNote,
      created_at AS createdAt,updated_at AS updatedAt FROM sponsor_advertisers ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(...page(limit, offset))
      .map(row => ({ ...row, directoryApproved: row.directoryApproved === 1 })) as Advertiser[];
  }
  getAdvertiser(id: string): Advertiser | undefined {
    const row = this.db.prepare(`SELECT id,company_name AS companyName,website,inquiry_id AS inquiryId,status,public_description AS publicDescription,directory_approved AS directoryApproved,review_note AS reviewNote,
      created_at AS createdAt,updated_at AS updatedAt FROM sponsor_advertisers WHERE id = ?`).get(id);
    return row ? { ...row, directoryApproved: row.directoryApproved === 1 } as Advertiser : undefined;
  }
  createAdvertiser(input: { companyName: string; website?: string; inquiryId?: string }, operator: string): Advertiser {
    const companyName = text(input.companyName, 'company name', 2, 100);
    const website = input.website ? validWebsite(input.website.trim()) ?? fail('Invalid HTTPS website') : null;
    const inquiryId = input.inquiryId ? text(input.inquiryId, 'inquiry ID', 36, 36) : null;
    return this.transaction(() => {
      if (inquiryId && !this.db.prepare("SELECT 1 FROM sponsorship_inquiries WHERE id = ? LIMIT 1").get(inquiryId)) fail('Inquiry not found');
      const id = randomUUID(), now = this.now();
      this.db.prepare("INSERT INTO sponsor_advertisers (id,company_name,website,inquiry_id,status,review_note,created_at,updated_at) VALUES (?,?,?,?,'DRAFT',NULL,?,?)").run(id, companyName, website, inquiryId, now, now);
      this.audit('advertiser', id, this.actor(operator), 'CREATE', { companyName, inquiryId });
      return this.required(this.getAdvertiser(id), 'Advertiser');
    });
  }
  setAdvertiserStatus(id: string, status: Exclude<AdvertiserStatus, 'DRAFT'>, reviewNote: string | null, operator: string): Advertiser {
    if (!['APPROVED', 'SUSPENDED', 'REJECTED'].includes(status)) fail('Invalid advertiser status');
    return this.transaction(() => {
      const previous = this.required(this.getAdvertiser(id), 'Advertiser');
      const allowed: Record<AdvertiserStatus, AdvertiserStatus[]> = { DRAFT: ['APPROVED','REJECTED'], APPROVED: ['SUSPENDED','REJECTED'], SUSPENDED: ['APPROVED','REJECTED'], REJECTED: [] };
      if (!allowed[previous.status].includes(status)) fail('Invalid advertiser transition');
      this.db.prepare('UPDATE sponsor_advertisers SET status = ?,directory_approved = CASE WHEN ? = \'APPROVED\' THEN directory_approved ELSE 0 END,review_note = ?,updated_at = ? WHERE id = ?').run(status, status, note(reviewNote), this.now(), id);
      if (status !== 'APPROVED') this.db.prepare('UPDATE sponsor_campaigns SET delivery_approved = 0,updated_at = ? WHERE advertiser_id = ?').run(this.now(), id);
      this.audit('advertiser', id, this.actor(operator), 'STATUS', { from: previous.status, to: status });
      return this.required(this.getAdvertiser(id), 'Advertiser');
    });
  }

  setAdvertiserPublicInfo(id: string, description: string, directoryApproved: boolean, operator: string): Advertiser {
    const approvedDescription = text(description, 'public description', 10, 160);
    if (typeof directoryApproved !== 'boolean') fail('Invalid listing approval');
    return this.transaction(() => {
      const advertiser = this.required(this.getAdvertiser(id), 'Advertiser');
      if (advertiser.status !== 'APPROVED') fail('Advertiser not approved');
      this.db.prepare('UPDATE sponsor_advertisers SET public_description = ?,directory_approved = ?,updated_at = ? WHERE id = ?')
        .run(approvedDescription, directoryApproved ? 1 : 0, this.now(), id);
      this.audit('advertiser', id, this.actor(operator), 'PUBLIC_INFO', { descriptionChanged: approvedDescription !== advertiser.publicDescription, directoryApproved });
      return this.required(this.getAdvertiser(id), 'Advertiser');
    });
  }

  private placement(id: string): Placement & { status: string; surface: Surface } {
    const placement = this.required(this.placements.get(id), 'Placement');
    if (placement.status !== 'QA_APPROVED') fail('Placement is not QA approved');
    return placement;
  }
  private asset(ref: string, targetPlacementId: string): { sha256: string; width: number; height: number; format: string } {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.(png|jpg|jpeg|webp)$/i.test(ref) || ref.includes('..')) fail('Unsafe asset reference');
    const path = join(this.assetRoot, ref);
    if (!existsSync(path) || !lstatSync(path).isFile() || !realpathSync(path).startsWith(realpathSync(this.assetRoot) + sep)) fail('Asset must be a regular local file');
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size < 32 || stat.size > 1024 * 1024) fail('Asset must be a regular image of at most 1 MiB');
      bytes = readFileSync(fd);
    } finally { closeSync(fd); }
    if (bytes.length < 32 || bytes.length > 1024 * 1024) fail('Asset must be at most 1 MiB');
    const probe = spawnSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json','pipe:0'], { input: bytes, encoding: 'utf8', timeout: 10_000, maxBuffer: 64_000 });
    if (probe.error || probe.status !== 0) fail('Image decoder unavailable or asset invalid');
    let stream: { codec_name?: string; width?: number; height?: number } | undefined;
    try { stream = (JSON.parse(probe.stdout) as { streams: typeof stream[] }).streams?.[0]; } catch { fail('Invalid image metadata'); }
    const codec = stream?.codec_name;
    const format = codec === 'mjpeg' ? 'JPEG' : codec === 'png' ? 'PNG' : codec === 'webp' ? 'WEBP' : null;
    const ext = ref.split('.').at(-1)!.toLowerCase();
    if (!format || (format === 'PNG' && ext !== 'png') || (format === 'JPEG' && !['jpg','jpeg'].includes(ext)) || (format === 'WEBP' && ext !== 'webp')) fail('Unsupported or mismatched image type');
    const width = stream?.width, height = stream?.height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || !width || !height || width < 256 || height < 64 || width > 4096 || height > 4096 || width * height > 8_000_000) fail('Unsupported image dimensions');
    const placement = this.placement(targetPlacementId);
    const desired = placement.sourceSize.x / placement.sourceSize.y;
    if (Math.abs(width / height / desired - 1) > 0.08) fail('Image aspect ratio does not fit placement');
    const decode = spawnSync('ffmpeg', ['-xerror','-v','error','-i','pipe:0','-frames:v','1','-f','null','-'], { input: bytes, encoding: 'utf8', timeout: 10_000, maxBuffer: 64_000 });
    if (decode.error || decode.status !== 0) fail('Image cannot be decoded');
    return { sha256: createHash('sha256').update(bytes).digest('hex'), width, height, format };
  }
  listCreatives(advertiserId: string, limit = 25, offset = 0): Creative[] {
    return this.db.prepare(`SELECT id,advertiser_id AS advertiserId,asset_ref AS assetRef,sha256,width,height,format,
      target_placement_id AS targetPlacementId,display_name AS displayName,tagline,status,review_note AS reviewNote,
      created_at AS createdAt,updated_at AS updatedAt FROM sponsor_creatives WHERE advertiser_id = ? ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(advertiserId, ...page(limit, offset)) as Creative[];
  }
  getCreative(id: string): Creative | undefined {
    return this.db.prepare(`SELECT id,advertiser_id AS advertiserId,asset_ref AS assetRef,sha256,width,height,format,
      target_placement_id AS targetPlacementId,display_name AS displayName,tagline,status,review_note AS reviewNote,
      created_at AS createdAt,updated_at AS updatedAt FROM sponsor_creatives WHERE id = ?`).get(id) as Creative | undefined;
  }
  registerCreative(input: { advertiserId: string; assetRef: string; targetPlacementId: string; displayName?: string; tagline?: string }, operator: string): Creative {
    const advertiser = this.required(this.getAdvertiser(input.advertiserId), 'Advertiser');
    if (advertiser.status === 'REJECTED') fail('Rejected advertiser');
    const metadata = this.asset(input.assetRef, input.targetPlacementId);
    const displayName = optionalText(input.displayName, 'display name', 28), tagline = optionalText(input.tagline, 'tagline', 42);
    return this.transaction(() => {
      const id = randomUUID(), now = this.now();
      this.db.prepare(`INSERT INTO sponsor_creatives VALUES (?,?,?,?,?,?,?,?,?,?,'DRAFT',NULL,?,?)`).run(id, input.advertiserId, input.assetRef,
        metadata.sha256, metadata.width, metadata.height, metadata.format, input.targetPlacementId, displayName, tagline, now, now);
      this.audit('creative', id, this.actor(operator), 'REGISTER', { advertiserId: input.advertiserId, assetRef: input.assetRef, sha256: metadata.sha256, targetPlacementId: input.targetPlacementId });
      return this.required(this.getCreative(id), 'Creative');
    });
  }
  validateCreative(id: string): boolean {
    const creative = this.required(this.getCreative(id), 'Creative');
    try {
      const actual = this.asset(creative.assetRef, creative.targetPlacementId);
      return actual.sha256 === creative.sha256 && actual.width === creative.width && actual.height === creative.height && actual.format === creative.format;
    } catch { return false; }
  }
  setCreativeStatus(id: string, status: Exclude<CreativeStatus, 'DRAFT'>, reviewNote: string | null, operator: string): Creative {
    if (!['APPROVED','REJECTED','DISABLED'].includes(status)) fail('Invalid creative status');
    return this.transaction(() => {
      const previous = this.required(this.getCreative(id), 'Creative');
      const allowed: Record<CreativeStatus, CreativeStatus[]> = { DRAFT: ['APPROVED','REJECTED'], APPROVED: ['DISABLED'], REJECTED: [], DISABLED: [] };
      if (!allowed[previous.status].includes(status)) fail('Invalid creative transition');
      if (status === 'APPROVED' && (!this.validateCreative(id) || this.getAdvertiser(previous.advertiserId)?.status !== 'APPROVED')) fail('Creative or advertiser not approved');
      this.db.prepare('UPDATE sponsor_creatives SET status = ?,review_note = ?,updated_at = ? WHERE id = ?').run(status, note(reviewNote), this.now(), id);
      this.audit('creative', id, this.actor(operator), 'STATUS', { advertiserId: previous.advertiserId, from: previous.status, to: status });
      return this.required(this.getCreative(id), 'Creative');
    });
  }

  listCampaigns(limit = 25, offset = 0): Campaign[] {
    return this.db.prepare(`SELECT id,advertiser_id AS advertiserId,title,starts_at AS startsAt,ends_at AS endsAt,status,delivery_approved AS deliveryApproved,
      review_note AS reviewNote,created_at AS createdAt,updated_at AS updatedAt FROM sponsor_campaigns ORDER BY created_at DESC,id LIMIT ? OFFSET ?`).all(...page(limit, offset))
      .map(row => ({ ...row, deliveryApproved: row.deliveryApproved === 1 })) as Campaign[];
  }
  getCampaign(id: string): Campaign | undefined {
    const row = this.db.prepare(`SELECT id,advertiser_id AS advertiserId,title,starts_at AS startsAt,ends_at AS endsAt,status,delivery_approved AS deliveryApproved,
      review_note AS reviewNote,created_at AS createdAt,updated_at AS updatedAt FROM sponsor_campaigns WHERE id = ?`).get(id);
    return row ? { ...row, deliveryApproved: row.deliveryApproved === 1 } as Campaign : undefined;
  }
  createCampaign(input: { advertiserId: string; title: string; startsAt: string; endsAt: string }, operator: string): Campaign {
    this.required(this.getAdvertiser(input.advertiserId), 'Advertiser');
    const title = text(input.title, 'campaign title', 2, 100), dates = bounds(input.startsAt, input.endsAt);
    return this.transaction(() => {
      const id = randomUUID(), now = this.now();
      this.db.prepare("INSERT INTO sponsor_campaigns (id,advertiser_id,title,starts_at,ends_at,status,review_note,created_at,updated_at) VALUES (?,?,?,?,?,'DRAFT',NULL,?,?)").run(id, input.advertiserId, title, dates.startsAt, dates.endsAt, now, now);
      this.audit('campaign', id, this.actor(operator), 'CREATE', { advertiserId: input.advertiserId, ...dates });
      return this.required(this.getCampaign(id), 'Campaign');
    });
  }
  editCampaign(id: string, input: { title?: string; startsAt?: string; endsAt?: string }, operator: string): Campaign {
    return this.transaction(() => {
      const previous = this.required(this.getCampaign(id), 'Campaign');
      if (previous.status === 'CANCELLED') fail('Cancelled campaign is immutable');
      const title = input.title === undefined ? previous.title : text(input.title, 'campaign title', 2, 100);
      const dates = bounds(input.startsAt ?? previous.startsAt, input.endsAt ?? previous.endsAt);
      const material = dates.startsAt !== previous.startsAt || dates.endsAt !== previous.endsAt;
      const status = material && ['APPROVED','PAUSED'].includes(previous.status) ? 'IN_REVIEW' : previous.status;
      this.db.prepare('UPDATE sponsor_campaigns SET title = ?,starts_at = ?,ends_at = ?,status = ?,delivery_approved = CASE WHEN ? THEN 0 ELSE delivery_approved END,updated_at = ? WHERE id = ?').run(title, dates.startsAt, dates.endsAt, status, material ? 1 : 0, this.now(), id);
      this.audit('campaign', id, this.actor(operator), 'EDIT', { advertiserId: previous.advertiserId, fromStatus: previous.status, toStatus: status, titleChanged: title !== previous.title, datesChanged: material, ...dates });
      return this.required(this.getCampaign(id), 'Campaign');
    });
  }
  listAssignments(campaignId: string): Assignment[] {
    return this.db.prepare(`SELECT id,campaign_id AS campaignId,creative_id AS creativeId,placement_id AS placementId,
      city,surface,created_at AS createdAt,updated_at AS updatedAt FROM sponsor_assignments WHERE campaign_id = ? ORDER BY created_at,id LIMIT 100`).all(campaignId) as Assignment[];
  }
  private invalidateApproval(campaign: Campaign): void {
    if (campaign.status === 'APPROVED' || campaign.status === 'PAUSED')
      this.db.prepare("UPDATE sponsor_campaigns SET status = 'IN_REVIEW',delivery_approved = 0,updated_at = ? WHERE id = ?").run(this.now(), campaign.id);
  }
  addAssignment(campaignId: string, creativeId: string, placementId: string, operator: string): Assignment {
    return this.transaction(() => {
      const campaign = this.required(this.getCampaign(campaignId), 'Campaign');
      if (campaign.status === 'CANCELLED') fail('Cancelled campaign is immutable');
      const creative = this.required(this.getCreative(creativeId), 'Creative'), placement = this.placement(placementId);
      if (creative.advertiserId !== campaign.advertiserId || creative.targetPlacementId !== placementId) fail('Creative is not compatible with campaign placement');
      if (this.db.prepare('SELECT 1 FROM sponsor_assignments WHERE campaign_id = ? AND placement_id = ?').get(campaignId, placementId)) fail('Duplicate placement assignment');
      const id = randomUUID(), now = this.now();
      this.db.prepare('INSERT INTO sponsor_assignments VALUES (?,?,?,?,?,?,?,?)').run(id, campaignId, creativeId, placementId, placement.city, placement.surface, now, now);
      this.invalidateApproval(campaign);
      this.audit('assignment', id, this.actor(operator), 'ADD', { advertiserId: campaign.advertiserId, campaignId, creativeId, placementId });
      return this.listAssignments(campaignId).find(item => item.id === id)!;
    });
  }
  changeAssignment(id: string, creativeId: string, operator: string): Assignment {
    return this.transaction(() => {
      const assignment = this.required(this.db.prepare('SELECT campaign_id AS campaignId,placement_id AS placementId FROM sponsor_assignments WHERE id = ?').get(id) as { campaignId: string; placementId: string } | undefined, 'Assignment');
      const campaign = this.required(this.getCampaign(assignment.campaignId), 'Campaign');
      if (campaign.status === 'CANCELLED') fail('Cancelled campaign is immutable');
      const creative = this.required(this.getCreative(creativeId), 'Creative');
      if (creative.advertiserId !== campaign.advertiserId || creative.targetPlacementId !== assignment.placementId) fail('Creative is not compatible');
      this.db.prepare('UPDATE sponsor_assignments SET creative_id = ?,updated_at = ? WHERE id = ?').run(creativeId, this.now(), id);
      this.invalidateApproval(campaign);
      this.audit('assignment', id, this.actor(operator), 'CHANGE', { advertiserId: campaign.advertiserId, campaignId: campaign.id, creativeId });
      return this.listAssignments(campaign.id).find(item => item.id === id)!;
    });
  }
  removeAssignment(id: string, operator: string): void {
    this.transaction(() => {
      const assignment = this.required(this.db.prepare('SELECT campaign_id AS campaignId,placement_id AS placementId FROM sponsor_assignments WHERE id = ?').get(id) as { campaignId: string; placementId: string } | undefined, 'Assignment');
      const campaign = this.required(this.getCampaign(assignment.campaignId), 'Campaign');
      if (campaign.status === 'CANCELLED') fail('Cancelled campaign is immutable');
      this.db.prepare('DELETE FROM sponsor_assignments WHERE id = ?').run(id);
      this.invalidateApproval(campaign);
      this.audit('assignment', id, this.actor(operator), 'REMOVE', { advertiserId: campaign.advertiserId, campaignId: campaign.id, placementId: assignment.placementId });
    });
  }
  conflicts(campaignId: string): { placementId: string; campaignId: string }[] {
    const campaign = this.required(this.getCampaign(campaignId), 'Campaign');
    return this.db.prepare(`SELECT DISTINCT a.placement_id AS placementId,c.id AS campaignId FROM sponsor_assignments a
      JOIN sponsor_campaigns c ON c.id = a.campaign_id WHERE c.status = 'APPROVED' AND c.id <> ?
      AND c.starts_at < ? AND ? < c.ends_at AND a.placement_id IN
      (SELECT placement_id FROM sponsor_assignments WHERE campaign_id = ?) LIMIT 100`).all(campaignId, campaign.endsAt, campaign.startsAt, campaignId) as { placementId: string; campaignId: string }[];
  }
  private approvalProblems(campaign: Campaign, integrity: 'full' | 'hash' = 'full'): string[] {
    const problems: string[] = [];
    if (this.getAdvertiser(campaign.advertiserId)?.status !== 'APPROVED') problems.push('ADVERTISER_NOT_APPROVED');
    const assignments = this.listAssignments(campaign.id);
    if (!assignments.length) problems.push('NO_ASSIGNMENTS');
    for (const assignment of assignments) {
      const creative = this.getCreative(assignment.creativeId), placement = this.placements.get(assignment.placementId);
      if (!placement || placement.status !== 'QA_APPROVED' || placement.city !== assignment.city || placement.surface !== assignment.surface) problems.push(`PLACEMENT_NOT_APPROVED:${assignment.placementId}`);
      if (!creative || creative.status !== 'APPROVED' || creative.advertiserId !== campaign.advertiserId || creative.targetPlacementId !== assignment.placementId ||
        !(integrity === 'full' ? this.validateCreative(assignment.creativeId) : this.readCreativeBytes(assignment.creativeId))) problems.push(`CREATIVE_NOT_APPROVED:${assignment.creativeId}`);
    }
    if (this.conflicts(campaign.id).length) problems.push('PLACEMENT_CONFLICT');
    return problems;
  }
  setCampaignStatus(id: string, status: Exclude<CampaignStatus, 'DRAFT'>, reviewNote: string | null, operator: string): Campaign {
    if (!['IN_REVIEW','APPROVED','PAUSED','CANCELLED'].includes(status)) fail('Invalid campaign status');
    return this.transaction(() => {
      const campaign = this.required(this.getCampaign(id), 'Campaign');
      const allowed: Record<CampaignStatus, CampaignStatus[]> = { DRAFT: ['IN_REVIEW','CANCELLED'], IN_REVIEW: ['APPROVED','CANCELLED'], APPROVED: ['PAUSED','CANCELLED'], PAUSED: ['IN_REVIEW','CANCELLED'], CANCELLED: [] };
      if (!allowed[campaign.status].includes(status)) fail('Invalid campaign transition');
      if (status === 'APPROVED') {
        const problems = this.approvalProblems(campaign);
        if (problems.length) fail(problems.join(', '));
      }
      this.db.prepare('UPDATE sponsor_campaigns SET status = ?,delivery_approved = CASE WHEN ? = \'APPROVED\' THEN delivery_approved ELSE 0 END,review_note = ?,updated_at = ? WHERE id = ?').run(status, status, note(reviewNote), this.now(), id);
      this.audit('campaign', id, this.actor(operator), 'STATUS', { advertiserId: campaign.advertiserId, from: campaign.status, to: status });
      return this.required(this.getCampaign(id), 'Campaign');
    });
  }
  setCampaignDeliveryApproval(id: string, approved: boolean, operator: string): Campaign {
    if (typeof approved !== 'boolean') fail('Invalid delivery approval');
    return this.transaction(() => {
      const campaign = this.required(this.getCampaign(id), 'Campaign');
      if (approved && (campaign.status !== 'APPROVED' || this.approvalProblems(campaign).length)) fail('Campaign not eligible for delivery approval');
      this.db.prepare('UPDATE sponsor_campaigns SET delivery_approved = ?,updated_at = ? WHERE id = ?').run(approved ? 1 : 0, this.now(), id);
      this.audit('campaign', id, this.actor(operator), 'DELIVERY_APPROVAL', { approved });
      return this.required(this.getCampaign(id), 'Campaign');
    });
  }
  private commercialFingerprint(id: string): string {
    const campaign = this.required(this.getCampaign(id), 'Campaign');
    const advertiser = this.required(this.getAdvertiser(campaign.advertiserId), 'Advertiser');
    return createHash('sha256').update(JSON.stringify({ advertiser, startsAt: campaign.startsAt, endsAt: campaign.endsAt,
      assignments: this.listAssignments(id).map(assignment => ({ assignment, creative: this.getCreative(assignment.creativeId) })) })).digest('hex');
  }
  commercialReadiness(id: string, at = this.now()): { technical: string; commercial: string; serving: 'BLOCKED'; blockers: string[]; simulated: boolean; currentScheduleEligible: boolean; platform: 'web' } {
    const current = this.preview(id, at, 'hash');
    const preview = at < current.campaign.startsAt ? this.preview(id, current.campaign.startsAt, 'hash') : current;
    const blockers: string[] = [];
    const assignments = preview.assignments;
    if (assignments.length !== 1 || assignments[0]?.assignment.placementId !== HUB_PLACEMENT_ID) blockers.push('FIRST_PILOT_REQUIRES_ONE_HUB_SLOT');
    if (Date.parse(preview.campaign.endsAt) - Date.parse(preview.campaign.startsAt) !== 30 * 86400000) blockers.push('FIRST_PILOT_REQUIRES_30_DAYS');
    if (!preview.scheduleEligible) blockers.push(...preview.blockers.filter(reason => !['GLOBAL_PAUSE','HUB_SERVING_DISABLED','WORLD_SERVING_DISABLED','PLATFORM_AUDIENCE_REVIEW_PENDING','COMMERCIAL_SERVING_DISABLED'].includes(reason)));
    const release = this.db.prepare('SELECT fingerprint,evidence,simulated FROM sponsor_commercial_releases WHERE campaign_id = ?').get(id) as { fingerprint: string; evidence: string; simulated: number } | undefined;
    if (!release) blockers.push(...commercialEvidenceKeys.map(key => `MISSING_${key}`));
    else if (release.fingerprint !== this.commercialFingerprint(id)) blockers.push('RELEASE_EVIDENCE_STALE');
    const technical = preview.scheduleEligible && !blockers.some(reason => reason.startsWith('FIRST_PILOT')) ? 'READY' : 'BLOCKED';
    return { technical, commercial: blockers.length ? 'BLOCKED' : release?.simulated ? 'QA_SIMULATED' : 'RECORDED', serving: 'BLOCKED',
      blockers: [...blockers, 'PRODUCTION_ACTIVATION_NOT_AUTHORIZED'], simulated: release?.simulated === 1, currentScheduleEligible: current.scheduleEligible, platform: 'web' };
  }
  recordCommercialRelease(id: string, evidence: CommercialEvidence, simulated: boolean, operator: string): void {
    this.transaction(() => {
      const actor = this.actor(operator);
      if (typeof simulated !== 'boolean' || !evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
        Object.keys(evidence).length !== commercialEvidenceKeys.length || Object.keys(evidence).some(key => !(commercialEvidenceKeys as readonly string[]).includes(key))) fail('Invalid release evidence');
      const safe = Object.fromEntries(commercialEvidenceKeys.map(key => [key, text(evidence[key], key, 3, 120)]));
      // These are references to independently reviewed business records, never contracts or payment credentials.
      const campaign = this.required(this.getCampaign(id), 'Campaign');
      const preview = this.preview(id, this.now() < campaign.startsAt ? campaign.startsAt : this.now(), 'hash');
      if (!preview.scheduleEligible || preview.assignments.length !== 1 || preview.assignments[0].assignment.placementId !== HUB_PLACEMENT_ID ||
        Date.parse(preview.campaign.endsAt) - Date.parse(preview.campaign.startsAt) !== 30 * 86400000) fail('Pilot is not technically ready');
      if (simulated && (process.env.NODE_ENV === 'production' || process.env.RENDER_SERVICE_ID || process.env.AIRPORT_CHAOS_DEV_QA !== '1' ||
        !/^\/(?:private\/)?tmp\//.test(this.assetRoot) || !/^\/(?:private\/)?tmp\//.test(this.databasePath))) fail('Simulated release requires isolated local QA');
      this.db.prepare('INSERT OR REPLACE INTO sponsor_commercial_releases VALUES (?,?,?,?,?,?,?)').run(id, this.commercialFingerprint(id), JSON.stringify(safe), actor, this.now(), 'web', simulated ? 1 : 0);
      this.audit('campaign', id, actor, 'COMMERCIAL_EVIDENCE_RECORDED', { simulated, platform: 'web', references: safe });
    });
  }
  revokeCommercialRelease(id: string, operator: string): void {
    this.transaction(() => {
      this.required(this.getCampaign(id), 'Campaign');
      this.db.prepare('DELETE FROM sponsor_commercial_releases WHERE campaign_id = ?').run(id);
      this.audit('campaign', id, this.actor(operator), 'COMMERCIAL_EVIDENCE_REVOKED');
    });
  }
  hubCampaignIds(now: string): string[] {
    const time = utc(now);
    return (this.db.prepare(`SELECT c.id FROM sponsor_campaigns c JOIN sponsor_assignments a ON a.campaign_id = c.id
      WHERE c.status = 'APPROVED' AND c.delivery_approved = 1 AND c.starts_at <= ? AND ? < c.ends_at
      AND a.placement_id = ? ORDER BY c.id LIMIT 2`).all(time, time, HUB_PLACEMENT_ID) as { id: string }[]).map(row => row.id);
  }
  worldCampaignIds(now: string): string[] {
    const time = utc(now);
    return (this.db.prepare(`SELECT DISTINCT c.id FROM sponsor_campaigns c JOIN sponsor_assignments a ON a.campaign_id = c.id
      WHERE c.status = 'APPROVED' AND c.delivery_approved = 1 AND c.starts_at <= ? AND ? < c.ends_at
      AND a.surface = 'WORLD' ORDER BY c.id LIMIT 151`).all(time, time) as { id: string }[]).map(row => row.id);
  }
  readCreativeBytes(id: string): { bytes: Buffer; format: string; sha256: string } | undefined {
    const creative = this.getCreative(id);
    if (!creative || creative.status !== 'APPROVED' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.(png|jpg|jpeg|webp)$/i.test(creative.assetRef) || creative.assetRef.includes('..')) return undefined;
    try {
      const fd = openSync(join(this.assetRoot, creative.assetRef), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size < 32 || stat.size > 1024 * 1024) return undefined;
        const bytes = readFileSync(fd);
        if (createHash('sha256').update(bytes).digest('hex') !== creative.sha256) return undefined;
        return { bytes, format: creative.format, sha256: creative.sha256 };
      } finally { closeSync(fd); }
    } catch { return undefined; }
  }
  preview(id: string, testTime: string, integrity: 'full' | 'hash' = 'full'): { campaign: Campaign; advertiser: Advertiser; assignments: { assignment: Assignment; creative: Creative | undefined }[]; scheduleEligible: boolean; publicServingAllowed: false; blockers: string[] } {
    const campaign = this.required(this.getCampaign(id), 'Campaign'), advertiser = this.required(this.getAdvertiser(campaign.advertiserId), 'Advertiser');
    const time = utc(testTime), blockers = this.approvalProblems(campaign, integrity);
    if (campaign.status !== 'APPROVED') blockers.push('CAMPAIGN_NOT_APPROVED');
    if (time < campaign.startsAt) blockers.push('BEFORE_START');
    if (time >= campaign.endsAt) blockers.push('AT_OR_AFTER_END');
    const assignments = this.listAssignments(id).map(assignment => ({ assignment, creative: this.getCreative(assignment.creativeId) }));
    const scheduleEligible = blockers.length === 0;
    if (SPONSORSHIP_SERVING_DEFAULTS.globalPause) blockers.push('GLOBAL_PAUSE');
    if (!SPONSORSHIP_SERVING_DEFAULTS.hubEnabled && assignments.some(({ assignment }) => assignment.surface === 'HUB')) blockers.push('HUB_SERVING_DISABLED');
    if (!SPONSORSHIP_SERVING_DEFAULTS.worldEnabled && assignments.some(({ assignment }) => assignment.surface === 'WORLD')) blockers.push('WORLD_SERVING_DISABLED');
    blockers.push('PLATFORM_AUDIENCE_REVIEW_PENDING', 'COMMERCIAL_SERVING_DISABLED');
    return { campaign, advertiser, assignments, scheduleEligible, publicServingAllowed: false, blockers };
  }
  auditEvents(limit = 25, offset = 0, recordId?: string): AuditEvent[] {
    const sql = `SELECT id,record_type AS recordType,record_id AS recordId,actor,action,details,created_at AS createdAt
      FROM sponsor_audit ${recordId ? "WHERE record_id = ? OR json_extract(details,'$.campaignId') = ? OR json_extract(details,'$.advertiserId') = ?" : ''}
      ORDER BY created_at DESC,id LIMIT ? OFFSET ?`;
    return this.db.prepare(sql).all(...(recordId ? [recordId, recordId, recordId, ...page(limit, offset)] : page(limit, offset))) as AuditEvent[];
  }
}
