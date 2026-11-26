import {M19_TIMEOUT,M1_TIMEOUT,M19_CITY_BLAST_SCALE} from '../../client/src/monster-timeout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.js';
import {M23_INTRO as timing,m23IntroText,m23IntroMotion,m23Travel,m23GaitTimes} from '../../client/src/m23-intro.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {M19_DOWNTOWN} from '../../client/src/m19-intro.js';
import {M24_INTRO,m24IntroMotion,m24Travel} from '../../client/src/m24-intro.js';
import {DALLAS_WORLD_SCALE} from '../../shared/dallas-world-scale.mjs';
import {journeyDallas23} from '../../shared/journey-mission.mjs';
import {pursuitWarlordSpecies as huntingWarlordSpecies} from './pursuit-warlord.js';
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
const buildings=[];loadMonsterDistrictBuildings().query(-8500*DALLAS_WORLD_SCALE,-2500*DALLAS_WORLD_SCALE,-5000*DALLAS_WORLD_SCALE,500*DALLAS_WORLD_SCALE,b=>{buildings.push({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,halfX:(b.maxX-b.minX)/2,halfZ:(b.maxZ-b.minZ)/2,height:b.top});return false;});

const create=(defender=false)=>new MonsterArrivalView(new THREE.Scene(),ground(journeyDallas23.monster.x,journeyDallas23.monster.z),0,undefined,source,ground,()=>390,model,false,true,true,true,false,defender);
test('M23 short captions and walk/roar/shoot scene boundaries and unsped authored motions',()=>{
 for(const [t,text] of [[0,'Dr. Boss marches toward downtown.'],[8,'His roar shakes Dallas.'],[12,'Fireballs race toward the city!'],[19,'Downtown is next. Stop him!'],[24,'Dallas needs a hero.'],[26.5,'Pilot, defeat Dr. Boss. Save Dallas!'],[28,'']])assert.equal(m23IntroText(t),text);
 for(const [start,end,key] of [[8,8+model.clips.roar.duration,'roar'],[timing.shoot,timing.shoot+model.clips.shoot.duration,'shoot']])for(const t of [start+.01,(start+end)/2,end-.01]){
   assert.equal(m23IntroMotion(t).key,key);assert(Math.abs(m23IntroMotion(t).time-(t-start))<1e-9);
 }
 assert.equal(m23IntroMotion(5).key,'walk');assert.equal(m23IntroMotion(7.5).key,'idle');assert.equal(m23IntroMotion(9.4).yawOffset,0);
 for(let t=.4;t<7;t+=.01){const a=m23GaitTimes(t),b=m23GaitTimes(t+.001);assert((b.walk-a.walk)/.001<=1.001);assert((b.run-a.run)/.001<=1.001);assert(b.run>=a.run-1e-9);}
 assert(m23IntroMotion(5.5).lookUp>.9);assert.equal(m23IntroMotion(24).key,'idle');assert.equal(timing.duration,28);
});
test('M23 uses a real collision-checked Dallas walk/roar/shoot, stays grounded, and releases one harmless hand-origin six-fireball volley',async()=>{
 const view=create();await view.ready;const actor=view.creature,origin=actor.root.position.clone(),yaw=actor.root.rotation.y;
 let roars=0,shots=0,steps=0,punches=0,casts=0;const impacts=[];view.onCasting=()=>casts++;view.onWarning=()=>punches++;view.onRoar=()=>roars++;view.onProjectile=()=>shots++;view.onFootfall=()=>{steps++;impacts.push(view.introTime);};
 view.prepareHuntingIntro(buildings,false,true);const intro=actor.strikingIntro,start=actor.root.position.clone();assert(start.distanceTo(origin)>250);
 let previous=start.clone(),sawShot=false;const clips=new Set();
 for(let frame=0;frame<=1120;frame++){
   const t=frame/40;view.setIntroTime(t);view.update(.025);const motion=m23IntroMotion(t,intro.walk.startTime);clips.add(motion.key);
   assert.equal(motion.height,0);assert(actor.root.position.distanceTo(previous)<150,'walking has no teleports');previous.copy(actor.root.position);
   if(t<7){const distance=m23Travel(t,intro.walk.startTime);assert(Math.abs(Math.hypot(actor.root.position.x-start.x,actor.root.position.z-start.z)-distance)<.001);}
   else assert(Math.hypot(actor.root.position.x-origin.x,actor.root.position.z-origin.z)<1e-6);
   let low=Infinity;const p=new THREE.Vector3();for(const v of model.support){actor.mesh.getVertexPosition(v.index,p);actor.mesh.localToWorld(p);low=Math.min(low,p.y-ground(p.x,p.z));}assert(Math.abs(low)<.01,'feet remain grounded on actual terrain');
   assert(actor.actions.get(model.clips[motion.key].name).enabled);
   if(t<timing.release)assert.equal(shots,0);
   if(view.pool[0].group.visible){sawShot=true;assert.equal(view.pool[0].id,null);assert(view.pool[0].direction.dot(new THREE.Vector3(0,0,1).applyQuaternion(actor.root.quaternion))>.85);assert(view.pool.filter(shot=>shot.group.visible).length>=1);}
   assert.equal(actor.frame,null);assert.equal(view.damagedDowntown,false);
 }
 assert.deepEqual([...clips].sort(),['idle','walk','roar','shoot'].sort());assert.equal(roars,1);assert.equal(punches,0);assert.equal(casts,1);assert.equal(impacts.filter(t=>t>=7).length,0);assert.equal(shots,1);assert(sawShot);assert(steps>0);
 assert(impacts.some(t=>t>=4&&t<7),'authored walking footfalls produce audio/dust cues');
 const player=new THREE.Group();player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));
 const path=new CombatMissionIntroPath(actor.root,player,19,false,false,view.introFistPosition,view.introProjectilePosition,true,false,true,()=>view.introFootstepTime),camera=new THREE.PerspectiveCamera(48,1280/589,1,20000),position=new THREE.Vector3(),target=new THREE.Vector3();
 for(const t of [2,5,6.5]){view.setIntroTime(t);view.update(.025);path.sample(t*1000,position,target,new THREE.Vector3(),new THREE.Vector3());camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();const box=new THREE.Box3().setFromObject(actor.root,true);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const screen=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(screen.x)<1&&Math.abs(screen.y)<1,'full walking monster stays framed');}}
 player.children[0].geometry.dispose();player.children[0].material.dispose();
 assert.equal(actor.actions.get(model.clips.defeat.name).enabled,false);view.setIntroTime(null);assert.deepEqual(actor.root.position,origin);assert.equal(actor.root.rotation.y,yaw);assert.equal(actor.strikingIntro,undefined);
 assert(!view.mouthFire.visible);assert(!view.castingHand.visible);assert(view.pool.slice(0,6).every(shot=>!shot.group.visible));view.dispose();assert.equal(view.scene.children.length,0);
});
test('M23 skip at every scene, retry, disposal and obstruction restore the authoritative transform',async()=>{
 for(const t of [0,2,5,9,13,18,23,25,27.9]){
   const view=create();await view.ready;const origin=view.creature.root.position.clone(),yaw=view.creature.root.rotation.y;
   view.prepareHuntingIntro(buildings,false,true);view.setIntroTime(t);view.update(.025);view.setIntroTime(null);assert.deepEqual(view.creature.root.position,origin);assert.equal(view.creature.root.rotation.y,yaw);assert(view.pool.slice(0,6).every(shot=>!shot.group.visible));
   view.prepareHuntingIntro(buildings,false,true);view.setIntroTime(0);view.update(.025);assert(view.creature.root.position.distanceTo(origin)>250);view.dispose();assert.equal(view.scene.children.length,0);
 }
 const view=create();await view.ready;const saved=view.creature.root.position.clone();assert.throws(()=>view.prepareHuntingIntro([{x:saved.x,z:saved.z,halfX:10000,halfZ:10000,height:10000}],false,true),/obstructed/);assert.deepEqual(view.creature.root.position,saved);view.dispose();
});
test('M23 camera hands off to the actual Love Field plane at 28s and preserves M19/M20/other boss durations',()=>{
 const root=new THREE.Group(),player=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(600,1920,600)));player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));player.position.set(7000,450,-38000);
 const path=new CombatMissionIntroPath(root,player,19,false,false,new THREE.Vector3(),new THREE.Vector3(),true,false,true),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(7000,455,-37980),look=new THREE.Vector3(7000,451,-38000);
 assert.equal(path.durationMs,28000);assert.equal(path.wipe(24000),1);assert.equal(path.streamingPosition(24000),player.position);path.sample(28000,position,target,chase,look);assert.deepEqual(position,chase);assert.deepEqual(target,look);assert.equal(path.fov(28000,58),58);
 assert.equal(new CombatMissionIntroPath(root,player,19,true).durationMs,20000);assert.equal(new CombatMissionIntroPath(root,player,19,false,true).durationMs,28000);assert.equal(new CombatMissionIntroPath(root,player,19).durationMs,12000);
 for(const group of [root,player]){group.children[0].geometry.dispose();group.children[0].material.dispose();}
});
test('M23 remains EASY without punching, Love Field selection, and existing post-cinematic countdown',()=>{
 assert.equal(journeyDallas23.startAirportId,'love');assert.equal(journeyDallas23.bossHealth,2000);assert.equal(journeyDallas23.firstClearCredits,3150);assert.equal(huntingWarlordSpecies.level,'EASY');
 assert(!huntingWarlordSpecies.abilities.some(a=>a.id==='hand-strike'));assert.equal(huntingWarlordSpecies.abilities.find(a=>a.id==='fireball-barrage').damage,25);assert.equal(huntingWarlordSpecies.abilities.find(a=>a.id==='fireball-barrage').cooldown,1.5);
 const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');assert(main.includes('const pursuitIntro=journeyAttempt.missionId===journeyDallas23.id'));assert(main.includes('if(pursuitIntro)view.prepareHuntingIntro(obstacleBounds,false,true)'));assert(main.includes('clearFlightLaunchPresentation();'));
 const complete=main.slice(main.indexOf('function completeFlightLaunchCinematic'),main.indexOf('function abortFlightLaunchCinematic'));assert(complete.includes('clearFlightLaunchPresentation()'));assert(complete.includes('beginMissionStartCountdown()'));
 const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8');const spawn=server.slice(server.indexOf('const spawnAirportId ='),server.indexOf('const airborneSpawn = authorizedJourneyAirborneSpawn'));
 assert(spawn.includes('journeyDallas23.id'));
});

