import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.js';
import {M24_INTRO as timing,m24IntroText,m24IntroMotion} from '../../client/src/m24-intro.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {DALLAS_WORLD_SCALE} from '../../shared/dallas-world-scale.mjs';
import {journeyDallas19,journeyDallas25,journeyMissionSlot} from '../../shared/journey-mission.mjs';
import {finalWarlordSpecies as huntingWarlordSpecies} from './final-warlord.js';
import {m23Travel as m24Travel,m23GaitTimes as m24GaitTimes} from '../../client/src/m23-intro.js';
import {loadMonsterDistrictBuildings} from './monster-arrival.js';
const bytes=readFileSync(new URL('../../client/public/assets/models/monsters/ashen-warlord.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture:async()=>new THREE.Texture()}));
const source=loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const data=JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json',import.meta.url),'utf8'));
const raw=Buffer.from(data.elevations,'base64'),samples=new Uint16Array(raw.buffer,raw.byteOffset,raw.byteLength/2);
const ground=(wx,wz)=>{
  const x=THREE.MathUtils.clamp((wx/DALLAS_WORLD_SCALE-data.bounds.minX)/(data.bounds.maxX-data.bounds.minX),0,1)*(data.width-1),z=THREE.MathUtils.clamp((wz/DALLAS_WORLD_SCALE-data.bounds.minZ)/(data.bounds.maxZ-data.bounds.minZ),0,1)*(data.height-1);
  const x0=Math.floor(x),z0=Math.floor(z),x1=Math.min(data.width-1,x0+1),z1=Math.min(data.height-1,z0+1);
  const at=(a,b)=>data.baseElevation+samples[b*data.width+a]*data.scale;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0,z0),at(x1,z0),x-x0),THREE.MathUtils.lerp(at(x0,z1),at(x1,z1),x-x0),z-z0)*DALLAS_WORLD_SCALE;
};
const buildings=loadMonsterDistrictBuildings().filter(b=>b.maxX>-8500*DALLAS_WORLD_SCALE&&b.minX<-2500*DALLAS_WORLD_SCALE&&b.maxZ>-5000*DALLAS_WORLD_SCALE&&b.minZ<500*DALLAS_WORLD_SCALE).map(b=>({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,halfX:(b.maxX-b.minX)/2,halfZ:(b.maxZ-b.minZ)/2,height:b.top}));

