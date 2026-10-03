import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerProfileStore } from './player-profiles.js';
import { normalizeTutorialState, nextTutorialStep, tutorialDetectedInstruction, tutorialInstruction, tutorialLandingInstruction, tutorialLockPreviewInstruction, tutorialStepPrerequisitesResolved, tutorialSteps, tutorialTakeoffRecoveryInstruction, tutorialTurnProgress, TUTORIAL_VERSION, type TutorialLessonStep, type TutorialStepStatus } from '../../shared/tutorial-flight-rules.mjs';
import { TutorialStepReconciler } from '../../shared/tutorial-step-reconciler.mjs';
import { desktopTurnIntent } from '../../shared/flight-control-rules.mjs';
import { joystickInput } from '../../shared/mobile-input-rules.mjs';

test('tutorial state is versioned and rejects unknown persisted values', () => {
  assert.deepEqual(normalizeTutorialState({ version: 'old', status: 'bad' }), { version: TUTORIAL_VERSION, status: 'new', completedAt: undefined });
  assert.equal(normalizeTutorialState({ status: 'completed', completedAt: 12 }).status, 'completed');
});

test('all guided tutorial actions advance only on their verified signal', () => {
  const signals = ['takeoffPowerReached', 'airborne', 'leftTurnComplete', 'rightTurnComplete', 'climbComplete', 'descentComplete', 'cameraMoved', 'cameraZoomed', 'targetInRange', 'targetLocked', 'targetHit', 'landed'];
  assert.deepEqual(tutorialSteps, ['throttle', 'takeoff', 'turnLeft', 'turnRight', 'climb', 'descend', 'cameraLook', 'cameraZoom', 'approach', 'targetLock', 'fire', 'landing']);
  for (let index = 0; index < tutorialSteps.length; index += 1) {
    const step: string = tutorialSteps[index];
    assert.equal(nextTutorialStep(step, 'unverified'), step);
    for (const otherSignal of signals.filter((signal) => signal !== signals[index])) {
      assert.equal(nextTutorialStep(step, otherSignal), step, `${step} must reject ${otherSignal}`);
    }
    assert.equal(nextTutorialStep(step, signals[index]), tutorialSteps[index + 1] ?? 'freePractice');
  }
});

test('turn lessons count the real shared left/right heading directions', () => {
  const leftDelta=desktopTurnIntent(true,false);
  const rightDelta=desktopTurnIntent(false,true);
  const touchLeftDelta=-joystickInput(-1,0).x;
  const touchRightDelta=-joystickInput(1,0).x;
  assert.ok(leftDelta>0);assert.ok(rightDelta<0);
  assert.ok(touchLeftDelta>0);assert.ok(touchRightDelta<0);
  assert.equal(tutorialTurnProgress('turnLeft',leftDelta),leftDelta);
  assert.equal(tutorialTurnProgress('turnLeft',touchLeftDelta),touchLeftDelta);
  assert.equal(tutorialTurnProgress('turnLeft',rightDelta),0);
  assert.equal(tutorialTurnProgress('turnRight',rightDelta),-rightDelta);
  assert.equal(tutorialTurnProgress('turnRight',touchRightDelta),-touchRightDelta);
  assert.equal(tutorialTurnProgress('turnRight',leftDelta),0);
  assert.equal(tutorialTurnProgress('turnLeft',Number.NaN),0);
});

test('a valid landing remains completable after intentional lesson skips', () => {
  const states=Object.fromEntries(tutorialSteps.map(step=>[step,'pending'])) as Record<TutorialLessonStep,TutorialStepStatus>;
  for(const [index,step] of tutorialSteps.slice(0,-1).entries())states[step]=index%2?'skipped':'completed';
  assert.equal(tutorialStepPrerequisitesResolved('landing',states),true);
  states.fire='pending';
  assert.equal(tutorialStepPrerequisitesResolved('landing',states),false);
});

