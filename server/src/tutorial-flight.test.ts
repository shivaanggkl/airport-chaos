import assert from'node:assert/strict';import test from'node:test';
import{mkdtempSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{PlayerProfileStore}from'./player-profiles.js';
import{shouldOfferTutorial,normalizeTutorialState,nextTutorialStep,tutorialObjective,TUTORIAL_VERSION}from'../../shared/tutorial-flight-rules.mjs';
test('tutorial state is versioned and rejects unknown persisted values',()=>{assert.deepEqual(normalizeTutorialState({version:'old',status:'bad'}),{version:TUTORIAL_VERSION,status:'new',completedAt:undefined});assert.equal(normalizeTutorialState({status:'completed',completedAt:12}).status,'completed');});
test('tutorial steps only advance on their verified signal',()=>{assert.equal(nextTutorialStep('throttle','steered'),'throttle');assert.equal(nextTutorialStep('throttle','throttle'),'takeoffRoll');assert.equal(nextTutorialStep('land','landed'),'reward');});
test('tutorial copy adapts to the active input mode',()=>{assert.match(tutorialObjective('controls','touch'),/touch/i);assert.match(tutorialObjective('controls','keyboard'),/arrow/i);});
test('tutorial persistence is additive and completed state cannot regress',()=>{const db=new PlayerProfileStore(join(mkdtempSync(join(tmpdir(),'airport-tutorial-')),'profiles.sqlite'));db.getOrCreate('tutorial-pilot','Pilot');assert.equal(db.setTutorialState('tutorial-pilot','started')?.tutorial.status,'started');assert.equal(db.setTutorialState('tutorial-pilot','completed',123)?.tutorial.status,'completed');assert.equal(db.setTutorialState('tutorial-pilot','started',456)?.tutorial.status,'completed');assert.equal(db.getOrCreate('tutorial-pilot','Pilot').credits,0);});

test('only new pilots are offered onboarding; skipped, completed and established pilots remain in free flight',()=>{
  assert.equal(shouldOfferTutorial('new'),true);
  for(const status of ['started','completed','skipped'])assert.equal(shouldOfferTutorial(status),false);
  assert.equal(shouldOfferTutorial('new',true),false);
  assert.equal(shouldOfferTutorial('new',false,'skipped'),false);
});
test('skipped tutorial survives reconnect and can explicitly replay without credit grants',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'airport-tutorial-replay-')),'profiles.sqlite');
  const db=new PlayerProfileStore(path);db.getOrCreate('replay-pilot','Pilot');
  db.setTutorialState('replay-pilot','started');db.setTutorialState('replay-pilot','skipped');
  const reconnect=new PlayerProfileStore(path);
  assert.equal(reconnect.getOrCreate('replay-pilot','Pilot').tutorial.status,'skipped');
  assert.equal(reconnect.setTutorialState('replay-pilot','started')?.tutorial.status,'started');
  assert.equal(reconnect.getOrCreate('replay-pilot','Pilot').credits,0);
});

test('guided tutorial uses one compact dismissible card and ignores redundant active-profile refreshes',()=>{
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
  assert.match(main,/data-tutorial-title[\s\S]*data-guided-close[\s\S]*data-tutorial-objective[\s\S]*data-guided-restart[\s\S]*data-guided-skip/);
  assert.match(main,/tutorialPanelDismissed = true;[\s\S]*tutorialPanel\.hidden = true;/);
  assert.match(main,/tutorial\.status==='started' && !guidedTutorialActive\)setGuidedTutorial\(true\)/);
  assert.match(main,/function restartGuidedTutorial\(\):void\{[\s\S]*tutorialPanel\.hidden=true;[\s\S]*setGuidedTutorial\(true,true\)/);
  assert.match(css,/@media\(max-width:950px\) and \(orientation:landscape\)\{[\s\S]*\.guided-tutorial-panel\{[^}]*width:clamp\(260px,44vw,340px\)/);
  assert.match(css,/\.tutorial-flight-active \.active-mission-overlay \{display:none!important\}/);
});
