export const TUTORIAL_VERSION = 'tutorial_v1';

// Twelve server-tracked lessons plus the presentation-only completion screen
// form the player-facing 13-step tutorial.
export const tutorialSteps = Object.freeze([
  'throttle', 'takeoff', 'turnLeft', 'turnRight', 'climb', 'descend',
  'cameraLook', 'cameraZoom', 'approach', 'targetLock', 'fire', 'landing',
]);

const successSignal = Object.freeze({
  throttle: 'takeoffPowerReached', takeoff: 'airborne', turnLeft: 'leftTurnComplete',
  turnRight: 'rightTurnComplete', climb: 'climbComplete', descend: 'descentComplete',
  cameraLook: 'cameraMoved', cameraZoom: 'cameraZoomed', approach: 'targetInRange',
  targetLock: 'targetLocked', fire: 'targetHit', landing: 'landed',
});

export function normalizeTutorialState(value) {
  const status = value?.status;
  return {
    version: TUTORIAL_VERSION,
    status: status === 'started' || status === 'completed' || status === 'skipped' ? status : 'new',
    completedAt: Number.isFinite(value?.completedAt) ? value.completedAt : undefined,
  };
}

export function nextTutorialStep(step, signal) {
  const index = tutorialSteps.indexOf(step);
  if (index < 0) return tutorialSteps[0];
  if (successSignal[step] !== signal) return step;
  return tutorialSteps[index + 1] ?? 'freePractice';
}

/**
 * Heading increases for the game's canonical LEFT turn command and decreases
 * for RIGHT. Keep tutorial evidence tied to that shared convention so a
 * presentation label can never drift away from the real flight controls.
 */
export function tutorialTurnProgress(step, headingDelta) {
  if (!Number.isFinite(headingDelta)) return 0;
  if (step === 'turnLeft') return Math.max(0, headingDelta);
  if (step === 'turnRight') return Math.max(0, -headingDelta);
  return 0;
}

export function tutorialStepPrerequisitesResolved(step, states) {
  const index = tutorialSteps.indexOf(step);
  if (index < 0 || !states || typeof states !== 'object') return false;
  return tutorialSteps.slice(0, index).every((candidate) =>
    states[candidate] === 'completed' || states[candidate] === 'skipped');
}

const fallbackBindings = Object.freeze({
  throttleUp: 'W', throttleDown: 'S', pitchUp: '↑', pitchDown: '↓',
  turnLeft: 'A', turnRight: 'D', aimLeft: 'Z', aimRight: 'C', aimUp: 'Q', aimDown: 'E', fire: 'SPACE',
  cameraLook: 'MOUSE DRAG', cameraZoom: 'MOUSE WHEEL',
});

function resolvedBindings(bindings) { return { ...fallbackBindings, ...bindings }; }
function instruction(lesson, title, explanation, controlInstruction, control) {
  return Object.freeze({ lesson, title, explanation, controlInstruction, control });
}

