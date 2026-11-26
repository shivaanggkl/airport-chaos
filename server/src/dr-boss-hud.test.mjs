import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.ts';

const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
function findIf(root,condition){
 let result;
 function visit(node){if(ts.isIfStatement(node)&&node.expression.getText(ast)===condition)result=node;else ts.forEachChild(node,visit);}
 visit(root);assert(result,condition);return result.getText(ast);
}
const hud=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='updateJourneyHud');
const compile=code=>ts.transpileModule(`(function(){${code}})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const render=compile(findIf(hud,'breakoutMission'));
const state=compile(findIf(ast,"message.type === 'monsterState'"));

test('Dr. Boss health uses authoritative HP, including zero, and state updates keep mission instructions stable',()=>{
 for(const mission of [missions.journeyDallas23,missions.journeyDallas19]){
  const name={textContent:''},value={textContent:''},properties=new Map(),objective={textContent:''};
  const context=vm.createContext({...missions,missionJourneyDetails,breakoutMission:true,
   journeyAttempt:{attemptId:'current',missionId:mission.id,status:'RACING',monsterHealth:mission.bossHealth,targetHealth:mission.bossHealth},
   monsterBossHud:{querySelector:selector=>selector==='strong'?name:value,style:{setProperty:(key,val)=>properties.set(key,val)}},
   journeyHudObjective:objective,journeyHudProgress:{},journeyHudTarget:{},journeyHudTimer:{},
   setMissionInstructions:(element,text)=>{element.textContent=text;},monsterView:{setState(){}},missionObjective:undefined,
  });
  for(const health of [mission.bossHealth,mission.bossHealth-25,0]){
   context.journeyAttempt.monsterHealth=health;
   vm.runInContext(render,context);
   assert.equal(name.textContent,'Dr. BOSS');assert.equal(value.textContent,`${health} HP`);
   assert.equal(properties.get('--monster-health'),`${health/mission.bossHealth*100}%`);
   const expected=objective.textContent;
   for(const stage of ['WARNING','WINDUP','ACTIVE','RECOVERY',undefined]){
    context.message={type:'monsterState',attemptId:'current',titan:stage?{ability:{id:'hand-strike',stage}}:undefined};
    vm.runInContext(state,context);assert.equal(objective.textContent,expected,`${mission.id}/${stage}`);
    vm.runInContext(render,context);assert.equal(objective.textContent,expected);
   }
  }
  context.journeyAttempt.monsterHealth=null;context.journeyAttempt.targetHealth=125;
  vm.runInContext(render,context);assert.equal(value.textContent,'125 HP');
  context.message={type:'monsterState',attemptId:'old',titan:{ability:{id:'hand-strike',stage:'WARNING'}}};
  const before=objective.textContent;vm.runInContext(state,context);assert.equal(objective.textContent,before);
 }
});
