import assert from 'node:assert/strict';
import test from 'node:test';
import { MobileInputControls } from '../../client/src/mobile-input.ts';

const classes = () => {
  const names = new Set();
  return { contains: name => names.has(name), toggle(name, on) { on ? names.add(name) : names.delete(name); } };
};
function controls(touch = false) {
  const lever = { classList: classes(), dataset: {} };
  const input = Object.create(MobileInputControls.prototype);
  Object.assign(input, {
    root: { hidden: false, classList: classes(), querySelector: () => lever },
    aimTarget: { classList: classes() }, deviceEnabled: () => touch,
    demoActive: false, renderThrottle() {}, applyLayout() {}, scheduleNoticeClearance() {}, reset() {},
  });
  return input;
}

test('desktop shows only the speed lever while touch visibility and portrait protection stay intact', () => {
  const saved = ['document', 'innerWidth', 'innerHeight'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  try {
    Object.assign(globalThis, { document: { documentElement: { classList: classes() } }, innerWidth: 1440, innerHeight: 900 });
    const desktop = controls(); desktop.refresh();
    assert.equal(desktop.root.hidden, false);
    assert.equal(desktop.root.classList.contains('desktop-throttle-only'), true);
    assert.equal(document.documentElement.classList.contains('touch-controls-active'), false);
    const mobile = controls(true); mobile.refresh();
    assert.equal(mobile.root.hidden, false);
    assert.equal(mobile.root.classList.contains('desktop-throttle-only'), false);
    assert.equal(document.documentElement.classList.contains('touch-controls-active'), true);
    globalThis.innerWidth = 600; mobile.refresh();
    assert.equal(mobile.root.hidden, true);
  } finally {
    for (const [key, descriptor] of saved) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('desktop lever does not override keyboard throttle until dragged, and keyboard can retake control', () => {
  const input = controls(); input.root.classList.toggle('desktop-throttle-only', true);
  input.setThrottleState(.75);
  assert.equal(input.getThrottleTarget(), undefined);
  const handlers = {};
  const lever = {
    addEventListener: (name, fn) => { handlers[name] = fn; },
    getBoundingClientRect: () => ({ top: 100, height: 150 }),
    setPointerCapture() {}, classList: { add() {}, remove() {} },
  };
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    globalThis.window = { addEventListener() {} };
    input.apply = () => {};
    input.bindThrottle(lever);
    handlers.pointerdown({ preventDefault() {}, pointerId: 1, clientY: 175 });
    const selected = input.getThrottleTarget();
    assert(selected > 0 && selected < 1);
    input.syncFlightState(.5, 100, false);
    assert.equal(input.getThrottleTarget(), selected);
    input.syncFlightState(.6, 100, false, true);
    assert.equal(input.getThrottleTarget(), undefined);
    const mobile = controls(true); mobile.setThrottleState(.75);
    mobile.syncFlightState(.75, 100, false, true);
    assert.equal(mobile.getThrottleTarget(), .75);
  } finally { saved ? Object.defineProperty(globalThis, 'window', saved) : delete globalThis.window; }
});
