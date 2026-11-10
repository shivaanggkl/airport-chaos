import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {AircraftVictory} from '../../client/src/aircraft-victory.js';
import {aircraftPresentationMuzzleSockets,aircraftPresentationScale} from '../../shared/aircraft-presentation-scale.mjs';
import {journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18} from '../../shared/journey-mission.mjs';

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
 const ctx=vm.createContext({THREE,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,aircraftVictoryCandidates:[ending],aircraftVictory:ending,aircraftVictoryReplay:null,prepareAircraftVictoryReplay(){},clearAircraftVictoryReplay(){},journeyMode:true,journeyAttempt:{missionId:journeyDallas13.id,attemptId:'attempt',targetId:'enemy',status:'COMPLETED'},
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


for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas17,journeyDallas18])test(`${mission.name}: actual success presentation waits behind the ending without restarting it`,()=>{
 const config=(mission===journeyDallas08||mission===journeyDallas09||mission===journeyDallas10||mission===journeyDallas12)?{enemyAircraft:mission.escortAircraft[0],enemyLivery:mission.escortLiveries[0],fromGameplayCamera:true}:mission;
 const ending=new AircraftVictory('attempt','enemy','pilot',config),hidden=new Set();
 const ctx=vm.createContext({journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,aircraftVictory:ending,crashSequence:null,
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
 assert.deepEqual(ending.bulletPosition.toArray(),[12345,2456,-34567]);
 assert.equal(ending.update(1.1).complete,true);
});

test('a finishing replay requires an accepted projectile and matching owned fatal impact',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');
 const shot={projectileId:'finish',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:900};
 const damage={playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position};
 ending.recordProjectile({...shot,ownerId:'unrelated'});
 ending.recordFatalHit(damage);assert(!ending.hasReplay);
 ending.recordProjectile(shot);
 ending.recordFatalHit({...damage,shooterId:'intruder'});assert(!ending.hasReplay);
 ending.recordFatalHit(damage);assert(ending.hasReplay);
 assert.deepEqual(ending.shotOrigin.toArray(),[11745,2456,-34567]);
 assert.deepEqual(ending.impactPosition.toArray(),[12345,2456,-34567]);
});

for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas17,journeyDallas18])test(`${mission.name}: actual scene keeps the correct enemy and tracer until contact, then cleans them before the blast`,()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',mission);ending.confirmSuccess();
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 ending.confirmDestruction(hit,.6);
 const airplane=new THREE.Group(),scene=new THREE.Scene(),events=[],created=[],liveries=[];
 const ctx=vm.createContext({THREE,aircraftVictory:ending,aircraftVictoryReplay:null,airplane,scene,journeyDallas13,
  camera:new THREE.PerspectiveCamera(58),aircraftType:'trainer',aircraftPresentationMuzzleSockets,aircraftPresentationScale,serverProfile:{cosmetics:{equipped:{}}},applyEquippedLivery:(_plane,type,paint)=>liveries.push({type,paint}),
  createAirplane:type=>{created.push(type);const p=new THREE.Group();p.userData.airframeRoot=new THREE.Group();p.add(p.userData.airframeRoot);return p;},
  fitProjectileTrail(){}, createProjectileMesh:()=>{const g=new THREE.Group();g.add(new THREE.Group(),new THREE.Group());return g;},audioManager:{playDestroyConfirm(){}},disposeAirplaneMaterials:()=>events.push('dispose'),
  createDestructionEffect:(position,type)=>{assert.equal(type,mission.enemyAircraft);assert.deepEqual(position.toArray(),[12345,2456,-34567]);events.push('blast');},playDestructionSound(){},
  transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove(){}}},journeyDallas17,journeyDallas18,journeyAttempt:{attemptId:'attempt',status:'COMPLETED'},showJourneyResult:()=>events.push('success')});
 vm.runInContext(code('clearAircraftVictoryReplay')+'\n'+code('prepareAircraftVictoryReplay')+'\n'+code('updateAircraftVictory')+'\nprepareAircraftVictoryReplay(aircraftVictory);updateAircraftVictory(.3);',ctx);
 const replay=ctx.aircraftVictoryReplay;
 assert.deepEqual(created,['trainer',mission.enemyAircraft]);
 assert.equal(liveries[1].type,mission.enemyAircraft);assert.equal(liveries[1].paint[`livery:${mission.enemyAircraft}`],mission.enemyLivery);
 assert(replay.root.visible);assert(replay.enemy.visible);assert.equal(airplane.visible,false);
 assert.deepEqual(replay.enemy.position.toArray(),[12345,2456,-34567]);
 assert(replay.tracer.position.distanceTo(ending.shotOrigin)>0);assert(!events.includes('blast'));
 vm.runInContext((mission===journeyDallas17||mission===journeyDallas18)?'updateAircraftVictory(.7);':'updateAircraftVictory(.4);',ctx);
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

