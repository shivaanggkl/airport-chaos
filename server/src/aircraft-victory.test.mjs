import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {AircraftVictory} from '../../client/src/aircraft-victory.js';
import {aircraftPresentationMuzzleSockets,aircraftPresentationScale} from '../../shared/aircraft-presentation-scale.mjs';
import {journeyDallas07,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas11,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,journeyMissionSlot} from '../../shared/journey-mission.mjs';

import {createProjectileCore,fitProjectileRound as fitRound} from '../../client/src/projectile-visual.js';

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
let destroyedBlock, transportFinalBlock;
function find(n){
 if(ts.isIfStatement(n)&&n.expression.getText(ast)==="message.type === 'destroyed'")destroyedBlock=n.thenStatement;
 if(ts.isIfStatement(n)&&n.expression.getText(ast)==="message.type === 'transportFinal'")transportFinalBlock=n.thenStatement;
 ts.forEachChild(n,find);
}
find(ast);assert(destroyedBlock);assert(transportFinalBlock);
const receive=ts.transpileModule(`function receive()${destroyedBlock.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const receiveTransportFinal=ts.transpileModule(`function receiveTransportFinal()${transportFinalBlock.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('a giant plane gets the final bullet before its existing crash and a queued escort waits for that crash',()=>{
 const events=[],no=()=>{};
 const origin={x:20,y:500,z:0},impact={x:20,y:500,z:-600},pose={x:25,y:490,z:-625,yaw:0};
 const transportView={
  defeatActive:false,holdForFinishingShot(){events.push('hold giant');return true;},
  finishFinishingShot(){events.push('giant crash');this.defeatActive=true;},finish:no,
 };
 const escort=new AircraftVictory('attempt','escort','pilot');
 escort.confirmDestruction({...hit,playerId:'escort'},0);
 const ctx=vm.createContext({AircraftVictory,transportView,journeyAttemptId:'attempt',localPlayerId:'pilot',
  message:{attemptId:'attempt',kind:'defeat',finishingShot:{id:'fatal',origin,impact,pose,speed:800}},
  journeyAttempt:{attemptId:'attempt',status:'RACING'},aircraftVictory:null,aircraftVictoryQueue:[],
  aircraftVictoryTransport:undefined,aircraftVictoryReplay:null,clearHeldActions:no,mobileInput:{reset:no},boostActive:false,
  clearAircraftVictoryReplay:no,prepareAircraftVictoryReplay:ending=>events.push(ending.targetId),
  createDestructionEffect:()=>events.push('escort blast'),playDestructionSound:no,audioManager:{playDestroyConfirm:no},
  transportCrashFlash:{style:{}},flightGameRoot:{classList:{add:no,remove:no}},escort});
 vm.runInContext([receiveTransportFinal,code('playAircraftVictory'),code('updateAircraftVictory'),
  'receiveTransportFinal();playAircraftVictory(escort);updateAircraftVictory(.25);'].join('\n'),ctx);
 const giant=ctx.aircraftVictory;
 assert.deepEqual(events,['hold giant','transport:attempt']);
 assert.deepEqual(giant.shotOrigin.toArray(),[20,500,0]);
 assert(giant.replaying);
 vm.runInContext('updateAircraftVictory(.6);updateAircraftVictory(1);',ctx);
 assert.deepEqual(giant.bulletPosition.toArray(),[20,500,-600]);
 assert.deepEqual(events,['hold giant','transport:attempt','giant crash']);
 transportView.defeatActive=false;
 vm.runInContext('updateAircraftVictory(.05);updateAircraftVictory(.05);',ctx);
 assert.deepEqual(events,['hold giant','transport:attempt','giant crash','escort','escort blast']);
});

test('real M7 destruction handler uses the ground-crash breakup once at the server impact, then reveals success',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot');ending.confirmSuccess();
 const plane=new THREE.Group();plane.position.set(-999,111,222);plane.rotation.y=.6;
 const no=()=>{},remote={plane,aircraftType:'privateJet',identityTag:{visible:true},hullTag:{visible:true},playerProxy:{visible:true}};
 const effects=[],events=[],classes=new Set(['aircraft-victory-active']);
 const ctx=vm.createContext({THREE,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,aircraftVictoryQueue:[],transportView:undefined,aircraftVictoryTransport:undefined,aircraftVictoryCandidates:[ending],aircraftVictory:ending,aircraftVictoryReplay:null,prepareAircraftVictoryReplay(){},clearAircraftVictoryReplay(){},journeyMode:true,journeyAttempt:{missionId:journeyDallas13.id,attemptId:'attempt',targetId:'enemy',status:'COMPLETED'},
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
 const ctx=vm.createContext({clearAircraftVictoryReplay(){},aircraftVictoryQueue:[],transportView:undefined,aircraftVictoryTransport:undefined,aircraftVictoryCandidates:[],aircraftVictory:new AircraftVictory('old','enemy','pilot'),flightGameRoot:{classList:{remove:c=>classes.delete(c)}},
  crashSequence:{},crashTrainingResetPending:true,transportCrashFlash:{style:{opacity:'1'}},crashPresentationStarted:false,transportCollisionAttemptId:'old'});
 vm.runInContext(code('resetCrashPresentation')+'\nresetCrashPresentation();',ctx);
 assert.equal(ctx.aircraftVictory,null);assert.equal(classes.size,0);assert.equal(ctx.transportCrashFlash.style.opacity,'0');
});


for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas17,journeyDallas18])test(`${mission.name}: actual success presentation waits behind the ending without restarting it`,()=>{
 const config=(mission===journeyDallas08||mission===journeyDallas09||mission===journeyDallas10||mission===journeyDallas12)?{enemyAircraft:mission.escortAircraft[0],enemyLivery:mission.escortLiveries[0],fromGameplayCamera:true}:mission;
 const ending=new AircraftVictory('attempt','enemy','pilot',config),hidden=new Set();
 const ctx=vm.createContext({journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,aircraftVictory:ending,aircraftVictoryQueue:[],crashSequence:null,
  clearHeldActions(){},mobileInput:{reset(){}},boostActive:true,runStarted:true,cinematicDirector:{clearPresentation(){}},
  journeyResultElement:{classList:{add:c=>hidden.add(c)}},flightGameRoot:{classList:{add(){}}}});
 ctx.result={missionId:mission.id,attemptId:'attempt',status:'COMPLETED'};
 vm.runInContext(code('showJourneyResult')+"\nshowJourneyResult(result);",ctx);
 assert(ending.pending);assert(hidden.has('hidden'));assert.equal(ctx.runStarted,false);assert.equal(ctx.boostActive,false);
 assert.equal(ending.update(0).blast,false,'success alone cannot invent an explosion');
});


test('M16 plays the shared victory flyby after combat and before the success box', async () => {
 const events=[];
 const result={missionId:journeyDallas10.id,attemptId:'gunship',status:'COMPLETED'};
 let finishTransport;
 const transportView={
  defeatComplete:false,
  finish(){},
  defeatFinished:new Promise(resolve=>{finishTransport=resolve;}),
 };
 const no=()=>{};
 const ctx=vm.createContext({
  events,result,journeyAttempt:result,journeyDallas07,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas11,journeyDallas12,
  aircraftVictory:{attemptId:result.attemptId,complete:false,confirmSuccess:no},aircraftVictoryQueue:[],
  transportView,pendingTransportResultId:null,clearHeldActions:no,mobileInput:{reset:no},cinematicDirector:{clearPresentation:no},
  journeyResultElement:{classList:{add:no}},flightGameRoot:{classList:{add:no,remove:no}},
  missionClearAttemptId:null,missionClearStartedAt:null,boostActive:false,runStarted:false,
  beginMissionClear(attempt){events.push('victory');ctx.missionClearAttemptId=attempt.attemptId;ctx.missionClearStartedAt=0;},
  performance:{now:()=>5000},MISSION_CLEAR_DURATION_MS:4200,missionClearElement:{classList:{add:no,remove:no}},
 });
 // Stop at the start of the result box rendering. The real gates and flyby
 // completion callback decide when execution gets there.
 const resultGate=code('showJourneyResult').split('    flightEndResultActive = false;')[0];
 vm.runInContext(resultGate+"events.push('success'); }\n"+code('updateMissionClear'),ctx);
 vm.runInContext('showJourneyResult(result);',ctx);
 assert.deepEqual(events,[],'the final aircraft replay still owns the ending');
 ctx.aircraftVictory.complete=true;
 vm.runInContext('showJourneyResult(result);',ctx);
 assert.deepEqual(events,[],'the transport destruction cinematic must finish first');
 transportView.defeatComplete=true;
 finishTransport();
 await transportView.defeatFinished;
 assert.deepEqual(events,['victory']);
 vm.runInContext('showJourneyResult(result); updateMissionClear(0);',ctx);
 assert.deepEqual(events,['victory','success'],'duplicate completion cannot restart or bypass the flyby');
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

const cameraFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'updateCamera');
const victoryCameraBranch = cameraFunction.body.statements[0].getText(ast);
const victoryCameraCode = ts.transpileModule(`function updateVictoryCamera(){${victoryCameraBranch}}`, {
 compilerOptions: {target: ts.ScriptTarget.ES2022},
}).outputText;
const replayCases = [
 ...[journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas17,journeyDallas18].map(mission => ({mission, config: mission})),
 ...journeyDallas16.enemies.map(enemy => ({mission: journeyDallas16, config: {enemyAircraft: enemy.aircraft, enemyLivery: enemy.livery}})),
 ...[journeyDallas07,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas11,journeyDallas12]
  .flatMap(mission => [
   {mission, giant: true, config: {enemyAircraft: 'cargo', enemyLivery: '', fromGameplayCamera: true}},
   ...(mission.escortAircraft ?? []).map((enemyAircraft,index) => ({
    mission, config: {enemyAircraft, enemyLivery: mission.escortLiveries[index], fromGameplayCamera: true},
   })),
  ]),
];
for (const {mission, config, giant} of replayCases) test(`M${journeyMissionSlot(mission.id)} ${giant ? 'giant plane' : config.enemyLivery}: replay renders the live crimson round`,()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',config);ending.confirmSuccess();
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 ending.confirmDestruction(hit,.6);
 const airplane=new THREE.Group(),scene=new THREE.Scene(),events=[],created=[],liveries=[];
 const camera=new THREE.PerspectiveCamera(58);
 camera.position.set(11700,2470,-34500);
 camera.lookAt(new THREE.Vector3().copy(hit.position));
 airplane.position.set(11745,2456,-34562);
 const transport=giant ? {root:new THREE.Group(),finishFinishingShot:()=>events.push('giant crash')} : undefined;
 const ctx=vm.createContext({THREE,aircraftVictory:ending,aircraftVictoryReplay:null,aircraftVictoryQueue:[],aircraftVictoryCandidates:[],transportView:transport,aircraftVictoryTransport:transport,airplane,scene,
  journeyDallas13,getCurrentMuzzlePosition:out=>out.copy(airplane.position).add(new THREE.Vector3(0,0,-5)),camera,createProjectileCore,fitRound,CAMERA_CHASE_FOV:58,skyDome:new THREE.Group(),window:{innerHeight:1080},aircraftType:'trainer',aircraftPresentationMuzzleSockets,serverProfile:{cosmetics:{equipped:{}}},applyEquippedLivery:(_plane,type,paint)=>liveries.push({type,paint}),
  createAirplane:type=>{created.push(type);const p=new THREE.Group();p.userData.airframeRoot=new THREE.Group();p.add(p.userData.airframeRoot);return p;},
  transport,audioManager:{playDestroyConfirm(){}},disposeAirplaneMaterials:()=>events.push('dispose'),
  createDestructionEffect:(position,type)=>{assert.equal(type,config.enemyAircraft);assert.deepEqual(position.toArray(),[12345,2456,-34567]);events.push('blast');},playDestructionSound(){},
  transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove(){}}},journeyDallas17,journeyDallas18,journeyAttempt:{attemptId:'attempt',status:'COMPLETED'},showJourneyResult:()=>events.push('success')});
 vm.runInContext([code('fitProjectileRound'),code('createProjectileMesh'),code('clearAircraftVictoryReplay'),code('prepareAircraftVictoryReplay'),
  code('updateAircraftVictory'),victoryCameraCode,
  'prepareAircraftVictoryReplay(aircraftVictory, undefined, transport);updateAircraftVictory(.3);updateVictoryCamera();'].join('\n'),ctx);
 const replay=ctx.aircraftVictoryReplay;
 assert.deepEqual(created,giant ? ['trainer'] : ['trainer',config.enemyAircraft]);
 if (!giant) {
  assert.equal(liveries[1].paint[`livery:${config.enemyAircraft}`],config.enemyLivery);
  assert(replay.enemy.visible);
  assert.deepEqual(replay.enemy.position.toArray(),[12345,2456,-34567]);
 }
 assert(replay.root.visible);assert.equal(airplane.visible,false);
 assert(replay.tracer.position.distanceTo(ending.shotOrigin)>0);assert(!events.includes('blast'));
 const core=replay.tracer.children[0];
 assert.equal(replay.tracer.children.length,1);
 assert(core.geometry instanceof THREE.SphereGeometry);
 assert.equal(core.material.color.getHex(),0xdc143c);
 assert.equal(core.material.transparent,false);
 const depth=-replay.tracer.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
 assert.ok(depth>0);
 assert.ok(Math.abs(replay.tracer.scale.x * camera.projectionMatrix.elements[5] * 540 / depth - 12)<1e-8);
 vm.runInContext('updateAircraftVictory(.7);',ctx);
 assert.equal(ctx.aircraftVictoryReplay,null);assert.equal(scene.children.length,0);assert(airplane.visible);
 if (giant) assert.deepEqual(events,['dispose','giant crash','success']);
 else {
  assert.deepEqual(events,['dispose','dispose','blast']);
  vm.runInContext('updateAircraftVictory(1.1);',ctx);assert.equal(events.at(-1),'success');
 }
});

