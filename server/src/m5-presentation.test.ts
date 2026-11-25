import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {CityTerritoriesPanel} from '../../client/src/players-panel.ts';

const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('M5 uses the common nine-minute header clock before GO, during gameplay and at expiry',()=>{
 const definitions=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='journeyMissionDefinitions'))!;
 const hud=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateJourneyHud') as ts.FunctionDeclaration;
 const start=hud.body!.statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='missionDefinition'));
 const end=hud.body!.statements.findIndex(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='journeyHudHeaderTimer');
 let now=100000;const clock={hidden:true,textContent:''};
 const ctx=vm.createContext({...missions,journeyAttempt:{missionId:missions.journeyDallasTerritoryDomination01.id,deadlineAt:null},journeyHudHeaderTimer:clock,huntMission:false,journeyServerTimeOffset:0,Date:{now:()=>now}});
 vm.runInContext(compile(definitions.getText(ast)+'\nfunction renderClock(){'+hud.body!.statements.slice(start,end+1).map(n=>n.getText(ast)).join('\n')+'}'),ctx);
 ctx.renderClock();assert.equal(clock.hidden,false);assert.equal(clock.textContent,'9:00');
 ctx.journeyAttempt.deadlineAt=now+540000;now+=1000;ctx.renderClock();assert.equal(clock.textContent,'8:59');
 ctx.journeyServerTimeOffset=1000;ctx.renderClock();assert.equal(clock.textContent,'8:58');
 now+=540000;ctx.renderClock();assert.equal(clock.textContent,'0:00');
});

function element():any {
 const children:any[]=[],classes=new Set<string>();
 return {children,textContent:'',className:'',hidden:false,dataset:{},style:{},title:'',
  classList:{add:(...names:string[])=>names.forEach(n=>classes.add(n)),toggle:(name:string,force:boolean)=>force?classes.add(name):classes.delete(name)},
  append:(...nodes:any[])=>children.push(...nodes),insertBefore:(node:any,before:any)=>children.splice(children.indexOf(before),0,node),addEventListener(){}};
}
test('the shared territory box shortens display labels while preserving territory data and owner names',()=>{
 const previous=globalThis.document;(globalThis as any).document={createElement:element};
 try{
  const root=element(),panel=new CityTerritoriesPanel(root);
  const entries=['Trinity Corridor Territory','WHITE ROCK TERRITORY','Las Colinas Territory','Love Field'].map((name,index)=>({name,color:'#ffffff',controllerId:`enemy-${index}`,controllerName:['Patty','Nose','Bop','Noodle'][index]}));
  panel.update(entries,'local');
  const rows=root.children.filter((node:any)=>node.className==='city-territory-row');
  assert.deepEqual(rows.map((row:any)=>row.children[1].textContent),['Trinity Corridor','WHITE ROCK','Las Colinas','Love Field']);
  assert.deepEqual(rows.map((row:any)=>row.children[2].textContent),['Patty','Nose','Bop','Noodle']);
  assert.equal(entries[0].name,'Trinity Corridor Territory');
 }finally{(globalThis as any).document=previous;}
});
