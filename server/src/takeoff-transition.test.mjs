import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as controls from '../../shared/flight-control-rules.mjs';
import {mobileIdleBrakeRequested} from '../../shared/mobile-input-rules.mjs';
import {aircraftDefinitions} from '../../client/src/aircraft.js';
import {validateClientTransform} from './transform-validation.js';
const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');
const code=ts.transpileModule(fn.getText(ast).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
export function flight(type,mobile=false){
 const airplane=new THREE.Group(),currentAircraft=aircraftDefinitions[type],heldActions=new Set(mobile?[]:['throttleUp']);airplane.position.set(0,527,3900);
 const no=()=>{},fail=()=>assert.fail(`${type}: unexpected takeoff crash/landing`);
 const ctx=vm.createContext({...controls,THREE,mobileIdleBrakeRequested,airplane,currentAircraft,aircraftType:type,velocity:new THREE.Vector3(),forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),heldActions,throttle:0,currentSpeed:0,verticalSpeed:0,heading:0,pitch:0,roll:0,onGround:true,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,bankControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:1,takeoffRollMeters:0,resetRegionsOnNextTakeoff:false,cameraShakeTime:0,landedFeedbackTime:0,speedBonus:0,flightState:'TAXI',landingStatus:{},performance:{now:()=>0},groundPlaneY:()=>527,getLandingAssistAirport:()=>null,getAirportAtPosition:()=>({id:'dfw',heading:0}),updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:fail,endRun:fail,evaluateLanding:fail,setFlightState:no,beginFlightRecap:no,handleContractTakeoff:no,contextualHints:{trigger:no},mobileInput:{getThrottleTarget:()=>mobile?1:undefined,getSteeringInput:()=>({x:0,y:mobile&&ctx.currentSpeed>=currentAircraft.takeoffSpeed*.8?-1:0}),getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)});
 vm.runInContext(code,ctx);return ctx;
}

test('all four aircraft accelerate, rotate and lift off without an injected velocity jump at 30/60/120 FPS',t=>{
 for(const type of Object.keys(aircraftDefinitions))for(const fps of [30,60,120])for(const mobile of [false,true]){
  const c=flight(type,mobile),dt=1/fps;let time=0,liftoff,previousSpeed=0,maxEarlyAcceleration=0;
  while(time<30&&(liftoff===undefined||time<liftoff+6)){
   if(!mobile&&c.currentSpeed>=c.currentAircraft.takeoffSpeed*.8)c.heldActions.add('pitchUp');
   const before=c.airplane.position.clone(),wasGround=c.onGround;
   c.updateFlight(dt);time+=dt;
   assert.equal(validateClientTransform(before,c.airplane.position,dt*1000,c.currentAircraft).accepted,true);
   if(wasGround&&!c.onGround){
    liftoff=time;assert.equal(c.velocity.y,0,'wheel release must not inject vertical speed');
    assert.equal(c.airplane.position.y,527);assert(c.takeoffRollMeters>=c.currentAircraft.minimumTakeoffRoll);
   }
   if(liftoff!==undefined&&time-liftoff<.5)maxEarlyAcceleration=Math.max(maxEarlyAcceleration,(c.currentSpeed-previousSpeed)/dt);
   previousSpeed=c.currentSpeed;
  }
  assert(liftoff!==undefined&&liftoff<20,`${type}: timely liftoff`);assert(c.airplane.position.y>532,`${type}: lift raises the aircraft`);
  assert(maxEarlyAcceleration<c.currentAircraft.groundAcceleration*1.5,`${type}: smooth first half-second`);
  if(fps===60&&!mobile)t.diagnostic(`${type}: liftoff ${liftoff.toFixed(2)}s; height after 6s ${(c.airplane.position.y-527).toFixed(1)}m`);
 }
});

test('full runway power continues accelerating above the old ground cap, while braking and no-input taxi remain controlled',()=>{
 for(const [type,oldCap]of Object.entries({trainer:75,privateJet:95,cargo:90,fighter:125})){
  const c=flight(type),dt=1/60;
  for(let i=0;i<15/dt;i++)c.updateFlight(dt);
  assert(c.onGround);assert(c.currentSpeed>oldCap);assert(c.currentSpeed<=c.currentAircraft.groundMaxSpeed);
  c.heldActions.delete('throttleUp');c.heldActions.add('throttleDown');
  const stopSeconds=c.currentSpeed/(c.currentAircraft.groundDrag*2.6)+1;
  for(let i=0;i<stopSeconds/dt;i++)c.updateFlight(dt);
  assert(Math.abs(c.currentSpeed)<=10,'braking stops forward motion before slow reverse');
  c.heldActions.clear();for(let i=0;i<2/dt;i++)c.updateFlight(dt);assert.equal(c.currentSpeed,0);
 }
});

test('airborne turns ease in, reverse through level, and settle symmetrically', () => {
 for (const type of Object.keys(aircraftDefinitions)) for (const hz of [30, 60, 120]) for (const touch of [false, true]) {
  const dt = 1 / hz;
  function simulate(direction) {
   const c = flight(type);
   c.heldActions.clear();
   c.onGround = false;
   c.airplane.position.y += 4000;
   c.throttle = 0.6;
   c.currentSpeed = c.currentAircraft.maxSpeed * 0.5;
   c.velocity.z = -c.currentSpeed;
   let input = 0;
   c.mobileInput.getSteeringInput = () => ({ x: touch ? -input : 0, y: 0 });
   function command(value) {
    input = value;
    c.heldActions.clear();
    if (!touch && value !== 0) c.heldActions.add(value > 0 ? 'yawLeft' : 'yawRight');
   }
   const trace = [];
   function step() {
    const previousHeading = c.heading;
    c.updateFlight(dt);
    const yaw = c.heading - previousHeading;
    if (!touch) {
     assert.ok(yaw * c.roll >= -1e-9, `${type}: nose turned against the bank`);
     assert.ok(Math.abs(yaw) / dt < 75 * Math.PI / 180, `${type}: keyboard turn too sharp`);
    }
    trace.push([c.roll, yaw]);
   }
   command(direction);
   step();
   const firstBank = Math.abs(c.roll);
   for (let frame = 1; frame < 3 * hz; frame++) step();
   const immediateBank = controls.stepCoordinatedBank(0, 0.9, dt, c.currentAircraft);
   if (!touch) assert.ok(firstBank < immediateBank * 0.9, `${type}: bank snapped in`);
   assert.ok(c.roll * direction > 0.6, `${type}: turn never established`);
   command(-direction);
   for (let frame = 0; frame < 5 * hz; frame++) step();
   assert.ok(c.roll * direction < -0.6, `${type}: reversal never established`);
   command(0);
   for (let frame = 0; frame < 6 * hz; frame++) step();
   assert.ok(Math.abs(c.roll) < 0.01, `${type}: turn did not level out`);
   return trace;
  }
  const left = simulate(1), right = simulate(-1);
  for (let frame = 0; frame < left.length; frame++) {
   assert.ok(Math.abs(left[frame][0] + right[frame][0]) < 1e-8, `${type}: left and right bank diverged`);
   assert.ok(Math.abs(left[frame][1] + right[frame][1]) < 1e-8, `${type}: left and right yaw diverged`);
  }
 }
});
