import assert from 'node:assert/strict';
import test from 'node:test';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
import { airborneLiftFactor } from '../../shared/flight-control-rules.mjs';

const aircraftTypes = ['trainer', 'privateJet', 'cargo', 'fighter'];
const frameSeconds = 1 / 60;

function altitudeAfter(seconds, speed, pitch, throttle, type) {
  const aircraft = aircraftDefinitions[type];
  let altitude = 0;
  let verticalSpeed = 0;
  for (let frame = 0; frame < seconds / frameSeconds; frame += 1) {
    const airspeed = Math.hypot(speed, verticalSpeed);
    const angleOfAttack = Math.max(-0.28, Math.min(0.32, pitch - Math.asin(verticalSpeed / airspeed)));
    const stallFactor = Math.max(0.18, Math.min(1, (speed - aircraft.stallSpeed * 0.48) / (aircraft.stallSpeed * 0.52)));
    const lift = airborneLiftFactor(speed, angleOfAttack, throttle, stallFactor, aircraft);
    verticalSpeed += 9.81 * (lift * Math.cos(pitch) - 1) * frameSeconds;
    altitude += verticalSpeed * frameSeconds;
  }
  return altitude;
}

test('released pitch loses altitude at cruise and a modest held pitch can maintain or regain it', () => {
  for (const type of aircraftTypes) {
    const aircraft = aircraftDefinitions[type];
    const speed = aircraft.maxSpeed * 0.45;
    const neutral = altitudeAfter(5, speed, 0, 0.8, type);
    const climbing = altitudeAfter(5, speed, 0.09, 0.8, type);
    assert.ok(neutral < -5, `${type} stayed nearly level without pitch input: ${neutral}`);
    assert.ok(climbing > 0, `${type} could not climb with a modest pitch command: ${climbing}`);
  }
});

test('idle and low airspeed produce a much faster descent without removing stall recovery', () => {
  for (const type of aircraftTypes) {
    const aircraft = aircraftDefinitions[type];
    const cruise = aircraft.maxSpeed * 0.45;
    const neutralLift = airborneLiftFactor(cruise, 0, 0.8, 1, aircraft);
    const idleLift = airborneLiftFactor(cruise, 0, 0, 1, aircraft);
    const slowAltitude = altitudeAfter(3, aircraft.takeoffSpeed * 0.75, 0, 0, type);
    assert.ok(idleLift < neutralLift && neutralLift < 1, `${type} was self-leveling at neutral pitch`);
    assert.ok(slowAltitude < -15, `${type} did not sink decisively as airspeed fell: ${slowAltitude}`);
    assert.ok(airborneLiftFactor(aircraft.takeoffSpeed, aircraft.maxClimbPitch, 1, 1, aircraft) > 1,
      `${type} lost its climb authority at takeoff speed`);
  }
});
