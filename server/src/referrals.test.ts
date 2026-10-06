import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';

function fixture() {
  const path = join(mkdtempSync(join(tmpdir(), 'airport-referrals-')), 'profiles.sqlite');
  return { path, profiles: new PlayerProfileStore(path), sessions: new PilotSessionStore(path) };
}

function providerLogin(
  profiles: PlayerProfileStore, sessions: PilotSessionStore, pilotId: string, subject: string,
  now: number, referralCode?: string,
) {
  profiles.getOrCreate(pilotId, 'Pilot');
  const guest = sessions.issue(pilotId, true, now);
  const session = sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, now + 1)!;
  const start = sessions.beginOAuthFlow(session, 'google', 'login', 'https://game.example/callback', 'https://game.example/', now + 2, referralCode)!;
  const flow = sessions.consumeOAuthFlow(start.state, 'google', now + 3)!;
  return sessions.completeProviderAuth(flow, {
    provider: 'google', subject, email: `${subject}@example.com`,
    tokenHash: createHash('sha256').update(`${subject}:${now}`).digest('hex'), expiresAt: now + 60_000,
  }, now + 4);
}

test('new provider account gets immutable attribution; existing login and invalid codes do not', () => {
  const { path, profiles, sessions } = fixture();
  const now = Date.now();
  assert.equal(providerLogin(profiles, sessions, 'inviter-pilot-000001', 'inviter', now).createdAccount, true);
  const code = profiles.referralCode('inviter-pilot-000001');
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(profiles.referralCode('inviter-pilot-000001'), code);
  assert.equal(profiles.validReferralCode(code), true);
  assert.equal(profiles.validReferralCode('XXXXX-XXXXX'), false);
  profiles.getOrCreate('guest-only-pilot-000001', 'Guest');
  assert.equal(profiles.validReferralCode(profiles.referralCode('guest-only-pilot-000001')), false);
  const signup = providerLogin(profiles, sessions, 'friend-pilot-000001', 'friend', now + 100, code);
  assert.equal(signup.referralAttributed, true);
  const database = new DatabaseSync(path);
  const attached = database.prepare('SELECT referrer_pilot_id,status FROM pilot_referrals WHERE referred_pilot_id=?')
    .get('friend-pilot-000001') as { referrer_pilot_id: string; status: string };
  assert.deepEqual({ ...attached }, { referrer_pilot_id: 'inviter-pilot-000001', status: 'pending' });
  const existingLogin = providerLogin(profiles, sessions, 'other-guest-000001', 'friend', now + 200, code);
  assert.equal(existingLogin.createdAccount, false);
  assert.equal(existingLogin.referralAttributed, false);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM pilot_referrals').get()!['count'], 1);
  const invalid = providerLogin(profiles, sessions, 'invalid-pilot-000001', 'invalid', now + 300, 'XXXXX-XXXXX');
  assert.equal(invalid.createdAccount, true);
  assert.equal(invalid.referralAttributed, false);
  database.close();
});

test('legacy guest attribution cannot qualify and a new account may replace that unverified pending row', () => {
  const { path, profiles, sessions } = fixture();
  const now = Date.now();
  providerLogin(profiles, sessions, 'inviter-pilot-000001', 'inviter', now);
  const code = profiles.referralCode('inviter-pilot-000001');
  profiles.getOrCreate('guest-only-pilot-000001', 'Guest Referrer');
  profiles.getOrCreate('legacy-guest-000001', 'Guest');
  const database = new DatabaseSync(path);
  database.prepare("INSERT INTO pilot_referrals(referred_pilot_id,referrer_pilot_id,status,created_at) VALUES(?,?,'pending',?)")
    .run('legacy-guest-000001', 'guest-only-pilot-000001', now);
  assert.equal(profiles.hasPendingReferral('legacy-guest-000001'), false);
  assert.equal(profiles.qualifyReferral('legacy-guest-000001', now + 1).rewarded, false);
  const created = providerLogin(profiles, sessions, 'legacy-guest-000001', 'new-friend', now + 100, code);
  assert.equal(created.referralAttributed, true);
  const row = database.prepare('SELECT referrer_pilot_id,attribution_version FROM pilot_referrals WHERE referred_pilot_id=?')
    .get('legacy-guest-000001') as { referrer_pilot_id: string; attribution_version: number };
  assert.equal(row.referrer_pilot_id, 'inviter-pilot-000001');
  assert.equal(row.attribution_version, 1);
  database.close();
});

