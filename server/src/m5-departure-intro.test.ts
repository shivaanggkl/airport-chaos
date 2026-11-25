import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {territoryDeparture,territoryDepartureFleetStartMs,territoryDepartureTakeoffMs,territoryDepartureFleetMs,territoryDepartureDurationMs,territoryDeparturePose} from '../../shared/territory-departure.mjs';
import {journeyDallasTerritoryDomination01 as mission} from '../../shared/journey-mission.mjs';
import {territoriesForCity} from '../../shared/city-territories.mjs';
import {TerritoryDepartureIntro} from '../../client/src/territory-departure-intro.ts';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
import {territoryDominationInstructions} from '../../client/src/mission-journey-content.ts';

function fixture(){
 const origin=new THREE.Vector3(-68400,121.2,-44736),player=new THREE.Group();player.position.copy(origin);
 const aircraft=mission.opponentNames.map((name,slot)=>{const plane=new THREE.Group();plane.add(new THREE.Mesh(new THREE.BoxGeometry(40,8,60),new THREE.MeshBasicMaterial()));plane.position.copy(origin);plane.rotation.y=Math.PI;return {name,plane,markers:[new THREE.Object3D(),new THREE.Object3D()],assignment:slot<6?`TRIES TO CAPTURE ${mission.territoryIds[slot]}`:'CHASES YOUR AIRCRAFT'};});
 const territories=mission.territoryIds.map(id=>territoriesForCity('dallas').find(territory=>territory.id===id)!);
 const intro=new MissionCaptureIntroPath(territories[0]!,mission.captureDurationMs,()=>120,undefined,{player,territories,instructions:territoryDominationInstructions,showNeutralOwnership:true,departures:aircraft});
 return {origin,player,aircraft,intro,dispose(){for(const actor of aircraft)actor.plane.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});}};
}

test('nine departures share one runway, lift in strict order, and finish above ground with distinct positions',()=>{
 const {origin,dispose}=fixture();try{
  let previousLift=-Infinity;
  for(let slot=0;slot<9;slot++){
   const start=territoryDepartureTakeoffMs+slot*territoryDeparture.spacingMs,lift=start+territoryDeparture.rollMs;
   assert.deepEqual(territoryDeparturePose(slot,0,origin).position,{x:origin.x,y:origin.y,z:origin.z+(9-slot)*territoryDeparture.queueSpacing});
   assert.deepEqual(territoryDeparturePose(slot,start,origin).position,{x:origin.x,y:origin.y,z:origin.z+9*territoryDeparture.queueSpacing});
   assert.equal(territoryDeparturePose(slot,lift,origin).position.y,origin.y);
   assert.ok(territoryDeparturePose(slot,lift+100,origin).position.y>origin.y);assert.ok(lift>previousLift);previousLift=lift;
   const final=territoryDeparturePose(slot,territoryDepartureDurationMs,origin);assert.ok(final.velocity.z>0&&final.velocity.y>0);assert.ok(final.rotation.x>0);
  }
  const ends=Array.from({length:9},(_,slot)=>territoryDeparturePose(slot,territoryDepartureDurationMs,origin).position.z);
  assert.equal(new Set(ends).size,9);
 }finally{dispose();}
});

test('cinematic rendering restores every borrowed actor, visibility, marker and rotation order, including skipped handoff',()=>{
 const {aircraft,intro,dispose}=fixture();try{
  const original=aircraft.map(actor=>({position:actor.plane.position.clone(),quaternion:actor.plane.quaternion.clone(),order:actor.plane.rotation.order,visible:actor.plane.visible,markers:actor.markers.map(marker=>marker.visible)}));
  const presentation=intro.departures!;
  for(const time of [0,territoryDeparture.establishMs+100,territoryDepartureFleetMs,intro.durationMs]){
   presentation.beginRender(time,time===intro.durationMs);
   if(time===0)assert.equal(aircraft.filter(actor=>actor.plane.visible).length,0);
   assert.ok(aircraft.every(actor=>actor.markers.every(marker=>!marker.visible)));
   if(time===intro.durationMs)assert.ok(aircraft.every(actor=>actor.plane.visible));
   presentation.endRender();presentation.endRender();
   aircraft.forEach((actor,slot)=>{const saved=original[slot]!;assert.ok(actor.plane.position.equals(saved.position));assert.ok(actor.plane.quaternion.equals(saved.quaternion));assert.equal(actor.plane.rotation.order,saved.order);assert.equal(actor.plane.visible,saved.visible);assert.deepEqual(actor.markers.map(marker=>marker.visible),saved.markers);});
  }
 }finally{dispose();}
});

