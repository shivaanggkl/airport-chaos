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
import {advanceHunterFlight,hunterFlightIntercept,hunterBallisticSolution} from './hunter-flight.js';
import {planOpponentTactics,recordOpponentHit,recordOpponentDamage,recordOpponentShot} from './opponent-tactics.js';
import {ambushApproach,ambushCanFire,ambushCruiseSpeed} from './surprise-attack.js';
import {boundJourneyHunterPoint,insideJourneyHunterArena,keepJourneyHunterInside} from './journey-hunter-airspace.js';
import {dallasElevationAt as ground} from './dallas-elevation.js';
import {getTerrainHeight} from '../../client/src/dallas-world.js';
const clientGround=(x,z)=>getTerrainHeight(x/3,z/3)*3;
import {loadDallasCombatBuildings} from './dallas-building-occlusion.js';
import {indexBuildingsForOcclusion,segmentBlockedByBuildings} from './monster-arrival.js';
import {validateClientTransform} from './transform-validation.js';
import {JourneyAttemptStore} from './journey-attempts.js';
// Real authored/map obstacles, indexed once for these focused encounter simulations.
const buildings=loadDallasCombatBuildings([{minX:-143400,maxX:6600,minZ:-115800,maxZ:34200}]);
indexBuildingsForOcclusion(buildings);
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const client=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8'),clientAst=ts.createSourceFile('main.ts',client,ts.ScriptTarget.Latest,true);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),no=()=>{};
function runtime(names,context) {
 const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
 const ctx=vm.createContext({...missions,...protocol,aircraftFlightEnvelope,cityAirports,enemyAiLevels,territoriesForCity,territoryContains,aircraftPresentationMuzzleSockets,
  createOpponent,advanceHunterFlight,hunterBallisticSolution,hunterFlightIntercept,opponentReactionReady,planOpponentTactics,ambushApproach,ambushCruiseSpeed,ambushCanFire,recordOpponentHit,recordOpponentDamage,...context});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;
}
function fixture() {
 const dir=mkdtempSync(join(tmpdir(),'p7-hunters-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 return {dir,db,store:new JourneyAttemptStore(path,true)};
}
// Execute the production client integrator at 60 Hz and server Hunter navigation/
// flight at its normal 200 ms cadence. Only I/O/presentation are stubbed. A seeded
// pilot uses legal stick/throttle/aim inputs; the AI sees the real incoming shots.
// Hits require ballistic travel, swept contact, clear geometry and applyCombatHit.
function simulate(mission) {
 const f=fixture(),epoch=Date.now();let elapsed=0,firstEngagement,firstDamage,takeoffAt,warningAt,firstEnemyShot,firstPilotShot,activatedAt,rearAtWarning;const dt=1/60,players=new Map(),runwayPrep=new Set(['owner']),dfwTakeoff=new Set(),loveTakeoff=new Set(),landing=new Map();
 const airport=cityAirports.dallas.find(a=>a.id===mission.startAirportId),along=Math.min(airport.runwayLength*.32,airport.runwayLength*.5-120);
 const airplane=new THREE.Group();airplane.position.set(airport.x,ground(airport.x,airport.z)+1.2,airport.z+along);
 const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,aircraftType:'trainer',position:{...airplane.position},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},health:maxHealthForAircraft('trainer'),maxHealth:maxHealthForAircraft('trainer'),spawnProtectedUntil:0,score:0,hasRespawnTransform:true};
 players.set('owner',pilot);landing.set('owner',{airborne:false});let input={x:0,y:-.8},throttleTarget=.5,enemyId;
 const velocity=new THREE.Vector3(),e=aircraftDefinitions.trainer;
 const fn=clientAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');
 const flight=vm.createContext({...controls,THREE,Math,Number,mobileIdleBrakeRequested,airplane,currentAircraft:e,aircraftType:'trainer',velocity,forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),heldActions:new Set(),throttle:0,currentSpeed:0,verticalSpeed:0,heading:0,pitch:0,roll:0,onGround:true,landedFeedbackTime:0,cameraShakeTime:0,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:0,takeoffRollMeters:0,resetRegionsOnNextTakeoff:false,flightDistanceSinceTakeoff:0,speedBonus:0,flightState:'TAXI',performance:{now:()=>elapsed*1000},groundPlaneY:(x,z)=>clientGround(x,z)+1.2,getLandingAssistAirport:()=>null,getAirportAtPosition:()=>airport,updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:()=>assert.fail('unexpected crash'),endRun:()=>assert.fail('unexpected flight end'),evaluateLanding:()=>assert.fail('unexpected landing'),setFlightState:state=>{flight.flightState=state;},beginFlightRecap:no,handleContractTakeoff:no,contextualHints:{trigger:no},mobileInput:{getThrottleTarget:()=>throttleTarget,getSteeringInput:()=>input,getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)});
 vm.runInContext(ts.transpileModule(fn.getText(clientAst).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,flight);
 const a=f.store.launch('pilot','trainer',epoch,mission.id);f.store.approach('pilot',a.attemptId,epoch);
 const context={players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyRunwayPrep:runwayPrep,playerJourneyDfwTakeoff:dfwTakeoff,playerJourneyLoveTakeoff:loveTakeoff,landingFlightState:landing,
  nextBotSerial:1,botNames:['Test Hunter'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,keepJourneyHunterInside,
  botTerrainHeight:(_city,x,z)=>ground(x,z),botRunwayHeight:(_city,x,z)=>ground(x,z),dallasAirportElevations:new Map(cityAirports.dallas.map(a=>[a.id,ground(a.x,a.z)+1.2])),botTerrainSampleSpacing:500,
  botCombatClearance:609.6,botCruiseClearance:609.6,journeyAceClearance:300,hunterFireCone:.2,hunterFireRange:protocol.COMBAT_RANGE,defenderDownwardFireAngle:.4,
  sendToPlayer:no,broadcastToCity:()=>assert.fail('private encounter leaked'),sendJourneyState:no,failPlayerJourney:()=>assert.fail('unexpected mission interruption'),missionFocusedPlayers:new Set(),projectiles:new Map(),
  focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),
  markPlayerDestroyed:(_id,p)=>{p.lifeState='destroyed';},isHumanPilot:()=>false,botKillRewardMultiplier:.1,persistScore:no,broadcastLeaderboard:no,updateKing:no,cityKings:new Map(),handleWantedDestruction:no,challengeForPlayer:()=>undefined,removeBot:id=>players.delete(id),
  wrapAngle:a=>Math.atan2(Math.sin(a),Math.cos(a))};
 const ctx=runtime(['hunterNavigationTarget','hunterTarget','clearHunterCombat','beginHunterApproach','hunterInterceptWaypoint','createBot','botStateMessage','transportEscortHealth','transportEscortCosmetics','advanceBotFlight','moveTowardBot','isHunterCombatPhase','botMinimumTurnRadius','smoothHunter','hunterClearance','botSafeFloor','safeBotWaypoint','skyHunterDepartureReady','ensureFirstContact','provokeJourneyHunter','applyCombatHit','runwayCombatProtected','runwayOrTaxiSpawnArea','botFireSolution','muzzleTransform','hunterForward','forwardDirection','normalize','dot','rotateLocalYxz'],context);
 ctx.ensureFirstContact('owner',pilot,f.store.get('pilot',a.attemptId),epoch);enemyId=f.store.get('pilot',a.attemptId).targetId;const enemy=players.get(enemyId),spawn={...enemy.position};
 assert(enemy);assert.equal(enemy.health,150);
 assert.equal(segmentBlockedByBuildings(spawn,spawn,buildings,20),false,'spawn clears mapped and authored buildings');
 for(const point of enemy.bot.route)assert.equal(segmentBlockedByBuildings(point,point,buildings,20),false,'patrol route clears buildings');
 assert.equal(ctx.applyCombatHit('owner',enemyId,'dallas',epoch,25),false,'no cinematic/pre-takeoff kills');
 f.store.startFirstContact('pilot',a.attemptId,epoch);
 ctx.provokeJourneyHunter('owner',pilot,enemyId,epoch);assert(!enemy.bot.journeyProvoked,'GO alone does not enable runway attacks');
 const shots=[];let observedEnemyTurn=0;let pilotShots=0,enemyShots=0,contacts=0,minRange=Infinity;let lastPilotFire=-Infinity,lastEnemyFire=-Infinity,lastHeading=0,seed=17,healthBefore=pilot.health;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const fire=(id,shooter,target,now,bot)=>{
  // Against the faster ambusher, close before firing rather than repeatedly
  // telegraphing long-range shots. This changes pilot input, never the enemy AI.
  if(!bot&&mission.warningMs&&distance(shooter.position,target.position)>1500)return;
  const origin=ctx.muzzleTransform(shooter).position,solution=bot?protocol.ballisticIntercept(origin,shooter.velocity,target.position,target.velocity):hunterBallisticSolution(origin,shooter.velocity,target.position,target.velocity,observedEnemyTurn);
  if(!solution)return;
  const forward=ctx.hunterForward(shooter),dot=forward.x*solution.direction.x+forward.y*solution.direction.y+forward.z*solution.direction.z;
  if(dot<Math.cos(bot ? .2 : protocol.AIM_ENVELOPE))return;
  let direction=solution.direction;
  if(bot){const s=ctx.botFireSolution(shooter,target,false);if(s.reason||s.distance>2500)return;const aim=opponentAim(shooter.bot.opponent.profile,s.aimX,s.aimY,random);direction=ctx.normalize(ctx.rotateLocalYxz({x:aim.x,y:aim.y,z:-1},shooter.rotation));}
  if(bot){enemyShots++;firstEnemyShot??=elapsed;}else{pilotShots++;firstPilotShot??=elapsed;}
  shots.push({owner:id,target:target===enemy?enemyId:'owner',position:{...origin},direction,speed:protocol.ballisticShotSpeed(shooter.velocity,direction),travel:0});
  if(bot)recordOpponentShot(enemy.bot.opponent);
 };
 try {
 while(elapsed<mission.timeLimitMs/1000&&enemy.lifeState==='alive'&&pilot.lifeState==='alive') {
  const now=epoch+Math.round(elapsed*1000),range=distance(pilot.position,enemy.position),bot=enemy.bot;minRange=Math.min(minRange,range);
  const pursue=!mission.warningMs||bot.ambush?.warningAt!==undefined;
  const firingPoint=hunterBallisticSolution(pilot.position,pilot.velocity,enemy.position,enemy.velocity,observedEnemyTurn)?.point;
  const goal=pursue&&range<protocol.COMBAT_RANGE&&firingPoint?firingPoint:pursue?hunterFlightIntercept(pilot.position,Math.max(200,flight.currentSpeed),enemy.position,enemy.velocity):{x:airplane.position.x,y:enemy.position.y,z:airplane.position.z-10000};
  const desiredHeading=flight.onGround?0:Math.atan2(-(goal.x-airplane.position.x),-(goal.z-airplane.position.z)),error=Math.atan2(Math.sin(desiredHeading-flight.heading),Math.cos(desiredHeading-flight.heading));
  const turnRate=Math.atan2(Math.sin(flight.heading-lastHeading),Math.cos(flight.heading-lastHeading))/dt;lastHeading=flight.heading;
  throttleTarget=range<5000&&bot.journeyProvoked ? (mission.warningMs?1:.25) : .5;
  const desiredVy=THREE.MathUtils.clamp((enemy.position.y-airplane.position.y)*.12,-90,90);
  input={x:-THREE.MathUtils.clamp(error*1.3-turnRate*.35,-.85,.85),y:flight.onGround?-.8:-THREE.MathUtils.clamp(.12+(desiredVy-velocity.y)*.04,-.65,.8)};
  const previousPilot=airplane.position.clone();flight.updateFlight(dt);elapsed+=dt;
  assert.equal(validateClientTransform(previousPilot,airplane.position,dt*1000,e,0).accepted,true,'client flight obeys accepted movement limits');
  assert.equal(flight.boostActive,false);
  Object.assign(pilot.position,{x:airplane.position.x,y:airplane.position.y,z:airplane.position.z});Object.assign(pilot.velocity,{x:velocity.x,y:velocity.y,z:velocity.z});Object.assign(pilot.rotation,{x:flight.pitch,y:flight.heading,z:flight.roll});pilot.lastStateAt=now;
  if(!landing.get('owner').airborne&&pilot.position.y>=ground(airport.x,airport.z)+9.2){takeoffAt=elapsed;landing.get('owner').airborne=true;(mission.startAirportId==='dfw'?dfwTakeoff:loveTakeoff).add('owner');runwayPrep.delete('owner');}
  ctx.ensureFirstContact('owner',pilot,f.store.get('pilot',a.attemptId),now);
  let waypoint=bot.route[bot.routeIndex];
  const botTick=Math.round(elapsed/dt)%12===0;
  ctx.projectiles.clear();for(const [id,shot] of shots.entries())ctx.projectiles.set(id,{...shot,ownerId:shot.owner,cityId:'dallas'});
  const navigation=botTick?ctx.hunterNavigationTarget(enemyId,enemy,bot,now):undefined;
  if(navigation)waypoint=navigation.waypoint;
  else if(Math.hypot(enemy.position.x-waypoint.x,enemy.position.z-waypoint.z)<Math.max(26,ctx.botMinimumTurnRadius(enemy.aircraftType,bot.speed)*.75)){bot.routeIndex=(bot.routeIndex+1)%bot.route.length;waypoint=bot.route[bot.routeIndex];}
  if(bot.journeyProvoked)activatedAt??=elapsed;
  if(bot.ambush?.warningAt!==undefined&&warningAt===undefined){
   warningAt=(bot.ambush.warningAt-epoch)/1000;
   const dx=enemy.position.x-pilot.position.x,dz=enemy.position.z-pilot.position.z;
   rearAtWarning=(dx*-Math.sin(pilot.rotation.y)+dz*-Math.cos(pilot.rotation.y))/Math.hypot(dx,dz)<-.3;
   assert.equal(bot.ambush.rearWarning,rearAtWarning);
  }
  const before={...enemy.position},oldYaw=enemy.rotation.y;if(botTick){ctx.advanceBotFlight(enemy,bot,waypoint,.2);observedEnemyTurn=Math.atan2(Math.sin(enemy.rotation.y-oldYaw),Math.cos(enemy.rotation.y-oldYaw))/.2;}
  if(botTick)assert.equal(segmentBlockedByBuildings(before,enemy.position,buildings,10),false,"enemy flight clears buildings");
  assert(distance(before,enemy.position)<=aircraftFlightEnvelope[enemy.aircraftType].maxSpeed*.2+.01,'no teleport or speed shortcut');assert(Math.hypot(enemy.velocity.x,enemy.velocity.y,enemy.velocity.z)>200,'enemy never hovers');
  if(bot.journeyProvoked&&range<=protocol.COMBAT_RANGE&&firstEngagement===undefined)firstEngagement=elapsed;
  if(bot.journeyProvoked&&now-lastPilotFire>=protocol.fireIntervalMs('trainer')){fire('owner',pilot,enemy,now,false);lastPilotFire=now;}
  if(bot.journeyProvoked&&(!mission.warningMs||ambushCanFire(bot.ambush,now))&&opponentReactionReady(bot.opponent,'owner',now)&&now-lastEnemyFire>=bot.opponent.profile.shotIntervalMs){fire(enemyId,enemy,pilot,now,true);lastEnemyFire=now;}
  for(let i=shots.length-1;i>=0;i--){const s=shots[i],before={...s.position};for(const axis of ['x','y','z'])s.position[axis]+=s.direction[axis]*s.speed*dt;s.travel+=s.speed*dt;const target=s.target===enemyId?enemy:pilot;const r=aircraftHitRadii[target.aircraftType]*(s.owner==='owner'?remoteAircraftVisualScale(distance(pilot.position,enemy.position)):1)*1.6+.65;
   if(segmentBlockedByBuildings(before,s.position,buildings)||s.position.y<=ground(s.position.x,s.position.z)){shots.splice(i,1);continue;}
   if(projectileImpactFraction(before,s.position,target.position,target.velocity,dt,r)!==null){contacts++;ctx.applyCombatHit(s.owner,s.target,'dallas',now,protocol.projectileDamageForAircraft(s.owner==='owner'?'trainer':enemy.aircraftType));shots.splice(i,1);}else if(s.travel>protocol.COMBAT_RANGE)shots.splice(i,1);
  }
  if(pilot.health<healthBefore){firstDamage??=elapsed;assert(takeoffAt!==undefined);healthBefore=pilot.health;}
 }
 const result={pilotShots,enemyShots,contacts,minRange,activatedAt,firstPilotShot,firstEnemyShot,rearAtWarning,spawnSeparation:distance({x:airport.x,y:spawn.y,z:airport.z+along},spawn),takeoffAt,firstEngagement,warningAt,firstDamage,completion:elapsed,health:pilot.health,enemyHealth:enemy.health,status:f.store.get('pilot',a.attemptId).status,credits:f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits};return result;
 } finally {f.db.close();rmSync(f.dir,{recursive:true,force:true});}
}

