import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {monsterMissionContracts} from './p14-monster-contracts.test.mjs';
import {JourneyAttemptStore} from './journey-attempts.js';
import {journeyDallas23,journeyDallas19,journeyDallas24,journeyMissionOrder,journeyMissionSlot} from '../../shared/journey-mission.mjs';

monsterMissionContracts(journeyDallas23,3150);
monsterMissionContracts(journeyDallas19,4000);

test('displayed M24 completes all 24 Journey slots through internal mission 19 and preserves historical clears on replay',()=>{
 assert.equal(journeyMissionSlot(journeyDallas23.id),23);
 assert.equal(journeyMissionSlot(journeyDallas19.id),24);
 assert(!journeyMissionOrder.includes(journeyDallas24.id));
 const dir=mkdtempSync(join(tmpdir(),'p15-finale-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 try{
  const store=new JourneyAttemptStore(path,false);
  // Seed pre-finale history as the unit-test precondition; the flight
  // simulation separately requires all 60 real swept projectile hits.
  const insert=db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)');
  for(const id of journeyMissionOrder.slice(0,23))insert.run('pilot',id,`historical:${id}`,1,12345);
  const history=db.prepare('SELECT * FROM journey_completions ORDER BY mission_id').all();
  assert(store.canAccessMission('pilot',journeyDallas19.id));assert(!store.canAccessMission('pilot',journeyDallas24.id));
  assert.throws(()=>store.launch('pilot','trainer',1000,journeyDallas24.id));
  for(const epoch of [1000,1000000]){
   const launched=store.launch('pilot','trainer',epoch,journeyDallas19.id);store.approach('pilot',launched.attemptId,epoch+1);
   const active=store.startMonsterArrival('pilot',launched.attemptId,epoch+2);
   assert.equal(active.deadlineAt,epoch+360002);
   assert.equal(store.hitMonster('foreign',launched.attemptId,epoch+3,1500),undefined);
   let result;
   for(let hit=0;hit<60;hit++)result=store.hitMonster('pilot',launched.attemptId,epoch+1000+hit*300,25);
   assert.equal(result.status,'COMPLETED');assert.equal(result.firstClearCredits,epoch===1000?4000:0);
   assert(journeyMissionOrder.every(id=>store.progress('pilot',id).completed));
   assert.equal(store.hitMonster('pilot',launched.attemptId,epoch+30000,25),undefined);
  }
  assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,4000);
  assert.deepEqual(db.prepare('SELECT * FROM journey_completions WHERE mission_id<>? ORDER BY mission_id').all(journeyDallas19.id),history);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
