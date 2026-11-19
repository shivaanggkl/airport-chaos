import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {territoriesForCity} from '../../shared/city-territories.mjs';
import {journeyDallasTerritoryHold01 as mission} from '../../shared/journey-mission.mjs';
import {REGION_CINEMATIC_CONFIG,regionCinematicPresentation} from '../../shared/gameplay-cinematic-rules.mjs';
import {cityMissionCatalog} from '../../shared/city-missions.mjs';
import {captureMissionTerritoryName} from '../../client/src/mission-journey-content.ts';
import {MissionCaptureIntroPath} from '../../client/src/mission-capture-intro.ts';
const expected=new Map([['las-colinas','LAS COLINAS TERRITORY'],['love-field','LOVE FIELD TERRITORY'],['downtown','DOWNTOWN DALLAS TERRITORY']]);
const territories=territoriesForCity('dallas');
test('mission panels, map and border labels use the canonical shared territory name in every mode',()=>{
 const source=readFileSync('client/src/main.ts','utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='territoryDisplayName')!;
 const ctx=vm.createContext({});vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 for(const territory of territories){
  assert.match(territory.displayName,/ TERRITORY$/);assert.doesNotMatch(territory.displayName,/CANAL DISTRICT|CENTRAL DISTRICT|AIRPORT/);
  if(expected.has(territory.id))assert.equal(territory.displayName,expected.get(territory.id));
  for(const journeyAttempt of [null,{missionId:'journey-dallas-capture-01'},{missionId:mission.id}]){ctx.journeyAttempt=journeyAttempt;assert.equal(ctx.territoryDisplayName(territory),territory.displayName);}
 }
 assert.equal(captureMissionTerritoryName,expected.get('las-colinas'));
});
test('the three screenplay ownership cards show the same names as the territory HUD',()=>{
 const selected=mission.territoryIds.map(id=>territories.find(t=>t.id===id)!);
 const intro=new MissionCaptureIntroPath(selected[0]!,15000,()=>0,undefined,{player:new THREE.Group(),territories:selected,owners:mission.owners});
 for(const elapsed of [4000,7000,9000]){
  const territory=intro.territoryAt(elapsed)!;
  assert.ok(intro.text(elapsed).startsWith(expected.get(territory.id!)+' · '));
  assert.doesNotMatch(intro.text(elapsed),/CANAL DISTRICT|CENTRAL DISTRICT|LOVE FIELD AIRPORT/);
 }
});
test('legacy region identities and mission identities retain canonical visible territory names',()=>{
 assert.equal(REGION_CINEMATIC_CONFIG.dallas['Canal District'].title,expected.get('las-colinas'));
 assert.equal(REGION_CINEMATIC_CONFIG.dallas['Central District'].title,expected.get('downtown'));
 for(const mission of cityMissionCatalog.dallas)assert.doesNotMatch(mission.displayName+' '+mission.description,/CANAL DISTRICT|CENTRAL DISTRICT|Central District/);
 const canal=cityMissionCatalog.dallas.find(m=>m.id==='canal-capture');
 assert.ok(canal,'saved mission identity is unchanged');
});

test('visible region names change without changing saved exploration identifiers',()=>{
 const source=readFileSync('client/src/dallas-world.ts','utf8'),ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true);let initializer:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='regionBounds')initializer=node.initializer;ts.forEachChild(node,visit);};visit(ast);
 const regions=vm.runInNewContext(ts.transpileModule('('+initializer!.getText(ast)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{place:{executive:'DALLAS EXECUTIVE AIRPORT'}});
 assert.equal(regions[0].name,'CENTRAL DISTRICT');assert.equal(regions[1].name,'CANAL DISTRICT');
 assert.equal(regionCinematicPresentation('dallas',regions[0].name)?.title,expected.get('downtown'));
 assert.equal(regionCinematicPresentation('dallas',regions[1].name)?.title,expected.get('las-colinas'));
});
