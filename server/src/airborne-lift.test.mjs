import assert from 'node:assert/strict';
import test from 'node:test';
import { aircraftDefinitions } from '../../client/src/aircraft.ts';
import { airborneAirbrakeDeceleration, airborneLiftFactor, airbornePitchTarget, throttleTargetDeceleration } from '../../shared/flight-control-rules.mjs';

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
    const idleAltitude = altitudeAfter(4, cruise, 0, 0, type);
    const idleDescentToGround = altitudeAfter(10, cruise, 0, 0, type);
    const slowAltitude = altitudeAfter(3, aircraft.takeoffSpeed * 0.75, 0, 0, type);
    assert.ok(idleLift < neutralLift && neutralLift < 1, `${type} was self-leveling at neutral pitch`);
    assert.ok(idleAltitude < -45, `${type} did not descend promptly at idle cruise: ${idleAltitude}`);
    assert.ok(idleDescentToGround < -200, `${type} could remain above ground from 200m after 10s at idle`);
    assert.ok(airborneLiftFactor(cruise, aircraft.maxClimbPitch, 0, 1, aircraft) < 1,
      `${type} could hold altitude at idle with pitch alone`);
    assert.ok(slowAltitude < -15, `${type} did not sink decisively as airspeed fell: ${slowAltitude}`);
    assert.ok(airborneLiftFactor(aircraft.takeoffSpeed, aircraft.maxClimbPitch, 1, 1, aircraft) > 1,
      `${type} lost its climb authority at takeoff speed`);
  }
});

test('idle braking cannot hold a stalled aircraft up by braking its vertical fall', () => {
  for (const type of aircraftTypes) {
    const aircraft = aircraftDefinitions[type];
    assert.equal(airborneAirbrakeDeceleration(0, 1, aircraft), 0, `${type} brakes vertical fall`);
    assert.equal(throttleTargetDeceleration(0, 0, aircraft), 0, `${type} treats a fall as forward travel`);
    const slowForwardSpeed = 3;
    const brake = airborneAirbrakeDeceleration(slowForwardSpeed, 1, aircraft);
    const targetBrake = throttleTargetDeceleration(slowForwardSpeed, 0, aircraft);
    assert.ok(brake + targetBrake < 9.81 * 0.5, `${type} can hover near a stall: ${brake + targetBrake}`);
    assert.ok(airborneAirbrakeDeceleration(aircraft.takeoffSpeed, 1, aircraft) > brake,
      `${type} lost forward braking authority`);
    assert.equal(airborneAirbrakeDeceleration(aircraft.takeoffSpeed, 0, aircraft), 0,
      `${type} brakes despite released airbrake`);
    let fallSpeed = 9.4;
    let fallDistance = 0;
    for (let frame = 0; frame < 5 / frameSeconds; frame += 1) {
      // The existing stall response gradually points the nose down, which
      // turns part of the fall into forward airflow and adds brake authority.
      const noseDownForwardSpeed = fallSpeed * Math.sin(0.3);
      const airspeed = fallSpeed;
      const baseDrag = aircraft.drag * (airspeed / aircraft.maxSpeed) ** 2 / aircraft.inertia;
      const airborneBrake = airborneAirbrakeDeceleration(noseDownForwardSpeed, 1, aircraft);
      fallSpeed += (9.81 - baseDrag - airborneBrake) * frameSeconds;
      fallDistance += fallSpeed * frameSeconds;
    }
    assert.ok(fallDistance > 100, `${type} still drifts down too slowly at idle: ${fallDistance}m in 5s`);
  }
});

test('power-off descent visibly lowers the nose and a stall deepens it without removing recovery', () => {
  for (const type of aircraftTypes) {
    const aircraft = aircraftDefinitions[type];
    const cruise = aircraft.maxSpeed * 0.45;
    const powered = airbornePitchTarget(0, cruise, 0.8, aircraft);
    const idleGlide = airbornePitchTarget(0, cruise, 0, aircraft);
    const stalled = airbornePitchTarget(0, 0, 0, aircraft);
    assert.equal(powered, 0, `${type} pitches down while powered`);
    assert.ok(idleGlide < -0.09 && stalled < idleGlide - 0.19, `${type} remains level during idle stall`);
    assert.ok(airbornePitchTarget(1, 0, 0, aircraft) <= 0.01, `${type} can hold a full climb through a stall`);
    assert.ok(airbornePitchTarget(1, aircraft.takeoffSpeed, 0.8, aircraft) > 0,
      `${type} cannot recover its climb attitude after gaining speed`);
  }
});
