import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';
import {COMBAT_RANGE,AIM_ENVELOPE,localFiringDirection} from '../../shared/protocol.mjs';
import {enemyAiLevels} from '../../shared/enemy-ai.mjs';
import {aircraftFlightEnvelope} from '../../shared/aircraft-flight-envelope.mjs';
import {aircraftPresentationMuzzleSockets} from '../../shared/aircraft-presentation-scale.mjs';
import {territoriesForCity,territoryContains} from '../../shared/city-territories.mjs';
import {hunterBallisticSolution} from './hunter-flight.js';
import {assaultShotDirection} from './air-assault.js';
const source=readFileSync('server/src/index.ts','utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const fn=(name:string)=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!.getText(ast);
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const normalize=(v:any)=>{const n=Math.hypot(v.x,v.y,v.z);return {x:v.x/n,y:v.y/n,z:v.z/n};};
const dot=(a:any,b:any)=>a.x*b.x+a.y*b.y+a.z*b.z;
test('every authored aircraft engagement gate reaches the shared 9km gun range',()=>{
 assert.equal(COMBAT_RANGE,9000);
 for(const mission of Object.values(missions))if(mission&&typeof mission==='object'&&'aggressionDistance' in mission)assert.ok(mission.aggressionDistance>=COMBAT_RANGE,mission.id);
 for(const mission of [missions.journeyDallasTerritoryDefense01,missions.journeyDallasTwinHunters01,missions.journeyDallas16,missions.journeyDallas17,missions.journeyDallas18])assert.equal(mission.aggressionDistance,COMBAT_RANGE);
 assert.equal(missions.journeyDallas14.aggressionDistance,30000,'longer scripted detection is preserved; shots still stop at 9km');
});
test('M2 supplies the combat target through 9km instead of dropping it after 5km',()=>{
 const territory=territoriesForCity('dallas').find(t=>t.id==='las-colinas')!;
 const pilot={pilotId:'pilot',lifeState:'alive',health:100,position:{...territory.center,y:1000},lockedTargetId:'enemy'};
 const enemy={cityId:'dallas',aircraftType:'privateJet',position:{...territory.center,y:1000}};
 const ctx=vm.createContext({...missions,players:new Map([['pilot',pilot]]),journeyStore:{activeSnapshot:()=>({status:'RACING'})},territoriesForCity,territoryContains,
  journeyAceClearance:300,botSafeFloor:()=>0,safeBotWaypoint:(_c:any,_from:any,to:any)=>to,insideAceInterceptAirspace:()=>true,botFireSolution:()=>({}),opponentReactionReady:()=>true,
  planOpponentTactics:(_opponent:any,args:any)=>({waypoint:args.objective??pilot.position,tactic:'attackPass',turnSign:1})});
 vm.runInContext(compile(fn('hunterNavigationTarget')),ctx);
 for(const distance of [5001,8999,9000,9001]){
  pilot.position={x:territory.center.x+distance,y:1000,z:territory.center.z};
  const bot={personality:'hunter',journeyTerritoryDefense:true,journeyTargetPlayerId:'pilot',journeyAttemptId:'attempt',opponent:{},speed:420};
  const navigation=ctx.hunterNavigationTarget('enemy',enemy,bot,10000);
  assert.equal(navigation.target?.[0],distance<=COMBAT_RANGE?'pilot':undefined,String(distance));
 }
});
test('Free Fly and Sky Duel practice acquire at 9km and reject farther targets',()=>{
 const declarations=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='skyDuelAiTuning'))!.getText(ast);
 const ctx=vm.createContext({COMBAT_RANGE,hunterDetectionRange:COMBAT_RANGE,playerJourneyRunwayPrep:new Set(),missionFocusedPlayers:new Set(),allowedFocusedBot:()=>true,
  botTerrainHeight:()=>0,hunterClearance:()=>0,runwayCombatProtected:()=>false,currentHeat:()=>({level:0}),cityEvents:new Map()});
 vm.runInContext(compile(declarations+fn('botCombatTarget')+fn('isHunterCombatPhase')),ctx);
 for(const practice of [false,true])for(const distance of [8999,9000,9001]){
  const pilot={cityId:'dallas',position:{x:0,y:1000,z:-distance},lifeState:'alive',hasRespawnTransform:true,lastStateAt:10000,spawnProtectedUntil:0,skyDuelMode:practice,skyDuelMatchId:'match'};
  const bot={cityId:'dallas',position:{x:0,y:1000,z:0},isBot:true,lifeState:'alive',bot:{personality:'hunter',phase:'cruise'},...(practice?{skyDuelPracticeOwnerId:'pilot',skyDuelMatchId:'match'}:{})};
  ctx.players=new Map([['pilot',pilot],['enemy',bot]]);
  assert.equal(ctx.botCombatTarget('enemy',bot,10000)?.[0],distance<=COMBAT_RANGE?'pilot':undefined,`${practice}:${distance}`);
 }
});
test('all aircraft and difficulty levels can aim real ballistic shots through 9km in ordinary and Air Assault combat',()=>{
 const ctx=vm.createContext({COMBAT_RANGE,AIM_ENVELOPE,localFiringDirection,aircraftFlightEnvelope,aircraftPresentationMuzzleSockets,normalize,dot,hunterBallisticSolution,assaultShotDirection,
  runwayCombatProtected:()=>false,smoothHunter:()=>true,hunterObservedPosition:(p:any)=>p,hunterFireCone:.2,hunterFireRange:COMBAT_RANGE,defenderDownwardFireAngle:.3});
 vm.runInContext(compile(['botFireSolution','muzzleTransform','rotateLocalYxz','forwardDirection','hunterForward'].map(fn).join('\n')),ctx);
 for(const aircraftType of ['trainer','fighter','privateJet','cargo'])for(const profile of Object.values(enemyAiLevels))for(const assault of [false,true]){
  const shooter={aircraftType,isBot:true,position:{x:0,y:1000,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},bot:{opponent:{profile}},...(assault?{airAssaultId:'assault'}:{})};
  const muzzle=ctx.muzzleTransform(shooter).position;
  for(const distance of [8999,9000,9001]){
   const target={aircraftType:'trainer',isBot:false,position:{x:muzzle.x,y:muzzle.y,z:muzzle.z-distance},velocity:{x:0,y:0,z:0},lastStateAt:Date.now()};
   const result=ctx.botFireSolution(shooter,target,false);
   assert.equal(!result.reason,distance<=COMBAT_RANGE,`${aircraftType}:${assault}:${distance}`);
  }
 }
 ctx.runwayCombatProtected=()=>true;
 assert.equal(ctx.botFireSolution({}, {},false).reason,'RUNWAY_PROTECTED');
});
