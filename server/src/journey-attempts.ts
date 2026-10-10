import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10 } from '../../shared/journey-mission.mjs';
import { landingGradeForScore, type LandingGrade } from '../../shared/landing-scoring.mjs';
import { PlayerWallet } from './player-wallet.js';

export type JourneyAttemptStatus = 'READY' | 'APPROACH' | 'RACING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
export type JourneyAttempt = {
  attemptId: string; pilotId: string; missionId: string; cityId: string; aircraftType: string;
  targetId: string | null;
  status: JourneyAttemptStatus; gateIndex: number; createdAt: number; startedAt: number | null;
  deadlineAt: number | null; lastGateAt: number | null; finishedAt: number | null;
  finishTimeMs: number | null; firstClearCredits: number; failureReason: string | null;
  holdMs: number; holdUpdatedAt: number | null;
  phase?: 'PREPARING' | 'APPROACH_GATES' | 'RACING' | 'LANDING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
  landingGrade: LandingGrade | null;
};

type AttemptRow = {
  attempt_id: string; pilot_id: string; mission_id: string; city_id: string; aircraft_type: string;
  target_id: string | null;
  status: JourneyAttemptStatus; gate_index: number; created_at: number; started_at: number | null;
  deadline_at: number | null; last_gate_at: number | null; finished_at: number | null;
  finish_time_ms: number | null; first_clear_credits: number; failure_reason: string | null;
  hold_ms: number; hold_updated_at: number | null;
  championship_gate_index: number; landing_grade: LandingGrade | null;
};

function attempt(row: AttemptRow): JourneyAttempt {
  return {
    attemptId: row.attempt_id, pilotId: row.pilot_id, missionId: row.mission_id,
    cityId: row.city_id, aircraftType: row.aircraft_type, targetId: row.target_id, status: row.status,
    gateIndex: row.mission_id === journeyDallas06.id || row.mission_id === journeyDallas10.id ? row.championship_gate_index : row.gate_index,
    ...(row.mission_id === journeyDallas06.id ? { phase: row.status === 'READY' ? 'PREPARING'
      : row.status === 'APPROACH' ? 'APPROACH_GATES'
      : row.status === 'RACING' ? row.championship_gate_index === 6 ? 'LANDING' : 'RACING' : row.status } : {}),
    createdAt: row.created_at, startedAt: row.started_at,
    deadlineAt: row.deadline_at, lastGateAt: row.last_gate_at, finishedAt: row.finished_at,
    finishTimeMs: row.finish_time_ms, firstClearCredits: row.first_clear_credits,
    failureReason: row.failure_reason,
    holdMs: row.hold_ms, holdUpdatedAt: row.hold_updated_at,
    landingGrade: row.landing_grade,
  };
}

export class JourneyAttemptStore {
  private readonly database: DatabaseSync;
  private readonly wallet: PlayerWallet;