test('qualification pays 500 and 750 exactly once with linked wallet ledger entries', () => {
  const { path, profiles, sessions } = fixture();
  const now = Date.now();
  providerLogin(profiles, sessions, 'inviter-pilot-000001', 'inviter', now);
  const code = profiles.referralCode('inviter-pilot-000001');
  providerLogin(profiles, sessions, 'friend-pilot-000001', 'friend', now + 100, code);
  const first = profiles.qualifyReferral('friend-pilot-000001', now + 200);
  assert.deepEqual({ rewarded: first.rewarded, inviterRewarded: first.inviterRewarded }, { rewarded: true, inviterRewarded: true });
  assert.equal(profiles.getOrCreate('friend-pilot-000001', 'Friend').credits, 500);
  assert.equal(profiles.getOrCreate('inviter-pilot-000001', 'Inviter').credits, 750);
  assert.equal(profiles.qualifyReferral('friend-pilot-000001', now + 300).rewarded, false);
  const database = new DatabaseSync(path);
  const records = database.prepare(`SELECT currency,direction,amount,reason FROM wallet_transactions
    WHERE reason IN ('REFERRAL_INVITER','REFERRAL_NEW_PLAYER') ORDER BY amount`).all();
  assert.deepEqual(records.map(record => ({ ...record })), [
    { currency: 'CREDITS', direction: 'CREDIT', amount: 500, reason: 'REFERRAL_NEW_PLAYER' },
    { currency: 'CREDITS', direction: 'CREDIT', amount: 750, reason: 'REFERRAL_INVITER' },
  ]);
  const row = database.prepare('SELECT inviter_wallet_transaction_id,referred_wallet_transaction_id FROM pilot_referrals WHERE referred_pilot_id=?')
    .get('friend-pilot-000001') as { inviter_wallet_transaction_id: string; referred_wallet_transaction_id: string };
  assert.ok(row.inviter_wallet_transaction_id);
  assert.ok(row.referred_wallet_transaction_id);
  database.close();
  assert.equal(new PlayerProfileStore(path).qualifyReferral('friend-pilot-000001', now + 400).rewarded, false);
});

test('rolling cap skips the eleventh inviter payout while preserving friend reward', () => {
  const { profiles, sessions } = fixture();
  const now = Date.now();
  providerLogin(profiles, sessions, 'inviter-pilot-000001', 'inviter', now);
  const code = profiles.referralCode('inviter-pilot-000001');
  for (let index = 0; index < 11; index += 1) {
    const pilotId = `friend-pilot-${String(index).padStart(6, '0')}`;
    providerLogin(profiles, sessions, pilotId, `friend-${index}`, now + index * 100 + 100, code);
    const result = profiles.qualifyReferral(pilotId, now + index * 100 + 200);
    assert.equal(result.rewarded, true);
    assert.equal(result.inviterRewarded, index < 10);
    assert.equal(profiles.getOrCreate(pilotId, 'Friend').credits, 500);
  }
  assert.equal(profiles.getOrCreate('inviter-pilot-000001', 'Inviter').credits, 7_500);
  assert.equal(profiles.getOrCreate('inviter-pilot-000001', 'Inviter').referral.inviterRewardsRemaining, 0);
  providerLogin(profiles, sessions, 'friend-pilot-after-window', 'friend-after-window', now + 30 * 86_400_000 + 2_000, code);
  const afterWindow = profiles.qualifyReferral('friend-pilot-after-window', now + 30 * 86_400_000 + 3_000);
  assert.equal(afterWindow.inviterRewarded, true);
  assert.equal(profiles.getOrCreate('inviter-pilot-000001', 'Inviter').credits, 8_250);
});

test('wallet failure rolls back both payouts and referral completion', () => {
  const { path, profiles, sessions } = fixture();
  const now = Date.now();
  providerLogin(profiles, sessions, 'inviter-pilot-000001', 'inviter', now);
  const code = profiles.referralCode('inviter-pilot-000001');
  providerLogin(profiles, sessions, 'friend-pilot-000001', 'friend', now + 100, code);
  const database = new DatabaseSync(path);
  database.prepare('UPDATE player_profiles SET credits=1000000 WHERE pilot_id=?').run('inviter-pilot-000001');
  assert.throws(() => profiles.qualifyReferral('friend-pilot-000001', now + 200), /wallet credit failed/);
  assert.equal(profiles.getOrCreate('friend-pilot-000001', 'Friend').credits, 0);
  assert.equal(database.prepare('SELECT status FROM pilot_referrals WHERE referred_pilot_id=?').get('friend-pilot-000001')!['status'], 'pending');
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason='REFERRAL_NEW_PLAYER'").get()!['count'], 0);
  database.close();
});
