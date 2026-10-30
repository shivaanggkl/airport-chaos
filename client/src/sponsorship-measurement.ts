import { sponsorshipApi, type SponsorCatalog } from './sponsorship-catalog';

export type SponsorMeasurementType = 'HUB_ESTIMATED_EXPOSURE' | 'WORLD_ESTIMATED_EXPOSURE' | 'SPONSOR_DETAILS_OPEN' | 'SPONSOR_WEBSITE_ACTION';
export type SponsorMeasurement = {
  type: SponsorMeasurementType; campaignId: string; creativeId: string;
  placementId: string; cityId: string; source?: 'HUB' | 'DIRECTORY';
};

// One continuous viewing episode may produce one estimated exposure. A fresh
// episode needs three seconds out of qualifying view and a 30-second cooldown.
export class SponsorExposureEpisode {
  private visibleSince: number | undefined;
  private outSince: number | undefined;
  private lastAt = -Infinity;
  private armed = true;
  update(qualifies: boolean, now = performance.now()): boolean {
    if (!qualifies) {
      this.visibleSince = undefined;
      this.outSince ??= now;
      if (now - this.outSince >= 3000) this.armed = true;
      return false;
    }
    if (this.outSince !== undefined && now - this.outSince >= 3000) this.armed = true;
    this.outSince = undefined;
    this.visibleSince ??= now;
    if (!this.armed || now - this.visibleSince < 1000 || now - this.lastAt < 30_000) return false;
    this.armed = false;
    this.lastAt = now;
    return true;
  }
  reset(): void { this.visibleSince = undefined; this.outSince = undefined; this.armed = true; }
}

const queue: Array<SponsorMeasurement & { eventId: string }> = [];
let activeUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;
let failures = 0;

export function setSponsorMeasurementCatalog(catalog: SponsorCatalog): void {
  activeUntil = catalog.measurementEnabled && catalog.maxAgeMs > 0 ? performance.now() + catalog.maxAgeMs : 0;
  if (!activeUntil) { queue.length = 0; if (timer) clearTimeout(timer); timer = undefined; }
}

export function recordSponsorMeasurement(event: SponsorMeasurement): void {
  if (!activeUntil || performance.now() >= activeUntil || document.hidden) return;
  if (queue.length >= 20) return;
  queue.push({ ...event, eventId: crypto.randomUUID() });
  if (!timer) timer = setTimeout(() => { timer = undefined; void flushSponsorMeasurements(); }, 30_000);
}

export async function flushSponsorMeasurements(): Promise<void> {
  if (sending || !queue.length || !activeUntil || performance.now() >= activeUntil) { if (performance.now() >= activeUntil) queue.length = 0; return; }
  if (timer) clearTimeout(timer);
  timer = undefined;
  sending = true;
  const events = queue.splice(0, 20);
  try {
    const response = await fetch(sponsorshipApi('/api/sponsorship/events'), { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }), keepalive: true, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Measurement unavailable');
    failures = 0;
  } catch {
    if (++failures < 3 && activeUntil && performance.now() < activeUntil) queue.unshift(...events.slice(0, Math.max(0, 20 - queue.length)));
    else failures = 0;
  } finally {
    sending = false;
    if (queue.length && activeUntil && performance.now() < activeUntil && !timer)
      timer = setTimeout(() => { timer = undefined; void flushSponsorMeasurements(); }, failures ? 30_000 : 0);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flushSponsorMeasurements(); });
  window.addEventListener('pagehide', () => { void flushSponsorMeasurements(); });
}
