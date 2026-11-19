import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {AIM_ENVELOPE,AIM_SWITCH_MARGIN,COMBAT_RANGE,LOCK_ANGLE,aimTargetScore,insideDynamicLock,localFiringDirection} from '../../shared/protocol.mjs';
import {journeyDallasSharpshooter01,journeyDallasSharpshooter02,journeyDallasSharpshooter03,journeySharpshooterMission} from '../../shared/journey-mission.mjs';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const code=(name:string)=>compile(ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(ast));
function fixture(missionId:string){
 const targetId='bullseye:round:0',position=new THREE.Vector3(0,0,-9000),calls:unknown[][]=[];
 const root=new THREE.Group();root.position.copy(position);
 const context={THREE,journeySharpshooterMission,journeyAttempt:{missionId,status:'RACING',attemptId:'round'},
  sharpshooterViews:new Map([[0,{root}]]),airplane:new THREE.Group(),combatInverseQuaternion:new THREE.Quaternion(),
  combatOffset:new THREE.Vector3(),outOfRangeLocalOffset:new THREE.Vector3(),visualAim:{x:0,y:0},
  insideDynamicLock,COMBAT_RANGE,AIM_SWITCH_MARGIN,aimTargetScore,rangeFeedbackTargetId:null,
  showTargetRangeFeedback:(...args:unknown[])=>calls.push(args),serverAimTargetId:targetId};
 return {context,root,targetId,calls};
}
for(const mission of [journeyDallasSharpshooter01,journeyDallasSharpshooter02,journeyDallasSharpshooter03]){
 test(`${mission.name}: GET CLOSER uses the same range window and reticle checks as aircraft`,()=>{
  const {context,root,calls}=fixture(mission.id);
  assert.equal(vm.runInNewContext(code('showSharpshooterRangeFeedback')+'showSharpshooterRangeFeedback()',context),true);
  assert.equal(calls[0]![1],9000);assert.equal(calls[0]![2],false);assert.equal(calls[0]![3],false);
  for(const position of [new THREE.Vector3(0,0,-6000),new THREE.Vector3(0,0,-12001),new THREE.Vector3(0,0,9000),new THREE.Vector3(5000,0,-9000)]){
   root.position.copy(position);calls.length=0;
   assert.equal(vm.runInNewContext(code('showSharpshooterRangeFeedback')+'showSharpshooterRangeFeedback()',context),false);
   assert.equal(calls.length,0);
  }
 });
 test(`${mission.name}: lock highlighting requires fresh server selection and the same dynamic aim circle`,()=>{
  const start=source.indexOf('  if(bullseyeTarget){',source.indexOf('function updateCombatTarget(')),end=source.indexOf('\n  if(monsterSelected',start);
  const branch=compile('function render(){'+source.slice(start,end)+'}\nrender();');
  for(const [freshAim,serverLocked,offset,expected]of [[true,true,0,true],[false,true,0,false],[true,false,0,false],[true,true,1000,false]]as const){
   const {context,root,targetId,calls}=fixture(mission.id);root.position.set(offset,0,-5000);
   const classes=new Map<string,boolean>();
   const state={...context,freshAim,bullseyeTarget:targetId,serverLockedTargetId:serverLocked?targetId:null,selectedCombatTarget:null,combatLockState:'SEARCHING',
    acquisitionCircleElement:{classList:{toggle:(name:string,value:boolean)=>classes.set(name,value)}},clearCombatTarget(){}};
   vm.runInNewContext(branch,state);
   assert.equal(classes.get('locked'),expected);assert.equal(state.combatLockState,expected?'LOCKED':'SEARCHING');
   assert.equal(classes.get('target-near'),freshAim);assert.equal(calls[0]![3],expected);
  }
 });
 test(`${mission.name}: the locked circle and bullet ray use the actual bullseye center`,()=>{
  const {context,root,targetId}=fixture(mission.id);root.position.set(1,1,-100);
  const position=vm.runInNewContext(code('sharpshooterAimPosition')+'sharpshooterAimPosition()',context);
  assert.equal(position,root.position);
  const start=source.indexOf('  const bullseyePosition = sharpshooterAimPosition();'),end=source.indexOf('  if(introAim){',start);
  const getPosition=compile('function lockedPoint(){'+source.slice(start,end)+'return lockedPosition;}\nlockedPoint()');
  const selected=vm.runInNewContext(getPosition,{introAim:undefined,selectedCombatTarget:null,transportTarget:undefined,
   journeyAttempt:context.journeyAttempt,journeyDallas11:{id:'11'},journeyDallas12:{id:'12'},isMonsterJourneyMission:()=>false,
   combatLockState:'LOCKED',sharpshooterAimPosition:()=>position});
  assert.equal(selected,position);
  const origin=new THREE.Vector3(),direction=new THREE.Vector3();
  vm.runInNewContext(code('getCurrentFiringRay')+'getCurrentFiringRay(origin,direction,lockedPosition)',{
   origin,direction,lockedPosition:selected,getCurrentMuzzlePosition:(out:THREE.Vector3)=>out.set(0,0,0),
   airplane:context.airplane,muzzleQuaternion:new THREE.Quaternion(),localFiringDirection,soloExploreMode:false,visualAim:{x:0,y:0},
   transportReticleDirection:new THREE.Vector3(),combatForward:new THREE.Vector3(0,0,-1),LOCK_ANGLE,AIM_ENVELOPE,
  });
  assert.ok(direction.distanceTo(position.clone().normalize())<1e-10);
  root.userData.pendingHit=true;
  assert.equal(vm.runInNewContext(code('sharpshooterAimPosition')+'sharpshooterAimPosition()',context),undefined);
  root.userData.pendingHit=false;context.serverAimTargetId=targetId.replace('round','another-round');
  assert.equal(vm.runInNewContext(code('sharpshooterAimPosition')+'sharpshooterAimPosition()',context),undefined);
 });
}
