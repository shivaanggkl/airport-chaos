import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {journeyCategories} from '../../shared/journey-categories.mjs';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.ts';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
test('all Giant Battles clear duplicate status/count rows while retaining mission instructions',()=>{
 const start=source.indexOf('  if(elevatorMission){');
 const end=source.indexOf('    if (journeyHudTimer)',start);
 const code=ts.transpileModule(source.slice(start,end)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const group=journeyCategories.find(group=>group.id==='giant-battles');
 for(const missionId of group.missionIds.slice(0,5))for(const fighterEscortsAlive of [0,1,2,4]){
  const node=()=>({hidden:false,textContent:'old status'});
  const ctx={elevatorMission:true,journeyAttempt:{missionId,fighterEscortsAlive},missionJourneyDetails,
   journeyHudProgress:node(),journeyHudTarget:node(),journeyHudObjective:node(),
   setMissionInstructions:(element,text)=>element.textContent=text};
  vm.runInNewContext(code,ctx);
  assert.equal(ctx.journeyHudProgress.hidden,true);assert.equal(ctx.journeyHudProgress.textContent,'');
  assert.equal(ctx.journeyHudTarget.hidden,true);assert.equal(ctx.journeyHudTarget.textContent,'');
  assert.equal(ctx.journeyHudObjective.textContent,missionJourneyDetails.find(mission=>mission.id===missionId).description.split('\n').map(line=>`• ${line}`).join('\n'));
 }
 assert.doesNotMatch(source,/GIANT PLANE:|ESCORTS LEFT:|ESCORTS: \$\{/);
});
test('pause details use the same cleared HUD progress and keep the existing health display',()=>{
 assert.match(source,/progress: flightGateCount \?[^\n]+: journeyHudProgress\?\.textContent \?\? ''/);
 const giant=source.slice(source.indexOf('  if(elevatorMission){'),source.indexOf('  if (breakoutMission)',source.indexOf('  if(elevatorMission){')));
 assert.match(giant,/monsterBossHud.style.setProperty\('--monster-health'/);
 assert.match(giant,/monsterBossHud.querySelector\('span'\)/);
});
