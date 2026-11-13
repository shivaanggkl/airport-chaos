import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { journeyDallasCapture01 as mission } from '../../shared/journey-mission.mjs';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const territory = territoriesForCity('dallas').find(item => item.id === mission.territoryId)!;

test('M05 radar fits the actual capture boundary from approach and inside, with ownership-colored fill and label', () => {
  const points: { x: number; y: number }[] = [], labels: string[] = [];
  let fills = 0, strokes = 0;
  const canvas = {
    save() {}, restore() {}, beginPath() {}, arc() {}, clip() {}, closePath() {},
    moveTo(x: number, y: number) { points.push({ x, y }); },
    lineTo(x: number, y: number) { points.push({ x, y }); },
    fill() { fills++; }, stroke() { strokes++; }, fillText(text: string) { labels.push(text); },
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '', textAlign: '',
  };
  const player = { position: { x: mission.airborneSpawn.x, z: mission.airborneSpawn.z } };
  const context = createContext({ radarRange: 3000, territoryDefinitions: [territory],
    focusedTerritoryTargetId: () => territory.id, journeyDallasCapture01: mission,
    radarCanvas: { width: 180 }, radarContext: canvas, airplane: player,
    territoryState: new Map(), neutralTerritoryColor: '#ffffff' });
  const rangeStart = source.indexOf('  radarRange = 3000;', source.indexOf('function updateRadar('));
  const rangeCode = source.slice(rangeStart, source.indexOf('  const width', rangeStart));
  const drawStart = source.indexOf('function drawRadarTerritories(');
  const drawCode = source.slice(drawStart, source.indexOf('function transportMissionHasLiveTarget', drawStart));
  runInContext(ts.transpileModule(`function setRange() { ${rangeCode} }\n${drawCode}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  runInContext('setRange()', context);
  const range = runInContext('radarRange', context);
  assert.ok(range > 15000, 'entry is visible before the player reaches the territory');
  for (const position of [mission.airborneSpawn, territory.center, { x: territory.bounds.minX + 50, z: territory.center.z }]) {
    Object.assign(player.position, position);
    for (const direction of [{ x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }]) {
      points.length = 0;
      context.direction = direction;
      runInContext('setRange(); drawRadarTerritories(direction, focusedTerritoryTargetId())', context);
      assert.equal(runInContext('radarRange', context), range, 'no zoom jumps on territory entry or turns');
      assert.equal(points.length, 4);
      assert.ok(points.every(point => Math.hypot(point.x - 90, point.y - 90) < 77), 'whole boundary fits radar');
    }
  }
  assert.equal(fills, 9); assert.equal(strokes, 9); assert.equal(labels.length, 9);
  assert.ok(labels.every(label => label === 'CAPTURE'));
  assert.equal(canvas.strokeStyle, '#ffffff'); assert.equal(canvas.fillStyle, '#ffffff', 'unowned mission targets remain white');
  for (const controllerId of ['local-player', 'another-player']) {
    context.territoryState = new Map([[territory.id, { controllerId }]]);
    runInContext('drawRadarTerritories(direction, focusedTerritoryTargetId())', context);
    assert.equal(canvas.strokeStyle, territory.fixedColor); assert.equal(canvas.fillStyle, territory.fixedColor);
  }
  context.territoryState = new Map();
  runInContext('drawRadarTerritories(direction, focusedTerritoryTargetId())', context);
  assert.equal(canvas.fillStyle, '#ffffff', 'ownership removal restores white');
  assert.doesNotMatch(source, /controllerId \|\| (?:entry\.missionTarget|journeyTarget|definition\.id === focusedTerritoryTargetId\(\)) \? definition\.fixedColor/);
  for (const position of [{x: territory.center.x - 100000, z: territory.center.z},
    {x: territory.center.x + 100000, z: territory.center.z},
    {x: territory.center.x, z: territory.center.z - 100000},
    {x: territory.center.x, z: territory.center.z + 100000}]) {
    Object.assign(player.position, position);
    for (const direction of [{x:1,z:0},{x:0,z:-1},{x:-1,z:0}]) {
      points.length=0;context.direction=direction;
      runInContext('setRange(); drawRadarTerritories(direction, focusedTerritoryTargetId())',context);
      const marker=points.slice(4);
      assert.equal(marker.length,4,'distant territory has a pinned diamond marker');
      assert.ok(marker.every(point=>Math.hypot(point.x-90,point.y-90)<77),'marker stays inside radar');
      const markerX=marker.reduce((sum,point)=>sum+point.x,0)/4-90;
      const markerY=marker.reduce((sum,point)=>sum+point.y,0)/4-90;
      const dx=territory.center.x-position.x,dz=territory.center.z-position.z;
      assert.ok(markerX*(dx*-direction.z+dz*direction.x)+markerY*-(dx*direction.x+dz*direction.z)>0,
        'marker points toward the territory for every bearing');
    }
  }
  context.focusedTerritoryTargetId = () => null;
  runInContext('setRange()', context);
  assert.equal(runInContext('radarRange', context), 3000, 'other gameplay retains the existing range');
});
