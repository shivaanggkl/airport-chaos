import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PlayerProfileStore, normalizePilotName } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';

test('legacy pilot identity can be bound once and cookie—not query ID—is authority', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-session-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const sessions = new PilotSessionStore(databasePath);
  const legacy = profiles.getOrCreate('legacy-pilot-000001', 'Legacy');
  const first = sessions.issue(legacy.pilotId, profiles.hasProfile(legacy.pilotId), 1_000);
  assert.equal(first.pilotId, legacy.pilotId);
  assert.equal(sessions.resolve(`airport_chaos_session=${first.cookie}`, 2_000), legacy.pilotId);
  const attacker = sessions.issue(legacy.pilotId, profiles.hasProfile(legacy.pilotId), 3_000);
  assert.notEqual(attacker.pilotId, legacy.pilotId);
  profiles.getOrCreate(attacker.pilotId, 'Fresh');
  const lostCookieAttempt = sessions.issue(attacker.pilotId, true, 4_000);
  assert.notEqual(lostCookieAttempt.pilotId, attacker.pilotId);
  assert.match(sessions.cookie(first.cookie, true), /HttpOnly; SameSite=Lax; Path=\/;.*; Secure/);
  assert.match(sessions.cookie(first.cookie, true, 100_000, 'None'), /HttpOnly; SameSite=None; Path=\/;.*; Secure/);
  assert.throws(() => sessions.cookie(first.cookie, false, 100_000, 'None'), /require Secure/);
});

test('WebSocket tickets are session-bound, short-lived, and atomically single-use', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-ws-ticket-')), 'profiles.sqlite');
  const sessions = new PilotSessionStore(databasePath);
  const guest = sessions.issue(undefined, false, 1_000);
  const identity = sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 2_000)!;
  const issued = sessions.issueWebSocketTicket(identity, 3_000)!;
  assert.ok(issued.expiresAt - 3_000 <= 30_000);
  assert.equal(sessions.consumeWebSocketTicket(issued.ticket, 4_000)?.pilotId, identity.pilotId);
  assert.equal(sessions.consumeWebSocketTicket(issued.ticket, 4_001), undefined, 'ticket replay is rejected');

  const expired = sessions.issueWebSocketTicket(identity, 5_000)!;
  assert.equal(sessions.consumeWebSocketTicket(expired.ticket, expired.expiresAt + 1), undefined);
  const revoked = sessions.issueWebSocketTicket(identity, 6_000)!;
  sessions.revoke(identity.tokenHash, 6_001);
  assert.equal(sessions.consumeWebSocketTicket(revoked.ticket, 6_002), undefined, 'ticket cannot outlive its session');
});

test('legacy unique-pilot session schema migrates without signing out existing guests', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-session-migration-')), 'profiles.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec('CREATE TABLE pilot_sessions(token_hash TEXT PRIMARY KEY,pilot_id TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
  const token = 'A'.repeat(43); const tokenHash = createHash('sha256').update(token).digest('hex');
  database.prepare('INSERT INTO pilot_sessions VALUES(?,?,?,?,?)').run(tokenHash, 'legacy-pilot-000002', 1_000, 1_000, 100_000);
  database.close();
  const sessions = new PilotSessionStore(databasePath);
  assert.equal(sessions.resolve(`airport_chaos_session=${token}`, 2_000), 'legacy-pilot-000002');
  const second = sessions.issue(undefined, false, 3_000);
  assert.ok(second.pilotId);
});

