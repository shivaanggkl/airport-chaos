import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createStrikingWarlordEncounter,strikingWarlordSpecies} from './striking-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {stepM19,disposeM19,permittedM19Damage} from './m19-titan.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {journeyDallas20} from '../../shared/journey-mission.mjs';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {strikingWarlord as timing} from '../../shared/striking-warlord.mjs';
import {titanAnchor} from '../../shared/titan-pose.mjs';
import {AshenWarlordModel} from '../../client/src/ashen-warlord-model.js';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const zero={x:0,y:0,z:0};
const encounter=()=>createStrikingWarlordEncounter('m20','p',100000,()=>135,[]);
test('M20 victory, timeout, replay, mission migration, and first-clear credits remain transactional', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-ledger-')), path = join(dir, 'profiles.sqlite'), db = new DatabaseSync(path);
    db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('p',0,0)");
    db.close();
    try {
        const store = new JourneyAttemptStore(path, true), win = now => { let a = store.launch('p', 'trainer', now, journeyDallas20.id); store.approach('p', a.attemptId, now + 1); assert.equal(store.startTimedGateClock('p', a.attemptId, now + 2), undefined); a = store.startMonsterArrival('p', a.attemptId, now + 3); assert.equal(a.deadlineAt, now + 240003); assert.equal(store.acceptGate('p', a.attemptId, 0, now + 4), undefined); for (let i = 0; i < 28; i++)
            a = store.hitMonster('p', a.attemptId, now + 200 + i * 250, 25); assert.equal(a.status, 'COMPLETED'); assert.equal(a.monsterHealth, 0); assert.equal(store.hitMonster('p', a.attemptId, now + 31000, 25), undefined); return a; };
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-21'), false);
        assert.equal(win(1000).firstClearCredits, 2700);
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-21'), true);
        assert.equal(win(40000).firstClearCredits, 0);
        assert(store.progress('p', journeyDallas20.id).completed);
        const a = store.launch('p', 'trainer', 80000, journeyDallas20.id);
        store.approach('p', a.attemptId, 80001);
        const start = store.startMonsterArrival('p', a.attemptId, 80002);
        assert.equal(store.hitMonster('p', a.attemptId, start.deadlineAt, 700), undefined);
        assert.equal(store.fail('p', a.attemptId, 'TIME_UP', start.deadlineAt).status, 'FAILED');
        const old = store.launch('p', 'trainer', 400000, journeyDallas20.id), sql = new DatabaseSync(path);
        sql.prepare('UPDATE journey_attempts SET definition_revision=1 WHERE attempt_id=?').run(old.attemptId);
        sql.close();
        const reopened = new JourneyAttemptStore(path, true);
        assert.equal(reopened.get('p', old.attemptId).failureReason, 'MISSION_UPDATED');
        assert(reopened.progress('p', journeyDallas20.id).completed);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('M20 uses only its nine clips, turns without horizontal travel, jumps into Land, and casts one authorized shot', async () => {
 const e=encounter(),spawn={...e.frame.position},initialYaw=e.frame.yaw;
 const actor=new AshenWarlordModel(source,false,true);await actor.ready;
 const allowed=new Set(timing.motions.map(k=>model.clips[k].name));
 assert.equal(actor.actions.size,27);
 assert([...actor.actions.keys()].every(k=>allowed.has(k.replace(/#(?:upper|lower)$/,''))));
 assert.equal(journeyDallas20.name,'MONSTER STRIKES');assert.equal(journeyDallas20.bossHealth,700);
 assert.equal(strikingWarlordSpecies.level,'EASY');
 const seen=new Set(),jumps=[],lands=[],roars=[],releases=[],shots=new Map();let peak=0,lastYaw=initialYaw,maxAnchorError=0;
 for(let i=1;i<=2400;i++){
  const now=100000+i*50,angle=initialYaw+(i>600?2:1);
  const target={x:spawn.x+Math.sin(angle)*4200,y:spawn.y+1100,z:spawn.z+Math.cos(angle)*4200};
  stepM19(e,target,zero,20,now);const f=e.frame;
  assert.equal(f.position.x,spawn.x);assert.equal(f.position.z,spawn.z);
  assert(Math.abs(Math.atan2(Math.sin(f.yaw-lastYaw),Math.cos(f.yaw-lastYaw)))<=.45*.05+1e-6);lastYaw=f.yaw;
  peak=Math.max(peak,f.position.y-spawn.y);
  seen.add(f.animation.clip);assert(allowed.has(f.animation.clip));
  if([model.clips.jump.name,model.clips.landing.name].includes(f.animation.clip))assert.equal(f.ability,null,'no overlapping attack while jumping or landing');
  if(f.ability?.stage==='ACTIVE')assert.equal(f.animation.clip,model.clips.shoot.name);
  for(const event of f.events){
   if(event.type==='jump')jumps.push(now);
   if(event.type==='land')lands.push(now);
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
 for(const key of ['idle','turn','jump','landing','roar','charge','shoot'])assert(seen.has(model.clips[key].name),key);
 assert(jumps.length>=2&&roars.length>=2&&shots.size>=2);
 assert.equal(lands.length,jumps.length);for(let i=1;i<jumps.length;i++)assert(jumps[i]-jumps[i-1]>=18000);
 for(let i=1;i<roars.length;i++)assert(roars[i]-roars[i-1]>=20000);
 for(let i=1;i<releases.length;i++)assert(releases[i]-releases[i-1]>=8000);
 assert([...shots.values()].every(n=>n===1));assert(Math.abs(peak-timing.jumpHeight)<2);assert(maxAnchorError<1);
 actor.dispose();disposeM19(e);
});
test('M20 punch needs actual fist collision, respects cooldown, and missed punches do no damage',()=>{
 const e=encounter(),hits=[],limbs={};
 createAshenPose(700,false,true)(limbs,{},e.frame.position,e.frame.yaw,{}, {time:.7,health:700,gait:0,velocity:zero,yawVelocity:0,airborne:false,ability:{id:'hand-strike',stage:'ACTIVE',progress:.5,elapsed:.7,active:.3,warning:.35,windup:.2,recovery:1.4}});
 const contact=limbs['hand-left'];
 for(let i=1;i<=330;i++){
  const p=contact;
  stepM19(e,p,zero,25,100000+i*50);
  for(const event of e.events)if(event.kind==='damage'){
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
test('M20 requires 28 confirmed Bluejay hits, rejects replays and foreign hits, then completes the shared blast and dissolve before success',async()=>{
 const e=encounter();
 const target=titanAnchor(e.frame.position,e.frame.yaw,{x:0,y:1100,z:4200});
 for(let i=1;i<=40;i++)stepM19(e,target,zero,20,100000+i*50);
 assert(e.frame.ability);const body=e.frame.limbs.body;
 for(let sequence=1;sequence<=28;sequence++){
  const shot={encounterId:e.attemptId,source:'p',sequence,from:{x:body.x-4000,y:body.y,z:body.z},to:{x:body.x+4000,y:body.y,z:body.z},amount:25,radius:1,delta:0};
  assert.equal(e.engine.damage({...shot,encounterId:'foreign'}),0);assert.equal(e.engine.damage(shot),25);assert.equal(e.engine.damage(shot),0);
 }
 stepM19(e,body,zero,20,102050);assert.equal(e.frame.health,0);assert.equal(e.frame.ability,null);assert.equal(e.frame.projectiles.length,0);assert(!e.events.some(v=>v.kind==='damage'));disposeM19(e);
 const scene=new THREE.Scene(),view=new MonsterArrivalView(scene,135,135,undefined,source,()=>135,()=>390,model,false,true);await view.ready;
 let ended=0;view.onEndingComplete=()=>ended++;view.finish('defeat');view.finish('defeat');
 for(let i=0;i<130;i++)view.update(.05);
 assert.equal(ended,0);assert(view.creature.root.visible);assert(scene.getObjectByName('m19-victory-rising-ash'));assert(scene.getObjectByName('m19-victory-smoke').visible);
 for(let i=0;i<20;i++)view.update(.05);assert.equal(ended,1);assert(!view.creature.root.visible);view.dispose();assert.equal(scene.children.length,0);
 const timeout=new MonsterArrivalView(scene,135,135,undefined,source,()=>135,()=>390,model,false,true);await timeout.ready;
 let released=0,impacts=0;timeout.onProjectile=()=>released++;timeout.onDestruction=()=>impacts++;
 timeout.onEndingComplete=()=>ended++;timeout.finish('timeout');for(let i=0;i<100;i++)timeout.update(.05);
 assert.equal(released,1);assert.equal(impacts,1);assert.equal(ended,1,'failure waits for the city destruction');assert(timeout.timeoutCinematicActive);assert(scene.getObjectByName('m19-downtown-timeout-blast'));
 for(let i=0;i<95;i++)timeout.update(.05);assert.equal(timeout.timeoutBlackoutOpacity,1);
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

test('M20 starts on the DFW runway and shares the monster intro without changing city lighting',()=>{
 assert.equal(journeyDallas20.startAirportId,'dfw');assert.equal(journeyDallas20.runwayStart,true);
 assert.equal(authorizedJourneyAirborneSpawn({missionId:journeyDallas20.id,status:'APPROACH'},journeyDallas20,()=>135),undefined);
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 assert(main.includes('[journeyDallas25.id,journeyDallas20.id,journeyDallas21.id,journeyDallas22.id,journeyDallas23.id,journeyDallas19.id].includes'));
 const intro=main.slice(main.indexOf('async function prepareMonsterMissionIntro'),main.indexOf('function beginFlightLaunchCinematic'));
 assert(intro.includes('view.introRoot,airplane,19'));assert(!/setLocalTimePreset|configureWorldVisuals/.test(intro));
});
