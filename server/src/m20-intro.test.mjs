import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.js';
import {M20_INTRO as timing,m20IntroText,m20IntroMotion} from '../../client/src/m20-intro.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {strikingWarlord} from '../../shared/striking-warlord.mjs';
import {strikingWarlordSpecies} from './striking-warlord.js';
import {journeyDallas20} from '../../shared/journey-mission.mjs';
const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const create=()=>new MonsterArrivalView(new THREE.Scene(),135,135,undefined,source,()=>135,()=>390,model,false,true);

test('M20 captions and normal-rate authored clips match all six approved scenes and one release',()=>{
 for(const [t,text] of [[0,'Dr. Boss is back!'],[2,"He's stronger than before!"],[8,'Watch out for his punches!'],[11,"And he's angrier than ever!"],[15,'Now he can shoot energy!'],[23,'Pilot! Dr. Boss is back! Stop him!'],[26.5,'DEFEAT THE MONSTER'],[28,'']])assert.equal(m20IntroText(t),text);
 assert.equal(timing.land+model.clips.landing.duration,8);assert(Math.abs(timing.shoot-15-model.clips.charge.duration)<1e-9);assert(Math.abs(timing.release-timing.shoot-strikingWarlord.releaseSeconds)<1e-9);
 for(const [from,to,key] of [[2,timing.land,'jump'],[timing.land,8,'landing'],[8,10.25,'punch'],[11,14.625,'roar'],[15,timing.shoot,'charge'],[timing.shoot,23,'shoot']]){
   for(const t of [from+.01,(from+to)/2,to-.01]){const motion=m20IntroMotion(t);assert.equal(motion.key,key);assert(Math.abs(motion.time-(t-from))<1e-9,'authored clips are never sped up or restarted');}
 }
 assert.equal(m20IntroMotion(24).key,'idle');assert.equal(timing.duration,28);
});
test('M20 jump physically follows Jump, lands once, plays full Land and remains grounded through the rest of the cinematic',async()=>{
 const view=create();await view.ready;const actor=view.creature,origin=actor.root.position.clone(),yaw=actor.root.rotation.y;
 let lands=0,roars=0,shots=0;view.onFootfall=()=>lands++;view.onRoar=()=>roars++;view.onProjectile=()=>shots++;
 view.prepareStrikingIntro();let peak=0,previous=actor.root.position.clone(),sawCast=false,sawShot=false;
 for(let frame=0;frame<=1120;frame++){
   const t=frame/40;view.setIntroTime(t);view.update(.025);
   const motion=m20IntroMotion(t);peak=Math.max(peak,actor.root.position.y-origin.y);
   assert.equal(actor.root.position.x,origin.x);assert.equal(actor.root.position.z,origin.z);
   assert(Math.abs(actor.root.position.y-origin.y-motion.height)<1e-6);
   assert(actor.root.position.distanceTo(previous)<45,'vertical motion has no teleports');previous.copy(actor.root.position);
   let low=Infinity;const p=new THREE.Vector3();for(const v of model.support){actor.mesh.getVertexPosition(v.index,p);actor.mesh.localToWorld(p);low=Math.min(low,p.y-135);}
   assert(Math.abs(low-motion.height)<.01,'real skeletal surface contact follows the physical arc and ground');
   assert(actor.actions.get(model.clips[motion.key].name).enabled);
   if(t<timing.release)assert.equal(shots,0,'projectile cannot appear before the release motion');
   if(t>=15&&t<timing.shoot)sawCast=true;
   if(view.pool[0].group.visible){assert(sawCast);sawShot=true;assert.equal(view.pool[0].id,null);assert.equal(view.pool[0].direction.y,1);assert(view.pool[0].group.position.y>=view.introShotOrigin.y);}
   assert.equal(view.creature.frame,null,'intro never receives a combat simulation');
   assert.equal(view.damagedDowntown,false);
 }
 assert(peak>model.height*.2);assert.equal(lands,1);assert.equal(roars,1);assert.equal(shots,1);assert(sawShot);
 assert.equal(actor.actions.get(model.clips.defeat.name).enabled,false);
 view.setIntroTime(null);assert.deepEqual(actor.root.position,origin);assert.equal(actor.root.rotation.y,yaw);assert.equal(actor.strikingIntro,undefined);
 assert(!view.pool[0].group.visible);assert(!view.mouthFire.visible);assert(!view.castingHand.visible);assert.equal(view.pool[0].group.scale.x,1);
 view.dispose();assert.equal(view.scene.children.length,0);
});
test('skipping every scene, retry and disposal restore the exact pose and remove temporary energy',async()=>{
 for(const seconds of [0,1,3,5,8.8,12,17,21.8,24,27.9]){
   const view=create();await view.ready;const origin=view.creature.root.position.clone(),yaw=view.creature.root.rotation.y;
   view.prepareStrikingIntro();view.setIntroTime(seconds);view.update(.025);view.setIntroTime(null);
   assert.deepEqual(view.creature.root.position,origin);assert.equal(view.creature.root.rotation.y,yaw);assert.equal(view.strikingIntroEnabled,false);
   assert(!view.pool[0].group.visible);assert(!view.mouthFire.visible);assert(!view.castingHand.visible);
   view.prepareStrikingIntro();view.setIntroTime(0);view.update(.025);assert(view.mouthFire.visible);view.dispose();assert.equal(view.scene.children.length,0);
 }
});
test('M20 camera keeps a jumping monster in frame, tracks the actual fist and shot, and hands off at exactly 28s',()=>{
 const root=new THREE.Group(),player=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(600,1920,600).translate(0,960,0)));player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));
 const fist=new THREE.Vector3(500,1000,0),shot=new THREE.Vector3(0,2000,0),path=new CombatMissionIntroPath(root,player,19,false,true,fist,shot);
 const camera=new THREE.PerspectiveCamera(48,1280/589,1,20000),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(0,5,20),look=new THREE.Vector3(0,1,0);
 assert.equal(path.durationMs,28000);assert.equal(path.sweepMs,26500);assert.equal(path.wipe(23000),1);
 for(const t of [2.7,3,3.6,4.25,6]){
   root.position.y=m20IntroMotion(t).height;path.sample(t*1000,position,target,chase,look);camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();
   for(const y of [0,1920]){const p=new THREE.Vector3(0,root.position.y+y,0).project(camera);assert(Math.abs(p.y)<1,'the full jump stays visible');}
 }
 path.sample(28000,position,target,chase,look);assert.deepEqual(position,chase);assert.deepEqual(target,look);assert.equal(path.fov(28000,58),58);
 const other=new CombatMissionIntroPath(root,player,19);assert.equal(other.durationMs,12000);assert.equal(other.sweepMs,11000);
 const m19=new CombatMissionIntroPath(root,player,19,true);assert.equal(m19.durationMs,20000);
 root.children[0].geometry.dispose();root.children[0].material.dispose();player.children[0].geometry.dispose();player.children[0].material.dispose();
});
test('M20 integration is isolated, replays on retry and keeps countdown after the intro; combat properties are untouched',()=>{
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 assert(main.includes('const strikingIntro=journeyAttempt.missionId===journeyDallas20.id'));assert(main.includes('if(strikingIntro)view.prepareStrikingIntro()'));
 const retry=main.slice(main.indexOf('async function retryJourneyMission'),main.indexOf("window.addEventListener('airport-chaos-city-exit'"));assert(retry.includes('const retryGateIntro = journeyAttempt.missionId === journeyDallas20.id'));assert(retry.includes('if(journeyAttempt.missionId===journeyDallas20.id)clearFlightLaunchPresentation()'));
 const completion=main.slice(main.indexOf('function completeFlightLaunchCinematic'),main.indexOf('function abortFlightLaunchCinematic'));assert(completion.includes('clearFlightLaunchPresentation()'));assert(completion.includes('beginMissionStartCountdown()'));
 assert.equal(journeyDallas20.bossHealth,700);assert.equal(journeyDallas20.firstClearCredits,2700);assert.equal(journeyDallas20.startAirportId,'love');assert.equal(strikingWarlordSpecies.level,'EASY');
 assert.equal(strikingWarlordSpecies.abilities.find(a=>a.id==='hand-strike').damage,15);assert.equal(strikingWarlordSpecies.abilities.find(a=>a.id==='hand-strike').cooldown,4);
 assert.equal(strikingWarlordSpecies.abilities.find(a=>a.id==='fireball-barrage').damage,10);assert.equal(strikingWarlordSpecies.abilities.find(a=>a.id==='fireball-barrage').cooldown,8);
});
