import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observedChampionshipLanding, observedChampionshipTouchdown } from './championship-landing.js';
import { landingGradeForScore, landingPrecisionScore } from '../../shared/landing-scoring.mjs';
import { aircraftGroundOffset, cityAirports } from '../../shared/city-airports.mjs';

test('championship landing requires an actual DFW runway approach and scores observed flight state', () => {
  const dfw = cityAirports.dallas.find(airport => airport.id === 'dfw')!;
  const envelope = { speed: 72, descent: 11, tilt: .7 };
  const velocity = { x: 0, y: -2, z: -57 };
  const rotation = { x: 0, y: 0, z: 0 };
  const runwayY = 175 + aircraftGroundOffset;
  const position = { x: dfw.x, y: runwayY, z: dfw.z + 800 };
  const observed = observedChampionshipLanding(position, velocity, rotation, dfw, runwayY, envelope);
  assert.ok(observed);
  assert.equal(landingGradeForScore(landingPrecisionScore(observed, envelope)), 'LEGENDARY');
  assert.equal(observedChampionshipLanding({ ...position, x: position.x + 100 }, velocity, rotation, dfw, runwayY, envelope), null);
  assert.equal(observedChampionshipLanding({ ...position, z: dfw.z + dfw.runwayLength }, velocity, rotation, dfw, runwayY, envelope), null);
  assert.equal(observedChampionshipLanding({ ...position, y: 200 }, velocity, rotation, dfw, runwayY, envelope), null);
  assert.equal(observedChampionshipLanding(position, { ...velocity, y: 5 }, rotation, dfw, runwayY, envelope), null);
  assert.equal(observedChampionshipLanding(position, velocity, { ...rotation, y: Math.PI / 2 }, dfw, runwayY, envelope), null);
  assert.equal(observedChampionshipLanding(position, velocity, { ...rotation, z: 1 }, dfw, runwayY, envelope), null);
  assert.equal(observedChampionshipLanding(position, { ...velocity, z: -120 }, rotation, dfw, runwayY, envelope), null);
  const contact = { ...position, y: runwayY };
  assert.equal(observedChampionshipTouchdown({ ...position, y: runwayY + 1 }, { ...position, y: runwayY + .7 }, velocity,
    rotation, dfw, runwayY, envelope), null, 'flying just above the runway cannot count');
  assert.equal(observedChampionshipTouchdown(contact, contact, velocity, rotation, dfw, runwayY, envelope), null,
    'taxiing on the runway cannot count');
  assert.equal(observedChampionshipTouchdown({ ...position, y: runwayY + 1 }, { ...position, y: runwayY - 2 }, velocity,
    rotation, dfw, runwayY, envelope), null, 'a position below the runway cannot count');
  assert.ok(observedChampionshipTouchdown({ ...position, y: runwayY + .8 }, contact, velocity, rotation, dfw, runwayY, envelope));
});
