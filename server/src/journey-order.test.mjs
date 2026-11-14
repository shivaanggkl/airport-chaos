import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {journeyCatalog,journeyMissionOrder,journeyMissionSlot,isMonsterJourneyMission} from '../../shared/journey-mission.mjs';
import {missionJourneyStages,missionJourneyStatuses} from '../../client/src/mission-journey-model.js';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {PilotProfileSummaryStore} from './pilot-profile-summary.js';

const identities=[1,2,13,3,'capture-01',14,'airport-hop-01','sharpshooter-01',7,4,15,'coin-hunt-01',8,5,'twin-hunters-01',null,16,9,6,null,null,10,17,11,18,null,null,12,23,19];
const retired=[25,20,21,22,24].map(n=>`journey-dallas-${n}`);
const temporary=()=>{const dir=mkdtempSync(join(tmpdir(),'journey-order-'));return {dir,path:join(dir,'profiles.sqlite')};};

test('one catalog has the exact 30 slots, 25 stable gameplay IDs, five unique placeholders and four chapters',()=>{
 assert.equal(journeyCatalog.length,30);
 assert.deepEqual(journeyCatalog.map(slot=>slot.implementation==='playable'?slot.id==='journey-dallas-twin-hunters-01'?'twin-hunters-01':slot.id==='journey-dallas-coin-hunt-01'?'coin-hunt-01':slot.id==='journey-dallas-capture-01'?'capture-01':slot.id==='journey-dallas-airport-hop-01'?'airport-hop-01':slot.id==='journey-dallas-sharpshooter-01'?'sharpshooter-01':Number(slot.id.slice(-2)):null),identities);
 assert.deepEqual(journeyCatalog.map(slot=>slot.chapter),[...Array(9).fill(1),...Array(9).fill(2),...Array(10).fill(3),4,4]);
 assert.equal(new Set(journeyCatalog.map(slot=>slot.id)).size,30);
 assert.equal(journeyMissionOrder.length,25);
 assert.deepEqual(missionJourneyStages.map(s=>s.id),journeyCatalog.map(s=>s.id));
 assert.deepEqual(missionJourneyDetails.map(s=>s.id),journeyMissionOrder);
 for(const slot of journeyCatalog){assert.equal(journeyMissionSlot(slot.id),slot.number);assert.equal(missionJourneyStages[slot.number-1].title,slot.title);}
 assert.deepEqual(journeyMissionOrder.filter(isMonsterJourneyMission),['journey-dallas-23','journey-dallas-19']);
 const bootstrap=readFileSync('client/src/bootstrap.ts','utf8');
 assert.match(bootstrap,/if \(stage\?\.implementation !== 'playable'\) return/);
 assert.match(bootstrap,/stage.id.replace\('journey-dallas-', 'mission-'\)/);
});

