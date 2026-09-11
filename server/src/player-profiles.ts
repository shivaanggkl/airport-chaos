import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { capabilitiesForCity } from '../../shared/city-capabilities.mjs';
import { ECONOMY_VERSION, aircraftCreditPrice, aircraftEntitlement } from '../../shared/aircraft-economy.mjs';
import { economyRewards } from '../../shared/reward-economy.mjs';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type CityId = 'milwaukee' | 'dallas';

export type PlayerProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
  economyVersion: number;
  aircraftEntitlements: string[];
  testerCodeEnabled: boolean;
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
  legacyImportPending: boolean;
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

const aircraftOrder: AircraftType[] = ['trainer', 'privateJet', 'cargo', 'fighter'];
const aircraftTypes = new Set<AircraftType>(aircraftOrder);
const newPilotCredits = boundedConfiguredInteger(process.env.AIRPORT_CHAOS_STARTING_CREDITS, 750, 10_000);
const migratedDevCredits = boundedConfiguredInteger(process.env.AIRPORT_CHAOS_MIGRATED_DEV_CREDITS, 1_000, 10_000);
const legacyDevCreditThreshold = boundedConfiguredInteger(process.env.AIRPORT_CHAOS_LEGACY_DEV_CREDIT_THRESHOLD, 100_000, 1_000_000);
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
};

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
      owned.add(type as AircraftType);
    }
  }
  for (const type of aircraftOrder) {
    const entitlement = aircraftEntitlement(type);
    if (entitlement && entitlements.includes(entitlement)) owned.add(type);
  }
  return aircraftOrder.filter((type) => owned.has(type));
}

