import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { journeyDallas23, journeyDallas24, journeyGateCrossing } from '../../shared/journey-mission.mjs';
import { landingGradeForScore } from '../../shared/landing-scoring.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-legendary-'));
  const path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999980,0),('other',0,0)");
  db.close();
  const store = new JourneyAttemptStore(path);
  const seed = new DatabaseSync(path);
  for (const pilot of ['pilot', 'capped']) seed.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,0)')
    .run(pilot, journeyDallas23.id, `m23-${pilot}`, 500);
  seed.close();
  return { directory, path, store };
}

function reachLanding(store, pilot, now) {
  const attempt = store.launch(pilot, 'trainer', now, journeyDallas24.id);
  assert.equal(attempt.legendaryPhase, 'GATES');
  assert.equal(store.approach(pilot, attempt.attemptId)?.status, 'APPROACH');
  assert.equal(store.assignLegendaryAce(pilot, attempt.attemptId, 'early'), undefined);
  for (let i=0; i<3; i++) {
    assert.equal(store.acceptLegendaryGate(pilot, attempt.attemptId, i+1, now+1000+i*500), undefined);
    assert.equal(store.acceptLegendaryGate(pilot, attempt.attemptId, i, now+1000+i*500)?.gateIndex, i+1);
    assert.equal(store.acceptLegendaryGate(pilot, attempt.attemptId, i, now+1000+i*500), undefined);
  }
  assert.equal(store.get(pilot, attempt.attemptId)?.legendaryPhase, 'ACE');
  assert.equal(store.assignLegendaryAce(pilot, attempt.attemptId, 'ace')?.targetId, 'ace');
  assert.equal(store.assignLegendaryAce(pilot, attempt.attemptId, 'duplicate'), undefined);
  assert.equal(store.defeatLegendaryAce('other', attempt.attemptId, 'ace'), undefined);
  assert.equal(store.defeatLegendaryAce(pilot, attempt.attemptId, 'wrong'), undefined);
  assert.equal(store.defeatLegendaryAce(pilot, attempt.attemptId, 'ace')?.legendaryPhase, 'LANDING');
  assert.equal(store.defeatLegendaryAce(pilot, attempt.attemptId, 'ace'), undefined);
  return attempt;
}

