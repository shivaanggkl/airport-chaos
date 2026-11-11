import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraftFlightEnvelope,MPH_PER_METER_PER_SECOND as mph} from '../../shared/aircraft-flight-envelope.mjs';
import {cruiseThrottleStops,cruiseThrottleSelection,throttleSpeedTarget,throttleDecelerationResponse,controlledEngineThrust,throttleTargetDeceleration} from '../../shared/flight-control-rules.mjs';
for(const [type,expected] of Object.entries({trainer:[1350,2430,4860,6912],cargo:[1575,2835,5670,7875],privateJet:[2025,3645,7290,10530],fighter:[2250,4050,8100,12150]}))test(type+' actual level-flight controller settles at all approved speeds and returns from boost',()=>{
 const e=aircraftFlightEnvelope[type];
 for(const dt of [1/30,1/120]){
 let speed=e.takeoffSpeed;
 for(const mode of [1,2,3,4,2,1]){
  const boost=mode===4,throttle=cruiseThrottleStops[boost?2:mode],target=boost?e.maxSpeed*e.boostMaxSpeed:throttleSpeedTarget(throttle,e);
  assert.ok(Math.abs(target*mph-expected[mode-1])<.001);
  for(let t=0;t<180;t+=dt){
   const drag=e.drag*(speed/e.maxSpeed)**2/e.inertia;
   const available=(throttle*e.acceleration+(boost?e.acceleration*(e.boostThrust-1):0))/e.inertia;
   const thrust=controlledEngineThrust(speed,target,available,drag,throttleDecelerationResponse(throttle,e));
   const brake=boost?0:throttleTargetDeceleration(speed,throttle,e);
   speed+=(thrust-drag-Math.max(0,brake))*dt;
  }
  assert.ok(Math.abs(speed-target)/target<.05,`${type} mode ${mode}: ${speed*mph}`);
  if(dt===1/30)console.log(type,mode,Math.round(speed*mph));
 }
 }
 assert.ok(throttleSpeedTarget(.08,e)<=e.safeLandingSpeed*1.051);
 assert.ok(throttleSpeedTarget(0,e)<e.stallSpeed);
 for(const stop of cruiseThrottleStops)assert.equal(cruiseThrottleSelection(stop+.001),stop===0?.001:stop);
});
