import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {TerritoryCaptureBar} from '../../client/src/territory-capture-bar.ts';
import {CityTerritoriesPanel} from '../../client/src/players-panel.ts';

class Element {
  children: Element[]=[];
  hidden=false;className='';textContent='';value=0;dataset={};style={};scrollTop=0;
  rect={top:0,bottom:100,left:0,width:100,height:100};
  classes=new Set<string>();
  classList={add:(...names:string[])=>names.forEach(n=>this.classes.add(n)),remove:(...names:string[])=>names.forEach(n=>this.classes.delete(n)),toggle:(name:string,on:boolean)=>on?this.classes.add(name):this.classes.delete(name)};
  get firstElementChild(){return this.children[0];}
  set innerHTML(_value:string){this.children=Array.from({length:3},()=>new Element());}
  querySelector(selector:string){return this.children[selector==='progress'?1:selector==='.live-territory-percent'?2:0];}
  replaceChildren(...nodes:Element[]){this.children=nodes;}
  append(...nodes:Element[]){this.children.push(...nodes);}
  insertBefore(node:Element,before:Element){this.children.splice(this.children.indexOf(before),0,node);}
  addEventListener(){}
  getBoundingClientRect(){return this.rect;}
}

test('the shared capture bar explains the 95% block and clears the hint on capture, hold, and hide',()=>{
 const previous=globalThis.document;(globalThis as any).document={createElement:()=>new Element()};
 try{
  const root=new Element(),bar=new TerritoryCaptureBar(root as unknown as HTMLElement);
  bar.show('LAS COLINAS',95,false,true);
  const hint=root.children[1];assert.equal(hint.hidden,false);assert.equal(hint.textContent,'Defeat the owner to finish capturing.');
  bar.show('LAS COLINAS',95,false);assert.equal(hint.hidden,true,'owner death clears the explanation even before percentage changes');
  bar.show('LAS COLINAS',95,false,true);bar.show('LAS COLINAS',100,true);assert.equal(hint.hidden,true);
  bar.show('LAS COLINAS',95,false,true);bar.showHold('LAS COLINAS','0:01','0:30');assert.equal(hint.hidden,true);
  bar.show('LAS COLINAS',95,false,true);bar.hide();assert.equal(hint.hidden,true);
 }finally{globalThis.document=previous;}
});

test('capture animation can target the acquired row and reveal it inside the territory list',()=>{
 const previous=globalThis.document;(globalThis as any).document={createElement:()=>new Element()};
 try{
  const root=new Element(),panel=new CityTerritoriesPanel(root as unknown as HTMLElement);
  panel.update(Array.from({length:6},(_,i)=>({name:`Area ${i}`,color:'#ffffff',captured:true})),'pilot');
  const row=root.children[5];row.rect={...row.rect,top:180,bottom:210};
  assert.equal(panel.captureTarget(5),row);assert.equal(root.scrollTop,110);assert.equal(panel.captureTarget(6),undefined);
 }finally{globalThis.document=previous;}
});

test('opponent and player contact sprites respect opaque aircraft depth without writing depth themselves',()=>{
 const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createRemotePlayerProxy')!;
 const drawing=new Proxy({}, {get:()=>()=>{},set:()=>true});
 const ctx=vm.createContext({THREE,visualLanguage:{ai:{color:'#63e8ff'},player:{color:'#ffffff'}},document:{createElement:()=>({getContext:()=>drawing})}});
 vm.runInContext(ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 for(const isBot of [true,false]){
  const sprite=ctx.createRemotePlayerProxy(isBot) as THREE.Sprite;
  const material=sprite.material as THREE.SpriteMaterial;
  assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);assert.equal(material.transparent,true);
  material.map!.dispose();material.dispose();
 }
});

test('M5’s final capture finishes its shared animation before mission-clear results appear',async()=>{
 const missions=await import('../../shared/journey-mission.mjs');
 const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const functions=['beginMissionClear','updateMissionClear'];
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.includes(n.name?.text??'')).map(n=>n.getText(ast)).join('\n');
 function node(){const names=new Set<string>();return {setAttribute(){},querySelector:()=>({textContent:''}),classList:{add:(...items:string[])=>items.forEach(item=>names.add(item)),remove:(...items:string[])=>items.forEach(item=>names.delete(item)),contains:(item:string)=>names.has(item),toggle:(item:string,on:boolean)=>on?names.add(item):names.delete(item)}};}
 let now=1000,results=0,stops=0;
 const attempt={attemptId:'final',missionId:missions.journeyDallasTerritoryDomination01.id,status:'COMPLETED'};
 const ctx=vm.createContext({...missions,THREE,performance:{now:()=>now},missionClearAttemptId:null,missionClearStartedAt:null,missionClearCapturePreludeMs:0,
  competitiveCaptureHandoff:{active:{id:'addison',until:3800}},territoryCaptureCelebrationMs:2800,MISSION_CLEAR_DURATION_MS:4200,MISSION_CLEAR_REVEAL_MS:700,
  missionClearDirection:new THREE.Vector3(),missionClearLevel:new THREE.Quaternion(),missionClearVelocity:new THREE.Vector3(),missionClearCruiseVelocity:new THREE.Vector3(),cameraWorldUp:new THREE.Vector3(0,1,0),
  airplane:new THREE.Object3D(),velocity:new THREE.Vector3(0,0,-100),currentSpeed:100,verticalSpeed:0,
  clearHeldActions(){},mobileInput:{reset(){}},boostActive:false,runStarted:true,resetCameraPointers(){},cameraOrbitRecenterAt:0,
  cinematicDirector:{clearPresentation(){}},journeyResultElement:node(),journeyCatalog:[{id:attempt.missionId,title:'Capture 6 Territories'}],missionClearElement:node(),flightGameRoot:node(),
  journeyAttempt:attempt,missionCaptureBar:{stopCelebration(){stops++;}},audioManager:{playReward(){}},getTerrainHeight:()=>0,showJourneyResult(){results++;}});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 ctx.beginMissionClear(attempt);assert.equal(ctx.missionClearCapturePreludeMs,2800);
 assert.equal(ctx.flightGameRoot.classList.contains('territory-capture-celebrating'),true);
 now=3799;ctx.updateMissionClear(.016);assert.equal(stops,0);assert.equal(results,0);
 now=3800;ctx.updateMissionClear(.016);assert.equal(stops,1);assert.equal(results,0);
 now=8000;ctx.updateMissionClear(.016);assert.equal(results,1);
});

test('capture feedback distinguishes a neutral contest from the 95% owner block and clears the message on progress',()=>{
 const previous=globalThis.document;(globalThis as any).document={createElement:()=>new Element()};
 try{
  const root=new Element(),bar=new TerritoryCaptureBar(root as unknown as HTMLElement);
  bar.show('WHITE ROCK',0,false,false,true);
  const hint=root.children[1];assert.equal(hint.hidden,false);assert.equal(hint.textContent,'Rival inside. Capture is paused.');
  bar.show('WHITE ROCK',2,false);assert.equal(hint.hidden,true);
  bar.show('WHITE ROCK',95,false,true);assert.equal(hint.hidden,false);assert.equal(hint.textContent,'Defeat the owner to finish capturing.');
  bar.show('WHITE ROCK',50,false,false,true);assert.equal(hint.textContent,'Rival inside. Capture is paused.');
  bar.show('WHITE ROCK',0,false,false,false,true);assert.equal(hint.hidden,false);assert.equal(hint.textContent,'Rival arrived first. Defeat them to capture.');
  bar.show('WHITE ROCK',100,true);assert.equal(hint.hidden,true);
 }finally{globalThis.document=previous;}
});
