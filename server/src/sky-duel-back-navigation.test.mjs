import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const parse=path=>ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const bootstrap=parse('../../client/src/bootstrap.ts');
let returnBranch;
function find(node){
 if(ts.isIfStatement(node)&&node.expression.getText(bootstrap)==='directMultiplayerEntry')returnBranch=node.thenStatement.getText(bootstrap);
 ts.forEachChild(node,find);
}
find(bootstrap);assert(returnBranch);
const ui=parse('../../client/src/sky-duel-ui.ts');
const declaration=ui.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='SkyDuelUi');
const back=declaration.members.find(n=>n.name?.getText(ui)==='onBack');
const backFunction=ts.transpileModule('function onBack()'+back.body.getText(ui),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const startup=ts.transpileModule('async function resumeMultiplayerHub()'+returnBranch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

for(const searching of [true,false])test(`Sky Duel back cancels ${searching?'queued':'connecting'} search and stays at the mode cards`,async()=>{
 const events=[],timers=[];
 const ctx=vm.createContext({window:{clearTimeout:id=>timers.push(id)},
  showHome:async()=>events.push('home'),
  showSelector:()=>events.push('restarted matchmaking')});
 vm.runInContext(backFunction+'\n'+startup,ctx);
 const state={matchId:'',phase:searching?'searching':'connecting',autoQueue:true,queuedAt:searching?1000:0,queueTimer:7,
  send:type=>events.push(type),back:()=>{ctx.navigation=ctx.resumeMultiplayerHub();}};
 ctx.onBack.call(state);await ctx.navigation;
 assert.equal(state.autoQueue,false);assert.equal(state.queuedAt,0);assert.deepEqual(timers,[7]);
 assert.deepEqual(events,searching?['skyDuelCancel','home']:['home']);
});

test('back cannot abandon an already reserved opponent through the search back action',()=>{
 const ctx=vm.createContext({window:{clearTimeout(){throw Error('reserved match timer cleared');}}});
 vm.runInContext(backFunction,ctx);
 ctx.onBack.call({matchId:'reserved',phase:'found',back(){assert.fail('reserved match exited');}});
});
