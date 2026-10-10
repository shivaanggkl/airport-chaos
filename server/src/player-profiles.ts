import { mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { capabilitiesForCity } from '../../shared/city-capabilities.mjs';
import { missionForCity } from '../../shared/city-missions.mjs';
import { ECONOMY_VERSION, REDSPEAR_TRIAL_DURATION_MS, aircraftCreditPrice, aircraftDisplayOrder, aircraftEntitlement, firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { aircraftSkyTokenPrice, skyTokenPack, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { cargoCreditReward, economyRewards } from '../../shared/reward-economy.mjs';
import { isValidPilotNumber, pilotNumberForId } from '../../shared/pilot-number.mjs';
import { pilotLevelForXp, pilotTitleForLevel, pilotXpForLevel, utcDayId, weeklyRewardForRank } from '../../shared/pilot-progression.mjs';
import { DAILY_REWARD_COOLDOWN_MS, dailyRewardCredits, dailyRewardForDay } from '../../shared/daily-rewards.mjs';
import { cosmeticCatalog, defaultCosmeticIds, fallbackLiveryIds, includedCosmeticIds } from '../../shared/cosmetics.mjs';
import { activeSeasonAt, activeWeeklyEventAt, seasonPointsByActivity, seasonRewardStates, type SeasonActivity } from '../../shared/seasons.mjs';
import { routeDefinition } from '../../shared/city-registry.mjs';
import { tutorialSteps, type TutorialLessonStep, type TutorialStepStatus } from '../../shared/tutorial-flight-rules.mjs';
import { PlayerWallet, type WalletBalances, type WalletTransactionReason } from './player-wallet.js';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type CityId = 'milwaukee' | 'dallas';

export type PlayerProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
  skyTokens: number;
  creditRevision: number;
  score: number;
  economyVersion: number;
  aircraftEntitlements: string[];
  testerCodeEnabled: boolean;
  fighterTrial: FighterTrialState;
  selectedAircraft: AircraftType;
  unlockedAircraft: AircraftType[];
  totalDistance: number;
  successfulLandings: number;
  kills: number;
  deaths: number;
  discoveries: Partial<Record<CityId, string[]>>;
  challengeCompletions: number;
  eventCompletions: number;
  objectives: Partial<Record<CityId, ObjectiveCycleState>>;
  mastery: Partial<Record<CityId, CityMastery>>;
  missions: Partial<Record<CityId, MissionCityState>>;
  legacyImportPending: boolean;
  pilotProgress: { xp: number; level: number; title: string; nextLevelXp: number };
  dailyStreak: { current: number; longest: number; cycleDay: number; lastClaimDay?: string; nextReward: number };
  dailyReward: DailyRewardState;
  personalRecords: Record<string, { value: number; cityId?: CityId; achievedAt: number }>;
  weeklyReward?: { weekId: string; rank: number; category: string; credits: number; badge: string; badgeExpiresAt: number };
  referral: {
    code: string; status: 'none' | 'pending' | 'qualified' | 'rewarded';
    joinedCount: number; qualifiedCount: number; rewardedCount: number; earnedCredits: number;
    inviterRewardsInWindow: number; inviterRewardsRemaining: number; nextInviterRewardAt?: number;
  };
  cosmetics: { ownedIds: string[]; equipped: Record<string, string> };
  season?: SeasonProgress;
  intercityRoute?: { routeId:string;fromCityId:CityId;toCityId:CityId;startedAt:number };
  tutorial: { version:'tutorial_v1'; status:'new'|'started'|'completed'|'skipped'; completedAt?:number; dallasUnlocked:boolean };
};
export type DailyRewardState = {
  schedule: readonly number[];
  nextDay: number;
  nextAmount: number;
  claimable: boolean;
  claimedDays: number[];
  claimCount: number;
  lastClaimedAt?: number;
  nextEligibleAt: number;
};
export type SeasonProgress = {
  seasonId: string; name: string; theme: string; startsAt: number; endsAt: number; points: number;
  rewards: Array<{ id: string; points: number; label: string; state: 'locked'|'claimable'|'claimed' }>;
  missions: Array<{ id: string; label: string; progress: number; target: number; completed: boolean }>;
  weeklyEvent?: { weeklyEventId: string; title: string; description: string; progress: number; target: number; completed: boolean; rewarded: boolean; weekEnd: number };
};
export type FighterTrialState = { status: 'available' | 'pending' | 'active' | 'consumed'; startedAt?: number; expiresAt?: number; completedReportedAt?: number };

export type MissionAttempt = {
  missionId: string; attemptId: string; startedAt: number; updatedAt: number;
  progress: number; holdStartedAt?: number; flightStartedAt?: number;
  heading?: number; distanceMeters?: number; completedIds: string[];
  targetId?: string; eventId?: string; sequenceIndex?: number; ownedTerritoryIds?: string[];
};
export type MissionCityState = {
  active?: MissionAttempt;
  completions: Record<string, { count: number; lastCompletedAt: number }>;
};

export type ObjectiveActivity = 'stunt' | 'territoryCapture' | 'event' | 'discovery' | 'kill' | 'heat3' | 'challenge' | 'distance' | 'landing';
export type ObjectiveItem = { id: string; label: string; activity: ObjectiveActivity; target: number; progress: number; reward: number; completed: boolean; rewarded: boolean };
export type ObjectiveCycleState = { dailyId: string; weeklyId: string; daily: ObjectiveItem[]; weekly: ObjectiveItem[]; landingAirportIds?: string[]; dailyBonusAwarded: boolean; weeklyBonusAwarded: boolean };
export type CityMastery = { xp: number; level: number; unlockedRewards: string[] };

export type LegacyProfileImport = {
  credits?: unknown;
  score?: unknown;
  selectedAircraft?: unknown;
  pilotName?: unknown;
  totalDistance?: unknown;
  successfulLandings?: unknown;
  discoveries?: unknown;
};

export type ProfileProgress = {
  selectedAircraft?: unknown;
  totalDistance?: unknown;
  successfulLandings?: unknown;
  discoveries?: unknown;
};

const aircraftOrder = aircraftDisplayOrder;
const aircraftTypes = new Set<AircraftType>(aircraftOrder);
const newPilotCredits = boundedConfiguredInteger(process.env.AIRPORT_CHAOS_STARTING_CREDITS, 0, 10_000);
const migratedDevCredits = boundedConfiguredInteger(process.env.AIRPORT_CHAOS_MIGRATED_DEV_CREDITS, 1_000, 10_000);
const legacyDevCreditThreshold = boundedConfiguredInteger(process.env.AIRPORT_CHAOS_LEGACY_DEV_CREDIT_THRESHOLD, 100_000, 1_000_000);
const rewardReceiptFormatVersion = '2';
const rewardReceiptRetentionMs = 7 * 24 * 60 * 60 * 1_000;
const rewardReceiptFutureToleranceMs = 5 * 60 * 1_000;
const rewardReceiptPerPilotLimit = 2_048;
const rewardReceiptGlobalLimit = 100_000;
const cityIds = new Set<CityId>(['milwaukee', 'dallas']);
const MASTERY_MAX_LEVEL = 25;
export function masteryXpForLevel(level: number): number { const step = Math.max(0, Math.min(MASTERY_MAX_LEVEL, level) - 1); return step * 100 + step * step * 25; }
const masteryRewards: Record<number, string> = { 3: 'City Badge', 5: 'City Livery', 8: 'Garage Cosmetic', 10: 'City Pilot Title', 15: 'Premium Livery Effect', 20: 'Elite Title', 25: 'City Master Badge' };
function emptyMastery(): CityMastery { return { xp: 0, level: 1, unlockedRewards: [] }; }

type ProfileRow = {
  pilot_id: string;
  pilot_name: string;
  credits: number;
  sky_tokens: number;
  credit_revision: number;
  score: number;
  selected_aircraft: string;
  total_distance: number;
  successful_landings: number;
  kills: number;
  deaths: number;
  discoveries: string;
  challenge_completions: number;
  event_completions: number;
  legacy_imported: number;
  owned_aircraft: string;
  objectives: string;
  mastery: string;
  economy_version: number;
  aircraft_entitlements: string;
  missions: string;
  fighter_trial: string;
};

function parseFighterTrial(value: unknown): FighterTrialState {
  let source: Partial<FighterTrialState> = {};
  try { source = typeof value === 'string' ? JSON.parse(value) : (value as Partial<FighterTrialState>); } catch { /* legacy/default */ }
  if (source.status === 'pending') return { status: 'pending' };
  if (source.status === 'active' && Number.isFinite(source.startedAt) && Number.isFinite(source.expiresAt)) {
    return { status: 'active', startedAt: Number(source.startedAt), expiresAt: Number(source.expiresAt), completedReportedAt: Number.isFinite(source.completedReportedAt) ? Number(source.completedReportedAt) : undefined };
  }
  if (source.status === 'consumed') return { status: 'consumed', startedAt: source.startedAt, expiresAt: source.expiresAt };
  return { status: 'available' };
}

function parseMissionStates(value: unknown): Partial<Record<CityId, MissionCityState>> {
  let raw: Record<string, unknown> = {};
  try { raw = typeof value === 'string' ? JSON.parse(value) : (value as Record<string, unknown>); } catch { /* invalid legacy state */ }
  const result: Partial<Record<CityId, MissionCityState>> = {};
  for (const cityId of cityIds) {
    const source = raw?.[cityId] as Partial<MissionCityState> | undefined;
    const completions: MissionCityState['completions'] = {};
    for (const [id, item] of Object.entries(source?.completions ?? {}).slice(0, 128)) {
      if (!missionForCity(cityId, id)) continue;
      completions[id] = { count: boundedInteger(item?.count, 1_000_000), lastCompletedAt: boundedInteger(item?.lastCompletedAt, Number.MAX_SAFE_INTEGER) };
    }
    const attempt = source?.active;
    const activeMission = attempt ? missionForCity(cityId, attempt.missionId) : undefined;
    const active = attempt && activeMission && !activeMission.retired && typeof attempt.attemptId === 'string' && /^[a-f0-9-]{36}$/i.test(attempt.attemptId)
      ? { ...attempt, completedIds: [...new Set(Array.isArray(attempt.completedIds) ? attempt.completedIds.filter((id): id is string => typeof id === 'string').slice(0, 32) : [])] }
      : undefined;
    result[cityId] = { active, completions };
  }
  return result;
}

function boundedConfiguredInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(maximum, Math.floor(parsed)) : fallback;
}

function boundedInteger(value: unknown, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(maximum, Math.floor(value)) : 0;
}

function boundedNumber(value: unknown, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(maximum, value) : 0;
}

function rewardReceiptIssuedAt(rewardId: string): number | undefined {
  const match = /^reward-([a-z0-9]{8,12})-[a-z0-9-]{8,64}$/i.exec(rewardId);
  if (!match) return undefined;
  const issuedAt = Number.parseInt(match[1], 36);
  return Number.isSafeInteger(issuedAt) ? issuedAt : undefined;
}

function parseMastery(value: unknown): Partial<Record<CityId, CityMastery>> {
  let raw: unknown = value;
  try { if (typeof value === 'string') raw = JSON.parse(value); } catch { raw = {}; }
  const result: Partial<Record<CityId, CityMastery>> = {};
  for (const cityId of cityIds) {
    const entry = (raw as Record<string, unknown>)?.[cityId] as Partial<CityMastery> | undefined;
    const xp = boundedInteger(entry?.xp, 10_000_000);
    let level = 1; while (level < MASTERY_MAX_LEVEL && xp >= masteryXpForLevel(level + 1)) level += 1;
    result[cityId] = { xp, level, unlockedRewards: Array.isArray(entry?.unlockedRewards) ? entry.unlockedRewards.filter((reward): reward is string => typeof reward === 'string').slice(0, 32) : [] };
  }
  return result;
}

function profileName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 20) : fallback;
}

export function normalizePilotName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 20) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9 ._'-]*[A-Za-z0-9]$/.test(name) ? name : undefined;
}

function assignedPilotName(value: unknown, pilotId: string): string {
  const name = normalizePilotName(value) ?? 'Pilot';
  const automatic = /^Pilot-(\d{3})$/i.exec(name);
  if (automatic) return isValidPilotNumber(Number(automatic[1])) ? name : `Pilot-${pilotNumberForId(pilotId)}`;
  return name.toLowerCase() === 'pilot' ? `Pilot-${pilotNumberForId(pilotId)}` : name;
}

function parseEntitlements(value: unknown): string[] {
  let raw: unknown = value;
  try { if (typeof value === 'string') raw = JSON.parse(value); } catch { raw = []; }
  return Array.isArray(raw)
    ? [...new Set(raw
      .filter((item): item is string => typeof item === 'string' && /^[a-z0-9:_-]{3,80}$/i.test(item))
      .map((item) => item === 'aircraft:fighter' ? aircraftEntitlement('fighter')! : item))].slice(0, 64)
    : [];
}

function parseOwnedAircraft(value: unknown, entitlements: readonly string[] = []): AircraftType[] {
  let stored: unknown;
  try { stored = typeof value === 'string' ? JSON.parse(value) : value; } catch { stored = []; }
  const owned = new Set<AircraftType>(['trainer']);
  if (Array.isArray(stored)) {
    for (const type of stored) {
      if (typeof type !== 'string' || !aircraftTypes.has(type as AircraftType)) continue;
      // Premium aircraft ownership is entitlement-derived. Keeping it in the
      // legacy credit-owned list would allow a refunded purchase to remain
      // unlocked after its final entitlement source is removed.
      if (aircraftEntitlement(type as AircraftType)) continue;
      owned.add(type as AircraftType);
    }
  }
  for (const type of aircraftOrder) {
    const entitlement = aircraftEntitlement(type);
    if (entitlement && entitlements.includes(entitlement)) owned.add(type);
  }
  return aircraftOrder.filter((type) => owned.has(type));
}

function storedAircraftIncludes(value: unknown, aircraft: AircraftType): boolean {
  try {
    const stored = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(stored) && stored.includes(aircraft);
  } catch { return false; }
}

function selectedOwnedAircraft(value: unknown, owned: readonly AircraftType[]): AircraftType {
  return typeof value === 'string' && owned.includes(value as AircraftType) ? value as AircraftType : 'trainer';
}

function usableAircraftForRow(row: ProfileRow): AircraftType[] {
  const usable = new Set(parseOwnedAircraft(row.owned_aircraft, parseEntitlements(row.aircraft_entitlements)));
  const fighterTrial = parseFighterTrial(row.fighter_trial);
  // Pending/active trials are temporary access, not ownership. An expired
  // active trial deliberately remains usable until a controlled boundary
  // consumes it, so routine profile writes cannot force an in-flight swap.
  if (fighterTrial.status === 'pending' || fighterTrial.status === 'active') usable.add('fighter');
  return aircraftOrder.filter((type) => usable.has(type));
}

function parseDiscoveries(value: unknown): Partial<Record<CityId, string[]>> {
  const result: Partial<Record<CityId, string[]>> = {};
  if (!value || typeof value !== 'object') return result;
  for (const cityId of cityIds) {
    const ids = (value as Partial<Record<CityId, unknown>>)[cityId];
    if (!Array.isArray(ids)) continue;
    result[cityId] = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 96))].slice(0, 512);
  }
  return result;
}

function rowDiscoveries(row: ProfileRow): Partial<Record<CityId, string[]>> {
  try { return parseDiscoveries(JSON.parse(row.discoveries)); } catch { return {}; }
}

const objectiveDefinitions: Record<ObjectiveActivity, { label: string; dailyTarget: number; weeklyTarget: number; dailyReward: number; weeklyReward: number }> = {
  stunt: { label: 'Complete stunt actions', dailyTarget: 2, weeklyTarget: 8, dailyReward: 55, weeklyReward: 180 },
  territoryCapture: { label: 'Capture territories', dailyTarget: 1, weeklyTarget: 5, dailyReward: 90, weeklyReward: 260 },
  event: { label: 'Complete Chaos Events', dailyTarget: 1, weeklyTarget: 3, dailyReward: 70, weeklyReward: 210 },
  discovery: { label: 'Discover new locations', dailyTarget: 1, weeklyTarget: 5, dailyReward: 65, weeklyReward: 190 },
  kill: { label: 'Destroy real players', dailyTarget: 1, weeklyTarget: 3, dailyReward: 80, weeklyReward: 230 },
  heat3: { label: 'Reach Heat 3', dailyTarget: 1, weeklyTarget: 3, dailyReward: 60, weeklyReward: 175 },
  challenge: { label: 'Complete Sky Challenges', dailyTarget: 1, weeklyTarget: 5, dailyReward: 70, weeklyReward: 220 },
  distance: { label: 'Fly meaningful distance', dailyTarget: 12_000, weeklyTarget: 75_000, dailyReward: 60, weeklyReward: 240 },
  landing: { label: 'Land at different airports', dailyTarget: 2, weeklyTarget: 4, dailyReward: 75, weeklyReward: 250 },
};

