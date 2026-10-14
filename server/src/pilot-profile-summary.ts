import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';

// Add released journeys here as cities go live. Counts are derived from this
// catalog, never from a client-supplied progress value.
const releasedJourneys = [{ cityId: 'dallas', chapters: [
  [journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06],
  [journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12],
  [journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18],
  [journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24],
] }] as const;

const combatMissions = new Set<string>([journeyDallas07.id, journeyDallas15.id,
  journeyDallas19.id, journeyDallas23.id, journeyDallas24.id]);
const knownMissions = new Set<string>(releasedJourneys.flatMap(city => city.chapters.flatMap(chapter => chapter.map(mission => mission.id))));
const eligibleCreditReasons = [
  'FLIGHT_REWARD', 'MISSION_REWARD', 'LANDING_REWARD', 'COMBAT_REWARD', 'CHALLENGE_REWARD',
  'EVENT_REWARD', 'TERRITORY_REWARD', 'OBJECTIVE_REWARD', 'DISCOVERY_REWARD', 'INTERCITY_REWARD',
  'SEASON_REWARD', 'WEEKLY_REWARD', 'DAILY_REWARD', 'REWARDED_AD', 'REFERRAL_INVITER', 'REFERRAL_NEW_PLAYER',
] as const;
const minTrustedTime = Date.UTC(2020, 0, 1);

export type ProfileAchievement = { key: string; title: string; description: string; category: 'MISSION'; earnedAt: number };
export type PilotProfileSummary = {
  publicPilotId: string;
  lifetimeCreditsEarned: number;
  singlePlayer: {
    missionsCompleted: number; missionsTotal: number;
    chaptersCompleted: number; chaptersTotal: number;
    citiesCompleted: number; citiesTotal: number;
    overallProgress: number; totalScore: number;
    aircraftOwned: number; aircraftTotal: number;
  };
  latestAchievements: ProfileAchievement[];
  serverWeekStartsAt: number;
  serverNow: number;
};

const achievementCopy: Record<string, Pick<ProfileAchievement, 'title' | 'description'>> = {
  first_mission: { title: 'FIRST MISSION', description: 'Completed your first mission.' },
  first_combat: { title: 'FIRST COMBAT WIN', description: 'Won your first combat mission.' },
  smooth_landing: { title: 'SMOOTH LANDING', description: 'Made a high-quality landing.' },
};

export class PilotProfileSummaryStore {
  private readonly database: DatabaseSync;