test('legacy globally unique identity email schema migrates to provider-neutral identities without data loss', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-identity-migration-')), 'profiles.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE accounts(account_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE auth_identities(
      identity_id TEXT PRIMARY KEY,account_id TEXT NOT NULL,provider TEXT NOT NULL,provider_subject TEXT NOT NULL,
      normalized_email TEXT,password_hash TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      UNIQUE(provider,provider_subject),UNIQUE(normalized_email),FOREIGN KEY(account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
    );
    INSERT INTO accounts VALUES('account-1',1,1);
    INSERT INTO auth_identities VALUES('identity-1','account-1','password','pilot@example.com','pilot@example.com','digest',1,1);
  `);
  database.close();
  new PilotSessionStore(databasePath);
  const migrated = new DatabaseSync(databasePath);
  const columns = migrated.prepare('PRAGMA table_info(auth_identities)').all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => column.name === 'provider_display_name'), true);
  assert.equal(columns.some((column) => column.name === 'provider_avatar_url'), true);
  const row = migrated.prepare('SELECT provider,normalized_email,password_hash FROM auth_identities').get() as { provider: string; normalized_email: string; password_hash: string };
  assert.deepEqual([row.provider, row.normalized_email, row.password_hash], ['password', 'pilot@example.com', 'digest']);
  const schema = migrated.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='auth_identities'").get() as { sql: string };
  assert.doesNotMatch(schema.sql, /UNIQUE\s*\(\s*normalized_email\s*\)/i);
});

test('new profiles start at zero Credits while existing balances persist', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-credits-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const pilot = profiles.getOrCreate('new-pilot-credits-00001', 'New Pilot');
  assert.equal(pilot.credits, 0);
  profiles.awardServerReward(pilot.pilotId, 75);
  const reopened = new PlayerProfileStore(databasePath).getOrCreate(pilot.pilotId, 'New Pilot');
  assert.equal(reopened.credits, 75);
});

test('guest signup links the existing authoritative profile and rotates the session', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-account-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const sessions = new PilotSessionStore(databasePath);
  const guest = sessions.issue(undefined, false, 1_000);
  profiles.getOrCreate(guest.pilotId, 'Cloud Pilot');
  profiles.awardServerReward(guest.pilotId, 425);
  profiles.awardScore(guest.pilotId, 1_250);
  profiles.grantAircraftEntitlements(guest.pilotId, ['fighter'], 'test:purchase');
  const identity = sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 2_000)!;
  const signup = await sessions.signUp(identity, ' Pilot@Example.COM ', 'correct horse battery staple', 3_000);
  assert.equal(signup.ok, true);
  assert.equal(signup.identity?.pilotId, guest.pilotId);
  assert.equal(sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 4_000), undefined);
  const linked = sessions.resolveSession(`airport_chaos_session=${signup.cookie}`, 4_000)!;
  assert.equal(sessions.status(linked).state, 'account');
  assert.equal((sessions.status(linked) as { email: string }).email, 'pilot@example.com');
  const profile = profiles.getOrCreate(linked.pilotId, 'Ignored');
  assert.equal(profile.credits, 425);
  assert.equal(profile.score, 1_250);
  assert.equal(profile.unlockedAircraft.includes('fighter'), true);
  const replay = await sessions.signUp(identity, 'second@example.com', 'another strong password', 5_000);
  assert.equal(replay.ok, false, 'a double-submit cannot create a second account link');
  const database = new DatabaseSync(databasePath);
  assert.equal((database.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number }).count, 1);
});

test('existing-account login keeps unlinked guest progress separate and supports multiple devices', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-login-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const sessions = new PilotSessionStore(databasePath);
  const ownerGuest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(ownerGuest.pilotId, 'Owner'); profiles.awardServerReward(ownerGuest.pilotId, 900);
  const account = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${ownerGuest.cookie}`, 2_000)!, 'owner@example.com', 'very secure password', 3_000);
  const deviceGuest = sessions.issue(undefined, false, 4_000); profiles.getOrCreate(deviceGuest.pilotId, 'Device Guest'); profiles.awardServerReward(deviceGuest.pilotId, 75);
  const firstLogin = await sessions.signIn(sessions.resolveSession(`airport_chaos_session=${deviceGuest.cookie}`, 5_000)!, 'OWNER@EXAMPLE.COM', 'very secure password', 6_000);
  assert.equal(firstLogin.ok, true); assert.equal(firstLogin.guestPreserved, true); assert.equal(firstLogin.identity?.pilotId, ownerGuest.pilotId);
  assert.equal(profiles.getOrCreate(deviceGuest.pilotId, 'Ignored').credits, 75);
  assert.equal(profiles.getOrCreate(firstLogin.identity!.pilotId, 'Ignored').credits, 900);
  const secondDevice = sessions.issue(undefined, false, 7_000); profiles.getOrCreate(secondDevice.pilotId, 'Second');
  const secondLogin = await sessions.signIn(sessions.resolveSession(`airport_chaos_session=${secondDevice.cookie}`, 8_000)!, 'owner@example.com', 'very secure password', 9_000);
  assert.equal(secondLogin.ok, true);
  assert.equal(sessions.resolveSession(`airport_chaos_session=${firstLogin.cookie}`, 10_000)?.pilotId, ownerGuest.pilotId);
  assert.equal(sessions.resolveSession(`airport_chaos_session=${secondLogin.cookie}`, 10_000)?.pilotId, ownerGuest.pilotId);
  assert.notEqual(account.cookie, firstLogin.cookie);
});

