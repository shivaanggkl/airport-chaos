import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24, journeyPauseLimitMs } from '../../shared/journey-mission.mjs';
import { projectileDamageForAircraft } from '../../shared/protocol.mjs';
import { landingGradeForScore, type LandingGrade } from '../../shared/landing-scoring.mjs';
import { isPerfectLandingGrade } from '../../shared/gameplay-cinematic-rules.mjs';
import { PlayerWallet } from './player-wallet.js';

export type JourneyAttemptStatus = 'READY' | 'APPROACH' | 'RACING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
export const JOURNEY_PAUSE_LIMIT_MS = journeyPauseLimitMs;
export type JourneyAttempt = {
  attemptId: string; pilotId: string; missionId: string; cityId: string; aircraftType: string;
  targetId: string | null; secondaryTargetId: string | null;
  status: JourneyAttemptStatus; gateIndex: number; createdAt: number; startedAt: number | null;
  lakeGateIndex: number;
  ascentGateIndex: number;
  slalomGateIndex: number;
  needleGateIndex: number;
  goldenChampionshipGateIndex: number;
  prepareUntil: number | null;
  deadlineAt: number | null; lastGateAt: number | null; finishedAt: number | null;
  pausedAt: number | null;
  finishTimeMs: number | null; firstClearCredits: number; failureReason: string | null;
  holdMs: number; holdUpdatedAt: number | null;
  captureMs: number;
  phase?: 'PREPARING' | 'APPROACH_GATES' | 'RACING' | 'REPAIR' | 'LANDING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
  landingGrade: LandingGrade | null;
  landingScore: number | null;
  approachCycle: number;
  doublePhase: 'TAKEOFF' | 'FIRST_FIGHT' | 'REPAIR' | 'FINAL_FIGHT' | null;
  legendaryPhase: 'GATES' | 'ACE' | 'LANDING' | null;
  heartPosition: { x: number; y: number; z: number } | null;
  monsterHealth: number | null;
  monsterDefeatedAt: number | null;
  repairCollectedAt: number | null;
};

type AttemptRow = {
  attempt_id: string; pilot_id: string; mission_id: string; city_id: string; aircraft_type: string;
  target_id: string | null; secondary_target_id: string | null;
  status: JourneyAttemptStatus; gate_index: number; created_at: number; started_at: number | null;
  prepare_until: number | null;
  deadline_at: number | null; last_gate_at: number | null; finished_at: number | null;
  paused_at: number | null;
  finish_time_ms: number | null; first_clear_credits: number; failure_reason: string | null;
  hold_ms: number; hold_updated_at: number | null;
  capture_ms: number;
  championship_gate_index: number; rookie_gate_index: number; landing_grade: LandingGrade | null;
  lake_gate_index: number;
  ascent_gate_index: number;
  slalom_gate_index: number;
  needle_gate_index: number;
  golden_championship_gate_index: number;
  landing_score: number | null; repair_collected_at: number | null;
  approach_cycle: number;
  double_phase: JourneyAttempt['doublePhase']; heart_x: number | null; heart_y: number | null; heart_z: number | null;
  legendary_phase: JourneyAttempt['legendaryPhase'];
  monster_health: number | null; monster_defeated_at: number | null;
};

function attempt(row: AttemptRow): JourneyAttempt {
  return {
    attemptId: row.attempt_id, pilotId: row.pilot_id, missionId: row.mission_id,
    cityId: row.city_id, aircraftType: row.aircraft_type, targetId: row.target_id, secondaryTargetId: row.secondary_target_id, status: row.status,
    gateIndex: row.mission_id === journeyDallas01.id ? row.rookie_gate_index : row.mission_id === journeyDallas02.id ? Math.max(0, row.lake_gate_index) : row.mission_id === journeyDallas03.id ? Math.max(0, row.ascent_gate_index) : row.mission_id === journeyDallas04.id ? Math.max(0, row.slalom_gate_index) : row.mission_id === journeyDallas05.id ? Math.max(0, row.needle_gate_index) : row.mission_id === journeyDallas06.id ? Math.max(0, row.golden_championship_gate_index) : row.mission_id === journeyDallas10.id || row.mission_id === journeyDallas10.id || row.mission_id === journeyDallas11.id || row.mission_id === journeyDallas12.id || row.mission_id === journeyDallas13.id || row.mission_id === journeyDallas16.id || row.mission_id === journeyDallas20.id || row.mission_id === journeyDallas22.id || row.mission_id === journeyDallas24.id ? row.championship_gate_index : row.gate_index,
    lakeGateIndex: row.lake_gate_index,
    ascentGateIndex: row.ascent_gate_index,
    slalomGateIndex: row.slalom_gate_index,
    needleGateIndex: row.needle_gate_index,
    goldenChampionshipGateIndex: row.golden_championship_gate_index,
    ...(row.mission_id === journeyDallas06.id ? { phase: row.status === 'READY' ? 'PREPARING'
      : row.status === 'APPROACH' ? 'APPROACH_GATES' : row.status } : {}),
    ...(row.mission_id === journeyDallas17.id ? { phase: row.status === 'READY' || row.status === 'APPROACH' ? 'REPAIR'
      : row.status === 'RACING' ? 'LANDING' : row.status } : {}),
    ...(row.mission_id === journeyDallas22.id ? { phase: row.status === 'READY' || row.status === 'APPROACH' && row.prepare_until !== null && (row.paused_at ?? Date.now()) < row.prepare_until ? 'PREPARING'
      : row.status === 'APPROACH' ? 'APPROACH_GATES' : row.status === 'RACING' && row.championship_gate_index === 3 ? 'LANDING'
      : row.status === 'RACING' ? 'APPROACH_GATES' : row.status } : {}),
    createdAt: row.created_at, startedAt: row.started_at, prepareUntil: row.prepare_until,
    deadlineAt: row.deadline_at, lastGateAt: row.last_gate_at, finishedAt: row.finished_at,
    pausedAt: row.paused_at,
    finishTimeMs: row.finish_time_ms, firstClearCredits: row.first_clear_credits,
    failureReason: row.failure_reason,
    holdMs: row.hold_ms, holdUpdatedAt: row.hold_updated_at,
    captureMs: row.capture_ms,
    landingGrade: row.landing_grade,
    landingScore: row.landing_score, repairCollectedAt: row.repair_collected_at,
    approachCycle: row.approach_cycle,
    doublePhase: row.double_phase,
    legendaryPhase: row.legendary_phase,
    monsterHealth: row.monster_health, monsterDefeatedAt: row.monster_defeated_at,
    heartPosition: row.heart_x === null || row.heart_y === null || row.heart_z === null ? null
      : { x: row.heart_x, y: row.heart_y, z: row.heart_z },
  };
}

export class JourneyAttemptStore {
  private readonly database: DatabaseSync;
  private readonly wallet: PlayerWallet;
  private readonly allowAllMissionsForQa: boolean;

