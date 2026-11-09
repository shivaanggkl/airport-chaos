import {transportPose,transportRouteForMission,transportCourse,transportFootprintRadius,transportFootprintForMission,transportScaleForMission,transportRouteLength,transportTuning} from '../../shared/giant-incoming.mjs';
import {createTransportEncounter,stepTransportEncounter,transportImpact,transportAircraftImpact,transportAltitude,transportFortressImpact,loadTransportBuildings} from './giant-incoming.js';
import {rearGuardShouldRejoin,createRearGuardFireState,rearGuardTakeoff,rearGuardShooter,rearGuardShotResolved} from './rear-guard-fire.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as missions from '../../shared/journey-mission.mjs';
import * as protocol from '../../shared/protocol.mjs';
import * as controls from '../../shared/flight-control-rules.mjs';
import {mobileIdleBrakeRequested} from '../../shared/mobile-input-rules.mjs';
import {aircraftDefinitions} from '../../client/src/aircraft.js';
import {missionJourneyDetails} from '../../client/src/mission-journey-content.js';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {cityAirports} from '../../shared/city-airports.mjs';
import {territoriesForCity,territoryContains} from '../../shared/city-territories.mjs';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {maxHealthForAircraft} from '../../shared/aircraft-health.mjs';
import {aircraftHitRadii,remoteAircraftVisualScale} from '../../shared/remote-aircraft-visual-rules.mjs';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import {projectileImpactFraction} from '../../shared/projectile-collision.mjs';
import {createOpponent,opponentAim,opponentReactionReady} from './opponent.js';
import {advanceHunterFlight,hunterFlightIntercept,hunterBallisticSolution,hunterObservedPosition} from './hunter-flight.js';
import {planOpponentTactics,recordOpponentHit,recordOpponentDamage,recordOpponentShot} from './opponent-tactics.js';
import {ambushApproach,ambushCanFire,ambushCruiseSpeed} from './surprise-attack.js';
import {boundJourneyHunterPoint,insideJourneyHunterArena,keepJourneyHunterInside} from './journey-hunter-airspace.js';
import {dallasElevationAt as ground} from './dallas-elevation.js';
import {getTerrainHeight} from '../../client/src/dallas-world.js';
const clientGround=(x,z)=>getTerrainHeight(x/3,z/3)*3;
import {loadDallasCombatBuildings} from './dallas-building-occlusion.js';
import {indexBuildingsForOcclusion,segmentBlockedByBuildings} from './monster-arrival.js';
import {validateClientTransform} from './transform-validation.js';
import {DALLAS_WORLD_SCALE} from '../../shared/dallas-world-scale.mjs';
import {finalShowdownFireReady,recordFinalShowdownShot} from './final-showdown.js';
import {CrossfireFireCoordinator} from './journey-crossfire.js';
import {pursuitProgress} from './hot-pursuit.js';
import {aceDamageAuthorized} from './journey-ace.js';
import {journeyHunterSteeringTarget} from './journey-hunter-airspace.js';
import {JourneyAttemptStore} from './journey-attempts.js';
// Real authored/map obstacles, indexed once for these focused encounter simulations.
const buildings=loadTransportBuildings();
indexBuildingsForOcclusion(buildings);
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8'),clientAst=ts.createSourceFile('main.ts',client,ts.ScriptTarget.Latest,true);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),no=()=>{};
function runtime(names,context) {
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const ctx=vm.createContext({...missions,...protocol,aircraftFlightEnvelope,cityAirports,enemyAiLevels,territoriesForCity,territoryContains,aircraftPresentationMuzzleSockets,
  CrossfireFireCoordinator,DALLAS_WORLD_SCALE,maxHealthForAircraft,hunterObservedPosition,createOpponent,advanceHunterFlight,hunterBallisticSolution,hunterFlightIntercept,opponentReactionReady,planOpponentTactics,ambushApproach,ambushCruiseSpeed,ambushCanFire,recordOpponentHit,recordOpponentDamage,pursuitProgress,aceDamageAuthorized,journeyHunterSteeringTarget,...context});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;
}
function fixture() {
 const dir=mkdtempSync(join(tmpdir(),'p10-transport-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 return {dir,db,store:new JourneyAttemptStore(path,true)};
}
// Execute the production client integrator at 60 Hz and server Hunter navigation/
// flight uses the actual client integrator at 60 Hz and projectile sweeps at 50 ms.
// Only I/O/presentation are stubbed. A seeded
// pilot uses legal stick/throttle/aim inputs against the actual transport weapons.
// Hits require ballistic travel, swept contact, clear geometry and applyTransportHit.
function simulate(mission) {
 const f=fixture(),epoch=Date.now(),crossfire=false,finale=false,escorted=mission.id===missions.journeyDallas08.id;let elapsed=0,firstEngagement,firstDamage,takeoffAt,firstEnemyShot,firstPilotShot,activatedAt;const dt=1/60,players=new Map(),runwayPrep=new Set(['owner']),dfwTakeoff=new Set(),loveTakeoff=new Set(),addisonTakeoff=new Set(),executiveTakeoff=new Set(),landing=new Map();
 const airport=cityAirports.dallas.find(a=>a.id===mission.startAirportId),along=Math.min(airport.runwayLength*.32,airport.runwayLength*.5-120);
 const airplane=new THREE.Group();airplane.position.set(airport.x,ground(airport.x,airport.z)+1.2,airport.z+along);
 const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,aircraftType:'trainer',position:{...airplane.position},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},health:maxHealthForAircraft('trainer'),maxHealth:maxHealthForAircraft('trainer'),spawnProtectedUntil:0,score:0,hasRespawnTransform:true};
 players.set('owner',pilot);landing.set('owner',{airborne:false});let input={x:0,y:-.8},throttleTarget=.5,enemyId;
 const velocity=new THREE.Vector3(),e=aircraftDefinitions.trainer;
 const fn=clientAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');
 const flight=vm.createContext({...controls,THREE,Math,Number,mobileIdleBrakeRequested,airplane,currentAircraft:e,aircraftType:'trainer',velocity,forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),heldActions:new Set(),throttle:0,currentSpeed:0,verticalSpeed:0,heading:0,pitch:0,roll:0,onGround:true,landedFeedbackTime:0,cameraShakeTime:0,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,bankControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:0,takeoffRollMeters:0,resetRegionsOnNextTakeoff:false,flightDistanceSinceTakeoff:0,speedBonus:0,flightState:'TAXI',performance:{now:()=>elapsed*1000},groundPlaneY:(x,z)=>clientGround(x,z)+1.2,getLandingAssistAirport:()=>null,getAirportAtPosition:()=>airport,updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:()=>assert.fail('unexpected crash'),endRun:()=>assert.fail('unexpected flight end'),evaluateLanding:()=>assert.fail('unexpected landing'),setFlightState:state=>{flight.flightState=state;},beginFlightRecap:no,handleContractTakeoff:no,contextualHints:{trigger:no},mobileInput:{getThrottleTarget:()=>throttleTarget,getSteeringInput:()=>input,getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)});
 vm.runInContext(ts.transpileModule(fn.getText(clientAst).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,flight);
 const a=f.store.launch('pilot','trainer',epoch,mission.id);f.store.approach('pilot',a.attemptId,epoch);
 const active=f.store.startGiantIncoming('pilot',a.attemptId,epoch);assert.equal(active.deadlineAt,epoch+mission.timeLimitMs);
 const altitude=transportAltitude(buildings,ground),encounter=createTransportEncounter(a.attemptId,'owner',epoch,altitude,mission.timeLimitMs,false,false,mission.id);
 const transportEncounters=new Map([[a.attemptId,encounter]]);
 const ctx=runtime(['applyCombatHit','spawnRearGuardEscorts','createBot','botStateMessage','transportEscortHealth','transportEscortCosmetics','hunterNavigationTarget','hunterTarget','clearHunterCombat','beginHunterApproach','hunterInterceptWaypoint','advanceBotFlight','moveTowardBot','isHunterCombatPhase','botMinimumTurnRadius','smoothHunter','hunterClearance','botSafeFloor','safeBotWaypoint','botCruiseFactor','runwayCombatProtected','runwayOrTaxiSpawnArea','botFireSolution','provokeJourneyHunter','skyHunterDepartureReady','applyTransportHit','muzzleTransform','rotateLocalYxz','normalize','dot','forwardDirection','hunterForward'],{
  players,playerJourneyAttempts:new Map([['owner',a.attemptId]]),transportEncounters,journeyStore:f.store,transportPose,transportImpact,transportFortressImpact,segmentBlockedByBuildings,transportBuildings:buildings,dallasTerrain:{elevationAt:ground},
  Date:class extends Date {static now(){return epoch+Math.round(elapsed*1000);}},
  createRearGuardFireState,rearGuardFire:new Map(),transportFlightAltitude:altitude,
  nextBotSerial:1,botNames:['Escort'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,keepJourneyHunterInside,
  botTerrainHeight:(_c,x,z)=>ground(x,z),botRunwayHeight:(_c,x,z)=>ground(x,z),dallasAirportElevations:new Map(cityAirports.dallas.map(a=>[a.id,ground(a.x,a.z)+1.2])),botTerrainSampleSpacing:500,
  botCombatClearance:609.6,botCruiseClearance:609.6,journeyAceClearance:300,hunterFireCone:.2,hunterFireRange:protocol.COMBAT_RANGE,defenderDownwardFireAngle:.4,
  playerJourneyRunwayPrep:runwayPrep,playerJourneyDfwTakeoff:dfwTakeoff,playerJourneyLoveTakeoff:loveTakeoff,playerJourneyExecutiveTakeoff:executiveTakeoff,playerJourneyAddisonTakeoff:addisonTakeoff,landingFlightState:landing,
  botCombatTarget:()=>undefined,missionFocusedPlayers:new Set(),projectiles:new Map(),insideJourneyHunterArena,focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),
  isHumanPilot:()=>false,markPlayerDestroyed:(id,p)=>{p.lifeState='destroyed';if(id==='owner')f.store.fail('pilot',a.attemptId,'CRASHED',epoch+elapsed*1000);},removeBot:id=>players.delete(id),botKillRewardMultiplier:.1,persistScore:no,broadcastLeaderboard:no,updateKing:no,cityKings:new Map(),handleWantedDestruction:no,challengeForPlayer:()=>undefined,
  failPlayerJourney:(_id,reason,now)=>f.store.fail('pilot',a.attemptId,reason,now),broadcastToCity:no,wrapAngle:a=>Math.atan2(Math.sin(a),Math.cos(a)),
  sendToPlayer:no,sendJourneyState:no,removeJourneyHunter:()=>transportEncounters.delete(a.attemptId),sendProfile:no,profileStore:{getOrCreate:()=>({})},removePlayerProjectiles:no,
 });
 if(escorted)ctx.spawnRearGuardEscorts('owner',pilot,f.store.get('pilot',a.attemptId),epoch);
 const attempt=f.store.get('pilot',a.attemptId),escortIds=escorted?[attempt.targetId,attempt.secondaryTargetId]:[],escorts=escortIds.map(id=>players.get(id));
 for(const actor of escorts){assert.equal(actor.health,1000);assert.equal(actor.aircraftType,'trainer');const pose=transportPose(0,altitude,mission.timeLimitMs,mission.id);assert.equal(transportAircraftImpact(actor.position,actor.position,actor.rotation,actor.rotation,actor.aircraftType,pose,pose),undefined,'escort spawn must clear the actual enlarged transport mesh');}
 const shots=[],escortShots=[],enemyTurns=new Map(),enemyLastFire=new Map();let seed=17;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 let lastPilotFire=-Infinity,pilotHits=0,pilotShots=0,receivedHits=0,maxEscortSeparation=0,lastHeading=0,crashed=false;
 const inverseThrottle=speed=>{let low=0,high=1;for(let i=0;i<16;i++){const middle=(low+high)/2;if(controls.throttleSpeedTarget(middle,e)<speed)low=middle;else high=middle;}return high;};
 try{
 while(elapsed<mission.timeLimitMs/1000&&pilot.health>0&&f.store.get('pilot',a.attemptId).status==='RACING'){
  const now=epoch+Math.round(elapsed*1000),pose=transportPose(elapsed*1000,altitude,mission.timeLimitMs,mission.id);
  const forward={x:-Math.sin(pose.yaw),z:-Math.cos(pose.yaw)},range=distance(pilot.position,pose);
  const weave=Math.sin(elapsed*.9)*700;
  let goal={x:pose.x-forward.x*2000+Math.cos(pose.yaw)*weave,y:pose.y+80+Math.sin(elapsed*.65)*70,z:pose.z-forward.z*2000-Math.sin(pose.yaw)*weave};
  const enemy=escorts.find(actor=>actor.lifeState==='alive'),enemyId=enemy?escortIds[escorts.indexOf(enemy)]:undefined;
  if(enemy){const lead=hunterBallisticSolution(pilot.position,pilot.velocity,enemy.position,enemy.velocity,enemyTurns.get(enemyId)??0);goal=lead?lead.point:{...enemy.position};}
  const selectedVelocity=enemy?.velocity??pose.velocity,selectedRange=enemy?distance(pilot.position,enemy.position):range;
  const intercept=enemy&&selectedRange<protocol.COMBAT_RANGE?goal:hunterFlightIntercept(pilot.position,Math.max(200,flight.currentSpeed),goal,selectedVelocity);
  const desiredHeading=flight.onGround?0:Math.atan2(-(intercept.x-airplane.position.x),-(intercept.z-airplane.position.z));
  const error=Math.atan2(Math.sin(desiredHeading-flight.heading),Math.cos(desiredHeading-flight.heading));
  const turnRate=Math.atan2(Math.sin(flight.heading-lastHeading),Math.cos(flight.heading-lastHeading))/dt;lastHeading=flight.heading;
  throttleTarget=flight.onGround?.5:enemy?(firstEngagement===undefined?.5:selectedRange<1200?.55:.85):range>3500?.5:inverseThrottle(Math.hypot(pose.velocity.x,pose.velocity.z)+(range-2000)*.12);
  const desiredVy=THREE.MathUtils.clamp((enemy?.velocity.y??0)+(goal.y-airplane.position.y)*.12,-90,90);
  input={x:-THREE.MathUtils.clamp(error*1.3-turnRate*.35,-.85,.85),y:flight.onGround?-.8:-THREE.MathUtils.clamp(.12+(desiredVy-velocity.y)*.04,-.65,.8)};
  const previousPilot={...pilot.position},previousRotation={...pilot.rotation};flight.updateFlight(dt);elapsed+=dt;
  assert.equal(validateClientTransform(previousPilot,airplane.position,dt*1000,e,0).accepted,true);assert.equal(flight.boostActive,false);
  Object.assign(pilot.position,{x:airplane.position.x,y:airplane.position.y,z:airplane.position.z});Object.assign(pilot.velocity,{x:velocity.x,y:velocity.y,z:velocity.z});Object.assign(pilot.rotation,{x:flight.pitch,y:flight.heading,z:flight.roll});pilot.lastStateAt=now;
  if(takeoffAt===undefined&&pilot.position.y>=ground(airport.x,airport.z)+9.2){takeoffAt=elapsed;dfwTakeoff.add('owner');runwayPrep.delete('owner');landing.get('owner').airborne=true;if(escorted){rearGuardTakeoff(ctx.rearGuardFire.get(a.attemptId),now);for(const actor of escorts)actor.bot.journeyProvoked=true;}}
  if(Math.round(elapsed/dt)%3!==0)continue;
  if(escorted){
   ctx.projectiles.clear();for(const [index,shot] of shots.entries())ctx.projectiles.set(index,{...shot,cityId:'dallas'});
   for(const [index,actor] of escorts.entries()){
    if(actor.lifeState!=='alive')continue;const id=escortIds[index],motion=actor.bot;
    if(Math.round(elapsed/dt)%12===0){
     const p=transportPose(now-epoch+2000,altitude,mission.timeLimitMs,mission.id),side=index===0?-1:1;
     motion.route[0]=ctx.safeBotWaypoint('dallas',actor.position,{x:p.x+Math.cos(p.yaw)*side*850+Math.sin(p.yaw)*350,y:p.y+150,z:p.z-Math.sin(p.yaw)*side*850+Math.cos(p.yaw)*350},300);motion.routeIndex=0;
     if(rearGuardShouldRejoin(mission.id,pilot.position,actor.position,p))motion.escortReturnUntil=now+2000;
     maxEscortSeparation=Math.max(maxEscortSeparation,Math.hypot(actor.position.x-p.x,actor.position.z-p.z));
     const navigation=ctx.hunterNavigationTarget(id,actor,motion,now),before={...actor.position},yaw=actor.rotation.y;
     ctx.advanceBotFlight(actor,motion,navigation?.waypoint??motion.route[0],.2);enemyTurns.set(id,Math.atan2(Math.sin(actor.rotation.y-yaw),Math.cos(actor.rotation.y-yaw))/.2);
     assert(distance(before,actor.position)<=aircraftFlightEnvelope.trainer.maxSpeed*.2+.01,'escorts never teleport');
     const solution=ctx.botFireSolution(actor,pilot,false),allowed=rearGuardShooter(ctx.rearGuardFire.get(a.attemptId),now,escorts.map(e=>e.lifeState==='alive'))===index+1;
     if(takeoffAt!==undefined&&navigation?.target&&allowed&&!solution.reason&&opponentReactionReady(motion.opponent,'owner',now)&&now>=motion.attackFireAfter&&now-(enemyLastFire.get(id)??-Infinity)>=Math.max(mission.escortShotSpacingMs,motion.opponent.profile.shotIntervalMs)){
      const aim=opponentAim(motion.opponent.profile,solution.aimX,solution.aimY,random),direction=ctx.normalize(ctx.rotateLocalYxz({x:aim.x,y:aim.y,z:-1},actor.rotation));
      escortShots.push({ownerId:id,position:{...ctx.muzzleTransform(actor).position},direction,speed:protocol.ballisticShotSpeed(actor.velocity,direction),travel:0});enemyLastFire.set(id,now);rearGuardShotResolved(ctx.rearGuardFire.get(a.attemptId),now);recordOpponentShot(motion.opponent);
     }
    }
   }
   for(let i=escortShots.length-1;i>=0;i--){const shot=escortShots[i],before={...shot.position};for(const axis of ['x','y','z'])shot.position[axis]+=shot.direction[axis]*shot.speed*.05;shot.travel+=shot.speed*.05;
    if(!players.has(shot.ownerId)||shot.travel>=protocol.COMBAT_RANGE||segmentBlockedByBuildings(before,shot.position,buildings)||shot.position.y<=ground(shot.position.x,shot.position.z)){escortShots.splice(i,1);continue;}
    if(projectileImpactFraction(before,shot.position,pilot.position,pilot.velocity,.05,aircraftHitRadii.trainer*1.6+.65)!==null){ctx.applyCombatHit(shot.ownerId,'owner','dallas',now,mission.escortShotDamage);escortShots.splice(i,1);}
   }
  }
  const afterPose=stepTransportEncounter(encounter,pilot.position,pilot.velocity,buildings,now);
  const beforePose=transportPose((now-epoch)-50,altitude,mission.timeLimitMs,mission.id);
  if(transportAircraftImpact(previousPilot,pilot.position,previousRotation,pilot.rotation,'trainer',beforePose,afterPose)){crashed=true;f.store.fail('pilot',a.attemptId,'CRASHED',now);break;}
  if(takeoffAt!==undefined&&selectedRange<=protocol.COMBAT_RANGE){
   firstEngagement??=elapsed;
   const origin=ctx.muzzleTransform(pilot).position,target=enemy?.position??{x:afterPose.x,y:afterPose.y+40,z:afterPose.z},solution=enemy?hunterBallisticSolution(origin,pilot.velocity,target,enemy.velocity,enemyTurns.get(enemyId)??0):protocol.ballisticIntercept(origin,pilot.velocity,target,afterPose.velocity);
   const facing=ctx.hunterForward(pilot);
   if(solution&&facing.x*solution.direction.x+facing.y*solution.direction.y+facing.z*solution.direction.z>=Math.cos(protocol.AIM_ENVELOPE)&&now-lastPilotFire>=protocol.fireIntervalMs('trainer')){
    pilotShots++;lastPilotFire=now;shots.push({ownerId:'owner',targetId:enemyId,position:{...origin},direction:solution.direction,speed:protocol.ballisticShotSpeed(pilot.velocity,solution.direction),travel:0});
   }
  }
  for(let i=shots.length-1;i>=0;i--){
   const shot=shots[i],before={...shot.position};for(const axis of ['x','y','z'])shot.position[axis]+=shot.direction[axis]*shot.speed*.05;shot.travel+=shot.speed*.05;
   const hp=f.store.get('pilot',a.attemptId).monsterHealth;
   if(!shot.targetId&&ctx.applyTransportHit('owner',before,shot.position,now,.05,protocol.projectileDamageForAircraft('trainer'))){if(f.store.get('pilot',a.attemptId).monsterHealth<hp)pilotHits++;shots.splice(i,1);}
   else if(shot.targetId){const target=players.get(shot.targetId);if(!target||target.lifeState!=='alive')shots.splice(i,1);
    else if(projectileImpactFraction(before,shot.position,target.position,target.velocity,.05,aircraftHitRadii.trainer*mission.escortScale*1.6+.65)!==null){ctx.applyCombatHit('owner',shot.targetId,'dallas',now,protocol.projectileDamageForAircraft('trainer'));shots.splice(i,1);}
    else if(shot.travel>=protocol.COMBAT_RANGE)shots.splice(i,1);
   }else if(shot.travel>=protocol.COMBAT_RANGE)shots.splice(i,1);
  }
  for(let i=encounter.shots.length-1;i>=0;i--){
   const shot=encounter.shots[i],before={...shot.position};for(const axis of ['x','y','z'])shot.position[axis]+=shot.direction[axis]*shot.speed*.05;shot.traveled+=shot.speed*.05;
   if(segmentBlockedByBuildings(before,shot.position,buildings)||shot.position.y<=ground(shot.position.x,shot.position.z)){encounter.shots.splice(i,1);continue;}
   if(projectileImpactFraction(before,shot.position,pilot.position,pilot.velocity,.05,aircraftHitRadii.trainer*1.6+.65)!==null){pilot.health=Math.max(0,pilot.health-transportTuning.shotDamage);receivedHits++;encounter.shots.splice(i,1);}else if(shot.traveled>=protocol.COMBAT_RANGE)encounter.shots.splice(i,1);
  }
 }
 if(pilot.health<=0)f.store.fail('pilot',a.attemptId,'CRASHED',epoch+Math.round(elapsed*1000));
 else if(elapsed>=mission.timeLimitMs/1000&&f.store.get('pilot',a.attemptId).status==='RACING')f.store.fail('pilot',a.attemptId,'TIME_UP',epoch+mission.timeLimitMs);
 return {firstEngagement,takeoffAt,completion:elapsed,maxEscortSeparation,escortHealths:escorts.map(e=>e.health),pilotHits,pilotShots,receivedHits,health:pilot.health,crashed,status:f.store.get('pilot',a.attemptId).status,credits:f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits,route:transportRouteForMission(mission.id).length,speed:transportRouteForMission(mission.id).length/(mission.timeLimitMs/1000)};
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
}

test('M13 actual non-Boost Bluejay flight and moving-hull combat completes before its 4:20 exit',t=>{
 const r=simulate(missions.journeyDallas07);t.diagnostic(JSON.stringify(r));
 assert.equal(r.status,'COMPLETED');assert.equal(r.credits,850);assert.equal(r.pilotHits,80);assert(r.completion<missions.journeyDallas07.timeLimitMs/1000);assert(r.firstEngagement>=30&&r.firstEngagement<=75*missions.journeyDallas07.timeLimitMs/180000);assert(!r.crashed);assert(r.health>0);
});

test('M13 route, clearance and full-airframe exit agree with its authoritative 4:20 deadline',()=>{
 const m=missions.journeyDallas07,route=transportRouteForMission(m.id),altitude=transportAltitude(buildings,ground,m.id);
 const collision=JSON.parse(readFileSync(new URL('../../shared/giant-transport-collision.json',import.meta.url),'utf8'));
 const bottom=collision.triangles.reduce((minimum,t)=>Math.min(minimum,t[1],t[4],t[7]),Infinity)*transportScaleForMission(m.id);
 assert.equal(m.timeLimitMs,260000);assert.equal(missionJourneyDetails.find(d=>d.id===m.id).timeLimit,'4:20');
 assert(route.length<transportRouteLength);assert(route.length>=route.exitX-route.start.x);
 for(let elapsed=0;elapsed<m.timeLimitMs;elapsed+=1000){
  const p=transportPose(elapsed,altitude,m.timeLimitMs,m.id),q=transportPose(elapsed+1000,altitude,m.timeLimitMs,m.id);
  assert(Math.abs(Math.hypot(q.x-p.x,q.z-p.z)-route.length/(m.timeLimitMs/1000))<1e-6);
  assert(p.x-transportFootprintForMission(m.id)<route.exitX,'no early escape');
  assert(p.y>ground(p.x,p.z)+transportFootprintForMission(m.id)*.14);
  for(const b of buildings)if(b.minX<=p.x+transportFootprintForMission(m.id)&&b.maxX>=p.x-transportFootprintForMission(m.id)&&b.minZ<=p.z+transportFootprintForMission(m.id)&&b.maxZ>=p.z-transportFootprintForMission(m.id))assert(p.y+bottom>b.top+1,'entire transport clears mapped buildings');
 }
 const end=transportPose(m.timeLimitMs,altitude,m.timeLimitMs,m.id);assert(end.x-transportFootprintForMission(m.id)>=route.exitX-1e-6);
 assert.deepEqual(transportPose(m.timeLimitMs+1000,altitude,m.timeLimitMs,m.id),end);
 const a=cityAirports.dallas.find(a=>a.id==='dfw');assert(Math.hypot(route.start.x-a.x,route.start.z-a.z)<15000,'transport begins near DFW');
 assert(route.exitX-(a.x+20000)>75000,'a 75km east-exit route cannot begin within 20km of DFW');
});

test('M14 non-Boost Bluejay destroys both real escorts and the moving transport before 4:20',t=>{
 const r=simulate(missions.journeyDallas08);t.diagnostic(JSON.stringify(r));assert.equal(r.status,'COMPLETED');assert.equal(r.credits,950);assert.deepEqual(r.escortHealths,[0,0]);assert.equal(r.pilotHits,80);assert(r.completion<missions.journeyDallas08.timeLimitMs/1000);assert(r.health>0);assert(!r.crashed);
});

for(const mission of [missions.journeyDallas07,missions.journeyDallas08])test(`${mission.name}: current pause/reconnect preserves the exit deadline; retired active courses cannot inherit it`,()=>{
 const f=fixture();try{
  const a=f.store.launch('pilot','trainer',1000,mission.id);f.store.approach('pilot',a.attemptId,2000);
  assert.equal(f.store.get('pilot',a.attemptId).deadlineAt,null);
  const active=f.store.startGiantIncoming('pilot',a.attemptId,3000);assert.equal(active.deadlineAt,3000+mission.timeLimitMs);
  f.store.pause('pilot',a.attemptId,4000);const reopened=new JourneyAttemptStore(join(f.dir,'profiles.sqlite'),true);
  const resumed=reopened.resume('pilot',a.attemptId,9000);assert.equal(resumed.attempt.deadlineAt,active.deadlineAt+5000);
  const elapsed=20000-resumed.attempt.startedAt;
  assert.deepEqual(transportPose(elapsed,900,mission.timeLimitMs,mission.id),transportPose(20000-reopened.get('pilot',a.attemptId).startedAt,900,mission.timeLimitMs,mission.id));
  assert.equal(reopened.hitTransport('outsider',a.attemptId,20000,25),undefined);
  assert.equal(reopened.hitTransport('pilot',a.attemptId,resumed.attempt.deadlineAt,25),undefined);
  f.db.prepare('INSERT INTO journey_completions(pilot_id,mission_id,first_attempt_id,completed_at,best_time_ms) VALUES(?,?,?,?,?)').run('pilot',mission.id,'historic-clear',500,321000);
  f.db.prepare('UPDATE journey_attempts SET definition_revision=0 WHERE attempt_id=?').run(a.attemptId);
  new JourneyAttemptStore(join(f.dir,'profiles.sqlite'),true);assert.equal(reopened.get('pilot',a.attemptId).failureReason,'MISSION_UPDATED');assert.equal(reopened.progress('pilot',mission.id).completed,true);assert.equal(f.db.prepare('SELECT best_time_ms FROM journey_completions WHERE pilot_id=? AND mission_id=?').get('pilot',mission.id).best_time_ms,321000);
  const retry=reopened.launch('pilot','trainer',30000,mission.id);assert.equal(retry.startedAt,null);assert.equal(retry.deadlineAt,null);assert.equal(retry.targetId,null);
 }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});

test('M14 transport escape matches 4:20 and only M14 escorts use the practical combat area',()=>{
 const mission=missions.journeyDallas08,route=transportRouteForMission(mission.id);
 assert.equal(mission.timeLimitMs,260000);assert.equal(missionJourneyDetails.find(d=>d.id===mission.id).timeLimit,'4:20');
 const before=transportPose(mission.timeLimitMs-50,900,mission.timeLimitMs,mission.id),end=transportPose(mission.timeLimitMs,900,mission.timeLimitMs,mission.id);
 assert(before.x-transportFootprintRadius<route.exitX);assert(end.x-transportFootprintRadius>=route.exitX-1e-6);
 const transport={x:0,z:0},near={x:2000,z:0},far={x:10000,z:0};
 assert.equal(rearGuardShouldRejoin(mission.id,near,near,transport),false);assert.equal(rearGuardShouldRejoin(mission.id,far,near,transport),true);assert.equal(rearGuardShouldRejoin(mission.id,near,far,transport),true);
 for(const m of [missions.journeyDallas09,missions.journeyDallas10,missions.journeyDallas11,missions.journeyDallas12])assert.equal(rearGuardShouldRejoin(m.id,far,far,transport),false);
});

test('M15–M18 keep the legacy route, movement, heading and collision poses at every sampled phase',()=>{
 for(const mission of [missions.journeyDallas09,missions.journeyDallas10,missions.journeyDallas11,missions.journeyDallas12]){
  assert.equal(transportRouteForMission(mission.id).length,transportRouteLength);
  assert.deepEqual(transportRouteForMission(mission.id).start,transportCourse.start);
  for(const fraction of [0,.01,.25,.5,.75,.99,1,1.01]){
   const elapsed=mission.timeLimitMs*fraction;
   const {missionId: poseMissionId,...pose}=transportPose(elapsed,900,mission.timeLimitMs,mission.id);
   if(poseMissionId!==undefined)assert.equal(poseMissionId,mission.id);
   assert.deepEqual(pose,transportPose(elapsed,900,mission.timeLimitMs));
  }
 }
});

for(const mission of [missions.journeyDallas07,missions.journeyDallas08,missions.journeyDallas09,missions.journeyDallas10,missions.journeyDallas11,missions.journeyDallas12]){
 test(`${mission.name}: 4:20 Journey display matches the server GO deadline and timeout`,()=>{
  const f=fixture();try{
   assert.equal(mission.timeLimitMs,260000);
   assert.equal(missionJourneyDetails.find(detail=>detail.id===mission.id)?.timeLimit,'4:20');
   const attempt=f.store.launch('pilot','trainer',1000,mission.id);
   assert.equal(attempt.deadlineAt,null);
   f.store.approach('pilot',attempt.attemptId,2000);
   assert.equal(f.store.startGiantIncoming('other',attempt.attemptId,3000),undefined);
   const active=f.store.startGiantIncoming('pilot',attempt.attemptId,3000);
   assert.equal(active.deadlineAt,263000);
   assert.equal(f.store.startGiantIncoming('pilot',attempt.attemptId,4000),undefined);
   if(mission.id===missions.journeyDallas11.id||mission.id===missions.journeyDallas12.id)
    assert.equal(f.store.hitFortressComponent('pilot',attempt.attemptId,'left',active.deadlineAt,1),undefined);
   else assert.equal(f.store.hitTransport('pilot',attempt.attemptId,active.deadlineAt,1),undefined);
  }finally{f.db.close();rmSync(f.dir,{recursive:true,force:true});}
 });
}
