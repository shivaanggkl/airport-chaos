import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
import { keyboardActionBindings } from '../../client/src/flight-input.ts';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.ts';
import { airbornePitchTarget, normalizedPitchCommand, stepCoordinatedBank, COORDINATED_BANK_CAP } from '../../shared/flight-control-rules.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const flight = source.slice(source.indexOf('function updateFlight('), source.indexOf('function updateCamera('));
// Execute the real throttle, pitch-input and attitude sections. Omit only the
// unrelated weather, weapons, world queries and translation/collision work.
const throttle = flight.slice(flight.indexOf('  const throttleUp'), flight.indexOf('  const landingAssistAirport'));
const input = flight.slice(flight.indexOf('  const keyboardPitchInput'), flight.indexOf('  if (!onGround && activeWeatherZone'));
const attitude = flight.slice(flight.indexOf('  const speedRatio'), flight.indexOf('  const forwardSpeed ='));
const script = new vm.Script(ts.transpileModule(`function frame(){${throttle}${input}${attitude}}`.replaceAll('import.meta.env.DEV', 'false'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText);

assert.equal(missionJourneyDetails.length, 24);
test('W/S retain their selected throttle after release on the runway and airborne across all missions and aircraft',()=>{
 const code=ts.transpileModule(`function frame(){${throttle}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const mission of [...missionJourneyDetails,{id:'free-fly'},{id:'sky-duel'},{id:'air-assault'}])for(const aircraft of Object.values(aircraftDefinitions))for(const onGround of [false,true]){
  const heldActions=new Set(),state=vm.createContext({THREE,journeyAttempt:{missionId:mission.id},currentAircraft:aircraft,onGround,
   throttle:.4,currentSpeed:100,delta:1/60,heldActions,mobileInput:{getThrottleTarget:()=>undefined},
   moveToward:(value,target,amount)=>value<target?Math.min(target,value+amount):Math.max(target,value-amount)});
  vm.runInContext(code,state);
  for(const action of ['throttleUp','throttleDown']){
   heldActions.add(action);
   for(let i=0;i<12;i++)state.frame();
   heldActions.clear();
   const selected=state.throttle;
   if(action==='throttleUp')assert(selected>.4);
   else assert(selected<.4);
   for(let i=0;i<600;i++)state.frame();
   assert.equal(state.throttle,selected,`${mission.id} ${aircraft.callsign} ${onGround?'runway':'air'} ${action}: released lever drifted`);
  }
 }
});

test('keyboard takeover clears a stale dragged throttle and renders the retained value through the existing lever',()=>{
 const source=readFileSync(new URL('../../client/src/mobile-input.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('mobile-input.ts',source,ts.ScriptTarget.Latest,true);
 const controller=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.members.some(m=>m.name?.getText(ast)==='syncFlightState'));
 const method=controller.members.find(m=>m.name?.getText(ast)==='syncFlightState');
 const ctx=vm.createContext({clamp:(n,min,max)=>Math.min(max,Math.max(min,n))});
 vm.runInContext(ts.transpileModule(`function ${method.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 for(const desktop of [true,false]){
  const rendered=[],lever={classList:{toggle(){}},dataset:{}},ui={throttleTarget:.2,lastBoostReady:true,throttleBoostRequested:false,
   root:{classList:{contains:()=>desktop},querySelector:()=>lever},renderThrottle:(...args)=>rendered.push(args)};
  ctx.syncFlightState.call(ui,.8,100,false,true);
  assert.equal(ui.throttleTarget,undefined,'keyboard takes ownership without restoring an old touch/drag target');
  ctx.syncFlightState.call(ui,.8,100,false,false);
  assert.deepEqual(rendered.map(args=>args[0]),[.8,.8],'lever stays at the selected value after key release');
  ui.throttleTarget=.6;
  ctx.syncFlightState.call(ui,.8,100,false,false);
  assert.equal(ui.throttleTarget,.6,'touch/drag targets still persist when keyboard input is absent');
 }
});

for (const [slot, mission] of missionJourneyDetails.entries()) {
  for (const [type, aircraft] of Object.entries(aircraftDefinitions)) {
    test(`M${slot + 1} ${mission.id}, ${aircraft.callsign}: W/S change speed request without pitch`, () => {
      assert.equal(keyboardActionBindings.KeyW, 'throttleUp');
      assert.equal(keyboardActionBindings.KeyS, 'throttleDown');
      for (const pitchCommand of [0, 1, -1]) {
        const outcomes = [];
        for (const key of ['KeyW', 'KeyS']) {
          const heldActions = new Set([keyboardActionBindings[key]]);
          if (pitchCommand) heldActions.add(keyboardActionBindings[pitchCommand > 0 ? 'ArrowUp' : 'ArrowDown']);
          const state = {
            THREE, airbornePitchTarget, normalizedPitchCommand, stepCoordinatedBank, COORDINATED_BANK_CAP,
            journeyAttempt: { missionId: mission.id, status: 'RACING' }, aircraftType: type,
            delta: 1 / 60, heldActions, mobileInput: { getThrottleTarget: () => undefined, getPitchInverted: () => false },
            currentAircraft: aircraft, throttle: .5, onGround: false,
            moveToward: (value, target, amount) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount),
            currentSpeed: aircraft.maxSpeed * .5, touchSteering: { x: 0, y: 0 },
            pitchControlStrength: 0, pitch: 0, heading: .3, roll: 0,
            turnInput: 0, yawInput: 0, yawControlStrength: 0, landingAssistActive: false,
            airplane: new THREE.Group(), forward: new THREE.Vector3(0, 0, -1), liftDirection: new THREE.Vector3(),
          };
          vm.createContext(state);
          script.runInContext(state);
          const frames = [];
          for (let frame = 0; frame < 120; frame++) {
            // Include changes through takeoff/stall speeds: attitude remains
            // pilot-controlled while the separate lift calculation can sink.
            state.currentSpeed = frame < 60 ? aircraft.maxSpeed * .5 : aircraft.stallSpeed * .5;
            vm.runInContext('frame()', state);
            frames.push(state.airplane.quaternion.clone());
          }
          assert(key === 'KeyW' ? state.throttle > .5 : state.throttle < .5);
          if (pitchCommand === 0) assert.equal(Math.abs(state.pitch), 0);
          else assert.equal(Math.sign(state.pitch), pitchCommand, 'explicit pitch still works alongside throttle');
          outcomes.push(frames);
        }
        for (let frame = 0; frame < 120; frame++) {
          assert(outcomes[0][frame].angleTo(outcomes[1][frame]) < 1e-7, 'throttle changed aircraft attitude');
        }
      }
    });
  }
}
