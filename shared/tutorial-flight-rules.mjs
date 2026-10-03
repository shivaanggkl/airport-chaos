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
  const climbKey = inverted ? key.pitchDown : key.pitchUp;
  const descendKey = inverted ? key.pitchUp : key.pitchDown;
  const definitions = {
    throttle: touch
      ? instruction(1, 'SPEED UP', '', 'Slide THROTTLE UP.', 'throttle')
      : instruction(1, 'SPEED UP', '', `Hold ${key.throttleUp}.`, 'throttle'),
    takeoff: touch
      ? instruction(2, 'TAKE OFF', '', `Push the joystick to the ${climbEdge} edge to climb.`, climbControl)
      : instruction(2, 'TAKE OFF', '', `Hold ${climbKey} to climb.`, 'takeoff'),
    turnLeft: touch
      ? instruction(3, 'TURN LEFT', '', 'Move the joystick LEFT.', 'turnLeft')
      : instruction(3, 'TURN LEFT', '', `Hold ${key.turnLeft}.`, 'turnLeft'),
    turnRight: touch
      ? instruction(4, 'TURN RIGHT', '', 'Move the joystick RIGHT.', 'turnRight')
      : instruction(4, 'TURN RIGHT', '', `Hold ${key.turnRight}.`, 'turnRight'),
    climb: touch
      ? instruction(5, 'CLIMB', '', `Push the joystick to the ${climbEdge} edge.`, climbControl)
      : instruction(5, 'CLIMB', '', `Hold ${climbKey}.`, 'climb'),
    descend: touch
      ? instruction(6, 'DESCEND', '', `Push the joystick to the ${descendEdge} edge.`, descendControl)
      : instruction(6, 'DESCEND', '', `Hold ${descendKey}.`, 'descend'),
    cameraLook: touch
      ? instruction(7, 'LOOK AROUND', '', 'Drag the camera.', 'cameraLook')
      : instruction(7, 'LOOK AROUND', '', 'Drag the mouse.', 'cameraLook'),
    cameraZoom: touch
      ? instruction(8, 'ZOOM', '', 'Pinch with two fingers.', 'cameraZoom')
      : instruction(8, 'ZOOM', '', 'Use the mouse wheel.', 'cameraZoom'),
    approach: touch
      ? instruction(9, 'FLY TO THE TARGET', 'Find the marked plane.', `Steer with the joystick. ${climbEdge} climbs. ${descendEdge} descends.`, 'joystick')
      : instruction(9, 'FLY TO THE TARGET', 'Find the marked plane.', `${key.turnLeft}/${key.turnRight} turn. ${climbKey} climbs. ${descendKey} descends.`, 'joystick'),
    targetLock: touch
      ? instruction(10, 'LOCK THE TARGET', 'Keep the marked plane in the lock circle.', 'Drag inside the lock circle.', 'targetLock')
      : instruction(10, 'LOCK THE TARGET', 'Keep the marked plane in the circle.', `Aim with ${key.aimLeft}/${key.aimRight} and ${key.aimUp}/${key.aimDown}.`, 'targetLock'),
    fire: touch
      ? instruction(11, 'HIT THE TARGET', 'Wait for LOCKED.', 'Tap FIRE.', 'fire')
      : instruction(11, 'HIT THE TARGET', 'Wait for LOCKED.', `Press ${key.fire}.`, 'fire'),
    landing: touch
      ? instruction(12, 'LAND THE PLANE', "You're close to the runway. Line up, slow down, descend, and land.", `Joystick LEFT/RIGHT to line up · THROTTLE DOWN to slow · ${descendEdge} joystick edge to descend.`, 'throttle')
      : instruction(12, 'LAND THE PLANE', "You're close to the runway. Line up, slow down, descend, and land.", `${key.turnLeft}/${key.turnRight} to line up · ${key.throttleDown} to slow · ${descendKey} to descend.`, 'throttle'),
    freePractice: instruction(13, '✓ TRAINING COMPLETE', "YOU'RE READY TO FLY!", '', ''),
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
  const climbKey = inverted ? key.pitchDown : key.pitchUp;
  const descendKey = inverted ? key.pitchUp : key.pitchDown;
  const detected = {
    throttle: touch ? 'THROTTLE DETECTED — KEEP BUILDING POWER' : `${key.throttleUp} DETECTED — KEEP HOLDING TO BUILD POWER`,
    takeoff: touch ? `${climbEdge} EDGE DETECTED — KEEP HOLDING TO LIFT OFF` : `${climbKey} DETECTED — KEEP HOLDING TO LIFT OFF`,
    turnLeft: touch ? 'LEFT INPUT DETECTED — KEEP TURNING' : `${key.turnLeft} DETECTED — KEEP TURNING LEFT`,
    turnRight: touch ? 'RIGHT INPUT DETECTED — KEEP TURNING' : `${key.turnRight} DETECTED — KEEP TURNING RIGHT`,
    climb: touch ? `${climbEdge} EDGE DETECTED — KEEP CLIMBING` : `${climbKey} DETECTED — KEEP CLIMBING`,
    descend: touch ? `${descendEdge} EDGE DETECTED — KEEP LOWERING` : `${descendKey} DETECTED — KEEP LOWERING`,
    cameraLook: touch ? 'CAMERA DRAG DETECTED — KEEP LOOKING' : 'MOUSE DRAG DETECTED — KEEP LOOKING',
    cameraZoom: touch ? 'PINCH DETECTED — KEEP ZOOMING' : 'MOUSE WHEEL DETECTED — KEEP ZOOMING',
    approach: 'FLIGHT INPUT DETECTED — KEEP APPROACHING',
    targetLock: touch ? 'AIM DRAG DETECTED — KEEP TARGET CENTERED' : 'AIM INPUT DETECTED — KEEP TARGET CENTERED',
    fire: touch ? 'FIRE DETECTED — WAITING FOR CONFIRMED HIT' : `${key.fire} DETECTED — WAITING FOR CONFIRMED HIT`,
    landing: landingStage === 'alignment'
      ? (touch ? 'ALIGNMENT INPUT DETECTED — KEEP LINING UP' : `${key.turnLeft}/${key.turnRight} DETECTED — KEEP LINING UP`)
      : landingStage === 'descent'
        ? (touch ? `${descendEdge} EDGE DETECTED — KEEP LOWERING GENTLY` : `${descendKey} DETECTED — KEEP LOWERING GENTLY`)
        : (touch ? 'THROTTLE INPUT DETECTED — KEEP REDUCING SPEED' : `${key.throttleDown} DETECTED — KEEP REDUCING SPEED`),
  };
  return detected[step] ?? 'INPUT DETECTED — KEEP GOING';
}

