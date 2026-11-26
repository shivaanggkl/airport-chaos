import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {advertisingPackage, advertisingWaitlistConsent, advertisingEmailWaitlistConsent, type AdvertisingPackageId} from '../../shared/advertising-packages.mjs';

export const sponsorshipInterests = ['HUB', 'DALLAS', 'CITY_PARTNER', 'UNSURE'] as const;
export type SponsorshipInterest = typeof sponsorshipInterests[number];
export type InquiryStatus = 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM';
export type SponsorshipInquiry = {
  id: string; companyName: string; contactName: string | null; workEmail: string;
  website: string | null; interest: SponsorshipInterest; message: string;
  createdAt: string; status: InquiryStatus;
  requestKind: 'INQUIRY' | 'WAITLIST'; packageId: AdvertisingPackageId | null;
  emailConsent: boolean | null; consentedAt: string | null; consentText: string | null;
};
export type ValidInquiry = Omit<SponsorshipInquiry, 'id' | 'createdAt' | 'status' | 'requestKind' | 'packageId' | 'emailConsent' | 'consentedAt' | 'consentText'> &
  ({requestKind?: 'INQUIRY'; packageId?: never; emailConsent?: never} | {requestKind: 'WAITLIST'; packageId: AdvertisingPackageId; emailConsent: true; emailOnly?: never} | {requestKind:'WAITLIST';packageId:AdvertisingPackageId|null;emailConsent:true;emailOnly:true});

export function validWebsite(value: string): string | undefined {
  if (value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) return;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !host.includes('.') || ['.local', '.localhost', '.internal', '.lan', '.home.arpa'].some(suffix => host.endsWith(suffix)) ||
      host === 'localhost' || isIP(host) || !/^[a-z0-9.-]+$/.test(host) ||
      host.split('.').some(part => !part || part.startsWith('-') || part.endsWith('-'))) return;
    return url.toString();
  } catch { return; }
}

export function validateSponsorshipInquiry(input: unknown): ValidInquiry | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const value = input as Record<string, unknown>;
  const waitlist = value.requestKind === 'WAITLIST';
  if (waitlist && value.emailOnly === true) {
    if (Object.keys(value).some(field => !['requestKind','emailOnly','workEmail','packageId','emailConsent'].includes(field)) ||
      value.emailConsent !== true || typeof value.workEmail !== 'string') return;
    const workEmail=value.workEmail.trim().toLowerCase();
    if (workEmail.length>254 || /[\u0000-\u001f\u007f]/.test(workEmail) || !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(workEmail)) return;
    const selectedPackage=advertisingPackage(value.packageId);
    if (value.packageId != null && !selectedPackage) return;
    return {requestKind:'WAITLIST',emailOnly:true,packageId:selectedPackage?.id??null,emailConsent:true,
      companyName:'',contactName:null,website:null,message:'',workEmail,interest:selectedPackage?.interest??'UNSURE'};
  }

  const allowed = waitlist
    ? ['requestKind','packageId','emailConsent','companyName','contactName','workEmail','website','message']
    : ['companyName','contactName','workEmail','website','interest','message'];
  if (Object.keys(value).some(field => !allowed.includes(field))) return;
  const selectedPackage = waitlist ? advertisingPackage(value.packageId) : undefined;
  if (waitlist && (!selectedPackage || value.emailConsent !== true)) return;
  if (typeof value.companyName !== 'string' || typeof value.workEmail !== 'string' ||
    (waitlist ? value.message != null && typeof value.message !== 'string' : typeof value.message !== 'string' || typeof value.interest !== 'string') ||
    (value.contactName != null && typeof value.contactName !== 'string') ||
    (value.website != null && typeof value.website !== 'string')) return;
  const companyName = value.companyName.trim();
  const contactName = typeof value.contactName === 'string' ? value.contactName.trim() : '';
  const workEmail = value.workEmail.trim().toLowerCase();
  const websiteInput = typeof value.website === 'string' ? value.website.trim() : '';
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (companyName.length < 2 || companyName.length > 100 || contactName.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(companyName + contactName + workEmail) || /[\u0000\u007f]/.test(message) ||
    workEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(workEmail) ||
    (!waitlist && message.length < 10) || message.length > 1_000 ||
    (!waitlist && !sponsorshipInterests.includes(value.interest as SponsorshipInterest))) return;
  const website = websiteInput ? validWebsite(websiteInput) : null;
  if (websiteInput && !website) return;
  const business = {companyName, contactName: contactName || null, workEmail, website: website ?? null, message};
  return selectedPackage ? {...business, interest:selectedPackage.interest, requestKind:'WAITLIST', packageId:selectedPackage.id, emailConsent:true}
    : {...business, interest:value.interest as SponsorshipInterest};
}

