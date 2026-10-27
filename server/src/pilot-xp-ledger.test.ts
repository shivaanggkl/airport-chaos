import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { earnedRankIdForLevel, pilotLevelForXp, pilotTitleForLevel, pilotXpForLevel } from '../../shared/pilot-progression.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { SkyDuelStore } from './sky-duel-store.js';

function databasePath(): string { return join(mkdtempSync(join(tmpdir(), 'airport-xp-')), 'profiles.sqlite'); }
const day = Date.UTC(2026, 0, 1);

test('all 50 level thresholds and seven permanent rank boundaries are exact', () => {
  const boundaries = new Map([[1, 'rookie'], [5, 'pathfinder'], [10, 'aviator'], [15, 'ace'],
    [25, 'elite'], [35, 'sky_commander'], [50, 'legend']]);
  const titles = new Map([[1, 'ROOKIE'], [5, 'PATHFINDER'], [10, 'AVIATOR'], [15, 'ACE'],
    [25, 'ELITE'], [35, 'SKY COMMANDER'], [50, 'LEGEND']]);
  for (let level = 1; level <= 50; level += 1) {
    const expected = 100 * (level - 1) + 25 * (level - 1) ** 2;
    assert.equal(pilotXpForLevel(level), expected);
    assert.equal(pilotLevelForXp(expected), level);
    if (level > 1) assert.equal(pilotLevelForXp(expected - 1), level - 1);
    if (boundaries.has(level)) {
      assert.equal(earnedRankIdForLevel(level), boundaries.get(level));
      assert.equal(pilotTitleForLevel(level), titles.get(level));
    }
  }
  assert.equal(pilotXpForLevel(50), 64_925);
  assert.equal(pilotLevelForXp(1_000_000), 50);
});

test('ledger is durable, idempotent across connections, and enforces UTC caps', () => {
  const path = databasePath();
  const first = new PlayerProfileStore(path);
  first.getOrCreate('pilot-a', 'Pilot A');
  const second = new PlayerProfileStore(path);
  const award = { pilotId: 'pilot-a', source: 'AI_KILL' as const, eventId: 'bot:1', cityId: 'dallas', now: day };
  assert.equal(first.awardVerifiedXp(award)?.result.amount, 15);
  assert.equal(second.awardVerifiedXp(award)?.result.reason, 'DUPLICATE');
  for (let index = 2; index <= 10; index += 1)
    assert.equal(second.awardVerifiedXp({ ...award, eventId: `bot:${index}` })?.result.amount, 15);
  assert.equal(first.awardVerifiedXp({ ...award, eventId: 'bot:11' })?.result.reason, 'LIMIT');
  assert.equal(first.awardVerifiedXp({ ...award, eventId: 'bot:11', now: day + 86_400_000 })?.result.awarded, true);
  assert.equal(first.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 165);
  const reopened = new PlayerProfileStore(path);
  assert.equal(reopened.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 165);
  assert.equal(reopened.awardVerifiedXp({ ...award, eventId: 'bot:12' })?.result.reason, 'LIMIT');
});

test('concurrent retries on separate connections create one XP transaction', async () => {
  const path = databasePath();
  const first = new PlayerProfileStore(path); first.getOrCreate('pilot-a', 'Pilot A');
  const second = new PlayerProfileStore(path);
  const award = { pilotId: 'pilot-a', source: 'AI_KILL' as const, eventId: 'bot:simultaneous', now: day };
  const [a, b] = await Promise.all([first, second].map(store =>
    new Promise<ReturnType<PlayerProfileStore['awardVerifiedXp']>>(resolve => setImmediate(() => resolve(store.awardVerifiedXp(award))))));
  assert.equal(Number(a?.result.awarded) + Number(b?.result.awarded), 1);
  assert.equal(first.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 15);
});

test('replay, distance, landing, territory, event, and discovery limits are persistent', () => {
  const path = databasePath(); const profiles = new PlayerProfileStore(path);
  profiles.getOrCreate('pilot-a', 'Pilot A');
  const caps = [
    ['MISSION_REPLAY', 10, 60], ['DISTANCE', 5, 100], ['LANDING', 25, 100],
    ['TERRITORY', 50, 150], ['EVENT', 50, 150],
  ] as const;
  for (const [source, amount, cap] of caps) {
    for (let index = 0; index < cap / amount; index += 1)
      assert.equal(profiles.awardVerifiedXp({ pilotId: 'pilot-a', source, eventId: `${source}:${index}`, now: day })?.result.amount, amount);
    assert.equal(profiles.awardVerifiedXp({ pilotId: 'pilot-a', source, eventId: `${source}:overflow`, now: day })?.result.reason, 'LIMIT');
  }
  assert.equal(profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'DISCOVERY', eventId: 'dallas:reunion-tower', now: day })?.result.amount, 15);
  assert.equal(profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'DISCOVERY', eventId: 'dallas:reunion-tower', now: day + 86_400_000 })?.result.reason, 'DUPLICATE');
  const reopened = new PlayerProfileStore(path);
  assert.equal(reopened.awardVerifiedXp({ pilotId: 'pilot-a', source: 'LANDING', eventId: 'LANDING:after-restart', now: day })?.result.reason, 'LIMIT');
});