function dayId(now = new Date()): string { return now.toISOString().slice(0, 10); }
export function weekId(now = new Date()): string { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
export type WeeklyLeaderboardCategory = 'stunt' | 'kills' | 'wantedSurvival' | 'events' | 'territories' | 'precisionLanding' | 'mastery';
function objectiveItem(activity: ObjectiveActivity, weekly: boolean, cityId?: CityId): ObjectiveItem {
  const definition = objectiveDefinitions[activity];
  const target = activity === 'landing' && weekly && cityId ? capabilitiesForCity(cityId).airportCount : weekly ? definition.weeklyTarget : definition.dailyTarget;
  return { id: `${weekly ? 'weekly' : 'daily'}-${activity}`, label: definition.label, activity, target, progress: 0, reward: weekly ? definition.weeklyReward : definition.dailyReward, completed: false, rewarded: false };
}
function freshObjectives(cityId: CityId, discoveredCount = 0, now = new Date()): ObjectiveCycleState {
  const capabilities = capabilitiesForCity(cityId);
  const supported = new Set(capabilities.objectiveSupportedTypes as ObjectiveActivity[]);
  if (discoveredCount >= capabilities.discoveryTotal) supported.delete('discovery');
  if (capabilities.airportCount >= 2) supported.add('landing');
  // Keep daily plans achievable in a quiet solo city; PvP remains weekly.
  const dailyPool = ['stunt', 'territoryCapture', 'event', 'discovery', 'heat3', 'distance', 'landing'].filter((activity): activity is ObjectiveActivity => supported.has(activity as ObjectiveActivity));
  const weeklyPool = ['territoryCapture', 'stunt', 'event', 'discovery', 'kill', 'heat3', 'distance', 'landing'].filter((activity): activity is ObjectiveActivity => supported.has(activity as ObjectiveActivity));
  const salt = (value: string) => value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rotate = <T>(items: T[], key: string, count: number) => items.slice(salt(key) % items.length).concat(items.slice(0, salt(key) % items.length)).slice(0, count);
  return { dailyId: dayId(now), weeklyId: weekId(now), daily: rotate(dailyPool, dayId(now), 3).map((activity) => objectiveItem(activity, false, cityId)), weekly: rotate(weeklyPool, weekId(now), 4).map((activity) => objectiveItem(activity, true, cityId)), landingAirportIds: [], dailyBonusAwarded: false, weeklyBonusAwarded: false };
}
function parseObjectives(value: unknown, cityId: CityId, discoveredCount = 0): ObjectiveCycleState {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const state = (parsed?.[cityId] ?? parsed) as ObjectiveCycleState | undefined;
    if (state && state.dailyId === dayId() && state.weeklyId === weekId() && Array.isArray(state.daily) && Array.isArray(state.weekly)) {
      const capabilities = capabilitiesForCity(cityId);
      if (discoveredCount < capabilities.discoveryTotal) return state;
      const supported = capabilities.objectiveSupportedTypes.filter((activity) => activity !== 'discovery') as ObjectiveActivity[];
      const replace = (items: ObjectiveItem[], weekly: boolean) => items.map((item, index) => {
        if (item.activity !== 'discovery') return item;
        const used = new Set(items.filter((candidate) => candidate !== item).map((candidate) => candidate.activity));
        const replacement = supported.find((activity) => !used.has(activity)) ?? 'distance';
        return objectiveItem(replacement, weekly);
      });
      state.daily = replace(state.daily, false);
      state.weekly = replace(state.weekly, true);
      return state;
    }
  } catch { /* regenerate */ }
  return freshObjectives(cityId, discoveredCount);
}

