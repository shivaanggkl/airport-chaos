export type PublicSponsor = {
  advertiserId: string; campaignId: string; creativeId: string;
  name: string; description: string; tagline: string | null; logoUrl: string; website: string | null;
};
export type PublicWorldSponsor = { cityId: string; placementId: string; campaignId: string; creativeId: string; assetUrl: string };
export type SponsorCatalog = { revision: string; validUntil: string; maxAgeMs: number; measurementEnabled: boolean; hub: PublicSponsor | null; world: PublicWorldSponsor[]; sponsors: PublicSponsor[] };

const base = typeof window === 'undefined' ? 'http://localhost' : import.meta.env?.DEV ? 'http://localhost:8091' :
  (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:')
    ? (import.meta.env.VITE_NATIVE_BACKEND_ORIGIN || window.location.origin) : window.location.origin;
export const sponsorshipApi = (path: string): string => new URL(path, base).toString();
const empty: SponsorCatalog = { revision: 'house', validUntil: '', maxAgeMs: 0, measurementEnabled: false, hub: null, world: [], sponsors: [] };
let cached: { value: SponsorCatalog; expires: number } | undefined;
let inFlight: Promise<SponsorCatalog> | undefined;
const id = /^[0-9a-f-]{36}$/;
const p5WorldPlacements = new Set(['dallas-dfw-terminal-sign', 'dallas-love-terminal-sign', 'dallas-dfw-north-arrival']);

function validSponsor(value: unknown): value is PublicSponsor {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PublicSponsor>;
  if (!id.test(item.advertiserId ?? '') || !id.test(item.campaignId ?? '') || !id.test(item.creativeId ?? '') ||
    typeof item.name !== 'string' || item.name.length < 2 || item.name.length > 100 ||
    typeof item.description !== 'string' || item.description.length > 160 ||
    (item.tagline !== null && (typeof item.tagline !== 'string' || item.tagline.length > 42)) ||
    typeof item.logoUrl !== 'string' || !new RegExp(`^/api/sponsorship/creative/${item.creativeId}\\?v=[a-f0-9]{64}$`).test(item.logoUrl)) return false;
  if (item.website !== null) {
    if (typeof item.website !== 'string') return false;
    try { const url = new URL(item.website); if (url.protocol !== 'https:' || url.username || url.password) return false; }
    catch { return false; }
  }
  return true;
}

function validWorld(value: unknown): value is PublicWorldSponsor {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PublicWorldSponsor>;
  return item.cityId === 'dallas' && p5WorldPlacements.has(item.placementId ?? '') &&
    id.test(item.campaignId ?? '') && id.test(item.creativeId ?? '') &&
    typeof item.assetUrl === 'string' && new RegExp(`^/api/sponsorship/creative/${item.creativeId}\\?v=[a-f0-9]{64}$`).test(item.assetUrl);
}

function validated(value: unknown): SponsorCatalog {
  if (!value || typeof value !== 'object') throw new Error('Invalid catalog');
  const result = value as Partial<SponsorCatalog>;
  if (typeof result.revision !== 'string' || typeof result.measurementEnabled !== 'boolean' || typeof result.validUntil !== 'string' || !Number.isFinite(Date.parse(result.validUntil)) ||
    !Number.isFinite(result.maxAgeMs) || result.maxAgeMs! < 0 || result.maxAgeMs! > 60_000 ||
    (result.hub !== null && !validSponsor(result.hub)) || !Array.isArray(result.sponsors) || result.sponsors.length > 4 ||
    !result.sponsors.every(validSponsor) || !Array.isArray(result.world) || result.world.length > 3 ||
    !result.world.every(validWorld) || new Set(result.world.map(item => item.placementId)).size !== result.world.length) throw new Error('Invalid catalog');
  return result as SponsorCatalog;
}

export async function getSponsorCatalog(force = false): Promise<SponsorCatalog> {
  if (!force && cached && performance.now() < cached.expires) return cached.value;
  if (inFlight) return inFlight;
  inFlight = fetch(sponsorshipApi('/api/sponsorship/catalog'), { credentials: 'omit', signal: AbortSignal.timeout(5000), cache: 'no-store' })
    .then(async response => { if (!response.ok) throw new Error('Catalog unavailable'); return validated(await response.json()); })
    .then(value => { cached = { value, expires: performance.now() + value.maxAgeMs }; return value; })
    .catch(() => { cached = undefined; return empty; })
    .finally(() => { inFlight = undefined; });
  return inFlight;
}

export function clearSponsorCatalog(): void { cached = undefined; }
