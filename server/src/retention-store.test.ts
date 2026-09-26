import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerProfileStore } from './player-profiles.js';

function store() { return new PlayerProfileStore(join(mkdtempSync(join(tmpdir(), 'airport-retention-')), 'profiles.sqlite')); }

test('daily streak is idempotent, advances, resets, and cycles after day seven', () => {
  const db = store(); db.getOrCreate('pilot-a', 'Pilot A');
  const day = Date.UTC(2026, 0, 1);
  assert.equal(db.claimDailyStreak('pilot-a', day)?.credits, 50);
  assert.equal(db.claimDailyStreak('pilot-a', day)?.credits, 0);
  for (let index = 1; index < 7; index += 1) db.claimDailyStreak('pilot-a', day + index * 86_400_000);
  assert.equal(db.claimDailyStreak('pilot-a', day + 7 * 86_400_000)?.credits, 50);
  const reset = db.claimDailyStreak('pilot-a', day + 10 * 86_400_000);
  assert.equal(reset?.profile.dailyStreak.current, 1);
});

test('daily flight plan is compact, solo-achievable, and reward progress is idempotent', () => {
  const db = store(); const profile = db.getOrCreate('daily-plan', 'Daily Pilot');
  const plan = profile.objectives.dallas!;
  assert.equal(plan.daily.length, 3);
  assert.equal(plan.daily.some(item => item.activity === 'kill'), false);
  const task = plan.daily.find(item => item.activity !== 'landing')!;
  const first = db.recordObjectiveActivity('daily-plan', 'dallas', task.activity, task.target)!;
  const credits = first.profile.credits;
  const repeat = db.recordObjectiveActivity('daily-plan', 'dallas', task.activity, task.target)!;
  assert.equal(repeat.profile.credits, credits);
  assert.equal(repeat.completed.length, 0);
});

test('pilot XP migration is once-only and records only improve', () => {
  const db = store(); const first = db.getOrCreate('pilot-b', 'Pilot B');
  const xp = db.awardPilotXp('pilot-b', 6_300)!;
  assert.equal(xp.levelUp, 15); assert.equal(xp.title, 'ACE');
  assert.equal(db.updatePersonalRecord('pilot-b', 'top_speed', 500, 'dallas'), true);
  assert.equal(db.updatePersonalRecord('pilot-b', 'top_speed', 400, 'dallas'), false);
  assert.equal(db.getOrCreate('pilot-b', 'Pilot B').pilotProgress.xp, first.pilotProgress.xp + 6_300);
});

test('PvP reward is idempotent, pair-cooled, and practice remains playable', () => {
  const db = store(); db.getOrCreate('winner', 'Winner'); db.getOrCreate('loser', 'Loser');
  const now = Date.UTC(2026, 0, 1);
  assert.equal(db.awardPvpWin('00000000-0000-4000-8000-000000000001', 'winner', 'loser', 200, now).rewarded, true);
  assert.equal(db.awardPvpWin('00000000-0000-4000-8000-000000000001', 'winner', 'loser', 200, now).rewarded, false);
  assert.equal(db.awardPvpWin('00000000-0000-4000-8000-000000000002', 'winner', 'loser', 200, now + 1_000).rewarded, false);
});

test('referral attaches only to a new different profile and rewards once after qualification', () => {
  const db = store(); db.getOrCreate('inviter', 'Inviter'); db.getOrCreate('new-pilot', 'New Pilot');
  const code = db.referralCode('inviter');
  assert.equal(db.attachReferral('new-pilot', code, 'network-b'), true);
  assert.equal(db.attachReferral('new-pilot', code, 'network-b'), false);
  assert.equal(db.advanceReferral('new-pilot', 1_199_999, true).rewarded, false);
  assert.equal(db.advanceReferral('new-pilot', 1, false).rewarded, true);
  assert.equal(db.advanceReferral('new-pilot', 1, true).rewarded, false);
});

test('weekly payout chooses one best placement and is idempotent', () => {
  const db = store(); db.getOrCreate('weekly-pilot', 'Weekly Pilot');
  db.recordWeeklyLeaderboard('weekly-pilot', 'dallas', 'kills', 10);
  db.recordWeeklyLeaderboard('weekly-pilot', 'dallas', 'territories', 4);
  const nextWeek = Date.now() + 7 * 86_400_000;
  const reward = db.finalizePreviousWeeklyReward('weekly-pilot', nextWeek);
  assert.equal(reward?.rank, 1); assert.equal(reward?.credits, 1_000);
  assert.deepEqual(db.finalizePreviousWeeklyReward('weekly-pilot', nextWeek), reward);
});

