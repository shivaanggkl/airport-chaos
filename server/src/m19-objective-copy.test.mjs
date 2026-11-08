import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
import {journeyDallas25,journeyMissionSlot} from '../../shared/journey-mission.mjs';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const statements=[];
function visit(node){
 if(ts.isIfStatement(node)){
  const text=node.getText(ast);
  if(text.startsWith('if (journeyHudObjective) journeyHudObjective.textContent = journeyAttempt.missionId===journeyDallas25.id') ||
    text.startsWith('if(journeyAttempt.missionId===journeyDallas25.id&&journeyHudObjective)'))statements.push(text);
 }
 ts.forEachChild(node,visit);
}
visit(ast);
test('M19 gameplay and monster-state updates retain the exact Journey objective',()=>{
 const expected=missionJourneyDetails.find(m=>m.id===journeyDallas25.id).description;
 assert.equal(journeyMissionSlot(journeyDallas25.id),19);assert.equal(statements.length,2);
 assert(source.includes('const m19MissionObjective = missionJourneyDetails.find(mission => mission.id === journeyDallas25.id)!.description;'));
 for(const status of ['APPROACH','RACING'])for(const stage of [undefined,'WARNING','WINDUP'])for(const statement of statements){
  const element={textContent:''};const ctx=vm.createContext({journeyDallas25,m19MissionObjective:expected,journeyHudObjective:element,journeyAttempt:{missionId:journeyDallas25.id,status},message:{titan:stage?{ability:{stage,id:'hand-strike'}}:undefined}});
  vm.runInContext(ts.transpileModule(statement,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  assert.equal(element.textContent,expected,`${status}/${stage}`);
 }
});