  constructor(filePath: string, allowAllMissionsForQa = false) {
    this.allowAllMissionsForQa = allowAllMissionsForQa;
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.wallet = new PlayerWallet(this.database);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS journey_attempts (
        attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL,
        city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL, target_id TEXT, secondary_target_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('READY','APPROACH','RACING','COMPLETED','FAILED','ABANDONED')),
        gate_index INTEGER NOT NULL DEFAULT 0 CHECK(gate_index BETWEEN 0 AND 4),
        created_at INTEGER NOT NULL, started_at INTEGER, deadline_at INTEGER,
        last_gate_at INTEGER, finished_at INTEGER, finish_time_ms INTEGER,
        first_clear_credits INTEGER NOT NULL DEFAULT 0, failure_reason TEXT,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS journey_one_active_attempt ON journey_attempts(pilot_id)
        WHERE status IN ('READY','APPROACH','RACING');
      CREATE INDEX IF NOT EXISTS journey_attempts_pilot_created ON journey_attempts(pilot_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS journey_completions (
        pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL, first_attempt_id TEXT NOT NULL,
        completed_at INTEGER NOT NULL, best_time_ms INTEGER NOT NULL, clear_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(pilot_id, mission_id),
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
    `);
    const columns = this.database.prepare('PRAGMA table_info(journey_attempts)').all() as { name: string }[];
    if (!columns.some(column => column.name === 'target_id')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN target_id TEXT');
    if (!columns.some(column => column.name === 'secondary_target_id')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN secondary_target_id TEXT');
    if (!columns.some(column => column.name === 'hold_ms')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN hold_ms INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(column => column.name === 'hold_updated_at')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN hold_updated_at INTEGER');
    // Existing gate_index has a 0..4 CHECK; keep it intact for Missions 1–5.
    if (!columns.some(column => column.name === 'championship_gate_index')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN championship_gate_index INTEGER NOT NULL DEFAULT 0 CHECK(championship_gate_index BETWEEN 0 AND 6)');
    // Additive column keeps the original 0..4 progress constraint and all
    // historical attempts/completions intact while Mission 1 grows to ten gates.
    if (!columns.some(column => column.name === 'rookie_gate_index')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN rookie_gate_index INTEGER NOT NULL DEFAULT 0 CHECK(rookie_gate_index BETWEEN 0 AND 10)');
      this.database.prepare('UPDATE journey_attempts SET rookie_gate_index = gate_index WHERE mission_id = ?')
        .run(journeyDallas01.id);
    }
    // -1 marks historical Hunter Showdown attempts; new Lake Racer attempts
    // start at zero. Historical completions remain authoritative for rewards.
    if (!columns.some(column => column.name === 'lake_gate_index'))
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN lake_gate_index INTEGER NOT NULL DEFAULT -1 CHECK(lake_gate_index BETWEEN -1 AND 10)');
    // Historical White Rock Skimmer attempts retain their four-gate records.
    if (!columns.some(column => column.name === 'ascent_gate_index')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN ascent_gate_index INTEGER NOT NULL DEFAULT -1 CHECK(ascent_gate_index BETWEEN -1 AND 10)');
      // An in-flight Skimmer attempt cannot validly resume on the new course.
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(journeyDallas03.id);
    }
    // -1 separates historical Claim the Skies records from the new race.
    if (!columns.some(column => column.name === 'slalom_gate_index')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN slalom_gate_index INTEGER NOT NULL DEFAULT -1 CHECK(slalom_gate_index BETWEEN -1 AND 10)');
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(journeyDallas04.id);
    }
    // Preserve four-gate Downtown Needle results and first-clear eligibility.
    if (!columns.some(column => column.name === 'needle_gate_index')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN needle_gate_index INTEGER NOT NULL DEFAULT -1 CHECK(needle_gate_index BETWEEN -1 AND 10)');
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(journeyDallas05.id);
    }
    if (!columns.some(column => column.name === 'golden_championship_gate_index')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN golden_championship_gate_index INTEGER NOT NULL DEFAULT -1 CHECK(golden_championship_gate_index BETWEEN -1 AND 10)');
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(journeyDallas06.id);
    }
    if (!columns.some(column => column.name === 'landing_grade')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN landing_grade TEXT');
    if (!columns.some(column => column.name === 'prepare_until')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN prepare_until INTEGER');
    if (!columns.some(column => column.name === 'repair_collected_at')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN repair_collected_at INTEGER');
    if (!columns.some(column => column.name === 'landing_score')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN landing_score INTEGER');
    if (!columns.some(column => column.name === 'capture_ms')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN capture_ms INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(column => column.name === 'paused_at')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN paused_at INTEGER');
    this.database.exec("CREATE INDEX IF NOT EXISTS journey_paused_attempts ON journey_attempts(paused_at) WHERE paused_at IS NOT NULL AND status IN ('READY','APPROACH','RACING')");
    if (!columns.some(column => column.name === 'approach_cycle')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN approach_cycle INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(column => column.name === 'double_phase')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN double_phase TEXT');
    if (!columns.some(column => column.name === 'legendary_phase')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN legendary_phase TEXT');
    if (!columns.some(column => column.name === 'monster_health')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN monster_health INTEGER');
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN monster_defeated_at INTEGER');
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(journeyDallas19.id);
    }
    for (const axis of ['x', 'y', 'z']) if (!columns.some(column => column.name === `heart_${axis}`))
      this.database.exec(`ALTER TABLE journey_attempts ADD COLUMN heart_${axis} REAL`);
  }

  get(pilotId: string, attemptId: string): JourneyAttempt | undefined {
    const row = this.database.prepare('SELECT * FROM journey_attempts WHERE pilot_id = ? AND attempt_id = ?')
      .get(pilotId, attemptId) as AttemptRow | undefined;
    return row ? attempt(row) : undefined;
  }

  pause(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET paused_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING') AND paused_at IS NULL`)
      .run(now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }

  expirePaused(now = Date.now()): JourneyAttempt[] {
    const rows = this.database.prepare(`UPDATE journey_attempts
      SET status = 'FAILED', failure_reason = 'PAUSE_EXPIRED', finished_at = ?, paused_at = NULL
      WHERE paused_at IS NOT NULL AND paused_at <= ? AND status IN ('READY','APPROACH','RACING')
      RETURNING *`).all(now, now - JOURNEY_PAUSE_LIMIT_MS) as AttemptRow[];
    return rows.map(attempt);
  }

  resume(pilotId: string, attemptId: string, now = Date.now()): { attempt: JourneyAttempt; pausedMs: number } | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || current.pausedAt === null || !['READY', 'APPROACH', 'RACING'].includes(current.status)) return undefined;
    const pausedMs = Math.max(0, now - current.pausedAt);
    if (pausedMs >= JOURNEY_PAUSE_LIMIT_MS) {
      this.fail(pilotId, attemptId, 'PAUSE_EXPIRED', now);
      return undefined;
    }
    this.database.prepare(`UPDATE journey_attempts SET paused_at = NULL,
      created_at = created_at + ?, started_at = started_at + ?, deadline_at = deadline_at + ?,
      prepare_until = prepare_until + ?, last_gate_at = last_gate_at + ?,
      hold_updated_at = hold_updated_at + ?, repair_collected_at = repair_collected_at + ?,
      monster_defeated_at = monster_defeated_at + ?
      WHERE pilot_id = ? AND attempt_id = ? AND paused_at = ?`)
      .run(pausedMs, pausedMs, pausedMs, pausedMs, pausedMs, pausedMs, pausedMs, pausedMs,
        pilotId, attemptId, current.pausedAt);
    const attempt = this.get(pilotId, attemptId);
    return attempt ? { attempt, pausedMs } : undefined;
  }