test('M23 six-fireball demonstration follows its visible hand and stays in frame',async()=>{
 for(const yaw of [0,.7,2,-2]){
  const view=create();await view.ready;const actor=view.creature;actor.root.rotation.y=yaw;
  view.prepareHuntingIntro(buildings,false,true);
  const player=new THREE.Group(),path=new CombatMissionIntroPath(actor.root,player,19,false,false,view.introFistPosition,view.introProjectilePosition,true,false,true,()=>view.introFootstepTime);
  let releases=0;view.onProjectile=()=>releases++;
  try{
   view.setIntroTime(timing.release-.01);view.update(.01);assert(view.pool.every(shot=>!shot.group.visible));
   view.setIntroTime(timing.release);view.update(.01);
   const rounds=view.pool.slice(0,6),origin=view.introShotOrigin.clone(),hand=new THREE.Vector3();actor.handPosition('right',hand);
   assert(origin.distanceTo(hand)<.001);assert.equal(view.pool.filter(shot=>shot.group.visible).length,6);
   const directions=rounds.map(shot=>shot.direction.clone());
   for(const shot of rounds){assert.equal(shot.id,null);assert(shot.direction.dot(rounds[0].direction)>.9);assert.equal(shot.group.scale.x,6);assert(shot.group.position.distanceTo(origin)<.001);}
   const impactData=view.introBlasts;
   assert.equal(impactData.length,6);
   for(const impact of impactData){
    assert(impact.distance/1800<timing.runway-timing.release,'all strikes land before the hero reveal');
    assert(Math.hypot(impact.position.x-M19_DOWNTOWN.x,impact.position.z-M19_DOWNTOWN.z)>=1700,'strikes hit the outskirts, not the skyline');
    assert(Math.abs(impact.position.y-ground(impact.position.x,impact.position.z))<.001);
   }
   for(const age of [.2,.6,.9,5,9]){
    view.setIntroTime(timing.release+age);view.update(.025);
    const position=new THREE.Vector3(),target=new THREE.Vector3();path.sample((timing.release+age)*1000,position,target,new THREE.Vector3(),new THREE.Vector3());
    for(const aspect of [1280/589,16/9]){
     const camera=new THREE.PerspectiveCamera(48,aspect,1,20000);camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();
     for(const [index,shot] of rounds.entries()){
      const impact=impactData[index],landed=age>=impact.distance/1800;
      assert.equal(shot.group.visible,!landed);
      if(!landed)assert(shot.group.position.distanceTo(origin.clone().addScaledVector(directions[index],age*1800))<.001);
      else assert.equal(impact.blast.root.visible,(age-impact.distance/1800)*.65<5.8,'landed fireballs become explosions');
      const screen=shot.group.position.clone().project(camera);assert(Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&screen.z<1);
     }
    }
   }
   assert(impactData.every(impact=>impact.played));assert.equal(view.damagedDowntown,false);
   assert.equal(releases,1);view.setIntroTime(null);assert(rounds.every(shot=>!shot.group.visible&&shot.group.scale.x===1));
  }finally{view.dispose();}
 }
});


