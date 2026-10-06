import { apiFetch, apiUrl } from './transport';

export type ProductIntent =
  | 'hub_viewed' | 'fly_clicked' | 'city_selected' | 'rewards_viewed' | 'daily_reward_claim_clicked'
  | 'rewarded_ad_offer_viewed' | 'rewarded_ad_no_fill' | 'referral_screen_viewed' | 'referral_share_started' | 'referral_link_copied'
  | 'garage_opened' | 'aircraft_viewed' | 'aircraft_selected' | 'firehawk_purchase_clicked' | 'sky_token_store_viewed';

const sessionKey = 'airport-chaos-analytics-session-v1';
let memorySessionId: string | undefined;

export function productAnalyticsSessionId(): string {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(stored)) return memorySessionId = stored;
  } catch { /* in-memory session still correlates this page */ }
  memorySessionId = crypto.randomUUID();
  try { sessionStorage.setItem(sessionKey, memorySessionId); } catch { /* optional */ }
  return memorySessionId;
}

/** Intent-only telemetry; failure never blocks the player's action. */
export function recordProductIntent(event: ProductIntent, dimension?: { cityId?: string; aircraftType?: string }): void {
  const payload = { event, sessionId: productAnalyticsSessionId(), ...dimension };
  void apiFetch(apiUrl('/api/analytics/intent'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => undefined);
}
