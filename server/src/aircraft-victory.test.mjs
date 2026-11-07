import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {AircraftVictory} from '../../client/src/aircraft-victory.js';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16} from '../../shared/journey-mission.mjs';

const hit={playerId:'enemy',killerId:'pilot',cause:'combat',position:{x:12345,y:2456,z:-34567},aircraftType:'privateJet'};
for(const destructionFirst of [false,true])test(`success and destruction join safely in either event order: destruction first ${destructionFirst}`,()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');
 if(destructionFirst)ending.confirmDestruction(hit,.6);else ending.confirmSuccess();
 assert.equal(ending.update(.5).blast,false,'neither event can invent a successful blast alone');
 if(destructionFirst)ending.confirmSuccess();else ending.confirmDestruction(hit,.6);
 const first=ending.update(0);assert(first.blast);assert(!first.complete);assert(first.flash>0);
 assert.deepEqual(ending.position.toArray(),[12345,2456,-34567]);
 assert.equal(ending.confirmDestruction(hit,.6),false,'duplicate events cannot restart the blast');
 assert.equal(ending.update(.5).blast,false);assert(!ending.complete);
 assert(ending.update(.56).complete);assert(ending.update(.1).complete);
 const camera=new THREE.PerspectiveCamera(58);ending.updateCamera(camera);
 assert(camera.position.distanceTo(ending.position)>80&&camera.position.distanceTo(ending.position)<100,'close aircraft blast framing');
 assert(camera.getWorldDirection(new THREE.Vector3()).dot(ending.position.clone().sub(camera.position).normalize())>.999999);
});

test('only the owned enemy, combat cause and finite server position can supply the impact',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');ending.confirmSuccess();
 for(const bad of [{...hit,playerId:'other'},{...hit,killerId:'other'},{...hit,cause:'collision'}, {...hit,position:undefined},{...hit,position:{x:NaN,y:0,z:0}}])assert.equal(ending.confirmDestruction(bad,0),false);
 assert.equal(ending.update(1).blast,false);assert.equal(ending.update(.5).complete,true,'missing late event cannot trap a completed mission');
 assert.equal(ending.hasCamera,false,'missing event never fabricates a cinematic position');
 assert.equal(ending.confirmDestruction(hit,0),false,'a closed ending cannot replay late events');
});

