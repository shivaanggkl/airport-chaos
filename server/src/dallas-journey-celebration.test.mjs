import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {missionJourneyStages} from '../../client/src/mission-journey-model.ts';
import {journeyDallas19} from '../../shared/journey-mission.mjs';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const read=path=>readFileSync(new URL(`../../client/src/${path}`,import.meta.url),'utf8');
const uiSource=read('dallas-journey-celebration.ts').replace(/^import.*$/m,'');
const journeyTree=ts.createSourceFile('mission-journey.ts',read('mission-journey.ts'),ts.ScriptTarget.Latest,true);
const journeyClass=journeyTree.statements.find(ts.isClassDeclaration);
const methods=journeyClass.members.filter(n=>['celebrateCompletion','hide'].includes(n.name?.getText(journeyTree))).map(n=>n.getText(journeyTree)).join('\n');
function fixture(){
 let nextTimer=0;const timers=new Map(),events=[];
 class Element{children=[];attributes={};style={setProperty(){}};classList={add(){},remove(){}};hidden=false;append(...items){this.children.push(...items);}setAttribute(k,v){this.attributes[k]=v;}remove(){this.removed=true;}}
 const body=new Element();
 const ctx=vm.createContext({exports:{},document:{body,createElement:()=>new Element()},window:{setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)},missionJourneyStages,journeyDallas19});
 vm.runInContext(compile(uiSource),ctx);ctx.showDallasJourneyCelebration=()=>{events.push('celebration');return ctx.exports.showDallasJourneyCelebration();};
 vm.runInContext(compile(`class Journey{${methods}};globalThis.Journey=Journey;`),ctx);
 const journey=new ctx.Journey();Object.assign(journey,{progress:{},isOpen:true,element:new Element(),detail:{querySelector:()=>({getBoundingClientRect:()=>({})})},stageButtons:new Map(),renderProgress(){},revealMission(){},select(){}});
 for(const stage of missionJourneyStages){journey.progress[stage.id]={completed:true};journey.stageButtons.set(stage.number,new Element());}
 return {journey,body,timers,events,run(id){const timer=timers.get(id);timers.delete(id);timer.fn();}};
}
test('final mission waits for the credit flight, rains across the page, then cleans up automatically',()=>{
 const f=fixture(),stage=missionJourneyStages.find(s=>s.missionId===journeyDallas19.id);
 f.journey.celebrateCompletion(stage.number,()=>{f.events.push('credits');return 2200;});
 assert.deepEqual(f.events,['credits']);const delay=f.journey.celebrationTimer;assert.equal(f.timers.get(delay).ms,2200);
 f.run(delay);assert.deepEqual(f.events,['credits','celebration']);assert.equal(f.body.children.length,1);
 const overlay=f.body.children[0];assert.equal(overlay.attributes.role,'status');assert.equal(overlay.children[0].children.length,72);assert.equal(overlay.children[1].children[0].textContent,'DALLAS COMPLETED');
 const [id,timer]=[...f.timers][0];assert.equal(timer.ms,5500);f.run(id);assert.equal(overlay.removed,true);assert.equal(f.timers.size,0);
});
test('zero-credit replays celebrate, other missions do not, and leaving cancels either stage',()=>{
 const stage=missionJourneyStages.find(s=>s.missionId===journeyDallas19.id),f=fixture();
 f.journey.celebrateCompletion(stage.number);assert.equal(f.timers.get(f.journey.celebrationTimer).ms,650);f.run(f.journey.celebrationTimer);f.journey.hide();assert.equal(f.body.children[0].removed,true);assert.equal(f.timers.size,0);
 const g=fixture();g.journey.celebrateCompletion(stage.number);g.journey.hide();assert.equal(g.timers.size,0);assert.equal(g.body.children.length,0);
 const h=fixture();h.journey.celebrateCompletion(1);h.run(h.journey.celebrationTimer);assert.equal(h.body.children.length,0);
});