test('M8 holds the opponent at its confirmed pose while only the finishing bullet travels into it',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',journeyDallas14);
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:0,y:2400,z:0},speed:2000});
 // A confirmed sphere collision can lie off the visible aircraft's center.
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:{x:0,y:2400,z:-1900}});
 const position={x:90,y:2400,z:-2000};
 ending.confirmDestruction({...hit,position},Math.PI/2,undefined,{x:1500,y:0,z:0});
 ending.confirmSuccess();
 const camera=new THREE.PerspectiveCamera(58,2.17,.1,100000);
 ending.setTargetRadius(180);
 for(let frame=0;frame<9;frame++){
  assert.equal(ending.update(.1).blast,false);
  assert.deepEqual(ending.enemyPosition.toArray(),[position.x,position.y,position.z],'opponent must not fly across the finishing replay');
  assert.deepEqual(ending.pilotMuzzlePosition.toArray(),ending.shotOrigin.toArray(),'pilot stays at the recorded firing position');
  assert(ending.bulletPosition.distanceTo(ending.shotOrigin)>0,'the bullet visibly travels');
  ending.updateCamera(camera);camera.updateMatrixWorld();
  assert(camera.position.distanceTo(ending.enemyPosition)>=450-1e-6,'camera stays outside the scaled opponent');
  const projected=ending.enemyPosition.clone().project(camera);
  assert(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>-1&&projected.z<1,'opponent remains inside the camera frustum');
 }
 assert(ending.update(.2).blast);
 assert.deepEqual(ending.bulletPosition.toArray(),[position.x,position.y,position.z]);
 assert.deepEqual(ending.enemyPosition.toArray(),ending.bulletPosition.toArray());
 assert.deepEqual(ending.impactPosition.toArray(),ending.enemyPosition.toArray());
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
 const no=()=>{},ctx=vm.createContext({THREE,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,
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

test('all 24 Journey success headings include their displayed mission number, including remapped internal IDs',async()=>{
 const styles=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
 const headingRule=styles.match(/\.journey-result\.is-terminal:not\(\.is-training\):not\(\.is-flight-result\)[^{]*\{([^}]+)\}/);
 assert(headingRule);assert.match(headingRule[1],/display:\s*block/);
 const {missionJourneyDetails}=await import('../../client/src/mission-journey-content.js');
 const {journeyMissionSlot}=await import('../../shared/journey-mission.mjs');
 const start=source.indexOf('  const resultSlot = journeyMissionSlot(attempt.missionId);');
 const end=source.indexOf(';',source.indexOf("[data-journey-result-heading]",start))+1;
 const statement=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 assert.equal(missionJourneyDetails.length,24);
 missionJourneyDetails.forEach((mission,index)=>{
  const heading={textContent:''};
  const ctx=vm.createContext({attempt:{missionId:mission.id},success:true,breakoutMission:index>=18,journeyMissionSlot,journeyResultElement:{querySelector:()=>heading}});
  vm.runInContext(`{${statement}}`,ctx);
  assert.equal(heading.textContent,`M${index+1}`,mission.id);
  ctx.success=false;vm.runInContext(`{${statement}}`,ctx);assert.equal(heading.textContent,`M${index+1}`,`${mission.id} failure`);
 });
});

for(const mission of [journeyDallas17,journeyDallas18])test(`${mission.name}: state packets preserve the recorded fatal shot through completion instead of resetting the replay`,()=>{
 const start=source.indexOf('    if ((message.attempt.missionId !== journeyDallas13.id');
 const end=source.indexOf("    if (message.attempt.missionId === journeyDallas16.id && message.attempt.status === 'COMPLETED')",start);
 const stateHandler=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const attempt={missionId:mission.id,attemptId:'state-replay',targetId:'enemy',status:'RACING'};
 let clears=0;
 const ctx=vm.createContext({journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,AircraftVictory,
  message:{attempt},localPlayerId:'pilot',aircraftVictory:null,aircraftVictoryCandidates:[],clearAircraftVictoryReplay:()=>clears++,flightGameRoot:{classList:{remove(){}}},transportCrashFlash:{style:{}}});
 vm.runInContext(stateHandler,ctx);
 const ending=ctx.aircraftVictory;
 ending.recordProjectile({projectileId:'finisher',ownerId:'pilot',position:{x:hit.position.x,y:hit.position.y,z:hit.position.z+12},speed:6000});
 vm.runInContext(stateHandler,ctx);assert.equal(ctx.aircraftVictory,ending,'health-state packets must retain shot history');
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finisher',impactPosition:hit.position});
 ctx.message={attempt:{...attempt,status:'COMPLETED'}};
 vm.runInContext(stateHandler,ctx);
 assert.equal(ctx.aircraftVictory,ending,'completion packet must retain the fatal shot');
 assert.equal(clears,0);assert(ending.hasReplay);
 ending.confirmSuccess();ending.confirmDestruction(hit,0,undefined,{x:1000,y:0,z:0});
 assert.equal(ending.update(.6).blast,false);assert(ending.replaying);
 assert(ending.update(.11).blast);
 ctx.message={attempt:{...attempt,status:'ABANDONED'}};vm.runInContext(stateHandler,ctx);
 assert.equal(ctx.aircraftVictory,null);assert.equal(clears,1,'exit still cleans the replay');
});

for(const distance of [12,600,6000])test(`M11 matches M10 bullet travel, camera and destruction timing at ${distance}m`,()=>{
 const enemy=journeyDallas16.enemies[0];
 const endings=[new AircraftVictory('m10','enemy','pilot',{enemyAircraft:enemy.aircraft,enemyLivery:enemy.livery}),new AircraftVictory('m11','enemy','pilot',journeyDallas17)];
 const position={x:100,y:2400,z:100-distance};
 for(const ending of endings){
  ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:100,y:2400,z:100},speed:6000});
  ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:position});
  ending.confirmDestruction({...hit,position},0,undefined,{x:200,y:0,z:0});ending.confirmSuccess();
 }
 let blasted=false;
 for(let frame=0;frame<50;frame++){
  const frames=endings.map(ending=>ending.update(.05));assert.deepEqual(frames[1],frames[0]);
  assert.deepEqual(endings[1].bulletPosition.toArray(),endings[0].bulletPosition.toArray());
  assert.deepEqual(endings[1].pilotMuzzlePosition.toArray(),endings[0].pilotMuzzlePosition.toArray());
  const cameras=endings.map(ending=>{const camera=new THREE.PerspectiveCamera(58);ending.updateCamera(camera);return camera;});
  assert.deepEqual(cameras[1].position.toArray(),cameras[0].position.toArray());
  if(frames[1].blast){blasted=true;assert.deepEqual(endings[1].bulletPosition.toArray(),[position.x,position.y,position.z]);}
 }
 assert(blasted);assert(endings.every(ending=>ending.complete));
});