test('Mission 24 is gated, three ordered gates lead to one Ace and then landing', () => {
  const {directory,path,store}=fixture();
  try {
    assert.equal(journeyDallas24.gates.length,3);
    assert.deepEqual(journeyDallas24.gates.map(g=>g.radius),[190,130,82]);
    assert.equal(journeyDallas24.bossHealth,300);
    assert.equal(journeyDallas24.bossHealth/25,12);
    assert.throws(()=>store.launch('other','trainer',1000,journeyDallas24.id),/locked/);
    const attempt=reachLanding(store,'pilot',2000);
    assert.equal(store.recordLegendaryLanding('pilot',attempt.attemptId,'dfw',820,0,5000)?.status,'COMPLETED');
    assert.equal(store.progress('pilot',journeyDallas24.id).completed,true);
    assert.equal(missionFocusForAttempt({missionId:journeyDallas24.id,status:'RACING'})?.showAmbientAIAircraft,false);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('Mission 24 gate openings match forward swept validation and Bluejay pitch envelope', () => {
  const gates = journeyDallas24.gates;
  const departure = { x: -5_140, z: -7_780, altitude: 200 };
  for (const [index, gate] of gates.entries()) {
    assert.ok(Math.abs(Math.hypot(gate.normalX, gate.normalY, gate.normalZ) - 1) < .001);
    const centerY = 150 + gate.altitude;
    const before = { x: gate.x - gate.normalX * 6, y: centerY - gate.normalY * 6, z: gate.z - gate.normalZ * 6 };
    const after = { x: gate.x + gate.normalX * 6, y: centerY + gate.normalY * 6, z: gate.z + gate.normalZ * 6 };
    assert.equal(journeyGateCrossing(before, after, index, 150, journeyDallas24), 'VALID');
    assert.equal(journeyGateCrossing(after, before, index, 150, journeyDallas24), false);
    assert.equal(journeyGateCrossing({ ...before, y: before.y + gate.radius }, { ...after, y: after.y + gate.radius }, index, 150, journeyDallas24), false);
    const previous = gates[index - 1] ?? departure;
    const horizontal = Math.hypot(gate.x - previous.x, gate.z - previous.z);
    const nominalClimb = Math.atan2(gate.altitude - previous.altitude, horizontal);
    assert.ok(nominalClimb < aircraftFlightEnvelope.trainer.maxClimbPitch);
    assert.ok(horizontal >= 2_000 && horizontal <= 3_000);
  }
});

test('Only authoritative PERFECT tier on assigned runway wins; safe retries preserve gates and Ace',()=>{
  const {directory,store}=fixture();
  try {
    const attempt=reachLanding(store,'pilot',2000);
    assert.equal(landingGradeForScore(819),'SMOOTH');
    assert.equal(landingGradeForScore(820),'PERFECT');
    assert.equal(store.recordLegendaryLanding('pilot',attempt.attemptId,'dfw',700,0,5000)?.status,'RACING');
    const retry=store.get('pilot',attempt.attemptId);
    assert.equal(retry?.legendaryPhase,'LANDING');
    assert.equal(retry?.gateIndex,3);
    assert.equal(retry?.targetId,'ace');
    assert.equal(retry?.approachCycle,1);
    assert.equal(store.recordLegendaryLanding('pilot',attempt.attemptId,'dfw',940,0,5100),undefined);
    assert.equal(store.recordLegendaryLanding('pilot',attempt.attemptId,'love',940,1,5200)?.status,'RACING');
    assert.equal(store.get('pilot',attempt.attemptId)?.approachCycle,2);
    assert.equal(store.recordLegendaryLanding('pilot',attempt.attemptId,'dfw',940,2,5300)?.firstClearCredits,4000);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('Reward is wallet capped and replay safe; completion record is the persistent achievement',()=>{
  const {directory,path,store}=fixture();
  try {
    const capped=reachLanding(store,'capped',2000);
    assert.equal(store.recordLegendaryLanding('capped',capped.attemptId,'dfw',900,0,5000)?.firstClearCredits,20);
    const first=reachLanding(store,'pilot',6000);
    assert.equal(store.recordLegendaryLanding('pilot',first.attemptId,'dfw',900,0,9000)?.firstClearCredits,4000);
    assert.equal(store.recordLegendaryLanding('pilot',first.attemptId,'dfw',900,0,9100),undefined);
    const replay=reachLanding(store,'pilot',10000);
    assert.equal(store.recordLegendaryLanding('pilot',replay.attemptId,'dfw',950,0,13000)?.firstClearCredits,0);
    const fresh=new JourneyAttemptStore(path);
    assert.equal(fresh.progress('pilot',journeyDallas24.id).completed,true);
    const db=new DatabaseSync(path);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get().credits,1_000_000);
    assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,4000);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE reference_id='journey-dallas-24'").get().n,2);
    db.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('Failed or replaced attempts cannot advance; source uses trusted hit and touchdown pipeline',()=>{
  const {directory,store}=fixture();
  try {
    const first=store.launch('pilot','trainer',1000,journeyDallas24.id);
    store.approach('pilot',first.attemptId);
    assert.equal(store.fail('pilot',first.attemptId,'CRASHED')?.status,'FAILED');
    assert.equal(store.acceptLegendaryGate('pilot',first.attemptId,0,2000),undefined);
    const next=store.launch('pilot','trainer',3000,journeyDallas24.id);
    assert.equal(store.defeatLegendaryAce('pilot',first.attemptId,'ace'),undefined);
    assert.equal(store.abandon('pilot',next.attemptId)?.status,'ABANDONED');
    assert.equal(store.acceptLegendaryGate('pilot',next.attemptId,0,4000),undefined);
    const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
    assert.match(source,/victim\.health = Math\.max\(0, victim\.health - projectileDamage\)/);
    assert.match(source,/journeyStore\.defeatLegendaryAce/);
    assert.match(source,/now - motion\.movedAt > 8_000\) failPlayerJourney\(playerId, 'ACE_INTERRUPTED'/);
    assert.match(source,/journeyStore\.recordLegendaryLanding/);
    assert.match(source,/const killReward = campaignTargetDefeat \? \{ \.\.\.baseKillReward, credits: 0 \}/);
    assert.match(source,/legendaryPilot: journeyStore\.progress\(.*journeyDallas24\.id\)\.completed/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
