import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {journeyMissionOrder,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {missionJourneyStages} from '../../client/src/mission-journey-model.js';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {PlayerProfileStore} from './player-profiles.js';
import {PilotProfileSummaryStore} from './pilot-profile-summary.js';

test('journey swaps both groups without changing mission identities or duplicating cards',()=>{
 const numbers=[1,2,3,4,5,6,13,14,15,16,17,18,7,8,9,10,11,12,25,20,21,22,23,19];
 assert.deepEqual(journeyMissionOrder,numbers.map(n=>`journey-dallas-${String(n).padStart(2,'0')}`));
 assert.deepEqual(missionJourneyStages.map(s=>s.id),journeyMissionOrder);
 assert.deepEqual(missionJourneyDetails.map(s=>s.id),journeyMissionOrder);
 assert.equal(missionJourneyDetails[6].title,'FIRST CONTACT');assert.equal(missionJourneyDetails[12].title,'GIANT PLANE');
 const bootstrap=readFileSync('client/src/bootstrap.ts','utf8');
 assert.match(bootstrap,/setStageSevenProgress\(progress\.mission13/);assert.match(bootstrap,/setStageThirteenProgress\(progress\.mission07/);
});
test('server launch follows every new predecessor; old completion and chapter records retain their identity',()=>{
 const dir=mkdtempSync(join(tmpdir(),'journey-order-')),path=join(dir,'profile.sqlite');
 const profiles=new PlayerProfileStore(path),store=new JourneyAttemptStore(path),db=new DatabaseSync(path),summary=new PilotProfileSummaryStore(path);
 try{
  const insert=db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)');
  const playable=journeyMissionOrder.filter(id=>id!=='journey-dallas-24');
  for(let index=1;index<playable.length;index++){
   const pilot=`pilot-${index}`,id=playable[index],previous=playable[index-1];profiles.getOrCreate(pilot,'Pilot');
   assert.equal(store.canAccessMission(pilot,id),false);assert.throws(()=>store.launch(pilot,'trainer',1000,id),/locked/);
   insert.run(pilot,previous,`receipt-${index}`,Date.now()-5000,1000);
   assert.equal(store.canAccessMission(pilot,id),true);assert.equal(store.launch(pilot,'trainer',2000,id).missionId,id);
  }
  profiles.getOrCreate('historical','Pilot');
  for(let n=7;n<=12;n++)insert.run('historical',`journey-dallas-${String(n).padStart(2,'0')}`,`original-${n}`,Date.now()-5000,1000);
  assert.equal(store.canAccessMission('historical','journey-dallas-07'),true,'completed missions remain replayable even with a different predecessor');
  assert.equal(store.progress('historical','journey-dallas-07').firstAttemptId,'original-7');
  assert.equal(journeyMissionSlot('journey-dallas-07'),13);
  assert.ok(summary.summary('historical').latestAchievements.some(a=>a.key==='chapter:dallas:2'&&a.title==='CHAPTER 3 COMPLETE'));
  assert.equal(profiles.getOrCreate('historical','Pilot').credits,0,'reordering pays no new reward');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('slot 24 keeps the original monster and slot 19 has its isolated beginner monster',()=>{
 assert.equal(journeyMissionSlot('journey-dallas-19'),24);
 assert.equal(missionJourneyDetails[23].id,'journey-dallas-19');
 assert.equal(missionJourneyStages[18].implementation,'playable');assert.equal(missionJourneyDetails[18].id,'journey-dallas-25');
 assert.equal(missionJourneyDetails[18].title,'MONSTER ARRIVAL');
 const dir=mkdtempSync(join(tmpdir(),'journey-reserved-')),path=join(dir,'profile.sqlite');
 const profiles=new PlayerProfileStore(path);profiles.getOrCreate('qa','Pilot');
 const store=new JourneyAttemptStore(path,true);
 assert.equal(store.canAccessMission('qa','journey-dallas-24'),false);
 assert.throws(()=>store.launch('qa','trainer',1000,'journey-dallas-24'),/locked/);
 assert.equal(store.launch('qa','trainer',1000,'journey-dallas-19').monsterHealth,2500);
 rmSync(dir,{recursive:true,force:true});
});