test('passwords are hashed, duplicate signup is generic, invalid login is generic, and logout revokes auth', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-auth-security-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const first = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(first.pilotId, 'First');
  const signup = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${first.cookie}`, 2_000)!, 'pilot@example.com', 'never store this password', 3_000);
  const database = new DatabaseSync(databasePath);
  const stored = database.prepare('SELECT provider,password_hash FROM auth_identities').get() as { provider: string; password_hash: string };
  assert.equal(stored.provider, 'password'); assert.match(stored.password_hash, /^scrypt\$v1\$/); assert.equal(stored.password_hash.includes('never store this password'), false);
  const duplicateGuest = sessions.issue(undefined, false, 4_000); profiles.getOrCreate(duplicateGuest.pilotId, 'Duplicate');
  const duplicate = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${duplicateGuest.cookie}`, 5_000)!, 'PILOT@example.com', 'another secure password', 6_000);
  assert.deepEqual({ ok: duplicate.ok, error: duplicate.error }, { ok: false, error: 'Unable to create account with those details.' });
  const invalid = await sessions.signIn(sessions.resolveSession(`airport_chaos_session=${duplicateGuest.cookie}`, 7_000)!, 'missing@example.com', 'another secure password', 8_000);
  assert.deepEqual({ ok: invalid.ok, error: invalid.error }, { ok: false, error: 'Email or password is incorrect.' });
  const signedIn = sessions.resolveSession(`airport_chaos_session=${signup.cookie}`, 9_000)!;
  const logout = sessions.signOut(signedIn, 10_000);
  assert.equal(sessions.resolveSession(`airport_chaos_session=${signup.cookie}`, 11_000), undefined);
  assert.equal(sessions.status(sessions.resolveSession(`airport_chaos_session=${logout.cookie}`, 11_000)!).state, 'guest');
  assert.equal(sessions.resolveSession(`airport_chaos_session=${logout.cookie}`, logout.expiresAt! + 1), undefined);
});

function completeTestProvider(
  sessions: PilotSessionStore,
  sessionCookie: string,
  provider: 'google' | 'apple',
  action: 'login' | 'link',
  subject: string,
  options: { email?: string; displayName?: string; avatarUrl?: string; tokenHash?: string; now?: number } = {},
) {
  const now = options.now ?? 2_000;
  const identity = sessions.resolveSession(`airport_chaos_session=${sessionCookie}`, now)!;
  const pending = sessions.beginOAuthFlow(identity, provider, action, `https://game.example/api/auth/oauth/${provider}/callback`, 'https://game.example/?city=dallas', now + 1)!;
  const flow = sessions.consumeOAuthFlow(pending.state, provider, now + 2)!;
  return sessions.completeProviderAuth(flow, {
    provider, subject, email: options.email, displayName: options.displayName, avatarUrl: options.avatarUrl,
    tokenHash: options.tokenHash ?? createHash('sha256').update(`${provider}:${subject}:${now}`).digest('hex'),
    expiresAt: now + 60_000,
  }, now + 3);
}