test('M5 shows six neutral territories first, a continuous queued departure, then the player',()=>{
 const {aircraft,intro,player,dispose}=fixture();try{
  assert.equal(intro.durationMs,territoryDepartureDurationMs);
  for(let slot=0;slot<9;slot++){
   const time=territoryDepartureTakeoffMs+slot*territoryDeparture.spacingMs+100;
   assert.match(intro.text(time),/RUNWAY IN MOTION/);assert.equal(intro.showsTerritory(time),false);
  }
  for(let slot=0;slot<6;slot++){
   const time=slot*territoryDeparture.overviewMs+100;
   assert.equal(intro.territoryAt(time),undefined);assert.match(intro.text(time),/ALL 6 TERRITORIES START UNOWNED/);assert.equal(intro.showsTerritory(time),true);
  }
  assert.match(intro.text(intro.durationMs-1000),/YOUR TURN/);
  const chase=new THREE.Vector3(player.position.x,player.position.y+12,player.position.z-80),target=player.position.clone(),position=new THREE.Vector3(),lookAt=new THREE.Vector3();
  for(const aspect of [16/9,19.5/9,4/3])for(let time=0;time<=intro.durationMs;time+=100){
   intro.sample(time,position,lookAt,chase,target,aspect);assert.ok([...position,...lookAt].every(Number.isFinite));assert.ok(position.distanceTo(lookAt)>1);assert.ok(Number.isFinite(intro.fov(time,65)));
  }
  intro.sample(intro.durationMs,position,lookAt,chase,target);assert.ok(position.equals(chase));assert.ok(lookAt.equals(target));
 }finally{dispose();}
});

test('cinematic framing ignores hidden fallback models and transparent inactive effects',()=>{
 const {aircraft,player,dispose}=fixture();try{
  const before=new TerritoryDepartureIntro(aircraft,player),cameraBefore=new THREE.Vector3(),targetBefore=new THREE.Vector3();
  const time=territoryDepartureTakeoffMs+territoryDeparture.rollMs+100;before.sample(time,cameraBefore,targetBefore);
  const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(new THREE.BoxGeometry(10000,10000,10000),new THREE.MeshBasicMaterial()));aircraft[0]!.plane.add(hidden);
  aircraft[0]!.plane.add(new THREE.Mesh(new THREE.BoxGeometry(20000,20000,20000),new THREE.MeshBasicMaterial({transparent:true,opacity:0})));
  aircraft[0]!.plane.visible=false;
  const after=new TerritoryDepartureIntro(aircraft,player),cameraAfter=new THREE.Vector3(),targetAfter=new THREE.Vector3();after.sample(time,cameraAfter,targetAfter);
  assert.ok(cameraAfter.distanceTo(cameraBefore)<1e-6);assert.ok(targetAfter.distanceTo(targetBefore)<1e-6);
 }finally{dispose();}
});

