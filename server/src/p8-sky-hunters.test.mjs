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
import {DALLAS_WORLD_SCALE} from '../../shared/dallas-world-scale.mjs';
import {CrossfireFireCoordinator} from './journey-crossfire.js';
import {pursuitProgress} from './hot-pursuit.js';
import {aceDamageAuthorized} from './journey-ace.js';
import {journeyHunterSteeringTarget} from './journey-hunter-airspace.js';
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
  CrossfireFireCoordinator,DALLAS_WORLD_SCALE,maxHealthForAircraft,createOpponent,advanceHunterFlight,hunterBallisticSolution,hunterFlightIntercept,opponentReactionReady,planOpponentTactics,ambushApproach,ambushCruiseSpeed,ambushCanFire,recordOpponentHit,recordOpponentDamage,pursuitProgress,aceDamageAuthorized,journeyHunterSteeringTarget,...context});
 vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;
}
function fixture() {
 const dir=mkdtempSync(join(tmpdir(),'p8-hunters-')),path=join(dir,'profiles.sqlite'),db=new DatabaseSync(path);
 db.exec("CREATE TABLE player_profiles(pilot_id TEXT PRIMARY KEY,credits INTEGER NOT NULL,sky_tokens INTEGER NOT NULL);INSERT INTO player_profiles VALUES('pilot',0,0)");
 return {dir,db,store:new JourneyAttemptStore(path,true)};
}
// Execute the production client integrator at 60 Hz and server Hunter navigation/
// flight at its normal 200 ms cadence, and projectile sweeps at 50 ms.
// Only I/O/presentation are stubbed. A seeded
// pilot uses legal stick/throttle/aim inputs; the AI sees the real incoming shots.
// Hits require ballistic travel, swept contact, clear geometry and applyCombatHit.
function simulate(mission) {
 const f=fixture(),epoch=Date.now(),crossfire=mission.id===missions.journeyDallas16.id;let elapsed=0,firstEngagement,firstDamage,takeoffAt,firstEnemyShot,firstPilotShot,activatedAt;const dt=1/60,players=new Map(),runwayPrep=new Set(['owner']),dfwTakeoff=new Set(),loveTakeoff=new Set(),addisonTakeoff=new Set(),landing=new Map();
 const airport=cityAirports.dallas.find(a=>a.id===mission.startAirportId),along=Math.min(airport.runwayLength*.32,airport.runwayLength*.5-120);
 const airplane=new THREE.Group();airplane.position.set(airport.x,ground(airport.x,airport.z)+1.2,airport.z+along);
 const pilot={pilotId:'pilot',entityType:'player',cityId:'dallas',lifeState:'alive',isBot:false,aircraftType:'trainer',position:{...airplane.position},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},health:maxHealthForAircraft('trainer'),maxHealth:maxHealthForAircraft('trainer'),spawnProtectedUntil:0,score:0,hasRespawnTransform:true};
 players.set('owner',pilot);landing.set('owner',{airborne:false});let input={x:0,y:-.8},throttleTarget=.5,enemyId;
 const velocity=new THREE.Vector3(),e=aircraftDefinitions.trainer;
 const fn=clientAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateFlight');
 const flight=vm.createContext({...controls,THREE,Math,Number,mobileIdleBrakeRequested,airplane,currentAircraft:e,aircraftType:'trainer',velocity,forward:new THREE.Vector3(),liftDirection:new THREE.Vector3(),sideSlip:new THREE.Vector3(),heldActions:new Set(),throttle:0,currentSpeed:0,verticalSpeed:0,heading:0,pitch:0,roll:0,onGround:true,landedFeedbackTime:0,cameraShakeTime:0,crashed:false,portalInTransit:false,guidedTutorialActive:false,activeWeatherZone:undefined,cityEvent:undefined,combatLockState:'NONE',speedBrakeStrength:0,boostActive:false,boostMeter:100,boostVisualStrength:0,smoothedTouchSteering:{x:0,y:0},yawControlStrength:0,bankControlStrength:0,pitchControlStrength:0,takeoffThrustBlend:0,takeoffRollMeters:0,resetRegionsOnNextTakeoff:false,flightDistanceSinceTakeoff:0,speedBonus:0,flightState:'TAXI',performance:{now:()=>elapsed*1000},groundPlaneY:(x,z)=>clientGround(x,z)+1.2,getLandingAssistAirport:()=>null,getAirportAtPosition:()=>airport,updateLocalWeather:no,updateAirborneProgress:no,hitsWorldObstacle:()=>false,beginCrashPresentation:()=>assert.fail('unexpected crash'),endRun:()=>assert.fail('unexpected flight end'),evaluateLanding:()=>assert.fail('unexpected landing'),setFlightState:state=>{flight.flightState=state;},beginFlightRecap:no,handleContractTakeoff:no,contextualHints:{trigger:no},mobileInput:{getThrottleTarget:()=>throttleTarget,getSteeringInput:()=>input,getPitchInverted:()=>false},moveToward:(x,y,d)=>x<y?Math.min(y,x+d):Math.max(y,x-d),smoothstep01:x=>x*x*(3-2*x)});
 vm.runInContext(ts.transpileModule(fn.getText(clientAst).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,flight);
 const a=f.store.launch('pilot','trainer',epoch,mission.id);f.store.approach('pilot',a.attemptId,epoch);
 const context={players,journeyStore:f.store,playerJourneyAttempts:new Map([['owner',a.attemptId]]),playerJourneyRunwayPrep:runwayPrep,playerJourneyDfwTakeoff:dfwTakeoff,playerJourneyLoveTakeoff:loveTakeoff,playerJourneyAddisonTakeoff:addisonTakeoff,crossfireDefeatedHunters:new Map(),crossfireFireCoordinators:new Map(),crossfireHunterMotion:new Map(),landingFlightState:landing,
  nextBotSerial:1,botNames:['Test Hunter'],botPersonalities:['hunter'],botAirports:()=>cityAirports.dallas,airportRoute:()=>[],boundJourneyHunterPoint,keepJourneyHunterInside,
  botTerrainHeight:(_city,x,z)=>ground(x,z),botRunwayHeight:(_city,x,z)=>ground(x,z),dallasAirportElevations:new Map(cityAirports.dallas.map(a=>[a.id,ground(a.x,a.z)+1.2])),botTerrainSampleSpacing:500,
  botCombatClearance:609.6,botCruiseClearance:609.6,journeyAceClearance:300,hunterFireCone:.2,hunterFireRange:protocol.COMBAT_RANGE,defenderDownwardFireAngle:.4,
  sendToPlayer:no,broadcastToCity:(_city,packet)=>assert.equal(packet.type,'damage','private actors are not broadcast'),sendJourneyState:no,failPlayerJourney:(_id,reason,now)=>{f.store.fail('pilot',a.attemptId,reason,now);},missionFocusedPlayers:new Set(),projectiles:new Map(),
  focusedBotInteractionExcluded:()=>false,tutorialCombatPairAllowed:()=>true,sameCombatContext:()=>true,insideJourneyHunterArena,stabilityDiagnosticsEnabled:false,airportRepairStays:new Map(),
  markPlayerDestroyed:(_id,p)=>{p.lifeState='destroyed';},isHumanPilot:()=>false,botKillRewardMultiplier:.1,persistScore:no,broadcastLeaderboard:no,updateKing:no,cityKings:new Map(),handleWantedDestruction:no,challengeForPlayer:()=>undefined,removeBot:id=>players.delete(id),
  wrapAngle:a=>Math.atan2(Math.sin(a),Math.cos(a))};
 const ctx=runtime(['botCruiseFactor','ensureJourneyCrossfire','ensureJourneyAce','hunterNavigationTarget','hunterTarget','clearHunterCombat','beginHunterApproach','hunterInterceptWaypoint','createBot','botStateMessage','transportEscortHealth','transportEscortCosmetics','advanceBotFlight','moveTowardBot','isHunterCombatPhase','botMinimumTurnRadius','smoothHunter','hunterClearance','botSafeFloor','safeBotWaypoint','skyHunterDepartureReady','ensureFirstContact','provokeJourneyHunter','applyCombatHit','runwayCombatProtected','runwayOrTaxiSpawnArea','botFireSolution','muzzleTransform','hunterForward','forwardDirection','normalize','dot','rotateLocalYxz'],context);
 const ensure=crossfire?ctx.ensureJourneyCrossfire:ctx.ensureJourneyAce;
 ensure('owner',pilot,f.store.get('pilot',a.attemptId),epoch);
 // M10 assigns each distinct target through its existing authoritative factory.
 if(crossfire)ensure('owner',pilot,f.store.get('pilot',a.attemptId),epoch);
 const attempt=f.store.get('pilot',a.attemptId),enemyIds=[attempt.targetId,...(crossfire?[attempt.secondaryTargetId]:[])];
 const enemies=enemyIds.map(id=>players.get(id)),spawns=enemies.map(e=>({...e.position}));
 enemyId=enemyIds[0];let enemy=enemies[0];const spawn=spawns[0];
 for(const actor of enemies){
  assert(actor);assert.equal(actor.health,crossfire?mission.enemyHealth:mission.bossHealth);
  assert.equal(segmentBlockedByBuildings(actor.position,actor.position,buildings,20),false,'spawn clears buildings');
  for(const point of actor.bot.route)assert.equal(segmentBlockedByBuildings(point,point,buildings,20),false,'patrol clears buildings');
 }
 assert.equal(ctx.applyCombatHit('owner',enemyId,'dallas',epoch,25),false,'no cinematic/pre-takeoff kills');
 (crossfire?f.store.startDoubleThreat.bind(f.store):f.store.startPursuit.bind(f.store))('pilot',a.attemptId,epoch);
 ctx.provokeJourneyHunter('owner',pilot,enemyId,epoch);assert(!enemy.bot.journeyProvoked,'GO alone does not enable runway attacks');
 const shots=[];const enemyTurns=new Map(),enemyLastFire=new Map(),killTimes=[];let observedEnemyTurn=0;let pilotShots=0,enemyShots=0,contacts=0,minRange=Infinity;let lastPilotFire=-Infinity,lastHeading=0,seed=17,healthBefore=pilot.health;
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
  if(bot){const s=ctx.botFireSolution(shooter,target,false);if(s.reason)return;const aim=opponentAim(shooter.bot.opponent.profile,s.aimX,s.aimY,random);direction=ctx.normalize(ctx.rotateLocalYxz({x:aim.x,y:aim.y,z:-1},shooter.rotation));}
  if(bot){enemyShots++;firstEnemyShot??=elapsed;}else{pilotShots++;firstPilotShot??=elapsed;}
  shots.push({damage:protocol.projectileDamageForAircraft(shooter.aircraftType),owner:id,target:target===enemy?enemyId:'owner',position:{...origin},direction,speed:protocol.ballisticShotSpeed(shooter.velocity,direction),travel:0});
  if(bot)recordOpponentShot(shooter.bot.opponent);
 };
 try {
 while(elapsed<mission.timeLimitMs/1000&&enemies.some(e=>e.lifeState==='alive')&&pilot.lifeState==='alive'&&f.store.get('pilot',a.attemptId).status==='RACING') {
  enemy=enemies.find(e=>e.lifeState==='alive');enemyId=enemyIds[enemies.indexOf(enemy)];observedEnemyTurn=enemyTurns.get(enemyId)??0;
  const now=epoch+Math.round(elapsed*1000),range=distance(pilot.position,enemy.position),bot=enemy.bot;minRange=Math.min(minRange,range);
  const pursue=!mission.warningMs||bot.ambush?.warningAt!==undefined;
  const firingPoint=hunterBallisticSolution(pilot.position,pilot.velocity,enemy.position,enemy.velocity,observedEnemyTurn)?.point;
  let goal=pursue&&range<(crossfire?1200:protocol.COMBAT_RANGE)&&firingPoint?firingPoint:pursue?hunterFlightIntercept(pilot.position,Math.max(200,flight.currentSpeed),enemy.position,enemy.velocity):{x:airplane.position.x,y:enemy.position.y,z:airplane.position.z-10000};
  if(crossfire)goal={...goal,...journeyHunterSteeringTarget(pilot.position,ctx.hunterForward(pilot),goal,75000)};
  const desiredHeading=flight.onGround?0:Math.atan2(-(goal.x-airplane.position.x),-(goal.z-airplane.position.z)),error=Math.atan2(Math.sin(desiredHeading-flight.heading),Math.cos(desiredHeading-flight.heading));
  const turnRate=Math.atan2(Math.sin(flight.heading-lastHeading),Math.cos(flight.heading-lastHeading))/dt;lastHeading=flight.heading;
  throttleTarget=crossfire&&bot.journeyProvoked ? (range<1000?.85:1) : range<1500&&bot.journeyProvoked ? .35 : .5;
  const desiredVy=THREE.MathUtils.clamp((crossfire?enemy.velocity.y:0)+(enemy.position.y-airplane.position.y)*.12,-90,90);
  input={x:-THREE.MathUtils.clamp(error*1.3-turnRate*.35,-.85,.85),y:flight.onGround?-.8:-THREE.MathUtils.clamp(.12+(desiredVy-velocity.y)*.04,-.65,.8)};
  const previousPilot=airplane.position.clone();flight.updateFlight(dt);elapsed+=dt;
  assert.equal(validateClientTransform(previousPilot,airplane.position,dt*1000,e,0).accepted,true,'client flight obeys accepted movement limits');
  assert.equal(flight.boostActive,false);
  Object.assign(pilot.position,{x:airplane.position.x,y:airplane.position.y,z:airplane.position.z});Object.assign(pilot.velocity,{x:velocity.x,y:velocity.y,z:velocity.z});Object.assign(pilot.rotation,{x:flight.pitch,y:flight.heading,z:flight.roll});pilot.lastStateAt=now;
  if(!landing.get('owner').airborne&&pilot.position.y>=ground(airport.x,airport.z)+9.2){takeoffAt=elapsed;landing.get('owner').airborne=true;(mission.startAirportId==='dfw'?dfwTakeoff:mission.startAirportId==='love'?loveTakeoff:addisonTakeoff).add('owner');runwayPrep.delete('owner');}
  const botTick=Math.round(elapsed/dt)%12===0;
  if(botTick)ensure('owner',pilot,f.store.get('pilot',a.attemptId),now);
  ctx.projectiles.clear();for(const [id,shot] of shots.entries())ctx.projectiles.set(id,{...shot,ownerId:shot.owner,cityId:'dallas'});
  for(const [index,actor] of enemies.entries()){
   if(actor.lifeState!=='alive')continue;
   const id=enemyIds[index],motion=actor.bot;
   let waypoint=motion.route[motion.routeIndex];
   const navigation=botTick?ctx.hunterNavigationTarget(id,actor,motion,now):undefined;
   if(navigation)waypoint=navigation.waypoint;
   else if(Math.hypot(actor.position.x-waypoint.x,actor.position.z-waypoint.z)<Math.max(26,ctx.botMinimumTurnRadius(actor.aircraftType,motion.speed)*.75)){motion.routeIndex=(motion.routeIndex+1)%motion.route.length;waypoint=motion.route[motion.routeIndex];}
   if(motion.journeyProvoked)activatedAt??=elapsed;
   const before={...actor.position},oldYaw=actor.rotation.y;
   if(botTick){waypoint={...waypoint,...journeyHunterSteeringTarget(actor.position,ctx.hunterForward(actor),waypoint,crossfire?75000:undefined)};ctx.advanceBotFlight(actor,motion,waypoint,.2);enemyTurns.set(id,Math.atan2(Math.sin(actor.rotation.y-oldYaw),Math.cos(actor.rotation.y-oldYaw))/.2);}
   if(botTick){assert.equal(segmentBlockedByBuildings(before,actor.position,buildings,10),false,'enemy flight clears buildings');if(crossfire)assert(Math.abs(actor.position.x)<75000&&Math.abs(actor.position.z)<75000,`enemy stays in Dallas at ${elapsed}: ${JSON.stringify(actor.position)} towards ${JSON.stringify(waypoint)}`);}
   assert(distance(before,actor.position)<=aircraftFlightEnvelope[actor.aircraftType].maxSpeed*.2+.01,'no teleport or speed shortcut');assert(Math.hypot(actor.velocity.x,actor.velocity.y,actor.velocity.z)>200,'enemy never hovers');
   const actorRange=distance(pilot.position,actor.position);
   if(motion.journeyProvoked&&actorRange<=protocol.COMBAT_RANGE&&firstEngagement===undefined)firstEngagement=elapsed;
   const canShoot=!ctx.botFireSolution(actor,pilot,false).reason;
   const coordinated=!crossfire||ctx.crossfireFireCoordinators.get(a.attemptId).canInitiate(id,canShoot,now);
   if(botTick&&motion.journeyProvoked&&coordinated&&opponentReactionReady(motion.opponent,'owner',now)&&now>=motion.attackFireAfter&&now-(enemyLastFire.get(id)??-Infinity)>=motion.opponent.profile.shotIntervalMs){fire(id,actor,pilot,now,true);enemyLastFire.set(id,now);}
  }
  if(bot.journeyProvoked&&now-lastPilotFire>=protocol.fireIntervalMs('trainer')){fire('owner',pilot,enemy,now,false);lastPilotFire=now;}
  const projectileTick=Math.round(elapsed/dt)%3===0,projectileDelta=.05;
  if(projectileTick)for(let i=shots.length-1;i>=0;i--){const s=shots[i],before={...s.position};for(const axis of ['x','y','z'])s.position[axis]+=s.direction[axis]*s.speed*projectileDelta;s.travel+=s.speed*projectileDelta;const target=s.target==='owner'?pilot:enemies[enemyIds.indexOf(s.target)];if(!target||target.lifeState!=='alive'){shots.splice(i,1);continue;}const r=aircraftHitRadii[target.aircraftType]*(s.owner==='owner'?remoteAircraftVisualScale(distance(pilot.position,target.position)):1)*1.6+.65;
   if(segmentBlockedByBuildings(before,s.position,buildings)||s.position.y<=ground(s.position.x,s.position.z)){shots.splice(i,1);continue;}
   if(projectileImpactFraction(before,s.position,target.position,target.velocity,projectileDelta,r)!==null){contacts++;const alive=target.lifeState==='alive';ctx.applyCombatHit(s.owner,s.target,'dallas',now,s.damage);if(alive&&target.lifeState==='destroyed'&&s.owner==='owner'){killTimes.push(elapsed);if(crossfire&&killTimes.length===1)assert.equal(f.store.get('pilot',a.attemptId).status,'RACING','one kill cannot win');}shots.splice(i,1);}else if(s.travel>protocol.COMBAT_RANGE)shots.splice(i,1);
  }
  if(pilot.health<healthBefore){firstDamage??=elapsed;assert(takeoffAt!==undefined);healthBefore=pilot.health;}
 }
 const result={pilotShots,enemyShots,contacts,minRange,killTimes,enemyHealths:enemies.map(e=>e.health),spawnDistances:spawns.map(s=>Math.hypot(s.x-airport.x,s.z-airport.z-along)),escaped:enemy.bot.journeyPursuit?.escaped,remaining:enemy.bot.journeyPursuit?.remaining,activatedAt,firstPilotShot,firstEnemyShot,spawnSeparation:distance({x:airport.x,y:spawn.y,z:airport.z+along},spawn),takeoffAt,firstEngagement,firstDamage,completion:elapsed,health:pilot.health,enemyHealth:enemy.health,status:f.store.get('pilot',a.attemptId).status,credits:f.db.prepare("SELECT credits FROM player_profiles WHERE pilot_id='pilot'").get().credits};return result;
 } finally {f.db.close();rmSync(f.dir,{recursive:true,force:true});}
}