  constructor(filePath: string) {
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS pilot_public_profiles (
        pilot_id TEXT PRIMARY KEY REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        public_id TEXT NOT NULL UNIQUE,
        credit_baseline INTEGER NOT NULL CHECK(credit_baseline >= 0),
        baseline_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pilot_achievements (
        pilot_id TEXT NOT NULL REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        achievement_key TEXT NOT NULL,
        earned_at INTEGER NOT NULL,
        PRIMARY KEY(pilot_id, achievement_key)
      );
      CREATE INDEX IF NOT EXISTS pilot_achievements_recent ON pilot_achievements(pilot_id, earned_at DESC);
    `);
    // Each pilot's baseline is snapshotted on first Profile read. The ledger
    // supplies subsequent earnings even if that read happens after deployment.
  }

  private ensurePublicProfile(pilotId: string): { public_id: string; credit_baseline: number } {
    const existing = this.database.prepare('SELECT public_id,credit_baseline FROM pilot_public_profiles WHERE pilot_id=?')
      .get(pilotId) as { public_id: string; credit_baseline: number } | undefined;
    if (existing) return existing;
    const row = this.database.prepare('SELECT credits FROM player_profiles WHERE pilot_id=?')
      .get(pilotId) as { credits: number } | undefined;
    if (!row) throw new Error('Pilot profile unavailable');
    const ledger = this.database.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) AS net
      FROM wallet_transactions WHERE pilot_id=? AND currency='CREDITS'`).get(pilotId) as { net: number };
    // Pre-ledger earnings already spent have no durable record; the remaining
    // authoritative pre-ledger balance is the only defensible migration base.
    const baseline = Math.max(0, row.credits - ledger.net);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publicId = `AC-${randomBytes(8).toString('hex').toUpperCase()}`;
      try {
        this.database.prepare('INSERT OR IGNORE INTO pilot_public_profiles(pilot_id,public_id,credit_baseline,baseline_at) VALUES (?,?,?,?)')
          .run(pilotId, publicId, baseline, Date.now());
        const stored = this.database.prepare('SELECT public_id,credit_baseline FROM pilot_public_profiles WHERE pilot_id=?')
          .get(pilotId) as { public_id: string; credit_baseline: number } | undefined;
        if (stored) return stored;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) throw error;
      }
    }
    throw new Error('Could not assign public Pilot ID');
  }

  private grant(pilotId: string, key: string, earnedAt: number, now: number): void {
    if (!Number.isSafeInteger(earnedAt) || earnedAt < minTrustedTime || earnedAt > now + 300_000) return;
    this.database.prepare('INSERT OR IGNORE INTO pilot_achievements(pilot_id,achievement_key,earned_at) VALUES (?,?,?)')
      .run(pilotId, key, earnedAt);
  }

  // Called only by the server after a scored landing; never by a client claim.
  recordSmoothLanding(pilotId: string, quality: number, now = Date.now()): void {
    if (quality >= 780) this.grant(pilotId, 'smooth_landing', now, now);
  }

  summary(pilotId: string, now = Date.now()): PilotProfileSummary {
    const identity = this.ensurePublicProfile(pilotId);
    const row = this.database.prepare('SELECT score,owned_aircraft FROM player_profiles WHERE pilot_id=?')
      .get(pilotId) as { score: number; owned_aircraft: string };
    const allCompletions = this.database.prepare('SELECT mission_id,completed_at FROM journey_completions WHERE pilot_id=?')
      .all(pilotId) as Array<{ mission_id: string; completed_at: number }>;
    const completions = new Map(allCompletions.filter(item => knownMissions.has(item.mission_id))
      .map(item => [item.mission_id, item.completed_at]));
    const chapters = releasedJourneys.flatMap(city => city.chapters);
    const missionsTotal = chapters.reduce((count, chapter) => count + chapter.length, 0);
    const missionsCompleted = completions.size;
    const chaptersCompleted = chapters.filter(chapter => chapter.every(mission => completions.has(mission.id))).length;
    const citiesCompleted = releasedJourneys.filter(city => city.chapters.every(chapter => chapter.every(mission => completions.has(mission.id)))).length;
    const trusted = (time: number): boolean => Number.isSafeInteger(time) && time >= minTrustedTime && time <= now + 300_000;
    const oldest = [...completions.values()].sort((a, b) => a - b)[0];
    if (oldest !== undefined && trusted(oldest)) this.grant(pilotId, 'first_mission', oldest, now);
    const combatAt = [...completions].filter(([id]) => combatMissions.has(id)).map(([, time]) => time)
      .sort((a, b) => a - b)[0];
    if (combatAt !== undefined && trusted(combatAt)) this.grant(pilotId, 'first_combat', combatAt, now);
    for (const city of releasedJourneys) {
      for (const [chapterIndex, chapter] of city.chapters.entries()) {
        if (chapter.every(mission => trusted(completions.get(mission.id) ?? 0))) {
          this.grant(pilotId, `chapter:${city.cityId}:${chapterIndex + 1}`,
            Math.max(...chapter.map(mission => completions.get(mission.id)!)), now);
        }
      }
      if (city.chapters.every(chapter => chapter.every(mission => trusted(completions.get(mission.id) ?? 0)))) {
        this.grant(pilotId, `city:${city.cityId}`,
          Math.max(...city.chapters.flatMap(chapter => chapter.map(mission => completions.get(mission.id)!))), now);
      }
    }
    const landing = this.database.prepare("SELECT value,achieved_at FROM pilot_records WHERE pilot_id=? AND record_type='best_landing'")
      .get(pilotId) as { value: number; achieved_at: number } | undefined;
    if (landing && landing.value >= 780) this.grant(pilotId, 'smooth_landing', landing.achieved_at, now);
    const earned = this.database.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM wallet_transactions
      WHERE pilot_id=? AND currency='CREDITS' AND direction='CREDIT' AND reason IN (${eligibleCreditReasons.map(() => '?').join(',')})`)
      .get(pilotId, ...eligibleCreditReasons) as { total: number };
    const achievements = this.database.prepare('SELECT achievement_key,earned_at FROM pilot_achievements WHERE pilot_id=? ORDER BY earned_at DESC, achievement_key DESC LIMIT 3')
      .all(pilotId) as Array<{ achievement_key: string; earned_at: number }>;
    let owned: unknown;
    try { owned = JSON.parse(row.owned_aircraft); } catch { owned = []; }
    const ownedSet = new Set(Array.isArray(owned) ? owned.filter((value): value is string => typeof value === 'string') : []);
    ownedSet.add('trainer');
    const day = new Date(now); const weekday = (day.getUTCDay() + 6) % 7;
    const serverWeekStartsAt = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - weekday);
    return {
      publicPilotId: identity.public_id,
      lifetimeCreditsEarned: identity.credit_baseline + earned.total,
      singlePlayer: {
        missionsCompleted, missionsTotal, chaptersCompleted, chaptersTotal: chapters.length,
        citiesCompleted, citiesTotal: releasedJourneys.length,
        overallProgress: missionsTotal ? Math.round(100 * missionsCompleted / missionsTotal) : 0,
        totalScore: row.score,
        aircraftOwned: aircraftDisplayOrder.filter(type => ownedSet.has(type)).length,
        aircraftTotal: aircraftDisplayOrder.length,
      },
      latestAchievements: achievements.flatMap(({ achievement_key, earned_at }) => {
        const chapter = /^chapter:([^:]+):(\d+)$/.exec(achievement_key);
        const city = /^city:([^:]+)$/.exec(achievement_key);
        const copy = chapter
          ? { title: `CHAPTER ${chapter[2]} COMPLETE`, description: `Finished ${chapter[1]} Chapter ${chapter[2]}.` }
          : city ? { title: 'CITY COMPLETE', description: `Finished every ${city[1]} mission.` }
            : achievementCopy[achievement_key];
        return copy ? [{ key: achievement_key, ...copy, category: 'MISSION' as const, earnedAt: earned_at }] : [];
      }),
      serverWeekStartsAt, serverNow: now,
    };
  }
}
