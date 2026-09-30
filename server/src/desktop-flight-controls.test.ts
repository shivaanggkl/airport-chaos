import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import {
  COORDINATED_BANK_CAP,
  COORDINATED_BANK_STRONG_TARGET,
  COORDINATED_TURN_STRONG_INPUT,
  MOBILE_BANK_CAP,
  MOBILE_BANK_STRONG_TARGET,
  coordinatedBankTarget,
  desktopTurnIntent,
  mobileBankTarget,
  stepCoordinatedBank,
  stepMobileBank,
} from '../../shared/flight-control-rules.mjs';
import { validateClientRotation } from './transform-validation.js';

const types = ['trainer', 'privateJet', 'cargo', 'fighter'] as const;
const dt = 1 / 60;
const inputSource = readFileSync(new URL('../../client/src/flight-input.ts', import.meta.url), 'utf8');
const keyboardActionBindings = Object.fromEntries([...inputSource.matchAll(/(Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right)|Space):\s*'(\w+)'/g)].map(([, code, action]) => [code, action]));

test('A/D and left/right arrows map to the same bounded desktop turn actions', () => {
  assert.equal(keyboardActionBindings.KeyA, keyboardActionBindings.ArrowLeft);
  assert.equal(keyboardActionBindings.KeyD, keyboardActionBindings.ArrowRight);
  assert.equal(keyboardActionBindings.KeyA, 'yawLeft');
  assert.equal(keyboardActionBindings.KeyD, 'yawRight');
  assert.ok(!Object.values(keyboardActionBindings).some((action) => action === 'rollLeft' || action === 'rollRight'));
  assert.equal(desktopTurnIntent(true, false), COORDINATED_TURN_STRONG_INPUT);
  assert.equal(desktopTurnIntent(false, true), -COORDINATED_TURN_STRONG_INPUT);
  assert.equal(desktopTurnIntent(true, true), 0);
});

test('a ten-second desktop hold reaches the 48-degree target without inversion or accumulated roll', () => {
  assert.ok(Math.abs(COORDINATED_BANK_STRONG_TARGET - 48 * Math.PI / 180) < 1e-12);
  assert.ok(Math.abs(COORDINATED_BANK_CAP - 70 * Math.PI / 180) < 1e-12);
  for (const type of types) {
    let bank = 0;
    for (let frame = 0; frame < 10 / dt; frame += 1) {
      bank = stepCoordinatedBank(bank, COORDINATED_TURN_STRONG_INPUT, dt, aircraftFlightEnvelope[type]);
      assert.ok(Math.abs(bank) <= COORDINATED_BANK_CAP + 1e-12, `${type} exceeded the normal bank cap`);
      assert.ok(Math.abs(bank) < Math.PI / 2, `${type} inverted during a normal turn`);
    }
    assert.ok(Math.abs(bank - COORDINATED_BANK_STRONG_TARGET) < 1e-6, `${type} did not settle at the strong-turn target`);
  }
});

test('desktop turn release auto-levels monotonically without snap or oscillation', () => {
  for (const type of types) {
    const envelope = aircraftFlightEnvelope[type];
    let bank = coordinatedBankTarget(COORDINATED_TURN_STRONG_INPUT);
    let previous = bank;
    const first = stepCoordinatedBank(bank, 0, dt, envelope);
    assert.ok(first > 0 && first < bank, `${type} snapped or failed to start leveling`);
    bank = first;
    for (let frame = 1; frame < 10 / dt; frame += 1) {
      bank = stepCoordinatedBank(bank, 0, dt, envelope);
      assert.ok(bank >= 0 && bank <= previous, `${type} oscillated while leveling`);
      previous = bank;
    }
    assert.ok(bank < 1e-6, `${type} did not return to level`);
  }
});

test('Firehawk remains quickest, Mammoth heaviest, and Bluejay/Nightowl remain distinct', () => {
  const afterTwoTenths = (type: typeof types[number]) => {
    let bank = 0;
    for (let frame = 0; frame < 12; frame += 1) bank = stepCoordinatedBank(bank, COORDINATED_TURN_STRONG_INPUT, dt, aircraftFlightEnvelope[type]);
    return bank;
  };
  const bluejay = afterTwoTenths('trainer');
  const nightowl = afterTwoTenths('privateJet');
  const mammoth = afterTwoTenths('cargo');
  const firehawk = afterTwoTenths('fighter');
  assert.ok(firehawk > nightowl && nightowl > bluejay && bluejay > mammoth);
});

test('turn combines with pitch, throttle, boost, and fire without action conflicts', () => {
  const actions = new Set(['yawLeft', 'pitchUp', 'throttleUp', 'boost', 'fire']);
  assert.equal(desktopTurnIntent(actions.has('yawLeft'), actions.has('yawRight')), COORDINATED_TURN_STRONG_INPUT);
  for (const action of ['pitchUp', 'throttleUp', 'boost', 'fire'] as const) assert.ok(actions.has(action));
  assert.equal(new Set(Object.entries(keyboardActionBindings).filter(([code]) => ['KeyA', 'ArrowUp', 'KeyW', 'ShiftLeft', 'Space'].includes(code)).map(([, action]) => action)).size, 5);
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /cameraOrbitPointerId/);
  assert.match(main, /heldActions\.clear\(\)[\s\S]*?mobileInput\.reset\(\)/);
});

test('mobile coordinated-turn exports and approved constants remain exact aliases', () => {
  assert.equal(MOBILE_BANK_STRONG_TARGET, COORDINATED_BANK_STRONG_TARGET);
  assert.equal(MOBILE_BANK_CAP, COORDINATED_BANK_CAP);
  for (const input of [-1, -.9, -.4, 0, .4, .9, 1]) assert.equal(mobileBankTarget(input), coordinatedBankTarget(input));
  for (const type of types) assert.equal(stepMobileBank(.2, -.7, dt, aircraftFlightEnvelope[type]), stepCoordinatedBank(.2, -.7, dt, aircraftFlightEnvelope[type]));
});

test('server angular validation accepts the bounded desktop coordinated turn for every aircraft', () => {
  for (const type of types) {
    const envelope = aircraftFlightEnvelope[type];
    let previous = { x: 0, y: 0, z: 0 };
    for (let frame = 0; frame < 600; frame += 1) {
      const bank = stepCoordinatedBank(previous.z, COORDINATED_TURN_STRONG_INPUT, dt, envelope);
      const headingRate = envelope.yawRate / envelope.inertia + Math.sin(bank) * envelope.bankTurn;
      const next = { x: 0, y: previous.y + headingRate * dt, z: bank };
      assert.equal(validateClientRotation(previous, next, dt * 1_000, envelope).accepted, true, `${type} valid turn was rejected`);
      previous = next;
    }
  }
});