test('M9 physical Bluejay interception settles before the Mammoth escapes',t=>{
 const r=simulate(missions.journeyDallas15);t.diagnostic(JSON.stringify(r));
 assert.equal(r.status,'COMPLETED');assert.equal(r.credits,1950);assert(r.completion<=180);assert(r.firstEngagement>=30&&r.firstEngagement<=60);assert(!r.escaped);
});


test('M9 geometry and Journey timer match the scaled escape definition',()=>{
 const m=missions.journeyDallas15,a=cityAirports.dallas.find(a=>a.id==='addison');
 const start={x:a.x,z:a.z+Math.min(a.runwayLength*.32,a.runwayLength*.5-120)};
 const separation=Math.hypot(m.enemySpawn.x-start.x,m.enemySpawn.z-start.z);assert(separation>=15000&&separation<=22000);
 const points=[m.enemySpawn,...m.escapeRoute];let length=0;
 for(let i=1;i<points.length;i++){
  const p=points[i-1],q=points[i];length+=Math.hypot(q.x-p.x,q.z-p.z);
  for(let j=0;j<=50;j++){
   const x=p.x+(q.x-p.x)*j/50,z=p.z+(q.z-p.z)*j/50;
   assert(Math.abs(x)<75000&&Math.abs(z)<75000&&insideJourneyHunterArena({x,z}));
   const point={x,y:ground(x,z)+m.enemyAltitude,z};assert(!segmentBlockedByBuildings(point,point,buildings,30));
  }
  if(i>1){const r=points[i-2],a=Math.atan2(p.z-r.z,p.x-r.x),b=Math.atan2(q.z-p.z,q.x-p.x);assert(Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)))<Math.PI/3);}
 }
 assert(length>=45000&&length<=65000);assert.equal(m.timeLimitMs,180000);
 assert.equal(missionJourneyDetails.find(d=>d.id===m.id).timeLimit,'3:00');
});

