import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';

export type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type CityId = 'milwaukee' | 'dallas';

export type PlayerProfile = {
  pilotId: string;
  pilotName: string;
  credits: number;
  selectedAircraft: AircraftType;
  unlockedAircraft: AircraftType[];
  totalDistance: number;
  successfulLandings: number;
  kills: number;
  deaths: number;
  discoveries: Partial<Record<CityId, string[]>>;
  challengeCompletions: number;
  eventCompletions: number;
  legacyImportPending: boolean;
};

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

const aircraftUnlocks: Record<AircraftType, number> = {
  trainer: 0,
  privateJet: 500,
  cargo: 1000,
  fighter: 2000,
};
const aircraftTypes = new Set<AircraftType>(Object.keys(aircraftUnlocks) as AircraftType[]);
const cityIds = new Set<CityId>(['milwaukee', 'dallas']);

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
};

function boundedInteger(value: unknown, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(maximum, Math.floor(value)) : 0;
}

function boundedNumber(value: unknown, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(maximum, value) : 0;
}

function profileName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 20) : fallback;
}

function profileAircraft(value: unknown, credits: number): AircraftType {
  return typeof value === 'string' && aircraftTypes.has(value as AircraftType) && aircraftUnlocks[value as AircraftType] <= credits
    ? value as AircraftType
    : 'trainer';
}

function parseOwnedAircraft(value: unknown, credits: number): AircraftType[] {
  let stored: unknown;
  try { stored = typeof value === 'string' ? JSON.parse(value) : value; } catch { stored = []; }
  const owned = new Set<AircraftType>(['trainer']);
  if (Array.isArray(stored)) {
    for (const type of stored) {
      if (typeof type !== 'string' || !aircraftTypes.has(type as AircraftType)) continue;
      const aircraft = type as AircraftType;
      if (aircraftUnlocks[aircraft] <= credits) owned.add(aircraft);
    }
  }
  // Credits are the existing progression rule. Reconcile them into durable
  // ownership every time a profile is read, including old migrated rows.
  for (const type of aircraftTypes) if (aircraftUnlocks[type] <= credits) owned.add(type);
  return (Object.keys(aircraftUnlocks) as AircraftType[]).filter((type) => owned.has(type));
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
        owned_aircraft TEXT NOT NULL DEFAULT '["trainer"]'
      );
      CREATE TABLE IF NOT EXISTS profile_reward_receipts (
        pilot_id TEXT NOT NULL,
        reward_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, reward_id)
      );
    `);
    // Existing SQLite MVP profiles predate durable ownership. SQLite has no
    // portable ADD COLUMN IF NOT EXISTS, so tolerate the one expected error.
    try { this.database.exec(`ALTER TABLE player_profiles ADD COLUMN owned_aircraft TEXT NOT NULL DEFAULT '["trainer"]'`); } catch { /* already migrated */ }
  }

  getOrCreate(pilotId: string, pilotName: string): PlayerProfile {
    let row = this.getRow(pilotId);
    if (!row) {
      this.database.prepare('INSERT INTO player_profiles (pilot_id, pilot_name) VALUES (?, ?)').run(pilotId, profileName(pilotName, 'Pilot'));
      row = this.getRow(pilotId)!;
    }
    return this.toProfile(row);
  }

  importLegacy(pilotId: string, legacy: LegacyProfileImport): PlayerProfile {
    const row = this.getRow(pilotId);
    if (!row || row.legacy_imported) return row ? this.toProfile(row) : this.getOrCreate(pilotId, 'Pilot');
    const credits = Math.max(boundedInteger(row.credits, 1_000_000), boundedInteger(legacy.credits, 10_000));
    const discoveries = parseDiscoveries(legacy.discoveries);
    const selectedAircraft = profileAircraft(legacy.selectedAircraft, credits);
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
    const credits = Math.max(0, row.credits);
    const discoveries = parseDiscoveries(progress.discoveries);
    const mergedDiscoveries = rowDiscoveries(row);
    for (const cityId of cityIds) mergedDiscoveries[cityId] = [...new Set([...(mergedDiscoveries[cityId] ?? []), ...(discoveries[cityId] ?? [])])].slice(0, 512);
    const currentAircraft = selectedOwnedAircraft(row.selected_aircraft, parseOwnedAircraft(row.owned_aircraft, credits));
    this.database.prepare(`UPDATE player_profiles SET selected_aircraft = ?, total_distance = MAX(total_distance, ?), successful_landings = MAX(successful_landings, ?), discoveries = ? WHERE pilot_id = ?`)
      .run(currentAircraft, boundedNumber(progress.totalDistance, 10_000_000), boundedInteger(progress.successfulLandings, 100_000), JSON.stringify(mergedDiscoveries), pilotId);
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

  applyClientReward(pilotId: string, rewardId: string, credits: number): PlayerProfile | undefined {
    const row = this.getRow(pilotId);
    if (!row || !/^[a-zA-Z0-9_-]{8,96}$/.test(rewardId) || !Number.isInteger(credits) || credits < 1 || credits > 500) return undefined;
    const receipt = this.database.prepare('INSERT OR IGNORE INTO profile_reward_receipts (pilot_id, reward_id, created_at) VALUES (?, ?, ?)').run(pilotId, rewardId, Date.now());
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

  private getRow(pilotId: string): ProfileRow | undefined {
    return this.database.prepare('SELECT * FROM player_profiles WHERE pilot_id = ?').get(pilotId) as ProfileRow | undefined;
  }

  private toProfile(row: ProfileRow): PlayerProfile {
    const credits = boundedInteger(row.credits, 1_000_000);
    const unlockedAircraft = parseOwnedAircraft(row.owned_aircraft, credits);
    const selectedAircraft = selectedOwnedAircraft(row.selected_aircraft, unlockedAircraft);
    const encodedOwnedAircraft = JSON.stringify(unlockedAircraft);
    if (row.owned_aircraft !== encodedOwnedAircraft || row.selected_aircraft !== selectedAircraft) {
      this.database.prepare('UPDATE player_profiles SET owned_aircraft = ?, selected_aircraft = ? WHERE pilot_id = ?')
        .run(encodedOwnedAircraft, selectedAircraft, row.pilot_id);
    }
    return {
      pilotId: row.pilot_id,
      pilotName: profileName(row.pilot_name, 'Pilot'),
      credits,
      selectedAircraft,
      unlockedAircraft,
      totalDistance: boundedNumber(row.total_distance, 10_000_000),
      successfulLandings: boundedInteger(row.successful_landings, 100_000),
      kills: boundedInteger(row.kills, 1_000_000),
      deaths: boundedInteger(row.deaths, 1_000_000),
      discoveries: rowDiscoveries(row),
      challengeCompletions: boundedInteger(row.challenge_completions, 1_000_000),
      eventCompletions: boundedInteger(row.event_completions, 1_000_000),
      legacyImportPending: row.legacy_imported === 0,
    };
  }
}