test('Sky Duel has a separate 400 XP UTC cap across wins and losses', () => {
  const profiles = new PlayerProfileStore(databasePath()); profiles.getOrCreate('pilot-a', 'Pilot A');
  for (let index = 0; index < 10; index += 1)
    assert.equal(profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'SKY_DUEL_WIN', eventId: `match-${index}`,
      matchId: `match-${index}`, pairKey: `pilot-a:opponent-${index}`, now: day })?.result.amount, 40);
  assert.equal(profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'SKY_DUEL_LOSS', eventId: 'match-extra',
    matchId: 'match-extra', pairKey: 'pilot-a:opponent-extra', now: day })?.result.reason, 'LIMIT');
});

test('accepted distance accumulates across sessions without replaying capped batches', () => {
  const path = databasePath(); const first = new PlayerProfileStore(path);
  first.getOrCreate('pilot-a', 'Pilot A');
  assert.deepEqual(first.recordAcceptedFlightDistance('pilot-a', 2_500, day), []);
  const second = new PlayerProfileStore(path);
  assert.equal(second.recordAcceptedFlightDistance('pilot-a', 2_500, day)[0]?.amount, 5);
  assert.equal(second.getOrCreate('pilot-a', 'Pilot A').totalDistance, 5_000);
  for (let index = 0; index < 19; index += 1)
    assert.equal(second.recordAcceptedFlightDistance('pilot-a', 5_000, day)[0]?.amount, 5);
  assert.equal(second.recordAcceptedFlightDistance('pilot-a', 5_000, day)[0]?.reason, 'LIMIT');
  assert.equal(first.recordAcceptedFlightDistance('pilot-a', 5_000, day + 86_400_000)[0]?.amount, 5);
});

test('only registered server-observed discoveries can be recorded once', () => {
  const profiles = new PlayerProfileStore(databasePath()); const pilot = profiles.getOrCreate('pilot-a', 'Pilot A');
  assert.equal(profiles.recordVerifiedDiscovery(pilot.pilotId, 'dallas', 'fabricated-location', day), undefined);
  const found = profiles.recordVerifiedDiscovery(pilot.pilotId, 'dallas', 'reunion-tower', day)!;
  assert.equal(found.xp.amount, 15);
  assert.equal(found.profile.credits, pilot.credits + 100);
  assert.equal(profiles.recordVerifiedDiscovery(pilot.pilotId, 'dallas', 'reunion-tower', day + 1_000), undefined);
});

test('verified flight reward XP and Credits commit or roll back together', () => {
  const profiles = new PlayerProfileStore(databasePath());
  const before = profiles.getOrCreate('pilot-a', 'Pilot A');
  assert.throws(() => profiles.awardServerRewardAndXp('pilot-a', 25, undefined, 'LANDING_REWARD', 'airport-1',
    { source: 'LANDING', eventId: 'invalid event', cityId: 'dallas', now: day }), /Invalid XP award identifier/);
  assert.equal(profiles.getOrCreate('pilot-a', 'Pilot A').credits, before.credits);
  assert.equal(profiles.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, before.pilotProgress.xp);
  const reward = profiles.awardServerRewardAndXp('pilot-a', 25, undefined, 'LANDING_REWARD', 'airport-1',
    { source: 'LANDING', eventId: 'dallas:airport-1:2026-01-01', cityId: 'dallas', now: day });
  assert.equal(reward.xp?.amount, 25);
  assert.equal(reward.profile?.credits, before.credits + 25);
  assert.equal(reward.profile?.pilotProgress.xp, before.pilotProgress.xp + 25);
});

test('a legitimate award can cross multiple levels and rank remains derived', () => {
  const profiles = new PlayerProfileStore(databasePath()); profiles.getOrCreate('pilot-a', 'Pilot A');
  profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'MISSION_FIRST', eventId: 'dallas:easy', difficulty: 'EASY', now: day });
  profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'MISSION_FIRST', eventId: 'dallas:medium', difficulty: 'MEDIUM', now: day });
  const jump = profiles.awardVerifiedXp({ pilotId: 'pilot-a', source: 'MISSION_FIRST', eventId: 'dallas:extreme', difficulty: 'EXTREME', now: day })!;
  assert.equal(jump.result.beforeLevel, 1);
  assert.equal(jump.result.afterLevel, 3);
  assert.equal(jump.profile.pilotProgress.rankId, 'rookie');
});