test('M9 hostility requires accepted Addison departure and latches once',()=>{
 const mission=missions.journeyDallas15,a=cityAirports.dallas.find(a=>a.id==='addison');
 const pilot={pilotId:'pilot',position:{x:a.x,y:ground(a.x,a.z)+500,z:a.z-3000},lifeState:'alive'};
 const enemy={position:{...pilot.position},lifeState:'alive',bot:{journeyAttemptId:'attempt',journeyTargetPlayerId:'owner',journeyPursuit:{}}};
 const ctx=runtime(['skyHunterDepartureReady','provokeJourneyHunter'],{players:new Map([['enemy',enemy]]),playerJourneyAttempts:new Map([['owner','attempt']]),journeyStore:{get:()=>({missionId:mission.id,status:'RACING',targetId:'enemy'})},playerJourneyAddisonTakeoff:new Set(),playerJourneyDfwTakeoff:new Set(),playerJourneyLoveTakeoff:new Set(['owner']),playerJourneyRunwayPrep:new Set(),botTerrainHeight:(_c,x,z)=>ground(x,z)});
 ctx.provokeJourneyHunter('owner',pilot,'enemy',1000);assert(!enemy.bot.journeyProvoked,'Love takeoff cannot substitute for Addison');
 ctx.playerJourneyAddisonTakeoff.add('owner');pilot.position.y=ground(pilot.position.x,pilot.position.z)+119;
 ctx.provokeJourneyHunter('owner',pilot,'enemy',1000);assert(!enemy.bot.journeyProvoked);
 pilot.position.y+=2;ctx.provokeJourneyHunter('owner',pilot,'enemy',1000);assert(enemy.bot.journeyProvoked);
});