test('M2 intro uses only Run, Roar, Shoot and brief Idle transitions with M1-sized spread fireballs',async()=>{
 assert.equal(m24IntroMotion(2).key,'run');assert.equal(m24IntroMotion(5).key,'run');assert.equal(m24IntroMotion(8).key,'roar');assert.equal(m24IntroMotion(12).key,'shoot');
 assert.equal(M24_INTRO.shoot,12);
 for(let t=0;t<28;t+=.05)assert(['idle','run','roar','shoot'].includes(m24IntroMotion(t).key));
 assert.equal(M24_INTRO.release,M24_INTRO.shoot+1.3);
 const view=create();await view.ready;
 try{
  view.prepareHuntingIntro(buildings,false,true,true);
  for(const t of [2,5,6.5]){
   view.setIntroTime(t);view.update(.025);const intro=view.creature.strikingIntro;
   const remaining=intro.walk.distance-m24Travel(t,intro.walk.startTime);
   assert(Math.abs(view.creature.root.position.x-(intro.position.x-Math.sin(intro.walk.yaw)*remaining))<.001);
  }
  view.setIntroTime(M24_INTRO.release);view.update(.01);
  assert.equal(view.pool.filter(shot=>shot.group.visible).length,12);
  const rounds=view.pool.slice(0,12),origin=view.introShotOrigin.clone();
  for(const round of rounds)assert.equal(round.group.scale.x,6);
  view.setIntroTime(M24_INTRO.release+.5);view.update(.01);
  for(const round of rounds)assert(Math.abs(round.group.position.distanceTo(origin)-900)<.001);
  assert(rounds[1].group.position.distanceTo(rounds[2].group.position)>100,'spread stays clearly separated');
  assert.equal(view.introBlasts.length,12);
  assert(view.introBlasts.every(impact=>Math.hypot(impact.position.x-M19_DOWNTOWN.x,impact.position.z-M19_DOWNTOWN.z)>=1700&&Math.hypot(impact.position.x-M19_DOWNTOWN.x,impact.position.z-M19_DOWNTOWN.z)<=5500));
  view.setIntroTime(23);view.update(.05);
  assert(view.introBlasts.every(impact=>impact.played),'all twelve fireballs create impacts near downtown');
  assert.equal(view.damagedDowntown,false,'the intro does not destroy the actual mission city');
  view.setIntroTime(null);assert(rounds.every(round=>!round.group.visible&&round.group.scale.x===1));
 }finally{view.dispose();}
});

