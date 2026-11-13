import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraftFlightEnvelope,MPH_PER_METER_PER_SECOND as mph} from '../../shared/aircraft-flight-envelope.mjs';
import {cruiseThrottleStops,cruiseThrottleSelection,throttleSpeedTarget,throttleDecelerationResponse,controlledEngineThrust,throttleTargetDeceleration} from '../../shared/flight-control-rules.mjs';
for(const [type,expected] of Object.entries({trainer:[1518.75,2733.75,5467.5,7776],cargo:[1771.875,3189.375,6378.75,8859.375],privateJet:[2278.125,4100.625,8201.25,11846.25],fighter:[2531.25,4556.25,9112.5,13668.75]}))test(type+' actual level-flight controller settles at landing SLOW and approved cruise speeds and returns from boost',()=>{
 const e=aircraftFlightEnvelope[type];
 for(const dt of [1/30,1/120]){
 let speed=e.takeoffSpeed;
 for(const mode of [1,2,3,4,2,1]){
  const boost=mode===4,throttle=cruiseThrottleStops[boost?2:mode],target=boost?e.maxSpeed*e.boostMaxSpeed:throttleSpeedTarget(throttle,e);
  assert.ok(Math.abs(target*mph-(mode===1?e.safeLandingSpeed*.95*mph:expected[mode-1]))<.001);
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
 assert.equal(throttleSpeedTarget(0,e),e.stallSpeed*.81);
 for(const stop of cruiseThrottleStops)assert.equal(cruiseThrottleSelection(stop+.001),stop===0?.001:stop);
});
