import type { DatabaseSync } from 'node:sqlite';
import { aircraftEconomy, firehawkProduct } from '../../shared/aircraft-economy.mjs';

const dayMs = 86_400_000;
const gameplayReasons = new Set([
  'FLIGHT_REWARD', 'MISSION_REWARD', 'LANDING_REWARD', 'COMBAT_REWARD', 'CHALLENGE_REWARD',
  'EVENT_REWARD', 'TERRITORY_REWARD', 'OBJECTIVE_REWARD', 'DISCOVERY_REWARD', 'INTERCITY_REWARD',
  'SEASON_REWARD', 'WEEKLY_REWARD',
]);

export type BusinessReport = {
  accounts: number; dau: number; d1: number; d1Eligible: number; d7: number; d7Eligible: number;
  gameplayD1: number; gameplayD7: number; activations: number; flights: number; landings: number; missions: number;
  activeMinutes: number; airborneMinutes: number; daysActive: number; sessionsPerPlayer: number; flightsPerPlayer: number; daysActivePerPlayer: number;
  dailyClaims: number; dailyAvailable: number; dailyClaimClicks: number; dailyRepeatClaimers: number;
  dailyByDay: Array<{ day: number; claims: number }>;
  rewardedAdGrants: number; adDismissals: number; adNoFill: number; adFailures: number; referralQualifications: number;
  creditsCreated: number; creditsSpent: number; netCredits: number; gameplayEarnShare: number;
  creditSources: Array<{ reason: string; credits: number }>;
  creditSinks: Array<{ reason: string; credits: number }>;
  averageBalance: number; medianBalance: number; mammothAffordablePercent: number; nightowlAffordablePercent: number;
  averageUnlockDays: number; referredCreditsSpent: number; averageReferralQualificationDays: number;
  referredD1: number; referredD1Eligible: number; referredD7: number; referredD7Eligible: number;
  aircraft: Array<{ aircraft: string; views: number; selections: number; equips: number; flights: number; airborneMinutes: number; unlocks: number }>;
  cities: Array<{ city: string; flights: number; airborneMinutes: number; landings: number }>;
  platforms: Array<{ platform: string; accounts: number; activations: number }>;
  referralAccounts: number; organicOrUnknownAccounts: number;
  adRequests: number; adStarts: number; adVerified: number; adLimitReached: number;
  inviteViews: number; inviteShares: number; referralSignups: number;
  firehawkViews: number; firehawkTrials: number; firehawkTrialPilots: number; firehawkTrialCompletions: number;
  firehawkPurchaseStarts: number; firehawkPurchases: number; firehawkRestoreSuccesses: number;
  firehawkTrialPurchaseConversions: number; flightsAfterFirehawkPurchase: number;
  diagnostics: { negativeBalances: number; walletMismatches: number; duplicateReferralPayouts: number;
    firehawkEntitlementWithoutSource: number; adGrantsWithoutVerification: boolean };
};