test('orientation preference drives real analog pitch without changing lateral input', async () => {
  const moduleUrl = new URL('../../client/src/mobile-input.ts', import.meta.url);
  const { MobileInputControls } = await import(moduleUrl.href);
  const stored = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => stored.set(key, value) } });
  try {
    const input = Object.assign(Object.create(MobileInputControls.prototype), {
      root: { hidden: false }, pitchInverted: false, steeringInput: { x: .6, y: -.7 },
      reset() { this.steeringInput = { x: 0, y: 0 }; },
    });
    assert.deepEqual(input.getSteeringInput(), { x: .6, y: -.7 });
    input.setPitchInverted(true);
    assert.equal(input.getPitchInverted(), true);
    assert.equal(stored.get('airport-chaos-mobile-pitch-inverted-v1'), 'true');
    assert.equal(input.getSteeringInput().x, 0);
    assert.equal(Math.abs(input.getSteeringInput().y), 0);
    input.steeringInput = { x: .6, y: -.7 };
    assert.deepEqual(input.getSteeringInput(), { x: .6, y: .7 });
    input.root.hidden = true;
    assert.deepEqual(input.getSteeringInput(), { x: 0, y: 0 });
    input.setPitchInverted(false);
    assert.equal(stored.get('airport-chaos-mobile-pitch-inverted-v1'), 'false');
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('every tutorial instruction names the real control and action for desktop and mobile', () => {
  const bindings={throttleUp:'W',throttleDown:'S',pitchUp:'↑',pitchDown:'↓',turnLeft:'A',turnRight:'D',aimLeft:'Z',aimRight:'C',aimUp:'Q',aimDown:'E',fire:'SPACE',cameraLook:'MOUSE DRAG',cameraZoom:'MOUSE WHEEL'};
  const required:Record<string,RegExp>={throttle:/THROTTLE|W/i,takeoff:/JOYSTICK|↑/i,turnLeft:/JOYSTICK|A/i,turnRight:/JOYSTICK|D/i,climb:/JOYSTICK|↑/i,descend:/JOYSTICK|↓/i,cameraLook:/CAMERA|MOUSE/i,cameraZoom:/PINCH|MOUSE WHEEL/i,approach:/JOYSTICK|A.*D/i,targetLock:/LOCK CIRCLE|Z.*C/i,fire:/FIRE|SPACE/i,landing:/THROTTLE|S/i};
  for(const step of tutorialSteps){
    for(const mode of ['keyboard','touch'] as const){
      const copy=tutorialInstruction(step,mode,false,bindings);
      assert.match(`${copy.explanation} ${copy.controlInstruction}`,required[step]!,`${step}/${mode} must name its control`);
      assert.ok(copy.control,`${step}/${mode} must identify one spotlight target`);
      assert.ok(copy.controlInstruction,`${step}/${mode} must expose one platform-specific instruction`);
    }
  }
  const expectedTouchControls={throttle:'throttle',takeoff:'climb',turnLeft:'turnLeft',turnRight:'turnRight',climb:'climb',descend:'descend',cameraLook:'cameraLook',cameraZoom:'cameraZoom',approach:'joystick',targetLock:'targetLock',fire:'fire',landing:'throttle'};
  assert.deepEqual(Object.fromEntries(tutorialSteps.map(step=>[step,tutorialInstruction(step,'touch',false,bindings).control])),expectedTouchControls);
  assert.match(tutorialInstruction('throttle','keyboard',false,{...bindings,throttleUp:'R'}).controlInstruction,/Hold R/);
});

test('the canonical copy is the exact 13-step single-panel sequence', () => {
  const keyboard=tutorialSteps.map(step=>tutorialInstruction(step,'keyboard'));
  const touch=tutorialSteps.map(step=>tutorialInstruction(step,'touch'));
  assert.deepEqual(keyboard.map(item=>item.lesson),[1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.deepEqual(keyboard.map(item=>item.title),['THROTTLE','TAKE OFF','TURN LEFT','TURN RIGHT','CLIMB','LOWER AIRCRAFT','LOOK AROUND','ZOOM','APPROACH TARGET','LOCK TARGET','FIRE','LAND']);
  assert.deepEqual(keyboard.map(item=>item.controlInstruction),[
    'Hold W to increase power.','Hold ↑ to lift off.','Press A to turn LEFT.','Press D to turn RIGHT.','Hold ↑ to fly higher.','Hold ↓ to lower the aircraft.',
    'Drag the mouse.','Use the mouse wheel.','Use A/D and ↑/↓ to approach the target.',
    'Use Z/C and Q/E to aim.','Press SPACE.','Hold S to slow down.',
  ]);
  assert.deepEqual(touch.map(item=>item.controlInstruction),[
    'Slide the THROTTLE control UP to increase power.','Push the TOP joystick edge to lift off.','Move the joystick LEFT to turn.','Move the joystick RIGHT to turn.',
    'Push the TOP joystick edge to fly higher.','Push the BOTTOM joystick edge to lower the aircraft.','Drag the camera area.','Pinch with two fingers.',
    'Use the joystick to fly toward the target.','Drag inside the LOCK CIRCLE to aim.','Tap FIRE.','Slide THROTTLE DOWN to slow down.',
  ]);
  assert.deepEqual(tutorialInstruction('freePractice'),{
    lesson:13,title:'✓ TRAINING COMPLETE',explanation:'You are ready for real flights.',controlInstruction:'Milwaukee training gives no rewards.',control:'',
  });
  assert.deepEqual(tutorialLockPreviewInstruction(),{
    lesson:10,title:'LOCK TARGET',explanation:'Keep the target inside the lock circle until LOCKED.',controlInstruction:'SEARCHING → LOCKED',control:'targetLock',
  });
});

test('takeoff input acknowledgement uses the active binding without claiming success',()=>{
  assert.equal(tutorialDetectedInstruction('takeoff','keyboard',false,{pitchUp:'↑'}),'↑ DETECTED — KEEP HOLDING TO LIFT OFF');
  assert.equal(tutorialDetectedInstruction('takeoff','touch',false),'TOP EDGE DETECTED — KEEP HOLDING TO LIFT OFF');
  assert.equal(tutorialDetectedInstruction('takeoff','touch',true),'BOTTOM EDGE DETECTED — KEEP HOLDING TO LIFT OFF');
});

test('ground recovery keeps the current lesson identity while teaching takeoff again',()=>{
  assert.deepEqual(tutorialTakeoffRecoveryInstruction('climb','keyboard',false,{pitchUp:'↑'}),{
    lesson:5,title:'CLIMB',explanation:'You are back on the runway. Take off again first.',controlInstruction:'Hold ↑ to lift off.',control:'takeoff',
  });
  assert.deepEqual(tutorialTakeoffRecoveryInstruction('targetLock','touch',true),{
    lesson:10,title:'LOCK TARGET',explanation:'You are back on the runway. Take off again first.',controlInstruction:'Push the BOTTOM joystick edge to lift off.',control:'descend',
  });
  assert.deepEqual(tutorialTakeoffRecoveryInstruction('landing','touch',false),{
    lesson:12,title:'LAND',explanation:'You are back on the runway. Take off again first.',controlInstruction:'Push the TOP joystick edge to lift off.',control:'climb',
  });
});

test('authoritative completions are serialized once across the throttle/takeoff event race',()=>{
  const reconciler=new TutorialStepReconciler();
  const states=Object.fromEntries(tutorialSteps.map(step=>[step,'pending'])) as Record<TutorialLessonStep,TutorialStepStatus>;
  states.takeoff='completed';
  reconciler.ingest('takeoff','completed',states);
  assert.equal(reconciler.takeReady(states),undefined,'takeoff waits for the preceding throttle result');
  states.throttle='completed';
  reconciler.ingest('throttle','completed',states);
  assert.equal(reconciler.takeReady(states),'throttle');
  assert.equal(reconciler.takeReady(states),'takeoff');
  assert.equal(reconciler.takeReady(states),undefined,'neither success can be delivered twice');
});

test('every action lesson reconciles in order when authoritative results arrive ahead',()=>{
  const reconciler=new TutorialStepReconciler();
  const states=Object.fromEntries(tutorialSteps.map(step=>[step,'pending'])) as Record<TutorialLessonStep,TutorialStepStatus>;
  for(const step of [...tutorialSteps].reverse()){states[step]='completed';reconciler.ingest(step,'completed',states);}
  assert.deepEqual(tutorialSteps.map(()=>reconciler.takeReady(states)),[...tutorialSteps]);
  assert.equal(reconciler.takeReady(states),undefined);
});

test('pitch guidance and highlighted octagon edge follow the persisted inversion setting', () => {
  for(const step of ['takeoff','climb'] as const){
    assert.match(tutorialInstruction(step,'touch',false).controlInstruction,/TOP/);
    assert.equal(tutorialInstruction(step,'touch',false).control,'climb');
    assert.match(tutorialInstruction(step,'touch',true).controlInstruction,/BOTTOM/);
    assert.equal(tutorialInstruction(step,'touch',true).control,'descend');
  }
  assert.match(tutorialInstruction('descend','touch',false).controlInstruction,/BOTTOM/);
  assert.equal(tutorialInstruction('descend','touch',false).control,'descend');
  assert.match(tutorialInstruction('descend','touch',true).controlInstruction,/TOP/);
  assert.equal(tutorialInstruction('descend','touch',true).control,'climb');
  assert.equal(tutorialInstruction('climb','keyboard',true).controlInstruction,tutorialInstruction('climb','keyboard',false).controlInstruction);
  assert.equal(tutorialLandingInstruction('descent','touch',true).control,'climb');
  assert.match(tutorialLandingInstruction('descent','touch',true).controlInstruction,/TOP/);
});

test('landing stages name and spotlight the exact active control',()=>{
  const bindings={throttleDown:'S',turnLeft:'A',turnRight:'D',pitchDown:'↓'};
  const desktop=[tutorialLandingInstruction('power','keyboard',false,bindings),tutorialLandingInstruction('alignment','keyboard',false,bindings),tutorialLandingInstruction('descent','keyboard',false,bindings)];
  assert.deepEqual(desktop.map(item=>item.control),['throttle','joystick','descend']);
  assert.match(desktop[0]!.controlInstruction,/S/);assert.match(desktop[1]!.controlInstruction,/A.*D/);assert.match(desktop[2]!.controlInstruction,/↓/);
  const mobile=[tutorialLandingInstruction('power','touch'),tutorialLandingInstruction('alignment','touch'),tutorialLandingInstruction('descent','touch')];
  assert.deepEqual(mobile.map(item=>item.control),['throttle','joystick','descend']);
  assert.match(mobile[0]!.controlInstruction,/THROTTLE/);assert.match(mobile[1]!.controlInstruction,/joystick LEFT or RIGHT/i);assert.match(mobile[2]!.controlInstruction,/BOTTOM/);
});

test('completed tutorial can be explicitly replayed without granting credits', () => {
  const db = new PlayerProfileStore(join(mkdtempSync(join(tmpdir(), 'airport-tutorial-')), 'profiles.sqlite'));
  db.getOrCreate('tutorial-pilot', 'Pilot');
  assert.equal(db.setTutorialState('tutorial-pilot', 'started')?.tutorial.status, 'started');
  assert.equal(db.setTutorialState('tutorial-pilot', 'completed', 123)?.tutorial.status, 'completed');
  assert.equal(db.setTutorialState('tutorial-pilot', 'started', 456)?.tutorial.status, 'started');
  assert.equal(db.getOrCreate('tutorial-pilot', 'Pilot').credits, 0);
});

test('server tutorial evidence survives reconnect/restart, is idempotent, and never grants rewards', () => {
  const path=join(mkdtempSync(join(tmpdir(),'airport-training-evidence-')),'profiles.sqlite');
  const store=new PlayerProfileStore(path);
  const before=store.getOrCreate('evidence-pilot','Pilot');
  store.setTutorialState(before.pilotId,'started');
  for(const bit of [1,2,4] as const){store.recordTrainingEvidence(before.pilotId,bit);store.recordTrainingEvidence(before.pilotId,bit);}
  assert.equal(store.trainingEvidence(before.pilotId),7);
  const reopened=new PlayerProfileStore(path);
  assert.equal(reopened.trainingEvidence(before.pilotId),7);
  reopened.setTutorialState(before.pilotId,'started');
  assert.equal(reopened.trainingEvidence(before.pilotId),7);
  reopened.recordTrainingEvidence(before.pilotId,8);
  assert.equal(reopened.trainingEvidence(before.pilotId),15);
  const after=reopened.getOrCreate(before.pilotId,'Pilot');
  assert.equal(after.credits,before.credits);assert.equal(after.score,before.score);
  reopened.setTutorialState(before.pilotId,'completed');
  reopened.setTutorialState(before.pilotId,'started');
  assert.equal(reopened.trainingEvidence(before.pilotId),0);
});

test('tutorial step outcomes persist as completed, skipped, or pending and crash reset clears only the run',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'airport-training-steps-')),'profiles.sqlite');
  const store=new PlayerProfileStore(path);const pilot=store.getOrCreate('step-pilot','Pilot');store.setTutorialState(pilot.pilotId,'started');
  assert.equal(store.nextPendingTutorialStep(pilot.pilotId),'throttle');
  assert.ok(Object.values(store.tutorialStepStates(pilot.pilotId)).every(status=>status==='pending'));
  assert.equal(store.recordTutorialStepStatus(pilot.pilotId,'throttle','completed').changed,true);
  assert.equal(store.recordTutorialStepStatus(pilot.pilotId,'takeoff','skipped').changed,true);
  assert.equal(store.tutorialStepStates(pilot.pilotId).throttle,'completed');
  assert.equal(store.tutorialStepStates(pilot.pilotId).takeoff,'skipped');
  assert.equal(store.nextPendingTutorialStep(pilot.pilotId),'turnLeft');
  assert.equal(store.recordTutorialStepStatus(pilot.pilotId,'climb','completed').ok,false);
  const reopened=new PlayerProfileStore(path);assert.equal(reopened.nextPendingTutorialStep(pilot.pilotId),'turnLeft');
  for(const [index,step] of tutorialSteps.slice(2).entries())assert.equal(reopened.recordTutorialStepStatus(pilot.pilotId,step,index%2?'skipped':'completed').ok,true);
  assert.equal(reopened.tutorialStepsResolved(pilot.pilotId),true);
  reopened.recordTrainingEvidence(pilot.pilotId,1);reopened.resetTutorialRun(pilot.pilotId);
  assert.equal(reopened.nextPendingTutorialStep(pilot.pilotId),'throttle');assert.equal(reopened.trainingEvidence(pilot.pilotId),0);
  assert.equal(reopened.getOrCreate(pilot.pilotId,'Pilot').credits,pilot.credits);
});