test('M10 physical non-Boost Bluejay defeats both independently flying coordinated enemies',t=>{
 const r=simulate(missions.journeyDallas16);t.diagnostic(JSON.stringify(r));
 assert.equal(r.status,'COMPLETED');assert.equal(r.credits,2100);assert.equal(r.killTimes.length,2);assert(r.completion<=255);assert(r.firstEngagement>=30&&r.firstEngagement<=60);
});

test('M10 compact placements, world turns and three-minute Journey deadline agree',()=>{
 const m=missions.journeyDallas16,a=cityAirports.dallas.find(a=>a.id==='dfw');
 const runwayZ=a.z+Math.min(a.runwayLength*.32,a.runwayLength*.5-120);
 for(const enemy of m.enemies){
  const separation=Math.hypot(enemy.x-a.x,enemy.z-runwayZ);assert(separation>=12000&&separation<=20000);
  assert(insideJourneyHunterArena(enemy)&&Math.abs(enemy.x)<75000&&Math.abs(enemy.z)<75000);
  assert(!segmentBlockedByBuildings({x:enemy.x,y:ground(enemy.x,enemy.z)+enemy.altitude,z:enemy.z},{x:enemy.x,y:ground(enemy.x,enemy.z)+enemy.altitude,z:enemy.z},buildings,30));
 }
 assert(Math.hypot(m.enemies[0].x-m.enemies[1].x,m.enemies[0].z-m.enemies[1].z)>4000);
 assert.equal(m.timeLimitMs,180000);assert.equal(missionJourneyDetails.find(d=>d.id===m.id).timeLimit,'3:00');
 // Only M10 opts into the actual city boundary; all older callers retain their envelope.
 const position={x:-67000,z:-50000},forward={x:-1,z:0},waypoint={x:-100000,z:-50000};
 assert.equal(journeyHunterSteeringTarget(position,forward,waypoint).x,-100000);
 assert.equal(journeyHunterSteeringTarget(position,forward,waypoint,75000).x,0);
});