export class PlayerProfileStore {
  private readonly database: DatabaseSync;
  private readonly databasePath: string;
  private readonly wallet: PlayerWallet;
  private lastReceiptPruneAt = 0;
  private lastReceiptPruneCount = 0;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.databasePath = filePath;
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        pilot_id TEXT PRIMARY KEY,
        pilot_name TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 0 CHECK(credits >= 0),
        sky_tokens INTEGER NOT NULL DEFAULT 0 CHECK(sky_tokens >= 0),
        credit_revision INTEGER NOT NULL DEFAULT 0,
        score INTEGER NOT NULL DEFAULT 0,
        selected_aircraft TEXT NOT NULL DEFAULT 'trainer',
        total_distance REAL NOT NULL DEFAULT 0,
        successful_landings INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        discoveries TEXT NOT NULL DEFAULT '{}',
        challenge_completions INTEGER NOT NULL DEFAULT 0,
        event_completions INTEGER NOT NULL DEFAULT 0,
        legacy_imported INTEGER NOT NULL DEFAULT 0,
        owned_aircraft TEXT NOT NULL DEFAULT '["trainer"]',
        objectives TEXT NOT NULL DEFAULT '{}',
        mastery TEXT NOT NULL DEFAULT '{}',
        economy_version INTEGER NOT NULL DEFAULT 0,
        aircraft_entitlements TEXT NOT NULL DEFAULT '[]'
        ,missions TEXT NOT NULL DEFAULT '{}',
        fighter_trial TEXT NOT NULL DEFAULT '{"status":"available"}'
      );
      CREATE TABLE IF NOT EXISTS profile_reward_receipts (
        pilot_id TEXT NOT NULL,
        reward_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, reward_id)
      );
      CREATE TABLE IF NOT EXISTS firehawk_mission_failures (
        pilot_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        failed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS firehawk_mission_failures_lookup ON firehawk_mission_failures (pilot_id, mission_id, failed_at);
      CREATE TABLE IF NOT EXISTS firehawk_promo_impressions (
        pilot_id TEXT NOT NULL,
        shown_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS firehawk_promo_impressions_lookup ON firehawk_promo_impressions (pilot_id, shown_at);
      CREATE TABLE IF NOT EXISTS profile_store_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS aircraft_entitlement_sources (
        pilot_id TEXT NOT NULL,
        entitlement TEXT NOT NULL,
        source TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, entitlement, source)
      );
      CREATE TABLE IF NOT EXISTS weekly_leaderboard (
        city_id TEXT NOT NULL, week_id TEXT NOT NULL, category TEXT NOT NULL, pilot_id TEXT NOT NULL,
        pilot_name TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, achieved_at INTEGER NOT NULL,
        PRIMARY KEY (city_id, week_id, category, pilot_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_progression (
        pilot_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, seeded INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0, longest_streak INTEGER NOT NULL DEFAULT 0,
        cycle_day INTEGER NOT NULL DEFAULT 0, last_claim_day TEXT
      );
      CREATE TABLE IF NOT EXISTS pilot_daily_rewards (
        pilot_id TEXT PRIMARY KEY,
        next_day INTEGER NOT NULL DEFAULT 1 CHECK(next_day BETWEEN 1 AND 7),
        claim_count INTEGER NOT NULL DEFAULT 0 CHECK(claim_count >= 0),
        last_claimed_at INTEGER,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS pilot_daily_reward_claims (
        pilot_id TEXT NOT NULL,
        claim_number INTEGER NOT NULL CHECK(claim_number > 0),
        reward_day INTEGER NOT NULL CHECK(reward_day BETWEEN 1 AND 7),
        credits INTEGER NOT NULL CHECK(credits > 0),
        claimed_at INTEGER NOT NULL,
        wallet_transaction_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY (pilot_id, claim_number),
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        FOREIGN KEY(wallet_transaction_id) REFERENCES wallet_transactions(transaction_id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS pilot_records (
        pilot_id TEXT NOT NULL, record_type TEXT NOT NULL, value REAL NOT NULL,
        city_id TEXT, achieved_at INTEGER NOT NULL, PRIMARY KEY (pilot_id, record_type)
      );
      CREATE TABLE IF NOT EXISTS weekly_reward_claims (
        pilot_id TEXT NOT NULL, week_id TEXT NOT NULL, rank INTEGER NOT NULL, category TEXT NOT NULL,
        credits INTEGER NOT NULL, badge TEXT NOT NULL, badge_expires_at INTEGER NOT NULL, awarded_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, week_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_referrals (
        referred_pilot_id TEXT PRIMARY KEY, referrer_pilot_id TEXT NOT NULL, status TEXT NOT NULL,
        referred_network_id TEXT, referrer_network_id TEXT, gameplay_ms INTEGER NOT NULL DEFAULT 0,
        qualified_action INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, qualified_at INTEGER, rewarded_at INTEGER,
        inviter_rewarded_at INTEGER, inviter_wallet_transaction_id TEXT, referred_wallet_transaction_id TEXT,
        attribution_version INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(referred_pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        FOREIGN KEY(referrer_pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS pilot_referral_codes (
        pilot_id TEXT PRIMARY KEY, referral_code TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS pvp_reward_wins (
        challenge_id TEXT PRIMARY KEY, winner_pilot_id TEXT NOT NULL, opponent_pilot_id TEXT NOT NULL,
        rewarded INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pilot_network_security (
        pilot_id TEXT PRIMARY KEY, network_id TEXT NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pilot_cosmetics (
        pilot_id TEXT NOT NULL, cosmetic_id TEXT NOT NULL, acquired_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, cosmetic_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_equipped_cosmetics (
        pilot_id TEXT NOT NULL, category TEXT NOT NULL, cosmetic_id TEXT NOT NULL,
        PRIMARY KEY (pilot_id, category)
      );
      CREATE TABLE IF NOT EXISTS pilot_chaos_events (
        pilot_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, event_type TEXT NOT NULL, city_id TEXT NOT NULL,
        state TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        completed_at INTEGER, reward_claimed_at INTEGER, target_json TEXT NOT NULL DEFAULT '{}', result_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS pilot_seasons (
        pilot_id TEXT NOT NULL, season_id TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
        mission_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, season_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_season_contributions (
        pilot_id TEXT NOT NULL, season_id TEXT NOT NULL, contribution_id TEXT NOT NULL,
        points INTEGER NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, season_id, contribution_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_season_claims (
        pilot_id TEXT NOT NULL, season_id TEXT NOT NULL, reward_id TEXT NOT NULL, claimed_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, season_id, reward_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_weekly_events (
        pilot_id TEXT NOT NULL, weekly_event_id TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER, rewarded_at INTEGER,
        PRIMARY KEY (pilot_id, weekly_event_id)
      );
      CREATE TABLE IF NOT EXISTS pilot_intercity_routes (
        pilot_id TEXT PRIMARY KEY, route_id TEXT NOT NULL, from_city_id TEXT NOT NULL, to_city_id TEXT NOT NULL,
        started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pilot_intercity_completions (
        pilot_id TEXT NOT NULL, route_id TEXT NOT NULL, attempt_started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL, credits INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (pilot_id, route_id, attempt_started_at)
      );
      CREATE TABLE IF NOT EXISTS pilot_tutorial_state (
        pilot_id TEXT PRIMARY KEY, version TEXT NOT NULL, status TEXT NOT NULL,
        updated_at INTEGER NOT NULL, completed_at INTEGER, required INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pilot_tutorial_steps (
        pilot_id TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, step)
      );
    `);
    // Existing SQLite MVP profiles predate durable ownership. SQLite has no
    // portable ADD COLUMN IF NOT EXISTS, so tolerate the one expected error.
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN owned_aircraft TEXT NOT NULL DEFAULT '["trainer"]'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN objectives TEXT NOT NULL DEFAULT '{}'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN mastery TEXT NOT NULL DEFAULT '{}'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN economy_version INTEGER NOT NULL DEFAULT 0`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN aircraft_entitlements TEXT NOT NULL DEFAULT '[]'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN missions TEXT NOT NULL DEFAULT '{}'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN fighter_trial TEXT NOT NULL DEFAULT '{"status":"available"}'`); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE player_profiles ADD COLUMN score INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE player_profiles ADD COLUMN credit_revision INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE pilot_referrals ADD COLUMN inviter_rewarded_at INTEGER'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE pilot_referrals ADD COLUMN inviter_wallet_transaction_id TEXT'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE pilot_referrals ADD COLUMN referred_wallet_transaction_id TEXT'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE pilot_referrals ADD COLUMN attribution_version INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
    // Historical rewarded referrals already paid both pilots; preserve those
    // payouts when enforcing the new rolling inviter limit.
    this.database.exec("UPDATE pilot_referrals SET inviter_rewarded_at=rewarded_at WHERE status='rewarded' AND inviter_rewarded_at IS NULL AND referred_wallet_transaction_id IS NULL");
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS pilot_referrals_referrer_created ON pilot_referrals(referrer_pilot_id, created_at);
      CREATE INDEX IF NOT EXISTS pilot_referrals_referrer_rewarded ON pilot_referrals(referrer_pilot_id, inviter_rewarded_at);
    `);
    this.wallet = new PlayerWallet(this.database);
    try { this.database.exec('ALTER TABLE player_profiles ADD COLUMN sky_token_deficit INTEGER NOT NULL DEFAULT 0 CHECK(sky_token_deficit >= 0)'); } catch { /* already migrated */ }
    this.database.exec(`CREATE TABLE IF NOT EXISTS sky_token_purchases (
      provider TEXT NOT NULL CHECK(provider IN ('stripe','apple','google')),
      provider_transaction_id TEXT NOT NULL,
      pilot_id TEXT NOT NULL REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
      account_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      payment_intent_id TEXT,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      amount_cents INTEGER,
      currency TEXT,
      environment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','partially_refunded','refunded')),
      refunded_quantity INTEGER NOT NULL DEFAULT 0 CHECK(refunded_quantity >= 0),
      wallet_transaction_id TEXT REFERENCES wallet_transactions(transaction_id),
      purchased_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(provider,provider_transaction_id)
    );
    CREATE INDEX IF NOT EXISTS sky_token_purchases_pilot ON sky_token_purchases(pilot_id,purchased_at DESC);
    CREATE TABLE IF NOT EXISTS sky_token_revocations (
      provider TEXT NOT NULL CHECK(provider IN ('apple','google')),
      provider_transaction_id TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      PRIMARY KEY(provider,provider_transaction_id)
    );
    CREATE TABLE IF NOT EXISTS sky_token_purchase_contexts (
      context_id TEXT PRIMARY KEY,
      store_account_id TEXT NOT NULL UNIQUE,
      pilot_id TEXT NOT NULL REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
      account_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('apple','google')),
      pack_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );`);
    const tokenPurchaseColumns = this.database.prepare('PRAGMA table_info(sky_token_purchases)').all() as Array<{ name: string }>;
    if (!tokenPurchaseColumns.some(column => column.name === 'payment_intent_id'))
      this.database.exec('ALTER TABLE sky_token_purchases ADD COLUMN payment_intent_id TEXT');
    this.database.exec('CREATE INDEX IF NOT EXISTS sky_token_purchases_payment_intent ON sky_token_purchases(payment_intent_id)');
    // The legacy base paints were free for every existing pilot. Grant those
    // records once before new accounts start under the priced catalog.
    if (this.metadata('priced_legacy_paints_v1') !== 'complete') this.wallet.transaction(() => {
      const grant = this.database.prepare(`INSERT OR IGNORE INTO pilot_cosmetics (pilot_id, cosmetic_id, acquired_at)
        SELECT pilot_id, ?, ? FROM player_profiles`);
      const now = Date.now();
      grant.run('mammoth-sand', now);
      grant.run('nightowl-forest', now);
      this.setMetadata('priced_legacy_paints_v1', 'complete');
    });
    for (const legacyRow of this.database.prepare('SELECT * FROM player_profiles WHERE economy_version < ?').all(ECONOMY_VERSION) as ProfileRow[]) {
      const storedEconomyVersion = boundedInteger(legacyRow.economy_version, 1_000);
      const entitlements = new Set(parseEntitlements(legacyRow.aircraft_entitlements));
      if (storedAircraftIncludes(legacyRow.owned_aircraft, 'fighter')) entitlements.add(aircraftEntitlement('fighter')!);
      const migratedCredits = storedEconomyVersion < 1 && legacyRow.credits >= legacyDevCreditThreshold
        ? migratedDevCredits
        : Math.max(0, legacyRow.credits);
      this.wallet.transaction((wallet) => {
        this.database.prepare('UPDATE player_profiles SET economy_version = ?, aircraft_entitlements = ? WHERE pilot_id = ?')
          .run(ECONOMY_VERSION, JSON.stringify([...entitlements]), legacyRow.pilot_id);
        const difference = migratedCredits - legacyRow.credits;
        if (difference > 0) wallet.credit({ pilotId: legacyRow.pilot_id, currency: 'CREDITS', amount: difference, reason: 'MIGRATION', referenceId: `economy-v${storedEconomyVersion}` });
        if (difference < 0) wallet.debit({ pilotId: legacyRow.pilot_id, currency: 'CREDITS', amount: -difference, reason: 'MIGRATION', referenceId: `economy-v${storedEconomyVersion}` });
      });
    }
    // A single durable revision covers every existing credit award and spend
    // path without trusting any client-supplied reward amount.
    this.database.exec(`CREATE TRIGGER IF NOT EXISTS player_profiles_credit_revision
      AFTER UPDATE OF credits ON player_profiles WHEN NEW.credits != OLD.credits
      BEGIN UPDATE player_profiles SET credit_revision = OLD.credit_revision + 1 WHERE pilot_id = NEW.pilot_id; END`);
    try { this.database.exec('ALTER TABLE pilot_tutorial_state ADD COLUMN evidence INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
    try { this.database.exec('ALTER TABLE pilot_tutorial_state ADD COLUMN required INTEGER NOT NULL DEFAULT 0'); } catch { /* already migrated */ }
    this.pruneRewardReceipts();
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS profile_reward_receipts_pilot_created ON profile_reward_receipts (pilot_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS profile_reward_receipts_created ON profile_reward_receipts (created_at DESC);
    `);
    this.compactRewardReceiptsOnce(process.env.AIRPORT_CHAOS_PROFILE_DB_COMPACT_ONCE);
  }

  setTutorialState(pilotId:string,status:'started'|'completed'|'skipped',now=Date.now()):PlayerProfile|undefined{
    const row=this.getRow(pilotId);if(!row)return undefined;
    if(status==='completed'&&!this.dallasUnlocked(pilotId)&&!this.trainingCompletionVerified(pilotId))return undefined;
    if(status==='started'&&this.toProfile(row).tutorial.status==='completed')this.resetTutorialRun(pilotId);
    const next=status;
    this.database.prepare(`INSERT INTO pilot_tutorial_state(pilot_id,version,status,updated_at,completed_at) VALUES (?,?,?,?,?)
      ON CONFLICT(pilot_id) DO UPDATE SET version=excluded.version,status=excluded.status,updated_at=excluded.updated_at,completed_at=COALESCE(pilot_tutorial_state.completed_at,excluded.completed_at)`)
      .run(pilotId,'tutorial_v1',next,now,next==='completed'?now:null);
    return this.toProfile(this.getRow(pilotId)!);
  }

  // Only called from validated server takeoff, lock, hit and landing paths.
  recordTrainingEvidence(pilotId:string,bit:1|2|4|8):void{
    this.database.prepare('UPDATE pilot_tutorial_state SET evidence=evidence|? WHERE pilot_id=? AND status=?').run(bit,pilotId,'started');
  }
  trainingEvidence(pilotId:string):number{
    return (this.database.prepare('SELECT evidence FROM pilot_tutorial_state WHERE pilot_id=?').get(pilotId) as {evidence:number}|undefined)?.evidence??0;
  }
  resetTrainingEvidence(pilotId:string):void{
    this.database.prepare('UPDATE pilot_tutorial_state SET evidence=0 WHERE pilot_id=?').run(pilotId);
  }

  tutorialStepStates(pilotId:string):Record<TutorialLessonStep,TutorialStepStatus>{
    const states=Object.fromEntries(tutorialSteps.map(step=>[step,'pending'])) as Record<TutorialLessonStep,TutorialStepStatus>;
    const rows=this.database.prepare('SELECT step,status FROM pilot_tutorial_steps WHERE pilot_id=?').all(pilotId) as Array<{step:string;status:string}>;
    for(const row of rows)if(tutorialSteps.includes(row.step as TutorialLessonStep)&&(row.status==='completed'||row.status==='skipped'))states[row.step as TutorialLessonStep]=row.status;
    return states;
  }

  nextPendingTutorialStep(pilotId:string):TutorialLessonStep|undefined{
    const states=this.tutorialStepStates(pilotId);
    return tutorialSteps.find(step=>states[step]==='pending');
  }

  tutorialStepsResolved(pilotId:string):boolean{return this.nextPendingTutorialStep(pilotId)===undefined;}

  dallasUnlocked(pilotId:string):boolean{
    const state=this.database.prepare('SELECT completed_at FROM pilot_tutorial_state WHERE pilot_id=?').get(pilotId) as {completed_at:number|null}|undefined;
    // Completion is the unlock receipt, including for profiles created before this gate shipped.
    return Number.isFinite(state?.completed_at);
  }

  trainingCompletionVerified(pilotId:string):boolean{
    return this.tutorialStepsResolved(pilotId) && this.tutorialStepStates(pilotId).landing==='completed' && (this.trainingEvidence(pilotId)&8)!==0;
  }

  recordTutorialStepStatus(pilotId:string,step:TutorialLessonStep,status:Exclude<TutorialStepStatus,'pending'>,now=Date.now(),enforceOrder=true):{ok:boolean;changed:boolean;reason?:string;nextStep?:TutorialLessonStep;steps:Record<TutorialLessonStep,TutorialStepStatus>}{
    const states=this.tutorialStepStates(pilotId);
    if(!tutorialSteps.includes(step)||(status!=='completed'&&status!=='skipped'))return{ok:false,changed:false,reason:'INVALID TUTORIAL STEP',nextStep:this.nextPendingTutorialStep(pilotId),steps:states};
    const existing=states[step];
    if(existing!=='pending')return existing===status?{ok:true,changed:false,nextStep:this.nextPendingTutorialStep(pilotId),steps:states}:{ok:false,changed:false,reason:'TUTORIAL STEP ALREADY RESOLVED',nextStep:this.nextPendingTutorialStep(pilotId),steps:states};
    const expected=tutorialSteps.find(candidate=>states[candidate]==='pending');
    if(enforceOrder&&expected!==step)return{ok:false,changed:false,reason:'TUTORIAL STEP OUT OF ORDER',nextStep:expected,steps:states};
    this.database.prepare('INSERT INTO pilot_tutorial_steps(pilot_id,step,status,updated_at) VALUES (?,?,?,?)').run(pilotId,step,status,now);
    const updated=this.tutorialStepStates(pilotId);
    return{ok:true,changed:true,nextStep:tutorialSteps.find(candidate=>updated[candidate]==='pending'),steps:updated};
  }

  resetTutorialRun(pilotId:string):void{
    this.database.exec('BEGIN IMMEDIATE');
    try{this.database.prepare('DELETE FROM pilot_tutorial_steps WHERE pilot_id=?').run(pilotId);this.database.prepare('UPDATE pilot_tutorial_state SET evidence=0 WHERE pilot_id=?').run(pilotId);this.database.exec('COMMIT');}
    catch(error){this.database.exec('ROLLBACK');throw error;}
  }

  activeIntercityRoute(pilotId:string):PlayerProfile['intercityRoute']|undefined{
    const row=this.database.prepare('SELECT route_id,from_city_id,to_city_id,started_at FROM pilot_intercity_routes WHERE pilot_id=?').get(pilotId) as {route_id:string;from_city_id:CityId;to_city_id:CityId;started_at:number}|undefined;
    const route=row&&routeDefinition(row.route_id);return route&&route.fromCityId===row.from_city_id&&route.toCityId===row.to_city_id?{routeId:row.route_id,fromCityId:row.from_city_id,toCityId:row.to_city_id,startedAt:row.started_at}:undefined;
  }

  startIntercityRoute(pilotId:string,routeId:string,currentCityId:CityId,now=Date.now()):{ok:boolean;reason?:string;profile?:PlayerProfile}{
    const row=this.getRow(pilotId);const route=routeDefinition(routeId);if(!row||!route||route.fromCityId!==currentCityId)return{ok:false,reason:'ROUTE UNAVAILABLE',profile:row?this.toProfile(row):undefined};
    if([...cityIds].some(cityId=>parseMissionStates(row.missions)[cityId]?.active))return{ok:false,reason:'FINISH OR LEAVE YOUR ACTIVE MISSION',profile:this.toProfile(row)};
    const active=this.activeIntercityRoute(pilotId);if(active)return active.routeId===routeId?{ok:true,profile:this.toProfile(row)}:{ok:false,reason:'FINISH CURRENT INTERCITY FLIGHT',profile:this.toProfile(row)};
    const recent=this.database.prepare('SELECT completed_at FROM pilot_intercity_completions WHERE pilot_id=? AND route_id=? ORDER BY completed_at DESC LIMIT 1').get(pilotId,routeId) as {completed_at:number}|undefined;
    if(recent&&now-recent.completed_at<30*60_000)return{ok:false,reason:'ROUTE REWARD COOLDOWN',profile:this.toProfile(row)};
    this.database.prepare('INSERT INTO pilot_intercity_routes (pilot_id,route_id,from_city_id,to_city_id,started_at,updated_at) VALUES (?,?,?,?,?,?)').run(pilotId,route.routeId,route.fromCityId,route.toCityId,now,now);
    return{ok:true,profile:this.toProfile(row)};
  }

  completeIntercityArrival(pilotId:string,currentCityId:CityId,now=Date.now()):{completed:boolean;credits:number;routeId?:string;profile?:PlayerProfile}{
    const row=this.getRow(pilotId);const active=this.activeIntercityRoute(pilotId);if(!row||!active||active.toCityId!==currentCityId)return{completed:false,credits:0,profile:row?this.toProfile(row):undefined};
    const route=routeDefinition(active.routeId)!;const credits=Math.max(0,Math.min(10_000,route.rewardProfile?.credits??0));
    return this.wallet.transaction((wallet)=>{const receipt=this.database.prepare('INSERT OR IGNORE INTO pilot_intercity_completions (pilot_id,route_id,attempt_started_at,completed_at,credits) VALUES (?,?,?,?,?)').run(pilotId,active.routeId,active.startedAt,now,credits);if(receipt.changes&&credits>0)wallet.credit({pilotId,currency:'CREDITS',amount:credits,reason:'INTERCITY_REWARD',idempotencyKey:`intercity:${active.routeId}:${active.startedAt}`,referenceId:active.routeId,createdAt:now});this.database.prepare('DELETE FROM pilot_intercity_routes WHERE pilot_id=? AND route_id=? AND started_at=?').run(pilotId,active.routeId,active.startedAt);return{completed:receipt.changes>0,credits:receipt.changes?credits:0,routeId:active.routeId,profile:this.toProfile(this.getRow(pilotId)!)};});
  }

  seasonProgress(pilotId: string, cityId: CityId, now = Date.now()): SeasonProgress | undefined {
    const season = activeSeasonAt(now, cityId);
    if (!season) return undefined;
    const row = this.database.prepare('SELECT points,mission_json FROM pilot_seasons WHERE pilot_id=? AND season_id=?').get(pilotId, season.seasonId) as { points:number; mission_json:string } | undefined;
    const points = boundedInteger(row?.points, 100_000_000);
    let missionProgress: Record<string, number> = {}; try { missionProgress = JSON.parse(row?.mission_json ?? '{}'); } catch { /* safe empty migration */ }
    const claims = (this.database.prepare('SELECT reward_id FROM pilot_season_claims WHERE pilot_id=? AND season_id=?').all(pilotId, season.seasonId) as Array<{ reward_id:string }>).map(item=>item.reward_id);
    const weekly = activeWeeklyEventAt(season, now);
    const weeklyRow = weekly ? this.database.prepare('SELECT progress,completed_at,rewarded_at FROM pilot_weekly_events WHERE pilot_id=? AND weekly_event_id=?').get(pilotId, weekly.weeklyEventId) as { progress:number; completed_at?:number; rewarded_at?:number } | undefined : undefined;
    return { seasonId:season.seasonId,name:season.name,theme:season.theme,startsAt:season.startsAt,endsAt:season.endsAt,points,
      rewards:seasonRewardStates(season,points,claims).map(({id,points,label,state})=>({id,points,label,state})),
      missions:season.missions.map(mission=>({id:mission.id,label:mission.label,progress:Math.min(mission.target,boundedInteger(missionProgress[mission.id],mission.target)),target:mission.target,completed:boundedInteger(missionProgress[mission.id],mission.target)>=mission.target})),
      weeklyEvent:weekly?{weeklyEventId:weekly.weeklyEventId,title:weekly.title,description:weekly.description,progress:Math.min(weekly.target,boundedInteger(weeklyRow?.progress,weekly.target)),target:weekly.target,completed:Boolean(weeklyRow?.completed_at),rewarded:Boolean(weeklyRow?.rewarded_at),weekEnd:weekly.weekEnd}:undefined };
  }

  recordSeasonActivity(pilotId:string, cityId:CityId, activity:SeasonActivity, contributionId:string, amount=1, now=Date.now()): { awarded:boolean; points:number; profile?:PlayerProfile } {
    const season=activeSeasonAt(now,cityId); const row=this.getRow(pilotId);
    const compact=contributionId.replace(/[^a-zA-Z0-9:_-]/g,'').slice(0,160);
    if(!season||!row||!compact||amount<=0) return {awarded:false,points:0,profile:row?this.toProfile(row):undefined};
    const base=seasonPointsByActivity[activity]??0; if(!base) return {awarded:false,points:0,profile:this.toProfile(row)};
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const receipt=this.database.prepare('INSERT OR IGNORE INTO pilot_season_contributions (pilot_id,season_id,contribution_id,points,created_at) VALUES (?,?,?,?,?)').run(pilotId,season.seasonId,compact,base,now);
      if(!receipt.changes){this.database.exec('COMMIT');return {awarded:false,points:0,profile:this.toProfile(row)};}
      const current=this.database.prepare('SELECT mission_json FROM pilot_seasons WHERE pilot_id=? AND season_id=?').get(pilotId,season.seasonId) as {mission_json:string}|undefined;
      let missions:Record<string,number>={};try{missions=JSON.parse(current?.mission_json??'{}');}catch{/* empty */}
      let bonus=0;
      for(const mission of season.missions.filter(item=>item.activity===activity)){const before=boundedInteger(missions[mission.id],mission.target);const after=Math.min(mission.target,before+Math.floor(amount));missions[mission.id]=after;if(before<mission.target&&after>=mission.target)bonus+=mission.points;}
      this.database.prepare(`INSERT INTO pilot_seasons (pilot_id,season_id,points,mission_json,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(pilot_id,season_id) DO UPDATE SET points=MIN(100000000,pilot_seasons.points+excluded.points),mission_json=excluded.mission_json,updated_at=excluded.updated_at`).run(pilotId,season.seasonId,base+bonus,JSON.stringify(missions),now);
      const weekly=activeWeeklyEventAt(season,now);
      if(weekly?.activity===activity){const existing=this.database.prepare('SELECT progress FROM pilot_weekly_events WHERE pilot_id=? AND weekly_event_id=?').get(pilotId,weekly.weeklyEventId) as {progress:number}|undefined;const progress=Math.min(weekly.target,boundedInteger(existing?.progress,weekly.target)+Math.floor(amount));this.database.prepare(`INSERT INTO pilot_weekly_events (pilot_id,weekly_event_id,progress,completed_at) VALUES (?,?,?,?) ON CONFLICT(pilot_id,weekly_event_id) DO UPDATE SET progress=excluded.progress,completed_at=COALESCE(pilot_weekly_events.completed_at,excluded.completed_at)`).run(pilotId,weekly.weeklyEventId,progress,progress>=weekly.target?now:null);}
      this.database.exec('COMMIT');return {awarded:true,points:base+bonus,profile:this.toProfile(this.getRow(pilotId)!)};
    }catch(error){this.database.exec('ROLLBACK');throw error;}
  }

  claimSeasonReward(pilotId:string,cityId:CityId,rewardId:string,now=Date.now()):{ok:boolean;reason?:string;profile?:PlayerProfile}{
    const season=activeSeasonAt(now,cityId);const row=this.getRow(pilotId);if(!season||!row)return{ok:false,reason:'NO ACTIVE SEASON'};
    const reward=season.rewards.find(item=>item.id===rewardId);const progress=this.seasonProgress(pilotId,cityId,now);if(!reward||!progress)return{ok:false,reason:'REWARD UNAVAILABLE',profile:this.toProfile(row)};
    if(progress.rewards.find(item=>item.id===rewardId)?.state==='locked')return{ok:false,reason:'EARN MORE SEASON POINTS',profile:this.toProfile(row)};
    return this.wallet.transaction((wallet)=>{const claim=this.database.prepare('INSERT OR IGNORE INTO pilot_season_claims (pilot_id,season_id,reward_id,claimed_at) VALUES (?,?,?,?)').run(pilotId,season.seasonId,rewardId,now);if(claim.changes){if(reward.type==='credits'){const amount=boundedInteger(reward.amount,100000);if(amount>0)wallet.credit({pilotId,currency:'CREDITS',amount,reason:'SEASON_REWARD',idempotencyKey:`season:${season.seasonId}:${rewardId}`,referenceId:rewardId,createdAt:now});}else if(reward.type==='cosmetic'&&reward.value&&cosmeticCatalog.some(item=>item.id===reward.value))this.database.prepare('INSERT OR IGNORE INTO pilot_cosmetics (pilot_id,cosmetic_id,acquired_at) VALUES (?,?,?)').run(pilotId,reward.value,now);}return{ok:true,profile:this.toProfile(this.getRow(pilotId)!)};});
  }

  claimWeeklyEventReward(pilotId:string,cityId:CityId,weeklyEventId:string,now=Date.now()):{ok:boolean;reason?:string;profile?:PlayerProfile}{
    const season=activeSeasonAt(now,cityId);const weekly=activeWeeklyEventAt(season,now);const row=this.getRow(pilotId);
    if(!weekly||!row||weekly.weeklyEventId!==weeklyEventId)return{ok:false,reason:'WEEKLY EVENT UNAVAILABLE',profile:row?this.toProfile(row):undefined};
    return this.wallet.transaction((wallet)=>{const state=this.database.prepare('SELECT progress,rewarded_at FROM pilot_weekly_events WHERE pilot_id=? AND weekly_event_id=?').get(pilotId,weeklyEventId) as {progress:number;rewarded_at?:number}|undefined;if(!state||state.progress<weekly.target)return{ok:false,reason:'WEEKLY OBJECTIVE INCOMPLETE',profile:this.toProfile(row)};if(!state.rewarded_at){this.database.prepare('UPDATE pilot_weekly_events SET rewarded_at=? WHERE pilot_id=? AND weekly_event_id=?').run(now,pilotId,weeklyEventId);if(weekly.credits>0)wallet.credit({pilotId,currency:'CREDITS',amount:weekly.credits,reason:'WEEKLY_REWARD',idempotencyKey:`weekly-event:${weeklyEventId}`,referenceId:weeklyEventId,createdAt:now});this.database.prepare('UPDATE pilot_seasons SET points=MIN(100000000,points+?),updated_at=? WHERE pilot_id=? AND season_id=?').run(weekly.points,now,pilotId,season!.seasonId);}return{ok:true,profile:this.toProfile(this.getRow(pilotId)!)};});
  }

  pruneRewardReceipts(now = Date.now()): { deleted: number; at: number } {
    let deleted = 0;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const format = this.metadata('reward_receipt_format_version');
      if (format !== rewardReceiptFormatVersion) {
        // Receipt format v2 prefixes every currently valid receipt with its
        // server-validated reward class. Legacy UUID/reward-* rows cannot be
        // replayed by a protocol-compatible client and are safe to discard.
        deleted += Number(this.database.prepare("DELETE FROM profile_reward_receipts WHERE reward_id NOT LIKE 'contract:%'").run().changes);
        this.setMetadata('reward_receipt_format_version', rewardReceiptFormatVersion);
      }
      deleted += Number(this.database.prepare('DELETE FROM profile_reward_receipts WHERE created_at < ?').run(now - rewardReceiptRetentionMs).changes);
      deleted += Number(this.database.prepare(`DELETE FROM profile_reward_receipts WHERE rowid IN (
        SELECT rowid FROM (
          SELECT rowid, ROW_NUMBER() OVER (PARTITION BY pilot_id ORDER BY created_at DESC, rowid DESC) AS receipt_rank
          FROM profile_reward_receipts
        ) WHERE receipt_rank > ?
      )`).run(rewardReceiptPerPilotLimit).changes);
      deleted += Number(this.database.prepare(`DELETE FROM profile_reward_receipts WHERE rowid IN (
        SELECT rowid FROM profile_reward_receipts ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?
      )`).run(rewardReceiptGlobalLimit).changes);
      this.lastReceiptPruneAt = now;
      this.lastReceiptPruneCount = deleted;
      this.setMetadata('reward_receipt_last_prune_at', String(now));
      this.setMetadata('reward_receipt_last_prune_count', String(deleted));
      this.database.exec('COMMIT');
      return { deleted, at: now };
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* transaction already closed */ }
      throw error;
    }
  }

  rewardReceiptDiagnostics(): { rows: number; databaseBytes: number; lastPruneAt: number; lastPruneCount: number } {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM profile_reward_receipts').get() as { count: number };
    let databaseBytes = 0;
    try { databaseBytes = statSync(this.databasePath).size; } catch { /* database may not be materialized yet */ }
    return {
      rows: Number(row.count) || 0,
      databaseBytes,
      lastPruneAt: this.lastReceiptPruneAt || Number(this.metadata('reward_receipt_last_prune_at')) || 0,
      lastPruneCount: this.lastReceiptPruneCount || Number(this.metadata('reward_receipt_last_prune_count')) || 0,
    };
  }

  private metadata(key: string): string | undefined {
    return (this.database.prepare('SELECT value FROM profile_store_metadata WHERE key = ?').get(key) as { value?: string } | undefined)?.value;
  }

  private setMetadata(key: string, value: string): void {
    this.database.prepare(`INSERT INTO profile_store_metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  private compactRewardReceiptsOnce(token: string | undefined): void {
    const normalized = token?.trim();
    if (!normalized || normalized.length > 64 || this.metadata('reward_receipt_compaction_token') === normalized) return;
    this.database.exec('VACUUM');
    this.setMetadata('reward_receipt_compaction_token', normalized);
  }

  private normalizeActiveCosmetics(pilotId: string, ownedAircraft: readonly AircraftType[]): void {
    const insertOwned = this.database.prepare('INSERT OR IGNORE INTO pilot_cosmetics VALUES(?,?,?)');
    const now = Date.now();
    for (const id of defaultCosmeticIds) insertOwned.run(pilotId, id, now);
    if (ownedAircraft.includes('fighter')) insertOwned.run(pilotId, includedCosmeticIds.fighter, now);
    else this.database.prepare('DELETE FROM pilot_cosmetics WHERE pilot_id=? AND cosmetic_id=?').run(pilotId, includedCosmeticIds.fighter);

    const activeIds = new Set(cosmeticCatalog.map(item => item.id));
    const ownedIds = new Set((this.database.prepare('SELECT cosmetic_id FROM pilot_cosmetics WHERE pilot_id=?').all(pilotId) as Array<{ cosmetic_id: string }>)
      .map(item => item.cosmetic_id).filter(id => activeIds.has(id)));
    const slots = aircraftOrder.map(type => `livery:${type}`);
    this.database.prepare(`DELETE FROM pilot_equipped_cosmetics WHERE pilot_id=? AND category NOT IN (${slots.map(() => '?').join(',')})`).run(pilotId, ...slots);
    const readEquipped = this.database.prepare('SELECT cosmetic_id FROM pilot_equipped_cosmetics WHERE pilot_id=? AND category=?');
    const equip = this.database.prepare(`INSERT INTO pilot_equipped_cosmetics VALUES(?,?,?)
      ON CONFLICT(pilot_id,category) DO UPDATE SET cosmetic_id=excluded.cosmetic_id`);
    const remove = this.database.prepare('DELETE FROM pilot_equipped_cosmetics WHERE pilot_id=? AND category=?');
    for (const type of aircraftOrder) {
      const slot = `livery:${type}`;
      const current = (readEquipped.get(pilotId, slot) as { cosmetic_id?: string } | undefined)?.cosmetic_id;
      const currentItem = cosmeticCatalog.find(item => item.id === current);
      const aircraftAvailable = type === 'trainer' || ownedAircraft.includes(type);
      if (aircraftAvailable && currentItem?.aircraftRestriction === type && ownedIds.has(currentItem.id)) continue;
      const fallback = fallbackLiveryIds[type];
      if (aircraftAvailable && fallback && ownedIds.has(fallback)) equip.run(pilotId, slot, fallback);
      else remove.run(pilotId, slot);
    }
  }

  getOrCreate(pilotId: string, pilotName: string): PlayerProfile {
    let row = this.getRow(pilotId);
    if (!row) {
      this.wallet.transaction((wallet) => {
        this.database.prepare('INSERT INTO player_profiles (pilot_id, pilot_name, credits, sky_tokens, economy_version) VALUES (?, ?, 0, 0, ?)')
          .run(pilotId, assignedPilotName(pilotName, pilotId), ECONOMY_VERSION);
        this.database.prepare("INSERT INTO pilot_tutorial_state (pilot_id, version, status, updated_at, required) VALUES (?, 'tutorial_v1', 'new', ?, 1)")
          .run(pilotId, Date.now());
        if (newPilotCredits > 0) wallet.credit({
          pilotId, currency: 'CREDITS', amount: newPilotCredits, reason: 'MIGRATION',
          referenceId: 'new-player-starting-balance',
        });
      });
      row = this.getRow(pilotId)!;
    } else {
      const automaticName = /^Pilot(?:-\d{3})?$/i.test(row.pilot_name.trim());
      const assigned = automaticName ? assignedPilotName(row.pilot_name, pilotId) : row.pilot_name;
      if (automaticName && assigned !== row.pilot_name) {
        this.database.prepare('UPDATE player_profiles SET pilot_name = ? WHERE pilot_id = ?').run(assigned, pilotId);
        row = this.getRow(pilotId)!;
      }
    }
    this.ensurePilotProgression(row);
    return this.toProfile(row);
  }

  walletBalances(pilotId: string): WalletBalances | undefined {
    return this.wallet.balances(pilotId);
  }

  createSkyTokenPurchaseContext(pilotId: string, accountId: string, provider: 'apple' | 'google', packId: SkyTokenPackId):
    { contextId: string; storeAccountId: string; productId: string } | undefined {
    const pack = skyTokenPack(packId);
    if (!pack || !accountId || !this.getRow(pilotId)) return undefined;
    const contextId = randomUUID();
    const storeAccountId = createHash('sha256').update(`airport-chaos:tokens:${contextId}`).digest('base64url');
    const now = Date.now();
    this.database.prepare(`INSERT INTO sky_token_purchase_contexts
      (context_id,store_account_id,pilot_id,account_id,provider,pack_id,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(contextId, storeAccountId, pilotId, accountId, provider, packId, now, now + 30 * 60_000);
    return { contextId, storeAccountId, productId: provider === 'apple' ? pack.appleProductId : pack.googleProductId };
  }

  recordVerifiedSkyTokenPurchase(input: {
    pilotId: string; accountId: string; provider: 'stripe' | 'apple' | 'google'; transactionId: string;
    packId: SkyTokenPackId; productId: string; paymentIntentId?: string; amountCents?: number; currency?: string;
    environment: string; purchasedAt?: number; contextId?: string; accountBinding?: string; initialRefundedQuantity?: number;
  }): { applied: boolean; profile: PlayerProfile; reference: string } {
    const pack = skyTokenPack(input.packId);
    if (!pack || !/^[A-Za-z0-9._:-]{8,512}$/.test(input.transactionId) || !input.accountId ||
        (input.provider === 'apple' && input.productId !== pack.appleProductId) ||
        (input.provider === 'google' && input.productId !== pack.googleProductId) ||
        !Number.isSafeInteger(input.initialRefundedQuantity ?? 0) || (input.initialRefundedQuantity ?? 0) < 0 ||
        (input.initialRefundedQuantity ?? 0) > pack.tokens ||
        (input.provider !== 'stripe' && input.initialRefundedQuantity)) throw new Error('INVALID_TOKEN_PURCHASE');
    return this.wallet.transaction((wallet) => {
      const existing = this.database.prepare('SELECT pilot_id,account_id,pack_id,status FROM sky_token_purchases WHERE provider=? AND provider_transaction_id=?')
        .get(input.provider, input.transactionId) as { pilot_id: string; account_id: string; pack_id: string; status: string } | undefined;
      if (existing) {
        if (existing.pilot_id !== input.pilotId || existing.account_id !== input.accountId || existing.pack_id !== input.packId) throw new Error('TOKEN_PURCHASE_ACCOUNT_MISMATCH');
        if (existing.status === 'refunded' && input.provider !== 'stripe') throw new Error('TOKEN_PURCHASE_REFUNDED');
        return { applied: false, profile: this.toProfile(this.getRow(input.pilotId)!), reference: input.transactionId.slice(-12) };
      }
      const row = this.getRow(input.pilotId);
      if (!row) throw new Error('PROFILE_NOT_FOUND');
      if (input.provider !== 'stripe') {
        if (this.database.prepare('SELECT 1 FROM sky_token_revocations WHERE provider=? AND provider_transaction_id=?')
          .get(input.provider, input.transactionId)) throw new Error('TOKEN_PURCHASE_REVOKED');
        const context = this.database.prepare(`SELECT context_id,store_account_id,pilot_id,account_id,provider,pack_id,created_at,expires_at,consumed_at
          FROM sky_token_purchase_contexts WHERE ${input.provider === 'apple' ? 'context_id' : 'store_account_id'}=?`)
          .get(input.accountBinding ?? '') as
          { context_id: string; store_account_id: string; pilot_id: string; account_id: string; provider: string; pack_id: string; created_at: number; expires_at: number; consumed_at: number | null } | undefined;
        if (!context || context.consumed_at !== null || (input.contextId && context.context_id !== input.contextId) ||
            (input.purchasedAt !== undefined && input.purchasedAt < context.created_at - 60_000) ||
            context.pilot_id !== input.pilotId ||
            context.account_id !== input.accountId || context.provider !== input.provider || context.pack_id !== input.packId ||
            input.accountBinding !== (input.provider === 'apple' ? context.context_id : context.store_account_id)) throw new Error('TOKEN_PURCHASE_CONTEXT_INVALID');
        input.contextId = context.context_id;
      }
      const deficit = (this.database.prepare('SELECT sky_token_deficit FROM player_profiles WHERE pilot_id=?').get(input.pilotId) as { sky_token_deficit: number }).sky_token_deficit;
      const refunded = input.initialRefundedQuantity ?? 0;
      const netTokens = pack.tokens - refunded;
      const settled = Math.min(deficit, netTokens);
      const granted = netTokens - settled;
      let transactionId: string | null = null;
      if (granted > 0) {
        const before = wallet.balances(input.pilotId)?.skyTokens;
        const purchaseKey = createHash('sha256').update(`${input.provider}:${input.transactionId}`).digest('hex');
        const credit = wallet.credit({ pilotId: input.pilotId, currency: 'SKY_TOKENS', amount: granted, reason: 'SKY_TOKEN_PURCHASE',
          idempotencyKey: `token:${purchaseKey}`, referenceId: input.transactionId.slice(0, 160),
          context: { packId: input.packId, provider: input.provider, deficitSettled: settled } });
        if (!credit.ok || !credit.applied || !credit.transactionId || before === undefined || credit.balance !== before + granted)
          throw new Error('TOKEN_WALLET_GRANT_FAILED');
        transactionId = credit.transactionId;
      }
      if (settled) this.database.prepare('UPDATE player_profiles SET sky_token_deficit=sky_token_deficit-? WHERE pilot_id=?').run(settled, input.pilotId);
      this.database.prepare(`INSERT INTO sky_token_purchases
        (provider,provider_transaction_id,pilot_id,account_id,pack_id,payment_intent_id,product_id,quantity,amount_cents,currency,environment,wallet_transaction_id,purchased_at,updated_at,refunded_quantity,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.provider, input.transactionId, input.pilotId, input.accountId, input.packId, input.paymentIntentId ?? null,
          input.productId, pack.tokens, input.amountCents ?? null, input.currency ?? null, input.environment,
          transactionId, input.purchasedAt ?? Date.now(), Date.now(), refunded,
          refunded === pack.tokens ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'paid');
      if (input.provider !== 'stripe') this.database.prepare('UPDATE sky_token_purchase_contexts SET consumed_at=? WHERE context_id=? AND consumed_at IS NULL')
        .run(Date.now(), input.contextId!);
      return { applied: true, profile: this.toProfile(this.getRow(input.pilotId)!), reference: input.transactionId.slice(-12) };
    });
  }

  refundVerifiedSkyTokenPurchase(provider: 'stripe' | 'apple' | 'google', transactionId: string, refundedQuantity: number): { applied: boolean; profile?: PlayerProfile } {
    return this.wallet.transaction((wallet) => {
      const purchase = this.database.prepare('SELECT pilot_id,quantity,refunded_quantity FROM sky_token_purchases WHERE provider=? AND provider_transaction_id=?')
        .get(provider, transactionId) as { pilot_id: string; quantity: number; refunded_quantity: number } | undefined;
      if (!purchase) {
        if (provider !== 'stripe' && /^[A-Za-z0-9._:-]{8,512}$/.test(transactionId))
          this.database.prepare('INSERT OR IGNORE INTO sky_token_revocations(provider,provider_transaction_id,recorded_at) VALUES (?,?,?)')
            .run(provider, transactionId, Date.now());
        return { applied: false };
      }
      if (!Number.isSafeInteger(refundedQuantity) || refundedQuantity < 0 || refundedQuantity > purchase.quantity) return { applied: false };
      if (refundedQuantity <= purchase.refunded_quantity) return { applied: false, profile: this.toProfile(this.getRow(purchase.pilot_id)!) };
      const delta = refundedQuantity - purchase.refunded_quantity;
      const balance = wallet.balances(purchase.pilot_id)?.skyTokens ?? 0;
      const removed = Math.min(balance, delta);
      if (removed > 0) {
        const refundKey = createHash('sha256').update(`${provider}:${transactionId}:${refundedQuantity}`).digest('hex');
        const debit = wallet.debit({ pilotId: purchase.pilot_id, currency: 'SKY_TOKENS', amount: removed, reason: 'SKY_TOKEN_REFUND',
          idempotencyKey: `refund:${refundKey}`, referenceId: transactionId.slice(0, 160) });
        if (!debit.ok || !debit.applied) throw new Error('TOKEN_REFUND_WALLET_FAILED');
      }
      if (delta > removed) this.database.prepare('UPDATE player_profiles SET sky_token_deficit=sky_token_deficit+? WHERE pilot_id=?').run(delta - removed, purchase.pilot_id);
      this.database.prepare(`UPDATE sky_token_purchases SET refunded_quantity=?,status=?,updated_at=? WHERE provider=? AND provider_transaction_id=?`)
        .run(refundedQuantity, refundedQuantity === purchase.quantity ? 'refunded' : 'partially_refunded', Date.now(), provider, transactionId);
      return { applied: true, profile: this.toProfile(this.getRow(purchase.pilot_id)!) };
    });
  }

  skyTokenPurchaseForPaymentIntent(paymentIntentId: string): { transactionId: string; quantity: number; amountCents?: number } | undefined {
    const row = this.database.prepare(`SELECT provider_transaction_id,quantity,amount_cents FROM sky_token_purchases
      WHERE provider='stripe' AND payment_intent_id=? LIMIT 1`).get(paymentIntentId) as
      { provider_transaction_id: string; quantity: number; amount_cents: number | null } | undefined;
    return row ? { transactionId: row.provider_transaction_id, quantity: row.quantity, amountCents: row.amount_cents ?? undefined } : undefined;
  }

  skyTokenPurchaseQuantity(provider: 'apple' | 'google', transactionId: string): number | undefined {
    const row = this.database.prepare('SELECT quantity FROM sky_token_purchases WHERE provider=? AND provider_transaction_id=?')
      .get(provider, transactionId) as { quantity: number } | undefined;
    return row?.quantity;
  }

  skyTokenPurchaseStatus(pilotId: string, transactionId: string): 'paid' | 'partially_refunded' | 'refunded' | 'pending' {
    const row = this.database.prepare(`SELECT status FROM sky_token_purchases WHERE pilot_id=? AND provider='stripe' AND provider_transaction_id=?`)
      .get(pilotId, transactionId) as { status: 'paid' | 'partially_refunded' | 'refunded' } | undefined;
    return row?.status ?? 'pending';
  }

  purchaseAircraftWithSkyTokens(pilotId: string, requestedAircraft: unknown): { ok: boolean; reason?: string; profile?: PlayerProfile } {
    if (typeof requestedAircraft !== 'string') return { ok: false, reason: 'UNKNOWN AIRCRAFT' };
    const price = aircraftSkyTokenPrice(requestedAircraft);
    if (!price) return { ok: false, reason: 'NOT AVAILABLE FOR SKY TOKENS' };
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId);
      if (!row) return { ok: false, reason: 'PROFILE NOT FOUND' };
      const entitlements = parseEntitlements(row.aircraft_entitlements);
      const owned = parseOwnedAircraft(row.owned_aircraft, entitlements);
      if (owned.includes(requestedAircraft as AircraftType)) return { ok: true, profile: this.toProfile(row) };
      const deficit = (this.database.prepare('SELECT sky_token_deficit FROM player_profiles WHERE pilot_id=?').get(pilotId) as { sky_token_deficit: number }).sky_token_deficit;
      if (deficit > 0) return { ok: false, reason: 'REFUNDED SKY TOKENS MUST BE REPLACED FIRST', profile: this.toProfile(row) };
      const debit = wallet.debit({ pilotId, currency: 'SKY_TOKENS', amount: price, reason: 'SKY_TOKEN_SPEND',
        referenceId: `aircraft:${requestedAircraft}`, context: { aircraft: requestedAircraft } });
      if (!debit.ok || !debit.applied) return { ok: false, reason: `NEED ${Math.max(0, price - row.sky_tokens).toLocaleString()} MORE SKY TOKENS`, profile: this.toProfile(row) };
      if (requestedAircraft === 'fighter') {
        const entitlement = aircraftEntitlement('fighter')!;
        this.database.prepare('INSERT OR IGNORE INTO aircraft_entitlement_sources(pilot_id,entitlement,source,granted_at) VALUES (?,?,?,?)')
          .run(pilotId, entitlement, 'sky_tokens', Date.now());
        this.database.prepare('UPDATE player_profiles SET aircraft_entitlements=? WHERE pilot_id=?')
          .run(JSON.stringify([...new Set([...entitlements, entitlement])]), pilotId);
      } else {
        owned.push(requestedAircraft as AircraftType);
        this.database.prepare('UPDATE player_profiles SET owned_aircraft=? WHERE pilot_id=?')
          .run(JSON.stringify(aircraftOrder.filter(type => owned.includes(type))), pilotId);
      }
      return { ok: true, profile: this.toProfile(this.getRow(pilotId)!) };
    });
  }

  createFreshGuest(pilotId: string): PlayerProfile {
    this.getOrCreate(pilotId, 'Pilot');
    this.database.prepare('UPDATE player_profiles SET legacy_imported = 1 WHERE pilot_id = ?').run(pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  purchaseCosmetic(pilotId: string, cosmeticId: string, currency: unknown = 'CREDITS', now = Date.now()): { ok: boolean; purchased?: boolean; reason?: string; profile?: PlayerProfile } {
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId); const item = cosmeticCatalog.find(entry => entry.id === cosmeticId);
      if (!row || !item) return { ok: false, reason: 'COSMETIC UNAVAILABLE' };
      if (currency !== 'CREDITS' && currency !== 'SKY_TOKENS') return { ok: false, reason: 'CURRENCY UNAVAILABLE' };
      if (item.aircraftRestriction !== 'trainer' && !parseOwnedAircraft(row.owned_aircraft, parseEntitlements(row.aircraft_entitlements)).includes(item.aircraftRestriction as AircraftType)) return { ok: false, reason: 'OWN AIRCRAFT FIRST' };
      if (this.database.prepare('SELECT 1 FROM pilot_cosmetics WHERE pilot_id=? AND cosmetic_id=?').get(pilotId, cosmeticId)) return { ok: true, purchased: false, profile: this.toProfile(row) };
      if (item.unlockType !== 'credits' && item.unlockType !== 'free') return { ok: false, reason: 'COSMETIC NOT PURCHASABLE' };
      if (currency === 'SKY_TOKENS' && (!item.skyTokenPrice || item.unlockType !== 'credits')) return { ok: false, reason: 'COSMETIC NOT AVAILABLE FOR SKY TOKENS' };
      if (item.unlockType === 'credits') {
        if (currency === 'SKY_TOKENS') {
          const deficit = (this.database.prepare('SELECT sky_token_deficit FROM player_profiles WHERE pilot_id=?').get(pilotId) as { sky_token_deficit: number }).sky_token_deficit;
          if (deficit > 0) return { ok: false, reason: 'REFUNDED SKY TOKENS MUST BE REPLACED FIRST' };
        }
        const price = currency === 'CREDITS' ? item.creditPrice : item.skyTokenPrice;
        const debit = wallet.debit({
          pilotId, currency, amount: price, reason: currency === 'CREDITS' ? 'COSMETIC_PURCHASE' : 'SKY_TOKEN_SPEND',
          idempotencyKey: `cosmetic:${cosmeticId}`, referenceId: `cosmetic:${cosmeticId}`,
          context: { cosmeticId, aircraft: item.aircraftRestriction }, createdAt: now,
        });
        if (!debit.ok || !debit.applied) return { ok: false, reason: `NEED ${Math.max(0, price - (currency === 'CREDITS' ? row.credits : row.sky_tokens)).toLocaleString()} MORE ${currency === 'CREDITS' ? 'CREDITS' : 'SKY TOKENS'}` };
      }
      this.database.prepare('INSERT INTO pilot_cosmetics VALUES(?,?,?)').run(pilotId, cosmeticId, now);
      return { ok: true, purchased: true, profile: this.toProfile(this.getRow(pilotId)!) };
    });
  }

  equipCosmetic(pilotId: string, cosmeticId: string): { ok: boolean; reason?: string; profile?: PlayerProfile } {
    const row = this.getRow(pilotId); const item = cosmeticCatalog.find(entry => entry.id === cosmeticId);
    if (!row || !item || !this.database.prepare('SELECT 1 FROM pilot_cosmetics WHERE pilot_id=? AND cosmetic_id=?').get(pilotId, cosmeticId)) return { ok: false, reason: 'COSMETIC NOT OWNED' };
    if (item.aircraftRestriction !== 'trainer' && !parseOwnedAircraft(row.owned_aircraft, parseEntitlements(row.aircraft_entitlements)).includes(item.aircraftRestriction as AircraftType)) return { ok: false, reason: 'OWN AIRCRAFT FIRST' };
    const slot = `livery:${item.aircraftRestriction}`;
    this.database.prepare(`INSERT INTO pilot_equipped_cosmetics VALUES(?,?,?) ON CONFLICT(pilot_id,category) DO UPDATE SET cosmetic_id=excluded.cosmetic_id`).run(pilotId, slot, cosmeticId);
    return { ok: true, profile: this.toProfile(row) };
  }

  dailyRewardState(pilotId: string, now = Date.now()): DailyRewardState | undefined {
    const profile = this.getRow(pilotId); if (!profile) return undefined;
    this.ensurePilotProgression(profile);
    const legacy = this.database.prepare('SELECT cycle_day,last_claim_day FROM pilot_progression WHERE pilot_id=?').get(pilotId) as { cycle_day?: number; last_claim_day?: string } | undefined;
    const legacyDay = boundedInteger(legacy?.cycle_day, 7);
    const legacyClaimedAt = legacy?.last_claim_day ? Date.parse(`${legacy.last_claim_day}T00:00:00.000Z`) : Number.NaN;
    this.database.prepare(`INSERT OR IGNORE INTO pilot_daily_rewards(pilot_id,next_day,claim_count,last_claimed_at,updated_at)
      VALUES(?,?,?,?,?)`).run(
        pilotId,
        legacyDay > 0 ? legacyDay % dailyRewardCredits.length + 1 : 1,
        legacyDay,
        Number.isFinite(legacyClaimedAt) ? legacyClaimedAt : null,
        now,
      );
    const row = this.database.prepare('SELECT next_day,claim_count,last_claimed_at FROM pilot_daily_rewards WHERE pilot_id=?').get(pilotId) as
      { next_day: number; claim_count: number; last_claimed_at?: number };
    const nextDay = Math.max(1, Math.min(dailyRewardCredits.length, Math.floor(row.next_day)));
    const lastClaimedAt = Number.isSafeInteger(row.last_claimed_at) ? row.last_claimed_at : undefined;
    const nextEligibleAt = lastClaimedAt === undefined ? 0 : lastClaimedAt + DAILY_REWARD_COOLDOWN_MS;
    return {
      schedule: [...dailyRewardCredits],
      nextDay,
      nextAmount: dailyRewardForDay(nextDay)!,
      claimable: lastClaimedAt === undefined || now >= nextEligibleAt,
      claimedDays: nextDay === 1 ? [] : Array.from({ length: nextDay - 1 }, (_, index) => index + 1),
      claimCount: boundedInteger(row.claim_count, Number.MAX_SAFE_INTEGER),
      lastClaimedAt,
      nextEligibleAt,
    };
  }

  claimDailyReward(pilotId: string, now = Date.now()): { profile: PlayerProfile; credits: number; day: number; claimed: boolean; state: DailyRewardState } | undefined {
    if (!Number.isSafeInteger(now) || now < 0 || !this.getRow(pilotId)) return undefined;
    return this.wallet.transaction((wallet) => {
      const before = this.dailyRewardState(pilotId, now)!;
      if (!before.claimable) return { profile: this.toProfile(this.getRow(pilotId)!), credits: 0, day: before.nextDay, claimed: false, state: before };
      const day = before.nextDay;
      const credits = dailyRewardForDay(day)!;
      const claimNumber = before.claimCount + 1;
      const walletResult = wallet.credit({
        pilotId,
        currency: 'CREDITS',
        amount: credits,
        reason: 'DAILY_REWARD',
        idempotencyKey: `daily-reward:${claimNumber}`,
        referenceId: `daily-reward:${claimNumber}`,
        context: { rewardDay: day },
        createdAt: now,
      });
      if (!walletResult.ok || !walletResult.applied || !walletResult.transactionId) throw new Error('Daily reward wallet credit failed');
      const nextDay = day % dailyRewardCredits.length + 1;
      const advanced = this.database.prepare(`UPDATE pilot_daily_rewards SET next_day=?,claim_count=?,last_claimed_at=?,updated_at=?
        WHERE pilot_id=? AND claim_count=?`).run(nextDay, claimNumber, now, now, pilotId, before.claimCount);
      if (advanced.changes !== 1) throw new Error('Daily reward claim was not serialized');
      this.database.prepare(`INSERT INTO pilot_daily_reward_claims
        (pilot_id,claim_number,reward_day,credits,claimed_at,wallet_transaction_id) VALUES(?,?,?,?,?,?)`)
        .run(pilotId, claimNumber, day, credits, now, walletResult.transactionId);
      const state = this.dailyRewardState(pilotId, now)!;
      return { profile: this.toProfile(this.getRow(pilotId)!), credits, day, claimed: true, state };
    });
  }

  awardPilotXp(pilotId: string, amount: number): { profile: PlayerProfile; levelUp?: number; title?: string } | undefined {
    const row = this.getRow(pilotId); if (!row || !Number.isFinite(amount) || amount <= 0) return undefined;
    this.ensurePilotProgression(row);
    const before = this.pilotProgression(pilotId);
    this.database.prepare('UPDATE pilot_progression SET xp=MIN(100000000,xp+?) WHERE pilot_id=?').run(Math.floor(amount), pilotId);
    const after = this.pilotProgression(pilotId);
    return { profile: this.toProfile(this.getRow(pilotId)!), levelUp: after.level > before.level ? after.level : undefined, title: after.level > before.level ? after.title : undefined };
  }

  awardScore(pilotId: string, amount: number): PlayerProfile | undefined {
    if (!Number.isFinite(amount) || amount <= 0 || !this.getRow(pilotId)) return undefined;
    this.database.prepare('UPDATE player_profiles SET score=MIN(100000000,score+?) WHERE pilot_id=?').run(Math.floor(amount), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  updatePersonalRecord(pilotId: string, type: string, value: number, cityId?: CityId, now = Date.now()): boolean {
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(type) || !Number.isFinite(value) || value < 0) return false;
    const result = this.database.prepare(`INSERT INTO pilot_records(pilot_id,record_type,value,city_id,achieved_at) VALUES(?,?,?,?,?)
      ON CONFLICT(pilot_id,record_type) DO UPDATE SET value=excluded.value,city_id=excluded.city_id,achieved_at=excluded.achieved_at WHERE excluded.value>pilot_records.value`).run(pilotId, type, value, cityId ?? null, now);
    return result.changes > 0;
  }

  referralCode(pilotId: string): string {
    const existing = this.database.prepare('SELECT referral_code FROM pilot_referral_codes WHERE pilot_id=?').get(pilotId) as { referral_code?: string } | undefined;
    if (existing?.referral_code) return existing.referral_code;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const entropy = randomBytes(10);
      const compact = Array.from(entropy, value => alphabet[value % alphabet.length]).join('');
      const code = `${compact.slice(0, 5)}-${compact.slice(5)}`;
      try {
        this.database.prepare('INSERT INTO pilot_referral_codes(pilot_id,referral_code) VALUES(?,?)').run(pilotId, code);
        return code;
      } catch (error) {
        if (!String(error).includes('UNIQUE constraint failed')) throw error;
        const concurrent = this.database.prepare('SELECT referral_code FROM pilot_referral_codes WHERE pilot_id=?').get(pilotId) as { referral_code?: string } | undefined;
        if (concurrent?.referral_code) return concurrent.referral_code;
      }
    }
    throw new Error('Unable to allocate a referral code');
  }

  validReferralCode(code: unknown): boolean {
    if (typeof code !== 'string' || !/^(?:[A-Z0-9]{4}-[A-Z0-9]{4}|[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5})$/i.test(code)) return false;
    return Boolean(this.database.prepare(`SELECT 1 FROM pilot_referral_codes AS codes
      JOIN account_profile_links AS links ON links.pilot_id=codes.pilot_id WHERE codes.referral_code=?`)
      .get(code.toUpperCase()));
  }

  hasPendingReferral(pilotId: string): boolean {
    return Boolean(this.database.prepare("SELECT 1 FROM pilot_referrals WHERE referred_pilot_id=? AND status='pending' AND attribution_version=1").get(pilotId));
  }

  registerNetworkIdentity(pilotId: string, networkId: string | undefined, now = Date.now()): void {
    if (!networkId || !/^[a-f0-9]{64}$/i.test(networkId)) return;
    this.database.prepare('INSERT INTO pilot_network_security VALUES(?,?,?) ON CONFLICT(pilot_id) DO UPDATE SET network_id=excluded.network_id,updated_at=excluded.updated_at').run(pilotId, networkId, now);
  }

  qualifyReferral(pilotId: string, now = Date.now()): { rewarded: boolean; inviterRewarded: boolean; inviterId?: string; profile?: PlayerProfile } {
    const row = this.database.prepare('SELECT referrer_pilot_id,status FROM pilot_referrals WHERE referred_pilot_id=? AND attribution_version=1').get(pilotId) as { referrer_pilot_id: string; status: string } | undefined;
    if (!row || row.status === 'rewarded') return { rewarded: false, inviterRewarded: false };
    return this.wallet.transaction((wallet) => {
      const current = this.database.prepare('SELECT referrer_pilot_id,status FROM pilot_referrals WHERE referred_pilot_id=? AND attribution_version=1').get(pilotId) as { referrer_pilot_id: string; status: string } | undefined;
      if (!current || current.status === 'rewarded') return { rewarded: false, inviterRewarded: false };
      const recent = this.database.prepare('SELECT COUNT(*) AS count FROM pilot_referrals WHERE referrer_pilot_id=? AND inviter_rewarded_at>?')
        .get(current.referrer_pilot_id, now - 30 * 86_400_000) as { count: number };
      const referredBefore = wallet.balances(pilotId)?.credits;
      const referredCredit = wallet.credit({
        pilotId, currency:'CREDITS', amount:500, reason:'REFERRAL_NEW_PLAYER',
        idempotencyKey:`referral:new:${pilotId}`, referenceId:pilotId, context:{ referrerPilotId: current.referrer_pilot_id }, createdAt:now,
      });
      if (!referredCredit.ok || !referredCredit.transactionId || referredCredit.balance !== (referredBefore ?? -1) + 500) {
        throw new Error('Referred-player wallet credit failed');
      }
      const inviterRewarded = recent.count < 10;
      const inviterBefore = inviterRewarded ? wallet.balances(current.referrer_pilot_id)?.credits : undefined;
      const inviterCredit = inviterRewarded ? wallet.credit({
        pilotId:current.referrer_pilot_id, currency:'CREDITS', amount:750, reason:'REFERRAL_INVITER',
        idempotencyKey:`referral:inviter:${pilotId}`, referenceId:pilotId, context:{ referredPilotId: pilotId }, createdAt:now,
      }) : undefined;
      if (inviterRewarded && (!inviterCredit?.ok || !inviterCredit.transactionId || inviterCredit.balance !== (inviterBefore ?? -1) + 750)) {
        throw new Error('Referral inviter wallet credit failed');
      }
      const changed = this.database.prepare(`UPDATE pilot_referrals SET status='rewarded',qualified_at=?,rewarded_at=?,inviter_rewarded_at=?,
        inviter_wallet_transaction_id=?,referred_wallet_transaction_id=? WHERE referred_pilot_id=? AND status!='rewarded'`)
        .run(now, now, inviterRewarded ? now : null, inviterCredit?.transactionId ?? null, referredCredit.transactionId, pilotId).changes;
      if (!changed) throw new Error('Referral qualification was not serialized');
      return { rewarded: true, inviterRewarded, inviterId: current.referrer_pilot_id, profile: this.toProfile(this.getRow(pilotId)!) };
    });
  }

  awardPvpWin(challengeId: string, winnerId: string, opponentId: string, credits: number, now = Date.now()): { rewarded: boolean; profile?: PlayerProfile } {
    if (!/^[a-f0-9-]{36}$/i.test(challengeId) || winnerId === opponentId) return { rewarded: false };
    return this.wallet.transaction((wallet) => {
      const pairSince = this.database.prepare('SELECT MAX(created_at) AS at FROM pvp_reward_wins WHERE rewarded=1 AND ((winner_pilot_id=? AND opponent_pilot_id=?) OR (winner_pilot_id=? AND opponent_pilot_id=?))').get(winnerId, opponentId, opponentId, winnerId) as { at?: number };
      const day = utcDayId(now);
      const daily = this.database.prepare("SELECT COUNT(*) AS count FROM pvp_reward_wins WHERE winner_pilot_id=? AND rewarded=1 AND created_at>=?").get(winnerId, Date.parse(`${day}T00:00:00.000Z`)) as { count: number };
      const rewarded = !(pairSince.at && now - pairSince.at < 30 * 60_000) && daily.count < 5;
      const inserted = this.database.prepare('INSERT OR IGNORE INTO pvp_reward_wins VALUES(?,?,?,?,?)').run(challengeId, winnerId, opponentId, rewarded ? 1 : 0, now).changes;
      if (!inserted) return { rewarded: false };
      const amount = boundedInteger(credits, 100_000);
      if (rewarded && amount > 0) wallet.credit({ pilotId:winnerId, currency:'CREDITS', amount, reason:'COMBAT_REWARD', idempotencyKey:`pvp:${challengeId}`, referenceId:challengeId, createdAt:now });
      return { rewarded, profile: this.toProfile(this.getRow(winnerId)!) };
    });
  }

  hasProfile(pilotId: string): boolean {
    return Boolean(this.getRow(pilotId));
  }

  importLegacy(pilotId: string, legacy: LegacyProfileImport): PlayerProfile {
    if (!this.getRow(pilotId)) return this.getOrCreate(pilotId, 'Pilot');
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId);
      if (!row) throw new Error('Profile disappeared during legacy import');
      if (row.legacy_imported) return this.toProfile(row);
      const importedCredits = boundedInteger(legacy.credits, 1_000_000);
      const credits = importedCredits >= legacyDevCreditThreshold
        ? migratedDevCredits
        : Math.max(boundedInteger(row.credits, 1_000_000), importedCredits);
      const discoveries = parseDiscoveries(legacy.discoveries);
      const usableAircraft = usableAircraftForRow(row);
      const trial = parseFighterTrial(row.fighter_trial);
      const requestedAircraft = trial.status === 'pending' || trial.status === 'active'
        ? row.selected_aircraft
        : legacy.selectedAircraft;
      const selectedAircraft = selectedOwnedAircraft(requestedAircraft, usableAircraft);
      this.database.prepare(`UPDATE player_profiles SET pilot_name = ?, score = MAX(score, ?), selected_aircraft = ?, total_distance = ?, successful_landings = ?, discoveries = ?, legacy_imported = 1 WHERE pilot_id = ?`)
        .run(
          assignedPilotName(legacy.pilotName ?? row.pilot_name, pilotId), boundedInteger(legacy.score, 100_000_000), selectedAircraft,
          boundedNumber(legacy.totalDistance, 10_000_000), boundedInteger(legacy.successfulLandings, 100_000), JSON.stringify(discoveries), pilotId,
        );
      const difference = credits - boundedInteger(row.credits, 1_000_000);
      if (difference > 0) wallet.credit({ pilotId, currency: 'CREDITS', amount: difference, reason: 'MIGRATION', referenceId: 'legacy-profile' });
      if (difference < 0) wallet.debit({ pilotId, currency: 'CREDITS', amount: -difference, reason: 'MIGRATION', referenceId: 'legacy-profile' });
      return this.toProfile(this.getRow(pilotId)!);
    });
  }

  setPilotName(pilotId: string, pilotName: string): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    const normalized = normalizePilotName(pilotName);
    if (!normalized) return undefined;
    this.database.prepare('UPDATE player_profiles SET pilot_name = ? WHERE pilot_id = ?').run(normalized, pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  updateProgress(pilotId: string, progress: ProfileProgress): PlayerProfile | undefined {
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId);
      if (!row) return undefined;
      const discoveries = parseDiscoveries(progress.discoveries);
      const mergedDiscoveries = rowDiscoveries(row);
      let newDiscoveries = 0;
      for (const cityId of cityIds) {
        const previous = new Set(mergedDiscoveries[cityId] ?? []);
        const maximum = capabilitiesForCity(cityId).discoveryTotal;
        const merged = [...new Set([...previous, ...(discoveries[cityId] ?? [])])].slice(0, maximum);
        newDiscoveries += Math.max(0, merged.length - previous.size);
        mergedDiscoveries[cityId] = merged;
      }
      const currentAircraft = selectedOwnedAircraft(row.selected_aircraft, usableAircraftForRow(row));
      this.database.prepare(`UPDATE player_profiles SET selected_aircraft = ?, total_distance = MAX(total_distance, ?), successful_landings = MAX(successful_landings, ?), discoveries = ? WHERE pilot_id = ?`)
        .run(currentAircraft, boundedNumber(progress.totalDistance, 10_000_000), boundedInteger(progress.successfulLandings, 100_000), JSON.stringify(mergedDiscoveries), pilotId);
      const reward = newDiscoveries * economyRewards.discovery;
      if (reward > 0) wallet.credit({ pilotId, currency: 'CREDITS', amount: reward, reason: 'DISCOVERY_REWARD', referenceId: 'discoveries' });
      return this.toProfile(this.getRow(pilotId)!);
    });
  }

  equipAircraft(pilotId: string, requestedAircraft: unknown): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row || typeof requestedAircraft !== 'string' || !aircraftTypes.has(requestedAircraft as AircraftType)) return row ? this.toProfile(row) : undefined;
    const profile = this.toProfile(row);
    if (!profile.unlockedAircraft.includes(requestedAircraft as AircraftType)) return profile;
    this.database.prepare('UPDATE player_profiles SET selected_aircraft = ? WHERE pilot_id = ?').run(requestedAircraft, pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  requestFighterTrial(pilotId: string): { ok: boolean; reason?: string; profile?: PlayerProfile } {
    const row = this.getRow(pilotId);
    if (!row) return { ok: false, reason: 'PROFILE NOT FOUND' };
    const profile = this.toProfile(row);
    if (profile.unlockedAircraft.includes('fighter') && profile.fighterTrial.status === 'available') return { ok: true, profile };
    if (profile.aircraftEntitlements.includes(aircraftEntitlement('fighter')!)) return { ok: true, profile };
    if (profile.fighterTrial.status !== 'available') return { ok: false, reason: 'FREE TEST FLIGHT ALREADY USED', profile };
    this.database.prepare('UPDATE player_profiles SET fighter_trial = ? WHERE pilot_id = ?').run(JSON.stringify({ status: 'pending' }), pilotId);
    return { ok: true, profile: this.toProfile(this.getRow(pilotId)!) };
  }

  activateFighterTrial(pilotId: string, now = Date.now()): PlayerProfile | undefined {
    const row = this.getRow(pilotId); if (!row) return undefined;
    const trial = parseFighterTrial(row.fighter_trial);
    if (trial.status !== 'pending') return this.toProfile(row);
    const active: FighterTrialState = { status: 'active', startedAt: now, expiresAt: now + REDSPEAR_TRIAL_DURATION_MS };
    this.database.prepare('UPDATE player_profiles SET fighter_trial = ?, selected_aircraft = ? WHERE pilot_id = ?').run(JSON.stringify(active), 'fighter', pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  consumeExpiredFighterTrial(pilotId: string, now = Date.now()): PlayerProfile | undefined {
    const row = this.getRow(pilotId); if (!row) return undefined;
    const trial = parseFighterTrial(row.fighter_trial);
    if (trial.status !== 'active' || (trial.expiresAt ?? Infinity) > now) return this.toProfile(row);
    const consumed = { ...trial, status: 'consumed' } satisfies FighterTrialState;
    const permanentlyOwnsFighter = parseOwnedAircraft(row.owned_aircraft, parseEntitlements(row.aircraft_entitlements)).includes('fighter');
    this.database.prepare('UPDATE player_profiles SET fighter_trial = ?, selected_aircraft = CASE WHEN ? = 0 AND selected_aircraft = ? THEN ? ELSE selected_aircraft END WHERE pilot_id = ?')
      .run(JSON.stringify(consumed), permanentlyOwnsFighter ? 1 : 0, 'fighter', 'trainer', pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  markFighterTrialCompleted(pilotId: string, now = Date.now()): boolean {
    const row = this.getRow(pilotId); if (!row) return false;
    const trial = parseFighterTrial(row.fighter_trial);
    if (trial.status !== 'active' || (trial.expiresAt ?? Infinity) > now || trial.completedReportedAt) return false;
    this.database.prepare('UPDATE player_profiles SET fighter_trial = ? WHERE pilot_id = ?').run(JSON.stringify({ ...trial, completedReportedAt: now }), pilotId);
    return true;
  }

  purchaseAircraft(pilotId: string, requestedAircraft: unknown): { ok: boolean; reason?: string; profile?: PlayerProfile } {
    if (typeof requestedAircraft !== 'string' || !aircraftTypes.has(requestedAircraft as AircraftType)) return { ok: false, reason: 'UNKNOWN AIRCRAFT' };
    const aircraft = requestedAircraft as AircraftType;
    const price = aircraftCreditPrice(aircraft);
    if (price === undefined) return { ok: false, reason: aircraft === 'fighter' ? 'PREMIUM AIRCRAFT — NOT AVAILABLE FOR CREDITS' : 'NOT AVAILABLE FOR CREDITS' };
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId);
      if (!row) return { ok: false, reason: 'PROFILE NOT FOUND' };
      const entitlements = parseEntitlements(row.aircraft_entitlements);
      const owned = parseOwnedAircraft(row.owned_aircraft, entitlements);
      if (owned.includes(aircraft)) return { ok: true, profile: this.toProfile(row) };
      const debit = wallet.debit({
        pilotId, currency: 'CREDITS', amount: price, reason: 'AIRCRAFT_PURCHASE',
        referenceId: `aircraft:${aircraft}`, context: { aircraft },
      });
      if (!debit.ok) return { ok: false, reason: `NEED ${Math.max(0, price - row.credits).toLocaleString()} MORE CREDITS`, profile: this.toProfile(row) };
      owned.push(aircraft);
      const granted = this.database.prepare('UPDATE player_profiles SET owned_aircraft = ? WHERE pilot_id = ?')
        .run(JSON.stringify(aircraftOrder.filter((type) => owned.includes(type))), pilotId);
      if (granted.changes !== 1) throw new Error('Aircraft grant failed after wallet debit');
      return { ok: true, profile: this.toProfile(this.getRow(pilotId)!) };
    });
  }

  grantAircraftEntitlements(pilotId: string, requestedAircraft: readonly AircraftType[], source = 'legacy'): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    const entitlements = new Set(parseEntitlements(row.aircraft_entitlements));
    for (const aircraft of requestedAircraft) {
      const entitlement = aircraftEntitlement(aircraft);
      if (entitlement) {
        entitlements.add(entitlement);
        this.database.prepare(`INSERT OR IGNORE INTO aircraft_entitlement_sources (pilot_id,entitlement,source,granted_at) VALUES (?,?,?,?)`)
          .run(pilotId, entitlement, source.slice(0, 80), Date.now());
      }
    }
    this.database.prepare('UPDATE player_profiles SET aircraft_entitlements = ? WHERE pilot_id = ?')
      .run(JSON.stringify([...entitlements]), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  revokeAircraftEntitlementSource(pilotId: string, aircraft: AircraftType, source: string): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    const entitlement = aircraftEntitlement(aircraft);
    if (!row || !entitlement) return row ? this.toProfile(row) : undefined;
    this.database.prepare('DELETE FROM aircraft_entitlement_sources WHERE pilot_id=? AND entitlement=? AND source=?')
      .run(pilotId, entitlement, source.slice(0, 80));
    const remaining = this.database.prepare('SELECT 1 FROM aircraft_entitlement_sources WHERE pilot_id=? AND entitlement=? LIMIT 1')
      .get(pilotId, entitlement);
    if (!remaining) {
      const entitlements = parseEntitlements(row.aircraft_entitlements).filter(value => value !== entitlement);
      this.database.prepare(`UPDATE player_profiles SET aircraft_entitlements=?,selected_aircraft=CASE WHEN selected_aircraft=? THEN ? ELSE selected_aircraft END WHERE pilot_id=?`)
        .run(JSON.stringify(entitlements), aircraft, 'trainer', pilotId);
    }
    return this.toProfile(this.getRow(pilotId)!);
  }

  migrateFighterEntitlementSources(paid: ReadonlyArray<{ pilotId: string; stripeMode: 'test' | 'live' }>, testerPilotIds: readonly string[]): void {
    const entitlement = aircraftEntitlement('fighter')!;
    const insert = this.database.prepare(`INSERT OR IGNORE INTO aircraft_entitlement_sources (pilot_id,entitlement,source,granted_at) VALUES (?,?,?,?)`);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      for (const grant of paid) insert.run(grant.pilotId, entitlement, `stripe:${grant.stripeMode}`, Date.now());
      for (const pilotId of testerPilotIds) insert.run(pilotId, entitlement, 'tester', Date.now());
      const unresolved = this.database.prepare(`SELECT pilot_id FROM player_profiles WHERE EXISTS (
        SELECT 1 FROM json_each(player_profiles.aircraft_entitlements) WHERE value=?
      ) AND NOT EXISTS (
        SELECT 1 FROM aircraft_entitlement_sources sources WHERE sources.pilot_id=player_profiles.pilot_id AND sources.entitlement=?
      )`).all(entitlement, entitlement) as Array<{ pilot_id: string }>;
      for (const row of unresolved) insert.run(row.pilot_id, entitlement, 'legacy', Date.now());
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  applyClientReward(pilotId: string, rewardId: string, source: unknown): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    const now = Date.now();
    const issuedAt = rewardReceiptIssuedAt(rewardId);
    if (!row || issuedAt === undefined || now - issuedAt > rewardReceiptRetentionMs || issuedAt - now > rewardReceiptFutureToleranceMs || typeof source !== 'string' || !(source in economyRewards.contractCredits)) return undefined;
    const credits = economyRewards.contractCredits[source as keyof typeof economyRewards.contractCredits];
    return this.wallet.transaction((wallet) => {
      const current = this.getRow(pilotId);
      if (!current) return undefined;
      const prior = this.database.prepare('SELECT MAX(created_at) AS created_at FROM profile_reward_receipts WHERE pilot_id = ? AND reward_id LIKE ?')
        .get(pilotId, 'contract:%') as { created_at?: number } | undefined;
      if (prior?.created_at && now - prior.created_at < economyRewards.contractClaimCooldownMs) return this.toProfile(current);
      const receiptId = `contract:${source}:${rewardId}`;
      const receipt = this.database.prepare('INSERT OR IGNORE INTO profile_reward_receipts (pilot_id, reward_id, created_at) VALUES (?, ?, ?)').run(pilotId, receiptId, now);
      if (receipt.changes === 0) return this.toProfile(current);
      wallet.credit({ pilotId, currency: 'CREDITS', amount: credits, reason: 'FLIGHT_REWARD', idempotencyKey: receiptId, referenceId: rewardId, createdAt: now });
      return this.toProfile(this.getRow(pilotId)!);
    });
  }

  recordFirehawkMissionFailure(pilotId: string, missionId: string, now = Date.now()): boolean {
    if (!this.getRow(pilotId) || !/^[a-z0-9-]{1,80}$/.test(missionId)) return false;
    this.database.prepare('DELETE FROM firehawk_mission_failures WHERE failed_at < ?').run(now - 7 * 24 * 60 * 60_000);
    this.database.prepare('INSERT INTO firehawk_mission_failures (pilot_id, mission_id, failed_at) VALUES (?, ?, ?)').run(pilotId, missionId, now);
    const since = now - 7 * 24 * 60 * 60_000;
    const count = this.database.prepare('SELECT COUNT(*) AS total FROM firehawk_mission_failures WHERE pilot_id = ? AND mission_id = ? AND failed_at >= ? AND failed_at <= ?')
      .get(pilotId, missionId, since, now) as { total: number };
    return count.total >= 2;
  }

  claimFirehawkPromotion(pilotId: string, missionId: string, now = Date.now()): { trialEligible: boolean } | undefined {
    if (!/^[a-z0-9-]{1,80}$/.test(missionId)) return undefined;
    const since = now - 7 * 24 * 60 * 60_000;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM firehawk_promo_impressions WHERE shown_at < ?').run(since);
      const profile = this.getRow(pilotId);
      if (!profile) { this.database.exec('ROLLBACK'); return undefined; }
      const failed = this.database.prepare('SELECT COUNT(*) AS total FROM firehawk_mission_failures WHERE pilot_id = ? AND mission_id = ? AND failed_at >= ? AND failed_at <= ?')
        .get(pilotId, missionId, since, now) as { total: number };
      const shown = this.database.prepare('SELECT COUNT(*) AS total FROM firehawk_promo_impressions WHERE pilot_id = ? AND shown_at >= ? AND shown_at <= ?')
        .get(pilotId, since, now) as { total: number };
      const current = this.toProfile(profile);
      if (failed.total < 2 || shown.total >= 2 || current.aircraftEntitlements.includes(firehawkProduct.entitlement)) {
        this.database.exec('ROLLBACK'); return undefined;
      }
      this.database.prepare('INSERT INTO firehawk_promo_impressions (pilot_id, shown_at) VALUES (?, ?)').run(pilotId, now);
      this.database.exec('COMMIT');
      return { trialEligible: current.fighterTrial.status === 'available' };
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }

  awardServerReward(
    pilotId: string,
    credits: number,
    stats?: Partial<Pick<PlayerProfile, 'kills' | 'deaths' | 'challengeCompletions' | 'eventCompletions'>>,
    reason: WalletTransactionReason = 'FLIGHT_REWARD',
    referenceId?: string,
  ): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    this.wallet.transaction((wallet) => {
      const amount = boundedInteger(credits, 100_000);
      if (amount > 0) wallet.credit({ pilotId, currency: 'CREDITS', amount, reason, referenceId });
      this.database.prepare(`UPDATE player_profiles SET kills = kills + ?, deaths = deaths + ?, challenge_completions = challenge_completions + ?, event_completions = event_completions + ? WHERE pilot_id = ?`)
        .run(
          boundedInteger(stats?.kills, 1_000_000), boundedInteger(stats?.deaths, 1_000_000),
          boundedInteger(stats?.challengeCompletions, 1_000_000), boundedInteger(stats?.eventCompletions, 1_000_000), pilotId,
        );
    });
    return this.toProfile(this.getRow(pilotId)!);
  }

  awardServerRewardOnce(
    pilotId: string,
    rewardId: string,
    credits: number,
    stats?: Partial<Pick<PlayerProfile, 'kills' | 'deaths' | 'challengeCompletions' | 'eventCompletions'>>,
    reason: WalletTransactionReason = 'EVENT_REWARD',
  ): { profile?: PlayerProfile; awarded: boolean } {
    const row = this.getRow(pilotId);
    const compactId = rewardId.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 160);
    if (!row || !compactId) return { awarded: false };
    const now = Date.now();
    return this.wallet.transaction((wallet) => {
      const receipt = this.database.prepare('INSERT OR IGNORE INTO profile_reward_receipts (pilot_id, reward_id, created_at) VALUES (?, ?, ?)')
        .run(pilotId, `server:${compactId}`, now);
      if (receipt.changes > 0) {
        const amount = boundedInteger(credits, 100_000);
        if (amount > 0) wallet.credit({
          pilotId, currency: 'CREDITS', amount, reason,
          idempotencyKey: `server:${compactId}`, referenceId: compactId,
        });
        this.database.prepare(`UPDATE player_profiles SET kills = kills + ?, deaths = deaths + ?, challenge_completions = challenge_completions + ?, event_completions = event_completions + ? WHERE pilot_id = ?`)
          .run(
            boundedInteger(stats?.kills, 1_000_000), boundedInteger(stats?.deaths, 1_000_000),
            boundedInteger(stats?.challengeCompletions, 1_000_000), boundedInteger(stats?.eventCompletions, 1_000_000), pilotId,
          );
      }
      return { profile: this.toProfile(this.getRow(pilotId)!), awarded: receipt.changes > 0 };
    });
  }

  saveActiveChaosEvent(pilotId: string, event: { id:string; type:string; cityId:string; startedAt:number; expiresAt:number; target?:unknown }): void {
    this.database.prepare(`INSERT INTO pilot_chaos_events (pilot_id,event_id,event_type,city_id,state,started_at,expires_at,target_json,result_json)
      VALUES (?,?,?,?, 'active',?,?,?, '{}') ON CONFLICT(pilot_id) DO UPDATE SET event_id=excluded.event_id,event_type=excluded.event_type,city_id=excluded.city_id,state='active',started_at=excluded.started_at,expires_at=excluded.expires_at,completed_at=NULL,reward_claimed_at=NULL,target_json=excluded.target_json,result_json='{}'`)
      .run(pilotId, event.id, event.type.slice(0,48), event.cityId.slice(0,32), event.startedAt, event.expiresAt, JSON.stringify(event.target ?? {}).slice(0,2_000));
  }

  activeChaosEvent(pilotId: string, now = Date.now()): { eventId:string; eventType:string; cityId:string; expiresAt:number; progress:number } | undefined {
    const row = this.database.prepare(`SELECT event_id,event_type,city_id,expires_at,result_json FROM pilot_chaos_events WHERE pilot_id=? AND state='active' AND expires_at>?`)
      .get(pilotId, now) as { event_id:string; event_type:string; city_id:string; expires_at:number; result_json:string } | undefined;
    if (!row) return undefined;
    let progress = 0; try { progress = Number(JSON.parse(row.result_json)?.progress) || 0; } catch { /* keep zero */ }
    return { eventId:row.event_id, eventType:row.event_type, cityId:row.city_id, expiresAt:row.expires_at, progress };
  }

  updateChaosEventProgress(pilotId:string, eventId:string, progress:number):void {
    this.database.prepare(`UPDATE pilot_chaos_events SET result_json=? WHERE pilot_id=? AND event_id=? AND state='active'`)
      .run(JSON.stringify({ progress:Math.max(0, Math.min(1_000_000, progress)) }), pilotId, eventId);
  }

  finishChaosEvent(pilotId: string, eventId: string, state: 'completed'|'failed', result: unknown = {}, now = Date.now()): void {
    this.database.prepare(`UPDATE pilot_chaos_events SET state=?,completed_at=?,result_json=? WHERE pilot_id=? AND event_id=? AND state='active'`)
      .run(state, now, JSON.stringify(result).slice(0,2_000), pilotId, eventId);
  }

  objectivesForCity(pilotId: string, cityId: CityId): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    const state = parseObjectives(row.objectives, cityId, (rowDiscoveries(row)[cityId] ?? []).length);
    const all = this.objectiveStates(row);
    all[cityId] = state;
    this.database.prepare('UPDATE player_profiles SET objectives = ? WHERE pilot_id = ?').run(JSON.stringify(all), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  recordObjectiveActivity(pilotId: string, cityId: CityId, activity: ObjectiveActivity, amount = 1, airportId?: string): { profile: PlayerProfile; completed: ObjectiveItem[]; bonusCredits: number } | undefined {
    if (amount <= 0 || !Number.isFinite(amount)) return undefined;
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId);
      if (!row) return undefined;
      const all = this.objectiveStates(row);
      const state = parseObjectives(all[cityId], cityId, (rowDiscoveries(row)[cityId] ?? []).length);
      all[cityId] = state;
      if (activity === 'landing') {
        const capabilities = capabilitiesForCity(cityId);
        if (!airportId || !capabilities.landableAirportIds.includes(airportId)) return { profile: this.toProfile(row), completed: [], bonusCredits: 0 };
        const landed = new Set(state.landingAirportIds ?? []);
        if (landed.has(airportId)) return { profile: this.toProfile(row), completed: [], bonusCredits: 0 };
        landed.add(airportId);
        state.landingAirportIds = [...landed];
        amount = 1;
      }
      const completed: ObjectiveItem[] = [];
      let credits = 0;
      for (const item of [...state.daily, ...state.weekly]) {
        if (item.activity !== activity || item.completed) continue;
        item.progress = Math.min(item.target, item.progress + Math.floor(amount));
        if (item.progress >= item.target) {
          item.completed = true;
          if (!item.rewarded) { item.rewarded = true; credits += item.reward; completed.push(item); }
        }
      }
      let bonusCredits = 0;
      if (!state.dailyBonusAwarded && state.daily.every((item) => item.completed)) { state.dailyBonusAwarded = true; bonusCredits += 100; }
      if (!state.weeklyBonusAwarded && state.weekly.every((item) => item.completed)) { state.weeklyBonusAwarded = true; bonusCredits += 300; }
      this.database.prepare('UPDATE player_profiles SET objectives = ? WHERE pilot_id = ?').run(JSON.stringify(all), pilotId);
      const reward = credits + bonusCredits;
      if (reward > 0) wallet.credit({ pilotId, currency: 'CREDITS', amount: reward, reason: 'OBJECTIVE_REWARD', referenceId: `${cityId}:${activity}` });
      return { profile: this.toProfile(this.getRow(pilotId)!), completed, bonusCredits };
    });
  }

  awardMasteryXp(pilotId: string, cityId: CityId, amount: number): { profile: PlayerProfile; gained: number; levelUp?: number; rewards: string[] } | undefined {
    const row = this.getRow(pilotId);
    if (!row || !Number.isFinite(amount) || amount <= 0) return undefined;
    const mastery = parseMastery(row.mastery);
    const state = mastery[cityId] ?? emptyMastery();
    const previousLevel = state.level;
    state.xp = Math.min(10_000_000, state.xp + Math.floor(amount));
    while (state.level < MASTERY_MAX_LEVEL && state.xp >= masteryXpForLevel(state.level + 1)) state.level += 1;
    const rewards: string[] = [];
    for (let level = previousLevel + 1; level <= state.level; level += 1) {
      const reward = masteryRewards[level];
      if (reward && !state.unlockedRewards.includes(reward)) { state.unlockedRewards.push(reward); rewards.push(reward); }
    }
    mastery[cityId] = state;
    this.database.prepare('UPDATE player_profiles SET mastery = ? WHERE pilot_id = ?').run(JSON.stringify(mastery), pilotId);
    return { profile: this.toProfile(this.getRow(pilotId)!), gained: Math.floor(amount), levelUp: state.level > previousLevel ? state.level : undefined, rewards };
  }

  recordWeeklyLeaderboard(pilotId: string, cityId: CityId, category: WeeklyLeaderboardCategory, amount: number, highest = false): void {
    const profile = this.getRow(pilotId); if (!profile || amount <= 0) return;
    const now = Date.now(); const week = weekId();
    this.database.prepare(`INSERT INTO weekly_leaderboard (city_id, week_id, category, pilot_id, pilot_name, value, achieved_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(city_id, week_id, category, pilot_id) DO UPDATE SET value = ${highest ? 'MAX(value, excluded.value)' : 'value + excluded.value'}, achieved_at = CASE WHEN excluded.value >= value THEN excluded.achieved_at ELSE achieved_at END, pilot_name = excluded.pilot_name`)
      .run(cityId, week, category, pilotId, profile.pilot_name, amount, now);
  }

  weeklyLeaderboard(cityId: CityId, category: WeeklyLeaderboardCategory, pilotId?: string): { weekId: string; top: Array<{ pilotId: string; pilotName: string; value: number }>; localRank?: number } {
    const week = weekId();
    const rows = this.database.prepare('SELECT pilot_id, pilot_name, value FROM weekly_leaderboard WHERE city_id = ? AND week_id = ? AND category = ? ORDER BY value DESC, achieved_at ASC, pilot_name ASC').all(cityId, week, category) as Array<{ pilot_id: string; pilot_name: string; value: number }>;
    const index = pilotId ? rows.findIndex((row) => row.pilot_id === pilotId) : -1;
    return { weekId: week, top: rows.slice(0, 10).map((row) => ({ pilotId: row.pilot_id, pilotName: row.pilot_name, value: row.value })), localRank: index >= 0 ? index + 1 : undefined };
  }

  finalizePreviousWeeklyReward(pilotId: string, now = Date.now()): PlayerProfile['weeklyReward'] | undefined {
    const currentWeek = weekId(new Date(now));
    const previousDate = new Date(`${currentWeek}T00:00:00.000Z`); previousDate.setUTCDate(previousDate.getUTCDate() - 7);
    const previousWeek = weekId(previousDate);
    const existing = this.database.prepare('SELECT * FROM weekly_reward_claims WHERE pilot_id=? AND week_id=?').get(pilotId, previousWeek) as { week_id: string; rank: number; category: string; credits: number; badge: string; badge_expires_at: number } | undefined;
    if (existing) return { weekId: existing.week_id, rank: existing.rank, category: existing.category, credits: existing.credits, badge: existing.badge, badgeExpiresAt: existing.badge_expires_at };
    const placements: Array<{ category: string; rank: number }> = [];
    for (const city of cityIds) for (const category of ['stunt', 'kills', 'wantedSurvival', 'events', 'territories', 'precisionLanding', 'mastery'] as const) {
      const rows = this.database.prepare('SELECT pilot_id FROM weekly_leaderboard WHERE city_id=? AND week_id=? AND category=? ORDER BY value DESC,achieved_at ASC,pilot_name ASC').all(city, previousWeek, category) as Array<{ pilot_id: string }>;
      const rank = rows.findIndex(item => item.pilot_id === pilotId) + 1;
      if (rank) placements.push({ category, rank });
    }
    const best = placements.sort((a, b) => a.rank - b.rank || a.category.localeCompare(b.category))[0];
    const reward = best && weeklyRewardForRank(best.rank);
    if (!best || !reward) return undefined;
    const badgeExpiresAt = Date.parse(`${currentWeek}T00:00:00.000Z`) + 7 * 86_400_000;
    return this.wallet.transaction((wallet) => {
      const inserted = this.database.prepare('INSERT OR IGNORE INTO weekly_reward_claims VALUES(?,?,?,?,?,?,?,?)').run(pilotId, previousWeek, best.rank, best.category, reward.credits, reward.badge, badgeExpiresAt, now).changes;
      if (inserted) wallet.credit({
        pilotId, currency: 'CREDITS', amount: reward.credits, reason: 'WEEKLY_REWARD',
        idempotencyKey: `weekly-rank:${previousWeek}`, referenceId: previousWeek, createdAt: now,
      });
      return { weekId: previousWeek, rank: best.rank, category: best.category, credits: reward.credits, badge: reward.badge, badgeExpiresAt };
    });
  }

  missionState(pilotId: string, cityId: CityId): MissionCityState | undefined {
    const row = this.getRow(pilotId);
    return row ? parseMissionStates(row.missions)[cityId] : undefined;
  }

  acceptMission(pilotId: string, cityId: CityId, missionId: string, replace: boolean, expectedAttemptId?: string, now = Date.now()): { ok: boolean; reason?: string; confirmationRequired?: boolean; profile?: PlayerProfile } {
    const row = this.getRow(pilotId);
    const mission = missionForCity(cityId, missionId);
    if (!row || !mission) return { ok: false, reason: 'MISSION UNAVAILABLE' };
    if (mission.retired) return { ok: false, reason: 'MISSION RETIRED' };
    const all = parseMissionStates(row.missions);
    const state = all[cityId]!;
    const current = [...cityIds].find((id) => all[id]?.active);
    const currentAttempt = current ? all[current]?.active : undefined;
    if (replace && (!currentAttempt || currentAttempt.attemptId !== expectedAttemptId)) return { ok: false, reason: 'MISSION CHANGED — PLEASE TRY AGAIN' };
    if (currentAttempt && !replace) return { ok: false, confirmationRequired: true, reason: 'LEAVE CURRENT MISSION?' };
    if (current === cityId && currentAttempt?.missionId === missionId) return { ok: false, reason: 'MISSION ALREADY ACTIVE' };
    const lastCompleted = state.completions[missionId]?.lastCompletedAt ?? 0;
    if (lastCompleted && now < lastCompleted + mission.replayCooldownMs) return { ok: false, reason: 'REPLAY COOLDOWN ACTIVE' };
    if (current) all[current]!.active = undefined;
    state.active = { missionId, attemptId: randomUUID(), startedAt: now, updatedAt: now, progress: 0, completedIds: [] };
    this.database.prepare('UPDATE player_profiles SET missions = ? WHERE pilot_id = ?').run(JSON.stringify(all), pilotId);
    return { ok: true, profile: this.toProfile(this.getRow(pilotId)!) };
  }

  abandonMission(pilotId: string, cityId: CityId, expectedAttemptId?: string): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    const all = parseMissionStates(row.missions);
    if (!all[cityId]?.active || all[cityId]!.active!.attemptId !== expectedAttemptId) return undefined;
    all[cityId]!.active = undefined;
    this.database.prepare('UPDATE player_profiles SET missions = ? WHERE pilot_id = ?').run(JSON.stringify(all), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  updateMissionAttempt(pilotId: string, cityId: CityId, attempt: MissionAttempt): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    const all = parseMissionStates(row.missions);
    if (all[cityId]?.active?.attemptId !== attempt.attemptId) return undefined;
    all[cityId]!.active = attempt;
    this.database.prepare('UPDATE player_profiles SET missions = ? WHERE pilot_id = ?').run(JSON.stringify(all), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  completeMission(pilotId: string, cityId: CityId, attemptId: string, now = Date.now()): { profile: PlayerProfile; credits: number; score: number; missionId: string; cargoBonusCredits: number } | undefined {
    return this.wallet.transaction((wallet) => {
      const row = this.getRow(pilotId);
      if (!row) return undefined;
      const all = parseMissionStates(row.missions);
      const active = all[cityId]?.active;
      if (!active || active.attemptId !== attemptId) return undefined;
      const mission = missionForCity(cityId, active.missionId);
      if (!mission) return undefined;
      const cargoReward = cargoCreditReward(mission.creditReward, row.selected_aircraft, 'mission', mission.id, mission.cargoCreditBonus === true);
      const previous = all[cityId]!.completions[mission.id];
      all[cityId]!.completions[mission.id] = { count: Math.min(1_000_000, (previous?.count ?? 0) + 1), lastCompletedAt: now };
      all[cityId]!.active = undefined;
      this.database.prepare('UPDATE player_profiles SET missions = ?, score = MIN(100000000, score + ?) WHERE pilot_id = ?')
        .run(JSON.stringify(all), mission.scoreReward, pilotId);
      if (cargoReward.credits > 0) wallet.credit({
        pilotId, currency: 'CREDITS', amount: cargoReward.credits, reason: 'MISSION_REWARD',
        idempotencyKey: `mission:${attemptId}`, referenceId: mission.id, context: { cityId }, createdAt: now,
      });
      return { profile: this.toProfile(this.getRow(pilotId)!), credits: cargoReward.credits, score: mission.scoreReward, missionId: mission.id, cargoBonusCredits: cargoReward.bonusCredits };
    });
  }

  private getRow(pilotId: string): ProfileRow | undefined {
    return this.database.prepare('SELECT * FROM player_profiles WHERE pilot_id = ?').get(pilotId) as ProfileRow | undefined;
  }

  private ensurePilotProgression(row: ProfileRow): void {
    const existing = this.database.prepare('SELECT 1 FROM pilot_progression WHERE pilot_id=?').get(row.pilot_id);
    if (existing) return;
    const discoveryCount = Object.values(rowDiscoveries(row)).reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
    const missionCount = Object.values(parseMissionStates(row.missions)).reduce((sum, state) => sum + Object.values(state?.completions ?? {}).reduce((count, item) => count + item.count, 0), 0);
    const seededXp = Math.min(100_000_000,
      Math.floor(row.total_distance / 5_000) * 5 + row.successful_landings * 25 + discoveryCount * 15 +
      row.kills * 15 + row.challenge_completions * 50 + row.event_completions * 50 + missionCount * 40);
    this.database.prepare('INSERT OR IGNORE INTO pilot_progression(pilot_id,xp,seeded) VALUES(?,?,1)').run(row.pilot_id, seededXp);
  }

  private pilotProgression(pilotId: string): PlayerProfile['pilotProgress'] {
    const row = this.database.prepare('SELECT xp FROM pilot_progression WHERE pilot_id=?').get(pilotId) as { xp?: number } | undefined;
    const xp = boundedInteger(row?.xp, 100_000_000);
    const level = pilotLevelForXp(xp);
    return { xp, level, title: pilotTitleForLevel(level), nextLevelXp: level >= 50 ? pilotXpForLevel(50) : pilotXpForLevel(level + 1) };
  }

  private streakState(pilotId: string): PlayerProfile['dailyStreak'] {
    const row = this.database.prepare('SELECT current_streak,longest_streak,cycle_day,last_claim_day FROM pilot_progression WHERE pilot_id=?').get(pilotId) as { current_streak?: number; longest_streak?: number; cycle_day?: number; last_claim_day?: string } | undefined;
    const cycleDay = boundedInteger(row?.cycle_day, 7);
    return { current: boundedInteger(row?.current_streak, 100_000), longest: boundedInteger(row?.longest_streak, 100_000), cycleDay, lastClaimDay: row?.last_claim_day, nextReward: dailyRewardCredits[cycleDay % 7] };
  }

  private records(pilotId: string): PlayerProfile['personalRecords'] {
    const rows = this.database.prepare('SELECT record_type,value,city_id,achieved_at FROM pilot_records WHERE pilot_id=?').all(pilotId) as Array<{ record_type: string; value: number; city_id?: CityId; achieved_at: number }>;
    return Object.fromEntries(rows.map(item => [item.record_type, { value: item.value, cityId: item.city_id, achievedAt: item.achieved_at }]));
  }

  private referralState(pilotId: string): PlayerProfile['referral'] {
    const row = this.database.prepare('SELECT status FROM pilot_referrals WHERE referred_pilot_id=?').get(pilotId) as { status?: PlayerProfile['referral']['status'] } | undefined;
    const now = Date.now();
    const totals = this.database.prepare(`SELECT COUNT(*) AS joined,
      SUM(CASE WHEN status='rewarded' THEN 1 ELSE 0 END) AS qualified,
      SUM(CASE WHEN inviter_rewarded_at IS NOT NULL THEN 1 ELSE 0 END) AS rewarded
      FROM pilot_referrals WHERE referrer_pilot_id=?`).get(pilotId) as { joined: number; qualified: number | null; rewarded: number | null };
    const rolling = this.database.prepare('SELECT COUNT(*) AS count,MIN(inviter_rewarded_at) AS oldest FROM pilot_referrals WHERE referrer_pilot_id=? AND inviter_rewarded_at>?')
      .get(pilotId, now - 30 * 86_400_000) as { count: number; oldest: number | null };
    const inviterRewardsInWindow = Math.min(10, rolling.count);
    return {
      code: this.referralCode(pilotId), status: row?.status ?? 'none',
      joinedCount: totals.joined, qualifiedCount: totals.qualified ?? 0, rewardedCount: totals.rewarded ?? 0,
      earnedCredits: (totals.rewarded ?? 0) * 750,
      inviterRewardsInWindow, inviterRewardsRemaining: Math.max(0, 10 - inviterRewardsInWindow),
      nextInviterRewardAt: inviterRewardsInWindow >= 10 && rolling.oldest ? rolling.oldest + 30 * 86_400_000 : undefined,
    };
  }

  private toProfile(row: ProfileRow): PlayerProfile {
    const credits = boundedInteger(row.credits, 1_000_000);
    const aircraftEntitlements = parseEntitlements(row.aircraft_entitlements);
    const fighterTrial = parseFighterTrial(row.fighter_trial);
    const permanentlyUnlocked = parseOwnedAircraft(row.owned_aircraft, aircraftEntitlements);
    const unlockedAircraft = usableAircraftForRow(row);
    const selectedAircraft = selectedOwnedAircraft(row.selected_aircraft, unlockedAircraft);
    const encodedOwnedAircraft = JSON.stringify(permanentlyUnlocked);
    if (row.owned_aircraft !== encodedOwnedAircraft || row.selected_aircraft !== selectedAircraft) {
      this.database.prepare('UPDATE player_profiles SET owned_aircraft = ?, selected_aircraft = ? WHERE pilot_id = ?')
        .run(encodedOwnedAircraft, selectedAircraft, row.pilot_id);
    }
    this.normalizeActiveCosmetics(row.pilot_id, permanentlyUnlocked);
    const objectives = this.objectiveStates(row);
    const mastery = parseMastery(row.mastery);
    this.ensurePilotProgression(row);
    return {
      pilotId: row.pilot_id,
      pilotName: profileName(row.pilot_name, 'Pilot'),
      credits,
      skyTokens: boundedInteger(row.sky_tokens, 1_000_000_000),
      creditRevision: boundedInteger(row.credit_revision, Number.MAX_SAFE_INTEGER),
      score: boundedInteger(row.score, 100_000_000),
      economyVersion: ECONOMY_VERSION,
      aircraftEntitlements,
      testerCodeEnabled: /^[a-f0-9]{64}$/i.test(process.env.REDSPEAR_TESTER_CODE_HASH ?? ''),
      fighterTrial,
      selectedAircraft,
      unlockedAircraft,
      totalDistance: boundedNumber(row.total_distance, 10_000_000),
      successfulLandings: boundedInteger(row.successful_landings, 100_000),
      kills: boundedInteger(row.kills, 1_000_000),
      deaths: boundedInteger(row.deaths, 1_000_000),
      discoveries: rowDiscoveries(row),
      challengeCompletions: boundedInteger(row.challenge_completions, 1_000_000),
      eventCompletions: boundedInteger(row.event_completions, 1_000_000),
      objectives,
      mastery,
      missions: parseMissionStates(row.missions),
      legacyImportPending: row.legacy_imported === 0,
      pilotProgress: this.pilotProgression(row.pilot_id),
      dailyStreak: this.streakState(row.pilot_id),
      dailyReward: this.dailyRewardState(row.pilot_id)!,
      personalRecords: this.records(row.pilot_id),
      weeklyReward: (() => {
        const reward = this.database.prepare('SELECT * FROM weekly_reward_claims WHERE pilot_id=? ORDER BY awarded_at DESC LIMIT 1').get(row.pilot_id) as { week_id: string; rank: number; category: string; credits: number; badge: string; badge_expires_at: number } | undefined;
        return reward ? { weekId: reward.week_id, rank: reward.rank, category: reward.category, credits: reward.credits, badge: reward.badge, badgeExpiresAt: reward.badge_expires_at } : undefined;
      })(),
      referral: this.referralState(row.pilot_id),
      cosmetics: {
        ownedIds: (this.database.prepare('SELECT cosmetic_id FROM pilot_cosmetics WHERE pilot_id=?').all(row.pilot_id) as Array<{ cosmetic_id: string }>).map(item => item.cosmetic_id).filter(id => cosmeticCatalog.some(item => item.id === id)),
        equipped: Object.fromEntries((this.database.prepare('SELECT category,cosmetic_id FROM pilot_equipped_cosmetics WHERE pilot_id=?').all(row.pilot_id) as Array<{ category: string; cosmetic_id: string }>).map(item => [item.category, item.cosmetic_id])),
      },
      season: this.seasonProgress(row.pilot_id, 'dallas'),
      intercityRoute: this.activeIntercityRoute(row.pilot_id),
      tutorial: (()=>{const state=this.database.prepare('SELECT version,status,completed_at FROM pilot_tutorial_state WHERE pilot_id=?').get(row.pilot_id) as {version?:string;status?:string;completed_at?:number}|undefined;const status=state?.status==='started'||state?.status==='completed'||state?.status==='skipped'?state.status:'new';return{version:'tutorial_v1' as const,status,completedAt:Number.isFinite(state?.completed_at)?state!.completed_at:undefined,dallasUnlocked:Number.isFinite(state?.completed_at)};})(),
};
  }

  private objectiveStates(row: ProfileRow): Partial<Record<CityId, ObjectiveCycleState>> {
    let parsed: unknown = {};
    try { parsed = JSON.parse(row.objectives); } catch { /* recover */ }
    const states: Partial<Record<CityId, ObjectiveCycleState>> = {};
    const discoveries = rowDiscoveries(row);
    for (const cityId of cityIds) states[cityId] = parseObjectives((parsed as Record<string, unknown>)[cityId], cityId, (discoveries[cityId] ?? []).length);
    return states;
  }
}