const create=()=>new MonsterArrivalView(new THREE.Scene(),ground(journeyDallas19.monster.x,journeyDallas19.monster.z),0,undefined,source,ground,()=>390,model,false,true,true,true);
test('M24 exact captions, seven scene boundaries and unsped authored motions',()=>{
 for(const [t,text] of [[0,'Dr. Boss is back for one final battle!'],[4,"He's faster than ever!"],[8,'And stronger than ever!'],[12,"He won't give up!"],[16,'His energy attack is coming!'],[24,'This is your final chance to save Dallas!'],[28,"Pilot! It's time to finish this!"],[30.5,'DEFEAT THE MONSTER'],[32,'']])assert.equal(m24IntroText(t),text);
 for(const [start,end,key] of [[8,timing.turnEnd,'turn'],[9.5,9.5+model.clips.punch.duration,'punch'],[12,12+model.clips.roar.duration,'roar'],[16,timing.shoot,'charge'],[timing.shoot,24,'shoot']])for(const t of [start+.01,(start+end)/2,end-.01]){
   assert.equal(m24IntroMotion(t).key,key);assert(Math.abs(m24IntroMotion(t).time-(t-start))<1e-9);
 }
 assert.equal(m24IntroMotion(5).key,'run');assert.equal(m24IntroMotion(7.5).key,'idle');assert(m24IntroMotion(9.4).yawOffset>m24IntroMotion(8).yawOffset);
 for(let t=.4;t<7;t+=.01){const a=m24GaitTimes(t),b=m24GaitTimes(t+.001);assert((b.walk-a.walk)/.001<=1.001);assert((b.run-a.run)/.001<=1.001);assert(b.run>=a.run-1e-9);}
 assert(m24IntroMotion(5.5).lookUp>.9);assert.equal(m24IntroMotion(24).key,'idle');assert.equal(timing.duration,32);assert.equal(m24IntroMotion(timing.aimTurn).key,'turn');
});
test('M24 uses a real collision-checked Dallas walk/run/stop/turn, stays grounded, and releases exactly one harmless hand-origin shot',async()=>{
 const view=create();await view.ready;const actor=view.creature,origin=actor.root.position.clone(),yaw=actor.root.rotation.y;
 let roars=0,shots=0,steps=0,punches=0,casts=0;const impacts=[];view.onCasting=()=>casts++;view.onWarning=()=>punches++;view.onRoar=()=>roars++;view.onProjectile=()=>shots++;view.onFootfall=()=>{steps++;impacts.push(view.introTime);};
 view.prepareHuntingIntro(buildings,false,true,true);const intro=actor.strikingIntro,start=actor.root.position.clone();assert(start.distanceTo(origin)>250);
 let previous=start.clone(),sawShot=false;const clips=new Set();
 for(let frame=0;frame<=1280;frame++){
   const t=frame/40;view.setIntroTime(t);view.update(.025);const motion=m24IntroMotion(t,intro.walk.startTime);clips.add(motion.key);
   assert.equal(motion.height,0);assert(actor.root.position.distanceTo(previous)<150,'walking has no teleports');previous.copy(actor.root.position);
   if(t<7){const distance=m24Travel(t,intro.walk.startTime);assert(Math.abs(Math.hypot(actor.root.position.x-start.x,actor.root.position.z-start.z)-distance)<.001);}
   else assert(Math.hypot(actor.root.position.x-origin.x,actor.root.position.z-origin.z)<1e-6);
   let low=Infinity;const p=new THREE.Vector3();for(const v of model.support){actor.mesh.getVertexPosition(v.index,p);actor.mesh.localToWorld(p);low=Math.min(low,p.y-ground(p.x,p.z));}assert(Math.abs(low)<.01,'feet remain grounded on actual terrain');
   assert(actor.actions.get(model.clips[motion.key].name).enabled);
   if(t<timing.release)assert.equal(shots,0);
   if(view.pool[0].group.visible){sawShot=true;assert.equal(view.pool[0].id,null);assert(view.pool[0].direction.y>.8);assert(Math.hypot(view.pool[0].direction.x,view.pool[0].direction.z)>.5);assert(Math.abs(Math.sin(Math.atan2(view.pool[0].direction.x,view.pool[0].direction.z)-(actor.root.rotation.y+.12)))<1e-6);assert(view.pool[0].group.position.y>=view.introShotOrigin.y);}
   assert.equal(actor.frame,null);assert.equal(view.damagedDowntown,false);
 }
 assert.deepEqual([...clips].sort(),['idle','walk','run','turn','roar','punch','charge','shoot'].sort());assert.equal(roars,1);assert.equal(punches,1);assert.equal(casts,1);assert.equal(impacts.filter(t=>t>=7).length,1);assert.equal(impacts.find(t=>t>=7),10.05);assert.equal(shots,1);assert(sawShot);assert(steps>0);
 assert(impacts.some(t=>t>=4&&t<7),'authored running footfalls produce audio/dust cues');
 const player=new THREE.Group();player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));
 const path=new CombatMissionIntroPath(actor.root,player,19,false,false,view.introFistPosition,view.introProjectilePosition,true,false,true,()=>view.introFootstepTime,true),camera=new THREE.PerspectiveCamera(48,1280/589,1,20000),position=new THREE.Vector3(),target=new THREE.Vector3();
 for(const t of [2,5,6.5]){view.setIntroTime(t);view.update(.025);path.sample(t*1000,position,target,new THREE.Vector3(),new THREE.Vector3());camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();const box=new THREE.Box3().setFromObject(actor.root,true);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const screen=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(screen.x)<1&&Math.abs(screen.y)<1,'full walking/running monster stays framed');}}
 player.children[0].geometry.dispose();player.children[0].material.dispose();
 assert.equal(actor.actions.get(model.clips.defeat.name).enabled,false);view.setIntroTime(null);assert.deepEqual(actor.root.position,origin);assert.equal(actor.root.rotation.y,yaw);assert.equal(actor.strikingIntro,undefined);
 assert(!view.mouthFire.visible);assert(!view.castingHand.visible);assert(!view.pool[0].group.visible);view.dispose();assert.equal(view.scene.children.length,0);
});
test('M24 skip at every scene, retry, disposal and obstruction restore the authoritative transform',async()=>{
 for(const t of [0,2,5,9,13,18,23,25,29,31.9]){
   const view=create();await view.ready;const origin=view.creature.root.position.clone(),yaw=view.creature.root.rotation.y;
   view.prepareHuntingIntro(buildings,false,true,true);view.setIntroTime(t);view.update(.025);view.setIntroTime(null);assert.deepEqual(view.creature.root.position,origin);assert.equal(view.creature.root.rotation.y,yaw);assert(!view.pool[0].group.visible);
   view.prepareHuntingIntro(buildings,false,true,true);view.setIntroTime(0);view.update(.025);assert(view.creature.root.position.distanceTo(origin)>250);view.dispose();assert.equal(view.scene.children.length,0);
 }
 const view=create();await view.ready;const saved=view.creature.root.position.clone();assert.throws(()=>view.prepareHuntingIntro([{x:saved.x,z:saved.z,halfX:10000,halfZ:10000,height:10000}],false,true,true),/obstructed/);assert.deepEqual(view.creature.root.position,saved);view.dispose();
});
test('M24 camera hands off to the actual DFW plane at 32s and preserves M19/M20/other boss durations',()=>{
 const root=new THREE.Group(),player=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(600,1920,600)));player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));player.position.set(7000,450,-38000);
 const path=new CombatMissionIntroPath(root,player,19,false,false,new THREE.Vector3(),new THREE.Vector3(),true,false,true,undefined,true),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(7000,455,-37980),look=new THREE.Vector3(7000,451,-38000);
 assert.equal(path.durationMs,32000);assert.equal(path.wipe(24000),1);assert.equal(path.wipe(28000),1);assert.equal(path.streamingPosition(24000),root.position);assert.equal(path.streamingPosition(28000),player.position);path.sample(32000,position,target,chase,look);assert.deepEqual(position,chase);assert.deepEqual(target,look);assert.equal(path.fov(32000,58),58);
 assert.equal(new CombatMissionIntroPath(root,player,19,true).durationMs,20000);assert.equal(new CombatMissionIntroPath(root,player,19,false,true).durationMs,28000);assert.equal(new CombatMissionIntroPath(root,player,19).durationMs,12000);
 for(const group of [root,player]){group.children[0].geometry.dispose();group.children[0].material.dispose();}
});
test('M24 remains HARD with its own nine motions, DFW selection, and existing post-cinematic countdown',()=>{
 assert.equal(journeyDallas19.startAirportId,'dfw');assert.equal(journeyDallas19.bossHealth,1500);assert.equal(journeyDallas19.firstClearCredits,4000);assert.equal(huntingWarlordSpecies.level,'HARD');
 assert.equal(huntingWarlordSpecies.abilities.find(a=>a.id==='hand-strike').damage,25);assert.equal(huntingWarlordSpecies.abilities.find(a=>a.id==='hand-strike').cooldown,3.5);assert.equal(huntingWarlordSpecies.abilities.find(a=>a.id==='fireball-barrage').damage,20);assert.equal(huntingWarlordSpecies.abilities.find(a=>a.id==='fireball-barrage').cooldown,5);
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');assert(main.includes('const finalIntro=journeyAttempt.missionId===journeyDallas19.id'));assert(main.includes('if(finalIntro)view.prepareHuntingIntro(obstacleBounds,false,true,true)'));assert(main.includes('if(journeyAttempt.missionId===journeyDallas19.id)clearFlightLaunchPresentation()'));
 const complete=main.slice(main.indexOf('function completeFlightLaunchCinematic'),main.indexOf('function abortFlightLaunchCinematic'));assert(complete.includes('clearFlightLaunchPresentation()'));assert(complete.includes('beginMissionStartCountdown()'));
 const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8');const spawn=server.slice(server.indexOf('const spawnAirportId = soloExploreMode'),server.indexOf('const airborneSpawn = authorizedJourneyAirborneSpawn'));
 assert(spawn.includes('journeyDallas19.id'));assert.equal(journeyMissionSlot(journeyDallas19.id),24);assert.equal(journeyMissionSlot(journeyDallas25.id),19);assert(main.includes('const arrivalIntro=journeyAttempt.missionId===journeyDallas25.id'));assert(main.includes('const huntingTiming=missionCombatIntroPath?.finalIntro?M24_INTRO:M21_INTRO'));
});