for(const mission of [journeyDallas17,journeyDallas18])test(`${mission.name}: starts at the exact gameplay camera, fires from the muzzle, then follows the bullet to contact`,()=>{
 const ending=new AircraftVictory('camera-start','enemy','pilot',mission);
 const origin={x:100,y:2400,z:100},position={x:100,y:2400,z:-500};
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:origin,speed:6000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:position});
 ending.confirmDestruction({...hit,position},0);ending.confirmSuccess();
 const camera=new THREE.PerspectiveCamera(67);camera.position.set(115,2410,140);camera.lookAt(100,2400,80);
 const initialPosition=camera.position.clone(),initialRotation=camera.quaternion.clone();
 ending.beginFromGameplayCamera(camera);
 assert.equal(ending.update(.2).blast,false);ending.updateCamera(camera);
 assert.deepEqual(camera.position.toArray(),initialPosition.toArray());
 assert(camera.quaternion.angleTo(initialRotation)<1e-6);assert.equal(camera.fov,67);
 assert.deepEqual(ending.bulletPosition.toArray(),[100,2400,100]);
 ending.update(.4);ending.updateCamera(camera);
 assert(ending.bulletPosition.distanceTo(ending.shotOrigin)>0);
 assert(camera.position.distanceTo(initialPosition)>1,'camera travels with the bullet after the gameplay-view handoff');
 assert(camera.quaternion.angleTo(initialRotation)>.01,'camera turns toward the bullet after the gameplay-view handoff');
 assert.equal(ending.update(.2).blast,false);
 assert(ending.update(.11).blast);
 assert.deepEqual(ending.bulletPosition.toArray(),[100,2400,-500]);
 assert.equal(ending.update(1.1).complete,true);
});

