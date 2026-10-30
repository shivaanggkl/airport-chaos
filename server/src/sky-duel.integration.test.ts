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
  private pose?: { position: { x: number; y: number; z: number }; heading: number };
  private combatPose?: { position: { x: number; y: number; z: number }; heading: number };
  constructor(port: number, cookie: string, pilotId: string, private readonly autoReady = true) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?city=dallas&launchMode=sky-duel&protocol=${PROTOCOL_VERSION}&pilotId=${pilotId}`,
      { origin: `http://127.0.0.1:${port}`, headers: { Cookie: `airport_chaos_session=${cookie}` } });
    this.socket.on('message', data => {
      try {
        const message = JSON.parse(String(data)) as Message;
        this.messages.push(message);
        if (message.type === 'welcome' && message.resumeFlight) {
          const resumed = message.resumeFlight as { position: { x: number; y: number; z: number }; rotation: { y: number } };
          this.pose = { position: { ...resumed.position }, heading: resumed.rotation.y };
        }
        if (message.type === 'skyDuelSpawn') {
          this.spawn = message as typeof this.spawn;
          this.pose = { position: { ...this.spawn!.position }, heading: this.spawn!.heading };
          this.sendState();
          if (this.autoReady) this.send('skyDuelReady');
        }
        if (message.type === 'skyDuelLoading' && this.autoReady) this.send('skyDuelPresentationReady');
      } catch { /* malformed server message fails wait below */ }
    });
  }
  send(type: string): void { this.socket.send(JSON.stringify({ type })); }
  sendState(): void {
    if (!this.pose || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: 'state', position: this.pose.position,
      rotation: { x: 0, y: this.pose.heading, z: 0 }, boostActive: false }));
  }
  setCombatPose(position: { x: number; y: number; z: number }, heading: number): void {
    this.combatPose = { position, heading };
  }
  stepCombatPose(): void {
    if (this.pose && this.combatPose) {
      const step = (current: number, target: number, limit: number) =>
        current + Math.max(-limit, Math.min(limit, target - current));
      this.pose.position = {
        x: step(this.pose.position.x, this.combatPose.position.x, 50),
        y: step(this.pose.position.y, this.combatPose.position.y, 10),
        z: step(this.pose.position.z, this.combatPose.position.z, 50),
      };
      this.pose.heading = step(this.pose.heading, this.combatPose.heading, 0.07);
    }
    this.sendState();
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

function positionForCombat(shooter: PilotClient, target: PilotClient, shooterSpawn: Message, targetSpawn: Message): void {
  const from = shooterSpawn.position as { x: number; y: number; z: number };
  const to = targetSpawn.position as { x: number; y: number; z: number };
  const shooterWest = from.x < to.x;
  const altitude = Math.max(from.y, to.y) + 150;
  const center = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
  shooter.setCombatPose({ x: center.x + (shooterWest ? -250 : 250), y: altitude, z: center.z },
    shooterWest ? -Math.PI / 2 : Math.PI / 2);
  target.setCombatPose({ x: center.x, y: altitude, z: center.z }, 0);
}

test('real two-player combat, reconnect, surrender, payouts, and isolated AI fallback', { timeout: 200_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'airport-chaos-duel-live-'));
  const path = join(dir, 'profiles.sqlite');
  const profiles = new PlayerProfileStore(path);
  const sessions = new PilotSessionStore(path);
  const now = Date.now();
  const first = sessions.issue(undefined, false, now);
  const second = sessions.issue(undefined, false, now);
  const third = sessions.issue(undefined, false, now);
  const fourth = sessions.issue(undefined, false, now);
  const fifth = sessions.issue(undefined, false, now);
  const sixth = sessions.issue(undefined, false, now);
  profiles.getOrCreate(first.pilotId, 'First');
  profiles.getOrCreate(second.pilotId, 'Second');
  profiles.getOrCreate(third.pilotId, 'Third');
  profiles.getOrCreate(fourth.pilotId, 'Fourth');
  profiles.getOrCreate(fifth.pilotId, 'Fifth');
  profiles.getOrCreate(sixth.pilotId, 'Sixth');
  const signedFirst = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${first.cookie}`)!,
    'duel-first@example.com', 'a long first password', now);
  const signedSecond = await sessions.signUp(sessions.resolveSession(`airport_chaos_session=${second.cookie}`)!,
    'duel-second@example.com', 'a long second password', now);
  assert.equal(signedFirst.ok, true);
  assert.equal(signedSecond.ok, true);
  const db = new DatabaseSync(path);
  db.prepare('UPDATE player_profiles SET credits = 5000 WHERE pilot_id IN (?,?,?,?,?,?)')
    .run(first.pilotId, second.pilotId, third.pilotId, fourth.pilotId, fifth.pilotId, sixth.pilotId);
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
    const [loadingA, loadingB] = await Promise.all([a.waitFor('skyDuelLoading'), b.waitFor('skyDuelLoading')]);
    assert.equal(loadingA.playerAId, loadingB.playerAId);
    assert.equal(loadingA.playerBId, loadingB.playerBId);
    assert.notEqual(loadingA.playerAId, loadingA.playerBId, 'HUD participants have distinct live entity IDs');
    const [spawnA, spawnB] = await Promise.all([a.waitFor('skyDuelSpawn'), b.waitFor('skyDuelSpawn')]);
    assert.equal(spawnA.speed, 0);
    assert.equal(spawnB.speed, 0);
    assert.equal(Math.abs(Number((spawnA.position as { x: number }).x) - Number((spawnB.position as { x: number }).x)), 17_660,
      'human pilots start at DFW and Love Field');
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
    assert.equal(foundA.playerAId, loadingA.playerAId);
    assert.equal(foundA.playerBId, loadingA.playerBId);
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
    const [launchA, launchB] = await Promise.all([
      a.waitFor('skyDuelState', message => message.phase === 'launch', 15_000),
      b.waitFor('skyDuelState', message => message.phase === 'launch', 15_000),
    ]);
    assert.equal(launchA.launchStartedAt, launchB.launchStartedAt, 'both pilots share the runway intro');
    assert.equal(launchA.launchCountdownAt, launchB.launchCountdownAt, 'both pilots share the runway countdown');
    assert.equal(launchA.launchEndsAt, launchB.launchEndsAt, 'both pilots start play together');
    for (const [client, peerId] of [[a, firstIsA ? loadingA.playerBId : loadingA.playerAId], [b, firstIsA ? loadingB.playerAId : loadingB.playerBId]] as const) {
      const launchIndex = client.messages.findIndex(message => message === (client === a ? launchA : launchB));
      let countdownIndex = launchIndex - 1;
      while (countdownIndex >= 0 && (client.messages[countdownIndex].type !== 'skyDuelState' ||
        client.messages[countdownIndex].phase !== 'countdown')) countdownIndex -= 1;
      assert.ok(countdownIndex >= 0 && client.messages.slice(countdownIndex + 1, launchIndex).some(message =>
        message.type === 'playerState' && message.playerId === peerId && message.lifeState === 'respawning'),
      `each pilot receives the opponent runway pose before the split view begins: ${JSON.stringify({
        peerId, firstIsA, countdownIndex, launchIndex,
        sequence: client.messages.slice(Math.max(0, countdownIndex - 2), launchIndex + 1)
          .map(message => ({ type: message.type, phase: message.phase, playerId: message.playerId,
            lifeState: message.lifeState, position: message.type === 'playerState' ? message.position : undefined })),
      })}`);
    }
    assert.equal(Number(launchA.launchCountdownAt) - Number(launchA.launchStartedAt), 5_000);
    assert.equal(Number(launchA.launchEndsAt) - Number(launchA.launchCountdownAt), 3_000);
    assert.equal(a.messages.some(message => message.type === 'skyDuelState' && message.phase === 'active'), false,
      'the match clock does not start during the runway presentation');
    await a.waitFor('skyDuelState', message => message.phase === 'active', 18_000);
    b.close();
    await a.waitFor('skyDuelOpponentDisconnected');
    b = new PilotClient(port, signedSecond.cookie!, second.pilotId);
    await b.waitFor('welcome');
    await b.waitFor('skyDuelState', message => message.phase === 'active');
    assert.equal(profiles.getOrCreate(second.pilotId, 'Second').credits, 4500,
      'reconnect never reserves a second stake');
    b.sendState();
    await b.waitFor('playerState', message => message.playerId === loadingB.playerBId && message.lifeState === 'alive');
    b.send('skyDuelGroundCrash');
    await a.waitFor('skyDuelState', message => Number(firstIsA ? message.scoreA : message.scoreB) === 1);
    b.send('skyDuelGroundCrash');
    await b.waitFor('skyDuelSpawn', message => message.active === true);
    assert.equal(Math.max(...a.messages.filter(message => message.type === 'skyDuelState')
      .map(message => Number(firstIsA ? message.scoreA : message.scoreB))), 1,
    'one crash gives the opponent one point even if the client repeats the report');
    positionForCombat(a, b, spawnA, spawnB);
    const keepState = setInterval(() => { a?.stepCombatPose(); b?.stepCombatPose(); }, 100);
    const fire = setInterval(() => a?.send('fire'), 350);
    try {
      await a.waitFor('skyDuelState', message => Number(firstIsA ? message.scoreA : message.scoreB) >= 2, 40_000);
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

    a.socket.send(JSON.stringify({ type: 'skyDuelRematchReady', matchId: resultA.matchId }));
    const [readyA, readyB] = await Promise.all([
      a.waitFor('skyDuelRematchState', message => message.matchId === resultA.matchId && (message.readyA === true || message.readyB === true)),
      b.waitFor('skyDuelRematchState', message => message.matchId === resultA.matchId && (message.readyA === true || message.readyB === true)),
    ]);
    assert.deepEqual([readyA.readyA, readyA.readyB], [readyB.readyA, readyB.readyB]);
    assert.equal(a.messages.filter(message => message.type === 'skyDuelLoading').length, 1,
      'one replay choice cannot start or charge a new match');
    b.socket.send(JSON.stringify({ type: 'skyDuelRematchReady', matchId: resultA.matchId }));
    await Promise.all([
      a.waitFor('skyDuelRematchState', message => message.matchId === resultA.matchId && message.readyA === true && message.readyB === true),
      b.waitFor('skyDuelRematchState', message => message.matchId === resultA.matchId && message.readyA === true && message.readyB === true),
    ]);
    const [rematchA, rematchB] = await Promise.all([
      a.waitFor('skyDuelLoading', message => message.matchId !== resultA.matchId),
      b.waitFor('skyDuelLoading', message => message.matchId !== resultA.matchId),
    ]);
    assert.equal(rematchA.matchId, rematchB.matchId);
    assert.equal(profiles.getOrCreate(first.pilotId, 'First').credits, 4000);
    assert.equal(profiles.getOrCreate(second.pilotId, 'Second').credits, 5000);
    a.send('skyDuelCancel');
    await a.waitFor('skyDuelResult', message => message.matchId === rematchA.matchId && message.outcome === 'CANCELLED');
    assert.equal(profiles.getOrCreate(first.pilotId, 'First').credits, 4500);
    assert.equal(profiles.getOrCreate(second.pilotId, 'Second').credits, 5500);

    a.close(); b.close();
    a = new PilotClient(port, third.cookie, third.pilotId);
    b = new PilotClient(port, fourth.cookie, fourth.pilotId);
    await Promise.all([a.waitFor('welcome'), b.waitFor('welcome')]);
    a.send('skyDuelQueue'); b.send('skyDuelQueue');
    const secondFound = await a.waitFor('skyDuelFound');
    await b.waitFor('skyDuelFound');
    const [secondSpawnA, secondSpawnB] = await Promise.all([a.waitFor('skyDuelSpawn'), b.waitFor('skyDuelSpawn')]);
    const thirdIsA = secondFound.pilotAId === third.pilotId;
    await a.waitFor('skyDuelState', message => message.phase === 'active', 18_000);
    positionForCombat(a, b, secondSpawnA, secondSpawnB);
    const combatState = setInterval(() => { a?.stepCombatPose(); b?.stepCombatPose(); }, 100);
    const combatFire = setInterval(() => a?.send('fire'), 350);
    try {
      const score = await a.waitFor('skyDuelState', message => Number(thirdIsA ? message.scoreA : message.scoreB) >= 3, 85_000);
      assert.equal(thirdIsA ? score.scoreB : score.scoreA, 0);
      assert.equal(a.messages.some(message => message.type === 'skyDuelResult' && message.matchId === secondFound.matchId), false,
        'three points do not end the match before the timer');
    } finally { clearInterval(combatFire); clearInterval(combatState); }
    b.send('skyDuelSurrender');
    const win = await a.waitFor('skyDuelResult', message => message.matchId === secondFound.matchId);
    assert.equal(win.outcome, thirdIsA ? 'WIN_A' : 'WIN_B');
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5500);
    assert.equal(profiles.getOrCreate(fourth.pilotId, 'Fourth').credits, 4500);
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').pilotProgress.xp, 0,
      'a forfeit does not grant natural match XP');
    assert.equal(profiles.getOrCreate(fourth.pilotId, 'Fourth').pilotProgress.xp, 0,
      'an inactive guest loser receives no XP');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sky_duel_receipts').get()?.count, 3);
    a.send('skyDuelQueue');
    await a.waitFor('skyDuelWaiting');
    a.send('skyDuelCancel');
    await a.waitFor('skyDuelCancelled');
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5500,
      'cancelling a new search never debits Credits');
    a.send('skyDuelQueue');
    const aiMatch = await a.waitFor('skyDuelLoading', message => message.aiOpponent === true && message.practice === false, 20_000);
    assert.equal(aiMatch.pilotB, 'AI PLAYER');
    assert.equal(aiMatch.levelB, 50, 'fallback AI displays the top pilot rank');
    assert.equal(aiMatch.aircraftB, 'fighter', 'fallback AI flies the strongest combat aircraft');
    assert.equal(aiMatch.entry, 500);
    assert.equal(aiMatch.prize, 1000);
    assert.equal(aiMatch.playerBId, aiMatch.pilotBId, 'AI telemetry uses the match participant ID');
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5000, 'AI match reserves the human stake');
    assert.equal(profiles.getOrCreate(`sky-duel-ai:${third.pilotId}`, 'AI PLAYER').credits, 0, 'AI reserves its own stake');
    const aiFound = await a.waitFor('skyDuelFound', message => message.matchId === aiMatch.matchId);
    assert.equal(aiFound.levelB, 50);
    await a.waitFor('skyDuelState', message => message.matchId === aiMatch.matchId && message.phase === 'active', 18_000);
    const aiId = aiMatch.pilotBId;
    const aiStart = await a.waitFor('playerState', message => message.playerId === aiId && message.isBot === true);
    assert.equal(aiStart.aircraftType, 'fighter');
    assert.ok(Number.isFinite(aiStart.altitudeMeters), 'AI starting altitude is available to the HUD');
    const aiStartPosition = aiStart.position as { x: number; y: number; z: number };
    const aiSpawn = a.messages.filter(message => message.type === 'skyDuelSpawn').at(-1)!;
    assert.equal(Math.abs(aiStartPosition.x - Number((aiSpawn.position as { x: number }).x)), 17_660,
      'AI starts on the Love Field runway');
    assert.equal(b.messages.some(message => message.type === 'playerState' && message.playerId === aiId), false,
      'practice AI is private to its pilot');
    const aiState = setInterval(() => a?.sendState(), 100);
    try {
      await a.waitFor('state', message => message.playerId === aiId &&
        Number((message.position as { z: number }).z) < aiStartPosition.z - 15, 15_000);
    } finally { clearInterval(aiState); }
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sky_duel_matches").get()?.count, 4,
      'paid AI fallback creates an authoritative match record');
    a.send('skyDuelSurrender');
    const aiResult = await a.waitFor('skyDuelResult', message => message.matchId === aiMatch.matchId);
    assert.equal(aiResult.outcome, 'WIN_B');
    assert.equal(aiResult.aiOpponent, true);
    assert.equal(aiResult.levelB, 50);
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5000,
      'forfeiting the paid AI match loses the reserved entry');
    assert.equal(profiles.getOrCreate(`sky-duel-ai:${third.pilotId}`, 'AI PLAYER').credits, 1000,
      'AI receives the same settled pool when the human forfeits');
    a.socket.send(JSON.stringify({ type: 'skyDuelRematchReady', matchId: aiResult.matchId }));
    await a.waitFor('skyDuelRematchState', message => message.matchId === aiResult.matchId &&
      message.readyA === true && message.readyB === true);
    const aiRematch = await a.waitFor('skyDuelLoading', message => message.aiOpponent === true &&
      message.matchId !== aiResult.matchId);
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 4500);
    a.send('skyDuelCancel');
    await a.waitFor('skyDuelResult', message => message.matchId === aiRematch.matchId && message.outcome === 'CANCELLED');
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5000,
      'a cancelled AI rematch refunds its new reservation');
    a.send('skyDuelPractice');
    const practice = await a.waitFor('skyDuelLoading', message => message.practice === true);
    a.send('skyDuelSurrender');
    await a.waitFor('skyDuelResult', message => message.matchId === practice.matchId && message.practice === true);
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 5000,
      'explicit AI practice remains free');
    a.send('skyDuelQueue');
    const absentMatch = await a.waitFor('skyDuelLoading', message => message.aiOpponent === true &&
      message.practice === false && message.matchId !== aiMatch.matchId && message.matchId !== aiRematch.matchId, 20_000);
    a.close();
    await new Promise(resolveWait => setTimeout(resolveWait, 16_000));
    a = new PilotClient(port, third.cookie, third.pilotId);
    await a.waitFor('welcome');
    const absenceResult = await a.waitFor('skyDuelResult', message => message.matchId === absentMatch.matchId);
    assert.equal(absenceResult.outcome, 'WIN_B', 'an absent pilot forfeits before gameplay starts');
    assert.equal(absenceResult.prize, 0, 'the AI does not receive the unused prize pool');
    assert.equal(profiles.getOrCreate(third.pilotId, 'Third').credits, 4500);
    assert.equal(profiles.getOrCreate(`sky-duel-ai:${third.pilotId}`, 'AI PLAYER').credits, 500);
    a.socket.send(JSON.stringify({ type: 'skyDuelResultSeen', matchId: absentMatch.matchId }));
    a.close(); b.close();
    a = new PilotClient(port, fifth.cookie, fifth.pilotId, false);
    b = new PilotClient(port, sixth.cookie, sixth.pilotId, false);
    await Promise.all([a.waitFor('welcome'), b.waitFor('welcome')]);
    a.send('skyDuelQueue'); b.send('skyDuelQueue');
    const pending = await a.waitFor('skyDuelLoading', message => message.practice !== true);
    await b.waitFor('skyDuelLoading', message => message.matchId === pending.matchId);
    a.send('skyDuelCancel');
    const cancelled = await a.waitFor('skyDuelResult', message => message.matchId === pending.matchId);
    assert.equal(cancelled.outcome, 'CANCELLED', 'leaving during matchmaking cancels a newly reserved match');
    assert.equal(profiles.getOrCreate(fifth.pilotId, 'Fifth').credits, 5000);
    assert.equal(profiles.getOrCreate(sixth.pilotId, 'Sixth').credits, 5000);
  } finally {
    a?.close(); b?.close(); child.kill('SIGTERM'); db.close();
    if (child.exitCode === null) await new Promise(resolveWait => child.once('exit', resolveWait));
    rmSync(dir, { recursive: true, force: true });
  }
});
