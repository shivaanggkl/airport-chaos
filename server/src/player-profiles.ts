import { mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { capabilitiesForCity } from '../../shared/city-capabilities.mjs';
import { missionForCity } from '../../shared/city-missions.mjs';
import { ECONOMY_VERSION, REDSPEAR_TRIAL_DURATION_MS, aircraftCreditPrice, aircraftDisplayOrder, aircraftEntitlement } from '../../shared/aircraft-economy.mjs';
import { cargoCreditReward, economyRewards } from '../../shared/reward-economy.mjs';
import { isValidPilotNumber, pilotNumberForId } from '../../shared/pilot-number.mjs';
import { dailyPilotRewards, pilotLevelForXp, pilotTitleForLevel, pilotXpForLevel, utcDayDistance, utcDayId, weeklyRewardForRank } from '../../shared/pilot-progression.mjs';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type CityId = 'milwaukee' | 'dallas';

export type PlayerProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
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
  personalRecords: Record<string, { value: number; cityId?: CityId; achievedAt: number }>;
  weeklyReward?: { weekId: string; rank: number; category: string; credits: number; badge: string; badgeExpiresAt: number };
  referral: { code: string; status: 'none' | 'pending' | 'qualified' | 'rewarded'; rewardedCount: number };
};
export type FighterTrialState = { status: 'available' | 'pending' | 'active' | 'consumed'; startedAt?: number; expiresAt?: number; completedReportedAt?: number };

