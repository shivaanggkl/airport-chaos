import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { journeyCategorySlots } from '../../shared/journey-categories.mjs';
import { journeyCatalog } from '../../shared/journey-mission.mjs';

test('Golden Rings gameplay and pause headings match category mission numbers', () => {
  const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const heading = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'journeyMissionHeading');
  const context = vm.createContext({ journeyCategorySlots, journeyCatalog });
  vm.runInContext(ts.transpileModule(heading.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const rings = journeyCategorySlots.filter(slot => slot.categoryId === 'golden-rings');
  assert.equal(rings.length, 6);
  for (const slot of rings) {
    assert.equal(context.journeyMissionHeading(slot.id), `M${slot.categoryNumber}: 10 RINGS`);
  }
});
