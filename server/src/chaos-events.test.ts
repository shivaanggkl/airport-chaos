import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceCargoRush, airspaceControlProgress, canCompleteLandingChaosEvent, lowAltitudeRunResult } from '../../shared/chaos-event-rules.mjs';
import { weatherZoneAt, weatherZonesForCity } from '../../shared/weather-zones.mjs';

test('weather zone enter and exit is deterministic and altitude bounded', () => {
  const zones = weatherZonesForCity('dallas');
  assert.equal(weatherZoneAt(zones, { x:-5_140, y:100, z:-7_780 })?.type, 'storm');
  assert.equal(weatherZoneAt(zones, { x:40_000, y:100, z:40_000 }), undefined);
  assert.equal(weatherZoneAt(zones.filter(zone=>zone.type==='fog'), { x:-5_140, y:1_000, z:-7_780 }), undefined);
});

test('landing events require the active target and Cargo Rush pickup', () => {
  assert.equal(canCompleteLandingChaosEvent({ eventType:'stormLanding', lifecycle:'active', targetAirportId:'love', progress:0 }, 'love'), true);
  assert.equal(canCompleteLandingChaosEvent({ eventType:'fogApproach', lifecycle:'active', targetAirportId:'addison', progress:0 }, 'love'), false);
  const cargo = { eventType:'cargoRush', lifecycle:'active', targetAirportId:'executive', progress:0 };
  assert.equal(canCompleteLandingChaosEvent(cargo, 'executive'), false);
  cargo.progress = advanceCargoRush(cargo, true);
  assert.equal(canCompleteLandingChaosEvent(cargo, 'executive'), true);
});

test('low-altitude and airspace progress enforce safe deterministic boundaries', () => {
  assert.equal(lowAltitudeRunResult({ inside:true, altitude:80, minimumAltitude:40, maximumAltitude:150, elapsed:20, targetSeconds:20 }), 'completed');
  assert.equal(lowAltitudeRunResult({ inside:true, altitude:20, minimumAltitude:40, maximumAltitude:150, elapsed:10, targetSeconds:20 }), 'failed');
  assert.deepEqual(airspaceControlProgress({ inside:true, contested:false, progress:8, deltaSeconds:2, targetSeconds:10 }), { progress:10, completed:true });
  assert.deepEqual(airspaceControlProgress({ inside:true, contested:true, progress:8, deltaSeconds:2, targetSeconds:10 }), { progress:8, completed:false });
});
