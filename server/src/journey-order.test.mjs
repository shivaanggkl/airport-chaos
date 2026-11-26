import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {PilotProfileSummaryStore} from './pilot-profile-summary.js';
const temporary=()=>{const dir=mkdtempSync(join(tmpdir(),'journey-order-'));return {dir,path:join(dir,'profiles.sqlite')};};
import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyCatalog, journeyMissionOrder, journeyMissionSlot, isMonsterJourneyMission } from '../../shared/journey-mission.mjs';
import { missionJourneyStages, missionJourneyStatuses } from '../../client/src/mission-journey-model.js';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.js';

test('category display numbers do not change legacy mission identities or gameplay slots', () => {
  assert.equal(journeyCatalog.length, 30);
  assert.equal(journeyMissionOrder.length, 28);
  for (const slot of journeyCatalog) assert.equal(journeyMissionSlot(slot.id), slot.number);
  assert.equal(journeyMissionSlot('journey-dallas-23'), 29);
  assert.equal(journeyMissionSlot('journey-dallas-19'), 30);
  assert.deepEqual(journeyMissionOrder.filter(isMonsterJourneyMission), ['journey-dallas-23','journey-dallas-19']);
  assert.deepEqual(missionJourneyStages.filter(stage => stage.implementation === 'playable').map(stage => stage.id).sort(), [...journeyMissionOrder].sort());
  for (const id of journeyMissionOrder) assert.ok(missionJourneyDetails.some(card => card.id === id));
  assert.ok(missionJourneyDetails.some(card => card.id.includes('survival')), 'disabled Survival definition is retained');
  assert.ok(!missionJourneyStages.some(stage => stage.id.includes('survival')), 'disabled Survival is not displayed');
});

test('rollout preserves earned legacy access once, keeps history and wallets intact, and retires paused attempts',()=>{
 const {dir,path}=temporary();const profiles=new PlayerProfileStore(path);profiles.getOrCreate('historical','Pilot');
 new JourneyAttemptStore(path);const db=new DatabaseSync(path);
 try{
  // Simulate the durable database immediately before this catalog version existed.
  db.exec("DELETE FROM journey_catalog_versions; DELETE FROM journey_access_grants;");
  const now=Date.now();
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('historical','journey-dallas-13','original-13',now-5000,1234,1);
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('historical','journey-dallas-25','retired-clear',now-4000,4321,1);
  db.prepare(`INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at,paused_at,definition_revision)
    VALUES('retired-active','historical','journey-dallas-22','dallas','trainer','RACING',?,?,2)`).run(now-1000,now-100);
  const before=profiles.getOrCreate('historical','Pilot').credits;
  const store=new JourneyAttemptStore(path);
  assert.equal(store.canAccessMission('historical','journey-dallas-03'),true,'old successor remains accessible after clearing its historical predecessor');
  assert.equal(store.progress('historical','journey-dallas-13').firstAttemptId,'original-13');
  assert.equal(store.progress('historical','journey-dallas-25').bestTimeMs,4321);
  assert.equal(store.get('historical','retired-active').status,'ABANDONED');
  assert.equal(store.activeSnapshot('historical','retired-active'),undefined);
  assert.equal(store.resume('historical','retired-active'),undefined);
  assert.equal(store.continuation('historical','retired-active'),undefined);
  assert.equal(store.continueAfterAd('historical','retired-active','fake'),undefined);
  assert.equal(profiles.getOrCreate('historical','Pilot').credits,before);
  profiles.getOrCreate('new','Pilot');
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('new','journey-dallas-13','later',now,1000,1);
  const reopened=new JourneyAttemptStore(path);
  assert.equal(reopened.canAccessMission('new','journey-dallas-03'),false,'restart must not grandfather new-order clears');
  assert.equal(reopened.canAccessMission('historical','journey-dallas-03'),true);
  assert.equal(new PilotProfileSummaryStore(path).summary('historical').singlePlayer.missionsTotal,28);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('remaining monster encounters retain their definitions at M29/M30 and all completed slots skip placeholders',()=>{
 const {dir,path}=temporary();const profiles=new PlayerProfileStore(path);profiles.getOrCreate('qa','Pilot');const store=new JourneyAttemptStore(path,true);
 try{
  assert.equal(journeyMissionSlot('journey-dallas-23'),29);assert.equal(journeyMissionSlot('journey-dallas-19'),30);
  assert.equal(store.launch('qa','trainer',1000,'journey-dallas-23').monsterHealth,2000);
  assert.equal(store.launch('qa','trainer',2000,'journey-dallas-19').monsterHealth,3000);
  const db=new DatabaseSync(path),now=Date.now();
  for(const id of journeyMissionOrder) db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('qa',id,`clear-${id}`,now-1000,1000,1);
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('qa','journey-dallas-25','retired',now-2000,1000,1);
  const summary=new PilotProfileSummaryStore(path).summary('qa',now);
  assert.equal(summary.singlePlayer.missionsCompleted,28);
  assert.equal(summary.singlePlayer.chaptersCompleted,4);
  assert.equal(summary.singlePlayer.citiesCompleted,1);
  assert.equal(store.chapterOneComplete('qa'),true);
  db.close();
  const state=missionJourneyStatuses(Array(42).fill(true),Array(42).fill(true),false);
  assert.equal(state.currentMission,0);
  missionJourneyStages.forEach((slot,index)=>assert.equal(state.statuses[index],slot.implementation==='playable'?'completed':'locked'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
