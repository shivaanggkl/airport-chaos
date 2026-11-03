import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync('client/src/main.ts','utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='exitFlightToHub')!;
const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('Free Fly Back to Hub exits directly without a second confirmation and ignores repeated exit requests',()=>{
 const request=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='requestFlightExit')!;
 const requestCode=ts.transpileModule(request.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const exits:boolean[]=[];
 const context={flightExitPending:false,soloExploreMode:true,
  exitFlightToHub(openGarage:boolean){exits.push(openGarage);context.flightExitPending=true;},
  showFlightDialog(){throw new Error('Free Fly exit must not open another confirmation');}};
 runInNewContext(requestCode+'\nrequestFlightExit();requestFlightExit();',context);
 assert.deepEqual(exits,[false]);
});
for(const base of ['https://example.test/','capacitor://localhost','capacitor://localhost/'])
for(const city of ['dallas','milwaukee'])
for(const failClose of [false,true])test(`solo exit from ${city} reaches ${base}${failClose?' even if close throws':''}`,async()=>{
 const href=`${base}?city=${city}&time=day&launchMode=solo-free-fly&newFreeFly=1&entry=journey&journeyReceipt=old`;
 let navigated='',closed=0,aborted=0,stoppedWind=0;
 const context={flightExitPending:false,soloExploreMode:true,journeyMode:false,skyDuelMode:false,
  resetCrashPresentation(){},pendingTransportResultId:null,flightGameRoot:{classList:{remove(){}}},championshipLandingIntentPending:undefined,
  closeFlightDialog(){},serverProfile:{},profileActiveMissionAttempt(){throw new Error('solo exit must not abandon another mode\'s mission');},
  worldPreparationAbort:{abort(){aborted++;}},portalWindStop(){stoppedWind++;},
  clearHeldActions(){},mobileInput:{reset(){}},resetCameraPointers(){},boostActive:false,activeContract:null,cinematicDirector:{dispose(){}},
  pilotMenu:{isOpen:()=>true,close(){}},realtimeStopped:false,clearReconnectTimer(){},WebSocket:{CLOSED:3},
  socket:{readyState:1,close(){closed++;if(failClose)throw new Error('suspended socket');},addEventListener(){throw new Error('must not wait for close');}},
  savePlayerProgress(){},window:{location:{href,assign(url:string){navigated=new URL(url,href).href;}},setTimeout(){throw new Error('must not wait for timeout');}},URL,
  missionObjectiveGuidance:undefined,skyDuelUi:undefined,airAssaultUi:undefined,monsterView:undefined,transportView:undefined,transportViewAttemptId:'',missionIntroSkip:{hidden:false},
  CITY_QUERY_PARAM:'city',LAUNCH_MODE_PARAM:'launchMode',task:undefined as Promise<void>|undefined};
 runInNewContext(code+'\ntask=exitFlightToHub();',context);await context.task;
 assert.equal(navigated,new URL(base).href);assert.equal(closed,1);assert.equal(aborted,1);assert.equal(stoppedWind,1);assert.equal(context.realtimeStopped,true);
});
