import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as controls from '../../shared/flight-control-rules.mjs';
import { mobileIdleBrakeRequested } from '../../shared/mobile-input-rules.mjs';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
import { cityAirports } from '../../shared/city-airports.mjs';
import { createContext, runInContext } from 'node:vm';
import * as THREE from 'three';
import ts from 'typescript';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { observedChampionshipLanding } from './championship-landing.js';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = source.indexOf('  const flareHeight =');
const flare = source.slice(start, source.indexOf('  if (airspeed >', start));
const code = ts.transpileModule(`function flareStep() {${flare}}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

// Worst case: the aircraft has lost all lift at VERY SLOW. Exercise the actual
// client flare with gravity, then require the server's unchanged landing checks.
test('all aircraft can arrest a VERY SLOW runway stall before touchdown at 30/60/120 FPS', () => {
  for (const envelope of Object.values(aircraftFlightEnvelope)) for (const fps of [30,60,120]) {
    const velocity = new THREE.Vector3(0,-30,-envelope.stallSpeed*.81);
    const context = createContext({THREE,Math,throttle:0,delta:1/fps,currentAircraft:envelope,
      landingSpeedTarget:controls.landingApproachSpeedTarget(0,envelope),landingAssistActive:true,currentSpeed:30,approachHeight:159,velocity});
    runInContext(code,context);
    let frames=0;
    while(context.approachHeight>0 && frames++<fps*30){
      velocity.y-=9.81/fps;
      runInContext('flareStep()',context);
      context.approachHeight+=velocity.y/fps;
    }
    assert.ok(context.approachHeight<=0,'must reach runway');
    assert.ok(velocity.y>=-envelope.safeDescentRate*1.35,`safe descent at ${fps} FPS`);
    assert.ok(observedChampionshipLanding({x:0,y:0,z:0},velocity,{x:0,y:0,z:0},
      {x:0,z:0,heading:0,runwayWidth:100,runwayLength:1000},0,
      {speed:envelope.safeLandingSpeed,descent:envelope.safeDescentRate,tilt:envelope.landingTilt}));
  }
});

test('flare stays off away from a runway and retains the existing flare above SLOW',()=>{
  for(const [throttle,active,height,shouldSoften] of [[0,false,10,false],[.45,true,100,false],[.45,true,10,true],[0,true,100,true]] as const){
    const velocity=new THREE.Vector3(0,-30,-30);
    const context=createContext({THREE,Math,throttle,landingSpeedTarget:active?controls.landingApproachSpeedTarget(throttle,aircraftFlightEnvelope.trainer):undefined,landingAssistActive:active,approachHeight:height,
      delta:1/60,currentSpeed:30,currentAircraft:aircraftFlightEnvelope.trainer,velocity});
    runInContext(code,context);runInContext('flareStep()',context);
    assert.equal(velocity.y>-30,shouldSoften);
  }
});


test('actual flight update lands VERY SLOW through SLOW approaches, including joining the runway close to touchdown',()=>{
  const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
  const functionCode=(name:string)=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!.getText(ast);
  const fullCode=ts.transpileModule(functionCode('updateFlight').replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const factorySource=readFileSync(new URL('./takeoff-transition.test.mjs',import.meta.url),'utf8');
  const factoryAst=ts.createSourceFile('factory.mjs',factorySource,ts.ScriptTarget.Latest,true);
  const factory= factoryAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='flight')!.getText(factoryAst).replace('export ','');
  const factoryContext=createContext({controls,THREE,assert,mobileIdleBrakeRequested,aircraftDefinitions,
    vm:{createContext,runInContext},code:fullCode});
  runInContext(factory,factoryContext);
  for(const type of Object.keys(aircraftDefinitions))for(const lever of [0,.08,.12,.18,.25,.30,controls.cruiseThrottleStops[1]])for(const height of [5,25,159])for(const fps of [30,60,120])for(const approachSpeed of ["stalled","landing"]){
    const c=factoryContext.flight(type,true),airport=cityAirports.dallas.find(a=>a.id==='love')!;
    c.airports=[airport];c.onGround=false;c.heldActions.clear();c.heldActions.add('pitchDown');c.throttle=lever;
    c.airplane.position.set(airport.x,527+height,airport.z);
    c.currentSpeed=approachSpeed==="stalled"?c.currentAircraft.stallSpeed*.81:c.currentAircraft.safeLandingSpeed*1.1;
    c.velocity.set(0,-30,-c.currentSpeed);
    c.mobileInput.getThrottleTarget=()=>lever;c.mobileInput.getSteeringInput=()=>({x:0,y:0});
    c.rewardLanding=(_airport:unknown,q:{speed:number;descentRate:number;pitch:number;bankAngle:number})=>{
      assert.ok(observedChampionshipLanding({x:0,y:0,z:0},{x:0,y:q.descentRate,z:-q.speed},
        {x:q.pitch,y:0,z:q.bankAngle},{x:0,z:0,heading:0,runwayWidth:100,runwayLength:1000},0,
        {speed:c.currentAircraft.safeLandingSpeed,descent:c.currentAircraft.safeDescentRate,tilt:c.currentAircraft.landingTilt}),
        `actual touchdown server check: ${type} ${lever} ${height} ${fps} ${JSON.stringify(q)}`);
    };c.handleContractLanding=()=>{};
    c.endRun=(_status:string,reason:string)=>assert.fail(`${type} lever ${lever} height ${height} ${fps}fps: ${reason}`);
    c.beginCrashPresentation=()=>{};
    const functions=['getAirportAtPosition','runwayHeadingError','getLandingAssistAirport','evaluateLanding'].map(functionCode).join('\n');
    runInContext(ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
    c.landingPrecisionScore=()=>1;
    // Touchdown scoring follows the normal successful landing branch.
    for(let frame=0;frame<fps*30&&!c.onGround;frame++)c.updateFlight(1/fps);
    assert.equal(c.onGround,true,`${type} lever ${lever} height ${height} ${fps} FPS must touch down: y=${c.airplane.position.y} speed=${c.currentSpeed} vy=${c.velocity.y}`);
  }
});


test('low runway approach targets cover the visible VERY SLOW label without changing cruise modes',()=>{
  const labelThrottle=(1-.90)/.82;
  for(const envelope of Object.values(aircraftFlightEnvelope)){
    for(const throttle of [0,.08,labelThrottle,.18,.25,.30,controls.cruiseThrottleStops[1]]){
      const target=controls.landingApproachSpeedTarget(throttle,envelope)!;
      assert.ok(target>envelope.stallSpeed&&target<=envelope.safeLandingSpeed);
    }
    for(const throttle of controls.cruiseThrottleStops.slice(2))assert.equal(controls.landingApproachSpeedTarget(throttle,envelope),undefined);
  }
});

test('runway crash assessment still rejects overspeed, hard impacts, extreme bank and off-runway contact',()=>{
  const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='evaluateLanding')!;
  const context=createContext({THREE,Math,currentAircraft:aircraftDefinitions.trainer,landingAssistActive:true,
    runwayHeadingError:()=>0,currentSpeed:40,verticalSpeed:-5,pitch:0,roll:0,result:{}});
  runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  for(const [speed,descent,bank,airport,reason] of [[200,-5,0,true,'TOO FAST'],[40,-40,0,true,'CAME DOWN TOO HARD'],
    [40,-5,1.5,true,'WINGS NOT LEVEL'],[40,-5,0,false,'OFF RUNWAY']] as const){
    Object.assign(context,{currentSpeed:speed,verticalSpeed:descent,roll:bank,airport:airport?{}:null});
    runInContext('evaluateLanding(airport,result)',context);
    assert.equal(context.result.reason,reason);
  }
});


test('SLOW and every lever position below it request landing-safe speeds for every aircraft',()=>{
  for(const envelope of Object.values(aircraftFlightEnvelope)){
    let previous=0;
    for(let step=0;step<=100;step++){
      const throttle=controls.cruiseThrottleStops[1]*step/100;
      const target=controls.throttleSpeedTarget(throttle,envelope);
      assert.ok(target>=previous&&target<=envelope.safeLandingSpeed);
      previous=target;
    }
  }
});