test('M7 measured runway departure, interception and physical Bluejay victory',t=>{
 const result=simulate(missions.journeyDallas13);t.diagnostic(JSON.stringify(result));
 assert.equal(result.status,'COMPLETED');assert.equal(result.credits,1650);assert(result.completion<200);assert(result.firstEngagement>=30&&result.firstEngagement<=60);
});

 test('M8 measured rear approach, warning and physical Bluejay victory',t=>{
 const result=simulate(missions.journeyDallas14);t.diagnostic(JSON.stringify(result));
 assert.equal(result.status,'COMPLETED');assert.equal(result.credits,1800);assert(result.completion<200);
 assert.equal(result.rearAtWarning,true);assert(result.warningAt-result.activatedAt<=18.2);
 assert(result.firstEnemyShot>=result.warningAt+3);assert(result.firstDamage===undefined||result.firstDamage>=result.warningAt+3);assert(result.firstEngagement>=30&&result.firstEngagement<=60);
 });

for(const mission of [missions.journeyDallas13,missions.journeyDallas14]) {
 test(`${mission.name}: only the assigned pilot's accepted departure can enable hostility`,()=>{
  const airport=cityAirports.dallas.find(a=>a.id===mission.startAirportId);
  const pilot={pilotId:'pilot',position:{x:airport.x,y:ground(airport.x,airport.z)+300,z:airport.z-3000},lifeState:'alive'};
  const enemy={position:{...pilot.position,z:pilot.position.z-1000},lifeState:'alive',bot:{journeyAttemptId:'attempt',journeyTargetPlayerId:'owner'}};
  const active={missionId:mission.id,attemptId:'attempt',status:'RACING',targetId:'enemy'};
  const dfw=new Set(),love=new Set(),prep=new Set();let engagements=0;
  const ctx=runtime(['skyHunterDepartureReady','provokeJourneyHunter'],{
   players:new Map([['enemy',enemy]]),playerJourneyAttempts:new Map([['owner','attempt']]),journeyStore:{get:()=>active},
   playerJourneyDfwTakeoff:dfw,playerJourneyLoveTakeoff:love,playerJourneyRunwayPrep:prep,
   botTerrainHeight:(_city,x,z)=>ground(x,z),beginHunterApproach:()=>engagements++,sendJourneyState:no,
  });
  const provoke=()=>ctx.provokeJourneyHunter('owner',pilot,'enemy',1000);
  provoke();assert(!enemy.bot.journeyProvoked,'an airborne claim without accepted takeoff is insufficient');
  const correct=mission.startAirportId==='dfw'?dfw:love,wrong=mission.startAirportId==='dfw'?love:dfw;
  wrong.add('owner');provoke();assert(!enemy.bot.journeyProvoked,'wrong-airport takeoff is insufficient');
  correct.add('owner');prep.add('owner');provoke();assert(!enemy.bot.journeyProvoked);
  prep.clear();pilot.position.y=ground(pilot.position.x,pilot.position.z)+119;provoke();assert(!enemy.bot.journeyProvoked);
  pilot.position.y+=2;active.status='APPROACH';provoke();assert(!enemy.bot.journeyProvoked,'intro cannot activate combat');
  active.status='RACING';ctx.provokeJourneyHunter('intruder',pilot,'enemy',1000);assert(!enemy.bot.journeyProvoked);
  provoke();assert(enemy.bot.journeyProvoked);assert.equal(engagements,1);
  provoke();assert.equal(engagements,1,'activation is latched');
  assert.equal(ctx.skyHunterDepartureReady('unrelated',pilot,missions.journeyDallas19.id),true,'unrelated missions retain their existing rules');
 });
 test(`${mission.name}: GO owns its independent timer and Journey matches it`,()=>{
  const f=fixture();try {
   const a=f.store.launch('pilot','trainer',1000,mission.id);
   assert.equal('airborneSpawn' in mission,false,'combat definition preserves its runway start');
   f.store.approach('pilot',a.attemptId,2000);f.store.assignFirstContact('pilot',a.attemptId,'enemy');
   assert.equal(f.store.get('pilot',a.attemptId).deadlineAt,null,'intro does not consume the timer');
   const racing=f.store.startFirstContact('pilot',a.attemptId,3000);
   assert.equal(racing.deadlineAt-racing.startedAt,180000);
   assert.equal(missionJourneyDetails.find(m=>m.id===mission.id).timeLimit,'3:00');
  }finally {f.db.close();rmSync(f.dir,{recursive:true,force:true});}
 });
}