const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const code=name=>ts.transpileModule(ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let destroyedBlock;
function find(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==="message.type === 'destroyed'")destroyedBlock=n.thenStatement;ts.forEachChild(n,find);}
find(ast);assert(destroyedBlock);
const receive=ts.transpileModule(`function receive()${destroyedBlock.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('real M7 destruction handler uses the ground-crash breakup once at the server impact, then reveals success',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');ending.confirmSuccess();
 const plane=new THREE.Group();plane.position.set(-999,111,222);plane.rotation.y=.6;
 const no=()=>{},remote={plane,aircraftType:'privateJet',identityTag:{visible:true},hullTag:{visible:true},playerProxy:{visible:true}};
 const effects=[],events=[],classes=new Set(['aircraft-victory-active']);
 const ctx=vm.createContext({THREE,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,aircraftVictoryCandidates:[ending],aircraftVictory:ending,aircraftVictoryReplay:null,prepareAircraftVictoryReplay(){},clearAircraftVictoryReplay(){},journeyMode:true,journeyAttempt:{missionId:journeyDallas13.id,attemptId:'attempt',targetId:'enemy',status:'COMPLETED'},
  message:hit,localPlayerId:'pilot',airplane:new THREE.Group(),remotePlayers:new Map([['enemy',remote]]),recentDestructionIds:new Map(),performance:{now:()=>1000},
  updateHumanRosterStatus:no,destructionPosition:new THREE.Vector3(),recordEscortHudHealth:no,selectedCombatTarget:undefined,
  hapticsManager:{emit:no},audioManager:{playDestroyConfirm:no},airAssaultMode:false,skyDuelMode:false,
  flightRecap:{kills:0},gameplayFeedback:{push:no},killNotice:()=>'',score:0,recordBestScore:no,handleContractKill:no,showCombatMessage:no,
  createDestructionEffect:(position,type,scale)=>{effects.push({position:position.clone(),type,scale});events.push('blast');},playDestructionSound:()=>events.push('sound'),
  transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove:c=>classes.delete(c)}},showJourneyResult:()=>events.push('success')});
 vm.runInContext(receive+'\n'+code('updateAircraftVictory')+'\nreceive();receive();',ctx);
 assert.equal(plane.visible,false);assert.equal(effects.length,0,'generic destruction must not duplicate the cinematic effect');
 vm.runInContext('updateAircraftVictory(0);updateAircraftVictory(.5);',ctx);
 assert.equal(effects.length,1);assert.deepEqual(effects[0].position.toArray(),[12345,2456,-34567]);
 assert.equal(effects[0].type,'privateJet');assert.equal(effects[0].scale,3,'same breakup multiplier as ground crash');
 assert.deepEqual(events,['blast','sound']);
 vm.runInContext('updateAircraftVictory(.56);updateAircraftVictory(.2);',ctx);
 assert.deepEqual(events,['blast','sound','success']);assert.equal(classes.size,0);
});

test('retry/exit cleanup clears the ending, cinematic chrome and flash',()=>{
 const classes=new Set(['aircraft-victory-active']);
 const ctx=vm.createContext({clearAircraftVictoryReplay(){},aircraftVictoryCandidates:[],aircraftVictory:new AircraftVictory('old','enemy','pilot'),flightGameRoot:{classList:{remove:c=>classes.delete(c)}},
  crashSequence:{},crashTrainingResetPending:true,transportCrashFlash:{style:{opacity:'1'}},crashPresentationStarted:false,transportCollisionAttemptId:'old'});
 vm.runInContext(code('resetCrashPresentation')+'\nresetCrashPresentation();',ctx);
 assert.equal(ctx.aircraftVictory,null);assert.equal(classes.size,0);assert.equal(ctx.transportCrashFlash.style.opacity,'0');
});


for(const mission of [journeyDallas13,journeyDallas14,journeyDallas15])test(`${mission.name}: actual success presentation waits behind the ending without restarting it`,()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',mission),hidden=new Set();
 const ctx=vm.createContext({journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,aircraftVictory:ending,crashSequence:null,
  clearHeldActions(){},mobileInput:{reset(){}},boostActive:true,runStarted:true,cinematicDirector:{clearPresentation(){}},
  journeyResultElement:{classList:{add:c=>hidden.add(c)}},flightGameRoot:{classList:{add(){}}}});
 ctx.result={missionId:mission.id,attemptId:'attempt',status:'COMPLETED'};
 vm.runInContext(code('showJourneyResult')+"\nshowJourneyResult(result);",ctx);
 assert(ending.pending);assert(hidden.has('hidden'));assert.equal(ctx.runStarted,false);assert.equal(ctx.boostActive,false);
 assert.equal(ending.update(0).blast,false,'success alone cannot invent an explosion');
});


test('the fatal ballistic shot replays from its recorded launch to the confirmed impact before blasting',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');
 const origin={x:11745,y:2456,z:-34567},impact={x:12340,y:2456,z:-34567};
 ending.recordProjectile({projectileId:'finisher',ownerId:'pilot',position:origin,speed:1000});
 ending.recordProjectile({projectileId:'later',ownerId:'pilot',position:{x:0,y:0,z:0},speed:1000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:25,impactId:'finisher',impactPosition:impact});assert(!ending.hasReplay);
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finisher',impactPosition:impact});
 ending.confirmSuccess();ending.confirmDestruction(hit,.6);
 assert(ending.hasReplay);assert.deepEqual(ending.shotOrigin.toArray(),[11745,2456,-34567]);
 assert.equal(ending.update(.3).blast,false);assert(ending.replaying);
 assert(ending.bulletPosition.x>origin.x&&ending.bulletPosition.x<impact.x);
 const camera=new THREE.PerspectiveCamera(58);ending.updateCamera(camera);
 assert(camera.position.distanceTo(ending.bulletPosition)<650,'camera establishes the muzzle before following the final bullet');
 ending.update(.21);ending.updateCamera(camera);assert(camera.position.distanceTo(ending.bulletPosition)<50);
 const contact=ending.update(.2);assert(contact.blast);assert(!ending.replaying);assert(!contact.complete);
 assert.deepEqual(ending.bulletPosition.toArray(),[12340,2456,-34567]);
 assert.equal(ending.update(1.1).complete,true);
});

test('assisted finishing shots retain their server muzzle and require the owned fatal damage event',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');
 const shot={shotId:'assisted',ownerId:'pilot',targetId:'enemy',origin:{x:11745,y:2456,z:-34567},targetPosition:hit.position};
 ending.recordAssistedShot({...shot,targetId:'unrelated'});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0});assert(!ending.hasReplay);
 ending.recordAssistedShot(shot);
 ending.recordFatalHit({playerId:'enemy',shooterId:'intruder',health:0});assert(!ending.hasReplay);
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0});assert(ending.hasReplay);
 assert.deepEqual(ending.shotOrigin.toArray(),[11745,2456,-34567]);
 assert.deepEqual(ending.impactPosition.toArray(),[12345,2456,-34567]);
});

for(const mission of [journeyDallas13,journeyDallas14,journeyDallas15])test(`${mission.name}: actual scene keeps the correct enemy and tracer until contact, then cleans them before the blast`,()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',mission);ending.confirmSuccess();
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 ending.confirmDestruction(hit,.6);
 const airplane=new THREE.Group(),scene=new THREE.Scene(),events=[],created=[],liveries=[];
 const ctx=vm.createContext({THREE,aircraftVictory:ending,aircraftVictoryReplay:null,airplane,scene,journeyDallas13,
  aircraftType:'trainer',aircraftPresentationMuzzleSockets,serverProfile:{cosmetics:{equipped:{}}},applyEquippedLivery:(_plane,type,paint)=>liveries.push({type,paint}),
  createAirplane:type=>{created.push(type);const p=new THREE.Group();p.userData.airframeRoot=new THREE.Group();p.add(p.userData.airframeRoot);return p;},
  createProjectileMesh:()=>{const g=new THREE.Group();g.add(new THREE.Group(),new THREE.Group());return g;},audioManager:{playDestroyConfirm(){}},disposeAirplaneMaterials:()=>events.push('dispose'),
  createDestructionEffect:(position,type)=>{assert.equal(type,mission.enemyAircraft);assert.deepEqual(position.toArray(),[12345,2456,-34567]);events.push('blast');},playDestructionSound(){},
  transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove(){}}},journeyAttempt:{attemptId:'attempt',status:'COMPLETED'},showJourneyResult:()=>events.push('success')});
 vm.runInContext(code('clearAircraftVictoryReplay')+'\n'+code('prepareAircraftVictoryReplay')+'\n'+code('updateAircraftVictory')+'\nprepareAircraftVictoryReplay(aircraftVictory);updateAircraftVictory(.3);',ctx);
 const replay=ctx.aircraftVictoryReplay;
 assert.deepEqual(created,['trainer',mission.enemyAircraft]);
 assert.equal(liveries[1].type,mission.enemyAircraft);assert.equal(liveries[1].paint[`livery:${mission.enemyAircraft}`],mission.enemyLivery);
 assert(replay.root.visible);assert(replay.enemy.visible);assert.equal(airplane.visible,false);
 assert.deepEqual(replay.enemy.position.toArray(),[12345,2456,-34567]);
 assert(replay.tracer.position.distanceTo(ending.shotOrigin)>0);assert(!events.includes('blast'));
 vm.runInContext('updateAircraftVictory(.4);',ctx);
 assert.equal(ctx.aircraftVictoryReplay,null);assert.equal(scene.children.length,0);assert(airplane.visible);
 assert.deepEqual(events,['dispose','dispose','blast']);
 vm.runInContext('updateAircraftVictory(1.1);',ctx);assert.equal(events.at(-1),'success');
});


test('replay aircraft keep moving while the final bullet catches the opponent at its destruction position',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:11345,y:2456,z:-34567},speed:1000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 ending.confirmSuccess();ending.confirmDestruction(hit,0,undefined,{x:200,y:0,z:0});
 const initial=ending.enemyPosition.x;ending.update(.5);
 assert(ending.enemyPosition.x>initial&&ending.enemyPosition.x<hit.position.x);
 assert(ending.pilotMuzzlePosition.x>ending.shotOrigin.x&&ending.pilotMuzzlePosition.x<ending.bulletPosition.x);
 assert.equal(ending.update(.5).blast,true);assert.deepEqual(ending.enemyPosition.toArray(),[12345,2456,-34567]);
});

for(const finalOrdinal of [0,1])test(`M10 plays the final enemy's bullet and crash screenplay only, kill order ending ${finalOrdinal}`,()=>{
 const ids=['nightowl','bluejay'],first=1-finalOrdinal;
 const candidates=journeyDallas16.enemies.map((enemy,index)=>new AircraftVictory('attempt',ids[index],'pilot',
  {enemyAircraft:enemy.aircraft,enemyLivery:enemy.livery}));
 for(const ending of candidates){
  ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
  ending.recordFatalHit({playerId:ending.targetId,shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 }
 const planes=ids.map(()=>new THREE.Group()),events=[],effects=[];
 const no=()=>{},ctx=vm.createContext({THREE,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,
  aircraftVictory:candidates[0],aircraftVictoryCandidates:candidates,aircraftVictoryReplay:null,prepareAircraftVictoryReplay:ending=>events.push(`replay:${ending.targetId}`),clearAircraftVictoryReplay(){},
  journeyMode:true,journeyAttempt:{missionId:journeyDallas16.id,attemptId:'attempt',targetId:ids[0],secondaryTargetId:ids[1],crossfireKills:1<<first,status:'RACING'},
  message:{...hit,playerId:ids[first],aircraftType:journeyDallas16.enemies[first].aircraft},localPlayerId:'pilot',airplane:new THREE.Group(),
  remotePlayers:new Map(ids.map((id,index)=>[id,{plane:planes[index],aircraftType:journeyDallas16.enemies[index].aircraft,identityTag:{visible:true},hullTag:{visible:true},playerProxy:{visible:true}}])),
  recentDestructionIds:new Map(),performance:{now:()=>1000},updateHumanRosterStatus:no,destructionPosition:new THREE.Vector3(),recordEscortHudHealth:no,selectedCombatTarget:undefined,
  hapticsManager:{emit:no},audioManager:{playDestroyConfirm:no},airAssaultMode:false,skyDuelMode:false,flightRecap:{kills:0},gameplayFeedback:{push:no},killNotice:()=>'',score:0,recordBestScore:no,handleContractKill:no,showCombatMessage:no,
  createDestructionEffect:(_position,type)=>effects.push(type),playDestructionSound:no,transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove:no,add:no}},showJourneyResult:()=>events.push('success')});
 vm.runInContext(receive+'\n'+code('updateAircraftVictory')+'\nreceive();updateAircraftVictory(2);',ctx);
 assert.equal(events.length,0,'first destruction must not interrupt gameplay or show success');
 assert.deepEqual(effects,[journeyDallas16.enemies[first].aircraft]);
 ctx.journeyAttempt.status='COMPLETED';ctx.journeyAttempt.crossfireKills=3;
 ctx.message={...hit,playerId:ids[finalOrdinal],aircraftType:journeyDallas16.enemies[finalOrdinal].aircraft};
 vm.runInContext('receive();',ctx);assert.equal(ctx.aircraftVictory.targetId,ids[finalOrdinal]);
 ctx.aircraftVictory.confirmSuccess();vm.runInContext('updateAircraftVictory(.7);',ctx);
 assert.deepEqual(events,[`replay:${ids[finalOrdinal]}`]);
 assert.equal(effects.at(-1),journeyDallas16.enemies[finalOrdinal].aircraft,'blast retains final enemy aircraft');
 vm.runInContext('updateAircraftVictory(1.1);',ctx);assert.equal(events.at(-1),'success');
 assert.deepEqual(ctx.aircraftVictory.impactPosition.toArray(),[12345,2456,-34567]);
});