test('M1 bullet impacts use sixfold smoke size; M2 keeps its existing impact and the pool stays bounded',async()=>{
 for(const defender of [false,true]){
  const view=create(defender);await view.ready;const calls=[];view.particles.emit=(...args)=>calls.push(args);
  view.showBulletImpact({position:{x:1,y:2,z:3},sequence:1});
  assert.equal(calls[0][5],28*(defender?6:1));assert.equal(calls[1][5],100*(defender?6:1));
  assert.equal(view.particles.particles.length,384);
  view.showBulletImpact({position:{x:1,y:2,z:3},sequence:1});assert.equal(calls.length,2,'duplicate hit does not replay smoke');view.dispose();
 }
});

test('M1 failure fires six real visual rounds, gives every impact a sixfold downtown blast, frames them and cleans up',async()=>{
 const view=create(true);await view.ready;let releases=0,impacts=0,completed=0;
 view.onProjectile=()=>releases++;view.onDestruction=()=>impacts++;view.onEndingComplete=()=>completed++;
 view.finish('timeout');assert.equal(view.timeoutVolley.length,6);
 const camera=new THREE.PerspectiveCamera(48,16/9,1,1000);
 let sawVolley=false,sawBlasts=false;
 for(let i=0;i<195;i++){
  view.update(.05);view.updateTimeoutCamera(camera);
  const t=view.endingElapsed;
  if(t>M19_TIMEOUT.releaseAt+.05&&t<M19_TIMEOUT.impactAt-.05){
   sawVolley=true;assert.equal(view.pool.filter(shot=>shot.group.visible).length,6);
   for(const round of view.timeoutVolley){assert.equal(round.shot.id,null);assert.equal(round.shot.group.scale.x,6);assert(round.shot.group.position.distanceTo(view.endingOrigin)>0);}
  }
  if(t>M19_TIMEOUT.impactAt+5*M1_TIMEOUT.impactSpacing+.1&&t<M19_TIMEOUT.impactAt+1){
   sawBlasts=true;assert(view.timeoutVolley.every(round=>round.blast.root.visible&&!round.shot.group.visible));
   for(const round of view.timeoutVolley){assert.equal(round.blast.scale,M19_CITY_BLAST_SCALE*6);assert(round.blast.root.position.equals(round.impact));}
  }
  assert(camera.position.toArray().every(Number.isFinite));
 }
 assert(sawVolley&&sawBlasts);assert.equal(releases,1);assert.equal(impacts,6);assert.equal(completed,1);
 assert.equal(view.timeoutBlackoutOpacity,1);assert(view.damagedDowntown);view.dispose();assert.equal(view.scene.children.length,0);
});