export function tutorialLandingInstruction(stage, inputMode = 'keyboard', inverted = false, bindings = {}) {
  const landing = tutorialInstruction('landing', inputMode, inverted, bindings);
  if (stage === 'power') return landing;
  return instruction(landing.lesson, landing.title, landing.explanation, landing.controlInstruction,
    stage === 'alignment' ? 'joystick' : inputMode === 'touch' && inverted ? 'climb' : 'descend');
}

/** Presentation guidance only; the flight and server landing validators remain authoritative. */
export function tutorialLandingCoachStage({ airport, position, heading, speed, verticalSpeed, altitude, throttle, stallSpeed,
  takeoffSpeed, safeLandingSpeed, safeDescentRate, landingTilt, roll, pitch, landingAssistActive }) {
  const dx = position.x - airport.x;
  const dz = position.z - airport.z;
  const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
  const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
  const onRunway = Math.abs(along) <= airport.runwayLength / 2 && Math.abs(lateral) <= airport.runwayWidth / 2;
  const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const runwayTurn = wrap(airport.heading - heading);
  const aimTurn = onRunway ? runwayTurn : wrap(Math.atan2(dx, dz) - heading);
  const descentLimit = safeDescentRate * (landingAssistActive ? 1.35 : 1);
  if (speed <= stallSpeed * 1.2 || ((!onRunway || altitude > 14) &&
    (speed < takeoffSpeed || (speed <= takeoffSpeed * 1.1 && throttle <= 0.08)))) return 'speedUp';
  if (!onRunway && altitude < 14) return 'climb';
  if (Math.abs(runwayTurn) > 0.12 || Math.abs(lateral) > airport.runwayWidth / 2) {
    if (Math.abs(aimTurn) > 0.02) return aimTurn > 0 ? 'alignLeft' : 'alignRight';
  }
  if (speed > safeLandingSpeed) return throttle <= 0.08 ? 'coast' : 'slowDown';
  if (verticalSpeed < -descentLimit) return 'easeDescent';
  const remainingToCenter = Math.max(0, along);
  if (altitude > safeDescentRate * remainingToCenter / Math.max(speed, stallSpeed) + 14) return 'descend';
  if (onRunway && altitude <= 14) {
    if (Math.abs(roll) > landingTilt) return 'levelWings';
    if (Math.abs(pitch) > landingTilt) return 'levelNose';
    return 'touchdown';
  }
  return 'steady';
}

