import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import {journeyMissionOrder} from '../../shared/journey-mission.mjs';
import {journeyCategorySlot} from '../../shared/journey-categories.mjs';
import {missionJourneyStages,journeyCompletionSummary} from '../../client/src/mission-journey-model.js';
const source = readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
const ast = ts.createSourceFile('bootstrap.ts',source,ts.ScriptTarget.Latest,true);
const functions = ['missionProgress','refreshJourneyProgress'].map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join('\n');
const code = ts.transpileModule('let journeyProgressRevision=0;let journeyProgressOwner;'+functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture() {
  let progress = {};
  const ctx = vm.createContext({
    garageIdentity:{pilotId:'pilot-a'}, journeyMissionOrder,journeyCategorySlot,missionJourneyStages, apiUrl:path=>path,
    apiFetch:async()=>({ok:true,json:async()=>({completed:true})}),
    hubAccount:{state:'account'}, refreshHubPilotData:async()=>{},
    missionJourney:{setProgress:value=>{progress=value;},setSignInRequired(){}},
  });
  vm.runInContext(code,ctx);
  return {ctx,refresh:()=>ctx.refreshJourneyProgress(),count:()=>journeyCompletionSummary(progress).completed};
}
test('server progress populates all mission kinds and temporary failures retain the last confirmed count',async()=>{
  const f=fixture();
  f.ctx.apiFetch=async()=>({ok:true,json:async()=>({completed:true,missionCoinHunt01:{completed:true},mission23:{completed:true},missionAceIntercept01:{completed:true}})});
  await f.refresh(); assert.equal(f.count(),4);
  f.ctx.apiFetch=async()=>{throw Error('offline');}; await f.refresh(); assert.equal(f.count(),4);
  f.ctx.apiFetch=async()=>({ok:false,status:503}); await f.refresh(); assert.equal(f.count(),4);
  f.ctx.apiFetch=async()=>({ok:false,status:401}); await f.refresh(); assert.equal(f.count(),0);
});
test('a late response cannot overwrite newer server progress',async()=>{
  const f=fixture(); let resolve;
  f.ctx.apiFetch=()=>new Promise(done=>{resolve=done;}); const old=f.refresh();
  f.ctx.apiFetch=async()=>({ok:true,json:async()=>({completed:true,mission03:{completed:true}})});
  await f.refresh(); assert.equal(f.count(),2);
  resolve({ok:true,json:async()=>({completed:true})}); await old;
  assert.equal(f.count(),2);
});
test('switching pilots clears the previous count and ignores that pilot’s outstanding response',async()=>{
  const f=fixture(); await f.refresh(); assert.equal(f.count(),1);
  let resolve; f.ctx.apiFetch=()=>new Promise(done=>{resolve=done;}); const old=f.refresh();
  f.ctx.garageIdentity.pilotId='pilot-b';
  f.ctx.apiFetch=async()=>({ok:true,json:async()=>({completed:false})});
  await f.refresh(); assert.equal(f.count(),0);
  resolve({ok:true,json:async()=>({completed:true,mission03:{completed:true}})});await old;
  assert.equal(f.count(),0);
});


test('chapter bonuses load their own server progress and count independently',async()=>{
 const f=fixture();f.ctx.apiFetch=async()=>({ok:true,json:async()=>({bonusRounds:{'journey-dallas-coin-hunt-01':{completed:true},'journey-dallas-coin-hunt-03':{completed:true}}})});
 await f.refresh();assert.equal(f.count(),2);
});
