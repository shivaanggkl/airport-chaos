import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PlayerProfileStore } from './player-profiles.js';
import { normalizeTutorialState, nextTutorialStep, tutorialDetectedInstruction, tutorialInstruction, tutorialLandingApproach, tutorialLandingCoachInstruction, tutorialLandingCoachStage, tutorialLandingInstruction, tutorialLockPreviewInstruction, tutorialStepPrerequisitesResolved, tutorialSteps, tutorialTakeoffRecoveryInstruction, tutorialTurnProgress, TUTORIAL_VERSION, type TutorialLessonStep, type TutorialStepStatus } from '../../shared/tutorial-flight-rules.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { TutorialStepReconciler } from '../../shared/tutorial-step-reconciler.mjs';
import { desktopTurnIntent, normalizedPitchCommand } from '../../shared/flight-control-rules.mjs';
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

test('global orientation preference keeps raw touch input and normalizes keyboard and touch pitch once', async () => {
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
    assert.equal(stored.get('airport-chaos-flight-pitch-inverted-v1'), 'true');
    assert.equal(input.getSteeringInput().x, 0);
    assert.equal(Math.abs(input.getSteeringInput().y), 0);
    input.steeringInput = { x: .6, y: -.7 };
    assert.deepEqual(input.getSteeringInput(), { x: .6, y: -.7 });
    assert.equal(normalizedPitchCommand(1,false),1);
    assert.equal(normalizedPitchCommand(-1,false),-1);
    assert.equal(normalizedPitchCommand(1,true),-1);
    assert.equal(normalizedPitchCommand(-1,true),1);
    input.root.hidden = true;
    assert.deepEqual(input.getSteeringInput(), { x: 0, y: 0 });
    input.setPitchInverted(false);
    assert.equal(stored.get('airport-chaos-flight-pitch-inverted-v1'), 'false');
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const menu=readFileSync(new URL('../../client/src/pilot-menu.ts',import.meta.url),'utf8');
  const inputSource=readFileSync(new URL('../../client/src/mobile-input.ts',import.meta.url),'utf8');
  assert.match(main,/const rawPitchInput = keyboardPitchInput \|\| -touchSteering\.y;\s*const pitchInput = normalizedPitchCommand\(rawPitchInput,mobileInput\.getPitchInverted\(\)\)/);
  assert.match(main,/data-training-orientation[^\n]*\.hidden=false/);
  assert.match(main,/flightPitch: \{ inverted: mobileInput\.getPitchInverted\(\)/);
  assert.match(main,/touch: mobileInput\.isTouchLayout\(\)/);
  assert.match(menu,/selectRow\('FLIGHT PITCH',data\.flightPitch\.inverted/);
  assert.match(menu,/NORMAL:.*pitchUp.*\+ ALT.*pitchDown.*− ALT.*INVERTED:.*pitchDown.*\+ ALT.*pitchUp.*− ALT/s);
  assert.match(inputSource,/const PITCH_KEY = 'airport-chaos-flight-pitch-inverted-v1'/);
  assert.doesNotMatch(inputSource,/steeringInput\.y \* \(this\.getPitchInverted/);
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
  assert.deepEqual(keyboard.map(item=>item.title),['SPEED UP','TAKE OFF','TURN LEFT','TURN RIGHT','CLIMB','DESCEND','LOOK AROUND','ZOOM','FLY TO THE TARGET','LOCK THE TARGET','HIT THE TARGET','LAND THE PLANE']);
  assert.deepEqual(keyboard.map(item=>item.controlInstruction),[
    'Hold W.','Hold ↑ to climb.','Hold A.','Hold D.','Hold ↑.','Hold ↓.',
    'Drag the mouse.','Use the mouse wheel.','A/D turn. ↑ climbs. ↓ descends.',
    'Aim with Z/C and Q/E.','Press SPACE.','A/D to line up · S to slow · ↓ to descend.',
  ]);
  assert.deepEqual(touch.map(item=>item.controlInstruction),[
    'Slide THROTTLE UP.','Push the joystick to the TOP edge to climb.','Move the joystick LEFT.','Move the joystick RIGHT.',
    'Push the joystick to the TOP edge.','Push the joystick to the BOTTOM edge.','Drag the camera.','Pinch with two fingers.',
    'Steer with the joystick. TOP climbs. BOTTOM descends.','Drag inside the lock circle.','Tap FIRE.','Joystick LEFT/RIGHT to line up · THROTTLE DOWN to slow · BOTTOM joystick edge to descend.',
  ]);
  assert.deepEqual(tutorialInstruction('freePractice'),{
    lesson:13,title:'✓ TRAINING COMPLETE',explanation:"YOU'RE READY TO FLY!",controlInstruction:'',control:'',
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
    lesson:5,title:'CLIMB',explanation:'You are back on the runway. Take off again first.',controlInstruction:'Hold ↑ to climb.',control:'takeoff',
  });
  assert.deepEqual(tutorialTakeoffRecoveryInstruction('targetLock','touch',true),{
    lesson:10,title:'LOCK THE TARGET',explanation:'You are back on the runway. Take off again first.',controlInstruction:'Push the joystick to the BOTTOM edge to climb.',control:'descend',
  });
  assert.deepEqual(tutorialTakeoffRecoveryInstruction('landing','touch',false),{
    lesson:12,title:'LAND THE PLANE',explanation:'You are back on the runway. Take off again first.',controlInstruction:'Push the joystick to the TOP edge to climb.',control:'climb',
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
  assert.match(tutorialInstruction('climb','keyboard',false,{pitchUp:'UP',pitchDown:'DOWN'}).controlInstruction,/UP/);
  assert.match(tutorialInstruction('climb','keyboard',true,{pitchUp:'UP',pitchDown:'DOWN'}).controlInstruction,/DOWN/);
  assert.match(tutorialInstruction('descend','keyboard',true,{pitchUp:'UP',pitchDown:'DOWN'}).controlInstruction,/UP/);
  assert.match(tutorialInstruction('approach','keyboard',true,{pitchUp:'UP',pitchDown:'DOWN'}).controlInstruction,/DOWN climbs\. UP descends/);
  assert.match(tutorialInstruction('approach','touch',true).controlInstruction,/BOTTOM climbs\. TOP descends/);
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
  assert.match(mobile[0]!.controlInstruction,/THROTTLE/);assert.match(mobile[1]!.controlInstruction,/joystick LEFT\/RIGHT/i);assert.match(mobile[2]!.controlInstruction,/BOTTOM/);
});

test('landing starts close to the central runway with a small correction and safe trainer speed',()=>{
  const airport=cityAirports.milwaukee[0];
  const safeSpeed=aircraftFlightEnvelope.trainer.safeLandingSpeed;
  const approach=tutorialLandingApproach(airport,safeSpeed);
  assert.equal(approach.airportId,'central');
  assert.deepEqual(approach.position,{x:airport.runwayWidth+10,y:100,z:airport.runwayLength/2+300});
  assert.equal(approach.heading,airport.heading-0.06);
  assert.ok(approach.speed>safeSpeed&&approach.speed<safeSpeed*1.18);
  assert.ok(approach.position.x>airport.runwayWidth/2);
  const bindings={throttleDown:'R',turnLeft:'J',turnRight:'L',pitchDown:'K'};
  assert.match(tutorialLandingInstruction('alignment','keyboard',false,bindings).controlInstruction,/J\/L.*R.*K/);
  assert.match(tutorialLandingInstruction('descent','touch',true).controlInstruction,/TOP joystick edge/);
});

test('landing coach prioritizes runway correction, safe speed, height and touchdown using the flight envelope',()=>{
  const airport=cityAirports.milwaukee[0];
  const aircraft=aircraftFlightEnvelope.trainer;
  const flight={airport,position:{x:0,z:600},heading:airport.heading,speed:65,verticalSpeed:-3,altitude:50,throttle:.3,
    stallSpeed:aircraft.stallSpeed,takeoffSpeed:aircraft.takeoffSpeed,safeLandingSpeed:aircraft.safeLandingSpeed,safeDescentRate:aircraft.safeDescentRate,
    landingTilt:aircraft.landingTilt,roll:0,pitch:0,landingAssistActive:true};
  assert.equal(tutorialLandingCoachStage(flight),'steady');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:airport.runwayWidth+10,z:airport.runwayLength/2+300},heading:-0.06}),'alignLeft');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:-airport.runwayWidth-10,z:airport.runwayLength/2+300},heading:0.06}),'alignRight');
  assert.equal(tutorialLandingCoachStage({...flight,speed:aircraft.stallSpeed*1.1,position:{x:55,z:1700}}),'speedUp');
  assert.equal(tutorialLandingCoachStage({...flight,speed:aircraft.takeoffSpeed,throttle:.05}),'speedUp');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:0,z:1700},altitude:10}),'climb');
  assert.equal(tutorialLandingCoachStage({...flight,speed:aircraft.safeLandingSpeed+1}),'slowDown');
  assert.equal(tutorialLandingCoachStage({...flight,speed:aircraft.safeLandingSpeed+1,throttle:.05}),'coast');
  assert.equal(tutorialLandingCoachStage({...flight,verticalSpeed:-aircraft.safeDescentRate*1.36}),'easeDescent');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:0,z:100},altitude:60}),'descend');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:0,z:100},altitude:10,roll:aircraft.landingTilt+0.01}),'levelWings');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:0,z:100},altitude:10,pitch:aircraft.landingTilt+0.01}),'levelNose');
  assert.equal(tutorialLandingCoachStage({...flight,position:{x:0,z:100},altitude:10}),'touchdown');
});