  constructor(filePath: string) {
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.wallet = new PlayerWallet(this.database);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS journey_attempts (
        attempt_id TEXT PRIMARY KEY, pilot_id TEXT NOT NULL, mission_id TEXT NOT NULL,
        city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL, target_id TEXT,
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
    if (!columns.some(column => column.name === 'hold_ms')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN hold_ms INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(column => column.name === 'hold_updated_at')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN hold_updated_at INTEGER');
    // Existing gate_index has a 0..4 CHECK; keep it intact for Missions 1–5.
    if (!columns.some(column => column.name === 'championship_gate_index')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN championship_gate_index INTEGER NOT NULL DEFAULT 0 CHECK(championship_gate_index BETWEEN 0 AND 6)');
    if (!columns.some(column => column.name === 'landing_grade')) this.database.exec('ALTER TABLE journey_attempts ADD COLUMN landing_grade TEXT');
  }

  get(pilotId: string, attemptId: string): JourneyAttempt | undefined {
    const row = this.database.prepare('SELECT * FROM journey_attempts WHERE pilot_id = ? AND attempt_id = ?')
      .get(pilotId, attemptId) as AttemptRow | undefined;
    return row ? attempt(row) : undefined;
  }

  progress(pilotId: string, missionId: string = journeyDallas01.id): { completed: boolean; firstAttemptId?: string; bestTimeMs?: number } {
    const row = this.database.prepare('SELECT first_attempt_id, best_time_ms FROM journey_completions WHERE pilot_id = ? AND mission_id = ?')
      .get(pilotId, missionId) as { first_attempt_id: string; best_time_ms: number } | undefined;
    return row ? { completed: true, firstAttemptId: row.first_attempt_id, bestTimeMs: row.best_time_ms } : { completed: false };
  }

  launch(pilotId: string, aircraftType: string, now = Date.now(), missionId: string = journeyDallas01.id): JourneyAttempt {
    if (missionId !== journeyDallas01.id && missionId !== journeyDallas02.id && missionId !== journeyDallas03.id && missionId !== journeyDallas04.id && missionId !== journeyDallas05.id && missionId !== journeyDallas06.id && missionId !== journeyDallas07.id && missionId !== journeyDallas08.id && missionId !== journeyDallas09.id && missionId !== journeyDallas10.id) throw new Error('Unknown Journey mission');
    if (missionId === journeyDallas02.id && !this.progress(pilotId).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas03.id && !this.progress(pilotId, journeyDallas02.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas04.id && !this.progress(pilotId, journeyDallas03.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas05.id && !this.progress(pilotId, journeyDallas04.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas06.id && !this.progress(pilotId, journeyDallas05.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas07.id && !this.progress(pilotId, journeyDallas06.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas08.id && !this.progress(pilotId, journeyDallas07.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas09.id && !this.progress(pilotId, journeyDallas08.id).completed) throw new Error('Journey mission is locked');
    if (missionId === journeyDallas10.id && !this.progress(pilotId, journeyDallas09.id).completed) throw new Error('Journey mission is locked');
    return this.wallet.transaction(() => {
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', finished_at = ?, failure_reason = 'REPLACED' WHERE pilot_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(now, pilotId);
      const attemptId = randomUUID();
      this.database.prepare("INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at) VALUES (?,?,?,?,?,'READY',?)")
        .run(attemptId, pilotId, missionId, journeyDallas01.cityId, aircraftType, now);
      return this.get(pilotId, attemptId)!;
    });
  }

  approach(pilotId: string, attemptId: string): JourneyAttempt | undefined {
    this.database.prepare("UPDATE journey_attempts SET status = 'APPROACH' WHERE pilot_id = ? AND attempt_id = ? AND status = 'READY'")
      .run(pilotId, attemptId);
    const current = this.get(pilotId, attemptId);
    return current?.status === 'APPROACH' ? current : undefined;
  }

  acceptGate(pilotId: string, attemptId: string, gateIndex: number, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      const mission = current?.missionId === journeyDallas01.id ? journeyDallas01 : current?.missionId === journeyDallas03.id ? journeyDallas03 : current?.missionId === journeyDallas05.id ? journeyDallas05 : current?.missionId === journeyDallas06.id ? journeyDallas06 : current?.missionId === journeyDallas07.id ? journeyDallas07 : current?.missionId === journeyDallas10.id ? journeyDallas10 : undefined;
      if (!current || !mission || current.gateIndex !== gateIndex || !['APPROACH', 'RACING'].includes(current.status)) return undefined;
      if (gateIndex === 0 && current.status !== 'APPROACH') return undefined;
      if (gateIndex > 0 && (current.status !== 'RACING' || !current.startedAt || !current.deadlineAt || now > current.deadlineAt ||
        !current.lastGateAt || now - current.lastGateAt < 350)) return undefined;
      if (current.missionId === journeyDallas06.id) {
        if (gateIndex === 5) this.database.prepare(`UPDATE journey_attempts SET championship_gate_index = 6,
          deadline_at = NULL, last_gate_at = ?, finish_time_ms = ? WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
          .run(now, now - current.startedAt!, pilotId, attemptId);
        else this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', championship_gate_index = ?,
          started_at = COALESCE(started_at, ?), deadline_at = COALESCE(deadline_at, ?), last_gate_at = ? WHERE pilot_id = ? AND attempt_id = ?`)
          .run(gateIndex + 1, now, now + journeyDallas06.timeLimitMs, now, pilotId, attemptId);
        return this.get(pilotId, attemptId);
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
        this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', ${current.missionId === journeyDallas10.id ? 'championship_gate_index' : 'gate_index'} = ?, last_gate_at = ?,
          finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, now, finishTimeMs, credited, attemptId);
      } else {
        this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', ${current.missionId === journeyDallas10.id ? 'championship_gate_index' : 'gate_index'} = ?,
          started_at = COALESCE(started_at, ?), deadline_at = COALESCE(deadline_at, ?), last_gate_at = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, now + mission.timeLimitMs, now, attemptId);
      }
      return this.get(pilotId, attemptId);
    });
  }

  completeChampionshipLanding(pilotId: string, attemptId: string, airportId: string, quality: number, now = Date.now()): JourneyAttempt | undefined {
    if (!Number.isInteger(quality) || quality < 1 || quality > 1_000) return undefined;
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas06.id || current.status !== 'RACING' || current.gateIndex !== 6 ||
        current.deadlineAt !== null || current.finishTimeMs === null || current.lastGateAt === null || now <= current.lastGateAt) return undefined;
      const grade = landingGradeForScore(quality);
      if (airportId !== journeyDallas06.finishAirportId) {
        this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', failure_reason = 'WRONG_AIRPORT',
          landing_grade = ?, finished_at = ? WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
          .run(grade, now, pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      if (grade === 'SAFE' || grade === 'ROUGH') {
        this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', failure_reason = 'LANDING_TOO_ROUGH',
          landing_grade = ?, finished_at = ? WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
          .run(grade, now, pilotId, attemptId);
        return this.get(pilotId, attemptId);
      }
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
        .run(pilotId, journeyDallas06.id, attemptId, now, current.finishTimeMs).changes === 1;
      if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
        best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`).run(current.finishTimeMs, pilotId, journeyDallas06.id);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas06.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas06.id}`, referenceId: journeyDallas06.id, createdAt: now });
        if (!reward.ok) throw new Error('Journey championship reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', landing_grade = ?, finished_at = ?,
        first_clear_credits = ? WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`)
        .run(grade, now, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  assignHunter(pilotId: string, attemptId: string, targetId: string, previousTargetId: string | null = null, now = Date.now()): JourneyAttempt | undefined {
    const current = this.get(pilotId, attemptId);
    if (!current || (current.missionId !== journeyDallas02.id && current.missionId !== journeyDallas09.id) || !targetId ||
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

  completeHunter(pilotId: string, attemptId: string, targetId: string, now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas02.id || current.status !== 'RACING' || current.targetId !== targetId ||
        !this.progress(pilotId).completed) return undefined;
      const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
        (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)`)
        .run(pilotId, current.missionId, attemptId, now).changes === 1;
      if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
        .run(pilotId, current.missionId);
      let credited = 0;
      if (first) {
        const before = wallet.balances(pilotId)?.credits ?? 0;
        const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas02.firstClearCredits,
          reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
        if (!reward.ok) throw new Error('Journey Hunter reward failed');
        credited = Math.max(0, (reward.balance ?? before) - before);
      }
      this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', finished_at = ?, first_clear_credits = ?
        WHERE pilot_id = ? AND attempt_id = ? AND status = 'RACING'`).run(now, credited, pilotId, attemptId);
      return this.get(pilotId, attemptId);
    });
  }

  updateTerritoryHold(pilotId: string, attemptId: string, state: 'OUTSIDE' | 'CAPTURING' | 'CONTESTED' | 'OWNED', now = Date.now()): JourneyAttempt | undefined {
    return this.wallet.transaction(wallet => {
      const current = this.get(pilotId, attemptId);
      if (!current || current.missionId !== journeyDallas04.id || !['APPROACH', 'RACING'].includes(current.status)) return undefined;
      if (state === 'OUTSIDE' || state === 'CAPTURING') {
        if (current.holdMs || current.holdUpdatedAt || current.status === 'RACING') this.database.prepare(`UPDATE journey_attempts SET hold_ms = 0, hold_updated_at = NULL, status = 'APPROACH'
          WHERE attempt_id = ?`).run(attemptId);
      } else if (state === 'CONTESTED') {
        if (current.holdUpdatedAt) this.database.prepare('UPDATE journey_attempts SET hold_updated_at = NULL WHERE attempt_id = ?').run(attemptId);
      } else {
        const elapsed = current.holdUpdatedAt === null ? 0 : Math.max(0, Math.min(600, now - current.holdUpdatedAt));
        const holdMs = Math.min(journeyDallas04.holdMs, current.holdMs + elapsed);
        if (holdMs === journeyDallas04.holdMs) {
          const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
            (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
            .run(pilotId, journeyDallas04.id, attemptId, now, now - (current.startedAt ?? now)).changes === 1;
          if (!first) this.database.prepare('UPDATE journey_completions SET clear_count = clear_count + 1 WHERE pilot_id = ? AND mission_id = ?')
            .run(pilotId, journeyDallas04.id);
          let credited = 0;
          if (first) {
            const before = wallet.balances(pilotId)?.credits ?? 0;
            const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas04.firstClearCredits,
              reason: 'MISSION_REWARD', idempotencyKey: `journey:${journeyDallas04.id}`, referenceId: journeyDallas04.id, createdAt: now });
            if (!reward.ok) throw new Error('Journey territory reward failed');
            credited = Math.max(0, (reward.balance ?? before) - before);
          }
          this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', hold_ms = ?, hold_updated_at = NULL,
            finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ?`)
            .run(holdMs, now, now - (current.startedAt ?? now), credited, attemptId);
        } else this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', started_at = COALESCE(started_at, ?),
          hold_ms = ?, hold_updated_at = ? WHERE attempt_id = ?`).run(now, holdMs, now, attemptId);
      }
      return this.get(pilotId, attemptId);
    });
  }

  fail(pilotId: string, attemptId: string, reason: 'TIME_UP' | 'CRASHED' | 'INTERRUPTED' | 'INVALID', now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET status = 'FAILED', failure_reason = ?, finished_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING')`)
      .run(reason, now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }

  abandon(pilotId: string, attemptId: string, now = Date.now()): JourneyAttempt | undefined {
    this.database.prepare(`UPDATE journey_attempts SET status = 'ABANDONED', failure_reason = 'ABANDONED', finished_at = ?
      WHERE pilot_id = ? AND attempt_id = ? AND status IN ('READY','APPROACH','RACING')`)
      .run(now, pilotId, attemptId);
    return this.get(pilotId, attemptId);
  }
}
