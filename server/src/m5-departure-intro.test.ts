import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {territoryDeparture,territoryDepartureFleetMs,territoryDepartureDurationMs,territoryDeparturePose} from '../../shared/territory-departure.mjs';
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
   const start=territoryDeparture.establishMs+slot*territoryDeparture.spacingMs,lift=start+territoryDeparture.rollMs;
   assert.deepEqual(territoryDeparturePose(slot,start,origin).position,{...origin});
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
   if(time===0)assert.equal(aircraft.filter(actor=>actor.plane.visible).length,1);
   assert.ok(aircraft.every(actor=>actor.markers.every(marker=>!marker.visible)));
   if(time===intro.durationMs)assert.ok(aircraft.every(actor=>actor.plane.visible));
   presentation.endRender();presentation.endRender();
   aircraft.forEach((actor,slot)=>{const saved=original[slot]!;assert.ok(actor.plane.position.equals(saved.position));assert.ok(actor.plane.quaternion.equals(saved.quaternion));assert.equal(actor.plane.rotation.order,saved.order);assert.equal(actor.plane.visible,saved.visible);assert.deepEqual(actor.markers.map(marker=>marker.visible),saved.markers);});
  }
 }finally{dispose();}
});

test('M5 introduces every rival, six neutral objectives, then the player; camera stays finite and ends at the chase pose',()=>{
 const {aircraft,intro,player,dispose}=fixture();try{
  assert.equal(intro.durationMs,territoryDepartureDurationMs);
  for(let slot=0;slot<9;slot++){
   const time=territoryDeparture.establishMs+slot*territoryDeparture.spacingMs+100;
   assert.match(intro.text(time),new RegExp(mission.opponentNames[slot]!.toUpperCase()));assert.ok(intro.text(time).includes(aircraft[slot]!.assignment));assert.equal(intro.showsTerritory(time),false);
  }
  for(let slot=0;slot<6;slot++){
   const time=territoryDepartureFleetMs+slot*territoryDeparture.overviewMs+100;
   assert.equal(intro.territoryAt(time)?.id,mission.territoryIds[slot]);assert.match(intro.text(time),/UNASSIGNED/);assert.equal(intro.showsTerritory(time),true);
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
  const time=territoryDeparture.establishMs+territoryDeparture.rollMs+100;before.sample(time,cameraBefore,targetBefore);
  const hidden=new THREE.Group();hidden.visible=false;hidden.add(new THREE.Mesh(new THREE.BoxGeometry(10000,10000,10000),new THREE.MeshBasicMaterial()));aircraft[0]!.plane.add(hidden);
  aircraft[0]!.plane.add(new THREE.Mesh(new THREE.BoxGeometry(20000,20000,20000),new THREE.MeshBasicMaterial({transparent:true,opacity:0})));
  aircraft[0]!.plane.visible=false;
  const after=new TerritoryDepartureIntro(aircraft,player),cameraAfter=new THREE.Vector3(),targetAfter=new THREE.Vector3();after.sample(time,cameraAfter,targetAfter);
  assert.ok(cameraAfter.distanceTo(cameraBefore)<1e-6);assert.ok(targetAfter.distanceTo(targetBefore)<1e-6);
 }finally{dispose();}
});
