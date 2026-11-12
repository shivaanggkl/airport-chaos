import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {journeyMissionOrder} from '../../shared/journey-mission.mjs';

const source=readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('bootstrap.ts',source,ts.ScriptTarget.Latest,true);
const launch=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='playJourneyMission');
const code=ts.transpileModule(launch.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(response){
 const message={textContent:''},entered=[];
 const ctx=vm.createContext({journeyLaunchPending:false,dallasUnlocked:()=>true,cityJourneyMode:'missions',missionJourney:{selectedMissionNumber:11},journeyMissionOrder,pendingAircraftSelection:undefined,
 apiFetch:async()=>response,apiUrl:path=>path,journeyAttemptId:null,journeyAttemptMission:null,cities:[{id:'dallas',status:'available'}],citySelector:{hidden:false},enterCity:async(...args)=>entered.push(args),missionTimePreset:()=> 'evening',
 console:{error(){}},entryState:'MISSION_JOURNEY',gameRoot:{hidden:true},showMissionJourney:()=>{},refreshJourneyProgress:async()=>{},missionJourneyElement:{querySelector:()=>message}});
 vm.runInContext(code,ctx);
 return {ctx,message,entered,run:()=>vm.runInContext('playJourneyMission()',ctx)};
}
for(const error of ['Complete Mission 10 first.','Finish or leave your current flight mission first.','Request could not be verified.'])test(`M11 launch rejection shows the server reason: ${error}`,async()=>{
 const f=fixture({ok:false,json:async()=>({error})});await f.run();
 assert.equal(f.message.textContent,error);assert.equal(f.ctx.journeyLaunchPending,false);assert.equal(f.entered.length,0);
});
test('M11 invalid error response shows retry feedback and permits another launch',async()=>{
 const f=fixture({ok:false,json:async()=>{throw Error('invalid JSON');}});await f.run();
 assert.equal(f.message.textContent,'Unable to start this mission. Please try again.');assert.equal(f.ctx.journeyLaunchPending,false);
 f.ctx.apiFetch=async()=>({ok:true,json:async()=>({attempt:{attemptId:'accepted'}})});await f.run();
 assert.equal(f.entered.length,1);assert.equal(f.ctx.journeyAttemptId,'accepted');assert.equal(f.ctx.journeyAttemptMission,'mission-17');assert.equal(f.ctx.journeyLaunchPending,false);
});
