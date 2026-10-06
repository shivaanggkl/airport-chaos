/** Client events describe intent only. Outcomes are recorded by their authoritative server paths. */
export const clientIntentProperties = {
  hub_viewed: [], fly_clicked: [], city_selected: ['cityId'], rewards_viewed: [],
  daily_reward_claim_clicked: [], rewarded_ad_offer_viewed: [],
  rewarded_ad_no_fill: [],
  referral_screen_viewed: [], referral_share_started: [], referral_link_copied: [],
  garage_opened: [], aircraft_viewed: ['aircraftType'], aircraft_selected: ['aircraftType'],
  cosmetic_viewed: ['cosmeticId', 'aircraftType'], cosmetic_previewed: ['cosmeticId', 'aircraftType'],
  cosmetic_unlock_started: ['cosmeticId', 'aircraftType', 'currency'],
  firehawk_purchase_clicked: [],
  sky_token_store_viewed: [],
} as const;

export type ClientIntentEvent = keyof typeof clientIntentProperties;
const safeDimension = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

export function parseClientIntent(value: unknown): { event: ClientIntentEvent; cityId?: string; aircraftType?: string; cosmeticId?: string; currency?: string; sessionId: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const payload = value as Record<string, unknown>;
  if (typeof payload.event !== 'string' || !Object.hasOwn(clientIntentProperties, payload.event)) return undefined;
  const event = payload.event as ClientIntentEvent;
  if (typeof payload.sessionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.sessionId)) return undefined;
  const allowed = new Set<string>(['event', 'sessionId', ...clientIntentProperties[event]]);
  if (Object.keys(payload).some(key => !allowed.has(key))) return undefined;
  for (const key of clientIntentProperties[event]) if (typeof payload[key] !== 'string' || !safeDimension.test(payload[key])) return undefined;
  return { event, sessionId: payload.sessionId,
    cityId: typeof payload.cityId === 'string' ? payload.cityId : undefined,
    aircraftType: typeof payload.aircraftType === 'string' ? payload.aircraftType : undefined,
    cosmeticId: typeof payload.cosmeticId === 'string' ? payload.cosmeticId : undefined,
    currency: typeof payload.currency === 'string' ? payload.currency : undefined };
}

/** New server milestones. Legacy event names remain readable for historical reports. */
export const serverMilestoneEvents = [
  'account_created', 'flight_started', 'flight_activated', 'flight_landed', 'flight_crashed', 'flight_ended', 'combat_kill', 'aircraft_equipped',
  'daily_reward_available', 'daily_reward_claimed', 'rewarded_ad_verified', 'rewarded_ad_reward_granted',
  'firehawk_viewed', 'firehawk_trial_started', 'firehawk_trial_completed',
  'firehawk_purchase_started', 'firehawk_purchase_succeeded', 'firehawk_purchase_failed',
  'sky_token_purchase_started', 'sky_token_purchase_succeeded', 'sky_token_purchase_failed', 'sky_token_purchase_refunded', 'sky_token_spent',
  'firehawk_restore_succeeded',
] as const;

/** Accept historical call sites, but persist only the canonical name going forward. */
export const legacyEventNames = {
  fighter_modal_viewed: 'firehawk_viewed', fighter_trial_started: 'firehawk_trial_started',
  fighter_trial_completed: 'firehawk_trial_completed', fighter_purchase_clicked: 'firehawk_purchase_clicked',
  fighter_checkout_created: 'firehawk_purchase_started', fighter_purchase_completed: 'firehawk_purchase_succeeded',
  purchase_recovery_succeeded: 'firehawk_restore_succeeded',
} as const;
