import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import { PlayerProfileStore } from './player-profiles.js';
import { PilotSessionStore } from './session-auth.js';

function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') { probe.close(); reject(new Error('No test port')); return; }
      probe.close(() => resolvePort(address.port));
    });
  });
}

type Message = Record<string, unknown>;
class PilotClient {
  readonly messages: Message[] = [];
  readonly socket: WebSocket;
  private spawn?: { position: { x: number; y: number; z: number }; heading: number };
  constructor(port: number, cookie: string, pilotId: string, private readonly autoReady = true) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=sky-duel&protocol=${PROTOCOL_VERSION}&pilotId=${pilotId}`,
      { origin: `http://127.0.0.1:${port}`, headers: { Cookie: `airport_chaos_session=${cookie}` } });
    this.socket.on('message', data => {
      try {
        const message = JSON.parse(String(data)) as Message;
        this.messages.push(message);
        if (message.type === 'skyDuelSpawn') {
          this.spawn = message as typeof this.spawn;
          this.sendState();
          if (this.autoReady) this.send('skyDuelReady');
        }
        if (message.type === 'skyDuelLoading' && this.autoReady) this.send('skyDuelPresentationReady');
      } catch { /* malformed server message fails wait below */ }
    });
  }
  send(type: string): void { this.socket.send(JSON.stringify({ type })); }
  sendState(): void {
    if (!this.spawn || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'state', position: this.spawn.position,
      rotation: { x: 0, y: this.spawn.heading, z: 0 }, boostActive: false }));
  }
  async waitFor(type: string, check: (message: Message) => boolean = () => true, timeoutMs = 12_000): Promise<Message> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.messages.find(message => message.type === type && check(message));
      if (found) return found;
      await new Promise(resolveWait => setTimeout(resolveWait, 25));
    }
    throw new Error(`Timed out waiting for ${type}: ${JSON.stringify(this.messages.slice(-12).map(message =>
      ({ type: message.type, phase: message.phase, scoreA: message.scoreA, scoreB: message.scoreB })) )}`);
  }
  close(): void { this.socket.close(); }
}