for (const {mission,config,giant} of replayCases) for (const aircraftType of ['trainer','privateJet','cargo','fighter']) test(`M${journeyMissionSlot(mission.id)} ${giant ? 'giant' : config.enemyLivery}: ${aircraftType} keeps its live pose and camera during the finishing shot`,()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',config);
 ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:0,y:500,z:3000},speed:4000});
 ending.recordFatalHit({playerId:'enemy',shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 ending.confirmSuccess();ending.confirmDestruction(hit,0,undefined,{x:200,y:0,z:0});
 const airplane=new THREE.Group(),airframe=new THREE.Group();airplane.add(airframe);airplane.userData.airframeRoot=airframe;
 airplane.position.set(11745,2456,-34562);airplane.rotation.set(.1,.4,.2);
 airframe.position.set(0,-2,0);airframe.scale.setScalar(aircraftPresentationScale[aircraftType]);
 const camera=new THREE.PerspectiveCamera(58);camera.position.copy(airplane.position).add(new THREE.Vector3(0,20,100));camera.lookAt(airplane.position);
 const launch=airplane.position.clone().add(new THREE.Vector3(2,1,-10));
 const ctx=vm.createContext({THREE,aircraftVictoryReplay:null,journeyDallas13,journeyDallas17,journeyDallas18,airplane,camera,aircraftType,
  aircraftPresentationMuzzleSockets,serverProfile:{cosmetics:{equipped:{}}},applyEquippedLivery(){},scene:new THREE.Scene(),createProjectileMesh:()=>new THREE.Group(),
  getCurrentMuzzlePosition:out=>out.copy(launch),createAirplane:()=>{const p=new THREE.Group();p.userData.airframeRoot=new THREE.Group();p.add(p.userData.airframeRoot);return p;},ending,transport:giant ? {root:new THREE.Group()} : undefined});
 vm.runInContext(code('prepareAircraftVictoryReplay')+'\nprepareAircraftVictoryReplay(ending, undefined, transport);',ctx);
 const replay=ctx.aircraftVictoryReplay;
 assert.deepEqual(replay.pilot.position.toArray(),airplane.position.toArray());
 assert(replay.pilot.quaternion.angleTo(airplane.quaternion)<1e-7);
 assert.deepEqual(replay.pilot.userData.airframeRoot.scale.toArray(),airframe.scale.toArray());
 assert.deepEqual(replay.pilot.userData.airframeRoot.position.toArray(),airframe.position.toArray());
 const initialCamera=camera.position.clone();ending.update(.2);ending.updateCamera(camera);
 assert.deepEqual(camera.position.toArray(),initialCamera.toArray());
 ending.update(.3);
 assert.deepEqual(ending.pilotMuzzlePosition.toArray(),launch.toArray());
 assert.deepEqual(ending.enemyPosition.toArray(),Object.values(hit.position));
 assert(ending.bulletPosition.distanceTo(launch)>0);
 assert(ending.update(2).blast);
 assert.deepEqual(ending.bulletPosition.toArray(),Object.values(hit.position));
});

