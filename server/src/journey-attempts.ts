import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { journeyDallas01 } from '../../shared/journey-mission.mjs';
import { PlayerWallet } from './player-wallet.js';

export type JourneyAttemptStatus = 'READY' | 'APPROACH' | 'RACING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
export type JourneyAttempt = {
  attemptId: string; pilotId: string; missionId: string; cityId: string; aircraftType: string;
  status: JourneyAttemptStatus; gateIndex: number; createdAt: number; startedAt: number | null;
  deadlineAt: number | null; lastGateAt: number | null; finishedAt: number | null;
  finishTimeMs: number | null; firstClearCredits: number; failureReason: string | null;
};

type AttemptRow = {
  attempt_id: string; pilot_id: string; mission_id: string; city_id: string; aircraft_type: string;
  status: JourneyAttemptStatus; gate_index: number; created_at: number; started_at: number | null;
  deadline_at: number | null; last_gate_at: number | null; finished_at: number | null;
  finish_time_ms: number | null; first_clear_credits: number; failure_reason: string | null;
};

function attempt(row: AttemptRow): JourneyAttempt {
  return {
    attemptId: row.attempt_id, pilotId: row.pilot_id, missionId: row.mission_id,
    cityId: row.city_id, aircraftType: row.aircraft_type, status: row.status,
    gateIndex: row.gate_index, createdAt: row.created_at, startedAt: row.started_at,
    deadlineAt: row.deadline_at, lastGateAt: row.last_gate_at, finishedAt: row.finished_at,
    finishTimeMs: row.finish_time_ms, firstClearCredits: row.first_clear_credits,
    failureReason: row.failure_reason,
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
        city_id TEXT NOT NULL, aircraft_type TEXT NOT NULL,
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
  }

  get(pilotId: string, attemptId: string): JourneyAttempt | undefined {
    const row = this.database.prepare('SELECT * FROM journey_attempts WHERE pilot_id = ? AND attempt_id = ?')
      .get(pilotId, attemptId) as AttemptRow | undefined;
    return row ? attempt(row) : undefined;
  }

  progress(pilotId: string): { completed: boolean; firstAttemptId?: string; bestTimeMs?: number } {
    const row = this.database.prepare('SELECT first_attempt_id, best_time_ms FROM journey_completions WHERE pilot_id = ? AND mission_id = ?')
      .get(pilotId, journeyDallas01.id) as { first_attempt_id: string; best_time_ms: number } | undefined;
    return row ? { completed: true, firstAttemptId: row.first_attempt_id, bestTimeMs: row.best_time_ms } : { completed: false };
  }

  launch(pilotId: string, aircraftType: string, now = Date.now()): JourneyAttempt {
    return this.wallet.transaction(() => {
      this.database.prepare("UPDATE journey_attempts SET status = 'ABANDONED', finished_at = ?, failure_reason = 'REPLACED' WHERE pilot_id = ? AND status IN ('READY','APPROACH','RACING')")
        .run(now, pilotId);
      const attemptId = randomUUID();
      this.database.prepare("INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at) VALUES (?,?,?,?,?,'READY',?)")
        .run(attemptId, pilotId, journeyDallas01.id, journeyDallas01.cityId, aircraftType, now);
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
      if (!current || current.gateIndex !== gateIndex || !['APPROACH', 'RACING'].includes(current.status)) return undefined;
      if (gateIndex === 0 && current.status !== 'APPROACH') return undefined;
      if (gateIndex > 0 && (current.status !== 'RACING' || !current.startedAt || !current.deadlineAt || now > current.deadlineAt ||
        !current.lastGateAt || now - current.lastGateAt < 350)) return undefined;
      if (gateIndex === 3) {
        const finishTimeMs = now - current.startedAt!;
        let credited = 0;
        const first = this.database.prepare(`INSERT OR IGNORE INTO journey_completions
          (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)`)
          .run(pilotId, current.missionId, attemptId, now, finishTimeMs).changes === 1;
        if (!first) this.database.prepare(`UPDATE journey_completions SET clear_count = clear_count + 1,
          best_time_ms = MIN(best_time_ms, ?) WHERE pilot_id = ? AND mission_id = ?`).run(finishTimeMs, pilotId, current.missionId);
        if (first) {
          const before = wallet.balances(pilotId)?.credits ?? 0;
          const reward = wallet.credit({ pilotId, currency: 'CREDITS', amount: journeyDallas01.firstClearCredits,
            reason: 'MISSION_REWARD', idempotencyKey: `journey:${current.missionId}`, referenceId: current.missionId, createdAt: now });
          if (!reward.ok) throw new Error('Journey first-clear reward failed');
          credited = Math.max(0, (reward.balance ?? before) - before);
        }
        this.database.prepare(`UPDATE journey_attempts SET status = 'COMPLETED', gate_index = 4, last_gate_at = ?,
          finished_at = ?, finish_time_ms = ?, first_clear_credits = ? WHERE attempt_id = ?`)
          .run(now, now, finishTimeMs, credited, attemptId);
      } else {
        this.database.prepare(`UPDATE journey_attempts SET status = 'RACING', gate_index = ?,
          started_at = COALESCE(started_at, ?), deadline_at = COALESCE(deadline_at, ?), last_gate_at = ? WHERE attempt_id = ?`)
          .run(gateIndex + 1, now, now + journeyDallas01.timeLimitMs, now, attemptId);
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