test('guest Google and Apple sign-in atomically attach the current profile and rotate sessions', () => {
  for (const provider of ['google', 'apple'] as const) {
    const databasePath = join(mkdtempSync(join(tmpdir(), `airport-chaos-${provider}-guest-`)), 'profiles.sqlite');
    const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
    const guest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(guest.pilotId, 'Guest Ace');
    profiles.awardServerReward(guest.pilotId, 321); profiles.awardScore(guest.pilotId, 654); profiles.grantAircraftEntitlements(guest.pilotId, ['fighter'], 'test:purchase');
    const result = completeTestProvider(sessions, guest.cookie, provider, 'login', `${provider}-guest-sub`, {
      email: provider === 'apple' ? 'relay@privaterelay.appleid.com' : 'guest@example.com', displayName: 'Guest Ace',
      avatarUrl: provider === 'google' ? 'https://lh3.googleusercontent.com/a/verified=s96-c' : 'https://attacker.example/apple.png',
    });
    assert.equal(result.ok, true); assert.equal(result.identity?.pilotId, guest.pilotId);
    assert.equal(sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 3_000), undefined);
    const linked = sessions.resolveSession(`airport_chaos_session=${result.cookie}`, 3_000)!;
    const status = sessions.status(linked);
    assert.equal(status.state, 'account');
    assert.equal(status.state === 'account' && status.providers[provider], true);
    assert.equal(status.state === 'account' ? status.avatarUrl : undefined,
      provider === 'google' ? 'https://lh3.googleusercontent.com/a/verified=s96-c' : undefined);
    const profile = profiles.getOrCreate(linked.pilotId, 'Ignored');
    assert.equal(profile.credits, 321); assert.equal(profile.score, 654); assert.equal(profile.unlockedAircraft.includes('fighter'), true);
  }
});

test('existing provider login resolves the original account while preserving an unrelated device guest', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-google-login-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const owner = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(owner.pilotId, 'Owner'); profiles.awardServerReward(owner.pilotId, 900);
  const created = completeTestProvider(sessions, owner.cookie, 'google', 'login', 'google-owner', { email: 'owner@example.com', now: 2_000 });
  const visitor = sessions.issue(undefined, false, 4_000); profiles.getOrCreate(visitor.pilotId, 'Visitor'); profiles.awardServerReward(visitor.pilotId, 25);
  const login = completeTestProvider(sessions, visitor.cookie, 'google', 'login', 'google-owner', { email: 'owner@example.com', now: 5_000 });
  assert.equal(login.ok, true); assert.equal(login.guestPreserved, true); assert.equal(login.identity?.pilotId, created.identity?.pilotId);
  assert.equal(profiles.getOrCreate(visitor.pilotId, 'Ignored').credits, 25);
  assert.equal(profiles.getOrCreate(login.identity!.pilotId, 'Ignored').credits, 900);
});

