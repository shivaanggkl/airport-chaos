import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {createStationaryWarlordEncounter} from './stationary-warlord.js';
import {stepM19,disposeM19} from './m19-titan.js';
import * as rules from '../../shared/protocol.mjs';
import {journeyDallas25,journeyDallas20} from '../../shared/journey-mission.mjs';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {createStrikingWarlordEncounter} from './striking-warlord.js';
import {createHuntingWarlordEncounter} from './hunting-warlord.js';
import {createShowdownWarlordEncounter} from './showdown-warlord.js';
import {createPursuitWarlordEncounter} from './pursuit-warlord.js';
import {createFinalWarlordEncounter} from './final-warlord.js';
import * as missions from '../../shared/journey-mission.mjs';
const variants=[
 {mission:missions.journeyDallas25,create:createStationaryWarlordEncounter},
 {mission:missions.journeyDallas20,create:createStrikingWarlordEncounter},
 {mission:missions.journeyDallas21,create:createHuntingWarlordEncounter},
 {mission:missions.journeyDallas22,create:createShowdownWarlordEncounter},
 {mission:missions.journeyDallas23,create:createPursuitWarlordEncounter},
 {mission:missions.journeyDallas19,create:createFinalWarlordEncounter},
];
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8'),clientAst=ts.createSourceFile('main.ts',client,ts.ScriptTarget.Latest,true);
const functions=(tree,names)=>ts.transpileModule(tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(tree)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('M19–M24 reveal the shared combat aim, target feedback and firing controls on mission state updates',()=>{
 const declaration=clientAst.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(clientAst)==='journeyCombatMissionIds'));
 const declarationCode=ts.transpileModule(declaration.getText(clientAst),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const toggle=client.match(/flightGameRoot\.classList\.toggle\('noncombat-journey', !journeyCombatMissionIds\.has\(message\.attempt\.missionId\)\);/)[0];
 const classes=new Set(['noncombat-journey']);
 const ctx=vm.createContext({...missions,flightGameRoot:{classList:{toggle:(name,on)=>{if(on)classes.add(name);else classes.delete(name);}}}});
 vm.runInContext(declarationCode,ctx);
 for(const missionId of missions.journeyMissionOrder){
  ctx.message={attempt:{missionId}};
  vm.runInContext(toggle,ctx);
  assert.equal(classes.has('noncombat-journey'),missions.journeyMissionSlot(missionId)<=6,missionId);
 }
 const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
 assert.match(css,/#game-root\.noncombat-journey :is\(#acquisition-circle, #target-feedback, \[data-touch-control="fire"\], \[data-desktop-control="fire"\]\) \{ display: none !important; \}/);
});

function fixture(type='trainer',variant=variants[0]){
 const buildings=[],encounter=variant.create('attempt','pilot',0,()=>135,buildings);
 const gem=encounter.frame.limbs.gem;
 assert(gem);
 const owner={pilotId:'profile',cityId:'dallas',aircraftType:type,lifeState:'alive',lastStateAt:1000,position:{x:gem.x,y:gem.y,z:gem.z+2000},rotation:{x:0,y:0,z:0}};
 stepM19(encounter,owner.position,{x:0,y:0,z:0},18,1000);
 const attempt={missionId:variant.mission.id,status:'RACING',pausedAt:null,deadlineAt:100000,monsterHealth:variant.mission.bossHealth};
 const rotate=(p,r)=>new THREE.Vector3(p.x,p.y,p.z).applyEuler(new THREE.Euler(r.x,r.y,r.z,'YXZ'));
 const ctx=vm.createContext({...rules,...missions,aircraftPresentationMuzzleSockets,owner,attempt,
  playerJourneyAttempts:new Map([['pilot','attempt']]),monsterEncounters:new Map([['attempt',encounter]]),transportEncounters:new Map(),
  journeyStore:{get:()=>attempt},combatTransformFreshMs:500,runwayCombatProtected:()=>false,
  normalize:v=>new THREE.Vector3(v.x,v.y,v.z).normalize(),rotateLocalYxz:rotate,forwardDirection:t=>rotate({x:0,y:0,z:-1},t.rotation),dot:(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,
  closestLockTarget:()=>undefined,setServerLock:(_id,p,id)=>{p.lockedTargetId=id;},
 });
 vm.runInContext(functions(ast,['targetInAircraftSpace','muzzleTransform','monsterLockSolution','validMonsterLock','updateAssistedAim']),ctx);
 return {ctx,owner,attempt,encounter,buildings,close:()=>disposeM19(encounter)};
}
for(const variant of variants)for(const type of ['trainer','cargo','privateJet','fighter'])test(`${variant.mission.name} ${type}: lock uses real body geometry without dealing damage`,()=>{
 const f=fixture(type,variant);try{
  const before=f.encounter.engine.snapshot();
  for(let frame=0;frame<20;frame++)vm.runInContext("updateAssistedAim('pilot',owner,1000,0,0)",f.ctx);
  assert.equal(f.owner.lockedTargetId,'monster:attempt');assert(vm.runInContext("validMonsterLock('pilot',owner,1000)",f.ctx));
  assert.equal(f.encounter.engine.snapshot().health,before.health,'acquisition cannot damage the monster');
  const solution=f.ctx.monsterLockSolution('pilot',f.owner,1000);assert(solution);assert(solution.local.z<0);
  const origin=f.ctx.muzzleTransform(f.owner).position;
  // The hit surface itself is a valid endpoint within floating-point tolerance.
  const end={x:solution.position.x,y:solution.position.y,z:solution.position.z-5};
  assert(f.encounter.engine.hitTest(origin,end));
  const damage=f.encounter.engine.damage({encounterId:'attempt',source:'profile',sequence:1,from:origin,to:end,amount:25,radius:1,delta:0});
  assert.equal(damage,25,'confirmed acquired body is hittable through the existing damage path');
 }finally{f.close();}
});

for(const variant of variants)test(`${variant.mission.name} rejects invalid and unrelated mission locks`,()=>{
 for(const kind of ['blocked','range','behind','paused','expired','dead','stale','runway','otherMission','otherOwner','destroyed']){
  const f=fixture('trainer',variant);try{
   if(kind==='blocked')f.buildings.push({minX:f.owner.position.x-1000,maxX:f.owner.position.x+1000,minZ:f.owner.position.z-1100,maxZ:f.owner.position.z-900,top:10000});
   if(kind==='range')f.owner.position.z+=10000;
   if(kind==='behind')f.owner.rotation.y=Math.PI;
   if(kind==='paused')f.attempt.pausedAt=100;
   if(kind==='expired')f.attempt.deadlineAt=1000;
   if(kind==='dead')f.owner.lifeState='destroyed';
   if(kind==='stale')f.owner.lastStateAt=0;
   if(kind==='runway')f.ctx.runwayCombatProtected=()=>true;
   if(kind==='otherMission')f.attempt.missionId=missions.journeyDallas07.id;
   if(kind==='otherOwner')f.encounter.playerId='other';
   if(kind==='destroyed')f.attempt.monsterHealth=0;
   assert.equal(f.ctx.monsterLockSolution('pilot',f.owner,1000),undefined,kind);
  }finally{f.close();}
 }
});

for(const variant of variants)test(`${variant.mission.name} shared range widget shows acquisition, lock and distance`,()=>{
 const calls=[],ctx=vm.createContext({THREE,...missions,COMBAT_RANGE:rules.COMBAT_RANGE,
  journeyAttempt:{missionId:journeyDallas25.id,attemptId:'attempt',status:'RACING',monsterHealth:variant.mission.bossHealth},
  monsterView:{},monsterAimPosition:()=>new THREE.Vector3(0,0,-2000),airplane:new THREE.Group(),combatOffset:new THREE.Vector3(),combatInverseQuaternion:new THREE.Quaternion(),
  showTargetRangeFeedback:(...args)=>calls.push(args),targetRangeElement:{textContent:''}});
 vm.runInContext(functions(clientAst,['showMonsterRangeFeedback']),ctx);
 assert(vm.runInContext('showMonsterRangeFeedback()',ctx));assert.equal(calls.at(-1)[1],2000);assert.equal(calls.at(-1)[2],true);assert.equal(calls.at(-1)[3],false);assert.equal(ctx.targetRangeElement.textContent,'AIM AT MONSTER');
 assert(vm.runInContext('showMonsterRangeFeedback(true)',ctx));assert.equal(calls.at(-1)[3],true);
 ctx.monsterAimPosition=()=>new THREE.Vector3(0,0,-6000);
 assert(vm.runInContext('showMonsterRangeFeedback()',ctx));assert.equal(calls.at(-1)[1],6000);assert.equal(calls.at(-1)[2],false);
 ctx.journeyAttempt.missionId=missions.journeyDallas07.id;assert.equal(vm.runInContext('showMonsterRangeFeedback()',ctx),false);
});

for(const variant of variants)test(`${variant.mission.name} waits for a fresh server selection before LOCKED`,()=>{
 const start=client.indexOf('  const monsterTarget ='),end=client.indexOf('  if (targetId !== lockedTargetId)',start);
 const select=client.slice(start,end);
 for(const freshAim of [false,true])for(const confirmed of [false,true]){
  const ctx=vm.createContext({...missions,journeyAttempt:{missionId:variant.mission.id,status:'RACING',attemptId:'attempt',monsterHealth:variant.mission.bossHealth},monsterView:{},candidate:null,componentTarget:null,transportAimTarget:null,freshAim,serverAimTargetId:confirmed?'monster:attempt':null});
  vm.runInContext(select+'\nselected=monsterSelected;',ctx);assert.equal(ctx.selected,freshAim&&confirmed);
 }
});