test('mission first clear and verified replay use the persisted completion record', () => {
  const path = databasePath(); const profiles = new PlayerProfileStore(path);
  const pilot = profiles.getOrCreate('pilot-a', 'Pilot A');
  const first = profiles.acceptMission(pilot.pilotId, 'dallas', 'first-flight', false, undefined, day + 1_000);
  assert.equal(first.ok, true);
  const firstReward = profiles.completeMission(pilot.pilotId, 'dallas', first.profile!.missions.dallas!.active!.attemptId, day + 62_000)!;
  assert.equal(firstReward.xp.amount, 40);
  assert.equal(profiles.completeMission(pilot.pilotId, 'dallas', first.profile!.missions.dallas!.active!.attemptId, day + 63_000), undefined);
  const replay = profiles.acceptMission(pilot.pilotId, 'dallas', 'first-flight', false, undefined, day + 663_000);
  const replayReward = profiles.completeMission(pilot.pilotId, 'dallas', replay.profile!.missions.dallas!.active!.attemptId, day + 724_000)!;
  assert.equal(replayReward.xp.amount, 10);
  const again = profiles.acceptMission(pilot.pilotId, 'dallas', 'first-flight', false, undefined, day + 1_325_000);
  const sameDay = profiles.completeMission(pilot.pilotId, 'dallas', again.profile!.missions.dallas!.active!.attemptId, day + 1_386_000)!;
  assert.equal(sameDay.xp.reason, 'DUPLICATE');
  assert.equal(profiles.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 50);
  const reopened = new PlayerProfileStore(path);
  assert.equal(reopened.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 50);
});

test('existing XP receives a baseline and forged client progress is inert', () => {
  const path = databasePath();
  const first = new PlayerProfileStore(path); first.getOrCreate('pilot-a', 'Pilot A');
  const db = new DatabaseSync(path);
  db.prepare('UPDATE pilot_progression SET xp=6300 WHERE pilot_id=?').run('pilot-a');
  db.prepare('DELETE FROM pilot_xp_ledger WHERE pilot_id=?').run('pilot-a');
  db.close();
  const migrated = new PlayerProfileStore(path);
  assert.equal(migrated.getOrCreate('pilot-a', 'Pilot A').pilotProgress.level, 15);
  assert.equal(migrated.getOrCreate('pilot-a', 'Pilot A').pilotProgress.rankId, 'ace');
  const afterForged = migrated.updateProgress('pilot-a', { totalDistance: 1_000_000, successfulLandings: 999,
    discoveries: { dallas: ['reunion-tower', 'fabricated-location'] } })!;
  assert.equal(afterForged.pilotProgress.xp, 6300);
  assert.deepEqual(afterForged.discoveries, {});
  const newPilot = migrated.getOrCreate('pilot-b', 'Pilot B');
  const forgedLegacy = migrated.importLegacy(newPilot.pilotId, { totalDistance: 1_000_000, successfulLandings: 999,
    discoveries: { dallas: ['reunion-tower'] } });
  assert.equal(forgedLegacy.pilotProgress.xp, newPilot.pilotProgress.xp);
  assert.equal(forgedLegacy.totalDistance, newPilot.totalDistance);
  const audit = new DatabaseSync(path);
  assert.equal((audit.prepare("SELECT amount FROM pilot_xp_ledger WHERE pilot_id='pilot-a' AND source='MIGRATION_BASELINE'").get() as { amount: number }).amount, 6300);
  audit.close();
});

test('ranked Sky Duel awards only eligible results and limits repeated matchups', () => {
  const path = databasePath();
  const profiles = new PlayerProfileStore(path);
  for (const id of ['pilot-a', 'pilot-b']) { profiles.getOrCreate(id, id); profiles.awardServerReward(id, 5_000); }
  const duel = new SkyDuelStore(path);
  for (let index = 0; index < 3; index += 1) {
    const match = duel.reserve('pilot-a', 'pilot-b', day + index * 120_000);
    assert.equal(match.ok, true);
    if (!match.ok) continue;
    duel.start(match.match.id, day + index * 120_000 + 1_000);
    duel.settle(match.match.id, 'WIN_A', 3, 1, day + index * 120_000 + 70_000, { a: true, b: true });
  }
  assert.equal(profiles.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 80);
  assert.equal(profiles.getOrCreate('pilot-b', 'Pilot B').pilotProgress.xp, 20);
  const forfeited = duel.reserve('pilot-a', 'pilot-b', day + 400_000);
  assert.equal(forfeited.ok, true);
  if (forfeited.ok) {
    duel.start(forfeited.match.id, day + 401_000);
    duel.settle(forfeited.match.id, 'WIN_A', 0, 0, day + 402_000, { a: true, b: true });
  }
  assert.equal(profiles.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 80);
  duel.reconcileXp();
  assert.equal(profiles.getOrCreate('pilot-b', 'Pilot B').pilotProgress.xp, 20);
  duel.close();
});