  progress(pilotId: string, missionId: string = journeyDallas01.id): { completed: boolean; firstAttemptId?: string; bestTimeMs?: number } {
    const row = this.database.prepare('SELECT first_attempt_id, best_time_ms FROM journey_completions WHERE pilot_id = ? AND mission_id = ?')
      .get(pilotId, missionId) as { first_attempt_id: string; best_time_ms: number } | undefined;
    if (!row) return { completed: false };
    const bestTimeMs = missionId === journeyDallas02.id ? this.lakeRacerBestTime(pilotId)
      : missionId === journeyDallas03.id ? this.goldenAscentBestTime(pilotId)
      : missionId === journeyDallas04.id ? this.downtownSlalomBestTime(pilotId)
      : missionId === journeyDallas05.id ? this.needleRushBestTime(pilotId)
      : missionId === journeyDallas06.id ? this.goldenChampionshipBestTime(pilotId)
      : missionId === journeyDallas07.id ? this.giantIncomingBestTime(pilotId)
      : missionId === journeyDallas19.id ? this.monsterArrivalBestTime(pilotId) : row.best_time_ms;
    return { completed: true, firstAttemptId: row.first_attempt_id, ...(bestTimeMs === undefined ? {} : { bestTimeMs }) };
  }

  chapterOneComplete(pilotId: string): boolean {
    return [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06]
      .every(mission => this.progress(pilotId, mission.id).completed);
  }

