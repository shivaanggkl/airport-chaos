import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as controls from '../../shared/flight-control-rules.mjs';
import * as missions from '../../shared/journey-mission.mjs';
import * as protocol from '../../shared/protocol.mjs';
import {mobileIdleBrakeRequested} from '../../shared/mobile-input-rules.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {aircraftDefinitions} from '../../client/src/aircraft.js';
import {JourneyAttemptStore} from './journey-attempts.js';
import {createStationaryWarlordEncounter} from './stationary-warlord.js';
import {createStrikingWarlordEncounter} from './striking-warlord.js';
import {stepM19,permittedM19Damage,disposeM19} from './m19-titan.js';
import {monsterBuildingCoverage,indexBuildingsForOcclusion} from './monster-arrival.js';
import {transportBuildingCoverage} from './giant-incoming.js';
import {loadDallasCombatBuildings} from './dallas-building-occlusion.js';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {dallasElevationAt as ground} from './dallas-elevation.js';
import {getTerrainHeight} from '../../client/src/dallas-world.js';
import {validateClientTransform} from './transform-validation.js';
const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),serverAst=ts.createSourceFile('index.ts',server,ts.ScriptTarget.Latest,true);
const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8'),clientAst=ts.createSourceFile('main.ts',client,ts.ScriptTarget.Latest,true);
const no=()=>{},clientGround=(x,z)=>getTerrainHeight(x/3,z/3)*3,buildings=loadDallasCombatBuildings([monsterBuildingCoverage(),transportBuildingCoverage()]);
indexBuildingsForOcclusion(buildings);
export function simulate(mission,createEncounter=mission.id===missions.journeyDallas25.id?createStationaryWarlordEncounter:createStrikingWarlordEncounter){
 const directory=mkdtempSync(join(tmpdir(),'p13-boss-')),path=join(directory,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 const store=new JourneyAttemptStore(path,true),epoch=100000,dt=1/60;
 const airport=cityAirports.dallas.find(a=>a.id===mission.startAirportId);
 const airplane=new THREE.Group();airplane.position.set(airport.x,clientGround(airport.x,airport.z)+1.2,airport.z+Math.min(airport.runwayLength*.32,airport.runwayLength*.5-120));
 const departure=airplane.position.clone();let elapsed=0,input={x:0,y:-.8},throttleTarget=.8,firstCombat,takeoffAt,lastFire=-Infinity,shots=[],hits=0,pilotHealth=200;
 const velocity=new THREE.Vector3(),e=aircraftDefinitions.trainer;
 const fn=clientAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');
 const flight=vm.createContext({...controls,THREE,Math,Number,mobileIdleBrakeRequested,airplane,currentAircraft:e,aircraftType:'trainer',velocity,forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),heldActions:new Set(),throttle:0,currentSpeed:0,verticalSpeed:0,heading:0,pitch:0,roll:0,onGround:true,landedFeedbackTime:0,cameraShakeTime:0,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,bankControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:0,takeoffRollMeters:0,resetRegionsOnNextTakeoff:false,flightDistanceSinceTakeoff:0,speedBonus:0,flightState:'TAXI',performance:{now:()=>elapsed*1000},groundPlaneY:(x,z)=>clientGround(x,z)+1.2,getLandingAssistAirport:()=>null,getAirportAtPosition:p=>Math.abs(p.x-airport.x)<=airport.runwayWidth*3&&Math.abs(p.z-airport.z)<=airport.runwayLength/2+350?airport:null,updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:()=>assert.fail('unexpected crash'),endRun:()=>assert.fail('unexpected flight end'),landingStatus:{},evaluateLanding:()=>assert.fail(JSON.stringify({elapsed,pitch:flight.pitch,position:airplane.position,velocity,speed:flight.currentSpeed,takeoffAt})),setFlightState:state=>{flight.flightState=state;},beginFlightRecap:no,handleContractTakeoff:no,contextualHints:{trigger:no},mobileInput:{getThrottleTarget:()=>throttleTarget,getSteeringInput:()=>input,getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)});
 vm.runInContext(ts.transpileModule(fn.getText(clientAst).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,flight);
 const attempt=store.launch('pilot','trainer',epoch,mission.id);store.approach('pilot',attempt.attemptId,epoch);
 assert.equal(store.get('pilot',attempt.attemptId).deadlineAt,null,'intro has no gameplay deadline');
 store.startMonsterArrival('pilot',attempt.attemptId,epoch);
 const encounter=createEncounter(attempt.attemptId,'owner',epoch,ground,buildings);
 const combat=vm.createContext({...missions,players:new Map([['owner',{pilotId:'pilot',cityId:'dallas',isBot:false}]]),playerJourneyAttempts:new Map([['owner',attempt.attemptId]]),monsterEncounters:new Map([[attempt.attemptId,encounter]]),journeyStore:store,disposeM19,sendJourneyState:no,sendToPlayer:no,removeJourneyHunter:no,sendProfile:no,profileStore:{getOrCreate:()=>({})}});
 const hitHandler=serverAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applyMonsterHit');
 vm.runInContext(ts.transpileModule(hitHandler.getText(serverAst),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,combat);
 try{
 while(elapsed<mission.timeLimitMs/1000 && pilotHealth>0 && store.get('pilot',attempt.attemptId).status==='RACING'){
  const now=epoch+Math.round(elapsed*1000),frame=encounter.frame;
  const goal=new THREE.Vector3(frame.position.x,frame.position.y+mission.monster.height*.65,frame.position.z);
  const range=goal.distanceTo(airplane.position),heading=Math.atan2(-(goal.x-airplane.position.x),-(goal.z-airplane.position.z));
  const error=Math.atan2(Math.sin(heading-flight.heading),Math.cos(heading-flight.heading));
  throttleTarget=flight.onGround?.8:range>4500?.3:.22;
  const desiredVy=THREE.MathUtils.clamp((goal.y-airplane.position.y)*.12,-45,45);
  input={x:flight.onGround?0:-THREE.MathUtils.clamp(error*1.3,-.85,.85),y:flight.onGround?-.8:-THREE.MathUtils.clamp(.12+(desiredVy-velocity.y)*.04,-.65,.8)};
  const before=airplane.position.clone();flight.updateFlight(dt);elapsed+=dt;
  assert(validateClientTransform(before,airplane.position,dt*1000,e,0).accepted,'legal aircraft motion');assert.equal(flight.boostActive,false);
  if(takeoffAt===undefined&&!flight.onGround){takeoffAt=elapsed;assert(airplane.position.distanceTo(departure)>=e.minimumTakeoffRoll);assert(flight.currentSpeed>=e.takeoffSpeed);}
  stepM19(encounter,airplane.position,velocity,18,now);
  for(const event of encounter.events)pilotHealth-=permittedM19Damage(encounter,event,now);
  if(takeoffAt!==undefined&&range<protocol.COMBAT_RANGE&&now-lastFire>=protocol.fireIntervalMs('trainer')){
   const origin=airplane.position.clone().add(new THREE.Vector3(...Object.values(aircraftPresentationMuzzleSockets.trainer.position)).applyQuaternion(airplane.quaternion));
   const solution=protocol.ballisticIntercept(origin,velocity,goal,encounter.frame.velocity);
   const forward=new THREE.Vector3(0,0,-1).applyQuaternion(airplane.quaternion);
   if(solution&&forward.dot(new THREE.Vector3(solution.direction.x,solution.direction.y,solution.direction.z))>=Math.cos(protocol.AIM_ENVELOPE)){
    lastFire=now;shots.push({position:origin,direction:new THREE.Vector3(solution.direction.x,solution.direction.y,solution.direction.z),speed:protocol.ballisticShotSpeed(velocity,solution.direction),travel:0});
   }
  }
  for(let index=shots.length-1;index>=0;index--){
   const shot=shots[index],from=shot.position.clone(),step=Math.min(shot.speed*dt,protocol.COMBAT_RANGE-shot.travel);shot.position.addScaledVector(shot.direction,step);shot.travel+=step;
   const damage=combat.applyMonsterHit('owner','dallas',from,shot.position,now,protocol.projectileDamageForAircraft('trainer'),dt);
   if(damage){firstCombat??=elapsed;hits++;shots.splice(index,1);}
   else if(shot.travel>=protocol.COMBAT_RANGE)shots.splice(index,1);
  }
 }
 const result={takeoff:takeoffAt,firstCombat,completion:elapsed,hits,pilotHealth,distance:Math.hypot(departure.x-mission.monster.x,departure.z-mission.monster.z),status:store.get('pilot',attempt.attemptId).status};
 assert.equal(result.status,'COMPLETED',JSON.stringify(result));assert(pilotHealth>0);assert(mission.timeLimitMs/1000-elapsed>=45,JSON.stringify(result));
 assert(firstCombat>=30&&firstCombat<=90,JSON.stringify(result));
 return result;
 }finally{disposeM19(encounter);db.close();rmSync(directory,{recursive:true,force:true});}
}
for(const mission of [missions.journeyDallas25,missions.journeyDallas20])test(`${mission.name}: real non-Boost Bluejay flight and swept Titan hits`,t=>{t.diagnostic(JSON.stringify(simulate(mission)));});
