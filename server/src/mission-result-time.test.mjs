import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'formatJourneyResultTime');
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
test('result clocks preserve exact tenths and minute boundaries', () => {
  for (const [ms, expected] of [[-10,'0:00.0'],[0,'0:00.0'],[59999,'0:59.9'],[60000,'1:00.0'],[65800,'1:05.8'],[65899,'1:05.8']]) {
    assert.equal(context.formatJourneyResultTime(ms,true),expected);
  }
  assert.equal(context.formatJourneyResultTime(57000),'0:57');
});
