import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { journeyCategorySlots } from '../../shared/journey-categories.mjs';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.ts';
import { journeyCatalog } from '../../shared/journey-mission.mjs';

test('Golden Rings gameplay and pause headings match category mission numbers', () => {
  const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const heading = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'journeyMissionHeading');
  const context = vm.createContext({ journeyCategorySlots, journeyCatalog, missionJourneyDetails });
  vm.runInContext(ts.transpileModule(heading.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const rings = journeyCategorySlots.filter(slot => slot.categoryId === 'golden-rings');
  assert.equal(rings.length, 6);
  assert.deepEqual(rings.map(slot => slot.id), [...[1,3,4,5,6].map(n => `journey-dallas-${String(n).padStart(2,'0')}`), 'journey-dallas-coin-hunt-01']);
  assert.match(source, /Skip Mission \$\{journeyAttempt \? journeyCategorySlot\(journeyAttempt.missionId\)\?\.categoryNumber/);
  for (const slot of journeyCategorySlots.filter(slot => slot.kind === 'bonus')) {
    assert.equal(context.journeyMissionHeading(slot.id), 'BONUS ROUND');
  }
  for (const slot of rings) {
    assert.equal(context.journeyMissionHeading(slot.id), slot.kind === 'bonus' ? 'BONUS ROUND' : `M${slot.categoryNumber}: 10 RINGS`);
  }
});


test('Plane Battles gameplay and pause headings use the shifted category numbers',()=>{
 const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const heading=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='journeyMissionHeading');
 const ctx=vm.createContext({journeyCategorySlots,journeyCatalog,missionJourneyDetails});
 vm.runInContext(ts.transpileModule(heading.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 const slots=journeyCategorySlots.filter(slot=>slot.categoryId==='plane-battles');
 for(const [i,slot]of slots.entries()){
  const detail=missionJourneyDetails.find(mission=>mission.id===slot.missionId);
  assert.equal(ctx.journeyMissionHeading(slot.id),slot.kind==='bonus'?'BONUS ROUND':`M${i+1}: ${detail.title}`);
 }
 assert.match(source,/name: flightBonusDetail\?\.title \?\? journeyMissionHeading\(journeyAttempt.missionId\)/);
 assert.match(source,/Skip Mission \$\{journeyAttempt \? journeyCategorySlot\(journeyAttempt.missionId\)\?\.categoryNumber/);
});
