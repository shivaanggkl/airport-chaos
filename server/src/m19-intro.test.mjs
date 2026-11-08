import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {AshenWarlordModel} from '../../client/src/ashen-warlord-model.js';
import {MonsterArrivalView} from '../../client/src/monster-arrival.js';
import {CombatMissionIntroPath} from '../../client/src/mission-combat-intro.js';
import {M19_INTRO,M19_DOWNTOWN,m19IntroText,m19WalkDistance} from '../../client/src/m19-intro.js';
import {ashenWarlordModel as model} from '../../shared/ashen-warlord-model.mjs';
import {journeyDallas25,journeyDallas19} from '../../shared/journey-mission.mjs';
import {loadMonsterDistrictBuildings} from './monster-arrival.js';
import {stationaryWarlordSpecies} from './stationary-warlord.js';
import {DALLAS_WORLD_SCALE} from '../../shared/dallas-world-scale.mjs';
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

test('M19 authored approach is clear in real Dallas geometry, grounded, distance-matched and ends exactly at the combat transform',async()=>{
  const scene=new THREE.Scene(),view=new MonsterArrivalView(scene,ground(journeyDallas19.monster.x,journeyDallas19.monster.z),ground(M19_DOWNTOWN.x,M19_DOWNTOWN.z),undefined,source,ground,()=>390,model,true);
  await view.ready;
  const actor=view.creature,position=actor.root.position.clone(),yaw=actor.root.rotation.y;
  let steps=0,roars=0;view.onFootfall=()=>steps++;view.onRoar=()=>roars++;
  view.prepareStationaryIntro(buildings);view.setIntroTime(0);
  const start=actor.root.position.clone(),intro=actor.arrivalIntro;
  assert(start.distanceTo(position)>250,'a visible approach is verified, not replaced by stationary walking');
  assert(start.distanceTo(position)<2800,'approach is a short slow authored walk');
  let previous=actor.root.position.clone();
  for(let frame=0;frame<=560;frame++){
    const seconds=frame/40;view.setIntroTime(seconds);view.update(.025);
    assert.equal(actor.root.rotation.y,intro.walkYaw);assert.equal(actor.root.visible,seconds>=M19_INTRO.reveal,'monster stays hidden until its cinematic reveal');
    if(seconds>=M19_INTRO.reveal&&seconds<M19_INTRO.walkEnd){
      const clipTime=THREE.MathUtils.lerp(intro.startTime,model.clips.walk.duration,THREE.MathUtils.smoothstep(seconds,M19_INTRO.reveal,M19_INTRO.walkEnd));
      const distance=m19WalkDistance(clipTime)-m19WalkDistance(intro.startTime);
      assert(Math.abs(Math.hypot(actor.root.position.x-start.x,actor.root.position.z-start.z)-distance)<.001);
      assert.equal(actor.actions.get(model.clips.walk.name).enabled,true);
      let low=Infinity;const p=new THREE.Vector3();
      for(const v of model.support){actor.mesh.getVertexPosition(v.index,p);actor.mesh.localToWorld(p);low=Math.min(low,p.y-ground(p.x,p.z));}
      assert(Math.abs(low)<.01,'at least one real surface contact stays grounded');
    }
    if(seconds>=M19_INTRO.walkEnd)assert(actor.root.position.distanceTo(position)<.001);
    assert(actor.root.position.distanceTo(previous)<80,'no frame teleports');previous.copy(actor.root.position);
  }
  assert(steps>0);assert.equal(roars,1);
  assert(Math.hypot(start.x-M19_DOWNTOWN.x,start.z-M19_DOWNTOWN.z)>Math.hypot(position.x-M19_DOWNTOWN.x,position.z-M19_DOWNTOWN.z),'walk heads toward actual downtown');
  assert.equal(actor.actions.get(model.clips.idle.name).enabled,true,'Roar completes before the runway cut');
  assert.deepEqual(stationaryWarlordSpecies.animations,['idle','punch','roar','defeat']);
  for(const seconds of [15,19.9]){view.setIntroTime(seconds);view.update(.025);assert(actor.root.position.distanceTo(position)<.001);}
  view.setIntroTime(null);assert.deepEqual(actor.root.position,position);assert.equal(actor.root.rotation.y,yaw);assert.equal(actor.arrivalIntro,undefined);assert(actor.root.visible);
  view.dispose();assert.equal(scene.children.length,0);
});