test('Sky Duel reconciliation restores a missing award from a durable verified result', () => {
  const path = databasePath(); const profiles = new PlayerProfileStore(path);
  for (const id of ['pilot-a', 'pilot-b']) { profiles.getOrCreate(id, id); profiles.awardServerReward(id, 1_000); }
  const duel = new SkyDuelStore(path);
  const match = duel.reserve('pilot-a', 'pilot-b', day);
  assert.equal(match.ok, true);
  if (!match.ok) return;
  duel.start(match.match.id, day + 1_000);
  duel.settle(match.match.id, 'WIN_A', 3, 1, day + 70_000, { a: true, b: true });
  const db = new DatabaseSync(path);
  db.prepare("DELETE FROM pilot_xp_ledger WHERE pilot_id='pilot-a' AND source='SKY_DUEL_WIN'").run();
  db.prepare("UPDATE pilot_progression SET xp=xp-40 WHERE pilot_id='pilot-a'").run();
  db.close();
  duel.reconcileXp(); duel.reconcileXp();
  assert.equal(profiles.getOrCreate('pilot-a', 'Pilot A').pilotProgress.xp, 40);
  duel.close();
});

test('premium equipment is account-scoped and requires durable ownership', () => {
  const path = databasePath(); const profiles = new PlayerProfileStore(path);
  profiles.getOrCreate('pilot-a', 'Pilot A'); profiles.getOrCreate('pilot-b', 'Pilot B');
  assert.equal(profiles.equipProfileCosmetic('pilot-a', 'premium_badge', 'royal_falcon').ok, false);
  assert.equal(profiles.equipProfileCosmetic('pilot-a', 'avatar_frame', 'unknown').ok, false);
  const db = new DatabaseSync(path);
  db.prepare('INSERT INTO pilot_profile_cosmetic_ownership VALUES(?,?,?,?,?)').run('pilot-a', 'premium_badge', 'royal_falcon', day, 'verified:external:receipt:1');
  db.prepare('INSERT INTO pilot_profile_cosmetic_ownership VALUES(?,?,?,?,?)').run('pilot-a', 'avatar_frame', 'golden_wings', day, 'verified:external:receipt:2');
  db.prepare('INSERT INTO pilot_profile_cosmetic_ownership VALUES(?,?,?,?,?)').run('pilot-a', 'avatar_frame', 'royal_crown', day, 'verified:external:receipt:3');
  db.close();
  assert.equal(profiles.equipProfileCosmetic('pilot-a', 'premium_badge', 'royal_falcon').ok, true);
  assert.equal(profiles.equipProfileCosmetic('pilot-a', 'avatar_frame', 'golden_wings').ok, true);
  assert.equal(profiles.equipProfileCosmetic('pilot-a', 'avatar_frame', 'royal_crown').ok, true);
  assert.equal(profiles.equipProfileCosmetic('pilot-a', 'avatar_frame', 'golden_wings').ok, true);
  assert.equal(profiles.equipProfileCosmetic('pilot-b', 'avatar_frame', 'golden_wings').ok, false);
  const reopened = new PlayerProfileStore(path);
  assert.equal(reopened.getOrCreate('pilot-a', 'Pilot A').profileCosmetics.equippedPremiumBadge, 'royal_falcon');
  assert.equal(reopened.getOrCreate('pilot-a', 'Pilot A').profileCosmetics.equippedAvatarFrame, 'golden_wings');
  assert.equal(reopened.getOrCreate('pilot-a', 'Pilot A').pilotProgress.rankId, 'rookie');
  assert.equal(reopened.getOrCreate('pilot-b', 'Pilot B').profileCosmetics.equippedAvatarFrame, 'standard');
  assert.equal(reopened.equipProfileCosmetic('pilot-a', 'premium_badge', null).profile?.profileCosmetics.equippedPremiumBadge, null);
  assert.equal(reopened.equipProfileCosmetic('pilot-a', 'avatar_frame', null).profile?.profileCosmetics.equippedAvatarFrame, 'standard');
  assert.ok(reopened.getOrCreate('pilot-a', 'Pilot A').profileCosmetics.ownedAvatarFrames.includes('golden_wings'));
});
