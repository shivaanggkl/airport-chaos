import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas18, journeyDallas19, journeyExitCrossing } from '../../shared/journey-mission.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { JourneyAttemptStore } from './journey-attempts.js';
import { insideJourneyHunterArena, boundJourneyHunterPoint } from './journey-hunter-airspace.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-breakout-test-'));
  const path = join(directory, 'profiles.sqlite');
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('other',0,0),('capped',999950,0)");
  database.close();
  return { directory, path, store: new JourneyAttemptStore(path) };
}

test('one large exit has a directional swept opening in supported Dallas airspace', () => {
  const mission = journeyDallas19;
  const { exit, airborneSpawn } = mission;
  assert.equal(mission.gates.length, 1);
  assert.ok(exit.radius >= 300);
  assert.ok(Math.abs(exit.x) + exit.radius < 25_000);
  assert.ok(Math.abs(exit.z) + exit.radius < 25_000);
  const distance = Math.hypot(exit.x - airborneSpawn.x, exit.z - airborneSpawn.z);
  assert.ok(distance > 29_000 && distance < 31_000);
  assert.ok(distance / aircraftFlightEnvelope.trainer.maxSpeed < mission.timeLimitMs / 1_000);
  const center = { x: exit.x, y: 150 + exit.altitude, z: exit.z };
  const before = { ...center, x: center.x - exit.normalX * 500, z: center.z - exit.normalZ * 500 };
  const after = { ...center, x: center.x + exit.normalX * 500, z: center.z + exit.normalZ * 500 };
  assert.equal(journeyExitCrossing(before, after, 150), true);
  assert.equal(journeyExitCrossing(after, before, 150), false);
  assert.equal(journeyExitCrossing({ ...before, y: before.y + exit.radius }, { ...after, y: after.y + exit.radius }, 150), false);
  assert.equal(journeyExitCrossing({ ...before, x: before.x + 500 }, { ...after, x: after.x + 500 }, 150), false);
  assert.equal(missionFocusForAttempt({ missionId: mission.id, status: 'APPROACH' })?.showAmbientAIAircraft, false);
  assert.equal(missionFocusForAttempt({ missionId: mission.id, status: 'COMPLETED' }), null);
  const spawn = authorizedJourneyAirborneSpawn({ missionId: mission.id, status: 'APPROACH' }, mission, () => 140);
  assert.deepEqual(spawn?.position, { x: airborneSpawn.x, y: 140 + airborneSpawn.altitude, z: airborneSpawn.z });
  assert.equal(authorizedJourneyAirborneSpawn({ missionId: mission.id, status: 'FAILED' }, mission, () => 140), undefined);
  const hunter = { x: airborneSpawn.x + mission.hunterOffset.x, z: airborneSpawn.z + mission.hunterOffset.z };
  assert.equal(insideJourneyHunterArena(hunter), true);
  assert.deepEqual(boundJourneyHunterPoint(hunter), hunter); // no boundary clamp shortens the head start
  assert.ok(Math.hypot(mission.hunterOffset.x, mission.hunterOffset.z) > 8_000);
});

