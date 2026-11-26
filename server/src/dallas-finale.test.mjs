import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {DALLAS_FINALE,DALLAS_VICTORY_WORD,createFinaleFlights,finalePhase} from '../../client/src/dallas-finale-paths.ts';
import {cinematicImpactTexture} from '../../client/src/cinematic-impact.ts';

const source=readFileSync(new URL('../../client/src/dallas-finale.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('dallas-finale.ts',source,ts.ScriptTarget.Latest,true);
const declaration=tree.statements.find(n=>ts.isClassDeclaration(n));
const compiled=ts.transpileModule(declaration.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
class Element{
 className='';children=[];isConnected=true;attributes={};classList={add(){},remove(){},toggle(){}};
 append(...items){this.children.push(...items);}setAttribute(key,value){this.attributes[key]=value;}focus(){}remove(){this.isConnected=false;}
 getContext(){return {beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}};}
}
function fixture(reduced=false){
 const document={hidden:false,activeElement:null,createElement:()=>new Element()},listeners=new Map();
 const context=vm.createContext({THREE,exports:{},DALLAS_FINALE,createFinaleFlights,finalePhase,cinematicImpactTexture,document,HTMLElement:Element,
  window:{matchMedia:()=>({matches:reduced}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}});
 vm.runInContext(compiled,context);const planes=[],disposed=[];let completions=0,renders=0;
 const renderer={getSize:v=>v.set(1280,589),render(){renders++;}},host=new Element();
 const finale=new context.exports.DallasFinale(renderer,host,type=>{planes.push(type);const plane=new THREE.Group();plane.add(new THREE.Mesh(new THREE.BoxGeometry(12,3,17),new THREE.MeshBasicMaterial()));return plane;},plane=>disposed.push(plane),()=>completions++);
 return {finale,document,listeners,planes,disposed,host,get completions(){return completions;},get renders(){return renders;}};
}
test('three aircraft write the exact VICTORY strokes on continuous paths with bounded smoke',()=>{
 assert.equal(DALLAS_VICTORY_WORD,'VICTORY');const flights=createFinaleFlights();assert.equal(flights.length,3);
 assert(flights.reduce((sum,f)=>sum+f.samples.length,0)<1000);
 for(const flight of flights){
  assert.equal(flight.segments[0].start,0);assert.equal(flight.segments.at(-1).end,1);
  for(let i=1;i<flight.segments.length;i++)assert(flight.segments[i-1].curve.getPointAt(1).distanceTo(flight.segments[i].curve.getPointAt(0))<1e-8);
  for(const sample of flight.samples){assert(Number.isFinite(sample.point.x));assert(sample.at>=0&&sample.at<=1);}
 }
 assert.equal(finalePhase(1),'arrival');assert.equal(finalePhase(7),'writing');assert.equal(finalePhase(12),'crimson');assert.equal(finalePhase(18),'gold');assert.equal(finalePhase(22),'achievement');assert.equal(finalePhase(26),'complete');
});
test('smoke becomes solid crimson then gold, celebration covers the screen, and completion fires once',async()=>{
 const f=fixture();await Promise.resolve();assert.deepEqual(f.planes,['trainer','privateJet','fighter']);
 for(let i=0;i<260;i++)f.finale.update(.05);
 assert(f.finale.wordMaterial.opacity>.5);assert(f.finale.wordMaterial.color.equals(new THREE.Color(0xdc143c)));assert(f.finale.pilots.every(p=>p.revealed===p.flight.samples.length));
 for(let i=0;i<110;i++)f.finale.update(.05);
 assert(f.finale.wordMaterial.color.equals(new THREE.Color(0xffd44d)));assert(f.finale.sprinkles.visible);assert(f.finale.stars.visible);
 for(let i=0;i<75;i++)f.finale.update(.05);
 assert.equal(finalePhase(f.finale.age),'achievement');assert(f.finale.achievement.children.some(e=>e.textContent==='DALLAS SAVED'));assert(f.finale.achievement.children.some(e=>e.textContent==='See you in California.'));
 for(let i=0;i<90;i++)f.finale.update(.05);
 assert.equal(f.completions,1);assert.equal(f.finale.active,false);assert.equal(f.disposed.length,3);assert.equal(f.listeners.size,0);assert.equal(f.finale.scene.children.length,0);
 f.finale.update(.05);f.finale.dispose();assert.equal(f.completions,1);
});
test('backgrounding pauses the finale, reduced motion keeps a stable camera, and Skip completes safely',async()=>{
 const f=fixture(true);await Promise.resolve();f.document.hidden=true;f.finale.update(.05);assert.equal(f.finale.age,0);assert.equal(f.renders,0);
 f.document.hidden=false;f.finale.update(.05);assert.equal(f.finale.camera.position.x,0);
 f.listeners.get('keydown')({code:'Escape',stopImmediatePropagation(){},preventDefault(){}});assert.equal(f.completions,1);assert.equal(f.finale.active,false);
});
const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8'),mainTree=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
const flow=ts.transpileModule(mainTree.statements.filter(n=>ts.isFunctionDeclaration(n)&&['presentMonsterResult','clearDallasFinale'].includes(n.name?.text)).map(n=>n.getText(mainTree)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function resultFixture(missionId='journey-dallas-19',status='COMPLETED'){
 const shown=[],instances=[],result={attemptId:'a',missionId,status};
 class FakeFinale{active=true;constructor(_renderer,_host,_create,_dispose,complete){this.finish=complete;instances.push(this);}dispose(){this.active=false;}}
 const ctx=vm.createContext({journeyAttempt:result,journeyDallas19:{id:'journey-dallas-19'},DallasFinale:FakeFinale,dallasFinale:undefined,dallasFinaleAttemptId:null,dallasFinaleFinishedAttemptId:null,renderer:{},flightGameRoot:{},
  disposeAirplaneMaterials(){},createAirplane:()=>new THREE.Group(),clearHeldActions(){},mobileInput:{reset(){}},cinematicDirector:{clearPresentation(){}},journeyResultElement:{classList:{add(){}}},showJourneyResult:r=>shown.push(r),audioManager:{playOnce(){}},console});
 vm.runInContext(flow,ctx);return {ctx,result,shown,instances};
}
test('only confirmed final-mission success delays the result, and duplicate packets cannot restart the finale',()=>{
 const f=resultFixture();f.ctx.presentMonsterResult(f.result);assert.equal(f.instances.length,1);assert.equal(f.shown.length,0);
 f.ctx.presentMonsterResult(f.result);assert.equal(f.instances.length,1);
 f.instances[0].finish();assert.equal(f.shown.length,1);assert.equal(f.ctx.dallasFinale,undefined);
 f.ctx.presentMonsterResult(f.result);assert.equal(f.instances.length,1);
 for(const [mission,status] of [['journey-dallas-23','COMPLETED'],['journey-dallas-19','FAILED']]){const g=resultFixture(mission,status);g.ctx.presentMonsterResult(g.result);assert.equal(g.instances.length,0);assert.equal(g.shown.length,1);}
 assert(main.includes('monsterView.onEndingComplete=()=>presentMonsterResult(result)'),'monster destruction must complete before the celebration starts');
});
test('exit and changed attempts dispose the finale without presenting a stale mission result',()=>{
 const f=resultFixture();f.ctx.presentMonsterResult(f.result);f.ctx.clearDallasFinale();assert.equal(f.instances[0].active,false);assert.equal(f.shown.length,0);
 f.ctx.journeyAttempt={...f.result,attemptId:'another'};f.instances[0].finish();assert.equal(f.shown.length,0);
});
