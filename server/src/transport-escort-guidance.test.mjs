import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {transportLockParts} from '../../shared/giant-incoming.mjs';
import * as missions from '../../shared/journey-mission.mjs';

const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const declaration=name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast);
const focus=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='unrelatedFocusedBot')).getText(ast);
const code=ts.transpileModule(['transportMissionHasLiveTarget','transportEscortInactive','syncTransportEscortObjective'].map(declaration).join('\n')+'\n'+focus,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(missionId=missions.journeyDallas09.id){
 const calls=[];
 const make=(playerId,type,x)=>({playerId,aircraftType:type,cityId:'dallas',isBot:true,lifeState:'alive',health:100,timeSinceUpdate:0,
  plane:{position:new THREE.Vector3(x,1500,-2000),userData:{}}});
 const remotes=[make('first','trainer',500),make('second','cargo',1000),make('third','privateJet',1500),make('fourth','cargo',2000)];
 const ctx=vm.createContext({...missions,transportLockParts,missionFocus:{showAmbientAIAircraft:false},focusedBotsAreSafe:()=>true,
  journeyAttempt:{missionId,attemptId:'attempt',status:'RACING',monsterHealth:0,fortressLeftHealth:0,fortressRightHealth:0,
   targetId:'first',secondaryTargetId:'second',rearGuardThirdId:'third',rearGuardFourthId:'fourth',rearGuardKills:3},
  missionObjective:{id:'attempt:transport',label:'TRANSPORT',position:new THREE.Vector3(9000,1500,9000)},
  selectedCombatTarget:null,remotePlayers:new Map(remotes.map(r=>[r.playerId,r])),remoteStateStaleSeconds:1.5,
  airplane:{position:new THREE.Vector3()},cityId:'dallas',aircraftDisplayName:type=>({trainer:'Bluejay',cargo:'Mammoth',privateJet:'Nightowl',fighter:'Firehawk'})[type],
  missionObjectiveGuidance:{setObjective:target=>calls.push(target)}});
 vm.runInContext(code,ctx);
 return {ctx,remotes,calls,sync(){vm.runInContext('syncTransportEscortObjective()',ctx);return ctx.missionObjective;}};
}

test('M15 switches the destroyed transport guidance to the surviving third Nightowl at its real position',()=>{
 const f=fixture();f.ctx.journeyAttempt.rearGuardFourthId=null;
 const target=f.sync();assert.equal(target.id,'attempt:third');assert.equal(target.label,'ESCORT · NIGHTOWL');
 assert.equal(target.position,f.remotes[2].plane.position);assert.notEqual(target.onscreenMarker,false);
 assert.equal(vm.runInContext("unrelatedFocusedBot('third')",f.ctx),false,'an assigned third escort stays visible even before its cosmetic tag arrives');
 assert.equal(vm.runInContext("unrelatedFocusedBot('ambient')",f.ctx),true);
 assert.equal(f.calls.length,1);f.sync();assert.equal(f.calls.length,1,'unchanged guidance is not rebuilt every frame');
});

test('guidance follows the fourth escort after the third is destroyed and clears when none remain',()=>{
 const f=fixture(missions.journeyDallas10.id);
 assert.equal(f.sync().id,'attempt:third');
 f.ctx.journeyAttempt.rearGuardKills=7;
 assert.equal(f.sync().id,'attempt:fourth');
 assert.equal(vm.runInContext("unrelatedFocusedBot('fourth')",f.ctx),false);
 f.ctx.journeyAttempt.rearGuardKills=15;assert.equal(f.sync(),null);
});

test('a selected live escort wins; stale, dead and wrong-city contacts cannot become objectives',()=>{
 const f=fixture();f.ctx.selectedCombatTarget={remote:f.remotes[3]};assert.equal(f.sync().id,'attempt:fourth');
 f.remotes[3].health=0;assert.equal(f.sync().id,'attempt:third');
 f.remotes[2].timeSinceUpdate=2;assert.equal(f.sync(),null);
 f.remotes[2].timeSinceUpdate=0;f.remotes[2].cityId='milwaukee';assert.equal(f.sync(),null);
});

test('guidance preserves living giant targets, remaining armored wings and unrelated mission objectives',()=>{
 for(const [missionId,extra] of [[missions.journeyDallas08.id,{monsterHealth:1}],
  [missions.journeyDallas12.id,{fortressLeftHealth:250}],
  [missions.journeyDallas13.id,{}]]){
  const f=fixture(missionId);Object.assign(f.ctx.journeyAttempt,extra);
  const before=f.ctx.missionObjective;assert.equal(f.sync(),before);assert.equal(f.calls.length,0);
 }
});

test('new state packets cannot restore a dead transport objective; render loop refreshes escort guidance',()=>{
 assert.match(source,/view\?\.setState\(message,[\s\S]*?\);\s*if \(!transportMissionHasLiveTarget\(journeyAttempt\)\) \{ syncTransportEscortObjective\(\);return; \}/);
 assert.match(source,/missionObjective = transportMissionHasLiveTarget\(message.attempt\) && transportView\?\.hasState/);
 assert.match(source,/syncLegendaryObjective\(\);\s*syncTransportEscortObjective\(\);/);
});


test('M18 keeps both live escorts on radar after the giant is destroyed and removes each defeated escort',()=>{
 const f=fixture(missions.journeyDallas12.id);
 f.ctx.journeyAttempt.rearGuardKills=0;
 f.ctx.journeyAttempt.rearGuardThirdId=null;f.ctx.journeyAttempt.rearGuardFourthId=null;
 for(const r of f.remotes)r.plane.userData.rearGuardEscort=true;
 const markers=[];
 let radarEscorts;
 function find(node){
  if(ts.isIfStatement(node)&&node.expression.getText(ast).includes('journeyDallas08.id')&&node.thenStatement.getText(ast).includes("'mission', 'ESCORT'"))radarEscorts=node.getText(ast);
  ts.forEachChild(node,find);
 }
 find(ast);assert(radarEscorts);
 f.ctx.drawRadarMarker=(_direction,x,z,kind,label)=>markers.push({x,z,kind,label});f.ctx.direction=new THREE.Vector3(0,0,-1);
 // Only assigned escorts are present; ordinary AI radar range/visibility is irrelevant.
 f.ctx.remotePlayers=new Map(f.remotes.slice(0,2).map(r=>[r.playerId,r]));
 const run=()=>{markers.length=0;vm.runInContext(ts.transpileModule(radarEscorts,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,f.ctx);return markers.length;};
 assert.equal(run(),2);
 f.ctx.journeyAttempt.rearGuardKills=1;assert.equal(run(),1);assert.equal(markers[0].x,f.remotes[1].plane.position.x);
 f.ctx.journeyAttempt.rearGuardKills=3;assert.equal(run(),0);
});