export class SponsorshipInquiryStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS sponsorship_inquiries (
      id TEXT PRIMARY KEY, company_name TEXT NOT NULL, contact_name TEXT,
      work_email TEXT NOT NULL, website TEXT, interest TEXT NOT NULL
        CHECK(interest IN ('HUB','DALLAS','CITY_PARTNER','UNSURE')),
      message TEXT NOT NULL, created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','CLOSED','SPAM'))
    );
    CREATE INDEX IF NOT EXISTS sponsorship_inquiries_recent ON sponsorship_inquiries(created_at DESC);
    CREATE INDEX IF NOT EXISTS sponsorship_inquiries_email_recent ON sponsorship_inquiries(work_email, created_at DESC);`);
    // Additive migration: historical inquiries retain their original fields and
    // have no inferred consent. Existing operators keep using this same table.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const columns = new Set((this.db.prepare('PRAGMA table_info(sponsorship_inquiries)').all() as {name:string}[]).map(column => column.name));
      for (const [name, definition] of Object.entries({
        request_kind: "TEXT NOT NULL DEFAULT 'INQUIRY' CHECK(request_kind IN ('INQUIRY','WAITLIST'))",
        package_id: "TEXT CHECK(package_id IN ('HUB_SPOTLIGHT','DALLAS_NETWORK'))",
        email_consent: 'INTEGER CHECK(email_consent IN (0,1))', consented_at: 'TEXT', consent_text: 'TEXT',
      })) if (!columns.has(name)) this.db.exec(`ALTER TABLE sponsorship_inquiries ADD COLUMN ${name} ${definition}`);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }

  }

  create(input: ValidInquiry, now = new Date()): { id: string; received: true } | { limited: true; retryAfterMs: number } {
    const waitlist = input.requestKind === 'WAITLIST';
    const selectedPackage = waitlist ? advertisingPackage(input.packageId) : undefined;
    if (waitlist && ((!selectedPackage && !(input.emailOnly === true && input.packageId === null)) || input.emailConsent !== true)) throw new Error('Invalid waitlist consent or package');
    const cutoff = new Date(now.getTime() - 60 * 60_000).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const recent = this.db.prepare('SELECT created_at FROM sponsorship_inquiries WHERE work_email = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
        .get(input.workEmail, cutoff) as { created_at: string } | undefined;
      if (recent) {
        this.db.exec('COMMIT');
        return { limited: true, retryAfterMs: Math.max(1, new Date(recent.created_at).getTime() + 60 * 60_000 - now.getTime()) };
      }
      const id = randomUUID();
      this.db.prepare(`INSERT INTO sponsorship_inquiries
        (id,company_name,contact_name,work_email,website,interest,message,created_at,status,request_kind,package_id,email_consent,consented_at,consent_text)
        VALUES (?,?,?,?,?,?,?,?,'NEW',?,?,?,?,?)`).run(id, input.companyName, input.contactName,
        input.workEmail, input.website, selectedPackage?.interest ?? input.interest, input.message, now.toISOString(),
        waitlist ? 'WAITLIST' : 'INQUIRY', selectedPackage?.id ?? null, waitlist ? 1 : null, waitlist ? now.toISOString() : null, waitlist ? (input.emailOnly === true ? advertisingEmailWaitlistConsent : advertisingWaitlistConsent) : null);
      this.db.exec('COMMIT');
      return { id, received: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  list(limit = 25): SponsorshipInquiry[] {
    const rows = this.db.prepare(`SELECT id,company_name AS companyName,contact_name AS contactName,
      work_email AS workEmail,website,interest,message,created_at AS createdAt,status,request_kind AS requestKind,package_id AS packageId,
      email_consent AS emailConsent,consented_at AS consentedAt,consent_text AS consentText
      FROM sponsorship_inquiries ORDER BY created_at DESC LIMIT ?`).all(Math.max(1, Math.min(100, limit))) as (Omit<SponsorshipInquiry,'emailConsent'> & {emailConsent:number|null})[];
    return rows.map(row => ({...row,emailConsent:row.emailConsent === null ? null : row.emailConsent === 1}));
  }

  get(id: string): SponsorshipInquiry | undefined {
    const row = this.db.prepare(`SELECT id,company_name AS companyName,contact_name AS contactName,
      work_email AS workEmail,website,interest,message,created_at AS createdAt,status,request_kind AS requestKind,package_id AS packageId,
      email_consent AS emailConsent,consented_at AS consentedAt,consent_text AS consentText
      FROM sponsorship_inquiries WHERE id = ?`).get(id) as (Omit<SponsorshipInquiry,'emailConsent'> & {emailConsent:number|null}) | undefined;
    return row ? {...row,emailConsent:row.emailConsent === null ? null : row.emailConsent === 1} : undefined;
  }

  updateStatus(id: string, status: Exclude<InquiryStatus, 'NEW'>): boolean {
    if (!['CONTACTED', 'CLOSED', 'SPAM'].includes(status)) return false;
    return this.db.prepare('UPDATE sponsorship_inquiries SET status = ? WHERE id = ?').run(status, id).changes === 1;
  }

  close(): void { this.db.close(); }
}
