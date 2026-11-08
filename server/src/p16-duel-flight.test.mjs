import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {flight} from './takeoff-transition.test.mjs';
import {skyDuelRunwaySpawn} from './sky-duel-spawn.js';
import {cityAirports} from '../../shared/city-airports.mjs';
import {getTerrainHeight} from '../../client/src/dallas-world.js';
import {validateClientTransform} from './transform-validation.js';
import {COMBAT_RANGE,AIM_ENVELOPE} from '../../shared/protocol.mjs';

for(const type of ['trainer','cargo','privateJet','fighter'])test(`${type}: both real DFW departures take off and offer symmetric non-Boost engagement`,t=>{
 const airport=cityAirports.dallas.find(a=>a.id==='dfw'),ground=(x,z)=>getTerrainHeight(x/3,z/3)*3+1.2;
 const pilots=[0,1].map(slot=>{
  const c=flight(type),spawn=skyDuelRunwaySpawn(slot,ground(airport.x,airport.z)-1.2);
  c.airplane.position.set(spawn.position.x,spawn.position.y,spawn.position.z);c.heading=spawn.heading;c.heldActions.clear();
  c.groundPlaneY=ground;c.getAirportAtPosition=p=>Math.abs(p.x-airport.x)<=airport.runwayWidth/2&&Math.abs(p.z-airport.z)<=airport.runwayLength/2?airport:null;
  return c;
 });
 const dt=1/60,takeoffs=[],opportunities=[];
 for(let frame=0;frame<60*60&&opportunities.filter(v=>v!==undefined).length<2;frame++){
  const goals=pilots.map(c=>c.airplane.position.clone());
  for(const [slot,c] of pilots.entries()){
   const enemy=goals[1-slot],own=c.airplane.position;
   const heading=Math.atan2(-(enemy.x-own.x),-(enemy.z-own.z)),error=Math.atan2(Math.sin(heading-c.heading),Math.cos(heading-c.heading));
   const desiredVy=THREE.MathUtils.clamp((ground(airport.x,airport.z)+450-own.y)*.12,-45,45);
   c.mobileInput.getThrottleTarget=()=>c.onGround?.8:.4;
   c.mobileInput.getSteeringInput=()=>({x:c.onGround?0:-THREE.MathUtils.clamp(error*1.3,-.85,.85),y:c.onGround?-.8:-THREE.MathUtils.clamp(.12+(desiredVy-c.velocity.y)*.04,-.65,.8)});
   const previous=own.clone();c.updateFlight(dt);
   assert(validateClientTransform(previous,own,dt*1000,c.currentAircraft).accepted);
   assert.equal(c.boostActive,false);
   if(!c.onGround){
    takeoffs[slot]??=(frame+1)*dt;
    const offset=enemy.clone().sub(own),range=offset.length(),forward=new THREE.Vector3(0,0,-1).applyQuaternion(c.airplane.quaternion);
    if(range<=COMBAT_RANGE&&forward.dot(offset.normalize())>=Math.cos(AIM_ENVELOPE))opportunities[slot]??=(frame+1)*dt;
   }
  }
 }
 assert.equal(takeoffs.length,2);assert(Math.abs(takeoffs[0]-takeoffs[1])<=dt);
 assert.equal(opportunities.filter(v=>v!==undefined).length,2,'both sides must reach a genuine forward firing solution');
 assert(Math.abs(opportunities[0]-opportunities[1])<1,'neither departure has an engagement advantage');
 assert(opportunities.every(v=>v<=35),`engagement took ${opportunities}s`);
 t.diagnostic(JSON.stringify({takeoffs,opportunities,throttle:'80% runway / 40% airborne',boost:false}));
});