test('M10 hostility requires safe DFW departure, not another airport takeoff',()=>{
 const a=cityAirports.dallas.find(a=>a.id==='dfw');
 const pilot={position:{x:a.x,y:ground(a.x,a.z)+500,z:a.z-3000}};
 const ctx=runtime(['skyHunterDepartureReady'],{playerJourneyAddisonTakeoff:new Set(['owner']),playerJourneyDfwTakeoff:new Set(),playerJourneyLoveTakeoff:new Set(),playerJourneyRunwayPrep:new Set(),botTerrainHeight:(_c,x,z)=>ground(x,z)});
 assert.equal(ctx.skyHunterDepartureReady('owner',pilot,missions.journeyDallas16.id),false);
 ctx.playerJourneyDfwTakeoff.add('owner');assert.equal(ctx.skyHunterDepartureReady('owner',pilot,missions.journeyDallas16.id),true);
 ctx.playerJourneyRunwayPrep.add('owner');assert.equal(ctx.skyHunterDepartureReady('owner',pilot,missions.journeyDallas16.id),false);
 ctx.playerJourneyRunwayPrep.clear();pilot.position.y=ground(pilot.position.x,pilot.position.z)+119;assert.equal(ctx.skyHunterDepartureReady('owner',pilot,missions.journeyDallas16.id),false);
 pilot.position={x:a.x,y:ground(a.x,a.z)+500,z:a.z-1199};assert.equal(ctx.skyHunterDepartureReady('owner',pilot,missions.journeyDallas16.id),false);
});