test('Mission 18 unlock, preparation, deadline, Hunter assignment, idempotent reward, retry and cap', () => {
  const { directory, path, store } = fixture();
  try {
    assert.throws(() => store.launch('pilot', 'trainer', 1_000, journeyDallas19.id), /locked/);
    const db = new DatabaseSync(path);
    for (const pilot of ['pilot', 'capped']) db.prepare('INSERT INTO journey_completions (pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
      .run(pilot, journeyDallas18.id, `${pilot}-m18`, 500, 50_000);
    const first = store.launch('pilot', 'trainer', 1_000, journeyDallas19.id);
    assert.equal(store.startBreakout('pilot', first.attemptId, 5_000), undefined);
    const approach = store.approach('pilot', first.attemptId, 1_100);
    assert.equal(approach?.prepareUntil, 4_100);
    assert.equal(approach?.deadlineAt, null);
    assert.equal(store.startBreakout('other', first.attemptId, 4_100), undefined);
    assert.equal(store.startBreakout('pilot', first.attemptId, 4_099), undefined);
    assert.equal(store.completeBreakout('pilot', first.attemptId, 4_099), undefined);
    const racing = store.startBreakout('pilot', first.attemptId, 4_200);
    assert.equal(racing?.startedAt, 4_200);
    assert.equal(racing?.deadlineAt, 79_200);
    assert.equal(store.startBreakout('pilot', first.attemptId, 4_300), undefined);
    assert.equal(store.completeBreakout('pilot', first.attemptId, 4_300), undefined);
    assert.equal(store.assignBreakoutHunter('other', first.attemptId, 'wrong', 4_300), undefined);
    assert.equal(store.assignBreakoutHunter('pilot', first.attemptId, 'hunter', 4_300)?.targetId, 'hunter');
    assert.equal(store.assignBreakoutHunter('pilot', first.attemptId, 'duplicate', 4_400), undefined);
    assert.equal(store.completeBreakout('other', first.attemptId, 40_000), undefined);
    const done = store.completeBreakout('pilot', first.attemptId, 50_000);
    assert.equal(done?.status, 'COMPLETED');
    assert.equal(done?.gateIndex, 1);
    assert.equal(done?.finishTimeMs, 45_800);
    assert.equal(done?.firstClearCredits, 2_550);
    assert.equal(store.completeBreakout('pilot', first.attemptId, 50_001), undefined);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits, 2_550);
    const replay = store.launch('pilot', 'trainer', 100_000, journeyDallas19.id);
    store.approach('pilot', replay.attemptId, 100_100);
    store.startBreakout('pilot', replay.attemptId, 103_100);
    store.assignBreakoutHunter('pilot', replay.attemptId, 'hunter-replay', 103_200);
    assert.equal(store.completeBreakout('pilot', replay.attemptId, 178_100), undefined); // deadline is exclusive
    assert.equal(store.fail('pilot', replay.attemptId, 'TIME_UP', 178_100)?.status, 'FAILED');
    const retry = store.launch('pilot', 'trainer', 180_000, journeyDallas19.id);
    assert.equal(retry.targetId, null);
    assert.equal(retry.prepareUntil, null);
    assert.equal(retry.gateIndex, 0);
    store.approach('pilot', retry.attemptId, 180_100);
    store.startBreakout('pilot', retry.attemptId, 183_100);
    store.assignBreakoutHunter('pilot', retry.attemptId, 'hunter-retry', 183_200);
    assert.equal(store.completeBreakout('pilot', retry.attemptId, 200_000)?.firstClearCredits, 0);
    const capped = store.launch('capped', 'trainer', 300_000, journeyDallas19.id);
    store.approach('capped', capped.attemptId, 300_100);
    store.startBreakout('capped', capped.attemptId, 303_100);
    store.assignBreakoutHunter('capped', capped.attemptId, 'hunter-cap', 303_200);
    assert.equal(store.completeBreakout('capped', capped.attemptId, 320_000)?.firstClearCredits, 50);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get().credits, 1_000_000);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_id='journey-dallas-19'").get().count, 2);
    db.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('server crossing and Hunter activation require accepted movement and the live attempt', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /journeyExitCrossing\(previousAcceptedPosition, message\.position/);
  assert.ok(server.includes("active?.missionId === journeyDallas19.id && active.status === 'RACING' && active.targetId"));
  assert.match(server, /ensureJourneyBreakoutHunter\(playerId, player, started, now\)/);
  assert.match(server, /journeyStore\.completeBreakout\(player\.pilotId, journeyAttemptId, stateNow\)/);
  assert.match(server, /removeJourneyHunter\(completed\)/);
  assert.match(server, /journeySpawn\?\.breakout \? journeySpawn\.target\.position\.x/);
});