function selectedOwnedAircraft(value: unknown, owned: readonly AircraftType[]): AircraftType {
  return typeof value === 'string' && owned.includes(value as AircraftType) ? value as AircraftType : 'trainer';
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

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
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
      );
      CREATE TABLE IF NOT EXISTS profile_reward_receipts (
        pilot_id TEXT NOT NULL,
        reward_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, reward_id)
      );
      CREATE TABLE IF NOT EXISTS weekly_leaderboard (
        city_id TEXT NOT NULL, week_id TEXT NOT NULL, category TEXT NOT NULL, pilot_id TEXT NOT NULL,
        pilot_name TEXT NOT NULL, value REAL NOT NULL DEFAULT 0, achieved_at INTEGER NOT NULL,
        PRIMARY KEY (city_id, week_id, category, pilot_id)
      );
    `);
    // Existing SQLite MVP profiles predate durable ownership. SQLite has no
    // portable ADD COLUMN IF NOT EXISTS, so tolerate the one expected error.
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN owned_aircraft TEXT NOT NULL DEFAULT '["trainer"]'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN objectives TEXT NOT NULL DEFAULT '{}'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN mastery TEXT NOT NULL DEFAULT '{}'`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN economy_version INTEGER NOT NULL DEFAULT 0`); } catch { /* already migrated */ }
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN aircraft_entitlements TEXT NOT NULL DEFAULT '[]'`); } catch { /* already migrated */ }
  }

  getOrCreate(pilotId: string, pilotName: string): PlayerProfile {
    let row = this.getRow(pilotId);
    if (!row) {
      this.database.prepare('INSERT INTO player_profiles (pilot_id, pilot_name, credits, economy_version) VALUES (?, ?, ?, ?)')
        .run(pilotId, profileName(pilotName, 'Pilot'), newPilotCredits, ECONOMY_VERSION);
      row = this.getRow(pilotId)!;
    }
    return this.toProfile(row);
  }

  importLegacy(pilotId: string, legacy: LegacyProfileImport): PlayerProfile {
    const row = this.getRow(pilotId);
    if (!row || row.legacy_imported) return row ? this.toProfile(row) : this.getOrCreate(pilotId, 'Pilot');
    const importedCredits = boundedInteger(legacy.credits, 1_000_000);
    const credits = importedCredits >= legacyDevCreditThreshold
      ? migratedDevCredits
      : Math.max(boundedInteger(row.credits, 1_000_000), importedCredits);
    const discoveries = parseDiscoveries(legacy.discoveries);
    const owned = parseOwnedAircraft(row.owned_aircraft, parseEntitlements(row.aircraft_entitlements));
    const selectedAircraft = selectedOwnedAircraft(legacy.selectedAircraft, owned);
    this.database.prepare(`UPDATE player_profiles SET pilot_name = ?, credits = ?, selected_aircraft = ?, total_distance = ?, successful_landings = ?, discoveries = ?, legacy_imported = 1 WHERE pilot_id = ?`)
      .run(
        profileName(legacy.pilotName, row.pilot_name), credits, selectedAircraft,
        boundedNumber(legacy.totalDistance, 10_000_000), boundedInteger(legacy.successfulLandings, 100_000), JSON.stringify(discoveries), pilotId,
      );
    return this.toProfile(this.getRow(pilotId)!);
  }

  setPilotName(pilotId: string, pilotName: string): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
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
    const currentAircraft = selectedOwnedAircraft(row.selected_aircraft, parseOwnedAircraft(row.owned_aircraft, parseEntitlements(row.aircraft_entitlements)));
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

  grantAircraftEntitlements(pilotId: string, requestedAircraft: readonly AircraftType[]): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row) return undefined;
    const entitlements = new Set(parseEntitlements(row.aircraft_entitlements));
    for (const aircraft of requestedAircraft) {
      const entitlement = aircraftEntitlement(aircraft);
      if (entitlement) entitlements.add(entitlement);
    }
    this.database.prepare('UPDATE player_profiles SET aircraft_entitlements = ? WHERE pilot_id = ?')
      .run(JSON.stringify([...entitlements]), pilotId);
    return this.toProfile(this.getRow(pilotId)!);
  }

  applyClientReward(pilotId: string, rewardId: string, source: unknown): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row || !/^[a-zA-Z0-9_-]{8,96}$/.test(rewardId) || typeof source !== 'string' || !(source in economyRewards.contractCredits)) return undefined;
    const credits = economyRewards.contractCredits[source as keyof typeof economyRewards.contractCredits];
    const now = Date.now();
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

  private getRow(pilotId: string): ProfileRow | undefined {
    return this.database.prepare('SELECT * FROM player_profiles WHERE pilot_id = ?').get(pilotId) as ProfileRow | undefined;
  }

  private toProfile(row: ProfileRow): PlayerProfile {
    const storedEconomyVersion = boundedInteger(row.economy_version, 1_000);
    if (storedEconomyVersion < ECONOMY_VERSION) {
      const owned = parseOwnedAircraft(row.owned_aircraft);
      const entitlements = new Set(parseEntitlements(row.aircraft_entitlements));
      // Preserve both previously owned Fighters and the v1 tester entitlement
      // under the one canonical entitlement used by future purchases too.
      if (owned.includes('fighter')) entitlements.add(aircraftEntitlement('fighter')!);
      const migratedCredits = storedEconomyVersion < 1 && row.credits >= legacyDevCreditThreshold
        ? migratedDevCredits
        : Math.max(0, row.credits);
      this.database.prepare('UPDATE player_profiles SET credits = ?, economy_version = ?, aircraft_entitlements = ? WHERE pilot_id = ?')
        .run(migratedCredits, ECONOMY_VERSION, JSON.stringify([...entitlements]), row.pilot_id);
      row = this.getRow(row.pilot_id)!;
    }
    const credits = boundedInteger(row.credits, 1_000_000);
    const aircraftEntitlements = parseEntitlements(row.aircraft_entitlements);
    const unlockedAircraft = parseOwnedAircraft(row.owned_aircraft, aircraftEntitlements);
    const selectedAircraft = selectedOwnedAircraft(row.selected_aircraft, unlockedAircraft);
    const encodedOwnedAircraft = JSON.stringify(unlockedAircraft);
    if (row.owned_aircraft !== encodedOwnedAircraft || row.selected_aircraft !== selectedAircraft) {
      this.database.prepare('UPDATE player_profiles SET owned_aircraft = ?, selected_aircraft = ? WHERE pilot_id = ?')
        .run(encodedOwnedAircraft, selectedAircraft, row.pilot_id);
    }
    const objectives = this.objectiveStates(row);
    const mastery = parseMastery(row.mastery);
    return {
      pilotId: row.pilot_id,
      pilotName: profileName(row.pilot_name, 'Pilot'),
      credits,
      economyVersion: ECONOMY_VERSION,
      aircraftEntitlements,
      testerCodeEnabled: /^[a-f0-9]{64}$/i.test(process.env.REDSPEAR_TESTER_CODE_HASH ?? ''),
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
      legacyImportPending: row.legacy_imported === 0,
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