test('Google A logout cannot leak cached profile data into Google B and returning A is restored', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-account-isolation-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);

  const firstGuest = sessions.issue(undefined, false, 1_000);
  profiles.getOrCreate(firstGuest.pilotId, 'Pilot');
  profiles.importLegacy(firstGuest.pilotId, { pilotName: '666', credits: 9_300, score: 700, totalDistance: 321 });
  profiles.awardPilotXp(firstGuest.pilotId, 275);
  profiles.grantAircraftEntitlements(firstGuest.pilotId, ['fighter'], 'test:purchase');
  const accountA = completeTestProvider(sessions, firstGuest.cookie, 'google', 'login', 'google-account-a', {
    email: 'account-a@example.com', now: 2_000,
  });
  assert.equal(accountA.ok, true);
  const accountAProfile = profiles.getOrCreate(accountA.identity!.pilotId, 'Ignored');
  assert.equal(accountAProfile.pilotName, '666');
  assert.equal(accountAProfile.credits, 9_300);

  const afterALogout = sessions.signOut(sessions.resolveSession(`airport_chaos_session=${accountA.cookie}`, 3_000)!, 4_000);
  const guestAfterA = profiles.createFreshGuest(afterALogout.identity!.pilotId);
  const staleAImport = profiles.importLegacy(guestAfterA.pilotId, {
    pilotName: accountAProfile.pilotName, credits: accountAProfile.credits,
    score: accountAProfile.score, totalDistance: accountAProfile.totalDistance,
  });
  assert.equal(staleAImport.pilotId, guestAfterA.pilotId);
  assert.notEqual(staleAImport.pilotName, accountAProfile.pilotName);
  assert.notEqual(staleAImport.credits, accountAProfile.credits);
  assert.equal(staleAImport.legacyImportPending, false);

  const accountB = completeTestProvider(sessions, afterALogout.cookie!, 'google', 'login', 'google-account-b', {
    email: 'account-b@example.com', now: 5_000,
  });
  assert.equal(accountB.ok, true);
  assert.equal(accountB.identity!.pilotId, guestAfterA.pilotId);
  assert.notEqual(accountB.identity!.pilotId, accountA.identity!.pilotId);
  const accountBProfile = profiles.getOrCreate(accountB.identity!.pilotId, 'Ignored');
  assert.notEqual(accountBProfile.pilotName, accountAProfile.pilotName);
  assert.notEqual(accountBProfile.credits, accountAProfile.credits);

  const afterBLogout = sessions.signOut(sessions.resolveSession(`airport_chaos_session=${accountB.cookie}`, 6_000)!, 7_000);
  const guestAfterB = profiles.createFreshGuest(afterBLogout.identity!.pilotId);
  const staleBImport = profiles.importLegacy(guestAfterB.pilotId, { pilotName: accountBProfile.pilotName, credits: accountBProfile.credits });
  assert.deepEqual(staleBImport, guestAfterB);
  assert.notEqual(staleBImport.pilotId, accountB.identity!.pilotId);

  const accountAReturn = completeTestProvider(sessions, afterBLogout.cookie!, 'google', 'login', 'google-account-a', {
    email: 'account-a@example.com', now: 8_000,
  });
  assert.equal(accountAReturn.ok, true);
  assert.equal(accountAReturn.identity!.pilotId, accountA.identity!.pilotId);
  assert.deepEqual(
    profiles.getOrCreate(accountAReturn.identity!.pilotId, 'Ignored'),
    accountAProfile,
    'returning Google A must recover its original profile without A/B/guest mutation',
  );
  assert.equal(sessions.resolveSession(`airport_chaos_session=${accountA.cookie}`, 9_000), undefined);
  assert.equal(sessions.resolveSession(`airport_chaos_session=${accountB.cookie}`, 9_000), undefined);
});

test('explicit provider linking supports password + Google + Apple on one account', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-provider-link-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const guest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(guest.pilotId, 'Owner');
  const password = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 2_000)!, 'owner@example.com', 'a sufficiently strong password', 3_000);
  const google = completeTestProvider(sessions, password.cookie!, 'google', 'link', 'google-linked', { email: 'owner@example.com', now: 4_000 });
  const apple = completeTestProvider(sessions, google.cookie!, 'apple', 'link', 'apple-linked', { email: 'owner@privaterelay.appleid.com', displayName: 'First Login Name', now: 6_000 });
  assert.equal(apple.ok, true); assert.equal(apple.identity?.pilotId, guest.pilotId);
  const status = sessions.status(sessions.resolveSession(`airport_chaos_session=${apple.cookie}`, 7_000)!);
  assert.deepEqual(status.state === 'account' ? status.providers : undefined, { password: true, google: true, apple: true });
});

