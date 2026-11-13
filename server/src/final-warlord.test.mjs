import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createFinalWarlordEncounter,finalWarlordSpecies} from './final-warlord.js';
import {createAshenPose} from './ashen-warlord-pose.js';
import {SpeciesRegistry} from './titan/definitions.js';
import {createM19Encounter,stepM19,disposeM19,permittedM19Damage} from './m19-titan.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {journeyDallas19,journeyDallas25,journeyDallas24,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {ashenWarlordSpecies} from './ashen-warlord.js';
import {ashenWarlordGeometry as geometry} from '../../shared/ashen-warlord-geometry.mjs';
import {TitanEncounter} from './titan/engine.js';
import {dallasElevationAt} from './dallas-elevation.js';
import {loadMonsterDistrictBuildings} from './monster-arrival.js';
import {cityRegistry} from '../../shared/city-registry.mjs';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
import {huntingWarlordSpecies} from './hunting-warlord.js';
import {titanAnchor} from '../../shared/titan-pose.mjs';
import {AshenWarlordModel} from '../../client/src/ashen-warlord-model.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const zero={x:0,y:0,z:0};
const encounter=()=>createFinalWarlordEncounter('m24','p',100000,()=>135,[]);
test('M24 victory, timeout, replay, mission migration, and first-clear credits remain transactional', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apex-ledger-')), path = join(dir, 'profiles.sqlite'), db = new DatabaseSync(path);
    db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('p',0,0)");
    db.close();
    try {
        const store = new JourneyAttemptStore(path, true), win = now => { let a = store.launch('p', 'trainer', now, journeyDallas19.id); store.approach('p', a.attemptId, now + 1); assert.equal(store.startTimedGateClock('p', a.attemptId, now + 2), undefined); a = store.startMonsterArrival('p', a.attemptId, now + 3); assert.equal(a.deadlineAt, now + 3 + journeyDallas19.timeLimitMs); assert.equal(store.acceptGate('p', a.attemptId, 0, now + 4), undefined); for (let i = 0; i < 60; i++)
            a = store.hitMonster('p', a.attemptId, now + 200 + i * 250, 25); assert.equal(a.status, 'COMPLETED'); assert.equal(a.monsterHealth, 0); assert.equal(store.hitMonster('p', a.attemptId, now + 31000, 25), undefined); return a; };
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-24'), false);
        assert.equal(win(1000).firstClearCredits, 4000);
        assert.equal(new JourneyAttemptStore(path, false).canAccessMission('p', 'journey-dallas-24'), false);
        assert.equal(win(40000).firstClearCredits, 0);
        assert(store.progress('p', journeyDallas19.id).completed);
        const a = store.launch('p', 'trainer', 80000, journeyDallas19.id);
        store.approach('p', a.attemptId, 80001);
        const start = store.startMonsterArrival('p', a.attemptId, 80002);
        assert.equal(store.hitMonster('p', a.attemptId, start.deadlineAt, 1500), undefined);
        assert.equal(store.fail('p', a.attemptId, 'TIME_UP', start.deadlineAt).status, 'FAILED');
        const old = store.launch('p', 'trainer', 400000, journeyDallas19.id), sql = new DatabaseSync(path);
        sql.prepare('UPDATE journey_attempts SET definition_revision=2 WHERE attempt_id=?').run(old.attemptId);
        sql.close();
        const reopened = new JourneyAttemptStore(path, true);
        assert.equal(reopened.get('p', old.attemptId).failureReason, 'MISSION_UPDATED');
        assert(reopened.progress('p', journeyDallas19.id).completed);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('M24 requires 60 confirmed Bluejay hits, rejects replays and foreign hits, then completes the shared blast and dissolve before success',async()=>{
 const e=encounter();
 const target=titanAnchor(e.frame.position,e.frame.yaw,{x:0,y:1500,z:4200});
 for(let i=1;i<=100;i++)stepM19(e,target,zero,20,100000+i*50);
 const body=e.frame.limbs.body;
 for(let sequence=1;sequence<=60;sequence++){
  const shot={encounterId:e.attemptId,source:'p',sequence,from:{x:body.x-4000,y:body.y,z:body.z},to:{x:body.x+4000,y:body.y,z:body.z},amount:25,radius:1,delta:0};
  assert.equal(e.engine.damage({...shot,encounterId:'foreign'}),0);assert.equal(e.engine.damage(shot),25);assert.equal(e.engine.damage(shot),0);
 }
 stepM19(e,body,zero,20,105050);assert.equal(e.frame.health,0);assert.equal(e.frame.ability,null);assert.equal(e.frame.projectiles.length,0);assert(!e.events.some(v=>v.kind==='damage'));disposeM19(e);
 const scene=new THREE.Scene(),view=new MonsterArrivalView(scene,135,135,undefined,source,()=>135,()=>390,model,false,true,true,true,true);await view.ready;
 let ended=0;view.onEndingComplete=()=>ended++;view.finish('defeat');view.finish('defeat');
 for(let i=0;i<130;i++)view.update(.05);
 assert.equal(ended,0);assert(view.creature.root.visible);assert(scene.getObjectByName('m19-victory-rising-ash'));assert(scene.getObjectByName('m19-victory-smoke').visible);
 for(let i=0;i<20;i++)view.update(.05);assert.equal(ended,1);assert(!view.creature.root.visible);view.dispose();assert.equal(scene.children.length,0);
 const timeout=new MonsterArrivalView(scene,135,135,undefined,source,()=>135,()=>390,model,false,true,true,true,true);await timeout.ready;
 let released=0,impacts=0;timeout.onProjectile=()=>released++;timeout.onDestruction=()=>impacts++;
 timeout.onEndingComplete=()=>ended++;timeout.finish('timeout');for(let i=0;i<100;i++)timeout.update(.05);
 assert.equal(released,1);assert.equal(impacts,1);assert.equal(ended,1,'failure waits for the city destruction');assert(timeout.timeoutCinematicActive);assert(scene.getObjectByName('m19-downtown-timeout-blast'));
 for(let i=0;i<95;i++)timeout.update(.05);assert.equal(timeout.timeoutBlackoutOpacity,1);
 assert.equal(ended,2);timeout.dispose();assert.equal(scene.children.length,0);
});


test('visible M24 retains legacy identity and historical clears without duplicating its first-clear reward',()=>{
 const dir=mkdtempSync(join(tmpdir(),'final-history-')),path=join(dir,'profiles.sqlite');
 const db=new DatabaseSync(path);db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('p',2550,0)");
 try{
  const store=new JourneyAttemptStore(path,true),old=store.launch('p','trainer',1000,journeyDallas19.id);
  db.prepare('UPDATE journey_attempts SET definition_revision=2 WHERE attempt_id=?').run(old.attemptId);
  db.prepare("INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES('p',?,'historical',0,12345)").run(journeyDallas19.id);
  const reopened=new JourneyAttemptStore(path,true);
  assert.equal(reopened.get('p',old.attemptId).failureReason,'MISSION_UPDATED');assert(reopened.progress('p',journeyDallas19.id).completed);
  assert.equal(journeyMissionSlot(journeyDallas19.id),24);assert.equal(journeyMissionSlot(journeyDallas25.id),19);
  assert.equal(journeyDallas19.firstClearCredits,4000);assert.equal(journeyDallas25.firstClearCredits,2550);
  assert.equal(journeyDallas25.bossHealth,500);assert.equal(journeyDallas25.timeLimitMs,360000);
  assert.equal(reopened.canAccessMission('p',journeyDallas24.id),false);
  assert.equal(authorizedJourneyAirborneSpawn({missionId:journeyDallas19.id,status:'APPROACH'},journeyDallas19,()=>135),undefined);
  const a=reopened.launch('p','trainer',60000,journeyDallas19.id);reopened.approach('p',a.attemptId,60001);
  const started=reopened.startMonsterArrival('p',a.attemptId,60002);
  assert.equal(started.deadlineAt,60002+journeyDallas19.timeLimitMs);reopened.pause('p',a.attemptId,60003);
  const resumed=reopened.resume('p',a.attemptId,61003);assert.equal(resumed.attempt.deadlineAt,started.deadlineAt+1000);
  const result=reopened.hitMonster('p',a.attemptId,61004,1500);assert.equal(result.status,'COMPLETED');assert.equal(result.firstClearCredits,0);
  assert.equal(db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='p'").get().credits,2550);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});


test('M24 restores the original running director and all three attacks without changing earlier monsters',()=>{
 assert.equal(finalWarlordSpecies.level,'LEGENDARY');
 assert.equal(finalWarlordSpecies.health,journeyDallas19.bossHealth);
 assert.deepEqual(finalWarlordSpecies.director,ashenWarlordSpecies.director);
 assert.deepEqual(finalWarlordSpecies.movement,ashenWarlordSpecies.movement);
 assert.equal(finalWarlordSpecies.hunting,undefined);
 assert(finalWarlordSpecies.movement.runOnly);
 assert.deepEqual(finalWarlordSpecies.abilities.map(a=>a.id),['fireball-barrage','hand-strike','charging-rampage']);
 const shot=finalWarlordSpecies.abilities.find(a=>a.mechanism==='projectile');
 assert.equal(shot.damage,25);assert.equal(shot.count,3);assert.equal(shot.moving,true);
 assert.equal(ashenWarlordSpecies.level,'HARD');assert.equal(ashenWarlordSpecies.health,2500);
 assert.equal(huntingWarlordSpecies.hunting.runSeconds,undefined);
 assert.equal(journeyMissionSlot(journeyDallas19.id),24);
});

test('M24 runs continuously beyond the retired 6 km leash and shoots at a receding pilot',()=>{
 const e=encounter(),origin={...e.frame.position},half=Number(cityRegistry.dallas.worldSize)/2;
 let running=0;const shots=new Set();let previous={...origin};
 for(let i=1;i<=1000;i++){
  const target={x:origin.x+9000+i*.05*250,y:1800,z:origin.z};
  stepM19(e,target,{x:250,y:0,z:0},18,100000+i*50);
  const f=e.frame;
  if(f.locomotion==='run')running++;
  for(const shot of f.projectiles)shots.add(shot.id);
  assert(Math.hypot(f.position.x-previous.x,f.position.z-previous.z)<=finalWarlordSpecies.movement.chargeSpeed*.05+.01);
  assert(Math.abs(f.position.x)<=half&&Math.abs(f.position.z)<=half);
  assert.equal(f.position.y,135);previous={...f.position};
 }
 assert(running>100,'continuous authored running must replace short bursts');
 assert(shots.size>=3,'running pursuit must release real fireballs');
 assert(e.frame.position.x>origin.x+6000,'pursuit must not stop at the retired local leash');
 const checkpoint=e.engine.checkpoint();e.engine.restoreCheckpoint(checkpoint);
 assert.equal(e.engine.snapshot().health,journeyDallas19.bossHealth);
 assert.deepEqual(e.engine.checkpoint(),checkpoint);
 disposeM19(e);assert.equal(e.engine.snapshot().projectiles.length,0);
});

test('M24 accepted pressure triggers committed retreat and re-engagement without teleporting',()=>{
 const cfg=structuredClone(finalWarlordSpecies);cfg.id='final-director-test';cfg.abilities=[];
 const e=new TitanEncounter('director',new SpeciesRegistry().register(cfg),{x:0,y:0,z:0},
  {bounds:{minX:-25000,maxX:25000,minZ:-25000,maxZ:25000},ground:()=>0,traversable:()=>true,lineOfSight:()=>true,obstruction:()=>null});
 const target={id:'p',encounterId:'director',authorized:true,alive:true,position:{x:10000,y:2000,z:2000},velocity:{x:100,y:0,z:0},radius:18};
 let retreat=false,reentry=false,previous=e.snapshot();
 for(let i=1;i<=700;i++){
  if(i===70){const p=e.snapshot().limbs.body;for(let sequence=1;sequence<=6;sequence++)e.damage({encounterId:'director',source:'p',sequence,from:{x:p.x+5000,y:p.y,z:p.z},to:p,amount:25,radius:1,delta:0});}
  const f=e.step(.05,[target],[]);retreat||=f.tactic==='retreat';if(retreat&&f.tactic==='reengage')reentry=true;
  assert(Math.hypot(f.position.x-previous.position.x,f.position.z-previous.position.z)<=cfg.movement.chargeSpeed*.05+.01);previous=f;
 }
 assert(retreat&&reentry);e.dispose();
});

test('M24 restored attacks use authored clips that the cinematic-capable renderer can play',async()=>{
 const visual=new AshenWarlordModel(source,false,true,true,true,true);await visual.ready;
 for(const key of ['run','punch','shoot','hit'])assert(visual.actions.has(model.clips[key].name));
 const pose=createAshenPose(journeyDallas19.bossHealth),root={x:0,y:135,z:0},velocity={x:0,y:0,z:finalWarlordSpecies.movement.run};
 for(const ability of finalWarlordSpecies.abilities){
  const animation=pose({}, {},root,0,{}, {time:2,health:1500,gait:0,velocity,yawVelocity:0,airborne:false,
   ability:{id:ability.id,stage:'ACTIVE',progress:.5,elapsed:ability.warning+ability.windup+.1,active:ability.active,warning:ability.warning,windup:ability.windup,recovery:ability.recovery}});
  assert(visual.actions.has(animation.clip),ability.id);
  if(ability.moving)assert.equal(animation.locomotion.clip,model.clips.run.name);
 }
 visual.dispose();
});

test('M24 punch, moving volley and restored charge warn and deal server-confirmed damage with matching rendered anchors',async()=>{
 for(const ability of finalWarlordSpecies.abilities){
  const cfg=structuredClone(finalWarlordSpecies);cfg.director=undefined;cfg.abilities=[{...ability,unlockBelow:1}];
  cfg.movement.walk=.01;cfg.movement.run=.01;cfg.movement.turnRate=.00001;
  const e=createM19Encounter('attack-'+ability.id,'p',0,()=>135,[],1500,new SpeciesRegistry().register(cfg),
   {geometry,spawn:journeyDallas19.monster,environmentDamage:false,articulate:createAshenPose(1500)});
  const offsets=ability.mechanism==='sweep'?{x:300,y:1070,z:750}:ability.mechanism==='charge'?{x:0,y:1200,z:1100}:{x:0,y:1460,z:1600};
  const target=titanAnchor(e.frame.position,e.frame.yaw,offsets);
  const visual=new AshenWarlordModel(source,false,true,true,true,true);await visual.ready;
  let warned=false,active=false,damage=0;
  for(let i=1;i<=280;i++){
   stepM19(e,target,zero,18,i*50);const f=e.frame;
   warned||=f.ability?.stage==='WARNING';active||=f.ability?.stage==='ACTIVE';
   for(const event of e.events.filter(v=>v.kind==='damage'&&v.ability===ability.id)){
    const accepted=permittedM19Damage(e,event,i*50);damage+=accepted;
    assert.equal(permittedM19Damage(e,event,i*50),0,'duplicate damage must not replay');
   }
   visual.root.position.set(f.position.x,f.position.y,f.position.z);visual.root.rotation.y=f.yaw;
   visual.setTitanPose(f);visual.update(0,2000,0);visual.root.updateMatrixWorld(true);
   for(const [key,side] of [['hand-left','left'],['hand-right','right'],['gem',null]]){
    const p=new THREE.Vector3();if(side)visual.handPosition(side,p);else visual.corePosition(p);
    assert(p.distanceTo(new THREE.Vector3(f.limbs[key].x,f.limbs[key].y,f.limbs[key].z))<.02,ability.id+' pose mismatch');
   }
  }
  assert(warned&&active,ability.id+' must play its attack');assert(damage>0,ability.id+' must cause validated damage');
  visual.dispose();disposeM19(e);
 }
});

test('M24 remains grounded on actual scaled Dallas terrain with compact building data',()=>{
 const ground=(x,z)=>dallasElevationAt(x,z),e=createFinalWarlordEncounter('terrain','p',0,ground,loadMonsterDistrictBuildings());
 const origin={...e.frame.position};let traveled=0;
 for(let i=1;i<=600;i++){
  const before={...e.frame.position};
  stepM19(e,{x:origin.x+12000,y:origin.y+1500,z:origin.z+4000},zero,18,i*50);
  traveled+=Math.hypot(e.frame.position.x-before.x,e.frame.position.z-before.z);
  assert(Math.abs(e.frame.position.y-ground(e.frame.position.x,e.frame.position.z))<.01);
 }
 assert(traveled>4000,'actual Dallas terrain must allow running pursuit');disposeM19(e);
});
