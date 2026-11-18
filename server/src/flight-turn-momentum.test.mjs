import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
import * as rules from '../../shared/flight-control-rules.mjs';

// Exercise the actual airborne attitude and force integration, without world,
// UI, weapons or networking. A throttle reduction halfway through a sustained
// turn previously let the nose outrun the old trajectory and fly backwards.
const source = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = source.indexOf('  const speedRatio =', source.indexOf('function updateFlight('));
const end = source.indexOf('  airplane.position.addScaledVector(velocity, delta);', start);
const code = new vm.Script(ts.transpileModule(`function frame(){${source.slice(start, end)}}`
  .replaceAll('import.meta.env.DEV', 'false'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);

function fixture(aircraft, delta, direction) {
  const state = {
    THREE, ...rules, currentAircraft: aircraft, delta, currentSpeed: aircraft.maxSpeed * .7,
    keyboardTurnInput: 0, touchTurnInput: .9 * direction, turnInput: .9 * direction,
    yawControlStrength: .9 * direction, bankControlStrength: 0,
    pitchControlStrength: 0, pitch: 0, heading: 0, roll: 0,
    landingAssistActive: false, landingSpeedTarget: undefined, guidedTutorialActive: false,
    takeoffThrustBlend: 1, throttle: .85, mobileThrottleTarget: .85,
    boostVisualStrength: 0, boostActive: false, speedBonus: 0, speedBrakeStrength: 0,
    airplane: new THREE.Group(), forward: new THREE.Vector3(), liftDirection: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 0, -aircraft.maxSpeed * .7), sideSlip: new THREE.Vector3(),
    moveToward: (value, target, amount) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount),
    smoothstep01: value => value * value * (3 - 2 * value),
  };
  vm.createContext(state);
  code.runInContext(state);
  return state;
}

test('turning momentum preserves speed and vertical motion, including direction wraparound', () => {
  for (const angle of [0, .01, -.03, Math.PI, -Math.PI, 2 * Math.PI + .02]) {
    const velocity = { x: 140, y: -23, z: -270 };
    rules.turnFlightVelocity(velocity, angle);
    assert.ok(Math.abs(Math.hypot(velocity.x, velocity.z) - Math.hypot(140, -270)) < 1e-10);
    assert.equal(velocity.y, -23);
  }
});

for (const [type, aircraft] of Object.entries(aircraftDefinitions)) {
  test(`${type}: left and right U-turns remain forward while reducing power to SLOW`, () => {
    for (const fps of [30, 60, 120]) for (const direction of [-1, 1]) {
      const state = fixture(aircraft, 1 / fps, direction);
      for (let step = 0; step < fps * 14; step++) {
        if (step === fps) {
          state.throttle = state.mobileThrottleTarget = rules.cruiseThrottleStops[1];
          state.speedBrakeStrength = .5;
        }
        state.frame();
        state.currentSpeed = state.velocity.length();
        const horizontalForward = state.velocity.x * state.forward.x + state.velocity.z * state.forward.z;
        assert.ok(horizontalForward >= 0, `${type} slid backwards at ${fps} FPS, direction ${direction}, frame ${step}`);
        assert.ok(Number.isFinite(state.currentSpeed));
        assert.ok(state.currentSpeed <= aircraft.maxSpeed + .001, 'turns cannot add unearned speed');
      }
      assert.ok(Math.abs(state.heading) > Math.PI, 'scenario must complete a U-turn');
      assert.ok(state.currentSpeed < aircraft.maxSpeed * .7, 'SLOW must still decelerate');
    }
  });
}
