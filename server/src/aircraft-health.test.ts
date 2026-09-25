import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aircraftMaxHealth, maxHealthForAircraft } from '../../shared/aircraft-health.mjs';

test('player aircraft share the requested authoritative hull values', () => {
  assert.deepEqual(aircraftMaxHealth, {
    trainer: 100,
    privateJet: 100,
    cargo: 200,
    fighter: 200,
  });
  for (const aircraftType of ['trainer', 'privateJet', 'cargo', 'fighter'] as const) {
    assert.equal(maxHealthForAircraft(aircraftType), aircraftMaxHealth[aircraftType]);
  }
});

test('Ace and VIP event hull values remain independent and unchanged', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(server, /eventAircraftType: 'fighter',[^\n]*bossHealth: 300/);
  assert.match(server, /eventAircraftType: 'privateJet',[^\n]*bossHealth: 200/);
});
