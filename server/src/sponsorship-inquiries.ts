import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const sponsorshipInterests = ['HUB', 'DALLAS', 'CITY_PARTNER', 'UNSURE'] as const;
export type SponsorshipInterest = typeof sponsorshipInterests[number];
export type InquiryStatus = 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM';
export type SponsorshipInquiry = {
  id: string; companyName: string; contactName: string | null; workEmail: string;
  website: string | null; interest: SponsorshipInterest; message: string;
  createdAt: string; status: InquiryStatus;
};
export type ValidInquiry = Omit<SponsorshipInquiry, 'id' | 'createdAt' | 'status'>;

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
  const fields = Object.keys(input);
  if (fields.some(field => !['companyName', 'contactName', 'workEmail', 'website', 'interest', 'message'].includes(field))) return;
  const value = input as Record<string, unknown>;
  if (typeof value.companyName !== 'string' || typeof value.workEmail !== 'string' ||
    typeof value.message !== 'string' || typeof value.interest !== 'string' ||
    (value.contactName != null && typeof value.contactName !== 'string') ||
    (value.website != null && typeof value.website !== 'string')) return;
  const companyName = value.companyName.trim();
  const contactName = typeof value.contactName === 'string' ? value.contactName.trim() : '';
  const workEmail = value.workEmail.trim().toLowerCase();
  const websiteInput = typeof value.website === 'string' ? value.website.trim() : '';
  const message = value.message.trim();
  if (companyName.length < 2 || companyName.length > 100 || contactName.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(companyName + contactName + workEmail) || /[\u0000\u007f]/.test(message) ||
    workEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(workEmail) ||
    message.length < 10 || message.length > 1_000 ||
    !sponsorshipInterests.includes(value.interest as SponsorshipInterest)) return;
  const website = websiteInput ? validWebsite(websiteInput) : null;
  if (websiteInput && !website) return;
  return { companyName, contactName: contactName || null, workEmail, website: website ?? null, interest: value.interest as SponsorshipInterest, message };
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
  }

  create(input: ValidInquiry, now = new Date()): { id: string; received: true } | { limited: true; retryAfterMs: number } {
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
        (id,company_name,contact_name,work_email,website,interest,message,created_at,status)
        VALUES (?,?,?,?,?,?,?,?,'NEW')`).run(id, input.companyName, input.contactName,
        input.workEmail, input.website, input.interest, input.message, now.toISOString());
      this.db.exec('COMMIT');
      return { id, received: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  list(limit = 25): SponsorshipInquiry[] {
    return this.db.prepare(`SELECT id,company_name AS companyName,contact_name AS contactName,
      work_email AS workEmail,website,interest,message,created_at AS createdAt,status
      FROM sponsorship_inquiries ORDER BY created_at DESC LIMIT ?`).all(Math.max(1, Math.min(100, limit))) as SponsorshipInquiry[];
  }

  get(id: string): SponsorshipInquiry | undefined {
    return this.db.prepare(`SELECT id,company_name AS companyName,contact_name AS contactName,
      work_email AS workEmail,website,interest,message,created_at AS createdAt,status
      FROM sponsorship_inquiries WHERE id = ?`).get(id) as SponsorshipInquiry | undefined;
  }

  updateStatus(id: string, status: Exclude<InquiryStatus, 'NEW'>): boolean {
    if (!['CONTACTED', 'CLOSED', 'SPAM'].includes(status)) return false;
    return this.db.prepare('UPDATE sponsorship_inquiries SET status = ? WHERE id = ?').run(status, id).changes === 1;
  }

  close(): void { this.db.close(); }
}