/** One canonical copy source for the single Flight Instructor panel. */
export function tutorialInstruction(step, inputMode = 'keyboard', inverted = false, bindings = {}) {
  const key = resolvedBindings(bindings);
  const touch = inputMode === 'touch';
  const climbEdge = inverted ? 'BOTTOM' : 'TOP';
  const descendEdge = inverted ? 'TOP' : 'BOTTOM';
  const climbControl = inverted ? 'descend' : 'climb';
  const descendControl = inverted ? 'climb' : 'descend';
  const definitions = {
    throttle: touch
      ? instruction(1, 'THROTTLE', 'Build enough speed for takeoff.', 'Slide the THROTTLE control UP to increase power.', 'throttle')
      : instruction(1, 'THROTTLE', 'Build enough speed for takeoff.', `Hold ${key.throttleUp} to increase power.`, 'throttle'),
    takeoff: touch
      ? instruction(2, 'TAKE OFF', 'Lift the aircraft off the runway.', `Push the ${climbEdge} joystick edge to lift off.`, climbControl)
      : instruction(2, 'TAKE OFF', 'Lift the aircraft off the runway.', `Hold ${key.pitchUp} to lift off.`, 'takeoff'),
    turnLeft: touch
      ? instruction(3, 'TURN LEFT', 'Turn the aircraft left.', 'Move the joystick LEFT to turn.', 'turnLeft')
      : instruction(3, 'TURN LEFT', 'Turn the aircraft left.', `Press ${key.turnLeft} to turn LEFT.`, 'turnLeft'),
    turnRight: touch
      ? instruction(4, 'TURN RIGHT', 'Turn the aircraft right.', 'Move the joystick RIGHT to turn.', 'turnRight')
      : instruction(4, 'TURN RIGHT', 'Turn the aircraft right.', `Press ${key.turnRight} to turn RIGHT.`, 'turnRight'),
    climb: touch
      ? instruction(5, 'CLIMB', 'Fly higher.', `Push the ${climbEdge} joystick edge to fly higher.`, climbControl)
      : instruction(5, 'CLIMB', 'Fly higher.', `Hold ${key.pitchUp} to fly higher.`, 'climb'),
    descend: touch
      ? instruction(6, 'LOWER AIRCRAFT', 'Stay safely above the runway.', `Push the ${descendEdge} joystick edge to lower the aircraft.`, descendControl)
      : instruction(6, 'LOWER AIRCRAFT', 'Stay safely above the runway.', `Hold ${key.pitchDown} to lower the aircraft.`, 'descend'),
    cameraLook: touch
      ? instruction(7, 'LOOK AROUND', 'Look around without changing your flight path.', 'Drag the camera area.', 'cameraLook')
      : instruction(7, 'LOOK AROUND', 'Look around without changing your flight path.', 'Drag the mouse.', 'cameraLook'),
    cameraZoom: touch
      ? instruction(8, 'ZOOM', 'Change your camera distance.', 'Pinch with two fingers.', 'cameraZoom')
      : instruction(8, 'ZOOM', 'Change your camera distance.', 'Use the mouse wheel.', 'cameraZoom'),
    approach: touch
      ? instruction(9, 'APPROACH TARGET', 'Fly closer to the training target.', 'Use the joystick to fly toward the target.', 'joystick')
      : instruction(9, 'APPROACH TARGET', 'Fly closer to the training target.', `Use ${key.turnLeft}/${key.turnRight} and ${key.pitchUp}/${key.pitchDown} to approach the target.`, 'joystick'),
    targetLock: touch
      ? instruction(10, 'LOCK TARGET', 'Keep the target inside the lock circle until it locks.', 'Drag inside the LOCK CIRCLE to aim.', 'targetLock')
      : instruction(10, 'LOCK TARGET', 'Keep the target inside the lock circle until it locks.', `Use ${key.aimLeft}/${key.aimRight} and ${key.aimUp}/${key.aimDown} to aim.`, 'targetLock'),
    fire: touch
      ? instruction(11, 'FIRE', 'Target locked. Take the shot.', 'Tap FIRE.', 'fire')
      : instruction(11, 'FIRE', 'Target locked. Take the shot.', `Press ${key.fire}.`, 'fire'),
    landing: touch
      ? instruction(12, 'LAND', 'Reduce your speed.', 'Slide THROTTLE DOWN to slow down.', 'throttle')
      : instruction(12, 'LAND', 'Reduce your speed.', `Hold ${key.throttleDown} to slow down.`, 'throttle'),
    freePractice: instruction(13, '✓ TRAINING COMPLETE', 'You are ready for real flights.', 'Milwaukee training gives no rewards.', ''),
  };
  return definitions[step] ?? instruction(0, 'FLIGHT TRAINING', 'Follow the highlighted control.', '', '');
}

export function tutorialLockPreviewInstruction() {
  return instruction(10, 'LOCK TARGET', 'Keep the target inside the lock circle until LOCKED.', 'SEARCHING → LOCKED', 'targetLock');
}

/** Preserve the real lesson identity when a later airborne lesson needs a new takeoff. */
export function tutorialTakeoffRecoveryInstruction(step, inputMode = 'keyboard', inverted = false, bindings = {}) {
  const current = tutorialInstruction(step, inputMode, inverted, bindings);
  const takeoff = tutorialInstruction('takeoff', inputMode, inverted, bindings);
  return instruction(current.lesson, current.title, 'You are back on the runway. Take off again first.', takeoff.controlInstruction, takeoff.control);
}