test('landing coach names the active desktop bindings and mobile pitch direction',()=>{
  const bindings={turnLeft:'J',turnRight:'L',throttleUp:'I',throttleDown:'K',pitchUp:'U',pitchDown:'N'};
  assert.match(tutorialLandingCoachInstruction('alignLeft','keyboard',false,bindings).controlInstruction,/J/);
  assert.match(tutorialLandingCoachInstruction('alignRight','keyboard',false,bindings).controlInstruction,/L/);
  assert.match(tutorialLandingCoachInstruction('speedUp','keyboard',false,bindings).controlInstruction,/I/);
  assert.match(tutorialLandingCoachInstruction('slowDown','keyboard',false,bindings).controlInstruction,/K/);
  assert.match(tutorialLandingCoachInstruction('coast','keyboard',false,bindings).controlInstruction,/low throttle/i);
  assert.match(tutorialLandingCoachInstruction('descend','keyboard',false,bindings).controlInstruction,/N/);
  assert.match(tutorialLandingCoachInstruction('easeDescent','keyboard',false,bindings).controlInstruction,/U/);
  assert.equal(tutorialLandingCoachInstruction('climb','touch',true).control,'descend');
  assert.match(tutorialLandingCoachInstruction('climb','touch',true).controlInstruction,/BOTTOM joystick edge/);
  assert.equal(tutorialLandingCoachInstruction('descend','touch',true).control,'climb');
  assert.match(tutorialLandingCoachInstruction('descend','touch',true).controlInstruction,/TOP joystick edge/);
});

