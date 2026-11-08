import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.ts';
import { journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12 } from '../../shared/journey-mission.mjs';
import { TransportArrivalSequence } from '../../client/src/transport-arrival.ts';

test('Mission 8 arrival frames both temporary escorts and removes them on handoff', () => {
  const previousDocument = globalThis.document;
  let alertHtml = '';
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ className: '', setAttribute: () => undefined, style: { opacity: '' },
      set innerHTML(value) { alertHtml = value; }, remove: () => undefined }),
    body: { append: () => undefined },
  } });
  try {
    const scene = new THREE.Scene();
    const transport = new THREE.Group();
    const escorts = [new THREE.Group(), new THREE.Group()];
    const arrival = new TransportArrivalSequence(transport, () => 0, scene, escorts, journeyDallas08.name, journeyDallas08.id, journeyDallas08.timeLimitMs);
    assert.match(alertHtml, /GIANT PLANE &amp; TWO ESCORTS|GIANT PLANE & TWO ESCORTS/);
    assert.match(alertHtml, /Shoot Down the GIANT PLANE And Both ESCORT Planes Before Time Runs Out\./);
    arrival.update(2);
    assert.equal(transport.position.y,1350,'intro receives the same 50 percent altitude increase exactly once');
    const camera = new THREE.PerspectiveCamera(58, 1280 / 590, 1, 10_000);
    arrival.frame(camera, 0.016, new THREE.Object3D(), new THREE.Vector3(), new THREE.Vector3());
    const screenPositions = [];
    for (const escort of escorts) {
      const position = escort.position.clone().project(camera);
      screenPositions.push(position);
      assert.ok(escort.visible && Math.abs(position.x) > .4 && Math.abs(position.x) < .85 && Math.abs(position.y) < .5,
        'each escort is clearly visible beside the transport, away from its body and screen edge');
      assert.ok(scene.children.includes(escort));
    }
    assert.ok(screenPositions[0].x * screenPositions[1].x < 0,
      'the two escorts appear on opposite sides of the transport');
    assert.ok(escorts[0].position.distanceTo(escorts[1].position) > 800);
    arrival.skip();
    arrival.update(0);
    assert.ok(escorts.every(escort => !escort.visible));
    arrival.dispose();
    assert.ok(escorts.every(escort => !scene.children.includes(escort)));
    const briefingWithoutPreview = new TransportArrivalSequence(transport, () => 0, scene, [], journeyDallas08.name, journeyDallas08.id, journeyDallas08.timeLimitMs);
    assert.match(alertHtml, /GIANT PLANE & TWO ESCORTS.*Shoot Down the GIANT PLANE And Both ESCORT Planes Before Time Runs Out\./);
    briefingWithoutPreview.dispose();
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
  }
});

test('M15-M18 screenplay objectives exactly match Journey and gameplay, with or without escort previews',()=>{
 const previousDocument=globalThis.document;let html='';
 Object.defineProperty(globalThis,'document',{configurable:true,value:{
  createElement:()=>({className:'',setAttribute(){},style:{opacity:''},set innerHTML(value){html=value;},remove(){}}),body:{append(){}}}});
 const gameplay=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 try{
  for(const mission of [journeyDallas09,journeyDallas10,journeyDallas11,journeyDallas12]){
   const expected=missionJourneyDetails.find(detail=>detail.id===mission.id).description;
   assert(gameplay.includes(expected),'active mission box uses the same objective');
   for(const preview of [false,true]){
    const scene=new THREE.Scene();
    const arrival=new TransportArrivalSequence(new THREE.Group(),()=>0,scene,preview?[new THREE.Group(),new THREE.Group()]:[],mission.name,mission.id,mission.timeLimitMs);
    assert.equal(html.match(/<p>(.*?)<\/p>/)?.[1],expected,`${mission.name}: escort preview ${preview}`);
    arrival.dispose();
   }
  }
 }finally{Object.defineProperty(globalThis,'document',{configurable:true,value:previousDocument});}
});
