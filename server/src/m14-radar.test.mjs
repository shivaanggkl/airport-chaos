import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {transportLockParts} from '../../shared/giant-incoming.mjs';
import * as missions from '../../shared/journey-mission.mjs';

const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const fn=name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
const snippets=[];
function visit(node){
 if(ts.isForOfStatement(node)&&node.expression.getText(ast)==='remotePlayers.values()'&&node.getText(ast).includes('drawRadarMarker')) snippets.push(node.getText(ast));
 if(ts.isIfStatement(node)&&node.getText(ast).includes("drawRadarMarker(direction,transportView.position.x")) snippets.push(node.getText(ast));
 else ts.forEachChild(node,visit);
}
visit(fn('updateRadar'));
assert.equal(snippets.length,3);
const radarCode=ts.transpileModule(fn('transportMissionHasLiveTarget').getText(ast)+'\n'+fn('transportEscortInactive').getText(ast)+'\nfunction draw(){'+snippets.join('\n')+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(mask=0){
 const markers=[];
 const remotes=['a','b'].map((playerId,index)=>({playerId,cityId:'dallas',entityType:'player',isBot:true,lifeState:'alive',health:100,heatLevel:0,
  plane:{visible:true,userData:{rearGuardEscort:true},position:{x:index+1,z:0}}}));
 const ctx=vm.createContext({...missions,transportLockParts,direction:{x:0,z:-1},remotePlayers:new Map(remotes.map(r=>[r.playerId,r])),
  journeyAttempt:{status:'RACING',missionId:missions.journeyDallas08.id,targetId:'a',secondaryTargetId:'b',rearGuardKills:mask,monsterHealth:2000},
  missionFocus:{showAmbientAIMarkers:false},unrelatedFocusedBot:()=>false,remoteIdentityVisible:r=>r.lifeState==='alive'&&r.plane.visible,
  selectedCombatTarget:null,primaryTerritoryColorForPlayer:()=>undefined,lockingThreatIds:new Set(),
  transportView:{position:{x:9,z:0}},drawRadarMarker:(_dir,x,_z,kind)=>markers.push({x,kind})});
 vm.runInContext(radarCode,ctx);
 return {ctx,markers,remotes,draw(){markers.length=0;vm.runInContext('draw()',ctx);return [...new Set(markers.map(m=>m.x))].sort();}};
}
for(const [mask,expected] of [[0,[1,2,9]],[1,[2,9]],[2,[1,9]],[3,[9]]])test(`M14 radar follows kill mask ${mask} even if old escort transforms still say alive`,()=>{
 const f=fixture(mask);assert.deepEqual(f.draw(),expected);
 for(const marker of f.markers) if(marker.x!==9)assert.equal(mask&(1<<(marker.x-1)),0);
});
test('fatal damage hides an escort before its destruction/progress packets arrive; retry restores fresh contacts',()=>{
 const f=fixture();f.remotes[0].health=0;assert.deepEqual(f.draw(),[2,9]);
 f.remotes[1].lifeState='destroyed';assert.deepEqual(f.draw(),[9]);
 f.ctx.journeyAttempt={...f.ctx.journeyAttempt,attemptId:'retry',rearGuardKills:0};
 for(const remote of f.remotes){remote.health=100;remote.lifeState='alive';}
 assert.deepEqual(f.draw(),[1,2,9]);
});
test('the destroyed M14 giant disappears from radar while surviving escorts remain',()=>{
 const f=fixture(1);f.ctx.journeyAttempt.monsterHealth=0;assert.deepEqual(f.draw(),[2]);
});
test('transport kill flags do not hide contacts in unrelated fighter missions',()=>{
 const f=fixture(3);f.ctx.journeyAttempt.missionId=missions.journeyDallas14.id;
 assert.deepEqual(f.draw(),[1,2]);
});

test('M16 radar shows only the living fourth escort after the gunship and first three are destroyed',()=>{
 const f=fixture(7);
 Object.assign(f.ctx.journeyAttempt,{missionId:missions.journeyDallas10.id,monsterHealth:0,rearGuardThirdId:'c',rearGuardFourthId:'d'});
 for (const [playerId,x] of [['c',3],['d',4],['old-fourth',5]]) {
  const remote={...f.remotes[0],playerId,plane:{...f.remotes[0].plane,position:{x,z:0}}};
  f.ctx.remotePlayers.set(playerId,remote);
 }
 assert.deepEqual(f.draw(),[4]);
});
