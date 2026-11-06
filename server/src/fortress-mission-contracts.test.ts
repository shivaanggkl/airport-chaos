import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { journeyDallas10, journeyDallas11, journeyDallas12 } from '../../shared/journey-mission.mjs';
import { JourneyAttemptStore } from './journey-attempts.js';

// Missions 11/12 replaced Gravity Drop/Sky Pendulum. Exercise their current
// authoritative encounter contract instead of restoring retired gate routes.
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'airport-fortress-contract-'));
  const path = join(directory, 'profiles.sqlite');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE player_profiles (pilot_id TEXT PRIMARY KEY, credits INTEGER NOT NULL, sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES ('pilot',0,0),('capped',999950,0),('other',0,0)");
  return { path, db, store: new JourneyAttemptStore(path, true), close() { db.close(); rmSync(directory, { recursive: true, force: true }); } };
}
for (const mission of [journeyDallas11, journeyDallas12]) {
  test(`${mission.name} uses the current fortress objective and preserves its reward`, () => {
    assert.equal(mission.startAirportId, 'dfw');
    assert.equal(mission.turretHealth, 250);
    assert.equal(mission.coreHealth, mission === journeyDallas11 ? 1500 : 1750);
    assert.equal(mission.timeLimitMs, mission === journeyDallas11 ? 330000 : 360000);
    assert.equal(mission.firstClearCredits, mission === journeyDallas11 ? 1250 : 1500);
    assert.equal('gates' in mission, false);
    if ('escortAircraft' in mission) {
      assert.deepEqual(mission.escortAircraft, ['privateJet', 'fighter']);
      assert.equal(mission.escortCount, 2);
    }
  });
  test(`${mission.name} rejects preflight, wrong-owner and expired damage`, () => {
    const f = fixture();
    try {
      const a = f.store.launch('pilot', 'trainer', 1000, mission.id);
      assert.equal(f.store.hitFortressComponent('pilot', a.attemptId, 'left', 1100, 250), undefined);
      f.store.approach('pilot', a.attemptId, 1200);
      const active = f.store.startGiantIncoming('pilot', a.attemptId, 2000)!;
      assert.equal(active.deadlineAt, 2000 + mission.timeLimitMs);
      assert.equal(f.store.startGiantIncoming('pilot', a.attemptId, 2100), undefined);
      assert.equal(f.store.hitFortressComponent('other', a.attemptId, 'left', 2200, 250), undefined);
      assert.equal(f.store.hitTransport('pilot', a.attemptId, 2200, 9999), undefined);
      assert.equal(f.store.hitFortressComponent('pilot', a.attemptId, 'left', active.deadlineAt!, 250), undefined);
      assert.equal(f.store.fail('pilot', a.attemptId, 'TIME_UP', active.deadlineAt!)?.status, 'FAILED');
    } finally { f.close(); }
  });
  test(`${mission.name} accepts every target order and awards only after all required targets`,()=>{
    const f=fixture();
    const permutations=(items:string[]):string[][]=>items.length?items.flatMap((item,index)=>permutations(items.filter((_,i)=>i!==index)).map(rest=>[item,...rest])):[[]];
    try{
      const targets=mission===journeyDallas12?['left','right','core','escort-1','escort-2']:['left','right','core'];
      let launchAt=1000;
      for(const order of permutations(targets)){
        const a=f.store.launch('capped','trainer',launchAt,mission.id);
        f.store.approach('capped',a.attemptId,launchAt+100);
        f.store.startGiantIncoming('capped',a.attemptId,launchAt+200);
        if(mission===journeyDallas12){f.store.assignRearGuardEscort('capped',a.attemptId,'escort-1',1);f.store.assignRearGuardEscort('capped',a.attemptId,'escort-2',2);}
        for(const [index,target] of order.entries()){
          const result=target.startsWith('escort')?f.store.recordRearGuardKill('capped',a.attemptId,target,launchAt+300+index):f.store.hitFortressComponent('capped',a.attemptId,target as 'left'|'right'|'core',launchAt+300+index,target==='core'?mission.coreHealth:250);
          assert.equal(result?.status,index===order.length-1?'COMPLETED':'RACING',order.join(','));
          assert.equal(result?.firstClearCredits,index===order.length-1&&launchAt===1000?50:0);
        }
        assert.equal(f.store.hitFortressComponent('capped',a.attemptId,'core',launchAt+900,1),undefined);
        launchAt+=10000;
      }
      assert.equal((f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='capped'").get() as {credits:number}).credits,1000000);
      assert.equal((f.db.prepare("SELECT COUNT(*) AS count FROM wallet_transactions WHERE pilot_id='capped'").get() as {count:number}).count,1);
    }finally{f.close();}
  });
  test(`${mission.name} still requires the preceding mission outside QA access`, () => {
    const f = fixture();
    try {
      const normal = new JourneyAttemptStore(f.path);
      assert.throws(() => normal.launch('pilot', 'trainer', 1000, mission.id), /locked/);
      f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES (?,?,?,?,?)')
        .run('pilot', mission === journeyDallas11 ? journeyDallas10.id : journeyDallas11.id, 'prior', 500, 0);
      assert.equal(normal.launch('pilot', 'trainer', 1000, mission.id).status, 'READY');
    } finally { f.close(); }
  });
}
