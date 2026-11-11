import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { trainingSlideIds } from '../../shared/training-slides.mjs';

const source = readFileSync('client/src/training-slides.ts', 'utf8');
const ast = ts.createSourceFile('training-slides.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'TrainingSlides')!;
const code = ts.transpileModule(declaration.getText(ast).replace('export class', 'class'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(save: () => Promise<boolean>) {
  const timers: number[] = [];
  const TrainingSlides = runInNewContext(`${code}; TrainingSlides;`, {
    trainingSlideIds, window: { clearTimeout() {}, setTimeout(_action: () => void, delay: number) { timers.push(delay); return timers.length; } },
  });
  const slides = Object.create(TrainingSlides.prototype);
  Object.assign(slides, {
    active: true, actionObserved: true, completing: true, suspended: false, saving: false,
    index: 6, stageVersion: 1, saveRetries: 0, hand: {},
    status: { textContent: '', classList: { remove() {} } },
    options: { onAdvance: save, onStageEnd() {} },
    showStage() { this.stageVersion++; this.saving = false; this.completing = false; this.actionObserved = false; this.saveRetries = 0; },
  });
  return { slides, timers };
}

test('camera lesson keeps retrying after three failed saves and advances only on server confirmation', async () => {
  let accepted = false;
  const { slides, timers } = fixture(async () => accepted);
  for (let attempt = 0; attempt < 20; attempt++) {
    await slides.advance();
    assert.equal(slides.index, 6);
    assert.equal(slides.saving, false);
    assert.match(slides.status.textContent, /RETRYING/);
  }
  assert.equal(timers.length, 20);
  assert.equal(Math.max(...timers), 15_000, 'retry rate remains bounded');
  accepted = true;
  await slides.advance();
  assert.equal(slides.index, 7);
});

for (const success of [false, true]) test(`a stale ${success ? 'successful' : 'failed'} save cannot alter a restored lesson`, async () => {
  let resolve!: (value: boolean) => void;
  const { slides, timers } = fixture(() => new Promise<boolean>(done => { resolve = done; }));
  const pending = slides.advance();
  slides.resume(7);
  resolve(success);
  await pending;
  assert.equal(slides.index, 7, 'does not skip the restored lesson');
  assert.equal(slides.saving, false);
  assert.equal(timers.length, 0, 'old failures cannot schedule retries for another lesson');
});

test('suspended training waits for resume before retrying the completed lesson', async () => {
  const { slides, timers } = fixture(async () => false);
  slides.suspended = true;
  await slides.advance();
  assert.equal(timers.length, 0);
  assert.equal(slides.index, 6);
});