const m14StateStart=source.indexOf('    if ((message.attempt.missionId !== journeyDallas13.id');
const m14StateEnd=source.indexOf("    if (message.attempt.missionId === journeyDallas16.id && message.attempt.status === 'COMPLETED')",m14StateStart);
const m14StateHandler=ts.transpileModule(source.slice(m14StateStart,m14StateEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function m14Fixture(mission=journeyDallas08) {
 const ids=['escort-a','escort-b','escort-c','escort-d'].slice(0,mission.escortAircraft.length),events=[],effects=[],no=()=>{},camera=new THREE.PerspectiveCamera(58);
 camera.position.set(100,200,300);camera.lookAt(0,150,0);camera.updateMatrixWorld();
 const attempt={missionId:mission.id,attemptId:'escorts',targetId:ids[0],secondaryTargetId:ids[1],rearGuardThirdId:ids[2],rearGuardFourthId:ids[3],rearGuardKills:0,monsterHealth:2000,fortressLeftHealth:0,fortressRightHealth:0,status:'RACING'};
 const planes=ids.map(()=>new THREE.Group());
 const ctx=vm.createContext({THREE,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,AircraftVictory,
  aircraftVictory:null,aircraftVictoryCandidates:[],aircraftVictoryReplay:null,
  prepareAircraftVictoryReplay:ending=>{ending.beginFromGameplayCamera(camera);events.push(`replay:${ending.targetId}`);},clearAircraftVictoryReplay:no,
  journeyMode:true,journeyAttempt:attempt,previousAttempt:undefined,localPlayerId:'pilot',airplane:new THREE.Group(),camera,
  remotePlayers:new Map(ids.map((id,index)=>[id,{plane:planes[index],aircraftType:mission.escortAircraft[index],identityTag:{visible:true},hullTag:{visible:true},playerProxy:{visible:true}}])),
  recentDestructionIds:new Map(),performance:{now:()=>1000},updateHumanRosterStatus:no,destructionPosition:new THREE.Vector3(),recordEscortHudHealth:no,selectedCombatTarget:undefined,
  hapticsManager:{emit:no},audioManager:{playDestroyConfirm:no},airAssaultMode:false,skyDuelMode:false,flightRecap:{kills:0},gameplayFeedback:{push:no},killNotice:()=>'',score:0,recordBestScore:no,handleContractKill:no,showCombatMessage:no,
  createDestructionEffect:(_p,type)=>effects.push(type),playDestructionSound:no,transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove:no,add:no}},showJourneyResult:()=>events.push('success')});
 vm.runInContext(receive+'\n'+code('updateAircraftVictory'),ctx);
 const state=next=>{ctx.previousAttempt=ctx.journeyAttempt;ctx.journeyAttempt=next;ctx.message={attempt:next};vm.runInContext(m14StateHandler,ctx);};
 state(attempt);
 return {ctx,ids,events,effects,camera,state,attempt,destroy(index){ctx.message={...hit,playerId:ids[index],aircraftType:mission.escortAircraft[index]};vm.runInContext('receive();',ctx);}};
}
for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12])for(const finalOrdinal of mission.escortAircraft.keys())for(const destructionFirst of [false,true])test(`${mission.name} final escort screenplay: final ${finalOrdinal}, destruction first ${destructionFirst}`,()=>{
 const f=m14Fixture(mission),{ctx,ids,state,attempt,events,effects}=f;
 state({...attempt,monsterHealth:0}); // The existing giant-plane blast has already finished.
 assert.equal(ctx.aircraftVictoryCandidates.length,ids.length);assert.equal(ctx.aircraftVictory,null);
 const ending=ctx.aircraftVictoryCandidates[finalOrdinal];
 ending.recordProjectile({projectileId:'last-bullet',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:900});
 ending.recordFatalHit({playerId:ids[finalOrdinal],shooterId:'pilot',health:0,impactId:'last-bullet',impactPosition:hit.position});
 let kills=0;const expectedEffects=[];
 for(const index of ids.keys())if(index!==finalOrdinal){
   kills|=1<<index;state({...attempt,monsterHealth:0,rearGuardKills:kills});f.destroy(index);
   expectedEffects.push(mission.escortAircraft[index]);
   assert.deepEqual(effects,expectedEffects);assert.equal(events.length,0,'earlier escorts do not start the ending');
 }
 assert.equal(ending.mission.enemyLivery,mission.escortLiveries[finalOrdinal]);
 assert.equal(ending.mission.fromGameplayCamera,true);
 if(destructionFirst)f.destroy(finalOrdinal);
 state({...attempt,monsterHealth:0,rearGuardKills:(1<<ids.length)-1,status:'COMPLETED'});
 assert.equal(ctx.aircraftVictory,ending);ending.confirmSuccess();
 if(!destructionFirst)f.destroy(finalOrdinal);
 assert.deepEqual(events,[`replay:${ids[finalOrdinal]}`]);
 assert.equal(ending.update(0).blast,false);ending.updateCamera(f.camera);
 assert.deepEqual(f.camera.position.toArray(),[100,200,300],'opening frame retains the gameplay camera');
 assert.deepEqual(ending.bulletPosition.toArray(),[11745,2456,-34567]);
 vm.runInContext('updateAircraftVictory(1.5);',ctx);
 expectedEffects.push(mission.escortAircraft[finalOrdinal]);
 assert.deepEqual(effects,expectedEffects,'last bullet reaches the escort before its shared destruction effect');
 assert.equal(events.includes('success'),false,'success stays hidden through the blast');
 vm.runInContext('updateAircraftVictory(1.1);',ctx);assert.equal(events.at(-1),'success');
 assert.deepEqual(ending.impactPosition.toArray(),[12345,2456,-34567]);
});
for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12])test(`${mission.name} escort-first order retains the giant ending, and retry clears stale escort shot history`,()=>{
 const f=m14Fixture(mission),{ctx,state,attempt,events}=f;
 let kills=0;for(const index of f.ids.keys()){kills|=1<<index;state({...attempt,rearGuardKills:kills});f.destroy(index);}
 state({...attempt,rearGuardKills:kills,monsterHealth:0,status:'COMPLETED'});
 assert.equal(ctx.aircraftVictory,null);assert.deepEqual(events,[],'giant last never replays an already-dead escort');
 state({...attempt,attemptId:'retry',targetId:'new-a',secondaryTargetId:'new-b',rearGuardThirdId:'new-c',rearGuardFourthId:'new-d'});
 assert.equal(ctx.aircraftVictoryCandidates.length,f.ids.length);
 assert(ctx.aircraftVictoryCandidates.every(ending=>ending.attemptId==='retry'&&!ending.hasReplay));
 state({...attempt,attemptId:'retry',status:'FAILED'});
 assert.equal(ctx.aircraftVictoryCandidates.length,0);assert.equal(ctx.aircraftVictory,null);
});

for (const remainingWing of ['fortressLeftHealth','fortressRightHealth']) test(`M18 does not replay the last escort while ${remainingWing} is still alive`,()=>{
 const f=m14Fixture(journeyDallas12),{ctx,state,attempt,events,effects}=f;
 state({...attempt,monsterHealth:0,[remainingWing]:250,rearGuardKills:1});
 f.destroy(0);f.destroy(1);
 assert.equal(ctx.aircraftVictory,null);
 assert.deepEqual(events,[],'destroying escorts cannot finish a living armored giant');
 assert.deepEqual(effects,[...journeyDallas12.escortAircraft]);
});
