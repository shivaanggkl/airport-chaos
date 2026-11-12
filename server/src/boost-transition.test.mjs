import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {aircraftDefinitions} from '../../client/src/aircraft.ts';
import * as controls from '../../shared/flight-control-rules.mjs';

const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const power=main.slice(main.indexOf('  const boostThrust =',main.indexOf('function updateFlight(')),main.indexOf('  velocity.addScaledVector(forward, thrust * delta);',main.indexOf('function updateFlight(')));
const code=ts.transpileModule(`function forces(){${power}return {acceleration:thrust-drag,target:cruiseTarget};}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('Boost blend is bounded, reversible, and independent of frame rate',()=>{
 for(const active of [true,false]){
  const results=[];
  for(const hz of [30,60,120]){
   let blend=active?0:1;
   for(let frame=0;frame<hz;frame++){
    const previous=blend;blend=controls.stepBoostBlend(blend,active,1/hz);
    assert(blend>=0&&blend<=1);assert(Math.abs(blend-previous)<.1);
   }
   results.push(blend);
  }
  assert(Math.max(...results)-Math.min(...results)<1e-10);
 }
 assert.equal(controls.stepBoostBlend(.4,true,0),.4);
 assert(controls.stepBoostBlend(.4,false,1/60)<.4);
});

for(const [type,e] of Object.entries(aircraftDefinitions))test(`${type}: actual flight forces ease Boost on/off and preserve speed targets`,()=>{
 const ctx=vm.createContext({...controls,THREE,currentAircraft:e,throttle:.85,takeoffThrustBlend:1,delta:1/60,
  airspeed:e.maxSpeed,forwardSpeed:e.maxSpeed,angleOfAttack:0,speedBrakeStrength:0,landingAssistActive:false,speedBonus:0,mobileThrottleTarget:undefined,
  boostActive:false,boostVisualStrength:0,smoothstep01:x=>x*x*(3-2*x)});
 vm.runInContext(code,ctx);
 const forces=()=>vm.runInContext('forces()',ctx);
 const normal=forces();
 assert.equal(normal.target,controls.throttleSpeedTarget(.85,e));
 ctx.boostActive=true;ctx.boostVisualStrength=1;
 assert.equal(forces().target,e.maxSpeed*e.boostMaxSpeed);
 // Compare press/release force jumps to the former binary switch at identical
 // airspeed, including pressing Boost again while still above normal speed.
 for(const ratio of [.8,1,1.2])for(const active of [true,false]){
  ctx.airspeed=ctx.forwardSpeed=e.maxSpeed*ratio;
  const beforeBlend=active?0:1;ctx.boostVisualStrength=beforeBlend;ctx.boostActive=!active;
  const before=forces();
  ctx.boostActive=active;ctx.boostVisualStrength=controls.stepBoostBlend(beforeBlend,active,1/60);
  const after=forces();
  ctx.boostVisualStrength=active?1:0;const binary=forces();
  assert(Math.abs(after.acceleration-before.acceleration)<=Math.abs(binary.acceleration-before.acceleration)*.1+1e-8,
    `${type} ${ratio} ${active?'press':'release'}: acceleration changes gradually`);
 }
 // A held burst reaches the unchanged target; release returns smoothly without
 // an instantaneous speed assignment or altered aircraft envelope.
 ctx.airspeed=ctx.forwardSpeed=controls.throttleSpeedTarget(.85,e);ctx.boostVisualStrength=0;
 for(const active of [true,false]){
  for(let frame=0;frame<60*180;frame++){
   ctx.boostActive=active;ctx.boostVisualStrength=controls.stepBoostBlend(ctx.boostVisualStrength,active,1/60);
   const {acceleration}=forces();
   ctx.airspeed=ctx.forwardSpeed=Math.max(0,ctx.forwardSpeed+acceleration/60);
   assert(ctx.airspeed<=e.maxSpeed*e.boostMaxSpeed*1.001);
  }
  const target=active?e.maxSpeed*e.boostMaxSpeed:controls.throttleSpeedTarget(.85,e);
  assert(Math.abs(ctx.airspeed-target)/target<.001);
 }
});

test('the shared flight update preserves reserve drain, release recharge and immediate braking/ground safety',()=>{
 const start=main.indexOf('  const boostRequested =',main.indexOf('function updateFlight('));
 const end=main.indexOf('  const touchSteeringTarget',start);
 const code=ts.transpileModule(`function updateBoost(){${main.slice(start,end)}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const e of Object.values(aircraftDefinitions)){
  const ctx=vm.createContext({...controls,currentAircraft:e,onGround:false,crashed:false,throttleDown:false,landingAssistActive:false,
    heldActions:new Set(['boost']),boostMeter:100,boostActive:false,boostVisualStrength:0,delta:1/60});
  vm.runInContext(code,ctx);ctx.updateBoost();
  assert.equal(ctx.boostActive,true);assert(ctx.boostVisualStrength>0&&ctx.boostVisualStrength<.05);
  assert.equal(ctx.boostMeter,100-e.boostDrain/60);
  const blend=ctx.boostVisualStrength,meter=ctx.boostMeter;
  ctx.heldActions.clear();ctx.updateBoost();
  assert.equal(ctx.boostActive,false);assert(ctx.boostVisualStrength>0&&ctx.boostVisualStrength<blend);
  assert.equal(ctx.boostMeter,Math.min(100,meter+e.boostRegen/60));
  for(const safety of ['onGround','throttleDown','landingAssistActive']){
   ctx[safety]=true;ctx.boostVisualStrength=1;ctx.heldActions.add('boost');ctx.updateBoost();
   assert.equal(ctx.boostActive,false);assert.equal(ctx.boostVisualStrength,0);ctx[safety]=false;
  }
  ctx.boostMeter=0;ctx.boostVisualStrength=1;ctx.updateBoost();
  assert.equal(ctx.boostActive,false);assert(ctx.boostVisualStrength>0&&ctx.boostVisualStrength<1);
  assert.equal(ctx.boostMeter,0,'held depleted Boost cannot recharge');
 }
});
