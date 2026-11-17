import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {journeyDallasTerritoryDefense01 as mission, journeyDallasCapture01} from '../../shared/journey-mission.mjs';
import {territoriesForCity} from '../../shared/city-territories.mjs';
import {territoryDefenseInstructions} from '../../client/src/mission-journey-content.ts';

const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const functions=['displayedTerritoryState','updateTerritoryPanel','formatJourneyResultTime'];
const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&functions.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const hud=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateJourneyHud');
const branch=hud.body.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)==='journeyAttempt.missionId===journeyDallasTerritoryDefense01.id');
const code=ts.transpileModule(declarations+'\nfunction renderM16()'+branch.thenStatement.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function element(){return {hidden:false,textContent:'',children:[],className:'',style:{setProperty(){}},classList:{add(){}},setAttribute(){},append(child){this.children.push(child);},replaceChildren(...children){this.children=children;},querySelector(){return this.children.find(child=>child.className.includes('territory-defense-instructions'));}};}
function fixture(){
 const rows=[],ctx=vm.createContext({journeyDallasTerritoryDefense01:mission,journeyMode:true,territoryDefenseInstructions,
  setMissionInstructions(el,text){el.replaceChildren({children:text.split('\n').map(line=>({textContent:line.replace(/^• /,'')}))});},
  journeyAttempt:{missionId:mission.id,status:'APPROACH',captureMs:0,defenseMs:0,enemyCaptureMs:0,invaderInside:false,targetId:'invader',failureReason:null},
  localPlayerId:'local',serverProfile:{pilotName:'Pilot-651'},territoryDefinitions:territoriesForCity('dallas'),territoryState:new Map(),neutralTerritoryColor:'#ffffff',
  cityTerritoriesPanel:{update(items){rows.splice(0,rows.length,...items);}},refreshTerritoryBorders(){},updateCaptureHud(){},document:{createElement:element},
  journeyHudObjective:element(),journeyHudProgress:element(),journeyHudTarget:element(),journeyHudTimer:element(),journeyHudHint:element(),journeyHudEnemy:element(),monsterBossHud:element(),escortHealthHud:element(),segments:element()});
 vm.runInContext(code,ctx);return {ctx,rows};
}

test('M16 territory row uses neutral, capture percentage, pilot name, attack and new-owner states',()=>{
 const {ctx,rows}=fixture(),a=ctx.journeyAttempt;
 ctx.updateTerritoryPanel();assert.equal(rows[0].statusLabel,'Neutral');assert.equal(rows[0].color,'#ffffff');
 a.status='RACING';a.captureMs=49800;ctx.updateTerritoryPanel();assert.equal(rows[0].statusLabel,'Capturing 83%');
 a.captureMs=mission.captureDurationMs;ctx.updateTerritoryPanel();assert.equal(rows[0].statusLabel,'Pilot-651');assert.notEqual(rows[0].color,'#ffffff');
 a.invaderInside=true;ctx.updateTerritoryPanel();assert.equal(rows[0].statusLabel,'UNDER ATTACK');
 a.invaderInside=false;ctx.updateTerritoryPanel();assert.equal(rows[0].statusLabel,'Pilot-651');
 a.failureReason='TERRITORY_OVERRUN';ctx.updateTerritoryPanel();assert.equal(rows[0].statusLabel,'Nightowl');assert.equal(rows[0].controllerId,'invader');
 assert.equal(rows[0].name,'LAS COLINAS');
});

test('reviewed mission card has two objectives and a hold clock, with no duplicate capture or enemy status UI',()=>{
 const {ctx}=fixture();ctx.renderM16();
 assert.deepEqual(Array.from(ctx.journeyHudObjective.children[0].children,item=>item.textContent),[
  'Capture 1 TERRITORY','Hold TERRITORY for 1 minute after capturing'
 ]);
 assert.equal(ctx.journeyHudProgress.hidden,true,'capture progress belongs only in the territory row');
 ctx.journeyAttempt.captureMs=mission.captureDurationMs;ctx.journeyAttempt.defenseMs=26000;ctx.journeyAttempt.invaderInside=true;ctx.journeyAttempt.enemyCaptureMs=25000;
 ctx.renderM16();assert.equal(ctx.journeyHudProgress.hidden,false);assert.equal(ctx.journeyHudProgress.textContent,'HOLD: 0:26 / 1:00');
 assert.equal(ctx.journeyHudObjective.children.length,1);
 ctx.journeyAttempt.defenseMs=90000;ctx.renderM16();assert.equal(ctx.journeyHudProgress.textContent,'HOLD: 1:00 / 1:00');
 ctx.journeyAttempt.defenseMs=-1000;ctx.renderM16();assert.equal(ctx.journeyHudProgress.textContent,'HOLD: 0:00 / 1:00');
 ctx.journeyAttempt.captureMs=0;ctx.renderM16();assert.equal(ctx.journeyHudProgress.hidden,true);assert.equal(ctx.journeyHudProgress.textContent,'');
 for(const key of ['journeyHudTarget','journeyHudTimer','journeyHudHint','journeyHudEnemy','segments'])assert.equal(ctx[key].hidden,true,key);
});

test('M16 reuses the M5 live capture bar until ownership, then leaves the hold clock',()=>{
 const captureHud=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateCaptureHud');
 const calls=[];
 const ctx=vm.createContext({journeyDallasCapture01,journeyDallasTerritoryDefense01:mission,
  journeyAttempt:{missionId:mission.id,status:'RACING',captureMs:15000},journeyPaused:false,
  captureMissionTerritoryName:'LAS COLINAS',flightGameRoot:{classList:{toggle(name,live){calls.push(['live',live]);}}},
  missionCaptureBar:{show(...args){calls.push(['show',...args]);},hide(){calls.push(['hide']);}}});
 vm.runInContext(ts.transpileModule(captureHud.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 ctx.updateCaptureHud();assert.deepEqual(calls.pop(),['show','LAS COLINAS',25,false]);
 ctx.journeyPaused=true;ctx.updateCaptureHud();assert.deepEqual(calls.pop(),['hide']);
 ctx.journeyPaused=false;ctx.journeyAttempt.captureMs=mission.captureDurationMs;
 ctx.updateCaptureHud();assert.deepEqual(calls.pop(),['hide']);
 ctx.journeyAttempt.status='FAILED';ctx.updateCaptureHud();assert.deepEqual(calls.pop(),['hide']);
 ctx.journeyAttempt={missionId:journeyDallasCapture01.id,status:'COMPLETED',captureMs:journeyDallasCapture01.captureDurationMs};
 ctx.updateCaptureHud();assert.deepEqual(calls.pop(),['show','LAS COLINAS',100,true]);
});