test('cosmetics purchase requires the aircraft and remains authoritative and idempotent', () => {
  const db = store(); db.getOrCreate('cosmetic-pilot', 'Cosmetic Pilot');
  db.awardServerReward('cosmetic-pilot', 50_000);
  assert.equal(db.purchaseCosmetic('cosmetic-pilot', 'mammoth-desert-sand').ok, false);
  assert.equal(db.purchaseAircraft('cosmetic-pilot', 'cargo').ok, true);
  const before = db.getOrCreate('cosmetic-pilot', 'Cosmetic Pilot').credits;
  const purchase = db.purchaseCosmetic('cosmetic-pilot', 'mammoth-desert-sand');
  assert.equal(purchase.ok, true); assert.equal(purchase.profile?.credits, before - 2_500);
  const repeat = db.purchaseCosmetic('cosmetic-pilot', 'mammoth-desert-sand');
  assert.equal(repeat.ok, true); assert.equal(repeat.profile?.credits, before - 2_500);
  assert.equal(db.equipCosmetic('cosmetic-pilot', 'mammoth-desert-sand').ok, true);
  assert.equal(db.getOrCreate('cosmetic-pilot', 'Cosmetic Pilot').cosmetics.equipped['livery:cargo'], 'mammoth-desert-sand');
  assert.equal(db.equipCosmetic('cosmetic-pilot', 'unknown').ok, false);
});

test('new pilots retain free legacy finishes and permanent Firehawk ownership includes Inferno', () => {
  const db = store();
  const initial = db.getOrCreate('cosmetic-defaults', 'Pilot');
  assert.deepEqual(initial.cosmetics.ownedIds.sort(), ['bluejay-aurora', 'bluejay-classic', 'bluejay-skybolt', 'mammoth-sand', 'nightowl-forest']);
  assert.equal(initial.cosmetics.equipped['livery:trainer'], 'bluejay-skybolt');
  assert.equal(db.equipCosmetic('cosmetic-defaults', 'bluejay-aurora').ok, true);
  db.awardServerReward('cosmetic-defaults', 100_000);
  assert.equal(db.purchaseAircraft('cosmetic-defaults', 'cargo').profile?.cosmetics.equipped['livery:cargo'], 'mammoth-sand');
  assert.equal(db.purchaseAircraft('cosmetic-defaults', 'privateJet').profile?.cosmetics.equipped['livery:privateJet'], 'nightowl-forest');
  const paid = db.grantAircraftEntitlements('cosmetic-defaults', ['fighter'], 'stripe:test')!;
  assert.equal(paid.cosmetics.ownedIds.includes('firehawk-inferno'), true);
  assert.equal(paid.cosmetics.equipped['livery:fighter'], 'firehawk-inferno');
  const refunded = db.revokeAircraftEntitlementSource('cosmetic-defaults', 'fighter', 'stripe:test')!;
  assert.equal(refunded.cosmetics.ownedIds.includes('firehawk-inferno'), false);
  assert.equal(refunded.cosmetics.equipped['livery:fighter'], undefined);
});

test('legacy cosmetic ids remain stored but are hidden and invalid equipped slots normalize safely', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'airport-legacy-cosmetics-')), 'profiles.sqlite');
  const db = new PlayerProfileStore(path); db.getOrCreate('legacy-cosmetic', 'Legacy Pilot');
  const raw = new DatabaseSync(path);
  raw.prepare('INSERT OR IGNORE INTO pilot_cosmetics VALUES(?,?,?)').run('legacy-cosmetic', 'bluejay-sunset', 1);
  raw.prepare(`INSERT INTO pilot_equipped_cosmetics VALUES(?,?,?) ON CONFLICT(pilot_id,category) DO UPDATE SET cosmetic_id=excluded.cosmetic_id`)
    .run('legacy-cosmetic', 'livery:trainer', 'bluejay-sunset');
  raw.close();
  const profile = db.getOrCreate('legacy-cosmetic', 'Legacy Pilot');
  assert.equal(profile.cosmetics.ownedIds.includes('bluejay-sunset'), false);
  assert.equal(profile.cosmetics.equipped['livery:trainer'], 'bluejay-skybolt');
});

test('Chaos Event reward and active-event persistence are reconnect idempotent', () => {
  const db = store(); db.getOrCreate('chaos-pilot', 'Chaos Pilot');
  db.saveActiveChaosEvent('chaos-pilot', { id:'event-1', type:'cargoRush', cityId:'dallas', startedAt:1_000, expiresAt:Date.now()+60_000, target:{ targetAirportId:'executive' } });
  db.updateChaosEventProgress('chaos-pilot', 'event-1', 1);
  assert.equal(db.activeChaosEvent('chaos-pilot')?.progress, 1);
  const first = db.awardServerRewardOnce('chaos-pilot', 'chaos-event:event-1', 240, { eventCompletions:1 });
  const repeat = db.awardServerRewardOnce('chaos-pilot', 'chaos-event:event-1', 240, { eventCompletions:1 });
  assert.equal(first.awarded, true); assert.equal(repeat.awarded, false);
  assert.equal(repeat.profile?.credits, 240); assert.equal(repeat.profile?.eventCompletions, 1);
  db.finishChaosEvent('chaos-pilot', 'event-1', 'completed', { airportId:'executive' });
  assert.equal(db.activeChaosEvent('chaos-pilot'), undefined);
});
