import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
import ts from 'typescript';
import {journeyDallas16,journeyDallasTwinHunters01,journeyDallas17,journeyMissionSlot} from '../../shared/journey-mission.mjs';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
let branch;
function find(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='definition.id === journeyDallas16.id')branch=n;ts.forEachChild(n,find);}
find(ast);assert(branch);
const code=ts.transpileModule(branch.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('displayed M17 keeps its objective and named health rows while hiding duplicate status and distance',()=>{
 assert.equal(journeyMissionSlot(journeyDallas16.id),17);
 for(const definition of [journeyDallas16,journeyDallasTwinHunters01,journeyDallas17]){
  const node=()=>({hidden:false,textContent:'Existing mission copy'});
  const ctx=vm.createContext({definition,journeyDallas16,journeyHudObjective:node(),journeyHudProgress:node(),journeyHudTarget:node(),journeyHudTimer:node(),journeyHudHint:node(),journeyHudEnemy:node(),escortHealthHud:node(),journeyHudHeaderTimer:node()});
  vm.runInContext(code,ctx);
  const m17=definition.id===journeyDallas16.id;
  for(const key of ['journeyHudProgress','journeyHudTarget','journeyHudTimer','journeyHudHint','journeyHudEnemy'])assert.equal(ctx[key].hidden,m17,`${definition.id}: ${key}`);
  assert.equal(ctx.escortHealthHud.hidden,false,'existing named health rows remain visible');
  assert.equal(ctx.journeyHudHeaderTimer.hidden,false,'mission deadline stays visible');
  assert.equal(ctx.journeyHudObjective.textContent,'Existing mission copy');
 }
});

test('M17 Journey, screenplay and gameplay use the same objective',()=>{
 assert.equal(missionJourneyDetails.find(mission=>mission.id===journeyDallas16.id).description,'SHOOT down both enemy planes before TIME runs out');
 assert.ok(source.includes('missionCombatIntroPath.missionNumber === 10 ? `<span>${missionJourneyDetails.find(mission => mission.id === journeyDallas16.id)!.description}</span>`'));
 assert.ok(source.includes('journeyHudObjective.textContent=missionJourneyDetails.find(mission=>mission.id===definition.id)!.description'));
});