/** Immediate acknowledgement copy. This never implies authoritative success. */
export function tutorialDetectedInstruction(step, inputMode = 'keyboard', inverted = false, bindings = {}, landingStage = 'power') {
  const key = resolvedBindings(bindings);
  const touch = inputMode === 'touch';
  const climbEdge = inverted ? 'BOTTOM' : 'TOP';
  const descendEdge = inverted ? 'TOP' : 'BOTTOM';
  const detected = {
    throttle: touch ? 'THROTTLE DETECTED — KEEP BUILDING POWER' : `${key.throttleUp} DETECTED — KEEP HOLDING TO BUILD POWER`,
    takeoff: touch ? `${climbEdge} EDGE DETECTED — KEEP HOLDING TO LIFT OFF` : `${key.pitchUp} DETECTED — KEEP HOLDING TO LIFT OFF`,
    turnLeft: touch ? 'LEFT INPUT DETECTED — KEEP TURNING' : `${key.turnLeft} DETECTED — KEEP TURNING LEFT`,
    turnRight: touch ? 'RIGHT INPUT DETECTED — KEEP TURNING' : `${key.turnRight} DETECTED — KEEP TURNING RIGHT`,
    climb: touch ? `${climbEdge} EDGE DETECTED — KEEP CLIMBING` : `${key.pitchUp} DETECTED — KEEP CLIMBING`,
    descend: touch ? `${descendEdge} EDGE DETECTED — KEEP LOWERING` : `${key.pitchDown} DETECTED — KEEP LOWERING`,
    cameraLook: touch ? 'CAMERA DRAG DETECTED — KEEP LOOKING' : 'MOUSE DRAG DETECTED — KEEP LOOKING',
    cameraZoom: touch ? 'PINCH DETECTED — KEEP ZOOMING' : 'MOUSE WHEEL DETECTED — KEEP ZOOMING',
    approach: 'FLIGHT INPUT DETECTED — KEEP APPROACHING',
    targetLock: touch ? 'AIM DRAG DETECTED — KEEP TARGET CENTERED' : 'AIM INPUT DETECTED — KEEP TARGET CENTERED',
    fire: touch ? 'FIRE DETECTED — WAITING FOR CONFIRMED HIT' : `${key.fire} DETECTED — WAITING FOR CONFIRMED HIT`,
    landing: landingStage === 'alignment'
      ? (touch ? 'ALIGNMENT INPUT DETECTED — KEEP LINING UP' : `${key.turnLeft}/${key.turnRight} DETECTED — KEEP LINING UP`)
      : landingStage === 'descent'
        ? (touch ? `${descendEdge} EDGE DETECTED — KEEP LOWERING GENTLY` : `${key.pitchDown} DETECTED — KEEP LOWERING GENTLY`)
        : (touch ? 'THROTTLE INPUT DETECTED — KEEP REDUCING SPEED' : `${key.throttleDown} DETECTED — KEEP REDUCING SPEED`),
  };
  return detected[step] ?? 'INPUT DETECTED — KEEP GOING';
}

export function tutorialLandingInstruction(stage, inputMode = 'keyboard', inverted = false, bindings = {}) {
  const key = resolvedBindings(bindings);
  if (stage === 'power') return tutorialInstruction('landing', inputMode, inverted, bindings);
  if (stage === 'alignment') return inputMode === 'touch'
    ? instruction(12, 'LAND', 'Line up with the runway.', 'Move the joystick LEFT or RIGHT to line up.', 'joystick')
    : instruction(12, 'LAND', 'Line up with the runway.', `Use ${key.turnLeft} and ${key.turnRight} to line up.`, 'joystick');
  const edge = inverted ? 'TOP' : 'BOTTOM';
  return inputMode === 'touch'
    ? instruction(12, 'LAND', 'Lower the aircraft gently.', `Push the ${edge} joystick edge to land gently.`, inverted ? 'climb' : 'descend')
    : instruction(12, 'LAND', 'Lower the aircraft gently.', `Hold ${key.pitchDown} to land gently.`, 'descend');
}

export function shouldOfferTutorial(status, establishedProfile = false, localStatus) {
  return !establishedProfile && (!status || status === 'new') && !['started', 'active', 'completed', 'skipped'].includes(localStatus);
}