/** Read-only internal report. Wallet, referral, and account tables remain the source of truth. */
export function businessReport(database: DatabaseSync, now = Date.now(), since = now - 30 * dayMs, environment?: string): BusinessReport {
  const has = (table: string) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  if (!has('wallet_transactions') || !has('accounts') || !has('player_profiles')) throw new Error('Business report requires the account and wallet schema');
  const envClause = environment ? ' AND environment=?' : '';
  const args = (first: number) => environment ? [first, environment] : [first];
  const eventCount = (name: string): number => (database.prepare(`SELECT COUNT(*) count FROM analytics_events WHERE event_name=? AND created_at>=?${envClause}`)
    .get(name, ...args(since)) as { count: number }).count;
  const pairCount = (a: string, b: string): number => (database.prepare(`SELECT COUNT(*) count FROM analytics_events WHERE event_name IN (?,?) AND created_at>=?${envClause}`)
    .get(a, b, ...args(since)) as { count: number }).count;
  const accounts = (database.prepare('SELECT COUNT(*) count FROM accounts WHERE created_at>=?').get(since) as { count: number }).count;
  const dau = (database.prepare(`SELECT COUNT(DISTINCT pilot_id) count FROM analytics_events WHERE created_at>=? AND event_name IN ('hub_viewed','flight_started')${envClause}`)
    .get(...args(now - dayMs)) as { count: number }).count;
  const cohort = (offset: number, gameplay: boolean): { eligible: number; returned: number } => {
    const cutoff = now - (offset + 1) * dayMs;
    const row = database.prepare(`SELECT COUNT(*) eligible,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM analytics_events e WHERE e.pilot_id=l.pilot_id
        AND e.created_at>=a.created_at+? AND e.created_at<a.created_at+?
        AND e.event_name IN (${gameplay ? "'flight_started'" : "'hub_viewed','flight_started'"})${environment ? ' AND e.environment=?' : ''}) THEN 1 ELSE 0 END) returned
      FROM accounts a JOIN account_profile_links l ON l.account_id=a.account_id
      WHERE a.created_at>=? AND a.created_at<=?`).get(
        offset * dayMs, (offset + 1) * dayMs, ...(environment ? [environment] : []), since, cutoff,
      ) as { eligible: number; returned: number | null };
    return { eligible: row.eligible, returned: row.returned ?? 0 };
  };
  const d1 = cohort(1, false), d7 = cohort(7, false);
  const gameplayD1 = cohort(1, true), gameplayD7 = cohort(7, true);
  const referralCohort = (offset: number): { eligible: number; returned: number } => {
    const row = database.prepare(`SELECT COUNT(*) eligible,SUM(CASE WHEN EXISTS (
      SELECT 1 FROM analytics_events e WHERE e.pilot_id=l.pilot_id AND e.event_name IN ('hub_viewed','flight_started')
        AND e.created_at>=a.created_at+? AND e.created_at<a.created_at+?${environment ? ' AND e.environment=?' : ''}
    ) THEN 1 ELSE 0 END) returned FROM accounts a JOIN account_profile_links l ON l.account_id=a.account_id
      JOIN pilot_referrals r ON r.referred_pilot_id=l.pilot_id AND r.attribution_version=1
      WHERE a.created_at>=? AND a.created_at<=?`).get(
        offset * dayMs, (offset + 1) * dayMs, ...(environment ? [environment] : []), since, now - (offset + 1) * dayMs,
      ) as { eligible: number; returned: number | null };
    return { eligible: row.eligible, returned: row.returned ?? 0 };
  };
  const referredD1 = referralCohort(1), referredD7 = referralCohort(7);
  const walletRows = database.prepare(`SELECT direction,reason,SUM(amount) credits FROM wallet_transactions
    WHERE currency='CREDITS' AND created_at>=? GROUP BY direction,reason ORDER BY credits DESC`).all(since) as
    Array<{ direction: 'CREDIT' | 'DEBIT'; reason: string; credits: number }>;
  const creditSources = walletRows.filter(row => row.direction === 'CREDIT').map(({ reason, credits }) => ({ reason, credits }));
  const creditSinks = walletRows.filter(row => row.direction === 'DEBIT').map(({ reason, credits }) => ({ reason, credits }));
  const creditsCreated = creditSources.reduce((sum, row) => sum + row.credits, 0);
  const creditsSpent = creditSinks.reduce((sum, row) => sum + row.credits, 0);
  const freeCredits = creditSources.filter(row => row.reason !== 'ADMIN_ADJUSTMENT' && row.reason !== 'MIGRATION')
    .reduce((sum, row) => sum + row.credits, 0);
  const gameplayCredits = creditSources.filter(row => gameplayReasons.has(row.reason)).reduce((sum, row) => sum + row.credits, 0);
  const balances = database.prepare(`SELECT COUNT(*) players,AVG(p.credits) average,
    SUM(CASE WHEN p.credits>=? THEN 1 ELSE 0 END) mammoth,
    SUM(CASE WHEN p.credits>=? THEN 1 ELSE 0 END) nightowl
    FROM player_profiles p JOIN account_profile_links l ON l.pilot_id=p.pilot_id`)
    .get(aircraftEconomy.cargo.credits, aircraftEconomy.privateJet.credits) as
    { players: number; average: number | null; mammoth: number | null; nightowl: number | null };
  const median = database.prepare(`SELECT AVG(credits) median FROM (
    SELECT p.credits, ROW_NUMBER() OVER (ORDER BY p.credits) rn, COUNT(*) OVER () total
    FROM player_profiles p JOIN account_profile_links l ON l.pilot_id=p.pilot_id
  ) WHERE rn BETWEEN (total+1)/2 AND (total+2)/2`).get() as { median: number | null };
  const unlockDays = database.prepare(`SELECT AVG((first_purchase-a.created_at)/?) days FROM (
    SELECT pilot_id,MIN(created_at) first_purchase FROM wallet_transactions WHERE reason='AIRCRAFT_PURCHASE' GROUP BY pilot_id
  ) w JOIN account_profile_links l ON l.pilot_id=w.pilot_id JOIN accounts a ON a.account_id=l.account_id`)
    .get(dayMs) as { days: number | null };
  const flightTotals = database.prepare(`SELECT COALESCE(SUM(json_extract(metadata,'$.durationSeconds')),0) active,
    COALESCE(SUM(json_extract(metadata,'$.airborneSeconds')),0) airborne
    FROM analytics_events WHERE event_name='flight_ended' AND created_at>=?${envClause}`)
    .get(...args(since)) as { active: number; airborne: number };
  const dimensions = (column: 'aircraft_type' | 'city_id') => database.prepare(`SELECT COALESCE(${column},'unknown') label,
    COUNT(*) flights FROM analytics_events WHERE event_name='flight_started' AND created_at>=?${envClause}
    GROUP BY ${column} ORDER BY flights DESC`).all(...args(since)) as Array<{ label: string; flights: number }>;
  const airborneBy = (column: 'aircraft_type' | 'city_id') => new Map((database.prepare(`SELECT COALESCE(${column},'unknown') label,
    COALESCE(SUM(json_extract(metadata,'$.airborneSeconds')),0) seconds FROM analytics_events
    WHERE event_name='flight_ended' AND created_at>=?${envClause} GROUP BY ${column}`).all(...args(since)) as
    Array<{ label: string; seconds: number }>).map(row => [row.label, row.seconds]));
  const aircraftAirborne = airborneBy('aircraft_type'), cityAirborne = airborneBy('city_id');
  const unlocks = new Map((database.prepare(`SELECT COALESCE(aircraft_type,'unknown') label,COUNT(*) count FROM analytics_events
    WHERE event_name='aircraft_unlocked' AND created_at>=?${envClause} GROUP BY aircraft_type`).all(...args(since)) as
    Array<{ label: string; count: number }>).map(row => [row.label, row.count]));
  const aircraftEventCounts = (name: string) => new Map((database.prepare(`SELECT COALESCE(aircraft_type,'unknown') label,COUNT(*) count
    FROM analytics_events WHERE event_name=? AND created_at>=?${envClause} GROUP BY aircraft_type`)
    .all(name, ...args(since)) as Array<{ label: string; count: number }>).map(row => [row.label, row.count]));
  const views = aircraftEventCounts('aircraft_viewed'), selections = aircraftEventCounts('aircraft_selected'), equips = aircraftEventCounts('aircraft_equipped');
  const aircraftFlights = new Map(dimensions('aircraft_type').map(row => [row.label, row.flights]));
  const aircraftLabels = [...new Set([...aircraftFlights.keys(), ...views.keys(), ...selections.keys(), ...equips.keys(), ...unlocks.keys()])];
  const dailyByDay = database.prepare(`SELECT CAST(json_extract(metadata,'$.day') AS INTEGER) day,COUNT(*) claims
    FROM analytics_events WHERE event_name='daily_reward_claimed' AND created_at>=?${envClause}
      AND json_extract(metadata,'$.day') BETWEEN 1 AND 7 GROUP BY day ORDER BY day`)
    .all(...args(since)) as Array<{ day: number; claims: number }>;
  const dailyRepeatClaimers = (database.prepare(`SELECT COUNT(*) count FROM (
    SELECT pilot_id FROM analytics_events WHERE event_name='daily_reward_claimed' AND created_at>=?${envClause}
    GROUP BY pilot_id HAVING COUNT(*)>=2)`).get(...args(since)) as { count: number }).count;
  const landingsByCity = new Map((database.prepare(`SELECT COALESCE(city_id,'unknown') label,COUNT(*) count FROM analytics_events
    WHERE event_name='flight_landed' AND created_at>=?${envClause} GROUP BY city_id`).all(...args(since)) as
    Array<{ label: string; count: number }>).map(row => [row.label, row.count]));
  const platforms = database.prepare(`SELECT COALESCE(platform,'unknown') platform,COUNT(*) accounts FROM analytics_events
    WHERE event_name='account_created' AND created_at>=?${envClause} GROUP BY platform`).all(...args(since)) as
    Array<{ platform: string; accounts: number }>;
  const activatedByPlatform = new Map((database.prepare(`SELECT COALESCE(platform,'unknown') platform,COUNT(*) count FROM analytics_events
    WHERE event_name='flight_activated' AND created_at>=?${envClause} GROUP BY platform`).all(...args(since)) as
    Array<{ platform: string; count: number }>).map(row => [row.platform, row.count]));
  const referralAccounts = database.prepare(`SELECT COUNT(*) count FROM pilot_referrals r
    JOIN account_profile_links l ON l.pilot_id=r.referred_pilot_id JOIN accounts a ON a.account_id=l.account_id
    WHERE r.attribution_version=1 AND a.created_at>=?`).get(since) as { count: number };
  const referredCreditsSpent = database.prepare(`SELECT COALESCE(SUM(w.amount),0) credits FROM wallet_transactions w
    JOIN pilot_referrals r ON r.referred_pilot_id=w.pilot_id
    WHERE r.attribution_version=1 AND r.status='rewarded' AND w.currency='CREDITS' AND w.direction='DEBIT'
      AND w.created_at>=r.qualified_at AND w.created_at>=?`).get(since) as { credits: number };
  const referralQualification = database.prepare(`SELECT AVG((qualified_at-created_at)/?) days FROM pilot_referrals
    WHERE attribution_version=1 AND qualified_at IS NOT NULL AND qualified_at>=?`).get(dayMs, since) as { days: number | null };
  const activity = database.prepare(`SELECT COUNT(DISTINCT pilot_id) players,
    COUNT(DISTINCT COALESCE(journey_id,session_id)) sessions,
    COUNT(DISTINCT pilot_id || ':' || date(created_at/1000,'unixepoch')) player_days
    FROM analytics_events WHERE event_name IN ('hub_viewed','flight_started') AND created_at>=?${envClause}`)
    .get(...args(since)) as { players: number; sessions: number; player_days: number };
  const firehawkTrialPilots = database.prepare(`SELECT COUNT(DISTINCT pilot_id) pilots FROM analytics_events
    WHERE event_name IN ('firehawk_trial_started','fighter_trial_started') AND created_at>=?${envClause}`)
    .get(...args(since)) as { pilots: number };
  const firehawkConversions = database.prepare(`SELECT COUNT(DISTINCT t.pilot_id) pilots FROM analytics_events t
    WHERE t.event_name IN ('firehawk_trial_started','fighter_trial_started') AND t.created_at>=?${environment ? ' AND t.environment=?' : ''}
      AND EXISTS (SELECT 1 FROM analytics_events p WHERE p.pilot_id=t.pilot_id AND p.created_at>=t.created_at
        AND p.event_name IN ('firehawk_purchase_succeeded','fighter_purchase_completed')${environment ? ' AND p.environment=?' : ''})`)
    .get(...args(since), ...(environment ? [environment] : [])) as { pilots: number };
  const flightsAfterPurchase = database.prepare(`SELECT COUNT(*) flights FROM analytics_events f WHERE f.event_name='flight_started'
    AND f.aircraft_type='fighter' AND f.created_at>=?${envClause} AND EXISTS (
      SELECT 1 FROM analytics_events p WHERE p.pilot_id=f.pilot_id AND p.created_at<=f.created_at
        AND p.event_name IN ('firehawk_purchase_succeeded','fighter_purchase_completed'))`).get(...args(since)) as { flights: number };
  const negativeBalances = (database.prepare('SELECT COUNT(*) count FROM player_profiles WHERE credits<0 OR sky_tokens<0').get() as { count: number }).count;
  const walletMismatches = (database.prepare(`SELECT COUNT(*) count FROM player_profiles p WHERE
    (SELECT w.balance_after FROM wallet_transactions w WHERE w.pilot_id=p.pilot_id AND w.currency='CREDITS'
      ORDER BY w.created_at DESC,w.rowid DESC LIMIT 1) IS NOT NULL
    AND (SELECT w.balance_after FROM wallet_transactions w WHERE w.pilot_id=p.pilot_id AND w.currency='CREDITS'
      ORDER BY w.created_at DESC,w.rowid DESC LIMIT 1)<>p.credits`).get() as { count: number }).count;
  const duplicateReferralPayouts = (database.prepare(`SELECT COUNT(*) count FROM (
    SELECT pilot_id,reason,reference_id FROM wallet_transactions
    WHERE reason IN ('REFERRAL_INVITER','REFERRAL_NEW_PLAYER') GROUP BY pilot_id,reason,reference_id HAVING COUNT(*)>1
  )`).get() as { count: number }).count;
  const firehawkEntitlementWithoutSource = (database.prepare(`SELECT COUNT(*) count FROM player_profiles p
    WHERE EXISTS (SELECT 1 FROM json_each(p.aircraft_entitlements) WHERE value=?)
    AND NOT EXISTS (SELECT 1 FROM aircraft_entitlement_sources s WHERE s.pilot_id=p.pilot_id
      AND s.entitlement=?)`).get(firehawkProduct.entitlement, firehawkProduct.entitlement) as { count: number }).count;
  const rewardedAdGrants = eventCount('rewarded_ad_reward_granted') + eventCount('rewarded_ad_granted');
  const adVerified = eventCount('rewarded_ad_verified');
  return {
    accounts, dau, d1: d1.returned, d1Eligible: d1.eligible, d7: d7.returned, d7Eligible: d7.eligible,
    gameplayD1: gameplayD1.returned, gameplayD7: gameplayD7.returned,
    activations: eventCount('flight_activated'), flights: eventCount('flight_started'), landings: eventCount('flight_landed'),
    missions: eventCount('mission_completed'), activeMinutes: Math.round(flightTotals.active / 60), airborneMinutes: Math.round(flightTotals.airborne / 60),
    daysActive: (database.prepare(`SELECT COUNT(DISTINCT date(created_at/1000,'unixepoch')) count FROM analytics_events
      WHERE event_name IN ('hub_viewed','flight_started') AND created_at>=?${envClause}`).get(...args(since)) as { count: number }).count,
    sessionsPerPlayer: activity.players ? activity.sessions / activity.players : 0,
    flightsPerPlayer: activity.players ? eventCount('flight_started') / activity.players : 0,
    daysActivePerPlayer: activity.players ? activity.player_days / activity.players : 0,
    dailyClaims: eventCount('daily_reward_claimed'), dailyAvailable: eventCount('daily_reward_available'),
    dailyClaimClicks: eventCount('daily_reward_claim_clicked'), dailyRepeatClaimers, dailyByDay,
    rewardedAdGrants, adDismissals: eventCount('rewarded_ad_dismissed'), adNoFill: eventCount('rewarded_ad_no_fill'),
    adFailures: eventCount('rewarded_ad_failed'), referralQualifications: eventCount('referral_qualified'),
    creditsCreated, creditsSpent, netCredits: creditsCreated - creditsSpent, gameplayEarnShare: freeCredits ? gameplayCredits / freeCredits : 0,
    creditSources, creditSinks, averageBalance: balances.average ?? 0, medianBalance: median.median ?? 0,
    mammothAffordablePercent: balances.players ? (balances.mammoth ?? 0) / balances.players * 100 : 0,
    nightowlAffordablePercent: balances.players ? (balances.nightowl ?? 0) / balances.players * 100 : 0,
    averageUnlockDays: unlockDays.days ?? 0, referredCreditsSpent: referredCreditsSpent.credits,
    averageReferralQualificationDays: referralQualification.days ?? 0,
    referredD1: referredD1.returned, referredD1Eligible: referredD1.eligible,
    referredD7: referredD7.returned, referredD7Eligible: referredD7.eligible,
    aircraft: aircraftLabels.map(aircraft => ({ aircraft, views: views.get(aircraft) ?? 0,
      selections: selections.get(aircraft) ?? 0, equips: equips.get(aircraft) ?? 0, flights: aircraftFlights.get(aircraft) ?? 0,
      airborneMinutes: Math.round((aircraftAirborne.get(aircraft) ?? 0) / 60), unlocks: unlocks.get(aircraft) ?? 0 })),
    cities: dimensions('city_id').map(row => ({ city: row.label, flights: row.flights,
      airborneMinutes: Math.round((cityAirborne.get(row.label) ?? 0) / 60), landings: landingsByCity.get(row.label) ?? 0 })),
    platforms: platforms.map(row => ({ ...row, activations: activatedByPlatform.get(row.platform) ?? 0 })),
    referralAccounts: referralAccounts.count, organicOrUnknownAccounts: Math.max(0, accounts - referralAccounts.count),
    adRequests: eventCount('rewarded_ad_requested'), adStarts: eventCount('rewarded_ad_started'), adVerified,
    adLimitReached: eventCount('rewarded_ad_limit_reached'), inviteViews: eventCount('referral_screen_viewed'),
    inviteShares: eventCount('referral_share_started'), referralSignups: eventCount('referral_signup_attributed'),
    firehawkViews: pairCount('firehawk_viewed','fighter_modal_viewed'), firehawkTrials: pairCount('firehawk_trial_started','fighter_trial_started'),
    firehawkTrialPilots: firehawkTrialPilots.pilots,
    firehawkTrialCompletions: pairCount('firehawk_trial_completed','fighter_trial_completed'),
    firehawkPurchaseStarts: pairCount('firehawk_purchase_started','fighter_checkout_created'),
    firehawkPurchases: pairCount('firehawk_purchase_succeeded','fighter_purchase_completed'),
    firehawkRestoreSuccesses: pairCount('firehawk_restore_succeeded','purchase_recovery_succeeded'),
    firehawkTrialPurchaseConversions: firehawkConversions.pilots, flightsAfterFirehawkPurchase: flightsAfterPurchase.flights,
    diagnostics: { negativeBalances, walletMismatches, duplicateReferralPayouts, firehawkEntitlementWithoutSource,
      adGrantsWithoutVerification: eventCount('rewarded_ad_reward_granted') > adVerified },
  };
}
