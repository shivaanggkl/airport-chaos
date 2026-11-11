import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { trainingSlideIds } from '../../shared/training-slides.mjs';

function functionCode(path: string, name: string): string {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  return ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

test('verified target destruction completes FIRE once, including confirmation while suspended', () => {
  const sourceFile = ts.createSourceFile('training-slides.ts', readFileSync('client/src/training-slides.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = sourceFile.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'TrainingSlides')!;
  const code = ts.transpileModule(declaration.getText(sourceFile).replace('export class', 'class'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const timers: number[] = [];
  const TrainingSlides = runInNewContext(`${code}; TrainingSlides;`, {
    trainingSlideIds, needsHeldControl: () => false,
    window: { setTimeout(_action: () => void, delay: number) { timers.push(delay); return timers.length; } },
  });
  const slides = Object.create(TrainingSlides.prototype);
  Object.assign(slides, {
    active: true, index: trainingSlideIds.indexOf('fire'), ready: true, suspended: true, saving: false,
    actionObserved: false, completing: false, playerActionStarted: false, playerActionMs: 0,
    hand: {}, status: { classList: { add() {} } }, timeFill: { style: {} }, timeProgress: { setAttribute() {} },
  });
  const context = { screenplayTargetHitPending: false, trainingSlides: slides };
  const confirm = runInNewContext(`${functionCode('client/src/main.ts', 'completeTrainingTargetHit')}; completeTrainingTargetHit;`, context);
  confirm();
  assert.equal(slides.completing, false, 'suspended lessons cannot advance');
  assert.equal(context.screenplayTargetHitPending, true, 'server confirmation survives suspension');
  slides.suspended = false;
  confirm();
  confirm();
  assert.equal(slides.completing, true);
  assert.equal(slides.progressPercent, 100);
  assert.deepEqual(timers, [850], 'final damage and targetHit schedule only one completion');
  slides.index = trainingSlideIds.indexOf('landing');
  confirm();
  assert.deepEqual(timers, [850], 'late confirmation cannot complete landing');
  const source = readFileSync('client/src/main.ts', 'utf8');
  assert.match(source, /message\.playerId===tutorialTargetId&&message\.shooterId===localPlayerId&&message\.health===0\)completeTrainingTargetHit\(\)/);
  assert.match(source, /step==='fire'&&screenplayTargetHitPending\)completeTrainingTargetHit\(\)/);
});

for (const slideIndex of [undefined, trainingSlideIds.indexOf('fire')]) {
  test(`only the legacy guide moves to landing immediately after target destruction (slide ${slideIndex})`, () => {
    let landingApproaches = 0;
    let confirmations = 0;
    const complete = runInNewContext(`${functionCode('server/src/index.ts', 'completeServerTutorialStep')}; completeServerTutorialStep;`, {
      profileStore: {
        recordTutorialStepStatus: () => ({ changed: true, nextStep: 'landing', steps: {} }),
        trainingSlideIndex: () => slideIndex,
      },
      sendTutorialStepResult() { confirmations++; },
      sendTutorialLandingApproach() { landingApproaches++; },
      recordAnalytics() {},
    });
    complete('pilot', { tutorialMode: true, pilotId: 'pilot', cityId: 'milwaukee' }, 'fire', 100);
    assert.equal(confirmations, 1);
    assert.equal(landingApproaches, slideIndex === undefined ? 1 : 0,
      'the slide guide must save FIRE before moving the plane or removing its target');
  });
}
