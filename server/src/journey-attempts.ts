import { territoriesForCity } from '../../shared/city-territories.mjs';
import { journeyMissionOrder, journeyCatalog } from '../../shared/journey-mission.mjs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { journeyDallasCapture01, journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas25, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24, journeyPauseLimitMs } from '../../shared/journey-mission.mjs';
import { projectileDamageForAircraft } from '../../shared/protocol.mjs';
import { landingGradeForScore, type LandingGrade } from '../../shared/landing-scoring.mjs';
import { isPerfectLandingGrade } from '../../shared/gameplay-cinematic-rules.mjs';
import { PlayerWallet } from './player-wallet.js';

type WalletTransaction = Parameters<Parameters<PlayerWallet['transaction']>[0]>[0];

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
  rearGuardThirdId:string|null; rearGuardFourthId:string|null; rearGuardKills:number; crossfireKills:number; captureMs: number;
  phase?: 'PREPARING' | 'APPROACH_GATES' | 'RACING' | 'REPAIR' | 'LANDING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
  landingGrade: LandingGrade | null;
  landingScore: number | null;
  approachCycle: number;
  doublePhase: 'TAKEOFF' | 'FIRST_FIGHT' | 'REPAIR' | 'FINAL_FIGHT' | null;
  legendaryPhase: 'GATES' | 'ACE' | 'LANDING' | null;
  heartPosition: { x: number; y: number; z: number } | null;
  monsterHealth: number | null;
  fortressLeftHealth: number | null;
  fortressRightHealth: number | null;
  finalPhase: 'ESCORTS' | 'TURRETS' | 'CORE' | null;
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
  rear_guard_third_id:string|null; rear_guard_fourth_id:string|null; rear_guard_kills:number; crossfire_kills:number; capture_ms: number;
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
  fortress_left_health: number | null; fortress_right_health: number | null;
  final_phase: 'ESCORTS' | 'TURRETS' | 'CORE' | null;
};

function attempt(row: AttemptRow): JourneyAttempt {
  return {
    rearGuardThirdId:row.rear_guard_third_id??null, rearGuardFourthId:row.rear_guard_fourth_id??null, rearGuardKills:row.rear_guard_kills??0, crossfireKills:row.crossfire_kills??0, attemptId: row.attempt_id, pilotId: row.pilot_id, missionId: row.mission_id,
    cityId: row.city_id, aircraftType: row.aircraft_type, targetId: row.target_id, secondaryTargetId: row.secondary_target_id, status: row.status,
    gateIndex: row.mission_id === journeyDallas01.id ? row.rookie_gate_index : row.mission_id === journeyDallas02.id ? Math.max(0, row.lake_gate_index) : row.mission_id === journeyDallas03.id ? Math.max(0, row.ascent_gate_index) : row.mission_id === journeyDallas04.id ? Math.max(0, row.slalom_gate_index) : row.mission_id === journeyDallas05.id ? Math.max(0, row.needle_gate_index) : row.mission_id === journeyDallas06.id ? Math.max(0, row.golden_championship_gate_index) : row.mission_id === journeyDallas11.id || row.mission_id === journeyDallas12.id || row.mission_id === journeyDallas13.id || row.mission_id === journeyDallas16.id || row.mission_id === journeyDallas20.id || row.mission_id === journeyDallas22.id || row.mission_id === journeyDallas24.id ? row.championship_gate_index : row.gate_index,
    lakeGateIndex: row.lake_gate_index,
    ascentGateIndex: row.ascent_gate_index,
    slalomGateIndex: row.slalom_gate_index,
    needleGateIndex: row.needle_gate_index,
    goldenChampionshipGateIndex: row.golden_championship_gate_index,
    ...(row.mission_id === journeyDallas06.id ? { phase: row.status === 'READY' ? 'PREPARING'
      : row.status === 'APPROACH' ? 'APPROACH_GATES' : row.status } : {}),
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
    fortressLeftHealth: row.fortress_left_health, fortressRightHealth: row.fortress_right_health,
    finalPhase: row.final_phase,
    heartPosition: row.heart_x === null || row.heart_y === null || row.heart_z === null ? null
      : { x: row.heart_x, y: row.heart_y, z: row.heart_z },
  };
}

export class JourneyAttemptStore {
  private readonly database: DatabaseSync;
  // One active attempt per pilot, bounded even when clients disappear without closing.
  private readonly activeSnapshots = new Map<string, { attempt: JourneyAttempt; usedAt: number }>();
  private transactionActive = false;

  private remember(current: JourneyAttempt | undefined, pilotId: string): void {
    if (this.transactionActive) return;
    this.activeSnapshots.delete(pilotId);
    if (!current || !journeyMissionOrder.includes(current.missionId) || current.pausedAt !== null || !['READY', 'APPROACH', 'RACING'].includes(current.status) ||
        current.deadlineAt !== null && current.deadlineAt <= Date.now()) return;
    if (this.activeSnapshots.size >= 512) this.activeSnapshots.delete(this.activeSnapshots.keys().next().value!);
    const snapshot = Object.freeze({ ...current,
      heartPosition: current.heartPosition ? Object.freeze({ ...current.heartPosition }) : null });
    this.activeSnapshots.set(pilotId, { attempt: snapshot, usedAt: Date.now() });
  }

  private transaction<T>(pilotId: string, operation: (wallet: WalletTransaction) => T): T {
    this.activeSnapshots.delete(pilotId);
    this.transactionActive = true;
    try { return this.wallet.transaction(operation); }
    finally {
      this.transactionActive = false;
      // Both commit and rollback require a fresh durable snapshot on the next read.
      this.activeSnapshots.delete(pilotId);
    }
  }

  activeSnapshot(pilotId: string, attemptId: string): JourneyAttempt | undefined {
    const cached = this.activeSnapshots.get(pilotId);
    const now = Date.now();
    if (cached?.attempt.attemptId === attemptId && now - cached.usedAt < 60_000 &&
        (cached.attempt.deadlineAt === null || cached.attempt.deadlineAt > now)) {
      cached.usedAt = now;
      return cached.attempt;
    }
    const current = this.get(pilotId, attemptId);
    if (current && !journeyMissionOrder.includes(current.missionId)) return undefined;
    return this.activeSnapshots.get(pilotId)?.attempt ?? current;
  }

  private readonly wallet: PlayerWallet;
  private readonly allowAllMissionsForQa: boolean;
  private readonly allowPerPilotQaUnlocks: boolean;