test('Both Dr. Boss failures frame their huge blasts, keep the release camera continuous and finish with a complete fade',async()=>{
 for(const defender of [true,false]){
 const view=create(defender);await view.ready;const camera=new THREE.PerspectiveCamera(48,16/9,1,1000),strikeTimes=[];
 view.onDestruction=()=>strikeTimes.push(view.endingElapsed);view.finish('timeout');
 let previous,releaseStep=0;
 for(let i=0;i<190;i++){
  view.update(.05);view.updateTimeoutCamera(camera);camera.updateMatrixWorld();const t=view.endingElapsed;
  if(t>M1_TIMEOUT.releaseAt-.1&&t<M1_TIMEOUT.releaseAt+.1&&previous)releaseStep=Math.max(releaseStep,camera.position.distanceTo(previous));
  previous=camera.position.clone();
  if(t>=5.8&&t<=M1_TIMEOUT.fadeAt){
   assert.equal(view.timeoutBlackoutOpacity,0,'smoke and city remain visible until the aftermath finishes');
   for(const round of view.timeoutVolley){
    round.blast.root.updateMatrixWorld(true);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    for(const sprite of round.blast.root.children.slice(1,19)){
     const center=sprite.getWorldPosition(new THREE.Vector3());
     for(const x of [-1,1])for(const y of [-1,1]){
      const point=center.clone().addScaledVector(up,y*sprite.scale.y/2).addScaledVector(right,x*sprite.scale.x/2).project(camera);
      assert(Math.abs(point.x)<1&&Math.abs(point.y)<1&&point.z<1,`smoke billow is framed at ${t.toFixed(2)}s: ${point.toArray()}`);
     }
    }
   }
  }
 }
 assert(releaseStep<200,'capturing the firing hand must not jolt the camera');
 assert.equal(strikeTimes.length,defender?6:12);for(let i=1;i<strikeTimes.length;i++)assert(strikeTimes[i]-strikeTimes[i-1]>=.099,'impacts are readable individual beats');
 assert.equal(view.timeoutBlackoutOpacity,1);view.dispose();assert.equal(view.scene.children.length,0);
 }
});