test('provider email collision never auto-merges accounts and directs explicit linking', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-provider-collision-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const owner = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(owner.pilotId, 'Owner');
  await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${owner.cookie}`, 2_000)!, 'same@example.com', 'a sufficiently strong password', 3_000);
  const other = sessions.issue(undefined, false, 4_000); profiles.getOrCreate(other.pilotId, 'Other');
  const collision = completeTestProvider(sessions, other.cookie, 'google', 'login', 'new-google-sub', { email: 'same@example.com', now: 5_000 });
  assert.equal(collision.ok, false); assert.equal(collision.collision, true);
  assert.equal(collision.error, 'Sign in to your existing account first, then link this provider.');
  assert.ok(sessions.resolveSession(`airport_chaos_session=${other.cookie}`, 6_000), 'failed collision leaves the guest session usable');
});

test('Apple first-login metadata persists when subsequent identity tokens omit email and name', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-apple-metadata-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const firstGuest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(firstGuest.pilotId, 'Apple Pilot');
  const first = completeTestProvider(sessions, firstGuest.cookie, 'apple', 'login', 'apple-stable-sub', {
    email: 'relay@privaterelay.appleid.com', displayName: 'Apple Pilot', now: 2_000,
  });
  const secondGuest = sessions.issue(undefined, false, 4_000); profiles.getOrCreate(secondGuest.pilotId, 'Device');
  const second = completeTestProvider(sessions, secondGuest.cookie, 'apple', 'login', 'apple-stable-sub', { now: 5_000 });
  assert.equal(second.ok, true); assert.equal(second.identity?.pilotId, first.identity?.pilotId);
  const database = new DatabaseSync(databasePath);
  const identity = database.prepare("SELECT normalized_email,provider_display_name FROM auth_identities WHERE provider='apple'").get() as { normalized_email: string; provider_display_name: string };
  assert.equal(identity.normalized_email, 'relay@privaterelay.appleid.com');
  assert.equal(identity.provider_display_name, 'Apple Pilot');
});

test('OAuth state and provider token are single-use and provider identity cannot be linked to another account', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-provider-replay-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const first = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(first.pilotId, 'First');
  const pending = sessions.beginOAuthFlow(sessions.resolveSession(`airport_chaos_session=${first.cookie}`, 2_000)!, 'google', 'login', 'https://game.example/callback', 'https://game.example/', 2_001)!;
  assert.equal(sessions.consumeOAuthFlow('wrong-state', 'google', 2_002), undefined);
  const flow = sessions.consumeOAuthFlow(pending.state, 'google', 2_003)!;
  assert.equal(sessions.consumeOAuthFlow(pending.state, 'google', 2_004), undefined);
  const verified = { provider: 'google' as const, subject: 'stable-google', email: 'first@example.com', tokenHash: 'a'.repeat(64), expiresAt: 100_000 };
  const linked = sessions.completeProviderAuth(flow, verified, 2_005); assert.equal(linked.ok, true);
  const second = sessions.issue(undefined, false, 3_000); profiles.getOrCreate(second.pilotId, 'Second');
  const replay = completeTestProvider(sessions, second.cookie, 'google', 'login', 'stable-google', { email: 'first@example.com', tokenHash: verified.tokenHash, now: 4_000 });
  assert.equal(replay.ok, false); assert.match(replay.error ?? '', /failed/i);
});

test('expired Google OAuth flow state is rejected without changing the guest session', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-google-expiry-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const guest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(guest.pilotId, 'Guest');
  const session = sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 2_000)!;
  const pending = sessions.beginOAuthFlow(session, 'google', 'login', 'https://game.example/callback', 'https://game.example/', 2_001)!;
  assert.equal(sessions.consumeOAuthFlow(pending.state, 'google', 2_001 + 10 * 60_000 + 1), undefined);
  assert.equal(sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 2_001 + 10 * 60_000 + 1)?.pilotId, guest.pilotId);
});

test('Apple callback state is cookie-independent, provider-bound, expiring, and atomically single-use', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-apple-form-post-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const guest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(guest.pilotId, 'Apple Guest');
  const session = sessions.resolveSession(`airport_chaos_session=${guest.cookie}`, 2_000)!;

  const valid = sessions.beginOAuthFlow(session, 'apple', 'login', 'https://game.example/api/auth/oauth/apple/callback', 'https://game.example/', 2_001)!;
  assert.match(valid.state, /^[A-Za-z0-9_-]{40,128}$/);
  assert.equal(sessions.consumeOAuthFlow('', 'apple', 2_002), undefined, 'missing state is rejected');
  assert.equal(sessions.consumeOAuthFlow('A'.repeat(43), 'apple', 2_003), undefined, 'unknown state is rejected');
  assert.equal(sessions.consumeOAuthFlow(valid.state, 'google', 2_004), undefined, 'wrong-provider state is rejected without consuming it');
  const recovered = sessions.consumeOAuthFlow(valid.state, 'apple', 2_005)!;
  assert.equal(recovered.session.pilotId, guest.pilotId, 'flow recovers the server-side session without a callback cookie');
  assert.equal(sessions.consumeOAuthFlow(valid.state, 'apple', 2_006), undefined, 'replayed state is rejected');

  const expired = sessions.beginOAuthFlow(session, 'apple', 'login', 'https://game.example/api/auth/oauth/apple/callback', 'https://game.example/', 3_000)!;
  assert.equal(sessions.consumeOAuthFlow(expired.state, 'apple', 3_000 + 10 * 60_000 + 1), undefined, 'expired state is rejected');
});

test('an authenticated account cannot claim a provider identity already owned by another account', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-provider-owner-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath); const sessions = new PilotSessionStore(databasePath);
  const firstGuest = sessions.issue(undefined, false, 1_000); profiles.getOrCreate(firstGuest.pilotId, 'First');
  completeTestProvider(sessions, firstGuest.cookie, 'google', 'login', 'owned-google-sub', { email: 'first@example.com', now: 2_000 });
  const secondGuest = sessions.issue(undefined, false, 4_000); profiles.getOrCreate(secondGuest.pilotId, 'Second');
  const secondAccount = completeTestProvider(sessions, secondGuest.cookie, 'apple', 'login', 'second-apple-sub', { email: 'second@example.com', now: 5_000 });
  const claim = completeTestProvider(sessions, secondAccount.cookie!, 'google', 'link', 'owned-google-sub', {
    email: 'first@example.com', tokenHash: 'b'.repeat(64), now: 7_000,
  });
  assert.equal(claim.ok, false); assert.equal(claim.error, 'That provider is linked to another account.');
  assert.ok(sessions.resolveSession(`airport_chaos_session=${secondAccount.cookie}`, 8_000), 'rejected link keeps current account session active');
});

test('client-shaped progress cannot set credits or paid ownership', () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'airport-chaos-economy-authority-')), 'profiles.sqlite');
  const profiles = new PlayerProfileStore(databasePath);
  const pilot = profiles.getOrCreate('economy-pilot-000001', 'Economy Pilot');
  const updated = profiles.updateProgress(pilot.pilotId, { credits: 999_999, score: 999_999, ownedAircraft: ['fighter'], aircraftEntitlements: ['aircraft:firehawk'] } as never)!;
  assert.equal(updated.credits, 0);
  assert.equal(updated.score, 0);
  assert.deepEqual(updated.unlockedAircraft, ['trainer']);
  assert.equal(updated.aircraftEntitlements.includes('aircraft:firehawk'), false);
});

test('pilot names accept only the shared 3-20 character safe format', () => {
  assert.equal(normalizePilotName("Ace O'Brien"), "Ace O'Brien");
  assert.equal(normalizePilotName('  Sky   Pilot  '), 'Sky Pilot');
  assert.equal(normalizePilotName('x'), undefined);
  assert.equal(normalizePilotName('<img src=x>'), undefined);
  assert.equal(normalizePilotName('a'.repeat(21)), undefined);
});