  /** Keep four-gate historical records while comparing only ten-gate race times. */
  rookieRushBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND rookie_gate_index = 10`)
      .get(pilotId, journeyDallas01.id) as { best: number | null };
    return row.best ?? undefined;
  }

  lakeRacerBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND lake_gate_index = 10`)
      .get(pilotId, journeyDallas02.id) as { best: number | null };
    return row.best ?? undefined;
  }

  goldenAscentBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND ascent_gate_index = 10`)
      .get(pilotId, journeyDallas03.id) as { best: number | null };
    return row.best ?? undefined;
  }

  downtownSlalomBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND slalom_gate_index = 10`)
      .get(pilotId, journeyDallas04.id) as { best: number | null };
    return row.best ?? undefined;
  }

  needleRushBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND needle_gate_index = 10`)
      .get(pilotId, journeyDallas05.id) as { best: number | null };
    return row.best ?? undefined;
  }

  goldenChampionshipBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND golden_championship_gate_index = 10`)
      .get(pilotId, journeyDallas06.id) as { best: number | null };
    return row.best ?? undefined;
  }

  giantIncomingBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best_time_ms FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND monster_defeated_at IS NOT NULL`)
      .get(pilotId, journeyDallas07.id) as { best_time_ms: number | null };
    return row.best_time_ms ?? undefined;
  }

  monsterArrivalBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND monster_defeated_at IS NOT NULL`)
      .get(pilotId, journeyDallas19.id) as { best: number | null };
    return row.best ?? undefined;
  }

  launch(pilotId: string, aircraftType: string, now = Date.now(), missionId: string = journeyDallas01.id): JourneyAttempt {
    if (missionId !== journeyDallas01.id && missionId !== journeyDallas02.id && missionId !== journeyDallas03.id && missionId !== journeyDallas04.id && missionId !== journeyDallas05.id && missionId !== journeyDallas06.id && missionId !== journeyDallas07.id && missionId !== journeyDallas08.id && missionId !== journeyDallas09.id && missionId !== journeyDallas10.id && missionId !== journeyDallas11.id && missionId !== journeyDallas12.id && missionId !== journeyDallas13.id && missionId !== journeyDallas14.id && missionId !== journeyDallas15.id && missionId !== journeyDallas16.id && missionId !== journeyDallas17.id && missionId !== journeyDallas18.id && missionId !== journeyDallas19.id && missionId !== journeyDallas20.id && missionId !== journeyDallas21.id && missionId !== journeyDallas22.id && missionId !== journeyDallas23.id && missionId !== journeyDallas24.id) throw new Error('Unknown Journey mission');
    if (!this.allowAllMissionsForQa) {
      if (missionId === journeyDallas02.id && !this.progress(pilotId).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas03.id && !this.progress(pilotId, journeyDallas02.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas04.id && !this.progress(pilotId, journeyDallas03.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas05.id && !this.progress(pilotId, journeyDallas04.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas06.id && !this.progress(pilotId, journeyDallas05.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas07.id && !this.progress(pilotId, journeyDallas06.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas08.id && !this.progress(pilotId, journeyDallas07.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas09.id && !this.progress(pilotId, journeyDallas08.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas10.id && !this.progress(pilotId, journeyDallas09.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas11.id && !this.progress(pilotId, journeyDallas10.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas12.id && !this.progress(pilotId, journeyDallas11.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas13.id && !this.progress(pilotId, journeyDallas12.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas14.id && !this.progress(pilotId, journeyDallas13.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas15.id && !this.progress(pilotId, journeyDallas14.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas16.id && !this.progress(pilotId, journeyDallas15.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas17.id && !this.progress(pilotId, journeyDallas16.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas18.id && !this.progress(pilotId, journeyDallas17.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas19.id && !this.progress(pilotId, journeyDallas18.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas20.id && !this.progress(pilotId, journeyDallas19.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas21.id && !this.progress(pilotId, journeyDallas20.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas22.id && !this.progress(pilotId, journeyDallas21.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas23.id && !this.progress(pilotId, journeyDallas22.id).completed) throw new Error('Journey mission is locked');
      if (missionId === journeyDallas24.id && !this.progress(pilotId, journeyDallas23.id).completed) throw new Error('Journey mission is locked');
    }
    return this.wallet.transaction(() => {
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', finished_at = ?, failure_reason = 'REPLACED' WHERE pilot_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(now, pilotId);
      const attemptId = randomUUID();
      this.database.prepare("INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,target_id,secondary_target_id,status,created_at,double_phase,legendary_phase,lake_gate_index,ascent_gate_index,slalom_gate_index,needle_gate_index,golden_championship_gate_index) VALUES (?,?,?,?,?,?,?,'READY',?,?,?,?,?,?,?,?)")
        .run(attemptId, pilotId, missionId, journeyDallas01.cityId, aircraftType,
          missionId === journeyDallas21.id ? journeyDallas21.alphaTerritoryId : null,
          missionId === journeyDallas21.id ? journeyDallas21.bravoTerritoryId : null, now,
          missionId === journeyDallas23.id ? 'TAKEOFF' : null,
          missionId === journeyDallas24.id ? 'GATES' : null,
          missionId === journeyDallas02.id ? 0 : -1,
          missionId === journeyDallas03.id ? 0 : -1,
          missionId === journeyDallas04.id ? 0 : -1,
          missionId === journeyDallas05.id ? 0 : -1,
          missionId === journeyDallas06.id ? 0 : -1);
      if (missionId === journeyDallas19.id || missionId === journeyDallas07.id) this.database.prepare('UPDATE journey_attempts SET monster_health = ? WHERE attempt_id = ?')
        .run(missionId === journeyDallas07.id ? journeyDallas07.bossHealth : journeyDallas19.bossHealth, attemptId);
      return this.get(pilotId, attemptId)!;
    });
  }

  approach(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare("UPDATE journey_attempts SET status = 'APPROACH', prepare_until = CASE WHEN mission_id = ? THEN ? WHEN mission_id = ? THEN ? WHEN mission_id = ? THEN ? ELSE NULL END WHERE pilot_id = ? AND attempt_id = ? AND status = 'READY'")
      .run(journeyDallas11.id, now + journeyDallas11.prepareMs, journeyDallas19.id, now + journeyDallas19.prepareMs,
        journeyDallas22.id, now + journeyDallas22.prepareMs, pilotId, attemptId);
    const current = this.get(pilotId, attemptId);
    return current?.status === 'APPROACH' ? current : undefined;
  }

  /** Start a Golden Gates race when the launch countdown reaches GO. */
  startRookieRush(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    const mission = current?.missionId === journeyDallas01.id ? journeyDallas01 : current?.missionId === journeyDallas02.id ? journeyDallas02 : current?.missionId === journeyDallas03.id ? journeyDallas03 : current?.missionId === journeyDallas04.id ? journeyDallas04 : current?.missionId === journeyDallas05.id ? journeyDallas05 : current?.missionId === journeyDallas06.id ? journeyDallas06 : undefined;
    if (!mission) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = ?, deadline_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'APPROACH' AND started_at IS NULL
      AND (mission_id != ? OR lake_gate_index = 0) AND (mission_id != ? OR ascent_gate_index = 0)
      AND (mission_id != ? OR slalom_gate_index = 0) AND (mission_id != ? OR needle_gate_index = 0)
      AND (mission_id != ? OR golden_championship_gate_index = 0)`)
      .run(now, now + mission.timeLimitMs, pilotId, attemptId, mission.id, journeyDallas02.id, journeyDallas03.id, journeyDallas04.id, journeyDallas05.id, journeyDallas06.id).changes;
    return changed ? this.get(pilotId, attemptId) : undefined;
  }

  /** Start a timed gate mission at GO, before the pilot reaches its first gate. */
  startTimedGateClock(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    const mission = current?.missionId === journeyDallas10.id ? journeyDallas10
      : current?.missionId === journeyDallas11.id ? journeyDallas11
      : current?.missionId === journeyDallas12.id ? journeyDallas12
      : current?.missionId === journeyDallas13.id ? journeyDallas13
      : current?.missionId === journeyDallas20.id ? journeyDallas20 : undefined;
    if (!mission) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET started_at = ?, deadline_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'APPROACH' AND started_at IS NULL`)
      .run(now, now + mission.timeLimitMs, pilotId, attemptId, mission.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** The encounter starts only after the pilot is connected and flight is active. */
  startMonsterArrival(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (current?.missionId !== journeyDallas19.id || current.status !== 'APPROACH' ||
      current.prepareUntil === null || now < current.prepareUntil) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = ?,
      deadline_at = ? WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ?
      AND status = 'APPROACH' AND prepare_until <= ?`).run(now, now + journeyDallas19.timeLimitMs,
      pilotId, attemptId, journeyDallas19.id, now).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Asset readiness is an owned lifecycle signal, never client progress. */
  startGiantIncoming(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = ?, deadline_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'APPROACH'`)
      .run(now, now + journeyDallas07.timeLimitMs, pilotId, attemptId, journeyDallas07.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }
  hitTransport(pilotId: string, attemptId: string, now = Date.now(), damage?: number): JourneyAttempt | undefined {
    return this.hitEncounter(pilotId, attemptId, journeyDallas07, now, damage);
  }

  /** Only the server projectile simulation invokes this after a swept body hit. */
  hitMonster(pilotId: string, attemptId: string, now = Date.now(), damage?: number): JourneyAttempt | undefined {
    return this.hitEncounter(pilotId, attemptId, journeyDallas19, now, damage);
  }

  private hitEncounter(pilotId: string, attemptId: string, mission: {id:string;firstClearCredits:number}, now:number, damage?: number): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (current?.missionId !== mission.id || current.status !== 'RACING' || current.monsterHealth === null || current.monsterHealth <= 0 ||
        current.startedAt === null || current.deadlineAt === null || now >= current.deadlineAt) return undefined;
      const hitDamage = damage ?? projectileDamageForAircraft(current.aircraftType);
      if (!Number.isInteger(hitDamage) || hitDamage <= 0) return undefined;
      const health = Math.max(0, current.monsterHealth - hitDamage);
      if (health > 0) {
        this.database.prepare(`UPDATE journey_attempts SET monster_health = ? WHERE pilot_id = ? AND attempt_id = ?
          AND status = 'RACING' AND monster_health = ?`).run(health, pilotId, attemptId, current.monsterHealth);
        return this.get(pilotId, attemptId);
      }
      const elapsed = now - current.startedAt;
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, mission.id, attemptId, now, elapsed).changes === 1;
      if (!first) {
        if (mission.id === journeyDallas07.id) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1
          WHERE pilot_id = ? AND mission_id = ?`).run(pilotId, mission.id);
        else this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
          best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`).run(elapsed, pilotId, mission.id);
      }
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: mission.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${mission.id}`,
          referenceId: mission.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey monster reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', monster_health = 0, monster_defeated_at = ?,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
        .run(now, now, elapsed, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  /** Only a server-observed swept crossing calls this, in the current approach cycle. */
  acceptPerfectApproachGate(pilotId: string, attemptId: string, gateIndex: number, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (current?.missionId !== journeyDallas22.id || current.gateIndex !== gateIndex ||
      gateIndex < 0 || gateIndex >= journeyDallas22.gates.length ||
      (gateIndex === 0 ? current.status !== 'APPROACH' : current.status !== 'RACING') ||
      current.prepareUntil === null || now < current.prepareUntil ||
      (gateIndex > 0 && (current.lastGateAt === null || now - current.lastGateAt < 350))) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', championship_gate_index = ?,
      started_at = COALESCE(started_at, ?), last_gate_at = ?, landing_grade = NULL, landing_score = NULL
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = ? AND championship_gate_index = ?`)
      .run(gateIndex + 1, now, now, pilotId, attemptId, journeyDallas22.id, current.status, gateIndex).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** A safe nonqualifying touchdown or a full upstream go-around starts a fresh gate cycle. */
  resetPerfectApproach(pilotId: string, attemptId: string, expectedCycle: number,
    score: number | null = null, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (current?.missionId !== journeyDallas22.id || !['APPROACH', 'RACING'].includes(current.status) ||
      current.approachCycle !== expectedCycle || current.prepareUntil === null || now < current.prepareUntil ||
      score !== null && (!Number.isInteger(score) || score < 1 || score > 1_000)) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'APPROACH', championship_gate_index = 0,
      approach_cycle = approach_cycle + 1, last_gate_at = NULL, landing_grade = ?, landing_score = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = ? AND approach_cycle = ?`)
      .run(score === null ? null : landingGradeForScore(score), score,
        pilotId, attemptId, journeyDallas22.id, current.status, expectedCycle).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** The caller supplies only a score calculated from a fresh server-observed touchdown. */
  recordPerfectApproachLanding(pilotId: string, attemptId: string, airportId: string,
    score: number, touchdownCycle: number, now = Date.now()): JourneyAttempt | undefined {
    if (!Number.isInteger(score) || score < 1 || score > 1_000) return undefined;
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (current?.missionId !== journeyDallas22.id || !['APPROACH', 'RACING'].includes(current.status) ||
        current.approachCycle !== touchdownCycle || current.prepareUntil === null || now < current.prepareUntil) return undefined;
      const grade = landingGradeForScore(score);
      if (airportId !== journeyDallas22.finishAirportId || current.gateIndex !== journeyDallas22.gates.length ||
        current.lastGateAt === null || now <= current.lastGateAt || !isPerfectLandingGrade(grade))
        return this.resetPerfectApproach(pilotId, attemptId, touchdownCycle, score, now);
      const elapsed = Math.max(0, now - (current.startedAt ?? current.createdAt));
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas22.id, attemptId, now, elapsed).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`)
        .run(elapsed, pilotId, journeyDallas22.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas22.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas22.id}`,
          referenceId: journeyDallas22.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey perfect approach reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', landing_grade = ?, landing_score = ?,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'RACING' AND approach_cycle = ?`)
        .run(grade, score, now, elapsed, credited, pilotId, attemptId, journeyDallas22.id, touchdownCycle);
      return this.get(pilotId, attemptId);
    });
  }

  acceptGate(pilotId: string, attemptId: string, gateIndex: number, now = Date.now(), verifiedSpeed?: number): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      const mission = current?.missionId === journeyDallas01.id ? journeyDallas01 : current?.missionId === journeyDallas02.id ? journeyDallas02 : current?.missionId === journeyDallas03.id ? journeyDallas03 : current?.missionId === journeyDallas04.id ? journeyDallas04 : current?.missionId === journeyDallas05.id ? journeyDallas05 : current?.missionId === journeyDallas06.id ? journeyDallas06 : current?.missionId === journeyDallas10.id ? journeyDallas10 : current?.missionId === journeyDallas11.id ? journeyDallas11 : current?.missionId === journeyDallas12.id ? journeyDallas12 : current?.missionId === journeyDallas13.id ? journeyDallas13 : current?.missionId === journeyDallas16.id ? journeyDallas16 : current?.missionId === journeyDallas20.id ? journeyDallas20 : undefined;
      if (!current || !mission || current.gateIndex !== gateIndex || !['APPROACH', 'RACING'].includes(current.status) ||
        current.missionId === journeyDallas02.id && current.lakeGateIndex < 0 ||
        current.missionId === journeyDallas03.id && current.ascentGateIndex < 0 ||
        current.missionId === journeyDallas04.id && current.slalomGateIndex < 0 ||
        current.missionId === journeyDallas05.id && current.needleGateIndex < 0 ||
        current.missionId === journeyDallas06.id && current.goldenChampionshipGateIndex < 0) return undefined;
      if (current.deadlineAt !== null && now >= current.deadlineAt) return undefined;
      if ((current.missionId === journeyDallas01.id || current.missionId === journeyDallas02.id || current.missionId === journeyDallas03.id || current.missionId === journeyDallas04.id || current.missionId === journeyDallas05.id || current.missionId === journeyDallas06.id) && (!current.startedAt || !current.deadlineAt)) return undefined;
      if (current.missionId === journeyDallas11.id && (current.prepareUntil === null || now < current.prepareUntil)) return undefined;
      if (gateIndex === 0 && current.status !== (current.missionId === journeyDallas01.id || current.missionId === journeyDallas02.id || current.missionId === journeyDallas03.id || current.missionId === journeyDallas04.id || current.missionId === journeyDallas05.id || current.missionId === journeyDallas06.id ? 'RACING' : 'APPROACH')) return undefined;
      if (gateIndex > 0 && (current.status !== 'RACING' || !current.startedAt || current.missionId !== journeyDallas16.id && (!current.deadlineAt ||
        (current.missionId === journeyDallas20.id ? now >= current.deadlineAt : now > current.deadlineAt)) ||
        !current.lastGateAt || now - current.lastGateAt < 350)) return undefined;
      if (current.missionId === journeyDallas13.id && gateIndex > 0) {
        const threshold = journeyDallas13.speedThresholds[current.aircraftType as keyof typeof journeyDallas13.speedThresholds];
        if (!Number.isFinite(threshold) || !Number.isFinite(verifiedSpeed) || verifiedSpeed! < threshold) return undefined;
      }
      if (gateIndex === mission.gates.length - 1) {
        const finishTimeMs = now - current.startedAt!;
        let credited = 0;
        const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
          (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
          .run(pilotId, current.missionId, attemptId, now, finishTimeMs).changes === 1;
        if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
          best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`).run(finishTimeMs, pilotId, current.missionId);
        if (first) {
          const before = wallet.balances(pilotId)?.credits ?? 0;
          const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: mission.firstClearCredits,
            reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
          if (!reward.ok) throw new Error('Journey first-clear reward failed');
          credited = Math.max(0, (reward.balance ?? before) - before);
        }
        this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', ${current.missionId === journeyDallas01.id ? 'rookie_gate_index' : current.missionId === journeyDallas02.id ? 'lake_gate_index' : current.missionId === journeyDallas03.id ? 'ascent_gate_index' : current.missionId === journeyDallas04.id ? 'slalom_gate_index' : current.missionId === journeyDallas05.id ? 'needle_gate_index' : current.missionId === journeyDallas06.id ? 'golden_championship_gate_index' : current.missionId === journeyDallas10.id || current.missionId === journeyDallas11.id || current.missionId === journeyDallas12.id || current.missionId === journeyDallas13.id || current.missionId === journeyDallas16.id || current.missionId === journeyDallas20.id ? 'championship_gate_index' : 'gate_index'} = ?, last_gate_at = ?,
          finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, now, finishTimeMs, credited, attemptId);
      } else {
        this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', ${current.missionId === journeyDallas01.id ? 'rookie_gate_index' : current.missionId === journeyDallas02.id ? 'lake_gate_index' : current.missionId === journeyDallas03.id ? 'ascent_gate_index' : current.missionId === journeyDallas04.id ? 'slalom_gate_index' : current.missionId === journeyDallas05.id ? 'needle_gate_index' : current.missionId === journeyDallas06.id ? 'golden_championship_gate_index' : current.missionId === journeyDallas10.id || current.missionId === journeyDallas11.id || current.missionId === journeyDallas12.id || current.missionId === journeyDallas13.id || current.missionId === journeyDallas16.id || current.missionId === journeyDallas20.id ? 'championship_gate_index' : 'gate_index'} = ?,
          started_at = COALESCE(started_at, ?), deadline_at = COALESCE(deadline_at, ?), last_gate_at = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, current.missionId === journeyDallas16.id ? null : now + ('timeLimitMs' in mission ? mission.timeLimitMs : 0), now, attemptId);
      }
      return this.get(pilotId, attemptId);
    });
  }

  /** Persist the two mission-owned Hunters only after their server-accepted gates. */
  assignCrossfireHunter(pilotId: string, attemptId: string, hunterId: string, ordinal: 1 | 2): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || current.missionId !== journeyDallas16.id || current.status !== 'RACING' ||
      current.gateIndex < (ordinal === 1 ? 1 : 3) || !hunterId ||
      (ordinal === 1 ? current.targetId !== null : current.targetId === null || current.secondaryTargetId !== null)) return undefined;
    const column = ordinal === 1 ? 'target_id' : 'secondary_target_id';
    const changed = this.database.prepare(`UPDATE journey_attempts SET ${column} = ? WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING' AND ${column} IS NULL`)
      .run(hunterId, pilotId, attemptId).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  assignHunter(pilotId: string, attemptId: string, targetId: string, previousTargetId: string | null = null, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || (current.missionId !== journeyDallas09.id && current.missionId !== journeyDallas14.id && current.missionId !== journeyDallas15.id) || !targetId ||
      (current.status === 'APPROACH' ? previousTargetId !== null : current.status !== 'RACING' || current.targetId !== previousTargetId)) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', target_id = ?, started_at = COALESCE(started_at, ?)
      WHERE pilot_id = ? AND attempt_id = ? AND status = ? AND target_id IS ?`)
      .run(targetId, now, pilotId, attemptId, current.status, previousTargetId).changes;
    if (changed !== 1) return undefined;
    return this.get(pilotId, attemptId);
  }

  /** Called only by the server after its own swept physical pickup check. */
  completeHeartRecovery(pilotId: string, attemptId: string, heartId: string, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas09.id || current.status !== 'RACING' ||
        !current.targetId || heartId !== journeyDallas09.heartId ||
        !this.progress(pilotId, journeyDallas08.id).completed) return undefined;
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)`)
        .run(pilotId, current.missionId, attemptId, now).changes === 1;
      if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
        .run(pilotId, current.missionId);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas09.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
        if (!reward.ok) throw new Error('Journey recovery reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', finished_at = ?,
        first_clear_credits = ? WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
        .run(now, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  /** Physical mission Heart collection advances only to the landing phase. */
  collectCriticalHeart(pilotId: string, attemptId: string, heartId: string, now = Date.now()): JourneyAttempt | undefined {
    if (heartId !== journeyDallas17.heartId) return undefined;
    const current = this.get(pilotId, attemptId);
    if (current?.missionId !== journeyDallas17.id || current.status !== 'APPROACH' || current.repairCollectedAt !== null)
      return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', repair_collected_at = ?, started_at = COALESCE(started_at, ?)
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'APPROACH' AND repair_collected_at IS NULL`)
      .run(now, now, pilotId, attemptId, journeyDallas17.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Called only after a server-observed DFW touchdown and server-computed score. */
  recordCriticalLanding(pilotId: string, attemptId: string, airportId: string, score: number, now = Date.now()): JourneyAttempt | undefined {
    if (airportId !== journeyDallas17.finishAirportId || !Number.isInteger(score) || score < 1 || score > 1_000) return undefined;
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas17.id || current.status !== 'RACING' ||
        current.repairCollectedAt === null || current.finishedAt !== null) return undefined;
      const grade = landingGradeForScore(score);
      if (score < journeyDallas17.requiredLandingScore) {
        this.database.prepare(`UPDATE journey_attempts SET landing_grade = ?, landing_score = ?
          WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
          .run(grade, score, pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      const elapsed = Math.max(0, now - (current.startedAt ?? current.createdAt));
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas17.id, attemptId, now, elapsed).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`)
        .run(elapsed, pilotId, journeyDallas17.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas17.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas17.id}`,
          referenceId: journeyDallas17.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey critical approach reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', landing_grade = ?, landing_score = ?,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
        .run(grade, score, now, elapsed, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  assignLeader(pilotId: string, attemptId: string, targetId: string, previousTargetId: string | null = null, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || current.missionId !== journeyDallas08.id || !targetId ||
      (current.status === 'APPROACH' ? previousTargetId !== null : current.status !== 'RACING' || current.targetId !== previousTargetId)) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', target_id = ?, hold_updated_at = NULL,
      started_at = COALESCE(started_at, ?) WHERE pilot_id = ? AND attempt_id = ? AND status = ? AND target_id IS ?`)
      .run(targetId, now, pilotId, attemptId, current.status, previousTargetId).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  updateFormationHold(pilotId: string, attemptId: string, targetId: string, valid: boolean, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas08.id || current.status !== 'RACING' || current.targetId !== targetId) return undefined;
      if (!valid) {
        if (current.holdUpdatedAt !== null) this.database.prepare('UPDATE journey_attempts SET hold_updated_at = NULL WHERE attempt_id = ?').run(attemptId);
        return this.get(pilotId, attemptId);
      }
      const elapsed = current.holdUpdatedAt === null ? 0 : now > current.holdUpdatedAt && now - current.holdUpdatedAt <= 400
        ? now - current.holdUpdatedAt : 0;
      const holdMs = Math.min(journeyDallas08.followMs, current.holdMs + elapsed);
      if (holdMs < journeyDallas08.followMs) {
        this.database.prepare('UPDATE journey_attempts SET hold_ms = ?, hold_updated_at = ? WHERE attempt_id = ?')
          .run(holdMs, now, attemptId);
        return this.get(pilotId, attemptId);
      }
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas08.id, attemptId, now, now - (current.startedAt ?? now)).changes === 1;
      if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
        .run(pilotId, journeyDallas08.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas08.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas08.id}`, referenceId: journeyDallas08.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey formation reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', hold_ms = ?, hold_updated_at = NULL,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ? AND status = 'RACING'`)
        .run(holdMs, now, now - (current.startedAt ?? now), credited, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  /** Only the server's validated pursuit tick may call this method. */
  updateEscapeHold(pilotId: string, attemptId: string, targetId: string, valid: boolean, now = Date.now(), monotonicNow = performance.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas14.id || current.status !== 'RACING' || current.targetId !== targetId) return undefined;
      if (!valid) {
        if (current.holdUpdatedAt !== null) this.database.prepare('UPDATE journey_attempts SET hold_updated_at = NULL WHERE attempt_id = ?').run(attemptId);
        return this.get(pilotId, attemptId);
      }
      const elapsed = current.holdUpdatedAt !== null && monotonicNow > current.holdUpdatedAt && monotonicNow - current.holdUpdatedAt <= 400
        ? monotonicNow - current.holdUpdatedAt : 0;
      const holdMs = Math.min(journeyDallas14.escapeMs, current.holdMs + elapsed);
      if (holdMs < journeyDallas14.escapeMs) {
        this.database.prepare('UPDATE journey_attempts SET hold_ms = ?, hold_updated_at = ? WHERE attempt_id = ?')
          .run(holdMs, monotonicNow, attemptId);
        return this.get(pilotId, attemptId);
      }
      const finishTimeMs = now - (current.startedAt ?? now);
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas14.id, attemptId, now, finishTimeMs).changes === 1;
      if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
        .run(pilotId, journeyDallas14.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas14.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas14.id}`, referenceId: journeyDallas14.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey escape reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', hold_ms = ?, hold_updated_at = NULL,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ? AND status = 'RACING'`)
        .run(holdMs, now, finishTimeMs, credited, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  completeHunter(pilotId: string, attemptId: string, targetId: string, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas15.id ||
        current.status !== 'RACING' || current.targetId !== targetId ||
        !this.progress(pilotId, journeyDallas14.id).completed) return undefined;
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)`)
        .run(pilotId, current.missionId, attemptId, now).changes === 1;
      if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
        .run(pilotId, current.missionId);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas15.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
        if (!reward.ok) throw new Error('Journey Hunter reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', finished_at = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`).run(now, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  assignDoubleHunter(pilotId: string, attemptId: string, hunterId: string, ordinal: 1 | 2,
    now = Date.now()): JourneyAttempt | undefined {
    if (!hunterId) return undefined;
    const first = ordinal === 1;
    const changed = this.database.prepare(first
      ? `UPDATE journey_attempts SET status = 'RACING', double_phase = 'FIRST_FIGHT', target_id = ?,
        started_at = COALESCE(started_at, ?) WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ?
        AND status = 'APPROACH' AND double_phase = 'TAKEOFF' AND target_id IS NULL`
      : `UPDATE journey_attempts SET secondary_target_id = ? WHERE pilot_id = ? AND attempt_id = ?
        AND mission_id = ? AND status = 'RACING' AND double_phase = 'FINAL_FIGHT'
        AND repair_collected_at IS NOT NULL AND secondary_target_id IS NULL`)
      .run(...(first ? [hunterId, now, pilotId, attemptId, journeyDallas23.id]
        : [hunterId, pilotId, attemptId, journeyDallas23.id])).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Called only after the assigned first Hunter's server-owned hull reaches zero. */
  defeatDoubleFirst(pilotId: string, attemptId: string, hunterId: string,
    heart: { x: number; y: number; z: number }): JourneyAttempt | undefined {
    if (![heart.x, heart.y, heart.z].every(Number.isFinite)) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET double_phase = 'REPAIR',
      heart_x = ?, heart_y = ?, heart_z = ? WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ?
      AND status = 'RACING' AND double_phase = 'FIRST_FIGHT' AND target_id = ?`)
      .run(heart.x, heart.y, heart.z, pilotId, attemptId, journeyDallas23.id, hunterId).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Only the server's swept pickup check may call this, including at full hull health. */
  collectDoubleHeart(pilotId: string, attemptId: string, heartId: string,
    now = Date.now()): JourneyAttempt | undefined {
    if (heartId !== journeyDallas23.heartId) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET double_phase = 'FINAL_FIGHT',
      repair_collected_at = ? WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ?
      AND status = 'RACING' AND double_phase = 'REPAIR' AND repair_collected_at IS NULL
      AND heart_x IS NOT NULL AND heart_y IS NOT NULL AND heart_z IS NOT NULL`)
      .run(now, pilotId, attemptId, journeyDallas23.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Only the assigned second Hunter's server-confirmed destruction completes the mission. */
  defeatDoubleSecond(pilotId: string, attemptId: string, hunterId: string,
    now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (current?.missionId !== journeyDallas23.id || current.status !== 'RACING' ||
        current.doublePhase !== 'FINAL_FIGHT' || !current.targetId ||
        current.secondaryTargetId !== hunterId || current.repairCollectedAt === null) return undefined;
      const elapsed = Math.max(0, now - (current.startedAt ?? current.createdAt));
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas23.id, attemptId, now, elapsed).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`)
        .run(elapsed, pilotId, journeyDallas23.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas23.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas23.id}`,
          referenceId: journeyDallas23.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey double trouble reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', finished_at = ?,
        finish_time_ms = ?, first_clear_credits = ? WHERE pilot_id = ? AND attempt_id = ?
        AND mission_id = ? AND status = 'RACING' AND double_phase = 'FINAL_FIGHT' AND secondary_target_id = ?`)
        .run(now, elapsed, credited, pilotId, attemptId, journeyDallas23.id, hunterId);
      return this.get(pilotId, attemptId);
    });
  }

  acceptLegendaryGate(pilotId: string, attemptId: string, gateIndex: number, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (current?.missionId !== journeyDallas24.id || current.legendaryPhase !== 'GATES' ||
      current.gateIndex !== gateIndex || gateIndex < 0 || gateIndex >= journeyDallas24.gates.length ||
      (gateIndex === 0 ? current.status !== 'APPROACH' : current.status !== 'RACING') ||
      (gateIndex > 0 && (current.lastGateAt === null || now - current.lastGateAt < 350))) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING',
      championship_gate_index = ?, legendary_phase = ?, started_at = COALESCE(started_at, ?), last_gate_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = ?
      AND legendary_phase = 'GATES' AND championship_gate_index = ?`)
      .run(gateIndex + 1, gateIndex === 2 ? 'ACE' : 'GATES', now, now,
        pilotId, attemptId, journeyDallas24.id, current.status, gateIndex).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  assignLegendaryAce(pilotId: string, attemptId: string, aceId: string): JourneyAttempt | undefined {
    if (!aceId) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET target_id = ? WHERE pilot_id = ?
      AND attempt_id = ? AND mission_id = ? AND status = 'RACING' AND legendary_phase = 'ACE'
      AND championship_gate_index = 3 AND target_id IS NULL`)
      .run(aceId, pilotId, attemptId, journeyDallas24.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  defeatLegendaryAce(pilotId: string, attemptId: string, aceId: string): JourneyAttempt | undefined {
    const changed = this.database.prepare(`UPDATE journey_attempts SET legendary_phase = 'LANDING'
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'RACING'
      AND legendary_phase = 'ACE' AND championship_gate_index = 3 AND target_id = ?`)
      .run(pilotId, attemptId, journeyDallas24.id, aceId).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Receives only a fresh score and runway from the server's touchdown pipeline. */
  recordLegendaryLanding(pilotId: string, attemptId: string, airportId: string,
    score: number, touchdownCycle: number, now = Date.now()): JourneyAttempt | undefined {
    if (!Number.isInteger(score) || score < 1 || score > 1_000) return undefined;
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (current?.missionId !== journeyDallas24.id || current.status !== 'RACING' ||
        current.legendaryPhase !== 'LANDING' || !current.targetId ||
        current.gateIndex !== journeyDallas24.gates.length || current.lastGateAt === null ||
        current.approachCycle !== touchdownCycle || now <= current.lastGateAt) return undefined;
      const grade = landingGradeForScore(score);
      if (airportId !== journeyDallas24.finishAirportId || !isPerfectLandingGrade(grade)) {
        this.database.prepare(`UPDATE journey_attempts SET approach_cycle = approach_cycle + 1,
          landing_grade = ?, landing_score = ? WHERE pilot_id = ? AND attempt_id = ?
          AND mission_id = ? AND status = 'RACING' AND legendary_phase = 'LANDING' AND approach_cycle = ?`)
          .run(grade, score, pilotId, attemptId, journeyDallas24.id, touchdownCycle);
        return this.get(pilotId, attemptId);
      }
      const elapsed = Math.max(0, now - (current.startedAt ?? current.createdAt));
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas24.id, attemptId, now, elapsed).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`)
        .run(elapsed, pilotId, journeyDallas24.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas24.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas24.id}`,
          referenceId: journeyDallas24.id, createdAt: now });
        if (!reward.ok) throw new Error('Legendary championship reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', landing_grade = ?,
        landing_score = ?, finished_at = ?, finish_time_ms = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'RACING'
        AND legendary_phase = 'LANDING' AND approach_cycle = ?`)
        .run(grade, score, now, elapsed, credited, pilotId, attemptId, journeyDallas24.id, touchdownCycle);
      return this.get(pilotId, attemptId);
    });
  }

  /** Mission 21 uses the existing territory rectangles without writing shared ownership. */
  updateTwoFronts(pilotId: string, attemptId: string, territoryId: string, valid: boolean,
    monotonicNow: number, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (current?.missionId !== journeyDallas21.id ||
        current.targetId !== journeyDallas21.alphaTerritoryId ||
        current.secondaryTargetId !== journeyDallas21.bravoTerritoryId ||
        current.status !== 'APPROACH' && current.status !== 'RACING') return undefined;
      const alpha = current.status === 'APPROACH';
      const assigned = alpha ? current.targetId : current.secondaryTargetId;
      const eligible = valid && territoryId === assigned;
      if (!alpha && (current.deadlineAt === null || current.startedAt === null || now >= current.deadlineAt)) {
        this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', failure_reason = 'TIME_UP',
          finished_at = ?, hold_updated_at = NULL WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
          .run(now, pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      if (!eligible) {
        if (current.holdUpdatedAt !== null) this.database.prepare(`UPDATE journey_attempts SET hold_updated_at = NULL
          WHERE pilot_id = ? AND attempt_id = ? AND status IN ('APPROACH','RACING')`).run(pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      const elapsed = current.holdUpdatedAt !== null && monotonicNow > current.holdUpdatedAt &&
        monotonicNow - current.holdUpdatedAt <= 600 ? monotonicNow - current.holdUpdatedAt : 0;
      const progress = Math.min(journeyDallas21.captureMs, (alpha ? current.captureMs : current.holdMs) + elapsed);
      if (alpha) {
        this.database.prepare(`UPDATE journey_attempts SET capture_ms = ?, hold_updated_at = ?,
          status = CASE WHEN ? >= ? THEN 'RACING' ELSE status END,
          started_at = CASE WHEN ? >= ? THEN ? ELSE started_at END,
          deadline_at = CASE WHEN ? >= ? THEN ? ELSE deadline_at END
          WHERE pilot_id = ? AND attempt_id = ? AND status = 'APPROACH'`)
          .run(progress, progress === journeyDallas21.captureMs ? null : monotonicNow,
            progress, journeyDallas21.captureMs, progress, journeyDallas21.captureMs, now,
            progress, journeyDallas21.captureMs, now + journeyDallas21.transferMs,
            pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      if (progress < journeyDallas21.captureMs) {
        this.database.prepare(`UPDATE journey_attempts SET hold_ms = ?, hold_updated_at = ?
          WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`).run(progress, monotonicNow, pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      const finishTimeMs = now - current.startedAt!;
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas21.id, attemptId, now, finishTimeMs).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`)
        .run(finishTimeMs, pilotId, journeyDallas21.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas21.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas21.id}`,
          referenceId: journeyDallas21.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey Two Fronts reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', hold_ms = ?, hold_updated_at = NULL,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
        .run(progress, now, finishTimeMs, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  /** Mission-only capture: ordinary territory ownership is never written. */
  updateSiegeCapture(pilotId: string, attemptId: string, valid: boolean, monotonicNow: number, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (current?.missionId !== journeyDallas18.id || current.status !== 'APPROACH') return undefined;
    if (!valid) {
      if (current.captureMs || current.holdUpdatedAt !== null) this.database.prepare(`UPDATE journey_attempts
        SET capture_ms = 0, hold_updated_at = NULL WHERE pilot_id = ? AND attempt_id = ? AND status = 'APPROACH'`)
        .run(pilotId, attemptId);
      return this.get(pilotId, attemptId);
    }
    const elapsed = current.holdUpdatedAt !== null && monotonicNow > current.holdUpdatedAt && monotonicNow - current.holdUpdatedAt <= 600
      ? monotonicNow - current.holdUpdatedAt : 0;
    const captureMs = Math.min(journeyDallas18.captureMs, current.captureMs + elapsed);
    this.database.prepare(`UPDATE journey_attempts SET capture_ms = ?, hold_updated_at = ?,
      status = CASE WHEN ? >= ? THEN 'RACING' ELSE status END,
      started_at = CASE WHEN ? >= ? THEN ? ELSE started_at END
      WHERE pilot_id = ? AND attempt_id = ? AND status = 'APPROACH'`)
      .run(captureMs, captureMs === journeyDallas18.captureMs ? null : monotonicNow,
        captureMs, journeyDallas18.captureMs, captureMs, journeyDallas18.captureMs, now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }

  assignSiegeHunter(pilotId: string, attemptId: string, hunterId: string): JourneyAttempt | undefined {
    if (!hunterId) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET target_id = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'RACING' AND target_id IS NULL`)
      .run(hunterId, pilotId, attemptId, journeyDallas18.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Validity is computed from accepted movement, zone, and assigned AI state. */
  updateSiegeDefense(pilotId: string, attemptId: string, valid: boolean, monotonicNow: number, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (current?.missionId !== journeyDallas18.id || current.status !== 'RACING' || !current.targetId) return undefined;
      if (!valid) {
        if (current.holdUpdatedAt !== null) this.database.prepare(`UPDATE journey_attempts SET hold_updated_at = NULL
          WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`).run(pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      const elapsed = current.holdUpdatedAt !== null && monotonicNow > current.holdUpdatedAt && monotonicNow - current.holdUpdatedAt <= 600
        ? monotonicNow - current.holdUpdatedAt : 0;
      const holdMs = Math.min(journeyDallas18.defenseMs, current.holdMs + elapsed);
      if (holdMs < journeyDallas18.defenseMs) {
        this.database.prepare(`UPDATE journey_attempts SET hold_ms = ?, hold_updated_at = ?
          WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`).run(holdMs, monotonicNow, pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      const finishTimeMs = now - (current.startedAt ?? now);
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas18.id, attemptId, now, finishTimeMs).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`)
        .run(finishTimeMs, pilotId, journeyDallas18.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas18.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas18.id}`,
          referenceId: journeyDallas18.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey siege reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', hold_ms = ?, hold_updated_at = NULL,
        finished_at = ?, finish_time_ms = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
        .run(holdMs, now, finishTimeMs, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  fail(pilotId: string, attemptId: string, reason: 'TIME_UP' | 'CRASHED' | 'MONSTER_KILLED' | 'INTERRUPTED' | 'INVALID' | 'PURSUIT_INTERRUPTED' | 'ACE_INTERRUPTED' | 'CROSSFIRE_INTERRUPTED' | 'DEFENSE_INTERRUPTED' | 'DOUBLE_INTERRUPTED' | 'PAUSE_EXPIRED', now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', failure_reason = ?, finished_at = ?, paused_at = NULL
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING')`)
      .run(reason, now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }

  abandon(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'ABANDONED', finished_at = ?, paused_at = NULL
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING')`)
      .run(now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }
}