test('new pilots follow every implemented predecessor, skip gaps, and cannot submit later or placeholder IDs',()=>{
 const {dir,path}=temporary();const profiles=new PlayerProfileStore(path),store=new JourneyAttemptStore(path),db=new DatabaseSync(path);
 try{
  const insert=db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)');
  for(let index=1;index<journeyMissionOrder.length;index++){
   const pilot=`pilot-${index}`,id=journeyMissionOrder[index],previous=journeyMissionOrder[index-1];profiles.getOrCreate(pilot,'Pilot');
   assert.equal(store.canAccessMission(pilot,id),false);assert.throws(()=>store.launch(pilot,'trainer',1000,id),/locked/);
   insert.run(pilot,previous,`receipt-${index}`,Date.now()-5000,1000);
   assert.equal(store.canAccessMission(pilot,id),true);assert.equal(store.launch(pilot,'trainer',2000,id).missionId,id);
  }
  profiles.getOrCreate('qa','Pilot');const qa=new JourneyAttemptStore(path,true);
  for(const id of [...retired,...journeyCatalog.filter(s=>s.implementation==='placeholder').map(s=>s.id)]){
   assert.equal(qa.canAccessMission('qa',id),false);assert.throws(()=>qa.launch('qa','trainer',1000,id),id.startsWith('placeholder-')?/Unknown Journey mission/:/locked/);
  }
  const completed=journeyCatalog.map(s=>s.number<=4&&s.implementation==='playable');
  const eligible=journeyCatalog.map(s=>s.number===6);
  const state=missionJourneyStatuses(completed,eligible,false);
  assert.equal(state.currentMission,6);assert.equal(state.statuses[4],'locked');assert.equal(state.statuses[5],'current');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('rollout preserves earned legacy access once, keeps history and wallets intact, and retires paused attempts',()=>{
 const {dir,path}=temporary();const profiles=new PlayerProfileStore(path);profiles.getOrCreate('historical','Pilot');
 new JourneyAttemptStore(path);const db=new DatabaseSync(path);
 try{
  // Simulate the durable database immediately before this catalog version existed.
  db.exec("DELETE FROM journey_catalog_versions; DELETE FROM journey_access_grants;");
  const now=Date.now();
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('historical','journey-dallas-06','original-6',now-5000,1234,1);
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('historical','journey-dallas-25','retired-clear',now-4000,4321,1);
  db.prepare(`INSERT INTO journey_attempts(attempt_id,pilot_id,mission_id,city_id,aircraft_type,status,created_at,paused_at,definition_revision)
    VALUES('retired-active','historical','journey-dallas-22','dallas','trainer','RACING',?,?,2)`).run(now-1000,now-100);
  const before=profiles.getOrCreate('historical','Pilot').credits;
  const store=new JourneyAttemptStore(path);
  assert.equal(store.canAccessMission('historical','journey-dallas-13'),true,'old M7 remains accessible after clearing old M6');
  assert.equal(store.progress('historical','journey-dallas-06').firstAttemptId,'original-6');
  assert.equal(store.progress('historical','journey-dallas-25').bestTimeMs,4321);
  assert.equal(store.get('historical','retired-active').status,'ABANDONED');
  assert.equal(store.activeSnapshot('historical','retired-active'),undefined);
  assert.equal(store.resume('historical','retired-active'),undefined);
  assert.equal(store.continuation('historical','retired-active'),undefined);
  assert.equal(store.continueAfterAd('historical','retired-active','fake'),undefined);
  assert.equal(profiles.getOrCreate('historical','Pilot').credits,before);
  profiles.getOrCreate('new','Pilot');
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('new','journey-dallas-06','later',now,1000,1);
  const reopened=new JourneyAttemptStore(path);
  assert.equal(reopened.canAccessMission('new','journey-dallas-13'),false,'restart must not grandfather new-order clears');
  assert.equal(reopened.canAccessMission('historical','journey-dallas-13'),true);
  assert.equal(new PilotProfileSummaryStore(path).summary('historical').singlePlayer.missionsTotal,25);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('remaining monster encounters retain their definitions at M29/M30 and all completed slots skip placeholders',()=>{
 const {dir,path}=temporary();const profiles=new PlayerProfileStore(path);profiles.getOrCreate('qa','Pilot');const store=new JourneyAttemptStore(path,true);
 try{
  assert.equal(journeyMissionSlot('journey-dallas-23'),29);assert.equal(journeyMissionSlot('journey-dallas-19'),30);
  assert.equal(store.launch('qa','trainer',1000,'journey-dallas-23').monsterHealth,1000);
  assert.equal(store.launch('qa','trainer',2000,'journey-dallas-19').monsterHealth,1500);
  const db=new DatabaseSync(path),now=Date.now();
  for(const id of journeyMissionOrder) db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('qa',id,`clear-${id}`,now-1000,1000,1);
  db.prepare('INSERT INTO journey_completions VALUES(?,?,?,?,?,?)').run('qa','journey-dallas-25','retired',now-2000,1000,1);
  const summary=new PilotProfileSummaryStore(path).summary('qa',now);
  assert.equal(summary.singlePlayer.missionsCompleted,25);
  assert.equal(summary.singlePlayer.chaptersCompleted,4);
  assert.equal(summary.singlePlayer.citiesCompleted,1);
  assert.equal(store.chapterOneComplete('qa'),true);
  db.close();
  const state=missionJourneyStatuses(Array(30).fill(true),Array(30).fill(true),false);
  assert.equal(state.currentMission,0);
  journeyCatalog.forEach((slot,index)=>assert.equal(state.statuses[index],slot.implementation==='playable'?'completed':'locked'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