test('M19 skip, cancellation, retry and blocked routes restore the exact gameplay-ready transform',async()=>{
  for(const seconds of [0,2,4.5,8.9,10,13.8,16,19.8]){
    const actor=new AshenWarlordModel(source,true);await actor.ready;actor.groundAt=()=>0;actor.root.position.set(-5500,0,-2400);actor.root.rotation.y=-2.09;
    const position=actor.root.position.clone(),yaw=actor.root.rotation.y;
    actor.prepareArrivalIntro([]);actor.setIntroTime(seconds);actor.update(.025,1000,0);actor.setIntroTime(null);
    assert.deepEqual(actor.root.position,position);assert.equal(actor.root.rotation.y,yaw);assert.equal(actor.actions.get(model.clips.walk.name).enabled,false);assert(actor.root.visible);
    actor.prepareArrivalIntro([]);actor.setIntroTime(0);actor.update(.025,1000,0);assert(actor.root.position.distanceTo(position)>250);
    actor.dispose();assert.deepEqual(actor.root.position,position);assert.equal(actor.root.children.length,0);
  }
  const actor=new AshenWarlordModel(source,true);await actor.ready;const saved=actor.root.position.clone();
  assert.throws(()=>actor.prepareArrivalIntro([{x:0,z:0,halfX:10000,halfZ:10000,height:10000}]),/obstructed/);
  assert.deepEqual(actor.root.position,saved);assert.equal(actor.arrivalIntro,undefined);assert(actor.root.visible);actor.dispose();
});

test('M19 screenplay presents all four story scenes and smoothly hands off at 20s; M20–M24 retain their camera',()=>{
  assert.equal(M19_INTRO.roarEnd-M19_INTRO.walkEnd,model.clips.roar.duration);
  assert.equal(m19IntroText(0),'');
  assert.equal(m19IntroText(4),'MONSTER DR. BOSS');assert.equal(m19IntroText(9),'DR. BOSS');
  assert.equal(m19IntroText(14),"CONTROL: Pilot! Monster Dr. Boss is heading downtown! Stop him before it's too late!");
  assert.equal(m19IntroText(18),'DEFEAT THE MONSTER');assert.equal(m19IntroText(20),'');
  const monster=new THREE.Group(),player=new THREE.Group();monster.add(new THREE.Mesh(new THREE.BoxGeometry(500,1920,500)));player.add(new THREE.Mesh(new THREE.BoxGeometry(20,6,25)));
  const path=new CombatMissionIntroPath(monster,player,19,true),position=new THREE.Vector3(),target=new THREE.Vector3(),chase=new THREE.Vector3(0,100,200),look=new THREE.Vector3(0,20,0);
  assert.equal(path.durationMs,20000);assert.equal(path.sweepMs,18500);assert.equal(path.wipe(4000),1);assert.equal(path.wipe(14000),1);
  path.sample(20000,position,target,chase,look);assert.deepEqual(position,chase);assert.deepEqual(target,look);assert.equal(path.fov(20000,60),60);
  assert.equal(path.streamingPosition(0).x,M19_DOWNTOWN.x);assert.equal(path.streamingPosition(5900),monster.position);assert.equal(path.streamingPosition(14000),player.position);
  const cameraPosition=new THREE.Vector3(),cameraTarget=new THREE.Vector3();
  path.sample(0,cameraPosition,cameraTarget,chase,look);assert(cameraPosition.y>1000,'opening is a wide aerial shot');assert.equal(cameraTarget.x,M19_DOWNTOWN.x);
  path.sample(4500,cameraPosition,cameraTarget,chase,look);const low=cameraPosition.y;
  path.sample(11500,cameraPosition,cameraTarget,chase,look);assert(cameraPosition.y>low+500,'boss reveal rises from body to face');
  const other=new CombatMissionIntroPath(monster,player,19);assert.equal(other.sweepMs,11000);assert.equal(other.wipe(5750),.5);
  assert.equal(journeyDallas25.bossHealth,500);assert.equal(journeyDallas25.timeLimitMs,360000);assert.equal(journeyDallas25.firstClearCredits,2550);assert.equal(journeyDallas25.startAirportId,'love');assert.equal(journeyDallas19.bossHealth,1500);
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  assert(main.includes('const arrivalIntro=journeyAttempt.missionId===journeyDallas25.id'));
  assert(main.includes('view.prepareStationaryIntro(obstacleBounds)'));
  assert(main.includes('stats.missingImmediateCells===0'));assert(main.includes('flightLaunchStartedAt=now-m19StoryOffsetMs-cut;elapsed=cut'));
  const countdown=main.slice(main.indexOf('function completeFlightLaunchCinematic'),main.indexOf('function abortFlightLaunchCinematic'));
  assert(countdown.includes('clearFlightLaunchPresentation()'));assert(countdown.includes('beginMissionStartCountdown()'));
  monster.children[0].geometry.dispose();monster.children[0].material.dispose();player.children[0].geometry.dispose();player.children[0].material.dispose();
});