test('M2 failure uses twelve fireballs and twelve huge M1-sized downtown blasts',async()=>{
 const view=create();await view.ready;view.finish('timeout');
 let sawVolley=false,sawImpacts=false;
 for(let i=0;i<120;i++){
  view.update(.05);const t=view.endingElapsed;
  if(t>2&&t<3){sawVolley=true;assert.equal(view.pool.filter(shot=>shot.group.visible).length,12);assert(view.timeoutVolley.every(round=>round.shot.group.scale.x===6));}
  if(t>5.1){sawImpacts=true;assert(view.timeoutVolley.every(round=>round.blast.root.visible&&round.blast.scale===M19_CITY_BLAST_SCALE*6&&!round.shot.group.visible));}
 }
 assert(sawVolley&&sawImpacts);view.dispose();assert.equal(view.scene.children.length,0);
});

test('M2 approved intro motions stay grounded, frame the running monster, and hand off cleanly at 28 seconds',async()=>{
 const view=create();await view.ready;view.prepareHuntingIntro(buildings,false,true,true);
 const actor=view.creature,origin=actor.strikingIntro.position.clone(),yaw=actor.strikingIntro.yaw,player=new THREE.Group();
 player.position.set(7000,450,-38000);player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));
 const path=new CombatMissionIntroPath(actor.root,player,19,false,false,view.introFistPosition,view.introProjectilePosition,true,false,true,()=>view.introFootstepTime,true);
 const camera=new THREE.PerspectiveCamera(48,16/9,1,20000),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(7000,455,-37980),look=new THREE.Vector3(7000,451,-38000);
 let punchSounds=0,roars=0;view.onWarning=()=>punchSounds++;view.onRoar=()=>roars++;
 const allowed=new Set(['idle','run','roar','shoot'].map(key=>model.clips[key].name));
 try{
  for(let i=0;i<=560;i++){
   const t=i*.05;view.setIntroTime(t);view.update(.05);
   const clip=actor.actions.get(model.clips[m24IntroMotion(t,actor.strikingIntro.walk.startTime).key].name);
   assert(allowed.has(clip.getClip().name));assert(clip.enabled);
   let low=Infinity;const p=new THREE.Vector3();for(const v of model.support){actor.mesh.getVertexPosition(v.index,p);actor.mesh.localToWorld(p);low=Math.min(low,p.y-ground(p.x,p.z));}assert(Math.abs(low)<.01);
   if([2,5,6.5].includes(t)){
    path.sample(t*1000,position,target,chase,look);camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();
    const box=new THREE.Box3().setFromObject(actor.root,true);
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const point=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(point.x)<1&&Math.abs(point.y)<1,'running monster remains framed');}
   }
  }
  assert.equal(punchSounds,0);assert.equal(roars,1);assert.equal(path.durationMs,28000);assert.equal(path.streamingPosition(24000),player.position);
  path.sample(28000,position,target,chase,look);assert.deepEqual(position,chase);assert.deepEqual(target,look);
  view.setIntroTime(null);assert.deepEqual(actor.root.position,origin);assert.equal(actor.root.rotation.y,yaw);assert(view.pool.every(shot=>!shot.group.visible));
 }finally{player.children[0].geometry.dispose();player.children[0].material.dispose();view.dispose();}
});
