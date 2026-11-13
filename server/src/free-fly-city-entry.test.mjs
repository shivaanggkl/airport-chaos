import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('bootstrap.ts',source,ts.ScriptTarget.Latest,true);
const code=['cityJourneyState','activateCityJourneyCard','chooseCity'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
function fixture(cityId,mode='solo-free-fly'){
 const city={id:cityId,status:cityId==='dallas'||cityId==='milwaukee'?'available':'coming-soon'},entries=[{id:cityId}],calls=[];
 const ctx=vm.createContext({cityJourneyMode:mode,journeyCity:()=>city,cityJourneyEntries:entries,cityJourneyIndex:0,cityJourneyLaunching:false,pendingDallasUnlock:false,
  cityJourneyClickBlockedUntil:0,performance:{now:()=>100},hapticsManager:{emit(){}},recordProductIntent(){},abandonPendingJourneyLaunch(){},
  enterCity:async(...args)=>calls.push(args),showSelector(){assert.fail('unexpected launch error');},startTrainingFromHub:()=>calls.push('training'),
  authoritativeHomeProfile:{tutorial:{}},cityCapabilities:()=>({tutorialEnabled:cityId==='milwaukee'}),city});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return {ctx,calls,activate(){vm.runInContext('activateCityJourneyCard(0)',ctx);}};
}
test('Free Fly Training City card opens existing Milwaukee practice flight without starting training',()=>{
 const f=fixture('milwaukee');f.activate();
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],[f.ctx.city,'day',false,'free-fly']);
});
test('Dallas keeps its isolated solo Free Fly entry',()=>{
 const f=fixture('dallas');f.activate();assert.deepEqual(f.calls[0],[f.ctx.city,'day',false,'solo-free-fly']);
});
test('Training City under Missions still starts the guided training',()=>{
 const f=fixture('milwaukee','missions');f.activate();assert.deepEqual(f.calls,['training']);
});
for(const id of ['california','new-york'])test(`${id} stays unavailable in Free Fly`,()=>{
 const f=fixture(id);f.activate();assert.equal(f.calls.length,0);
});