test('final lesson sends landing intent from valid LANDED transition and clears earlier tutorial receipt',()=>{
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
  assert.match(main,/setFlightState\('LANDED'\);\s*if\(guidedTutorialActive&&guidedTutorialStep==='landing'\)\{\s*tutorialLandingIntentPending=/);
  assert.match(main,/if\(landingQuality&&\!\(guidedTutorialActive&&guidedTutorialStep==='landing'\)\)sendLandingIntent/);
  assert.match(main,/pending\.attempts<4&&now-pending\.lastSentAt>=150&&sendLandingIntent/);
  assert.match(main,/if\(step==='landing'\)\{tutorialLandingIntentPending=undefined;transitionToNextPendingTutorialStep\(\);return true;\}/);
  assert.match(server,/landingReceipts\.delete\(`\$\{playerId\}:\$\{approach\.airportId\}`\)/);
  assert.match(server,/if \(!flight\?\.airborne \|\| telemetry\.speed[\s\S]*landingReceipts\.set\(receiptKey, now\)/);
  assert.match(server,/player\.tutorialMode && \(telemetry\.speed < aircraft\.stallSpeed \|\| !runwayOrTaxiSpawnArea\(player\)\)/);
  assert.match(server,/completeServerTutorialStep\(playerId,player,'landing',now\)/);
  const path=join(mkdtempSync(join(tmpdir(),'airport-landing-once-')),'profiles.sqlite');
  const store=new PlayerProfileStore(path);store.getOrCreate('landing-pilot','Pilot');store.setTutorialState('landing-pilot','started');
  for(const step of tutorialSteps.slice(0,-1))store.recordTutorialStepStatus('landing-pilot',step,'skipped');
  assert.equal(store.recordTutorialStepStatus('landing-pilot','landing','completed').changed,true);
  assert.equal(store.recordTutorialStepStatus('landing-pilot','landing','completed').changed,false);
  assert.equal(new PlayerProfileStore(path).tutorialStepStates('landing-pilot').landing,'completed');
  assert.equal(store.getOrCreate('landing-pilot','Pilot').credits,0);
});

test('completed tutorial can be explicitly replayed without granting credits', () => {
  const db = new PlayerProfileStore(join(mkdtempSync(join(tmpdir(), 'airport-tutorial-')), 'profiles.sqlite'));
  db.getOrCreate('tutorial-pilot', 'Pilot');
  assert.equal(db.setTutorialState('tutorial-pilot', 'started')?.tutorial.status, 'started');
  for(const step of tutorialSteps.slice(0,-1))db.recordTutorialStepStatus('tutorial-pilot',step,'skipped');
  db.recordTutorialStepStatus('tutorial-pilot','landing','completed');
  db.recordTrainingEvidence('tutorial-pilot',8);
  assert.equal(db.setTutorialState('tutorial-pilot', 'completed', 123)?.tutorial.status, 'completed');
  assert.equal(db.setTutorialState('tutorial-pilot', 'started', 456)?.tutorial.status, 'started');
  assert.equal(db.getOrCreate('tutorial-pilot', 'Pilot').credits, 0);
});

test('Dallas stays locked for every unfinished Milwaukee training, including older profiles', () => {
  const path=join(mkdtempSync(join(tmpdir(),'airport-training-unlock-')),'profiles.sqlite');
  const store=new PlayerProfileStore(path);
  const pilot=store.getOrCreate('new-training-pilot','Pilot');
  assert.equal(pilot.tutorial.dallasUnlocked,false);
  assert.equal(store.setTutorialState(pilot.pilotId,'completed'),undefined);
  store.setTutorialState(pilot.pilotId,'started');
  for(const step of tutorialSteps.slice(0,-1))store.recordTutorialStepStatus(pilot.pilotId,step,'skipped');
  store.recordTutorialStepStatus(pilot.pilotId,'landing','skipped');
  assert.equal(store.trainingCompletionVerified(pilot.pilotId),false);
  store.setTutorialState(pilot.pilotId,'skipped');
  assert.equal(store.dallasUnlocked(pilot.pilotId),false);
  store.resetTutorialRun(pilot.pilotId);
  store.setTutorialState(pilot.pilotId,'started');
  for(const step of tutorialSteps.slice(0,-1))store.recordTutorialStepStatus(pilot.pilotId,step,'skipped');
  store.recordTutorialStepStatus(pilot.pilotId,'landing','completed');
  assert.equal(store.trainingCompletionVerified(pilot.pilotId),false);
  store.recordTrainingEvidence(pilot.pilotId,8);
  assert.equal(store.trainingCompletionVerified(pilot.pilotId),true);
  assert.equal(store.setTutorialState(pilot.pilotId,'completed')?.tutorial.dallasUnlocked,true);
  store.setTutorialState(pilot.pilotId,'started');
  assert.equal(store.dallasUnlocked(pilot.pilotId),true,'training replay does not relock Dallas');

  const legacy=store.getOrCreate('existing-training-pilot','Pilot');
  const db=new DatabaseSync(path);
  db.prepare('UPDATE pilot_tutorial_state SET required=0 WHERE pilot_id=?').run(legacy.pilotId);
  assert.equal(store.getOrCreate(legacy.pilotId,'Pilot').tutorial.dallasUnlocked,false);
  db.prepare('DELETE FROM pilot_tutorial_state WHERE pilot_id=?').run(legacy.pilotId);
  db.close();
  assert.equal(store.getOrCreate(legacy.pilotId,'Pilot').tutorial.dallasUnlocked,false);
  const server=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
  assert.match(server,/if \(!dallasUnlocked\) \{ jsonResponse\(response, 403, \{ error: 'Complete Milwaukee training to unlock Dallas\.'/);
  assert.match(server,/cityId === 'dallas' && !entryProfile\.tutorial\.dallasUnlocked/);
});

test('an existing tutorial table migrates without treating unfinished training as complete', () => {
  const path=join(mkdtempSync(join(tmpdir(),'airport-training-migration-')),'profiles.sqlite');
  const seeded=new PlayerProfileStore(path);
  seeded.getOrCreate('existing-pilot','Pilot');
  const oldDb=new DatabaseSync(path);
  oldDb.exec('ALTER TABLE pilot_tutorial_state DROP COLUMN required');
  oldDb.close();
  const store=new PlayerProfileStore(path);
  const existing=store.getOrCreate('existing-pilot','Pilot');
  assert.equal(existing.tutorial.dallasUnlocked,false);
  const fresh=store.getOrCreate('new-pilot','Pilot');
  assert.equal(fresh.tutorial.dallasUnlocked,false);
  const migrated=new DatabaseSync(path);
  assert.equal((migrated.prepare('SELECT required FROM pilot_tutorial_state WHERE pilot_id=?').get(existing.pilotId) as {required:number}).required,0);
  assert.equal((migrated.prepare('SELECT required FROM pilot_tutorial_state WHERE pilot_id=?').get(fresh.pilotId) as {required:number}).required,1);
  migrated.close();
  store.setTutorialState(existing.pilotId,'started');
  for(const step of tutorialSteps.slice(0,-1))store.recordTutorialStepStatus(existing.pilotId,step,'skipped');
  store.recordTutorialStepStatus(existing.pilotId,'landing','completed');
  store.recordTrainingEvidence(existing.pilotId,8);
  assert.equal(store.setTutorialState(existing.pilotId,'completed')?.tutorial.dallasUnlocked,true);
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
  for(const step of tutorialSteps.slice(0,-1))reopened.recordTutorialStepStatus(before.pilotId,step,'skipped');
  reopened.recordTutorialStepStatus(before.pilotId,'landing','completed');
  assert.equal(reopened.setTutorialState(before.pilotId,'completed')?.tutorial.dallasUnlocked,true);
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

test('training HUD provides authoritative fresh entry, persistent exits, and free-practice state', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(bootstrap, /tutorialState: \{ version: 'tutorial_v1', status: 'started', freshRun: true \}/);
  assert.match(server, /tutorialState\.status==='started'&&tutorialState\.freshRun===true\)profileStore\.resetTutorialRun/);
  assert.match(main, /WELCOME TO FLIGHT TRAINING[\s\S]*Learn to fly in a few minutes\./);
  assert.match(main, /data-training-start>START TRAINING<[\s\S]*data-training-skip>Skip</);
  assert.match(main, /data-guided-skip>SKIP TRAINING<[\s\S]*data-guided-exit>EXIT TRAINING</);
  assert.match(main, /data-tutorial-completion-actions[\s\S]*CONTINUE[\s\S]*Replay Training[\s\S]*Free Practice/);
  assert.equal((main.match(/className = 'guided-tutorial-panel'/g)??[]).length,1);
  assert.doesNotMatch(main,/tutorial-objective|tutorial-coach-card|data-lock-teaching|tutorialCompletionPanel/);
  assert.match(main,/STEP \$\{guidance\.lesson\} \/ \$\{tutorialSteps\.length\}/);
  assert.match(main,/✓ COMPLETED/);
  assert.match(main,/tutorialCompletionPresentationStep!==step[\s\S]*},600\)/);
  assert.match(main,/tutorialStepRequestStep===message\.step/);
  assert.match(main,/presentNextAuthoritativeTutorialCompletion/);
  assert.match(main,/updateTutorialImmediateFeedback\(\)/);
  assert.match(main,/tutorialLockPreviewInstruction\(\)/);
  assert.doesNotMatch(main, /airport-chaos-training-progress-v5/);
  assert.match(main, /message\.tutorialMode&&cityRules\.tutorialEnabled/);
  assert.match(main, /type:'tutorialTargetRequest'/);
  assert.match(main, /performance\.now\(\)-tutorialTargetRequestedAt>=1_500/);
  assert.match(main, /guidedTutorialStep='freePractice'/);
  assert.doesNotMatch(main, /data-guided-next>NEXT STEP/);
  assert.match(main,/type TutorialNavigationCoach='radar'\|'map'\|'players'\|'territories'/);
  assert.match(main,/tutorialNavigationCoach=next==='approach'.*?'radar':undefined/);
  assert.match(main,/tutorialNavigationCoach='map';syncTutorialNavigationMap\(\)/);
  assert.match(main,/tutorialNavigationCoach==='map'&&!worldMap\.isOpen\(\)\)setTutorialNavigationCoach\('players'\)/);
  assert.match(main,/tutorialNavigationCoach==='players'\)setTutorialNavigationCoach\('territories'\)/);
  assert.match(main,/AVAILABLE IN DALLAS/);
  assert.match(css,/data-tutorial-control="players".*#real-players/);
  assert.match(css,/data-tutorial-control="territories".*#city-territories/);
  assert.match(main, /data-training-replay[^\n]*restartGuidedTutorial/);
  assert.match(main, /type:'tutorialStepStatus',tutorialStep:guidedTutorialStep,tutorialStepStatus:status/);
  assert.match(server, /target\?\.trainingOwnerId === playerId[\s\S]*signal: 'targetLocked'/);
  assert.match(server, /owner\.lockedTargetId===targetId[\s\S]*completeServerTutorialStep\(target\.trainingOwnerId,owner,'targetLock',now\)/);
  assert.match(server, /nextPendingTutorialStep\(owner\.pilotId\)!=='fire'/);
  assert.match(server, /lesson!=='approach'&&lesson!=='targetLock'&&lesson!=='fire'/);
  assert.match(server, /tutorialState\.status==='completed'&&\(!profileStore\.tutorialStepsResolved\(identity\.pilotId\)/);
  assert.match(server, /message\.tutorialStatus==='completed'&&\(!profileStore\.tutorialStepsResolved\(player\.pilotId\)/);
  assert.match(server, /!profileStore\.trainingCompletionVerified\(identity\.pilotId\)/);
  assert.match(server, /completeServerTutorialStep\(playerId,player,'landing',now\)/);
  assert.match(server, /if\(result\.nextStep==='landing'\)sendTutorialLandingApproach\(playerId,player\)/);
  assert.match(server, /landingFlightState\.set\(playerId,\{baselineY:approach\.position\.y-8,airborne:true\}\)/);
  assert.match(main, /message\.type==='tutorialLandingApproach'/);
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
