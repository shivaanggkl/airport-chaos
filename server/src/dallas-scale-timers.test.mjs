import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {journeyDallas13,journeyDallas14,journeyDallas17,journeyDallas18,journeyDallas21,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {JourneyAttemptStore} from './journey-attempts.js';

test('M21 card and authoritative deadline both use the active twelve-minute boss definition',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dallas-timers-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES('pilot',0,0),('other',0,0)");
 try{
  const store=new JourneyAttemptStore(path,true);
  assert.equal(journeyDallas21.timeLimitMs,720000);assert.equal(journeyMissionSlot(journeyDallas21.id),21);
  assert.equal(missionJourneyDetails.find(d=>d.id===journeyDallas21.id).timeLimit,'12:00');
  const a=store.launch('pilot','trainer',1000,journeyDallas21.id);store.approach('pilot',a.attemptId,1100);
  assert.equal(store.get('pilot',a.attemptId).deadlineAt,null);
  assert.equal(store.startMonsterArrival('other',a.attemptId,2000),undefined);
  const started=store.startMonsterArrival('pilot',a.attemptId,2000);
  assert.equal(started.deadlineAt-started.startedAt,journeyDallas21.timeLimitMs);
  assert.equal(store.startMonsterArrival('pilot',a.attemptId,2100),undefined);
  assert.equal(store.get('pilot',a.attemptId).firstClearCredits,0);
  assert.equal(store.progress('pilot',journeyDallas21.id).completed,false);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('visible M7 and M8 own independent twelve-minute combat clocks and secure GO handoffs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hunter-timers-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL); INSERT INTO player_profiles VALUES('pilot',0,0),('other',0,0)");
 try{
  const store=new JourneyAttemptStore(path,true);
  for(const [slot,mission] of [[7,journeyDallas13],[8,journeyDallas14]]){
   assert.equal(journeyMissionSlot(mission.id),slot);assert.equal(mission.timeLimitMs,720000);
   assert.equal(missionJourneyDetails.find(d=>d.id===mission.id).timeLimit,'12:00');
   const a=store.launch('pilot','trainer',1000,mission.id);store.approach('pilot',a.attemptId,1100);
   assert.equal(store.startFirstContact('pilot',a.attemptId,1200),undefined,'no clock without an owned target');
   store.assignFirstContact('pilot',a.attemptId,`target-${slot}`);
   assert.equal(store.startFirstContact('other',a.attemptId,2000),undefined);
   const started=store.startFirstContact('pilot',a.attemptId,2000);
   assert.equal(started.startedAt,2000);assert.equal(started.deadlineAt,2000+mission.timeLimitMs);
   assert.equal(store.startFirstContact('pilot',a.attemptId,2100),undefined);
   assert.equal(store.completeHunter('pilot',a.attemptId,`target-${slot}`,started.deadlineAt),undefined);
  }
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('divergent future M7/M8 limits cannot leak into the other mission',()=>{
 // Exercise the actual selection expression with unequal definitions: equal live
 // durations alone would not detect the original M8-to-M7 dependency.
 const source=readFileSync(new URL('./journey-attempts.ts',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  startFirstContact('),source.indexOf('  assignHunter('));
 const selection=method.match(/const limit = ([^;]+);/)[1];
 const select=new Function('current','journeyDallas13','journeyDallas14','journeyDallas17','journeyDallas18',`return ${selection};`);
 for(const [m7,m8] of [[123000,456000],[789000,321000]]){
  const seven={...journeyDallas13,timeLimitMs:m7},eight={...journeyDallas14,timeLimitMs:m8};
  for(const mission of [seven,eight,journeyDallas17,journeyDallas18])assert.equal(select({missionId:mission.id},seven,eight,journeyDallas17,journeyDallas18),mission.timeLimitMs);
 }
});
