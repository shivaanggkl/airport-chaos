import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createPursuitWarlordEncounter,pursuitWarlordSpecies} from './pursuit-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {createM19Encounter,stepM19,disposeM19,permittedM19Damage} from './m19-titan.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {pursuitWarlord as timing} from '../../shared/pursuit-warlord.mjs';
import {loadMonsterDistrictBuildings} from './monster-arrival.js';
import {titanAnchor} from '../../shared/titan-pose.mjs';
import {AshenWarlordModel} from '../../client/src/ashen-warlord-model.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const zero={x:0,y:0,z:0};
const encounter=()=>createPursuitWarlordEncounter('m23','p',100000,()=>135,[]);
test('M23 victory, timeout, replay, mission migration, and first-clear credits remain transactional', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-ledger-')), path = join(dir, 'profiles.sqlite'), db = new DatabaseSync(path);
    db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('p',0,0)");
    db.close();
    try {
        const store = new JourneyAttemptStore(path, true), win = now => { let a = store.launch('p', 'trainer', now, journeyDallas23.id); store.approach('p', a.attemptId, now + 1); assert.equal(store.startTimedGateClock('p', a.attemptId, now + 2), undefined); a = store.startMonsterArrival('p', a.attemptId, now + 3); assert.equal(a.deadlineAt, now + 240003); assert.equal(store.acceptGate('p', a.attemptId, 0, now + 4), undefined); for (let i = 0; i < 40; i++)
            a = store.hitMonster('p', a.attemptId, now + 200 + i * 250, 25); assert.equal(a.status, 'COMPLETED'); assert.equal(a.monsterHealth, 0); assert.equal(store.hitMonster('p', a.attemptId, now + 31000, 25), undefined); return a; };
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-19'), false);
        assert.equal(win(1000).firstClearCredits, 3150);
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-19'), true);
        assert.equal(win(40000).firstClearCredits, 0);
        assert(store.progress('p', journeyDallas23.id).completed);
        const a = store.launch('p', 'trainer', 80000, journeyDallas23.id);
        store.approach('p', a.attemptId, 80001);
        const start = store.startMonsterArrival('p', a.attemptId, 80002);
        assert.equal(store.hitMonster('p', a.attemptId, start.deadlineAt, 1000), undefined);
        assert.equal(store.fail('p', a.attemptId, 'TIME_UP', start.deadlineAt).status, 'FAILED');
        const old = store.launch('p', 'trainer', 400000, journeyDallas23.id), sql = new DatabaseSync(path);
        sql.prepare('UPDATE journey_attempts SET definition_revision=1 WHERE attempt_id=?').run(old.attemptId);
        sql.close();
        const reopened = new JourneyAttemptStore(path, true);
        assert.equal(reopened.get('p', old.attemptId).failureReason, 'MISSION_UPDATED');
        assert(reopened.progress('p', journeyDallas23.id).completed);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('M23 uses only its nine clips, walks physically, turns smoothly, and casts one authorized shot', async () => {
 const e=encounter(),spawn={...e.frame.position},initialYaw=e.frame.yaw;
 const actor=new AshenWarlordModel(source,false,true,true,true);await actor.ready;
 const allowed=new Set(timing.motions.map(k=>model.clips[k].name));
 assert.equal(actor.actions.size,27);
 assert([...actor.actions.keys()].every(k=>allowed.has(k.replace(/#(?:upper|lower)$/,''))));
 assert.equal(journeyDallas23.name,'MONSTER PURSUIT');assert.equal(journeyDallas23.bossHealth,1000);
 assert.equal(pursuitWarlordSpecies.level,'EASY');
 const seen=new Set(),roars=[],releases=[],shots=new Map();let traveled=0,lastPosition={...spawn},lastYaw=initialYaw,maxAnchorError=0;
 for(let i=1;i<=2400;i++){
  const now=100000+i*50,angle=initialYaw+(i>600?2:1);
  const target={x:spawn.x+Math.sin(angle)*4200,y:spawn.y+1100,z:spawn.z+Math.cos(angle)*4200};
  stepM19(e,target,zero,20,now);const f=e.frame;
  const stride=Math.hypot(f.position.x-lastPosition.x,f.position.z-lastPosition.z);traveled+=stride;lastPosition={...f.position};
  assert(stride<=pursuitWarlordSpecies.movement.run*.05+.01);
  assert(Math.hypot(f.position.x-spawn.x,f.position.z-spawn.z)<=timing.roamRadius+1);
  assert.equal(f.position.y,135);assert(!['jump','charge','sidestep'].includes(f.locomotion));
  if(f.ability)assert(Math.hypot(f.velocity.x,f.velocity.z)<.5,'attacks start only after stopping');
  assert(Math.abs(Math.atan2(Math.sin(f.yaw-lastYaw),Math.cos(f.yaw-lastYaw)))<=.45*.05+1e-6);lastYaw=f.yaw;

  seen.add(f.animation.clip);assert(allowed.has(f.animation.clip));
  assert(![model.clips.jump.name,model.clips.landing.name,model.clips.hit.name].includes(f.animation.clip));
  if(f.ability?.stage==='ACTIVE')assert.equal(f.animation.clip,model.clips.shoot.name);
  for(const event of f.events){
   assert(!['jump','land','shockwave','contact'].includes(event.type));
   if(event.type==='roar')roars.push(now);
   if(event.type==='release'){
    assert.equal(event.ability,'fireball-barrage');assert.equal(f.animation.clip,model.clips.shoot.name);releases.push(now);
    const hand=f.limbs['hand-right'];assert(Math.hypot(event.position.x-hand.x,event.position.y-hand.y,event.position.z-hand.z)<5);
    shots.set(event.attackId??f.ability.eventId,(shots.get(event.attackId??f.ability.eventId)??0)+1);
   }
   if(event.kind==='damage'){assert.equal(event.type,'projectile');assert.equal(event.amount,10);const damage=permittedM19Damage(e,event,now);assert.equal(damage,10);assert.equal(permittedM19Damage(e,event,now),0);}
  }
  if(i%10===0){
   actor.root.position.set(f.position.x,f.position.y,f.position.z);actor.root.rotation.y=f.yaw;actor.setTitanPose(f);actor.update(.05,0,0);
   const p=new THREE.Vector3();actor.handPosition('right',p);const hand=f.limbs['hand-right'];maxAnchorError=Math.max(maxAnchorError,p.distanceTo(new THREE.Vector3(hand.x,hand.y,hand.z)));
  }
 }
 for(const key of ['idle','walk','run','turn','roar','charge','shoot'])assert(seen.has(model.clips[key].name),key);
 assert(traveled>300&&roars.length>=2&&shots.size>=2);
 for(let i=1;i<roars.length;i++)assert(roars[i]-roars[i-1]>=18000);
 for(let i=1;i<releases.length;i++)assert(releases[i]-releases[i-1]>=8000);
 assert([...shots.values()].every(n=>n===1));assert(maxAnchorError<1);
 actor.dispose();disposeM19(e);
});
test('M23 punch needs actual fist collision, respects cooldown, and missed punches do no damage',()=>{
 const e=encounter(),hits=[],limbs={};
 createAshenPose(1000,false,true,true)(limbs,{},e.frame.position,e.frame.yaw,{}, {time:.7,health:1000,gait:0,velocity:zero,yawVelocity:0,airborne:false,ability:{id:'hand-strike',stage:'ACTIVE',progress:.5,elapsed:.7,active:.3,warning:.35,windup:.2,recovery:1.4}});
 const contact=limbs['hand-left'];
 for(let i=1;i<=330;i++){
  const p=contact;
  stepM19(e,p,zero,25,100000+i*50);
  for(const event of e.events)if(event.kind==='damage'&&event.type==='sweep'){
   assert.equal(event.type,'sweep');assert.equal(event.amount,15);hits.push(100000+i*50);
   assert.equal(permittedM19Damage(e,event,100000+i*50),15);assert.equal(permittedM19Damage(e,event,100000+i*50),0);
  }
 }
 assert(hits.length>0);for(let i=1;i<hits.length;i++)assert(hits[i]-hits[i-1]>=4000);disposeM19(e);
 const miss=encounter();let warned=false;
 for(let i=1;i<=140;i++){
  const p=warned?titanAnchor(miss.frame.position,miss.frame.yaw,{x:0,y:1800,z:5000}):contact;
  stepM19(miss,p,zero,20,100000+i*50);warned||=miss.frame.ability?.id==='hand-strike';
  assert(!miss.events.some(v=>v.kind==='damage'&&v.type==='sweep'));
 }
 assert(warned);disposeM19(miss);
});
test('M23 requires 40 confirmed Bluejay hits, rejects replays and foreign hits, then completes full defeat before success',async()=>{
 const e=encounter();
 const target=titanAnchor(e.frame.position,e.frame.yaw,{x:0,y:1100,z:4200});
 for(let i=1;i<=40;i++)stepM19(e,target,zero,20,100000+i*50);
 assert(e.frame.ability);const body=e.frame.limbs.body;
 for(let sequence=1;sequence<=40;sequence++){
  const shot={encounterId:e.attemptId,source:'p',sequence,from:{x:body.x-4000,y:body.y,z:body.z},to:{x:body.x+4000,y:body.y,z:body.z},amount:25,radius:1,delta:0};
  assert.equal(e.engine.damage({...shot,encounterId:'foreign'}),0);assert.equal(e.engine.damage(shot),25);assert.equal(e.engine.damage(shot),0);
 }
 stepM19(e,body,zero,20,102050);assert.equal(e.frame.health,0);assert.equal(e.frame.ability,null);assert.equal(e.frame.projectiles.length,0);assert(!e.events.some(v=>v.kind==='damage'));disposeM19(e);
 const scene=new THREE.Scene(),view=new MonsterArrivalView(scene,135,135,undefined,source,()=>135,()=>390,model,false,true,true,true);await view.ready;
 let ended=0;view.onEndingComplete=()=>ended++;view.finish('defeat');view.finish('defeat');
 for(let i=0;i<169;i++)view.update(.05);
 assert.equal(ended,0);assert(view.creature.root.visible);assert(Math.abs(view.creature.actions.get(model.clips.defeat.name).time-8.45)<.01);
 for(let i=0;i<20;i++)view.update(.05);assert.equal(ended,1);assert(!view.creature.root.visible);view.dispose();assert.equal(scene.children.length,0);
 const timeout=new MonsterArrivalView(scene,135,135,undefined,source,()=>135,()=>390,model,false,true,true,true);await timeout.ready;
 timeout.onEndingComplete=()=>ended++;timeout.finish('timeout');for(let i=0;i<100;i++)timeout.update(.05);
 assert.equal(ended,2);timeout.dispose();assert.equal(scene.children.length,0);
});

test('the single projectile leaves a genuine dodge opportunity and disposed encounters stay clean',()=>{
 const e=encounter(),origin={...e.frame.position},yaw=e.frame.yaw;
 let released=false,warned=false,damage=0;
 for(let i=1;i<=280;i++){
  const p=titanAnchor(origin,yaw,{x:released?5000:0,y:1100,z:4200});
  stepM19(e,p,zero,20,100000+i*50);
  warned||=e.frame.ability?.stage==='WARNING';
  released||=e.frame.projectiles.length>0;
  damage+=e.events.filter(v=>v.kind==='damage').length;
 }
 assert(warned&&released);assert.equal(damage,0);
 disposeM19(e);disposeM19(e);assert(e.disposed);assert.equal(e.engine.snapshot().projectiles.length,0);
});

test('retired aircraft and heart events cannot advance M23; pause, migration, retry and historical rewards are preserved',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hunt-retired-')),path=join(dir,'profiles.sqlite');
 const db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('p',0,0)");
 try{
  const store=new JourneyAttemptStore(path,true),a=store.launch('p','trainer',1000,journeyDallas23.id);
  assert.equal(a.targetId,null);assert.equal(a.secondaryTargetId,null);assert.equal(a.monsterHealth,1000);
  assert.equal(store.assignDoubleHunter('p',a.attemptId,'fake',1,50000),undefined);
  assert.equal(store.defeatDoubleFirst('p',a.attemptId,'fake',{x:0,y:0,z:0}),undefined);
  assert.equal(store.collectDoubleHeart('p',a.attemptId,journeyDallas23.heartId,50000),undefined);
  assert.equal(store.defeatDoubleSecond('p',a.attemptId,'fake',50000),undefined);
  assert.equal(a.doublePhase,null);assert.equal(a.heartPosition,null);assert.equal(journeyDallas23.startAirportId,'love');
  db.prepare('UPDATE journey_attempts SET definition_revision=0 WHERE attempt_id=?').run(a.attemptId);
  db.prepare("INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES('p',?,'historical',0,12345)").run(journeyDallas23.id);
  const reopened=new JourneyAttemptStore(path,true);
  assert.equal(reopened.get('p',a.attemptId).failureReason,'MISSION_UPDATED');assert(reopened.progress('p',journeyDallas23.id).completed);
  const retry=reopened.launch('p','trainer',60000,journeyDallas23.id);reopened.approach('p',retry.attemptId,60001);
  const started=reopened.startMonsterArrival('p',retry.attemptId,60002);
  reopened.pause('p',retry.attemptId,60003);const resumed=reopened.resume('p',retry.attemptId,61003);
  assert.equal(resumed.pausedMs,1000);assert.equal(resumed.attempt.deadlineAt,started.deadlineAt+1000);
  assert.equal(resumed.attempt.monsterHealth,1000);
  const won=reopened.hitMonster('p',retry.attemptId,61004,1000);assert.equal(won.status,'COMPLETED');assert.equal(won.firstClearCredits,0);
  assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='p'").get().credits,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

function loadDallasTerrain(){
    const data=JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json',import.meta.url),'utf8'));
    const bytes=Buffer.from(data.elevations,'base64'),samples=new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2);
    const ground=(wx,wz)=>{
        const x=Math.max(0,Math.min(1,(wx-data.bounds.minX)/(data.bounds.maxX-data.bounds.minX)))*(data.width-1);
        const z=Math.max(0,Math.min(1,(wz-data.bounds.minZ)/(data.bounds.maxZ-data.bounds.minZ)))*(data.height-1);
        const x0=Math.floor(x),z0=Math.floor(z),x1=Math.min(data.width-1,x0+1),z1=Math.min(data.height-1,z0+1);
        const at=(a,b)=>data.baseElevation+samples[b*data.width+a]*data.scale;
        return(at(x0,z0)*(1-x+x0)+at(x1,z0)*(x-x0))*(1-z+z0)+(at(x0,z1)*(1-x+x0)+at(x1,z1)*(x-x0))*(z-z0);
    };
    return ground;
}

test('M23 stays grounded on real Dallas terrain and uses existing scenery collision checks',()=>{
 const ground=loadDallasTerrain(),e=createPursuitWarlordEncounter('terrain','p',0,ground,loadMonsterDistrictBuildings());
 const start={...e.frame.position},yaw=e.frame.yaw;let walked=0;
 for(let i=1;i<=800;i++){
  const old={...e.frame.position};
  const p=titanAnchor(start,yaw,{x:2000,y:1100,z:7500});stepM19(e,p,zero,20,i*50);
  assert(Math.abs(e.frame.position.y-ground(e.frame.position.x,e.frame.position.z))<.01);
  walked+=Math.hypot(e.frame.position.x-old.x,e.frame.position.z-old.z);
  assert(e.frame.position.x>=-22000&&e.frame.position.x<=14000&&e.frame.position.z>=-22000&&e.frame.position.z<=14000);
 }
 assert(walked>100,'real encounter must be able to walk');disposeM19(e);
});

test('Easy shooting remains forgiving and avoids perfect tracking',()=>{
 const e=encounter(),root={...e.frame.position},yaw=e.frame.yaw;
 const right={x:Math.cos(yaw),y:0,z:-Math.sin(yaw)},forward={x:Math.sin(yaw),y:0,z:Math.cos(yaw)};
 const velocity={x:right.x*180,y:0,z:right.z*180};let checked=false;
 for(let i=1;i<=360&&!checked;i++){
  const p={x:root.x+forward.x*6000+velocity.x*i*.05,y:root.y+1100,z:root.z+forward.z*6000+velocity.z*i*.05};
  stepM19(e,p,velocity,20,100000+i*50);
  const release=e.events.find(v=>v.type==='release'),shot=e.frame.projectiles[0];
  if(release&&shot){
   const relative={x:p.x-release.position.x,y:p.y-release.position.y,z:p.z-release.position.z};
   const distance=Math.hypot(relative.x,relative.y,relative.z),directSide=(relative.x*right.x+relative.z*right.z)/distance;
   const shotSide=(shot.velocity.x*right.x+shot.velocity.z*right.z)/1200;
   const travel=distance/1200,full={x:relative.x+velocity.x*travel,y:relative.y,z:relative.z+velocity.z*travel};
   const fullSide=(full.x*right.x+full.z*right.z)/Math.hypot(full.x,full.y,full.z);
   assert(shotSide>directSide+.01);assert(shotSide<fullSide-.01);checked=true;
  }
 }
 assert(checked);disposeM19(e);
});

test('M23 Run is physical locomotion only, lasts at most three seconds and rests ten seconds between bursts',()=>{
 const species=new SpeciesRegistry().register({...structuredClone(pursuitWarlordSpecies),id:'pursuit-movement',abilities:[]});
 const e=createM19Encounter('runs','p',0,()=>135,[],1000,species,
  {geometry,spawn:journeyDallas23.monster,environmentDamage:false,articulate:createAshenPose(1000,false,true,true)});
 const origin={...e.frame.position},yaw=e.frame.yaw,bursts=[];let current,walked=0;
 for(let i=1;i<=1400;i++){
  const t=i*.05,angle=yaw+t*.01;
  const p={x:origin.x+Math.sin(angle)*14000,y:origin.y+1100,z:origin.z+Math.cos(angle)*14000};
  const velocity={x:Math.cos(angle)*140,y:0,z:-Math.sin(angle)*140};
  const old={...e.frame.position};stepM19(e,p,velocity,20,i*50);const f=e.frame;
  const distance=Math.hypot(f.position.x-old.x,f.position.z-old.z);walked+=distance;
  assert(distance<=species.movement.run*.05+.01);
  assert(Math.hypot(f.position.x-origin.x,f.position.z-origin.z)<=timing.roamRadius+1);
  assert(!f.events.some(v=>v.kind==='damage'));assert.equal(f.ability,null);
  const runClip=f.animation.clip===model.clips.run.name;
  const running=runClip||f.animation.previousClip===model.clips.run.name&&f.animation.blend<1;
  if(running){assert(Math.hypot(f.velocity.x,f.velocity.z)>.5);if(runClip)assert(Math.hypot(f.velocity.x,f.velocity.z)>species.movement.walk);if(!current)current={start:t,end:t};current.end=t;}
  else if(current){bursts.push(current);current=undefined;}
 }
 if(current)bursts.push(current);
 assert(walked>1000);assert(bursts.length>=2,JSON.stringify(bursts));
 for(let i=0;i<bursts.length;i++){
  assert(bursts[i].end-bursts[i].start+.05<=3.001,JSON.stringify(bursts));
  if(i>0)assert(bursts[i].start-bursts[i-1].end>=10);
 }
 disposeM19(e);
});