test('later replay aircraft keep moving while the final bullet catches the opponent at its destruction position',()=>{
 const ending=new AircraftVictory('attempt','enemy','pilot',journeyDallas15);
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

const crossfireResultStart=source.indexOf("    if ((message.attempt.missionId === journeyDallas16.id || message.attempt.missionId === journeyDallas17.id || message.attempt.missionId === journeyDallas18.id) && localPlayerId");
const crossfireResultEnd=source.indexOf('    if (previousAttempt?.missionId',crossfireResultStart);
const crossfireResult=ts.transpileModule(source.slice(crossfireResultStart,crossfireResultEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const finalOrdinal of [0,1])for(const overlapping of [false,true])test(`M10 replays both opponents, final target ${finalOrdinal}, overlapping ${overlapping}`,()=>{
 const ids=['nightowl','bluejay'],first=1-finalOrdinal;
 const candidates=journeyDallas16.enemies.map((enemy,index)=>new AircraftVictory('attempt',ids[index],'pilot',
  {enemyAircraft:enemy.aircraft,enemyLivery:enemy.livery}));
 for(const ending of candidates){
  ending.recordProjectile({projectileId:'finish',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
  ending.recordFatalHit({playerId:ending.targetId,shooterId:'pilot',health:0,impactId:'finish',impactPosition:hit.position});
 }
 const planes=ids.map(()=>new THREE.Group()),events=[],effects=[];
 const no=()=>{},ctx=vm.createContext({THREE,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,
  aircraftVictory:candidates[0],aircraftVictoryQueue:[],transportView:undefined,aircraftVictoryTransport:undefined,aircraftVictoryCandidates:candidates,aircraftVictoryReplay:null,
  clearHeldActions:no,mobileInput:{reset:no},boostActive:true,prepareAircraftVictoryReplay:ending=>events.push(`replay:${ending.targetId}`),clearAircraftVictoryReplay(){},
  journeyMode:true,journeyAttempt:{missionId:journeyDallas16.id,attemptId:'attempt',targetId:ids[0],secondaryTargetId:ids[1],crossfireKills:1<<first,status:'RACING'},
  message:{...hit,playerId:ids[first],aircraftType:journeyDallas16.enemies[first].aircraft},localPlayerId:'pilot',airplane:new THREE.Group(),
  remotePlayers:new Map(ids.map((id,index)=>[id,{plane:planes[index],aircraftType:journeyDallas16.enemies[index].aircraft,identityTag:{visible:true},hullTag:{visible:true},playerProxy:{visible:true}}])),
  recentDestructionIds:new Map(),performance:{now:()=>1000},updateHumanRosterStatus:no,destructionPosition:new THREE.Vector3(),recordEscortHudHealth:no,selectedCombatTarget:undefined,
  hapticsManager:{emit:no},audioManager:{playDestroyConfirm:no},airAssaultMode:false,skyDuelMode:false,flightRecap:{kills:0},gameplayFeedback:{push:no},killNotice:()=>'',score:0,recordBestScore:no,handleContractKill:no,showCombatMessage:no,
  createDestructionEffect:(_position,type)=>effects.push(type),playDestructionSound:no,transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove:no,add:no}},showJourneyResult:()=>events.push('success')});
 vm.runInContext([receive,code('playAircraftVictory'),code('updateAircraftVictory'),'receive();receive();'].join('\n'),ctx);
 assert.deepEqual(events,[`replay:${ids[first]}`]);
 assert.equal(ctx.aircraftVictory,candidates[first]);
 vm.runInContext('updateAircraftVictory(.3);',ctx);
 assert(candidates[first].replaying);
 assert.equal(effects.length,0,'the first bullet travels before its blast');
 if(!overlapping){
  vm.runInContext('updateAircraftVictory(2);',ctx);
  assert.equal(candidates[first].hasCamera,false,'the camera returns to gameplay');
  assert.equal(candidates[first].pending,false);
  assert.deepEqual(effects,[journeyDallas16.enemies[first].aircraft]);
  assert(!events.includes('success'),'one surviving opponent keeps the mission active');
 }
 ctx.previousAttempt=ctx.journeyAttempt;
 ctx.journeyAttempt={...ctx.previousAttempt,status:'COMPLETED',crossfireKills:3};
 ctx.message={attempt:ctx.journeyAttempt};
 vm.runInContext(crossfireResult,ctx);
 ctx.message={...hit,playerId:ids[finalOrdinal],aircraftType:journeyDallas16.enemies[finalOrdinal].aircraft};
 vm.runInContext('receive();receive();',ctx);
 if(overlapping){
  assert.deepEqual(events,[`replay:${ids[first]}`],'the final takedown waits its turn');
  assert.equal(ctx.aircraftVictory,candidates[first]);
  vm.runInContext('updateAircraftVictory(2);',ctx);
 }
 assert.equal(ctx.aircraftVictory,candidates[finalOrdinal]);
 assert.deepEqual(events,[`replay:${ids[first]}`,`replay:${ids[finalOrdinal]}`]);
 vm.runInContext('updateAircraftVictory(.7);',ctx);
 assert.deepEqual(effects,[journeyDallas16.enemies[first].aircraft,journeyDallas16.enemies[finalOrdinal].aircraft]);
 assert(!events.includes('success'));
 vm.runInContext('updateAircraftVictory(1.1);',ctx);
 assert.equal(events.at(-1),'success');
 assert.deepEqual(candidates[finalOrdinal].impactPosition.toArray(),[12345,2456,-34567]);
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
 const end=source.indexOf('    if (previousAttempt?.missionId !== message.attempt.missionId)',start);
 const stateHandler=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const attempt={missionId:mission.id,attemptId:'state-replay',targetId:'enemy',secondaryTargetId:'second',rearGuardThirdId:'third',rearGuardFourthId:'fourth',crossfireKills:mission===journeyDallas18?14:6,status:'RACING'};
 let clears=0;
 const ctx=vm.createContext({journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,AircraftVictory,
  message:{attempt},previousAttempt:attempt,localPlayerId:'pilot',aircraftVictory:null,aircraftVictoryQueue:[],transportView:undefined,aircraftVictoryTransport:undefined,aircraftVictoryCandidates:[],clearAircraftVictoryReplay:()=>clears++,flightGameRoot:{classList:{remove(){}}},transportCrashFlash:{style:{}}});
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
const m14StateEnd=source.indexOf('    if (previousAttempt?.missionId !== message.attempt.missionId)',m14StateStart);
const m14StateHandler=ts.transpileModule(source.slice(m14StateStart,m14StateEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function m14Fixture(mission=journeyDallas08) {
 const aircraft=mission.enemies?.map(enemy=>enemy.aircraft)??mission.escortAircraft;
 const ids=['escort-a','escort-b','escort-c','escort-d'].slice(0,aircraft.length),events=[],effects=[],no=()=>{},camera=new THREE.PerspectiveCamera(58);
 camera.position.set(100,200,300);camera.lookAt(0,150,0);camera.updateMatrixWorld();
 const attempt={missionId:mission.id,attemptId:'escorts',targetId:ids[0],secondaryTargetId:ids[1],rearGuardThirdId:ids[2],rearGuardFourthId:ids[3],rearGuardKills:0,monsterHealth:2000,fortressLeftHealth:0,fortressRightHealth:0,status:'RACING'};
 const planes=ids.map(()=>new THREE.Group());
 const ctx=vm.createContext({THREE,journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12,journeyDallas13,journeyDallas14,journeyDallas15,journeyDallas16,journeyDallas17,journeyDallas18,AircraftVictory,
  aircraftVictory:null,aircraftVictoryQueue:[],transportView:undefined,aircraftVictoryTransport:undefined,aircraftVictoryCandidates:[],aircraftVictoryReplay:null,
  prepareAircraftVictoryReplay:ending=>{ending.beginFromGameplayCamera(camera);events.push(`replay:${ending.targetId}`);},clearAircraftVictoryReplay:no,
  clearHeldActions:no,mobileInput:{reset:no},boostActive:false,journeyMode:true,journeyAttempt:attempt,previousAttempt:undefined,localPlayerId:'pilot',airplane:new THREE.Group(),camera,
  remotePlayers:new Map(ids.map((id,index)=>[id,{plane:planes[index],aircraftType:aircraft[index],identityTag:{visible:true},hullTag:{visible:true},playerProxy:{visible:true}}])),
  recentDestructionIds:new Map(),performance:{now:()=>1000},updateHumanRosterStatus:no,destructionPosition:new THREE.Vector3(),recordEscortHudHealth:no,selectedCombatTarget:undefined,
  hapticsManager:{emit:no},audioManager:{playDestroyConfirm:no},airAssaultMode:false,skyDuelMode:false,flightRecap:{kills:0},gameplayFeedback:{push:no},killNotice:()=>'',score:0,recordBestScore:no,handleContractKill:no,showCombatMessage:no,
  createDestructionEffect:(_p,type)=>effects.push(type),playDestructionSound:no,transportCrashFlash:{style:{}},flightGameRoot:{classList:{remove:no,add:no}},showJourneyResult:()=>events.push('success')});
 vm.runInContext([receive,code('playAircraftVictory'),code('updateAircraftVictory')].join('\n'),ctx);
 const state=next=>{ctx.previousAttempt=ctx.journeyAttempt;ctx.journeyAttempt=next;ctx.message={attempt:next};vm.runInContext(m14StateHandler,ctx);};
 state(attempt);
 return {ctx,ids,events,effects,camera,state,attempt,destroy(index){ctx.message={...hit,playerId:ids[index],aircraftType:aircraft[index]};vm.runInContext('receive();',ctx);}};
}
for(const mission of [journeyDallas08,journeyDallas09,journeyDallas10,journeyDallas12])for(const finalOrdinal of mission.escortAircraft.keys())for(const destructionFirst of [false,true])test(`${mission.name} final escort screenplay: final ${finalOrdinal}, destruction first ${destructionFirst}`,()=>{
 const f=m14Fixture(mission),{ctx,ids,state,attempt,events,effects}=f;
 state({...attempt,monsterHealth:0}); // The existing giant-plane blast has already finished.
 assert.equal(ctx.aircraftVictoryCandidates.length,ids.length);assert.equal(ctx.aircraftVictory,null);
 const ending=ctx.aircraftVictoryCandidates[finalOrdinal];
 ending.recordAssistedShot({shotId:'last-bullet',ownerId:'pilot',targetId:ids[finalOrdinal],origin:{x:11745,y:2456,z:-34567},targetPosition:hit.position});
 ending.recordFatalHit({playerId:ids[finalOrdinal],shooterId:'pilot',health:0});
 let kills=0;const expectedEffects=[];
 for(const index of ids.keys())if(index!==finalOrdinal){
   const earlier=ctx.aircraftVictoryCandidates[index];
   earlier.recordProjectile({projectileId:'earlier-bullet',ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
   earlier.recordFatalHit({playerId:ids[index],shooterId:'pilot',health:0,impactId:'earlier-bullet',impactPosition:hit.position});
   kills|=1<<index;state({...attempt,monsterHealth:0,rearGuardKills:kills});f.destroy(index);
   vm.runInContext('updateAircraftVictory(.3);',ctx);
   assert(earlier.replaying);assert.equal(effects.length,expectedEffects.length);
   expectedEffects.push(mission.escortAircraft[index]);
   assert.equal(ctx.aircraftVictory.targetId,ids[index]);
   vm.runInContext('updateAircraftVictory(2);',ctx);
   assert.deepEqual(effects,expectedEffects);
   assert.equal(events.at(-1),`replay:${ids[index]}`);assert(!events.includes('success'));
 }
 assert.equal(ending.mission.enemyLivery,mission.escortLiveries[finalOrdinal]);
 assert.equal(ending.mission.fromGameplayCamera,true);
 if(destructionFirst)f.destroy(finalOrdinal);
 state({...attempt,monsterHealth:0,rearGuardKills:(1<<ids.length)-1,status:'COMPLETED'});
 assert.equal(ctx.aircraftVictory,ending);ending.confirmSuccess();
 if(!destructionFirst)f.destroy(finalOrdinal);
 assert.equal(events.at(-1),`replay:${ids[finalOrdinal]}`);
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
 assert.equal(ctx.aircraftVictory.targetId,f.ids[0]);assert.equal(ctx.aircraftVictoryQueue.length,f.ids.length-1);
 assert(!events.includes('success'),'the result waits for queued escort replays');
 state({...attempt,attemptId:'retry',targetId:'new-a',secondaryTargetId:'new-b',rearGuardThirdId:'new-c',rearGuardFourthId:'new-d'});
 assert.equal(ctx.aircraftVictoryQueue.length,0);
 assert.equal(ctx.aircraftVictoryCandidates.length,f.ids.length);
 assert(ctx.aircraftVictoryCandidates.every(ending=>ending.attemptId==='retry'&&!ending.hasReplay));
 state({...attempt,attemptId:'retry',status:'FAILED'});
 assert.equal(ctx.aircraftVictoryCandidates.length,0);assert.equal(ctx.aircraftVictory,null);
});

for (const remainingWing of ['fortressLeftHealth','fortressRightHealth']) test(`M18 replays escorts without ending the mission while ${remainingWing} is still alive`,()=>{
 const f=m14Fixture(journeyDallas12),{ctx,state,attempt,events,effects}=f;
 state({...attempt,monsterHealth:0,[remainingWing]:250,rearGuardKills:1});
 f.destroy(0);f.destroy(1);
 vm.runInContext('updateAircraftVictory(2);updateAircraftVictory(2);',ctx);
 assert(!events.includes('success'),'destroying escorts cannot finish a living armored giant');
 assert.deepEqual(effects,[...journeyDallas12.escortAircraft]);
});

for(const mission of [journeyDallas17,journeyDallas18])for(const finalOrdinal of mission.enemies.keys())for(const destructionFirst of [false,true])test(`${mission.name} replays all actual aircraft before success: final ${finalOrdinal}, destruction first ${destructionFirst}`,()=>{
 const f=m14Fixture(mission),{ctx,ids,state,attempt,events,effects}=f;
 assert.equal(ctx.aircraftVictoryCandidates.length,mission.enemies.length);
 let kills=0;
 for(const index of [...ids.keys()].filter(index=>index!==finalOrdinal).concat(finalOrdinal)){
  const ending=ctx.aircraftVictoryCandidates[index],enemy=mission.enemies[index];
  assert.equal(ending.mission.enemyAircraft,enemy.aircraft);assert.equal(ending.mission.enemyLivery,enemy.livery);
  assert.equal(ending.mission.fromGameplayCamera,true);
  ending.recordProjectile({projectileId:`bullet${index}`,ownerId:'pilot',position:{x:11745,y:2456,z:-34567},speed:1000});
  ending.recordFatalHit({playerId:ids[index],shooterId:'pilot',health:0,impactId:`bullet${index}`,impactPosition:hit.position});
  kills|=1<<index;
  const final=index===finalOrdinal;
  if(final&&destructionFirst)f.destroy(index);
  state({...attempt,crossfireKills:kills,status:final?'COMPLETED':'RACING'});
  if(final)ending.confirmSuccess();
  if(!final||!destructionFirst)f.destroy(index);
  assert.equal(ctx.aircraftVictory,ending);assert(!events.includes('success'));
  vm.runInContext('updateAircraftVictory(.3);',ctx);assert.equal(ending.replaying,true);
  vm.runInContext('updateAircraftVictory(2);',ctx);
  if(!final)assert(!events.includes('success'));
 }
 assert.equal(events.filter(event=>event.startsWith('replay:')).length,mission.enemies.length);
 assert.equal(effects.length,mission.enemies.length);assert.equal(events.at(-1),'success');
});