export type MissionAttempt = {
  missionId: string; attemptId: string; startedAt: number; updatedAt: number;
  progress: number; holdStartedAt?: number; flightStartedAt?: number;
  heading?: number; distanceMeters?: number; completedIds: string[];
  targetId?: string; eventId?: string; sequenceIndex?: number; ownedTerritoryIds?: string[];
  challengeEndsAt?: number;
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
    const active = attempt && missionForCity(cityId, attempt.missionId) && typeof attempt.attemptId === 'string' && /^[a-f0-9-]{36}$/i.test(attempt.attemptId)
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

function assignedPilotName(value: unknown, pilotId: string): string {
  const name = profileName(value, 'Pilot');
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
  const dailyPool = ['stunt', 'territoryCapture', 'event', 'discovery', 'kill', 'heat3', 'distance', 'landing'].filter((activity): activity is ObjectiveActivity => supported.has(activity as ObjectiveActivity));
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
  private lastReceiptPruneAt = 0;
  private lastReceiptPruneCount = 0;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.databasePath = filePath;
    this.database = new DatabaseSync(filePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        pilot_id TEXT PRIMARY KEY,
        pilot_name TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 0,
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
        qualified_action INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, qualified_at INTEGER, rewarded_at INTEGER
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
    this.pruneRewardReceipts();
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS profile_reward_receipts_pilot_created ON profile_reward_receipts (pilot_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS profile_reward_receipts_created ON profile_reward_receipts (created_at DESC);
    `);
    this.compactRewardReceiptsOnce(process.env.AIRPORT_CHAOS_PROFILE_DB_COMPACT_ONCE);
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

  getOrCreate(pilotId: string, pilotName: string): PlayerProfile {
    let row = this.getRow(pilotId);
    if (!row) {
      this.database.prepare('INSERT INTO player_profiles (pilot_id, pilot_name, credits, economy_version) VALUES (?, ?, ?, ?)')
        .run(pilotId, assignedPilotName(pilotName, pilotId), newPilotCredits, ECONOMY_VERSION);
      row = this.getRow(pilotId)!;
    } else {
      const assigned = assignedPilotName(row.pilot_name, pilotId);
      if (assigned !== row.pilot_name) {
        this.database.prepare('UPDATE player_profiles SET pilot_name = ? WHERE pilot_id = ?').run(assigned, pilotId);
        row = this.getRow(pilotId)!;
      }
    }
    this.ensurePilotProgression(row);
    return this.toProfile(row);
  }

  claimDailyStreak(pilotId: string, now = Date.now()): { profile: PlayerProfile; credits: number; claimed: boolean } | undefined {
    const row = this.getRow(pilotId); if (!row) return undefined;
    this.ensurePilotProgression(row);
    const state = this.database.prepare('SELECT * FROM pilot_progression WHERE pilot_id=?').get(pilotId) as { current_streak: number; longest_streak: number; cycle_day: number; last_claim_day?: string };
    const today = utcDayId(now);
    if (state.last_claim_day === today) return { profile: this.toProfile(row), credits: 0, claimed: false };
    const consecutive = state.last_claim_day && utcDayDistance(state.last_claim_day, today) === 1;
    const current = consecutive ? state.current_streak + 1 : 1;
    const cycleDay = consecutive ? state.cycle_day % 7 + 1 : 1;
    const credits = dailyPilotRewards[cycleDay - 1];
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE pilot_progression SET current_streak=?,longest_streak=MAX(longest_streak,?),cycle_day=?,last_claim_day=? WHERE pilot_id=?').run(current, current, cycleDay, today, pilotId);
      this.database.prepare('UPDATE player_profiles SET credits=MIN(1000000,credits+?) WHERE pilot_id=?').run(credits, pilotId);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return { profile: this.toProfile(this.getRow(pilotId)!), credits, claimed: true };
  }

  awardPilotXp(pilotId: string, amount: number): { profile: PlayerProfile; levelUp?: number; title?: string } | undefined {
    const row = this.getRow(pilotId); if (!row || !Number.isFinite(amount) || amount <= 0) return undefined;
    this.ensurePilotProgression(row);
    const before = this.pilotProgression(pilotId);
    this.database.prepare('UPDATE pilot_progression SET xp=MIN(100000000,xp+?) WHERE pilot_id=?').run(Math.floor(amount), pilotId);
    const after = this.pilotProgression(pilotId);
    return { profile: this.toProfile(this.getRow(pilotId)!), levelUp: after.level > before.level ? after.level : undefined, title: after.level > before.level ? after.title : undefined };
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
    const compact = createHash('sha256').update(`airport-chaos-ref:${pilotId}`).digest('base64url').slice(0, 8).toUpperCase();
    const code = `${compact.slice(0, 4)}-${compact.slice(4)}`;
    this.database.prepare('INSERT OR IGNORE INTO pilot_referral_codes(pilot_id,referral_code) VALUES(?,?)').run(pilotId, code);
    return (this.database.prepare('SELECT referral_code FROM pilot_referral_codes WHERE pilot_id=?').get(pilotId) as { referral_code: string }).referral_code;
  }

  registerNetworkIdentity(pilotId: string, networkId: string | undefined, now = Date.now()): void {
    if (!networkId || !/^[a-f0-9]{64}$/i.test(networkId)) return;
    this.database.prepare('INSERT INTO pilot_network_security VALUES(?,?,?) ON CONFLICT(pilot_id) DO UPDATE SET network_id=excluded.network_id,updated_at=excluded.updated_at').run(pilotId, networkId, now);
  }

  attachReferral(referredPilotId: string, code: unknown, networkId?: string, now = Date.now()): boolean {
    if (typeof code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) return false;
    const referrer = this.database.prepare('SELECT pilot_id FROM pilot_referral_codes WHERE referral_code=?').get(code.toUpperCase()) as { pilot_id?: string } | undefined;
    if (!referrer?.pilot_id || referrer.pilot_id === referredPilotId) return false;
    const profile = this.getRow(referredPilotId);
    if (!profile || profile.total_distance > 0 || profile.successful_landings > 0) return false;
    const referrerNetwork = this.database.prepare('SELECT network_id FROM pilot_network_security WHERE pilot_id=?').get(referrer.pilot_id) as { network_id?: string } | undefined;
    if (networkId && referrerNetwork?.network_id === networkId) return false;
    return this.database.prepare(`INSERT OR IGNORE INTO pilot_referrals(referred_pilot_id,referrer_pilot_id,status,referred_network_id,created_at) VALUES(?,?,'pending',?,?)`).run(referredPilotId, referrer.pilot_id, networkId ?? null, now).changes > 0;
  }

  advanceReferral(pilotId: string, gameplayMs: number, qualifiedAction: boolean, now = Date.now()): { rewarded: boolean; inviterId?: string; profile?: PlayerProfile } {
    const row = this.database.prepare('SELECT * FROM pilot_referrals WHERE referred_pilot_id=?').get(pilotId) as { referrer_pilot_id: string; status: string; gameplay_ms: number; qualified_action: number; created_at: number } | undefined;
    if (!row || row.status === 'rewarded') return { rewarded: false };
    const played = Math.min(86_400_000, row.gameplay_ms + Math.max(0, Math.floor(gameplayMs)));
    const action = row.qualified_action || qualifiedAction ? 1 : 0;
    this.database.prepare('UPDATE pilot_referrals SET gameplay_ms=?,qualified_action=? WHERE referred_pilot_id=?').run(played, action, pilotId);
    if (played < 1_200_000 || !action) return { rewarded: false };
    const recent = this.database.prepare("SELECT COUNT(*) AS count FROM pilot_referrals WHERE referrer_pilot_id=? AND rewarded_at>=?").get(row.referrer_pilot_id, now - 30 * 86_400_000) as { count: number };
    if (recent.count >= 10) return { rewarded: false };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const changed = this.database.prepare("UPDATE pilot_referrals SET status='rewarded',qualified_at=?,rewarded_at=? WHERE referred_pilot_id=? AND status!='rewarded'").run(now, now, pilotId).changes;
      if (!changed) { this.database.exec('ROLLBACK'); return { rewarded: false }; }
      this.database.prepare('UPDATE player_profiles SET credits=MIN(1000000,credits+500) WHERE pilot_id IN (?,?)').run(pilotId, row.referrer_pilot_id);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return { rewarded: true, inviterId: row.referrer_pilot_id, profile: this.toProfile(this.getRow(pilotId)!) };
  }

  awardPvpWin(challengeId: string, winnerId: string, opponentId: string, credits: number, now = Date.now()): { rewarded: boolean; profile?: PlayerProfile } {
    if (!/^[a-f0-9-]{36}$/i.test(challengeId) || winnerId === opponentId) return { rewarded: false };
    const pairSince = this.database.prepare('SELECT MAX(created_at) AS at FROM pvp_reward_wins WHERE rewarded=1 AND ((winner_pilot_id=? AND opponent_pilot_id=?) OR (winner_pilot_id=? AND opponent_pilot_id=?))').get(winnerId, opponentId, opponentId, winnerId) as { at?: number };
    const day = utcDayId(now);
    const daily = this.database.prepare("SELECT COUNT(*) AS count FROM pvp_reward_wins WHERE winner_pilot_id=? AND rewarded=1 AND created_at>=?").get(winnerId, Date.parse(`${day}T00:00:00.000Z`)) as { count: number };
    const rewarded = !(pairSince.at && now - pairSince.at < 30 * 60_000) && daily.count < 5;
    const inserted = this.database.prepare('INSERT OR IGNORE INTO pvp_reward_wins VALUES(?,?,?,?,?)').run(challengeId, winnerId, opponentId, rewarded ? 1 : 0, now).changes;
    if (!inserted) return { rewarded: false };
    if (rewarded) this.database.prepare('UPDATE player_profiles SET credits=MIN(1000000,credits+?) WHERE pilot_id=?').run(credits, winnerId);
    return { rewarded, profile: this.toProfile(this.getRow(winnerId)!) };
  }

  hasProfile(pilotId: string): boolean {
    return Boolean(this.getRow(pilotId));
  }

  importLegacy(pilotId: string, legacy: LegacyProfileImport): PlayerProfile {
    const row = this.getRow(pilotId);
    if (!row || row.legacy_imported) return row ? this.toProfile(row) : this.getOrCreate(pilotId, 'Pilot');
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
    this.database.prepare(`UPDATE player_profiles SET pilot_name = ?, credits = ?, selected_aircraft = ?, total_distance = ?, successful_landings = ?, discoveries = ?, legacy_imported = 1 WHERE pilot_id = ?`)
      .run(
        assignedPilotName(legacy.pilotName ?? row.pilot_name, pilotId), credits, selectedAircraft,
        boundedNumber(legacy.totalDistance, 10_000_000), boundedInteger(legacy.successfulLandings, 100_000), JSON.stringify(discoveries), pilotId,
      );
    return this.toProfile(this.getRow(pilotId)!);
  }

  setPilotName(pilotId: string, pilotName: string): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    // A cached browser-generated Pilot-### must not overwrite the server's
    // durable number on every reconnect.
    if (/^Pilot(?:-\d{3})?$/i.test(pilotName.trim())) return this.toProfile(row);
    this.database.prepare('UPDATE player_profiles SET pilot_name = ? WHERE pilot_id = ?').run(profileName(pilotName, row.pilot_name), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  updateProgress(pilotId: string, progress: ProfileProgress): PlayerProfile | undefined {
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
    this.database.prepare(`UPDATE player_profiles SET selected_aircraft = ?, total_distance = MAX(total_distance, ?), successful_landings = MAX(successful_landings, ?), discoveries = ?, credits = MIN(1000000, credits + ?) WHERE pilot_id = ?`)
      .run(currentAircraft, boundedNumber(progress.totalDistance, 10_000_000), boundedInteger(progress.successfulLandings, 100_000), JSON.stringify(mergedDiscoveries), newDiscoveries * economyRewards.discovery, pilotId);
    return this.toProfile(this.getRow(pilotId)!);
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
    if (price === undefined) return { ok: false, reason: aircraft === 'fighter' ? 'PREMIUM — PURCHASE COMING SOON' : 'NOT AVAILABLE FOR CREDITS' };
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const row = this.getRow(pilotId);
      if (!row) { this.database.exec('ROLLBACK'); return { ok: false, reason: 'PROFILE NOT FOUND' }; }
      const entitlements = parseEntitlements(row.aircraft_entitlements);
      const owned = parseOwnedAircraft(row.owned_aircraft, entitlements);
      if (owned.includes(aircraft)) { this.database.exec('COMMIT'); return { ok: true, profile: this.toProfile(row) }; }
      if (row.credits < price) { this.database.exec('ROLLBACK'); return { ok: false, reason: `NEED ${(price - row.credits).toLocaleString()} MORE CREDITS`, profile: this.toProfile(row) }; }
      owned.push(aircraft);
      this.database.prepare('UPDATE player_profiles SET credits = credits - ?, owned_aircraft = ? WHERE pilot_id = ? AND credits >= ?')
        .run(price, JSON.stringify(aircraftOrder.filter((type) => owned.includes(type))), pilotId, price);
      this.database.exec('COMMIT');
      return { ok: true, profile: this.toProfile(this.getRow(pilotId)!) };
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* transaction already closed */ }
      throw error;
    }
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
    const prior = this.database.prepare('SELECT MAX(created_at) AS created_at FROM profile_reward_receipts WHERE pilot_id = ? AND reward_id LIKE ?')
      .get(pilotId, 'contract:%') as { created_at?: number } | undefined;
    if (prior?.created_at && now - prior.created_at < economyRewards.contractClaimCooldownMs) return this.toProfile(row);
    const receipt = this.database.prepare('INSERT OR IGNORE INTO profile_reward_receipts (pilot_id, reward_id, created_at) VALUES (?, ?, ?)').run(pilotId, `contract:${source}:${rewardId}`, now);
    if (receipt.changes === 0) return this.toProfile(row);
    this.database.prepare('UPDATE player_profiles SET credits = MIN(1000000, credits + ?) WHERE pilot_id = ?').run(credits, pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  awardServerReward(pilotId: string, credits: number, stats?: Partial<Pick<PlayerProfile, 'kills' | 'deaths' | 'challengeCompletions' | 'eventCompletions'>>): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    this.database.prepare(`UPDATE player_profiles SET credits = MIN(1000000, credits + ?), kills = kills + ?, deaths = deaths + ?, challenge_completions = challenge_completions + ?, event_completions = event_completions + ? WHERE pilot_id = ?`)
      .run(
        boundedInteger(credits, 100_000), boundedInteger(stats?.kills, 1_000_000), boundedInteger(stats?.deaths, 1_000_000),
        boundedInteger(stats?.challengeCompletions, 1_000_000), boundedInteger(stats?.eventCompletions, 1_000_000), pilotId,
      );
    return this.toProfile(this.getRow(pilotId)!);
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
    const row = this.getRow(pilotId);
    if (!row || amount <= 0 || !Number.isFinite(amount)) return undefined;
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
    this.database.prepare('UPDATE player_profiles SET objectives = ?, credits = MIN(1000000, credits + ?) WHERE pilot_id = ?')
      .run(JSON.stringify(all), credits + bonusCredits, pilotId);
    return { profile: this.toProfile(this.getRow(pilotId)!), completed, bonusCredits };
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
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.database.prepare('INSERT OR IGNORE INTO weekly_reward_claims VALUES(?,?,?,?,?,?,?,?)').run(pilotId, previousWeek, best.rank, best.category, reward.credits, reward.badge, badgeExpiresAt, now).changes;
      if (inserted) this.database.prepare('UPDATE player_profiles SET credits=MIN(1000000,credits+?) WHERE pilot_id=?').run(reward.credits, pilotId);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return { weekId: previousWeek, rank: best.rank, category: best.category, credits: reward.credits, badge: reward.badge, badgeExpiresAt };
  }

  missionState(pilotId: string, cityId: CityId): MissionCityState | undefined {
    const row = this.getRow(pilotId);
    return row ? parseMissionStates(row.missions)[cityId] : undefined;
  }

  acceptMission(pilotId: string, cityId: CityId, missionId: string, replace: boolean, expectedAttemptId?: string, now = Date.now()): { ok: boolean; reason?: string; confirmationRequired?: boolean; profile?: PlayerProfile } {
    const row = this.getRow(pilotId);
    const mission = missionForCity(cityId, missionId);
    if (!row || !mission) return { ok: false, reason: 'MISSION UNAVAILABLE' };
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
    // Credits, attempt removal and replay cooldown commit in ONE SQLite row
    // update. A repeated completion cannot pay or advance Score again.
    this.database.prepare('UPDATE player_profiles SET missions = ?, credits = MIN(1000000, credits + ?) WHERE pilot_id = ?')
      .run(JSON.stringify(all), cargoReward.credits, pilotId);
    return { profile: this.toProfile(this.getRow(pilotId)!), credits: cargoReward.credits, score: mission.scoreReward, missionId: mission.id, cargoBonusCredits: cargoReward.bonusCredits };
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
    return { current: boundedInteger(row?.current_streak, 100_000), longest: boundedInteger(row?.longest_streak, 100_000), cycleDay, lastClaimDay: row?.last_claim_day, nextReward: dailyPilotRewards[cycleDay % 7] };
  }

  private records(pilotId: string): PlayerProfile['personalRecords'] {
    const rows = this.database.prepare('SELECT record_type,value,city_id,achieved_at FROM pilot_records WHERE pilot_id=?').all(pilotId) as Array<{ record_type: string; value: number; city_id?: CityId; achieved_at: number }>;
    return Object.fromEntries(rows.map(item => [item.record_type, { value: item.value, cityId: item.city_id, achievedAt: item.achieved_at }]));
  }

  private referralState(pilotId: string): PlayerProfile['referral'] {
    const row = this.database.prepare('SELECT status FROM pilot_referrals WHERE referred_pilot_id=?').get(pilotId) as { status?: PlayerProfile['referral']['status'] } | undefined;
    const count = this.database.prepare("SELECT COUNT(*) AS count FROM pilot_referrals WHERE referrer_pilot_id=? AND status='rewarded'").get(pilotId) as { count: number };
    return { code: this.referralCode(pilotId), status: row?.status ?? 'none', rewardedCount: count.count };
  }

  private toProfile(row: ProfileRow): PlayerProfile {
    const storedEconomyVersion = boundedInteger(row.economy_version, 1_000);
    if (storedEconomyVersion < ECONOMY_VERSION) {
      const entitlements = new Set(parseEntitlements(row.aircraft_entitlements));
      // Preserve both previously owned Fighters and the v1 tester entitlement
      // under the one canonical entitlement used by future purchases too.
      if (storedAircraftIncludes(row.owned_aircraft, 'fighter')) entitlements.add(aircraftEntitlement('fighter')!);
      const migratedCredits = storedEconomyVersion < 1 && row.credits >= legacyDevCreditThreshold
        ? migratedDevCredits
        : Math.max(0, row.credits);
      this.database.prepare('UPDATE player_profiles SET credits = ?, economy_version = ?, aircraft_entitlements = ? WHERE pilot_id = ?')
        .run(migratedCredits, ECONOMY_VERSION, JSON.stringify([...entitlements]), row.pilot_id);
      row = this.getRow(row.pilot_id)!;
    }
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
    const objectives = this.objectiveStates(row);
    const mastery = parseMastery(row.mastery);
    this.ensurePilotProgression(row);
    return {
      pilotId: row.pilot_id,
      pilotName: profileName(row.pilot_name, 'Pilot'),
      credits,
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
      personalRecords: this.records(row.pilot_id),
      weeklyReward: (() => {
        const reward = this.database.prepare('SELECT * FROM weekly_reward_claims WHERE pilot_id=? ORDER BY awarded_at DESC LIMIT 1').get(row.pilot_id) as { week_id: string; rank: number; category: string; credits: number; badge: string; badge_expires_at: number } | undefined;
        return reward ? { weekId: reward.week_id, rank: reward.rank, category: reward.category, credits: reward.credits, badge: reward.badge, badgeExpiresAt: reward.badge_expires_at } : undefined;
      })(),
      referral: this.referralState(row.pilot_id),
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
