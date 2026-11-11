import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import { aircraftPresentationMuzzleSockets } from '../../shared/aircraft-presentation-scale.mjs';
import { segmentBlockedByBuildings } from './monster-arrival.js';
import { journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13 } from '../../shared/journey-mission.mjs';
import { transportPose, transportLockParts } from '../../shared/giant-incoming.mjs';
import { AIM_ENVELOPE, COMBAT_RANGE, aimGoal, biasAim, stepAim, insideDynamicLock, ballisticShotSpeed, projectileDamageForAircraft, fireIntervalMs, aimTargetScore, AIM_SWITCH_MARGIN } from '../../shared/protocol.mjs';
import { transportFortressAimTarget, transportFortressTarget, transportFortressImpact, transportImpact } from './giant-incoming.js';

const server = readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const client = readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const view = readFileSync(new URL('../../client/src/giant-incoming.ts',import.meta.url),'utf8');
const normalize = (v:THREE.Vector3Like) => new THREE.Vector3(v.x,v.y,v.z).normalize();
const rotateLocalYxz = (v:THREE.Vector3Like,r:THREE.Vector3Like) => new THREE.Vector3(v.x,v.y,v.z).applyEuler(new THREE.Euler(r.x,r.y,r.z,'YXZ'));
function fixture(missionId: string=journeyDallas11.id) {
  let now=1000;
  const encounter={attemptId:'owned',playerId:'pilot',missionId,startedAt:0,durationMs:180000,altitude:1700,fortressGunsEnabled:true,gunYaw:0,gunPitch:0,hitSequence:0};
  const attempt={missionId,status:'RACING',pausedAt:null,deadlineAt:180000,fortressLeftHealth:250,fortressRightHealth:250,monsterHealth:1500};
  const pose=transportPose(now,1700,180000,missionId);
  const position=new THREE.Vector3(pose.x+Math.sin(pose.yaw)*3000,pose.y+300,pose.z+Math.cos(pose.yaw)*3000);
  const owner:any={pilotId:'profile',aircraftType:'trainer',cityId:'dallas',lifeState:'alive',lastStateAt:now,position,rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}};
  let locked:string|undefined;
  const packets:any[]=[];
  const reinforcementChecks:any[]=[];
  const store={get:()=>attempt,activeSnapshot:()=>attempt,hitFortressComponent:(_pilot:string,_attempt:string,part:'body'|'left'|'right'|'core',_now:number,damage:number)=>{
    const key=part==='left'?'fortressLeftHealth':part==='right'?'fortressRightHealth':'monsterHealth';
    attempt[key]=Math.max(0,attempt[key]-damage);return {...attempt};
  },hitTransport:(_pilot:string,_attempt:string,_now:number,damage:number)=>{attempt.monsterHealth=Math.max(0,attempt.monsterHealth-damage);return {...attempt};}};
  const context=vm.createContext({Math,Number,Date:{now:()=>now},randomUUID,projectileDamageForAircraft,
    beginReinforcementWave:(attempt:unknown)=>reinforcementChecks.push(attempt),players:new Map([['pilot',owner]]),sendToPlayer:(_id:string,packet:any)=>packets.push(packet),sendJourneyState:()=>{},
    canFire:(p:any,at:number)=>at-(p.lastFireAt??-Infinity)>=fireIntervalMs(p.aircraftType),COMBAT_RANGE,AIM_ENVELOPE,AIM_SWITCH_MARGIN,aimTargetScore,journeyDallas07,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas11,journeyDallas12,
    playerJourneyAttempts:new Map([['pilot','owned']]),transportEncounters:new Map([['owned',encounter]]),journeyStore:store,
    combatTransformFreshMs:500,transportPose,transportLockParts,transportFortressAimTarget,transportFortressTarget,transportFortressImpact,transportImpact,
    aircraftPresentationMuzzleSockets,normalize,transportBuildings:[],segmentBlockedByBuildings,dallasTerrain:{elevationAt:()=>0},biasAim,aimGoal,stepAim,insideDynamicLock,ballisticShotSpeed,
    rotateLocalYxz,forwardDirection:(t:any)=>rotateLocalYxz({x:0,y:0,z:-1},t.rotation).normalize(),
    dot:(a:any,b:any)=>a.x*b.x+a.y*b.y+a.z*b.z,closestLockTarget:()=>undefined,validDynamicTarget:()=>undefined,
    setServerLock:(_id:string,p:any,id:string)=>{locked=id;p.lockedTargetId=id;},owner});
  const muzzle=server.slice(server.indexOf('function muzzleTransform('),server.indexOf('function combatLineBlocked('));
  vm.runInContext(ts.transpileModule(muzzle,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const start=server.indexOf('function targetInAircraftSpace('),end=server.indexOf('function validDynamicTarget(',start);
  vm.runInContext(ts.transpileModule(server.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  for(const [start,end] of [['function assistedTracerSpeed(','function applyEventAircraftHit('],['function applyTransportHit(','function updateTransportEncounters(']]) {
    vm.runInContext(ts.transpileModule(server.slice(server.indexOf(start!),server.indexOf(end!)),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  }
  return {owner,encounter,attempt,context,packets,reinforcementChecks,get locked(){return locked;},
    point:(part:'body'|'left'|'right'|'core')=>transportFortressTarget(transportPose(now,1700,180000,missionId),part),
    aimAt(part:'body'|'left'|'right'|'core'){
      const offset=new THREE.Vector3().copy(this.point(part)).sub(owner.position);
      owner.rotation.y=Math.atan2(-offset.x,-offset.z);
      owner.rotation.x=Math.atan2(offset.y,Math.hypot(offset.x,offset.z));
    },
    step(){
      const before=transportPose(now,1700,180000,missionId);now+=100;
      const after=transportPose(now,1700,180000,missionId);
      owner.position.x+=after.x-before.x;owner.position.z+=after.z-before.z;
      owner.lastStateAt=now;context.now=now;vm.runInContext("updateAssistedAim('pilot',owner,now,0,0)",context);},
    fire(targetId=locked,aim=owner.assistedAim){context.targetId=targetId;context.shotAim=aim;return vm.runInContext("createAssistedShot('pilot',owner,targetId,'shot',undefined,shotAim)",context);},
    valid(){context.now=now;return vm.runInContext("validFortressLock('pilot',owner,now)",context);}};
}

test('M17 independently locks each living wing and engine using full pitch/yaw and genuine mesh visibility',()=>{
  for(const part of ['left','right','core'] as const){
    const f=fixture();
    for(let i=0;i<15;i++){f.aimAt(part);f.step();}
    assert.equal(f.locked,`transport:owned:${part}`);
    assert.equal(f.valid(),true);
    assert.ok(Number.isFinite(f.owner.assistedAim.x));
    assert.ok(Number.isFinite(f.owner.assistedAim.y));
  }
});

test('M17 switches components with aim; destroyed parts cannot retain a lock',()=>{
  const f=fixture();
  for(const part of ['left','right','core'] as const){
    for(let i=0;i<15;i++){f.aimAt(part);f.step();}
    assert.equal(f.locked,`transport:owned:${part}`);
  }
  f.attempt.monsterHealth=0;
  assert.equal(f.valid(),false);
  f.step();
  assert.notEqual(f.locked,'transport:owned:core');
  f.attempt.fortressLeftHealth=f.attempt.fortressRightHealth=0;
  f.step();assert.equal(f.locked,undefined);
});

test('M17 lock rejects wrong owner, other mission/city, stale transforms, pause, timeout, defeat, range and aim-away',()=>{
  const cases=[
    (f:ReturnType<typeof fixture>)=>{f.encounter.playerId='other';},
    (f:ReturnType<typeof fixture>)=>{f.encounter.missionId=journeyDallas13.id;},
    (f:ReturnType<typeof fixture>)=>{f.owner.cityId='milwaukee';},
    (f:ReturnType<typeof fixture>)=>{f.owner.lastStateAt=-10000;},
    (f:ReturnType<typeof fixture>)=>{(f.attempt as any).pausedAt=1000;},
    (f:ReturnType<typeof fixture>)=>{f.attempt.deadlineAt=0;},
    (f:ReturnType<typeof fixture>)=>{f.attempt.status='COMPLETED';},
    (f:ReturnType<typeof fixture>)=>{f.owner.lifeState='destroyed';},
    (f:ReturnType<typeof fixture>)=>{f.owner.position.z+=COMBAT_RANGE*2;},
    (f:ReturnType<typeof fixture>)=>{f.owner.rotation.y+=Math.PI;},
  ];
  for(const invalidate of cases){
    const f=fixture();for(let i=0;i<15;i++){f.aimAt('left');f.step();}
    assert.equal(f.valid(),true);invalidate(f);assert.equal(f.valid(),false);
  }
});

test('component selection respects range, vertical aim and living health at the real scaled mesh points',()=>{
  const pose=transportPose(1000,1700,180000,journeyDallas11.id),origin={x:pose.x,y:pose.y+3000,z:pose.z};
  for(const part of ['left','right','core'] as const){
    const target=transportFortressTarget(pose,part),direction=normalize({x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z});
    const health={left:250,right:250,core:1500};
    assert.equal(transportFortressAimTarget(pose,origin,direction,health)?.component,part);
    health[part]=0;assert.notEqual(transportFortressAimTarget(pose,origin,direction,health)?.component,part);
  }
  assert.equal(transportFortressAimTarget(pose,origin,{x:0,y:1,z:0},{left:250,right:250,core:1500}),undefined);
  assert.equal(transportFortressAimTarget(pose,{...origin,y:pose.y+COMBAT_RANGE+1000},{x:0,y:-1,z:0},{left:250,right:250,core:1500}),undefined);
});

test('client presents server-selected component locks and fires the identical validated aim sample',()=>{
  assert.match(client,/componentTarget && !candidate && transportView/);
  assert.match(client,/selectedCombatTarget\?\.locked \? selectedCombatTarget.remote.playerId : componentLock \? serverLockedTargetId/);
  assert.match(server,/targetId.startsWith\('transport:'\)\) return createFortressAssistedShot/);
  assert.match(client,/const locked = serverLockedTargetId === componentTarget/);
  assert.match(client,/combatAimBlend\(previousAimReceivedAt, serverAimReceivedAt, performance.now\(\),\s*freshAim && serverAimTargetId !== null && serverAimTargetId === serverLockedTargetId\)/);
  assert.match(client,/side==='core'\?'ENGINE':`\$\{side.toUpperCase\(\)\} WING`/);
  assert.match(client,/aimSample: visualAimToId \? combatShotAimSample\(visualAimFromId, visualAimToId, visualAimBlend\)/);
  assert.match(view,/if\(orientation\)forward.applyQuaternion\(orientation\)/);
  assert.match(client,/transportView.fortressComponentPosition\(side,transportView.fortressTargetPosition\)/);
  assert.match(view,/if\(part===authoritativeSide\)\{side=part;break;\}/);
  // Component locking never substitutes a client target ID for server mesh collision.
  assert.match(server,/transportFortressImpact\(/);
  assert.doesNotMatch(server.slice(server.indexOf('function updateAssistedAim('),server.indexOf('function validDynamicTarget(')),/hitFortressComponent/);
});


test('locked M17 shots reach each authored component and reduce only its health through the existing damage path',()=>{
  for(const part of ['left','right','core'] as const){
    const f=fixture();for(let i=0;i<15;i++){f.aimAt(part);f.step();}
    assert.equal(f.locked,`transport:owned:${part}`);
    assert.equal(f.fire(),true);
    assert.equal(f.attempt.fortressLeftHealth,part==='left'?225:250);
    assert.equal(f.attempt.fortressRightHealth,part==='right'?225:250);
    assert.equal(f.attempt.monsterHealth,part==='core'?1475:1500);
    assert.equal(f.packets.length,1);
    assert.equal(f.packets[0].type,'assistedShot');
    assert.equal(f.packets[0].targetId,`transport:owned:${part}`);
    assert.equal(f.encounter.hitSequence,1);
    assert.equal(f.fire(),false,'cooldown prevents repeated damage');
  }
});

test('M17 assisted fire rejects forged targets, invalid shot aim, blocked geometry and expired locks',()=>{
  const f=fixture();for(let i=0;i<15;i++){f.aimAt('left');f.step();}
  assert.equal(f.fire('transport:other:left'),false);
  assert.equal(f.fire('transport:owned:right'),false);
  assert.equal(f.fire(f.locked,{x:1,y:1}),false);
  f.context.transportBuildings=[{minX:-1e6,maxX:1e6,minZ:-1e6,maxZ:1e6,top:10000}];
  assert.equal(f.valid(),false);assert.equal(f.fire(),false);
  f.context.transportBuildings=[];
  f.attempt.deadlineAt=0;assert.equal(f.fire(),false);
  assert.equal(f.attempt.fortressLeftHealth,250);
  assert.equal(f.packets.length,0);
});


test('M17 tracer leads the rendered component without changing target geometry or curving per frame',()=>{
  const method=view.slice(view.indexOf('    fortressComponentPosition('),view.indexOf('    setState('));
  const ctx=vm.createContext({THREE,journeyDallas11});
  vm.runInContext(ts.transpileModule(`class ComponentView {${method}};globalThis.ComponentView=ComponentView`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  const instance=new ctx.ComponentView();
  instance.root=new THREE.Group();instance.root.scale.setScalar(32);instance.root.rotation.y=.7;
  instance.root.position.set(500,1700,-800);
  instance.state={pose:{velocity:{x:350,y:0,z:120}}};
  for(const side of ['body','left','right','core'] as const){
    const now=instance.fortressComponentPosition(side,new THREE.Vector3());
    const impact=instance.fortressComponentPosition(side,new THREE.Vector3(),.35);
    assert.ok(Math.abs(impact.x-now.x-350*.35)<1e-8);
    assert.ok(Math.abs(impact.z-now.z-120*.35)<1e-8);
    assert.equal(impact.y,now.y);
  }
});


for(const mission of [journeyDallas07,journeyDallas08,journeyDallas09,journeyDallas10]) {
  test(`${mission.name}: body locks and assisted shots damage the giant without altering wing health`,()=>{
    const f=fixture(mission.id);
    for(let i=0;i<15;i++){f.aimAt('body');f.step();}
    assert.equal(f.locked,'transport:owned:body');assert.equal(f.valid(),true);
    assert.equal(f.fire(),true);
    assert.equal(f.attempt.monsterHealth,1475);
    assert.equal(f.attempt.fortressLeftHealth,250);assert.equal(f.attempt.fortressRightHealth,250);
    assert.equal(f.packets[0].targetId,'transport:owned:body');
    assert.equal(f.reinforcementChecks.length,mission===journeyDallas09?1:0);
    assert.equal(f.fire(),false);
    f.attempt.monsterHealth=0;assert.equal(f.valid(),false);f.step();assert.equal(f.locked,undefined);
  });
}

test('M18 independently locks and hits both wings and engine while escorts remain active',()=>{
  for(const side of ['left','right','core'] as const){
    const f=fixture(journeyDallas12.id);
    for(let i=0;i<15;i++){f.aimAt(side);f.step();}
    assert.equal(f.locked,`transport:owned:${side}`);assert.equal(f.fire(),true);
    assert.equal(f.attempt.fortressLeftHealth,side==='left'?225:250);
    assert.equal(f.attempt.fortressRightHealth,side==='right'?225:250);
    assert.equal(f.attempt.monsterHealth,side==='core'?1475:1500);
  }
});

test('transport lock IDs are limited to each mission target set and never depend on duration',()=>{
  for(const mission of [journeyDallas07,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas11,journeyDallas12]){
    const f=fixture(mission.id),fortress=mission===journeyDallas11||mission===journeyDallas12;
    assert.deepEqual(transportLockParts(mission.id),fortress?['left','right','core']:['body']);
    f.encounter.durationMs=240000; // Equal or different timers cannot change target eligibility.
    for(let i=0;i<15;i++){f.aimAt(fortress?'left':'body');f.step();}
    assert.equal(f.locked,fortress?'transport:owned:left':'transport:owned:body');
    assert.equal(f.fire(fortress?'transport:owned:body':'transport:owned:core'),false);
    f.attempt.deadlineAt=0;assert.equal(f.fire(),false);
  }
  assert.deepEqual(transportLockParts(journeyDallas13.id),[]);
});

test('escort and giant compete by aim alignment; destroying the giant leaves escort targeting available',()=>{
  for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12]){
    const f=fixture(mission.id),side=mission===journeyDallas12?'left':'body';
    const escort={position:new THREE.Vector3()};
    f.context.escort=escort;
    vm.runInContext("closestLockTarget=()=>['escort',escort];validDynamicTarget=()=>escort",f.context);
    for(let i=0;i<15;i++){
      f.aimAt(side);
      const direction=rotateLocalYxz({x:0,y:0,z:-1},f.owner.rotation);
      escort.position.copy(f.owner.position).addScaledVector(direction,3000).add(new THREE.Vector3(500,0,0));
      f.step();
    }
    assert.equal(f.locked,`transport:owned:${side}`,'aimed giant must win over a nearby escort');
    for(let i=0;i<15;i++){
      f.owner.rotation.y+=.04;
      escort.position.copy(f.owner.position).addScaledVector(rotateLocalYxz({x:0,y:0,z:-1},f.owner.rotation),1500);
      f.step();
    }
    assert.equal(f.locked,'escort','aimed escort must win over the giant');
    f.attempt.monsterHealth=0;f.attempt.fortressLeftHealth=0;f.attempt.fortressRightHealth=0;
    f.step();assert.equal(f.locked,'escort');
  }
});

test('an aimed giant outside weapon range shows GET CLOSER feedback without granting a lock',()=>{
  const feedback:any[]=[];
  const context=vm.createContext({
    journeyAttempt:{status:'RACING',missionId:journeyDallas07.id,attemptId:'range-test',monsterHealth:2000},
    transportLockParts,COMBAT_RANGE,insideDynamicLock,visualAim:{x:0,y:0},
    airplane:{position:new THREE.Vector3(),rotation:{y:0},quaternion:new THREE.Quaternion()},
    combatOffset:new THREE.Vector3(),combatInverseQuaternion:new THREE.Quaternion(),
    transportView:{hasState:true,fortressTargetPosition:new THREE.Vector3(0,0,-(COMBAT_RANGE+1000)),fortressComponentPosition:()=>{}},
    showTargetRangeFeedback:(...args:unknown[])=>feedback.push(args),
  });
  const code=client.slice(client.indexOf('function showTransportRangeFeedback('),client.indexOf('function validateServerLock('));
  vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.equal(vm.runInContext('showTransportRangeFeedback()',context),true);
  assert.equal(feedback[0][0].displayName,'GIANT PLANE');assert.equal(feedback[0][1],COMBAT_RANGE+1000);
  assert.equal(feedback[0][2],false);assert.equal(feedback[0][3],false);
  context.transportView.fortressTargetPosition.set(0,0,-4000);
  assert.equal(vm.runInContext('showTransportRangeFeedback()',context),false,'in-range acquisition stays server-owned');
  context.transportView.fortressTargetPosition.set(0,0,6000);
  assert.equal(vm.runInContext('showTransportRangeFeedback()',context),false,'behind-camera targets do not show a false cue');
  context.journeyAttempt.status='FAILED';
  assert.equal(vm.runInContext('showTransportRangeFeedback()',context),false);
  assert.match(client,/if \(candidate \|\| !showMonsterRangeFeedback\(\) && !showTransportRangeFeedback\(\)\) showTargetRangeFeedback/);
});


test('a fresh validated fire pose can hit when the previous movement packet is just outside range',()=>{
  for(const mission of [journeyDallas07,journeyDallas11,journeyDallas12]){
    const f=fixture(mission.id),side=mission===journeyDallas07?'body':'left';
    for(let i=0;i<15;i++){f.aimAt(side);f.step();}
    const target=f.point(side),direction=new THREE.Vector3().copy(target).sub(f.owner.position).normalize();
    f.owner.position.copy(target).addScaledVector(direction,-(COMBAT_RANGE+20));
    f.aimAt(side);
    f.owner.velocity={x:direction.x*1000,y:direction.y*1000,z:direction.z*1000};
    const fireTransform={...f.owner,position:f.owner.position.clone().addScaledVector(direction,80)};
    assert.equal(f.valid(),false,'old movement pose is outside range');
    f.context.fireTransform=fireTransform;f.context.targetId=f.locked;f.context.shotAim=f.owner.assistedAim;
    assert.equal(vm.runInContext("createAssistedShot('pilot',owner,targetId,'fresh-fire',fireTransform,shotAim)",f.context),true);
    assert.equal(side==='body'?f.attempt.monsterHealth:f.attempt.fortressLeftHealth,side==='body'?1475:225);
  }
});