export function tutorialLandingCoachInstruction(stage, inputMode = 'keyboard', inverted = false, bindings = {}) {
  const key = resolvedBindings(bindings);
  const touch = inputMode === 'touch';
  const climbEdge = inverted ? 'BOTTOM' : 'TOP';
  const descendEdge = inverted ? 'TOP' : 'BOTTOM';
  const climbControl = inverted ? 'descend' : 'climb';
  const descendControl = inverted ? 'climb' : 'descend';
  const climbKey = inverted ? key.pitchDown : key.pitchUp;
  const descendKey = inverted ? key.pitchUp : key.pitchDown;
  const copy = {
    alignLeft: [touch ? 'Turn LEFT with the joystick to line up with the runway.' : `Turn LEFT with ${key.turnLeft} to line up with the runway.`, 'turnLeft'],
    alignRight: [touch ? 'Turn RIGHT with the joystick to line up with the runway.' : `Turn RIGHT with ${key.turnRight} to line up with the runway.`, 'turnRight'],
    speedUp: [touch ? "You're too slow — slide THROTTLE UP." : `You're too slow — increase speed with ${key.throttleUp}.`, 'throttle'],
    slowDown: [touch ? 'Too fast — ease THROTTLE DOWN gradually.' : `Too fast — reduce speed gradually with ${key.throttleDown}.`, 'throttle'],
    coast: ['Too fast — hold low throttle and let speed settle.', ''],
    descend: [touch ? `You're too high — use the ${descendEdge} joystick edge for − ALT.` : `You're too high — use ${descendKey} for − ALT.`, descendControl],
    climb: [touch ? `You're too low — use the ${climbEdge} joystick edge for + ALT.` : `You're too low — use ${climbKey} for + ALT.`, climbControl],
    easeDescent: [touch ? `Descending too fast — use the ${climbEdge} joystick edge gently for + ALT.` : `Descending too fast — use ${climbKey} gently for + ALT.`, climbControl],
    levelWings: [touch ? 'Release sideways joystick input and level the wings.' : 'Release turn input and level the wings.', 'joystick'],
    levelNose: [touch ? 'Release vertical joystick input and level the nose.' : 'Release pitch input and level the nose.', 'joystick'],
    touchdown: ['Keep wings level and let the plane settle onto the runway.', ''],
    steady: ['Good approach — stay lined up and keep a safe speed.', ''],
  };
  const [controlInstruction, control] = copy[stage] ?? copy.steady;
  return instruction(12, 'LAND THE PLANE', '', controlInstruction, control);
}

/** A short, slightly offset final approach for the Milwaukee trainer lesson. */
export function tutorialLandingApproach(airport, safeLandingSpeed) {
  const along = airport.runwayLength / 2 + 300;
  const lateral = airport.runwayWidth + 10;
  return {
    airportId: airport.id,
    position: {
      x: airport.x + Math.sin(airport.heading) * along + Math.cos(airport.heading) * lateral,
      y: 100,
      z: airport.z + Math.cos(airport.heading) * along - Math.sin(airport.heading) * lateral,
    },
    heading: airport.heading - 0.06,
    speed: safeLandingSpeed * 1.1,
  };
}

export function shouldOfferTutorial(status, establishedProfile = false, localStatus) {
  return !establishedProfile && (!status || status === 'new') && !['started', 'active', 'completed', 'skipped'].includes(localStatus);
}
