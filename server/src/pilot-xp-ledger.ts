import { DatabaseSync } from 'node:sqlite';
import { pilotLevelForXp, pilotXpRewards, utcDayId } from '../../shared/pilot-progression.mjs';

export type XpSource = 'MISSION_FIRST' | 'MISSION_REPLAY' | 'SKY_DUEL_WIN' | 'SKY_DUEL_LOSS' |
  'AI_KILL' | 'DISTANCE' | 'LANDING' | 'DISCOVERY' | 'TERRITORY' | 'EVENT';
export type XpAward = {
  pilotId: string; source: XpSource; eventId: string; now: number;
  cityId?: string; missionId?: string; matchId?: string; difficulty?: keyof typeof pilotXpRewards.mission;
  pairKey?: string;
};
export type XpAwardResult = { awarded: boolean; amount: number; beforeLevel: number; afterLevel: number; reason?: 'DUPLICATE' | 'LIMIT' | 'INELIGIBLE' };

const dailyCaps: Partial<Record<XpSource, number>> = {
  MISSION_REPLAY: 60, SKY_DUEL_WIN: 400, SKY_DUEL_LOSS: 400,
  AI_KILL: 150, DISTANCE: 100, LANDING: 100, TERRITORY: 150, EVENT: 150,
};
const eventIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,159}$/;

function xpAmount(award: XpAward): number {
  switch (award.source) {
    case 'MISSION_FIRST': return award.difficulty ? pilotXpRewards.mission[award.difficulty] ?? 0 : 0;
    case 'MISSION_REPLAY': return pilotXpRewards.missionReplay;
    case 'SKY_DUEL_WIN': return pilotXpRewards.skyDuelVictory;
    case 'SKY_DUEL_LOSS': return pilotXpRewards.skyDuelDefeat;
    case 'AI_KILL': return pilotXpRewards.aiKill;
    case 'DISTANCE': return pilotXpRewards.distance5km;
    case 'LANDING': return pilotXpRewards.landing;
    case 'DISCOVERY': return pilotXpRewards.discovery;
    case 'TERRITORY': return pilotXpRewards.territoryCapture;
    case 'EVENT': return pilotXpRewards.event;
  }
}

/** Writes an audit row and the one authoritative XP balance in the same SQLite transaction. */
export class PilotXpLedger {
  constructor(private readonly db: DatabaseSync) {
    db.exec('UPDATE pilot_progression SET xp=0 WHERE xp<0');
    db.exec(`CREATE TABLE IF NOT EXISTS pilot_xp_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pilot_id TEXT NOT NULL REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
      source TEXT NOT NULL, event_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0),
      day_id TEXT NOT NULL, awarded_at INTEGER NOT NULL, city_id TEXT, mission_id TEXT, match_id TEXT, pair_key TEXT,
      UNIQUE(pilot_id, source, event_id)
    );
    CREATE INDEX IF NOT EXISTS pilot_xp_daily ON pilot_xp_ledger(pilot_id,day_id,source);
    CREATE INDEX IF NOT EXISTS pilot_xp_pair_daily ON pilot_xp_ledger(pair_key,day_id,match_id);
    INSERT OR IGNORE INTO pilot_xp_ledger(pilot_id,source,event_id,amount,day_id,awarded_at)
      SELECT pilot_id,'MIGRATION_BASELINE','baseline',MAX(0,xp),'migration',0 FROM pilot_progression;`);
  }

  award(input: XpAward): XpAwardResult {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.awardInTransaction(input);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  awardInTransaction(input: XpAward): XpAwardResult {
    if (!eventIdPattern.test(input.eventId) || !Number.isSafeInteger(input.now) || input.now < 0 ||
      !eventIdPattern.test(input.pilotId) ||
      [input.cityId, input.missionId, input.matchId, input.pairKey].some(id => id !== undefined && !eventIdPattern.test(id))) {
      throw new Error('Invalid XP award identifier');
    }
    const amount = xpAmount(input);
    if (!amount) throw new Error('Invalid XP award source or difficulty');
    const row = this.db.prepare('SELECT xp FROM pilot_progression WHERE pilot_id=?').get(input.pilotId) as { xp: number } | undefined;
    if (!row) throw new Error('Pilot progression missing');
    const beforeLevel = pilotLevelForXp(row.xp);
    const rejected = (reason: 'DUPLICATE' | 'LIMIT'): XpAwardResult => ({ awarded: false, amount: 0, beforeLevel, afterLevel: beforeLevel, reason });
    const day = utcDayId(input.now);
    const eventId = input.eventId;
    if (this.db.prepare('SELECT 1 FROM pilot_xp_ledger WHERE pilot_id=? AND source=? AND event_id=?')
      .get(input.pilotId, input.source, eventId)) return rejected('DUPLICATE');
    const cap = dailyCaps[input.source];
    if (cap !== undefined) {
      const sources = input.source.startsWith('SKY_DUEL') ? ['SKY_DUEL_WIN', 'SKY_DUEL_LOSS'] : [input.source];
      const used = (this.db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM pilot_xp_ledger
        WHERE pilot_id=? AND day_id=? AND source IN (${sources.map(() => '?').join(',')})`)
        .get(input.pilotId, day, ...sources) as { total: number }).total;
      if (used + amount > cap) return rejected('LIMIT');
    }
    if (input.source.startsWith('SKY_DUEL')) {
      if (!input.matchId || !input.pairKey) throw new Error('Sky Duel XP needs match and pair identity');
      const matches = this.db.prepare(`SELECT DISTINCT match_id FROM pilot_xp_ledger
        WHERE day_id=? AND pair_key=? AND source IN ('SKY_DUEL_WIN','SKY_DUEL_LOSS')`).all(day, input.pairKey) as Array<{ match_id: string }>;
      if (matches.length >= 2 && !matches.some(match => match.match_id === input.matchId)) return rejected('LIMIT');
    }
    this.db.prepare(`INSERT INTO pilot_xp_ledger
      (pilot_id,source,event_id,amount,day_id,awarded_at,city_id,mission_id,match_id,pair_key)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(input.pilotId, input.source, eventId, amount, day, input.now,
        input.cityId ?? null, input.missionId ?? null, input.matchId ?? null, input.pairKey ?? null);
    this.db.prepare('UPDATE pilot_progression SET xp=MIN(100000000,MAX(0,xp)+?) WHERE pilot_id=?').run(amount, input.pilotId);
    const afterLevel = pilotLevelForXp(Math.min(100_000_000, Math.max(0, row.xp) + amount));
    return { awarded: true, amount, beforeLevel, afterLevel };
  }
}