test('training HUD provides authoritative entry, persistent exits, resume and free-practice state', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(bootstrap, /tutorialState: \{ version: 'tutorial_v1', status: 'started' \}/);
  assert.match(main, /WELCOME TO FLIGHT TRAINING[\s\S]*Follow the highlighted controls\. Training earns no rewards/);
  assert.match(main, /data-training-start>START TRAINING<[\s\S]*data-training-skip>SKIP &amp; FLY</);
  assert.match(main, /data-guided-skip>SKIP TRAINING<[\s\S]*data-guided-exit>EXIT TRAINING</);
  assert.match(main, /data-tutorial-completion-actions[\s\S]*PLAY FOR REAL[\s\S]*KEEP PRACTICING[\s\S]*EXIT TRAINING/);
  assert.equal((main.match(/className = 'guided-tutorial-panel'/g)??[]).length,1);
  assert.doesNotMatch(main,/tutorial-objective|tutorial-coach-card|data-lock-teaching|tutorialCompletionPanel/);
  assert.match(main,/STEP \$\{completion\?13:guidance\.lesson\} OF 13/);
  assert.match(main,/✓ COMPLETED/);
  assert.match(main,/tutorialCompletionPresentationStep!==step[\s\S]*},600\)/);
  assert.match(main,/tutorialStepRequestStep===message\.step/);
  assert.match(main,/presentNextAuthoritativeTutorialCompletion/);
  assert.match(main,/updateTutorialImmediateFeedback\(\)/);
  assert.match(main,/tutorialLockPreviewInstruction\(\)/);
  assert.match(main, /airport-chaos-training-progress-v5/);
  assert.match(main, /message\.tutorialMode&&cityRules\.tutorialEnabled/);
  assert.match(main, /type:'tutorialTargetRequest'/);
  assert.match(main, /guidedTutorialStep='freePractice'/);
  assert.match(main, /data-guided-next>NEXT STEP/);
  assert.match(main, /type:'tutorialStepStatus',tutorialStep:guidedTutorialStep,tutorialStepStatus:status/);
  assert.match(server, /target\?\.trainingOwnerId === playerId[\s\S]*signal: 'targetLocked'/);
  assert.match(server, /tutorialState\.status==='completed'&&!profileStore\.tutorialStepsResolved\(identity\.pilotId\)/);
  assert.match(server, /message\.tutorialStatus==='completed'&&!profileStore\.tutorialStepsResolved\(player\.pilotId\)/);
  assert.match(server, /completeServerTutorialStep\(playerId,player,'landing',now\)/);
  assert.match(main, /message\.type==='tutorialStepResult'/);
  assert.match(main, /tutorialRunReset[\s\S]*TRAINING RESTARTED/);
  assert.match(main, /guidedTrainingCrash[\s\S]*requestTutorialRunReset\('crash'\)/);
  assert.match(server, /resetTutorialRun\(player\.pilotId\)[\s\S]*resetHumanToSafeRunway\(playerId,player,profile,Date\.now\(\),true,'trainer'\)/);
  assert.doesNotMatch(readFileSync(new URL('../../client/index.html', import.meta.url),'utf8'),/tutorial-crash-actions|RETRY TUTORIAL|CONTINUE FREE PRACTICE/);
  assert.match(main, /if\(!response\.ok\)throw new Error\('Training session did not close'\)/);
  assert.match(css, /\.training-mode-label/);
  assert.match(css, /body\[data-tutorial-control="targetLock"\] #acquisition-circle/);
  assert.match(css, /body\[data-tutorial-control="fire"\] \[data-touch-control="fire"\]/);
  assert.match(css,/width:min\(310px/);
  assert.match(css,/width:min\(270px/);
  assert.match(css,/background:rgb\(9 28 43 \/ 76%\)/);
});
