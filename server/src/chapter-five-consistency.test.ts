import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import * as missions from '../../shared/journey-mission.mjs';
import {journeyCategories,journeyCategorySlots,journeyCategorySlot} from '../../shared/journey-categories.mjs';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
import {authorizedJourneyAirborneSpawn} from './journey-airborne-spawn.js';
const source=readFileSync('client/src/main.ts','utf8'), ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const chapter=journeyCategorySlots.filter(slot=>slot.categoryId==='territory-missions');
const definitions=[missions.journeyDallasCapture01,missions.journeyDallasTerritoryDefense01,missions.journeyDallasCaptureThree01,missions.journeyDallasTerritoryHold01];
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const fn=(name:string)=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!.getText(ast);
test('all implemented Ch5 territory missions start on DFW runway and use category numbers in gameplay and pause',()=>{
 const ctx=vm.createContext({...missions,journeyCategorySlots,journeyCategorySlot,missionJourneyDetails});
 vm.runInContext(compile(fn('journeyMissionHeading')),ctx);
 for(const [i,mission] of definitions.entries()){
  assert.equal(mission.runwayStart,true);assert.equal(mission.startAirportId,'dfw');
  assert.equal(authorizedJourneyAirborneSpawn({missionId:mission.id,status:'APPROACH'},mission,()=>100),undefined);
  const detail=missionJourneyDetails.find(d=>d.id===mission.id)!;
  assert.equal(ctx.journeyMissionHeading(mission.id),`M${i+1}: ${detail.title}`);
 }
 assert.equal(chapter[4]!.implementation,'placeholder','the unfinished M5 must remain unavailable');
 assert.equal(chapter[5]!.kind,'bonus');assert.equal(ctx.journeyMissionHeading(chapter[5]!.missionId),'BONUS ROUND');
 const hud=source.slice(source.indexOf('  if (journeyHudHeading) journeyHudHeading.textContent ='),source.indexOf('  const missionDefinition =',source.indexOf('  if (journeyHudHeading) journeyHudHeading.textContent =')));
 assert.match(hud,/journeyMissionHeading\(journeyAttempt.missionId\)/);assert.doesNotMatch(hud,/M16|M21|M5:/);
 const pause=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='pilotMenuData')!;
 let missionProperty:ts.PropertyAssignment|undefined;
 const visit=(node:ts.Node)=>{if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='flightMission')missionProperty=node;ts.forEachChild(node,visit);};visit(pause);
 assert.ok(missionProperty);
 for(const mission of definitions){
  Object.assign(ctx,{journeyMode:true,journeyAttempt:{missionId:mission.id,gateIndex:0},flightBonusDetail:undefined,flightGateCount:0,journeyHudProgress:{textContent:''},journeyHudTimer:{textContent:''},journeyPaused:false});
  const actual=vm.runInContext(compile(`(${missionProperty!.initializer.getText(ast)})`),ctx);
  const detail=missionJourneyDetails.find(d=>d.id===mission.id)!;
  assert.equal(actual.name,ctx.journeyMissionHeading(mission.id));assert.equal(actual.objective,detail.description.split('\n').map(line=>`• ${line}`).join('\n'));
 }
});
test('cleared and failed result cards share Ch5 category numbers and Journey detail names',()=>{
 const start=source.indexOf('  const resultSlot = journeyCategorySlot(attempt.missionId);');
 assert.ok(start>=0);const end=source.indexOf("  journeyResultElement.querySelector<HTMLElement>('[data-journey-result-title]')",start);
 for(const slot of chapter.filter(s=>s.implementation==='playable')){
  const nodes=new Map<string,any>();const ctx=vm.createContext({attempt:{missionId:slot.missionId},journeyCategorySlot,missionJourneyDetails,journeyCatalog:missions.journeyCatalog,journeyResultElement:{querySelector:(key:string)=>{if(!nodes.has(key))nodes.set(key,{textContent:''});return nodes.get(key);}}});
  vm.runInContext(compile(source.slice(start,end)),ctx);
  assert.equal(nodes.get('[data-journey-result-heading]').textContent,slot.kind==='bonus'?'M6':`M${slot.categoryNumber}`);
  if(slot.kind==='main')assert.equal(nodes.get('[data-journey-result-name]').textContent,missionJourneyDetails.find(d=>d.id===slot.missionId)!.title);
 }
});
test('Ch5 bonus uses exactly the same shared airborne round as every other chapter',()=>{
 const bonus=missions.journeyDallasCoinHunt01;
 const expected=authorizedJourneyAirborneSpawn({missionId:bonus.id,status:'APPROACH'},bonus,()=>100);
 assert.ok(expected);
 for(const group of journeyCategories){
  const slot=journeyCategorySlot(group.missionIds[5]!)!;
  assert.equal(slot.kind,'bonus');assert.equal(slot.missionId,bonus.id);
  assert.deepEqual(authorizedJourneyAirborneSpawn({missionId:slot.missionId,status:'APPROACH'},bonus,()=>100),expected);
 }
 const bootstrap=readFileSync('client/src/bootstrap.ts','utf8');
 assert.doesNotMatch(bootstrap,/journeySlotId/,'no chapter-specific bonus launch request');
});