test('the runway queue remains separated and the fleet camera never cuts between departing aircraft',()=>{
 const {origin,intro,player,dispose}=fixture();try{
  const poses=Array.from({length:9},(_,slot)=>territoryDeparturePose(slot,0,origin));
  for(let time=0;time<=territoryDepartureDurationMs;time+=100){
   poses.forEach((pose,slot)=>territoryDeparturePose(slot,time,origin,pose));
   for(let slot=1;slot<9;slot++)assert.ok(poses[slot-1]!.position.z-poses[slot]!.position.z>30,`queue overlap at ${time}ms`);
  }
  const before=new THREE.Vector3(),after=new THREE.Vector3(),target=new THREE.Vector3(),chase=player.position.clone().add(new THREE.Vector3(0,12,-80));
  for(let slot=0;slot<9;slot++){
   const time=territoryDepartureTakeoffMs+slot*territoryDeparture.spacingMs;
   intro.sample(time-1,before,target,chase,player.position,19.5/9);intro.sample(time+1,after,target,chase,player.position,19.5/9);
   assert.ok(before.distanceTo(after)<1,'all takeoffs share a continuous camera move');
  }
 }finally{dispose();}
});

test('all nine existing name boxes render above the lineup and their gameplay transforms and opacity are restored',()=>{
 const {aircraft,player,dispose}=fixture(),textures:THREE.SpriteMaterial[]=[];
 try{
  const actors=aircraft.map(actor=>{
   const material=new THREE.SpriteMaterial({color:'#ffffff',opacity:.35,transparent:true});textures.push(material);
   const tag=new THREE.Sprite(material);tag.position.set(3,4,5);tag.scale.set(8,2,1);tag.visible=false;
   return {...actor,identityTag:tag,markers:actor.markers,paintIdentity(){tag.userData.paints=(tag.userData.paints??0)+1;}};
  });
  const presentation=new TerritoryDepartureIntro(actors,player),camera=new THREE.PerspectiveCamera(42,1280/589,.1,100000),target=new THREE.Vector3();
  const time=territoryDepartureFleetStartMs+1500;presentation.sample(time,camera.position,target,camera.aspect);camera.lookAt(target);camera.updateMatrixWorld();
  presentation.beginRender(time,false,camera,589,1280);
  assert.ok(actors.every(actor=>actor.plane.visible));assert.ok(actors.every(actor=>actor.identityTag.visible));
  assert.ok(actors.every(actor=>actor.identityTag.material.opacity===1&&actor.identityTag.userData.paints===1));
  assert.ok(actors.every(actor=>actor.identityTag.position.y>actor.plane.position.y));
  presentation.endRender();
  assert.ok(actors.every(actor=>!actor.identityTag.visible&&actor.identityTag.position.equals(new THREE.Vector3(3,4,5))&&actor.identityTag.scale.equals(new THREE.Vector3(8,2,1))&&actor.identityTag.material.opacity===.35));
 }finally{textures.forEach(material=>material.dispose());dispose();}
});

test('the queue temporarily uses canonical aircraft size and restores the gameplay distance enlargement',()=>{
 const {aircraft,player,dispose}=fixture();try{
  const actor=aircraft[0]!,airframe=new THREE.Group();airframe.name='aircraft-visual-root';airframe.userData.presentationScale=1;
  for(const child of [...actor.plane.children])airframe.add(child);actor.plane.add(airframe);
  const baseline=new TerritoryDepartureIntro(aircraft,player),before=new THREE.Vector3(),target=new THREE.Vector3();
  const time=territoryDepartureFleetStartMs+1000;baseline.sample(time,before,target,19.5/9);
  airframe.scale.setScalar(16);
  const presentation=new TerritoryDepartureIntro(aircraft,player),after=new THREE.Vector3();presentation.sample(time,after,target,19.5/9);
  assert.ok(before.distanceTo(after)<1e-6,'distant-contact magnification must not change cinematic framing');
  presentation.beginRender(time);assert.equal(airframe.scale.x,1);presentation.endRender();assert.equal(airframe.scale.x,16);
 }finally{dispose();}
});