test('real two-player combat, reconnect, surrender, payouts, and isolated AI practice', { timeout: 100_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'airport-chaos-duel-live-'));
  const path = join(dir, 'profiles.sqlite');
  const profiles = new PlayerProfileStore(path);
  const sessions = new PilotSessionStore(path);
  const now = Date.now();
  const first = sessions.issue(undefined, false, now);
  const second = sessions.issue(undefined, false, now);
  const third = sessions.issue(undefined, false, now);
  const fourth = sessions.issue(undefined, false, now);
  profiles.getOrCreate(first.pilotId, 'First');
  profiles.getOrCreate(second.pilotId, 'Second');
  profiles.getOrCreate(third.pilotId, 'Third');
  profiles.getOrCreate(fourth.pilotId, 'Fourth');
  const signedFirst = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${first.cookie}`)!,
    'duel-first@example.com', 'a long first password', now);
  const signedSecond = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${second.cookie}`)!,
    'duel-second@example.com', 'a long second password', now);
  assert.equal(signedFirst.ok, true);
  assert.equal(signedSecond.ok, true);
  const db = new DatabaseSync(path);
  db.prepare('UPDATE player_profiles SET credits = 5000 WHERE pilot_id IN (?,?,?,?)')
    .run(first.pilotId, second.pilotId, third.pilotId, fourth.pilotId);
  const port = await availablePort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: resolve(import.meta.dirname, '../..'),
    env: { ...process.env, PORT: String(port), AIRPORT_CHAOS_PROFILE_DB: path,
      AIRPORT_CHAOS_SKY_DUEL_STAKES_ENABLED: '1', AIRPORT_CHAOS_SKY_DUEL_AI_TEST_ENABLED: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', data => { serverOutput += String(data); });
  child.stderr.on('data', data => { serverOutput += String(data); });
  let a: PilotClient | undefined;
  let b: PilotClient | undefined;
  try {
    const deadline = Date.now() + 12_000;
    while (!serverOutput.includes('listening') && Date.now() < deadline && child.exitCode === null)
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    assert.equal(child.exitCode, null, serverOutput);
    const guestHeaders = { Cookie: `airport_chaos_session=${third.cookie}` };
    const guestProgressBeforeTraining = await fetch(`http://127.0.0.1:${port}/api/journey/dallas`, { headers: guestHeaders });
    assert.equal(guestProgressBeforeTraining.status, 200);
    assert.equal((await guestProgressBeforeTraining.json()).eligible, false, 'guest still completes training before Dallas');
    db.prepare(`UPDATE pilot_tutorial_state SET status='completed',updated_at=?,completed_at=? WHERE pilot_id=?`)
      .run(now, now, third.pilotId);
    const guestProgress = await fetch(`http://127.0.0.1:${port}/api/journey/dallas`, { headers: guestHeaders });
    assert.equal(guestProgress.status, 200);
    assert.equal((await guestProgress.json()).eligible, true);
    const missionUrl = `http://127.0.0.1:${port}/api/journey/dallas`;
    const guestPost = (cookie: string, path: string, body: object) => fetch(`${missionUrl}/${path}`, {
      method: 'POST', headers: { Cookie: `airport_chaos_session=${cookie}`, Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await guestPost(third.cookie, 'mission-02/launch', {})).status, 403,
      'guest cannot skip the mission chain');
    const guestLaunch = await guestPost(third.cookie, 'mission-01/launch', {});
    assert.equal(guestLaunch.status, 201);
    const guestAttemptId = (await guestLaunch.json()).attempt.attemptId as string;
    assert.equal((await guestPost(fourth.cookie, 'mission-01/abandon', { attemptId: guestAttemptId })).status, 404,
      'another guest cannot control this device guest attempt');
    assert.equal((await guestPost(third.cookie, 'mission-01/abandon', { attemptId: guestAttemptId })).status, 200);
    a = new PilotClient(port, signedFirst.cookie!, first.pilotId);
    b = new PilotClient(port, signedSecond.cookie!, second.pilotId, false);
    await Promise.all([a.waitFor('welcome'), b.waitFor('welcome')]);
    a.send('skyDuelQueue'); b.send('skyDuelQueue');
    await Promise.all([a.waitFor('skyDuelLoading'), b.waitFor('skyDuelLoading')]);
    await new Promise(resolveWait => setTimeout(resolveWait, 1_200));
    assert.equal(a.messages.some(message => message.type === 'skyDuelFound'), false,
      'countdown waits for both clients to finish loading');
    assert.equal(a.messages.some(message => message.type === 'skyDuelState'), false,
      'the loading panel stays visible until both pilots are ready');
    b.send('skyDuelReady');
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
    assert.equal(a.messages.some(message => message.type === 'skyDuelFound'), false,
      'server also waits for the second pilot to finish the presentation');
    b.send('skyDuelPresentationReady');
    const [foundA, foundB] = await Promise.all([a.waitFor('skyDuelFound'), b.waitFor('skyDuelFound')]);
    assert.equal(foundA.matchId, foundB.matchId);
    assert.equal(foundA.countdownEndsAt, foundB.countdownEndsAt, 'both pilots receive one authoritative start time');
    assert.ok(Number(foundA.countdownEndsAt) - Date.now() > 4_000, 'match starts after a five-second countdown');
    assert.equal(typeof foundA.aircraftA, 'string');
    assert.equal(typeof foundA.aircraftB, 'string');
    const firstIsA = foundA.pilotAId === first.pilotId;
    assert.equal(profiles.getOrCreate(first.pilotId, 'First').credits, 4500);
    assert.equal(profiles.getOrCreate(second.pilotId, 'Second').credits, 4500);
    b.close();
    await a.waitFor('skyDuelOpponentDisconnected');
    b = new PilotClient(port, signedSecond.cookie!, second.pilotId);
    await b.waitFor('welcome');
    const resumedCountdown = await a.waitFor('skyDuelState', message => message.phase === 'countdown' &&
      Number(message.countdownEndsAt) > Number(foundA.countdownEndsAt));
    assert.ok(Number(resumedCountdown.countdownEndsAt) - Date.now() > 3_500,
      'a reconnect before combat restarts a shared countdown');
    await a.waitFor('skyDuelState', message => message.phase === 'active');
    b.close();
    await a.waitFor('skyDuelOpponentDisconnected');
    b = new PilotClient(port, signedSecond.cookie!, second.pilotId);
    await b.waitFor('welcome');
    await b.waitFor('skyDuelState', message => message.phase === 'active');
    assert.equal(profiles.getOrCreate(second.pilotId, 'Second').credits, 4500,
      'reconnect never reserves a second stake');
    const keepState = setInterval(() => { a?.sendState(); b?.sendState(); }, 100);
    const fire = setInterval(() => a?.send('fire'), 350);
    try {
      await a.waitFor('skyDuelState', message => Number(firstIsA ? message.scoreA : message.scoreB) >= 1, 15_000);
    } finally { clearInterval(fire); clearInterval(keepState); }
    a.send('skyDuelSurrender');
    const [resultA, resultB] = await Promise.all([a.waitFor('skyDuelResult'), b.waitFor('skyDuelResult')]);
    assert.equal(resultA.outcome, firstIsA ? 'WIN_B' : 'WIN_A');
    assert.equal(resultB.outcome, firstIsA ? 'WIN_B' : 'WIN_A');
    assert.equal(profiles.getOrCreate(first.pilotId, 'First').credits, 4500);
    assert.equal(profiles.getOrCreate(second.pilotId, 'Second').credits, 5500);
    a.send('skyDuelSurrender');
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sky_duel_receipts').get()?.count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM wallet_transactions WHERE reason = ?').get('SKY_DUEL_PAYOUT')?.count, 1);

    a.close(); b.close();
    a = new PilotClient(port, third.cookie, third.pilotId);
    b = new PilotClient(port, fourth.cookie, fourth.pilotId);
    await Promise.all([a.waitFor('welcome'), b.waitFor('welcome')]);
    a.send('skyDuelQueue'); b.send('skyDuelQueue');
    const secondFound = await a.waitFor('skyDuelFound');
    await b.waitFor('skyDuelFound');
    const thirdIsA = secondFound.pilotAId === third.pilotId;
    await a.waitFor('skyDuelState', message => message.phase === 'active');
    const combatState = setInterval(() => { a?.sendState(); b?.sendState(); }, 100);
    const combatFire = setInterval(() => a?.send('fire'), 350);
    try {
      const win = await a.waitFor('skyDuelResult', message => message.outcome === (thirdIsA ? 'WIN_A' : 'WIN_B'), 35_000);
      assert.equal(thirdIsA ? win.scoreA : win.scoreB, 3);
      assert.equal(thirdIsA ? win.scoreB : win.scoreA, 0);
    } finally { clearInterval(combatFire); clearInterval(combatState); }
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5500);
    assert.equal(profiles.getOrCreate(fourth.pilotId, 'Fourth').credits, 4500);
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').pilotProgress.xp, 40,
      'the guest winner receives the same server-verified XP');
    assert.equal(profiles.getOrCreate(fourth.pilotId, 'Fourth').pilotProgress.xp, 0,
      'an inactive guest loser receives no XP');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sky_duel_receipts').get()?.count, 2);
    a.send('skyDuelQueue');
    await a.waitFor('skyDuelWaiting');
    a.send('skyDuelCancel');
    await a.waitFor('skyDuelCancelled');
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5500,
      'cancelling a new search never debits Credits');
    a.send('skyDuelPractice');
    const practice = await a.waitFor('skyDuelLoading', message => message.practice === true);
    await a.waitFor('skyDuelFound', message => message.matchId === practice.matchId);
    await a.waitFor('skyDuelState', message => message.matchId === practice.matchId && message.phase === 'active');
    const aiId = practice.pilotBId;
    assert.equal(a.messages.some(message => message.type === 'playerState' && message.playerId === aiId && message.isBot === true), true);
    assert.equal(b.messages.some(message => message.type === 'playerState' && message.playerId === aiId), false,
      'practice AI is private to its pilot');
    const practiceState = setInterval(() => a?.sendState(), 100);
    const practiceFire = setInterval(() => a?.send('fire'), 350);
    try {
      await a.waitFor('skyDuelState', message => message.matchId === practice.matchId &&
        (Number(message.scoreA) >= 1 || Number(message.scoreB) >= 1), 25_000);
    } finally { clearInterval(practiceFire); clearInterval(practiceState); }
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5500,
      'AI practice has no Credit reward');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sky_duel_matches").get()?.count, 2,
      'AI practice creates no paid match record');
    a.send('skyDuelSurrender');
    const practiceResult = await a.waitFor('skyDuelResult', message => message.matchId === practice.matchId);
    assert.equal(practiceResult.practice, true);
  } finally {
    a?.close(); b?.close(); child.kill('SIGTERM'); db.close();
    if (child.exitCode === null) await new Promise(resolveWait => child.once('exit', resolveWait));
    rmSync(dir, { recursive: true, force: true });
  }
});