  constructor(filePath: string, allowAllMissionsForQa = false, allowPerPilotQaUnlocks = false) {
    this.allowAllMissionsForQa = allowAllMissionsForQa;
    this.allowPerPilotQaUnlocks = allowPerPilotQaUnlocks;
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
      CREATE TABLE IF NOT EXISTS journey_continuations (
        attempt_id TEXT PRIMARY KEY REFERENCES journey_attempts(attempt_id),
        pilot_id TEXT NOT NULL, failed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        payload TEXT NOT NULL, consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS journey_continuations_expiry ON journey_continuations(expires_at) WHERE consumed_at IS NULL;
      CREATE TABLE IF NOT EXISTS journey_completions (
        pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL, first_attempt_id TEXT NOT NULL,
        completed_at INTEGER NOT NULL, best_time_ms INTEGER NOT NULL, clear_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(pilot_id, mission_id),
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS journey_qa_unlocked_pilots (
        pilot_id TEXT PRIMARY KEY,
        granted_at INTEGER NOT NULL,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
    `);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS journey_catalog_versions (version TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS journey_access_grants (
        pilot_id TEXT NOT NULL REFERENCES player_profiles(pilot_id), mission_id TEXT NOT NULL,
        PRIMARY KEY(pilot_id, mission_id)
      );
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      if (!this.database.prepare('SELECT 1 FROM journey_catalog_versions WHERE version=?').get('dallas-30')) {
        const previous = [1,2,3,4,5,6,13,14,15,16,17,18,7,8,9,10,11,12,25,20,21,22,23,19]
          .map(number => `journey-dallas-${String(number).padStart(2, '0')}`);
        const grant = this.database.prepare(`INSERT OR IGNORE INTO journey_access_grants(pilot_id,mission_id)
          SELECT pilot_id,? FROM journey_completions WHERE mission_id=?`);
        for (const id of journeyMissionOrder) {
          const index = previous.indexOf(id);
          if (index > 0) grant.run(id, previous[index - 1]!);
          this.database.prepare(`INSERT OR IGNORE INTO journey_access_grants(pilot_id,mission_id)
            SELECT pilot_id,mission_id FROM journey_attempts WHERE mission_id=?`).run(id);
        }
        this.database.prepare('INSERT INTO journey_catalog_versions(version) VALUES(?)').run('dallas-30');
      }
      if (!this.database.prepare('SELECT 1 FROM journey_catalog_versions WHERE version=?').get('dallas-capture-01')) {
        // Preserve M06 access earned before M05 was introduced, once at rollout.
        this.database.prepare(`INSERT OR IGNORE INTO journey_access_grants(pilot_id,mission_id)
          SELECT pilot_id,? FROM journey_completions WHERE mission_id=?`).run(journeyDallas14.id, journeyDallas03.id);
        this.database.prepare('INSERT INTO journey_catalog_versions(version) VALUES(?)').run('dallas-capture-01');
      }
      // Retire only unfinished encounters. Completion history and wallet receipts are untouched.
      for (const id of ['journey-dallas-25','journey-dallas-20','journey-dallas-21','journey-dallas-22','journey-dallas-24']) {
        this.database.prepare(`UPDATE journey_attempts SET status='ABANDONED',finished_at=?,failure_reason='MISSION_RETIRED'
          WHERE mission_id=? AND status IN ('READY','APPROACH','RACING')`).run(Date.now(), id);
        this.database.prepare(`DELETE FROM journey_continuations WHERE attempt_id IN
          (SELECT attempt_id FROM journey_attempts WHERE mission_id=?) AND consumed_at IS NULL`).run(id);
      }
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    const columns = this.database.prepare('PRAGMA table_info(journey_attempts)').all() as { name: string }[];
    if (!columns.some(column => column.name === 'definition_revision'))
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN definition_revision INTEGER NOT NULL DEFAULT 0');
    // Completed M1 records remain intact; an in-flight legacy course cannot resume on new geometry.
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision<? AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas01.id,journeyDallas01.courseRevision);
    // Retain historical clears/receipts, but never resume a speed-race as combat.
    this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', finished_at = ?, failure_reason = 'MISSION_UPDATED'
      WHERE mission_id = ? AND definition_revision = 0 AND status IN ('READY','APPROACH','RACING')`)
      .run(Date.now(), journeyDallas13.id);
    this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', finished_at = ?, failure_reason = 'MISSION_UPDATED'
      WHERE mission_id = ? AND definition_revision = 0 AND status IN ('READY','APPROACH','RACING')`)
      .run(Date.now(), journeyDallas14.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision=0 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas15.id);
    for(const column of ['rear_guard_third_id','rear_guard_fourth_id'])if(!columns.some(c=>c.name===column))this.database.exec(`ALTER TABLE journey_attempts ADD COLUMN ${column} TEXT`);
    this.database.prepare("UPDATE journey_attempts SET status='ABANDONED',failure_reason='MISSION_UPDATED' WHERE mission_id=? AND status IN ('READY','APPROACH','RACING')").run(journeyDallas24.id);
    if(!columns.some(c=>c.name==='rear_guard_kills'))this.database.exec('ALTER TABLE journey_attempts ADD COLUMN rear_guard_kills INTEGER NOT NULL DEFAULT 0');
    if(!columns.some(c=>c.name==='crossfire_kills'))this.database.exec('ALTER TABLE journey_attempts ADD COLUMN crossfire_kills INTEGER NOT NULL DEFAULT 0');
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision=0 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas16.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision<2 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas17.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED' WHERE mission_id=? AND definition_revision<2 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas21.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED' WHERE mission_id=? AND definition_revision<2 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas22.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED' WHERE mission_id=? AND definition_revision<2 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas23.id);
    // Changed transport courses cannot resume on legacy geometry; completed records stay intact.
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id IN (?,?) AND definition_revision<1 AND status IN ('READY','APPROACH','RACING')`)
      .run(Date.now(),journeyDallas07.id,journeyDallas08.id);
    // Preserve historical clears, but never resume territory progress as a boss battle.
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision<2 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas18.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED' WHERE mission_id=? AND definition_revision<3 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas19.id);
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED' WHERE mission_id=? AND definition_revision<2 AND status IN ('READY','APPROACH','RACING')`).run(Date.now(),journeyDallas20.id);
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
    // Previous M2/M3 courses cannot resume against the new gate geometry.
    for (const mission of [journeyDallas02, journeyDallas03]) {
      this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision<? AND status IN ('READY','APPROACH','RACING')`)
        .run(Date.now(), mission.id, mission.courseRevision);
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
    // Preserve prior clears, but never resume an active attempt on old M4/M5 geometry.
    for (const mission of [journeyDallas04, journeyDallas05]) {
      this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision<? AND status IN ('READY','APPROACH','RACING')`)
        .run(Date.now(), mission.id, mission.courseRevision);
    }
    if (!columns.some(column => column.name === 'golden_championship_gate_index')) {
      this.database.exec('ALTER TABLE journey_attempts ADD COLUMN golden_championship_gate_index INTEGER NOT NULL DEFAULT -1 CHECK(golden_championship_gate_index BETWEEN -1 AND 10)');
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(journeyDallas06.id);
    }
    // Retain previous championship clears while retiring in-flight old-course attempts.
    this.database.prepare(`UPDATE journey_attempts SET status='FAILED',finished_at=?,failure_reason='MISSION_UPDATED'
      WHERE mission_id=? AND definition_revision<? AND status IN ('READY','APPROACH','RACING')`)
      .run(Date.now(), journeyDallas06.id, journeyDallas06.courseRevision);
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
    if (!columns.some(column => column.name === 'fortress_left_health')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN fortress_left_health INTEGER');
    if (!columns.some(column => column.name === 'fortress_right_health')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN fortress_right_health INTEGER');
    if (!columns.some(column => column.name === 'final_phase')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN final_phase TEXT');
    // Previous Mission 11 gate attempts cannot resume as transport fights; completions remain intact.
    this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING') AND fortress_left_health IS NULL")
      .run(journeyDallas11.id);
    this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING') AND final_phase IS NULL")
      .run(journeyDallas12.id);
    // Old Mission 9 Heart attempts cannot resume under the transport rules.
    // Historical completions and rewards remain keyed to the same mission ID.
    this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING') AND monster_health IS NULL")
      .run(journeyDallas09.id);
    this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'MISSION_UPDATED' WHERE mission_id = ? AND status IN ('READY','APPROACH','RACING') AND monster_health IS NULL")
      .run(journeyDallas10.id);
    for (const axis of ['x', 'y', 'z']) if (!columns.some(column => column.name === `heart_${axis}`))
      this.database.exec(`ALTER TABLE journey_attempts ADD COLUMN heart_${axis} REAL`);
  }

  get(pilotId: string, attemptId: string): JourneyAttempt | undefined {
    const row = this.database.prepare('SELECT * FROM journey_attempts WHERE pilot_id = ? AND attempt_id = ?')
      .get(pilotId, attemptId) as AttemptRow | undefined;
    const current = row ? attempt(row) : undefined;
    this.remember(current, pilotId);
    return current;
  }

  pause(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET paused_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING') AND paused_at IS NULL`)
      .run(now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }

  expirePaused(now = Date.now()): JourneyAttempt[] {
    this.database.prepare('DELETE FROM journey_continuations WHERE consumed_at IS NULL AND expires_at<=?').run(now);
    for (const [pilotId, cached] of this.activeSnapshots) {
      if (now - cached.usedAt >= 60_000 || cached.attempt.deadlineAt !== null && cached.attempt.deadlineAt <= now)
        this.activeSnapshots.delete(pilotId);
    }
    const rows = this.database.prepare(`UPDATE journey_attempts
      SET status = 'FAILED', failure_reason = 'PAUSE_EXPIRED', finished_at = ?, paused_at = NULL
      WHERE paused_at IS NOT NULL AND paused_at <= ? AND status IN ('READY','APPROACH','RACING')
      RETURNING *`).all(now, now - JOURNEY_PAUSE_LIMIT_MS) as AttemptRow[];
    for (const row of rows) this.activeSnapshots.delete(row.pilot_id);
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
      : missionId===journeyDallas19.id ? this.monsterArrivalBestTime(pilotId) : row.best_time_ms;
    return { completed: true, firstAttemptId: row.first_attempt_id, ...(bestTimeMs === undefined ? {} : { bestTimeMs }) };
  }

  qaMissionAccess(pilotId: string): boolean {
    if (this.allowAllMissionsForQa) return true;
    if (!this.allowPerPilotQaUnlocks) return false;
    return Boolean(this.database.prepare('SELECT 1 FROM journey_qa_unlocked_pilots WHERE pilot_id = ?').get(pilotId));
  }

  canAccessMission(pilotId: string, missionId: string): boolean {
    const slot = journeyMissionOrder.indexOf(missionId);
    return slot >= 0 && (this.qaMissionAccess(pilotId) || slot === 0 || this.progress(pilotId, missionId).completed ||
      Boolean(this.database.prepare('SELECT 1 FROM journey_access_grants WHERE pilot_id=? AND mission_id=?').get(pilotId, missionId)) ||
      this.progress(pilotId, journeyMissionOrder[slot - 1]!).completed);
  }

  chapterOneComplete(pilotId: string): boolean {
    return journeyCatalog.filter(slot => slot.chapter === 1 && slot.implementation === 'playable')
      .every(slot => this.progress(pilotId, slot.id).completed);
  }

  /** Preserve historical records while comparing only the current Rookie Rush course. */
  rookieRushBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND rookie_gate_index = 10 AND definition_revision = ?`)
      .get(pilotId, journeyDallas01.id, journeyDallas01.courseRevision) as { best: number | null };
    return row.best ?? undefined;
  }

  lakeRacerBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND lake_gate_index = 10 AND definition_revision = ?`)
      .get(pilotId, journeyDallas02.id, journeyDallas02.courseRevision) as { best: number | null };
    return row.best ?? undefined;
  }

  goldenAscentBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND ascent_gate_index = 10 AND definition_revision = ?`)
      .get(pilotId, journeyDallas03.id, journeyDallas03.courseRevision) as { best: number | null };
    return row.best ?? undefined;
  }

  downtownSlalomBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND slalom_gate_index = 10 AND definition_revision = ?`)
      .get(pilotId, journeyDallas04.id, journeyDallas04.courseRevision) as { best: number | null };
    return row.best ?? undefined;
  }

  needleRushBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND needle_gate_index = 10 AND definition_revision = ?`)
      .get(pilotId, journeyDallas05.id, journeyDallas05.courseRevision) as { best: number | null };
    return row.best ?? undefined;
  }

  goldenChampionshipBestTime(pilotId: string): number | undefined {
    const row = this.database.prepare(`SELECT MIN(finish_time_ms) AS best FROM journey_attempts
      WHERE pilot_id = ? AND mission_id = ? AND status = 'COMPLETED' AND golden_championship_gate_index = 10 AND definition_revision = ?`)
      .get(pilotId, journeyDallas06.id, journeyDallas06.courseRevision) as { best: number | null };
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
    if (missionId !== journeyDallasCapture01.id && missionId !== journeyDallas01.id && missionId !== journeyDallas02.id && missionId !== journeyDallas03.id && missionId !== journeyDallas04.id && missionId !== journeyDallas05.id && missionId !== journeyDallas06.id && missionId !== journeyDallas07.id && missionId !== journeyDallas08.id && missionId !== journeyDallas09.id && missionId !== journeyDallas10.id && missionId !== journeyDallas11.id && missionId !== journeyDallas12.id && missionId !== journeyDallas13.id && missionId !== journeyDallas14.id && missionId !== journeyDallas15.id && missionId !== journeyDallas16.id && missionId !== journeyDallas17.id && missionId !== journeyDallas18.id && (missionId!==journeyDallas19.id&&missionId!==journeyDallas25.id) && missionId !== journeyDallas20.id && missionId !== journeyDallas21.id && missionId !== journeyDallas22.id && missionId !== journeyDallas23.id && missionId !== journeyDallas24.id) throw new Error('Unknown Journey mission');
    if (!this.canAccessMission(pilotId, missionId)) throw new Error('Journey mission is locked');
    return this.transaction(pilotId, () => {
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', finished_at = ?, failure_reason = 'REPLACED' WHERE pilot_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(now, pilotId);
      const attemptId = randomUUID();
      this.database.prepare("INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,target_id,secondary_target_id,status,created_at,double_phase,legendary_phase,lake_gate_index,ascent_gate_index,slalom_gate_index,needle_gate_index,golden_championship_gate_index) VALUES (?,?,?,?,?,?,?,'READY',?,?,?,?,?,?,?,?)")
        .run(attemptId, pilotId, missionId, journeyDallas01.cityId, aircraftType,
          null, null, now,
          null,
          missionId === journeyDallas24.id ? 'GATES' : null,
          missionId === journeyDallas02.id ? 0 : -1,
          missionId === journeyDallas03.id ? 0 : -1,
          missionId === journeyDallas04.id ? 0 : -1,
          missionId === journeyDallas05.id ? 0 : -1,
          missionId === journeyDallas06.id ? 0 : -1);
      if (missionId === journeyDallas02.id || missionId === journeyDallas03.id) this.database.prepare('UPDATE journey_attempts SET definition_revision=? WHERE attempt_id=?').run(missionId === journeyDallas02.id ? journeyDallas02.courseRevision : journeyDallas03.courseRevision,attemptId);
      if (missionId === journeyDallas04.id || missionId === journeyDallas05.id) this.database.prepare('UPDATE journey_attempts SET definition_revision=? WHERE attempt_id=?').run(missionId === journeyDallas04.id ? journeyDallas04.courseRevision : journeyDallas05.courseRevision,attemptId);
      if (missionId === journeyDallas06.id) this.database.prepare('UPDATE journey_attempts SET definition_revision=? WHERE attempt_id=?').run(journeyDallas06.courseRevision,attemptId);
      if (missionId === journeyDallas01.id) this.database.prepare('UPDATE journey_attempts SET definition_revision=? WHERE attempt_id=?').run(journeyDallas01.courseRevision,attemptId);
      if (missionId === journeyDallas07.id || missionId === journeyDallas08.id || missionId === journeyDallas13.id || missionId === journeyDallas14.id || missionId === journeyDallas15.id || missionId === journeyDallas16.id || missionId === journeyDallas17.id || missionId === journeyDallas18.id || (missionId===journeyDallas19.id||missionId===journeyDallas25.id)||missionId===journeyDallas20.id||missionId===journeyDallas21.id||missionId===journeyDallas22.id||missionId===journeyDallas23.id) this.database.prepare('UPDATE journey_attempts SET definition_revision = ? WHERE attempt_id = ?').run(missionId===journeyDallas19.id?3:(missionId===journeyDallas17.id||missionId===journeyDallas18.id||missionId===journeyDallas25.id||missionId===journeyDallas20.id||missionId===journeyDallas21.id||missionId===journeyDallas22.id||missionId===journeyDallas23.id)?2:1,attemptId);
      if (missionId === journeyDallas11.id || missionId === journeyDallas12.id) {
        const mission = missionId === journeyDallas12.id ? journeyDallas12 : journeyDallas11;
        this.database.prepare('UPDATE journey_attempts SET monster_health = ?, fortress_left_health = ?, fortress_right_health = ?, final_phase = ? WHERE attempt_id = ?')
          .run(mission.coreHealth, mission.turretHealth, mission.turretHealth, missionId === journeyDallas12.id ? 'ESCORTS' : null, attemptId);
      }
      if (missionId === journeyDallas23.id||missionId === journeyDallas22.id||missionId === journeyDallas21.id||missionId === journeyDallas20.id||(missionId===journeyDallas19.id||missionId===journeyDallas25.id) || missionId === journeyDallas07.id || missionId === journeyDallas08.id || missionId === journeyDallas09.id || missionId === journeyDallas10.id) this.database.prepare('UPDATE journey_attempts SET monster_health = ? WHERE attempt_id = ?')
        .run(missionId===journeyDallas23.id?1000:missionId===journeyDallas22.id?1100:missionId===journeyDallas21.id?900:missionId===journeyDallas25.id?500:missionId === journeyDallas20.id?journeyDallas20.bossHealth:missionId===journeyDallas19.id ? journeyDallas19.bossHealth : missionId === journeyDallas10.id ? journeyDallas10.bossHealth : missionId === journeyDallas09.id ? journeyDallas09.bossHealth : missionId === journeyDallas08.id ? journeyDallas08.bossHealth : journeyDallas07.bossHealth, attemptId);
      return this.get(pilotId, attemptId)!;
    });
  }

  approach(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare("UPDATE journey_attempts SET status = 'APPROACH', prepare_until = CASE WHEN mission_id IN (?,?) THEN ? WHEN mission_id IN (?,?,?) THEN ? WHEN mission_id = ? THEN ? ELSE NULL END WHERE pilot_id = ? AND attempt_id = ? AND status = 'READY'")
      .run(journeyDallas19.id,journeyDallas25.id, now + journeyDallas19.prepareMs,journeyDallas20.id,journeyDallas21.id,journeyDallas23.id,now+journeyDallas20.prepareMs,
        journeyDallas22.id, now + journeyDallas22.prepareMs, pilotId, attemptId);
    const current = this.get(pilotId, attemptId);
    return current?.status === 'APPROACH' ? current : undefined;
  }

  /** Only the owned countdown handoff starts this objective and its deadline. */
  startTerritoryCapture(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const changed = this.database.prepare(`UPDATE journey_attempts SET status='RACING',started_at=?,deadline_at=?,hold_updated_at=?
      WHERE pilot_id=? AND attempt_id=? AND mission_id=? AND status='APPROACH' AND paused_at IS NULL`)
      .run(now, now + journeyDallasCapture01.timeLimitMs, now, pilotId, attemptId, journeyDallasCapture01.id).changes;
    return changed ? this.get(pilotId, attemptId) : undefined;
  }

  /** Server territory ticks supply eligibility, never client progress or completion events. */
  advanceTerritoryCapture(pilotId: string, attemptId: string, eligible: boolean, now = Date.now(), resetProgress = false): JourneyAttempt | undefined {
    return this.transaction(pilotId, wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallasCapture01.id || current.status !== 'RACING' ||
          current.pausedAt !== null || current.deadlineAt === null || now >= current.deadlineAt ||
          current.holdUpdatedAt === null || now <= current.holdUpdatedAt) return undefined;
      const elapsed = now - current.holdUpdatedAt;
      // Never credit startup, reconnection or stalled-tick catch-up time.
      const tickMs = eligible && !resetProgress && elapsed <= 800 ? Math.min(400, elapsed) : 0;
      const territory = territoriesForCity(journeyDallasCapture01.cityId).find(item => item.id === journeyDallasCapture01.territoryId)!;
      const captureMs = Math.min(journeyDallasCapture01.captureDurationMs, (resetProgress ? 0 : current.captureMs) +
        Math.round(tickMs * territory.captureWeight));
      this.database.prepare('UPDATE journey_attempts SET capture_ms=?,hold_updated_at=? WHERE pilot_id=? AND attempt_id=?')
        .run(captureMs, now, pilotId, attemptId);
      if (captureMs >= journeyDallasCapture01.captureDurationMs) {
        const elapsedMs = now - current.startedAt!;
        const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
          (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
          .run(pilotId, current.missionId, attemptId, now, elapsedMs).changes === 1;
        let credited = 0;
        if (first) {
          const reward = wallet.credit({pilotId, currency:'CREDITS',amount:journeyDallasCapture01.firstClearCredits,
            reason:'MISSION_REWARD',idempotencyKey:`journey:${current.missionId}`,referenceId:current.missionId,createdAt:now});
          if (!reward.ok) throw new Error('Journey territory reward failed');
          credited = journeyDallasCapture01.firstClearCredits;
        } else this.database.prepare(`UPDATE journey_completions SET clear_count=clear_count+1,best_time_ms=MIN(best_time_ms,?)
          WHERE pilot_id=? AND mission_id=?`).run(elapsedMs,pilotId,current.missionId);
        this.database.prepare(`UPDATE journey_attempts SET status='COMPLETED',finished_at=?,finish_time_ms=?,first_clear_credits=?
          WHERE pilot_id=? AND attempt_id=?`).run(now,elapsedMs,credited,pilotId,attemptId);
      }
      return this.get(pilotId, attemptId);
    });
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
    return undefined; // M20 no longer has a race clock or gate completion path.
  }

  /** Start the combat clock after preparation and the authorized countdown handoff. */
  startMonsterArrival(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    const mission=current?.missionId===journeyDallas25.id?journeyDallas25:current?.missionId===journeyDallas23.id?journeyDallas23:current?.missionId===journeyDallas22.id?journeyDallas22:current?.missionId===journeyDallas21.id?journeyDallas21:current?.missionId===journeyDallas20.id?journeyDallas20:journeyDallas19;
    if (current?.missionId !== mission.id || current.status !== 'APPROACH' ||
      current.prepareUntil === null || now < current.prepareUntil) return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = ?,
      deadline_at = ? WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ?
      AND status = 'APPROACH' AND prepare_until <= ?`).run(now, now + mission.timeLimitMs,
      pilotId, attemptId, mission.id, now).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Asset readiness is an owned lifecycle signal, never client progress. */
  startGiantIncoming(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    const mission = current?.missionId === journeyDallas12.id ? journeyDallas12 : current?.missionId === journeyDallas11.id ? journeyDallas11 : current?.missionId === journeyDallas10.id ? journeyDallas10 : current?.missionId === journeyDallas09.id ? journeyDallas09 : current?.missionId === journeyDallas08.id ? journeyDallas08 : journeyDallas07;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = ?, deadline_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'APPROACH'`)
      .run(now, now + mission.timeLimitMs, pilotId, attemptId, mission.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }
  hitTransport(pilotId: string, attemptId: string, now = Date.now(), damage?: number): JourneyAttempt | undefined {
    const missionId = this.get(pilotId, attemptId)?.missionId;
    if (missionId === journeyDallas11.id || missionId === journeyDallas12.id) return undefined;
    const mission = missionId === journeyDallas10.id ? journeyDallas10 : missionId === journeyDallas09.id ? journeyDallas09 : missionId === journeyDallas08.id ? journeyDallas08 : journeyDallas07;
    return this.hitEncounter(pilotId, attemptId, mission, now, damage);
  }

  /** Called only after the server projectile sweep identifies a fortress component. */
  hitFortressComponent(pilotId: string, attemptId: string, component: 'left' | 'right' | 'core', now = Date.now(), damage?: number): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if ((current?.missionId !== journeyDallas11.id && current?.missionId !== journeyDallas12.id) || current.status !== 'RACING' || current.startedAt === null ||
        current.deadlineAt === null || now >= current.deadlineAt) return undefined;
    const hitDamage = damage ?? projectileDamageForAircraft(current.aircraftType);
    if (!Number.isInteger(hitDamage) || hitDamage <= 0) return undefined;
    if (component === 'core') {
      return this.hitEncounter(pilotId, attemptId, current.missionId === journeyDallas12.id ? journeyDallas12 : journeyDallas11, now, hitDamage);
    }
    const column = component === 'left' ? 'fortress_left_health' : 'fortress_right_health';
    const health = component === 'left' ? current.fortressLeftHealth : current.fortressRightHealth;
    if (health === null || health <= 0) return undefined;
    this.database.prepare(`UPDATE journey_attempts SET ${column} = ?, final_phase = CASE WHEN mission_id = ? AND ? = 0 AND ${component === 'left' ? 'fortress_right_health' : 'fortress_left_health'} = 0 THEN 'CORE' ELSE final_phase END WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING' AND ${column} = ?`)
      .run(Math.max(0, health - hitDamage), journeyDallas12.id, Math.max(0, health - hitDamage), pilotId, attemptId, health);
    const updated=this.get(pilotId,attemptId);
    if(updated?.monsterHealth===0)return this.hitEncounter(pilotId,attemptId,current.missionId===journeyDallas12.id?journeyDallas12:journeyDallas11,now,0);
    return updated;
  }

  /** Both assigned escorts must be destroyed before the fortress can be attacked. */
  advanceFinalIntercept(pilotId: string, attemptId: string, bothDestroyed: boolean, now = Date.now()): JourneyAttempt | undefined {
    if (!bothDestroyed) return undefined;
    const changed = this.database.prepare("UPDATE journey_attempts SET final_phase = 'TURRETS' WHERE pilot_id = ? AND attempt_id = ? AND mission_id = ? AND status = 'RACING' AND final_phase = 'ESCORTS' AND target_id IS NOT NULL AND secondary_target_id IS NOT NULL AND deadline_at > ?")
      .run(pilotId, attemptId, journeyDallas12.id, now).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Persist the first two transport escorts once; destroyed escorts never return. */
  assignRearGuardEscort(pilotId: string, attemptId: string, escortId: string, ordinal: 1 | 2 | 3 | 4): JourneyAttempt | undefined {
    const column = ordinal === 1 ? 'target_id' : ordinal===2?'secondary_target_id':ordinal===3?'rear_guard_third_id':'rear_guard_fourth_id';
    const missionId=this.get(pilotId,attemptId)?.missionId;
    if(ordinal>2&&(missionId!==journeyDallas09.id&&missionId!==journeyDallas10.id)||ordinal===4&&missionId===journeyDallas09.id)return undefined;
    const changed = this.database.prepare(`UPDATE journey_attempts SET ${column} = ? WHERE pilot_id = ?
      AND attempt_id = ? AND mission_id IN (?, ?, ?, ?) AND status = 'RACING' AND ${column} IS NULL`)
      .run(escortId, pilotId, attemptId, journeyDallas08.id, journeyDallas09.id, journeyDallas10.id, journeyDallas12.id).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  recordRearGuardKill(pilotId:string,attemptId:string,escortId:string,now=Date.now()):JourneyAttempt|undefined {
    const current=this.get(pilotId,attemptId);
    if(!current||(current.missionId!==journeyDallas08.id&&current.missionId!==journeyDallas09.id&&current.missionId!==journeyDallas10.id&&current.missionId!==journeyDallas12.id)||current.status!=='RACING'||!current.deadlineAt||now>=current.deadlineAt)return undefined;
    const bit=escortId===current.targetId?1:escortId===current.secondaryTargetId?2:escortId===current.rearGuardThirdId?4:escortId===current.rearGuardFourthId?8:0;
    if(!bit||(current.rearGuardKills&bit))return undefined;
    this.database.prepare('UPDATE journey_attempts SET rear_guard_kills = rear_guard_kills | ? WHERE pilot_id=? AND attempt_id=?').run(bit,pilotId,attemptId);
    const mission=current.missionId===journeyDallas12.id?journeyDallas12:current.missionId===journeyDallas10.id?journeyDallas10:current.missionId===journeyDallas09.id?journeyDallas09:journeyDallas08;
    if(current.monsterHealth===0&&(current.rearGuardKills|bit)===(mission.id===journeyDallas10.id?15:mission.id===journeyDallas09.id?7:3))return this.hitEncounter(pilotId,attemptId,mission,now,0);
    return this.get(pilotId,attemptId);
  }

  /** Only the server projectile simulation invokes this after a swept body hit. */
  hitMonster(pilotId: string, attemptId: string, now = Date.now(), damage?: number): JourneyAttempt | undefined {
    const current=this.get(pilotId,attemptId);
    return this.hitEncounter(pilotId, attemptId,current?.missionId===journeyDallas25.id?journeyDallas25:current?.missionId===journeyDallas23.id?journeyDallas23:current?.missionId===journeyDallas22.id?journeyDallas22:current?.missionId===journeyDallas21.id?journeyDallas21:current?.missionId===journeyDallas20.id?journeyDallas20:journeyDallas19, now, damage);
  }

  private hitEncounter(pilotId: string, attemptId: string, mission: {id:string;firstClearCredits:number}, now:number, damage?: number): JourneyAttempt | undefined {
    return this.transaction(pilotId, wallet => {
      const current = this.get(pilotId, attemptId);
      const requiredEscorts=mission.id===journeyDallas08.id?3:mission.id===journeyDallas09.id?7:mission.id===journeyDallas10.id?15:mission.id===journeyDallas12.id?3:0;
      const fortress=mission.id===journeyDallas11.id||mission.id===journeyDallas12.id;
      const completionCheck=damage===0&&current?.monsterHealth===0&&(fortress||requiredEscorts>0);
      if (current?.missionId !== mission.id || current.status !== 'RACING' || current.monsterHealth === null || (current.monsterHealth <= 0 && !completionCheck) ||
        current.startedAt === null || current.deadlineAt === null || now >= current.deadlineAt) return undefined;
      const hitDamage = damage ?? projectileDamageForAircraft(current.aircraftType);
      if (!Number.isFinite(hitDamage) || (hitDamage <= 0 && !completionCheck) || ((mission.id!==journeyDallas19.id&&mission.id!==journeyDallas25.id)&&mission.id!==journeyDallas20.id&&!Number.isInteger(hitDamage))) return undefined;
      const health = Math.max(0, current.monsterHealth - hitDamage);
      if (health > 0 || requiredEscorts>0&&current.rearGuardKills!==requiredEscorts || fortress&&(current.fortressLeftHealth!==0||current.fortressRightHealth!==0)) {
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

  /** Retired M22 objective: legacy gate/landing events cannot award a boss clear. */
  acceptPerfectApproachGate(_pilotId:string,_attemptId:string,_gateIndex:number,_now=Date.now()): JourneyAttempt | undefined {return undefined;}
  resetPerfectApproach(_pilotId:string,_attemptId:string,_expectedCycle:number,_score:number|null=null,_now=Date.now()): JourneyAttempt | undefined {return undefined;}
  recordPerfectApproachLanding(_pilotId:string,_attemptId:string,_airportId:string,_score:number,_touchdownCycle:number,_now=Date.now()): JourneyAttempt | undefined {return undefined;}

  acceptGate(pilotId: string, attemptId: string, gateIndex: number, now = Date.now(), verifiedSpeed?: number): JourneyAttempt | undefined {
    return this.transaction(pilotId, wallet => {
      const current = this.get(pilotId, attemptId);
      if(current?.missionId===journeyDallas20.id||current?.missionId===journeyDallas22.id)return undefined;
      const mission = current?.missionId === journeyDallas01.id ? journeyDallas01 : current?.missionId === journeyDallas02.id ? journeyDallas02 : current?.missionId === journeyDallas03.id ? journeyDallas03 : current?.missionId === journeyDallas04.id ? journeyDallas04 : current?.missionId === journeyDallas05.id ? journeyDallas05 : current?.missionId === journeyDallas06.id ? journeyDallas06 : current?.missionId === journeyDallas20.id ? journeyDallas20 : undefined;
      if (!current || !mission || current.gateIndex !== gateIndex || !['APPROACH', 'RACING'].includes(current.status) ||
        current.missionId === journeyDallas02.id && current.lakeGateIndex < 0 ||
        current.missionId === journeyDallas03.id && current.ascentGateIndex < 0 ||
        current.missionId === journeyDallas04.id && current.slalomGateIndex < 0 ||
        current.missionId === journeyDallas05.id && current.needleGateIndex < 0 ||
        current.missionId === journeyDallas06.id && current.goldenChampionshipGateIndex < 0) return undefined;
      if (current.deadlineAt !== null && now >= current.deadlineAt) return undefined;
      if ((current.missionId === journeyDallas01.id || current.missionId === journeyDallas02.id || current.missionId === journeyDallas03.id || current.missionId === journeyDallas04.id || current.missionId === journeyDallas05.id || current.missionId === journeyDallas06.id) && (!current.startedAt || !current.deadlineAt)) return undefined;
      if (gateIndex === 0 && current.status !== (current.missionId === journeyDallas01.id || current.missionId === journeyDallas02.id || current.missionId === journeyDallas03.id || current.missionId === journeyDallas04.id || current.missionId === journeyDallas05.id || current.missionId === journeyDallas06.id ? 'RACING' : 'APPROACH')) return undefined;
      if (gateIndex > 0 && (current.status !== 'RACING' || !current.startedAt || current.missionId !== journeyDallas16.id && (!current.deadlineAt ||
        (current.missionId === journeyDallas20.id ? now >= current.deadlineAt : now > current.deadlineAt)) ||
        !current.lastGateAt || now - current.lastGateAt < 350)) return undefined;
      if (gateIndex === mission.gates.length - 1) {
        const finishTimeMs = now - current.startedAt!;
        let credited = 0;
        const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
          (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
          .run(pilotId, current.missionId, attemptId, now, finishTimeMs).changes === 1;
        if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
          best_time_ms = CASE WHEN mission_id IN (?, ?, ?, ?, ?, ?) AND COALESCE((SELECT definition_revision FROM journey_attempts
            WHERE attempt_id = journey_completions.first_attempt_id),0) < ? THEN best_time_ms ELSE MIN(best_time_ms, ?) END
          WHERE pilot_id = ? AND mission_id = ?`).run(journeyDallas01.id, journeyDallas02.id, journeyDallas03.id, journeyDallas04.id, journeyDallas05.id, journeyDallas06.id, 'courseRevision' in mission ? mission.courseRevision : 1, finishTimeMs, pilotId, current.missionId);
        if (first) {
          const before = wallet.balances(pilotId)?.credits ?? 0;
          const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: mission.firstClearCredits,
            reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
          if (!reward.ok) throw new Error('Journey first-clear reward failed');
          credited = Math.max(0, (reward.balance ?? before) - before);
        }
        this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', ${current.missionId === journeyDallas01.id ? 'rookie_gate_index' : current.missionId === journeyDallas02.id ? 'lake_gate_index' : current.missionId === journeyDallas03.id ? 'ascent_gate_index' : current.missionId === journeyDallas04.id ? 'slalom_gate_index' : current.missionId === journeyDallas05.id ? 'needle_gate_index' : current.missionId === journeyDallas06.id ? 'golden_championship_gate_index' : current.missionId === journeyDallas11.id || current.missionId === journeyDallas12.id || current.missionId === journeyDallas13.id || current.missionId === journeyDallas16.id || current.missionId === journeyDallas20.id ? 'championship_gate_index' : 'gate_index'} = ?, last_gate_at = ?,
          finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, now, finishTimeMs, credited, attemptId);
      } else {
        this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', ${current.missionId === journeyDallas01.id ? 'rookie_gate_index' : current.missionId === journeyDallas02.id ? 'lake_gate_index' : current.missionId === journeyDallas03.id ? 'ascent_gate_index' : current.missionId === journeyDallas04.id ? 'slalom_gate_index' : current.missionId === journeyDallas05.id ? 'needle_gate_index' : current.missionId === journeyDallas06.id ? 'golden_championship_gate_index' : current.missionId === journeyDallas11.id || current.missionId === journeyDallas12.id || current.missionId === journeyDallas13.id || current.missionId === journeyDallas16.id || current.missionId === journeyDallas20.id ? 'championship_gate_index' : 'gate_index'} = ?,
          started_at = COALESCE(started_at, ?), deadline_at = COALESCE(deadline_at, ?), last_gate_at = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, current.missionId === journeyDallas16.id ? null : now + ('timeLimitMs' in mission ? mission.timeLimitMs : 0), now, attemptId);
      }
      return this.get(pilotId, attemptId);
    });
  }

  /** Persist the two mission-owned Hunters only after their server-accepted gates. */
  assignCrossfireHunter(pilotId:string,attemptId:string,hunterId:string,ordinal:1|2):JourneyAttempt|undefined {
    const current=this.get(pilotId,attemptId);
    if(!current||current.missionId!==journeyDallas16.id||current.status!=='APPROACH'||!hunterId||
      (ordinal===1?current.targetId!==null:current.targetId===null||current.secondaryTargetId!==null||current.targetId===hunterId))return undefined;
    const column=ordinal===1?'target_id':'secondary_target_id';
    const changed=this.database.prepare(`UPDATE journey_attempts SET ${column}=? WHERE pilot_id=? AND attempt_id=? AND status='APPROACH' AND ${column} IS NULL AND definition_revision=1`)
      .run(hunterId,pilotId,attemptId).changes;
    return changed===1?this.get(pilotId,attemptId):undefined;
  }
  startDoubleThreat(pilotId:string,attemptId:string,now=Date.now()):JourneyAttempt|undefined {
    const changed=this.database.prepare(`UPDATE journey_attempts SET status='RACING',started_at=?,deadline_at=? WHERE pilot_id=? AND attempt_id=?
      AND mission_id=? AND status='APPROACH' AND target_id IS NOT NULL AND secondary_target_id IS NOT NULL AND definition_revision=1`)
      .run(now,now+journeyDallas16.timeLimitMs,pilotId,attemptId,journeyDallas16.id).changes;
    return changed===1?this.get(pilotId,attemptId):undefined;
  }

  /** Assign each server-owned target before the encounter clock can start. */
  assignFirstContact(pilotId: string, attemptId: string, targetId: string, ordinal: 1 | 2 | 3 | 4 = 1): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || !targetId || !Number.isInteger(ordinal) || ordinal < 1 || current.status !== 'APPROACH') return undefined;
    const count = current.missionId === journeyDallas18.id ? journeyDallas18.enemies.length : current.missionId === journeyDallas17.id ? journeyDallas17.enemies.length : 1;
    if (ordinal > count) return undefined;
    const squad = current.missionId === journeyDallas17.id || current.missionId === journeyDallas18.id;
    if (!squad && ordinal !== 1 || !([journeyDallas13.id, journeyDallas14.id, journeyDallas17.id, journeyDallas18.id] as readonly string[]).includes(current.missionId)) return undefined;
    const ids = [current.targetId, current.secondaryTargetId, current.rearGuardThirdId, current.rearGuardFourthId];
    if (ids.includes(targetId) || ids[ordinal - 1] || ids.slice(0, ordinal - 1).some(id => !id)) return undefined;
    const column = ordinal === 1 ? 'target_id' : ordinal === 2 ? 'secondary_target_id' : ordinal === 3 ? 'rear_guard_third_id' : 'rear_guard_fourth_id';
    const changed = this.database.prepare(`UPDATE journey_attempts SET ${column} = ? WHERE pilot_id = ? AND attempt_id = ?
      AND status = 'APPROACH' AND ${column} IS NULL AND definition_revision = ?`)
      .run(targetId, pilotId, attemptId, squad ? 2 : 1).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  /** Start combat time at the authorized countdown handoff. */
  startFirstContact(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || (current.missionId !== journeyDallas13.id && current.missionId !== journeyDallas14.id &&
      current.missionId !== journeyDallas17.id && current.missionId !== journeyDallas18.id)) return undefined;
    if (current.missionId === journeyDallas17.id && (!current.secondaryTargetId || !current.rearGuardThirdId)) return undefined;
    if (current.missionId === journeyDallas18.id && (!current.secondaryTargetId || !current.rearGuardThirdId || !current.rearGuardFourthId)) return undefined;
    const limit = current.missionId === journeyDallas18.id ? journeyDallas18.timeLimitMs : current.missionId === journeyDallas17.id ? journeyDallas17.timeLimitMs : current.missionId === journeyDallas14.id ? journeyDallas14.timeLimitMs : journeyDallas13.timeLimitMs;
    const changed = this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = ?, deadline_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND mission_id IN (?,?,?,?) AND status = 'APPROACH'
      AND target_id IS NOT NULL AND started_at IS NULL AND definition_revision = ?`)
      .run(now, now + limit, pilotId, attemptId, journeyDallas13.id, journeyDallas14.id, journeyDallas17.id, journeyDallas18.id, current.missionId === journeyDallas17.id || current.missionId === journeyDallas18.id ? 2 : 1).changes;
    return changed === 1 ? this.get(pilotId, attemptId) : undefined;
  }

  assignHunter(pilotId:string,attemptId:string,targetId:string,previousTargetId:string|null=null,now=Date.now()):JourneyAttempt|undefined {
    if(!targetId||previousTargetId!==null)return undefined;
    const changed=this.database.prepare(`UPDATE journey_attempts SET target_id=? WHERE pilot_id=? AND attempt_id=?
      AND mission_id=? AND status='APPROACH' AND target_id IS NULL AND definition_revision=1`)
      .run(targetId,pilotId,attemptId,journeyDallas15.id).changes;
    return changed===1?this.get(pilotId,attemptId):undefined;
  }

  startPursuit(pilotId:string,attemptId:string,now=Date.now()):JourneyAttempt|undefined {
    const changed=this.database.prepare(`UPDATE journey_attempts SET status='RACING',started_at=?,deadline_at=?
      WHERE pilot_id=? AND attempt_id=? AND mission_id=? AND status='APPROACH' AND target_id IS NOT NULL AND definition_revision=1`)
      .run(now,now+journeyDallas15.timeLimitMs,pilotId,attemptId,journeyDallas15.id).changes;
    return changed===1?this.get(pilotId,attemptId):undefined;
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
    return this.transaction(pilotId, wallet => {
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

  /** Only confirmed destruction of the encounter's assigned enemy can complete combat. */
  completeHunter(pilotId: string, attemptId: string, targetId: string, now = Date.now()): JourneyAttempt | undefined {
    return this.transaction(pilotId, wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || (current.missionId !== journeyDallas15.id && current.missionId !== journeyDallas13.id && current.missionId !== journeyDallas14.id && current.missionId !== journeyDallas16.id && current.missionId !== journeyDallas17.id && current.missionId !== journeyDallas18.id) ||
        current.status !== 'RACING' || (current.missionId===journeyDallas16.id || current.missionId===journeyDallas17.id || current.missionId===journeyDallas18.id ? ![current.targetId,current.secondaryTargetId,...(current.missionId===journeyDallas17.id||current.missionId===journeyDallas18.id?[current.rearGuardThirdId]:[]),...(current.missionId===journeyDallas18.id?[current.rearGuardFourthId]:[])].includes(targetId) : current.targetId !== targetId) ||
        (current.startedAt === null || current.deadlineAt === null || now >= current.deadlineAt || !this.canAccessMission(pilotId, current.missionId))) return undefined;
      if(current.missionId===journeyDallas16.id || current.missionId===journeyDallas17.id || current.missionId===journeyDallas18.id){
        const bit=current.targetId===targetId?1:current.secondaryTargetId===targetId?2:current.rearGuardThirdId===targetId?4:8;
        if(current.crossfireKills&bit)return undefined;
        const kills=current.crossfireKills|bit;
        this.database.prepare('UPDATE journey_attempts SET crossfire_kills=? WHERE pilot_id=? AND attempt_id=?').run(kills,pilotId,attemptId);
        if(kills!==(current.missionId===journeyDallas18.id?15:current.missionId===journeyDallas17.id?7:3))return this.get(pilotId,attemptId);
      }
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)`)
        .run(pilotId, current.missionId, attemptId, now).changes === 1;
      if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
        .run(pilotId, current.missionId);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: current.missionId === journeyDallas13.id ? journeyDallas13.firstClearCredits : current.missionId === journeyDallas14.id ? journeyDallas14.firstClearCredits : current.missionId===journeyDallas16.id ? journeyDallas16.firstClearCredits : current.missionId===journeyDallas18.id ? journeyDallas18.firstClearCredits : current.missionId===journeyDallas17.id ? journeyDallas17.firstClearCredits : journeyDallas15.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
        if (!reward.ok) throw new Error('Journey Hunter reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', finished_at = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`).run(now, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  /** Retired M23 objectives: stale aircraft and heart events cannot award a boss clear. */
  assignDoubleHunter(_pilotId:string,_attemptId:string,_hunterId:string,_ordinal:1|2,_now=Date.now()):JourneyAttempt|undefined{return undefined;}
  defeatDoubleFirst(_pilotId:string,_attemptId:string,_hunterId:string,_heart:{x:number;y:number;z:number}):JourneyAttempt|undefined{return undefined;}
  collectDoubleHeart(_pilotId:string,_attemptId:string,_heartId:string,_now=Date.now()):JourneyAttempt|undefined{return undefined;}
  defeatDoubleSecond(_pilotId:string,_attemptId:string,_hunterId:string,_now=Date.now()):JourneyAttempt|undefined{return undefined;}

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
    return this.transaction(pilotId, wallet => {
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

  /** Retired M21 objective: old capture events cannot advance the boss mission. */
  updateTwoFronts(_pilotId:string,_attemptId:string,_territoryId:string,_valid:boolean,_monotonicNow:number,_now=Date.now()): JourneyAttempt | undefined {return undefined;}

  fail(pilotId: string, attemptId: string, reason: 'TIME_UP' | 'CRASHED' | 'MONSTER_KILLED' | 'INTERRUPTED' | 'INVALID' | 'PURSUIT_INTERRUPTED' | 'ENEMY_ESCAPED' | 'ENEMY_INTERRUPTED' | 'ACE_INTERRUPTED' | 'CROSSFIRE_INTERRUPTED' | 'DEFENSE_INTERRUPTED' | 'DOUBLE_INTERRUPTED' | 'PAUSE_EXPIRED', now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', failure_reason = ?, finished_at = ?, paused_at = NULL
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING')`)
      .run(reason, now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }

  saveContinuation(pilotId: string, attemptId: string, failedAt: number, payload: object): boolean {
    const current = this.get(pilotId, attemptId);
    if (current?.status !== 'FAILED' || current.finishedAt !== failedAt || current.startedAt === null || current.deadlineAt === null ||
        !['CRASHED','MONSTER_KILLED','TIME_UP','ENEMY_ESCAPED'].includes(current.failureReason ?? '') || !journeyMissionOrder.includes(current.missionId)) return false;
    const serialized = JSON.stringify(payload);
    if (serialized.length > 150_000) return false;
    return this.database.prepare(`INSERT OR IGNORE INTO journey_continuations
      (attempt_id,pilot_id,failed_at,expires_at,payload) VALUES(?,?,?,?,?)`)
      .run(attemptId, pilotId, failedAt, failedAt + 600_000, serialized).changes === 1;
  }

  continuation<T>(pilotId: string, attemptId: string, now = Date.now()): { failedAt: number; expiresAt: number; data: T } | undefined {
    const row = this.database.prepare(`SELECT failed_at,expires_at,payload FROM journey_continuations
      WHERE attempt_id=? AND pilot_id=? AND consumed_at IS NULL AND expires_at>?
      AND NOT EXISTS (SELECT 1 FROM journey_attempts j WHERE j.pilot_id=journey_continuations.pilot_id
        AND j.attempt_id<>journey_continuations.attempt_id AND j.status IN ('READY','APPROACH','RACING'))`)
      .get(attemptId, pilotId, now) as {failed_at: number; expires_at: number; payload: string} | undefined;
    const current = this.get(pilotId, attemptId);
    if (!row || !current || !journeyMissionOrder.includes(current.missionId) || current.status !== 'FAILED' || current.finishedAt !== row.failed_at) return undefined;
    try { return { failedAt: row.failed_at, expiresAt: row.expires_at, data: JSON.parse(row.payload) as T }; }
    catch { return undefined; }
  }

  discardContinuation(pilotId: string, attemptId: string): void {
    this.database.prepare('DELETE FROM journey_continuations WHERE pilot_id=? AND attempt_id=? AND consumed_at IS NULL').run(pilotId, attemptId);
  }

  continuedByAd(pilotId: string, attemptId: string, adAttemptId: string): boolean {
    const receipt = this.database.prepare(`SELECT continuation_key FROM rewarded_ad_attempts
      WHERE attempt_id=? AND pilot_id=? AND status='REWARDED' AND continuation_consumed_at IS NOT NULL`)
      .get(adAttemptId, pilotId) as { continuation_key: string } | undefined;
    return Boolean(receipt?.continuation_key?.startsWith(`${attemptId}:`));
  }

  continueAfterAd(pilotId: string, attemptId: string, adAttemptId: string, now = Date.now()): JourneyAttempt | undefined {
    return this.transaction(pilotId, () => {
      const current = this.get(pilotId, attemptId);
      const mission = current && [journeyDallasCapture01, journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24, journeyDallas25].find(definition => definition.id === current.missionId);
      if (current?.status !== 'FAILED' || current.finishedAt === null || current.startedAt === null || current.deadlineAt === null ||
          !['CRASHED', 'MONSTER_KILLED', 'TIME_UP', 'ENEMY_ESCAPED'].includes(current.failureReason ?? '') || !mission || !('timeLimitMs' in mission)) return undefined;
      if (!this.continuation(pilotId, attemptId, now) || this.database.prepare(`SELECT 1 FROM rewarded_ad_attempts
        WHERE pilot_id=? AND continuation_key LIKE ? AND continuation_consumed_at IS NOT NULL`).get(pilotId, `${attemptId}:%`)) return undefined;
      const key = `${attemptId}:${current.finishedAt}`;
      const consumed = this.database.prepare(`UPDATE rewarded_ad_attempts SET continuation_consumed_at=?
        WHERE attempt_id=? AND pilot_id=? AND status='REWARDED' AND continuation_key=? AND continuation_consumed_at IS NULL`)
        .run(now, adAttemptId, pilotId, key).changes;
      if (!consumed) return undefined;
      this.database.prepare("UPDATE journey_continuations SET consumed_at=?,payload='{}' WHERE attempt_id=? AND pilot_id=?").run(now, attemptId, pilotId);
      const remaining = Math.min(mission.timeLimitMs, Math.max(0, current.deadlineAt - current.finishedAt) + 60_000);
      this.database.prepare(`UPDATE journey_attempts SET status='RACING', failure_reason=NULL, finished_at=NULL,
        finish_time_ms=NULL, paused_at=NULL, started_at=?, deadline_at=?, hold_updated_at=? WHERE pilot_id=? AND attempt_id=?`)
        .run(current.startedAt + now - current.finishedAt, now + remaining, now, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  abandon(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'ABANDONED', finished_at = ?, paused_at = NULL
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING')`)
      .run(now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }
}