test('name boxes refreshed by gameplay remain visible in the cinematic without retaining removed sprites',()=>{
 const {aircraft,player,dispose}=fixture();const materials:THREE.SpriteMaterial[]=[];
 try{
  let current=new THREE.Sprite(new THREE.SpriteMaterial({opacity:.4,transparent:true}));materials.push(current.material);current.visible=false;
  const actors=aircraft.map((actor,slot)=>slot===0?{...actor,get identityTag(){return current;}}:actor);
  const presentation=new TerritoryDepartureIntro(actors,player),camera=new THREE.PerspectiveCamera(42,19.5/9,.1,100000),target=new THREE.Vector3(),time=territoryDepartureFleetStartMs+1000;
  presentation.sample(time,camera.position,target,camera.aspect);camera.lookAt(target);
  presentation.beginRender(time,false,camera,589,1280);assert.equal(current.visible,true);presentation.endRender();assert.equal(current.visible,false);
  const removed=current;current=new THREE.Sprite(new THREE.SpriteMaterial({opacity:.2,transparent:true}));materials.push(current.material);current.visible=false;
  presentation.beginRender(time+200,false,camera,589,1280);assert.equal(current.visible,true);assert.equal(removed.visible,false);
  presentation.endRender();assert.equal(current.visible,false);assert.equal(current.material.opacity,.2);
 }finally{materials.forEach(material=>material.dispose());dispose();}
});


test('M5 holds one wide overview for the same 5.4 seconds with every territory fully in frame',()=>{
 const {intro,player,dispose}=fixture();try{
  assert.equal(territoryDepartureFleetStartMs,5400);
  const territories=mission.territoryIds.map(id=>territoriesForCity('dallas').find(t=>t.id===id)!);
  for(const aspect of [16/9,19.5/9,4/3]){
   const camera=new THREE.PerspectiveCamera(58,aspect,.1,1000000),target=new THREE.Vector3(),chase=player.position.clone(),initial=new THREE.Vector3();
   intro.sample(0,camera.position,target,chase,chase,aspect);initial.copy(camera.position);
   for(const elapsed of [0,899,900,1800,2700,3600,4500,5399]){
    intro.sample(elapsed,camera.position,target,chase,chase,aspect);assert.ok(camera.position.equals(initial),'no individual territory cuts');
    camera.lookAt(target);camera.updateMatrixWorld();
    for(const territory of territories){
     for(const x of [territory.bounds.minX,territory.bounds.maxX])for(const z of [territory.bounds.minZ,territory.bounds.maxZ]){
      const point=new THREE.Vector3(x,120,z).project(camera);assert.ok(Math.abs(point.x)<.9&&Math.abs(point.y)<.9&&Math.abs(point.z)<1,territory.id);
     }
    }
   }
  }
 }finally{dispose();}
});


test('wide overview shows all six numbered labels together and removes them before runway shots',()=>{
 const {intro,player,dispose}=fixture();try{
  const camera=new THREE.PerspectiveCamera(58,19.5/9,.1,1000000),target=new THREE.Vector3();
  intro.sample(100,camera.position,target,player.position,player.position,camera.aspect);camera.lookAt(target);camera.updateMatrixWorld();
  const borders=territoriesForCity('dallas').map(definition=>({definition,title:{textContent:definition.displayName},label:{hidden:true,style:{transform:''},classList:{toggle(){}}}}));
  const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateTerritoryLabels')!;
  const ctx=vm.createContext({missionCaptureIntroPath:intro,flightLaunchState:'active',flightLaunchSkipStartedAt:undefined,flightLaunchStartedAt:0,performance:{now:()=>100},
   territoryBorders:borders,territoryDisplayName:(t:any)=>t.displayName,territoryLabelProjection:new THREE.Vector3(),groundPlaneY:()=>120,camera,window:{innerWidth:1280,innerHeight:589},
   missionFocus:{showUnrelatedTerritoryLabels:false},focusedTerritoryTargetId:()=>null});
  vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  ctx.updateTerritoryLabels();assert.equal(borders.filter(b=>!b.label.hidden).length,6);
  for(const [slot,id]of mission.territoryIds.entries())assert.equal(borders.find(b=>b.definition.id===id)!.title.textContent,String(slot+1));
  ctx.flightLaunchSkipStartedAt=100;ctx.updateTerritoryLabels();assert.ok(borders.every(b=>b.label.hidden));assert.ok(borders.every(b=>b.title.textContent===b.definition.displayName.toUpperCase()));
 }finally{dispose();}
});
